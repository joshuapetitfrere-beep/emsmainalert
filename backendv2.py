from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.responses import HTMLResponse
from typing import List, Optional
from math import radians, cos, sin, asin, sqrt
from contextlib import asynccontextmanager
import json
import httpx
import asyncpg
import os
from datetime import datetime

DATABASE_URL = os.environ.get("DATABASE_URL")
db_pool = None

# ── Polk County Hospital Geofences ────────────────────────────────────────────
HOSPITALS = [
    {"name": "Lakeland Regional Health",        "lat": 28.0627,  "lon": -81.9355, "radius_miles": 0.15},
    {"name": "Bartow Regional Medical Center",  "lat": 27.8878,  "lon": -81.8190, "radius_miles": 0.15},
    {"name": "Winter Haven Hospital",           "lat": 28.0222,  "lon": -81.7215, "radius_miles": 0.15},
    {"name": "South Florida Baptist Hospital",  "lat": 28.0603,  "lon": -82.1307, "radius_miles": 0.15},
    {"name": "AdventHealth Heart of Florida",   "lat": 28.1006,  "lon": -81.7787, "radius_miles": 0.15},
    {"name": "AdventHealth Lake Wales",         "lat": 27.9014,  "lon": -81.5856, "radius_miles": 0.15},
]

AVG_SPEED_MPH = 45


def check_hospital_geofence(lat: float, lon: float) -> Optional[str]:
    for h in HOSPITALS:
        if distance_miles(lat, lon, h["lat"], h["lon"]) <= h["radius_miles"]:
            return h["name"]
    return None


def get_hospital_coords(name: str) -> Optional[dict]:
    for h in HOSPITALS:
        if h["name"] == name:
            return {"lat": h["lat"], "lon": h["lon"]}
    return None


def calc_eta_minutes(amb_lat: float, amb_lon: float, hospital_name: str) -> Optional[int]:
    coords = get_hospital_coords(hospital_name)
    if not coords:
        return None
    dist = distance_miles(amb_lat, amb_lon, coords["lat"], coords["lon"])
    return max(1, round((dist / AVG_SPEED_MPH) * 60))


async def init_db(pool):
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS devices (
                token TEXT PRIMARY KEY,
                lat DOUBLE PRECISION,
                lon DOUBLE PRECISION,
                registered_at TIMESTAMP DEFAULT NOW(),
                last_seen TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                ems_unit TEXT,
                message TEXT,
                lat DOUBLE PRECISION,
                lon DOUBLE PRECISION,
                radius_miles DOUBLE PRECISION,
                sent_at TIMESTAMP DEFAULT NOW(),
                ws_sent INTEGER DEFAULT 0,
                push_sent INTEGER DEFAULT 0
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS acknowledgments (
                id SERIAL PRIMARY KEY,
                alert_id TEXT REFERENCES alerts(id),
                token_suffix TEXT,
                acked_at TIMESTAMP DEFAULT NOW()
            )
        """)
    print("[DB] Tables ready")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_pool
    if DATABASE_URL:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        await init_db(db_pool)
        print("[DB] Connected to PostgreSQL")
    else:
        print("[DB] No DATABASE_URL found — running without persistence")
    yield
    if db_pool:
        await db_pool.close()


app = FastAPI(title="EMS Alert Server", version="4.6.0", lifespan=lifespan)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# ── Cooldown ──────────────────────────────────────────────────────────────────
cooldown_tracker: dict = {}
COOLDOWN_SECONDS = 30


def check_cooldown(unit_id: str) -> bool:
    last = cooldown_tracker.get(unit_id)
    if last is None:
        return True
    return (datetime.utcnow() - last).total_seconds() >= COOLDOWN_SECONDS


def update_cooldown(unit_id: str):
    cooldown_tracker[unit_id] = datetime.utcnow()


# ── Active alerts & dashboard clients ────────────────────────────────────────
active_alerts: dict = {}
dashboard_clients: List[WebSocket] = []


async def push_dashboard_update():
    if not dashboard_clients:
        return
    text = json.dumps(build_dashboard_payload())
    for ws in dashboard_clients.copy():
        try:
            await ws.send_text(text)
        except Exception:
            if ws in dashboard_clients:
                dashboard_clients.remove(ws)


def build_dashboard_payload() -> dict:
    units = []
    for unit_id, alert in active_alerts.items():
        eta = None
        if alert.get("destination_hospital") and alert.get("lat") and alert.get("lon"):
            eta = calc_eta_minutes(alert["lat"], alert["lon"], alert["destination_hospital"])
        units.append({
            "unit_id": unit_id,
            "alert_id": alert.get("alert_id"),
            "alert_type": alert.get("alert_type", "Unknown"),
            "destination_hospital": alert.get("destination_hospital", "Unknown"),
            "num_patients": alert.get("num_patients", 1),
            "eta_minutes": eta,
            "activated_at": alert.get("activated_at"),
            "lat": alert.get("lat"),
            "lon": alert.get("lon"),
            # Trauma fields — None if no trauma activated
            "trauma": alert.get("trauma", None),
        })
    return {
        "type": "dashboard_update",
        "units": units,
        "hospitals": [h["name"] for h in HOSPITALS],
    }


# ── Auth ──────────────────────────────────────────────────────────────────────
def load_api_keys() -> dict:
    raw = os.environ.get("EMS_API_KEYS", "")
    keys = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if ":" in entry:
            unit_id, key = entry.split(":", 1)
            keys[key.strip()] = unit_id.strip()
    return keys


def validate_api_key(api_key: str) -> str:
    keys = load_api_keys()
    if api_key not in keys:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return keys[api_key]


# ── Haversine ─────────────────────────────────────────────────────────────────
def distance_miles(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return 3956 * c


def make_alert_id(unit_id: str) -> str:
    return f"alert_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{unit_id}"


def parse_ts_from_id(alert_id: str) -> Optional[str]:
    try:
        ts = alert_id.split("_")[1]
        return f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}T{ts[8:10]}:{ts[10:12]}:{ts[12:14]}"
    except:
        return None


# ── Client ────────────────────────────────────────────────────────────────────
class Client:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.lat: Optional[float] = None
        self.lon: Optional[float] = None
        self.ack: bool = False
        self.push_token: Optional[str] = None
        self.is_ems: bool = False
        self.unit_id: Optional[str] = None


# ── Connection Manager ────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_clients: List[Client] = []

    async def connect(self, websocket: WebSocket) -> Client:
        await websocket.accept()
        client = Client(websocket)
        self.active_clients.append(client)
        print(f"[CONNECT] Total: {len(self.active_clients)}")
        return client

    def disconnect(self, client: Client):
        if client in self.active_clients:
            self.active_clients.remove(client)
        if client.unit_id and client.unit_id in active_alerts:
            del active_alerts[client.unit_id]
        print(f"[DISCONNECT] Total: {len(self.active_clients)}")

    async def broadcast_ems_position(self, unit_id, lat, lon, alert_id, radius_miles, prev_lat=None, prev_lon=None):
        payload = json.dumps({
            "type": "ems_position",
            "unit_id": unit_id,
            "alert_id": alert_id,
            "lat": lat,
            "lon": lon,
            "prev_lat": prev_lat,
            "prev_lon": prev_lon,
        })
        for client in self.active_clients.copy():
            if client.is_ems:
                continue
            try:
                if client.lat is not None and client.lon is not None:
                    if distance_miles(lat, lon, client.lat, client.lon) > radius_miles:
                        continue
                await client.websocket.send_text(payload)
            except Exception as e:
                print(f"[POS ERROR] {e}")

    async def broadcast_clear(self, unit_id: str, reason: str = "manual"):
        if unit_id in active_alerts:
            del active_alerts[unit_id]
        payload = json.dumps({"type": "ems_clear", "unit_id": unit_id, "reason": reason})
        for c in self.active_clients.copy():
            if not c.is_ems:
                try:
                    await c.websocket.send_text(payload)
                except Exception as e:
                    print(f"[CLEAR ERROR] {e}")
        print(f"[CLEAR] Unit {unit_id} — reason: {reason}")
        await push_dashboard_update()

    async def broadcast_alert(self, message, lat, lon, radius_miles=2.0, ems_unit_id="EMS",
                               destination_hospital=None, num_patients=1, alert_type="Medical"):
        alert_id = make_alert_id(ems_unit_id)
        now = datetime.utcnow()
        payload = json.dumps({
            "type": "ems_alert",
            "alert_id": alert_id,
            "message": message,
            "ems_unit": ems_unit_id,
            "lat": lat,
            "lon": lon,
        })
        ws_sent = 0
        push_tokens = []

        active_alerts[ems_unit_id] = {
            "alert_id": alert_id,
            "lat": lat,
            "lon": lon,
            "prev_lat": None,
            "prev_lon": None,
            "radius_miles": radius_miles,
            "destination_hospital": destination_hospital,
            "num_patients": num_patients,
            "alert_type": alert_type,
            "activated_at": now.isoformat(),
            "trauma": None,
        }

        for client in self.active_clients.copy():
            try:
                if client.is_ems:
                    continue
                if client.lat is not None and client.lon is not None:
                    if distance_miles(lat, lon, client.lat, client.lon) > radius_miles:
                        continue
                await client.websocket.send_text(payload)
                client.ack = False
                ws_sent += 1
                if client.push_token:
                    push_tokens.append(client.push_token)
            except Exception as e:
                print(f"[WS ERROR] {e}")
                self.active_clients.remove(client)

        if db_pool:
            async with db_pool.acquire() as conn:
                active_tokens = {c.push_token for c in self.active_clients if c.push_token}
                rows = await conn.fetch("SELECT token, lat, lon FROM devices")
                for row in rows:
                    if row["token"] in active_tokens:
                        continue
                    if row["lat"] is not None and row["lon"] is not None:
                        if distance_miles(lat, lon, row["lat"], row["lon"]) > radius_miles:
                            continue
                    push_tokens.append(row["token"])

        push_sent = await self._send_expo_push(push_tokens, message, ems_unit_id, alert_id, lat, lon)

        if db_pool:
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO alerts (id, ems_unit, message, lat, lon, radius_miles, sent_at, ws_sent, push_sent)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)""",
                    alert_id, ems_unit_id, message, lat, lon, radius_miles, now, ws_sent, push_sent
                )

        await push_dashboard_update()
        print(f"[ALERT] {alert_id} | WS: {ws_sent} | Push: {push_sent}")
        return {
            "id": alert_id,
            "ems_unit": ems_unit_id,
            "message": message,
            "ws_sent": ws_sent,
            "push_sent": push_sent,
            "sent_at": now.isoformat(),
        }

    async def _send_expo_push(self, tokens, message, unit_id, alert_id, lat, lon):
        valid = [t for t in tokens if t.startswith("ExponentPushToken")]
        if not valid:
            return 0
        messages = [
            {
                "to": t,
                "sound": "default",
                "title": "🚨 EMS VEHICLE APPROACHING",
                "body": message,
                "data": {"alert_id": alert_id, "ems_unit": unit_id, "lat": lat, "lon": lon},
                "priority": "high",
                "ttl": 60,
            }
            for t in valid
        ]
        sent = 0
        async with httpx.AsyncClient() as client:
            for i in range(0, len(messages), 100):
                try:
                    resp = await client.post(
                        EXPO_PUSH_URL,
                        json=messages[i:i + 100],
                        headers={"Content-Type": "application/json"},
                        timeout=10.0,
                    )
                    sent += sum(1 for r in resp.json().get("data", []) if r.get("status") == "ok")
                except Exception as e:
                    print(f"[PUSH ERROR] {e}")
        return sent


manager = ConnectionManager()


# ── Dashboard WebSocket ───────────────────────────────────────────────────────
@app.websocket("/ws/dashboard")
async def dashboard_ws(websocket: WebSocket):
    await websocket.accept()
    dashboard_clients.append(websocket)
    print(f"[DASHBOARD] Connected. Total: {len(dashboard_clients)}")
    try:
        await websocket.send_text(json.dumps(build_dashboard_payload()))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[DASHBOARD WS ERROR] {e}")
    finally:
        if websocket in dashboard_clients:
            dashboard_clients.remove(websocket)
        print(f"[DASHBOARD] Disconnected. Total: {len(dashboard_clients)}")


# ── Main WebSocket ────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "update":
                client.lat = data.get("lat")
                client.lon = data.get("lon")
                if db_pool and client.push_token:
                    async with db_pool.acquire() as conn:
                        await conn.execute(
                            """INSERT INTO devices (token, lat, lon, last_seen) VALUES ($1, $2, $3, NOW())
                               ON CONFLICT (token) DO UPDATE SET lat=$2, lon=$3, last_seen=NOW()""",
                            client.push_token, client.lat, client.lon
                        )

            elif msg_type == "ems_unit":
                client.is_ems = True
                client.unit_id = data.get("unit_id")
                print(f"[EMS] Unit registered: {client.unit_id}")

            elif msg_type == "ems_position":
                unit_id = data.get("unit_id")
                lat = data.get("lat")
                lon = data.get("lon")
                alert_id = data.get("alert_id")
                if unit_id and lat and lon and alert_id:
                    if unit_id in active_alerts:
                        prev_lat = active_alerts[unit_id].get("lat")
                        prev_lon = active_alerts[unit_id].get("lon")
                        active_alerts[unit_id]["prev_lat"] = prev_lat
                        active_alerts[unit_id]["prev_lon"] = prev_lon
                        active_alerts[unit_id]["lat"] = lat
                        active_alerts[unit_id]["lon"] = lon
                        radius = active_alerts[unit_id]["radius_miles"]
                    else:
                        prev_lat, prev_lon = None, None
                        radius = 2.0

                    hospital = check_hospital_geofence(lat, lon)
                    if hospital and unit_id in active_alerts:
                        print(f"[GEOFENCE] {unit_id} entered {hospital} — auto-clearing")
                        await manager.broadcast_clear(unit_id, reason=f"arrived:{hospital}")
                    else:
                        await manager.broadcast_ems_position(unit_id, lat, lon, alert_id, radius, prev_lat, prev_lon)
                        await push_dashboard_update()

            elif msg_type == "ems_trauma":
                # ── Trauma activation ─────────────────────────────────────────
                unit_id = data.get("unit_id")
                if unit_id and unit_id in active_alerts:
                    lat = active_alerts[unit_id].get("lat")
                    lon = active_alerts[unit_id].get("lon")
                    hospital = active_alerts[unit_id].get("destination_hospital")
                    eta = calc_eta_minutes(lat, lon, hospital) if lat and lon and hospital else None

                    trauma = {
                        "mechanism": data.get("mechanism", "Unknown"),
                        "num_patients": data.get("num_patients", active_alerts[unit_id].get("num_patients", 1)),
                        "age": data.get("age", ""),
                        "sex": data.get("sex", ""),
                        "vitals": data.get("vitals", ""),
                        "gcs": data.get("gcs", ""),
                        "eta_minutes": eta,
                        "activated_at": datetime.utcnow().isoformat(),
                        "unit_id": unit_id,
                        "destination_hospital": hospital,
                    }
                    active_alerts[unit_id]["trauma"] = trauma
                    print(f"[TRAUMA] {unit_id} → {hospital} | Mech: {trauma['mechanism']} | ETA: {eta}min")
                    await push_dashboard_update()

                    # Ack back to EMS unit
                    try:
                        await client.websocket.send_text(json.dumps({
                            "type": "trauma_ack",
                            "unit_id": unit_id,
                            "eta_minutes": eta,
                        }))
                    except:
                        pass

            elif msg_type == "ems_status":
                unit_id = data.get("unit_id")
                status = data.get("status", "").lower()
                print(f"[STATUS] {unit_id} → {status}")
                if status == "arrived" and unit_id and unit_id in active_alerts:
                    await manager.broadcast_clear(unit_id, reason="arrived:status_change")
                try:
                    await client.websocket.send_text(json.dumps({
                        "type": "status_ack",
                        "unit_id": unit_id,
                        "status": status,
                    }))
                except:
                    pass

            elif msg_type == "ems_clear":
                unit_id = data.get("unit_id")
                if unit_id:
                    await manager.broadcast_clear(unit_id, reason="manual")

            elif msg_type == "register_token":
                token = data.get("token")
                if token:
                    client.push_token = token
                    if db_pool:
                        async with db_pool.acquire() as conn:
                            await conn.execute(
                                """INSERT INTO devices (token, lat, lon) VALUES ($1, $2, $3)
                                   ON CONFLICT (token) DO UPDATE SET last_seen=NOW()""",
                                token, client.lat, client.lon
                            )
                    print(f"[TOKEN] ...{token[-6:]}")

            elif msg_type == "ACK":
                client.ack = True
                alert_id = data.get("alert_id", "unknown")
                token_suffix = client.push_token[-6:] if client.push_token else "??????"
                if db_pool:
                    async with db_pool.acquire() as conn:
                        await conn.execute(
                            "INSERT INTO acknowledgments (alert_id, token_suffix) VALUES ($1, $2)",
                            alert_id, token_suffix
                        )
                print(f"[ACK] {alert_id} by ...{token_suffix}")

    except WebSocketDisconnect:
        manager.disconnect(client)
    except Exception as e:
        print(f"[WS ERROR] {e}")
        manager.disconnect(client)


# ── HTTP Endpoints ────────────────────────────────────────────────────────────
@app.post("/trigger-alert")
async def trigger_alert(
    lat: float = Query(...),
    lon: float = Query(...),
    alert_message: str = Query("Emergency Vehicle Approaching"),
    radius: float = Query(2.0),
    ems_unit_id: str = Query("EMS-1"),
    api_key: str = Query(...),
    destination_hospital: str = Query(None),
    num_patients: int = Query(1),
    alert_type: str = Query("Medical"),
):
    validate_api_key(api_key)
    if not check_cooldown(ems_unit_id):
        seconds_left = int(COOLDOWN_SECONDS - (datetime.utcnow() - cooldown_tracker[ems_unit_id]).total_seconds())
        raise HTTPException(status_code=429, detail=f"Cooldown active. Wait {seconds_left} seconds.")
    update_cooldown(ems_unit_id)
    entry = await manager.broadcast_alert(
        message=alert_message,
        lat=lat,
        lon=lon,
        radius_miles=radius,
        ems_unit_id=ems_unit_id,
        destination_hospital=destination_hospital,
        num_patients=num_patients,
        alert_type=alert_type,
    )
    return {
        "status": "Alert sent",
        "alert_id": entry["id"],
        "message": alert_message,
        "radius_miles": radius,
        "ws_delivered": entry["ws_sent"],
        "push_delivered": entry["push_sent"],
    }


@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    try:
        with open("dashboard.html", "r") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>dashboard.html not found. Deploy it alongside main.py.</h1>",
            status_code=404
        )


@app.get("/status")
async def status():
    device_count = 0
    alert_count = 0
    last_alert = None
    if db_pool:
        async with db_pool.acquire() as conn:
            device_count = await conn.fetchval("SELECT COUNT(*) FROM devices")
            alert_count = await conn.fetchval("SELECT COUNT(*) FROM alerts")
            row = await conn.fetchrow("SELECT * FROM alerts ORDER BY sent_at DESC NULLS LAST LIMIT 1")
            if row:
                d = dict(row)
                d["sent_at"] = str(d["sent_at"]) if d["sent_at"] else parse_ts_from_id(d["id"])
                last_alert = d
    return {
        "connected_clients": len(manager.active_clients),
        "dashboard_clients": len(dashboard_clients),
        "registered_devices": device_count,
        "total_alerts_sent": alert_count,
        "active_responses": len(active_alerts),
        "last_alert": last_alert,
    }


@app.get("/alerts")
async def get_alerts():
    if db_pool:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM alerts ORDER BY sent_at DESC NULLS LAST LIMIT 20")
            alerts = []
            for r in rows:
                d = dict(r)
                if d.get("sent_at") is None:
                    d["sent_at"] = parse_ts_from_id(d["id"])
                else:
                    d["sent_at"] = str(d["sent_at"])
                alerts.append(d)
            return {"alerts": alerts}
    return {"alerts": []}


@app.get("/active")
async def get_active():
    return {"active_responses": active_alerts}


@app.get("/devices")
async def get_devices():
    if db_pool:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("SELECT token, lat, lon, last_seen FROM devices ORDER BY last_seen DESC")
            return {"devices": [dict(r) for r in rows]}
    return {"devices": []}


@app.get("/hospitals")
async def get_hospitals():
    return {"hospitals": HOSPITALS}
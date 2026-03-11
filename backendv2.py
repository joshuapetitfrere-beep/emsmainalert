from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from typing import List, Optional
from math import radians, cos, sin, asin, sqrt
from contextlib import asynccontextmanager
import json
import httpx
import asyncpg
import os
from datetime import datetime

# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")
db_pool = None

async def get_db():
    return db_pool

async def init_db(pool):
    """Create tables if they don't exist."""
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

# ─── Lifespan ────────────────────────────────────────────────────────────────
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

app = FastAPI(title="EMS Alert Server", version="3.0.0", lifespan=lifespan)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# ─── Haversine ────────────────────────────────────────────────────────────────
def distance_miles(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return 3956 * c

# ─── Alert ID ─────────────────────────────────────────────────────────────────
def make_alert_id(unit_id: str) -> str:
    return f"alert_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{unit_id}"

# ─── Client ───────────────────────────────────────────────────────────────────
class Client:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.lat: Optional[float] = None
        self.lon: Optional[float] = None
        self.ack: bool = False
        self.push_token: Optional[str] = None

# ─── Connection Manager ───────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_clients: List[Client] = []

    async def connect(self, websocket: WebSocket) -> Client:
        await websocket.accept()
        client = Client(websocket)
        self.active_clients.append(client)
        print(f"[CONNECT] Total connected: {len(self.active_clients)}")
        return client

    def disconnect(self, client: Client):
        if client in self.active_clients:
            self.active_clients.remove(client)
        print(f"[DISCONNECT] Total connected: {len(self.active_clients)}")

    async def broadcast_alert(
        self,
        message: str,
        lat: float,
        lon: float,
        radius_miles: float = 2.0,
        ems_unit_id: str = "EMS",
    ):
        alert_id = make_alert_id(ems_unit_id)
        alert_payload = {
            "type": "ems_alert",
            "alert_id": alert_id,
            "message": message,
            "ems_unit": ems_unit_id,
            "lat": lat,
            "lon": lon,
        }
        alert_json = json.dumps(alert_payload)
        ws_sent = 0
        push_tokens: list[str] = []

        # ── 1. WebSocket to connected clients ────────────────────────────────
        for client in self.active_clients.copy():
            try:
                if client.lat is not None and client.lon is not None:
                    if distance_miles(lat, lon, client.lat, client.lon) > radius_miles:
                        continue
                await client.websocket.send_text(alert_json)
                client.ack = False
                ws_sent += 1
                if client.push_token:
                    push_tokens.append(client.push_token)
            except Exception as e:
                print(f"[WS ERROR] {e}")
                self.active_clients.remove(client)

        # ── 2. Push to offline tokens from database ───────────────────────────
        if db_pool:
            async with db_pool.acquire() as conn:
                # Get all tokens not currently connected via WebSocket
                active_tokens = {c.push_token for c in self.active_clients if c.push_token}
                rows = await conn.fetch("SELECT token, lat, lon FROM devices")
                for row in rows:
                    if row["token"] in active_tokens:
                        continue  # already handled via WebSocket
                    if row["lat"] is not None and row["lon"] is not None:
                        if distance_miles(lat, lon, row["lat"], row["lon"]) > radius_miles:
                            continue
                    push_tokens.append(row["token"])

        push_sent = await self._send_expo_push(push_tokens, message, ems_unit_id, alert_id, lat, lon)

        # ── 3. Persist alert to database ─────────────────────────────────────
        if db_pool:
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """INSERT INTO alerts (id, ems_unit, message, lat, lon, radius_miles, ws_sent, push_sent)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                    alert_id, ems_unit_id, message, lat, lon, radius_miles, ws_sent, push_sent
                )

        print(f"[ALERT] {alert_id} | WS: {ws_sent} | Push: {push_sent}")
        return {
            "id": alert_id,
            "ems_unit": ems_unit_id,
            "message": message,
            "ws_sent": ws_sent,
            "push_sent": push_sent,
        }

    async def _send_expo_push(self, tokens, message, unit_id, alert_id, lat, lon):
        valid = [t for t in tokens if t.startswith("ExponentPushToken")]
        if not valid:
            return 0
        messages = [
            {
                "to": token,
                "sound": "default",
                "title": "🚨 EMS VEHICLE APPROACHING",
                "body": message,
                "data": {"alert_id": alert_id, "ems_unit": unit_id, "lat": lat, "lon": lon},
                "priority": "high",
                "channelId": "ems-alerts",
                "ttl": 60,
            }
            for token in valid
        ]
        sent = 0
        async with httpx.AsyncClient() as client:
            for i in range(0, len(messages), 100):
                try:
                    resp = await client.post(
                        EXPO_PUSH_URL,
                        json=messages[i:i+100],
                        headers={"Content-Type": "application/json"},
                        timeout=10.0,
                    )
                    sent += sum(1 for r in resp.json().get("data", []) if r.get("status") == "ok")
                except Exception as e:
                    print(f"[PUSH ERROR] {e}")
        return sent

manager = ConnectionManager()

# ─── WebSocket ────────────────────────────────────────────────────────────────
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
                # Persist location update
                if db_pool and client.push_token:
                    async with db_pool.acquire() as conn:
                        await conn.execute(
                            """INSERT INTO devices (token, lat, lon, last_seen)
                               VALUES ($1, $2, $3, NOW())
                               ON CONFLICT (token) DO UPDATE
                               SET lat=$2, lon=$3, last_seen=NOW()""",
                            client.push_token, client.lat, client.lon
                        )

            elif msg_type == "register_token":
                token = data.get("token")
                if token:
                    client.push_token = token
                    if db_pool:
                        async with db_pool.acquire() as conn:
                            await conn.execute(
                                """INSERT INTO devices (token, lat, lon)
                                   VALUES ($1, $2, $3)
                                   ON CONFLICT (token) DO UPDATE
                                   SET last_seen=NOW()""",
                                token, client.lat, client.lon
                            )
                    print(f"[TOKEN] Registered: ...{token[-6:]}")

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

# ─── HTTP Endpoints ───────────────────────────────────────────────────────────
@app.post("/trigger-alert")
async def trigger_alert(
    lat: float = Query(...),
    lon: float = Query(...),
    alert_message: str = Query("Emergency Vehicle Approaching"),
    radius: float = Query(2.0),
    ems_unit_id: str = Query("EMS-1"),
):
    entry = await manager.broadcast_alert(
        message=alert_message, lat=lat, lon=lon,
        radius_miles=radius, ems_unit_id=ems_unit_id
    )
    return {
        "status": "Alert sent",
        "alert_id": entry["id"],
        "message": alert_message,
        "radius_miles": radius,
        "ws_delivered": entry["ws_sent"],
        "push_delivered": entry["push_sent"],
    }

@app.get("/status")
async def status():
    device_count = 0
    alert_count = 0
    last_alert = None
    if db_pool:
        async with db_pool.acquire() as conn:
            device_count = await conn.fetchval("SELECT COUNT(*) FROM devices")
            alert_count = await conn.fetchval("SELECT COUNT(*) FROM alerts")
            row = await conn.fetchrow("SELECT * FROM alerts ORDER BY sent_at DESC LIMIT 1")
            if row:
                last_alert = dict(row)
    return {
        "connected_clients": len(manager.active_clients),
        "registered_devices": device_count,
        "total_alerts_sent": alert_count,
        "last_alert": last_alert,
    }

@app.get("/alerts")
async def get_alerts():
    if db_pool:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("SELECT * FROM alerts ORDER BY sent_at DESC LIMIT 20")
            return {"alerts": [dict(r) for r in rows]}
    return {"alerts": []}

@app.get("/devices")
async def get_devices():
    if db_pool:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("SELECT token, lat, lon, last_seen FROM devices ORDER BY last_seen DESC")
            return {"devices": [dict(r) for r in rows]}
    return {"devices": []}

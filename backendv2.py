from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from contextlib import asynccontextmanager
from typing import List, Optional
from math import radians, cos, sin, asin, sqrt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, String, Float, Integer, DateTime, Text, select
from datetime import datetime
import json
import httpx
import os

DATABASE_URL = os.environ.get("DATABASE_URL", "")
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://").replace("postgresql://", "postgresql+asyncpg://")

Base = declarative_base()
engine = None
async_session = None

class Device(Base):
    __tablename__ = "devices"
    token        = Column(String, primary_key=True)
    lat          = Column(Float, nullable=True)
    lon          = Column(Float, nullable=True)
    registered_at= Column(DateTime, default=datetime.utcnow)
    last_seen    = Column(DateTime, default=datetime.utcnow)

class Alert(Base):
    __tablename__ = "alerts"
    id           = Column(String, primary_key=True)
    ems_unit     = Column(String)
    message      = Column(Text)
    lat          = Column(Float)
    lon          = Column(Float)
    radius_miles = Column(Float)
    sent_at      = Column(DateTime, default=datetime.utcnow)
    ws_sent      = Column(Integer, default=0)
    push_sent    = Column(Integer, default=0)

class Acknowledgment(Base):
    __tablename__ = "acknowledgments"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    alert_id     = Column(String)
    token_suffix = Column(String)
    acked_at     = Column(DateTime, default=datetime.utcnow)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, async_session
    if ASYNC_DATABASE_URL and "asyncpg" in ASYNC_DATABASE_URL:
        engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, pool_pre_ping=True)
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("[DB] Connected to PostgreSQL via SQLAlchemy")
    else:
        print("[DB] No DATABASE_URL — running without persistence")
    yield
    if engine:
        await engine.dispose()

app = FastAPI(title="EMS Alert Server", version="4.0.0", lifespan=lifespan)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

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

def distance_miles(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return 3956 * c

def make_alert_id(unit_id: str) -> str:
    return f"alert_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{unit_id}"

class Client:
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.lat: Optional[float] = None
        self.lon: Optional[float] = None
        self.ack: bool = False
        self.push_token: Optional[str] = None

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
        print(f"[DISCONNECT] Total: {len(self.active_clients)}")

    async def broadcast_alert(self, message, lat, lon, radius_miles=2.0, ems_unit_id="EMS"):
        alert_id = make_alert_id(ems_unit_id)
        payload  = json.dumps({"type": "ems_alert", "alert_id": alert_id, "message": message, "ems_unit": ems_unit_id, "lat": lat, "lon": lon})
        ws_sent  = 0
        push_tokens = []

        for client in self.active_clients.copy():
            try:
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

        if async_session:
            async with async_session() as session:
                active_tokens = {c.push_token for c in self.active_clients if c.push_token}
                result = await session.execute(select(Device))
                for device in result.scalars().all():
                    if device.token in active_tokens:
                        continue
                    if device.lat is not None and device.lon is not None:
                        if distance_miles(lat, lon, device.lat, device.lon) > radius_miles:
                            continue
                    push_tokens.append(device.token)

        push_sent = await self._send_expo_push(push_tokens, message, ems_unit_id, alert_id, lat, lon)

        if async_session:
            async with async_session() as session:
                session.add(Alert(id=alert_id, ems_unit=ems_unit_id, message=message, lat=lat, lon=lon, radius_miles=radius_miles, ws_sent=ws_sent, push_sent=push_sent))
                await session.commit()

        print(f"[ALERT] {alert_id} | WS: {ws_sent} | Push: {push_sent}")
        return {"id": alert_id, "ems_unit": ems_unit_id, "message": message, "ws_sent": ws_sent, "push_sent": push_sent}

    async def _send_expo_push(self, tokens, message, unit_id, alert_id, lat, lon):
        valid = [t for t in tokens if t.startswith("ExponentPushToken")]
        if not valid:
            return 0
        messages = [{"to": t, "sound": "default", "title": "🚨 EMS VEHICLE APPROACHING", "body": message, "data": {"alert_id": alert_id, "ems_unit": unit_id, "lat": lat, "lon": lon}, "priority": "high", "ttl": 60} for t in valid]
        sent = 0
        async with httpx.AsyncClient() as client:
            for i in range(0, len(messages), 100):
                try:
                    resp = await client.post(EXPO_PUSH_URL, json=messages[i:i+100], headers={"Content-Type": "application/json"}, timeout=10.0)
                    sent += sum(1 for r in resp.json().get("data", []) if r.get("status") == "ok")
                except Exception as e:
                    print(f"[PUSH ERROR] {e}")
        return sent

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client = await manager.connect(websocket)
    try:
        while True:
            data     = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "update":
                client.lat = data.get("lat")
                client.lon = data.get("lon")
                if async_session and client.push_token:
                    async with async_session() as session:
                        device = await session.get(Device, client.push_token)
                        if device:
                            device.lat = client.lat
                            device.lon = client.lon
                            device.last_seen = datetime.utcnow()
                            await session.commit()

            elif msg_type == "register_token":
                token = data.get("token")
                if token:
                    client.push_token = token
                    if async_session:
                        async with async_session() as session:
                            existing = await session.get(Device, token)
                            if existing:
                                existing.last_seen = datetime.utcnow()
                            else:
                                session.add(Device(token=token, lat=client.lat, lon=client.lon))
                            await session.commit()
                    print(f"[TOKEN] ...{token[-6:]}")

            elif msg_type == "ACK":
                client.ack = True
                alert_id     = data.get("alert_id", "unknown")
                token_suffix = client.push_token[-6:] if client.push_token else "??????"
                if async_session:
                    async with async_session() as session:
                        session.add(Acknowledgment(alert_id=alert_id, token_suffix=token_suffix))
                        await session.commit()
                print(f"[ACK] {alert_id} by ...{token_suffix}")

    except WebSocketDisconnect:
        manager.disconnect(client)
    except Exception as e:
        print(f"[WS ERROR] {e}")
        manager.disconnect(client)

@app.post("/trigger-alert")
async def trigger_alert(
    lat: float         = Query(...),
    lon: float         = Query(...),
    alert_message: str = Query("Emergency Vehicle Approaching"),
    radius: float      = Query(2.0),
    ems_unit_id: str   = Query("EMS-1"),
    api_key: str       = Query(...),
):
    validate_api_key(api_key)
    entry = await manager.broadcast_alert(message=alert_message, lat=lat, lon=lon, radius_miles=radius, ems_unit_id=ems_unit_id)
    return {"status": "Alert sent", "alert_id": entry["id"], "message": alert_message, "radius_miles": radius, "ws_delivered": entry["ws_sent"], "push_delivered": entry["push_sent"]}

@app.get("/status")
async def status():
    device_count = 0
    alert_count  = 0
    last_alert   = None
    if async_session:
        async with async_session() as session:
            devices    = (await session.execute(select(Device))).scalars().all()
            alerts_all = (await session.execute(select(Alert))).scalars().all()
            alerts_top = (await session.execute(select(Alert).order_by(Alert.sent_at.desc()).limit(1))).scalars().all()
            device_count = len(devices)
            alert_count  = len(alerts_all)
            if alerts_top:
                a = alerts_top[0]
                last_alert = {"id": a.id, "ems_unit": a.ems_unit, "message": a.message, "sent_at": str(a.sent_at)}
    return {"connected_clients": len(manager.active_clients), "registered_devices": device_count, "total_alerts_sent": alert_count, "last_alert": last_alert}

@app.get("/alerts")
async def get_alerts():
    if async_session:
        async with async_session() as session:
            alerts = (await session.execute(select(Alert).order_by(Alert.sent_at.desc()).limit(20))).scalars().all()
            return {"alerts": [{"id": a.id, "ems_unit": a.ems_unit, "message": a.message, "ws_sent": a.ws_sent, "sent_at": str(a.sent_at), "lat": a.lat, "lon": a.lon, "radius_miles": a.radius_miles} for a in alerts]}
    return {"alerts": []}

@app.get("/devices")
async def get_devices():
    if async_session:
        async with async_session() as session:
            devices = (await session.execute(select(Device).order_by(Device.last_seen.desc()))).scalars().all()
            return {"devices": [{"token": d.token[-8:], "lat": d.lat, "lon": d.lon, "last_seen": str(d.last_seen)} for d in devices]}
    return {"devices": []}

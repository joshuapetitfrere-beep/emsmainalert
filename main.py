from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from typing import List, Optional
from math import radians, cos, sin, asin, sqrt
import json
import httpx
from datetime import datetime


app = FastAPI(title="EMS Alert Server", version="2.0.0")
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

def distance_miles(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    return 3956 * c

alert_log: list[dict] = []

def make_alert_id(unit_id: str) -> str:
    return f"alert_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{unit_id}"

class Client:
    def __init__(self, websocket: WebSocket, lat: float = None, lon: float = None):
        self.websocket = websocket
        self.lat = lat
        self.lon = lon
        self.ack = False
        self.push_token: Optional[str] = None

class ConnectionManager:
    def __init__(self):
        self.active_clients: List[Client] = []
        self.offline_tokens: dict[str, dict] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        client = Client(websocket)
        self.active_clients.append(client)
        print(f"[CONNECT] Total connected: {len(self.active_clients)}")
        return client

    def disconnect(self, client: Client):
        if client in self.active_clients:
            self.active_clients.remove(client)
        if client.push_token:
            self.offline_tokens[client.push_token] = {"lat": client.lat, "lon": client.lon}
        print(f"[DISCONNECT] Total connected: {len(self.active_clients)}")

    async def broadcast_alert(self, message: str, lat: float, lon: float, radius_miles: float = 2.0, ems_unit_id: str = "EMS"):
        alert_id = make_alert_id(ems_unit_id)
        alert_payload = {"type": "ems_alert", "alert_id": alert_id, "message": message, "ems_unit": ems_unit_id, "lat": lat, "lon": lon}
        alert_json = json.dumps(alert_payload)
        ws_sent = 0
        push_tokens_to_notify: list[str] = []

        for client in self.active_clients.copy():
            try:
                if client.lat is not None and client.lon is not None:
                    if distance_miles(lat, lon, client.lat, client.lon) > radius_miles:
                        continue
                await client.websocket.send_text(alert_json)
                client.ack = False
                ws_sent += 1
                if client.push_token:
                    push_tokens_to_notify.append(client.push_token)
            except Exception as e:
                print(f"[WS ERROR] {e}")
                self.active_clients.remove(client)

        for token, loc in self.offline_tokens.items():
            if loc.get("lat") is not None and loc.get("lon") is not None:
                if distance_miles(lat, lon, loc["lat"], loc["lon"]) > radius_miles:
                    continue
            push_tokens_to_notify.append(token)

        push_sent = await self._send_expo_push(push_tokens_to_notify, message, ems_unit_id, alert_id, lat, lon)
        entry = {"id": alert_id, "ems_unit": ems_unit_id, "message": message, "lat": lat, "lon": lon, "radius_miles": radius_miles, "sent_at": datetime.utcnow().isoformat(), "ws_sent": ws_sent, "push_sent": push_sent, "acknowledgments": []}
        alert_log.append(entry)
        print(f"[ALERT] {alert_id} | WS: {ws_sent} | Push: {push_sent}")
        return entry

    async def _send_expo_push(self, tokens, message, unit_id, alert_id, lat, lon):
        valid = [t for t in tokens if t.startswith("ExponentPushToken")]
        if not valid:
            return 0
        messages = [{"to": token, "sound": "default", "title": "🚨 EMS VEHICLE APPROACHING", "body": message, "data": {"alert_id": alert_id, "ems_unit": unit_id, "lat": lat, "lon": lon}, "priority": "high", "channelId": "ems-alerts", "ttl": 60} for token in valid]
        sent = 0
        async with httpx.AsyncClient() as client:
            for i in range(0, len(messages), 100):
                try:
                    resp = await client.post(EXPO_PUSH_URL, json=messages[i:i+100], headers={"Content-Type": "application/json"}, timeout=10.0)
                    sent += sum(1 for r in resp.json().get("data", []) if r.get("status") == "ok")
                except Exception as e:
                    print(f"[PUSH ERROR] {e}")
        return sent

    def log_ack(self, alert_id, token_suffix):
        for alert in alert_log:
            if alert["id"] == alert_id:
                alert["acknowledgments"].append({"token_suffix": token_suffix, "time": datetime.utcnow().isoformat()})
                break

manager = ConnectionManager()

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
            elif msg_type == "register_token":
                token = data.get("token")
                if token:
                    client.push_token = token
                    manager.offline_tokens.pop(token, None)
                    print(f"[TOKEN] Registered: ...{token[-6:]}")
            elif msg_type == "ACK":
                client.ack = True
                alert_id = data.get("alert_id", "unknown")
                token_suffix = client.push_token[-6:] if client.push_token else "??????"
                manager.log_ack(alert_id, token_suffix)
                print(f"[ACK] Alert {alert_id} acknowledged by ...{token_suffix}")
    except WebSocketDisconnect:
        manager.disconnect(client)
    except Exception as e:
        print(f"[WS ERROR] {e}")
        manager.disconnect(client)

@app.post("/trigger-alert")
async def trigger_alert(
    lat: float = Query(...),
    lon: float = Query(...),
    alert_message: str = Query("Emergency Vehicle Approaching"),
    radius: float = Query(2.0),
    ems_unit_id: str = Query("EMS-1"),
):
    entry = await manager.broadcast_alert(message=alert_message, lat=lat, lon=lon, radius_miles=radius, ems_unit_id=ems_unit_id)
    return {"status": "Alert sent", "alert_id": entry["id"], "message": alert_message, "radius_miles": radius, "ws_delivered": entry["ws_sent"], "push_delivered": entry["push_sent"]}

@app.get("/validate-key")
async def validate_key(api_key: str = Query(...)):
    keys = load_api_keys()
    if api_key in keys:
        return {"valid": True, "unit_id": keys[api_key]}
    return {"valid": False}


@app.get("/status")
async def status():
    return {"connected_clients": len(manager.active_clients), "offline_tokens": len(manager.offline_tokens), "total_alerts_sent": len(alert_log), "last_alert": alert_log[-1] if alert_log else None}

@app.get("/alerts")
async def get_alerts():
    return {"alerts": alert_log[-20:]}
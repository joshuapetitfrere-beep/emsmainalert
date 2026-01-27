from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from geopy.distance import geodesic  # type: ignore
import math
import os
import uvicorn
import certifi
import ssl 


app = FastAPI()
# ====== ENVIRONMENT VARIABLES ======
API_TOKEN = os.getenv("Test123")  # must be set on Render / host
SERVER_URL = "wss://ems_alert_backend.onrender.com"
ssl_context = ssl.create_default_context(cafile=certifi.where())
@app.get("/")
def root(): 
    return{"status": "EMS server running"}
@app.get("/test")
def test(): 
    return {"message": "hello world"}
# ====== STATE ======
clients = {}  # client_id -> client data

ems_state = {
    "lat": None,
    "lon": None,
    "active": False
}

# ====== HELPERS ======
def bearing(lat1, lon1, lat2, lon2):
    dlon = math.radians(lon2 - lon1)
    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)

    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (
        math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    )

    return (math.degrees(math.atan2(x, y)) + 360) % 360


def severity(distance_m):
    if distance_m < 50:
        return "IMMEDIATE"
    elif distance_m < 150:
        return "HIGH"
    elif distance_m < 300:
        return "MODERATE"
    else:
        return None


# ====== WEBSOCKET ======
@app.websocket("/ws")
async def websocket_endpoint(wss: WebSocket):
    await wss.accept()
    print("🔌 WebSocket connected")

    try:
        # ----- HANDSHAKE -----
        data = await wss.receive_json()

        token = data.get("token")
        client_id = data.get("id")
        role = data.get("role")

        if token != API_TOKEN:
            print("❌ Invalid token")
            await wss.close(code=1008)
            return

        if role not in ("ems", "civilian"):
            print("❌ Invalid role")
            await wss.close(code=1003)
            return

        clients[client_id] = {
            "wss": wss,
            "role": role,
            "lat": None,
            "lon": None,
            "ack": False
        }

        print(f"✅ Registered {role}: {client_id}")

        # ----- MAIN LOOP -----
        while True:
            msg = await wss.receive_json()

            # === CIVILIAN LOCATION UPDATE ===
            if role == "civilian":
                clients[client_id]["lat"] = msg.get("lat")
                clients[client_id]["lon"] = msg.get("lon")

                if msg.get("ack"):
                    clients[client_id]["ack"] = True

            # === EMS LOCATION UPDATE ===
            if role == "ems":
                ems_state["lat"] = msg.get("lat")
                ems_state["lon"] = msg.get("lon")
                ems_state["active"] = True

                for cid, c in clients.items():
                    if (
                        c["role"] == "civilian"
                        and not c["ack"]
                        and c["lat"] is not None
                        and c["lon"] is not None
                    ):
                        dist = geodesic(
                            (ems_state["lat"], ems_state["lon"]),
                            (c["lat"], c["lon"])
                        ).meters

                        sev = severity(dist)
                        if sev:
                            await c["ws"].send_json({
                                "distance_m": round(dist, 1),
                                "severity": sev,
                                "bearing": bearing(
                                    ems_state["lat"], ems_state["lon"],
                                    c["lat"], c["lon"]
                                )
                            })

    except WebSocketDisconnect:
        print(f"🔌 Disconnected: {client_id}")

    except Exception as e:
        print("⚠️ WebSocket error:", e)

    finally:
        if client_id in clients:
            del clients[client_id]

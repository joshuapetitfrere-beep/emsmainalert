from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from typing import List
from math import radians, cos, sin, asin, sqrt
import json

app = FastAPI()

# ----------------------------
# Helper: Haversine distance
# ----------------------------
def distance_miles(lat1, lon1, lat2, lon2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    miles = 3956 * c
    return miles

# ----------------------------
# Client and Connection Manager
# ----------------------------
class Client:
    def __init__(self, websocket: WebSocket, lat: float = None, lon: float = None):
        self.websocket = websocket
        self.lat = lat
        self.lon = lon
        self.ack = False  # Whether this client has acknowledged the current alert

class ConnectionManager:
    def __init__(self):
        self.active_clients: List[Client] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        client = Client(websocket)
        self.active_clients.append(client)
        print(f"Client connected. Total clients: {len(self.active_clients)}")
        return client

    def disconnect(self, client: Client):
        if client in self.active_clients:
            self.active_clients.remove(client)
        print(f"Client disconnected. Total clients: {len(self.active_clients)}")

    async def broadcast_alert(self, message: str, lat: float, lon: float, radius_miles: float = 2):
        """
        Broadcast an alert to all connected clients within radius.
        """
        alert = {
            "type": "ems_alert",
            "message": message
        }
        alert_json = json.dumps(alert)
        print(f"Broadcasting alert to {len(self.active_clients)} clients")

        for client in self.active_clients.copy():
            try:
                # Distance filtering
                if client.lat is not None and client.lon is not None:
                    d = distance_miles(lat, lon, client.lat, client.lon)
                    if d > radius_miles:
                        continue  # Skip clients too far

                await client.websocket.send_text(alert_json)
                client.ack = False  # Reset ACK for this alert
            except Exception as e:
                print(f"Error sending to client: {e}")
                self.active_clients.remove(client)

manager = ConnectionManager()

# ----------------------------
# WebSocket Endpoint
# ----------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    client = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            # GPS update from client
            if msg_type == "update":
                client.lat = data.get("lat")
                client.lon = data.get("lon")

            # Alert acknowledgement
            elif msg_type == "ACK":
                client.ack = True
                print("Alert acknowledged by client")

    except WebSocketDisconnect:
        manager.disconnect(client)
    except Exception as e:
        print("WebSocket error:", e)
        manager.disconnect(client)

# ----------------------------
# HTTP Endpoint to Trigger Alert
# ----------------------------
@app.post("/trigger-alert")
async def trigger_alert(
    lat: float = Query(..., description="Latitude of the alert"),
    lon: float = Query(..., description="Longitude of the alert"),
    alert_message: str = Query("Emergency Vehicle Approaching", description="Custom alert message"),
    radius: float = Query(2, description="Radius in miles for alert delivery")
):
    """
    Trigger a dynamic EMS alert. Supports custom message and radius.
    """
    await manager.broadcast_alert(alert_message, lat, lon, radius)
    return {"status": "Alert sent", "message": alert_message, "radius_miles": radius}

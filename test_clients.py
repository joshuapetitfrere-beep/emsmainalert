import asyncio
import json
import websockets
import pyttsx3

# ================= CONFIG =================
SERVER_URL = "wss://ems-alert-backend.onrender.com/ws"
API_TOKEN = "Test123"

# EMS
EMS_ID = "ems_01"
EMS_ROLE = "ems"
ems_lat, ems_lon = 27.994, -81.760

# Civilian
CIVILIAN_ID = "civilian_01"
CIVILIAN_ROLE = "civilian"
civ_lat, civ_lon = 27.995, -81.761
acknowledged = False

tts = pyttsx3.init()

# ================= EMS CLIENT =================
async def ems_client():
    global ems_lat, ems_lon
    async with websockets.connect(SERVER_URL) as ws:
        # Handshake
        await ws.send(json.dumps({
            "token": API_TOKEN,
            "id": EMS_ID,
            "role": EMS_ROLE
        }))
        print("✅ EMS connected")

        # Send EMS location updates
        while True:
            await ws.send(json.dumps({
                "lat": ems_lat,
                "lon": ems_lon
            }))
            ems_lat += 0.00001  # simulate movement
            await asyncio.sleep(2)

# ================= CIVILIAN CLIENT =================
async def civilian_client():
    global acknowledged
    async with websockets.connect(SERVER_URL) as ws:
        # Handshake
        await ws.send(json.dumps({
            "token": API_TOKEN,
            "id": CIVILIAN_ID,
            "role": CIVILIAN_ROLE
        }))
        print("✅ Civilian connected, waiting for alerts...")

        # Start sending location updates concurrently
        asyncio.create_task(send_civilian_location(ws))

        while True:
            msg = await ws.recv()
            data = json.loads(msg)

            severity = data.get("severity")
            distance = round(data.get("distance_m", 0), 1)
            bearing_angle = round(data.get("bearing", 0), 0)

            if acknowledged or severity is None:
                continue

            if severity == "IMMEDIATE":
                alert_msg = f"🚨 EMERGENCY VEHICLE IMMEDIATELY APPROACHING! {distance} meters"
            elif severity == "HIGH":
                alert_msg = f"⚠️ Emergency vehicle approaching from {bearing_angle} degrees. Prepare to yield."
            else:
                alert_msg = f"Notice: Emergency vehicle nearby, {distance} meters away."

            print(alert_msg)
            tts.say(alert_msg)
            tts.runAndWait()

# ================= CIVILIAN LOCATION UPDATES =================
async def send_civilian_location(ws):
    global acknowledged, civ_lat, civ_lon
    while True:
        await ws.send(json.dumps({
            "lat": civ_lat,
            "lon": civ_lon,
            "ack": acknowledged
        }))
        await asyncio.sleep(5)

# ================= RUN BOTH =================
async def main():
    await asyncio.gather(
        ems_client(),
        civilian_client()
    )

asyncio.run(main())
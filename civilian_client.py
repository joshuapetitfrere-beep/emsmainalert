import asyncio
import json
import pyttsx3
import websockets

# Text-to-speech engine
tts = pyttsx3.init()

SERVER_URL = "wss://ems-alert-backend.onrender.com/ws"
API_TOKEN = "Test123"
CLIENT_ID = "civilian_1"
ROLE = "civilian"

CIVILIAN_LAT = 27.995
CIVILIAN_LON = -81.761

acknowledged = False

def speak(message):
    tts.say(message)
    tts.runAndWait()

async def civilian_client():
    global acknowledged

    async with websockets.connect(SERVER_URL) as wss:
        # ----- HANDSHAKE -----
        handshake = {
            "token": API_TOKEN,
            "id": CLIENT_ID,
            "role": ROLE
        }
        await wss.send(json.dumps(handshake))
        print("✅ Civilian connected, waiting for alerts...")

        # ----- LOCATION UPDATE LOOP -----
        asyncio.create_task(send_location(wss))

        # ----- ALERT LISTENER -----
        while True:
            msg = await wss.recv()
            data = json.loads(msg)

            severity = data.get("severity")
            distance = round(data.get("distance_m", 0), 1)
            bearing_angle = round(data.get("bearing", 0), 0)

            if acknowledged:
                continue

            if severity == "IMMEDIATE":
                alert_msg = f"EMERGENCY VEHICLE IMMEDIATELY APPROACHING. {distance} meters. Yield now."
            elif severity == "HIGH":
                alert_msg = f"Emergency vehicle approaching from {bearing_angle} degrees. Prepare to yield."
            elif severity == "MODERATE":
                alert_msg = f"Emergency vehicle nearby. Distance {distance} meters."
            else:
                continue  # ignore if severity is None

            print(f"🚨 ALERT: {alert_msg}")
            speak(alert_msg)

            # Optionally auto-acknowledge after some delay
            await asyncio.sleep(1)

async def send_location(wss):
    """Send civilian location periodically to server"""
    global acknowledged
    while True:
        await wss.send(json.dumps({
            "lat": CIVILIAN_LAT,
            "lon": CIVILIAN_LON,
            "ack": acknowledged
        }))
        await asyncio.sleep(5)  # send location every 5 seconds

async def main():
    await civilian_client()

asyncio.run(main())
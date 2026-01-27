import asyncio
import json
import pyttsx3
import websockets
import time

# Text-to-speech engine
tts = pyttsx3.init()

SERVER_URL = "wss://ems_alert_backend.onrender.com"

# Simulated civilian GPS location
CIVILIAN_LAT = 27.995
CIVILIAN_LON = -81.761

acknowledged = False

def speak(message):
    tts.say(message)
    tts.runAndWait()

async def civilian_client():
    global acknowledged

    async with websockets.connect(SERVER_URL) as wss:
        # Register as civilian
        await wss.send(json.dumps({
            "token": "Test123",
            "id": "civilian_1",
            "role": "civilian",
            "lat": 27.995,
            "lon": -81.761,
            "ack": False
        }))

        print("✅ Civilian connected, waiting for alerts...")

        while True:
            msg = await wss.recv()
            print("Received:", msg)
            data = json.loads(await wss.recv())

            severity = data.get("severity")
            distance = round(data.get("distance", 0), 1)
            bearing = round(data.get("bearing", 0), 0)

            if acknowledged:
                continue

            if severity == "IMMEDIATE":
                msg = f"EMERGENCY VEHICLE IMMEDIATELY APPROACHING. {distance} meters. Yield now."
            elif severity == "HIGH":
                msg = f"Emergency vehicle approaching from {bearing} degrees. Prepare to yield."
            else:
                msg = f"Emergency vehicle nearby. Distance {distance} meters."

            print(f"🚨 ALERT: {msg}")
            speak(msg)

            # Repeat every 10 seconds until acknowledged
            for _ in range(10):
                await asyncio.sleep(1)
                if acknowledged:
                    break

async def acknowledge():
    global acknowledged
    time.sleep(15)  # simulate driver acknowledgment delay
    acknowledged = True
    print("✅ ALERT ACKNOWLEDGED")

async def main():
    await asyncio.gather(
        civilian_client(),
        acknowledge()
    )

asyncio.run(main())

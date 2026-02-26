import asyncio
import json
import pyttsx3
import websockets
import ssl
import contextlib

# ---------------- CONFIG ----------------
SERVER_URL = "wss://ems-alert-backend.onrender.com/ws"
API_TOKEN = "Test123"
CLIENT_ID = "civilian_1"
ROLE = "civilian"

CIVILIAN_LAT = 27.995
CIVILIAN_LON = -81.761

LOCATION_INTERVAL = 5        # seconds
RECV_TIMEOUT = 30            # seconds
MAX_RUNTIME = None           # set to seconds if you want auto-exit

ssl_context = ssl.create_default_context()

# ---------------- TTS ----------------
tts = pyttsx3.init()

def speak(message: str):
    tts.say(message)
    tts.runAndWait()

# ---------------- CLIENT ----------------
async def send_location(ws, stop_event: asyncio.Event):
    """Send civilian location periodically until stopped"""
    try:
        while not stop_event.is_set():
            await ws.send(json.dumps({
                "lat": CIVILIAN_LAT,
                "lon": CIVILIAN_LON,
                "ack": False
            }))
            await asyncio.sleep(LOCATION_INTERVAL)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print("⚠️ Location sender error:", e)

async def listen_for_alerts(ws, stop_event: asyncio.Event):
    """Listen for alerts with timeout protection"""
    try:
        while not stop_event.is_set():
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT)
            except asyncio.TimeoutError:
                # keep connection alive without blocking forever
                continue

            data = json.loads(msg)

            severity = data.get("severity")
            distance = round(data.get("distance_m", 0), 1)
            bearing_angle = round(data.get("bearing", 0), 0)

            if severity == "IMMEDIATE":
                alert_msg = (
                    f"EMERGENCY VEHICLE IMMEDIATELY APPROACHING. "
                    f"{distance} meters. Yield now."
                )
            elif severity == "HIGH":
                alert_msg = (
                    f"Emergency vehicle approaching from "
                    f"{bearing_angle} degrees. Prepare to yield."
                )
            elif severity == "MODERATE":
                alert_msg = f"Emergency vehicle nearby. Distance {distance} meters."
            else:
                continue

            print(f"🚨 ALERT: {alert_msg}")
            speak(alert_msg)

            await asyncio.sleep(0)  # yield control
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print("⚠️ Alert listener error:", e)

async def civilian_client():
    stop_event = asyncio.Event()

    try:
        async with websockets.connect(
            SERVER_URL,
            ssl=ssl_context,
            ping_interval=20,
            ping_timeout=20
        ) as ws:

            # ----- HANDSHAKE -----
            await ws.send(json.dumps({
                "token": API_TOKEN,
                "id": CLIENT_ID,
                "role": ROLE
            }))
            print("✅ Civilian connected, waiting for alerts...")

            # ----- TASKS -----
            location_task = asyncio.create_task(send_location(ws, stop_event))
            alert_task = asyncio.create_task(listen_for_alerts(ws, stop_event))

            # Optional runtime limit
            if MAX_RUNTIME:
                await asyncio.sleep(MAX_RUNTIME)
            else:
                await asyncio.gather(location_task, alert_task)

    except Exception as e:
        print("❌ Connection error:", e)
    finally:
        stop_event.set()
        print("🛑 Civilian client shutting down")

# ---------------- ENTRY ----------------
if __name__ == "__main__":
    try:
        asyncio.run(civilian_client())
    except KeyboardInterrupt:
        print("👋 Interrupted by user")
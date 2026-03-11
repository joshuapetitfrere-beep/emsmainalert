import asyncio
import json
import websockets
import ssl

# ── Try to import TTS (optional — skips gracefully if not installed) ──────────
try:
    import pyttsx3
    tts = pyttsx3.init()
    def speak(message: str):
        tts.say(message)
        tts.runAndWait()
    TTS_AVAILABLE = True
except Exception:
    TTS_AVAILABLE = False
    def speak(message: str):
        pass  # silently skip TTS if unavailable

# ---------------- CONFIG ----------------
# For local testing:  ws://YOUR_LOCAL_IP:8000/ws
# For Railway:        wss://your-app.up.railway.app/ws
SERVER_URL = "wss://emsmainalert-production.up.railway.app/ws"

CLIENT_ID      = "civilian_1"
CIVILIAN_LAT   = 27.995       # Replace with real or test coordinates
CIVILIAN_LON   = -81.761      # Polk County area

LOCATION_INTERVAL = 5         # seconds between GPS updates
RECV_TIMEOUT      = 30        # seconds before timeout (keeps connection alive)

# For local dev, skip SSL. Switch to ssl.create_default_context() on Railway.
SSL_CONTEXT = ssl.create_default_context()

# ---------------- LOCATION SENDER ----------------
async def send_location(ws, stop_event: asyncio.Event):
    """
    Sends GPS coordinates to server every LOCATION_INTERVAL seconds.
    Server uses these for geofence filtering — only alerts nearby civilians.
    Message type matches server's 'update' handler.
    """
    try:
        while not stop_event.is_set():
            await ws.send(json.dumps({
                "type": "update",           # ← matches server msg_type == "update"
                "lat": CIVILIAN_LAT,
                "lon": CIVILIAN_LON,
            }))
            await asyncio.sleep(LOCATION_INTERVAL)
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"⚠️  Location sender error: {e}")

# ---------------- ALERT LISTENER ----------------
async def listen_for_alerts(ws, stop_event: asyncio.Event):
    """
    Listens for EMS alerts from the server.
    When received, announces via TTS and prompts user to acknowledge.
    Sends ACK back to server with the specific alert_id.
    """
    try:
        while not stop_event.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT)
            except asyncio.TimeoutError:
                continue  # no alert yet, keep waiting

            data = json.loads(raw)

            # Only handle EMS alerts (ignore other message types if added later)
            if data.get("type") != "ems_alert":
                continue

            alert_id  = data.get("alert_id", "unknown")
            message   = data.get("message", "Emergency vehicle approaching.")
            ems_unit  = data.get("ems_unit", "EMS")

            print("\n" + "="*50)
            print(f"🚨 ALERT from {ems_unit}")
            print(f"   {message}")
            print(f"   Alert ID: {alert_id}")
            print("="*50)

            speak(f"Alert. {message}")

            # Prompt for acknowledgement (non-blocking via thread executor)
            loop = asyncio.get_event_loop()
            user_input = await loop.run_in_executor(
                None, lambda: input("Press A + Enter to acknowledge: ")
            )

            if user_input.strip().lower() == "a":
                await ws.send(json.dumps({
                    "type": "ACK",          # ← matches server msg_type == "ACK"
                    "alert_id": alert_id,   # ← NEW: server logs which alert was ACK'd
                }))
                print("✅ Alert acknowledged\n")
                speak("Alert acknowledged.")

    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"⚠️  Alert listener error: {e}")

# ---------------- MAIN CLIENT ----------------
async def civilian_client():
    stop_event = asyncio.Event()

    try:
        async with websockets.connect(
            SERVER_URL,
            ssl=SSL_CONTEXT,
            ping_interval=20,
            ping_timeout=20,
        ) as ws:
            print(f"✅ Connected to {SERVER_URL}")
            print(f"   Client ID : {CLIENT_ID}")
            print(f"   Location  : {CIVILIAN_LAT}, {CIVILIAN_LON}")
            print(f"   TTS       : {'enabled' if TTS_AVAILABLE else 'disabled'}\n")

            # Run location sender and alert listener concurrently
            location_task = asyncio.create_task(send_location(ws, stop_event))
            alert_task    = asyncio.create_task(listen_for_alerts(ws, stop_event))

            await asyncio.gather(location_task, alert_task)

    except ConnectionRefusedError:
        print("❌ Could not connect — is the server running?")
    except Exception as e:
        print(f"❌ Connection error: {e}")
    finally:
        stop_event.set()
        print("🛑 Civilian client shut down")

# ---------------- ENTRY ----------------
if __name__ == "__main__":
    try:
        asyncio.run(civilian_client())
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user")

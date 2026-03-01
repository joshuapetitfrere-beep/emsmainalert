import asyncio
import json
import websockets
import ssl

# ---------------- CONFIG ----------------
SERVER_URL = "wss://ems-alert-backend.onrender.com/ws"
API_TOKEN = "Test123"
CLIENT_ID = "ems1"
ROLE = "ems"

START_LAT = 27.994
START_LON = -81.760

LOCATION_INTERVAL = 2     # seconds
RECV_TIMEOUT = 30         # seconds (safety)
MAX_RUNTIME = None        # set to seconds if you want auto-exit

ssl_context = ssl.create_default_context()

# ---------------- TASKS ----------------
async def send_location(ws, stop_event: asyncio.Event):
    lat, lon = START_LAT, START_LON
    try:
        while not stop_event.is_set():
            await ws.send(json.dumps({
                "lat": lat,
                "lon": lon
            }))

            lat += 0.00001  # simulate movement
            await asyncio.sleep(LOCATION_INTERVAL)

    except asyncio.CancelledError:
        pass
    except Exception as e:
        print("⚠️ Location sender error:", e)

async def keep_alive(ws, stop_event: asyncio.Event):
    """
    Optional listener to prevent dead sockets and detect disconnects.
    """
    try:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(ws.recv(), timeout=RECV_TIMEOUT)
            except asyncio.TimeoutError:
                continue
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print("⚠️ Keep-alive error:", e)

# ---------------- CLIENT ----------------
async def ws_handler(ws): 
    if ws.path != "/ws": 
        await ws.close() 
        return 




async def ems_client():
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
                "id": CLIENT_ID,
                "role": ROLE,
                "token": API_TOKEN
            }))
            print("✅ EMS connected and transmitting location")

            # ----- TASKS -----
            location_task = asyncio.create_task(send_location(ws, stop_event))
            keepalive_task = asyncio.create_task(keep_alive(ws, stop_event))

            if MAX_RUNTIME:
                await asyncio.sleep(MAX_RUNTIME)
            else:
                await asyncio.gather(location_task, keepalive_task)

    except Exception as e:
        print("❌ EMS connection error:", e)
    finally:
        stop_event.set()
        print("🛑 EMS client shutting down")

# ---------------- ENTRY ----------------
if __name__ == "__main__":
    try:
        asyncio.run(ems_client())
    except KeyboardInterrupt:
        print("👋 EMS client interrupted")
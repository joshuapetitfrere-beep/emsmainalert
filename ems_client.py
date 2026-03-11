import asyncio
import json
import websockets
import httpx

# ---------------- CONFIG ----------------
# For local testing:  http://localhost:8000  /  ws://localhost:8000/ws
# For Railway:        https://your-app.up.railway.app
SERVER_HTTP = "https://emsmainalert-production.up.railway.app"
SERVER_WS   = "wss://emsmainalert-production.up.railway.app/ws"

EMS_UNIT_ID = "POLK-RESCUE-1"   # Change per unit/vehicle

# EMS vehicle coordinates — in production these come from GPS hardware
EMS_LAT = 27.994
EMS_LON = -81.760

ALERT_RADIUS_MILES = 2.0

# ---------------- PRESET MESSAGES ----------------
PRESETS = {
    "1": "Emergency vehicle responding. Please pull to the right and stop.",
    "2": "Fire apparatus en route. Pull right, stop, and wait.",
    "3": "Ambulance responding to medical emergency. Please yield immediately.",
    "4": "Law enforcement vehicle responding. Pull to the right.",
    "5": "All clear. Thank you for yielding.",
}

# ---------------- ALERT TRIGGER (HTTP) ----------------
async def trigger_alert(message: str):
    """
    Sends alert via HTTP POST to /trigger-alert.
    Server handles WebSocket broadcast + Expo push to offline devices.
    """
    params = {
        "lat": EMS_LAT,
        "lon": EMS_LON,
        "alert_message": message,
        "radius": ALERT_RADIUS_MILES,
        "ems_unit_id": EMS_UNIT_ID,
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SERVER_HTTP}/trigger-alert",
                params=params,
                timeout=10.0,
            )
            result = resp.json()
            print(f"\n✅ Alert sent!")
            print(f"   Alert ID  : {result.get('alert_id')}")
            print(f"   WS sent   : {result.get('ws_delivered')} devices")
            print(f"   Push sent : {result.get('push_delivered')} devices\n")
    except Exception as e:
        print(f"❌ Failed to send alert: {e}")

# ---------------- STATUS CHECK ----------------
async def fetch_status():
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{SERVER_HTTP}/status", timeout=5.0)
            data = resp.json()
            print(f"\n📡 Server Status")
            print(f"   Connected civilians : {data.get('connected_clients')}")
            print(f"   Offline tokens      : {data.get('offline_tokens')}")
            print(f"   Total alerts sent   : {data.get('total_alerts_sent')}\n")
    except Exception as e:
        print(f"❌ Could not reach server: {e}")

# ---------------- WEBSOCKET (for receiving ACKs live) ----------------
async def listen_for_acks(stop_event: asyncio.Event):
    """
    Optional: connect via WebSocket to receive live ACK confirmations.
    In production this would update a dispatcher dashboard.
    """
    try:
        async with websockets.connect(SERVER_WS, ping_interval=20) as ws:
            print("📻 Listening for live ACKs from civilians...\n")
            while not stop_event.is_set():
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(raw)
                    # EMS client doesn't act on ems_alert messages — just log
                    print(f"[WS] Received: {data}")
                except asyncio.TimeoutError:
                    continue
    except Exception as e:
        print(f"⚠️  WS listener error: {e}")

# ---------------- MAIN DISPATCHER LOOP ----------------
async def ems_client():
    print("="*50)
    print(f"  EMS DISPATCH CLIENT")
    print(f"  Unit     : {EMS_UNIT_ID}")
    print(f"  Location : {EMS_LAT}, {EMS_LON}")
    print(f"  Server   : {SERVER_HTTP}")
    print("="*50)

    # Check server status on startup
    await fetch_status()

    stop_event = asyncio.Event()

    # Start ACK listener in background
    ack_task = asyncio.create_task(listen_for_acks(stop_event))

    try:
        while True:
            print("── SEND ALERT ──────────────────────────────")
            print("  Presets:")
            for key, msg in PRESETS.items():
                print(f"  [{key}] {msg}")
            print("  [c] Custom message")
            print("  [s] Server status")
            print("  [q] Quit")
            print("────────────────────────────────────────────")

            choice = await asyncio.get_event_loop().run_in_executor(
                None, lambda: input("Choice: ").strip().lower()
            )

            if choice == "q":
                break
            elif choice == "s":
                await fetch_status()
            elif choice == "c":
                msg = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: input("Custom message: ").strip()
                )
                if msg:
                    await trigger_alert(msg)
            elif choice in PRESETS:
                await trigger_alert(PRESETS[choice])
            else:
                print("⚠️  Invalid choice\n")

    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        ack_task.cancel()
        print("🛑 EMS client shut down")

# ---------------- ENTRY ----------------
if __name__ == "__main__":
    try:
        asyncio.run(ems_client())
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user")

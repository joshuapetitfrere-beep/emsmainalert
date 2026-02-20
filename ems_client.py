import asyncio
import json
import websockets
import ssl 

SERVER_URL = "wss://ems-alert-backend.onrender.com/ws"  # Render server
ssl_context = ssl.create_default_context() 
API_TOKEN = "Test123"
CLIENT_ID = "ems1"
ROLE = "ems"

async def ems():
    async with websockets.connect(SERVER_URL) as wss:
        # ----- HANDSHAKE -----
        handshake = {
            "id": CLIENT_ID,
            "role": ROLE,
            "token": API_TOKEN
        }
        await wss.send(json.dumps(handshake))
        print("✅ Handshake sent")

        # ----- LOCATION LOOP -----
        lat, lon = 27.994, -81.760

        while True:
            await wss.send(json.dumps({
                "lat": lat,
                "lon": lon
            }))
            lat += 0.00001
            await asyncio.sleep(2)  # async sleep, not time.sleep

asyncio.run(ems())
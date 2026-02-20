import asyncio, json, websockets

SERVER_URL = "wss://emsmainalert.onrender.com/ws"
API_TOKEN = "Test123"

async def test_handshake():
    async with websockets.connect(SERVER_URL) as ws:
        await ws.send(json.dumps({
            "token": API_TOKEN,
            "id": "test_client",
            "role": "civilian"
        }))
        print("✅ Handshake sent successfully!")
        # Optionally receive first message from server
        # msg = await ws.recv()
        # print("Received from server:", msg)

asyncio.run(test_handshake())
import asyncio, json, websockets

SERVER_URL = "wss://emsmainalert.onrender.com/ws"

async def test():
    async with websockets.connect(SERVER_URL) as ws:
        await ws.send(json.dumps({
            "token": "Test123",
            "id": "ping",
            "role": "civilian"
        }))
        print("CONNECTED")

asyncio.run(test())
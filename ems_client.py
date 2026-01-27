import asyncio, json, websockets, time

async def ems():
    async with websockets.connect("wss://ems_alert_backend.onrender.com") as wss:
        await wss.send(json.dumps({
            "id": "ems1",
            "role": "ems"
        }))

        lat, lon = 27.994, -81.760

        while True:
            await wss.send(json.dumps({
                "lat": lat,
                "lon": lon,
                "c_lat": 27.995,
                "c_lon": -81.761
            }))
            lat += 0.00001
            time.sleep(2)

asyncio.run(ems())

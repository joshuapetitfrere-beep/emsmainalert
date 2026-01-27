import asyncio, json, pyttsx3
from kivy.app import App
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.uix.boxlayout import BoxLayout
import websockets

engine = pyttsx3.init()

class AlertApp(App):
    def build(self):
        self.label = Label(text="NO ALERT", font_size=40)
        self.btn = Button(text="ACKNOWLEDGE", on_press=self.ack)
        layout = BoxLayout(orientation="vertical")
        layout.add_widget(self.label)
        layout.add_widget(self.btn)
        return layout

    def ack(self, _):
        self.ws_send({"ack": True})
        self.label.text = "ACKNOWLEDGED"

    async def listen(self):
        async with websockets.connect("ws://localhost:8000/ws") as ws:
            self.ws = ws
            await ws.send(json.dumps({
                "id": "car1",
                "role": "civilian"
            }))

            while True:
                data = json.loads(await ws.recv())
                msg = f"{data['severity']} EMS vehicle approaching"
                self.label.text = msg
                engine.say(msg)
                engine.runAndWait()

    def ws_send(self, data):
        asyncio.create_task(self.ws.send(json.dumps(data)))

AlertApp().run()

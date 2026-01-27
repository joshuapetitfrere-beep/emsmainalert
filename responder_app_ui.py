from kivy.app import App
from kivy.uix.button import Button
from kivy.uix.boxlayout import BoxLayout
import requests 
class ResponderApp(App):
    def build(self):
        layout = BoxLayout(orientation='vertical')
        start_btn = Button(text='Start Alert')
        stop_btn = Button(text='Stop Alert')
        start_btn.bind(on_press=self.start_alert)
        stop_btn.bind(on_press=self.stop_alert)
        layout.add_widget(start_btn)
        layout.add_widget(stop_btn)
        return layout

    def start_alert(self, instance):
        # Send GPS updates to server and start alert
        print("Alert started!")

    def stop_alert(self, instance):
        # Stop sending GPS updates
        print("Alert stopped!")

   

def send_gps(lat, lon, responder_id):
    data = {'lat': lat, 'lon': lon, 'responder_id': responder_id}
    try:
        requests.post("https://your-server.com/update_gps", json=data)
    except:
        print("Failed to send GPS")

ResponderApp().run()


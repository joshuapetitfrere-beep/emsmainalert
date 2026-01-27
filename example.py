from plyer import notification
import pyttsx3
import time

# Initialize TTS engine
tts_engine = pyttsx3.init()
tts_engine.setProperty('rate', 150)      # Adjust speech rate
tts_engine.setProperty('volume', 1.0)    # Adjust volume (0.0 to 1.0)

# Simulate vehicle detection
emergency_vehicle_nearby = True  # Change to False to simulate no vehicle

def announce(message):
    
    print(message)
    tts_engine.say(message)
    tts_engine.runAndWait()

def send_notification(title, message):
    
    notification.notify(
        title=title,
        message=message,
        app_name='Python Broadcaster',
        timeout=10
    )

def check_and_alert():
    
    alerted = False

    while True:
        if emergency_vehicle_nearby and not alerted:
            message = "Emergency Vehicle Approaching! Yield right of way!"
            announce(message)                 # print + TTS
            send_notification("Emergency Alert", message)  # notification
            alerted = True
        elif not emergency_vehicle_nearby and alerted:
            message = "Emergency Vehicle has passed. Alerts reset."
            announce(message)
            alerted = False

        time.sleep(5)  # Check every 5 seconds

if __name__ == '__main__':
    print("Starting Emergency Vehicle Alert System...")
    time.sleep(2)
    check_and_alert()

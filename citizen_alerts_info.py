import json
import math
import time
import pyttsx3
from datetime import datetime

# ---------------------------
# --- File Paths
# ---------------------------
USERS_FILE = "users.json"  # stores simulated users

# ---------------------------
# --- Load/Save Users
# ---------------------------
def load_users():
    try:
        with open(USERS_FILE, "r") as f:
            content = f.read().strip()
            if not content:
                return []
            return json.loads(content)
    except FileNotFoundError:
        return []

def save_users(users):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

# ---------------------------
# --- Distance Calculation
# ---------------------------
def haversine(lat1, lon1, lat2, lon2):
    """
    Returns distance in meters between two lat/lon coordinates.
    """
    R = 6371000  # Radius of Earth in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi/2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ---------------------------
# --- Notification System
# ---------------------------
engine = pyttsx3.init()

def send_alert(user, message):
    """
    Simulate sending an alert to a user:
    - Voice announcement
    - Full-screen print overlay (simulation)
    """
    print("\n" + "="*40)
    print(f"ALERT FOR {user['name'].upper()}")
    print(f"{message}")
    print("="*40 + "\n")
    engine.say(f"Attention {user['name']}, {message}")
    engine.runAndWait()

# ---------------------------
# --- Citizen Alert Logic
# ---------------------------
def alert_nearby_users(vehicle_lat, vehicle_lon, users, radius_meters=500):
    """
    Trigger alert for users within radius_meters of the emergency vehicle.
    """
    alerted = []
    for user in users:
        distance = haversine(vehicle_lat, vehicle_lon, user['latitude'], user['longitude'])
        if distance <= radius_meters:
            send_alert(user, f"Emergency vehicle nearby! Distance: {int(distance)} meters.")
            alerted.append(user['name'])
    if not alerted:
        print("No users in range for this alert.")
    return alerted

# ---------------------------
# --- Simulation Example
# ---------------------------
if __name__ == "__main__":
    users = load_users()
    if not users:
        # Example users with coordinates
        users = [
            {"name": "Alice", "latitude": 28.037, "longitude": -81.732},
            {"name": "Bob", "latitude": 28.042, "longitude": -81.735},
            {"name": "Charlie", "latitude": 28.045, "longitude": -81.730}
        ]
        save_users(users)
        print("Sample users created.")

    # Simulate vehicle moving
    vehicle_path = [
        (28.035, -81.733),
        (28.038, -81.734),
        (28.041, -81.735),
        (28.044, -81.736)
    ]

    for lat, lon in vehicle_path:
        print(f"Emergency vehicle at {lat}, {lon} at {datetime.now()}")
        alert_nearby_users(lat, lon, users, radius_meters=500)
        time.sleep(2)  # simulate vehicle movement

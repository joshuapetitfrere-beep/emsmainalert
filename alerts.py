# alerts.py
import json
from datetime import datetime
from notifications import notify_relevant_patients  # make sure this exists
from database import patients, save_json, load_json, log_action

ALERT_FILE = "data/alerts.json"

alerts_list = []  # central list of alerts

# ---------------------------
# --- Load & Save Alerts
# ---------------------------
def load_alerts():
    """Load alerts from file into alerts_list"""
    global alerts_list
    loaded_alerts = load_json(ALERT_FILE)
    for alert in loaded_alerts:
        if 'time' in alert and isinstance(alert['time'], str):
            # convert string to datetime
            alert['time'] = datetime.strptime(alert['time'].split('.')[0], "%Y-%m-%d %H:%M:%S")
    alerts_list = loaded_alerts
    return alerts_list

def save_alerts():
    """Save alerts_list to file"""
    alerts_to_save = []
    for alert in alerts_list:
        alert_copy = alert.copy()
        if isinstance(alert_copy.get('time'), datetime):
            alert_copy['time'] = alert_copy['time'].strftime("%Y-%m-%d %H:%M:%S")
        alerts_to_save.append(alert_copy)
    save_json(ALERT_FILE, alerts_to_save)

# ---------------------------
# --- Alert Management
# ---------------------------
def add_alert(patients, responders):
    """Interactive prompt to add an alert"""
    alert_type = input("Enter alert type (Medical, Fire, Accident): ")
    location = input("Enter location: ")
    severity = input("Enter severity (High, Medium, Low): ")
    description = input("Enter a short description: ")
    alert_time = datetime.now()

    alert = {
        'type': alert_type,
        'location': location,
        'severity': severity,
        'description': description,
        'time': alert_time,
        'status': 'Active'
    }

    alerts_list.append(alert)
    save_alerts()
    log_action(f"Added alert: {alert_type} at {location} with severity {severity}")
    print("\nAlert added successfully!\n")
    notify_relevant_patients(alert, patients, responders)
    return alert  # return for queueing if needed

def get_sorted_alerts(only_active=True):
    """Return alerts sorted by severity and time (High -> Low)"""
    severity_order = {'High': 3, 'Medium': 2, 'Low': 1}
    filtered = [a for a in alerts_list if a['status'] == 'Active'] if only_active else alerts_list
    return sorted(
        filtered,
        key=lambda x: (severity_order.get(x['severity'], 0), x['time']),
        reverse=True
    )

def dispatch_next_alert(patients, responders):
    """Dispatch the highest priority active alert"""
    sorted_alerts = get_sorted_alerts()
    if not sorted_alerts:
        print("No active alerts to dispatch.")
        return
    alert = sorted_alerts[0]  # highest priority
    notify_relevant_patients(alert, patients, responders)
    alert['status'] = 'Dispatched'
    save_alerts()
    return alert

def view_alerts(only_active=True):
    """Display alerts, filtered by active status"""
    alerts_to_view = get_sorted_alerts(only_active)
    if not alerts_to_view:
        print("No alerts found.")
        return
    for i, alert in enumerate(alerts_to_view, 1):
        print(f"\nAlert {i}:")
        for k, v in alert.items():
            if k == 'time' and isinstance(v, datetime):
                v = v.strftime("%Y-%m-%d %H:%M:%S")
            print(f"{k.capitalize()}: {v}")
        print("-" * 30)
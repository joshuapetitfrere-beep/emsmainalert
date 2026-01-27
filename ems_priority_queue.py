import os
import datetime
import json


# File to store alerts
FILENAME = "alerts.json"

# Initialize alerts list
alerts = []

# --- Helper Functions ---

def save_alerts():
    """Save alerts to a JSON file."""
    alerts_to_save = []
    for alert in alerts:
        alert_copy = alert.copy()
        # Convert datetime to string for JSON
        alert_copy['time'] = alert_copy['time'].strftime('%Y-%m-%d %H:%M:%S')
        alerts_to_save.append(alert_copy)
    with open(FILENAME, 'w') as f:
        json.dump(alerts_to_save, f)

def load_alerts():
    """Load alerts from a JSON file."""
    global alerts
    try:
        with open(FILENAME, 'r') as f:
            loaded_alerts = json.load(f)
        # Convert time strings back to datetime objects
        for alert in loaded_alerts:
            alert['time'] = datetime.datetime.strptime(alert['time'], '%Y-%m-%d %H:%M:%S')
        alerts = loaded_alerts
    except FileNotFoundError:
        alerts = []

# --- EMS Functions ---

def add_alert():
    """Add a new alert."""
    alert_type = input("Enter alert type (Medical, Fire, Accident): ")
    location = input("Enter location: ")
    severity = input("Enter severity (High, Medium, Low): ")
    description = input("Enter a short description: ")

    alert_time = datetime.datetime.now()

    alert = {
        'type': alert_type,
        'location': location,
        'severity': severity,
        'description': description,
        'time': alert_time,
        'status': 'Active'
    }

    alerts.append(alert)
    save_alerts()
    print("Alert added successfully!")
    input("Press Enter to continue...")

def view_alerts(only_active=True):
    """View alerts sorted by severity and time."""
    if not alerts:
        print("No alerts to display.")
        input("Press Enter to continue...")
        return

    severity_order = {'High': 3, 'Medium': 2, 'Low': 1}
    filtered_alerts = [a for a in alerts if a['status'] == 'Active'] if only_active else alerts

    sorted_alerts = sorted(
        filtered_alerts,
        key=lambda x: (severity_order.get(x['severity'], 0), x['time']),
        reverse=True
    )

    print("\n=== Alerts ===")
    for i, alert in enumerate(sorted_alerts, 1):
        highlight = "*** HIGH PRIORITY ***" if alert['severity'] == 'High' else ""
        print(f"\nAlert {i} {highlight}")
        print(f"Type: {alert['type']}")
        print(f"Location: {alert['location']}")
        print(f"Severity: {alert['severity']}")
        print(f"Description: {alert['description']}")
        print(f"Reported: {alert['time'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Status: {alert['status']}")
        print("-" * 40)
    input("Press Enter to continue...")

def handle_alert():
    """Update the status of an alert."""
    if not alerts:
        print("No alerts to handle.")
        input("Press Enter to continue...")
        return

    view_alerts()
    try:
        choice = int(input("Enter the number of the alert to update: "))
        if 1 <= choice <= len(alerts):
            new_status = input("Enter new status (Dispatched/Resolved): ")
            alerts[choice-1]['status'] = new_status
            save_alerts()
            print("Alert status updated!")
        else:
            print("Invalid choice.")
    except ValueError:
        print("Please enter a valid number.")
    input("Press Enter to continue...")

def delete_alert():
    """Delete a specific alert."""
    if not alerts:
        print("No alerts to delete.")
        input("Press Enter to continue...")
        return

    view_alerts(only_active=False)
    try:
        choice = int(input("Enter the number of the alert to delete: "))
        if 1 <= choice <= len(alerts):
            alerts.pop(choice-1)
            save_alerts()
            print("Alert deleted successfully!")
        else:
            print("Invalid choice.")
    except ValueError:
        print("Please enter a valid number.")
    input("Press Enter to continue...")

# --- Main Menu ---
def main_menu():
    while True:
        os.system('clear')  # Clears the terminal
        print("=== EMS Priority Queue Simulator ===")
        print("1. Add Alert")
        print("2. View Active Alerts")
        print("3. View All Alerts (including resolved)")
        print("4. Handle Alert")
        print("5. Delete Alert")
        print("6. Exit")

        choice = input("Enter your choice: ")
        if choice == '1':
            add_alert()
        elif choice == '2':
            view_alerts(only_active=True)
        elif choice == '3':
            view_alerts(only_active=False)
        elif choice == '4':
            handle_alert()
        elif choice == '5':
            delete_alert()
        elif choice == '6':
            print("Exiting program. Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")
            input("Press Enter to continue...")

# --- Run Program ---
if __name__ == "__main__":
    load_alerts()
    main_menu()

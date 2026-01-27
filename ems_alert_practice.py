import os
import datetime

# List to store all alerts
alerts = []

# --- Functions ---

def add_alert():
    """Adds a new alert based on user input."""
    alert_type = input("Enter the alert type (Medical, Fire, Accident): ")
    location = input("Enter the location: ")
    severity = input("Enter the severity: ")
    description = input("Enter a description: ")

    alert_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    alert = {
        'alert_type': alert_type,
        'location': location,
        'severity': severity,
        'description': description,
        'time': alert_time,
        'status': 'Active'
    }

    alerts.append(alert)
    print("Alert added successfully!")
    input("Press Enter to continue...")

def view_alerts():
    """Displays all alerts stored in the system."""
    if not alerts:
        print("No alerts to display.")
    else:
        print("\n=== Active Alerts ===")
        for i, alert in enumerate(alerts, 1):
            print(f"\nAlert {i}:")
            print(f"Type: {alert['alert_type']}")
            print(f"Location: {alert['location']}")
            print(f"Severity: {alert['severity']}")
            print(f"Description: {alert['description']}")
            print(f"Reported: {alert['time']}")
            print(f"Status: {alert['status']}")
            print("-" * 40)
        input("Press Enter to continue...")

def handle_alert():
    """Marks a specific alert as handled."""
    if not alerts:
        print("No alerts to handle.")
        input("Press Enter to continue...")
        return

    view_alerts()
    try:
        choice = int(input("Enter the number of the alert to mark as handled: "))
        if 1 <= choice <= len(alerts):
            alerts[choice - 1]['status'] = 'Handled'
            print("Alert marked as handled!")
        else:
            print("Invalid choice.")
    except ValueError:
        print("Please enter a valid number.")
    input("Press Enter to continue...")

def delete_alert():
    """Deletes a specific alert from the system."""
    if not alerts:
        print("No alerts to delete.")
        input("Press Enter to continue...")
        return

    view_alerts()
    try:
        choice = int(input("Enter the number of the alert to delete: "))
        if 1 <= choice <= len(alerts):
            alerts.pop(choice - 1)
            print("Alert deleted successfully!")
        else:
            print("Invalid choice.")
    except ValueError:
        print("Please enter a valid number.")
    input("Press Enter to continue...")

# --- Main Menu ---
def main_menu():
    while True:
        os.system('clear')  # Clears the terminal screen (Mac/Linux)
        print("=== EMS Alert Simulator ===")
        print("1. Add Alert")
        print("2. View Alerts")
        print("3. Handle Alert")
        print("4. Delete Alert")
        print("5. Exit")

        choice = input("Enter your choice: ")
        if choice == '1':
            add_alert()
        elif choice == '2':
            view_alerts()
        elif choice == '3':
            handle_alert()
        elif choice == '4':
            delete_alert()
        elif choice == '5':
            print("Exiting program. Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")
            input("Press Enter to continue...")

if __name__ == "__main__":
    main_menu()

import datetime
import json

# ---------------------------
# --- File Persistence
# ---------------------------
ALERT_FILE = "alerts.json"
PATIENT_FILE = "patients.json"
LOG_FILE = "ems_log.txt"

# ---------------------------
# --- Sample Patient Database
# ---------------------------
patients = [
    {'name': 'John Doe', 'age': 45, 'allergies': ['Peanuts', 'Penicillin'], 'condition': 'Diabetic', 'location': 'Winter Haven'},
    {'name': 'Jane Smith', 'age': 30, 'allergies': [], 'condition': 'Asthma', 'location': 'Winter Haven'},
    {'name': 'Mike Brown', 'age': 60, 'allergies': ['Latex'], 'condition': 'Hypertension', 'location': 'Lake Alfred'}
]

# ---------------------------
# --- Sample Responders
# ---------------------------
responders = [
    {'name': 'Alice', 'available': True},
    {'name': 'Bob', 'available': True},
    {'name': 'Charlie', 'available': True}
]

# ---------------------------
# --- Alerts List
# ---------------------------
alerts = []

# ---------------------------
# --- Helper Functions
# ---------------------------
def save_json(file, data):
    with open(file, 'w') as f:
        json.dump(data, f, default=str)

def load_json(file):
    try:
        with open(file, 'r') as f:
            content = f.read().strip()
            if not content:
                return []
            return json.loads(content)
    except FileNotFoundError:
        return []
from datetime import datetime

def now_timestamp(): 
    return datetime.now().replace(microsecond=0).strftime("%Y-%m-%d %H:%M:%S")
def log_action(action):
    timestamp = now_timestamp(),
    with open(LOG_FILE, 'a') as f: 
        f.write(f"[{timestamp}] {action}\n")


# ---------------------------
# --- Load Alerts & Patients
# ---------------------------
def load_alerts():
    global alerts
    loaded_alerts = load_json(ALERT_FILE)

    # Repair timestamps if needed
    fixed_alerts = []
    for alert in loaded_alerts:
        t = alert.get("time", "")
        try:
            # ACCEPT timestamps with or without microseconds
            dt = datetime.strptime(t, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            try:
                dt = datetime.strptime(t, "%Y-%m-%d %H:%M:%S.%f")
            except:
                dt = datetime.now()

        # Save a clean timestamp string (no microseconds)
        alert["time"] = dt.strftime("%Y-%m-%d %H:%M:%S")
        fixed_alerts.append(alert)

    alerts = fixed_alerts


    alerts = loaded_alerts

def load_patients():
    global patients
    loaded_patients = load_json(PATIENT_FILE)
    if loaded_patients:
        patients = loaded_patients

def save_patients():
    save_json(PATIENT_FILE, patients)

# ---------------------------
# --- Patient Filtering
# ---------------------------
def filter_by_allergy(patients_list, allergy):
    allergy = allergy.strip().lower()
    return [p for p in patients_list if any(allergy == a.lower() for a in p.get('allergies', []))]

def filter_by_condition(patients_list, condition):
    condition = condition.strip().lower()
    return [p for p in patients_list if condition in p.get('condition', '').lower()]

def filter_by_age_range(patients_list, min_age, max_age):
    return [p for p in patients_list if min_age <= p.get('age', 0) <= max_age]

def display_patients(patients_list):
    if not patients_list:
        print("No patients found.")
        return
    for i, patient in enumerate(patients_list, 1):
        print(f"\nPatient {i}:")
        for key, value in patient.items():
            print(f"{key.capitalize()}: {value}")
        print("-" * 30)

# ---------------------------
# --- EMS Alert Functions
# ---------------------------
def add_alert():
    alert_type = input("Enter alert type (Medical, Fire, Accident): ")
    location = input("Enter location: ")
    severity = input("Enter severity (High, Medium, Low): ")
    description = input("Enter a short description: ")
    alert_time = now_timestamp()

    alert = {
        'type': alert_type,
        'location': location,
        'severity': severity,
        'description': description,
        'time': alert_time,
        'status': 'Active'
    }

    alerts.append(alert)
    save_json(ALERT_FILE, alerts)
    log_action(f"Added alert: {alert_type} at {location}, severity {severity}")
    print("\nAlert added successfully!\n")
    notify_relevant_patients(alert)
    input("Press Enter to continue...")

def view_alerts(only_active=True):
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
        print(f"Reported: {alert['time']}")
        print(f"Status: {alert['status']}")
        print("-" * 40)
    input("Press Enter to continue...")

def handle_alert():
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
            save_json(ALERT_FILE, alerts)
            log_action(f"Alert {choice} status updated to {new_status}")
            print("Alert status updated!")
        else:
            print("Invalid choice.")
    except ValueError:
        print("Please enter a valid number.")
    input("Press Enter to continue...")

def delete_alert():
    if not alerts:
        print("No alerts to delete.")
        input("Press Enter to continue...")
        return
    view_alerts(only_active=False)
    try:
        choice = int(input("Enter the number of the alert to delete: "))
        if 1 <= choice <= len(alerts):
            deleted_alert = alerts.pop(choice-1)
            save_json(ALERT_FILE, alerts)
            log_action(f"Deleted alert: {deleted_alert['type']} at {deleted_alert['location']}")
            print("Alert deleted successfully!")
        else:
            print("Invalid choice.")
    except ValueError:
        print("Please enter a valid number.")
    input("Press Enter to continue...")

# ---------------------------
# --- Notification System
# ---------------------------
def notify_relevant_patients(alert):
    allergy_keywords = ['Peanuts', 'Latex', 'Penicillin']
    condition_keywords = ['Diabetic', 'Asthma', 'Hypertension']

    relevant_patients = []

    for keyword in allergy_keywords:
        if keyword.lower() in alert['description'].lower():
            relevant_patients.extend(filter_by_allergy(patients, keyword))

    for keyword in condition_keywords:
        if keyword.lower() in alert['description'].lower():
            relevant_patients.extend(filter_by_condition(patients, keyword))

    relevant_patients = [dict(t) for t in {tuple(p.items()) for p in relevant_patients}]

    print(f"=== Alert Notification ===")
    print(f"Type: {alert['type']}, Location: {alert['location']}, Severity: {alert['severity']}")
    print(f"Description: {alert['description']}\n")

    if relevant_patients:
        print("Relevant patients identified:")
        display_patients(relevant_patients)
    else:
        print("No relevant patients found.")

    # Dispatch first available responder
    for responder in responders:
        if responder['available']:
            print(f"\nDispatching responder: {responder['name']}")
            responder['available'] = False
            log_action(f"Responder {responder['name']} dispatched to alert at {alert['location']}")
            break
    else:
        print("\nNo responders available!")

# ---------------------------
# --- Patient Management
# ---------------------------
def add_patient():
    name = input("Enter patient name: ")
    age = int(input("Enter patient age: "))
    allergies = input("Enter allergies (comma separated): ").split(',')
    allergies = [a.strip() for a in allergies if a.strip()]
    condition = input("Enter medical condition: ")
    location = input("Enter patient location: ")
    patient = {'name': name, 'age': age, 'allergies': allergies, 'condition': condition, 'location': location}
    patients.append(patient)
    save_patients()
    log_action(f"Added patient: {name}")
    print("Patient added successfully!")
    input("Press Enter to continue...")

def view_patients():
    display_patients(patients)
    input("Press Enter to continue...")

# ---------------------------
# --- Main Menu
# ---------------------------
def main_menu():
    while True:
        print("\n=== EMS Priority Queue Simulator ===")
        print("1. Add Alert")
        print("2. View Active Alerts")
        print("3. View All Alerts")
        print("4. Handle Alert")
        print("5. Delete Alert")
        print("6. Add Patient")
        print("7. View Patients")
        print("8. Exit")

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
            add_patient()
        elif choice == '7':
            view_patients()
        elif choice == '8':
            print("Exiting program. Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")
            input("Press Enter to continue...")

# ---------------------------
# --- Run Program
# ---------------------------
if __name__ == "__main__":
    load_alerts()
    load_patients()
    main_menu()

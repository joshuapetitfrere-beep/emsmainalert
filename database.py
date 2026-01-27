# database.py
import json
from datetime import datetime

PATIENT_FILE = "data/patients.json"
patients = []
responders = [
    {'name': 'Alice', 'available': True},
    {'name': 'Bob', 'available': True},
    {'name': 'Charlie', 'available': True}
]

def display_patients(patients_list):
    if not patients_list:
        print("No patients found.")
        return
    for i, p in enumerate(patients_list,1):
        print(f"\nPatient {i}:")
        for k,v in p.items():
            print(f"{k.capitalize()}: {v}")
        print("-"*30)
def save_json(file, data):
    with open(file, 'w') as f:
        json.dump(data, f, indent=4)

def load_json(file):
    try:
        with open(file, 'r') as f:
            content = f.read().strip()
            if not content:
                return []
            return json.loads(content)
    except FileNotFoundError:
        return []

def log_action(action):
    timestamp = datetime.now().isoformat(sep=' ')
    with open("data/ems_log.txt", 'a') as f:
        f.write(f"[{timestamp}] {action}\n")

def load_patients():
    global patients
    loaded = load_json(PATIENT_FILE)
    if loaded:
        patients = loaded

def save_patients():
    save_json(PATIENT_FILE, patients)

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
    if not patients:
        print("No patients found.")
        input("Press Enter to continue...")
        return
    for i, p in enumerate(patients,1):
        print(f"\nPatient {i}:")
        for k,v in p.items():
            print(f"{k.capitalize()}: {v}")
        print("-"*30)
    input("Press Enter to continue...")

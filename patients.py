# patients.py
import json

PATIENT_FILE = "patients.json"

patients = [
    {'name': 'John Doe', 'age': 45, 'allergies': ['Peanuts', 'Penicillin'], 'condition': 'Diabetic', 'location': 'Winter Haven'},
    {'name': 'Jane Smith', 'age': 30, 'allergies': [], 'condition': 'Asthma', 'location': 'Winter Haven'},
    {'name': 'Mike Brown', 'age': 60, 'allergies': ['Latex'], 'condition': 'Hypertension', 'location': 'Lake Alfred'}
]

# ---------------------------
# --- Helper Functions
# ---------------------------
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

# ---------------------------
# --- Load & Save Patients
# ---------------------------
def load_patients():
    global patients
    loaded = load_json(PATIENT_FILE)
    if loaded:
        patients = loaded

def save_patients():
    save_json(PATIENT_FILE, patients)

# ---------------------------
# --- Patient Functions
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
    print(f"Patient {name} added successfully!")
    input("Press Enter to continue...")

def display_patients(patients_list):
    if not patients_list:
        print("No patients found.")
        return
    for i, patient in enumerate(patients_list, 1):
        print(f"\nPatient {i}:")
        for key, value in patient.items():
            print(f"{key.capitalize()}: {value}")
        print("-" * 30)
    input("Press Enter to continue...")

def view_patients():
    display_patients(patients)

# patients.py (add to existing module)

def filter_by_allergy(patients_list, allergy):
    allergy = allergy.strip().lower()
    return [p for p in patients_list if any(allergy == a.lower() for a in p.get('allergies', []))]

def filter_by_condition(patients_list, condition):
    condition = condition.strip().lower()
    return [p for p in patients_list if condition in p.get('condition', '').lower()]

def filter_by_age_range(patients_list, min_age, max_age):
    return [p for p in patients_list if min_age <= p.get('age', 0) <= max_age]

def filter_by_location(patients_list, location):
    location = location.strip().lower()
    return [p for p in patients_list if location == p.get('location', '').lower()]

def filter_by_name(patients_list, name):
    name = name.strip().lower()
    return [p for p in patients_list if name in p.get('name', '').lower()]

def filter_by_location(patients_list, location):
    location = location.strip().lower()
    return [p for p in patients_list if location == p.get('location', '').lower()]
import json

def load_json(file):
    try:
        with open(file, 'r') as f:
            content = f.read().strip()
            if not content:  # File is empty
                return []
            return json.loads(content)
    except FileNotFoundError:
        return []

def save_data():
    with open("patients.json", "w") as f:
        json.dump(patients, f)

def load_data():
    global patients
    try:
        with open("patients.json", "r") as f:
            patients = json.load(f)
    except FileNotFoundError:
        patients = []


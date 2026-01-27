# patients_filter.py

def filter_by_allergy(patients, allergy):
    """Return a list of patients who have the specified allergy."""
    allergy = allergy.strip().lower()
    filtered = []
    for patient in patients:
        if any(allergy == a.lower() for a in patient.get('allergies', [])):
            filtered.append(patient)
    return filtered

def filter_by_name(patients, name):
    """Return a list of patients whose name matches the specified name."""
    name = name.strip().lower()
    filtered = []
    for patient in patients:
        if name in patient.get('name', '').lower():
            filtered.append(patient)
    return filtered
def filter_by_condition(patients, condition):
    """Return a list of patients who have the specified medical condition."""
    condition = condition.strip().lower()
    filtered = []
    for patient in patients:
        if condition in patient.get('condition', '').lower():
            filtered.append(patient)
    return filtered

def filter_by_age_range(patients, min_age, max_age):
    """Return a list of patients whose age is within min_age and max_age."""
    filtered = []
    for patient in patients:
        age = patient.get('age', 0)
        if min_age <= age <= max_age:
            filtered.append(patient)
    return filtered

def display_patients(patients):
    """Display patient info in a readable format."""
    if not patients:
        print("No patients found.")
        return
    for i, patient in enumerate(patients, 1):
        print(f"\nPatient {i}:")
        for key, value in patient.items():
            print(f"{key.capitalize()}: {value}")
        print("-" * 30)

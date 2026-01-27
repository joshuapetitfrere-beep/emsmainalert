# notifications.py
from patients import patients
from database import responders, log_action, save_json, load_json, display_patients, responders

def notify_relevant_patients(alert, patients, responders):
    allergy_keywords = ['Peanuts', 'Latex', 'Penicillin']
    condition_keywords = ['Diabetic', 'Asthma', 'Hypertension']

    relevant_patients = []

    for keyword in allergy_keywords:
        if keyword.lower() in alert['description'].lower():
            relevant_patients.extend([p for p in patients if keyword in p.get('allergies', [])])

    for keyword in condition_keywords:
        if keyword.lower() in alert['description'].lower():
            relevant_patients.extend([p for p in patients if keyword.lower() in p.get('condition', '').lower()])

    # Remove duplicates
    relevant_patients = [dict(t) for t in {tuple(p.items()) for p in relevant_patients}]

    print(f"=== Alert Notification ===")
    print(f"Type: {alert['type']}, Location: {alert['location']}, Severity: {alert['severity']}")
    print(f"Description: {alert['description']}\n")

    if relevant_patients:
        print("Relevant patients identified:")
        for i, p in enumerate(relevant_patients, 1):
            print(f"{i}. {p['name']} ({p['age']} yrs)")
    else:
        print("No relevant patients found.")

    # Dispatch first available responder
    for responder in responders:
        if responder['available']:
            print(f"\nDispatching responder: {responder['name']}")
            responder['available'] = False
            break
    else:
        print("\nNo responders available!")
    input("Press Enter to continue...")

# notifications.py (modify notify_relevant_patients)

def notify_relevant_patients(alert, patients, responders):
    from patients import filter_by_allergy, filter_by_condition

    allergy_keywords = ['Peanuts', 'Latex', 'Penicillin']
    condition_keywords = ['Diabetic', 'Asthma', 'Hypertension']

    relevant_patients = []

    for keyword in allergy_keywords:
        if keyword.lower() in alert['description'].lower():
            relevant_patients.extend(filter_by_allergy(patients, keyword))

    for keyword in condition_keywords:
        if keyword.lower() in alert['description'].lower():
            relevant_patients.extend(filter_by_condition(patients, keyword))

    # Remove duplicates
    relevant_patients = [dict(t) for t in {tuple(p.items()) for p in relevant_patients}]

    print(f"\n=== Alert Notification ===")
    print(f"Type: {alert['type']}, Location: {alert['location']}, Severity: {alert['severity']}")
    print(f"Description: {alert['description']}\n")

    if relevant_patients:
        print("Relevant patients identified:")
        for i, p in enumerate(relevant_patients, 1):
            print(f"{i}. {p['name']} ({p['age']} yrs)")
    else:
        print("No relevant patients found.")

    # Dispatch first available responder
    for responder in responders:
        if responder['available']:
            print(f"\nDispatching responder: {responder['name']}")
            responder['available'] = False
            break
    else:
        print("\nNo responders available!")
    input("Press Enter to continue...")

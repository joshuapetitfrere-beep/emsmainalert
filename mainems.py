# mainems.py
from alerts import add_alert, load_alerts, view_alerts
from database import add_patient, load_patients, patients, view_patients
from patients import filter_by_allergy, filter_by_condition, filter_by_age_range, display_patients, filter_by_name, filter_by_location
from database import responders 
import requests 

# Sample responders
responders = [
    {'name': 'Alice', 'available': True},
    {'name': 'Bob', 'available': True},
    {'name': 'Charlie', 'available': True}
]

# ---------------------------
# --- Main Menu
# ---------------------------
def main_menu():
    load_patients()
    while True:
        print("\n=== EMS Priority Queue Simulator ===")
        print("1. Add Alert")
        print("2. View Active Alerts")
        print("3. View All Alerts")
        print("4. Dispatch Next Alert (Priority Queue)")
        print("5. Add Patient")
        print("6. View Patients")
        print("7. Filter Patients")
        print("8. Exit")

        choice = input("Enter your choice: ")
        if choice == '1':
            add_alert(patients, responders)
        elif choice == '2':
            view_alerts(only_active=True)
        elif choice == '3':
            view_alerts(only_active=False)
        elif choice == '4':
            from alerts import dispatch_next_alert
            dispatch_next_alert(patients, responders)
        elif choice == '5':
            add_patient()
        elif choice == '6':
            view_patients()
        elif choice == '7':
            filter_menu()
        elif choice == '8':
            print("Exiting program. Goodbye!")
            break
        else:
            print("Invalid choice. Please try again.")
            input("Press Enter to continue...")

def load_alerts():
    from alerts import load_alerts as la
    la()
def filter_menu():
    print("\n--- Patient Filtering ---")
    print("1. By Allergy")
    print("2. By Condition")
    print("3. By Age Range")
    print("4. By Name")
    print("5. By Location")
    
    choice = input("Enter your choice: ")
    if choice == '1':
        allergy = input("Enter allergy to filter: ")
        display_patients(filter_by_allergy(patients, allergy))
    elif choice == '2':
        condition = input("Enter condition to filter: ")
        display_patients(filter_by_condition(patients, condition))
    elif choice == '3':
        min_age = int(input("Enter minimum age: "))
        max_age = int(input("Enter maximum age: "))
        display_patients(filter_by_age_range(patients, min_age, max_age))
    elif choice == '4':
        name = input("Enter name to filter: ")
        display_patients(filter_by_name(patients, name))
    elif choice == '5': 
        location = input("Enter location to filter: ")
        display_patients(filter_by_location(patients, location))
    else:
        print("Invalid choice.")
# ---------------------------
# --- Run Program
# ---------------------------
if __name__ == "__main__":
    load_alerts()
    load_patients()
    main_menu()

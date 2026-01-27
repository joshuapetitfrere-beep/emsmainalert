patient = []
import os 
import sys


choice = input ("Enter your choice: ")
print("You chose:", choice) 

def add_patient(name, age, condition, phone):
    patient.append
    {
        'name': name,
        'age': age,
        'condition': condition
        
    }
    return "Patient added successfully."

[
    "name: Joshua ",
    "age: 29",
    "condition: Vision problems",
    "phone: 123-456-7890"
]

def add_patient(): 
    #allows you to add a new patieint to the system 

    pass 

def view_patients(): 
    # allows you to see all patients in the system 

    pass 

def update_patient(): 
    # allows you to update patient information 
    pass 

def delete_patient(): 
    # allows you to remove a patient from the system 
    pass 

def main_menu(): 
    while True: 
        print("\nPatient DAtabase")
        print("1. Add Patient")
        print("2. View Patients")
        print("3. Update Patient")
        print("4. Delete Patient")
        print("5. Exit")

    
        choice = input
        if choice == '1':
            add_patient()
        elif choice == '2':
            view_patients()
        elif choice == '3':
            update_patient()
        elif choice == '4':
            delete_patient()
        elif choice == '5':
            print("Exiting the program.")
            break
        else: 
            print("Invalid choice. Please try again.")
            break 
            

if __name__ == "__main__":
    main_menu()

input("Press Enter to continue...") 
print("Patient added successfully.") 
input("Press Enter to continue...")
print("-" * 30)  # prints a line of 30 dashes
print("Patient List")
print("-" * 30)



# user input closes the program 
input("Press Esc to exit... ")

os.system('cls' if os.name == 'nt' else 'clear')

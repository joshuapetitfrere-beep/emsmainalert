from persistence import save_json, load_json, log_action
from config import RESPONDER_FILE, RESPONDER_STATUS, RESPONDER_TYPES
from datetime import datetime

responders = []

def load_responders():
    global responders
    loaded = load_json(RESPONDER_FILE)
    responders = loaded if loaded else []

def save_responders():
    save_json(RESPONDER_FILE, responders)

def dispatch_responder(alert):
    available_units = [r for r in responders if r['status']=='In Station']
    if not available_units:
        print("No responders available!")
        return
    # Assign first available responder
    unit = available_units[0]
    unit['status'] = 'Responding'
    unit['current_alert'] = alert['type'] + " @ " + alert['location']
    unit['timestamp'] = datetime.now().isoformat(sep=' ')
    alert['assigned_units'].append(unit['unit_number'])
    save_responders()
    print(f"\nDispatching responder {unit['name']} ({unit['unit_number']})")
    log_action(f"Responder {unit['name']} dispatched to alert at {alert['location']}")

def clear_alert_responders(alert):
    for unit_num in alert['assigned_units']:
        for r in responders:
            if r['unit_number']==unit_num:
                r['status'] = 'In Station'
                r['current_alert'] = None
                r['timestamp'] = datetime.now().isoformat(sep=' ')
                log_action(f"Responder {r['name']} cleared and available")
    alert['assigned_units'] = []
    save_responders()

def responder_dashboard():
    if not responders:
        print("No responders in database.")
        input("Press Enter to continue...")
        return
    print("\n=== Responder Dashboard ===")
    for r in responders:
        print(f"\nName: {r['name']}")
        print(f"Unit: {r['unit_number']}")
        print(f"Type: {r['type']}")
        print(f"Status: {r['status']}")
        print(f"Current Alert: {r['current_alert']}")
        print(f"Last Updated: {r['timestamp']}")
        print("-"*40)
    input("Press Enter to continue...")


if __name__ == "__main__":
    responders 
    load_responders
    dispatch_responder
    save_responders
    clear_alert_responders
    responder_dashboard
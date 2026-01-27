import json
from datetime import datetime
from config import LOG_FILE

def save_json(file, data):
    with open(file, 'w') as f:
        json.dump(data, f, default=str, indent=2)

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
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {action}\n")

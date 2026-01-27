from datetime import datetime, timezone
from test_alert_engine import (
    Incident,
    User,
    AlertEngine,
    AlertState
)
from test_alert_engine import AlertDecision, evaluate
# --- Setup ---
state = AlertState()
engine = AlertEngine(state)

now = datetime.now(timezone.utc)

incident = Incident(
    id="incident-123",
    latitude=27.9506,
    longitude=-82.4572,
    created_at=now,
    incident_type="CARDIAC_ARREST"
)

user = User(
    id="user-1",
    latitude=27.9507,
    longitude=-82.4571,
    last_alerted_at=None,
    is_available=True,
    speed_mph=0
)

# --- Evaluate ---
decision = engine.evaluate(incident, user, now)
print(decision)

# --- Mark sent ---
if decision.allow:
    state.mark_alerted(decision.incident_id, decision.user_id)

# --- Re-run to test duplicate protection ---
decision2 = engine.evaluate(incident, user, now)
print(decision2)

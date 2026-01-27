import React, { useEffect, useState } from "react";

/* =========================
   EMS PRIORITY CONSTANTS
========================= */

const PRIORITY_WEIGHTS = {
  HIGH: 30,
  MED: 20,
  LOW: 10,
};

/* =========================
   MOCK ALERT DATA
========================= */

const MOCK_ALERTS = [
  {
    id: "alert_001",
    location: "I-4 EB MM 42",
    priority: "HIGH",
    units_notified: 6,
    units_acknowledged: 3,
    created_at: Date.now() - 420000,
  },
  {
    id: "alert_002",
    location: "US-98 & Main St",
    priority: "MED",
    units_notified: 4,
    units_acknowledged: 4,
    created_at: Date.now() - 180000,
  },
  {
    id: "alert_003",
    location: "SR-60 WB near Airport",
    priority: "LOW",
    units_notified: 2,
    units_acknowledged: 1,
    created_at: Date.now() - 600000,
  },
];

/* =========================
   PRIORITY CALCULATION
========================= */

function calculateAlertPriority(alert) {
  const base = PRIORITY_WEIGHTS[alert.priority] || 0;
  const unack = alert.units_notified - alert.units_acknowledged;
  const timeWaiting = Math.floor((Date.now() - alert.created_at) / 60000);

  return base + unack * 5 + timeWaiting;
}

/* =========================
   VISUAL PRIORITY CLASS
========================= */

function getPriorityClass(priority) {
  if (priority === "HIGH") return "priority-high";
  if (priority === "MED") return "priority-med";
  return "priority-low";
}

/* =========================
   MAIN COMPONENT
========================= */

export default function AlertQueue() {
  const [queue, setQueue] = useState([]);

  /* Initial load */
  useEffect(() => {
    const sorted = [...MOCK_ALERTS].sort(
      (a, b) => calculateAlertPriority(b) - calculateAlertPriority(a)
    );
    setQueue(sorted);
  }, []);

  /* Auto-resort every 10 seconds */
  useEffect(() => {
    const interval = setInterval(() => {
      setQueue((prev) =>
        [...prev].sort(
          (a, b) => calculateAlertPriority(b) - calculateAlertPriority(a)
        )
      );
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  /* =========================
     ACKNOWLEDGE ALERT
     (Backend-ready)
  ========================= */

  function acknowledgeAlert(alertId) {
    // 🔌 BACKEND HOOK (replace later)
    /*
    fetch("/api/alerts/ack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, unit_id: "UNIT_12" })
    });
    */

    // Front-end state update
    setQueue((prev) =>
      prev.map((alert) =>
        alert.id === alertId
          ? {
              ...alert,
              units_acknowledged: Math.min(
                alert.units_acknowledged + 1,
                alert.units_notified
              ),
            }
          : alert
      )
    );
  }

  return (
    <div className="queue-container">
      <style>{`
        .queue-container {
          font-family: system-ui, sans-serif;
          padding: 12px;
          background: #0f172a;
          color: #e5e7eb;
          min-height: 100vh;
        }

        h2 {
          margin-bottom: 10px;
        }

        .queue-table {
          width: 100%;
          border-collapse: collapse;
        }

        .queue-table th {
          text-align: left;
          font-size: 0.85rem;
          color: #94a3b8;
          padding-bottom: 6px;
        }

        .queue-row {
          background: #020617;
          border-bottom: 1px solid #1e293b;
        }

        .queue-cell {
          padding: 10px 8px;
          font-size: 0.95rem;
        }

        .priority-high {
          border-left: 5px solid #dc2626;
          animation: pulse 2s infinite;
        }

        .priority-med {
          border-left: 5px solid #f59e0b;
        }

        .priority-low {
          border-left: 5px solid #16a34a;
        }

        .status-unack {
          font-weight: 700;
          color: #fca5a5;
        }

        .status-ack {
          color: #86efac;
        }

        .ack-btn {
          padding: 6px 10px;
          background: #1e40af;
          border: none;
          border-radius: 4px;
          color: white;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .ack-btn:disabled {
          background: #334155;
          cursor: not-allowed;
        }

        @keyframes pulse {
          0% { background-color: rgba(220, 38, 38, 0.05); }
          50% { background-color: rgba(220, 38, 38, 0.12); }
          100% { background-color: rgba(220, 38, 38, 0.05); }
        }
      `}</style>

      <h2>Active EMS Alerts</h2>

      <table className="queue-table">
        <thead>
          <tr>
            <th>Location</th>
            <th>Priority</th>
            <th>Ack</th>
            <th>Time</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {queue.map((alert) => {
            const timeMin = Math.floor(
              (Date.now() - alert.created_at) / 60000
            );

            const fullyAcked =
              alert.units_acknowledged >= alert.units_notified;

            return (
              <tr
                key={alert.id}
                className={`queue-row ${getPriorityClass(alert.priority)}`}
              >
                <td className="queue-cell">{alert.location}</td>
                <td className="queue-cell">{alert.priority}</td>
                <td className="queue-cell">
                  <span
                    className={
                      fullyAcked ? "status-ack" : "status-unack"
                    }
                  >
                    {alert.units_acknowledged}/{alert.units_notified}
                  </span>
                </td>
                <td className="queue-cell">{timeMin} min</td>
                <td className="queue-cell">
                  <button
                    className="ack-btn"
                    disabled={fullyAcked}
                    onClick={() => acknowledgeAlert(alert.id)}
                  >
                    ACK
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, Button } from "react-native";

// Function to send GPS updates to the backend
const sendLocation = (ws, lat, lon) => {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "update", lat, lon }));
  }
};

export default function App() {
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertData, setAlertData] = useState(null);
  const [socket, setSocket] = useState(null);

  // NEW STATES
  const [mode, setMode] = useState("civilian"); // civilian or responder
  const [alertMessage, setAlertMessage] = useState("Ambulance approaching");

  useEffect(() => {
    const ws = new WebSocket("ws://192.168.12.228:7824/ws");

    ws.onopen = () => {
      console.log("Connected to EMS server");
      sendLocation(ws, 27.95, -81.9);
    };

    ws.onmessage = (event) => {
      console.log("Alert received:", event.data);
      try {
        const alert = JSON.parse(event.data);

        if (alert.type === "ems_alert") {
          setAlertData(alert);
          setAlertVisible(true);
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onerror = (err) => {
      console.log("WebSocket error:", err.message);
    };

    ws.onclose = () => {
      console.log("Disconnected from EMS server");
    };

    setSocket(ws);

    const interval = setInterval(() => {
      sendLocation(ws, 27.95, -81.9);
    }, 5000);

    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, []);

  const acknowledgeAlert = () => {
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "ACK" }));
    }
    setAlertVisible(false);
    setAlertData(null);
  };

  // NEW: responder alert sender
  const sendResponderAlert = () => {
    if (socket && socket.readyState === 1) {
      socket.send(
        JSON.stringify({
          type: "ems",
          lat: 27.95,
          lon: -81.9,
          alert_message: alertMessage
        })
      );
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>

      {/* MODE SWITCH */}
      <View style={{ flexDirection: "row", marginBottom: 20 }}>
        <Button title="Civilian Mode" onPress={() => setMode("civilian")} />
        <View style={{ width: 10 }} />
        <Button title="Responder Mode" onPress={() => setMode("responder")} />
      </View>

      {/* CIVILIAN VIEW */}
      {mode === "civilian" && (
        <>
          {alertVisible && alertData ? (
            <>
              <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>
                🚑 {alertData.message}
              </Text>

              <TouchableOpacity
                onPress={acknowledgeAlert}
                style={{
                  backgroundColor: "red",
                  padding: 15,
                  borderRadius: 8
                }}
              >
                <Text style={{ color: "white", fontWeight: "bold" }}>
                  ACKNOWLEDGE
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={{ fontSize: 18 }}>No Active Alerts</Text>
          )}
        </>
      )}

      {/* RESPONDER DASHBOARD */}
      {mode === "responder" && (
        <>
          <Text style={{ fontSize: 22, fontWeight: "bold", marginBottom: 20 }}>
            EMS Responder Dashboard
          </Text>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: "#333",
              width: "80%",
              padding: 10,
              marginBottom: 20
            }}
            value={alertMessage}
            onChangeText={setAlertMessage}
          />

          <Button title="Broadcast Alert" onPress={sendResponderAlert} />
        </>
      )}

    </View>
  );
}
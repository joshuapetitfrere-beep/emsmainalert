// App.js
import React, { useEffect, useState } from "react";
import { View, Text, Button, StyleSheet, Alert } from "react-native";
import * as Location from "expo-location";

export default function App() {
  const [ws, setWs] = useState(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [location, setLocation] = useState(null);

  // Connect to WebSocket
  useEffect(() => {
    const socket = new WebSocket("ws://192.168.12.228:8000/ws");
    socket.onopen = () => console.log("Connected to server");
    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.alert) {
        setAlertMsg(data.alert);
        Alert.alert("EMERGENCY ALERT", data.alert);
      }
    };
    setWs(socket);
    return () => socket.close();
  }, []);

  // Update GPS every 5 seconds
  useEffect(() => {
    let interval;
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      interval = setInterval(async () => {
        let loc = await Location.getCurrentPositionAsync({});
        setLocation(loc.coords);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "update", lat: loc.coords.latitude, lon: loc.coords.longitude }));
        }
      }, 5000);
    })();
    return () => clearInterval(interval);
  }, [ws]);

  // Acknowledge alert
  const acknowledgeAlert = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ACK" }));
      setAlertMsg("");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>EMS Alert App</Text>
      {alertMsg ? (
        <View style={styles.alertBox}>
          <Text style={styles.alertText}>{alertMsg}</Text>
          <Button title="Acknowledge" onPress={acknowledgeAlert} />
        </View>
      ) : (
        <Text>No alerts</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, marginBottom: 20 },
  alertBox: { backgroundColor: "red", padding: 20, borderRadius: 10 },
  alertText: { color: "white", fontSize: 18, marginBottom: 10 },
});
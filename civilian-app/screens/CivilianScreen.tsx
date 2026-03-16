import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Vibration, SafeAreaView,
} from "react-native";
import * as Location from "expo-location";
import ActiveAlertsScreen from "./ActiveAlertsScreen";

const SERVER_WS = "wss://emsmainalert-production.up.railway.app/ws";

interface EMSAlert {
  alert_id: string;
  ems_unit: string;
  message: string;
}

interface Props {
  onExit: () => void;
}

export default function CivilianScreen({ onExit }: Props) {
  const [activeAlert, setActiveAlert]       = useState<EMSAlert | null>(null);
  const [wsStatus, setWsStatus]             = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [locationStatus, setLocationStatus] = useState("Requesting...");
  const [alertCount, setAlertCount]         = useState(0);
  const [showAlerts, setShowAlerts]         = useState(false);

  const wsRef            = useRef<WebSocket | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestLocationPermission();
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []);

  function connectWebSocket() {
    setWsStatus("connecting");
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;
    ws.onopen = () => setWsStatus("connected");
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ems_alert") triggerAlert(data as EMSAlert);
      } catch (e) {}
    };
    ws.onclose = () => {
      setWsStatus("disconnected");
      reconnectTimeout.current = setTimeout(connectWebSocket, 5000);
    };
  }

  async function requestLocationPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setLocationStatus("Permission denied"); return; }
    setLocationStatus("Tracking active ✓");
    locationInterval.current = setInterval(async () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        wsRef.current.send(JSON.stringify({ type: "update", lat: loc.coords.latitude, lon: loc.coords.longitude }));
      } catch (e) {}
    }, 10000);
  }

  function triggerAlert(data: EMSAlert) {
    setActiveAlert(data);
    setAlertCount((c) => c + 1);
    Vibration.vibrate([500, 200, 500, 200, 500, 200, 500]);
  }

  function acknowledgeAlert() {
    if (!activeAlert) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "ACK", alert_id: activeAlert.alert_id }));
    }
    Vibration.cancel();
    setActiveAlert(null);
  }

  if (showAlerts) return <ActiveAlertsScreen onBack={() => setShowAlerts(false)} />;

  if (activeAlert) {
    return (
      <View style={styles.alertOverlay}>
        <Text style={styles.alertIcon}>🚨</Text>
        <Text style={styles.alertTitle}>EMS VEHICLE{"\n"}APPROACHING</Text>
        <Text style={styles.alertMessage}>{activeAlert.message}</Text>
        <Text style={styles.alertUnit}>Unit: {activeAlert.ems_unit}</Text>
        <Text style={styles.alertInstruction}>
          Pull to the right and stop completely.{"\n"}Do not block intersections.
        </Text>
        <TouchableOpacity style={styles.ackButton} onPress={acknowledgeAlert}>
          <Text style={styles.ackButtonText}>✓  I'M PULLING OVER</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={[styles.dot, {
          backgroundColor:
            wsStatus === "connected" ? "#22c55e" :
            wsStatus === "connecting" ? "#f59e0b" : "#ef4444"
        }]} />
      </View>

      <View style={styles.inner}>
        <Text style={styles.pageTitle}>Civilian Mode</Text>
        <Text style={styles.pageSubtitle}>Polk County Driver Safety</Text>

        <View style={styles.card}>
          <Row label="Server"       value={wsStatus === "connected" ? "Live ✓" : wsStatus === "connecting" ? "Connecting..." : "Reconnecting..."} ok={wsStatus === "connected"} />
          <Row label="Location"     value={locationStatus} ok={locationStatus.includes("✓")} />
          <Row label="Alerts Today" value={`${alertCount}`} ok={true} />
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            🛡️  You will be alerted when an EMS vehicle is within 2 miles. Keep this app open while driving.
          </Text>
        </View>

        <TouchableOpacity style={styles.alertsBtn} onPress={() => setShowAlerts(true)}>
          <Text style={styles.alertsBtnText}>🗺  View Active Alerts</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: ok ? "#22c55e" : "#f59e0b" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#0f172a" },
  header:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  backBtn:          { padding: 4 },
  backText:         { color: "#60a5fa", fontSize: 15, fontWeight: "600" },
  dot:              { width: 10, height: 10, borderRadius: 5 },
  inner:            { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  pageTitle:        { fontSize: 32, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  pageSubtitle:     { fontSize: 13, color: "#475569", marginBottom: 32 },
  card:             { backgroundColor: "#1e293b", borderRadius: 16, padding: 20, gap: 18, marginBottom: 20 },
  row:              { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel:         { fontSize: 15, color: "#94a3b8" },
  rowValue:         { fontSize: 14, fontWeight: "700" },
  infoBox:          { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: "#3b82f6", marginBottom: 16 },
  infoText:         { fontSize: 14, color: "#94a3b8", lineHeight: 22 },
  alertsBtn:        { backgroundColor: "#1a0a0a", borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#7f1d1d" },
  alertsBtnText:    { color: "#ef4444", fontWeight: "700", fontSize: 15 },
  alertOverlay:     { flex: 1, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", padding: 32 },
  alertIcon:        { fontSize: 80, marginBottom: 20 },
  alertTitle:       { fontSize: 34, fontWeight: "900", color: "#fff", textAlign: "center", letterSpacing: 1, lineHeight: 40, marginBottom: 24 },
  alertMessage:     { fontSize: 18, color: "#fecaca", textAlign: "center", lineHeight: 26, marginBottom: 8 },
  alertUnit:        { fontSize: 13, color: "#fca5a5", marginBottom: 32 },
  alertInstruction: { fontSize: 14, color: "#fee2e2", textAlign: "center", lineHeight: 22, marginBottom: 48 },
  ackButton:        { backgroundColor: "#fff", borderRadius: 16, paddingVertical: 20, paddingHorizontal: 40, width: "100%", alignItems: "center" },
  ackButtonText:    { color: "#dc2626", fontSize: 18, fontWeight: "900" },
});


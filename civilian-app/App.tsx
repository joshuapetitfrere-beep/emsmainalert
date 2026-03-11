/**
 * CivilianApp.tsx
 * EMS Alert — Civilian Driver Mobile App
 *
 * - Connects to server via WebSocket
 * - Sends GPS location every 10 seconds for geofencing
 * - Registers Expo push token so alerts arrive even when app is backgrounded
 * - Full-screen alert with vibration on incoming EMS alert
 * - Acknowledge button sends ACK back to server with alert ID
 */

import React, { useState, useEffect, useRef } from "react"; 
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Platform,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import * as Device from "expo-device";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SERVER_WS   = "wss://emsmainalert-production.up.railway.app/ws";
const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";

// ─── Push Notification Handler ────────────────────────────────────────────────


// ─── Android Notification Channel ────────────────────────────────────────────


// ─── Types ────────────────────────────────────────────────────────────────────
interface EMSAlert {
  alert_id: string;
  ems_unit: string;
  message: string;
  lat?: number;
  lon?: number;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CivilianApp() {
  const [pushToken, setPushToken]     = useState<string | null>(null);
  const [activeAlert, setActiveAlert] = useState<EMSAlert | null>(null);
  const [wsStatus, setWsStatus]       = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [locationStatus, setLocationStatus] = useState("Requesting...");
  const [alertCount, setAlertCount]   = useState(0);

  const wsRef             = useRef<WebSocket | null>(null);
  const locationInterval  = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifListener     = useRef<any>();
  const notifResponse     = useRef<any>();

  useEffect(() => {
    
    requestLocationPermission();
    connectWebSocket();

    // Foreground push notifications
   
    // User taps a background push notification
    

    return () => {
      wsRef.current?.close();
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
  
    };
  }, []);

  // ── WebSocket ───────────────────────────────────────────────────────────────
  function connectWebSocket() {
    setWsStatus("connecting");
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      console.log("✅ WebSocket connected");
      // Register push token so server can reach us when backgrounded
      if (pushToken) {
        ws.send(JSON.stringify({ type: "register_token", token: pushToken }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ems_alert") triggerAlert(data as EMSAlert);
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      // Auto-reconnect after 5 seconds
      reconnectTimeout.current = setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (e) => console.error("WS error:", e);
  }

  // ── Push Notifications ──────────────────────────────────────────────────────
  

  // ── Location ────────────────────────────────────────────────────────────────
  async function requestLocationPermission() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("Permission denied");
      return;
    }
    setLocationStatus("Tracking active ✓");

    locationInterval.current = setInterval(async () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        wsRef.current.send(JSON.stringify({
          type: "update",
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
        }));
      } catch (e) {
        console.error("Location error:", e);
      }
    }, 10000);
  }

  // ── Alert ───────────────────────────────────────────────────────────────────
  function triggerAlert(data: EMSAlert) {
    setActiveAlert(data);
    setAlertCount((c) => c + 1);
    Vibration.vibrate([500, 200, 500, 200, 500, 200, 500]);
  }

  function acknowledgeAlert() {
    if (!activeAlert) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "ACK",
        alert_id: activeAlert.alert_id,
      }));
    }
    Vibration.cancel();
    setActiveAlert(null);
  }

  // ── Alert Screen ────────────────────────────────────────────────────────────
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

  // ── Standby Screen ──────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>EMS Alert</Text>
        <View style={[styles.dot, {
          backgroundColor:
            wsStatus === "connected" ? "#22c55e" :
            wsStatus === "connecting" ? "#f59e0b" : "#ef4444"
        }]} />
      </View>
      <Text style={styles.subHeader}>Polk County Driver Safety</Text>

      <View style={styles.card}>
        <StatusRow label="Server"        value={wsStatus === "connected" ? "Live ✓" : wsStatus === "connecting" ? "Connecting..." : "Reconnecting..."} ok={wsStatus === "connected"} />
        <StatusRow label="Push Alerts"   value={pushToken ? "Registered ✓" : "Setting up..."}   ok={!!pushToken} />
        <StatusRow label="Location"      value={locationStatus}                                   ok={locationStatus.includes("✓")} />
        <StatusRow label="Alerts Today"  value={`${alertCount}`}                                  ok={true} />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          🛡️  You will be automatically alerted when an EMS vehicle is within 2 miles. Keep this app running in the background while driving.
        </Text>
      </View>

      <Text style={styles.footer}>emsmainalert-production.up.railway.app</Text>
    </View>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: ok ? "#22c55e" : "#f59e0b" }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: "#0f172a", padding: 24, paddingTop: Platform.OS === "ios" ? 64 : 40 },
  headerRow:   { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  header:      { fontSize: 36, fontWeight: "900", color: "#f8fafc" },
  dot:         { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  subHeader:   { fontSize: 14, color: "#475569", marginBottom: 36 },
  card:        { backgroundColor: "#1e293b", borderRadius: 16, padding: 20, gap: 18, marginBottom: 20 },
  row:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabel:    { fontSize: 15, color: "#94a3b8" },
  rowValue:    { fontSize: 14, fontWeight: "700" },
  infoBox:     { backgroundColor: "#1e293b", borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: "#3b82f6" },
  infoText:    { fontSize: 14, color: "#94a3b8", lineHeight: 22 },
  footer:      { position: "absolute", bottom: 32, alignSelf: "center", fontSize: 11, color: "#334155" },

  alertOverlay:    { flex: 1, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", padding: 32 },
  alertIcon:       { fontSize: 80, marginBottom: 20 },
  alertTitle:      { fontSize: 34, fontWeight: "900", color: "#fff", textAlign: "center", letterSpacing: 1, lineHeight: 40, marginBottom: 24 },
  alertMessage:    { fontSize: 18, color: "#fecaca", textAlign: "center", lineHeight: 26, marginBottom: 8 },
  alertUnit:       { fontSize: 13, color: "#fca5a5", marginBottom: 32 },
  alertInstruction:{ fontSize: 14, color: "#fee2e2", textAlign: "center", lineHeight: 22, marginBottom: 48 },
  ackButton:       { backgroundColor: "#fff", borderRadius: 16, paddingVertical: 20, paddingHorizontal: 40, width: "100%", alignItems: "center" },
  ackButtonText:   { color: "#dc2626", fontSize: 18, fontWeight: "900" },
});

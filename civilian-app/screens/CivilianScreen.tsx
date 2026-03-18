import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Vibration, SafeAreaView,
} from "react-native";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import ActiveAlertsScreen from "./ActiveAlertsScreen";

const SERVER_WS = "wss://emsmainalert-production.up.railway.app/ws";

// ── Directional helpers ───────────────────────────────────────────────────────

function calcBearing(prevLat: number, prevLon: number, lat: number, lon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(lon - prevLon);
  const y = Math.sin(dLon) * Math.cos(toRad(lat));
  const x =
    Math.cos(toRad(prevLat)) * Math.sin(toRad(lat)) -
    Math.sin(toRad(prevLat)) * Math.cos(toRad(lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function getRelativeDirection(ambulanceBearing: number, userHeading: number): string {
  const relative = ((ambulanceBearing - userHeading) + 360) % 360;
  if (relative >= 315 || relative < 45)  return "Approaching from ahead";
  if (relative >= 45  && relative < 135) return "Approaching from your right";
  if (relative >= 135 && relative < 225) return "Approaching from behind";
  return "Approaching from your left";
}

function getDirectionArrow(ambulanceBearing: number, userHeading: number): string {
  const relative = ((ambulanceBearing - userHeading) + 360) % 360;
  if (relative >= 315 || relative < 45)  return "⬆️";
  if (relative >= 45  && relative < 135) return "➡️";
  if (relative >= 135 && relative < 225) return "⬇️";
  return "⬅️";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EMSAlert {
  alert_id: string;
  ems_unit: string;
  message: string;
}

interface EMSPosition {
  lat: number;
  lon: number;
  prevLat: number | null;
  prevLon: number | null;
}

interface Props {
  onExit: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CivilianScreen({ onExit }: Props) {
  const [activeAlert, setActiveAlert]       = useState<EMSAlert | null>(null);
  const [wsStatus, setWsStatus]             = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [locationStatus, setLocationStatus] = useState("Requesting...");
  const [alertCount, setAlertCount]         = useState(0);
  const [showAlerts, setShowAlerts]         = useState(false);
  const [directionLabel, setDirectionLabel] = useState<string>("");
  const [directionArrow, setDirectionArrow] = useState<string>("");
  // Pause state
  const [alertPaused, setAlertPaused]       = useState(false);
  const [pauseReason, setPauseReason]       = useState<string>("");

  const wsRef             = useRef<WebSocket | null>(null);
  const locationInterval  = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userHeadingRef    = useRef<number>(0);
  const emsPositionRef    = useRef<EMSPosition | null>(null);
  // Keep a ref to activeAlert so we can restore it on resume
  const activeAlertRef    = useRef<EMSAlert | null>(null);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    requestLocationPermission();
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (locationInterval.current) clearInterval(locationInterval.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []);

  // Compass
  useEffect(() => {
    Magnetometer.setUpdateInterval(500);
    const sub = Magnetometer.addListener(({ x, y }) => {
      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      userHeadingRef.current = angle;
      const pos = emsPositionRef.current;
      if (pos && pos.prevLat !== null && pos.prevLon !== null) {
        const bearing = calcBearing(pos.prevLat, pos.prevLon, pos.lat, pos.lon);
        setDirectionLabel(getRelativeDirection(bearing, angle));
        setDirectionArrow(getDirectionArrow(bearing, angle));
      }
    });
    return () => sub.remove();
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────

  function connectWebSocket() {
    setWsStatus("connecting");
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connected");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "ems_alert") {
          const alert = data as EMSAlert;
          activeAlertRef.current = alert;
          triggerAlert(alert);
          setAlertPaused(false);
          setPauseReason("");
        }

        if (data.type === "ems_position") {
          const { lat, lon, prev_lat, prev_lon } = data;
          emsPositionRef.current = {
            lat, lon,
            prevLat: prev_lat ?? null,
            prevLon: prev_lon ?? null,
          };
          if (prev_lat != null && prev_lon != null) {
            const bearing = calcBearing(prev_lat, prev_lon, lat, lon);
            const heading = userHeadingRef.current;
            setDirectionLabel(getRelativeDirection(bearing, heading));
            setDirectionArrow(getDirectionArrow(bearing, heading));
          }
        }

        if (data.type === "ems_pause") {
          // Suppress the active alert overlay — show standby state instead
          setAlertPaused(true);
          setPauseReason(data.reason || "Alert paused by EMS");
          Vibration.cancel();
        }

        if (data.type === "ems_resume") {
          // Restore the alert overlay
          setAlertPaused(false);
          setPauseReason("");
          // Re-trigger alert if we still have one
          if (activeAlertRef.current) {
            setActiveAlert(activeAlertRef.current);
            Vibration.vibrate([300, 150, 300]);
          }
        }

        if (data.type === "ems_clear") {
          setActiveAlert(null);
          activeAlertRef.current = null;
          setAlertPaused(false);
          setPauseReason("");
          setDirectionLabel("");
          setDirectionArrow("");
          emsPositionRef.current = null;
          Vibration.cancel();
        }

      } catch (e) {}
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      reconnectTimeout.current = setTimeout(connectWebSocket, 5000);
    };
  }

  // ── Location ───────────────────────────────────────────────────────────────

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
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        wsRef.current.send(JSON.stringify({
          type: "update",
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
        }));
      } catch (e) {}
    }, 10000);
  }

  // ── Alert handlers ─────────────────────────────────────────────────────────

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
    setDirectionLabel("");
    setDirectionArrow("");
    emsPositionRef.current = null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (showAlerts) return <ActiveAlertsScreen onBack={() => setShowAlerts(false)} />;

  // Alert paused — show a calm standby screen instead of full red overlay
  if (alertPaused && activeAlertRef.current) {
    return (
      <View style={styles.pausedOverlay}>
        <Text style={styles.pausedIcon}>⏸</Text>
        <Text style={styles.pausedTitle}>ALERT PAUSED</Text>
        <Text style={styles.pausedUnit}>Unit: {activeAlertRef.current.ems_unit}</Text>
        <View style={styles.pausedReasonBox}>
          <Text style={styles.pausedReasonLabel}>REASON</Text>
          <Text style={styles.pausedReasonText}>{pauseReason}</Text>
        </View>
        <Text style={styles.pausedInfo}>
          EMS has temporarily paused this alert.{"\n"}Stay alert — broadcasts may resume.
        </Text>
      </View>
    );
  }

  // Active alert overlay
  if (activeAlert && !alertPaused) {
    return (
      <View style={styles.alertOverlay}>
        <Text style={styles.alertIcon}>🚨</Text>
        <Text style={styles.alertTitle}>EMS VEHICLE{"\n"}APPROACHING</Text>

        {directionLabel ? (
          <View style={styles.directionBox}>
            <Text style={styles.directionArrow}>{directionArrow}</Text>
            <Text style={styles.directionLabel}>{directionLabel}</Text>
          </View>
        ) : null}

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

  // Default civilian home screen
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={[styles.dot, {
          backgroundColor:
            wsStatus === "connected"  ? "#22c55e" :
            wsStatus === "connecting" ? "#f59e0b" : "#ef4444"
        }]} />
      </View>

      <View style={styles.inner}>
        <Text style={styles.pageTitle}>Civilian Mode</Text>
        <Text style={styles.pageSubtitle}>Polk County Driver Safety</Text>

        <View style={styles.card}>
          <Row
            label="Server"
            value={wsStatus === "connected" ? "Live ✓" : wsStatus === "connecting" ? "Connecting..." : "Reconnecting..."}
            ok={wsStatus === "connected"}
          />
          <Row label="Location"     value={locationStatus}  ok={locationStatus.includes("✓")} />
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

// ── Row ───────────────────────────────────────────────────────────────────────

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: ok ? "#22c55e" : "#f59e0b" }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  // Active alert overlay
  alertOverlay:     { flex: 1, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", padding: 32 },
  alertIcon:        { fontSize: 80, marginBottom: 20 },
  alertTitle:       { fontSize: 34, fontWeight: "900", color: "#fff", textAlign: "center", letterSpacing: 1, lineHeight: 40, marginBottom: 24 },
  directionBox:     { backgroundColor: "rgba(0,0,0,0.25)", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  directionArrow:   { fontSize: 36, marginBottom: 4 },
  directionLabel:   { fontSize: 20, fontWeight: "800", color: "#fff", textAlign: "center", letterSpacing: 0.5 },
  alertMessage:     { fontSize: 18, color: "#fecaca", textAlign: "center", lineHeight: 26, marginBottom: 8 },
  alertUnit:        { fontSize: 13, color: "#fca5a5", marginBottom: 32 },
  alertInstruction: { fontSize: 14, color: "#fee2e2", textAlign: "center", lineHeight: 22, marginBottom: 48 },
  ackButton:        { backgroundColor: "#fff", borderRadius: 16, paddingVertical: 20, paddingHorizontal: 40, width: "100%", alignItems: "center" },
  ackButtonText:    { color: "#dc2626", fontSize: 18, fontWeight: "900" },
  // Paused overlay
  pausedOverlay:    { flex: 1, backgroundColor: "#1c1400", alignItems: "center", justifyContent: "center", padding: 32 },
  pausedIcon:       { fontSize: 64, marginBottom: 16 },
  pausedTitle:      { fontSize: 28, fontWeight: "900", color: "#f59e0b", letterSpacing: 2, marginBottom: 8 },
  pausedUnit:       { fontSize: 13, color: "#92400e", marginBottom: 32 },
  pausedReasonBox:  { backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 16, alignItems: "center", width: "100%", marginBottom: 24, borderWidth: 1, borderColor: "#92400e" },
  pausedReasonLabel:{ fontSize: 10, color: "#92400e", fontWeight: "800", letterSpacing: 2, marginBottom: 6 },
  pausedReasonText: { fontSize: 16, color: "#fcd34d", fontWeight: "700", textAlign: "center" },
  pausedInfo:       { fontSize: 14, color: "#78350f", textAlign: "center", lineHeight: 22 },
});
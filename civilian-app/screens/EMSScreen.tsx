import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, SafeAreaView, Alert,
} from "react-native";
import * as Location from "expo-location";

const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";
const SERVER_WS   = "wss://emsmainalert-production.up.railway.app/ws";
const EMS_UNIT_ID = "POLK-RESCUE-1";
const EMS_API_KEY = "62128e4a5ac6411b3b75bca62c7b1f0b2f8b7332fa23281dd200c34818746a43";

const PRESETS = [
  { label: "🔥 Fire",           message: "Fire Rescue responding — emergency vehicle approaching" },
  { label: "🚑 Medical",        message: "Medical Emergency — ambulance approaching, please yield" },
  { label: "🚔 Police",         message: "Police Emergency — law enforcement vehicle approaching" },
  { label: "✅ All Clear",      message: "All Clear — emergency vehicles have cleared the area" },
];

interface ACKEvent {
  alert_id: string;
  time: string;
}

interface Props {
  onExit: () => void;
}

export default function EMSScreen({ onExit }: Props) {
  const [location, setLocation]         = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel] = useState("Acquiring GPS...");
  const [serverStatus, setServerStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending]           = useState(false);
  const [lastAlertId, setLastAlertId]   = useState<string | null>(null);
  const [ackCount, setAckCount]         = useState(0);
  const [alertLog, setAlertLog]         = useState<{ id: string; message: string; ws: number; time: string }[]>([]);

  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    startLocation();
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, []);

  // ── WebSocket for ACK listening ────────────────────────────────────────────
  function connectWebSocket() {
    setServerStatus("connecting");
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;

    ws.onopen = () => {
      setServerStatus("connected");
      // Identify as EMS unit so server doesn't send alerts back to us
      ws.send(JSON.stringify({ type: "ems_unit", unit_id: EMS_UNIT_ID }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ACK") {
          setAckCount((c) => c + 1);
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setServerStatus("disconnected");
      reconnectTimeout.current = setTimeout(connectWebSocket, 5000);
    };
  }

  // ── GPS ────────────────────────────────────────────────────────────────────
  async function startLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setLocationLabel("GPS denied"); return; }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    setLocationLabel(`${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);

    locationInterval.current = setInterval(async () => {
      try {
        const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation({ lat: l.coords.latitude, lon: l.coords.longitude });
        setLocationLabel(`${l.coords.latitude.toFixed(4)}, ${l.coords.longitude.toFixed(4)}`);
      } catch (e) {}
    }, 10000);
  }

  // ── Trigger Alert ──────────────────────────────────────────────────────────
  async function sendAlert(message: string) {
    if (!location) {
      Alert.alert("No GPS", "Waiting for GPS lock. Please wait a moment.");
      return;
    }
    if (serverStatus !== "connected") {
      Alert.alert("Not Connected", "Server is not connected. Please wait.");
      return;
    }

    setSending(true);
    setAckCount(0);

    try {
      const url = `${SERVER_HTTP}/trigger-alert?lat=${location.lat}&lon=${location.lon}&alert_message=${encodeURIComponent(message)}&radius=2.0&ems_unit_id=${EMS_UNIT_ID}&api_key=${EMS_API_KEY}`;
      const resp = await fetch(url, { method: "POST" });
      const data = await resp.json();

      setLastAlertId(data.alert_id);
      setAlertLog((prev) => [{
        id: data.alert_id,
        message,
        ws: data.ws_delivered ?? 0,
        time: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 9)]);

    } catch (e) {
      Alert.alert("Error", "Failed to send alert. Check connection.");
    } finally {
      setSending(false);
    }
  }

  const statusColor =
    serverStatus === "connected" ? "#22c55e" :
    serverStatus === "connecting" ? "#f59e0b" : "#ef4444";

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onExit} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={styles.unitLabel}>{EMS_UNIT_ID}</Text>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Title */}
        <Text style={styles.pageTitle}>EMS Dashboard</Text>
        <Text style={styles.pageSubtitle}>Polk County Rescue Operations</Text>

        {/* Status Row */}
        <View style={styles.statusRow}>
          <StatusPill label="GPS" value={location ? "Active ✓" : locationLabel} ok={!!location} />
          <StatusPill label="Server" value={serverStatus === "connected" ? "Live ✓" : serverStatus} ok={serverStatus === "connected"} />
          <StatusPill label="ACKs" value={`${ackCount}`} ok={ackCount > 0} />
        </View>

        {/* Location */}
        <View style={styles.locBox}>
          <Text style={styles.locLabel}>📍 Current Position</Text>
          <Text style={styles.locValue}>{locationLabel}</Text>
          <Text style={styles.locRadius}>Alert radius: 2.0 miles</Text>
        </View>

        {/* Preset Alerts */}
        <Text style={styles.sectionTitle}>QUICK ALERTS</Text>
        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              style={[styles.presetBtn, sending && styles.presetDisabled]}
              onPress={() => sendAlert(preset.message)}
              disabled={sending}
              activeOpacity={0.75}
            >
              <Text style={styles.presetLabel}>{preset.label}</Text>
              <Text style={styles.presetMessage} numberOfLines={1}>{preset.message}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom Alert */}
        <Text style={styles.sectionTitle}>CUSTOM ALERT</Text>
        <View style={styles.customBox}>
          <TextInput
            style={styles.input}
            placeholder="Type custom alert message..."
            placeholderTextColor="#475569"
            value={customMessage}
            onChangeText={setCustomMessage}
            multiline
            maxLength={200}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!customMessage.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => { sendAlert(customMessage); setCustomMessage(""); }}
            disabled={!customMessage.trim() || sending}
          >
            <Text style={styles.sendBtnText}>{sending ? "Sending..." : "🚨 Send Alert"}</Text>
          </TouchableOpacity>
        </View>

        {/* Alert Log */}
        {alertLog.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>ALERT LOG</Text>
            <View style={styles.logBox}>
              {alertLog.map((a) => (
                <View key={a.id} style={styles.logRow}>
                  <View style={styles.logLeft}>
                    <Text style={styles.logMessage} numberOfLines={1}>{a.message}</Text>
                    <Text style={styles.logId}>{a.id}</Text>
                  </View>
                  <View style={styles.logRight}>
                    <Text style={styles.logTime}>{a.time}</Text>
                    <Text style={styles.logDelivered}>{a.ws} delivered</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function StatusPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color: ok ? "#22c55e" : "#f59e0b" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#0a0a0f" },
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  backBtn:         { padding: 4 },
  backText:        { color: "#ef4444", fontSize: 15, fontWeight: "600" },
  headerRight:     { flexDirection: "row", alignItems: "center", gap: 10 },
  unitLabel:       { color: "#ef4444", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  dot:             { width: 10, height: 10, borderRadius: 5 },
  scroll:          { flex: 1 },
  scrollContent:   { paddingHorizontal: 24, paddingBottom: 48 },
  pageTitle:       { fontSize: 32, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  pageSubtitle:    { fontSize: 13, color: "#4b5563", marginBottom: 24 },
  statusRow:       { flexDirection: "row", gap: 10, marginBottom: 16 },
  pill:            { flex: 1, backgroundColor: "#111827", borderRadius: 12, padding: 12, alignItems: "center" },
  pillLabel:       { fontSize: 10, color: "#6b7280", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  pillValue:       { fontSize: 12, fontWeight: "800" },
  locBox:          { backgroundColor: "#111827", borderRadius: 14, padding: 16, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: "#ef4444" },
  locLabel:        { fontSize: 11, color: "#6b7280", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  locValue:        { fontSize: 15, color: "#f8fafc", fontWeight: "700", marginBottom: 4 },
  locRadius:       { fontSize: 12, color: "#4b5563" },
  sectionTitle:    { fontSize: 11, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  presets:         { gap: 10, marginBottom: 24 },
  presetBtn:       { backgroundColor: "#1a0a0a", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#7f1d1d" },
  presetDisabled:  { opacity: 0.5 },
  presetLabel:     { fontSize: 15, fontWeight: "800", color: "#f8fafc", marginBottom: 4 },
  presetMessage:   { fontSize: 12, color: "#6b7280" },
  customBox:       { backgroundColor: "#111827", borderRadius: 14, padding: 16, marginBottom: 24, gap: 12 },
  input:           { color: "#f8fafc", fontSize: 15, lineHeight: 22, minHeight: 80 },
  sendBtn:         { backgroundColor: "#dc2626", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  sendBtnDisabled: { backgroundColor: "#4b1414", opacity: 0.6 },
  sendBtnText:     { color: "#fff", fontSize: 16, fontWeight: "800" },
  logBox:          { backgroundColor: "#111827", borderRadius: 14, overflow: "hidden" },
  logRow:          { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937" },
  logLeft:         { flex: 1, marginRight: 12 },
  logMessage:      { fontSize: 13, color: "#f8fafc", fontWeight: "600", marginBottom: 2 },
  logId:           { fontSize: 10, color: "#374151" },
  logRight:        { alignItems: "flex-end" },
  logTime:         { fontSize: 12, color: "#6b7280", marginBottom: 2 },
  logDelivered:    { fontSize: 11, color: "#22c55e", fontWeight: "600" },
});

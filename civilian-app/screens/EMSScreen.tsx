import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, SafeAreaView, Alert, Modal,
} from "react-native";
import * as Location from "expo-location";

const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";
const SERVER_WS   = "wss://emsmainalert-production.up.railway.app/ws";
const EMS_UNIT_ID = "POLK-RESCUE-1";
const EMS_API_KEY = "62128e4a5ac6411b3b75bca62c7b1f0b2f8b7332fa23281dd200c34818746a43";

const HOSPITALS = [
  "Lakeland Regional Health",
  "Bartow Regional Medical Center",
  "Winter Haven Hospital",
  "South Florida Baptist Hospital",
  "AdventHealth Heart of Florida",
  "AdventHealth Lake Wales",
];

const ALERT_TYPES = ["Medical", "Trauma", "Cardiac", "Stroke", "Fire", "Police", "Other"];

const MECHANISMS = [
  "MVC — High Speed", "MVC — Rollover", "MVC — Ejection",
  "Fall > 20 ft", "Penetrating — GSW", "Penetrating — Stab",
  "Burns > 20%", "Crush Injury", "Blast / Explosion",
  "Pedestrian vs Vehicle", "Motorcycle Crash", "Other",
];

const PRESETS = [
  { label: "🔥 Fire",      message: "Fire Rescue responding — emergency vehicle approaching",  type: "Fire"    },
  { label: "🚑 Medical",   message: "Medical Emergency — ambulance approaching, please yield", type: "Medical" },
  { label: "🚔 Police",    message: "Police Emergency — law enforcement vehicle approaching",  type: "Police"  },
  { label: "✅ All Clear", message: "All Clear — emergency vehicles have cleared the area",    type: "Other"   },
];

type TransportStatus = "idle" | "responding" | "transporting" | "arrived";

const STATUS_CONFIG: Record<TransportStatus, { label: string; color: string; bg: string }> = {
  idle:         { label: "Idle",         color: "#6b7280", bg: "#1f2937" },
  responding:   { label: "Responding",   color: "#f59e0b", bg: "#2d1f00" },
  transporting: { label: "Transporting", color: "#3b82f6", bg: "#0d1f3c" },
  arrived:      { label: "Arrived",      color: "#22c55e", bg: "#052e16" },
};

interface Props {
  onExit: () => void;
}

export default function EMSScreen({ onExit }: Props) {
  const [location, setLocation]               = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel]     = useState("Acquiring GPS...");
  const [serverStatus, setServerStatus]       = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [customMessage, setCustomMessage]     = useState("");
  const [sending, setSending]                 = useState(false);
  const [ackCount, setAckCount]               = useState(0);
  const [alertLog, setAlertLog]               = useState<{ id: string; message: string; ws: number; time: string }[]>([]);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>("idle");

  // Alert config
  const [selectedHospital, setSelectedHospital]   = useState<string>(HOSPITALS[0]);
  const [selectedAlertType, setSelectedAlertType] = useState<string>("Medical");
  const [numPatients, setNumPatients]             = useState<number>(1);
  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [showTypeModal, setShowTypeModal]         = useState(false);

  // Trauma modal state
  const [showTraumaModal, setShowTraumaModal]     = useState(false);
  const [traumaActivated, setTraumaActivated]     = useState(false);
  const [traumaETA, setTraumaETA]                 = useState<number | null>(null);
  const [traumaMechanism, setTraumaMechanism]     = useState(MECHANISMS[0]);
  const [traumaAge, setTraumaAge]                 = useState("");
  const [traumaSex, setTraumaSex]                 = useState<"M" | "F" | "U">("U");
  const [traumaVitals, setTraumaVitals]           = useState("");
  const [traumaGCS, setTraumaGCS]                 = useState("");
  const [showMechModal, setShowMechModal]         = useState(false);
  const [traumaSending, setTraumaSending]         = useState(false);

  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeAlertRef   = useRef<boolean>(false);

  useEffect(() => {
    startLocation();
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  function connectWebSocket() {
    setServerStatus("connecting");
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;

    ws.onopen = () => {
      setServerStatus("connected");
      ws.send(JSON.stringify({ type: "ems_unit", unit_id: EMS_UNIT_ID }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ACK") setAckCount((c) => c + 1);
        if (data.type === "status_ack" && data.status === "arrived") {
          setTransportStatus("arrived");
          activeAlertRef.current = false;
          setTraumaActivated(false);
        }
        if (data.type === "trauma_ack") {
          setTraumaETA(data.eta_minutes ?? null);
          setTraumaActivated(true);
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

  // ── Transport Status ───────────────────────────────────────────────────────
  function sendStatus(status: TransportStatus) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "ems_status", unit_id: EMS_UNIT_ID, status }));
    setTransportStatus(status);
    if (status === "arrived") { setAckCount(0); activeAlertRef.current = false; setTraumaActivated(false); }
  }

  function handleStatusPress(status: TransportStatus) {
    if (status === "arrived") {
      Alert.alert(
        "Mark as Arrived?",
        "This will automatically end all broadcasted alerts for your unit.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Arrived", style: "destructive", onPress: () => sendStatus("arrived") },
        ]
      );
    } else {
      sendStatus(status);
    }
  }

  // ── Send Alert ─────────────────────────────────────────────────────────────
  async function sendAlert(message: string, alertType?: string) {
    if (!location) { Alert.alert("No GPS", "Waiting for GPS lock."); return; }
    if (serverStatus !== "connected") { Alert.alert("Not Connected", "Server is not connected."); return; }

    setSending(true);
    setAckCount(0);
    setTraumaActivated(false);
    setTraumaETA(null);
    sendStatus("responding");
    activeAlertRef.current = true;

    try {
      const type = alertType ?? selectedAlertType;
      const params = new URLSearchParams({
        lat: String(location.lat),
        lon: String(location.lon),
        alert_message: message,
        radius: "2.0",
        ems_unit_id: EMS_UNIT_ID,
        api_key: EMS_API_KEY,
        destination_hospital: selectedHospital,
        num_patients: String(numPatients),
        alert_type: type,
      });

      const resp = await fetch(`${SERVER_HTTP}/trigger-alert?${params}`, { method: "POST" });
      const data = await resp.json();

      setAlertLog((prev) => [{
        id: data.alert_id,
        message,
        ws: data.ws_delivered ?? 0,
        time: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 9)]);

    } catch (e) {
      Alert.alert("Error", "Failed to send alert. Check connection.");
      activeAlertRef.current = false;
    } finally {
      setSending(false);
    }
  }

  // ── Trauma Activation ──────────────────────────────────────────────────────
  function submitTrauma() {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      Alert.alert("Not Connected", "Cannot send trauma activation — server not connected.");
      return;
    }
    setTraumaSending(true);
    wsRef.current.send(JSON.stringify({
      type: "ems_trauma",
      unit_id: EMS_UNIT_ID,
      mechanism: traumaMechanism,
      num_patients: numPatients,
      age: traumaAge,
      sex: traumaSex,
      vitals: traumaVitals,
      gcs: traumaGCS,
    }));
    setTimeout(() => {
      setTraumaSending(false);
      setShowTraumaModal(false);
    }, 600);
  }

  const statusColor =
    serverStatus === "connected"  ? "#22c55e" :
    serverStatus === "connecting" ? "#f59e0b" : "#ef4444";

  const currentStatusCfg = STATUS_CONFIG[transportStatus];
  const hasActiveAlert = activeAlertRef.current;

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Hospital Picker Modal ── */}
      <Modal visible={showHospitalModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Destination Hospital</Text>
            {HOSPITALS.map((h) => (
              <TouchableOpacity
                key={h}
                style={[styles.modalOption, selectedHospital === h && styles.modalOptionActive]}
                onPress={() => { setSelectedHospital(h); setShowHospitalModal(false); }}
              >
                <Text style={[styles.modalOptionText, selectedHospital === h && styles.modalOptionTextActive]}>{h}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowHospitalModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Alert Type Modal ── */}
      <Modal visible={showTypeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Alert Type</Text>
            {ALERT_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.modalOption, selectedAlertType === t && styles.modalOptionActive]}
                onPress={() => { setSelectedAlertType(t); setShowTypeModal(false); }}
              >
                <Text style={[styles.modalOptionText, selectedAlertType === t && styles.modalOptionTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowTypeModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Mechanism Picker Modal ── */}
      <Modal visible={showMechModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Mechanism of Injury</Text>
              {MECHANISMS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.modalOption, traumaMechanism === m && styles.modalOptionActive]}
                  onPress={() => { setTraumaMechanism(m); setShowMechModal(false); }}
                >
                  <Text style={[styles.modalOptionText, traumaMechanism === m && styles.modalOptionTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowMechModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Trauma Activation Modal ── */}
      <Modal visible={showTraumaModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={[styles.modalBox, styles.traumaModalBox]}>
              <Text style={styles.traumaModalHeader}>🚨 TRAUMA ACTIVATION</Text>
              <Text style={styles.traumaModalSub}>
                Sending to: {selectedHospital}
              </Text>

              {/* Mechanism */}
              <Text style={styles.traumaFieldLabel}>MECHANISM OF INJURY</Text>
              <TouchableOpacity style={styles.traumaSelector} onPress={() => setShowMechModal(true)}>
                <Text style={styles.traumaSelectorText}>{traumaMechanism}</Text>
                <Text style={styles.configChevron}>›</Text>
              </TouchableOpacity>

              {/* Age + Sex */}
              <View style={styles.traumaRow}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={styles.traumaFieldLabel}>AGE</Text>
                  <TextInput
                    style={styles.traumaInput}
                    placeholder="e.g. 34"
                    placeholderTextColor="#374151"
                    value={traumaAge}
                    onChangeText={setTraumaAge}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.traumaFieldLabel}>SEX</Text>
                  <View style={styles.sexRow}>
                    {(["M", "F", "U"] as const).map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.sexBtn, traumaSex === s && styles.sexBtnActive]}
                        onPress={() => setTraumaSex(s)}
                      >
                        <Text style={[styles.sexBtnText, traumaSex === s && styles.sexBtnTextActive]}>
                          {s === "M" ? "Male" : s === "F" ? "Female" : "Unk"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Vitals */}
              <Text style={styles.traumaFieldLabel}>VITALS (BP / HR / RR / SpO2)</Text>
              <TextInput
                style={styles.traumaInput}
                placeholder="e.g. 90/60 · HR 120 · RR 24 · SpO2 94%"
                placeholderTextColor="#374151"
                value={traumaVitals}
                onChangeText={setTraumaVitals}
              />

              {/* GCS */}
              <Text style={styles.traumaFieldLabel}>GCS SCORE</Text>
              <TextInput
                style={styles.traumaInput}
                placeholder="e.g. 12 (E3 V4 M5)"
                placeholderTextColor="#374151"
                value={traumaGCS}
                onChangeText={setTraumaGCS}
                keyboardType="default"
                maxLength={20}
              />

              {/* Patients (pre-filled, editable) */}
              <Text style={styles.traumaFieldLabel}>NUMBER OF PATIENTS</Text>
              <View style={styles.patientCounter}>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setNumPatients((n) => Math.max(1, n - 1))}>
                  <Text style={styles.counterBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{numPatients}</Text>
                <TouchableOpacity style={styles.counterBtn} onPress={() => setNumPatients((n) => Math.min(20, n + 1))}>
                  <Text style={styles.counterBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.traumaSubmitBtn, traumaSending && { opacity: 0.6 }]}
                onPress={submitTrauma}
                disabled={traumaSending}
              >
                <Text style={styles.traumaSubmitText}>
                  {traumaSending ? "Sending..." : "🚨 ACTIVATE TRAUMA TEAM"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowTraumaModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Header ── */}
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

        <Text style={styles.pageTitle}>EMS Dashboard</Text>
        <Text style={styles.pageSubtitle}>Polk County Rescue Operations</Text>

        {/* Trauma activated banner */}
        {traumaActivated && (
          <View style={styles.traumaBanner}>
            <Text style={styles.traumaBannerIcon}>🚨</Text>
            <View>
              <Text style={styles.traumaBannerTitle}>TRAUMA ACTIVATED</Text>
              <Text style={styles.traumaBannerSub}>
                {selectedHospital}{traumaETA !== null ? ` · ETA ${traumaETA} min` : ""}
              </Text>
            </View>
          </View>
        )}

        {/* Status Pills */}
        <View style={styles.statusRow}>
          <StatusPill label="GPS"    value={location ? "Active ✓" : locationLabel} ok={!!location} />
          <StatusPill label="Server" value={serverStatus === "connected" ? "Live ✓" : serverStatus} ok={serverStatus === "connected"} />
          <StatusPill label="ACKs"   value={`${ackCount}`} ok={ackCount > 0} />
        </View>

        {/* Unit Status */}
        <Text style={styles.sectionTitle}>UNIT STATUS</Text>
        <View style={[styles.transportBar, { borderColor: currentStatusCfg.color + "40" }]}>
          <View style={styles.transportCurrent}>
            <Text style={styles.transportCurrentLabel}>Current Status</Text>
            <Text style={[styles.transportCurrentValue, { color: currentStatusCfg.color }]}>
              {currentStatusCfg.label}
            </Text>
          </View>
          <View style={styles.transportButtons}>
            {(["responding", "transporting", "arrived"] as TransportStatus[]).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const isActive = transportStatus === s;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.transportBtn, { borderColor: cfg.color }, isActive && { backgroundColor: cfg.bg }]}
                  onPress={() => handleStatusPress(s)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.transportBtnText, { color: isActive ? cfg.color : "#6b7280" }]}>
                    {cfg.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Trauma Activation Button — only visible when an alert is active */}
        {transportStatus !== "idle" && transportStatus !== "arrived" && (
          <TouchableOpacity
            style={[styles.traumaBtn, traumaActivated && styles.traumaBtnActivated]}
            onPress={() => setShowTraumaModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.traumaBtnText}>
              {traumaActivated ? "✓ Trauma Activated — Update" : "🚨 Activate Trauma"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Alert Config */}
        <Text style={styles.sectionTitle}>ALERT CONFIGURATION</Text>
        <View style={styles.configBox}>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>🏥  Destination</Text>
            <TouchableOpacity style={styles.configSelector} onPress={() => setShowHospitalModal(true)}>
              <Text style={styles.configSelectorText} numberOfLines={1}>{selectedHospital}</Text>
              <Text style={styles.configChevron}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.configDivider} />
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>🚨  Alert Type</Text>
            <TouchableOpacity style={styles.configSelector} onPress={() => setShowTypeModal(true)}>
              <Text style={styles.configSelectorText}>{selectedAlertType}</Text>
              <Text style={styles.configChevron}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.configDivider} />
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>🧑‍⚕️  Patients</Text>
            <View style={styles.patientCounter}>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setNumPatients((n) => Math.max(1, n - 1))}>
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{numPatients}</Text>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setNumPatients((n) => Math.min(20, n + 1))}>
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Location */}
        <View style={styles.locBox}>
          <Text style={styles.locLabel}>📍 Current Position</Text>
          <Text style={styles.locValue}>{locationLabel}</Text>
          <Text style={styles.locRadius}>Alert radius: 2.0 miles</Text>
        </View>

        {/* Presets */}
        <Text style={styles.sectionTitle}>QUICK ALERTS</Text>
        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.label}
              style={[styles.presetBtn, sending && styles.presetDisabled]}
              onPress={() => sendAlert(preset.message, preset.type)}
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
  container:              { flex: 1, backgroundColor: "#0a0a0f" },
  header:                 { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  backBtn:                { padding: 4 },
  backText:               { color: "#ef4444", fontSize: 15, fontWeight: "600" },
  headerRight:            { flexDirection: "row", alignItems: "center", gap: 10 },
  unitLabel:              { color: "#ef4444", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  dot:                    { width: 10, height: 10, borderRadius: 5 },
  scroll:                 { flex: 1 },
  scrollContent:          { paddingHorizontal: 24, paddingBottom: 48 },
  pageTitle:              { fontSize: 32, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  pageSubtitle:           { fontSize: 13, color: "#4b5563", marginBottom: 24 },
  traumaBanner:           { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#450a0a", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#dc2626" },
  traumaBannerIcon:       { fontSize: 24 },
  traumaBannerTitle:      { fontSize: 13, fontWeight: "900", color: "#ef4444", letterSpacing: 1 },
  traumaBannerSub:        { fontSize: 12, color: "#fca5a5", marginTop: 2 },
  statusRow:              { flexDirection: "row", gap: 10, marginBottom: 20 },
  pill:                   { flex: 1, backgroundColor: "#111827", borderRadius: 12, padding: 12, alignItems: "center" },
  pillLabel:              { fontSize: 10, color: "#6b7280", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  pillValue:              { fontSize: 12, fontWeight: "800" },
  sectionTitle:           { fontSize: 11, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  transportBar:           { backgroundColor: "#111827", borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 12 },
  transportCurrent:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  transportCurrentLabel:  { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  transportCurrentValue:  { fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  transportButtons:       { flexDirection: "row", gap: 8 },
  transportBtn:           { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  transportBtnText:       { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  traumaBtn:              { backgroundColor: "#450a0a", borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#dc2626", marginBottom: 24 },
  traumaBtnActivated:     { backgroundColor: "#052e16", borderColor: "#22c55e" },
  traumaBtnText:          { color: "#ef4444", fontSize: 14, fontWeight: "900", letterSpacing: 0.5 },
  configBox:              { backgroundColor: "#111827", borderRadius: 14, padding: 4, marginBottom: 16 },
  configRow:              { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14 },
  configLabel:            { fontSize: 13, color: "#9ca3af", fontWeight: "600" },
  configSelector:         { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "55%" },
  configSelectorText:     { fontSize: 13, color: "#f8fafc", fontWeight: "700", textAlign: "right" },
  configChevron:          { fontSize: 20, color: "#4b5563", lineHeight: 22 },
  configDivider:          { height: 1, backgroundColor: "#1f2937", marginHorizontal: 12 },
  patientCounter:         { flexDirection: "row", alignItems: "center", gap: 16 },
  counterBtn:             { width: 32, height: 32, borderRadius: 8, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },
  counterBtnText:         { fontSize: 20, color: "#f8fafc", lineHeight: 24 },
  counterValue:           { fontSize: 18, color: "#f8fafc", fontWeight: "800", minWidth: 24, textAlign: "center" },
  locBox:                 { backgroundColor: "#111827", borderRadius: 14, padding: 16, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: "#ef4444" },
  locLabel:               { fontSize: 11, color: "#6b7280", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  locValue:               { fontSize: 15, color: "#f8fafc", fontWeight: "700", marginBottom: 4 },
  locRadius:              { fontSize: 12, color: "#4b5563" },
  presets:                { gap: 10, marginBottom: 24 },
  presetBtn:              { backgroundColor: "#1a0a0a", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#7f1d1d" },
  presetDisabled:         { opacity: 0.5 },
  presetLabel:            { fontSize: 15, fontWeight: "800", color: "#f8fafc", marginBottom: 4 },
  presetMessage:          { fontSize: 12, color: "#6b7280" },
  customBox:              { backgroundColor: "#111827", borderRadius: 14, padding: 16, marginBottom: 24, gap: 12 },
  input:                  { color: "#f8fafc", fontSize: 15, lineHeight: 22, minHeight: 80 },
  sendBtn:                { backgroundColor: "#dc2626", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  sendBtnDisabled:        { backgroundColor: "#4b1414", opacity: 0.6 },
  sendBtnText:            { color: "#fff", fontSize: 16, fontWeight: "800" },
  logBox:                 { backgroundColor: "#111827", borderRadius: 14, overflow: "hidden" },
  logRow:                 { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937" },
  logLeft:                { flex: 1, marginRight: 12 },
  logMessage:             { fontSize: 13, color: "#f8fafc", fontWeight: "600", marginBottom: 2 },
  logId:                  { fontSize: 10, color: "#374151" },
  logRight:               { alignItems: "flex-end" },
  logTime:                { fontSize: 12, color: "#6b7280", marginBottom: 2 },
  logDelivered:           { fontSize: 11, color: "#22c55e", fontWeight: "600" },
  // Modals
  modalOverlay:           { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalBox:               { backgroundColor: "#111827", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:             { fontSize: 11, color: "#6b7280", fontWeight: "800", letterSpacing: 2, marginBottom: 16, textTransform: "uppercase" },
  modalOption:            { paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  modalOptionActive:      { backgroundColor: "#1f2937" },
  modalOptionText:        { fontSize: 15, color: "#9ca3af", fontWeight: "600" },
  modalOptionTextActive:  { color: "#f8fafc", fontWeight: "800" },
  modalCancel:            { marginTop: 8, paddingVertical: 16, alignItems: "center" },
  modalCancelText:        { fontSize: 15, color: "#ef4444", fontWeight: "700" },
  // Trauma modal
  traumaModalBox:         { borderRadius: 20, marginTop: 60 },
  traumaModalHeader:      { fontSize: 20, fontWeight: "900", color: "#ef4444", letterSpacing: 1, marginBottom: 4 },
  traumaModalSub:         { fontSize: 12, color: "#6b7280", marginBottom: 24 },
  traumaFieldLabel:       { fontSize: 10, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 8, marginTop: 16 },
  traumaSelector:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1f2937", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14 },
  traumaSelectorText:     { fontSize: 14, color: "#f8fafc", fontWeight: "600", flex: 1 },
  traumaInput:            { backgroundColor: "#1f2937", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: "#f8fafc", fontSize: 14 },
  traumaRow:              { flexDirection: "row" },
  sexRow:                 { flexDirection: "row", gap: 6 },
  sexBtn:                 { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: "#1f2937", alignItems: "center" },
  sexBtnActive:           { backgroundColor: "#1e3a5f" },
  sexBtnText:             { fontSize: 12, color: "#6b7280", fontWeight: "700" },
  sexBtnTextActive:       { color: "#60a5fa" },
  traumaSubmitBtn:        { backgroundColor: "#dc2626", borderRadius: 12, paddingVertical: 18, alignItems: "center", marginTop: 24 },
  traumaSubmitText:       { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
});
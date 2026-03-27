import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, TouchableHighlight,
  ScrollView, TextInput, SafeAreaView, Alert, Modal, Animated,
} from "react-native";
import * as Location from "expo-location";

const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";
const SERVER_WS   = "wss://emsmainalert-production.up.railway.app/ws";

const HOSPITALS = [
  "Lakeland Regional Health",
  "Bartow Regional Medical Center",
  "Winter Haven Hospital",
  "South Florida Baptist Hospital",
  "AdventHealth Heart of Florida",
  "AdventHealth Lake Wales",
];

const ALERT_TYPES = ["Medical", "Trauma", "Cardiac", "Stroke", "Fire", "Police", "Other"];

const PAUSE_REASONS = [
  { label: "🚔 Waiting for Police / Staging", value: "Staging / scene safety" },
  { label: "🚑 Stopped on Scene",             value: "Stopped on scene"        },
  { label: "✅ Traffic Already Cleared",      value: "Traffic already cleared" },
];

const PRESETS = [
  { label: "🔥 Fire",      message: "Fire Rescue responding — emergency vehicle approaching",  type: "Fire"    },
  { label: "🚑 Medical",   message: "Medical Emergency — ambulance approaching, please yield", type: "Medical" },
  { label: "🚔 Police",    message: "Police Emergency — law enforcement vehicle approaching",  type: "Police"  },
  { label: "✅ All Clear", message: "All Clear — emergency vehicles have cleared the area",    type: "Other"   },
];

type TransportStatus = "idle" | "responding" | "transporting" | "arrived";
type Severity = "Critical" | "Serious" | "Stable" | null;

const STATUS_CONFIG: Record<TransportStatus, { label: string; color: string; bg: string }> = {
  idle:         { label: "Idle",         color: "#6b7280", bg: "#1f2937" },
  responding:   { label: "Responding",   color: "#f59e0b", bg: "#2d1f00" },
  transporting: { label: "Transporting", color: "#3b82f6", bg: "#0d1f3c" },
  arrived:      { label: "Arrived",      color: "#22c55e", bg: "#052e16" },
};

const SEVERITY_CONFIG: Record<NonNullable<Severity>, { color: string; bg: string; border: string }> = {
  Critical: { color: "#ef4444", bg: "#450a0a", border: "#dc2626" },
  Serious:  { color: "#f59e0b", bg: "#1c1500", border: "#d97706" },
  Stable:   { color: "#22c55e", bg: "#052e16", border: "#16a34a" },
};

// ── NLP Parser ────────────────────────────────────────────────────────────────

interface ParsedField {
  value: string;
  confidence: number; // 0-1
}

interface ParsedTranscription {
  hospital: ParsedField | null;
  alertType: ParsedField | null;
  age: ParsedField | null;
  sex: ParsedField | null;
  mechanism: ParsedField | null;
  vitals: ParsedField | null;
  gcs: ParsedField | null;
  numPatients: ParsedField | null;
  severity: Severity;
  rawText: string;
}

function parseTranscription(text: string): ParsedTranscription {
  const lower = text.toLowerCase();
  const result: ParsedTranscription = {
    hospital: null, alertType: null, age: null, sex: null,
    mechanism: null, vitals: null, gcs: null, numPatients: null,
    severity: null, rawText: text,
  };

  // ── Hospital detection ──
  const hospitalMap: Record<string, string> = {
    "lakeland": "Lakeland Regional Health",
    "lrh": "Lakeland Regional Health",
    "lakeland regional": "Lakeland Regional Health",
    "bartow": "Bartow Regional Medical Center",
    "winter haven": "Winter Haven Hospital",
    "south florida baptist": "South Florida Baptist Hospital",
    "adventhealth heart": "AdventHealth Heart of Florida",
    "heart of florida": "AdventHealth Heart of Florida",
    "lake wales": "AdventHealth Lake Wales",
    "adventhealth lake wales": "AdventHealth Lake Wales",
  };
  for (const [keyword, hospital] of Object.entries(hospitalMap)) {
    if (lower.includes(keyword)) {
      result.hospital = { value: hospital, confidence: keyword.length > 5 ? 0.95 : 0.75 };
      break;
    }
  }

  // ── Alert type / mechanism detection ──
  const typeMap: [string[], string, string][] = [
    [["mvc", "motor vehicle", "car accident", "crash", "collision"], "Trauma", "MVC"],
    [["cardiac arrest", "heart attack", "v-fib", "vfib", "asystole"], "Cardiac", "Cardiac Arrest"],
    [["stroke", "cva", "facial droop", "slurred speech"], "Stroke", "CVA/Stroke"],
    [["gsw", "gunshot", "stabbing", "stab wound", "penetrating"], "Trauma", "Penetrating Trauma"],
    [["fall", "fell", "fall from"], "Trauma", "Fall"],
    [["burn", "burns"], "Trauma", "Burns"],
    [["pedestrian", "ped vs"], "Trauma", "Pedestrian vs Vehicle"],
    [["fire", "smoke inhalation", "structure fire"], "Fire", null],
    [["overdose", "ods", "narcotic"], "Medical", "Overdose"],
    [["diabetic", "hypoglycemia", "glucose"], "Medical", "Diabetic Emergency"],
    [["respiratory", "breathing difficulty", "dyspnea"], "Medical", "Respiratory Distress"],
  ];
  for (const [keywords, type, mechanism] of typeMap) {
    if (keywords.some(k => lower.includes(k))) {
      result.alertType = { value: type, confidence: 0.9 };
      if (mechanism) result.mechanism = { value: mechanism, confidence: 0.85 };
      break;
    }
  }

  // ── Age detection ──
  const ageMatch = lower.match(/(\d{1,3})[\s-]*(year[s]?[\s-]*old|y\/o|yo\b|year old)/);
  if (ageMatch) result.age = { value: ageMatch[1], confidence: 0.95 };

  // ── Sex detection ──
  if (/\bmale\b|\bman\b|\bboy\b/.test(lower))        result.sex = { value: "M", confidence: 0.9 };
  else if (/\bfemale\b|\bwoman\b|\bgirl\b/.test(lower)) result.sex = { value: "F", confidence: 0.9 };

  // ── Patient count ──
  const multiPatient = lower.match(/(\d+)\s*(patients|victims|people)/);
  if (multiPatient) result.numPatients = { value: multiPatient[1], confidence: 0.9 };

  // ── Vitals detection ──
  const bpMatch = lower.match(/(?:bp|blood pressure)[:\s]*(\d{2,3})[\/\s](\d{2,3})/);
  const hrMatch = lower.match(/(?:hr|heart rate|pulse)[:\s]*(\d{2,3})/);
  const rrMatch = lower.match(/(?:rr|respiratory rate|respirations)[:\s]*(\d{1,2})/);
  const spo2Match = lower.match(/(?:spo2|o2 sat|oxygen sat)[:\s]*(\d{2,3})/);
  const vitalParts = [];
  if (bpMatch) vitalParts.push(`BP ${bpMatch[1]}/${bpMatch[2]}`);
  if (hrMatch) vitalParts.push(`HR ${hrMatch[1]}`);
  if (rrMatch) vitalParts.push(`RR ${rrMatch[1]}`);
  if (spo2Match) vitalParts.push(`SpO2 ${spo2Match[1]}%`);
  if (vitalParts.length > 0) {
    result.vitals = { value: vitalParts.join(" · "), confidence: vitalParts.length >= 2 ? 0.9 : 0.7 };
  }

  // ── GCS detection ──
  const gcsMatch = lower.match(/(?:gcs|glasgow)[:\s]*(\d{1,2})/);
  if (gcsMatch) result.gcs = { value: gcsMatch[1], confidence: 0.9 };

  // ── Severity detection ──
  const gcsNum = gcsMatch ? parseInt(gcsMatch[1]) : null;
  const bpSys  = bpMatch  ? parseInt(bpMatch[1])  : null;
  let severity: Severity = "Stable";

  const criticalKeywords = ["cardiac arrest", "unconscious", "unresponsive", "not breathing", "full arrest", "gsw", "gunshot"];
  const seriousKeywords  = ["altered mental", "altered loc", "hypotensive", "difficulty breathing", "mvc high speed", "ejection"];

  if (criticalKeywords.some(k => lower.includes(k)) || (gcsNum !== null && gcsNum <= 8) || (bpSys !== null && bpSys < 80)) {
    severity = "Critical";
  } else if (seriousKeywords.some(k => lower.includes(k)) || (gcsNum !== null && gcsNum <= 12) || (bpSys !== null && bpSys < 100)) {
    severity = "Serious";
  } else {
    severity = "Stable";
  }
  result.severity = severity;

  return result;
}

// ── Mock transcription for testing in Expo Go ─────────────────────────────────
// When real voice recognition is available, replace this with the actual transcript
function getMockTranscription(): string {
  const samples = [
    "Lakeland from Rescue 1, we're transporting a 34-year-old male MVC high speed, BP 90 over 60, HR 120, GCS 12, ETA 8 minutes to Lakeland Regional",
    "Winter Haven from Rescue 3, cardiac arrest 67-year-old female, CPR in progress, BP not obtainable, GCS 3, requesting cath lab standby, ETA 6 minutes",
    "Bartow from Rescue 2, we have a 28-year-old male GSW to the chest, BP 80 over 50, HR 140, RR 28, SpO2 88%, GCS 9, trauma activation requested",
    "Lakeland from Rescue 4, stroke alert, 72-year-old female, facial droop left side, BP 180 over 100, GCS 14, ETA 12 minutes to Lakeland Regional",
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  emsUnitId: string;
  emsApiKey: string;
  onExit: () => void;
  onOpenSettings: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EMSScreen({ emsUnitId, emsApiKey, onExit, onOpenSettings }: Props) {
  const [location, setLocation]               = useState<{ lat: number; lon: number } | null>(null);
  const [locationLabel, setLocationLabel]     = useState("Acquiring GPS...");
  const [serverStatus, setServerStatus]       = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [sending, setSending]                 = useState(false);
  const [ackCount, setAckCount]               = useState(0);
  const [alertLog, setAlertLog]               = useState<{ id: string; message: string; ws: number; time: string }[]>([]);
  const [transportStatus, setTransportStatus] = useState<TransportStatus>("idle");

  // Hospital / alert config
  const [selectedHospital, setSelectedHospital]   = useState<string>(HOSPITALS[0]);
  const [selectedAlertType, setSelectedAlertType] = useState<string>("Medical");
  const [numPatients, setNumPatients]             = useState<number>(1);
  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [showTypeModal, setShowTypeModal]         = useState(false);

  // Pause state
  const [isPaused, setIsPaused]             = useState(false);
  const [pauseReason, setPauseReason]       = useState<string>("");
  const [showPauseModal, setShowPauseModal] = useState(false);

  // Custom alert
  const [customMessage, setCustomMessage] = useState("");

  // Voice transcription state
  const [isListening, setIsListening]           = useState(false);
  const [transcription, setTranscription]       = useState<ParsedTranscription | null>(null);
  const [showReviewModal, setShowReviewModal]   = useState(false);
  const [listeningDuration, setListeningDuration] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const listeningTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSub      = useRef<Location.LocationSubscription | null>(null);
  const activeAlertRef   = useRef<boolean>(false);
  const activeAlertIdRef = useRef<string | null>(null);

  useEffect(() => {
    startLocation();
    connectWebSocket();
    return () => {
      wsRef.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      locationSub.current?.remove();
      if (listeningTimer.current) clearInterval(listeningTimer.current);
    };
  }, []);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  function connectWebSocket() {
    setServerStatus("connecting");
    const ws = new WebSocket(SERVER_WS);
    wsRef.current = ws;
    ws.onopen = () => {
      setServerStatus("connected");
      ws.send(JSON.stringify({ type: "ems_unit", unit_id: emsUnitId }));
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ACK") setAckCount((c) => c + 1);
        if (data.type === "status_ack" && data.status === "arrived") {
          setTransportStatus("arrived");
          activeAlertRef.current = false;
          activeAlertIdRef.current = null;
          setIsPaused(false);
        }
      } catch (e) {}
    };
    ws.onclose = () => {
      setServerStatus("disconnected");
      reconnectTimeout.current = setTimeout(connectWebSocket, 5000);
    };
  }

  // ── Location ───────────────────────────────────────────────────────────────
  async function startLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setLocationLabel("GPS denied"); return; }
    await Location.requestBackgroundPermissionsAsync().catch(() => {});
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
    setLocationLabel(`${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 15 },
      (newLoc) => {
        const lat = newLoc.coords.latitude;
        const lon = newLoc.coords.longitude;
        setLocation({ lat, lon });
        setLocationLabel(`${lat.toFixed(4)}, ${lon.toFixed(4)}`);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "update", lat, lon }));
          if (activeAlertRef.current && activeAlertIdRef.current) {
            wsRef.current.send(JSON.stringify({ type: "ems_position", unit_id: emsUnitId, alert_id: activeAlertIdRef.current, lat, lon }));
          }
        }
      }
    );
  }

  // ── Voice: Hold to Transmit ────────────────────────────────────────────────
  function startListening() {
    setIsListening(true);
    setListeningDuration(0);

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0,  duration: 500, useNativeDriver: true }),
      ])
    ).start();

    // Timer
    listeningTimer.current = setInterval(() => {
      setListeningDuration((d) => d + 1);
    }, 1000);

    // TODO: Start real speech recognition here when native build is ready
    // Voice.start('en-US');
  }

  function stopListening() {
    setIsListening(false);
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    if (listeningTimer.current) clearInterval(listeningTimer.current);

    // TODO: Stop real speech recognition and get actual transcript
    // Voice.stop();
    // For now, use mock transcript for testing
    const mockText = getMockTranscription();
    const parsed = parseTranscription(mockText);

    // Auto-apply hospital suggestion
    if (parsed.hospital) setSelectedHospital(parsed.hospital.value);
    if (parsed.alertType) setSelectedAlertType(parsed.alertType.value);
    if (parsed.numPatients) setNumPatients(parseInt(parsed.numPatients.value));

    setTranscription(parsed);
    setShowReviewModal(true);
  }

  // ── Confirm and send parsed transcription ──────────────────────────────────
  async function confirmAndSend() {
    if (!transcription) return;
    if (!location) { Alert.alert("No GPS", "Waiting for GPS lock."); return; }
    if (serverStatus !== "connected") { Alert.alert("Not Connected", "Server is not connected."); return; }

    setShowReviewModal(false);
    setSending(true);
    setIsPaused(false);
    sendStatus("responding");
    activeAlertRef.current = true;

    const alertMessage = transcription.alertType?.value
      ? `${transcription.alertType.value} Emergency — ambulance approaching, please yield`
      : "Medical Emergency — ambulance approaching, please yield";

    try {
      const params = new URLSearchParams({
        lat: String(location.lat),
        lon: String(location.lon),
        alert_message: alertMessage,
        radius: "2.0",
        ems_unit_id: emsUnitId,
        api_key: emsApiKey,
        destination_hospital: selectedHospital,
        num_patients: String(numPatients),
        alert_type: selectedAlertType,
      });

      const resp = await fetch(`${SERVER_HTTP}/trigger-alert?${params}`, { method: "POST" });
      const data = await resp.json();
      activeAlertIdRef.current = data.alert_id;

      // Send trauma data via WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "ems_trauma",
          unit_id: emsUnitId,
          mechanism: transcription.mechanism?.value ?? "",
          num_patients: numPatients,
          age: transcription.age?.value ?? "",
          sex: transcription.sex?.value ?? "U",
          vitals: transcription.vitals?.value ?? "",
          gcs: transcription.gcs?.value ?? "",
          severity: transcription.severity,
          reviewed_by: emsUnitId,
          raw_transcription: transcription.rawText,
        }));
      }

      setAlertLog((prev) => [{
        id: data.alert_id,
        message: alertMessage,
        ws: data.ws_delivered ?? 0,
        time: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 9)]);

      setTranscription(null);

    } catch (e) {
      Alert.alert("Error", "Failed to send alert. Check connection.");
      activeAlertRef.current = false;
      activeAlertIdRef.current = null;
    } finally {
      setSending(false);
    }
  }

  // ── Transport Status ───────────────────────────────────────────────────────
  function sendStatus(status: TransportStatus) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "ems_status", unit_id: emsUnitId, status }));
    setTransportStatus(status);
    if (status === "arrived") { setAckCount(0); activeAlertRef.current = false; activeAlertIdRef.current = null; setIsPaused(false); }
  }

  function handleStatusPress(status: TransportStatus) {
    if (status === "arrived") {
      Alert.alert("Mark as Arrived?", "This will automatically end all broadcasted alerts for your unit.", [
        { text: "Cancel", style: "cancel" },
        { text: "Yes, Arrived", style: "destructive", onPress: () => sendStatus("arrived") },
      ]);
    } else { sendStatus(status); }
  }

  function handleAllClear() {
    Alert.alert("Send All Clear?", "This will immediately stop all broadcasted alerts for your unit.", [
      { text: "Cancel", style: "cancel" },
      { text: "Yes, All Clear", style: "destructive", onPress: () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "ems_clear", unit_id: emsUnitId }));
        setTransportStatus("idle"); activeAlertRef.current = false; activeAlertIdRef.current = null; setIsPaused(false); setAckCount(0);
      }},
    ]);
  }

  function sendPause(reason: string) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "ems_pause", unit_id: emsUnitId, pause_reason: reason }));
    setIsPaused(true); setPauseReason(reason); setShowPauseModal(false);
  }

  function sendResume() {
    Alert.alert("Resume Alert?", "This will re-broadcast the active alert to all vehicles in range.", [
      { text: "Cancel", style: "cancel" },
      { text: "Yes, Resume", onPress: () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "ems_resume", unit_id: emsUnitId }));
        setIsPaused(false); setPauseReason("");
      }},
    ]);
  }

  async function sendAlert(message: string, alertType?: string) {
    if (!location) { Alert.alert("No GPS", "Waiting for GPS lock."); return; }
    if (serverStatus !== "connected") { Alert.alert("Not Connected", "Server is not connected."); return; }
    setSending(true); setIsPaused(false); sendStatus("responding"); activeAlertRef.current = true;
    try {
      const params = new URLSearchParams({ lat: String(location.lat), lon: String(location.lon), alert_message: message, radius: "2.0", ems_unit_id: emsUnitId, api_key: emsApiKey, destination_hospital: selectedHospital, num_patients: String(numPatients), alert_type: alertType ?? selectedAlertType });
      const resp = await fetch(`${SERVER_HTTP}/trigger-alert?${params}`, { method: "POST" });
      const data = await resp.json();
      activeAlertIdRef.current = data.alert_id;
      setAlertLog((prev) => [{ id: data.alert_id, message, ws: data.ws_delivered ?? 0, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
    } catch (e) {
      Alert.alert("Error", "Failed to send alert."); activeAlertRef.current = false; activeAlertIdRef.current = null;
    } finally { setSending(false); }
  }

  const statusColor = serverStatus === "connected" ? "#22c55e" : serverStatus === "connecting" ? "#f59e0b" : "#ef4444";
  const currentStatusCfg = STATUS_CONFIG[transportStatus];
  const alertIsActive = activeAlertRef.current && transportStatus !== "idle" && transportStatus !== "arrived";

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Hospital Modal ── */}
      <Modal visible={showHospitalModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Destination Hospital</Text>
            {HOSPITALS.map((h) => (
              <TouchableOpacity key={h} style={[styles.modalOption, selectedHospital === h && styles.modalOptionActive]}
                onPress={() => { setSelectedHospital(h); setShowHospitalModal(false); }}>
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
              <TouchableOpacity key={t} style={[styles.modalOption, selectedAlertType === t && styles.modalOptionActive]}
                onPress={() => { setSelectedAlertType(t); setShowTypeModal(false); }}>
                <Text style={[styles.modalOptionText, selectedAlertType === t && styles.modalOptionTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowTypeModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Pause Modal ── */}
      <Modal visible={showPauseModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Pause Reason</Text>
            <Text style={styles.pauseModalSub}>Civilians will see a "Stand By" screen.</Text>
            {PAUSE_REASONS.map((r) => (
              <TouchableOpacity key={r.value} style={styles.pauseOption} onPress={() => sendPause(r.value)}>
                <Text style={styles.pauseOptionText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPauseModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Review Modal ── */}
      <Modal visible={showReviewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={[styles.modalBox, { paddingBottom: 48 }]}>

              <Text style={styles.reviewHeader}>📋 REVIEW TRANSMISSION</Text>
              <Text style={styles.reviewSub}>Confirm before sending to hospital</Text>

              {/* Severity badge */}
              {transcription?.severity && (
                <View style={[styles.severityBadge, { backgroundColor: SEVERITY_CONFIG[transcription.severity].bg, borderColor: SEVERITY_CONFIG[transcription.severity].border }]}>
                  <Text style={[styles.severityText, { color: SEVERITY_CONFIG[transcription.severity].color }]}>
                    ● {transcription.severity.toUpperCase()} SEVERITY
                  </Text>
                </View>
              )}

              {/* Raw transcription */}
              <View style={styles.rawBox}>
                <Text style={styles.rawLabel}>TRANSCRIPTION</Text>
                <Text style={styles.rawText}>{transcription?.rawText}</Text>
              </View>

              {/* Parsed fields */}
              <Text style={styles.parsedLabel}>PARSED FIELDS</Text>
              <View style={styles.parsedGrid}>
                <ParsedRow label="Hospital"   field={transcription?.hospital}    fallback={selectedHospital} />
                <ParsedRow label="Alert Type" field={transcription?.alertType}   fallback={selectedAlertType} />
                <ParsedRow label="Age"        field={transcription?.age}         fallback="—" />
                <ParsedRow label="Sex"        field={transcription?.sex}         fallback="—" />
                <ParsedRow label="Mechanism"  field={transcription?.mechanism}   fallback="—" />
                <ParsedRow label="Vitals"     field={transcription?.vitals}      fallback="—" />
                <ParsedRow label="GCS"        field={transcription?.gcs}         fallback="—" />
                <ParsedRow label="Patients"   field={transcription?.numPatients} fallback={String(numPatients)} />
              </View>

              {/* Reviewed by */}
              <View style={styles.reviewedByBox}>
                <Text style={styles.reviewedByText}>Reviewed by: {emsUnitId}</Text>
              </View>

              {/* Actions */}
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmAndSend}>
                <Text style={styles.confirmBtnText}>✓ Confirm & Send to Hospital</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowReviewModal(false)}>
                <Text style={styles.modalCancelText}>← Re-record</Text>
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
          <TouchableOpacity onPress={onOpenSettings} style={styles.settingsBtn}>
            <Text style={styles.settingsBtnText}>⚙️</Text>
          </TouchableOpacity>
          <Text style={styles.unitLabel}>{emsUnitId}</Text>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Text style={styles.pageTitle}>EMS Dashboard</Text>
        <Text style={styles.pageSubtitle}>Polk County Rescue Operations</Text>

        {/* Status pills */}
        <View style={styles.statusRow}>
          <StatusPill label="GPS"    value={location ? "Active ✓" : locationLabel} ok={!!location} />
          <StatusPill label="Server" value={serverStatus === "connected" ? "Live ✓" : serverStatus} ok={serverStatus === "connected"} />
          <StatusPill label="ACKs"   value={`${ackCount}`} ok={ackCount > 0} />
        </View>

        {/* Paused banner */}
        {isPaused && (
          <View style={styles.pausedBanner}>
            <Text style={styles.pausedBannerIcon}>⏸</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pausedBannerTitle}>ALERT PAUSED</Text>
              <Text style={styles.pausedBannerSub}>{pauseReason}</Text>
            </View>
            <TouchableOpacity style={styles.resumeBtn} onPress={sendResume}>
              <Text style={styles.resumeBtnText}>▶ Resume</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── HOLD TO TRANSMIT — the main feature ── */}
        <Text style={styles.sectionTitle}>RADIO TRANSCRIPTION</Text>
        <View style={styles.transmitSection}>
          <Text style={styles.transmitHint}>
            {isListening
              ? `🔴 Listening... ${listeningDuration}s — Release when done`
              : "Hold button while radio transmission is active"}
          </Text>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableHighlight
              style={[styles.transmitBtn, isListening && styles.transmitBtnActive]}
              onPressIn={startListening}
              onPressOut={stopListening}
              underlayColor="#b91c1c"
              activeOpacity={0.9}
            >
              <View style={styles.transmitBtnInner}>
                <Text style={styles.transmitBtnIcon}>{isListening ? "🎙" : "🎙"}</Text>
                <Text style={styles.transmitBtnText}>{isListening ? "LISTENING" : "HOLD TO\nTRANSMIT"}</Text>
              </View>
            </TouchableHighlight>
          </Animated.View>

          {transcription && !showReviewModal && (
            <TouchableOpacity style={styles.reviewAgainBtn} onPress={() => setShowReviewModal(true)}>
              <Text style={styles.reviewAgainText}>📋 Review Last Transcription</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Unit status */}
        <Text style={styles.sectionTitle}>UNIT STATUS</Text>
        <View style={[styles.transportBar, { borderColor: currentStatusCfg.color + "40" }]}>
          <View style={styles.transportCurrent}>
            <Text style={styles.transportCurrentLabel}>Current Status</Text>
            <Text style={[styles.transportCurrentValue, { color: currentStatusCfg.color }]}>
              {isPaused ? "⏸ Paused" : currentStatusCfg.label}
            </Text>
          </View>
          <View style={styles.transportButtons}>
            {(["responding", "transporting", "arrived"] as TransportStatus[]).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const isActive = transportStatus === s;
              return (
                <TouchableOpacity key={s}
                  style={[styles.transportBtn, { borderColor: cfg.color }, isActive && { backgroundColor: cfg.bg }]}
                  onPress={() => handleStatusPress(s)} activeOpacity={0.75}>
                  <Text style={[styles.transportBtnText, { color: isActive ? cfg.color : "#6b7280" }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Pause / All Clear */}
        {alertIsActive && (
          <View style={styles.actionRow}>
            {isPaused ? (
              <TouchableOpacity style={[styles.actionBtn, styles.resumeActionBtn]} onPress={sendResume} activeOpacity={0.8}>
                <Text style={styles.resumeActionText}>▶  Resume Alert</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.actionBtn, styles.pauseActionBtn]} onPress={() => setShowPauseModal(true)} activeOpacity={0.8}>
                <Text style={styles.pauseActionText}>⏸  Pause Alert</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionBtn, styles.clearActionBtn]} onPress={handleAllClear} activeOpacity={0.8}>
              <Text style={styles.clearActionText}>✓  All Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Alert config */}
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

        {/* Quick alerts */}
        <Text style={styles.sectionTitle}>QUICK ALERTS</Text>
        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <TouchableOpacity key={preset.label}
              style={[styles.presetBtn, sending && styles.presetDisabled]}
              onPress={() => sendAlert(preset.message, preset.type)}
              disabled={sending} activeOpacity={0.75}>
              <Text style={styles.presetLabel}>{preset.label}</Text>
              <Text style={styles.presetMessage} numberOfLines={1}>{preset.message}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom alert */}
        <Text style={styles.sectionTitle}>CUSTOM ALERT</Text>
        <View style={styles.customBox}>
          <TextInput style={styles.input} placeholder="Type custom alert message..."
            placeholderTextColor="#475569" value={customMessage} onChangeText={setCustomMessage}
            multiline maxLength={200} />
          <TouchableOpacity
            style={[styles.sendBtn, (!customMessage.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => { sendAlert(customMessage); setCustomMessage(""); }}
            disabled={!customMessage.trim() || sending}>
            <Text style={styles.sendBtnText}>{sending ? "Sending..." : "🚨 Send Alert"}</Text>
          </TouchableOpacity>
        </View>

        {/* Alert log */}
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

// ── ParsedRow — shows a field with confidence indicator ──────────────────────
function ParsedRow({ label, field, fallback }: { label: string; field: ParsedField | null | undefined; fallback: string }) {
  const hasField = field && field.value;
  const confidence = field?.confidence ?? 0;
  const isHigh = confidence >= 0.85;
  const color = hasField ? (isHigh ? "#22c55e" : "#f59e0b") : "#4b5563";
  const value = hasField ? field.value : fallback;

  return (
    <View style={parsedStyles.row}>
      <Text style={parsedStyles.label}>{label}</Text>
      <View style={parsedStyles.right}>
        <Text style={[parsedStyles.value, { color }]}>{value}</Text>
        {hasField && (
          <View style={[parsedStyles.dot, { backgroundColor: color }]} />
        )}
      </View>
    </View>
  );
}

const parsedStyles = StyleSheet.create({
  row:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#1f2937" },
  label: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  value: { fontSize: 13, fontWeight: "700", textAlign: "right", maxWidth: 200 },
  dot:   { width: 6, height: 6, borderRadius: 3 },
});

function StatusPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillLabel}>{label}</Text>
      <Text style={[styles.pillValue, { color: ok ? "#22c55e" : "#f59e0b" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: "#0a0a0f" },
  header:                { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
  backBtn:               { padding: 4 },
  backText:              { color: "#ef4444", fontSize: 15, fontWeight: "600" },
  headerRight:           { flexDirection: "row", alignItems: "center", gap: 10 },
  settingsBtn:           { padding: 4 },
  settingsBtnText:       { fontSize: 18 },
  unitLabel:             { color: "#ef4444", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  dot:                   { width: 10, height: 10, borderRadius: 5 },
  scroll:                { flex: 1 },
  scrollContent:         { paddingHorizontal: 24, paddingBottom: 48 },
  pageTitle:             { fontSize: 32, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  pageSubtitle:          { fontSize: 13, color: "#4b5563", marginBottom: 24 },
  statusRow:             { flexDirection: "row", gap: 10, marginBottom: 20 },
  pill:                  { flex: 1, backgroundColor: "#111827", borderRadius: 12, padding: 12, alignItems: "center" },
  pillLabel:             { fontSize: 10, color: "#6b7280", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  pillValue:             { fontSize: 12, fontWeight: "800" },
  pausedBanner:          { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1c1500", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#d97706" },
  pausedBannerIcon:      { fontSize: 22 },
  pausedBannerTitle:     { fontSize: 12, fontWeight: "900", color: "#f59e0b", letterSpacing: 1 },
  pausedBannerSub:       { fontSize: 12, color: "#fcd34d", marginTop: 2 },
  resumeBtn:             { backgroundColor: "#d97706", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  resumeBtnText:         { color: "#fff", fontSize: 12, fontWeight: "800" },
  sectionTitle:          { fontSize: 11, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 12, marginTop: 8 },
  // Transmit button
  transmitSection:       { alignItems: "center", marginBottom: 32, gap: 16 },
  transmitHint:          { fontSize: 13, color: "#6b7280", textAlign: "center" },
  transmitBtn:           { width: 160, height: 160, borderRadius: 80, backgroundColor: "#dc2626", alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "#7f1d1d" },
  transmitBtnActive:     { backgroundColor: "#b91c1c", borderColor: "#ef4444" },
  transmitBtnInner:      { alignItems: "center", gap: 8 },
  transmitBtnIcon:       { fontSize: 40 },
  transmitBtnText:       { fontSize: 13, fontWeight: "900", color: "#fff", textAlign: "center", letterSpacing: 1 },
  reviewAgainBtn:        { backgroundColor: "#111827", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, borderWidth: 1, borderColor: "#1f2937" },
  reviewAgainText:       { fontSize: 13, color: "#9ca3af", fontWeight: "600" },
  // Transport
  transportBar:          { backgroundColor: "#111827", borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 12 },
  transportCurrent:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  transportCurrentLabel: { fontSize: 12, color: "#6b7280", fontWeight: "600" },
  transportCurrentValue: { fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
  transportButtons:      { flexDirection: "row", gap: 8 },
  transportBtn:          { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: "center" },
  transportBtnText:      { fontSize: 11, fontWeight: "800", letterSpacing: 0.3 },
  actionRow:             { flexDirection: "row", gap: 10, marginBottom: 16 },
  actionBtn:             { flex: 1, borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1 },
  pauseActionBtn:        { backgroundColor: "#1c1500", borderColor: "#d97706" },
  pauseActionText:       { color: "#f59e0b", fontSize: 13, fontWeight: "800" },
  resumeActionBtn:       { backgroundColor: "#0d1f0d", borderColor: "#22c55e" },
  resumeActionText:      { color: "#22c55e", fontSize: 13, fontWeight: "800" },
  clearActionBtn:        { backgroundColor: "#0a1628", borderColor: "#3b82f6" },
  clearActionText:       { color: "#60a5fa", fontSize: 13, fontWeight: "800" },
  // Config
  configBox:             { backgroundColor: "#111827", borderRadius: 14, padding: 4, marginBottom: 16 },
  configRow:             { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14 },
  configLabel:           { fontSize: 13, color: "#9ca3af", fontWeight: "600" },
  configSelector:        { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "55%" },
  configSelectorText:    { fontSize: 13, color: "#f8fafc", fontWeight: "700", textAlign: "right" },
  configChevron:         { fontSize: 20, color: "#4b5563", lineHeight: 22 },
  configDivider:         { height: 1, backgroundColor: "#1f2937", marginHorizontal: 12 },
  patientCounter:        { flexDirection: "row", alignItems: "center", gap: 16 },
  counterBtn:            { width: 32, height: 32, borderRadius: 8, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },
  counterBtnText:        { fontSize: 20, color: "#f8fafc", lineHeight: 24 },
  counterValue:          { fontSize: 18, color: "#f8fafc", fontWeight: "800", minWidth: 24, textAlign: "center" },
  locBox:                { backgroundColor: "#111827", borderRadius: 14, padding: 16, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: "#ef4444" },
  locLabel:              { fontSize: 11, color: "#6b7280", fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
  locValue:              { fontSize: 15, color: "#f8fafc", fontWeight: "700", marginBottom: 4 },
  locRadius:             { fontSize: 12, color: "#4b5563" },
  presets:               { gap: 10, marginBottom: 24 },
  presetBtn:             { backgroundColor: "#1a0a0a", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "#7f1d1d" },
  presetDisabled:        { opacity: 0.5 },
  presetLabel:           { fontSize: 15, fontWeight: "800", color: "#f8fafc", marginBottom: 4 },
  presetMessage:         { fontSize: 12, color: "#6b7280" },
  customBox:             { backgroundColor: "#111827", borderRadius: 14, padding: 16, marginBottom: 24, gap: 12 },
  input:                 { color: "#f8fafc", fontSize: 15, lineHeight: 22, minHeight: 80 },
  sendBtn:               { backgroundColor: "#dc2626", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  sendBtnDisabled:       { backgroundColor: "#4b1414", opacity: 0.6 },
  sendBtnText:           { color: "#fff", fontSize: 16, fontWeight: "800" },
  logBox:                { backgroundColor: "#111827", borderRadius: 14, overflow: "hidden" },
  logRow:                { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937" },
  logLeft:               { flex: 1, marginRight: 12 },
  logMessage:            { fontSize: 13, color: "#f8fafc", fontWeight: "600", marginBottom: 2 },
  logId:                 { fontSize: 10, color: "#374151" },
  logRight:              { alignItems: "flex-end" },
  logTime:               { fontSize: 12, color: "#6b7280", marginBottom: 2 },
  logDelivered:          { fontSize: 11, color: "#22c55e", fontWeight: "600" },
  // Modals
  modalOverlay:          { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalBox:              { backgroundColor: "#111827", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle:            { fontSize: 11, color: "#6b7280", fontWeight: "800", letterSpacing: 2, marginBottom: 8, textTransform: "uppercase" },
  modalOption:           { paddingVertical: 16, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  modalOptionActive:     { backgroundColor: "#1f2937" },
  modalOptionText:       { fontSize: 15, color: "#9ca3af", fontWeight: "600" },
  modalOptionTextActive: { color: "#f8fafc", fontWeight: "800" },
  modalCancel:           { marginTop: 8, paddingVertical: 16, alignItems: "center" },
  modalCancelText:       { fontSize: 15, color: "#ef4444", fontWeight: "700" },
  pauseModalSub:         { fontSize: 12, color: "#4b5563", marginBottom: 16 },
  pauseOption:           { backgroundColor: "#1f2937", borderRadius: 12, paddingVertical: 18, paddingHorizontal: 16, marginBottom: 8 },
  pauseOptionText:       { fontSize: 15, color: "#f8fafc", fontWeight: "700" },
  // Review modal
  reviewHeader:          { fontSize: 18, fontWeight: "900", color: "#f8fafc", marginBottom: 4 },
  reviewSub:             { fontSize: 12, color: "#6b7280", marginBottom: 20 },
  severityBadge:         { borderRadius: 8, padding: 10, alignItems: "center", marginBottom: 16, borderWidth: 1 },
  severityText:          { fontSize: 12, fontWeight: "900", letterSpacing: 2 },
  rawBox:                { backgroundColor: "#0a0a0f", borderRadius: 10, padding: 14, marginBottom: 20 },
  rawLabel:              { fontSize: 9, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 6 },
  rawText:               { fontSize: 13, color: "#9ca3af", lineHeight: 20, fontStyle: "italic" },
  parsedLabel:           { fontSize: 9, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 4 },
  parsedGrid:            { marginBottom: 20 },
  reviewedByBox:         { backgroundColor: "#0d1f0d", borderRadius: 8, padding: 10, alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: "#166534" },
  reviewedByText:        { fontSize: 12, color: "#22c55e", fontWeight: "700", letterSpacing: 0.5 },
  confirmBtn:            { backgroundColor: "#dc2626", borderRadius: 14, paddingVertical: 18, alignItems: "center", marginBottom: 4 },
  confirmBtnText:        { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.5 },
});
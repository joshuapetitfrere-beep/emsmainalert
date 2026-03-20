import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";

const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";

interface Props {
  onSave: (unitId: string, apiKey: string) => void;
  onReset: () => void;
  onBack: () => void;
}

export default function SettingsScreen({ onSave, onReset, onBack }: Props) {
  const [unitId, setUnitId]   = useState("");
  const [apiKey, setApiKey]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [saved, setSaved]     = useState(false);

  async function handleSave() {
    if (!unitId.trim()) { setError("Unit ID is required."); return; }
    if (!apiKey.trim()) { setError("API key is required."); return; }

    setLoading(true);
    setError("");

    try {
      const resp = await fetch(
        `${SERVER_HTTP}/validate-key?api_key=${encodeURIComponent(apiKey.trim())}`,
        { method: "GET" }
      );
      const data = await resp.json();

      if (!resp.ok || !data.valid) {
        setError("Invalid API key. Check with your administrator.");
        setLoading(false);
        return;
      }

      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onSave(unitId.trim().toUpperCase(), apiKey.trim());
      }, 800);

    } catch (e) {
      setError("Could not reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    Alert.alert(
      "Reset Credentials?",
      "This will remove your unit ID and API key. You will need to re-enter them to use EMS mode.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => onReset() },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Unit Settings</Text>
            <View style={{ width: 60 }} />
          </View>

          <Text style={styles.pageTitle}>Credentials</Text>
          <Text style={styles.pageSubtitle}>
            Update your unit ID or API key. Changes will be validated before saving.
          </Text>

          <Text style={styles.label}>UNIT ID</Text>
          <TextInput
            style={styles.input}
            value={unitId}
            onChangeText={(t) => { setUnitId(t); setError(""); setSaved(false); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={30}
            placeholder="e.g. POLK-RESCUE-1"
            placeholderTextColor="#374151"
          />

          <Text style={styles.label}>API KEY</Text>
          <TextInput
            style={styles.input}
            value={apiKey}
            onChangeText={(t) => { setApiKey(t); setError(""); setSaved(false); }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={80}
            placeholder="Enter API key"
            placeholderTextColor="#374151"
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {saved  ? <Text style={styles.savedText}>✓ Saved successfully</Text> : null}

          <TouchableOpacity
            style={[styles.saveBtn, (loading || !unitId.trim() || !apiKey.trim()) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={loading || !unitId.trim() || !apiKey.trim()}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>Validate & Save</Text>
            }
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={styles.dangerLabel}>DANGER ZONE</Text>
          <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.8}>
            <Text style={styles.resetBtnText}>🗑  Reset & Clear Credentials</Text>
          </TouchableOpacity>
          <Text style={styles.resetHint}>
            Removes all saved credentials from this device. You will be taken back to the setup screen.
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#0a0a0f" },
  scroll:          { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 8 },
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28, paddingTop: 8 },
  backBtn:         { padding: 4 },
  backText:        { color: "#ef4444", fontSize: 15, fontWeight: "600" },
  headerTitle:     { fontSize: 15, fontWeight: "800", color: "#f8fafc" },
  pageTitle:       { fontSize: 28, fontWeight: "900", color: "#f8fafc", marginBottom: 8 },
  pageSubtitle:    { fontSize: 13, color: "#64748b", lineHeight: 20, marginBottom: 32 },
  label:           { fontSize: 10, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 8 },
  input:           { backgroundColor: "#111827", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#f8fafc", fontSize: 15, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 20, borderWidth: 1, borderColor: "#1f2937" },
  errorText:       { color: "#ef4444", fontSize: 13, marginBottom: 16, fontWeight: "600" },
  savedText:       { color: "#22c55e", fontSize: 13, marginBottom: 16, fontWeight: "600" },
  saveBtn:         { backgroundColor: "#dc2626", borderRadius: 14, paddingVertical: 18, alignItems: "center", marginBottom: 32 },
  saveBtnDisabled: { backgroundColor: "#4b1414", opacity: 0.6 },
  saveBtnText:     { color: "#fff", fontSize: 16, fontWeight: "900" },
  divider:         { height: 1, backgroundColor: "#1f2937", marginBottom: 24 },
  dangerLabel:     { fontSize: 10, color: "#7f1d1d", fontWeight: "800", letterSpacing: 2, marginBottom: 12 },
  resetBtn:        { backgroundColor: "#1a0a0a", borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#7f1d1d", marginBottom: 10 },
  resetBtnText:    { color: "#ef4444", fontSize: 14, fontWeight: "700" },
  resetHint:       { fontSize: 12, color: "#374151", lineHeight: 18 },
});
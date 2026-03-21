import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, SafeAreaView, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";

interface Props {
  onComplete: () => void;
  onCancel: () => void;
}

export default function SetupScreen({ onComplete, onCancel }: Props) {
  const [unitId, setUnitId]     = useState("");
  const [apiKey, setApiKey]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  async function handleValidate() {
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

      // Save credentials to device
      await AsyncStorage.setItem("ems_unit_id", unitId.trim().toUpperCase());
      await AsyncStorage.setItem("ems_api_key", apiKey.trim());

      onComplete();
    } catch (e) {
      setError("Could not reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <TouchableOpacity style={styles.backBtn} onPress={onCancel}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.iconBox}>
            <Text style={styles.icon}>🚑</Text>
          </View>

          <Text style={styles.title}>EMS Unit Setup</Text>
          <Text style={styles.subtitle}>
            Enter your unit credentials provided by your administrator. These will be saved to this device.
          </Text>

          {/* Unit ID */}
          <Text style={styles.label}>UNIT ID</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. POLK-RESCUE-1"
            placeholderTextColor="#374151"
            value={unitId}
            onChangeText={(t) => { setUnitId(t); setError(""); }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={30}
          />

          {/* API Key */}
          <Text style={styles.label}>API KEY</Text>
          <TextInput
            style={styles.input}
            placeholder="Paste your API key here"
            placeholderTextColor="#374151"
            value={apiKey}
            onChangeText={(t) => { setApiKey(t); setError(""); }}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
            multiline={false}
            maxLength={80}
          />

          {/* Error */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Info box */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              🔐  Credentials are stored locally on this device and never shared. Contact your administrator if you don't have an API key.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (loading || !unitId.trim() || !apiKey.trim()) && styles.submitBtnDisabled]}
            onPress={handleValidate}
            disabled={loading || !unitId.trim() || !apiKey.trim()}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>Validate & Save</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: "#0a0a0f" },
  scroll:            { paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16 },
  backBtn:           { paddingVertical: 4, marginBottom: 32 },
  backText:          { color: "#ef4444", fontSize: 15, fontWeight: "600" },
  iconBox:           { alignItems: "center", marginBottom: 20 },
  icon:              { fontSize: 56 },
  title:             { fontSize: 28, fontWeight: "900", color: "#f8fafc", textAlign: "center", marginBottom: 12 },
  subtitle:          { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 22, marginBottom: 36 },
  label:             { fontSize: 10, color: "#4b5563", fontWeight: "800", letterSpacing: 2, marginBottom: 8 },
  input:             { backgroundColor: "#111827", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: "#f8fafc", fontSize: 15, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 20, borderWidth: 1, borderColor: "#1f2937" },
  errorText:         { color: "#ef4444", fontSize: 13, marginBottom: 16, fontWeight: "600" },
  infoBox:           { backgroundColor: "#111827", borderRadius: 12, padding: 16, borderLeftWidth: 3, borderLeftColor: "#3b82f6", marginBottom: 24 },
  infoText:          { fontSize: 13, color: "#64748b", lineHeight: 20 },
  submitBtn:         { backgroundColor: "#dc2626", borderRadius: 14, paddingVertical: 18, alignItems: "center" },
  submitBtnDisabled: { backgroundColor: "#4b1414", opacity: 0.6 },
  submitText:        { color: "#fff", fontSize: 16, fontWeight: "900" },
});
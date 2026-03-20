import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, SafeAreaView,
} from "react-native";
import CivilianScreen from "./screens/CivilianScreen";
import EMSScreen from "./screens/EMSScreen";
import SetupScreen from "./screens/SetupScreen";
import SettingsScreen from "./screens/Settingsscreen";

type Screen = "home" | "civilian" | "ems" | "setup" | "settings";

export default function App() {
  const [screen, setScreen]   = useState<Screen>("home");
  const [emsUnitId, setEmsUnitId] = useState<string>("");
  const [emsApiKey, setEmsApiKey] = useState<string>("");
  const emsReady = !!emsUnitId && !!emsApiKey;

  function handleEMSPress() {
    if (emsReady) {
      setScreen("ems");
    } else {
      setScreen("setup");
    }
  }

  function handleSetupComplete(unitId: string, apiKey: string) {
    setEmsUnitId(unitId);
    setEmsApiKey(apiKey);
    setScreen("ems");
  }

  function handleSettingsSave(unitId: string, apiKey: string) {
    setEmsUnitId(unitId);
    setEmsApiKey(apiKey);
    setScreen("ems");
  }

  function handleSettingsReset() {
    setEmsUnitId("");
    setEmsApiKey("");
    setScreen("home");
  }

  if (screen === "civilian") return <CivilianScreen onExit={() => setScreen("home")} />;
  if (screen === "ems")      return <EMSScreen emsUnitId={emsUnitId} emsApiKey={emsApiKey} onExit={() => setScreen("home")} onOpenSettings={() => setScreen("settings")} />;
  if (screen === "setup")    return <SetupScreen onComplete={handleSetupComplete} onCancel={() => setScreen("home")} />;
  if (screen === "settings") return <SettingsScreen onSave={handleSettingsSave} onReset={handleSettingsReset} onBack={() => setScreen("ems")} />;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>POLK COUNTY</Text>
        </View>
        <Text style={styles.title}>EMS{"\n"}Alert</Text>
        <Text style={styles.subtitle}>Select your role to continue</Text>

        <View style={styles.cards}>

          <TouchableOpacity
            style={[styles.card, styles.civilianCard]}
            onPress={() => setScreen("civilian")}
            activeOpacity={0.85}
          >
            <Text style={styles.cardIcon}>🚗</Text>
            <Text style={styles.cardTitle}>Civilian</Text>
            <Text style={styles.cardDesc}>
              Receive real-time alerts when an EMS vehicle is approaching your location.
            </Text>
            <View style={styles.cardArrow}>
              <Text style={styles.cardArrowText}>Enter →</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.card, styles.emsCard]}
            onPress={handleEMSPress}
            activeOpacity={0.85}
          >
            <Text style={styles.cardIcon}>🚑</Text>
            <Text style={styles.cardTitle}>EMS Driver</Text>
            <Text style={styles.cardDesc}>
              Broadcast alerts to civilians in your path. Authorized personnel only.
            </Text>
            <View style={[styles.cardArrow, styles.cardArrowEms]}>
              <Text style={[styles.cardArrowText, { color: "#dc2626" }]}>
                {emsReady ? "Enter →" : "Setup →"}
              </Text>
            </View>
          </TouchableOpacity>

        </View>

        <Text style={styles.footer}>emsmainalert-production.up.railway.app</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#0a0f1e" },
  inner:        { flex: 1, paddingHorizontal: 24, paddingTop: Platform.OS === "ios" ? 20 : 40, alignItems: "center" },
  badge:        { backgroundColor: "#1e3a5f", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 20 },
  badgeText:    { color: "#60a5fa", fontSize: 11, fontWeight: "800", letterSpacing: 3 },
  title:        { fontSize: 64, fontWeight: "900", color: "#f8fafc", lineHeight: 64, textAlign: "center", marginBottom: 12 },
  subtitle:     { fontSize: 15, color: "#475569", marginBottom: 48 },
  cards:        { width: "100%", gap: 16 },
  card:         { borderRadius: 20, padding: 24, width: "100%" },
  civilianCard: { backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#334155" },
  emsCard:      { backgroundColor: "#1a0a0a", borderWidth: 1, borderColor: "#7f1d1d" },
  cardIcon:     { fontSize: 36, marginBottom: 12 },
  cardTitle:    { fontSize: 22, fontWeight: "800", color: "#f8fafc", marginBottom: 8 },
  cardDesc:     { fontSize: 14, color: "#64748b", lineHeight: 22, marginBottom: 20 },
  cardArrow:    { backgroundColor: "#0f172a", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-start" },
  cardArrowEms: { backgroundColor: "#2d0a0a" },
  cardArrowText:{ color: "#60a5fa", fontWeight: "700", fontSize: 14 },
  footer:       { position: "absolute", bottom: 24, fontSize: 11, color: "#1e293b" },
});
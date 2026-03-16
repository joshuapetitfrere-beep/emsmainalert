import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, RefreshControl, SafeAreaView, ActivityIndicator,
} from "react-native";
import MapView, { Marker, Circle, PROVIDER_DEFAULT } from "react-native-maps";

const SERVER_HTTP = "https://emsmainalert-production.up.railway.app";
const REFRESH_INTERVAL = 10000;

interface AlertEntry {
  id: string;
  ems_unit: string;
  message: string;
  lat: number;
  lon: number;
  radius_miles: number;
  sent_at: string;
  ws_sent: number;
}

interface Props {
  onBack: () => void;
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if (lat == null || lon == null) return "Unknown location";
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      {
        headers: {
          "User-Agent": "ClearPathApp/1.0 (polkcounty.ems.alert@gmail.com)",
          "Accept-Language": "en"
        }
      }
    );
    const data = await resp.json();
    const addr = data.address;
    if (!addr) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const road = addr.road || addr.street || addr.highway || "";
    const city = addr.city || addr.town || addr.village || addr.county || "";
    return road ? `${road}${city ? ", " + city : ""}` : `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr + "Z").getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ActiveAlertsScreen({ onBack }: Props) {
  const [alerts, setAlerts]               = useState<AlertEntry[]>([]);
  const [addresses, setAddresses]         = useState<Record<string, string>>({});
  const [selectedAlert, setSelectedAlert] = useState<AlertEntry | null>(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [tab, setTab]                     = useState<"list" | "map">("list");
  const mapRef                            = useRef<MapView>(null);
  const intervalRef                       = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const resp = await fetch(`${SERVER_HTTP}/alerts`);
      const data = await resp.json();
      const fetched: AlertEntry[] = data.alerts || [];
      setAlerts(fetched);

      for (const alert of fetched) {
        if (!addresses[alert.id] && alert.lat != null && alert.lon != null) {
          await new Promise(r => setTimeout(r, 1000));
          const addr = await reverseGeocode(alert.lat, alert.lon);
          setAddresses(prev => ({ ...prev, [alert.id]: addr }));
        }
      }
    } catch (e) {
      console.error("Failed to fetch alerts:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addresses]);

  useEffect(() => {
    fetchAlerts();
    intervalRef.current = setInterval(() => fetchAlerts(true), REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function onSelectAlert(alert: AlertEntry) {
    setSelectedAlert(alert);
    setTab("map");
    setTimeout(() => {
      mapRef.current?.animateToRegion({
        latitude: alert.lat,
        longitude: alert.lon,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 500);
    }, 100);
  }

  const recentAlerts = alerts.slice(0, 20);
  const activeAlerts = recentAlerts.filter(a => {
    const diff = (Date.now() - new Date(a.sent_at + "Z").getTime()) / 1000 / 60;
    return diff < 30;
  });

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Active Alerts</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeAlerts.length} active</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === "list" && styles.tabActive]}
          onPress={() => setTab("list")}
        >
          <Text style={[styles.tabText, tab === "list" && styles.tabTextActive]}>List</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "map" && styles.tabActive]}
          onPress={() => setTab("map")}
        >
          <Text style={[styles.tabText, tab === "map" && styles.tabTextActive]}>Map</Text>
        </TouchableOpacity>
      </View>

      {tab === "list" && (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#ef4444" size="large" />
            <Text style={styles.loadingText}>Loading alerts...</Text>
          </View>
        ) : recentAlerts.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>No active alerts</Text>
            <Text style={styles.emptySubtitle}>All clear in Polk County</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchAlerts(); }}
                tintColor="#ef4444"
              />
            }
          >
            {recentAlerts.map((alert) => {
              const isRecent = (Date.now() - new Date(alert.sent_at + "Z").getTime()) / 1000 / 60 < 30;
              return (
                <TouchableOpacity
                  key={alert.id}
                  style={[styles.alertCard, isRecent && styles.alertCardActive]}
                  onPress={() => onSelectAlert(alert)}
                  activeOpacity={0.8}
                >
                  <View style={styles.alertCardLeft}>
                    <View style={styles.alertCardHeader}>
                      {isRecent && <View style={styles.activeDot} />}
                      <Text style={styles.alertUnit}>{alert.ems_unit}</Text>
                      <Text style={styles.alertTime}>{timeAgo(alert.sent_at)}</Text>
                    </View>
                    <Text style={styles.alertMessage} numberOfLines={2}>{alert.message}</Text>
                    <Text style={styles.alertAddress} numberOfLines={1}>
                      📍 {addresses[alert.id] || "Loading address..."}
                    </Text>
                    <Text style={styles.alertMeta}>
                      {alert.ws_sent} notified · {alert.radius_miles}mi radius
                    </Text>
                  </View>
                  <Text style={styles.alertChevron}>›</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.listFooter}>Showing last 20 alerts · Updates every 10s</Text>
          </ScrollView>
        )
      )}

      {tab === "map" && (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              latitude: selectedAlert?.lat ?? 28.0395,
              longitude: selectedAlert?.lon ?? -81.9498,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
            mapType="standard"
          >
            {recentAlerts.filter(a => a.lat != null && a.lon != null).map((alert) => {
              const isRecent = (Date.now() - new Date(alert.sent_at + "Z").getTime()) / 1000 / 60 < 30;
              return (
                <React.Fragment key={alert.id}>
                  <Marker
                    coordinate={{ latitude: alert.lat, longitude: alert.lon }}
                    title={alert.ems_unit}
                    description={addresses[alert.id] || alert.message}
                    pinColor={isRecent ? "#ef4444" : "#94a3b8"}
                    onPress={() => setSelectedAlert(alert)}
                  />
                  {isRecent && (
                    <Circle
                      center={{ latitude: alert.lat, longitude: alert.lon }}
                      radius={alert.radius_miles * 1609.34}
                      fillColor="rgba(239,68,68,0.08)"
                      strokeColor="rgba(239,68,68,0.3)"
                      strokeWidth={1}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </MapView>

          {selectedAlert && (
            <View style={styles.mapCard}>
              <View style={styles.mapCardHeader}>
                <Text style={styles.mapCardUnit}>{selectedAlert.ems_unit}</Text>
                <TouchableOpacity onPress={() => setSelectedAlert(null)}>
                  <Text style={styles.mapCardClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.mapCardMessage}>{selectedAlert.message}</Text>
              <Text style={styles.mapCardAddress}>
                📍 {addresses[selectedAlert.id] || "Loading address..."}
              </Text>
              <Text style={styles.mapCardMeta}>
                {timeAgo(selectedAlert.sent_at)} · {selectedAlert.ws_sent} notified
              </Text>
            </View>
          )}
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#0a0f1e" },
  header:           { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 },
  backBtn:          { padding: 4 },
  backText:         { color: "#60a5fa", fontSize: 15, fontWeight: "600" },
  headerTitle:      { fontSize: 17, fontWeight: "800", color: "#f8fafc" },
  badge:            { backgroundColor: "#1a0a0a", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#7f1d1d" },
  badgeText:        { color: "#ef4444", fontSize: 11, fontWeight: "700" },
  tabs:             { flexDirection: "row", marginHorizontal: 24, backgroundColor: "#1e293b", borderRadius: 12, padding: 4, marginBottom: 16 },
  tab:              { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive:        { backgroundColor: "#0f172a" },
  tabText:          { color: "#475569", fontWeight: "600", fontSize: 14 },
  tabTextActive:    { color: "#f8fafc" },
  scroll:           { flex: 1 },
  scrollContent:    { paddingHorizontal: 24, paddingBottom: 32 },
  center:           { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText:      { color: "#475569", fontSize: 14 },
  emptyIcon:        { fontSize: 48 },
  emptyTitle:       { fontSize: 20, fontWeight: "800", color: "#f8fafc" },
  emptySubtitle:    { fontSize: 14, color: "#475569" },
  alertCard:        { backgroundColor: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#1e293b" },
  alertCardActive:  { borderColor: "#7f1d1d", backgroundColor: "#1a0a0a" },
  alertCardLeft:    { flex: 1 },
  alertCardHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  activeDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },
  alertUnit:        { fontSize: 13, fontWeight: "800", color: "#f8fafc", flex: 1 },
  alertTime:        { fontSize: 11, color: "#475569" },
  alertMessage:     { fontSize: 14, color: "#94a3b8", marginBottom: 6, lineHeight: 20 },
  alertAddress:     { fontSize: 12, color: "#60a5fa", marginBottom: 4 },
  alertMeta:        { fontSize: 11, color: "#334155" },
  alertChevron:     { color: "#334155", fontSize: 24, marginLeft: 8 },
  listFooter:       { textAlign: "center", color: "#1e293b", fontSize: 11, marginTop: 8 },
  mapContainer:     { flex: 1 },
  map:              { flex: 1 },
  mapCard:          { position: "absolute", bottom: 24, left: 16, right: 16, backgroundColor: "#0f172a", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#7f1d1d" },
  mapCardHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  mapCardUnit:      { fontSize: 14, fontWeight: "800", color: "#ef4444" },
  mapCardClose:     { color: "#475569", fontSize: 18, padding: 4 },
  mapCardMessage:   { fontSize: 14, color: "#f8fafc", marginBottom: 6 },
  mapCardAddress:   { fontSize: 13, color: "#60a5fa", marginBottom: 4 },
  mapCardMeta:      { fontSize: 11, color: "#475569" },
});

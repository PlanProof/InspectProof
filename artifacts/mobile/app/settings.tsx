import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  Platform, Switch, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationsContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

function SettingRow({
  icon, label, sublabel, onPress, value, toggle, danger,
}: {
  icon: string; label: string; sublabel?: string;
  onPress?: () => void; value?: string;
  toggle?: { value: boolean; onChange: (v: boolean) => void };
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress && { opacity: 0.75 }]}
      disabled={!onPress && !toggle}
    >
      <View style={[styles.rowIcon, danger && { backgroundColor: Colors.dangerLight }]}>
        <Feather name={icon as any} size={17} color={danger ? Colors.danger : Colors.secondary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, danger && { color: Colors.danger }]}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          trackColor={{ false: Colors.border, true: Colors.secondary }}
          thumbColor="#fff"
        />
      ) : value ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : onPress ? (
        <Feather name="chevron-right" size={16} color={danger ? Colors.danger : Colors.textTertiary} />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { prefs, updatePrefs } = useNotifications();
  const [compactCards, setCompactCards] = useState(false);
  const [show24h, setShow24h] = useState(false);

  const handleClearCache = () => {
    Alert.alert("Clear Cache", "This will clear locally cached data and reload from the server.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", onPress: () => Alert.alert("Done", "Cache cleared.") },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Settings</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.group}>
            <SettingRow icon="user" label="Profile" sublabel={`${user?.firstName} ${user?.lastName}`} onPress={() => {}} />
            <SettingRow icon="mail" label="Email" value={user?.email} />
            <SettingRow icon="shield" label="Role" value={user?.role?.toUpperCase()} />
          </View>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.group}>
            <SettingRow
              icon="bell"
              label="Inspection Reminders"
              sublabel="Get notified before scheduled inspections"
              toggle={{ value: prefs.remindersEnabled, onChange: (v) => updatePrefs({ remindersEnabled: v }) }}
            />
            <SettingRow
              icon="alert-circle"
              label="Issue Alerts"
              sublabel="Notify when issues are raised or resolved"
              value="Via reminders"
            />
            <SettingRow
              icon="settings"
              label="Notification Preferences"
              sublabel="Manage all notification settings"
              onPress={() => router.push("/notifications" as any)}
            />
          </View>
        </View>

        {/* Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display</Text>
          <View style={styles.group}>
            <SettingRow
              icon="layout"
              label="Compact Inspection Cards"
              sublabel="Show smaller cards on the home timeline"
              toggle={{ value: compactCards, onChange: setCompactCards }}
            />
            <SettingRow
              icon="clock"
              label="24-Hour Time Format"
              sublabel="Display times in 24h format"
              toggle={{ value: show24h, onChange: setShow24h }}
            />
          </View>
        </View>

        {/* Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <View style={styles.group}>
            <SettingRow icon="refresh-cw" label="Clear Local Cache" sublabel="Force-refresh from server" onPress={handleClearCache} />
            <SettingRow icon="database" label="App Version" value="1.0.0" />
            <SettingRow icon="globe" label="Region" value="Australia" />
          </View>
        </View>

        {/* Compliance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compliance</Text>
          <View style={styles.group}>
            <SettingRow icon="book" label="NCC Edition" value="NCC 2022" />
            <SettingRow icon="check-circle" label="BCA Compliance" value="Enabled" />
            <SettingRow icon="map-pin" label="Jurisdiction" value="National" />
          </View>
        </View>

        {/* Account Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.group}>
            <SettingRow icon="help-circle" label="Help & Support" onPress={() => router.push("/help" as any)} />
            <SettingRow icon="log-out" label="Sign Out" onPress={logout} danger />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  content: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase",
    letterSpacing: 1, paddingHorizontal: 4,
  },
  group: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  rowSublabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, marginTop: 2 },
  rowValue: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
});

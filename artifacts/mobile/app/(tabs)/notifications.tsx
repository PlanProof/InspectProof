import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useNotifications, ReminderMinutes } from "@/context/NotificationsContext";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

const REMINDER_OPTIONS: { value: ReminderMinutes; label: string }[] = [
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
];


export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { prefs, updatePrefs, permissionGranted, requestPermission, cancelAllReminders, updateAssignmentPref } = useNotifications();
  const { token: authToken } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  const handleToggleReminders = async (value: boolean) => {
    setPermDenied(false);
    if (value && !permissionGranted) {
      setRequesting(true);
      const granted = await requestPermission();
      setRequesting(false);
      if (!granted) {
        setPermDenied(true);
        return;
      }
    }
    await updatePrefs({ remindersEnabled: value });
    if (!value) await cancelAllReminders();
  };

  const handleToggleAssignment = async (value: boolean) => {
    await updateAssignmentPref(value, authToken ?? "");
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + WEB_TOP + 16, paddingBottom: tabBarHeight + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
        >
          <Feather name="chevron-left" size={22} color={Colors.primary} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Inspection Assignment Notifications */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconWrap, { backgroundColor: "#EBF5FF" }]}>
            <Feather name="send" size={18} color={Colors.secondary} />
          </View>
          <View style={styles.rowLabel}>
            <Text style={styles.rowTitle}>New Booking Alerts</Text>
            <Text style={styles.rowSub}>
              Get notified when you're assigned an inspection
            </Text>
          </View>
          <Switch
            value={prefs.notifyOnAssignment}
            onValueChange={handleToggleAssignment}
            trackColor={{ false: Colors.border, true: Colors.secondary }}
            thumbColor={prefs.notifyOnAssignment ? Colors.accent : "#f4f3f4"}
          />
        </View>
      </View>

      {/* Reminders Toggle */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.iconWrap}>
            <Feather name="bell" size={18} color={Colors.secondary} />
          </View>
          <View style={styles.rowLabel}>
            <Text style={styles.rowTitle}>Inspection Reminders</Text>
            <Text style={styles.rowSub}>
              Get notified before each scheduled inspection
            </Text>
          </View>
          <Switch
            value={prefs.remindersEnabled}
            onValueChange={handleToggleReminders}
            disabled={requesting}
            trackColor={{ false: Colors.border, true: Colors.secondary }}
            thumbColor={prefs.remindersEnabled ? Colors.accent : "#f4f3f4"}
          />
        </View>

        {permDenied && (
          <View style={styles.permBanner}>
            <Feather name="alert-triangle" size={14} color="#D69E2E" />
            <Text style={styles.permText}>
              Permission denied. Please enable notifications for InspectProof in your device Settings app.
            </Text>
            <Pressable onPress={() => setPermDenied(false)} style={{ padding: 4 }}>
              <Feather name="x" size={14} color="#D69E2E" />
            </Pressable>
          </View>
        )}
        {!permissionGranted && !permDenied && (
          <View style={styles.permBanner}>
            <Feather name="alert-triangle" size={14} color="#D69E2E" />
            <Text style={styles.permText}>
              Notification permission not granted. Tap the toggle to enable.
            </Text>
          </View>
        )}
      </View>

      {/* Reminder Timing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Remind me</Text>
        <View style={styles.optionGroup}>
          {REMINDER_OPTIONS.map((opt) => {
            const selected = prefs.reminderMinutesBefore === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => updatePrefs({ reminderMinutesBefore: opt.value })}
                style={({ pressed }) => [
                  styles.optionRow,
                  selected && styles.optionRowSelected,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                  {opt.label}
                </Text>
                {selected && <Feather name="check" size={15} color={Colors.secondary} style={{ marginLeft: "auto" }} />}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          You'll receive a notification at this interval before each booked inspection.
        </Text>
      </View>

      {/* About */}
      <View style={styles.aboutCard}>
        <Feather name="info" size={14} color={Colors.textTertiary} />
        <Text style={styles.aboutText}>
          New booking alerts are sent instantly when an admin assigns you an inspection. Reminders are scheduled locally on your device.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 9,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  rowLabel: { flex: 1 },
  rowTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  permBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFF0",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#ECC94B40",
  },
  permText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#D69E2E",
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 4,
  },
  optionGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  optionRowSelected: { backgroundColor: Colors.infoLight },
  radio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  radioSelected: { borderColor: Colors.secondary },
  radioDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Colors.secondary,
  },
  optionText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  optionTextSelected: { color: Colors.secondary },
  hint: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
  aboutCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.borderLight,
    borderRadius: 12,
    padding: 14,
  },
  aboutText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    lineHeight: 18,
  },
});

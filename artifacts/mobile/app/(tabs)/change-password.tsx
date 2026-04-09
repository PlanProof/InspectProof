import React, { useState } from "react";
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Platform, ActivityIndicator, Alert,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { safeBack } from "@/constants/routes";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

function PasswordField({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldRow}>
        <TextInput
          style={styles.fieldInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? ""}
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Pressable onPress={() => setShow(s => !s)} style={styles.eyeBtn}>
          <Feather name={show ? "eye-off" : "eye"} size={17} color={Colors.textTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const getBaseUrl = () =>
    process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
      : "";

  const handleSave = async () => {
    setError("");
    if (!current) { setError("Please enter your current password."); return; }
    if (!newPw) { setError("Please enter a new password."); return; }
    if (newPw.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (newPw !== confirm) { setError("Passwords don't match. Please try again."); return; }
    if (newPw === current) { setError("New password must be different from your current password."); return; }

    setSaving(true);
    try {
      const r = await fetch(`${getBaseUrl()}/api/auth/change-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.message ?? "Failed to change password.");
        return;
      }
      Alert.alert("Password changed", "Your password has been updated successfully.", [
        { text: "OK", onPress: () => safeBack("/(tabs)/settings") },
      ]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const strength = (() => {
    if (!newPw) return null;
    if (newPw.length < 8) return { label: "Too short", color: Colors.danger, width: "20%" };
    const checks = [/[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
    const passed = checks.filter(r => r.test(newPw)).length;
    if (passed === 0) return { label: "Weak", color: Colors.danger, width: "35%" };
    if (passed === 1) return { label: "Fair", color: Colors.warning, width: "60%" };
    if (passed === 2) return { label: "Good", color: Colors.success, width: "80%" };
    return { label: "Strong", color: Colors.success, width: "100%" };
  })();

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <Pressable onPress={() => safeBack("/(tabs)/settings")} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Change Password</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 8 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Choose a strong password with a mix of letters, numbers, and symbols.
        </Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.group}>
          <PasswordField label="Current password" value={current} onChange={setCurrent} placeholder="Your current password" />
          <PasswordField label="New password" value={newPw} onChange={setNewPw} placeholder="At least 8 characters" />

          {strength && (
            <View style={styles.strengthWrap}>
              <View style={styles.strengthBar}>
                <View style={[styles.strengthFill, { width: strength.width as any, backgroundColor: strength.color }]} />
              </View>
              <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
            </View>
          )}

          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} placeholder="Repeat new password" />
        </View>

        <View style={styles.hints}>
          <Text style={styles.hintTitle}>Password requirements</Text>
          {[
            { rule: newPw.length >= 8, text: "At least 8 characters" },
            { rule: /[A-Z]/.test(newPw), text: "One uppercase letter" },
            { rule: /[0-9]/.test(newPw), text: "One number" },
            { rule: /[^A-Za-z0-9]/.test(newPw), text: "One special character (recommended)" },
          ].map(h => (
            <View key={h.text} style={styles.hintRow}>
              <Feather
                name={h.rule ? "check-circle" : "circle"}
                size={13}
                color={h.rule ? Colors.success : Colors.textTertiary}
              />
              <Text style={[styles.hintText, h.rule && { color: Colors.text }]}>{h.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }, saving && { opacity: 0.6 }]}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.submitBtnText}>Update Password</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },

  content: { padding: 16, gap: 20 },

  intro: {
    fontSize: 14, color: Colors.textSecondary,
    fontFamily: "PlusJakartaSans_400Regular", lineHeight: 20,
  },

  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: 10, padding: 12,
  },
  errorText: { color: Colors.danger, fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", flex: 1 },

  group: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },

  field: { padding: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  fieldLabel: {
    fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4,
  },
  fieldRow: { flexDirection: "row", alignItems: "center" },
  fieldInput: {
    flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text, padding: 0,
  },
  eyeBtn: { padding: 4 },

  strengthWrap: {
    paddingHorizontal: 14, paddingBottom: 12,
    flexDirection: "row", alignItems: "center", gap: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  strengthBar: {
    flex: 1, height: 4, backgroundColor: Colors.borderLight, borderRadius: 2, overflow: "hidden",
  },
  strengthFill: { height: "100%", borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", width: 52, textAlign: "right" },

  hints: { gap: 8 },
  hintTitle: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.8,
  },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hintText: { fontSize: 13, color: Colors.textTertiary, fontFamily: "PlusJakartaSans_400Regular" },

  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 16, alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
});

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function SetPasswordScreen() {
  const { token, refreshUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const getBaseUrl = () =>
    process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
      : "";

  const handleSubmit = async () => {
    setError("");

    if (!newPassword || !confirm) {
      setError("Please fill in both fields.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const authToken = token ?? (await AsyncStorage.getItem("auth_token"));
      const res = await fetch(`${getBaseUrl()}/api/auth/set-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Failed to set password. Please try again.");
        return;
      }

      await refreshUser();
      router.replace("/(tabs)");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Feather name="shield" size={26} color="#F2F3F4" />
          </View>
          <Text style={styles.title}>Set your password</Text>
          <Text style={styles.subtitle}>
            Welcome to InspectProof! Please create a secure password for your account before continuing.
          </Text>
        </View>

        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputWrapper}>
              <Feather name="lock" size={16} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoFocus
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={Colors.textTertiary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={[
              styles.inputWrapper,
              confirm && confirm !== newPassword ? styles.inputWrapperError : null,
            ]}>
              <Feather name="lock" size={16} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Repeat your password"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowConfirm(!showConfirm)} style={styles.eyeButton}>
                <Feather name={showConfirm ? "eye-off" : "eye"} size={16} color={Colors.textTertiary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              submitting && { opacity: 0.7 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Feather name="check-circle" size={16} color={Colors.primary} />
                <Text style={styles.submitButtonText}>Set Password &amp; Continue</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.hint}>
          <Feather name="info" size={12} color="rgba(255,255,255,0.3)" />
          <Text style={styles.hintText}>
            You only need to do this once. Choose a password you'll remember.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    gap: 28,
    alignItems: "stretch",
  },
  header: { alignItems: "center", gap: 12 },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.dangerLight,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.danger,
    flex: 1,
  },
  field: { gap: 6 },
  label: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
  },
  inputWrapperError: {
    borderColor: Colors.danger,
  },
  inputIcon: { marginRight: 8 },
  input: {
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text,
  },
  eyeButton: { padding: 4 },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 4,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  hintText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
    flex: 1,
  },
});

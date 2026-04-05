import React, { useState, useEffect } from "react";
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
import { getApiUrl } from "@/constants/api";

const WEB_TOP = 0;

export default function LoginScreen() {
  const { user, isLoading, login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [forgotError, setForgotError] = useState("");

  useEffect(() => {
    if (!isLoading && user) {
      if (user.requiresPasswordChange) {
        router.replace("/set-password" as any);
      } else {
        router.replace("/(tabs)");
      }
    }
  }, [user, isLoading]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const loggedInUser = await login(email.trim(), password);
      if (loggedInUser?.requiresPasswordChange) {
        router.replace("/set-password" as any);
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email address.");
      return;
    }
    setForgotError("");
    setForgotStatus("loading");
    try {
      const res = await fetch(getApiUrl("/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      if (res.ok) {
        setForgotStatus("sent");
      } else {
        const data = await res.json().catch(() => ({}));
        setForgotError(data.message || "Something went wrong. Please try again.");
        setForgotStatus("error");
      }
    } catch {
      setForgotError("Something went wrong. Please try again.");
      setForgotStatus("error");
    }
  };

  if (forgotMode) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + WEB_TOP + 24, paddingBottom: insets.bottom + 32 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => { setForgotMode(false); setForgotStatus("idle"); setForgotError(""); }} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
            <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.7)" />
            <Text style={styles.backText}>Back to sign in</Text>
          </Pressable>

          <View style={styles.header}>
            <View style={styles.logoBadge}>
              <Feather name="lock" size={22} color="#F2F3F4" />
            </View>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subtitle}>Enter your email to receive a reset link</Text>
          </View>

          <View style={styles.card}>
            {forgotStatus === "sent" ? (
              <View style={{ alignItems: "center", gap: 12, paddingVertical: 8 }}>
                <View style={styles.successBadge}>
                  <Feather name="check-circle" size={28} color={Colors.accent} />
                </View>
                <Text style={styles.successTitle}>Check your email</Text>
                <Text style={styles.successBody}>
                  If an account exists for {forgotEmail}, you'll receive a reset link shortly. Check your spam folder if it doesn't arrive.
                </Text>
                <Pressable
                  onPress={() => { setForgotMode(false); setForgotStatus("idle"); setForgotEmail(""); }}
                  style={({ pressed }) => [styles.loginButton, pressed && { opacity: 0.85 }, { marginTop: 8 }]}
                >
                  <Text style={styles.loginButtonText}>Back to Sign In</Text>
                  <Feather name="arrow-right" size={16} color={Colors.primary} />
                </Pressable>
              </View>
            ) : (
              <>
                {forgotStatus === "error" && forgotError ? (
                  <View style={styles.errorBox}>
                    <Feather name="alert-circle" size={14} color={Colors.danger} />
                    <Text style={styles.errorText}>{forgotError}</Text>
                  </View>
                ) : null}
                <View style={styles.field}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <Feather name="mail" size={16} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      value={forgotEmail}
                      onChangeText={setForgotEmail}
                      placeholder="you@example.com.au"
                      placeholderTextColor={Colors.textTertiary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoFocus
                    />
                  </View>
                </View>
                <Pressable
                  onPress={handleForgotSubmit}
                  disabled={forgotStatus === "loading"}
                  style={({ pressed }) => [
                    styles.loginButton,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    forgotStatus === "loading" && { opacity: 0.7 },
                  ]}
                >
                  {forgotStatus === "loading" ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <Text style={styles.loginButtonText}>Send reset link</Text>
                      <Feather name="send" size={16} color={Colors.primary} />
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + WEB_TOP + 24, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back */}
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}>
          <Feather name="arrow-left" size={20} color="rgba(255,255,255,0.7)" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Feather name="clipboard" size={22} color="#F2F3F4" />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your InspectProof account</Text>
        </View>

        {/* Form Card */}
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Feather name="mail" size={16} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@company.com"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.field}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={styles.label}>Password</Text>
              <Pressable onPress={() => { setForgotEmail(email); setForgotMode(true); }}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            </View>
            <View style={styles.inputWrapper}>
              <Feather name="lock" size={16} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={Colors.textTertiary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={submitting}
            style={({ pressed }) => [
              styles.loginButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              submitting && { opacity: 0.7 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Text style={styles.loginButtonText}>Sign In</Text>
                <Feather name="arrow-right" size={16} color={Colors.primary} />
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            onPress={() => router.replace("/register" as any)}
            style={({ pressed }) => [styles.registerBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="user-plus" size={15} color={Colors.textSecondary} />
            <Text style={styles.registerBtnText}>Create a new account</Text>
          </Pressable>

          <View style={styles.inviteHint}>
            <Feather name="mail" size={12} color="rgba(255,255,255,0.35)" />
            <Text style={styles.inviteHintText}>Received an invitation? Tap above to set up your account.</Text>
          </View>
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
    gap: 24,
  },
  backBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
  },
  backText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.7)" },
  header: { alignItems: "center", gap: 10 },
  logoBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.secondary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 26, fontFamily: "PlusJakartaSans_600SemiBold", color: "#FFFFFF", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.5)", textAlign: "center" },
  card: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 24, gap: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 8,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.dangerLight, borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: Colors.dangerBorder,
  },
  errorText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger, flex: 1 },
  field: { gap: 6 },
  label: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  forgotLink: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  inputWrapper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.background, paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 13, fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  eyeButton: { padding: 4 },
  loginButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 15, marginTop: 4,
  },
  loginButtonText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.borderLight },
  dividerText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  registerBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12, paddingVertical: 13,
  },
  registerBtnText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  inviteHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingTop: 4,
  },
  inviteHintText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "rgba(255,255,255,0.35)", textAlign: "center", flex: 1 },
  successBadge: { width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(197,217,45,0.15)", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  successBody: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
});

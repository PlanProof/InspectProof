import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

function getBaseUrl() {
  return process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
}

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { user, token } = useAuth();

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || null;
  const charCount = message.trim().length;
  const canSend = charCount > 0 && charCount <= 2000 && !sending && !sent;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Failed to send feedback. Please try again.");
      } else {
        setSent(true);
        setMessage("");
      }
    } catch {
      setError("Unable to reach the server. Please check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setSent(false);
    setMessage("");
    setError(null);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Send Feedback</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={[styles.scroll, { flex: 1 }]}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Feather name="message-circle" size={22} color={Colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>We'd love to hear from you</Text>
            <Text style={styles.introBody}>
              Share a bug, suggest a feature, or tell us what's working well. Your feedback goes
              directly to the InspectProof team.
            </Text>
          </View>
        </View>

        {/* Sender info */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sending as</Text>
          <View style={styles.senderCard}>
            <View style={styles.senderAvatar}>
              <Text style={styles.senderAvatarText}>
                {(user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              {fullName ? <Text style={styles.senderName}>{fullName}</Text> : null}
              <Text style={styles.senderEmail}>{user?.email ?? "Not signed in"}</Text>
            </View>
          </View>
        </View>

        {/* Message input */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Your message</Text>
          <TextInput
            style={[styles.input, (sent || sending) && styles.inputDisabled]}
            value={message}
            onChangeText={(t) => {
              setMessage(t);
              if (error) setError(null);
            }}
            placeholder="Tell us what's on your mind…"
            placeholderTextColor={Colors.textTertiary}
            multiline
            maxLength={2000}
            editable={!sent && !sending}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, charCount > 1800 && { color: Colors.warning }]}>
            {charCount} / 2000
          </Text>
        </View>

        {/* Error banner */}
        {error ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={Colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Success banner */}
        {sent ? (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={16} color={Colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Feedback sent!</Text>
              <Text style={styles.successBody}>
                Thanks for taking the time — we'll review your message shortly.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actions}>
          {sent ? (
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.btnSecondaryText}>Send another message</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSend}
              disabled={!canSend}
              style={({ pressed }) => [
                styles.btnPrimary,
                !canSend && styles.btnDisabled,
                pressed && canSend && { opacity: 0.85 },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Feather name="send" size={16} color={Colors.primary} />
              )}
              <Text style={styles.btnPrimaryText}>
                {sending ? "Sending…" : "Send Feedback"}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.btnGhostText}>Back to More</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.text,
  },

  scroll: { flex: 1 },
  content: { padding: 16, gap: 20 },

  introCard: {
    backgroundColor: Colors.infoLight,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  introIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    marginBottom: 4,
  },
  introBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
    lineHeight: 19,
  },

  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 2,
  },

  senderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  senderAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.secondary + "25",
    alignItems: "center",
    justifyContent: "center",
  },
  senderAvatarText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  senderName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  senderEmail: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
  },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text,
    minHeight: 140,
  },
  inputDisabled: {
    opacity: 0.55,
  },
  charCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textTertiary,
    textAlign: "right",
    paddingHorizontal: 2,
  },

  errorBanner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: Colors.dangerLight,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.danger + "40",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.danger,
    lineHeight: 19,
  },

  successBanner: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: Colors.successLight,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.success + "40",
  },
  successTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.success,
    marginBottom: 2,
  },
  successBody: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  actions: { gap: 10 },

  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.primary,
  },

  btnSecondary: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },

  btnGhost: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  btnGhostText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
  },
});

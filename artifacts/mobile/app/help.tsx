import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  TextInput, ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/hooks/use-auth";

const WEB_TOP = 0;

function getBaseUrl() {
  const { EXPO_PUBLIC_API_URL } = process.env as any;
  if (EXPO_PUBLIC_API_URL) return EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  return "http://localhost:8080";
}

const FAQS = [
  {
    q: "How do I create a new inspection?",
    a: "Go to the Inspections tab and tap the + button in the top right. Select a project, inspection type, and schedule a date and time.",
  },
  {
    q: "How do I apply a checklist template?",
    a: "When creating or viewing an inspection, you can select a checklist template. Go to More → Checklist Templates to browse and manage your templates.",
  },
  {
    q: "How do I raise a defect or issue?",
    a: "During an inspection (Conduct screen), tap any checklist item and mark it as Fail or Monitor. A defect will automatically be created in the Issues tab.",
  },
  {
    q: "How do I generate an inspection report?",
    a: "Open a completed inspection and tap 'Generate Report'. Choose the report type and it will be compiled with all checklist results and issues.",
  },
  {
    q: "Can I work offline?",
    a: "Basic viewing works offline, but creating and updating records requires an active internet connection to sync with the server.",
  },
  {
    q: "How do I change an inspection's scheduled time?",
    a: "On the Home screen, tap the clock icon on any inspection card to open the schedule editor. You can change both the date and time.",
  },
  {
    q: "Who can see my inspections?",
    a: "All active users in your organisation have access to project inspections. User roles control what actions each person can perform.",
  },
  {
    q: "How do I add photos to a defect?",
    a: "Open an issue from the Issues tab and use the camera button to attach site photos. Photos are stored securely and included in reports.",
  },
];

const CONTACTS = [
  { icon: "mail", label: "Email Support", value: "support@inspectproof.com.au" },
  { icon: "phone", label: "Phone", value: "1300 477 368" },
  { icon: "globe", label: "Website", value: "inspectproof.com.au" },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(v => !v)} style={styles.faqItem}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ}>{q}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={Colors.textTertiary} />
      </View>
      {open && <Text style={styles.faqA}>{a}</Text>}
    </Pressable>
  );
}

export default function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSend() {
    if (!message.trim() || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${getBaseUrl()}/api/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send message.");
      }
      setSent(true);
      setMessage("");
    } catch (err: any) {
      setSendError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Help & Support</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name="help-circle" size={32} color={Colors.secondary} />
          </View>
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroDesc}>
            Find answers to common questions or send us a message directly.
          </Text>
        </View>

        {/* Support message form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Us a Message</Text>
          <View style={styles.messageCard}>
            {sent ? (
              <View style={styles.sentState}>
                <View style={styles.sentIcon}>
                  <Feather name="check-circle" size={28} color={Colors.success} />
                </View>
                <Text style={styles.sentTitle}>Message sent!</Text>
                <Text style={styles.sentDesc}>
                  We'll get back to you at your account email as soon as possible.
                </Text>
                <Pressable
                  onPress={() => setSent(false)}
                  style={({ pressed }) => [styles.sendAnotherBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.sendAnotherText}>Send another message</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.messageLabel}>
                  What can we help you with?
                </Text>
                <TextInput
                  style={styles.messageInput}
                  placeholder="Describe your question or issue..."
                  placeholderTextColor={Colors.textTertiary}
                  value={message}
                  onChangeText={t => { setMessage(t); setSendError(null); }}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  editable={!sending}
                />
                {sendError && (
                  <View style={styles.errorRow}>
                    <Feather name="alert-circle" size={13} color={Colors.danger} />
                    <Text style={styles.errorText}>{sendError}</Text>
                  </View>
                )}
                <Pressable
                  onPress={handleSend}
                  disabled={!message.trim() || sending}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    (!message.trim() || sending) && styles.sendBtnDisabled,
                    pressed && message.trim() && !sending && { opacity: 0.85 },
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="send" size={15} color="#fff" />
                      <Text style={styles.sendBtnText}>Send Message</Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* FAQ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          <View style={styles.faqGroup}>
            {FAQS.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </View>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Support</Text>
          <View style={styles.group}>
            {CONTACTS.map(c => (
              <View key={c.label} style={styles.contactRow}>
                <View style={styles.contactIcon}>
                  <Feather name={c.icon as any} size={16} color={Colors.secondary} />
                </View>
                <View style={styles.contactBody}>
                  <Text style={styles.contactLabel}>{c.label}</Text>
                  <Text style={styles.contactValue}>{c.value}</Text>
                </View>
              </View>
            ))}
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
  content: { padding: 16, gap: 24 },

  hero: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
    alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  heroTitle: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  heroDesc: {
    fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary, textAlign: "center", lineHeight: 20,
  },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary, textTransform: "uppercase",
    letterSpacing: 1, paddingHorizontal: 4,
  },

  messageCard: {
    backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 12,
  },
  messageLabel: {
    fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
  },
  messageInput: {
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, padding: 12,
    fontSize: 14, fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text, minHeight: 100,
    lineHeight: 20,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  errorText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger, flex: 1 },
  sendBtn: {
    backgroundColor: Colors.secondary, borderRadius: 10,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13,
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },

  sentState: { alignItems: "center", gap: 10, paddingVertical: 12 },
  sentIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.successLight ?? "#e8f5e9",
    alignItems: "center", justifyContent: "center",
  },
  sentTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  sentDesc: {
    fontSize: 13, fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary, textAlign: "center", lineHeight: 19,
  },
  sendAnotherBtn: { marginTop: 4 },
  sendAnotherText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },

  faqGroup: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  faqItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, gap: 8 },
  faqHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  faqQ: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 20 },
  faqA: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 20, paddingTop: 2 },

  group: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
  },
  contactRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  contactIcon: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  contactBody: { flex: 1 },
  contactLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  contactValue: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, marginTop: 1 },

});

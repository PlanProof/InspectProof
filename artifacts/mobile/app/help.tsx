import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

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

const GUIDES = [
  { icon: "clipboard", title: "Getting Started", desc: "Set up your first project and run an inspection" },
  { icon: "file-text", title: "Checklist Templates", desc: "Build NCC-compliant checklists for your discipline" },
  { icon: "alert-triangle", title: "Managing Issues", desc: "Raise, track, and resolve defects efficiently" },
  { icon: "bar-chart-2", title: "Reports & Analytics", desc: "Generate PDF reports and review compliance trends" },
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
            Find answers to common questions, browse guides, or reach our support team.
          </Text>
        </View>

        {/* Quick guides */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Guides</Text>
          <View style={styles.guideGrid}>
            {GUIDES.map(g => (
              <Pressable
                key={g.title}
                style={({ pressed }) => [styles.guideCard, pressed && { opacity: 0.8 }]}
              >
                <View style={styles.guideIcon}>
                  <Feather name={g.icon as any} size={20} color={Colors.secondary} />
                </View>
                <Text style={styles.guideTitle}>{g.title}</Text>
                <Text style={styles.guideDesc}>{g.desc}</Text>
              </Pressable>
            ))}
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

        {/* Compliance note */}
        <View style={styles.complianceNote}>
          <Feather name="info" size={14} color={Colors.secondary} />
          <Text style={styles.complianceText}>
            InspectProof is built for Australian building professionals and aligns with NCC 2022, BCA, and AS Standards.
            Always verify compliance requirements with your local authority.
          </Text>
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

  guideGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  guideCard: {
    flex: 1, minWidth: "44%",
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 16, gap: 8,
  },
  guideIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  guideTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  guideDesc: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, lineHeight: 15 },

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

  complianceNote: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: Colors.infoLight, borderRadius: 12, padding: 14,
  },
  complianceText: {
    flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary, lineHeight: 18,
  },
});

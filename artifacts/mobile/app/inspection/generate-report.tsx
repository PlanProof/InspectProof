import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const REPORT_TYPES = [
  {
    key: "inspection_certificate",
    label: "Inspection Certificate",
    desc: "Formal certificate confirming compliance with NCC requirements",
    icon: "award",
    color: "#16a34a",
    bg: "#f0fdf4",
    border: "#86efac",
  },
  {
    key: "compliance_report",
    label: "Compliance Report",
    desc: "Detailed report with full checklist results and compliance status",
    icon: "clipboard",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#93c5fd",
  },
  {
    key: "defect_notice",
    label: "Defect Notice",
    desc: "Notice of defects requiring rectification before next stage",
    icon: "alert-triangle",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fcd34d",
  },
  {
    key: "non_compliance_notice",
    label: "Non-Compliance Notice",
    desc: "Formal notice of non-compliant work under the Building Act",
    icon: "x-octagon",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fca5a5",
  },
] as const;

type ReportTypeKey = typeof REPORT_TYPES[number]["key"];

export default function GenerateReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [step, setStep] = useState<"select" | "preview" | "action">("select");
  const [selectedType, setSelectedType] = useState<ReportTypeKey | null>(null);
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);

  const fetchWithAuth = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(`${baseUrl}${url}`, {
      ...opts,
      headers: {
        ...(opts?.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [baseUrl, token]);

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}`),
    enabled: !!token && !!id,
  });

  const generateReport = async () => {
    if (!selectedType) return;
    setGenerating(true);
    try {
      const data = await fetchWithAuth("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: parseInt(id),
          reportType: selectedType,
          userId: (user as any)?.id || 1,
        }),
      });
      setReport(data);
      setStep("preview");
    } catch (e) {
      Alert.alert("Error", "Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const submitForReview = async () => {
    if (!report) return;
    setSubmitting(true);
    try {
      await fetchWithAuth(`/api/reports/${report.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      Alert.alert(
        "Submitted for Review",
        "The report has been submitted to the desktop app for final review by the certifier.",
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert("Error", "Failed to submit report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const sendToClient = async () => {
    if (!report) return;
    if (!clientEmail.trim()) {
      Alert.alert("Email Required", "Please enter the client's email address.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    setSending(true);
    setShowEmailModal(false);
    try {
      await fetchWithAuth(`/api/reports/${report.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentTo: clientEmail.trim() }),
      });
      Alert.alert(
        "Report Sent",
        `The report has been sent to ${clientEmail.trim()} and uploaded for desktop review.`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (e) {
      Alert.alert("Error", "Failed to send report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const selectedTypeObj = REPORT_TYPES.find(t => t.key === selectedType);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => step === "select" ? router.back() : setStep("select")} style={styles.backBtn} hitSlop={12}>
          <Feather name={step === "select" ? "x" : "arrow-left"} size={20} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {step === "select" ? "Generate Report" : step === "preview" ? "Report Preview" : "Submit Report"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>{inspection?.projectName}</Text>
        </View>
        {step === "select" && (
          <Pressable
            style={[styles.nextBtn, !selectedType && styles.nextBtnDisabled]}
            onPress={generateReport}
            disabled={!selectedType || generating}
          >
            {generating
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={styles.nextBtnText}>Generate</Text>
            }
          </Pressable>
        )}
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {["select", "preview"].map((s, idx) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepDot, step === s || (step === "preview" && idx === 0) ? styles.stepDotActive : step === "preview" && idx === 1 ? styles.stepDotActive : {}]}>
              <Text style={styles.stepDotText}>{idx + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
              {idx === 0 ? "Select Type" : "Preview & Send"}
            </Text>
            {idx < 1 && <View style={styles.stepLine} />}
          </View>
        ))}
      </View>

      {step === "select" && (
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Choose a report template</Text>
          <Text style={styles.sectionSub}>
            The report will be auto-filled with inspection results, project details, and checklist items.
          </Text>
          <View style={styles.typeList}>
            {REPORT_TYPES.map(type => {
              const isSelected = selectedType === type.key;
              return (
                <Pressable
                  key={type.key}
                  style={[
                    styles.typeCard,
                    isSelected && { borderColor: type.color, backgroundColor: type.bg },
                  ]}
                  onPress={() => setSelectedType(type.key)}
                >
                  <View style={[styles.typeIcon, { backgroundColor: isSelected ? type.color + "20" : Colors.borderLight }]}>
                    <Feather name={type.icon as any} size={22} color={isSelected ? type.color : Colors.textSecondary} />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={[styles.typeLabel, isSelected && { color: type.color }]}>{type.label}</Text>
                    <Text style={styles.typeDesc}>{type.desc}</Text>
                  </View>
                  <View style={[styles.typeRadio, isSelected && { borderColor: type.color }]}>
                    {isSelected && <View style={[styles.typeRadioInner, { backgroundColor: type.color }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {step === "preview" && report && (
        <>
          <ScrollView style={styles.scroll} contentContainerStyle={[styles.previewContent, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
            <View style={[styles.previewHeader, selectedTypeObj && { backgroundColor: selectedTypeObj.bg, borderColor: selectedTypeObj.border }]}>
              <Feather name={(selectedTypeObj?.icon || "file-text") as any} size={20} color={selectedTypeObj?.color || Colors.secondary} />
              <View style={styles.previewHeaderText}>
                <Text style={[styles.previewTypeLabel, { color: selectedTypeObj?.color || Colors.secondary }]}>{report.reportTypeLabel}</Text>
                <Text style={styles.previewTitle} numberOfLines={2}>{report.title}</Text>
              </View>
            </View>
            <View style={styles.previewBody}>
              <Text style={styles.previewText}>{report.content}</Text>
            </View>
          </ScrollView>

          {/* Action buttons pinned at bottom */}
          <View style={[styles.actionBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnOutline, submitting && { opacity: 0.6 }]}
              onPress={submitForReview}
              disabled={submitting || sending}
            >
              {submitting
                ? <ActivityIndicator size="small" color={Colors.secondary} />
                : <Feather name="upload" size={18} color={Colors.secondary} />
              }
              <Text style={styles.actionBtnOutlineText}>{submitting ? "Submitting…" : "Submit for Review"}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary, sending && { opacity: 0.6 }]}
              onPress={() => setShowEmailModal(true)}
              disabled={submitting || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Feather name="send" size={18} color={Colors.primary} />
              }
              <Text style={styles.actionBtnPrimaryText}>{sending ? "Sending…" : "Send to Client"}</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Email modal */}
      <Modal visible={showEmailModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEmailModal(false)}>
        <View style={[styles.emailModal, { paddingTop: insets.top + 24 }]}>
          <View style={styles.emailModalHeader}>
            <Pressable onPress={() => setShowEmailModal(false)} hitSlop={12}>
              <Feather name="x" size={22} color={Colors.text} />
            </Pressable>
            <Text style={styles.emailModalTitle}>Send to Client</Text>
            <View style={{ width: 22 }} />
          </View>
          <View style={styles.emailModalBody}>
            <View style={styles.emailInfo}>
              <Feather name="file-text" size={18} color={Colors.secondary} />
              <Text style={styles.emailInfoText} numberOfLines={2}>{report?.title}</Text>
            </View>
            <Text style={styles.emailLabel}>Client Email Address</Text>
            <TextInput
              style={styles.emailInput}
              value={clientEmail}
              onChangeText={setClientEmail}
              placeholder={`e.g. ${inspection?.clientName ? inspection.clientName.toLowerCase().replace(/\s+/g, ".") + "@example.com" : "client@example.com"}`}
              placeholderTextColor={Colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <Text style={styles.emailHint}>
              The report will be sent as a formatted document. A copy will also be uploaded to the desktop app for the certifier's records.
            </Text>
          </View>
          <View style={[styles.emailModalFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable style={styles.emailCancelBtn} onPress={() => setShowEmailModal(false)}>
              <Text style={styles.emailCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.emailSendBtn, (!clientEmail.trim()) && styles.emailSendBtnDisabled]}
              onPress={sendToClient}
              disabled={!clientEmail.trim()}
            >
              <Feather name="send" size={16} color={Colors.primary} />
              <Text style={styles.emailSendText}>Send Report</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, marginTop: 1 },
  nextBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { backgroundColor: Colors.secondary },
  stepDotText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.surface },
  stepLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  stepLabelActive: { color: Colors.secondary },
  stepLine: { width: 32, height: 1, backgroundColor: Colors.border, marginHorizontal: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, marginBottom: 4 },
  sectionSub: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  typeList: { gap: 12 },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  typeInfo: { flex: 1 },
  typeLabel: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, marginBottom: 3 },
  typeDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 17 },
  typeRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeRadioInner: { width: 12, height: 12, borderRadius: 6 },
  previewContent: { padding: 16, gap: 16 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  previewHeaderText: { flex: 1, gap: 3 },
  previewTypeLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  previewTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 20 },
  previewBody: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  previewText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    lineHeight: 20,
  },
  actionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionBtnOutline: {
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
  },
  actionBtnOutlineText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  actionBtnPrimary: { backgroundColor: Colors.accent },
  actionBtnPrimaryText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  emailModal: { flex: 1, backgroundColor: Colors.background },
  emailModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  emailModalTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emailModalBody: { flex: 1, padding: 20, gap: 16 },
  emailInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailInfoText: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 18 },
  emailLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emailInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  emailHint: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, lineHeight: 18 },
  emailModalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  emailCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailCancelText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emailSendBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  emailSendBtnDisabled: { opacity: 0.4 },
  emailSendText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
});

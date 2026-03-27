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

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
  submitted: { bg: "#eff6ff", text: "#2563eb", border: "#93c5fd" },
  approved:  { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
  sent:      { bg: "#fefce8", text: "#b45309", border: "#fde68a" },
};

export default function GenerateReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [step, setStep] = useState<"select" | "preview">("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
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

  const { data: existingReports = [] } = useQuery({
    queryKey: ["reports", "inspection", id, token],
    queryFn: () => fetchWithAuth(`/api/reports?inspectionId=${id}`),
    enabled: !!token && !!id,
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["checklist-templates", token],
    queryFn: () => fetchWithAuth("/api/checklists"),
    enabled: !!token,
  });

  const selectedTemplate = (templates as any[]).find((t: any) => t.id === selectedTemplateId);

  const openExistingReport = async (reportId: number) => {
    setLoadingExisting(true);
    try {
      const data = await fetchWithAuth(`/api/reports/${reportId}`);
      setReport(data);
      setStep("preview");
    } catch {
      Alert.alert("Error", "Could not load this report. Please try again.");
    } finally {
      setLoadingExisting(false);
    }
  };

  const generateReport = async () => {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const data = await fetchWithAuth("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId: parseInt(id),
          reportType: selectedTemplate.name,
          userId: (user as any)?.id || 1,
        }),
      });
      setReport(data);
      setStep("preview");
    } catch {
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
    } catch {
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
    } catch {
      Alert.alert("Error", "Failed to send report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => step === "select" ? router.back() : setStep("select")} style={styles.backBtn} hitSlop={12}>
          <Feather name={step === "select" ? "x" : "arrow-left"} size={20} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            {step === "select" ? "Generate Report" : "Report Preview"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>{inspection?.projectName}</Text>
        </View>
        {step === "select" && (
          <Pressable
            style={[styles.nextBtn, !selectedTemplateId && styles.nextBtnDisabled]}
            onPress={generateReport}
            disabled={!selectedTemplateId || generating}
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
            <View style={[styles.stepDot, (step === s || (step === "preview" && idx === 0)) ? styles.stepDotActive : {}]}>
              <Text style={styles.stepDotText}>{idx + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, step === s && styles.stepLabelActive]}>
              {idx === 0 ? "Select Template" : "Preview & Send"}
            </Text>
            {idx < 1 && <View style={styles.stepLine} />}
          </View>
        ))}
      </View>

      {step === "select" && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Existing reports */}
          {(existingReports as any[]).length > 0 && (
            <View style={styles.existingSection}>
              <View style={styles.existingSectionHeader}>
                <Feather name="folder" size={15} color={Colors.secondary} />
                <Text style={styles.existingSectionTitle}>
                  Existing Reports ({(existingReports as any[]).length})
                </Text>
              </View>
              <Text style={styles.existingSectionSub}>Tap a report to open it directly.</Text>
              {(existingReports as any[]).map((r: any) => {
                const sc = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
                const dateStr = r.createdAt
                  ? new Date(r.createdAt).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
                  : "";
                return (
                  <Pressable
                    key={r.id}
                    style={({ pressed }) => [styles.existingCard, pressed && { opacity: 0.75 }]}
                    onPress={() => openExistingReport(r.id)}
                    disabled={loadingExisting}
                  >
                    <View style={styles.existingIconWrap}>
                      <Feather name="file-text" size={18} color={Colors.secondary} />
                    </View>
                    <View style={styles.existingInfo}>
                      <Text style={styles.existingTitle} numberOfLines={2}>{r.title}</Text>
                      <View style={styles.existingMeta}>
                        <View style={[styles.existingStatusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                          <Text style={[styles.existingStatusText, { color: sc.text }]}>{r.status.toUpperCase()}</Text>
                        </View>
                        {dateStr ? <Text style={styles.existingDate}>{dateStr}</Text> : null}
                      </View>
                    </View>
                    {loadingExisting
                      ? <ActivityIndicator size="small" color={Colors.secondary} />
                      : <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
                    }
                  </Pressable>
                );
              })}
              <View style={styles.existingDivider}>
                <View style={styles.existingDividerLine} />
                <Text style={styles.existingDividerText}>OR GENERATE NEW</Text>
                <View style={styles.existingDividerLine} />
              </View>
            </View>
          )}

          <Text style={styles.sectionTitle}>Choose a template</Text>
          <Text style={styles.sectionSub}>
            Select one of your templates below. The report will be auto-filled with inspection results and project details.
          </Text>

          {/* Template list */}
          {loadingTemplates ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="large" color={Colors.secondary} />
              <Text style={styles.emptyText}>Loading templates…</Text>
            </View>
          ) : (templates as any[]).length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="book-open" size={40} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No templates yet</Text>
              <Text style={styles.emptyText}>
                Create a template from the Templates section and it will appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.typeList}>
              {(templates as any[]).map((tmpl: any) => {
                const isSelected = selectedTemplateId === tmpl.id;
                return (
                  <Pressable
                    key={tmpl.id}
                    style={[
                      styles.typeCard,
                      isSelected && styles.typeCardSelected,
                    ]}
                    onPress={() => setSelectedTemplateId(tmpl.id)}
                  >
                    <View style={[styles.typeIcon, isSelected && styles.typeIconSelected]}>
                      <Feather
                        name="book"
                        size={22}
                        color={isSelected ? Colors.secondary : Colors.textSecondary}
                      />
                    </View>
                    <View style={styles.typeInfo}>
                      <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>
                        {tmpl.name}
                      </Text>
                      {tmpl.description ? (
                        <Text style={styles.typeDesc} numberOfLines={2}>{tmpl.description}</Text>
                      ) : tmpl.discipline ? (
                        <Text style={styles.typeDesc}>{tmpl.discipline}</Text>
                      ) : null}
                      {tmpl.itemCount > 0 && (
                        <Text style={styles.typeItemCount}>{tmpl.itemCount} checklist items</Text>
                      )}
                    </View>
                    <View style={[styles.typeRadio, isSelected && styles.typeRadioSelected]}>
                      {isSelected && <View style={styles.typeRadioInner} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {step === "preview" && report && (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.previewContent, { paddingBottom: insets.bottom + 120 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.previewHeader}>
              <Feather name="file-text" size={20} color={Colors.secondary} />
              <View style={styles.previewHeaderText}>
                <Text style={[styles.previewTypeLabel, { color: Colors.secondary }]}>
                  {report.reportTypeLabel || report.reportType}
                </Text>
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
      <Modal
        visible={showEmailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEmailModal(false)}
      >
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
              placeholder={`e.g. ${inspection?.clientName
                ? inspection.clientName.toLowerCase().replace(/\s+/g, ".") + "@example.com"
                : "client@example.com"}`}
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
  },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_700Bold", color: Colors.primary },

  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 0,
  },
  stepItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { backgroundColor: Colors.secondary },
  stepDotText: { fontSize: 11, fontFamily: "PlusJakartaSans_700Bold", color: "#fff" },
  stepLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: Colors.textTertiary },
  stepLabelActive: { color: Colors.secondary, fontFamily: "PlusJakartaSans_600SemiBold" },
  stepLine: { width: 32, height: 1, backgroundColor: Colors.border, marginHorizontal: 6 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  existingSection: { gap: 10 },
  existingSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  existingSectionTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  existingSectionSub: { fontSize: 12, color: Colors.textSecondary, marginTop: -4 },
  existingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  existingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.secondary + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  existingInfo: { flex: 1, gap: 4 },
  existingTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  existingMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  existingStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  existingStatusText: { fontSize: 10, fontFamily: "PlusJakartaSans_700Bold" },
  existingDate: { fontSize: 11, color: Colors.textTertiary },
  existingDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  existingDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  existingDividerText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },

  sectionTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_700Bold", color: Colors.text },
  sectionSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: -8 },

  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 260,
  },

  typeList: { gap: 10 },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 14,
  },
  typeCardSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondary + "08",
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  typeIconSelected: {
    backgroundColor: Colors.secondary + "20",
  },
  typeInfo: { flex: 1, gap: 3 },
  typeLabel: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  typeLabelSelected: { color: Colors.secondary },
  typeDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  typeItemCount: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontFamily: "PlusJakartaSans_500Medium",
    marginTop: 2,
  },
  typeRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  typeRadioSelected: { borderColor: Colors.secondary },
  typeRadioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.secondary,
  },

  previewContent: { padding: 16, gap: 16 },
  previewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.secondary + "0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
    padding: 14,
  },
  previewHeaderText: { flex: 1, gap: 2 },
  previewTypeLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_700Bold", color: Colors.text },
  previewBody: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  previewText: { fontSize: 13, color: Colors.text, lineHeight: 20 },

  actionBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
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
    paddingVertical: 13,
    borderRadius: 12,
  },
  actionBtnOutline: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
  },
  actionBtnOutlineText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  actionBtnPrimary: { backgroundColor: Colors.accent },
  actionBtnPrimaryText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },

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
  emailModalTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_700Bold", color: Colors.text },
  emailModalBody: { flex: 1, padding: 20, gap: 14 },
  emailInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.secondary + "10",
    borderRadius: 10,
    padding: 12,
  },
  emailInfoText: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emailLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emailInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: Colors.text,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  emailHint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  emailModalFooter: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  emailCancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emailCancelText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emailSendBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  emailSendBtnDisabled: { opacity: 0.45 },
  emailSendText: { fontSize: 14, fontFamily: "PlusJakartaSans_700Bold", color: Colors.primary },
});

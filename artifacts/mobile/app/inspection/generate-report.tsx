import React, { useState, useCallback, useMemo } from "react";
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
  Image,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ── Colours ──────────────────────────────────────────────────────────────────

const BRAND_NAVY  = "#0B1933";
const BRAND_BLUE  = "#466DB5";
const BRAND_PEAR  = "#C5D92D";

const RESULT_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; icon: string }> = {
  pass:    { label: "PASS",    bg: "#f0fdf4", text: "#15803d", border: "#86efac", icon: "check-circle" },
  fail:    { label: "FAIL",    bg: "#fef2f2", text: "#dc2626", border: "#fca5a5", icon: "x-circle" },
  monitor: { label: "MONITOR", bg: "#fffbeb", text: "#d97706", border: "#fcd34d", icon: "alert-triangle" },
  na:      { label: "N/A",     bg: "#f8fafc", text: "#64748b", border: "#cbd5e1", icon: "minus-circle" },
  pending: { label: "PENDING", bg: "#f1f5f9", text: "#94a3b8", border: "#e2e8f0", icon: "clock" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  draft:     { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
  submitted: { bg: "#eff6ff", text: "#2563eb", border: "#93c5fd" },
  approved:  { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
  sent:      { bg: "#fefce8", text: "#b45309", border: "#fde68a" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function photoUrl(baseUrl: string, objectPath: string): string {
  // objectPath is like "/objects/supabase/abc.jpg" or "/objects/xyz"
  const stripped = objectPath.replace(/^\/objects\//, "");
  return `${baseUrl}/api/storage/objects/${stripped}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResultBadge({ result }: { result: string }) {
  const cfg = RESULT_CONFIG[result] ?? RESULT_CONFIG.pending;
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <Feather name={cfg.icon as any} size={11} color={cfg.text} />
      <Text style={[badgeStyles.text, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  text: { fontSize: 10, fontFamily: "PlusJakartaSans_700Bold", letterSpacing: 0.3 },
});

function ChecklistItemRow({
  item,
  index,
  baseUrl,
  token,
}: {
  item: any;
  index: number;
  baseUrl: string;
  token: string | null;
}) {
  const photos: string[] = item.photoUrls ?? [];
  const photoW = (SCREEN_WIDTH - 64) / 2;

  return (
    <View style={itemStyles.wrap}>
      {/* Row header */}
      <View style={itemStyles.header}>
        <Text style={itemStyles.index}>{index + 1}</Text>
        <View style={itemStyles.headerText}>
          <Text style={itemStyles.desc}>{item.description}</Text>
          {item.codeReference ? (
            <Text style={itemStyles.code}>{item.codeReference}</Text>
          ) : null}
        </View>
        <ResultBadge result={item.result} />
      </View>

      {/* Location / severity */}
      {(item.location || item.severity) ? (
        <View style={itemStyles.metaRow}>
          {item.location ? (
            <View style={itemStyles.metaChip}>
              <Feather name="map-pin" size={10} color={BRAND_BLUE} />
              <Text style={itemStyles.metaText}>{item.location}</Text>
            </View>
          ) : null}
          {item.severity ? (
            <View style={itemStyles.metaChip}>
              <Feather name="alert-circle" size={10} color={BRAND_BLUE} />
              <Text style={itemStyles.metaText}>{item.severity.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Notes */}
      {item.notes ? (
        <View style={itemStyles.notesWrap}>
          <Feather name="message-square" size={11} color="#64748b" />
          <Text style={itemStyles.notes}>{item.notes}</Text>
        </View>
      ) : null}

      {/* Photos */}
      {photos.length > 0 ? (
        <View style={itemStyles.photoGrid}>
          {photos.map((p, pi) => (
            <Image
              key={pi}
              source={{
                uri: photoUrl(baseUrl, p),
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              }}
              style={[itemStyles.photo, { width: photoW, height: photoW * 0.75 }]}
              resizeMode="cover"
            />
          ))}
        </View>
      ) : null}

      {/* Recommended action for fails */}
      {(item.result === "fail" || item.result === "monitor") && item.recommendedAction ? (
        <View style={itemStyles.actionWrap}>
          <Feather name="tool" size={11} color="#d97706" />
          <Text style={itemStyles.actionText}>{item.recommendedAction}</Text>
        </View>
      ) : null}
    </View>
  );
}

const itemStyles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 8,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  index: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#94a3b8",
    minWidth: 18,
    marginTop: 1,
  },
  headerText: { flex: 1, gap: 2 },
  desc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: BRAND_NAVY, lineHeight: 18 },
  code: { fontSize: 10, color: BRAND_BLUE, fontFamily: "PlusJakartaSans_500Medium" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 28 },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaText: { fontSize: 10, color: BRAND_BLUE, fontFamily: "PlusJakartaSans_600SemiBold" },
  notesWrap: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 6,
    padding: 8,
    marginLeft: 28,
    alignItems: "flex-start",
  },
  notes: { flex: 1, fontSize: 12, color: "#475569", lineHeight: 17 },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingLeft: 28,
  },
  photo: { borderRadius: 8, backgroundColor: "#f1f5f9" },
  actionWrap: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fffbeb",
    borderLeftWidth: 3,
    borderLeftColor: "#fcd34d",
    borderRadius: 6,
    padding: 8,
    marginLeft: 28,
    alignItems: "flex-start",
  },
  actionText: { flex: 1, fontSize: 12, color: "#92400e", lineHeight: 17 },
});

// ── Report document renderer ──────────────────────────────────────────────────

function ReportDocument({
  report,
  inspection,
  templateName,
  baseUrl,
  token,
}: {
  report: any;
  inspection: any;
  templateName: string;
  baseUrl: string;
  token: string | null;
}) {
  const results: any[] = inspection?.checklistResults ?? [];

  // Group by category
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of results) {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push(r);
    }
    return map;
  }, [results]);
  const categories = Object.keys(grouped);

  // Summary counts
  const passCount    = results.filter(r => r.result === "pass").length;
  const failCount    = results.filter(r => r.result === "fail").length;
  const monitorCount = results.filter(r => r.result === "monitor").length;
  const naCount      = results.filter(r => r.result === "na").length;
  const totalDone    = passCount + failCount + monitorCount + naCount;

  const ref = report.id ? `INS-${String(report.id).padStart(4, "0")}` : "—";

  return (
    <View style={docStyles.page}>
      {/* ── Brand header ── */}
      <View style={docStyles.headerAccentBar} />
      <View style={docStyles.headerBlock}>
        <View style={docStyles.headerTop}>
          <View>
            <Text style={docStyles.brandName}>INSPECTPROOF</Text>
            <Text style={docStyles.reportTypeLabel}>{templateName || report.reportTypeLabel || "Inspection Report"}</Text>
          </View>
          <View style={docStyles.refBlock}>
            <Text style={docStyles.refLabel}>REF</Text>
            <Text style={docStyles.refValue}>{ref}</Text>
          </View>
        </View>
        <View style={docStyles.headerMeta}>
          <View style={docStyles.headerMetaItem}>
            <Feather name="calendar" size={11} color={BRAND_BLUE} />
            <Text style={docStyles.headerMetaText}>{fmtDate(report.createdAt || new Date().toISOString())}</Text>
          </View>
          <View style={docStyles.headerMetaItem}>
            <Feather name="map-pin" size={11} color={BRAND_BLUE} />
            <Text style={docStyles.headerMetaText} numberOfLines={1}>
              {inspection?.siteAddress || inspection?.suburb || "—"}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Project details ── */}
      <View style={docStyles.section}>
        <View style={docStyles.sectionHeader}>
          <View style={docStyles.sectionHeaderDot} />
          <Text style={docStyles.sectionTitle}>PROJECT DETAILS</Text>
        </View>
        <View style={docStyles.detailGrid}>
          <DetailRow label="Project" value={inspection?.projectName} />
          <DetailRow label="Site Address" value={[inspection?.siteAddress, inspection?.suburb, inspection?.state, inspection?.postcode].filter(Boolean).join(", ")} />
          {inspection?.daNumber       ? <DetailRow label="DA Number"     value={inspection.daNumber} />       : null}
          {inspection?.buildingClassification ? <DetailRow label="Building Class" value={inspection.buildingClassification} /> : null}
          {inspection?.certificationNumber   ? <DetailRow label="Cert Number"     value={inspection.certificationNumber} />   : null}
          <DetailRow label="Client"         value={inspection?.clientName} />
          <DetailRow label="Inspection Date" value={fmtDate(inspection?.scheduledDate)} />
          {inspection?.completedDate   ? <DetailRow label="Completed"     value={fmtDate(inspection.completedDate)} />  : null}
          <DetailRow label="Inspector"       value={inspection?.inspectorName} />
          <DetailRow label="Status"          value={inspection?.status?.replace(/_/g, " ").toUpperCase()} />
        </View>
      </View>

      {/* ── Summary ── */}
      {totalDone > 0 && (
        <View style={docStyles.section}>
          <View style={docStyles.sectionHeader}>
            <View style={docStyles.sectionHeaderDot} />
            <Text style={docStyles.sectionTitle}>INSPECTION SUMMARY</Text>
          </View>
          <View style={docStyles.summaryRow}>
            <SummaryChip count={passCount}    label="Pass"    color="#15803d" bg="#f0fdf4" border="#86efac" />
            <SummaryChip count={failCount}    label="Fail"    color="#dc2626" bg="#fef2f2" border="#fca5a5" />
            <SummaryChip count={monitorCount} label="Monitor" color="#d97706" bg="#fffbeb" border="#fcd34d" />
            <SummaryChip count={naCount}      label="N/A"     color="#64748b" bg="#f8fafc" border="#cbd5e1" />
          </View>
          {failCount > 0 || monitorCount > 0 ? (
            <View style={docStyles.summaryAlert}>
              <Feather name="alert-triangle" size={13} color="#d97706" />
              <Text style={docStyles.summaryAlertText}>
                {failCount + monitorCount} item{failCount + monitorCount > 1 ? "s" : ""} require{failCount + monitorCount === 1 ? "s" : ""} attention before the next stage.
              </Text>
            </View>
          ) : totalDone > 0 ? (
            <View style={docStyles.summaryPass}>
              <Feather name="check-circle" size={13} color="#15803d" />
              <Text style={docStyles.summaryPassText}>All inspected items comply. Inspection passed.</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ── Checklist items ── */}
      {categories.map(cat => (
        <View key={cat} style={docStyles.section}>
          <View style={docStyles.categoryHeader}>
            <Text style={docStyles.categoryTitle}>{cat}</Text>
            <View style={docStyles.categoryLine} />
            <Text style={docStyles.categoryCount}>{grouped[cat].length}</Text>
          </View>
          <View style={docStyles.itemList}>
            {grouped[cat].map((item, idx) => (
              <ChecklistItemRow
                key={item.id}
                item={item}
                index={idx}
                baseUrl={baseUrl}
                token={token}
              />
            ))}
          </View>
        </View>
      ))}

      {/* ── Signature block ── */}
      <View style={docStyles.sigBlock}>
        <View style={docStyles.sigLine} />
        <Text style={docStyles.sigLabel}>Inspector Signature</Text>
        <Text style={docStyles.sigName}>{inspection?.inspectorName || "—"}</Text>
        <Text style={docStyles.sigDate}>Date: {fmtDate(report.createdAt || new Date().toISOString())}</Text>
        <View style={docStyles.footerBar}>
          <Text style={docStyles.footerText}>Generated by InspectProof · inspectproof.com.au</Text>
        </View>
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={docStyles.detailRow}>
      <Text style={docStyles.detailLabel}>{label}</Text>
      <Text style={docStyles.detailValue}>{value}</Text>
    </View>
  );
}

function SummaryChip({ count, label, color, bg, border }: { count: number; label: string; color: string; bg: string; border: string }) {
  return (
    <View style={[docStyles.summaryChip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[docStyles.summaryChipCount, { color }]}>{count}</Text>
      <Text style={[docStyles.summaryChipLabel, { color }]}>{label}</Text>
    </View>
  );
}

const docStyles = StyleSheet.create({
  page: { backgroundColor: "#f8fafc" },

  headerAccentBar: { height: 5, backgroundColor: BRAND_PEAR },
  headerBlock: {
    backgroundColor: BRAND_NAVY,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  brandName: { fontSize: 18, fontFamily: "PlusJakartaSans_700Bold", color: BRAND_PEAR, letterSpacing: 1.5 },
  reportTypeLabel: { fontSize: 12, color: "#93c5fd", fontFamily: "PlusJakartaSans_500Medium", marginTop: 2 },
  refBlock: {
    alignItems: "flex-end",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refLabel: { fontSize: 9, color: "#94a3b8", fontFamily: "PlusJakartaSans_700Bold", letterSpacing: 1 },
  refValue: { fontSize: 13, color: "#fff", fontFamily: "PlusJakartaSans_700Bold" },
  headerMeta: { flexDirection: "row", gap: 16 },
  headerMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  headerMetaText: { fontSize: 11, color: "#94a3b8", fontFamily: "PlusJakartaSans_500Medium" },

  section: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionHeaderDot: { width: 4, height: 16, backgroundColor: BRAND_PEAR, borderRadius: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "PlusJakartaSans_700Bold", color: BRAND_NAVY, letterSpacing: 1 },

  detailGrid: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    gap: 12,
  },
  detailLabel: {
    width: 110,
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#64748b",
    flexShrink: 0,
  },
  detailValue: { flex: 1, fontSize: 12, color: BRAND_NAVY, fontFamily: "PlusJakartaSans_500Medium" },

  summaryRow: { flexDirection: "row", gap: 8 },
  summaryChip: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  summaryChipCount: { fontSize: 20, fontFamily: "PlusJakartaSans_700Bold" },
  summaryChipLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold" },
  summaryAlert: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fcd34d",
    padding: 10,
    alignItems: "center",
  },
  summaryAlertText: { flex: 1, fontSize: 12, color: "#92400e", lineHeight: 17 },
  summaryPass: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#86efac",
    padding: 10,
    alignItems: "center",
  },
  summaryPassText: { flex: 1, fontSize: 12, color: "#14532d", lineHeight: 17 },

  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  categoryTitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_700Bold",
    color: BRAND_NAVY,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  categoryLine: { flex: 1, height: 1, backgroundColor: "#e2e8f0" },
  categoryCount: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#94a3b8",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemList: { gap: 8 },

  sigBlock: {
    margin: 16,
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 8,
    alignItems: "center",
  },
  sigLine: {
    width: 200,
    height: 1,
    backgroundColor: BRAND_NAVY,
    marginBottom: 4,
  },
  sigLabel: { fontSize: 10, color: "#94a3b8", fontFamily: "PlusJakartaSans_500Medium", letterSpacing: 0.5 },
  sigName: { fontSize: 14, fontFamily: "PlusJakartaSans_700Bold", color: BRAND_NAVY },
  sigDate: { fontSize: 11, color: "#64748b" },
  footerBar: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    width: "100%",
    alignItems: "center",
  },
  footerText: { fontSize: 10, color: "#94a3b8" },
});

// ── Main screen ───────────────────────────────────────────────────────────────

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
    queryKey: ["doc-templates", token],
    queryFn: () => fetchWithAuth("/api/doc-templates"),
    enabled: !!token,
  });

  const selectedTemplate = (templates as any[]).find((t: any) => String(t.id) === String(selectedTemplateId));

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
        "The report has been submitted to the desktop platform for final review.",
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
        `The report has been sent to ${clientEmail.trim()}.`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch {
      Alert.alert("Error", "Failed to send report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const templateName = selectedTemplate?.name || report?.reportTypeLabel || report?.reportType || "Inspection Report";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => step === "select" ? router.back() : setStep("select")}
          style={styles.backBtn}
          hitSlop={12}
        >
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
              : <Text style={styles.nextBtnText}>Generate</Text>}
          </Pressable>
        )}
      </View>

      {/* ── Step indicator ── */}
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

      {/* ── Step 1: Select template ── */}
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
                      : <Feather name="chevron-right" size={16} color={Colors.textTertiary} />}
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
            Select a template to generate a structured report with your checklist results and photos.
          </Text>

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
                const isSelected = String(selectedTemplateId) === String(tmpl.id);
                const linkedCount = Array.isArray(tmpl.linkedChecklistIds) ? tmpl.linkedChecklistIds.length : 0;
                const updatedAt = tmpl.updatedAt ? new Date(tmpl.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null;
                return (
                  <Pressable
                    key={tmpl.id}
                    style={[styles.typeCard, isSelected && styles.typeCardSelected]}
                    onPress={() => setSelectedTemplateId(tmpl.id)}
                  >
                    <View style={[styles.typeIcon, isSelected && styles.typeIconSelected]}>
                      <Feather name="file-text" size={22} color={isSelected ? Colors.secondary : Colors.textSecondary} />
                    </View>
                    <View style={styles.typeInfo}>
                      <Text style={[styles.typeLabel, isSelected && styles.typeLabelSelected]}>{tmpl.name}</Text>
                      {linkedCount > 0 ? (
                        <Text style={styles.typeDesc}>{linkedCount} linked checklist{linkedCount !== 1 ? "s" : ""}</Text>
                      ) : updatedAt ? (
                        <Text style={styles.typeDesc}>Updated {updatedAt}</Text>
                      ) : null}
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

      {/* ── Step 2: Report preview ── */}
      {step === "preview" && report && (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            showsVerticalScrollIndicator={false}
          >
            <ReportDocument
              report={report}
              inspection={inspection}
              templateName={templateName}
              baseUrl={baseUrl}
              token={token}
            />
          </ScrollView>

          {/* Action bar */}
          <View style={[styles.actionBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnOutline, submitting && { opacity: 0.6 }]}
              onPress={submitForReview}
              disabled={submitting || sending}
            >
              {submitting
                ? <ActivityIndicator size="small" color={Colors.secondary} />
                : <Feather name="upload" size={18} color={Colors.secondary} />}
              <Text style={styles.actionBtnOutlineText}>{submitting ? "Submitting…" : "Submit for Review"}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnPrimary, sending && { opacity: 0.6 }]}
              onPress={() => setShowEmailModal(true)}
              disabled={submitting || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Feather name="send" size={18} color={Colors.primary} />}
              <Text style={styles.actionBtnPrimaryText}>{sending ? "Sending…" : "Send to Client"}</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* ── Email modal ── */}
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
              The report will be sent as a formatted document with all checklist results and photos.
            </Text>
          </View>
          <View style={[styles.emailModalFooter, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable style={styles.emailCancelBtn} onPress={() => setShowEmailModal(false)}>
              <Text style={styles.emailCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.emailSendBtn, !clientEmail.trim() && styles.emailSendBtnDisabled]}
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
  headerSub: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: Colors.textSecondary, marginTop: 1 },
  nextBtn: { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
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
  existingStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  existingStatusText: { fontSize: 10, fontFamily: "PlusJakartaSans_700Bold" },
  existingDate: { fontSize: 11, color: Colors.textTertiary },
  existingDivider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 },
  existingDividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  existingDividerText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, letterSpacing: 0.5 },

  sectionTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_700Bold", color: Colors.text },
  sectionSub: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: -8 },

  emptyWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptyText: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 19, maxWidth: 260 },

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
  typeCardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.secondary + "08" },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  typeIconSelected: { backgroundColor: Colors.secondary + "20" },
  typeInfo: { flex: 1, gap: 3 },
  typeLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  typeLabelSelected: { color: Colors.secondary },
  typeDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  typeItemCount: { fontSize: 11, color: Colors.textTertiary, fontFamily: "PlusJakartaSans_500Medium", marginTop: 2 },
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
  typeRadioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary },

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
  actionBtnOutline: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.secondary },
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

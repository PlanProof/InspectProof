import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InspectionCard } from "@/components/InspectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { PROJECT_STAGES } from "@/constants/api";

const REPORT_TYPES: Record<string, string> = {
  inspection_certificate:   "Inspection Certificate",
  compliance_report:        "Compliance Report",
  defect_notice:            "Defect Notice",
  non_compliance_notice:    "Non-Compliance Notice",
  summary:                  "Inspection Summary",
  quality_control_report:   "Quality Control Report",
  non_conformance_report:   "Non-Conformance Report",
  safety_inspection_report: "Safety Inspection Report",
  pre_purchase_report:      "Pre-Purchase Building Report",
  annual_fire_safety:       "Annual Fire Safety Statement",
};

const REPORT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: "#6b7280", bg: "#f3f4f6" },
  submitted: { label: "Submitted", color: "#2563eb", bg: "#eff6ff" },
  approved:  { label: "Approved",  color: "#16a34a", bg: "#f0fdf4" },
  sent:      { label: "Sent",      color: Colors.secondary, bg: Colors.infoLight },
};

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token, user: authUser } = useAuth();
  const userDiscipline = authUser?.profession ?? null;
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  // Book inspection modal state
  const [bookOpen, setBookOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [bookDate, setBookDate] = useState<Date>(new Date());
  const [bookTime, setBookTime] = useState("");
  const [bookSubmitting, setBookSubmitting] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const formatDisplayDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const formatIsoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const fetchWithAuth = async (url: string) => {
    const res = await fetch(`${baseUrl}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  };

  const { data: project, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["project", id, token],
    queryFn: () => fetchWithAuth(`/api/projects/${id}`),
    enabled: !!token && !!id,
  });

  const { data: inspections = [], refetch: refetchInspections } = useQuery({
    queryKey: ["project-inspections", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections?projectId=${id}`),
    enabled: !!token && !!id,
  });

  const { data: reports = [] } = useQuery<any[]>({
    queryKey: ["project-reports", id, token],
    queryFn: () => fetchWithAuth(`/api/reports?projectId=${id}`),
    enabled: !!token && !!id,
  });

  // Selected inspection types from desktop, filtered by user's discipline
  const { data: inspectionTypes = [] } = useQuery({
    queryKey: ["project-inspection-types", id, token, userDiscipline],
    queryFn: async () => {
      const url = userDiscipline
        ? `/api/projects/${id}/inspection-types?discipline=${encodeURIComponent(userDiscipline)}`
        : `/api/projects/${id}/inspection-types`;
      const data = await fetchWithAuth(url);
      return data.filter((t: any) => t.isSelected);
    },
    enabled: !!token && !!id && bookOpen,
  });

  const upcomingInspections = inspections.filter((i: any) => i.status !== "completed" && i.status !== "cancelled");

  const handleBookInspection = async () => {
    if (!selectedTemplate) {
      Alert.alert("Required", "Please select an inspection type.");
      return;
    }
    const isoDate = formatIsoDate(bookDate);
    setBookSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/api/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: Number(id),
          inspectionType: selectedTemplate.inspectionType,
          checklistTemplateId: selectedTemplate.templateId,
          scheduledDate: isoDate,
          scheduledTime: bookTime.trim() || undefined,
        }),
      });
      if (res.status === 403) {
        const body = await res.json().catch(() => ({}));
        const isQuota = body.error === "inspection_limit_reached" || body.error === "project_limit_reached";
        if (isQuota) {
          setBookOpen(false);
          setQuotaError(body.message ?? "You've reached your plan limit.");
          return;
        }
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed");
      }
      setBookOpen(false);
      setSelectedTemplate(null);
      setBookDate(new Date());
      setBookTime("");
      refetchInspections();
      refetch();
    } catch (err: any) {
      Alert.alert("Error", err.message === "inspection_limit_reached" ? "Inspection limit reached. Please upgrade your plan." : "Failed to book inspection. Please try again.");
    } finally {
      setBookSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  if (!project) {
    return (
      <EmptyState icon="folder" title="Project not found" description="This project may have been removed or you don't have access to it." />
    );
  }

  const completedInspections = inspections.filter((i: any) => i.status === "completed").length;

  return (
    <View style={styles.container}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <Badge label={project.status} variant="status" value={project.status} />
        </View>

        <Text style={styles.projectName}>{project.name}</Text>

        <Pressable
          style={styles.metaRow}
          onPress={() => {
            const addr = encodeURIComponent(`${project.siteAddress}, ${project.suburb} ${project.state} ${project.postcode}`);
            Linking.openURL(`https://maps.apple.com/?q=${addr}`).catch(() =>
              Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${addr}`)
            );
          }}
          hitSlop={8}
        >
          <Feather name="map-pin" size={14} color={Colors.secondary} />
          <Text style={[styles.metaText, { color: Colors.secondary, textDecorationLine: "underline" }]}>
            {project.siteAddress}, {project.suburb} {project.state} {project.postcode}
          </Text>
        </Pressable>

        <View style={styles.metaRow}>
          <Feather name="user" size={14} color={Colors.textTertiary} />
          <Text style={styles.metaText}>{project.clientName}</Text>
          {project.clientEmail && <Text style={styles.metaText}> · {project.clientEmail}</Text>}
        </View>

        {project.clientPhone && (
          <View style={styles.metaRow}>
            <Feather name="phone" size={14} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{project.clientPhone}</Text>
          </View>
        )}

        <View style={styles.stagePill}>
          <Text style={styles.stagePillText}>Stage: {PROJECT_STAGES[project.stage] || project.stage}</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{inspections.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statBox, styles.statBorder]}>
          <Text style={styles.statValue}>{completedInspections}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statBox, styles.statBorder]}>
          <Text style={styles.statValue}>{upcomingInspections.length}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
      </View>

      {/* Project Details */}
      <View style={styles.detailsCard}>
        <Text style={styles.cardTitle}>Project Details</Text>
        {[
          { label: "Classification", value: project.buildingClassification },
          { label: "Council Approval", value: project.councilApprovalNum },
          { label: "PCA Ref", value: project.pcaRefNumber },
          { label: "Contract Value", value: project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : null },
          { label: "Area", value: project.floorArea ? `${project.floorArea} m²` : null },
          { label: "Start Date", value: project.startDate ? new Date(project.startDate).toLocaleDateString("en-AU") : null },
          { label: "Expected End", value: project.expectedEndDate ? new Date(project.expectedEndDate).toLocaleDateString("en-AU") : null },
          { label: "Number of Lots", value: project.numberOfLots },
          { label: "Storeys", value: project.numberOfStoreys },
        ].filter(d => d.value !== null && d.value !== undefined).map((d, i) => (
          <View key={d.label} style={[styles.detailRow, i > 0 && styles.detailBorder]}>
            <Text style={styles.detailLabel}>{d.label}</Text>
            <Text style={styles.detailValue}>{String(d.value)}</Text>
          </View>
        ))}
      </View>

      {/* Inspections */}
      <View style={styles.section}>
        <SectionHeader
          title={`Inspections (${inspections.length})`}
          actionLabel="Add"
          onAction={() => setBookOpen(true)}
        />
        {inspections.length === 0 ? (
          <EmptyState icon="clipboard" title="No inspections yet" description='Tap "Add" to book an inspection' />
        ) : (
          <>
            {upcomingInspections.slice(0, 3).map((i: any) => (
              <InspectionCard key={i.id} inspection={i} showProject={false} />
            ))}
            {inspections.filter((i: any) => i.status === "completed").slice(0, 2).map((i: any) => (
              <InspectionCard key={i.id} inspection={i} showProject={false} />
            ))}
          </>
        )}
      </View>

      {/* Reports */}
      <View style={styles.section}>
        <SectionHeader title={`Reports (${reports.length})`} />
        {reports.length === 0 ? (
          <EmptyState icon="file-text" title="No reports yet" description="Reports are generated from completed inspections" />
        ) : (
          reports.slice(0, 5).map((r: any) => {
            const sm = REPORT_STATUS[r.status] || REPORT_STATUS.draft;
            return (
              <Pressable
                key={r.id}
                style={({ pressed }) => [styles.reportCard, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  router.push({
                    pathname: "/inspection/document-viewer" as any,
                    params: {
                      url: `${baseUrl}/api/reports/${r.id}/pdf?_token=${encodeURIComponent(token ?? "")}`,
                      name: REPORT_TYPES[r.reportType] || r.reportType || "Report",
                      mimeType: "application/pdf",
                    },
                  });
                }}
              >
                <View style={styles.reportCardHeader}>
                  <View style={[styles.reportStatusTag, { backgroundColor: sm.bg }]}>
                    <Text style={[styles.reportStatusText, { color: sm.color }]}>{sm.label}</Text>
                  </View>
                  <Text style={styles.reportDate}>
                    {new Date(r.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </Text>
                </View>
                <Text style={styles.reportType}>{REPORT_TYPES[r.reportType] || r.reportType}</Text>
                <View style={styles.reportFooter}>
                  <Feather name="file-text" size={12} color={Colors.secondary} />
                  <Text style={styles.reportRef}>Tap to view PDF</Text>
                  <Feather name="chevron-right" size={15} color={Colors.textTertiary} style={{ marginLeft: "auto" }} />
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* Notes */}
      {project.notes && (
        <View style={styles.notesCard}>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.notesText}>{project.notes}</Text>
        </View>
      )}
    </ScrollView>

    {/* Book Inspection Modal */}
    <Modal
      visible={bookOpen}
      animationType="slide"
      transparent
      onRequestClose={() => setBookOpen(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setBookOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Book Inspection</Text>
            <Pressable onPress={() => setBookOpen(false)} style={styles.modalClose}>
              <Feather name="x" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <Text style={styles.modalProjectName}>{project.name}</Text>

          {/* Template Picker */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Inspection Type *</Text>
            <Pressable
              style={styles.pickerBtn}
              onPress={() => setShowTemplatePicker(!showTemplatePicker)}
            >
              <Text style={[styles.pickerBtnText, !selectedTemplate && styles.pickerPlaceholder]}>
                {selectedTemplate ? selectedTemplate.name : "Select inspection type…"}
              </Text>
              <Feather name={showTemplatePicker ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
            </Pressable>
            {showTemplatePicker && (
              <ScrollView
                style={styles.pickerDropdown}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {inspectionTypes.length === 0 ? (
                  <Text style={styles.pickerEmpty}>No inspection types selected on desktop yet</Text>
                ) : (
                  inspectionTypes.map((t: any) => (
                    <Pressable
                      key={t.templateId}
                      style={[styles.pickerOption, selectedTemplate?.templateId === t.templateId && styles.pickerOptionActive]}
                      onPress={() => { setSelectedTemplate(t); setShowTemplatePicker(false); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerOptionText, selectedTemplate?.templateId === t.templateId && styles.pickerOptionTextActive]}>
                          {t.name}
                        </Text>
                        <Text style={styles.pickerOptionSub}>{t.folder} · {t.itemCount} items</Text>
                      </View>
                      {selectedTemplate?.templateId === t.templateId && (
                        <Feather name="check" size={16} color={Colors.secondary} />
                      )}
                    </Pressable>
                  ))
                )}
              </ScrollView>
            )}
          </View>

          {/* Date */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Date *</Text>
            <Pressable
              style={styles.datePickerBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Feather name="calendar" size={16} color={Colors.secondary} />
              <Text style={styles.datePickerText}>{formatDisplayDate(bookDate)}</Text>
              <Feather name="chevron-down" size={16} color={Colors.textSecondary} />
            </Pressable>

            {showDatePicker && (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={bookDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "inline" : "calendar"}
                  minimumDate={new Date()}
                  accentColor={Colors.secondary}
                  themeVariant="light"
                  onChange={(_, selectedDate) => {
                    if (Platform.OS === "android") setShowDatePicker(false);
                    if (selectedDate) setBookDate(selectedDate);
                  }}
                  style={{ alignSelf: "center" }}
                />
                {Platform.OS === "ios" && (
                  <TouchableOpacity
                    style={styles.datePickerDone}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Time */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Time (optional)</Text>
            <TextInput
              style={styles.fieldInput}
              value={bookTime}
              onChangeText={setBookTime}
              placeholder="e.g. 9:00 AM"
              placeholderTextColor={Colors.textTertiary}
            />
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.bookBtn, bookSubmitting && { opacity: 0.6 }]}
            onPress={handleBookInspection}
            disabled={bookSubmitting}
          >
            <Feather name="calendar" size={16} color="#fff" />
            <Text style={styles.bookBtnText}>{bookSubmitting ? "Booking…" : "Book Inspection"}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Quota / Plan limit upgrade modal */}
    <Modal visible={!!quotaError} transparent animationType="fade" onRequestClose={() => setQuotaError(null)}>
      <View style={styles.quotaOverlay}>
        <View style={styles.quotaCard}>
          <View style={styles.quotaIconWrap}>
            <Feather name="zap" size={28} color={Colors.secondary} />
          </View>
          <Text style={styles.quotaTitle}>Plan limit reached</Text>
          <Text style={styles.quotaMessage}>{quotaError}</Text>
          <TouchableOpacity
            style={styles.quotaBtn}
            onPress={() => {
              setQuotaError(null);
              const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
              const url = domain ? `https://${domain}/billing` : "https://inspectproof.com.au/billing";
              Linking.openURL(url).catch(() => {});
            }}
          >
            <Feather name="arrow-up-right" size={16} color="#fff" />
            <Text style={styles.quotaBtnText}>View upgrade options</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quotaDismiss} onPress={() => setQuotaError(null)}>
            <Text style={styles.quotaDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { gap: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backBtn: {
    padding: 4,
  },
  projectName: {
    fontSize: 22,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    flex: 1,
  },
  stagePill: {
    alignSelf: "flex-start",
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  stagePillText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  statBox: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statBorder: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderLight,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    overflow: "hidden",
    padding: 16,
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    textAlign: "right",
    maxWidth: "60%",
  },
  section: {
    marginHorizontal: 16,
    gap: 10,
  },
  reportCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  reportCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reportStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reportStatusText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  reportDate: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textTertiary,
  },
  reportType: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  reportFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  reportRef: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.secondary,
  },
  notesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 8,
  },
  notesText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  modalClose: {
    padding: 4,
  },
  modalProjectName: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
    backgroundColor: Colors.secondary + "15",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  fieldInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  pickerBtn: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.background,
  },
  pickerBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    flex: 1,
  },
  pickerPlaceholder: {
    color: Colors.textTertiary,
  },
  pickerDropdown: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.background,
    maxHeight: 220,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    gap: 10,
  },
  pickerOptionActive: {
    backgroundColor: Colors.secondary + "10",
  },
  pickerOptionText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  pickerOptionTextActive: {
    color: Colors.secondary,
  },
  pickerOptionSub: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  pickerEmpty: {
    padding: 16,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textAlign: "center",
  },
  datePickerBtn: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.secondary + "60",
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.secondary + "08",
  },
  datePickerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  datePickerContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    backgroundColor: Colors.background,
    overflow: "hidden",
    marginTop: 4,
  },
  datePickerDone: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  datePickerDoneText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  bookBtn: {
    backgroundColor: Colors.secondary,
    borderRadius: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  bookBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  quotaOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  quotaCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 12,
  },
  quotaIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.secondary + "20",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  quotaTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    textAlign: "center",
  },
  quotaMessage: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },
  quotaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
    width: "100%",
    justifyContent: "center",
  },
  quotaBtnText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  quotaDismiss: {
    paddingVertical: 8,
  },
  quotaDismissText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
  },
});

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
import { useNotifications } from "@/context/NotificationsContext";
import { PROJECT_STAGES } from "@/constants/api";

const CONTACT_ROLE_LABELS: Record<string, string> = {
  builder: "Builder",
  owner: "Owner / Client",
  contractor: "Contractor",
  consultant: "Consultant",
  designer: "Designer / Architect",
  other: "Other",
};

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
  const { openAddressInMaps } = useNotifications();
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

  const { data: contacts = [], refetch: refetchContacts } = useQuery<any[]>({
    queryKey: ["project-contacts", id, token],
    queryFn: () => fetchWithAuth(`/api/projects/${id}/contractors`),
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
          setQuotaError("Your account has reached its usage limit.");
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
      Alert.alert("Error", err.message === "inspection_limit_reached" ? "Your account has reached its usage limit. Please visit inspectproof.com.au or contact your account administrator." : "Failed to book inspection. Please try again.");
    } finally {
      setBookSubmitting(false);
    }
  };

  // Add contact state
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("");
  const [newContactTrade, setNewContactTrade] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactCompany, setNewContactCompany] = useState("");
  const [newContactIsPrimary, setNewContactIsPrimary] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [addContactError, setAddContactError] = useState("");
  const [showRolePicker, setShowRolePicker] = useState(false);

  const CONTACT_ROLE_OPTIONS = [
    { value: "builder", label: "Builder" },
    { value: "owner", label: "Owner / Client" },
    { value: "contractor", label: "Contractor" },
    { value: "consultant", label: "Consultant" },
    { value: "designer", label: "Designer / Architect" },
    { value: "other", label: "Other" },
  ];

  const handleAddContact = async () => {
    if (!newContactName.trim()) { setAddContactError("Name is required."); return; }
    setAddContactError(""); setAddingContact(true);
    try {
      const res = await fetch(`${baseUrl}/api/projects/${id}/contractors`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: newContactName.trim(),
          trade: newContactTrade.trim() || undefined,
          email: newContactEmail.trim() || null,
          phone: newContactPhone.trim() || null,
          company: newContactCompany.trim() || null,
          contactRole: newContactRole || null,
          isPrimary: newContactIsPrimary,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.error === "duplicate_email") {
          setAddContactError("A contact with this email already exists on this project.");
        } else {
          setAddContactError("Failed to add contact. Please try again.");
        }
        return;
      }
      setAddContactOpen(false);
      setNewContactName(""); setNewContactRole(""); setNewContactTrade(""); setNewContactEmail(""); setNewContactPhone(""); setNewContactCompany(""); setNewContactIsPrimary(false);
      refetchContacts();
    } catch {
      setAddContactError("Failed to add contact. Please try again.");
    } finally {
      setAddingContact(false);
    }
  };

  // Send report modal state
  const [sendReportOpen, setSendReportOpen] = useState(false);
  const [sendReportTarget, setSendReportTarget] = useState<any>(null);
  const [sendSelectedIds, setSendSelectedIds] = useState<Set<number>>(new Set());
  const [sendCustomEmail, setSendCustomEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);

  const openSendReport = (report: any) => {
    setSendReportTarget(report);
    setSendError("");
    setSendSuccess(false);
    setSendCustomEmail("");
    const primary = (contacts as any[]).find((c: any) => c.isPrimary && c.email);
    setSendSelectedIds(primary ? new Set([primary.id]) : new Set());
    setSendReportOpen(true);
  };

  const handleSendReport = async () => {
    if (sendSelectedIds.size === 0 && !sendCustomEmail.trim()) {
      setSendError("Select at least one recipient or enter a custom email.");
      return;
    }
    setSendError(""); setSending(true);
    try {
      const selected = (contacts as any[]).filter((c: any) => sendSelectedIds.has(c.id) && c.email);
      const recipients = [
        ...selected.map((c: any) => ({ email: c.email, name: c.name })),
        ...(sendCustomEmail.trim() ? [{ email: sendCustomEmail.trim() }] : []),
      ];
      for (const r of recipients) {
        const res = await fetch(`${baseUrl}/api/reports/${sendReportTarget.id}/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sentTo: r.email, recipientName: r.name }),
        });
        if (!res.ok) throw new Error("Send failed");
      }
      setSendSuccess(true);
    } catch {
      setSendError("Failed to send. Please try again.");
    } finally {
      setSending(false);
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
          onPress={() => openAddressInMaps(project.siteAddress, project.suburb)}
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
                  <Pressable
                    onPress={e => { e.stopPropagation?.(); openSendReport(r); }}
                    style={styles.reportSendBtn}
                  >
                    <Feather name="send" size={13} color={Colors.secondary} />
                    <Text style={styles.reportSendBtnText}>Send</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </View>

      {/* Inductions */}
      <InductionsSection projectId={id as string} baseUrl={baseUrl} token={token} />

      {/* Contacts */}
      <View style={styles.section}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { flex: 1 }]}>Contacts{contacts.length > 0 ? ` (${contacts.length})` : ""}</Text>
          <Pressable onPress={() => setAddContactOpen(true)} style={styles.addContactBtn}>
            <Feather name="user-plus" size={13} color={Colors.secondary} />
            <Text style={styles.addContactBtnText}>Add</Text>
          </Pressable>
        </View>
        {contacts.length === 0 && (
          <Text style={[styles.contactSub, { textAlign: "center", paddingVertical: 12 }]}>No contacts yet</Text>
        )}
        {contacts.map((c: any, i: number) => (
          <View key={c.id} style={[styles.contactCard, i > 0 && { marginTop: 8 }]}>
            <View style={styles.contactRow}>
              <View style={styles.contactAvatar}>
                <Feather name="user" size={16} color={Colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={styles.contactName}>{c.name}</Text>
                  {c.isPrimary && (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                    </View>
                  )}
                  {c.contactRole && (
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{CONTACT_ROLE_LABELS[c.contactRole] || c.contactRole}</Text>
                    </View>
                  )}
                </View>
                {c.trade ? <Text style={styles.contactSub}>{c.trade}{c.company ? ` · ${c.company}` : ""}</Text> : c.company ? <Text style={styles.contactSub}>{c.company}</Text> : null}
                {c.email && (
                  <Pressable onPress={() => Linking.openURL(`mailto:${c.email}`)}>
                    <Text style={[styles.contactSub, { color: Colors.secondary, textDecorationLine: "underline" }]}>{c.email}</Text>
                  </Pressable>
                )}
                {c.phone && (
                  <Pressable onPress={() => Linking.openURL(`tel:${c.phone}`)}>
                    <Text style={[styles.contactSub, { color: Colors.secondary }]}>{c.phone}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ))}
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

    {/* Quota / Plan limit modal */}
    <Modal visible={!!quotaError} transparent animationType="fade" onRequestClose={() => setQuotaError(null)}>
      <View style={styles.quotaOverlay}>
        <View style={styles.quotaCard}>
          <View style={styles.quotaIconWrap}>
            <Feather name="info" size={28} color={Colors.secondary} />
          </View>
          <Text style={styles.quotaTitle}>Usage limit reached</Text>
          <Text style={styles.quotaMessage}>{quotaError}</Text>
          {Platform.OS === "ios" ? (
            <Text style={styles.quotaInfoText}>
              To manage your plan, visit inspectproof.com.au or contact your account administrator.
            </Text>
          ) : (
            <TouchableOpacity
              style={styles.quotaBtn}
              onPress={() => {
                setQuotaError(null);
                const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
                const url = domain ? `https://${domain}/dashboard` : "https://inspectproof.com.au/dashboard";
                Linking.openURL(url).catch(() => {});
              }}
            >
              <Feather name="external-link" size={16} color="#fff" />
              <Text style={styles.quotaBtnText}>Go to account dashboard</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.quotaDismiss} onPress={() => setQuotaError(null)}>
            <Text style={styles.quotaDismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Send Report Modal */}
    <Modal visible={sendReportOpen} animationType="slide" transparent onRequestClose={() => setSendReportOpen(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSendReportOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Send Report</Text>
            <Pressable onPress={() => setSendReportOpen(false)} style={styles.modalClose}>
              <Feather name="x" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
          {sendSuccess ? (
            <View style={{ alignItems: "center", padding: 32, gap: 12 }}>
              <Feather name="check-circle" size={48} color="#16a34a" />
              <Text style={{ fontSize: 16, fontFamily: "PlusJakartaSans_700Bold", color: Colors.text }}>Report Sent!</Text>
              <TouchableOpacity onPress={() => setSendReportOpen(false)} style={[styles.bookBtn, { marginTop: 8 }]}>
                <Text style={styles.bookBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              {(contacts as any[]).filter((c: any) => c.email).length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>Project Contacts</Text>
                  {(contacts as any[]).filter((c: any) => c.email).map((c: any) => (
                    <Pressable
                      key={c.id}
                      style={[styles.sendContactRow, sendSelectedIds.has(c.id) && styles.sendContactRowActive]}
                      onPress={() => {
                        setSendSelectedIds(prev => {
                          const next = new Set(prev);
                          next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                          return next;
                        });
                      }}
                    >
                      <View style={[styles.sendCheckbox, sendSelectedIds.has(c.id) && styles.sendCheckboxActive]}>
                        {sendSelectedIds.has(c.id) && <Feather name="check" size={11} color="#fff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contactName}>{c.name}{c.isPrimary ? " · Primary" : ""}</Text>
                        <Text style={styles.contactSub}>{c.email}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Additional Recipient</Text>
                <TextInput
                  style={styles.textInput}
                  value={sendCustomEmail}
                  onChangeText={setSendCustomEmail}
                  placeholder="email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
              {sendError ? <Text style={{ color: "#dc2626", fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", marginHorizontal: 16, marginBottom: 8 }}>{sendError}</Text> : null}
              <TouchableOpacity
                onPress={handleSendReport}
                disabled={sending}
                style={[styles.bookBtn, { opacity: sending ? 0.6 : 1 }]}
              >
                {sending && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
                <Text style={styles.bookBtnText}>
                  {sending ? "Sending…" : `Send to ${sendSelectedIds.size + (sendCustomEmail.trim() ? 1 : 0)} recipient${sendSelectedIds.size + (sendCustomEmail.trim() ? 1 : 0) !== 1 ? "s" : ""}`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Add Contact Modal */}
    <Modal visible={addContactOpen} animationType="slide" transparent onRequestClose={() => setAddContactOpen(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddContactOpen(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Contact</Text>
            <Pressable onPress={() => setAddContactOpen(false)} style={styles.modalClose}>
              <Feather name="x" size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
            {addContactError ? (
              <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10 }}>
                <Text style={{ color: "#dc2626", fontSize: 13, fontFamily: "PlusJakartaSans_400Regular" }}>{addContactError}</Text>
              </View>
            ) : null}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.textInput}
                value={newContactName}
                onChangeText={setNewContactName}
                placeholder="Full name"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Role</Text>
              <Pressable style={styles.pickerBtn} onPress={() => setShowRolePicker(!showRolePicker)}>
                <Text style={[styles.pickerBtnText, !newContactRole && styles.pickerPlaceholder]}>
                  {newContactRole ? CONTACT_ROLE_OPTIONS.find(o => o.value === newContactRole)?.label ?? newContactRole : "Select role…"}
                </Text>
                <Feather name={showRolePicker ? "chevron-up" : "chevron-down"} size={16} color={Colors.textSecondary} />
              </Pressable>
              {showRolePicker && (
                <View style={styles.pickerDropdown}>
                  {CONTACT_ROLE_OPTIONS.map(opt => (
                    <Pressable
                      key={opt.value}
                      style={[styles.pickerOption, newContactRole === opt.value && styles.pickerOptionActive]}
                      onPress={() => { setNewContactRole(opt.value); setShowRolePicker(false); }}
                    >
                      <Text style={[styles.pickerOptionText, newContactRole === opt.value && styles.pickerOptionTextActive]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.textInput}
                value={newContactPhone}
                onChangeText={setNewContactPhone}
                placeholder="+61 400 000 000"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.textInput}
                value={newContactEmail}
                onChangeText={setNewContactEmail}
                placeholder="email@example.com"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Company</Text>
              <TextInput
                style={styles.textInput}
                value={newContactCompany}
                onChangeText={setNewContactCompany}
                placeholder="Company name"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Trade / Discipline</Text>
              <TextInput
                style={styles.textInput}
                value={newContactTrade}
                onChangeText={setNewContactTrade}
                placeholder="e.g. Electrician, Plumber"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
              onPress={() => setNewContactIsPrimary(!newContactIsPrimary)}
            >
              <View style={[styles.sendCheckbox, newContactIsPrimary && styles.sendCheckboxActive]}>
                {newContactIsPrimary && <Feather name="check" size={11} color="#fff" />}
              </View>
              <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Set as primary contact</Text>
            </Pressable>
            <TouchableOpacity
              onPress={handleAddContact}
              disabled={addingContact}
              style={[styles.bookBtn, { opacity: addingContact ? 0.6 : 1 }]}
            >
              {addingContact && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />}
              <Text style={styles.bookBtnText}>{addingContact ? "Adding…" : "Add Contact"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  contactCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondary + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  contactName: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.text,
  },
  contactSub: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  primaryBadge: {
    backgroundColor: Colors.secondary + "15",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.secondary + "40",
  },
  primaryBadgeText: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.secondary,
    letterSpacing: 0.5,
  },
  roleBadge: {
    backgroundColor: "#f5f3ff",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },
  roleBadgeText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#7c3aed",
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
  quotaInfoText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 4,
  },
  quotaDismiss: {
    paddingVertical: 8,
  },
  quotaDismissText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  addContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: Colors.secondary + "12",
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  addContactBtnText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  reportSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.secondary + "12",
    borderWidth: 1,
    borderColor: Colors.secondary + "30",
  },
  reportSendBtnText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  sendContactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  sendContactRowActive: {
    backgroundColor: Colors.secondary + "08",
  },
  sendCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  sendCheckboxActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.background,
  },
});

// ── InductionsSection ─────────────────────────────────────────────────────────

interface InductionItem {
  id: number;
  title: string;
  scheduledDate: string;
  status: string;
  attendeeCount: number;
}

function InductionsSection({ projectId, baseUrl, token }: { projectId: string; baseUrl: string; token: string | null }) {
  const { data: inductions = [], isLoading } = useQuery<InductionItem[]>({
    queryKey: ["project-inductions", projectId, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/inductions`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token && !!projectId,
  });

  const indStyles = StyleSheet.create({
    section: { marginTop: 16, paddingHorizontal: 16 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    title: { fontSize: 15, fontFamily: "PlusJakartaSans_700Bold", color: Colors.primary },
    count: { fontSize: 13, color: Colors.textSecondary },
    card: {
      backgroundColor: "#fff",
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: "#e2e8f0",
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    overdue: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
    icon: {
      width: 36, height: 36, borderRadius: 8, backgroundColor: "#f0fdf4",
      alignItems: "center", justifyContent: "center",
    },
    cardInfo: { flex: 1 },
    cardTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
    cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    statusBadge: {
      paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
    },
    statusText: { fontSize: 11, fontWeight: "600" },
    empty: { alignItems: "center", paddingVertical: 20 },
    emptyText: { fontSize: 13, color: Colors.textSecondary, marginTop: 6 },
  });

  const today = new Date().toISOString().split("T")[0];

  return (
    <View style={indStyles.section}>
      <View style={indStyles.header}>
        <Text style={indStyles.title}>Inductions ({inductions.length})</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={Colors.secondary} />
      ) : inductions.length === 0 ? (
        <View style={indStyles.empty}>
          <Feather name="shield" size={28} color={Colors.textSecondary} />
          <Text style={indStyles.emptyText}>No inductions recorded</Text>
        </View>
      ) : (
        inductions.slice(0, 5).map(ind => {
          const overdue = ind.status === "scheduled" && ind.scheduledDate < today;
          const statusColors: Record<string, { bg: string; text: string; border: string }> = {
            scheduled: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
            in_progress: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
            completed: { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
            cancelled: { bg: "#f9fafb", text: "#6b7280", border: "#e5e7eb" },
          };
          const sc = statusColors[ind.status] || statusColors.scheduled;
          const dateStr = ind.scheduledDate
            ? new Date(ind.scheduledDate + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })
            : "—";
          return (
            <Pressable
              key={ind.id}
              style={[indStyles.card, overdue && indStyles.overdue]}
              onPress={() => router.push(`/inspection/conduct/induction/${ind.id}` as never)}
            >
              <View style={[indStyles.icon, { backgroundColor: sc.bg }]}>
                <Feather name="shield" size={16} color={sc.text} />
              </View>
              <View style={indStyles.cardInfo}>
                <Text style={indStyles.cardTitle}>{ind.title}</Text>
                <Text style={indStyles.cardMeta}>{dateStr} · {ind.attendeeCount} attendee{ind.attendeeCount !== 1 ? "s" : ""}{overdue ? " · Overdue" : ""}</Text>
              </View>
              <View style={[indStyles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                <Text style={[indStyles.statusText, { color: sc.text }]}>
                  {ind.status === "in_progress" ? "Active" : ind.status.charAt(0).toUpperCase() + ind.status.slice(1)}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
            </Pressable>
          );
        })
      )}
    </View>
  );
}

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { INSPECTION_TYPES } from "@/constants/api";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

type Mode = "project" | "custom" | null;

const STEP_LABELS_PROJECT = ["Project", "Inspection", "Confirm"];
const STEP_LABELS_CUSTOM  = ["Project", "Template",   "Confirm"];

function formatDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
}

export default function CreateInspectionScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [step, setStep]                   = useState(0);
  const [mode, setMode]                   = useState<Mode>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedInspection, setSelectedInspection] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate]     = useState<any>(null);

  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [reason, setReason]               = useState("");
  const [submitting, setSubmitting]       = useState(false);

  const STEPS = mode === "custom" ? STEP_LABELS_CUSTOM : STEP_LABELS_PROJECT;

  const { data: projects = [], isLoading: loadingProjects } = useQuery<any[]>({
    queryKey: ["projects", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const { data: projectInspections = [], isLoading: loadingInspections } = useQuery<any[]>({
    queryKey: ["project-inspections", selectedProject?.id, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/inspections?projectId=${selectedProject.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      const all = await res.json();
      return all.filter((i: any) => i.status === "scheduled" || i.status === "in_progress");
    },
    enabled: !!token && !!selectedProject && mode === "project",
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<any[]>({
    queryKey: ["checklist-templates", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/checklist-templates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token && mode === "custom",
  });

  const canGoNext = () => {
    if (step === 0) return mode === "project" ? !!selectedProject : mode === "custom";
    if (step === 1) return mode === "project" ? !!selectedInspection : !!selectedTemplate;
    return true;
  };

  const handleBegin = async () => {
    if (mode === "project" && selectedInspection) {
      router.replace(`/inspection/conduct/${selectedInspection.id}` as any);
      return;
    }
    if (mode === "custom" && selectedTemplate) {
      setSubmitting(true);
      try {
        const res = await fetch(`${baseUrl}/api/inspections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            projectId: selectedProject?.id ?? null,
            inspectionType: selectedTemplate.inspectionType,
            scheduledDate,
            scheduledTime,
            notes: reason,
            checklistTemplateId: selectedTemplate.id,
            inspectorId: 1,
          }),
        });
        if (!res.ok) throw new Error("Failed to create inspection");
        const inspection = await res.json();
        queryClient.invalidateQueries({ queryKey: ["inspections"] });
        router.replace(`/inspection/conduct/${inspection.id}` as any);
      } catch (e: any) {
        Alert.alert("Error", e.message || "Failed to create inspection");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleNext = () => {
    if (canGoNext()) setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step === 0) { router.back(); return; }
    if (step === 1 && mode !== null) {
      setStep(0);
      setSelectedInspection(null);
      setSelectedTemplate(null);
      return;
    }
    setStep(s => s - 1);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + WEB_TOP }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={12}>
          <Feather name={step === 0 ? "x" : "arrow-left"} size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>New Inspection</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, i <= step && styles.stepCircleActive, i < step && styles.stepCircleDone]}>
                {i < step ? (
                  <Feather name="check" size={11} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, i <= step && styles.stepNumActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, i <= step && styles.stepLabelActive]}>{s}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, i < step && styles.stepLineDone]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── STEP 0: Project ── */}
        {step === 0 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Select Project</Text>
            <Text style={styles.stepSub}>
              Choose the project for this inspection, or start a standalone custom inspection.
            </Text>
            {loadingProjects ? (
              <ActivityIndicator color={Colors.secondary} style={{ marginTop: 32 }} />
            ) : (
              <View style={styles.cardList}>
                {projects.filter((p: any) => p.status === "active").map((p: any) => (
                  <Pressable
                    key={p.id}
                    style={[styles.projectCard, selectedProject?.id === p.id && mode === "project" && styles.cardSelected]}
                    onPress={() => { setSelectedProject(p); setMode("project"); setSelectedInspection(null); }}
                  >
                    <View style={[styles.projectIcon, selectedProject?.id === p.id && mode === "project" && { backgroundColor: Colors.secondary + "20" }]}>
                      <Feather name="home" size={18} color={selectedProject?.id === p.id && mode === "project" ? Colors.secondary : Colors.textSecondary} />
                    </View>
                    <View style={styles.projectInfo}>
                      <Text style={[styles.projectName, selectedProject?.id === p.id && mode === "project" && styles.selectedText]} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.projectAddr} numberOfLines={1}>{p.siteAddress}, {p.suburb}</Text>
                    </View>
                    {selectedProject?.id === p.id && mode === "project" && (
                      <Feather name="check-circle" size={18} color={Colors.secondary} />
                    )}
                  </Pressable>
                ))}

                {/* Custom Inspection option */}
                <Pressable
                  style={[styles.customCard, mode === "custom" && styles.customCardSelected]}
                  onPress={() => { setMode("custom"); setSelectedProject(null); setSelectedInspection(null); }}
                >
                  <View style={[styles.projectIcon, { backgroundColor: mode === "custom" ? Colors.accent + "30" : Colors.borderLight }]}>
                    <Feather name="plus-circle" size={18} color={mode === "custom" ? Colors.primary : Colors.textSecondary} />
                  </View>
                  <View style={styles.projectInfo}>
                    <Text style={[styles.projectName, mode === "custom" && { color: Colors.primary }]}>Custom Inspection</Text>
                    <Text style={styles.projectAddr}>Not linked to a specific project</Text>
                  </View>
                  {mode === "custom" && (
                    <Feather name="check-circle" size={18} color={Colors.primary} />
                  )}
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── STEP 1a: Inspections (project mode) ── */}
        {step === 1 && mode === "project" && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Select Inspection</Text>
            <Text style={styles.stepSub}>
              These inspections have been scheduled for <Text style={{ color: Colors.secondary }}>{selectedProject?.name}</Text>.
            </Text>
            {loadingInspections ? (
              <ActivityIndicator color={Colors.secondary} style={{ marginTop: 32 }} />
            ) : projectInspections.length === 0 ? (
              <View style={styles.emptyNote}>
                <View style={styles.emptyIcon}>
                  <Feather name="calendar" size={28} color={Colors.textTertiary} />
                </View>
                <Text style={styles.emptyTitle}>No inspections scheduled</Text>
                <Text style={styles.emptySub}>
                  This project has no upcoming inspections. Create one from the desktop app, or use a custom inspection.
                </Text>
                <Pressable
                  style={styles.emptyAction}
                  onPress={() => { setMode("custom"); setSelectedProject(null); setSelectedInspection(null); setStep(1); }}
                >
                  <Feather name="plus" size={14} color={Colors.primary} />
                  <Text style={styles.emptyActionText}>Switch to Custom</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.cardList}>
                {projectInspections.map((insp: any) => {
                  const isSelected = selectedInspection?.id === insp.id;
                  const typeLabel = INSPECTION_TYPES[insp.inspectionType] || insp.inspectionType;
                  const statusIn = insp.status === "in_progress";
                  return (
                    <Pressable
                      key={insp.id}
                      style={[styles.inspCard, isSelected && styles.cardSelected]}
                      onPress={() => setSelectedInspection(insp)}
                    >
                      <View style={styles.inspCardTop}>
                        <View style={styles.typePill}>
                          <Feather name="clipboard" size={11} color={Colors.secondary} />
                          <Text style={styles.typePillText}>{typeLabel}</Text>
                        </View>
                        {statusIn && (
                          <View style={styles.inProgressBadge}>
                            <Text style={styles.inProgressText}>In Progress</Text>
                          </View>
                        )}
                        {isSelected && <Feather name="check-circle" size={16} color={Colors.secondary} style={{ marginLeft: "auto" }} />}
                      </View>

                      {insp.checklistTemplateName ? (
                        <Text style={[styles.inspTemplateName, isSelected && { color: Colors.primary }]} numberOfLines={1}>
                          {insp.checklistTemplateName}
                        </Text>
                      ) : (
                        <Text style={styles.inspNoTemplate}>No checklist template assigned</Text>
                      )}

                      <View style={styles.inspMeta}>
                        <Feather name="calendar" size={11} color={Colors.textTertiary} />
                        <Text style={styles.inspMetaText}>
                          {formatDate(insp.scheduledDate)}{insp.scheduledTime ? ` · ${insp.scheduledTime}` : ""}
                        </Text>
                        {insp.totalItems > 0 && (
                          <>
                            <Text style={styles.inspMetaDot}>·</Text>
                            <Text style={styles.inspMetaText}>{insp.totalItems} items</Text>
                          </>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── STEP 1b: Template (custom mode) ── */}
        {step === 1 && mode === "custom" && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Select Template</Text>
            <Text style={styles.stepSub}>Choose the checklist template that defines what will be inspected.</Text>
            {loadingTemplates ? (
              <ActivityIndicator color={Colors.secondary} style={{ marginTop: 32 }} />
            ) : templates.length === 0 ? (
              <View style={styles.emptyNote}>
                <Feather name="clipboard" size={36} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>No templates available</Text>
                <Text style={styles.emptySub}>Create checklist templates from the desktop app.</Text>
              </View>
            ) : (
              <View style={styles.cardList}>
                {templates.map((t: any) => {
                  const isSelected = selectedTemplate?.id === t.id;
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.templateCard, isSelected && styles.cardSelected]}
                      onPress={() => setSelectedTemplate(t)}
                    >
                      <View style={[styles.templateIcon, isSelected && { backgroundColor: Colors.secondary + "20" }]}>
                        <Feather name="clipboard" size={18} color={isSelected ? Colors.secondary : Colors.textSecondary} />
                      </View>
                      <View style={styles.templateInfo}>
                        <Text style={[styles.templateName, isSelected && styles.selectedText]} numberOfLines={1}>{t.name}</Text>
                        <Text style={styles.templateMeta}>
                          {INSPECTION_TYPES[t.inspectionType] || t.inspectionType}
                          {t.itemCount > 0 ? ` · ${t.itemCount} items` : ""}
                        </Text>
                        {t.description ? <Text style={styles.templateDesc} numberOfLines={2}>{t.description}</Text> : null}
                      </View>
                      {isSelected && <Feather name="check-circle" size={18} color={Colors.secondary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── STEP 2: Confirm ── */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Confirm</Text>
            <Text style={styles.stepSub}>
              {mode === "project"
                ? "Review the inspection details below and begin."
                : "Set a date and time, then create and begin the inspection."}
            </Text>

            <View style={styles.reviewCard}>
              {mode === "project" && selectedInspection && (
                <>
                  <ReviewRow icon="home"      label="Project"  value={selectedProject?.name} />
                  <ReviewRow icon="clipboard" label="Checklist" value={selectedInspection.checklistTemplateName || INSPECTION_TYPES[selectedInspection.inspectionType] || selectedInspection.inspectionType} />
                  <ReviewRow icon="tag"       label="Type"     value={INSPECTION_TYPES[selectedInspection.inspectionType] || selectedInspection.inspectionType} />
                  <ReviewRow icon="calendar"  label="Scheduled" value={formatDate(selectedInspection.scheduledDate) + (selectedInspection.scheduledTime ? ` at ${selectedInspection.scheduledTime}` : "")} />
                  {selectedInspection.totalItems > 0 && (
                    <ReviewRow icon="list" label="Items" value={`${selectedInspection.totalItems} checklist items`} />
                  )}
                </>
              )}
              {mode === "custom" && selectedTemplate && (
                <>
                  <ReviewRow icon="clipboard" label="Template" value={selectedTemplate.name} />
                  <ReviewRow icon="tag"       label="Type"     value={INSPECTION_TYPES[selectedTemplate.inspectionType] || selectedTemplate.inspectionType} />
                </>
              )}
            </View>

            {mode === "custom" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.sectionLabel}>Schedule</Text>
                <View style={styles.row2}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.fieldLabel}>Date</Text>
                    <TextInput
                      style={styles.input}
                      value={scheduledDate}
                      onChangeText={setScheduledDate}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.fieldLabel}>Time</Text>
                    <TextInput
                      style={styles.input}
                      value={scheduledTime}
                      onChangeText={setScheduledTime}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.textTertiary}
                    />
                  </View>
                </View>
                <View style={{ gap: 6, marginTop: 4 }}>
                  <Text style={styles.fieldLabel}>Notes</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Purpose, special conditions, etc."
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            )}

            <View style={styles.infoBox}>
              <Feather name="info" size={14} color={Colors.secondary} />
              <Text style={styles.infoText}>
                {mode === "project"
                  ? "You'll be taken to the checklist conduct screen to begin recording results."
                  : "A new inspection record will be created and you'll go straight to the checklist."}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer nav */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step > 0 && (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Feather name="arrow-left" size={15} color={Colors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {step < 2 ? (
          <Pressable
            style={[styles.nextButton, !canGoNext() && styles.nextButtonDisabled]}
            onPress={handleNext}
          >
            <Text style={[styles.nextButtonText, !canGoNext() && { color: Colors.textTertiary }]}>
              {step === 1 ? "Review" : "Next"}
            </Text>
            <Feather name="arrow-right" size={16} color={canGoNext() ? Colors.primary : Colors.textTertiary} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.createButton, submitting && { opacity: 0.7 }]}
            onPress={handleBegin}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Feather name="play-circle" size={17} color={Colors.primary} />
                <Text style={styles.createButtonText}>
                  {mode === "project" ? "Begin Inspection" : "Create & Begin"}
                </Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function ReviewRow({ icon, label, value }: { icon: string; label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.reviewRow}>
      <Feather name={icon as any} size={14} color={Colors.textSecondary} style={{ marginTop: 2 }} />
      <View style={styles.reviewRowContent}>
        <Text style={styles.reviewLabel}>{label}</Text>
        <Text style={styles.reviewValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  stepRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepCircleDone:  { backgroundColor: Colors.secondary },
  stepNum:         { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  stepNumActive:   { color: "#fff" },
  stepLabel:       { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  stepLabelActive: { color: Colors.primary },
  stepLine:     { flex: 1, height: 2, backgroundColor: Colors.border, marginBottom: 12 },
  stepLineDone: { backgroundColor: Colors.secondary },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  stepContent: { gap: 16 },
  stepHeading: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.3 },
  stepSub: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 20 },

  cardList: { gap: 10 },

  projectCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12, padding: 13,
    borderWidth: 2, borderColor: Colors.border,
  },
  customCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12, padding: 13,
    borderWidth: 2, borderColor: Colors.border,
    borderStyle: "dashed",
    marginTop: 4,
  },
  customCardSelected: { borderColor: Colors.primary, borderStyle: "solid", backgroundColor: Colors.primary + "06" },
  cardSelected: { borderColor: Colors.secondary, backgroundColor: Colors.infoLight },
  projectIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.borderLight,
    alignItems: "center", justifyContent: "center",
  },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  projectAddr: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, marginTop: 1 },
  selectedText: { color: Colors.secondary },

  inspCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12, padding: 13,
    borderWidth: 2, borderColor: Colors.border,
    gap: 6,
  },
  inspCardTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  typePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  typePillText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  inProgressBadge: {
    backgroundColor: "#FFF3CD",
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  inProgressText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: "#856404" },
  inspTemplateName: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  inspNoTemplate: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, fontStyle: "italic" },
  inspMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  inspMetaText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  inspMetaDot: { fontSize: 12, color: Colors.textTertiary },

  templateCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12, padding: 13,
    borderWidth: 2, borderColor: Colors.border,
  },
  templateIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: Colors.borderLight,
    alignItems: "center", justifyContent: "center",
  },
  templateInfo: { flex: 1, gap: 2 },
  templateName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  templateMeta: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  templateDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, lineHeight: 16, marginTop: 2 },

  emptyNote: { alignItems: "center", gap: 10, marginTop: 32, padding: 20 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: Colors.borderLight,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center", maxWidth: 260, lineHeight: 18 },
  emptyAction: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
  },
  emptyActionText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },

  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14, padding: 16, gap: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  reviewRow: { flexDirection: "row", gap: 10 },
  reviewRowContent: { flex: 1, gap: 2 },
  reviewLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  reviewValue: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },

  sectionLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, marginBottom: 4 },
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
  },
  textArea: { height: 90, paddingTop: 11 },
  row2: { flexDirection: "row", gap: 12 },

  infoBox: {
    flexDirection: "row", gap: 10,
    backgroundColor: Colors.infoLight,
    borderRadius: 10, padding: 14,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary, lineHeight: 18 },

  footer: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
    gap: 12,
  },
  backButton: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  backButtonText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  nextButton: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 11, paddingHorizontal: 20,
    borderRadius: 10, backgroundColor: Colors.accent,
  },
  nextButtonDisabled: { backgroundColor: Colors.border },
  nextButtonText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  createButton: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 11, paddingHorizontal: 20,
    borderRadius: 10, backgroundColor: Colors.accent,
  },
  createButtonText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
});

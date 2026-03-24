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

const STEPS = ["Template", "Details", "Review"];

export default function CreateInspectionScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<any[]>({
    queryKey: ["checklist-templates", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/checklist-templates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

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

  const canGoNext = () => {
    if (step === 0) return !!selectedTemplate;
    if (step === 1) return !!selectedProject && !!scheduledDate;
    return true;
  };

  const handleCreate = async () => {
    if (!selectedTemplate || !selectedProject) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${baseUrl}/api/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: selectedProject.id,
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
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.replace(`/inspection/conduct/${inspection.id}` as any);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create inspection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + WEB_TOP }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="x" size={22} color={Colors.text} />
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
                  <Feather name="check" size={12} color="#fff" />
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
        {/* Step 0: Pick Template */}
        {step === 0 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Select Checklist Template</Text>
            <Text style={styles.stepSub}>Choose the inspection template for this job. Templates define what gets checked.</Text>
            {loadingTemplates ? (
              <ActivityIndicator color={Colors.secondary} style={{ marginTop: 32 }} />
            ) : templates.length === 0 ? (
              <View style={styles.emptyNote}>
                <Feather name="clipboard" size={36} color={Colors.textTertiary} />
                <Text style={styles.emptyNoteText}>No templates yet. Add them in Settings.</Text>
              </View>
            ) : (
              <View style={styles.cardList}>
                {templates.map(t => (
                  <Pressable
                    key={t.id}
                    style={[styles.templateCard, selectedTemplate?.id === t.id && styles.templateCardSelected]}
                    onPress={() => setSelectedTemplate(t)}
                  >
                    <View style={styles.templateIcon}>
                      <Feather name="clipboard" size={20} color={selectedTemplate?.id === t.id ? Colors.accent : Colors.secondary} />
                    </View>
                    <View style={styles.templateInfo}>
                      <Text style={[styles.templateName, selectedTemplate?.id === t.id && styles.templateNameSelected]}>{t.name}</Text>
                      <Text style={styles.templateMeta}>
                        {INSPECTION_TYPES[t.inspectionType] || t.inspectionType} · {t.itemCount} items
                      </Text>
                      {t.description ? <Text style={styles.templateDesc} numberOfLines={2}>{t.description}</Text> : null}
                    </View>
                    {selectedTemplate?.id === t.id && (
                      <Feather name="check-circle" size={20} color={Colors.accent} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Step 1: Details */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Inspection Details</Text>
            <Text style={styles.stepSub}>Enter the project, date, and reason for this inspection.</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Project *</Text>
              {loadingProjects ? (
                <ActivityIndicator color={Colors.secondary} />
              ) : (
                <View style={styles.cardList}>
                  {projects.filter((p: any) => p.status === "active").map((p: any) => (
                    <Pressable
                      key={p.id}
                      style={[styles.projectCard, selectedProject?.id === p.id && styles.projectCardSelected]}
                      onPress={() => {
                        setSelectedProject(p);
                        setAddress(p.siteAddress + ", " + p.suburb + " " + p.state + " " + p.postcode);
                      }}
                    >
                      <View style={styles.projectInfo}>
                        <Text style={[styles.projectName, selectedProject?.id === p.id && styles.projectNameSelected]} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.projectAddr} numberOfLines={1}>{p.siteAddress}, {p.suburb}</Text>
                      </View>
                      {selectedProject?.id === p.id && (
                        <Feather name="check-circle" size={18} color={Colors.accent} />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Site Address</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Site address"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            <View style={styles.row2}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Date *</Text>
                <TextInput
                  style={styles.input}
                  value={scheduledDate}
                  onChangeText={setScheduledDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textTertiary}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
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

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Reason / Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Purpose of this inspection, special conditions, etc."
                placeholderTextColor={Colors.textTertiary}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepHeading}>Review & Create</Text>
            <Text style={styles.stepSub}>Confirm the details below, then create the inspection to begin.</Text>

            <View style={styles.reviewCard}>
              <ReviewRow icon="clipboard" label="Template" value={selectedTemplate?.name} />
              <ReviewRow icon="map-pin" label="Project" value={selectedProject?.name} />
              <ReviewRow icon="navigation" label="Address" value={address || selectedProject?.siteAddress} />
              <ReviewRow icon="calendar" label="Date" value={scheduledDate + (scheduledTime ? " at " + scheduledTime : "")} />
              <ReviewRow icon="list" label="Items" value={`${selectedTemplate?.itemCount || 0} checklist items`} />
              {reason ? <ReviewRow icon="file-text" label="Notes" value={reason} /> : null}
            </View>

            <View style={styles.infoBox}>
              <Feather name="info" size={14} color={Colors.secondary} />
              <Text style={styles.infoText}>
                The inspection checklist will be created and you'll be taken directly to the conduct screen to begin checking items.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {step > 0 && (
          <Pressable style={styles.backButton} onPress={() => setStep(s => s - 1)}>
            <Feather name="arrow-left" size={16} color={Colors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        {step < 2 ? (
          <Pressable
            style={[styles.nextButton, !canGoNext() && styles.nextButtonDisabled]}
            onPress={() => canGoNext() && setStep(s => s + 1)}
          >
            <Text style={styles.nextButtonText}>{step === 1 ? "Review" : "Next"}</Text>
            <Feather name="arrow-right" size={16} color={canGoNext() ? Colors.primary : Colors.textTertiary} />
          </Pressable>
        ) : (
          <Pressable
            style={[styles.createButton, submitting && { opacity: 0.7 }]}
            onPress={handleCreate}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Feather name="play-circle" size={18} color={Colors.primary} />
                <Text style={styles.createButtonText}>Create & Begin</Text>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepItem: { alignItems: "center", gap: 4 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepCircleDone: { backgroundColor: Colors.secondary },
  stepNum: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  stepNumActive: { color: "#fff" },
  stepLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  stepLabelActive: { color: Colors.primary },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.border, marginBottom: 12 },
  stepLineDone: { backgroundColor: Colors.secondary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },
  stepContent: { gap: 16 },
  stepHeading: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.3 },
  stepSub: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 20 },
  cardList: { gap: 10 },
  templateCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  templateCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.primary + "08" },
  templateIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.infoLight,
    alignItems: "center",
    justifyContent: "center",
  },
  templateInfo: { flex: 1, gap: 2 },
  templateName: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  templateNameSelected: { color: Colors.primary },
  templateMeta: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  templateDesc: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, lineHeight: 16, marginTop: 2 },
  emptyNote: { alignItems: "center", gap: 12, marginTop: 40, padding: 24 },
  emptyNoteText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center" },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  textArea: { height: 100, paddingTop: 12 },
  row2: { flexDirection: "row", gap: 12 },
  projectCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 10,
  },
  projectCardSelected: { borderColor: Colors.accent },
  projectInfo: { flex: 1 },
  projectName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  projectNameSelected: { color: Colors.primary },
  projectAddr: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, marginTop: 1 },
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  reviewRow: { flexDirection: "row", gap: 10 },
  reviewRowContent: { flex: 1, gap: 2 },
  reviewLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  reviewValue: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.infoLight,
    borderRadius: 10,
    padding: 14,
    alignItems: "flex-start",
  },
  infoText: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary, lineHeight: 18 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backButtonText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  nextButtonDisabled: { backgroundColor: Colors.border },
  nextButtonText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
  createButtonText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
});

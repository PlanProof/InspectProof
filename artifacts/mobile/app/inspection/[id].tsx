import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IssueCard } from "@/components/IssueCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { INSPECTION_TYPES } from "@/constants/api";

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const WEATHER_PICKS = ["Fine", "Partly Cloudy", "Overcast", "Light Rain", "Heavy Rain", "Windy"];

export default function InspectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const fetchWithAuth = async (url: string, opts?: RequestInit) => {
    const res = await fetch(`${baseUrl}${url}`, {
      ...opts,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts?.body ? { "Content-Type": "application/json" } : {}),
        ...(opts?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  };

  const { data: inspection, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["inspection", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}`),
    enabled: !!token && !!id,
  });

  const { data: checklistItems = [] } = useQuery({
    queryKey: ["inspection-checklist", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}/checklist`),
    enabled: !!token && !!id,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ["inspection-issues", id, token],
    queryFn: () => fetchWithAuth(`/api/issues?inspectionId=${id}`),
    enabled: !!token && !!id,
  });

  // ── Pre-inspection details edit state ─────────────────────────────────────
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({
    status: "",
    scheduledDate: "",
    scheduledTime: "",
    completedDate: "",
    duration: "",
    weatherConditions: "",
  });
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  // ── Reschedule modal state ─────────────────────────────────────────────────
  const [rescheduleVisible, setRescheduleVisible] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  const RESCHEDULE_TIMES = [
    "07:00","07:30","08:00","08:30","09:00","09:30",
    "10:00","10:30","11:00","11:30","12:00","12:30",
    "13:00","13:30","14:00","14:30","15:00","15:30",
    "16:00","16:30","17:00",
  ];

  const toDisplayDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const toApiDate = (display: string): string | null => {
    const p = display.split("/");
    if (p.length !== 3 || p[2].length !== 4) return null;
    return `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
  };

  const openReschedule = () => {
    setRescheduleDate(inspection?.scheduledDate ? toDisplayDate(inspection.scheduledDate) : "");
    setRescheduleTime(inspection?.scheduledTime ?? "09:00");
    setRescheduleVisible(true);
  };

  const saveReschedule = async () => {
    const apiDate = toApiDate(rescheduleDate);
    if (!apiDate) { Alert.alert("Invalid date", "Please enter date as DD/MM/YYYY"); return; }
    setRescheduleSaving(true);
    try {
      await fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          scheduledDate: apiDate,
          scheduledTime: rescheduleTime || null,
          status: inspection?.status === "cancelled" ? "scheduled" : inspection?.status,
        }),
      });
      setRescheduleVisible(false);
      refetch();
    } catch {
      Alert.alert("Error", "Failed to reschedule. Please try again.");
    } finally {
      setRescheduleSaving(false);
    }
  };

  const restoreInspection = async () => {
    try {
      await fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "scheduled" }),
      });
      refetch();
    } catch {
      Alert.alert("Error", "Failed to restore inspection.");
    }
  };

  const openEdit = () => {
    setDetailForm({
      status: inspection?.status ?? "",
      scheduledDate: inspection?.scheduledDate ?? "",
      scheduledTime: inspection?.scheduledTime ?? "",
      completedDate: inspection?.completedDate ?? "",
      duration: inspection?.duration ? String(inspection.duration) : "",
      weatherConditions: inspection?.weatherConditions ?? "",
    });
    setDetailsError("");
    setEditingDetails(true);
  };

  const cancelEdit = () => {
    setEditingDetails(false);
    setDetailsError("");
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    setDetailsError("");
    try {
      await fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: detailForm.status,
          scheduledDate: detailForm.scheduledDate,
          scheduledTime: detailForm.scheduledTime || null,
          completedDate: detailForm.completedDate || null,
          duration: detailForm.duration ? parseInt(detailForm.duration) : null,
          weatherConditions: detailForm.weatherConditions || null,
        }),
      });
      setEditingDetails(false);
      refetch();
    } catch {
      setDetailsError("Failed to save. Please try again.");
    } finally {
      setSavingDetails(false);
    }
  };

  const cancelInspection = () => {
    Alert.alert(
      "Cancel Inspection",
      "Are you sure you want to cancel this inspection?",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Inspection",
          style: "destructive",
          onPress: async () => {
            try {
              await fetchWithAuth(`/api/inspections/${id}`, {
                method: "PUT",
                body: JSON.stringify({ status: "cancelled" }),
              });
              refetch();
            } catch {
              Alert.alert("Error", "Failed to cancel. Please try again.");
            }
          },
        },
      ]
    );
  };

  const addWeatherPick = (w: string) => {
    setDetailForm(f => ({
      ...f,
      weatherConditions: f.weatherConditions ? `${f.weatherConditions}, ${w}` : w,
    }));
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  if (!inspection) {
    return <EmptyState icon="clipboard" title="Inspection not found" />;
  }

  const date = new Date(inspection.scheduledDate).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  const passItems = checklistItems.filter((i: any) => i.result === "pass");
  const failItems = checklistItems.filter((i: any) => i.result === "fail");
  const naItems = checklistItems.filter((i: any) => i.result === "na");
  const pendingItems = checklistItems.filter((i: any) => !i.result);
  const total = checklistItems.length;
  const passRate = total > 0 ? Math.round((passItems.length / (total - naItems.length)) * 100) : null;

  const groupedChecklist: Record<string, any[]> = {};
  checklistItems.forEach((item: any) => {
    const cat = item.category || "General";
    if (!groupedChecklist[cat]) groupedChecklist[cat] = [];
    groupedChecklist[cat].push(item);
  });

  const resultIcon = (result: string | null) => {
    if (result === "pass") return <Feather name="check-circle" size={18} color={Colors.success} />;
    if (result === "fail") return <Feather name="x-circle" size={18} color={Colors.danger} />;
    if (result === "na") return <Feather name="minus-circle" size={18} color={Colors.textTertiary} />;
    return <Feather name="circle" size={18} color={Colors.border} />;
  };

  const durationHM = detailForm.duration
    ? `${Math.floor(parseInt(detailForm.duration) / 60)}h ${parseInt(detailForm.duration) % 60}m`
    : null;

  const currentStatus = STATUS_OPTIONS.find(s => s.value === detailForm.status);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.typeChip}>
            <Text style={styles.typeText}>{INSPECTION_TYPES[inspection.inspectionType] || inspection.inspectionType}</Text>
          </View>
        </View>
        <Text style={styles.projectName}>{inspection.projectName}</Text>
        {inspection.projectAddress ? (
          <Text style={styles.projectAddress}>{inspection.projectAddress}</Text>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{date}</Text>
          </View>
          {inspection.scheduledTime && (
            <View style={styles.metaItem}>
              <Feather name="clock" size={13} color={Colors.textTertiary} />
              <Text style={styles.metaText}>{inspection.scheduledTime}</Text>
            </View>
          )}
          {inspection.inspectorName && (
            <View style={styles.metaItem}>
              <Feather name="user" size={13} color={Colors.textTertiary} />
              <Text style={styles.metaText}>{inspection.inspectorName}</Text>
            </View>
          )}
        </View>

        {/* Start / Continue — for scheduled and in-progress */}
        {(inspection.status === "scheduled" || inspection.status === "in_progress") && (
          <Pressable
            style={styles.conductBtn}
            onPress={() => router.push(`/inspection/conduct/${inspection.id}` as any)}
          >
            <Feather name="play-circle" size={18} color={Colors.primary} />
            <Text style={styles.conductBtnText}>
              {inspection.status === "in_progress" ? "Continue Inspection" : "Start Inspection"}
            </Text>
            <Feather name="arrow-right" size={16} color={Colors.primary} />
          </Pressable>
        )}

        {/* Re-Do + Edit — for completed / follow-up */}
        {(inspection.status === "completed" || inspection.status === "follow_up_required") && (
          <>
            <Pressable
              style={styles.reportBtn}
              onPress={() => router.push({ pathname: "/inspection/generate-report", params: { id: inspection.id } } as any)}
            >
              <Feather name="file-text" size={18} color={Colors.surface} />
              <Text style={styles.reportBtnText}>Generate Report</Text>
              <Feather name="arrow-right" size={16} color={Colors.surface} />
            </Pressable>

            {/* Edit Inspection — keep results, allow re-ticking + photo changes */}
            <Pressable
              style={styles.editInspBtn}
              onPress={() => router.push({ pathname: `/inspection/conduct/${inspection.id}`, params: { editMode: "1" } } as any)}
            >
              <Feather name="edit-2" size={16} color={Colors.secondary} />
              <Text style={styles.editInspBtnText}>Edit Inspection</Text>
            </Pressable>

            {/* Re-Do Inspection — clears all results, fresh start */}
            <Pressable
              style={styles.redoBtn}
              onPress={() => {
                Alert.alert(
                  "Re-Do Inspection",
                  "This will clear all checklist results and restart the inspection from scratch. Continue?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Re-Do",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await fetchWithAuth(`/api/inspections/${inspection.id}/reset-checklist`, { method: "POST" });
                          await fetchWithAuth(`/api/inspections/${inspection.id}`, {
                            method: "PUT",
                            body: JSON.stringify({ status: "in_progress", completedDate: null }),
                          });
                          queryClient.invalidateQueries({ queryKey: ["inspection", id] });
                          queryClient.invalidateQueries({ queryKey: ["inspection-checklist", id] });
                          router.push(`/inspection/conduct/${inspection.id}` as any);
                        } catch {
                          Alert.alert("Error", "Failed to restart inspection.");
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Feather name="refresh-cw" size={16} color={Colors.textSecondary} />
              <Text style={styles.redoBtnText}>Re-Do Inspection</Text>
            </Pressable>
          </>
        )}

        {/* Cancelled: restore only */}
        {inspection.status === "cancelled" && (
          <Pressable style={styles.restoreBtn} onPress={restoreInspection}>
            <Feather name="refresh-cw" size={14} color={Colors.secondary} />
            <Text style={styles.restoreBtnText}>Restore Inspection</Text>
          </Pressable>
        )}
      </View>

      {/* ── Inspection Details Card ── */}
      <View style={styles.detailsCard}>
        <View style={styles.detailsHeader}>
          <View style={styles.detailsHeaderLeft}>
            <Feather name="file-text" size={15} color={Colors.textTertiary} />
            <Text style={styles.detailsTitle}>Inspection Details</Text>
          </View>
          {!editingDetails && (
            <Pressable style={styles.editBtn} onPress={openEdit}>
              <Feather name="edit-2" size={13} color={Colors.secondary} />
              <Text style={styles.editBtnText}>Edit Details</Text>
            </Pressable>
          )}
        </View>

        {!editingDetails ? (
          /* Read-only view */
          <View style={styles.detailsGrid}>
            {[
              { label: "Status", value: inspection.status.replace(/_/g, " ") },
              { label: "Scheduled Date", value: new Date(inspection.scheduledDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) },
              { label: "Scheduled Time", value: inspection.scheduledTime || "TBC" },
              { label: "Completed Date", value: inspection.completedDate ? new Date(inspection.completedDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—" },
              { label: "Duration", value: inspection.duration ? `${inspection.duration} min (${Math.floor(inspection.duration / 60)}h ${inspection.duration % 60}m)` : "—" },
              { label: "Weather", value: inspection.weatherConditions || "—" },
            ].map(({ label, value }) => (
              <View key={label} style={styles.detailsRow}>
                <Text style={styles.detailsLabel}>{label}</Text>
                <Text style={styles.detailsValue} numberOfLines={2}>{value}</Text>
              </View>
            ))}
          </View>
        ) : (
          /* Edit form */
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.editForm}>

              {/* Status */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Status</Text>
                <Pressable
                  style={styles.pickerTrigger}
                  onPress={() => setStatusPickerOpen(true)}
                >
                  <Text style={styles.pickerTriggerText}>{currentStatus?.label ?? "Select status…"}</Text>
                  <Feather name="chevron-down" size={16} color={Colors.textTertiary} />
                </Pressable>
              </View>

              {/* Scheduled Date + Time */}
              <View style={styles.rowFields}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Scheduled Date</Text>
                  <TextInput
                    style={styles.input}
                    value={detailForm.scheduledDate}
                    onChangeText={v => setDetailForm(f => ({ ...f, scheduledDate: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="default"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Scheduled Time</Text>
                  <TextInput
                    style={styles.input}
                    value={detailForm.scheduledTime}
                    onChangeText={v => setDetailForm(f => ({ ...f, scheduledTime: v }))}
                    placeholder="HH:MM"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="default"
                  />
                </View>
              </View>

              {/* Completed Date + Duration */}
              <View style={styles.rowFields}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Completed Date</Text>
                  <TextInput
                    style={styles.input}
                    value={detailForm.completedDate}
                    onChangeText={v => setDetailForm(f => ({ ...f, completedDate: v }))}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="default"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Duration (minutes)</Text>
                  <TextInput
                    style={styles.input}
                    value={detailForm.duration}
                    onChangeText={v => setDetailForm(f => ({ ...f, duration: v.replace(/[^0-9]/g, "") }))}
                    placeholder="e.g. 90"
                    placeholderTextColor={Colors.textTertiary}
                    keyboardType="number-pad"
                  />
                  {durationHM && <Text style={styles.durationHint}>= {durationHM}</Text>}
                </View>
              </View>

              {/* Weather Conditions */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Weather Conditions</Text>
                <TextInput
                  style={styles.input}
                  value={detailForm.weatherConditions}
                  onChangeText={v => setDetailForm(f => ({ ...f, weatherConditions: v }))}
                  placeholder="e.g. Fine, 22°C"
                  placeholderTextColor={Colors.textTertiary}
                />
                <View style={styles.weatherPills}>
                  {WEATHER_PICKS.map(w => (
                    <Pressable
                      key={w}
                      style={styles.weatherPill}
                      onPress={() => addWeatherPick(w)}
                    >
                      <Text style={styles.weatherPillText}>{w}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {detailsError ? (
                <Text style={styles.errorText}>{detailsError}</Text>
              ) : null}

              {/* Save / Cancel */}
              <View style={styles.editActions}>
                <Pressable
                  style={[styles.saveBtn, savingDetails && { opacity: 0.6 }]}
                  onPress={saveDetails}
                  disabled={savingDetails}
                >
                  {savingDetails
                    ? <ActivityIndicator size="small" color={Colors.surface} />
                    : <Feather name="check" size={15} color={Colors.surface} />
                  }
                  <Text style={styles.saveBtnText}>{savingDetails ? "Saving…" : "Save Details"}</Text>
                </Pressable>
                <Pressable style={styles.cancelBtn} onPress={cancelEdit} disabled={savingDetails}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>

      {/* Result Summary */}
      {total > 0 && (
        <View style={styles.resultCard}>
          <Text style={styles.cardTitle}>Checklist Summary</Text>
          <View style={styles.resultBar}>
            {passItems.length > 0 && (
              <View style={[styles.barSegment, { flex: passItems.length, backgroundColor: Colors.success }]} />
            )}
            {failItems.length > 0 && (
              <View style={[styles.barSegment, { flex: failItems.length, backgroundColor: Colors.danger }]} />
            )}
            {naItems.length > 0 && (
              <View style={[styles.barSegment, { flex: naItems.length, backgroundColor: Colors.textTertiary }]} />
            )}
            {pendingItems.length > 0 && (
              <View style={[styles.barSegment, { flex: pendingItems.length, backgroundColor: Colors.border }]} />
            )}
          </View>
          <View style={styles.resultStats}>
            <View style={styles.resultStat}>
              <Text style={[styles.resultCount, { color: Colors.success }]}>{passItems.length}</Text>
              <Text style={styles.resultLabel}>Pass</Text>
            </View>
            {failItems.length > 0 && (
              <View style={styles.resultStat}>
                <Text style={[styles.resultCount, { color: Colors.danger }]}>{failItems.length}</Text>
                <Text style={styles.resultLabel}>Fail</Text>
              </View>
            )}
            {naItems.length > 0 && (
              <View style={styles.resultStat}>
                <Text style={[styles.resultCount, { color: Colors.textTertiary }]}>{naItems.length}</Text>
                <Text style={styles.resultLabel}>N/A</Text>
              </View>
            )}
            {pendingItems.length > 0 && (
              <View style={styles.resultStat}>
                <Text style={[styles.resultCount, { color: Colors.textSecondary }]}>{pendingItems.length}</Text>
                <Text style={styles.resultLabel}>Pending</Text>
              </View>
            )}
            {passRate !== null && (
              <View style={[styles.resultStat, styles.passRateStat]}>
                <Text style={[styles.resultCount, { color: passRate >= 80 ? Colors.success : Colors.warning }]}>{passRate}%</Text>
                <Text style={styles.resultLabel}>Pass Rate</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Overall Result */}
      {inspection.overallResult && (
        <View style={[styles.overallBanner, {
          backgroundColor: inspection.overallResult === "pass" ? Colors.successLight : inspection.overallResult === "fail" ? Colors.dangerLight : Colors.warningLight,
          borderColor: inspection.overallResult === "pass" ? Colors.successBorder : inspection.overallResult === "fail" ? Colors.dangerBorder : Colors.warningBorder,
        }]}>
          <Feather
            name={inspection.overallResult === "pass" ? "check-circle" : inspection.overallResult === "fail" ? "x-circle" : "alert-circle"}
            size={20}
            color={inspection.overallResult === "pass" ? Colors.success : inspection.overallResult === "fail" ? Colors.danger : Colors.warning}
          />
          <Text style={[styles.overallText, { color: inspection.overallResult === "pass" ? Colors.success : inspection.overallResult === "fail" ? Colors.danger : Colors.warning }]}>
            Overall Result: {inspection.overallResult.toUpperCase()}
          </Text>
        </View>
      )}

      {/* Inspection Notes */}
      {Array.isArray(inspection.notes) && inspection.notes.length > 0 && (
        <View style={styles.notesCard}>
          <Text style={styles.cardTitle}>Inspection Notes</Text>
          {inspection.notes.map((note: any) => (
            <View key={note.id} style={styles.noteItem}>
              <Text style={styles.notesText}>{note.content}</Text>
              {note.authorName && (
                <Text style={styles.noteAuthor}>— {note.authorName}</Text>
              )}
            </View>
          ))}
        </View>
      )}
      {typeof inspection.notes === "string" && inspection.notes.length > 0 && (
        <View style={styles.notesCard}>
          <Text style={styles.cardTitle}>Inspection Notes</Text>
          <Text style={styles.notesText}>{inspection.notes}</Text>
        </View>
      )}

      {/* Checklist Items by Category */}
      {Object.keys(groupedChecklist).length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={`Checklist (${total} items)`} />
          {Object.entries(groupedChecklist).map(([category, items]) => (
            <View key={category} style={styles.checklistGroup}>
              <Text style={styles.categoryLabel}>{category}</Text>
              {items.map((item: any) => (
                <View key={item.id} style={[styles.checklistItem, { borderLeftColor: item.result === "pass" ? Colors.success : item.result === "fail" ? Colors.danger : Colors.border }]}>
                  <View style={styles.checklistIcon}>{resultIcon(item.result)}</View>
                  <View style={styles.checklistContent}>
                    <Text style={styles.checklistItemText}>{item.description}</Text>
                    {item.codeReference && (
                      <Text style={styles.nccRef}>{item.codeReference}</Text>
                    )}
                    {item.notes && (
                      <Text style={styles.checklistComment}>"{item.notes}"</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={`Issues (${issues.length})`} />
          {issues.map((i: any) => (
            <IssueCard key={i.id} issue={{ ...i, projectName: inspection.projectName }} showProject={false} />
          ))}
        </View>
      )}

      {/* Status Picker Modal */}
      <Modal
        visible={statusPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerOpen(false)}
      >
        {/* Outer pressable = backdrop dismiss */}
        <Pressable style={styles.modalOverlay} onPress={() => setStatusPickerOpen(false)}>
          {/* Inner pressable = absorbs taps so they don't reach the backdrop */}
          <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Status</Text>
            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusOption,
                  detailForm.status === opt.value && styles.statusOptionSelected,
                ]}
                onPress={() => {
                  setDetailForm(f => ({ ...f, status: opt.value }));
                  setStatusPickerOpen(false);
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.statusOptionText,
                  detailForm.status === opt.value && styles.statusOptionTextSelected,
                ]}>
                  {opt.label}
                </Text>
                {detailForm.status === opt.value && (
                  <Feather name="check" size={16} color={Colors.secondary} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Reschedule Modal ── */}
      <Modal visible={rescheduleVisible} transparent animationType="slide" onRequestClose={() => setRescheduleVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRescheduleVisible(false)}>
          <Pressable style={[styles.rescheduleSheet, { paddingBottom: Math.max(36, insets.bottom + 16) }]} onPress={e => e.stopPropagation()}>
            <View style={styles.rescheduleHeader}>
              <Text style={styles.rescheduleTitle}>Reschedule Inspection</Text>
              <Pressable onPress={() => setRescheduleVisible(false)} hitSlop={12}>
                <Feather name="x" size={20} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {/* Date input */}
            <View style={styles.rescheduleField}>
              <Text style={styles.rescheduleLabel}>Date</Text>
              <TextInput
                style={styles.rescheduleInput}
                value={rescheduleDate}
                onChangeText={setRescheduleDate}
                placeholder="DD/MM/YYYY"
                placeholderTextColor={Colors.textTertiary}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            {/* Time chips */}
            <View style={styles.rescheduleField}>
              <Text style={styles.rescheduleLabel}>Time</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeChips}>
                {RESCHEDULE_TIMES.map(t => (
                  <Pressable
                    key={t}
                    style={[styles.timeChip, rescheduleTime === t && styles.timeChipSelected]}
                    onPress={() => setRescheduleTime(t)}
                  >
                    <Text style={[styles.timeChipText, rescheduleTime === t && styles.timeChipTextSelected]}>{t}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Pressable
              style={[styles.rescheduleSaveBtn, rescheduleSaving && { opacity: 0.6 }]}
              onPress={saveReschedule}
              disabled={rescheduleSaving}
            >
              <Text style={styles.rescheduleSaveBtnText}>{rescheduleSaving ? "Saving…" : "Confirm Reschedule"}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { gap: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },

  // Hero
  hero: {
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeChip: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  typeText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  conductBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.accent, paddingVertical: 13, borderRadius: 10, marginTop: 6,
  },
  conductBtnText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  reportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.secondary, paddingVertical: 13, borderRadius: 10, marginTop: 6,
  },
  reportBtnText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.surface },
  cancelInspBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 6,
  },
  cancelInspBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "#dc2626" },

  // Secondary actions row (reschedule · cancel)
  secondaryActions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4 },
  actionDivider: { fontSize: 13, color: Colors.textTertiary },
  rescheduleLink: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6 },
  rescheduleLinkText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },

  // Cancelled state: restore + reschedule buttons
  cancelledActions: { flexDirection: "row", gap: 10, marginTop: 6 },
  restoreBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.secondary, borderRadius: 10, paddingVertical: 11, marginTop: 6,
  },
  restoreBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  editInspBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.secondary, borderRadius: 10, paddingVertical: 11, marginTop: 8,
    backgroundColor: Colors.infoLight,
  },
  editInspBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  redoBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingVertical: 10, marginTop: 6,
  },
  redoBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  rescheduleBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.secondary, borderRadius: 10, paddingVertical: 11,
  },
  rescheduleBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },

  // Reschedule modal
  rescheduleSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36, gap: 20,
  },
  rescheduleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rescheduleTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  rescheduleField: { gap: 8 },
  rescheduleLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  rescheduleInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
  },
  timeChips: { flexDirection: "row", gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  timeChipSelected: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  timeChipText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  timeChipTextSelected: { color: "#fff" },
  rescheduleSaveBtn: {
    backgroundColor: Colors.secondary, borderRadius: 12, paddingVertical: 15,
    alignItems: "center", marginTop: 4,
  },
  rescheduleSaveBtnText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },

  projectName: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 24 },
  projectAddress: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },

  // Inspection Details Card
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  detailsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailsHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailsTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },

  // Read-only grid
  detailsGrid: { padding: 16, gap: 12 },
  detailsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  detailsLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, width: 110 },
  detailsValue: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, flex: 1, textAlign: "right", textTransform: "capitalize" },

  // Edit form
  editForm: { padding: 16, gap: 14 },
  rowFields: { flexDirection: "row", gap: 12 },
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  durationHint: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },

  // Status picker trigger
  pickerTrigger: {
    height: 42,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
  },
  pickerTriggerText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },

  // Weather pills
  weatherPills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  weatherPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  weatherPillText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },

  // Error
  errorText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.danger },

  // Save/Cancel
  editActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  saveBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.primary, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, flex: 1, justifyContent: "center",
  },
  saveBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.surface },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },

  // Result cards
  resultCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 16, padding: 16, gap: 12,
  },
  cardTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  resultBar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: Colors.borderLight, gap: 1 },
  barSegment: { height: 8 },
  resultStats: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  resultStat: { alignItems: "center", gap: 2 },
  passRateStat: { borderLeftWidth: 1, borderLeftColor: Colors.borderLight, paddingLeft: 16 },
  resultCount: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold" },
  resultLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },

  // Overall banner
  overallBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 10,
    padding: 14, borderWidth: 1, marginHorizontal: 16,
  },
  overallText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },

  // Notes
  notesCard: {
    backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    marginHorizontal: 16, padding: 16, gap: 8,
  },
  notesText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 20 },
  noteItem: { gap: 2, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  noteAuthor: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, fontStyle: "italic" },

  // Checklist
  section: { marginHorizontal: 16, gap: 10 },
  checklistGroup: { gap: 8 },
  categoryLabel: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary,
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  checklistItem: {
    flexDirection: "row", gap: 12, backgroundColor: Colors.surface, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: Colors.borderLight, borderLeftWidth: 3,
  },
  checklistIcon: { paddingTop: 1 },
  checklistContent: { flex: 1, gap: 3 },
  checklistItemText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 20 },
  nccRef: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  checklistComment: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 16 },

  // Status Picker Modal
  modalOverlay: {
    flex: 1, backgroundColor: Colors.overlay,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 4,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: "center", marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
    marginBottom: 8,
  },
  statusOption: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10,
  },
  statusOptionSelected: { backgroundColor: Colors.secondary + "10" },
  statusOptionText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  statusOptionTextSelected: { color: Colors.secondary },
});

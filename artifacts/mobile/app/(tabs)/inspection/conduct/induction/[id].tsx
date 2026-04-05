import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const INDUCTION_CHECKLIST = [
  {
    id: "site_rules",
    category: "Site Rules",
    items: [
      "Site hours of operation and access procedures",
      "Signing in and out requirements",
      "Visitor and contractor management",
      "No smoking, alcohol or drugs policy",
      "Mobile phone and distraction policy",
    ],
  },
  {
    id: "ppe",
    category: "PPE Requirements",
    items: [
      "Mandatory PPE on site (hard hat, hi-vis, safety boots)",
      "Additional PPE requirements for specific areas",
      "PPE inspection and replacement procedures",
      "PPE storage locations",
    ],
  },
  {
    id: "emergency",
    category: "Emergency Procedures",
    items: [
      "Emergency evacuation routes and muster points",
      "Emergency contact numbers and procedures",
      "First aid kit locations and trained first aiders",
      "Fire extinguisher locations and use",
      "Incident and near-miss reporting process",
    ],
  },
  {
    id: "hazardous",
    category: "Hazardous Substances",
    items: [
      "Location of Safety Data Sheets (SDS)",
      "Storage and handling of hazardous materials",
      "Spill response procedures",
      "Waste disposal requirements",
    ],
  },
  {
    id: "site_risks",
    category: "Site-Specific Risks",
    items: [
      "Overhead power lines or underground services",
      "Excavations, trenches, and confined spaces",
      "Traffic management and plant movements",
      "Working at heights requirements",
      "Manual handling guidelines",
    ],
  },
];

interface InductionAttendee {
  id: number;
  inductionId: number;
  orgContractorId: number | null;
  contractorName: string;
  contractorEmail: string | null;
  contractorTrade: string | null;
  attended: boolean;
  signedOff: boolean;
  signatureData: string | null;
  acknowledgedAt: string | null;
}

interface Induction {
  id: number;
  projectId: number;
  title: string;
  scheduledDate: string;
  scheduledTime: string | null;
  location: string | null;
  conductedByName: string | null;
  status: string;
  notes: string | null;
  checklistData: Record<string, Record<number, boolean>> | null;
  completedAt: string | null;
  attendees: InductionAttendee[];
}

interface ChecklistItemState {
  checked: boolean;
  note?: string;
}
type ChecklistState = Record<string, Record<number, ChecklistItemState>>;

interface InductionAttachment {
  id: number;
  name: string;
  fileName: string;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled:  { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  in_progress: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  completed:  { bg: "#f0fdf4", text: "#166534", border: "#bbf7d0" },
  cancelled:  { bg: "#f9fafb", text: "#6b7280", border: "#e5e7eb" },
};

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function ConductInductionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [activePage, setActivePage] = useState(0); // 0=info, 1=checklist, 2=sign-off, 3=attachments
  const [checklistState, setChecklistState] = useState<ChecklistState>({});
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [signingOff, setSigningOff] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<InductionAttachment[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

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

  const { data: induction, isLoading, refetch } = useQuery<Induction>({
    queryKey: ["induction", id, token],
    queryFn: () => fetchWithAuth(`/api/inductions/${id}`),
    enabled: !!token && !!id,
  });

  useEffect(() => {
    if (induction) {
      setNotes(induction.notes || "");
      if (induction.checklistData && typeof induction.checklistData === "object") {
        const raw = induction.checklistData as Record<string, Record<number, unknown>>;
        const normalized: ChecklistState = {};
        for (const [catId, items] of Object.entries(raw)) {
          normalized[catId] = {};
          for (const [idxStr, val] of Object.entries(items)) {
            const idx = Number(idxStr);
            if (typeof val === "boolean") {
              normalized[catId][idx] = { checked: val };
            } else if (val && typeof val === "object" && "checked" in val) {
              normalized[catId][idx] = val as ChecklistItemState;
            }
          }
        }
        setChecklistState(normalized);
      }
    }
  }, [induction?.id]);

  // Auto-set to in_progress when opened
  const startedRef = useRef(false);
  useEffect(() => {
    if (induction && induction.status === "scheduled" && !startedRef.current) {
      startedRef.current = true;
      fetchWithAuth(`/api/inductions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      }).then(() => {
        refetch();
      }).catch(() => { startedRef.current = false; });
    }
  }, [induction?.status]);

  const persistChecklist = useCallback((newState: ChecklistState) => {
    fetchWithAuth(`/api/inductions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklistData: newState }),
    }).catch(() => {});
  }, [id, fetchWithAuth]);

  const toggleChecklistItem = (categoryId: string, itemIndex: number) => {
    setChecklistState(prev => {
      const prevItem = prev[categoryId]?.[itemIndex] ?? { checked: false };
      const newState: ChecklistState = {
        ...prev,
        [categoryId]: {
          ...(prev[categoryId] || {}),
          [itemIndex]: { ...prevItem, checked: !prevItem.checked },
        },
      };
      persistChecklist(newState);
      return newState;
    });
  };

  const updateChecklistNote = (categoryId: string, itemIndex: number, note: string) => {
    setChecklistState(prev => {
      const prevItem = prev[categoryId]?.[itemIndex] ?? { checked: false };
      const newState: ChecklistState = {
        ...prev,
        [categoryId]: {
          ...(prev[categoryId] || {}),
          [itemIndex]: { ...prevItem, note },
        },
      };
      persistChecklist(newState);
      return newState;
    });
  };

  const totalChecklistItems = INDUCTION_CHECKLIST.reduce((sum, cat) => sum + cat.items.length, 0);
  const checkedItems = Object.values(checklistState).reduce((sum, cat) => {
    return sum + Object.values(cat).filter(item => item.checked).length;
  }, 0);
  const checklistProgress = totalChecklistItems > 0 ? checkedItems / totalChecklistItems : 0;

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await fetchWithAuth(`/api/inductions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      await refetch();
    } catch {
      Alert.alert("Error", "Failed to save notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleSignOff = async (attendee: InductionAttendee) => {
    setSigningOff(attendee.id);
    try {
      await fetchWithAuth(`/api/inductions/${id}/attendees/${attendee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attended: true, signedOff: true }),
      });
      await refetch();
    } catch {
      Alert.alert("Error", "Failed to record sign-off.");
    } finally {
      setSigningOff(null);
    }
  };

  const handleComplete = async () => {
    if (!induction) return;
    const allSignedOff = induction.attendees.length > 0 &&
      induction.attendees.every(a => a.signedOff);

    if (induction.attendees.length > 0 && !allSignedOff) {
      Alert.alert(
        "Attendees Not Signed Off",
        "Some attendees have not signed off yet. Complete anyway?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Complete Anyway", onPress: () => doComplete() },
        ]
      );
      return;
    }
    doComplete();
  };

  const doComplete = async () => {
    setCompleting(true);
    try {
      await fetchWithAuth(`/api/inductions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", notes }),
      });
      queryClient.invalidateQueries({ queryKey: ["inductions"] });
      queryClient.invalidateQueries({ queryKey: ["project-inductions"] });
      Alert.alert(
        "Induction Complete",
        "The induction session has been marked as completed.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch {
      Alert.alert("Error", "Failed to complete induction.");
    } finally {
      setCompleting(false);
    }
  };

  // ── Attachment handlers ────────────────────────────────────────────────────
  const loadAttachments = useCallback(async () => {
    if (!id || !token) return;
    setLoadingAttachments(true);
    try {
      const data = await fetchWithAuth(`/api/inductions/${id}/attachments`);
      setAttachments(Array.isArray(data) ? data : []);
    } catch {
      // silently ignore
    } finally {
      setLoadingAttachments(false);
    }
  }, [id, token, fetchWithAuth]);

  useEffect(() => {
    if (id && token) loadAttachments();
  }, [id, token, loadAttachments]);

  const uploadAttachmentPhoto = async (source: "camera" | "library") => {
    let picked: ImagePicker.ImagePickerResult;
    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow camera access.");
        return;
      }
      picked = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Please allow photo library access.");
        return;
      }
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
    }
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setUploadingAttachment(true);
    try {
      const fileName = asset.fileName || `induction-photo-${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append("file", { uri: asset.uri, type: asset.mimeType || "image/jpeg", name: fileName } as unknown as Blob);

      const uploadRes = await fetch(`${baseUrl}/api/storage/uploads/file`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { objectPath } = await uploadRes.json();
      const fileUrl = `${baseUrl}/api/storage/file/${objectPath}`;

      await fetchWithAuth(`/api/inductions/${id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fileName.replace(/\.[^/.]+$/, ""),
          fileName,
          fileUrl,
          fileSize: asset.fileSize ?? null,
          mimeType: asset.mimeType || "image/jpeg",
        }),
      });
      await loadAttachments();
    } catch {
      Alert.alert("Error", "Failed to upload attachment.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const deleteAttachment = async (attachmentId: number) => {
    Alert.alert("Remove Attachment", "Remove this attachment from the induction?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await fetchWithAuth(`/api/inductions/${id}/attachments/${attachmentId}`, { method: "DELETE" });
            setAttachments(prev => prev.filter(a => a.id !== attachmentId));
          } catch {
            Alert.alert("Error", "Failed to remove attachment.");
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading induction…</Text>
      </View>
    );
  }

  if (!induction) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Induction not found.</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusStyle = STATUS_COLORS[induction.status] || STATUS_COLORS.scheduled;
  const signedCount = induction.attendees.filter(a => a.signedOff).length;
  const isCompleted = induction.status === "completed";

  const pages = ["Session Info", "Checklist", "Sign-off", "Attachments"];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color={Colors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{induction.title}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {induction.status === "in_progress" ? "In Progress" :
               induction.status === "completed" ? "Completed" :
               induction.status.charAt(0).toUpperCase() + induction.status.slice(1)}
            </Text>
          </View>
        </View>
      </View>

      {/* Page Navigation */}
      <View style={styles.pageNav}>
        {pages.map((page, idx) => (
          <Pressable
            key={idx}
            onPress={() => setActivePage(idx)}
            style={[styles.pageNavItem, activePage === idx && styles.pageNavItemActive]}
          >
            <Text style={[styles.pageNavText, activePage === idx && styles.pageNavTextActive]}>
              {page}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Page Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {activePage === 0 && (
          <SessionInfoPage induction={induction} notes={notes} setNotes={setNotes} onSaveNotes={handleSaveNotes} savingNotes={savingNotes} isCompleted={isCompleted} />
        )}
        {activePage === 1 && (
          <ChecklistPage
            checklistState={checklistState}
            onToggle={toggleChecklistItem}
            onUpdateNote={updateChecklistNote}
            progress={checklistProgress}
            checkedCount={checkedItems}
            total={totalChecklistItems}
            isCompleted={isCompleted}
          />
        )}
        {activePage === 2 && (
          <SignOffPage
            induction={induction}
            onSignOff={handleSignOff}
            signingOff={signingOff}
            signedCount={signedCount}
            isCompleted={isCompleted}
          />
        )}
        {activePage === 3 && (
          <AttachmentsPage
            attachments={attachments}
            loading={loadingAttachments}
            uploading={uploadingAttachment}
            isCompleted={isCompleted}
            onUploadCamera={() => uploadAttachmentPhoto("camera")}
            onUploadLibrary={() => uploadAttachmentPhoto("library")}
            onDelete={deleteAttachment}
          />
        )}
      </ScrollView>

      {/* Complete Button (bottom) */}
      {!isCompleted && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            style={[styles.completeButton, completing && styles.completeButtonDisabled]}
            onPress={handleComplete}
            disabled={completing}
          >
            {completing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="check-circle" size={18} color="#fff" />
            )}
            <Text style={styles.completeButtonText}>
              {completing ? "Completing…" : "Complete Induction"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SessionInfoPage({ induction, notes, setNotes, onSaveNotes, savingNotes, isCompleted }: {
  induction: Induction;
  notes: string;
  setNotes: (v: string) => void;
  onSaveNotes: () => void;
  savingNotes: boolean;
  isCompleted: boolean;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Details</Text>
        <View style={styles.detailRow}>
          <Feather name="calendar" size={14} color={Colors.textSecondary} />
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>
            {formatDate(induction.scheduledDate)}
            {induction.scheduledTime ? ` at ${induction.scheduledTime}` : ""}
          </Text>
        </View>
        {induction.location && (
          <View style={styles.detailRow}>
            <Feather name="map-pin" size={14} color={Colors.textSecondary} />
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{induction.location}</Text>
          </View>
        )}
        {induction.conductedByName && (
          <View style={styles.detailRow}>
            <Feather name="user" size={14} color={Colors.textSecondary} />
            <Text style={styles.detailLabel}>Conductor</Text>
            <Text style={styles.detailValue}>{induction.conductedByName}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Feather name="users" size={14} color={Colors.textSecondary} />
          <Text style={styles.detailLabel}>Attendees</Text>
          <Text style={styles.detailValue}>{induction.attendees.length}</Text>
        </View>
        {induction.completedAt && (
          <View style={styles.detailRow}>
            <Feather name="check-circle" size={14} color="#16a34a" />
            <Text style={styles.detailLabel}>Completed</Text>
            <Text style={[styles.detailValue, { color: "#16a34a" }]}>{formatDate(induction.completedAt)}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Notes</Text>
        <TextInput
          style={[styles.notesInput, isCompleted && styles.notesInputDisabled]}
          multiline
          numberOfLines={5}
          value={notes}
          onChangeText={setNotes}
          placeholder="Add notes about this induction session, site-specific hazards, observations…"
          placeholderTextColor={Colors.textSecondary}
          editable={!isCompleted}
          textAlignVertical="top"
        />
        {!isCompleted && (
          <Pressable
            style={[styles.saveNotesBtn, savingNotes && styles.saveNotesBtnDisabled]}
            onPress={onSaveNotes}
            disabled={savingNotes}
          >
            {savingNotes ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : null}
            <Text style={styles.saveNotesBtnText}>{savingNotes ? "Saving…" : "Save Notes"}</Text>
          </Pressable>
        )}
      </View>

      {induction.attendees.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Attendees Overview</Text>
          {induction.attendees.map(att => (
            <View key={att.id} style={styles.attendeeRow}>
              <View style={styles.attendeeAvatar}>
                <Feather name="user" size={14} color={Colors.textSecondary} />
              </View>
              <View style={styles.attendeeInfo}>
                <Text style={styles.attendeeName}>{att.contractorName}</Text>
                {att.contractorTrade && <Text style={styles.attendeeTrade}>{att.contractorTrade}</Text>}
              </View>
              {att.signedOff ? (
                <View style={styles.signedBadge}>
                  <Feather name="check-circle" size={14} color="#16a34a" />
                  <Text style={styles.signedText}>Signed</Text>
                </View>
              ) : (
                <Text style={styles.pendingText}>Pending</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ChecklistPage({ checklistState, onToggle, onUpdateNote, progress, checkedCount, total, isCompleted }: {
  checklistState: ChecklistState;
  onToggle: (categoryId: string, itemIndex: number) => void;
  onUpdateNote: (categoryId: string, itemIndex: number, note: string) => void;
  progress: number;
  checkedCount: number;
  total: number;
  isCompleted: boolean;
}) {
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  return (
    <View style={styles.page}>
      {/* Progress */}
      <View style={styles.card}>
        <View style={styles.progressHeader}>
          <Text style={styles.cardTitle}>Induction Checklist</Text>
          <Text style={styles.progressCount}>{checkedCount}/{total} completed</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>

      {INDUCTION_CHECKLIST.map(section => (
        <View key={section.id} style={styles.card}>
          <Text style={styles.cardTitle}>{section.category}</Text>
          {section.items.map((item, idx) => {
            const itemState = checklistState[section.id]?.[idx] ?? { checked: false };
            const checked = itemState.checked;
            const noteKey = `${section.id}-${idx}`;
            const noteExpanded = expandedNote === noteKey;
            return (
              <View key={idx} style={[styles.checklistItem, checked && styles.checklistItemChecked]}>
                <Pressable
                  onPress={() => !isCompleted && onToggle(section.id, idx)}
                  style={styles.checklistItemRow}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                    {checked && <Feather name="check" size={12} color="#fff" />}
                  </View>
                  <Text style={[styles.checklistItemText, checked && styles.checklistItemTextChecked]}>
                    {item}
                  </Text>
                  {!isCompleted && (
                    <Pressable
                      onPress={() => setExpandedNote(noteExpanded ? null : noteKey)}
                      style={styles.noteToggle}
                    >
                      <Feather name="edit-2" size={12} color={itemState.note ? Colors.secondary : Colors.textSecondary} />
                    </Pressable>
                  )}
                  {isCompleted && itemState.note ? (
                    <Pressable
                      onPress={() => setExpandedNote(noteExpanded ? null : noteKey)}
                      style={styles.noteToggle}
                    >
                      <Feather name="message-square" size={12} color={Colors.secondary} />
                    </Pressable>
                  ) : null}
                </Pressable>
                {noteExpanded && (
                  <TextInput
                    style={styles.itemNoteInput}
                    value={itemState.note ?? ""}
                    onChangeText={text => onUpdateNote(section.id, idx, text)}
                    placeholder="Add a note for this item…"
                    placeholderTextColor={Colors.textSecondary}
                    multiline
                    editable={!isCompleted}
                    textAlignVertical="top"
                    numberOfLines={2}
                  />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function SignOffPage({ induction, onSignOff, signingOff, signedCount, isCompleted }: {
  induction: Induction;
  onSignOff: (att: InductionAttendee) => void;
  signingOff: number | null;
  signedCount: number;
  isCompleted: boolean;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendee Sign-off</Text>
        <Text style={styles.cardSubtitle}>
          {signedCount} of {induction.attendees.length} attendees have signed off.
        </Text>

        {induction.attendees.length === 0 ? (
          <View style={styles.emptyAttendees}>
            <Feather name="users" size={32} color={Colors.textSecondary} />
            <Text style={styles.emptyAttendeesText}>No attendees registered for this induction.</Text>
          </View>
        ) : (
          <View style={styles.attendeesList}>
            {induction.attendees.map(att => (
              <View key={att.id} style={[styles.attendeeSignRow, att.signedOff && styles.attendeeSignRowDone]}>
                <View style={styles.attendeeAvatar}>
                  <Feather name="user" size={16} color={att.signedOff ? "#16a34a" : Colors.textSecondary} />
                </View>
                <View style={styles.attendeeInfo}>
                  <Text style={styles.attendeeName}>{att.contractorName}</Text>
                  {att.contractorTrade && <Text style={styles.attendeeTrade}>{att.contractorTrade}</Text>}
                  {att.acknowledgedAt && (
                    <Text style={styles.acknowledgedText}>
                      Acknowledged {formatDate(att.acknowledgedAt)}
                    </Text>
                  )}
                </View>
                {att.signedOff ? (
                  <View style={styles.signedBadge}>
                    <Feather name="check-circle" size={16} color="#16a34a" />
                    <Text style={styles.signedText}>Signed off</Text>
                  </View>
                ) : !isCompleted ? (
                  <Pressable
                    style={[styles.signOffBtn, signingOff === att.id && styles.signOffBtnDisabled]}
                    onPress={() => onSignOff(att)}
                    disabled={signingOff === att.id}
                  >
                    {signingOff === att.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Text style={styles.signOffBtnText}>Acknowledge</Text>
                    )}
                  </Pressable>
                ) : (
                  <Text style={styles.pendingText}>Not signed</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {!isCompleted && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Declaration</Text>
          <Text style={styles.declarationText}>
            By completing this induction session, you confirm that all attendees listed above have been briefed on the site rules, PPE requirements, emergency procedures, and site-specific hazards for this project.
          </Text>
        </View>
      )}
    </View>
  );
}

function AttachmentsPage({
  attachments,
  loading,
  uploading,
  isCompleted,
  onUploadCamera,
  onUploadLibrary,
  onDelete,
}: {
  attachments: InductionAttachment[];
  loading: boolean;
  uploading: boolean;
  isCompleted: boolean;
  onUploadCamera: () => void;
  onUploadLibrary: () => void;
  onDelete: (id: number) => void;
}) {
  function formatSize(bytes: number | null) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Attachments</Text>
        <Text style={styles.cardSubtitle}>
          {attachments.length === 0 ? "No attachments yet." : `${attachments.length} attachment${attachments.length !== 1 ? "s" : ""} added.`}
        </Text>

        {!isCompleted && (
          <View style={styles.attachmentActions}>
            <Pressable
              style={[styles.attachBtn, uploading && styles.attachBtnDisabled]}
              onPress={onUploadCamera}
              disabled={uploading}
            >
              <Feather name="camera" size={15} color="#fff" />
              <Text style={styles.attachBtnText}>{uploading ? "Uploading…" : "Take Photo"}</Text>
            </Pressable>
            <Pressable
              style={[styles.attachBtn, styles.attachBtnSecondary, uploading && styles.attachBtnDisabled]}
              onPress={onUploadLibrary}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={Colors.secondary} />
              ) : (
                <Feather name="image" size={15} color={Colors.secondary} />
              )}
              <Text style={[styles.attachBtnText, styles.attachBtnSecondaryText]}>
                {uploading ? "Uploading…" : "From Library"}
              </Text>
            </Pressable>
          </View>
        )}

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator size="small" color={Colors.secondary} />
          </View>
        )}

        {!loading && attachments.length === 0 && (
          <View style={styles.emptyAttendees}>
            <Feather name="paperclip" size={32} color={Colors.textSecondary} />
            <Text style={styles.emptyAttendeesText}>
              {isCompleted
                ? "No attachments were added to this induction."
                : "Add photos or files to document this induction session."}
            </Text>
          </View>
        )}

        {!loading && attachments.map(att => (
          <View key={att.id} style={styles.attachmentRow}>
            <View style={styles.attachmentIcon}>
              <Feather
                name={att.mimeType?.startsWith("image/") ? "image" : "file"}
                size={18}
                color={Colors.secondary}
              />
            </View>
            <View style={styles.attachmentInfo}>
              <Text style={styles.attachmentName} numberOfLines={1}>{att.name}</Text>
              <Text style={styles.attachmentMeta}>
                {att.fileName}{att.fileSize ? ` · ${formatSize(att.fileSize)}` : ""}
              </Text>
            </View>
            {att.fileUrl ? (
              <Pressable
                style={styles.attachmentViewBtn}
                onPress={() => att.fileUrl && Linking.openURL(att.fileUrl)}
              >
                <Feather name="external-link" size={14} color={Colors.secondary} />
              </Pressable>
            ) : null}
            {!isCompleted && (
              <Pressable style={styles.attachmentDeleteBtn} onPress={() => onDelete(att.id)}>
                <Feather name="trash-2" size={14} color="#ef4444" />
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  errorText: {
    fontSize: 16,
    color: Colors.danger,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.primary,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  pageNav: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  pageNavItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  pageNavItemActive: {
    borderBottomColor: Colors.secondary,
  },
  pageNavText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  pageNavTextActive: {
    color: Colors.secondary,
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  page: {
    gap: 14,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: -4,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    width: 80,
  },
  detailValue: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: "600",
    flex: 1,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.primary,
    backgroundColor: "#f8fafc",
    minHeight: 100,
  },
  notesInputDisabled: {
    opacity: 0.7,
    backgroundColor: "#f1f5f9",
  },
  saveNotesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  saveNotesBtnDisabled: {
    opacity: 0.6,
  },
  saveNotesBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.primary,
  },
  attendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  attendeeAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeInfo: {
    flex: 1,
    gap: 2,
  },
  attendeeName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.primary,
  },
  attendeeTrade: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  signedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#f0fdf4",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  signedText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  pendingText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressCount: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.secondary,
  },
  progressBar: {
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.secondary,
    borderRadius: 3,
  },
  checklistItem: {
    flexDirection: "column",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 4,
  },
  checklistItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checklistItemChecked: {
    opacity: 0.8,
  },
  noteToggle: {
    padding: 4,
    alignSelf: "flex-start",
  },
  itemNoteInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    color: Colors.primary,
    backgroundColor: "#f8fafc",
    marginLeft: 30,
    minHeight: 52,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  checklistItemText: {
    fontSize: 13,
    color: Colors.primary,
    flex: 1,
    lineHeight: 18,
  },
  checklistItemTextChecked: {
    textDecorationLine: "line-through",
    color: Colors.textSecondary,
  },
  attendeesList: {
    gap: 2,
  },
  attendeeSignRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  attendeeSignRowDone: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  acknowledgedText: {
    fontSize: 11,
    color: "#16a34a",
    marginTop: 2,
  },
  signOffBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  signOffBtnDisabled: {
    opacity: 0.6,
  },
  signOffBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  emptyAttendees: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 20,
  },
  emptyAttendeesText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  declarationText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  bottomBar: {
    padding: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  completeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 14,
  },
  completeButtonDisabled: {
    opacity: 0.7,
  },
  completeButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  attachmentActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.secondary,
    borderRadius: 8,
    paddingVertical: 10,
  },
  attachBtnSecondary: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  attachBtnDisabled: {
    opacity: 0.6,
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  attachBtnSecondaryText: {
    color: Colors.secondary,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  attachmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#f0f9ff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  attachmentInfo: {
    flex: 1,
    gap: 2,
  },
  attachmentName: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.primary,
  },
  attachmentMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  attachmentViewBtn: {
    padding: 6,
  },
  attachmentDeleteBtn: {
    padding: 6,
  },
});

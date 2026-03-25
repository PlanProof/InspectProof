import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const RESULT_OPTS = [
  { key: "pass", label: "Pass", icon: "check-circle", color: "#22c55e", bg: "#f0fdf4" },
  { key: "fail", label: "Fail", icon: "x-circle", color: "#ef4444", bg: "#fef2f2" },
  { key: "na", label: "N/A", icon: "minus-circle", color: "#94a3b8", bg: "#f1f5f9" },
];

type ResultKey = "pass" | "fail" | "na" | "pending";

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface MarkupData {
  w: number;
  h: number;
  strokes: Stroke[];
}

interface ChecklistItem {
  id: number;
  inspectionId: number;
  checklistItemId: number;
  category: string;
  description: string;
  codeReference?: string;
  riskLevel: string;
  result: ResultKey;
  notes?: string;
  photoUrls?: string[];
  photoMarkups?: Record<string, MarkupData>;
  orderIndex: number;
}

export default function ConductInspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [activeItem, setActiveItem] = useState<ChecklistItem | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editResult, setEditResult] = useState<ResultKey>("pending");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [completing, setCompleting] = useState(false);

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

  const { data: inspection, isLoading: loadingInspection } = useQuery({
    queryKey: ["inspection", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}`),
    enabled: !!token && !!id,
  });

  const { data: checklistItems = [], isLoading: loadingChecklist, refetch: refetchChecklist } = useQuery<ChecklistItem[]>({
    queryKey: ["inspection-checklist", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}/checklist`),
    enabled: !!token && !!id,
  });

  useFocusEffect(
    useCallback(() => {
      refetchChecklist();
    }, [refetchChecklist])
  );

  const grouped = checklistItems.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const passCount = checklistItems.filter(i => i.result === "pass").length;
  const failCount = checklistItems.filter(i => i.result === "fail").length;
  const naCount = checklistItems.filter(i => i.result === "na").length;
  const pendingCount = checklistItems.filter(i => i.result === "pending").length;
  const total = checklistItems.length;
  const progress = total > 0 ? ((total - pendingCount) / total) : 0;

  const openItemModal = (item: ChecklistItem) => {
    setActiveItem(item);
    setEditResult(item.result);
    setEditNotes(item.notes || "");
  };

  const closeModal = () => {
    setActiveItem(null);
    setEditNotes("");
    setEditResult("pending");
  };

  const quickPass = async (item: ChecklistItem) => {
    const next = item.result === "pass" ? "pending" : "pass";
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: next, notes: item.notes || null, photoUrls: item.photoUrls || [] }),
      });
      await refetchChecklist();
    } catch {
      Alert.alert("Error", "Failed to update. Please try again.");
    }
  };

  const quickPassAll = async (items: ChecklistItem[]) => {
    const allPassed = items.every(i => i.result === "pass");
    const next = allPassed ? "pending" : "pass";
    try {
      await Promise.all(items.map(item =>
        fetchWithAuth(`/api/inspections/${id}/checklist/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: next, notes: item.notes || null, photoUrls: item.photoUrls || [] }),
        })
      ));
      await refetchChecklist();
    } catch {
      Alert.alert("Error", "Failed to update items. Please try again.");
    }
  };

  const saveItem = async () => {
    if (!activeItem) return;
    setSavingItem(true);
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${activeItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: editResult,
          notes: editNotes || null,
          photoUrls: activeItem.photoUrls || [],
        }),
      });
      await refetchChecklist();
      closeModal();
    } catch (e: any) {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSavingItem(false);
    }
  };

  const navigateToMarkup = (photoUri: string, itemId: number) => {
    router.push({
      pathname: "/inspection/photo-markup" as any,
      params: {
        photoUri,
        inspectionId: id,
        itemId: String(itemId),
      },
    });
  };

  const uploadPhoto = async () => {
    if (!activeItem) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo access to upload images.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (picked.canceled || !picked.assets[0]) return;
    const itemId = activeItem.id;
    closeModal();
    navigateToMarkup(picked.assets[0].uri, itemId);
  };

  const takePhoto = async () => {
    if (!activeItem) return;
    await takePhotoForItem(activeItem);
  };

  const takePhotoForItem = async (item: ChecklistItem) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access to take photos.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    if (activeItem) closeModal();
    navigateToMarkup(picked.assets[0].uri, item.id);
  };

  const removePhoto = async (photoPath: string) => {
    if (!activeItem) return;
    const newPhotoUrls = (activeItem.photoUrls || []).filter(p => p !== photoPath);
    const newMarkups = { ...(activeItem.photoMarkups || {}) };
    delete newMarkups[photoPath];
    setActiveItem(prev => prev ? { ...prev, photoUrls: newPhotoUrls, photoMarkups: newMarkups } : null);
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${activeItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: newPhotoUrls, photoMarkups: newMarkups }),
      });
      await refetchChecklist();
    } catch { }
  };

  const completeInspection = async () => {
    if (pendingCount > 0) {
      Alert.alert(
        "Incomplete Checklist",
        `${pendingCount} item(s) still pending. Complete all items before finishing, or mark them N/A.`,
        [
          { text: "Continue Anyway", onPress: doComplete },
          { text: "Go Back", style: "cancel" },
        ]
      );
      return;
    }
    doComplete();
  };

  const doComplete = async () => {
    setCompleting(true);
    try {
      const newStatus = failCount > 0 ? "follow_up_required" : "completed";
      await fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          completedDate: new Date().toISOString().split("T")[0],
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      queryClient.invalidateQueries({ queryKey: ["inspection", id] });

      // Suggest the most appropriate report type based on results
      const suggestedType = failCount > 0 ? "defect_notice" : "inspection_certificate";

      Alert.alert(
        failCount > 0 ? "Inspection Complete — Follow-Up Required" : "Inspection Complete",
        failCount > 0
          ? `${failCount} item(s) failed. A follow-up will be required.\n\nWould you like to generate a Defect Notice now?`
          : `All ${passCount} items passed.\n\nWould you like to generate an Inspection Certificate now?`,
        [
          {
            text: "Create Report",
            onPress: () => router.replace(`/inspection/generate-report?id=${id}&autoType=${suggestedType}` as any),
          },
          {
            text: "Done",
            style: "cancel",
            onPress: () => router.replace(`/inspection/${id}` as any),
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Error", "Failed to complete inspection.");
    } finally {
      setCompleting(false);
    }
  };

  if (loadingInspection || loadingChecklist) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.secondary} />
        <Text style={styles.loadingText}>Loading inspection...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={20} color={Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {inspection?.inspectionType?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Inspection"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>{inspection?.projectName}</Text>
        </View>
        <Pressable
          style={[styles.completeBtn, completing && { opacity: 0.6 }]}
          onPress={completeInspection}
          disabled={completing}
        >
          {completing ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.completeBtnText}>Done</Text>}
        </Pressable>
      </View>

      {/* Progress bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.progressStats}>
          <Text style={styles.progressText}>{Math.round(progress * 100)}% complete</Text>
          <View style={styles.resultChips}>
            <Text style={[styles.resultChip, { color: "#22c55e" }]}>✓ {passCount}</Text>
            <Text style={[styles.resultChip, { color: "#ef4444" }]}>✗ {failCount}</Text>
            <Text style={[styles.resultChip, { color: "#94a3b8" }]}>— {naCount}</Text>
            {pendingCount > 0 && <Text style={[styles.resultChip, { color: Colors.textTertiary }]}>⏳ {pendingCount}</Text>}
          </View>
        </View>
      </View>

      {/* Checklist */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (progress === 1 ? 130 : 80) }]}
        showsVerticalScrollIndicator={false}
      >
        {total === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="clipboard" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>No checklist items</Text>
            <Text style={styles.emptySub}>This inspection has no checklist template attached.</Text>
          </View>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <View key={category} style={styles.category}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryTitle}>{category}</Text>
                <View style={styles.categoryRight}>
                  <Text style={styles.categoryCount}>
                    {items.filter(i => i.result !== "pending").length}/{items.length}
                  </Text>
                  <Pressable
                    onPress={() => quickPassAll(items)}
                    hitSlop={10}
                    style={({ pressed }) => [
                      styles.masterTick,
                      items.every(i => i.result === "pass") && styles.masterTickActive,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Feather
                      name="check"
                      size={14}
                      color={items.every(i => i.result === "pass") ? "#fff" : Colors.textTertiary}
                    />
                  </Pressable>
                </View>
              </View>
              {items.map(item => (
                <ChecklistRow key={item.id} item={item} onPress={() => openItemModal(item)} onCamera={() => takePhotoForItem(item)} onQuickPass={() => quickPass(item)} />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Generate Report — shown when 100% complete */}
      {progress === 1 && total > 0 && (
        <View style={[styles.generateBar, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
            onPress={() => {
              const autoType = failCount > 0 ? "defect_notice" : "inspection_certificate";
              router.push(`/inspection/generate-report?id=${id}&autoType=${autoType}` as any);
            }}
          >
            <Feather name="file-text" size={20} color={Colors.primary} />
            <Text style={styles.generateBtnText}>Generate Report</Text>
            <Feather name="arrow-right" size={18} color={Colors.primary} />
          </Pressable>
        </View>
      )}

      {/* Item Detail Modal */}
      <Modal
        visible={!!activeItem}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        {activeItem && (
          <ItemModal
            item={activeItem}
            result={editResult}
            notes={editNotes}
            baseUrl={baseUrl}
            onResultChange={setEditResult}
            onNotesChange={setEditNotes}
            onSave={saveItem}
            onClose={closeModal}
            onUploadPhoto={uploadPhoto}
            onTakePhoto={takePhoto}
            onRemovePhoto={removePhoto}
            saving={savingItem}
            uploadingPhoto={uploadingPhoto}
            insets={insets}
          />
        )}
      </Modal>
    </View>
  );
}

function ChecklistRow({ item, onPress, onCamera, onQuickPass }: { item: ChecklistItem; onPress: () => void; onCamera: () => void; onQuickPass: () => void }) {
  const resultOpt = RESULT_OPTS.find(r => r.key === item.result);
  const isPending = item.result === "pending";
  const photoCount = item.photoUrls?.length || 0;

  return (
    <Pressable style={[styles.checkRow, isPending && styles.checkRowPending, item.result === "pass" && styles.checkRowPass, item.result === "fail" && styles.checkRowFail]} onPress={onPress}>
      <Pressable
        onPress={e => { e.stopPropagation?.(); onQuickPass(); }}
        hitSlop={8}
        style={({ pressed }) => [styles.resultIndicator, { backgroundColor: resultOpt?.bg || "#f8fafc", opacity: pressed ? 0.7 : 1 }]}
      >
        <Feather
          name={resultOpt?.icon as any || "circle"}
          size={18}
          color={resultOpt?.color || Colors.textTertiary}
        />
      </Pressable>
      <View style={styles.checkInfo}>
        <Text style={styles.checkDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.checkMeta}>
          {item.codeReference && (
            <View style={styles.codeRef}>
              <Text style={styles.codeRefText}>{item.codeReference}</Text>
            </View>
          )}
          <RiskBadge risk={item.riskLevel} />
          {item.notes && (
            <View style={styles.notesBadge}>
              <Feather name="file-text" size={10} color={Colors.textSecondary} />
            </View>
          )}
        </View>
      </View>

      {/* Camera quick-action button */}
      <Pressable
        onPress={e => { e.stopPropagation?.(); onCamera(); }}
        hitSlop={12}
        style={({ pressed }) => [styles.cameraBtn, pressed && { opacity: 0.6 }]}
      >
        <Feather name="camera" size={22} color={photoCount > 0 ? Colors.secondary : Colors.textTertiary} />
        {photoCount > 0 && (
          <View style={styles.cameraBadge}>
            <Text style={styles.cameraBadgeText}>{photoCount}</Text>
          </View>
        )}
      </Pressable>
    </Pressable>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: "#fee2e2", text: "#dc2626" },
    high: { bg: "#ffedd5", text: "#ea580c" },
    medium: { bg: "#fef9c3", text: "#ca8a04" },
    low: { bg: "#dcfce7", text: "#16a34a" },
  };
  const c = colors[risk] || colors.medium;
  return (
    <View style={[styles.riskBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.riskText, { color: c.text }]}>{risk.charAt(0).toUpperCase() + risk.slice(1)}</Text>
    </View>
  );
}

function ItemModal({
  item, result, notes, baseUrl, onResultChange, onNotesChange, onSave, onClose,
  onUploadPhoto, onTakePhoto, onRemovePhoto, saving, uploadingPhoto, insets,
}: {
  item: ChecklistItem; result: ResultKey; notes: string; baseUrl: string;
  onResultChange: (r: ResultKey) => void; onNotesChange: (n: string) => void;
  onSave: () => void; onClose: () => void; onUploadPhoto: () => void;
  onTakePhoto: () => void; onRemovePhoto: (p: string) => void;
  saving: boolean; uploadingPhoto: boolean; insets: any;
}) {
  const selectedOpt = RESULT_OPTS.find(r => r.key === result);

  return (
    <View style={[modalStyles.container, { paddingTop: insets.top + 16 }]}>
      {/* Modal Header */}
      <View style={modalStyles.header}>
        <Pressable onPress={onClose} style={modalStyles.closeBtn} hitSlop={12}>
          <Feather name="x" size={22} color={Colors.text} />
        </Pressable>
        <Text style={modalStyles.headerTitle}>Checklist Item</Text>
        <Pressable
          style={[modalStyles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={modalStyles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      <ScrollView style={modalStyles.scroll} contentContainerStyle={[modalStyles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Description */}
        <View style={modalStyles.descCard}>
          <Text style={modalStyles.descText}>{item.description}</Text>
          <View style={modalStyles.descMeta}>
            {item.codeReference && (
              <View style={modalStyles.codeRef}>
                <Feather name="book-open" size={11} color={Colors.secondary} />
                <Text style={modalStyles.codeRefText}>{item.codeReference}</Text>
              </View>
            )}
            <RiskBadge risk={item.riskLevel} />
          </View>
        </View>

        {/* Result Selection */}
        <View style={modalStyles.section}>
          <Text style={modalStyles.sectionLabel}>Result *</Text>
          <View style={modalStyles.resultRow}>
            {RESULT_OPTS.map(opt => (
              <Pressable
                key={opt.key}
                style={[modalStyles.resultBtn, result === opt.key && { backgroundColor: opt.bg, borderColor: opt.color }]}
                onPress={() => onResultChange(opt.key as ResultKey)}
              >
                <Feather name={opt.icon as any} size={22} color={result === opt.key ? opt.color : Colors.textTertiary} />
                <Text style={[modalStyles.resultLabel, result === opt.key && { color: opt.color }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Notes */}
        <View style={modalStyles.section}>
          <Text style={modalStyles.sectionLabel}>Notes</Text>
          <TextInput
            style={modalStyles.notesInput}
            value={notes}
            onChangeText={onNotesChange}
            placeholder="Add observations, measurements, or comments..."
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Photos */}
        <View style={modalStyles.section}>
          <Text style={modalStyles.sectionLabel}>Photos ({item.photoUrls?.length || 0})</Text>

          {item.photoUrls && item.photoUrls.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modalStyles.photoRow}>
              {item.photoUrls.map((photoPath, idx) => {
                const markup: MarkupData | undefined = item.photoMarkups?.[photoPath];
                const hasMarkup = markup && markup.strokes.length > 0;
                return (
                  <View key={idx} style={modalStyles.photoThumb}>
                    <Image
                      source={{ uri: `${baseUrl}/api/storage${photoPath}` }}
                      style={modalStyles.thumbImage}
                      resizeMode="cover"
                    />
                    {hasMarkup && markup && (
                      <Svg
                        style={StyleSheet.absoluteFill}
                        width={80}
                        height={80}
                        viewBox={`0 0 ${markup.w} ${markup.h}`}
                        preserveAspectRatio="xMidYMid meet"
                      >
                        {markup.strokes.map((stroke, si) => {
                          const d = stroke.points.map((p, pi) => `${pi === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                          return (
                            <Path
                              key={si}
                              d={d}
                              stroke={stroke.color}
                              strokeWidth={stroke.width}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          );
                        })}
                      </Svg>
                    )}
                    {hasMarkup && (
                      <View style={modalStyles.markupBadge}>
                        <Feather name="edit-2" size={8} color="#fff" />
                      </View>
                    )}
                    <Pressable style={modalStyles.removePhoto} onPress={() => onRemovePhoto(photoPath)} hitSlop={4}>
                      <Feather name="x" size={12} color="#fff" />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={modalStyles.photoButtons}>
            <Pressable style={modalStyles.photoBtnCamera} onPress={onTakePhoto} disabled={uploadingPhoto}>
              <Feather name="camera" size={18} color="#fff" />
              <Text style={modalStyles.photoBtnCameraText}>Take Photo</Text>
            </Pressable>
            <Pressable style={modalStyles.photoBtn} onPress={onUploadPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color={Colors.secondary} />
              ) : (
                <Feather name="image" size={18} color={Colors.secondary} />
              )}
              <Text style={modalStyles.photoBtnText}>{uploadingPhoto ? "Uploading..." : "Add from Library"}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
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
  completeBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 56,
    alignItems: "center",
  },
  completeBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  progressSection: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  progressBar: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: Colors.accent, borderRadius: 3 },
  progressStats: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  resultChips: { flexDirection: "row", gap: 10 },
  resultChip: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 16 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptySub: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center" },
  category: { gap: 6 },
  categoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  categoryTitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 },
  categoryCount: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  categoryRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  masterTick: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  masterTickActive: {
    backgroundColor: "#22c55e",
    borderColor: "#16a34a",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  checkRowPending: { borderColor: Colors.border, opacity: 0.9 },
  checkRowPass: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  checkRowFail: { backgroundColor: "#fff5f5", borderColor: "#fecaca" },
  resultIndicator: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  checkInfo: { flex: 1, gap: 6 },
  checkDesc: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 19 },
  checkMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  codeRef: {
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeRefText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  riskBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  riskText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold" },
  photoBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: Colors.infoLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  photoBadgeText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  notesBadge: { backgroundColor: Colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  generateBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 18,
  },
  generateBtnText: {
    fontSize: 17,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
    flex: 1,
    textAlign: "center",
    marginLeft: -28,
  },
  cameraBtn: {
    position: "relative",
    padding: 10,
    marginLeft: 4,
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  cameraBadgeText: { fontSize: 9, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  saveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 56,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 20 },
  descCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  descText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 22 },
  descMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  codeRef: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.infoLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  codeRefText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  riskBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  riskText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  section: { gap: 10 },
  sectionLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  resultRow: { flexDirection: "row", gap: 10 },
  resultBtn: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  resultLabel: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  notesInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    minHeight: 100,
  },
  photoRow: { gap: 10, paddingBottom: 4 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: "visible", position: "relative" },
  thumbImage: { width: 80, height: 80, borderRadius: 8 },
  removePhoto: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  markupBadge: {
    position: "absolute", bottom: 4, left: 4,
    backgroundColor: Colors.secondary, borderRadius: 4,
    width: 16, height: 16, alignItems: "center", justifyContent: "center",
  },
  photoButtons: { flexDirection: "column", gap: 10 },
  photoBtnCamera: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.secondary,
  },
  photoBtnCameraText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  photoBtnText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
});

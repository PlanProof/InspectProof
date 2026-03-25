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
  Image,
  Modal,
  Platform,
  useWindowDimensions,
  Animated,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import Svg, { Path } from "react-native-svg";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getSuggestionsForItem } from "@/constants/noteSuggestions";

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

interface ProjectDocument {
  id: number;
  name: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  folder: string;
  fileUrl?: string;
  includedInInspection: boolean;
}

export default function ConductInspectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { width: screenW } = useWindowDimensions();
  const [activeItem, setActiveItem] = useState<ChecklistItem | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editResult, setEditResult] = useState<ResultKey>("pending");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const pageScrollRef = useRef<ScrollView>(null);
  const autoCompletedRef = useRef(false);

  const scrollToPage = useCallback((page: number) => {
    pageScrollRef.current?.scrollTo({ x: page * screenW, animated: true });
    setActivePage(page);
  }, [screenW]);

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

  const { data: projectDocuments = [] } = useQuery<ProjectDocument[]>({
    queryKey: ["project-documents", inspection?.projectId, token],
    queryFn: () => fetchWithAuth(`/api/projects/${inspection.projectId}/documents`),
    enabled: !!token && !!inspection?.projectId,
    select: (docs: ProjectDocument[]) => docs.filter(d => d.includedInInspection),
  });

  useFocusEffect(
    useCallback(() => {
      refetchChecklist();
    }, [refetchChecklist])
  );

  const sortedItems = [...checklistItems].sort((a, b) => a.orderIndex - b.orderIndex);
  const grouped = sortedItems.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const passCount = checklistItems.filter(i => i.result === "pass").length;
  const failCount = checklistItems.filter(i => i.result === "fail").length;
  const naCount = checklistItems.filter(i => i.result === "na").length;
  const pendingCount = checklistItems.filter(i => i.result === "pending").length;
  const total = checklistItems.length;
  const progress = total > 0 ? ((total - pendingCount) / total) : 0;
  // Score only counts pass/fail — N/A items are excluded
  const scored = passCount + failCount;
  const passRate = scored > 0 ? passCount / scored : null;

  // Auto-mark as completed/follow_up_required when 100% checked off
  useEffect(() => {
    if (
      total > 0 &&
      progress === 1 &&
      !autoCompletedRef.current &&
      inspection &&
      inspection.status !== "completed" &&
      inspection.status !== "follow_up_required"
    ) {
      autoCompletedRef.current = true;
      const newStatus = failCount > 0 ? "follow_up_required" : "completed";
      fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          completedDate: new Date().toISOString().split("T")[0],
        }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["inspections"] });
        queryClient.invalidateQueries({ queryKey: ["inspection", id] });
      }).catch(() => {
        autoCompletedRef.current = false;
      });
    }
  }, [progress, total, inspection?.status]);

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

  const quickNA = async (item: ChecklistItem) => {
    const next = item.result === "na" ? "pending" : "na";
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

  const annotateDocument = (doc: ProjectDocument, itemId: number) => {
    if (!doc.fileUrl) return;
    const docUrl = `${baseUrl}/api/storage${doc.fileUrl}`;
    closeModal();
    navigateToMarkup(docUrl, itemId);
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
      router.back();
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

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, activePage === 0 && styles.tabActive]} onPress={() => scrollToPage(0)}>
          <Feather name="list" size={13} color={activePage === 0 ? Colors.secondary : Colors.textTertiary} />
          <Text style={[styles.tabText, activePage === 0 && styles.tabTextActive]}>
            Checklist {total > 0 ? `(${total - pendingCount}/${total})` : ""}
          </Text>
        </Pressable>
        <Pressable style={[styles.tab, activePage === 1 && styles.tabActive]} onPress={() => scrollToPage(1)}>
          <Feather name="folder" size={13} color={activePage === 1 ? Colors.secondary : Colors.textTertiary} />
          <Text style={[styles.tabText, activePage === 1 && styles.tabTextActive]}>
            Plans{projectDocuments.length > 0 ? ` (${projectDocuments.length})` : ""}
          </Text>
          {projectDocuments.length > 0 && activePage !== 1 && (
            <View style={styles.tabBadgeDot} />
          )}
        </Pressable>
      </View>

      {/* Horizontal paged content */}
      <ScrollView
        ref={pageScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        nestedScrollEnabled
        style={{ flex: 1 }}
        onMomentumScrollEnd={(e) => {
          const page = Math.round(e.nativeEvent.contentOffset.x / screenW);
          setActivePage(page);
        }}
      >
        {/* ── Page 0: Checklist ── */}
        <View style={{ width: screenW, flex: 1 }}>
          {/* Progress bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={styles.progressStats}>
              <View style={styles.scoreCol}>
                {passRate !== null ? (
                  <>
                    <Text style={styles.progressText}>{Math.round(passRate * 100)}% pass rate</Text>
                    <Text style={styles.progressSubText}>{Math.round(progress * 100)}% complete</Text>
                  </>
                ) : (
                  <Text style={styles.progressText}>{Math.round(progress * 100)}% complete</Text>
                )}
              </View>
              <View style={styles.resultChips}>
                <Text style={[styles.resultChip, { color: "#22c55e" }]}>✓ {passCount}</Text>
                <Text style={[styles.resultChip, { color: "#ef4444" }]}>✗ {failCount}</Text>
                {naCount > 0 && <Text style={[styles.resultChip, { color: "#94a3b8" }]}>— {naCount}</Text>}
                {pendingCount > 0 && <Text style={[styles.resultChip, { color: Colors.textTertiary }]}>⏳ {pendingCount}</Text>}
              </View>
            </View>
            {/* Swipe hint when documents exist */}
            {projectDocuments.length > 0 && (
              <Pressable style={styles.swipeHintRow} onPress={() => scrollToPage(1)}>
                <Feather name="folder" size={13} color={Colors.secondary} />
                <Text style={styles.swipeHintText}>
                  {projectDocuments.length} plan{projectDocuments.length !== 1 ? "s" : ""} attached — swipe right to view
                </Text>
                <Feather name="chevron-right" size={13} color={Colors.textTertiary} />
              </Pressable>
            )}
          </View>

          {/* Checklist items */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + (progress === 1 ? 130 : 80) }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
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
                          color={items.every(i => i.result === "pass") ? "#22c55e" : Colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  </View>
                  {items.map(item => (
                    <ChecklistRow key={item.id} item={item} onPress={() => openItemModal(item)} onCamera={() => takePhotoForItem(item)} onQuickPass={() => quickPass(item)} onQuickNA={() => quickNA(item)} />
                  ))}
                </View>
              ))
            )}
          </ScrollView>

          {/* Bottom action bar — shown when 100% complete */}
          {progress === 1 && total > 0 && (
            <View style={[styles.generateBar, { paddingBottom: insets.bottom + 12 }]}>
              <View style={styles.generateRow}>
                <Pressable
                  style={({ pressed }) => [styles.completeOnlyBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => router.back()}
                >
                  <Feather name="check" size={16} color={Colors.primary} />
                  <Text style={styles.completeOnlyText}>Mark Complete</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    const autoType = failCount > 0 ? "defect_notice" : "inspection_certificate";
                    router.push(`/inspection/generate-report?id=${id}&autoType=${autoType}` as any);
                  }}
                >
                  <Feather name="file-text" size={17} color={Colors.primary} />
                  <Text style={styles.generateBtnText}>Generate Report</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* ── Page 1: Project Documents ── */}
        <View style={{ width: screenW, flex: 1 }}>
          <DocumentsPanel
            documents={projectDocuments}
            baseUrl={baseUrl}
            insets={insets}
            inspectionId={id}
            projectId={inspection?.projectId ? String(inspection.projectId) : undefined}
            activeItemId={activeItem?.id}
            onAnnotate={(doc) => {
              if (activeItem) {
                annotateDocument(doc, activeItem.id);
              } else {
                Alert.alert("Select a checklist item first", "Go back to the checklist, open an item, then annotate a document to attach it.");
              }
            }}
          />
        </View>
      </ScrollView>

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
            documents={projectDocuments}
            onResultChange={setEditResult}
            onNotesChange={setEditNotes}
            onSave={saveItem}
            onClose={closeModal}
            onUploadPhoto={uploadPhoto}
            onTakePhoto={takePhoto}
            onRemovePhoto={removePhoto}
            onAnnotateDoc={(doc) => annotateDocument(doc, activeItem.id)}
            saving={savingItem}
            uploadingPhoto={uploadingPhoto}
            insets={insets}
            inspectionId={id}
          />
        )}
      </Modal>
    </View>
  );
}

function ChecklistRow({ item, onPress, onCamera, onQuickPass, onQuickNA }: { item: ChecklistItem; onPress: () => void; onCamera: () => void; onQuickPass: () => void; onQuickNA: () => void }) {
  const swipeRef = useRef<Swipeable>(null);
  const resultOpt = RESULT_OPTS.find(r => r.key === item.result);
  const isPending = item.result === "pending";
  const isNA = item.result === "na";
  const photoCount = item.photoUrls?.length || 0;

  const renderLeftActions = (_progress: any, dragX: any) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.7, 1], extrapolate: "clamp" });
    return (
      <Animated.View style={[styles.naAction, { transform: [{ scale }] }]}>
        <Feather name="minus-circle" size={18} color="#fff" />
        <Text style={styles.naActionText}>N/A</Text>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftActions}
      leftThreshold={80}
      friction={2}
      onSwipeableOpen={() => {
        swipeRef.current?.close();
        onQuickNA();
      }}
    >
      <Pressable
        style={[
          styles.checkRow,
          isNA && styles.checkRowNA,
          !isNA && isPending && styles.checkRowPending,
          !isNA && item.result === "pass" && styles.checkRowPass,
          !isNA && item.result === "fail" && styles.checkRowFail,
        ]}
        onPress={onPress}
      >
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
          <Text style={[styles.checkDesc, isNA && styles.checkDescNA]} numberOfLines={2}>{item.description}</Text>
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
    </Swipeable>
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

function getDocIcon(mimeType?: string): string {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "file-text";
  if (mimeType.includes("word") || mimeType.includes("document")) return "file-text";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "grid";
  return "file";
}

function DocumentsPanel({
  documents, baseUrl, insets, onAnnotate, inspectionId, projectId, activeItemId,
}: {
  documents: ProjectDocument[];
  baseUrl: string;
  insets: any;
  onAnnotate: (doc: ProjectDocument) => void;
  inspectionId?: string;
  projectId?: string;
  activeItemId?: number;
}) {
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);
  const grouped = documents.reduce<Record<string, ProjectDocument[]>>((acc, doc) => {
    const folder = doc.folder || "General";
    (acc[folder] = acc[folder] || []).push(doc);
    return acc;
  }, {});

  const openDocument = (doc: ProjectDocument) => {
    if (!doc.fileUrl) return;
    const isImage = doc.mimeType?.startsWith("image/");
    if (isImage) {
      setPreviewDoc(doc);
    } else {
      router.push({
        pathname: "/inspection/document-viewer" as any,
        params: {
          url: `${baseUrl}/api/storage${doc.fileUrl}`,
          name: doc.name,
          mimeType: doc.mimeType || "application/octet-stream",
          documentId: String(doc.id),
          ...(projectId ? { projectId } : {}),
          ...(inspectionId && activeItemId ? { inspectionId, itemId: String(activeItemId) } : {}),
        },
      });
    }
  };

  if (previewDoc) {
    return (
      <View style={panelStyles.container}>
        <View style={panelStyles.previewHeader}>
          <Pressable onPress={() => setPreviewDoc(null)} style={panelStyles.closeBtn} hitSlop={12}>
            <Feather name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={panelStyles.headerTitle} numberOfLines={1}>{previewDoc.name}</Text>
          <Pressable
            style={panelStyles.annotateBtn}
            onPress={() => { setPreviewDoc(null); onAnnotate(previewDoc); }}
          >
            <Feather name="edit-2" size={14} color="#fff" />
            <Text style={panelStyles.annotateBtnText}>Annotate</Text>
          </Pressable>
        </View>
        <View style={panelStyles.previewContainer}>
          <Image
            source={{ uri: `${baseUrl}/api/storage${previewDoc.fileUrl}` }}
            style={panelStyles.previewImage}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={panelStyles.container}>
      {documents.length === 0 ? (
        <View style={panelStyles.empty}>
          <Feather name="folder" size={48} color={Colors.textTertiary} />
          <Text style={panelStyles.emptyText}>No plans attached</Text>
          <Text style={panelStyles.emptySubText}>Upload plans to this project from the desktop to view them here.</Text>
        </View>
      ) : (
        <>
          <View style={panelStyles.panelHint}>
            <Feather name="info" size={12} color={Colors.secondary} />
            <Text style={panelStyles.panelHintText}>Tap a plan to open it. Tap Markup to draw on it — annotations save to the project.</Text>
          </View>
          <ScrollView
            style={panelStyles.scroll}
            contentContainerStyle={[panelStyles.content, { paddingBottom: insets.bottom + 32 }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {Object.entries(grouped).map(([folder, docs]) => (
              <View key={folder} style={panelStyles.folder}>
                <View style={panelStyles.folderHeader}>
                  <Feather name="folder" size={14} color={Colors.secondary} />
                  <Text style={panelStyles.folderName}>{folder}</Text>
                  <Text style={panelStyles.folderCount}>{docs.length} file{docs.length !== 1 ? "s" : ""}</Text>
                </View>
                {docs.map(doc => {
                  const isImage = doc.mimeType?.startsWith("image/");
                  const isPdf = doc.mimeType === "application/pdf";
                  const icon = getDocIcon(doc.mimeType);
                  return (
                    <Pressable
                      key={doc.id}
                      style={({ pressed }) => [panelStyles.docRow, pressed && { opacity: 0.85 }]}
                      onPress={() => openDocument(doc)}
                    >
                      <View style={[panelStyles.docIconWrap, isPdf && panelStyles.docIconWrapPdf]}>
                        <Feather name={icon as any} size={20} color={isPdf ? Colors.secondary : Colors.textSecondary} />
                      </View>
                      <View style={panelStyles.docInfo}>
                        <Text style={panelStyles.docName} numberOfLines={2}>{doc.name}</Text>
                        <Text style={panelStyles.docMeta}>
                          {doc.mimeType?.split("/")[1]?.toUpperCase() || "File"}
                          {doc.fileSize ? ` · ${Math.round(doc.fileSize / 1024)}KB` : ""}
                        </Text>
                      </View>
                      <Pressable
                        style={panelStyles.markupBtn}
                        onPress={() => openDocument(doc)}
                      >
                        <Feather name="edit-2" size={13} color={Colors.secondary} />
                        <Text style={panelStyles.markupBtnText}>Markup</Text>
                      </Pressable>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function ItemModal({
  item, result, notes, baseUrl, documents, onResultChange, onNotesChange, onSave, onClose,
  onUploadPhoto, onTakePhoto, onRemovePhoto, onAnnotateDoc, saving, uploadingPhoto, insets,
  inspectionId,
}: {
  item: ChecklistItem; result: ResultKey; notes: string; baseUrl: string;
  documents: ProjectDocument[];
  onResultChange: (r: ResultKey) => void; onNotesChange: (n: string) => void;
  onSave: () => void; onClose: () => void; onUploadPhoto: () => void;
  onTakePhoto: () => void; onRemovePhoto: (p: string) => void;
  onAnnotateDoc: (doc: ProjectDocument) => void;
  saving: boolean; uploadingPhoto: boolean; insets: any;
  inspectionId?: string;
}) {
  const selectedOpt = RESULT_OPTS.find(r => r.key === result);
  const suggestions = getSuggestionsForItem(item.category, item.description);
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);

  const applySuggestion = (text: string) => {
    if (!notes.trim()) {
      onNotesChange(text);
    } else {
      onNotesChange(notes.trimEnd() + "\n" + text);
    }
  };

  if (previewDoc) {
    return (
      <View style={[modalStyles.container, { paddingTop: insets.top + 16 }]}>
        <View style={modalStyles.header}>
          <Pressable onPress={() => setPreviewDoc(null)} style={modalStyles.closeBtn} hitSlop={12}>
            <Feather name="arrow-left" size={20} color={Colors.text} />
          </Pressable>
          <Text style={modalStyles.headerTitle} numberOfLines={1}>{previewDoc.name}</Text>
          <Pressable
            style={modalStyles.saveBtn}
            onPress={() => { setPreviewDoc(null); onAnnotateDoc(previewDoc); }}
          >
            <Text style={modalStyles.saveBtnText}>Annotate</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <Image
            source={{ uri: `${baseUrl}/api/storage${previewDoc.fileUrl}` }}
            style={{ flex: 1 }}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

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
          {/* Quick note suggestions */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modalStyles.suggestionsRow} keyboardShouldPersistTaps="handled">
            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [modalStyles.suggestionChip, pressed && { opacity: 0.7 }]}
                onPress={() => applySuggestion(s)}
              >
                <Text style={modalStyles.suggestionText} numberOfLines={1}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
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

        {/* Project Documents */}
        {documents.length > 0 && (
          <View style={modalStyles.section}>
            <Text style={modalStyles.sectionLabel}>Project Documents ({documents.length})</Text>
            <Text style={modalStyles.docsHint}>Tap an image to view full-size, or annotate a drawing to attach it to this item.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modalStyles.docsList}>
              {documents.map(doc => {
                const isImage = doc.mimeType?.startsWith("image/");
                const icon = getDocIcon(doc.mimeType);
                return (
                  <View key={doc.id} style={modalStyles.docCard}>
                    {isImage ? (
                      <Pressable
                        style={modalStyles.docThumbWrap}
                        onPress={() => setPreviewDoc(doc)}
                      >
                        <Image
                          source={{ uri: `${baseUrl}/api/storage${doc.fileUrl}` }}
                          style={modalStyles.docThumb}
                          resizeMode="cover"
                        />
                        <View style={modalStyles.docThumbOverlay}>
                          <Feather name="eye" size={14} color="#fff" />
                        </View>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={modalStyles.docIconWrap}
                        onPress={() => {
                          if (doc.fileUrl) {
                            onClose();
                            router.push({
                              pathname: "/inspection/document-viewer" as any,
                              params: {
                                url: `${baseUrl}/api/storage${doc.fileUrl}`,
                                name: doc.name,
                                mimeType: doc.mimeType || "application/octet-stream",
                                ...(inspectionId && item?.id ? { inspectionId, itemId: String(item.id) } : {}),
                              },
                            });
                          }
                        }}
                      >
                        <Feather name={icon as any} size={28} color={Colors.secondary} />
                        <Feather name="edit-2" size={10} color={Colors.secondary} style={{ position: "absolute", top: 4, right: 4 }} />
                      </Pressable>
                    )}
                    <Text style={modalStyles.docCardName} numberOfLines={2}>{doc.name}</Text>
                    {isImage && (
                      <Pressable
                        style={modalStyles.docAnnotateBtn}
                        onPress={() => onAnnotateDoc(doc)}
                      >
                        <Feather name="edit-2" size={11} color={Colors.secondary} />
                        <Text style={modalStyles.docAnnotateBtnText}>Annotate</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}
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
  docsBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
    position: "relative",
  },
  docsBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  docsBadgeText: { fontSize: 9, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
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
  scoreCol: { flexDirection: "column", gap: 1 },
  progressText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  progressSubText: { fontSize: 10, color: Colors.textTertiary },
  resultChips: { flexDirection: "row", gap: 10 },
  resultChip: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    position: "relative",
  },
  tabActive: {
    borderBottomColor: Colors.secondary,
  },
  tabText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  tabTextActive: { color: Colors.secondary },
  tabBadgeDot: {
    position: "absolute",
    top: 8,
    right: 22,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  swipeHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: Colors.infoLight,
    borderRadius: 8,
    marginTop: 2,
  },
  swipeHintText: { flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
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
    backgroundColor: "#f0fdf4",
    borderColor: "#86efac",
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
  checkRowNA: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0", opacity: 0.6 },
  checkDescNA: { textDecorationLine: "line-through", color: Colors.textTertiary },
  naAction: {
    backgroundColor: "#94a3b8",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 10,
    marginRight: 4,
    flexDirection: "row",
    gap: 5,
    marginBottom: 8,
  },
  naActionText: { color: "#fff", fontSize: 13, fontFamily: "PlusJakartaSans_700Bold" },
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
  generateRow: {
    flexDirection: "row",
    gap: 10,
  },
  completeOnlyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: Colors.accent,
  },
  completeOnlyText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  generateBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
  },
  generateBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
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
  suggestionsRow: { paddingBottom: 4, gap: 8 },
  suggestionChip: {
    backgroundColor: Colors.infoLight,
    borderWidth: 1,
    borderColor: Colors.secondary + "40",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    maxWidth: 220,
  },
  suggestionText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
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
  docsHint: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 16 },
  docsList: { gap: 10, paddingBottom: 4 },
  docCard: {
    width: 110,
    gap: 6,
    alignItems: "center",
  },
  docThumbWrap: {
    width: 110,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  docThumb: { width: 110, height: 80 },
  docThumbOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    padding: 3,
  },
  docIconWrap: {
    width: 110,
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  docCardName: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    textAlign: "center",
    lineHeight: 14,
  },
  docAnnotateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.secondary,
    backgroundColor: Colors.infoLight,
  },
  docAnnotateBtnText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
});

const panelStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  closeBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  annotateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  annotateBtnText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  panelHint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.infoLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  panelHintText: { flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary, lineHeight: 16 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, textAlign: "center" },
  emptySubText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center", lineHeight: 18 },
  folder: { gap: 8 },
  folderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  folderName: { flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.8 },
  folderCount: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  docIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  docIconWrapPdf: {
    backgroundColor: Colors.infoLight,
  },
  docInfo: { flex: 1, gap: 3 },
  docName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 18 },
  docMeta: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  markupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
    backgroundColor: Colors.infoLight,
  },
  markupBtnText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  previewContainer: { flex: 1, backgroundColor: "#000" },
  previewImage: { flex: 1, width: "100%" },
});

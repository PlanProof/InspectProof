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
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getSuggestionsForItem } from "@/constants/noteSuggestions";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const RESULT_OPTS = [
  { key: "pass", label: "Pass", icon: "check-circle", color: "#22c55e", bg: "#f0fdf4" },
  { key: "fail", label: "Fail", icon: "x-circle", color: "#ef4444", bg: "#fef2f2" },
  { key: "monitor", label: "Monitor", icon: "eye", color: "#f59e0b", bg: "#fffbeb" },
  { key: "na", label: "N/A", icon: "minus-circle", color: "#94a3b8", bg: "#f1f5f9" },
];

type ResultKey = "pass" | "fail" | "monitor" | "na" | "pending";

const SEVERITY_OPTS = ["critical", "major", "minor", "cosmetic"] as const;
const DEFECT_STATUS_OPTS = ["open", "in_progress", "resolved", "deferred"] as const;

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
  requirePhoto?: boolean;
  defectTrigger?: boolean;
  recommendedActionDefault?: string | null;
  result: ResultKey;
  notes?: string;
  photoUrls?: string[];
  photoMarkups?: Record<string, MarkupData>;
  severity?: string | null;
  location?: string | null;
  tradeAllocated?: string | null;
  defectStatus?: string;
  clientVisible?: boolean;
  recommendedAction?: string | null;
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
  const { id, editMode } = useLocalSearchParams<{ id: string; editMode?: string }>();
  const isEditMode = editMode === "1";
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { width: screenW } = useWindowDimensions();
  const [activeItem, setActiveItem] = useState<ChecklistItem | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editResult, setEditResult] = useState<ResultKey>("pending");
  const [editSeverity, setEditSeverity] = useState<string | null>(null);
  const [editLocation, setEditLocation] = useState<string>("");
  const [editTradeAllocated, setEditTradeAllocated] = useState<string>("");
  const [editRecommendedAction, setEditRecommendedAction] = useState<string>("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const [addItemModal, setAddItemModal] = useState<{ visible: boolean; category: string }>({ visible: false, category: "" });
  const [addItemDesc, setAddItemDesc] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const pageScrollRef = useRef<ScrollView>(null);
  // In edit mode, suppress auto-completion — user is intentionally modifying a finished inspection
  const autoCompletedRef = useRef(isEditMode);

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
    refetchOnWindowFocus: false,
  });

  const { data: projectDocuments = [], refetch: refetchDocuments } = useQuery<ProjectDocument[]>({
    queryKey: ["project-documents", inspection?.projectId, token],
    queryFn: () => fetchWithAuth(`/api/projects/${inspection.projectId}/documents`),
    enabled: !!token && !!inspection?.projectId,
    select: (docs: ProjectDocument[]) => docs.filter(d => d.includedInInspection),
  });

  const { data: internalStaff = [] } = useQuery<{ id: number; name: string; role: string }[]>({
    queryKey: ["internal-staff", token],
    queryFn: () => fetchWithAuth("/api/internal-staff"),
    enabled: !!token,
  });

  const { data: contractors = [] } = useQuery<{ id: number; name: string; trade: string; email: string | null }[]>({
    queryKey: ["project-contractors", inspection?.projectId, token],
    queryFn: () => fetchWithAuth(`/api/projects/${inspection!.projectId}/contractors`),
    enabled: !!token && !!inspection?.projectId,
  });

  useFocusEffect(
    useCallback(() => {
      refetchChecklist();
      refetchDocuments();
    }, [refetchChecklist, refetchDocuments])
  );

  const sortedItems = [...checklistItems].sort((a, b) => a.orderIndex - b.orderIndex);
  const grouped = sortedItems.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const passCount = checklistItems.filter(i => i.result === "pass").length;
  const failCount = checklistItems.filter(i => i.result === "fail").length;
  const monitorCount = checklistItems.filter(i => i.result === "monitor").length;
  const naCount = checklistItems.filter(i => i.result === "na").length;
  const pendingCount = checklistItems.filter(i => i.result === "pending").length;
  const total = checklistItems.length;
  const progress = total > 0 ? ((total - pendingCount) / total) : 0;
  // Score only counts pass/fail — N/A and monitor items are excluded from pass rate
  const scored = passCount + failCount;
  const passRate = scored > 0 ? passCount / scored : null;
  const totalPhotoCount = checklistItems.reduce((sum, item) => sum + (item.photoUrls?.length ?? 0), 0);

  // Auto-set to in_progress when inspection is first opened
  const startedRef = useRef(false);
  useEffect(() => {
    if (
      inspection &&
      inspection.status === "scheduled" &&
      !startedRef.current
    ) {
      startedRef.current = true;
      fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["inspections"] });
        queryClient.invalidateQueries({ queryKey: ["inspection", id] });
      }).catch(() => {
        startedRef.current = false;
      });
    }
  }, [inspection?.status]);

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
      const newStatus = (failCount > 0 || monitorCount > 0) ? "follow_up_required" : "completed";
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
    setEditSeverity(item.severity || null);
    setEditLocation(item.location || "");
    setEditTradeAllocated(item.tradeAllocated || "");
    setEditRecommendedAction(item.recommendedAction || item.recommendedActionDefault || "");
  };

  const closeModal = () => {
    setActiveItem(null);
    setEditNotes("");
    setEditResult("pending");
    setEditSeverity(null);
    setEditLocation("");
    setEditTradeAllocated("");
    setEditRecommendedAction("");
  };

  const ckKey = ["inspection-checklist", id, token];

  const quickPass = async (item: ChecklistItem) => {
    const next = item.result === "pass" ? "pending" : "pass";
    // Optimistic update — instant UI response
    queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
      (old ?? []).map(i => i.id === item.id ? { ...i, result: next } : i)
    );
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: next, notes: item.notes || null }),
      });
      refetchChecklist(); // silent background sync — no await
    } catch {
      // Revert on failure
      queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
        (old ?? []).map(i => i.id === item.id ? { ...i, result: item.result } : i)
      );
      Alert.alert("Error", "Failed to update. Please try again.");
    }
  };

  const quickPassAll = async (items: ChecklistItem[]) => {
    const allPassed = items.every(i => i.result === "pass");
    const next = allPassed ? "pending" : "pass";
    const prevResults = Object.fromEntries(items.map(i => [i.id, i.result]));
    // Optimistic update — all items at once
    queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
      (old ?? []).map(i => items.find(x => x.id === i.id) ? { ...i, result: next } : i)
    );
    try {
      await Promise.all(items.map(item =>
        fetchWithAuth(`/api/inspections/${id}/checklist/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: next, notes: item.notes || null }),
        })
      ));
      refetchChecklist(); // silent background sync
    } catch {
      // Revert on failure
      queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
        (old ?? []).map(i => prevResults[i.id] !== undefined ? { ...i, result: prevResults[i.id] } : i)
      );
      Alert.alert("Error", "Failed to update items. Please try again.");
    }
  };

  const quickNA = async (item: ChecklistItem) => {
    const next = item.result === "na" ? "pending" : "na";
    // Optimistic update
    queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
      (old ?? []).map(i => i.id === item.id ? { ...i, result: next } : i)
    );
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: next, notes: item.notes || null }),
      });
      refetchChecklist(); // silent background sync
    } catch {
      // Revert on failure
      queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
        (old ?? []).map(i => i.id === item.id ? { ...i, result: item.result } : i)
      );
      Alert.alert("Error", "Failed to update. Please try again.");
    }
  };

  const isCompleted = inspection?.status === "completed" || inspection?.status === "follow_up_required";

  const toggleMarkComplete = async () => {
    const newStatus = isCompleted ? "in_progress" : (failCount > 0 || monitorCount > 0 ? "follow_up_required" : "completed");
    try {
      await fetchWithAuth(`/api/inspections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === "in_progress" ? {} : { completedDate: new Date().toISOString().split("T")[0] }),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      queryClient.invalidateQueries({ queryKey: ["inspection", id] });
    } catch {
      Alert.alert("Error", "Could not update status. Try again.");
    }
  };

  const openAddItemModal = (category: string) => {
    setAddItemDesc("");
    setAddItemModal({ visible: true, category });
  };

  const submitManualItem = async () => {
    if (!addItemDesc.trim()) return;
    setAddingItem(true);
    try {
      await fetchWithAuth(`/api/inspections/${id}/manual-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: addItemModal.category, description: addItemDesc.trim() }),
      });
      await refetchChecklist();
      setAddItemModal({ visible: false, category: "" });
      setAddItemDesc("");
    } catch {
      Alert.alert("Error", "Failed to add item. Please try again.");
    } finally {
      setAddingItem(false);
    }
  };

  const saveItem = async () => {
    if (!activeItem) return;
    setSavingItem(true);
    const showDefectFields = editResult === "fail" || editResult === "monitor";
    const patch = {
      result: editResult,
      notes: editNotes || null,
      ...(showDefectFields ? {
        severity: editSeverity || null,
        location: editLocation || null,
        tradeAllocated: editTradeAllocated || null,
        recommendedAction: editRecommendedAction || null,
      } : {}),
    };
    // Optimistic update — close modal immediately after API call without waiting for refetch
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${activeItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
        (old ?? []).map(i => i.id === activeItem.id ? { ...i, ...patch } as ChecklistItem : i)
      );
      closeModal();
      refetchChecklist(); // silent background sync
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
    const snapshot = activeItem;
    const itemId = activeItem.id;
    const newPhotoUrls = (activeItem.photoUrls || []).filter(p => p !== photoPath);
    const newMarkups = { ...(activeItem.photoMarkups || {}) };
    delete newMarkups[photoPath];
    // Cancel any in-flight refetches that could overwrite our optimistic update
    await queryClient.cancelQueries({ queryKey: ckKey });
    // Optimistically update both the modal state and the React Query cache
    setActiveItem(prev => prev ? { ...prev, photoUrls: newPhotoUrls, photoMarkups: newMarkups } : null);
    queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
      (old ?? []).map(i => i.id === itemId ? { ...i, photoUrls: newPhotoUrls, photoMarkups: newMarkups } : i)
    );
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: newPhotoUrls, photoMarkups: newMarkups }),
      });
    } catch {
      // Revert both optimistic updates on failure
      setActiveItem(prev => prev ? { ...prev, photoUrls: snapshot.photoUrls, photoMarkups: snapshot.photoMarkups } : null);
      queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
        (old ?? []).map(i => i.id === itemId ? snapshot : i)
      );
      Alert.alert("Error", "Could not delete photo. Please try again.");
    }
  };

  const removePhotoFromItem = useCallback(async (itemId: number, photoPath: string) => {
    // Cancel any in-flight refetches first to prevent them overwriting our optimistic update
    await queryClient.cancelQueries({ queryKey: ckKey });
    // Read latest data from cache (more reliable than closure)
    const latest = queryClient.getQueryData<ChecklistItem[]>(ckKey) ?? checklistItems;
    const item = latest.find(i => i.id === itemId);
    if (!item) return;
    const newPhotoUrls = (item.photoUrls || []).filter(p => p !== photoPath);
    const newMarkups = { ...(item.photoMarkups || {}) };
    delete newMarkups[photoPath];
    queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
      (old ?? []).map(i => i.id === itemId ? { ...i, photoUrls: newPhotoUrls, photoMarkups: newMarkups } : i)
    );
    try {
      await fetchWithAuth(`/api/inspections/${id}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: newPhotoUrls, photoMarkups: newMarkups }),
      });
    } catch {
      queryClient.setQueryData<ChecklistItem[]>(ckKey, old =>
        (old ?? []).map(i => i.id === itemId ? item : i)
      );
      Alert.alert("Error", "Could not delete photo.");
    }
  }, [checklistItems, fetchWithAuth, id, queryClient, ckKey]);


  if ((loadingInspection && !inspection) || (loadingChecklist && checklistItems.length === 0)) {
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
      <View style={[styles.header, isEditMode && styles.headerEditMode]}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/inspections" as any)} style={styles.backBtn} hitSlop={12}>
          <Feather name="arrow-left" size={20} color={isEditMode ? Colors.secondary : Colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, isEditMode && { color: Colors.secondary }]} numberOfLines={1}>
            {isEditMode ? "Edit Inspection" : (inspection?.inspectionType?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Inspection")}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>{inspection?.projectName}</Text>
        </View>
        {isEditMode ? (
          <Pressable
            style={styles.doneEditingBtn}
            onPress={() => router.canGoBack() ? router.back() : router.replace(`/inspection/${id}` as any)}
          >
            <Text style={styles.doneEditingText}>Done</Text>
          </Pressable>
        ) : isCompleted ? (
          <Pressable
            style={styles.doneCompleteBtn}
            onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/inspections" as any)}
          >
            <Text style={styles.doneCompleteText}>Done</Text>
          </Pressable>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {/* Edit mode banner */}
      {isEditMode && (
        <View style={styles.editModeBanner}>
          <Feather name="edit-2" size={13} color={Colors.secondary} />
          <Text style={styles.editModeBannerText}>Edit mode — changes are saved automatically</Text>
        </View>
      )}

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
            Documents{projectDocuments.length > 0 ? ` (${projectDocuments.length})` : ""}
          </Text>
          {projectDocuments.length > 0 && activePage !== 1 && (
            <View style={styles.tabBadgeDot} />
          )}
        </Pressable>
        <Pressable style={[styles.tab, activePage === 2 && styles.tabActive]} onPress={() => scrollToPage(2)}>
          <Feather name="camera" size={13} color={activePage === 2 ? Colors.secondary : Colors.textTertiary} />
          <Text style={[styles.tabText, activePage === 2 && styles.tabTextActive]}>
            Photos{totalPhotoCount > 0 ? ` (${totalPhotoCount})` : ""}
          </Text>
          {totalPhotoCount > 0 && activePage !== 2 && (
            <View style={styles.tabBadgeDot} />
          )}
        </Pressable>
      </View>

      {/* Horizontal paged content */}
      <ScrollView
        ref={pageScrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
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
                {monitorCount > 0 && <Text style={[styles.resultChip, { color: "#f59e0b" }]}>◉ {monitorCount}</Text>}
                {naCount > 0 && <Text style={[styles.resultChip, { color: "#94a3b8" }]}>— {naCount}</Text>}
                {pendingCount > 0 && <Text style={[styles.resultChip, { color: Colors.textTertiary }]}>⏳ {pendingCount}</Text>}
              </View>
            </View>
          </View>

          {/* Checklist items */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + (progress === 1 ? 160 : 20) }]}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {total === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="clipboard" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>No checklist items</Text>
                <Text style={styles.emptySub}>Add items manually to build your checklist.</Text>
                <Pressable
                  onPress={() => openAddItemModal("General")}
                  style={({ pressed }) => [styles.emptyAddBtn, pressed && { opacity: 0.7 }]}
                >
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.emptyAddBtnText}>Add Item</Text>
                </Pressable>
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
                  <Pressable
                    onPress={() => openAddItemModal(category)}
                    style={({ pressed }) => [styles.addItemBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Feather name="plus" size={14} color={Colors.secondary} />
                    <Text style={styles.addItemBtnText}>Add item</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          {/* Bottom action bar — shown when 100% complete */}
          {progress === 1 && total > 0 && (
            <View style={[styles.generateBar, { paddingBottom: 12, bottom: tabBarHeight }]}>
              {/* Row 1: Mark Complete toggle */}
              <Pressable
                style={({ pressed }) => [
                  styles.markCompleteRow,
                  isCompleted && styles.markCompleteRowActive,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={toggleMarkComplete}
              >
                <Feather
                  name={isCompleted ? "check-circle" : "circle"}
                  size={17}
                  color={Colors.primary}
                />
                <Text style={[styles.markCompleteLabel, isCompleted && styles.markCompleteLabelActive]}>
                  {isCompleted ? "Inspection Marked Complete" : "Mark Complete"}
                </Text>
              </Pressable>

              {/* Row 2: Generate Report */}
              <Pressable
                style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
                onPress={async () => {
                  if (!isCompleted) await toggleMarkComplete();
                  const autoType = failCount > 0 ? "defect_notice" : "inspection_certificate";
                  router.push(`/inspection/generate-report?id=${id}&autoType=${autoType}` as any);
                }}
              >
                <Feather name="file-text" size={17} color={Colors.primary} />
                <Text style={styles.generateBtnText}>Generate Report</Text>
              </Pressable>
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

        {/* ── Page 2: Photos ── */}
        <View style={{ width: screenW, flex: 1 }}>
          <PhotosPanel
            items={checklistItems}
            baseUrl={baseUrl}
            insets={insets}
            inspectionName={inspection?.inspectionType?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Inspection"}
            onDeletePhoto={removePhotoFromItem}
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
            severity={editSeverity}
            location={editLocation}
            tradeAllocated={editTradeAllocated}
            recommendedAction={editRecommendedAction}
            baseUrl={baseUrl}
            documents={projectDocuments}
            internalStaff={internalStaff}
            contractors={contractors}
            onResultChange={setEditResult}
            onNotesChange={setEditNotes}
            onSeverityChange={setEditSeverity}
            onLocationChange={setEditLocation}
            onTradeAllocatedChange={setEditTradeAllocated}
            onRecommendedActionChange={setEditRecommendedAction}
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

      {/* Add Manual Item Modal */}
      <Modal
        visible={addItemModal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setAddItemModal({ visible: false, category: "" })}
      >
        <Pressable
          style={styles.addItemOverlay}
          onPress={() => setAddItemModal({ visible: false, category: "" })}
        />
        <View style={[styles.addItemSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.addItemSheetHandle} />
          <Text style={styles.addItemSheetTitle}>Add Inspection Item</Text>
          <Text style={styles.addItemSheetCategory}>{addItemModal.category}</Text>
          <TextInput
            style={styles.addItemInput}
            placeholder="Describe what needs to be inspected…"
            placeholderTextColor={Colors.textTertiary}
            value={addItemDesc}
            onChangeText={setAddItemDesc}
            multiline
            autoFocus
            returnKeyType="done"
            blurOnSubmit
          />
          <Pressable
            style={({ pressed }) => [
              styles.addItemSubmit,
              !addItemDesc.trim() && styles.addItemSubmitDisabled,
              pressed && { opacity: 0.8 },
            ]}
            onPress={submitManualItem}
            disabled={!addItemDesc.trim() || addingItem}
          >
            {addingItem
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.addItemSubmitText}>Add Item</Text>
            }
          </Pressable>
        </View>
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

  const renderRightActions = (_progress: any, dragX: any) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0.7], extrapolate: "clamp" });
    return (
      <Animated.View style={[styles.naAction, { transform: [{ scale }] }]}>
        <Feather name="minus-circle" size={18} color="#fff" />
        <Text style={styles.naActionText}>N/A</Text>
      </Animated.View>
    );
  };

  const renderLeftActions = (_progress: any, dragX: any) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0.7, 1], extrapolate: "clamp" });
    return (
      <Animated.View style={[styles.restoreAction, { transform: [{ scale }] }]}>
        <Feather name="rotate-ccw" size={18} color="#fff" />
        <Text style={styles.restoreActionText}>Restore</Text>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={isNA ? undefined : renderRightActions}
      renderLeftActions={isNA ? renderLeftActions : undefined}
      leftThreshold={80}
      rightThreshold={80}
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
          !isNA && item.result === "monitor" && styles.checkRowMonitor,
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
          ...(inspectionId ? { inspectionId } : {}),
          ...(activeItemId ? { itemId: String(activeItemId) } : {}),
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
          <Text style={panelStyles.emptyText}>No documents attached</Text>
          <Text style={panelStyles.emptySubText}>Upload documents to this project from the desktop to view them here.</Text>
        </View>
      ) : (
        <>
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

// ── AllPhotos interface ────────────────────────────────────────────────────
interface AllPhotoEntry {
  path: string;
  itemId: number;
  description: string;
  category: string;
  markup?: MarkupData;
}

function PhotosPanel({
  items,
  baseUrl,
  insets,
  inspectionName,
  onDeletePhoto,
}: {
  items: ChecklistItem[];
  baseUrl: string;
  insets: any;
  inspectionName: string;
  onDeletePhoto: (itemId: number, photoPath: string) => void;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const COLS = 3;
  const THUMB = Math.floor((screenW - 32 - (COLS - 1) * 4) / COLS);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const allPhotos: AllPhotoEntry[] = items.flatMap(item =>
    (item.photoUrls || []).map(path => ({
      path,
      itemId: item.id,
      description: item.description,
      category: item.category,
      markup: item.photoMarkups?.[path],
    }))
  );

  const itemsWithPhotos = items.filter(i => (i.photoUrls?.length ?? 0) > 0);

  if (lightboxIndex !== null && allPhotos.length > 0) {
    const photo = allPhotos[lightboxIndex];
    return (
      <View style={[galleryStyles.lightboxScreen, { paddingTop: insets.top }]}>
        <View style={galleryStyles.lightboxHeader}>
          <Pressable onPress={() => setLightboxIndex(null)} hitSlop={12} style={galleryStyles.lightboxBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, paddingHorizontal: 8 }}>
            <Text style={galleryStyles.lightboxTitle} numberOfLines={1}>{photo.description}</Text>
            <Text style={galleryStyles.lightboxSub}>{inspectionName} · {photo.category} · {lightboxIndex + 1} of {allPhotos.length}</Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert("Delete photo?", "Remove this photo from the checklist item?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete", style: "destructive",
                  onPress: () => {
                    onDeletePhoto(photo.itemId, photo.path);
                    if (allPhotos.length <= 1) {
                      setLightboxIndex(null);
                    } else {
                      setLightboxIndex(i => Math.min(i ?? 0, allPhotos.length - 2));
                    }
                  },
                },
              ])
            }
            hitSlop={12}
            style={galleryStyles.lightboxBtn}
          >
            <Feather name="trash-2" size={20} color={Colors.danger} />
          </Pressable>
        </View>

        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: screenW, height: screenH * 0.72 }}>
            <Image
              source={{ uri: `${baseUrl}/api/storage${photo.path}` }}
              style={{ width: screenW, height: screenH * 0.72 }}
              resizeMode="contain"
            />
            {photo.markup && photo.markup.strokes.length > 0 && (
              <Svg
                style={StyleSheet.absoluteFill}
                width={screenW}
                height={screenH * 0.72}
                viewBox={`0 0 ${photo.markup.w} ${photo.markup.h}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {photo.markup.strokes.map((stroke, si) => {
                  const d = stroke.points.map((p, pi) => `${pi === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                  return <Path key={si} d={d} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
                })}
              </Svg>
            )}
          </View>
        </View>

        <View style={[galleryStyles.lightboxNav, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={() => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))}
            disabled={lightboxIndex === 0}
            style={[lightboxStyles.navBtn, lightboxIndex === 0 && { opacity: 0.3 }]}
          >
            <Feather name="chevron-left" size={22} color="#fff" />
            <Text style={lightboxStyles.navBtnText}>Previous</Text>
          </Pressable>
          <Pressable
            onPress={() => setLightboxIndex(i => (i !== null && i < allPhotos.length - 1 ? i + 1 : i))}
            disabled={lightboxIndex === allPhotos.length - 1}
            style={[lightboxStyles.navBtn, lightboxIndex === allPhotos.length - 1 && { opacity: 0.3 }]}
          >
            <Text style={lightboxStyles.navBtnText}>Next</Text>
            <Feather name="chevron-right" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

  if (allPhotos.length === 0) {
    return (
      <View style={galleryStyles.empty}>
        <Feather name="camera" size={48} color={Colors.textTertiary} />
        <Text style={galleryStyles.emptyTitle}>No photos yet</Text>
        <Text style={galleryStyles.emptySub}>Open a checklist item and take a photo — it will appear here.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[galleryStyles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Inspection name banner */}
      <View style={galleryStyles.inspectionBanner}>
        <Feather name="clipboard" size={13} color={Colors.secondary} />
        <Text style={galleryStyles.inspectionBannerText}>{inspectionName}</Text>
        <Text style={galleryStyles.inspectionBannerCount}>{allPhotos.length} photo{allPhotos.length !== 1 ? "s" : ""}</Text>
      </View>

      {itemsWithPhotos.map(item => {
        const photos = item.photoUrls || [];
        const startIdx = allPhotos.findIndex(p => p.itemId === item.id && p.path === photos[0]);
        return (
          <View key={item.id} style={galleryStyles.group}>
            <View style={galleryStyles.groupHeader}>
              <Text style={galleryStyles.groupTitle} numberOfLines={2}>{item.description}</Text>
              <Text style={galleryStyles.groupMeta}>{item.category} · {photos.length} photo{photos.length !== 1 ? "s" : ""}</Text>
            </View>
            <View style={galleryStyles.grid}>
              {photos.map((path, localIdx) => {
                const globalIdx = startIdx + localIdx;
                const markup = item.photoMarkups?.[path];
                const hasMarkup = !!(markup && markup.strokes.length > 0);
                return (
                  <Pressable
                    key={path}
                    style={[galleryStyles.thumb, { width: THUMB, height: THUMB }]}
                    onPress={() => setLightboxIndex(globalIdx)}
                  >
                    <Image
                      source={{ uri: `${baseUrl}/api/storage${path}` }}
                      style={{ width: THUMB, height: THUMB }}
                      resizeMode="cover"
                    />
                    {hasMarkup && markup && (
                      <Svg
                        style={StyleSheet.absoluteFill}
                        width={THUMB}
                        height={THUMB}
                        viewBox={`0 0 ${markup.w} ${markup.h}`}
                        preserveAspectRatio="xMidYMid meet"
                      >
                        {markup.strokes.map((stroke, si) => {
                          const d = stroke.points.map((p, pi) => `${pi === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                          return <Path key={si} d={d} stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
                        })}
                      </Svg>
                    )}
                    <View style={galleryStyles.thumbExpand}>
                      <Feather name="maximize-2" size={11} color="#fff" />
                    </View>
                    {hasMarkup && (
                      <View style={galleryStyles.markupBadge}>
                        <Feather name="edit-2" size={8} color="#fff" />
                      </View>
                    )}
                    <Pressable
                      style={galleryStyles.thumbDelete}
                      hitSlop={4}
                      onPress={e => {
                        e.stopPropagation?.();
                        Alert.alert(
                          "Delete photo?",
                          "Remove this photo from the checklist item?",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => onDeletePhoto(item.id, path) },
                          ]
                        );
                      }}
                    >
                      <Feather name="trash-2" size={11} color="#fff" />
                    </Pressable>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function ItemModal({
  item, result, notes, severity, location, tradeAllocated, recommendedAction,
  baseUrl, documents, internalStaff, contractors, onResultChange, onNotesChange, onSeverityChange, onLocationChange,
  onTradeAllocatedChange, onRecommendedActionChange, onSave, onClose,
  onUploadPhoto, onTakePhoto, onRemovePhoto, onAnnotateDoc, saving, uploadingPhoto, insets,
  inspectionId,
}: {
  item: ChecklistItem; result: ResultKey; notes: string; baseUrl: string;
  severity: string | null; location: string; tradeAllocated: string; recommendedAction: string;
  documents: ProjectDocument[];
  internalStaff: { id: number; name: string; role: string }[];
  contractors: { id: number; name: string; trade: string; email: string | null }[];
  onResultChange: (r: ResultKey) => void; onNotesChange: (n: string) => void;
  onSeverityChange: (s: string | null) => void; onLocationChange: (l: string) => void;
  onTradeAllocatedChange: (t: string) => void; onRecommendedActionChange: (r: string) => void;
  onSave: () => void; onClose: () => void; onUploadPhoto: () => void;
  onTakePhoto: () => void; onRemovePhoto: (p: string) => void;
  onAnnotateDoc: (doc: ProjectDocument) => void;
  saving: boolean; uploadingPhoto: boolean; insets: any;
  inspectionId?: string;
}) {
  const selectedOpt = RESULT_OPTS.find(r => r.key === result);
  const suggestions = getSuggestionsForItem(item.category, item.description);
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [tradePickerOpen, setTradePickerOpen] = useState(false);
  const [pendingTrades, setPendingTrades] = useState<string[]>(() =>
    tradeAllocated ? tradeAllocated.split(",").map(s => s.trim()).filter(Boolean) : []
  );
  useEffect(() => {
    setPendingTrades(tradeAllocated ? tradeAllocated.split(",").map(s => s.trim()).filter(Boolean) : []);
  }, [tradeAllocated]);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const photoUrls: string[] = item.photoUrls ?? [];

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const goPrev = () => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i));
  const goNext = () => setLightboxIndex(i => (i !== null && i < photoUrls.length - 1 ? i + 1 : i));

  const applySuggestion = (text: string) => {
    if (!notes.trim()) {
      onNotesChange(text);
    } else {
      onNotesChange(notes.trimEnd() + "\n" + text);
    }
  };

  if (lightboxIndex !== null && photoUrls.length > 0) {
    const photoPath = photoUrls[lightboxIndex];
    const markup = item.photoMarkups?.[photoPath];
    return (
      <View style={[modalStyles.container, { paddingTop: insets.top, backgroundColor: "#000" }]}>
        <View style={[modalStyles.header, { backgroundColor: "#111", borderBottomColor: "#222" }]}>
          <Pressable onPress={closeLightbox} hitSlop={12} style={modalStyles.closeBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={[modalStyles.headerTitle, { color: "#fff" }]}>
            Photo {lightboxIndex + 1} of {photoUrls.length}
          </Text>
          <Pressable
            onPress={() => { onRemovePhoto(photoPath); closeLightbox(); }}
            hitSlop={12}
            style={[modalStyles.closeBtn, { marginLeft: 0 }]}
          >
            <Feather name="trash-2" size={20} color={Colors.danger} />
          </Pressable>
        </View>

        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: screenW, height: screenH * 0.72 }}>
            <Image
              source={{ uri: `${baseUrl}/api/storage${photoPath}` }}
              style={{ width: screenW, height: screenH * 0.72 }}
              resizeMode="contain"
            />
            {markup && markup.strokes.length > 0 && (
              <Svg
                style={StyleSheet.absoluteFill}
                width={screenW}
                height={screenH * 0.72}
                viewBox={`0 0 ${markup.w} ${markup.h}`}
                preserveAspectRatio="xMidYMid meet"
              >
                {markup.strokes.map((stroke, si) => {
                  const d = stroke.points.map((p, pi) => `${pi === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                  return (
                    <Path key={si} d={d} stroke={stroke.color} strokeWidth={stroke.width}
                      strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  );
                })}
              </Svg>
            )}
          </View>
        </View>

        <View style={[{ flexDirection: "row", paddingHorizontal: 24, paddingBottom: insets.bottom + 16, paddingTop: 12, gap: 12, backgroundColor: "#111" }]}>
          <Pressable
            onPress={goPrev}
            disabled={lightboxIndex === 0}
            style={[lightboxStyles.navBtn, lightboxIndex === 0 && { opacity: 0.3 }]}
          >
            <Feather name="chevron-left" size={22} color="#fff" />
            <Text style={lightboxStyles.navBtnText}>Previous</Text>
          </Pressable>
          <Pressable
            onPress={goNext}
            disabled={lightboxIndex === photoUrls.length - 1}
            style={[lightboxStyles.navBtn, lightboxIndex === photoUrls.length - 1 && { opacity: 0.3 }]}
          >
            <Text style={lightboxStyles.navBtnText}>Next</Text>
            <Feather name="chevron-right" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    );
  }

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

        {/* Defect Detail Fields — visible when result is Fail or Monitor */}
        {(result === "fail" || result === "monitor") && (
          <View style={modalStyles.defectCard}>
            <Text style={modalStyles.defectCardTitle}>
              {result === "fail" ? "Defect Details" : "Monitor Details"}
            </Text>

            {/* Severity */}
            <Text style={modalStyles.sectionLabel}>Severity</Text>
            <View style={modalStyles.chipRow}>
              {SEVERITY_OPTS.map(s => {
                const colours: Record<string, { bg: string; color: string }> = {
                  critical: { bg: "#fef2f2", color: "#dc2626" },
                  major: { bg: "#fff7ed", color: "#ea580c" },
                  minor: { bg: "#fefce8", color: "#ca8a04" },
                  cosmetic: { bg: "#f0fdf4", color: "#16a34a" },
                };
                const c = colours[s] ?? { bg: "#f1f5f9", color: "#64748b" };
                return (
                  <Pressable
                    key={s}
                    style={[modalStyles.severityChip, severity === s && { backgroundColor: c.bg, borderColor: c.color }]}
                    onPress={() => onSeverityChange(severity === s ? null : s)}
                  >
                    <Text style={[modalStyles.severityChipText, severity === s && { color: c.color, fontWeight: "600" }]}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Location */}
            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>Location / Area</Text>
            <TextInput
              style={modalStyles.defectInput}
              value={location}
              onChangeText={onLocationChange}
              placeholder="e.g. Bedroom 2, North wall"
              placeholderTextColor={Colors.textTertiary}
            />

            {/* Trade Allocated */}
            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>Trade Allocated</Text>
            {(contractors.length > 0 || internalStaff.length > 0) ? (
              <>
                {/* Dropdown trigger */}
                <Pressable
                  onPress={() => { setPendingTrades(tradeAllocated ? tradeAllocated.split(",").map(s => s.trim()).filter(Boolean) : []); setTradePickerOpen(true); }}
                  style={({ pressed }) => ({
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    borderWidth: 1, borderColor: Colors.border, borderRadius: 8,
                    paddingHorizontal: 12, paddingVertical: 10,
                    backgroundColor: pressed ? Colors.backgroundSecondary : Colors.background,
                  })}
                >
                  <Text style={{ fontSize: 14, color: tradeAllocated ? Colors.text : Colors.textTertiary, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {tradeAllocated
                      ? tradeAllocated.split(",").map(s => s.trim()).filter(Boolean).join(", ")
                      : "Select trade(s)…"}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.textSecondary }}>▼</Text>
                </Pressable>
                {/* Show selected count badge if multiple */}
                {tradeAllocated && tradeAllocated.split(",").filter(s => s.trim()).length > 1 && (
                  <Text style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>
                    {tradeAllocated.split(",").filter(s => s.trim()).length} trades assigned
                  </Text>
                )}

                {/* Trade picker modal */}
                <Modal visible={tradePickerOpen} animationType="slide" transparent presentationStyle="overFullScreen">
                  <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
                    <View style={{ backgroundColor: Colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: screenH * 0.72 }}>
                      {/* Header */}
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.text }}>Select Trades</Text>
                        <Pressable onPress={() => setTradePickerOpen(false)} style={{ padding: 4 }}>
                          <Text style={{ fontSize: 18, color: Colors.textSecondary }}>✕</Text>
                        </Pressable>
                      </View>

                      {/* List */}
                      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
                        {contractors.length > 0 && (
                          <>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
                              Project Contractors
                            </Text>
                            {contractors.map(c => {
                              const selected = pendingTrades.includes(c.name);
                              return (
                                <Pressable
                                  key={c.id}
                                  onPress={() => setPendingTrades(prev => selected ? prev.filter(n => n !== c.name) : [...prev, c.name])}
                                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 13, backgroundColor: pressed ? Colors.backgroundSecondary : "transparent" })}
                                >
                                  <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: selected ? "#1d4ed8" : Colors.border, backgroundColor: selected ? "#1d4ed8" : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                                    {selected && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}>{c.name}</Text>
                                    {c.trade ? <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 1 }}>{c.trade}</Text> : null}
                                  </View>
                                </Pressable>
                              );
                            })}
                          </>
                        )}
                        {internalStaff.length > 0 && (
                          <>
                            <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.6, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6 }}>
                              Internal Staff
                            </Text>
                            {internalStaff.map(s => {
                              const selected = pendingTrades.includes(s.name);
                              return (
                                <Pressable
                                  key={s.id}
                                  onPress={() => setPendingTrades(prev => selected ? prev.filter(n => n !== s.name) : [...prev, s.name])}
                                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingVertical: 13, backgroundColor: pressed ? Colors.backgroundSecondary : "transparent" })}
                                >
                                  <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: selected ? "#d97706" : Colors.border, backgroundColor: selected ? "#d97706" : "transparent", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                                    {selected && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.text }}>{s.name}</Text>
                                    {s.role ? <Text style={{ fontSize: 12, color: Colors.textSecondary, marginTop: 1 }}>{s.role}</Text> : null}
                                  </View>
                                </Pressable>
                              );
                            })}
                          </>
                        )}
                      </ScrollView>

                      {/* Footer actions */}
                      <View style={{ flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: Colors.border }}>
                        <Pressable
                          onPress={() => { onTradeAllocatedChange(""); setTradePickerOpen(false); }}
                          style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: "center" }}
                        >
                          <Text style={{ fontSize: 14, color: Colors.textSecondary, fontWeight: "600" }}>Clear</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => { onTradeAllocatedChange(pendingTrades.join(", ")); setTradePickerOpen(false); }}
                          style={{ flex: 2, paddingVertical: 12, borderRadius: 8, backgroundColor: Colors.primary, alignItems: "center" }}
                        >
                          <Text style={{ fontSize: 14, color: "#fff", fontWeight: "700" }}>
                            {pendingTrades.length > 0 ? `Confirm (${pendingTrades.length} selected)` : "Confirm"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Modal>
              </>
            ) : (
              <TextInput
                style={modalStyles.defectInput}
                value={tradeAllocated}
                onChangeText={onTradeAllocatedChange}
                placeholder="e.g. Plumber, Electrician, Builder"
                placeholderTextColor={Colors.textTertiary}
              />
            )}

            {/* Recommended Action */}
            <Text style={[modalStyles.sectionLabel, { marginTop: 12 }]}>Recommended Action</Text>
            <TextInput
              style={[modalStyles.defectInput, { minHeight: 60 }]}
              value={recommendedAction}
              onChangeText={onRecommendedActionChange}
              placeholder="Describe the corrective action required…"
              placeholderTextColor={Colors.textTertiary}
              multiline
            />
          </View>
        )}

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
          <Text style={modalStyles.sectionLabel}>
            Photos ({photoUrls.length}){photoUrls.length > 0 ? " — tap to view" : ""}
          </Text>

          {photoUrls.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modalStyles.photoRow}>
              {photoUrls.map((photoPath, idx) => {
                const markup: MarkupData | undefined = item.photoMarkups?.[photoPath];
                const hasMarkup = markup && markup.strokes.length > 0;
                return (
                  <Pressable key={idx} style={modalStyles.photoThumb} onPress={() => openLightbox(idx)}>
                    <Image
                      source={{ uri: `${baseUrl}/api/storage${photoPath}` }}
                      style={modalStyles.thumbImage}
                      resizeMode="cover"
                    />
                    {hasMarkup && markup && (
                      <Svg
                        style={StyleSheet.absoluteFill}
                        width={88}
                        height={88}
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
                    <View style={modalStyles.thumbOverlay}>
                      <Feather name="maximize-2" size={14} color="#fff" />
                    </View>
                    {hasMarkup && (
                      <View style={modalStyles.markupBadge}>
                        <Feather name="edit-2" size={8} color="#fff" />
                      </View>
                    )}
                    <Pressable
                      style={modalStyles.removePhoto}
                      onPress={e => { e.stopPropagation?.(); onRemovePhoto(photoPath); }}
                      hitSlop={4}
                    >
                      <Feather name="x" size={12} color="#fff" />
                    </Pressable>
                  </Pressable>
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
                                documentId: String(doc.id),
                                ...(inspectionId ? { inspectionId } : {}),
                                ...(item?.id ? { itemId: String(item.id) } : {}),
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
  headerEditMode: {
    borderBottomColor: Colors.secondary,
    borderBottomWidth: 2,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  headerSub: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, marginTop: 1 },
  doneEditingBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: Colors.secondary,
    borderRadius: 8,
  },
  doneEditingText: { fontSize: 13, fontFamily: "PlusJakartaSans_700Bold", color: Colors.surface },
  doneCompleteBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  doneCompleteText: { fontSize: 13, fontFamily: "PlusJakartaSans_700Bold", color: Colors.primary },
  editModeBanner: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.secondary + "33",
  },
  editModeBannerText: { fontSize: 12, fontFamily: "PlusJakartaSans_500Medium", color: Colors.secondary, flex: 1 },
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
  tabText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
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
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 16 },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptySub: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center" },
  emptyAddBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.secondary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  emptyAddBtnText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
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
  checkRowMonitor: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  checkRowNA: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0", opacity: 0.6 },
  checkDescNA: { textDecorationLine: "line-through", color: Colors.textTertiary },
  naAction: {
    backgroundColor: "#94a3b8",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 10,
    marginLeft: 4,
    flexDirection: "row",
    gap: 5,
    marginBottom: 8,
  },
  naActionText: { color: "#fff", fontSize: 13, fontFamily: "PlusJakartaSans_700Bold" },
  restoreAction: {
    backgroundColor: "#16a34a",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 10,
    marginRight: 4,
    flexDirection: "row",
    gap: 5,
    marginBottom: 8,
  },
  restoreActionText: { color: "#fff", fontSize: 13, fontFamily: "PlusJakartaSans_700Bold" },
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
  markCompleteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 8,
    backgroundColor: Colors.accent,
  },
  markCompleteRowActive: {
    backgroundColor: Colors.accent,
  },
  markCompleteLabel: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  markCompleteLabelActive: {
    color: Colors.primary,
  },
  generateBtn: {
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

  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.secondary,
    backgroundColor: "#EEF3FB",
  },
  addItemBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  addItemOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  addItemSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 12,
  },
  addItemSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  addItemSheetTitle: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.primary,
    marginBottom: 4,
  },
  addItemSheetCategory: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: Colors.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  addItemInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text,
    minHeight: 90,
    textAlignVertical: "top",
    backgroundColor: Colors.surface,
    marginBottom: 16,
  },
  addItemSubmit: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  addItemSubmitDisabled: {
    opacity: 0.4,
  },
  addItemSubmitText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#fff",
  },
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
  defectCard: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 4,
  },
  defectCardTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
    color: "#92400e",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  severityChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  severityChipText: { fontSize: 13, fontFamily: "PlusJakartaSans_500Medium", color: Colors.textSecondary },
  defectInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text,
    marginTop: 4,
  },
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
  photoThumb: { width: 88, height: 88, borderRadius: 8, overflow: "visible", position: "relative" },
  thumbImage: { width: 88, height: 88, borderRadius: 8 },
  thumbOverlay: {
    position: "absolute", bottom: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 4,
    width: 22, height: 22, alignItems: "center", justifyContent: "center",
  },
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

const lightboxStyles = StyleSheet.create({
  navBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#2a2a2a",
  },
  navBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});

const galleryStyles = StyleSheet.create({
  lightboxScreen: { flex: 1, backgroundColor: "#000" },
  lightboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  lightboxBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  lightboxTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
  lightboxSub: { fontSize: 11, fontFamily: "PlusJakartaSans_400Regular", color: "#aaa", marginTop: 1 },
  lightboxNav: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 12,
    backgroundColor: "#111",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyTitle: { fontSize: 17, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  emptySub: { fontSize: 13, fontFamily: "PlusJakartaSans_400Regular", color: Colors.textSecondary, textAlign: "center" },
  scrollContent: { padding: 16, gap: 24 },
  inspectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.infoLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inspectionBannerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  inspectionBannerCount: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
  },
  group: { gap: 10 },
  groupHeader: { gap: 2 },
  groupTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  groupMeta: { fontSize: 12, fontFamily: "PlusJakartaSans_400Regular", color: Colors.textSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  thumb: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: Colors.borderLight,
  },
  thumbExpand: {
    position: "absolute",
    bottom: 5,
    right: 5,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    padding: 3,
  },
  markupBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: Colors.secondary,
    borderRadius: 4,
    padding: 3,
  },
  thumbDelete: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 4,
    padding: 4,
  },
});

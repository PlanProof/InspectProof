import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  useWindowDimensions, Image, ScrollView, Linking,
} from "react-native";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { getCachedInspectionData, patchCachedChecklistItem } from "@/utils/offlineQueue";
import { Colors } from "@/constants/colors";
import { pointsToPath, scaleStrokes, type Stroke, type MarkupData } from "@/utils/markup-utils";

const PHOTO_QUEUE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Compress a photo URI if its file size exceeds the queue size limit.
 * Returns the original URI if already small enough or if compression fails.
 */
async function maybeCompressPhoto(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || !("size" in info) || (info.size ?? 0) <= PHOTO_QUEUE_SIZE_LIMIT_BYTES) {
      return uri;
    }
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1920 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

type Phase = "preview" | "markup";
type UploadState = "uploading" | "saved" | "queued_offline" | "error";

const PEN_COLORS = [
  { value: "#EF4444", label: "Red" },
  { value: "#F59E0B", label: "Yellow" },
  { value: "#22C55E", label: "Green" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#000000", label: "Black" },
  { value: "#FFFFFF", label: "White" },
];
const PEN_WIDTHS = [2, 4, 7];

export default function PhotoMarkupScreen() {
  const { photoUri: initialPhotoUri, inspectionId, itemId, objectPath: existingObjectPath, reopenItemId } = useLocalSearchParams<{
    photoUri: string;
    inspectionId: string;
    itemId: string;
    objectPath?: string;
    reopenItemId?: string;
  }>();

  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { isOnline, addToQueue } = useOfflineSync();
  const queryClient = useQueryClient();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>("preview");
  const [currentPhotoUri, setCurrentPhotoUri] = useState(initialPhotoUri);
  const [uploadState, setUploadState] = useState<UploadState>(existingObjectPath ? "saved" : "uploading");
  const [savedObjectPath, setSavedObjectPath] = useState<string | null>(existingObjectPath ?? null);

  // Markup state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState("#EF4444");
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [savingMarkup, setSavingMarkup] = useState(false);

  // Refs for stable access from gesture callbacks (which close over initial values)
  const selectedColorRef = useRef(selectedColor);
  const selectedWidthRef = useRef(selectedWidth);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { selectedWidthRef.current = selectedWidth; }, [selectedWidth]);

  // In-flight points and commit guard stored as refs (JS thread, old-arch safe)
  const inFlightRef = useRef<{ x: number; y: number }[]>([]);
  const didCommitRef = useRef(false);

  // ── Sync state when navigation params change ──────────────────────────────
  // useState() only initialises on first mount. When Expo Router reuses the
  // screen (e.g. user takes a second photo), params update but state stays
  // stale. This effect resets everything to match the new params.
  const prevPhotoUriRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Skip the very first mount (useState already handled it).
    if (prevPhotoUriRef.current === undefined) {
      prevPhotoUriRef.current = initialPhotoUri;
      return;
    }
    if (prevPhotoUriRef.current === initialPhotoUri) return;
    prevPhotoUriRef.current = initialPhotoUri;

    // Reset all per-photo state for the new photo.
    setCurrentPhotoUri(initialPhotoUri);
    setPhase("preview");
    setStrokes([]);
    setLiveStroke([]);
    inFlightRef.current = [];
    didCommitRef.current = false;
    setSavedObjectPath(existingObjectPath ?? null);
    setUploadState(existingObjectPath ? "saved" : "uploading");
  }, [initialPhotoUri, existingObjectPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  const drawAreaH = screenH - insets.top - insets.bottom - 56 - 134;
  const drawAreaW = screenW;

  const fetchWithAuth = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(`${baseUrl}${url}`, {
      ...opts,
      headers: {
        ...(opts?.headers ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [baseUrl, token]);

  const goToInspection = useCallback(() => {
    if (inspectionId) {
      router.navigate({
        pathname: "/inspection/conduct/[id]" as any,
        params: {
          id: inspectionId,
          ...(reopenItemId ? { reopenItemId } : {}),
        },
      });
    } else {
      router.back();
    }
  }, [inspectionId, reopenItemId]);

  // ── Auto-upload on mount ──────────────────────────────────────────────────

  const uploadPhoto = useCallback(async (photoUri: string): Promise<string> => {
    const blob = await (await fetch(photoUri)).blob();
    const uploadRes = await fetch(`${baseUrl}/api/storage/uploads/file`, {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "X-File-Content-Type": "image/jpeg",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: blob,
    });
    if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
    const { objectPath } = await uploadRes.json();
    return objectPath as string;
  }, [baseUrl, token]);

  const appendPhotoToChecklist = useCallback(async (objectPath: string) => {
    const currentItems = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
    const item = Array.isArray(currentItems)
      ? currentItems.find((i: any) => i.id === parseInt(itemId))
      : null;
    const existingUrls: string[] = item?.photoUrls ?? [];
    if (existingUrls.includes(objectPath)) {
      queryClient.invalidateQueries({ queryKey: ["inspection-checklist", inspectionId] });
      return;
    }
    await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrls: [...existingUrls, objectPath] }),
    });
    queryClient.invalidateQueries({ queryKey: ["inspection-checklist", inspectionId] });
  }, [fetchWithAuth, inspectionId, itemId, queryClient]);

  // Load existing strokes when editing an already-saved photo.
  // Strokes are scaled from saved canvas dimensions to current drawAreaW/drawAreaH
  // so they remain precisely aligned regardless of device size or orientation.
  useEffect(() => {
    if (!existingObjectPath) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
        if (cancelled) return;
        const it = Array.isArray(items) ? items.find((i: any) => i.id === parseInt(itemId)) : null;
        const existing: MarkupData | undefined = it?.photoMarkups?.[existingObjectPath];
        if (existing && existing.strokes?.length > 0 && !cancelled) {
          const savedW = existing.w || drawAreaW;
          const savedH = existing.h || drawAreaH;
          setStrokes(scaleStrokes(existing.strokes, savedW, savedH, drawAreaW, drawAreaH));
        }
      } catch { /* silent — user can still draw fresh markup */ }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (existingObjectPath) return; // already uploaded — skip
    if (!currentPhotoUri) return;
    let cancelled = false;
    setUploadState("uploading");
    setSavedObjectPath(null);

    (async () => {
      let uploadedPath: string | null = null;
      try {
        if (!isOnline) {
          // Offline: compress large photos before queuing, then queue for later upload
          const cached = await getCachedInspectionData(parseInt(inspectionId));
          const cachedItem = cached?.checklistItems?.find(i => i.id === parseInt(itemId));
          const existingUrls: string[] = (cachedItem?.photoUrls as string[]) ?? [];
          const compressedUri = await maybeCompressPhoto(currentPhotoUri);
          const localPlaceholder = compressedUri;
          await addToQueue({
            type: "photo_upload",
            inspectionId: parseInt(inspectionId),
            payload: {
              inspectionId: parseInt(inspectionId),
              resultId: parseInt(itemId),
              photoDataUri: localPlaceholder,
              existingPhotoUrls: existingUrls,
            },
          });
          // Patch local cache + query cache to reflect the photo immediately
          const updatedUrls = [...existingUrls, localPlaceholder];
          patchCachedChecklistItem(parseInt(inspectionId), parseInt(itemId), {
            photoUrls: updatedUrls,
          }).catch(() => {});
          queryClient.setQueryData<{ id: number; photoUrls?: string[] }[]>(
            ["inspection-checklist", inspectionId, token],
            (old) =>
              (old ?? []).map((i) =>
                i.id === parseInt(itemId)
                  ? { ...i, photoUrls: updatedUrls }
                  : i
              )
          );
          if (!cancelled) {
            setSavedObjectPath(localPlaceholder);
            setUploadState("queued_offline");
          }
          return;
        }
        const objectPath = await uploadPhoto(currentPhotoUri);
        if (cancelled) return;
        uploadedPath = objectPath;
        await appendPhotoToChecklist(objectPath);
        if (cancelled) return;
        setSavedObjectPath(objectPath);
        setUploadState("saved");
      } catch (err) {
        if (cancelled) return;
        console.error("[photo-markup] auto-upload error:", err);
        setUploadState("error");
        // If upload succeeded but DB attachment failed, clean up the orphaned object
        if (uploadedPath) {
          try {
            await fetch(`${baseUrl}/api/storage${uploadedPath}`, {
              method: "DELETE",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
          } catch { /* best-effort cleanup */ }
        }
      }
    })();

    return () => { cancelled = true; };
  }, [currentPhotoUri]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryUpload = useCallback(async () => {
    if (!currentPhotoUri || uploadState !== "error") return;
    setUploadState("uploading");
    setSavedObjectPath(null);
    let uploadedPath: string | null = null;
    try {
      const objectPath = await uploadPhoto(currentPhotoUri);
      uploadedPath = objectPath;
      await appendPhotoToChecklist(objectPath);
      setSavedObjectPath(objectPath);
      setUploadState("saved");
    } catch (err) {
      console.error("[photo-markup] retry upload error:", err);
      setUploadState("error");
      if (uploadedPath) {
        try {
          await fetch(`${baseUrl}/api/storage${uploadedPath}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        } catch { /* best-effort cleanup */ }
      }
    }
  }, [currentPhotoUri, uploadState, uploadPhoto, appendPhotoToChecklist, baseUrl, token]);

  // ── Delete ────────────────────────────────────────────────────────────────

  const deletePhoto = () => {
    Alert.alert(
      "Delete Photo",
      "Remove this photo from the inspection?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            if (!savedObjectPath) { goToInspection(); return; }
            try {
              const currentItems = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
              const item = Array.isArray(currentItems)
                ? currentItems.find((i: any) => i.id === parseInt(itemId))
                : null;
              const newUrls = (item?.photoUrls ?? []).filter((u: string) => u !== savedObjectPath);
              const newMarkups = { ...(item?.photoMarkups ?? {}) };
              delete newMarkups[savedObjectPath];
              await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ photoUrls: newUrls, photoMarkups: newMarkups }),
              });
              queryClient.invalidateQueries({ queryKey: ["inspection-checklist", inspectionId] });
              goToInspection();
            } catch {
              Alert.alert("Error", "Could not delete photo. Please try again.");
            }
          },
        },
      ]
    );
  };

  // ── Take another ──────────────────────────────────────────────────────────

  const takeAnother = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Camera Access Required",
        "Allow camera access to take photos for this inspection item.",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setPhase("preview");
    setStrokes([]);
    setLiveStroke([]);
    setCurrentPhotoUri(picked.assets[0].uri);
  };

  // ── Markup canvas (GestureDetector) ──────────────────────────────────────

  // Commit helper — called from both onEnd and onFinalize with a guard so it
  // only fires once per stroke regardless of termination path.
  const commitStroke = useCallback(() => {
    if (didCommitRef.current) return;
    didCommitRef.current = true;
    const pts = inFlightRef.current;
    inFlightRef.current = [];
    if (pts.length >= 1) {
      setStrokes(prev => [...prev, {
        points: pts,
        color: selectedColorRef.current,
        width: selectedWidthRef.current,
      }]);
    }
    setLiveStroke([]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Gesture is created ONCE (useMemo with empty deps) so it never gets
  // recreated on re-renders caused by setLiveStroke — recreation cancels
  // any active gesture and causes strokes to vanish on lift.
  // runOnJS(true) forces callbacks onto the JS thread (safe on old arch,
  // and lets us call setState / refs directly without worklet boilerplate).
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => {
        didCommitRef.current = false;
        inFlightRef.current = [{ x: e.x, y: e.y }];
        setLiveStroke([{ x: e.x, y: e.y }]);
      })
      .onUpdate((e) => {
        const updated = [...inFlightRef.current, { x: e.x, y: e.y }];
        inFlightRef.current = updated;
        setLiveStroke([...updated]);
      })
      .onEnd(() => {
        commitStroke();
      })
      .onFinalize(() => {
        // Covers OS responder steal (stylus hover-exit, system interruption).
        // Guard inside commitStroke prevents double-commit if onEnd already ran.
        commitStroke();
      }),
  [commitStroke]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMarkup = async () => {
    if (!savedObjectPath) return;
    setSavingMarkup(true);
    try {
      const currentItems = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
      const item = Array.isArray(currentItems)
        ? currentItems.find((i: any) => i.id === parseInt(itemId))
        : null;
      const existingMarkups: Record<string, MarkupData> = item?.photoMarkups ?? {};
      const markupData: MarkupData = { w: drawAreaW, h: drawAreaH, strokes };
      await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoMarkups: { ...existingMarkups, [savedObjectPath]: markupData } }),
      });
      queryClient.invalidateQueries({ queryKey: ["inspection-checklist", inspectionId] });
      setPhase("preview");
    } catch {
      Alert.alert("Error", "Could not save markup. Please try again.");
    } finally {
      setSavingMarkup(false);
    }
  };

  // ── Render: markup phase ──────────────────────────────────────────────────

  if (phase === "markup") {
    return (
      <GestureHandlerRootView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setPhase("preview")} hitSlop={12} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Add Markup</Text>
          <Pressable
            onPress={saveMarkup}
            disabled={savingMarkup}
            style={[styles.saveBtn, savingMarkup && { opacity: 0.6 }]}
          >
            {savingMarkup
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Save</Text>}
          </Pressable>
        </View>

        <GestureDetector gesture={panGesture}>
          <View
            collapsable={false}
            style={[styles.canvas, { width: drawAreaW, height: drawAreaH }]}
          >
            {/* Image layer — no pointer events */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Image
              source={{
                uri: currentPhotoUri,
                ...(currentPhotoUri && !currentPhotoUri.startsWith("file://") && token
                  ? { headers: { Authorization: `Bearer ${token}` } }
                  : {}),
              }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
            </View>

            {/* SVG stroke layer — no pointer events so gesture passes through */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width={drawAreaW} height={drawAreaH}>
                {strokes.map((stroke, i) => (
                  <Path key={i} d={pointsToPath(stroke.points)} stroke={stroke.color}
                    strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                ))}
                {liveStroke.length >= 1 && (
                  <Path d={pointsToPath(liveStroke)} stroke={selectedColor}
                    strokeWidth={selectedWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
                )}
              </Svg>
            </View>

            {strokes.length === 0 && liveStroke.length === 0 && (
              <View style={styles.hintBox} pointerEvents="none">
                <Feather name="edit-2" size={20} color="rgba(255,255,255,0.6)" />
                <Text style={styles.hintText}>Draw to annotate</Text>
              </View>
            )}
          </View>
        </GestureDetector>

        <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
            {PEN_COLORS.map(c => (
              <Pressable key={c.value} onPress={() => setSelectedColor(c.value)}
                style={[styles.colorDot, { backgroundColor: c.value }, selectedColor === c.value && styles.colorDotActive]} />
            ))}
            <View style={styles.divider} />
            {PEN_WIDTHS.map(w => (
              <Pressable key={w} onPress={() => setSelectedWidth(w)}
                style={[styles.widthBtn, selectedWidth === w && styles.widthBtnActive]}>
                <View style={[styles.widthLine, { height: w, backgroundColor: selectedColor }]} />
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.actionRow}>
            <Pressable onPress={() => setStrokes(prev => prev.slice(0, -1))}
              disabled={strokes.length === 0} style={[styles.toolBtn, strokes.length === 0 && { opacity: 0.35 }]}>
              <Feather name="corner-up-left" size={18} color={Colors.text} />
              <Text style={styles.toolBtnText}>Undo</Text>
            </Pressable>
            <Pressable onPress={() => { setStrokes([]); setLiveStroke([]); }}
              disabled={strokes.length === 0} style={[styles.toolBtn, strokes.length === 0 && { opacity: 0.35 }]}>
              <Feather name="trash-2" size={18} color={Colors.danger} />
              <Text style={[styles.toolBtnText, { color: Colors.danger }]}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    );
  }

  // ── Render: preview phase ─────────────────────────────────────────────────

  const isSaved = uploadState === "saved" || uploadState === "queued_offline";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={goToInspection} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          {uploadState === "uploading" && (
            <View style={styles.uploadingPill}>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.uploadingText}>Uploading…</Text>
            </View>
          )}
          {uploadState === "saved" && (
            <View style={styles.savedPill}>
              <Feather name="check" size={13} color="#fff" />
              <Text style={styles.savedText}>Saved</Text>
            </View>
          )}
          {uploadState === "queued_offline" && (
            <View style={styles.queuedPill}>
              <Feather name="wifi-off" size={13} color="#fff" />
              <Text style={styles.queuedText}>Queued — uploads when online</Text>
            </View>
          )}
          {uploadState === "error" && (
            <Pressable onPress={retryUpload} style={styles.errorPill} hitSlop={8}>
              <Feather name="alert-circle" size={13} color="#fff" />
              <Text style={styles.errorPillText}>Save failed · Retry</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={deletePhoto}
          hitSlop={12}
          style={[styles.iconBtn, !isSaved && { opacity: 0.3 }]}
          disabled={!isSaved}
        >
          <Feather name="trash-2" size={20} color={Colors.danger} />
        </Pressable>
      </View>

      <View style={styles.previewImageWrap}>
        {currentPhotoUri ? (
          <Image
            source={{
              uri: currentPhotoUri,
              ...(currentPhotoUri && !currentPhotoUri.startsWith("file://") && token
                ? { headers: { Authorization: `Bearer ${token}` } }
                : {}),
            }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
        {strokes.length > 0 && (
          <Svg
            style={StyleSheet.absoluteFill}
            width={drawAreaW}
            height={drawAreaH}
            viewBox={`0 0 ${drawAreaW} ${drawAreaH}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {strokes.map((stroke, i) => (
              <Path
                key={i}
                d={stroke.points.map((p, pi) => `${pi === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
          </Svg>
        )}
      </View>

      <View style={[styles.previewActions, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Pressable
          style={[styles.btnPrimary, !isSaved && { opacity: 0.45 }]}
          onPress={takeAnother}
          disabled={!isSaved}
        >
          <Feather name="camera" size={18} color="#fff" />
          <Text style={styles.btnPrimaryText}>Take Another Photo</Text>
        </Pressable>

        <View style={styles.previewRow}>
          <Pressable
            style={[styles.btnSecondary, { flex: 1 }, !isSaved && { opacity: 0.45 }]}
            onPress={() => setPhase("markup")}
            disabled={!isSaved}
          >
            <Feather name="edit-2" size={16} color={Colors.secondary} />
            <Text style={styles.btnSecondaryText}>Add Markup</Text>
          </Pressable>

          <Pressable
            style={[styles.btnOutline, { flex: 1 }]}
            onPress={goToInspection}
          >
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.btnOutlineText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    height: 56, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, backgroundColor: "#111",
    borderBottomWidth: 1, borderBottomColor: "#222",
  },
  headerTitle: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center" },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  uploadingPill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  uploadingText: { color: "#fff", fontSize: 13, fontWeight: "500" },
  savedPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.success ?? "#22C55E", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  savedText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  errorText: { color: Colors.danger, fontSize: 13, fontWeight: "600" },
  errorPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.danger, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  errorPillText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  queuedPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#718096", borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  queuedText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  saveBtn: {
    backgroundColor: Colors.secondary, paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 8, minWidth: 56, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  previewImageWrap: { flex: 1, backgroundColor: "#111", position: "relative" },
  previewActions: {
    backgroundColor: "#1a1a1a", borderTopWidth: 1, borderTopColor: "#333",
    paddingTop: 14, paddingHorizontal: 16, gap: 10,
  },
  previewRow: { flexDirection: "row", gap: 10 },
  btnPrimary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: Colors.secondary, paddingVertical: 14, borderRadius: 10,
  },
  btnPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnSecondary: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: Colors.secondary, paddingVertical: 12, borderRadius: 10,
  },
  btnSecondaryText: { color: Colors.secondary, fontSize: 14, fontWeight: "600" },
  btnOutline: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderColor: "#888", paddingVertical: 12, borderRadius: 10,
  },
  btnOutlineText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  canvas: { position: "relative", backgroundColor: "#111", overflow: "hidden" },
  hintBox: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  hintText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  toolbar: { backgroundColor: "#1a1a1a", borderTopWidth: 1, borderTopColor: "#333", paddingTop: 10 },
  colorRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "transparent" },
  colorDotActive: { borderColor: "#fff", transform: [{ scale: 1.2 }] },
  divider: { width: 1, height: 24, backgroundColor: "#444", marginHorizontal: 4 },
  widthBtn: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  widthBtnActive: { backgroundColor: "#333" },
  widthLine: { width: 20, borderRadius: 4 },
  actionRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: 12, paddingTop: 2 },
  toolBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14 },
  toolBtnText: { fontSize: 13, fontWeight: "500", color: Colors.text },
});

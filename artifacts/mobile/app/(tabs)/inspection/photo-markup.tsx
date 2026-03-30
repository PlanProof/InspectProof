import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  PanResponder, useWindowDimensions, Image, ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "@/context/AuthContext";
import { Colors } from "@/constants/colors";

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

type Phase = "preview" | "markup";
type UploadState = "uploading" | "saved" | "error";

const PEN_COLORS = [
  { value: "#EF4444", label: "Red" },
  { value: "#F59E0B", label: "Yellow" },
  { value: "#22C55E", label: "Green" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#000000", label: "Black" },
  { value: "#FFFFFF", label: "White" },
];
const PEN_WIDTHS = [2, 4, 7];

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.1).toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export default function PhotoMarkupScreen() {
  const { photoUri: initialPhotoUri, inspectionId, itemId } = useLocalSearchParams<{
    photoUri: string;
    inspectionId: string;
    itemId: string;
  }>();

  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [phase, setPhase] = useState<Phase>("preview");
  const [currentPhotoUri, setCurrentPhotoUri] = useState(initialPhotoUri);
  const [uploadState, setUploadState] = useState<UploadState>("uploading");
  const [savedObjectPath, setSavedObjectPath] = useState<string | null>(null);

  // Markup state
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState("#EF4444");
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [savingMarkup, setSavingMarkup] = useState(false);

  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const selectedColorRef = useRef(selectedColor);
  const selectedWidthRef = useRef(selectedWidth);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { selectedWidthRef.current = selectedWidth; }, [selectedWidth]);

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  const drawAreaH = screenH - insets.top - insets.bottom - 56 - 120;
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
      router.replace({
        pathname: "/inspection/conduct/[id]" as any,
        params: { id: inspectionId },
      });
    } else {
      router.back();
    }
  }, [inspectionId]);

  // ── Auto-upload on mount ──────────────────────────────────────────────────

  const uploadPhoto = useCallback(async (photoUri: string): Promise<string> => {
    const urlRes = await fetchWithAuth("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `inspection-photo-${Date.now()}.jpg`,
        size: 0,
        contentType: "image/jpeg",
      }),
    });
    const blob = await (await fetch(photoUri)).blob();
    const uploadResp = await fetch(urlRes.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);
    return urlRes.objectPath as string;
  }, [fetchWithAuth]);

  const appendPhotoToChecklist = useCallback(async (objectPath: string) => {
    const currentItems = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
    const item = Array.isArray(currentItems)
      ? currentItems.find((i: any) => i.id === parseInt(itemId))
      : null;
    const existingUrls: string[] = item?.photoUrls ?? [];
    await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoUrls: [...existingUrls, objectPath] }),
    });
  }, [fetchWithAuth, inspectionId, itemId]);

  useEffect(() => {
    if (!currentPhotoUri) return;
    let cancelled = false;
    setUploadState("uploading");
    setSavedObjectPath(null);

    (async () => {
      try {
        const objectPath = await uploadPhoto(currentPhotoUri);
        if (cancelled) return;
        await appendPhotoToChecklist(objectPath);
        if (cancelled) return;
        setSavedObjectPath(objectPath);
        setUploadState("saved");
      } catch (err) {
        if (cancelled) return;
        console.error("[photo-markup] auto-upload error:", err);
        setUploadState("error");
      }
    })();

    return () => { cancelled = true; };
  }, [currentPhotoUri]); // eslint-disable-line react-hooks/exhaustive-deps

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
            } catch { }
            goToInspection();
          },
        },
      ]
    );
  };

  // ── Take another ──────────────────────────────────────────────────────────

  const takeAnother = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access to take photos.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    // Reset state and auto-upload the new photo
    setPhase("preview");
    setStrokes([]);
    setLiveStroke([]);
    setCurrentPhotoUri(picked.assets[0].uri);
  };

  // ── Markup canvas ─────────────────────────────────────────────────────────

  const commitStroke = useCallback(() => {
    if (currentPoints.current.length >= 1) {
      setStrokes(prev => [...prev, {
        points: [...currentPoints.current],
        color: selectedColorRef.current,
        width: selectedWidthRef.current,
      }]);
    }
    currentPoints.current = [];
    setLiveStroke([]);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPoints.current = [{ x: locationX, y: locationY }];
        setLiveStroke([{ x: locationX, y: locationY }]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPoints.current.push({ x: locationX, y: locationY });
        setLiveStroke([...currentPoints.current]);
      },
      onPanResponderRelease: () => { commitStroke(); },
      onPanResponderTerminate: () => { commitStroke(); },
      onShouldBlockNativeResponder: () => true,
    })
  ).current;

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
      <View style={[styles.container, { paddingTop: insets.top }]}>
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

        <View
          collapsable={false}
          style={[styles.canvas, { width: drawAreaW, height: drawAreaH }]}
          {...panResponder.panHandlers}
        >
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Image source={{ uri: currentPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          </View>
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
      </View>
    );
  }

  // ── Render: preview phase ─────────────────────────────────────────────────

  const isSaved = uploadState === "saved";

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
              <Text style={styles.uploadingText}>Saving…</Text>
            </View>
          )}
          {uploadState === "saved" && (
            <View style={styles.savedPill}>
              <Feather name="check" size={13} color="#fff" />
              <Text style={styles.savedText}>Saved</Text>
            </View>
          )}
          {uploadState === "error" && (
            <Text style={styles.errorText}>Save failed</Text>
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
          <Image source={{ uri: currentPhotoUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}
      </View>

      <View style={[styles.previewActions, { paddingBottom: insets.bottom + 12 }]}>
        {/* Primary action — take another photo immediately */}
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
            <Feather name="check" size={16} color={Colors.text} />
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
    borderWidth: 1.5, borderColor: "#555", paddingVertical: 12, borderRadius: 10,
  },
  btnOutlineText: { color: Colors.text, fontSize: 14, fontWeight: "600" },
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

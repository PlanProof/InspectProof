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

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Main screen ───────────────────────────────────────────────────────────────

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
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState("#EF4444");
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [uploading, setUploading] = useState(false);

  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const selectedColorRef = useRef(selectedColor);
  const selectedWidthRef = useRef(selectedWidth);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { selectedWidthRef.current = selectedWidth; }, [selectedWidth]);

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const drawAreaH = screenH - insets.top - insets.bottom - 56 - 120;
  const drawAreaW = screenW;

  const goBackToInspection = useCallback(() => {
    if (inspectionId) {
      router.replace({
        pathname: "/inspection/conduct/[id]" as any,
        params: { id: inspectionId },
      });
    } else {
      router.back();
    }
  }, [inspectionId]);

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

  const undo = () => setStrokes(prev => prev.slice(0, -1));
  const clear = () => { setStrokes([]); setLiveStroke([]); };

  // ── Auth fetch ────────────────────────────────────────────────────────────

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

  // ── Upload + save ─────────────────────────────────────────────────────────

  const uploadAndSave = useCallback(async (
    photoUri: string,
    overrideStrokes?: Stroke[]
  ): Promise<void> => {
    if (!photoUri) return;
    setUploading(true);
    try {
      const effectiveStrokes = overrideStrokes ?? strokes;

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
      const objectPath: string = urlRes.objectPath;

      const currentItem = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
      const item = Array.isArray(currentItem)
        ? currentItem.find((i: any) => i.id === parseInt(itemId))
        : null;

      const existingUrls: string[] = item?.photoUrls || [];
      const existingMarkups: Record<string, MarkupData> = item?.photoMarkups || {};

      const newUrls = [...existingUrls, objectPath];
      const markupData: MarkupData = {
        w: drawAreaW,
        h: drawAreaH,
        strokes: effectiveStrokes,
      };
      const newMarkups = { ...existingMarkups, [objectPath]: markupData };

      await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: newUrls, photoMarkups: newMarkups }),
      });
    } finally {
      setUploading(false);
    }
  }, [strokes, fetchWithAuth, inspectionId, itemId, drawAreaW, drawAreaH]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const saveAndDone = async (withMarkup: boolean) => {
    if (!currentPhotoUri) { goBackToInspection(); return; }
    try {
      await uploadAndSave(currentPhotoUri, withMarkup ? undefined : []);
      goBackToInspection();
    } catch {
      Alert.alert("Save failed", "Could not save the photo. Please try again.");
    }
  };

  const saveAndTakeAnother = async (withMarkup: boolean) => {
    if (!currentPhotoUri) return;
    try {
      await uploadAndSave(currentPhotoUri, withMarkup ? undefined : []);
    } catch {
      Alert.alert("Save failed", "Could not save the photo. Please try again.");
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow camera access to take photos.");
      goBackToInspection();
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) {
      goBackToInspection();
      return;
    }

    setCurrentPhotoUri(picked.assets[0].uri);
    setStrokes([]);
    setLiveStroke([]);
    setPhase("preview");
  };

  // ── Preview phase ─────────────────────────────────────────────────────────

  if (phase === "preview") {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={goBackToInspection} hitSlop={12} style={styles.iconBtn}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>Review Photo</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.previewImageWrap}>
          {currentPhotoUri ? (
            <Image
              source={{ uri: currentPhotoUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
          )}
        </View>

        <View style={[styles.previewActions, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={styles.btnPrimary}
            onPress={() => setPhase("markup")}
          >
            <Feather name="edit-2" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Add Markup</Text>
          </Pressable>

          <View style={styles.previewRow}>
            <Pressable
              style={[styles.btnSecondary, { flex: 1 }]}
              onPress={() => saveAndTakeAnother(false)}
              disabled={uploading}
            >
              {uploading
                ? <ActivityIndicator size="small" color={Colors.secondary} />
                : <>
                    <Feather name="camera" size={16} color={Colors.secondary} />
                    <Text style={styles.btnSecondaryText}>Save & Take Another</Text>
                  </>
              }
            </Pressable>

            <Pressable
              style={[styles.btnOutline, { flex: 1 }]}
              onPress={() => saveAndDone(false)}
              disabled={uploading}
            >
              {uploading
                ? <ActivityIndicator size="small" color={Colors.text} />
                : <>
                    <Feather name="check" size={16} color={Colors.text} />
                    <Text style={styles.btnOutlineText}>Save & Done</Text>
                  </>
              }
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Markup phase ──────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => setPhase("preview")} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Add Markup</Text>
        <Pressable
          onPress={() => saveAndDone(true)}
          disabled={uploading}
          style={[styles.saveBtn, uploading && { opacity: 0.6 }]}
        >
          {uploading
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
          <Image
            source={{ uri: currentPhotoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        </View>

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={drawAreaW} height={drawAreaH}>
            {strokes.map((stroke, i) => (
              <Path
                key={i}
                d={pointsToPath(stroke.points)}
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ))}
            {liveStroke.length >= 1 && (
              <Path
                d={pointsToPath(liveStroke)}
                stroke={selectedColor}
                strokeWidth={selectedWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
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
            <Pressable
              key={c.value}
              onPress={() => setSelectedColor(c.value)}
              style={[
                styles.colorDot,
                { backgroundColor: c.value },
                selectedColor === c.value && styles.colorDotActive,
              ]}
            />
          ))}
          <View style={styles.divider} />
          {PEN_WIDTHS.map(w => (
            <Pressable
              key={w}
              onPress={() => setSelectedWidth(w)}
              style={[styles.widthBtn, selectedWidth === w && styles.widthBtnActive]}
            >
              <View style={[styles.widthLine, { height: w, backgroundColor: selectedColor }]} />
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.actionRow}>
          <Pressable
            onPress={undo}
            disabled={strokes.length === 0}
            style={[styles.toolBtn, strokes.length === 0 && { opacity: 0.35 }]}
          >
            <Feather name="corner-up-left" size={18} color={Colors.text} />
            <Text style={styles.toolBtnText}>Undo</Text>
          </Pressable>
          <Pressable
            onPress={clear}
            disabled={strokes.length === 0}
            style={[styles.toolBtn, strokes.length === 0 && { opacity: 0.35 }]}
          >
            <Feather name="trash-2" size={18} color={Colors.danger} />
            <Text style={[styles.toolBtnText, { color: Colors.danger }]}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={() => saveAndTakeAnother(true)}
            disabled={uploading}
            style={[styles.toolBtn, uploading && { opacity: 0.35 }]}
          >
            <Feather name="camera" size={18} color={Colors.secondary} />
            <Text style={[styles.toolBtnText, { color: Colors.secondary }]}>Save & Another</Text>
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
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: "#fff" },
  saveBtn: {
    backgroundColor: Colors.secondary, paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 8, minWidth: 56, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // Preview phase
  previewImageWrap: {
    flex: 1,
    backgroundColor: "#111",
    position: "relative",
  },
  previewActions: {
    backgroundColor: "#1a1a1a",
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  previewRow: {
    flexDirection: "row",
    gap: 10,
  },
  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.secondary,
    paddingVertical: 14,
    borderRadius: 10,
  },
  btnPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnSecondaryText: {
    color: Colors.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  btnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: "#555",
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnOutlineText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },

  // Markup phase
  canvas: { position: "relative", backgroundColor: "#111", overflow: "hidden" },
  hintBox: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  hintText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  toolbar: {
    backgroundColor: "#1a1a1a",
    borderTopWidth: 1, borderTopColor: "#333",
    paddingTop: 10,
  },
  colorRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
  },
  colorDot: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: "transparent",
  },
  colorDotActive: { borderColor: "#fff", transform: [{ scale: 1.2 }] },
  divider: { width: 1, height: 24, backgroundColor: "#444", marginHorizontal: 4 },
  widthBtn: {
    width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  widthBtnActive: { backgroundColor: "#333" },
  widthLine: { width: 20, borderRadius: 4 },
  actionRow: {
    flexDirection: "row", justifyContent: "space-around",
    paddingHorizontal: 12, paddingTop: 2,
  },
  toolBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  toolBtnText: { fontSize: 13, fontWeight: "500", color: Colors.text },
});

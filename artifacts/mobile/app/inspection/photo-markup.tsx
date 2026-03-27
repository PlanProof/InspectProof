import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  PanResponder, useWindowDimensions, Image, ScrollView,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
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

const PEN_COLORS = [
  { value: "#EF4444", label: "Red" },
  { value: "#F59E0B", label: "Yellow" },
  { value: "#22C55E", label: "Green" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#FFFFFF", label: "White" },
];

const PEN_WIDTHS = [2, 4, 7];

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    // Single-point dot: draw a tiny line so it renders
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.1).toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PhotoMarkupScreen() {
  const { photoUri, inspectionId, itemId } = useLocalSearchParams<{
    photoUri: string;
    inspectionId: string;
    itemId: string;
  }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState("#EF4444");
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [uploading, setUploading] = useState(false);

  // Refs must be declared BEFORE the PanResponder so the closures capture them
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const selectedColorRef = useRef(selectedColor);
  const selectedWidthRef = useRef(selectedWidth);
  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { selectedWidthRef.current = selectedWidth; }, [selectedWidth]);

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const drawAreaH = screenH - insets.top - insets.bottom - 56 - 120;
  const drawAreaW = screenW;

  // Commit the current live stroke to the permanent strokes list
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
      onPanResponderRelease: () => {
        commitStroke();
      },
      // Also commit on terminate so gesture system cancellations don't drop strokes
      onPanResponderTerminate: () => {
        commitStroke();
      },
      onShouldBlockNativeResponder: () => true,
    })
  ).current;

  const undo = () => setStrokes(prev => prev.slice(0, -1));
  const clear = () => { setStrokes([]); setLiveStroke([]); };

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

  const save = async () => {
    if (!photoUri) { router.back(); return; }
    setUploading(true);
    try {
      // 1. Request presigned upload URL
      const urlRes = await fetchWithAuth("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `inspection-photo-${Date.now()}.jpg`,
          size: 0,
          contentType: "image/jpeg",
        }),
      });

      // 2. Upload original photo to GCS
      const blob = await (await fetch(photoUri)).blob();
      const uploadResp = await fetch(urlRes.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!uploadResp.ok) throw new Error("Upload failed");
      const objectPath: string = urlRes.objectPath;

      // 3. Get current checklist item data then patch
      const currentItem = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
      const item = Array.isArray(currentItem) ? currentItem.find((i: any) => i.id === parseInt(itemId)) : null;

      const existingUrls: string[] = item?.photoUrls || [];
      const existingMarkups: Record<string, MarkupData> = item?.photoMarkups || {};

      const newUrls = [...existingUrls, objectPath];
      const markupData: MarkupData = { w: drawAreaW, h: drawAreaH, strokes };
      const newMarkups = { ...existingMarkups, [objectPath]: markupData };

      await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: newUrls, photoMarkups: newMarkups }),
      });

      router.back();
    } catch {
      Alert.alert("Save failed", "Could not save the photo. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="x" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Markup</Text>
        <Pressable
          onPress={save}
          disabled={uploading}
          style={[styles.saveBtn, uploading && { opacity: 0.6 }]}
        >
          {uploading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveBtnText}>Save</Text>}
        </Pressable>
      </View>

      {/* Drawing canvas — collapsable={false} prevents Android from collapsing the view */}
      <View
        collapsable={false}
        style={[styles.canvas, { width: drawAreaW, height: drawAreaH }]}
        {...panResponder.panHandlers}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#111" }]} />
        )}

        {/* pointerEvents="none" is critical — without it the SVG intercepts touches
            after strokes are drawn, causing the PanResponder to stop receiving events */}
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

        {/* Hint */}
        {strokes.length === 0 && liveStroke.length === 0 && (
          <View style={styles.hintBox} pointerEvents="none">
            <Feather name="edit-2" size={20} color="rgba(255,255,255,0.6)" />
            <Text style={styles.hintText}>Draw to annotate</Text>
          </View>
        )}
      </View>

      {/* Toolbar */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
        {/* Colors */}
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
          {/* Widths */}
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

        {/* Undo / Clear */}
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
          <Pressable onPress={() => router.back()} style={styles.toolBtn}>
            <Feather name="image" size={18} color={Colors.textSecondary} />
            <Text style={[styles.toolBtnText, { color: Colors.textSecondary }]}>No markup</Text>
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

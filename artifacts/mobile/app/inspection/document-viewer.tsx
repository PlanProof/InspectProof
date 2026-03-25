import React, { useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  PanResponder, useWindowDimensions, Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Colors } from "@/constants/colors";

// ── Types ────────────────────────────────────────────────────────────────────

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
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
  if (points.length < 2) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentViewerScreen() {
  const { url, name, mimeType, inspectionId, itemId } = useLocalSearchParams<{
    url: string;
    name: string;
    mimeType: string;
    inspectionId: string;
    itemId: string;
  }>();

  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState("#EF4444");
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [uploading, setUploading] = useState(false);
  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState(false);

  const containerRef = useRef<View>(null);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const selectedColorRef = useRef(selectedColor);
  const selectedWidthRef = useRef(selectedWidth);

  React.useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  React.useEffect(() => { selectedWidthRef.current = selectedWidth; }, [selectedWidth]);

  const headerH = 56;
  const toolbarH = drawing ? 56 : 0;
  const bodyH = screenH - insets.top - headerH;

  // Build the WebView URL — Google Docs viewer for PDFs on Android
  const isPdf = mimeType === "application/pdf";
  const docUrl = isPdf && Platform.OS === "android"
    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(url)}`
    : url;

  // ── Drawing PanResponder ─────────────────────────────────────────────────

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => drawing,
      onMoveShouldSetPanResponder: () => drawing,
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
        if (currentPoints.current.length > 1) {
          setStrokes(prev => [...prev, {
            points: [...currentPoints.current],
            color: selectedColorRef.current,
            width: selectedWidthRef.current,
          }]);
        }
        currentPoints.current = [];
        setLiveStroke([]);
      },
    })
  ).current;

  // ── Save ─────────────────────────────────────────────────────────────────

  const fetchWithAuth = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...opts,
      headers: { ...(opts?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [baseUrl, token]);

  const saveMarkup = async () => {
    if (!inspectionId || !itemId) { router.back(); return; }
    if (strokes.length === 0) { router.back(); return; }

    setUploading(true);
    try {
      // 1. Capture the visible document + drawn markup as a single image
      const capturedUri = await captureRef(containerRef, {
        format: "jpg",
        quality: 0.85,
        result: "tmpfile",
      });

      // 2. Upload captured image
      const urlRes = await fetchWithAuth("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `doc-markup-${Date.now()}.jpg`, size: 0, contentType: "image/jpeg" }),
      });

      const blob = await (await fetch(capturedUri)).blob();
      await fetch(urlRes.uploadURL, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const objectPath: string = urlRes.objectPath;

      // 3. Attach to checklist item
      const currentItem = await fetchWithAuth(`/api/inspections/${inspectionId}/checklist`);
      const item = Array.isArray(currentItem)
        ? currentItem.find((i: any) => i.id === parseInt(itemId))
        : null;

      const existingUrls: string[] = item?.photoUrls || [];
      await fetchWithAuth(`/api/inspections/${inspectionId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: [...existingUrls, objectPath] }),
      });

      Alert.alert("Saved", "Your markup has been attached to the checklist item.");
      router.back();
    } catch {
      Alert.alert("Save failed", "Could not save the markup. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{name || "Document"}</Text>
        <View style={styles.headerActions}>
          {inspectionId && itemId && (
            <Pressable
              onPress={() => {
                if (drawing && strokes.length > 0) {
                  Alert.alert(
                    "Save markup?",
                    "Save your drawings and attach them to this checklist item.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Save", onPress: saveMarkup },
                      { text: "Discard", style: "destructive", onPress: () => { setStrokes([]); setDrawing(false); } },
                    ]
                  );
                } else {
                  setDrawing(d => !d);
                  if (drawing) { setStrokes([]); setLiveStroke([]); }
                }
              }}
              style={[styles.drawBtn, drawing && styles.drawBtnActive]}
            >
              <Feather name="edit-2" size={14} color={drawing ? "#fff" : Colors.secondary} />
              <Text style={[styles.drawBtnText, drawing && styles.drawBtnActiveText]}>
                {drawing ? (strokes.length > 0 ? "Save" : "Cancel") : "Markup"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Toolbar (drawing mode) ── */}
      {drawing && (
        <View style={styles.toolbar}>
          <View style={styles.toolbarColors}>
            {PEN_COLORS.map(c => (
              <Pressable
                key={c.value}
                onPress={() => setSelectedColor(c.value)}
                style={[
                  styles.colorDot,
                  { backgroundColor: c.value },
                  c.value === "#FFFFFF" && { borderWidth: 1, borderColor: "#ccc" },
                  selectedColor === c.value && styles.colorDotSelected,
                ]}
              />
            ))}
          </View>
          <View style={styles.toolbarWidths}>
            {PEN_WIDTHS.map(w => (
              <Pressable key={w} onPress={() => setSelectedWidth(w)} style={styles.widthBtn}>
                <View style={[
                  styles.widthDot,
                  { width: w * 2.5, height: w * 2.5, backgroundColor: selectedColor },
                  selectedWidth === w && styles.widthDotSelected,
                ]} />
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setStrokes(prev => prev.slice(0, -1))} style={styles.iconBtn} hitSlop={8}>
            <Feather name="corner-up-left" size={18} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => { setStrokes([]); setLiveStroke([]); }} style={styles.iconBtn} hitSlop={8}>
            <Feather name="trash-2" size={18} color={Colors.textSecondary} />
          </Pressable>
          {uploading && <ActivityIndicator size="small" color={Colors.secondary} />}
        </View>
      )}

      {/* ── Document area (WebView + drawing overlay) ── */}
      <View
        ref={containerRef}
        style={[styles.body, { height: bodyH - toolbarH }]}
        collapsable={false}
        {...(drawing ? panResponder.panHandlers : {})}
      >
        {/* WebView */}
        <WebView
          source={{ uri: docUrl }}
          style={styles.webview}
          onLoadStart={() => setWebLoading(true)}
          onLoadEnd={() => setWebLoading(false)}
          onError={() => { setWebLoading(false); setWebError(true); }}
          scrollEnabled={!drawing}
          bounces={false}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />

        {/* Loading overlay */}
        {webLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.secondary} />
            <Text style={styles.loadingText}>Loading document…</Text>
          </View>
        )}

        {/* Error state */}
        {webError && !webLoading && (
          <View style={styles.errorOverlay}>
            <Feather name="alert-circle" size={36} color={Colors.textTertiary} />
            <Text style={styles.errorText}>Unable to load this document</Text>
            <Pressable onPress={() => { setWebError(false); setWebLoading(true); }} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Drawing canvas overlay */}
        {drawing && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={screenW} height={bodyH - toolbarH}>
              {strokes.map((s, i) => (
                <Path
                  key={i}
                  d={pointsToPath(s.points)}
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ))}
              {liveStroke.length > 1 && (
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
        )}

        {/* Draw mode hint */}
        {drawing && strokes.length === 0 && !webLoading && (
          <View style={styles.drawHint} pointerEvents="none">
            <View style={styles.drawHintPill}>
              <Feather name="edit-2" size={12} color="#fff" />
              <Text style={styles.drawHintText}>Draw on the document</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: Colors.sidebar,
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { padding: 6 },
  drawBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
  },
  drawBtnActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  drawBtnText: { color: Colors.secondary, fontSize: 13, fontWeight: "600" },
  drawBtnActiveText: { color: "#fff" },
  toolbar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: Colors.sidebar,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  toolbarColors: { flexDirection: "row", alignItems: "center", gap: 6 },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  colorDotSelected: {
    transform: [{ scale: 1.3 }],
    shadowOpacity: 0.5,
  },
  toolbarWidths: { flexDirection: "row", alignItems: "center", gap: 8 },
  widthBtn: { padding: 4 },
  widthDot: { borderRadius: 20 },
  widthDotSelected: { opacity: 1, transform: [{ scale: 1.3 }] },
  body: { flex: 1, backgroundColor: "#fff" },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: { color: Colors.textSecondary, fontSize: 15, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    marginTop: 4,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  drawHint: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  drawHintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  drawHintText: { color: "#fff", fontSize: 13, fontWeight: "500" },
});

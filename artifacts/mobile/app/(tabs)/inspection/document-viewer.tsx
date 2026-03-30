import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  PanResponder, useWindowDimensions, Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
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

const CACHE_DIR = Platform.OS !== "web" ? (FileSystem.cacheDirectory ?? "") + "inspectproof-docs/" : "";

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function mimeToExt(mime: string): string | null {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime.includes("word") || mime.includes("document")) return "docx";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  return null;
}

function urlToFilename(url: string, mimeType?: string): string {
  // Stable filename from URL — use MIME type to add extension when URL has none
  const urlNoQuery = url.split("?")[0];
  const rawExt = urlNoQuery.split(".").pop()?.toLowerCase();
  const lastSegment = urlNoQuery.split("/").pop() ?? "";
  // Consider it a real extension only if it's short AND different from the full last URL segment
  const hasRealExt = !!rawExt && rawExt.length <= 4 && rawExt !== lastSegment;
  const ext = hasRealExt ? rawExt : (mimeType ? mimeToExt(mimeType) : null);
  const safe = url.replace(/[^a-z0-9]/gi, "_");
  const trimmed = safe.slice(Math.max(0, safe.length - 80));
  return ext ? `${trimmed}.${ext}` : trimmed;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function DocumentViewerScreen() {
  const {
    url, name, mimeType, inspectionId, itemId, projectId,
  } = useLocalSearchParams<{
    url: string;
    name: string;
    mimeType: string;
    inspectionId: string;
    itemId: string;
    projectId: string;
    documentId: string;
  }>();

  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  // ── Download state ─────────────────────────────────────────────────────────
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadState, setDownloadState] = useState<"idle" | "cached" | "downloading" | "done" | "error">("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  // ── Drawing state ──────────────────────────────────────────────────────────
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

  // ── Download / cache logic ─────────────────────────────────────────────────

  useEffect(() => {
    if (!url) return;

    // Web: fetch with auth headers and create a blob URL — no file system needed
    if (Platform.OS === "web") {
      (async () => {
        try {
          setDownloadState("downloading");
          const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          setLocalUri(blobUrl);
          setDownloadState("done");
        } catch (e: any) {
          setDownloadState("error");
          setDownloadError(e?.message || "Failed to load document.");
        }
      })();
      return;
    }

    // Native: download to cache dir with progress tracking
    (async () => {
      try {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        const filename = urlToFilename(url, mimeType);
        const destPath = CACHE_DIR + filename;

        // Check if already cached
        const info = await FileSystem.getInfoAsync(destPath);
        if (info.exists && info.size && info.size > 0) {
          setLocalUri(destPath);
          setDownloadState("cached");
          return;
        }

        // Download with auth headers and progress tracking
        setDownloadState("downloading");
        setDownloadProgress(0);

        const dl = FileSystem.createDownloadResumable(
          url,
          destPath,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
          (prog) => {
            if (prog.totalBytesExpectedToWrite > 0) {
              setDownloadProgress(prog.totalBytesWritten / prog.totalBytesExpectedToWrite);
            }
          }
        );
        downloadRef.current = dl;

        const result = await dl.downloadAsync();
        if (result?.uri) {
          setLocalUri(result.uri);
          setDownloadState("done");
        } else {
          setDownloadState("error");
          setDownloadError("Download failed — no file returned.");
        }
      } catch (e: any) {
        setDownloadState("error");
        setDownloadError(e?.message || "Failed to load document.");
      }
    })();

    return () => {
      downloadRef.current?.cancelAsync().catch(() => {});
    };
  }, [url, token]);

  // Build WebView source from local file
  const webviewUri = localUri ? (Platform.OS === "android" ? `file://${localUri}` : localUri) : null;
  const isPdf = mimeType === "application/pdf" || name?.toLowerCase().endsWith(".pdf");

  // ── Drawing PanResponder ───────────────────────────────────────────────────

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

  // ── Save markup ───────────────────────────────────────────────────────────

  const fetchWithAuth = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...opts,
      headers: { ...(opts?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, [baseUrl, token]);

  const saveMarkup = async () => {
    if (strokes.length === 0) { router.back(); return; }
    if (!inspectionId && !projectId) { router.back(); return; }

    setUploading(true);
    try {
      const capturedUri = await captureRef(containerRef, {
        format: "jpg",
        quality: 0.85,
        result: "tmpfile",
      });

      const markupFileName = `markup-${(name || "doc").replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${Date.now()}.jpg`;
      const urlRes = await fetchWithAuth("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: markupFileName, size: 0, contentType: "image/jpeg" }),
      });

      const blob = await (await fetch(capturedUri)).blob();
      await fetch(urlRes.uploadURL, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const objectPath: string = urlRes.objectPath;

      if (inspectionId && itemId) {
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
        Alert.alert("Saved", "Markup attached to the checklist item.");
      } else if (projectId) {
        const docName = `${name || "Plan"} — Markup`;
        await fetchWithAuth(`/api/projects/${projectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: docName,
            fileName: markupFileName,
            fileSize: 0,
            mimeType: "image/jpeg",
            fileUrl: objectPath,
            folder: "Markups",
            includedInInspection: true,
          }),
        });
        Alert.alert("Markup saved", `"${docName}" has been saved to the project's Markups folder.`);
      }

      router.back();
    } catch {
      Alert.alert("Save failed", "Could not save the markup. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isOffline = downloadState === "cached";
  const isReady = downloadState === "done" || downloadState === "cached";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{name || "Document"}</Text>
          {isOffline && (
            <View style={styles.cachedBadge}>
              <Feather name="wifi-off" size={9} color="#C5D92D" />
              <Text style={styles.cachedBadgeText}>Available offline</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {(inspectionId && itemId || projectId) && isReady && (
            <Pressable
              onPress={() => {
                if (drawing && strokes.length > 0) {
                  const saveTarget = (inspectionId && itemId) ? "attach it to the checklist item" : "save it to the project";
                  Alert.alert("Save markup?", `Save your drawings and ${saveTarget}.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Save", onPress: saveMarkup },
                    { text: "Discard", style: "destructive", onPress: () => { setStrokes([]); setDrawing(false); } },
                  ]);
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

      {/* ── Drawing toolbar ── */}
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
            <Feather name="corner-up-left" size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={() => { setStrokes([]); setLiveStroke([]); }} style={styles.iconBtn} hitSlop={8}>
            <Feather name="trash-2" size={18} color="rgba(255,255,255,0.6)" />
          </Pressable>
          {uploading && <ActivityIndicator size="small" color={Colors.secondary} />}
        </View>
      )}

      {/* ── Download progress ── */}
      {downloadState === "downloading" && (
        <View style={styles.downloadBar}>
          <View style={styles.downloadBarFill}>
            <View style={[styles.downloadBarProgress, { width: `${Math.round(downloadProgress * 100)}%` }]} />
          </View>
          <View style={styles.downloadInfo}>
            <ActivityIndicator size="small" color={Colors.secondary} />
            <Text style={styles.downloadText}>
              {downloadProgress > 0
                ? `Downloading… ${Math.round(downloadProgress * 100)}%`
                : "Connecting…"}
            </Text>
          </View>
        </View>
      )}

      {/* ── Error state ── */}
      {downloadState === "error" && (
        <View style={styles.errorFull}>
          <Feather name="alert-circle" size={44} color={Colors.textTertiary} />
          <Text style={styles.errorTitle}>Could not load document</Text>
          <Text style={styles.errorSub}>{downloadError || "Check your connection and try again."}</Text>
          <Pressable
            onPress={() => {
              setDownloadState("idle");
              setDownloadError(null);
              setLocalUri(null);
              setDownloadState("downloading");
              setDownloadProgress(0);

              if (Platform.OS === "web") {
                // Web: fetch with auth headers and create blob URL
                (async () => {
                  try {
                    const res = await fetch(url, {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    setLocalUri(URL.createObjectURL(blob));
                    setDownloadState("done");
                  } catch (e: any) {
                    setDownloadState("error");
                    setDownloadError(e?.message || "Failed to load document.");
                  }
                })();
                return;
              }

              // Native: download to cache dir
              (async () => {
                try {
                  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
                  const filename = urlToFilename(url, mimeType);
                  const destPath = CACHE_DIR + filename;
                  const dl = FileSystem.createDownloadResumable(
                    url, destPath,
                    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
                    (prog) => {
                      if (prog.totalBytesExpectedToWrite > 0)
                        setDownloadProgress(prog.totalBytesWritten / prog.totalBytesExpectedToWrite);
                    }
                  );
                  downloadRef.current = dl;
                  const result = await dl.downloadAsync();
                  if (result?.uri) { setLocalUri(result.uri); setDownloadState("done"); }
                  else setDownloadState("error");
                } catch (e: any) { setDownloadState("error"); setDownloadError(e?.message); }
              })();
            }}
            style={styles.retryBtn}
          >
            <Feather name="refresh-cw" size={15} color="#fff" />
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* ── Document body ── */}
      {isReady && webviewUri && (
        <View
          ref={containerRef}
          style={[styles.body, { height: bodyH - toolbarH }]}
          collapsable={false}
          {...(drawing && Platform.OS !== "web" ? panResponder.panHandlers : {})}
        >
          {Platform.OS === "web" ? (
            // Web: use a native <iframe> — WebView is native-only
            React.createElement("iframe", {
              src: webviewUri,
              title: name || "Document",
              style: {
                width: "100%",
                height: "100%",
                border: "none",
                flex: 1,
                backgroundColor: "#fff",
              },
              onLoad: () => setWebLoading(false),
              onError: () => { setWebLoading(false); setWebError(true); },
            })
          ) : (
            <WebView
              source={{ uri: webviewUri }}
              style={styles.webview}
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={() => setWebLoading(false)}
              onError={() => { setWebLoading(false); setWebError(true); }}
              scrollEnabled={!drawing}
              bounces={false}
              originWhitelist={["*", "file://*"]}
              allowFileAccess
              allowUniversalAccessFromFileURLs
              allowFileAccessFromFileURLs
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
            />
          )}

          {/* Loading overlay */}
          {webLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.secondary} />
              <Text style={styles.loadingText}>
                {isPdf ? "Rendering PDF…" : "Opening document…"}
              </Text>
            </View>
          )}

          {/* Render error */}
          {webError && !webLoading && (
            <View style={styles.loadingOverlay}>
              <Feather name="alert-circle" size={36} color={Colors.textTertiary} />
              <Text style={styles.loadingText}>Unable to render this file</Text>
              <Pressable onPress={() => { setWebError(false); setWebLoading(true); }} style={styles.retryBtn}>
                <Feather name="refresh-cw" size={15} color="#fff" />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}

          {/* Drawing canvas overlay — native only */}
          {drawing && Platform.OS !== "web" && (
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
      )}
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
    backgroundColor: Colors.primary,
    gap: 8,
  },
  headerCenter: { flex: 1 },
  headerTitle: { color: "#fff", fontSize: 15, fontWeight: "600" },
  cachedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 2,
  },
  cachedBadgeText: { color: "#C5D92D", fontSize: 10, fontWeight: "600" },
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
  drawBtnActive: { backgroundColor: Colors.secondary, borderColor: Colors.secondary },
  drawBtnText: { color: Colors.secondary, fontSize: 13, fontWeight: "600" },
  drawBtnActiveText: { color: "#fff" },

  toolbar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: Colors.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  toolbarColors: { flexDirection: "row", alignItems: "center", gap: 6 },
  colorDot: { width: 20, height: 20, borderRadius: 10, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  colorDotSelected: { transform: [{ scale: 1.3 }], shadowOpacity: 0.5 },
  toolbarWidths: { flexDirection: "row", alignItems: "center", gap: 8 },
  widthBtn: { padding: 4 },
  widthDot: { borderRadius: 20 },
  widthDotSelected: { opacity: 1, transform: [{ scale: 1.3 }] },

  downloadBar: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    gap: 8,
  },
  downloadBarFill: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  downloadBarProgress: {
    height: "100%",
    backgroundColor: "#C5D92D",
    borderRadius: 2,
  },
  downloadInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  downloadText: { color: "rgba(255,255,255,0.8)", fontSize: 13 },

  errorFull: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  errorTitle: { fontSize: 17, fontWeight: "600", color: Colors.text, textAlign: "center" },
  errorSub: { fontSize: 13, color: Colors.textSecondary, textAlign: "center", lineHeight: 19 },

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

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.secondary,
    marginTop: 4,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  drawHint: { position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" },
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

import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
  useWindowDimensions, Platform, Modal, TextInput,
  KeyboardAvoidingView, Image, ScrollView, Linking, FlatList,
} from "react-native";
import * as Sharing from "expo-sharing";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS,
} from "react-native-reanimated";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { Colors } from "@/constants/colors";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";
import * as ScreenOrientation from "expo-screen-orientation";

const OFFLINE_QUEUE_KEY = "inspectproof_markup_offline_queue";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  pageNumber: number;
}

interface TextAnnotation {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  pageNumber: number;
}

type Tool = "pen" | "text";

const PEN_COLORS = [
  { value: "#000000", label: "Black" },
  { value: "#EF4444", label: "Red" },
  { value: "#F59E0B", label: "Yellow" },
  { value: "#22C55E", label: "Green" },
  { value: "#3B82F6", label: "Blue" },
  { value: "#FFFFFF", label: "White" },
];
const PEN_WIDTHS = [2, 4, 7];

const CACHE_DIR =
  Platform.OS !== "web"
    ? (FileSystem.cacheDirectory ?? "") + "inspectproof-docs/"
    : "";

function pointsToPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
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
  const urlNoQuery = url.split("?")[0];
  const rawExt = urlNoQuery.split(".").pop()?.toLowerCase();
  const lastSegment = urlNoQuery.split("/").pop() ?? "";
  const hasRealExt =
    !!rawExt && rawExt.length <= 4 && rawExt !== lastSegment;
  const ext = hasRealExt
    ? rawExt
    : mimeType
    ? mimeToExt(mimeType)
    : null;
  const safe = url.replace(/[^a-z0-9]/gi, "_");
  const trimmed = safe.slice(Math.max(0, safe.length - 80));
  return ext ? `${trimmed}.${ext}` : trimmed;
}

// ── Draggable + pinch-to-scale text annotation component ─────────────────────

interface DraggableTextProps {
  ann: TextAnnotation;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onScale: (id: string, fontSize: number) => void;
}

function DraggableText({ ann, isSelected, onSelect, onMove, onScale }: DraggableTextProps) {
  const tx = useSharedValue(ann.x);
  const ty = useSharedValue(ann.y);
  const savedTx = useSharedValue(ann.x);
  const savedTy = useSharedValue(ann.y);
  const pinchScale = useSharedValue(1);
  const savedPinchScale = useSharedValue(1);

  // Sync position if parent changes (e.g. on mount or external update)
  useEffect(() => {
    tx.value = ann.x;
    ty.value = ann.y;
    savedTx.value = ann.x;
    savedTy.value = ann.y;
  }, [ann.x, ann.y]);

  const selectCb = useCallback(() => onSelect(), [onSelect]);
  const moveCb = useCallback(
    (x: number, y: number) => onMove(ann.id, x, y),
    [ann.id, onMove]
  );
  const scaleCb = useCallback(
    (s: number) => {
      const newSize = Math.round(Math.max(10, Math.min(120, ann.fontSize * s)));
      onScale(ann.id, newSize);
    },
    [ann.id, ann.fontSize, onScale]
  );

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      runOnJS(selectCb)();
    })
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      runOnJS(moveCb)(tx.value, ty.value);
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedPinchScale.value = pinchScale.value;
    })
    .onUpdate((e) => {
      pinchScale.value = Math.max(0.25, Math.min(8, savedPinchScale.value * e.scale));
    })
    .onEnd(() => {
      runOnJS(scaleCb)(pinchScale.value);
      // reset visual scale — parent will re-render with new fontSize
      pinchScale.value = 1;
      savedPinchScale.value = 1;
    });

  // Tap just selects the annotation — prevents the touch leaking to the
  // background Pressable (which would create a new annotation).
  const tapGesture = Gesture.Tap()
    .maxDuration(500)
    .onEnd(() => { runOnJS(selectCb)(); });

  const composed = Gesture.Simultaneous(panGesture, pinchGesture, tapGesture);

  const animStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: pinchScale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[animStyle, styles.textAnnotationView, {
        borderColor: isSelected ? "rgba(70,109,181,0.8)" : "transparent",
        borderWidth: isSelected ? 1.5 : 0,
      }]}>
        <Text
          style={{
            color: ann.color,
            fontSize: ann.fontSize,
            fontWeight: "600",
            ...(ann.color !== "#000000" && ann.color !== "#000" && {
              textShadowColor: "rgba(0,0,0,0.5)",
              textShadowOffset: { width: 1, height: 1 },
              textShadowRadius: 2,
            }),
          }}
        >
          {ann.text}
        </Text>
        {isSelected && (
          <View style={styles.dragHandle}>
            <Feather name="move" size={10} color="rgba(255,255,255,0.7)" />
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function DocumentViewerScreen() {
  const {
    url, name, mimeType, inspectionId, itemId, projectId, documentId,
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
  const { token, user } = useAuth();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";

  // ── Download state ──────────────────────────────────────────────────────────
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadState, setDownloadState] = useState<
    "idle" | "cached" | "downloading" | "done" | "error"
  >("idle");
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  // ── Drawing state ───────────────────────────────────────────────────────────
  const [drawing, setDrawing] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("pen");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<{ x: number; y: number }[]>([]);
  const [selectedColor, setSelectedColor] = useState("#000000");
  const [selectedWidth, setSelectedWidth] = useState(4);
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [pendingPos, setPendingPos] = useState({ x: 100, y: 100 });
  const [textInputValue, setTextInputValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState(false);

  // Issue-linking state
  const [showIssuePicker, setShowIssuePicker] = useState(false);
  const [projectIssues, setProjectIssues] = useState<{ id: number; title: string; severity: string }[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const containerRef = useRef<View>(null);
  const drawLayerRef = useRef<View>(null);
  const webviewRef = useRef<WebView>(null);
  const currentPoints = useRef<{ x: number; y: number }[]>([]);
  const selectedColorRef = useRef(selectedColor);
  const selectedWidthRef = useRef(selectedWidth);
  const activeToolRef = useRef<Tool>("pen");
  const currentPageRef = useRef(1);
  const pageNavScrollPending = useRef(false);

  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { selectedWidthRef.current = selectedWidth; }, [selectedWidth]);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // Reset ALL annotation state when the document URL changes — Expo Router can
  // reuse this component instance across navigations (same route, new params),
  // so we must explicitly wipe strokes from the previous document.
  useEffect(() => {
    setStrokes([]);
    setLiveStroke([]);
    setTextAnnotations([]);
    setSelectedTextId(null);
    setCurrentPage(1);
    setDrawing(false);
    setSelectedIssueId(null);
    setOfflineSaved(false);
    currentPageRef.current = 1;
  }, [url]);

  // ── Offline queue: drain queued payloads when connectivity is restored ────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (!state.isConnected) return;
      try {
        const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return;
        const queue: any[] = JSON.parse(raw);
        if (!queue.length) return;

        const remaining: any[] = [];
        for (const payload of queue) {
          try {
            const res = await fetch(`${baseUrl}/api/markup/generate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify(payload),
            });
            if (!res.ok) remaining.push(payload);
          } catch {
            remaining.push(payload);
          }
        }
        await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
      } catch { /* non-critical */ }
    });
    return () => unsubscribe();
  }, [baseUrl, token]);

  const tabBarHeight = useTabBarHeight();
  const headerH = 56;
  const toolbarH = drawing ? 56 : 0;
  const bodyH = screenH - insets.top - headerH - toolbarH - tabBarHeight;

  // ── Screen orientation: unlock on mount, re-lock on unmount ─────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
    return () => {
      if (Platform.OS !== "web") {
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        ).catch(() => {});
      }
    };
  }, []);

  // ── Download / cache logic ──────────────────────────────────────────────────

  useEffect(() => {
    if (!url) return;

    if (Platform.OS === "web") {
      (async () => {
        try {
          setDownloadState("downloading");
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

    (async () => {
      try {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
        const filename = urlToFilename(url, mimeType);
        const destPath = CACHE_DIR + filename;

        const info = await FileSystem.getInfoAsync(destPath);
        if (info.exists && info.size && info.size > 0) {
          setLocalUri(destPath);
          setDownloadState("cached");
          return;
        }

        setDownloadState("downloading");
        setDownloadProgress(0);

        const dl = FileSystem.createDownloadResumable(
          url,
          destPath,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
          (prog) => {
            if (prog.totalBytesExpectedToWrite > 0) {
              setDownloadProgress(
                prog.totalBytesWritten / prog.totalBytesExpectedToWrite
              );
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

  // FileSystem.cacheDirectory already returns a file:// prefixed URI on both iOS
  // and Android, so we must NOT add file:// again. Just use localUri directly.
  const webviewUri = localUri ?? null;
  const isPdf =
    mimeType === "application/pdf" || name?.toLowerCase().endsWith(".pdf");
  const isImage =
    mimeType?.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|bmp)$/i.test(name ?? "");

  // ── PDF rendering strategy ──────────────────────────────────────────────────
  //
  // Loading PDFs from local file:// URIs in a WebView is unreliable:
  //   • iOS WKWebView renders PDFs via the native viewer — onLoadEnd may not fire,
  //     leaving the spinner up forever even when the content is visible.
  //   • Android WebView cannot render PDFs from file:// at all (blank screen).
  //
  // Solution: append ?token= to the URL so the WebView can authenticate without
  // custom headers (the auth middleware supports ?token= for clients that cannot
  // set headers, e.g. <img> tags and WebView navigation requests).
  //   • iOS WKWebView renders HTTPS PDFs natively and fires onLoadEnd correctly.
  //   • Android uses Google Docs Viewer with the token-bearing URL so it can
  //     fetch the document from the production server.
  //
  // The local FileSystem download (happening in parallel) is kept solely to power
  // the share/download button once the file is ready.

  // Build a URL with the auth token embedded as a query parameter so WebViews
  // can load authenticated storage objects without needing an Authorization header.
  const tokenizedUrl = useMemo(() => {
    if (!url) return url;
    const separator = url.includes("?") ? "&" : "?";
    return token ? `${url}${separator}token=${encodeURIComponent(token)}` : url;
  }, [url, token]);

  const useGoogleDocsViewer = Platform.OS === "android" && isPdf;
  const pdfRenderUri = isPdf && tokenizedUrl && Platform.OS !== "web"
    ? Platform.OS === "android"
      ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(tokenizedUrl)}`
      : tokenizedUrl   // iOS WKWebView: load remote HTTPS URL with ?token= for auth
    : null;

  // Safety timeout: if onLoadEnd hasn't fired after 8 s, clear the spinner anyway.
  // WKWebView on iOS sometimes doesn't fire onLoadEnd for PDFs loaded via HTTPS,
  // even though the PDF is already visible beneath the overlay.
  useEffect(() => {
    if (!isPdf || Platform.OS === "web") return;
    const timer = setTimeout(() => setWebLoading(false), 8000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfRenderUri]);

  // For the "Open in browser" fallback — uses the tokenized URL so auth works
  const openInBrowser = useCallback(async () => {
    if (!tokenizedUrl) return;
    try {
      await Linking.openURL(tokenizedUrl);
    } catch {
      Alert.alert("Error", "Could not open the document. Please try again.");
    }
  }, [tokenizedUrl]);

  // ── WebView scroll ↔ currentPage sync (native PDF only) ───────────────────────
  // When markup mode is entered we inject JS to read the WebView's scroll position
  // and derive which page the user is looking at, then update currentPage to match.
  // When the user taps ◀/▶ during markup we scroll the WebView to that page.

  const injectDetectPage = useCallback(() => {
    if (Platform.OS === "web" || !isPdf) return;
    webviewRef.current?.injectJavaScript(`
      (function() {
        try {
          var y = window.pageYOffset
            || (document.documentElement && document.documentElement.scrollTop)
            || 0;
          var vh = window.innerHeight
            || (document.documentElement && document.documentElement.clientHeight)
            || 1;
          var page = Math.max(1, Math.floor(y / vh) + 1);
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'pageDetect', page: page })
          );
        } catch(e) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: 'pageDetect', page: 1 })
          );
        }
      })();
      true;
    `);
  }, [isPdf]);

  const injectScrollToPage = useCallback((page: number) => {
    if (Platform.OS === "web" || !isPdf) return;
    webviewRef.current?.injectJavaScript(`
      (function() {
        try {
          var vh = window.innerHeight
            || (document.documentElement && document.documentElement.clientHeight)
            || window.screen.height;
          window.scrollTo({ top: (${page} - 1) * vh, behavior: 'instant' });
        } catch(e) {}
      })();
      true;
    `);
  }, [isPdf]);

  // When drawing mode is entered the markup toolbar appears (+56 px), which shrinks
  // bodyH, causing the WebView to reflow and scroll back to the top.  We capture the
  // current page BEFORE the reflow (currentPageRef is always up-to-date) and then
  // restore the scroll position once the layout has settled.
  useEffect(() => {
    if (!drawing || !isPdf || Platform.OS === "web") return;
    const savedPage = currentPageRef.current;
    pageNavScrollPending.current = false;
    // Give the WebView layout reflow time to settle, then scroll back.
    const t = setTimeout(() => {
      injectScrollToPage(savedPage);
      pageNavScrollPending.current = true;
    }, 300);
    return () => clearTimeout(t);
  }, [drawing]);

  // When currentPage changes via ◀/▶ while in markup mode, scroll WebView to match
  useEffect(() => {
    if (!drawing || !isPdf || Platform.OS === "web") return;
    if (!pageNavScrollPending.current) return; // still restoring position on entry
    injectScrollToPage(currentPage);
  }, [currentPage]);

  const onWebViewMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "pageDetect" && typeof data.page === "number") {
        setCurrentPage(data.page);
        currentPageRef.current = data.page;
      }
    } catch {}
  }, []);

  // ── Drawing gesture (pen mode) — GestureHandler for new-arch compatibility ──

  const onPenStart = useCallback((x: number, y: number) => {
    currentPoints.current = [{ x, y }];
    setLiveStroke([{ x, y }]);
  }, []);

  const onPenMove = useCallback((x: number, y: number) => {
    currentPoints.current.push({ x, y });
    setLiveStroke([...currentPoints.current]);
  }, []);

  const onPenEnd = useCallback(() => {
    const pts = [...currentPoints.current];
    currentPoints.current = [];
    setLiveStroke([]);
    if (pts.length > 1) {
      setStrokes((prev) => [
        ...prev,
        {
          points: pts,
          color: selectedColorRef.current,
          width: selectedWidthRef.current,
          pageNumber: currentPageRef.current,
        },
      ]);
    }
  }, []);

  const penGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .onStart((e) => {
          "worklet";
          runOnJS(onPenStart)(e.x, e.y);
        })
        .onUpdate((e) => {
          "worklet";
          runOnJS(onPenMove)(e.x, e.y);
        })
        .onEnd(() => {
          "worklet";
          runOnJS(onPenEnd)();
        })
        .onFinalize(() => {
          "worklet";
          runOnJS(onPenEnd)();
        }),
    [onPenStart, onPenMove, onPenEnd]
  );

  // ── Add text annotation ──────────────────────────────────────────────────────

  const openTextAtPos = (x: number, y: number) => {
    setPendingPos({ x, y });
    setTextInputValue("");
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Add text",
        "Type your annotation",
        (text) => {
          if (text?.trim()) {
            setTextAnnotations((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                text: text.trim(),
                x,
                y,
                fontSize: 18,
                color: selectedColorRef.current,
                pageNumber: currentPageRef.current,
              },
            ]);
          }
        },
        "plain-text",
        ""
      );
    } else {
      setShowTextModal(true);
    }
  };

  const confirmTextInput = () => {
    if (textInputValue.trim()) {
      setTextAnnotations((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          text: textInputValue.trim(),
          x: pendingPos.x,
          y: pendingPos.y,
          fontSize: 18,
          color: selectedColorRef.current,
          pageNumber: currentPageRef.current,
        },
      ]);
    }
    setShowTextModal(false);
    setTextInputValue("");
  };

  // ── Save markup ──────────────────────────────────────────────────────────────

  const fetchWithAuth = useCallback(
    async (path: string, opts?: RequestInit) => {
      const res = await fetch(`${baseUrl}${path}`, {
        ...opts,
        headers: {
          ...(opts?.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [baseUrl, token]
  );

  // ── Issue picker: load project issues ─────────────────────────────────────
  const openIssuePicker = useCallback(async () => {
    if (!projectId) return;
    setIssuesLoading(true);
    setShowIssuePicker(true);
    try {
      const data = await fetchWithAuth(`/api/projects/${projectId}/issues`);
      const list = Array.isArray(data) ? data : (data?.issues ?? []);
      setProjectIssues(list.map((i: any) => ({ id: i.id, title: i.title, severity: i.severity })));
    } catch {
      setProjectIssues([]);
    } finally {
      setIssuesLoading(false);
    }
  }, [projectId, fetchWithAuth]);

  const goBack = useCallback(() => {
    if (inspectionId) {
      router.replace({
        pathname: "/inspection/conduct/[id]" as any,
        params: { id: inspectionId },
      });
    } else {
      router.back();
    }
  }, [inspectionId]);

  const saveMarkup = async () => {
    if (strokes.length === 0 && textAnnotations.length === 0) { goBack(); return; }
    if (!inspectionId && !projectId) { goBack(); return; }

    setUploading(true);
    try {
      // Build human-readable markup name
      const baseName = (name || "Document").replace(/\.[^.]+$/, "");
      const dateStr = new Date().toLocaleDateString("en-AU", {
        day: "numeric", month: "short", year: "numeric",
      });
      const userStr = user ? `${user.firstName} ${user.lastName}`.trim() : "";

      let inspectionLabel = "";
      if (inspectionId) {
        try {
          const inspData = await fetchWithAuth(`/api/inspections/${inspectionId}`);
          const inspType = (inspData.inspectionType || "Inspection")
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c: string) => c.toUpperCase());
          inspectionLabel = inspType;
        } catch {
          inspectionLabel = `Inspection #${inspectionId}`;
        }
      }

      const nameParts = [baseName, "Marked Up", inspectionLabel, dateStr, userStr]
        .filter(Boolean)
        .join(" - ");
      const docName = nameParts;

      setSelectedTextId(null); // clear selection ring before save

      if (!url) throw new Error("No document URL");

      // ── Build per-page structured annotation payload ──────────────────────
      // We send the raw stroke/text data to the server, which renders them
      // server-side onto the PDF at the correct scale.  This approach works
      // equally on iOS and Android because it never screenshots the WebView.
      const annotatedPages = annotatedPageNumbers.map((pageNum) => ({
        pageNumber: pageNum,
        strokes: strokes
          .filter((s) => s.pageNumber === pageNum)
          .map((s) => ({ points: s.points, color: s.color, width: s.width })),
        textAnnotations: textAnnotations
          .filter((a) => a.pageNumber === pageNum)
          .map((a) => ({ text: a.text, x: a.x, y: a.y, fontSize: a.fontSize, color: a.color })),
        viewportW: screenW,
        viewportH: bodyH,
      }));

      const payload = {
        documentUrl: url,
        mimeType: mimeType || undefined,
        annotatedPages,
        documentName: docName,
        projectId: projectId ? parseInt(projectId) : undefined,
        inspectionId: inspectionId ? parseInt(inspectionId) : undefined,
        itemId: itemId ? parseInt(itemId) : undefined,
        issueId: selectedIssueId ?? undefined,
      };

      // ── Offline-first: check connectivity ─────────────────────────────────
      let isOnline = true;
      if (Platform.OS !== "web") {
        const netState = await NetInfo.fetch();
        isOnline = !!netState.isConnected;
      }

      if (!isOnline) {
        // Queue the payload for later upload
        try {
          const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
          const queue: any[] = raw ? JSON.parse(raw) : [];
          queue.push(payload);
          await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
        } catch { /* non-critical */ }

        setOfflineSaved(true);
        setUploading(false);
        Alert.alert(
          "Saved locally",
          "No network connection detected. Your markup has been saved on this device and will upload automatically when connectivity returns.",
          [{ text: "OK", onPress: goBack }]
        );
        return;
      }

      // ── Online: send to server ─────────────────────────────────────────────
      const result = await fetchWithAuth("/api/markup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!result?.success) throw new Error("Markup generation failed");

      const issueNote = selectedIssueId ? " and linked to the selected issue" : "";
      Alert.alert("Saved", `Marked-up PDF "${docName}" saved${issueNote}.`, [
        { text: "OK", onPress: goBack },
      ]);
      return; // navigation handled by alert callback
    } catch {
      Alert.alert("Save failed", "Could not save the markup. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isOffline = downloadState === "cached";
  const isReady =
    downloadState === "done" || downloadState === "cached";

  // Whether to show the document body (PDFs render immediately from remote URL; others wait for download)
  const showDocumentBody =
    Platform.OS === "web"
      ? isReady && !!webviewUri               // web: blob URL from fetch
      : isPdf
        ? !!pdfRenderUri                      // native PDF: remote URL ready immediately
        : isReady && !!webviewUri;            // other files: wait for local download

  // Show only annotations for the current page so strokes from other pages
  // don't bleed through onto the visible view.
  const visibleStrokes = strokes.filter((s) => s.pageNumber === currentPage);
  const visibleTexts = textAnnotations.filter((a) => a.pageNumber === currentPage);

  const annotatedPageNumbers = Array.from(
    new Set([...strokes.map((s) => s.pageNumber), ...textAnnotations.map((a) => a.pageNumber)])
  ).sort((a, b) => a - b);

  const hasMarkup = annotatedPageNumbers.length > 0;

  const selectedText = visibleTexts.find((a) => a.id === selectedTextId);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={12} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {name || "Document"}
          </Text>
          {isOffline && (
            <View style={styles.cachedBadge}>
              <Feather name="wifi-off" size={9} color="#C5D92D" />
              <Text style={styles.cachedBadgeText}>Available offline</Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          {/* Download offline button — visible on native when doc is ready */}
          {Platform.OS !== "web" && isReady && localUri && !drawing && (
            <Pressable
              hitSlop={10}
              onPress={async () => {
                try {
                  const canShare = await Sharing.isAvailableAsync();
                  if (canShare) {
                    await Sharing.shareAsync(localUri, {
                      mimeType: mimeType || "application/octet-stream",
                      dialogTitle: name || "Document",
                      UTI: isPdf ? "com.adobe.pdf" : "public.data",
                    });
                  } else {
                    Alert.alert("Not available", "Sharing is not supported on this device.");
                  }
                } catch {
                  Alert.alert("Error", "Could not open the share sheet.");
                }
              }}
              style={styles.iconBtn}
            >
              <Feather name="download" size={20} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
          {(inspectionId || projectId) && isReady && (
            <Pressable
              disabled={uploading}
              onPress={() => {
                if (drawing && hasMarkup) {
                  const target =
                    inspectionId && itemId
                      ? "attach it to the checklist item"
                      : "save it to the project";
                  Alert.alert(
                    "Save markup?",
                    `Save your annotations and ${target}.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Save", onPress: saveMarkup },
                      {
                        text: "Discard",
                        style: "destructive",
                        onPress: () => {
                          setStrokes([]);
                          setLiveStroke([]);
                          setTextAnnotations([]);
                          setSelectedTextId(null);
                          setDrawing(false);
                          setActiveTool("pen");
                        },
                      },
                    ]
                  );
                } else {
                  if (drawing) {
                    setStrokes([]);
                    setLiveStroke([]);
                    setTextAnnotations([]);
                    setSelectedTextId(null);
                    setActiveTool("pen");
                  }
                  setDrawing((d) => !d);
                }
              }}
              style={[styles.drawBtn, drawing && styles.drawBtnActive, uploading && { opacity: 0.4 }]}
            >
              <Feather
                name="edit-2"
                size={14}
                color={drawing ? "#fff" : Colors.secondary}
              />
              <Text
                style={[
                  styles.drawBtnText,
                  drawing && styles.drawBtnActiveText,
                ]}
              >
                {drawing
                  ? hasMarkup
                    ? "Save"
                    : "Cancel"
                  : "Markup"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Drawing toolbar ── */}
      {drawing && (
        <View style={styles.toolbar}>
          {/* Tool selector */}
          <Pressable
            onPress={() => {
              setActiveTool("pen");
              setSelectedTextId(null);
            }}
            style={[
              styles.toolBtn,
              activeTool === "pen" && styles.toolBtnActive,
            ]}
          >
            <Feather
              name="edit-3"
              size={15}
              color={activeTool === "pen" ? "#fff" : "rgba(255,255,255,0.6)"}
            />
          </Pressable>
          <Pressable
            onPress={() => setActiveTool("text")}
            style={[
              styles.toolBtn,
              activeTool === "text" && styles.toolBtnActive,
            ]}
          >
            <Text
              style={{
                color: activeTool === "text" ? "#fff" : "rgba(255,255,255,0.6)",
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              T
            </Text>
          </Pressable>

          <View style={styles.toolbarDivider} />

          {/* Color picker */}
          <View style={styles.toolbarColors}>
            {PEN_COLORS.map((c) => (
              <Pressable
                key={c.value}
                onPress={() => {
                  setSelectedColor(c.value);
                  if (selectedTextId) {
                    setTextAnnotations((prev) =>
                      prev.map((a) =>
                        a.id === selectedTextId ? { ...a, color: c.value } : a
                      )
                    );
                  }
                }}
                style={[
                  styles.colorDot,
                  { backgroundColor: c.value },
                  c.value === "#FFFFFF" && {
                    borderWidth: 1,
                    borderColor: "#ccc",
                  },
                  selectedColor === c.value && styles.colorDotSelected,
                ]}
              />
            ))}
          </View>

          {/* Pen widths — only for pen mode */}
          {activeTool === "pen" && (
            <View style={styles.toolbarWidths}>
              {PEN_WIDTHS.map((w) => (
                <Pressable
                  key={w}
                  onPress={() => setSelectedWidth(w)}
                  style={styles.widthBtn}
                >
                  <View
                    style={[
                      styles.widthDot,
                      {
                        width: w * 2.5,
                        height: w * 2.5,
                        backgroundColor: selectedColor,
                      },
                      selectedWidth === w && styles.widthDotSelected,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          )}

          {/* Text size controls — only when text selected */}
          {activeTool === "text" && selectedText && (
            <View style={styles.toolbarWidths}>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  setTextAnnotations((prev) =>
                    prev.map((a) =>
                      a.id === selectedTextId
                        ? { ...a, fontSize: Math.max(10, a.fontSize - 2) }
                        : a
                    )
                  )
                }
                style={styles.sizeBtn}
              >
                <Text style={styles.sizeBtnText}>A−</Text>
              </Pressable>
              <Text style={styles.sizeLabel}>{selectedText.fontSize}</Text>
              <Pressable
                hitSlop={8}
                onPress={() =>
                  setTextAnnotations((prev) =>
                    prev.map((a) =>
                      a.id === selectedTextId
                        ? { ...a, fontSize: Math.min(72, a.fontSize + 2) }
                        : a
                    )
                  )
                }
                style={styles.sizeBtn}
              >
                <Text style={styles.sizeBtnText}>A+</Text>
              </Pressable>
            </View>
          )}

          {/* Page navigator — PDF only */}
          {isPdf && (
            <>
              <View style={styles.toolbarDivider} />
              <View style={styles.pageNav}>
                <Pressable
                  hitSlop={10}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={styles.pageNavBtn}
                >
                  <Feather name="chevron-left" size={14} color="#fff" />
                </Pressable>
                <Text style={styles.pageNavLabel}>
                  {currentPage}
                  {annotatedPageNumbers.includes(currentPage) && (
                    <Text style={styles.pageNavAnnotated}> ●</Text>
                  )}
                </Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => setCurrentPage((p) => p + 1)}
                  style={styles.pageNavBtn}
                >
                  <Feather name="chevron-right" size={14} color="#fff" />
                </Pressable>
              </View>
            </>
          )}

          <View style={{ flex: 1 }} />

          {/* Link to issue button — only when projectId available */}
          {projectId && (
            <Pressable
              onPress={openIssuePicker}
              hitSlop={8}
              style={[
                styles.iconBtn,
                selectedIssueId && { backgroundColor: "rgba(197,217,45,0.2)", borderRadius: 6 },
              ]}
            >
              <Feather
                name="link"
                size={16}
                color={selectedIssueId ? Colors.secondary : "rgba(255,255,255,0.6)"}
              />
            </Pressable>
          )}

          {/* Undo / clear — scoped to the current page */}
          {activeTool === "pen" && (
            <Pressable
              onPress={() =>
                setStrokes((prev) => {
                  // Remove the last stroke belonging to the current page
                  const idx = [...prev]
                    .map((s, i) => (s.pageNumber === currentPage ? i : -1))
                    .filter((i) => i >= 0)
                    .pop();
                  if (idx === undefined) return prev;
                  return prev.filter((_, i) => i !== idx);
                })
              }
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Feather name="corner-up-left" size={18} color="#fff" />
            </Pressable>
          )}
          {activeTool === "text" && selectedTextId && (
            <Pressable
              onPress={() => {
                setTextAnnotations((prev) =>
                  prev.filter((a) => a.id !== selectedTextId)
                );
                setSelectedTextId(null);
              }}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Feather name="trash-2" size={17} color="rgba(255,80,80,0.8)" />
            </Pressable>
          )}
          <Pressable
            onPress={() => {
              // Clear only the current page's annotations
              setStrokes((prev) => prev.filter((s) => s.pageNumber !== currentPage));
              setLiveStroke([]);
              setTextAnnotations((prev) => prev.filter((a) => a.pageNumber !== currentPage));
              setSelectedTextId(null);
            }}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Feather name="trash-2" size={18} color="rgba(255,255,255,0.5)" />
          </Pressable>
          {uploading && (
            <ActivityIndicator size="small" color={Colors.secondary} />
          )}
        </View>
      )}

      {/* ── Download progress ── (hidden for native PDFs — they render from remote URL immediately) */}
      {downloadState === "downloading" && !(Platform.OS !== "web" && isPdf) && (
        <View style={styles.downloadBar}>
          <View style={styles.downloadBarFill}>
            <View
              style={[
                styles.downloadBarProgress,
                { width: `${Math.round(downloadProgress * 100)}%` },
              ]}
            />
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

      {/* ── Error state ── (suppressed for native PDFs — they render from remote URL regardless) */}
      {downloadState === "error" && !(Platform.OS !== "web" && isPdf) && (
        <View style={styles.errorFull}>
          <Feather name="alert-circle" size={44} color={Colors.textTertiary} />
          <Text style={styles.errorTitle}>Could not load document</Text>
          <Text style={styles.errorSub}>
            {downloadError || "Check your connection and try again."}
          </Text>
          <Pressable
            onPress={() => {
              setDownloadState("idle");
              setDownloadError(null);
              setLocalUri(null);
              setDownloadState("downloading");
              setDownloadProgress(0);

              if (Platform.OS === "web") {
                (async () => {
                  try {
                    const res = await fetch(url, {
                      headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : {},
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

              (async () => {
                try {
                  await FileSystem.makeDirectoryAsync(CACHE_DIR, {
                    intermediates: true,
                  });
                  const filename = urlToFilename(url, mimeType);
                  const destPath = CACHE_DIR + filename;
                  const dl = FileSystem.createDownloadResumable(
                    url,
                    destPath,
                    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
                    (prog) => {
                      if (prog.totalBytesExpectedToWrite > 0)
                        setDownloadProgress(
                          prog.totalBytesWritten /
                            prog.totalBytesExpectedToWrite
                        );
                    }
                  );
                  downloadRef.current = dl;
                  const result = await dl.downloadAsync();
                  if (result?.uri) {
                    setLocalUri(result.uri);
                    setDownloadState("done");
                  } else setDownloadState("error");
                } catch (e: any) {
                  setDownloadState("error");
                  setDownloadError(e?.message);
                }
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
      {showDocumentBody && (
        <View
          ref={containerRef}
          style={[styles.body, { height: bodyH }]}
          collapsable={false}
        >
          {Platform.OS === "web" ? (
            React.createElement("iframe", {
              src: webviewUri,
              title: name || "Document",
              style: {
                width: "100%",
                height: "100%",
                border: "none",
                flex: 1,
                backgroundColor: "#fff",
                pointerEvents: drawing ? "none" : "auto",
              },
              onLoad: () => setWebLoading(false),
              onError: () => {
                setWebLoading(false);
                setWebError(true);
              },
            })
          ) : isPdf && pdfRenderUri ? (
            /* Native PDF renderer — iOS uses WKWebView + HTTPS URL directly (reliable
               onLoadEnd); Android uses Google Docs Viewer (can't render PDFs natively).
               Both load from the remote authenticated URL — no file:// needed. */
            <WebView
              ref={webviewRef}
              source={{ uri: pdfRenderUri }}
              style={styles.webview}
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={() => setWebLoading(false)}
              onError={() => {
                setWebLoading(false);
                setWebError(true);
              }}
              javaScriptEnabled
              domStorageEnabled
              scalesPageToFit
              scrollEnabled
            />
          ) : isImage ? (
            /* Native image renderer — no WKWebView sandboxing; supports pinch-zoom */
            <ScrollView
              style={styles.webview}
              contentContainerStyle={styles.imageContainer}
              maximumZoomScale={8}
              minimumZoomScale={1}
              bouncesZoom
              centerContent
              scrollEnabled={!drawing}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri: webviewUri! }}
                style={[styles.imageContent, { height: bodyH }]}
                resizeMode="contain"
                onLoad={() => setWebLoading(false)}
                onError={() => { setWebLoading(false); setWebError(true); }}
              />
            </ScrollView>
          ) : (
            <WebView
              ref={webviewRef}
              source={{ uri: webviewUri! }}
              style={styles.webview}
              onLoadStart={() => setWebLoading(true)}
              onLoadEnd={() => setWebLoading(false)}
              onError={() => {
                setWebLoading(false);
                setWebError(true);
              }}
              onMessage={onWebViewMessage}
              scrollEnabled={!drawing}
              bounces={!drawing}
              originWhitelist={["*", "file://*"]}
              allowFileAccess
              allowUniversalAccessFromFileURLs
              allowFileAccessFromFileURLs
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              injectedJavaScript={`
                (function() {
                  // Set viewport to allow free pinch-zoom
                  function setZoomMeta() {
                    var meta = document.querySelector('meta[name="viewport"]');
                    if (!meta) {
                      meta = document.createElement('meta');
                      meta.name = 'viewport';
                      (document.head || document.documentElement).appendChild(meta);
                    }
                    meta.content = 'width=device-width, initial-scale=1.0, user-scalable=yes, minimum-scale=0.25, maximum-scale=10.0';
                  }
                  setZoomMeta();
                  // Re-apply after any framework resets it
                  var mo = new MutationObserver(setZoomMeta);
                  var head = document.head || document.documentElement;
                  if (head) mo.observe(head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
                })();
                true;
              `}
              injectedJavaScriptBeforeContentLoaded={`
                (function() {
                  var meta = document.createElement('meta');
                  meta.name = 'viewport';
                  meta.content = 'width=device-width, initial-scale=1.0, user-scalable=yes, minimum-scale=0.25, maximum-scale=10.0';
                  (document.head || document.documentElement).appendChild(meta);
                })();
                true;
              `}
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
              <Feather
                name="alert-circle"
                size={36}
                color={Colors.textTertiary}
              />
              <Text style={styles.loadingText}>Unable to render this file</Text>
              <Pressable
                onPress={() => {
                  setWebError(false);
                  setWebLoading(true);
                }}
                style={styles.retryBtn}
              >
                <Feather name="refresh-cw" size={15} color="#fff" />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
              {url && Platform.OS !== "web" && (
                <Pressable
                  onPress={openInBrowser}
                  style={[styles.retryBtn, { marginTop: 10, backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.secondary }]}
                >
                  <Feather name="external-link" size={15} color={Colors.secondary} />
                  <Text style={[styles.retryText, { color: Colors.secondary }]}>Open in browser</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── Drawing layer ── */}
          {/* Always rendered when there are annotations or when drawing, so strokes
              remain visible after toggling out of markup mode. Non-interactive when
              not actively drawing so scroll/zoom gestures pass through.
              On web the iframe has pointer-events:none when drawing so events
              reach this overlay. */}
          {(drawing || hasMarkup) && (
            <View
              ref={drawLayerRef}
              style={StyleSheet.absoluteFill}
              pointerEvents={drawing ? "box-none" : "none"}
              collapsable={false}
            >

              {/* SVG: completed strokes + live stroke (non-interactive) */}
              <Svg
                style={StyleSheet.absoluteFill}
                width={screenW}
                height={bodyH}
                pointerEvents="none"
              >
                {visibleStrokes.map((s, i) => (
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

              {/* Text mode: fullscreen tap target for placing new annotations.
                  Rendered BEFORE (below) the DraggableText views so existing
                  annotations sit on top and can receive their own gestures. */}
              {activeTool === "text" && (
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={(e) => {
                    setSelectedTextId(null);
                    openTextAtPos(
                      e.nativeEvent.locationX,
                      e.nativeEvent.locationY
                    );
                  }}
                />
              )}

              {/* Text annotations — own pan+pinch gestures, sit ABOVE the Pressable */}
              {visibleTexts.map((ann) => (
                <DraggableText
                  key={ann.id}
                  ann={ann}
                  isSelected={selectedTextId === ann.id}
                  onSelect={() => setSelectedTextId(ann.id)}
                  onMove={(id, x, y) =>
                    setTextAnnotations((prev) =>
                      prev.map((a) => (a.id === id ? { ...a, x, y } : a))
                    )
                  }
                  onScale={(id, fontSize) =>
                    setTextAnnotations((prev) =>
                      prev.map((a) => (a.id === id ? { ...a, fontSize } : a))
                    )
                  }
                />
              ))}

              {/* Pen mode: GestureDetector on TOP captures all drawing touches */}
              {activeTool === "pen" && (
                <GestureDetector gesture={penGesture}>
                  <View style={StyleSheet.absoluteFill} />
                </GestureDetector>
              )}
            </View>
          )}

          {/* ── Persistent PDF page navigation — always visible, outside drawing mode ── */}
          {isPdf && !drawing && !webLoading && (
            <View style={styles.pageNavBar} pointerEvents="box-none">
              <View style={styles.pageNavBarInner}>
                <Pressable
                  hitSlop={10}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  style={[styles.pageNavBarBtn, currentPage <= 1 && { opacity: 0.35 }]}
                >
                  <Feather name="chevron-left" size={16} color="#fff" />
                </Pressable>
                <Text style={styles.pageNavBarLabel}>
                  Page {currentPage}
                  {annotatedPageNumbers.includes(currentPage) ? " ●" : ""}
                </Text>
                <Pressable
                  hitSlop={10}
                  onPress={() => setCurrentPage((p) => p + 1)}
                  style={styles.pageNavBarBtn}
                >
                  <Feather name="chevron-right" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>
          )}

          {/* Draw mode hint */}
          {drawing && !hasMarkup && !webLoading && (
            <View style={styles.drawHint} pointerEvents="none">
              <View style={styles.drawHintPill}>
                <Feather
                  name={activeTool === "text" ? "type" : "edit-2"}
                  size={12}
                  color="#fff"
                />
                <Text style={styles.drawHintText}>
                  {activeTool === "text"
                    ? "Tap to add text"
                    : "Draw on the document"}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── Text input modal (Android) ── */}
      <Modal
        visible={showTextModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTextModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior="padding"
        >
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add text annotation</Text>
            <TextInput
              style={styles.modalInput}
              value={textInputValue}
              onChangeText={setTextInputValue}
              placeholder="Enter annotation text…"
              placeholderTextColor="rgba(0,0,0,0.35)"
              autoFocus
              multiline={false}
              returnKeyType="done"
              onSubmitEditing={confirmTextInput}
            />
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => {
                  setShowTextModal(false);
                  setTextInputValue("");
                }}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmTextInput}
                style={[styles.modalBtn, styles.modalBtnConfirm]}
              >
                <Text style={styles.modalBtnConfirmText}>Add</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Issue picker modal ── */}
      <Modal
        visible={showIssuePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowIssuePicker(false)}
      >
        <View style={styles.issuePickerBackdrop}>
          <View style={styles.issuePickerBox}>
            <View style={styles.issuePickerHeader}>
              <Text style={styles.issuePickerTitle}>Link to Issue</Text>
              <Pressable onPress={() => setShowIssuePicker(false)} hitSlop={8}>
                <Feather name="x" size={20} color={Colors.text} />
              </Pressable>
            </View>
            <Text style={styles.issuePickerSub}>
              Select an issue to link this markup to. The markup will appear inline in reports for that issue.
            </Text>

            {/* Clear selection option */}
            {selectedIssueId !== null && (
              <Pressable
                onPress={() => {
                  setSelectedIssueId(null);
                  setShowIssuePicker(false);
                }}
                style={styles.issuePickerClearBtn}
              >
                <Feather name="x-circle" size={14} color={Colors.textSecondary} />
                <Text style={styles.issuePickerClearText}>Remove link</Text>
              </Pressable>
            )}

            {issuesLoading ? (
              <ActivityIndicator size="small" color={Colors.secondary} style={{ marginVertical: 24 }} />
            ) : projectIssues.length === 0 ? (
              <Text style={styles.issuePickerEmpty}>No open issues found for this project.</Text>
            ) : (
              <FlatList
                data={projectIssues}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 300 }}
                renderItem={({ item }) => {
                  const isSelected = selectedIssueId === item.id;
                  return (
                    <Pressable
                      onPress={() => {
                        setSelectedIssueId(item.id);
                        setShowIssuePicker(false);
                      }}
                      style={[
                        styles.issuePickerItem,
                        isSelected && styles.issuePickerItemSelected,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.issuePickerItemTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <Text style={styles.issuePickerItemSev}>{item.severity}</Text>
                      </View>
                      {isSelected && (
                        <Feather name="check" size={16} color={Colors.secondary} />
                      )}
                    </Pressable>
                  );
                }}
                ItemSeparatorComponent={() => <View style={styles.issuePickerSep} />}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

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
  cachedBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
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
    gap: 8,
    backgroundColor: Colors.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  toolBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  toolBtnActive: { backgroundColor: Colors.secondary },
  toolbarDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 2,
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
  colorDotSelected: { transform: [{ scale: 1.3 }], shadowOpacity: 0.5 },
  toolbarWidths: { flexDirection: "row", alignItems: "center", gap: 6 },
  widthBtn: { padding: 4 },
  widthDot: { borderRadius: 20 },
  widthDotSelected: { opacity: 1, transform: [{ scale: 1.3 }] },
  sizeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  sizeBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  sizeLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, minWidth: 20, textAlign: "center" },

  pageNav: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pageNavBtn: {
    padding: 4,
  },
  pageNavLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    minWidth: 22,
    textAlign: "center",
  },
  pageNavAnnotated: {
    color: Colors.accent,
    fontSize: 10,
  },

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
  errorTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
  errorSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 19,
  },

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

  pageNavBar: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 18,
  },
  pageNavBarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  pageNavBarBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  pageNavBarLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 8,
    minWidth: 60,
    textAlign: "center",
  },

  imageContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f0f0",
    minHeight: "100%",
  },
  imageContent: {
    width: "100%",
  },

  textAnnotationView: {
    position: "absolute",
    padding: 4,
    borderRadius: 4,
    minWidth: 40,
  },
  dragHandle: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    gap: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: "#f9f9f9",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  modalBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
  },
  modalBtnCancel: { backgroundColor: "rgba(0,0,0,0.07)" },
  modalBtnCancelText: { color: Colors.textSecondary, fontWeight: "600" },
  modalBtnConfirm: { backgroundColor: Colors.secondary },
  modalBtnConfirmText: { color: "#fff", fontWeight: "700" },

  issuePickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  issuePickerBox: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    maxHeight: "70%",
  },
  issuePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  issuePickerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  issuePickerSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  issuePickerClearBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    marginBottom: 4,
  },
  issuePickerClearText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  issuePickerEmpty: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    marginVertical: 24,
  },
  issuePickerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 10,
  },
  issuePickerItemSelected: {
    backgroundColor: "rgba(197,217,45,0.08)",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  issuePickerItemTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
  },
  issuePickerItemSev: {
    fontSize: 11,
    color: Colors.textSecondary,
    textTransform: "capitalize",
    marginTop: 2,
  },
  issuePickerSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
});

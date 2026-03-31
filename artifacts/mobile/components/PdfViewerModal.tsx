import React, { useEffect, useState, useRef } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Colors = {
  primary:       "#0B1933",
  secondary:     "#466DB5",
  accent:        "#C5D92D",
  surface:       "#FFFFFF",
  background:    "#F4F6FA",
  text:          "#0B1933",
  textSecondary: "#6B7A99",
  border:        "#E2E8F0",
  danger:        "#EF4444",
};

interface Props {
  visible: boolean;
  url: string;
  title?: string;
  onClose: () => void;
}

type Phase = "downloading" | "ready" | "error";

export default function PdfViewerModal({ visible, url, title = "Report", onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("downloading");
  const [progress, setProgress] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);

  useEffect(() => {
    if (!visible) return;
    cancelRef.current = false;
    setPhase("downloading");
    setProgress(0);
    setLocalUri(null);

    const fileName = `inspectproof_report_${Date.now()}.pdf`;
    const destUri = FileSystem.cacheDirectory + fileName;

    const downloadTask = FileSystem.createDownloadResumable(
      url,
      destUri,
      {},
      (downloadProgress) => {
        if (cancelRef.current) return;
        const ratio = downloadProgress.totalBytesExpectedToWrite > 0
          ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          : 0;
        setProgress(ratio);
      }
    );
    downloadRef.current = downloadTask;

    (async () => {
      try {
        const result = await downloadTask.downloadAsync();
        if (cancelRef.current) return;
        if (!result?.uri) {
          setPhase("error");
          return;
        }
        setLocalUri(result.uri);
        setPhase("ready");
        // Auto-open the file immediately
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, {
            mimeType: "application/pdf",
            dialogTitle: title,
            UTI: "com.adobe.pdf",
          });
        }
      } catch {
        if (!cancelRef.current) setPhase("error");
      }
    })();

    return () => {
      cancelRef.current = true;
      downloadRef.current?.pauseAsync().catch(() => {});
    };
  }, [visible, url]);

  const handleOpen = async () => {
    if (!localUri) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localUri, {
          mimeType: "application/pdf",
          dialogTitle: title,
          UTI: "com.adobe.pdf",
        });
      }
    } catch {
      setPhase("error");
    }
  };

  const handleRetry = () => {
    setPhase("downloading");
    setProgress(0);
    setLocalUri(null);
    // Re-trigger useEffect by toggling visible from outside won't work, so do it inline
    const fileName = `inspectproof_report_${Date.now()}.pdf`;
    const destUri = FileSystem.cacheDirectory + fileName;
    cancelRef.current = false;
    const downloadTask = FileSystem.createDownloadResumable(
      url,
      destUri,
      {},
      (downloadProgress) => {
        if (cancelRef.current) return;
        const ratio = downloadProgress.totalBytesExpectedToWrite > 0
          ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
          : 0;
        setProgress(ratio);
      }
    );
    downloadRef.current = downloadTask;
    (async () => {
      try {
        const result = await downloadTask.downloadAsync();
        if (cancelRef.current || !result?.uri) { setPhase("error"); return; }
        setLocalUri(result.uri);
        setPhase("ready");
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, {
            mimeType: "application/pdf",
            dialogTitle: title,
            UTI: "com.adobe.pdf",
          });
        }
      } catch {
        if (!cancelRef.current) setPhase("error");
      }
    })();
  };

  const pct = Math.round(progress * 100);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Feather name="x" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {phase === "ready" && (
            <Pressable onPress={handleOpen} style={styles.openBtn} hitSlop={10}>
              <Feather name="external-link" size={16} color={Colors.secondary} />
              <Text style={styles.openBtnText}>Open</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.body}>
          {phase === "downloading" && (
            <>
              <ActivityIndicator size="large" color={Colors.secondary} />
              <Text style={styles.label}>Preparing PDF…</Text>
              {pct > 0 && (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                  </View>
                  <Text style={styles.pct}>{pct}%</Text>
                </>
              )}
            </>
          )}

          {phase === "ready" && (
            <>
              <View style={styles.successIcon}>
                <Feather name="check-circle" size={52} color={Colors.secondary} />
              </View>
              <Text style={styles.label}>PDF Ready</Text>
              <Text style={styles.sub}>Your report has opened in the PDF viewer.</Text>
              <Pressable style={styles.openAgainBtn} onPress={handleOpen}>
                <Feather name="external-link" size={17} color={Colors.surface} />
                <Text style={styles.openAgainText}>Open PDF Again</Text>
              </Pressable>
            </>
          )}

          {phase === "error" && (
            <>
              <Feather name="alert-circle" size={48} color={Colors.danger} />
              <Text style={styles.label}>Could Not Load PDF</Text>
              <Text style={styles.sub}>Check your connection and try again.</Text>
              <Pressable style={styles.retryBtn} onPress={handleRetry}>
                <Feather name="refresh-cw" size={16} color={Colors.surface} />
                <Text style={styles.retryText}>Try Again</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  closeBtn: {
    width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  openBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  successIcon: {
    marginBottom: 4,
  },
  label: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  progressTrack: {
    width: "80%",
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: Colors.secondary,
    borderRadius: 3,
  },
  pct: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: Colors.textSecondary,
  },
  openAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  openAgainText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.surface,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.surface,
  },
});

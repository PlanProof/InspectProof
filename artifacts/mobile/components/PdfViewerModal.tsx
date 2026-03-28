import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { WebView } from "react-native-webview";
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

export default function PdfViewerModal({ visible, url, title = "Report", onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleDownload = () => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Feather name="x" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable onPress={handleDownload} style={styles.downloadBtn} hitSlop={10}>
            <Feather name="download" size={18} color={Colors.secondary} />
            <Text style={styles.downloadText}>Download</Text>
          </Pressable>
        </View>

        {/* PDF Viewer */}
        <View style={styles.viewerWrap}>
          {loading && !error && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.secondary} />
              <Text style={styles.loadingText}>Loading PDF…</Text>
            </View>
          )}
          {error ? (
            <View style={styles.errorWrap}>
              <Feather name="alert-circle" size={36} color={Colors.textSecondary} />
              <Text style={styles.errorTitle}>Could not load PDF</Text>
              <Text style={styles.errorSub}>Try downloading it instead.</Text>
              <Pressable onPress={handleDownload} style={styles.errorDownloadBtn}>
                <Feather name="download" size={15} color={Colors.surface} />
                <Text style={styles.errorDownloadText}>Download PDF</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              source={{ uri: url }}
              style={styles.webview}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true); }}
              onHttpError={() => { setLoading(false); setError(true); }}
              startInLoadingState={false}
              scalesPageToFit={Platform.OS !== "web"}
              allowsInlineMediaPlayback
              javaScriptEnabled
            />
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
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.secondary,
  },
  downloadText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  viewerWrap: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: Colors.background,
    zIndex: 10,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  errorSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  errorDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  errorDownloadText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.surface,
  },
});

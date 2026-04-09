import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  RefreshControl, TextInput,
} from "react-native";
import { router } from "expo-router";
import { safeBack } from "@/constants/routes";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

const CATEGORIES = ["all", "certificate", "approval", "drawings", "specification", "report", "correspondence", "other"];

const CAT_ICONS: Record<string, string> = {
  certificate: "award",
  approval: "check-circle",
  drawings: "layout",
  specification: "file-text",
  report: "bar-chart-2",
  correspondence: "mail",
  other: "paperclip",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const openDoc = useCallback((d: any) => {
    if (!d.fileUrl) return;
    const fullUrl = `${baseUrl}/api/storage${d.fileUrl}`;
    router.push({
      pathname: "/inspection/document-viewer" as any,
      params: {
        url: fullUrl,
        name: d.name || d.fileName || "Document",
        mimeType: d.mimeType || "application/octet-stream",
        documentId: String(d.id),
      },
    });
  }, [baseUrl]);

  const { data: docs = [], isLoading, isError, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["documents", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/documents`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (category !== "all" && d.category !== category) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          (d.name || "").toLowerCase().includes(s) ||
          (d.fileName || "").toLowerCase().includes(s) ||
          (d.uploadedByName || "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [docs, category, search]);

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  const getMimeIcon = (mime: string): string => {
    if (!mime) return "file";
    if (mime.includes("pdf")) return "file-text";
    if (mime.includes("image")) return "image";
    if (mime.includes("word") || mime.includes("doc")) return "file-text";
    if (mime.includes("sheet") || mime.includes("excel")) return "grid";
    return "file";
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => safeBack("/(tabs)/more")} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Documents</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filtered.length}</Text>
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <Feather name="search" size={15} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search documents..."
            placeholderTextColor={Colors.textTertiary}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {CATEGORIES.map(c => {
            const active = category === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.75 }]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 8 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {isError && docs.length > 0 && (
          <Pressable style={styles.errorBanner} onPress={() => refetch()}>
            <Feather name="wifi-off" size={14} color="#92400e" />
            <Text style={styles.errorBannerText}>Failed to refresh — tap to retry</Text>
          </Pressable>
        )}
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : isError && docs.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="wifi-off" size={36} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>Could not load documents</Text>
            <Text style={styles.emptyDesc}>Check your connection and try again.</Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Feather name="refresh-cw" size={14} color={Colors.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="book" size={40} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>{search || category !== "all" ? "No matching documents" : "No documents yet"}</Text>
            <Text style={styles.emptyDesc}>
              {search ? "Try a different search" : category !== "all" ? "Try a different category" : "Documents are uploaded via projects"}
            </Text>
          </View>
        ) : (
          filtered.map(d => (
            <Pressable
              key={d.id}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
              onPress={() => openDoc(d)}
            >
              <View style={styles.iconWrap}>
                <Feather name={getMimeIcon(d.mimeType) as any} size={22} color={Colors.secondary} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.docName} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.fileName} numberOfLines={1}>{d.fileName}</Text>
                <View style={styles.cardMeta}>
                  {d.category && (
                    <View style={styles.catTag}>
                      <Feather name={(CAT_ICONS[d.category] || "file") as any} size={10} color={Colors.secondary} />
                      <Text style={styles.catTagText}>{d.category}</Text>
                    </View>
                  )}
                  <Text style={styles.metaText}>{formatBytes(d.fileSize)}</Text>
                  <Text style={styles.metaText}>·</Text>
                  <Text style={styles.metaText}>{formatDate(d.createdAt)}</Text>
                </View>
                {d.uploadedByName && (
                  <View style={styles.uploaderRow}>
                    <Feather name="user" size={11} color={Colors.textTertiary} />
                    <Text style={styles.uploaderText}>{d.uploadedByName}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardRight}>
                {d.version && (
                  <View style={styles.versionBadge}>
                    <Text style={styles.versionText}>v{d.version}</Text>
                  </View>
                )}
                <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  countBadge: { backgroundColor: Colors.infoLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  searchWrapper: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.background, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  filterRow: { gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  chipTextActive: { color: "#fff" },

  list: { padding: 16, gap: 10 },
  skeleton: { height: 80, borderRadius: 12, backgroundColor: Colors.border },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center" },

  card: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: Colors.infoLight,
    alignItems: "center", justifyContent: "center",
  },
  cardBody: { flex: 1, gap: 4 },
  docName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  fileName: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  catTag: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.infoLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  catTagText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  metaText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  uploaderRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  uploaderText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  cardRight: { alignItems: "flex-end", gap: 8, justifyContent: "center" },
  versionBadge: {
    backgroundColor: Colors.accent + "30", paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, alignSelf: "flex-start",
  },
  versionText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.accent, borderRadius: 10,
  },
  retryText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.primary },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#fef3c7", borderRadius: 8, marginBottom: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  errorBannerText: { flex: 1, fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "#92400e" },
});

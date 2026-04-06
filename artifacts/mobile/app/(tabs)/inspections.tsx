import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  TextInput,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { InspectionCard } from "@/components/InspectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

const STATUS_FILTERS = ["All", "Scheduled", "In Progress", "Completed", "Follow-Up"];
const STATUS_VALUES: Record<string, string | null> = {
  All: null,
  Scheduled: "scheduled",
  "In Progress": "in_progress",
  Completed: "completed",
  "Follow-Up": "follow_up_required",
};

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  footing: "Footing",
  slab: "Slab",
  frame: "Frame",
  lock_up: "Lock Up",
  pre_plaster: "Pre-Plaster",
  final: "Final",
  waterproofing: "Waterproofing",
  pool_barrier: "Pool Barrier",
  compliance: "Compliance",
  fire_safety: "Fire Safety",
  structural: "Structural",
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
};

export default function InspectionsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const [activeFilter, setActiveFilter] = useState("All");
  const [search, setSearch] = useState("");
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: inspections = [], isLoading, isError, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["inspections", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/inspections`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    let result = inspections;

    const statusVal = STATUS_VALUES[activeFilter];
    if (statusVal) result = result.filter(i => i.status === statusVal);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i =>
        (i.projectName || "").toLowerCase().includes(q) ||
        (i.projectAddress || "").toLowerCase().includes(q) ||
        (i.projectSuburb || "").toLowerCase().includes(q) ||
        (i.inspectionType || "").toLowerCase().includes(q) ||
        (INSPECTION_TYPE_LABELS[i.inspectionType] || "").toLowerCase().includes(q) ||
        (i.checklistTemplateName || "").toLowerCase().includes(q) ||
        String(i.id).includes(q)
      );
    }

    return result;
  }, [inspections, activeFilter, search]);

  // Group by upcoming vs past
  const now = new Date().toISOString().split("T")[0];
  const upcoming = filtered.filter(i => i.scheduledDate >= now && i.status !== "completed");
  const past = filtered.filter(i => i.scheduledDate < now || i.status === "completed");

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const emptyDescription = search.trim()
    ? `No inspections match "${search.trim()}"`
    : activeFilter !== "All"
    ? `No ${activeFilter.toLowerCase()} inspections`
    : "Inspections will appear here once scheduled";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Inspections</Text>
          <View style={styles.headerRight}>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{filtered.length}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.75 }]}
              onPress={() => router.push("/inspection/create" as any)}
            >
              <Feather name="plus" size={18} color={Colors.primary} />
              <Text style={styles.newBtnText}>New</Text>
            </Pressable>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Feather name="search" size={15} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by address, type, project…"
            placeholderTextColor={Colors.textTertiary}
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={10}>
              <Feather name="x-circle" size={15} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map(f => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={({ pressed }) => [styles.chip, activeFilter === f && styles.chipActive, pressed && { opacity: 0.75 }]}
            >
              <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 20 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isError && inspections.length > 0 && (
          <Pressable style={styles.errorBanner} onPress={() => refetch()}>
            <Feather name="wifi-off" size={14} color="#92400e" />
            <Text style={styles.errorBannerText}>Failed to refresh — tap to retry</Text>
          </Pressable>
        )}
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : isError && inspections.length === 0 ? (
          <View style={styles.errorWrap}>
            <Feather name="wifi-off" size={32} color={Colors.textTertiary} />
            <Text style={styles.errorTitle}>Could not load inspections</Text>
            <Text style={styles.errorText}>Check your connection and try again.</Text>
            <Pressable style={styles.retryBtn} onPress={() => refetch()}>
              <Feather name="refresh-cw" size={14} color={Colors.primary} />
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={search.trim() ? "search" : "check-circle"}
            title={search.trim() ? "No results found" : "No inspections"}
            description={emptyDescription}
          />
        ) : (
          <>
            {upcoming.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Upcoming & Active</Text>
                <View style={styles.cardList}>
                  {upcoming.map(i => <InspectionCard key={i.id} inspection={i} showProject />)}
                </View>
              </View>
            )}
            {past.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Past Inspections</Text>
                <View style={styles.cardList}>
                  {past.map(i => <InspectionCard key={i.id} inspection={i} showProject />)}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  newBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  title: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  countBadge: {
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  countText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text,
    paddingVertical: 0,
  },
  filters: { gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  chipTextActive: { color: Colors.accent },
  list: { padding: 16, gap: 16 },
  skeleton: { height: 130, borderRadius: 12, backgroundColor: Colors.border, marginBottom: 10 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardList: { gap: 10 },
  errorWrap: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 10 },
  errorTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  errorText: { fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 10,
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

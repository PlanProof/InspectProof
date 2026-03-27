import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  RefreshControl, Platform, TextInput,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = 0;

const REPORT_TYPES: Record<string, string> = {
  inspection_certificate:   "Inspection Certificate",
  compliance_report:        "Compliance Report",
  defect_notice:            "Defect Notice",
  non_compliance_notice:    "Non-Compliance Notice",
  summary:                  "Inspection Summary",
  quality_control_report:   "Quality Control Report",
  non_conformance_report:   "Non-Conformance Report",
  safety_inspection_report: "Safety Inspection Report",
  pre_purchase_report:      "Pre-Purchase Building Report",
  annual_fire_safety:       "Annual Fire Safety Statement",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: "Draft",     color: "#6b7280", bg: "#f3f4f6" },
  submitted: { label: "Submitted", color: "#2563eb", bg: "#eff6ff" },
  approved:  { label: "Approved",  color: "#16a34a", bg: "#f0fdf4" },
  sent:      { label: "Sent",      color: Colors.secondary, bg: Colors.infoLight },
};

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: reports = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["reports", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/reports`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          (r.reportType || "").toLowerCase().includes(s) ||
          (r.projectName || "").toLowerCase().includes(s) ||
          (REPORT_TYPES[r.reportType] || "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [reports, statusFilter, search]);

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Reports</Text>
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
            placeholder="Search reports..."
            placeholderTextColor={Colors.textTertiary}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {["all", "draft", "submitted", "approved", "sent"].map(s => {
            const active = statusFilter === s;
            const meta = STATUS_META[s] || { color: Colors.primary, bg: Colors.infoLight };
            return (
              <Pressable
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[styles.chip, active && { backgroundColor: s === "all" ? Colors.primary : meta.color, borderColor: s === "all" ? Colors.primary : meta.color }]}
              >
                <Text style={[styles.chipText, active && { color: "#fff" }]}>
                  {s === "all" ? "All" : (STATUS_META[s]?.label || s)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="file-text" size={40} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>{search || statusFilter !== "all" ? "No matching reports" : "No reports yet"}</Text>
            <Text style={styles.emptyDesc}>
              {search ? "Try a different search" : statusFilter !== "all" ? "Try clearing filters" : "Reports are generated from inspections"}
            </Text>
          </View>
        ) : (
          filtered.map(r => {
            const statusMeta = STATUS_META[r.status] || STATUS_META.draft;
            return (
              <Pressable
                key={r.id}
                onPress={() => router.push({ pathname: "/inspection/[id]", params: { id: r.inspectionId } })}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
              >
                <View style={styles.cardHeader}>
                  <View style={[styles.statusTag, { backgroundColor: statusMeta.bg }]}>
                    <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                  </View>
                  <Text style={styles.dateText}>{formatDate(r.createdAt)}</Text>
                </View>
                <Text style={styles.reportType}>{REPORT_TYPES[r.reportType] || r.reportType}</Text>
                {r.projectName && (
                  <View style={styles.projectRow}>
                    <Feather name="map-pin" size={12} color={Colors.textTertiary} />
                    <Text style={styles.projectText} numberOfLines={1}>{r.projectName}</Text>
                  </View>
                )}
                <View style={styles.cardFooter}>
                  <View style={styles.inspectionRef}>
                    <Feather name="clipboard" size={12} color={Colors.secondary} />
                    <Text style={styles.inspectionRefText}>Inspection #{r.inspectionId}</Text>
                  </View>
                  <Feather name="chevron-right" size={15} color={Colors.textTertiary} />
                </View>
              </Pressable>
            );
          })
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
  chipText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },

  list: { padding: 16, gap: 10 },
  skeleton: { height: 110, borderRadius: 12, backgroundColor: Colors.border },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center" },

  card: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusTag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  dateText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  reportType: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  projectRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  projectText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, flex: 1 },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  inspectionRef: { flexDirection: "row", alignItems: "center", gap: 5 },
  inspectionRefText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
});

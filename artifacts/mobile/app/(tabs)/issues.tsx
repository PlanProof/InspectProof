import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { IssueCard } from "@/components/IssueCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const SEVERITY_FILTERS = ["All", "Critical", "High", "Medium", "Low"];
const SEVERITY_VALUES: Record<string, string | null> = {
  All: null,
  Critical: "critical",
  High: "high",
  Medium: "medium",
  Low: "low",
};

const STATUS_FILTERS = ["All", "Open", "In Progress", "Resolved", "Closed"];
const STATUS_VALUES: Record<string, string | null> = {
  All: null,
  Open: "open",
  "In Progress": "in_progress",
  Resolved: "resolved",
  Closed: "closed",
};

export default function IssuesScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: issues = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["issues", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/issues`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = issues.filter(i => {
    const sev = SEVERITY_VALUES[severityFilter];
    const sta = STATUS_VALUES[statusFilter];
    if (sev && i.severity !== sev) return false;
    if (sta && i.status !== sta) return false;
    return true;
  });

  const criticalCount = issues.filter(i => i.severity === "critical" && !["resolved", "closed"].includes(i.status)).length;

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Issues</Text>
          {criticalCount > 0 && (
            <View style={styles.criticalBadge}>
              <Text style={styles.criticalBadgeText}>{criticalCount} Critical</Text>
            </View>
          )}
        </View>

        <Text style={styles.filterLabel}>Severity</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {SEVERITY_FILTERS.map(f => (
            <Pressable
              key={f}
              onPress={() => setSeverityFilter(f)}
              style={[styles.chip, severityFilter === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, severityFilter === f && styles.chipTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map(f => (
            <Pressable
              key={f}
              onPress={() => setStatusFilter(f)}
              style={[styles.chip, statusFilter === f && styles.chipActive2]}
            >
              <Text style={[styles.chipText, statusFilter === f && styles.chipTextActive2]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="alert-triangle"
            title={statusFilter === "Open" ? "No open issues" : "No issues found"}
            description="Issues and defects from inspections will appear here"
          />
        ) : (
          filtered.map(i => <IssueCard key={i.id} issue={i} showProject />)
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
    gap: 8,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  criticalBadge: {
    backgroundColor: Colors.dangerLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  criticalBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.danger,
  },
  filterLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
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
    backgroundColor: Colors.danger,
    borderColor: Colors.danger,
  },
  chipActive2: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  chipTextActive: { color: "#FFFFFF" },
  chipTextActive2: { color: Colors.accent },
  list: { padding: 16, gap: 10 },
  skeleton: { height: 140, borderRadius: 12, backgroundColor: Colors.border, marginBottom: 10 },
});

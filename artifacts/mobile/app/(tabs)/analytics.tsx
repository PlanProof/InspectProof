import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { StatCard } from "@/components/ui/StatCard";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: analytics, isLoading, refetch, isRefetching } = useQuery<any>({
    queryKey: ["analytics-dashboard", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/analytics/dashboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const { data: insights } = useQuery<any>({
    queryKey: ["analytics-insights", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/analytics/insights`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  const issuesBySeverity = analytics?.issuesBySeverity || [];
  const inspectionsByType = analytics?.inspectionsByType || [];
  const projectsByStage = analytics?.projectsByStage || [];

  const totalIssues = issuesBySeverity.reduce((sum: number, s: any) => sum + s.count, 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="chevron-left" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Analytics & Insights</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: 16, paddingBottom: tabBarHeight + 8 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <Text style={styles.sectionSubtitle}>All time performance metrics</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard label="Total Projects" value={analytics?.totalProjects ?? "—"} icon="folder" color={Colors.secondary} bgColor={Colors.infoLight} />
          <StatCard label="Active" value={analytics?.activeProjects ?? "—"} icon="activity" color={Colors.success} bgColor={Colors.successLight} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Total Inspections" value={analytics?.totalInspections ?? "—"} icon="clipboard" color={Colors.secondary} bgColor={Colors.infoLight} />
          <StatCard label="This Month" value={analytics?.inspectionsThisMonth ?? "—"} icon="calendar" color={Colors.warning} bgColor={Colors.warningLight} />
        </View>
        <View style={styles.statsRow}>
          <StatCard label="Open Issues" value={analytics?.openIssues ?? "—"} icon="alert-circle" color={Colors.danger} bgColor={Colors.dangerLight} />
          <StatCard label="Overdue" value={analytics?.overdueIssues ?? "—"} icon="clock" color={Colors.danger} bgColor={Colors.dangerLight} />
        </View>
      </View>

      {/* Issues by Severity */}
      {issuesBySeverity.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Issues by Severity</Text>
          <View style={styles.donutRow}>
            <View style={styles.donutPlaceholder}>
              <Text style={styles.donutTotal}>{totalIssues}</Text>
              <Text style={styles.donutLabel}>Total</Text>
            </View>
            <View style={styles.severityList}>
              {issuesBySeverity.map((s: any) => {
                const pct = totalIssues > 0 ? Math.round((s.count / totalIssues) * 100) : 0;
                const colorMap: Record<string, string> = {
                  critical: Colors.danger,
                  high: Colors.warning,
                  medium: "#D69E2E",
                  low: Colors.success,
                };
                return (
                  <View key={s.severity} style={styles.severityRow}>
                    <View style={[styles.severityDot, { backgroundColor: colorMap[s.severity] || Colors.textTertiary }]} />
                    <Text style={styles.severityLabel}>{s.severity.charAt(0).toUpperCase() + s.severity.slice(1)}</Text>
                    <View style={styles.severityBarTrack}>
                      <View style={[styles.severityBar, { flex: pct, backgroundColor: colorMap[s.severity] || Colors.textTertiary }]} />
                      <View style={{ flex: 100 - pct }} />
                    </View>
                    <Text style={styles.severityCount}>{s.count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Inspections by Type */}
      {inspectionsByType.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inspections by Type</Text>
          <View style={styles.barChart}>
            {(() => {
              const max = Math.max(...inspectionsByType.map((t: any) => t.total));
              return inspectionsByType.map((t: any) => (
                <View key={t.type} style={styles.barItem}>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: max > 0 ? (t.total / max) * 100 : 0 }]} />
                  </View>
                  <Text style={styles.barValue}>{t.total}</Text>
                  <Text style={styles.barLabel} numberOfLines={2}>
                    {t.type.charAt(0).toUpperCase() + t.type.slice(1)}
                  </Text>
                </View>
              ));
            })()}
          </View>
        </View>
      )}

      {/* Projects by Stage */}
      {projectsByStage.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Projects by Stage</Text>
          <View style={styles.stageGrid}>
            {projectsByStage.map((s: any) => (
              <View key={s.stage} style={styles.stageItem}>
                <Text style={styles.stageCount}>{s.count}</Text>
                <Text style={styles.stageLabel}>{s.stage.replace(/_/g, " ")}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  content: { paddingHorizontal: 16, gap: 16 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: { gap: 2 },
  sectionTitle: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  statsGrid: { gap: 10 },
  statsRow: { flexDirection: "row", gap: 10 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 14,
  },
  cardTitle: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  donutRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  donutPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.infoLight,
    borderWidth: 6,
    borderColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  donutTotal: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  donutLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  severityList: { flex: 1, gap: 8 },
  severityRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  severityLabel: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, width: 60 },
  severityBarTrack: { flex: 1, height: 6, borderRadius: 3, flexDirection: "row", backgroundColor: Colors.background, overflow: "hidden" },
  severityBar: { height: 6, borderRadius: 3 },
  severityCount: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, width: 24, textAlign: "right" },
  barChart: { flexDirection: "row", gap: 8, alignItems: "flex-end", height: 120 },
  barItem: { flex: 1, alignItems: "center", gap: 4 },
  barTrack: { width: "100%", height: 100, justifyContent: "flex-end" },
  barFill: { backgroundColor: Colors.secondary, borderRadius: 4, minHeight: 4 },
  barValue: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  barLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center" },
  stageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageItem: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    alignItems: "center",
    gap: 4,
  },
  stageCount: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  stageLabel: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, textAlign: "center", textTransform: "capitalize" },
});

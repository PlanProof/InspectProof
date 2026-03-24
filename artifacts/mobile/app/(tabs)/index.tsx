import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InspectionCard } from "@/components/InspectionCard";
import { IssueCard } from "@/components/IssueCard";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

function useApiData<T>(url: string) {
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  return useQuery<T>({
    queryKey: [url, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}${url}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Request failed");
      return res.json();
    },
    enabled: !!token,
  });
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  const { data: analytics, isLoading, refetch, isRefetching } = useApiData<any>("/api/analytics/dashboard");

  const upcomingInspections = analytics?.upcomingInspections?.slice(0, 3) || [];
  const recentActivity = analytics?.recentActivity?.slice(0, 5) || [];

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + WEB_TOP + 16, paddingBottom: insets.bottom + 90 },
      ]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName}>{user?.firstName || "Inspector"}</Text>
          <Text style={styles.dateText}>{today}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => router.push("/analytics")}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
          >
            <Feather name="bar-chart-2" size={20} color={Colors.primary} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/more")}
            style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.avatarText}>
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard
            label="Active Projects"
            value={analytics?.activeProjects ?? "—"}
            icon="folder"
            color={Colors.secondary}
            bgColor={Colors.infoLight}
          />
          <StatCard
            label="Inspections"
            value={analytics?.totalInspections ?? "—"}
            icon="check-circle"
            color={Colors.success}
            bgColor={Colors.successLight}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            label="Open Issues"
            value={analytics?.openIssues ?? "—"}
            icon="alert-circle"
            color={analytics?.criticalIssues > 0 ? Colors.danger : Colors.warning}
            bgColor={analytics?.criticalIssues > 0 ? Colors.dangerLight : Colors.warningLight}
          />
          <StatCard
            label="Critical Issues"
            value={analytics?.criticalIssues ?? "—"}
            icon="alert-triangle"
            color={Colors.danger}
            bgColor={Colors.dangerLight}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            label="This Month"
            value={analytics?.inspectionsThisMonth ?? "—"}
            icon="calendar"
            color={Colors.secondary}
            bgColor={Colors.infoLight}
          />
          <StatCard
            label="Reports Pending"
            value={analytics?.reportsPending ?? "—"}
            icon="file-text"
            color={Colors.warning}
            bgColor={Colors.warningLight}
          />
        </View>
      </View>

      {/* Overdue Alert */}
      {(analytics?.overdueIssues || 0) > 0 && (
        <Pressable
          onPress={() => router.push("/(tabs)/issues")}
          style={({ pressed }) => [styles.alertBanner, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.alertIcon}>
            <Feather name="alert-circle" size={18} color={Colors.danger} />
          </View>
          <View style={styles.alertText}>
            <Text style={styles.alertTitle}>{analytics.overdueIssues} Overdue Issues</Text>
            <Text style={styles.alertSubtitle}>Immediate attention required</Text>
          </View>
          <Feather name="chevron-right" size={16} color={Colors.danger} />
        </Pressable>
      )}

      {/* Upcoming Inspections */}
      {upcomingInspections.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="Upcoming Inspections"
            actionLabel="View All"
            onAction={() => router.push("/(tabs)/inspections")}
          />
          <View style={styles.cardList}>
            {upcomingInspections.map((inspection: any) => (
              <InspectionCard key={inspection.id} inspection={inspection} showProject />
            ))}
          </View>
        </View>
      )}

      {/* Projects by Stage */}
      {analytics?.projectsByStage && analytics.projectsByStage.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title="Projects by Stage"
            actionLabel="All Projects"
            onAction={() => router.push("/(tabs)/projects")}
          />
          <View style={styles.stageGrid}>
            {analytics.projectsByStage.map((s: any) => (
              <View key={s.stage} style={styles.stageItem}>
                <Text style={styles.stageCount}>{s.count}</Text>
                <Text style={styles.stageLabel}>{s.stage.replace("_", " ")}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Recent Activity" />
          <View style={styles.activityList}>
            {recentActivity.map((item: any, idx: number) => (
              <View key={item.id} style={[styles.activityItem, idx < recentActivity.length - 1 && styles.activityBorder]}>
                <View style={styles.activityDot} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityDesc}>{item.description}</Text>
                  <Text style={styles.activityTime}>
                    {new Date(item.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, gap: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { gap: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  greeting: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: 24,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  dateText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.accent,
  },
  statsGrid: { gap: 10 },
  statsRow: { flexDirection: "row", gap: 10 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: Colors.dangerLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#FED7D7",
    alignItems: "center",
    justifyContent: "center",
  },
  alertText: { flex: 1 },
  alertTitle: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.danger,
  },
  alertSubtitle: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.danger + "99",
  },
  section: { gap: 12 },
  cardList: { gap: 10 },
  stageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stageItem: {
    flex: 1,
    minWidth: "28%",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 4,
  },
  stageCount: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  stageLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    textAlign: "center",
    textTransform: "capitalize",
  },
  activityList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  activityItem: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    alignItems: "flex-start",
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.secondary,
    marginTop: 5,
  },
  activityContent: { flex: 1, gap: 3 },
  activityDesc: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    lineHeight: 18,
  },
  activityTime: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
  },
});

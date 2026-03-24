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
import { InspectionCard } from "@/components/InspectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const STATUS_FILTERS = ["All", "Scheduled", "In Progress", "Completed", "Follow-Up"];
const STATUS_VALUES: Record<string, string | null> = {
  All: null,
  Scheduled: "scheduled",
  "In Progress": "in_progress",
  Completed: "completed",
  "Follow-Up": "follow_up_required",
};

export default function InspectionsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [activeFilter, setActiveFilter] = useState("All");
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: inspections = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
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

  const filtered = inspections.filter(i => {
    const statusVal = STATUS_VALUES[activeFilter];
    return !statusVal || i.status === statusVal;
  });

  // Group by upcoming vs past
  const now = new Date().toISOString().split("T")[0];
  const upcoming = filtered.filter(i => i.scheduledDate >= now && i.status !== "completed");
  const past = filtered.filter(i => i.scheduledDate < now || i.status === "completed");

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Inspections</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{filtered.length}</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map(f => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.chip, activeFilter === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, activeFilter === f && styles.chipTextActive]}>{f}</Text>
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
          <EmptyState icon="check-circle" title="No inspections" description="Inspections will appear here once scheduled" />
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
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
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
    fontFamily: "Inter_600SemiBold",
    color: Colors.secondary,
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
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  chipTextActive: { color: Colors.accent },
  list: { padding: 16, gap: 16 },
  skeleton: { height: 130, borderRadius: 12, backgroundColor: Colors.border, marginBottom: 10 },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardList: { gap: 10 },
});

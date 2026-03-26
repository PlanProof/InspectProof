import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { PROJECT_STAGES } from "@/constants/api";
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "active",    label: "Active" },
  { key: "on_hold",   label: "On Hold" },
  { key: "completed", label: "Completed" },
  { key: "archived",  label: "Archived" },
];

const STAGE_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All Stages" },
  ...Object.entries(PROJECT_STAGES).map(([key, label]) => ({ key, label })),
];

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [stageFilter, setStageFilter] = useState("all");

  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: projects = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["projects", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (stageFilter  !== "all" && p.stage  !== stageFilter)  return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(s) ||
          p.siteAddress.toLowerCase().includes(s) ||
          p.clientName.toLowerCase().includes(s) ||
          p.suburb.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [projects, statusFilter, stageFilter, search]);

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const activeFilters = (statusFilter !== "all" ? 1 : 0) + (stageFilter !== "all" ? 1 : 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Projects</Text>
          <View style={styles.headerRight}>
            <Text style={styles.count}>{filtered.length}</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrapper}>
          <Feather name="search" size={16} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search projects..."
            placeholderTextColor={Colors.textTertiary}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={16} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setStatusFilter(f.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                {active && f.key !== "all" && (
                  <View style={[styles.chipDot, styles.chipDotActive]} />
                )}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Stage filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STAGE_FILTERS.map(f => {
            const active = stageFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setStageFilter(f.key)}
                style={[styles.chip, styles.chipStage, active && styles.chipStageActive]}
              >
                <Text style={[styles.chipText, styles.chipTextStage, active && styles.chipTextStageActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Active filter summary + clear */}
        {activeFilters > 0 && (
          <Pressable style={styles.clearRow} onPress={() => { setStatusFilter("all"); setStageFilter("all"); }}>
            <Feather name="filter" size={12} color={Colors.secondary} />
            <Text style={styles.clearText}>
              {activeFilters} filter{activeFilters > 1 ? "s" : ""} active · tap to clear
            </Text>
          </Pressable>
        )}
      </View>

      {/* List */}
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 90 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="folder"
            title={search ? "No projects found" : "No matching projects"}
            description={
              search
                ? "Try a different search term"
                : activeFilters > 0
                ? "Try adjusting or clearing your filters"
                : "Projects will appear here once created"
            }
          />
        ) : (
          filtered.map(p => <ProjectCard key={p.id} project={p} />)
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
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.5,
  },
  headerRight: {
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  count: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },

  filterRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 0,
  },

  /* Status chips — solid primary fill when active */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  chipDotActive: {},
  chipText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: "#fff",
  },

  /* Stage chips — accent tint when active */
  chipStage: {
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipStageActive: {
    backgroundColor: Colors.infoLight,
    borderColor: Colors.secondary,
  },
  chipTextStage: {
    color: Colors.textSecondary,
  },
  chipTextStageActive: {
    color: Colors.secondary,
  },

  clearRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  clearText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.secondary,
  },

  list: {
    padding: 16,
    gap: 10,
  },
  skeleton: {
    height: 160,
    borderRadius: 12,
    backgroundColor: Colors.border,
    marginBottom: 10,
  },
});

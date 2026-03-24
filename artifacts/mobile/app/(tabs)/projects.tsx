import React, { useState, useCallback } from "react";
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
import { ProjectCard } from "@/components/ProjectCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const STATUS_FILTERS = ["All", "Active", "On Hold", "Completed", "Archived"];
const STATUS_VALUES: Record<string, string | null> = {
  All: null,
  Active: "active",
  "On Hold": "on_hold",
  Completed: "completed",
  Archived: "archived",
};

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("Active");
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

  const filtered = projects.filter(p => {
    const statusVal = STATUS_VALUES[activeFilter];
    if (statusVal && p.status !== statusVal) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return p.name.toLowerCase().includes(s) ||
        p.siteAddress.toLowerCase().includes(s) ||
        p.clientName.toLowerCase().includes(s) ||
        p.suburb.toLowerCase().includes(s);
    }
    return true;
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

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

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map(f => (
            <Pressable
              key={f}
              onPress={() => setActiveFilter(f)}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
            title={search ? "No projects found" : "No projects yet"}
            description={search ? "Try a different search term" : "Projects will appear here once created"}
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
  headerRight: {
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  count: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
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
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  filters: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.accent,
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

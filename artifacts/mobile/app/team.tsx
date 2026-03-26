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

const WEB_TOP = Platform.OS === "web" ? 67 : 0;

const ROLE_LABELS: Record<string, string> = {
  admin:        "Administrator",
  certifier:    "Building Certifier",
  inspector:    "Inspector",
  staff:        "Staff",
  engineer:     "Structural Engineer",
  plumber:      "Plumbing Inspector",
  builder:      "Builder",
  supervisor:   "Site Supervisor",
  whs:          "WHS Officer",
  pre_purchase: "Pre-Purchase Inspector",
  fire_engineer:"Fire Safety Engineer",
};

const ROLE_COLORS: Record<string, string> = {
  admin:        "#0B1933",
  certifier:    Colors.secondary,
  inspector:    "#0f766e",
  staff:        "#6b7280",
  engineer:     "#1d4ed8",
  plumber:      "#0e7490",
  builder:      "#b45309",
  supervisor:   "#ea580c",
  whs:          "#b91c1c",
  pre_purchase: "#7e22ce",
  fire_engineer:"#be123c",
};

const ROLE_FILTERS = ["all", "admin", "certifier", "inspector", "engineer", "supervisor", "builder", "staff"];

function getInitials(first: string, last: string) {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();
}

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const { data: users = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["users", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(s) ||
          (u.email || "").toLowerCase().includes(s) ||
          (ROLE_LABELS[u.role] || u.role || "").toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [users, roleFilter, search]);

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  const activeCount = users.filter(u => u.isActive).length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>Team Members</Text>
            <Text style={styles.subtitle}>{activeCount} active · {users.length} total</Text>
          </View>
        </View>

        <View style={styles.searchWrapper}>
          <Feather name="search" size={15} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or role..."
            placeholderTextColor={Colors.textTertiary}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {ROLE_FILTERS.map(r => {
            const active = roleFilter === r;
            const color = ROLE_COLORS[r] || Colors.primary;
            return (
              <Pressable
                key={r}
                onPress={() => setRoleFilter(r)}
                style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
              >
                <Text style={[styles.chipText, active && { color: "#fff" }]}>
                  {r === "all" ? "All Roles" : ROLE_LABELS[r] || r}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={40} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>No team members found</Text>
            <Text style={styles.emptyDesc}>{search ? "Try a different search" : "Adjust role filter to see members"}</Text>
          </View>
        ) : (
          filtered.map(u => {
            const roleColor = ROLE_COLORS[u.role] || Colors.secondary;
            const initials = getInitials(u.firstName, u.lastName);
            return (
              <View key={u.id} style={[styles.card, !u.isActive && styles.cardInactive]}>
                <View style={[styles.avatar, { backgroundColor: roleColor + "20", borderColor: roleColor + "40" }]}>
                  <Text style={[styles.avatarText, { color: roleColor }]}>{initials}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{u.firstName} {u.lastName}</Text>
                    {!u.isActive && (
                      <View style={styles.inactiveBadge}>
                        <Text style={styles.inactiveBadgeText}>Inactive</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.role, { color: roleColor }]}>{ROLE_LABELS[u.role] || u.role}</Text>
                  <Text style={styles.email} numberOfLines={1}>{u.email}</Text>
                  {u.phone && (
                    <View style={styles.phoneRow}>
                      <Feather name="phone" size={11} color={Colors.textTertiary} />
                      <Text style={styles.phone}>{u.phone}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
              </View>
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
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  title: { fontSize: 22, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  subtitle: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, marginTop: 2 },
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
  skeleton: { height: 80, borderRadius: 12, backgroundColor: Colors.border },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center" },

  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 12,
  },
  cardInactive: { opacity: 0.6 },
  avatar: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold" },
  cardBody: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  inactiveBadge: { backgroundColor: Colors.borderLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  inactiveBadgeText: { fontSize: 10, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  role: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold" },
  email: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  phone: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
});

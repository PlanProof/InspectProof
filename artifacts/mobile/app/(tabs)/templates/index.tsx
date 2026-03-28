import React, { useState, useMemo, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  Pressable, RefreshControl, Platform, Alert, Modal,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

const DISCIPLINES = [
  "All",
  "Building Surveyor",
  "Structural Engineer",
  "Plumbing Officer",
  "Builder / QC",
  "Site Supervisor",
  "WHS Officer",
  "Pre-Purchase Inspector",
  "Fire Safety Engineer",
];

const DISCIPLINE_COLORS: Record<string, string> = {
  "Building Surveyor":      "#0B1933",
  "Structural Engineer":    "#1d4ed8",
  "Plumbing Officer":       "#0f766e",
  "Builder / QC":           "#b45309",
  "Site Supervisor":        "#ea580c",
  "WHS Officer":            "#b91c1c",
  "Pre-Purchase Inspector": "#7e22ce",
  "Fire Safety Engineer":   "#be123c",
};

const RISK_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#f59e0b",
  low:      "#22c55e",
};

const INSPECTION_TYPES: Record<string, string> = {
  footings:     "Footings",
  slab:         "Slab",
  frame:        "Frame",
  waterproofing:"Waterproofing",
  occupancy:    "Occupancy",
  final:        "Final",
  fire_safety:  "Fire Safety",
  pool_barrier: "Pool Barrier",
  lock_up:      "Lock-Up",
  fit_out:      "Fit-Out",
};

export default function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const qc = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("All");
  const [showCreate, setShowCreate] = useState(false);

  const { data: templates = [], isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ["checklist-templates", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/checklist-templates`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    return templates.filter(t => {
      if (discipline !== "All" && t.discipline !== discipline) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return t.name.toLowerCase().includes(s) || (t.folder || "").toLowerCase().includes(s);
      }
      return true;
    });
  }, [templates, discipline, search]);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const t of filtered) {
      const key = t.folder || "General";
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [filtered]);

  const handleRefresh = useCallback(() => refetch(), [refetch]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Checklist Templates</Text>
          <Pressable onPress={() => setShowCreate(true)} style={styles.addBtn}>
            <Feather name="plus" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.searchWrapper}>
          <Feather name="search" size={15} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search templates..."
            placeholderTextColor={Colors.textTertiary}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Feather name="x" size={15} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {DISCIPLINES.map(d => {
            const active = discipline === d;
            const color = DISCIPLINE_COLORS[d] || Colors.primary;
            return (
              <Pressable
                key={d}
                onPress={() => setDiscipline(d)}
                style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
              >
                <Text style={[styles.chipText, active && { color: "#fff" }]} numberOfLines={1}>
                  {d === "All" ? "All Disciplines" : d}
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
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : Object.keys(grouped).length === 0 ? (
          <View style={styles.empty}>
            <Feather name="clipboard" size={40} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>No templates found</Text>
            <Text style={styles.emptyDesc}>
              {search ? "Try a different search" : "Tap + to create your first template"}
            </Text>
          </View>
        ) : (
          Object.entries(grouped).map(([folder, items]) => (
            <View key={folder} style={styles.folderGroup}>
              <View style={styles.folderHeader}>
                <Feather name="folder" size={14} color={Colors.secondary} />
                <Text style={styles.folderName}>{folder}</Text>
                <Text style={styles.folderCount}>{items.length}</Text>
              </View>
              {items.map(t => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push({ pathname: "/templates/[id]", params: { id: t.id } })}
                  style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.cardLeft}>
                    <View style={[styles.disciplineDot, { backgroundColor: DISCIPLINE_COLORS[t.discipline] || Colors.primary }]} />
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName} numberOfLines={1}>{t.name}</Text>
                      <Text style={styles.cardMeta}>
                        {INSPECTION_TYPES[t.inspectionType] || t.inspectionType || "General"} · {t.discipline}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardRight}>
                    <View style={styles.itemCountBadge}>
                      <Text style={styles.itemCountText}>{t.itemCount}</Text>
                      <Text style={styles.itemCountLabel}>items</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
                  </View>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <CreateTemplateModal
        visible={showCreate}
        baseUrl={baseUrl}
        token={token}
        onClose={() => setShowCreate(false)}
        onCreated={(t: any) => {
          qc.invalidateQueries({ queryKey: ["checklist-templates"] });
          setShowCreate(false);
          router.push({ pathname: "/templates/[id]", params: { id: t.id } });
        }}
      />
    </View>
  );
}

/* ── Create Modal ──────────────────────────────────────────────────────────── */
function CreateTemplateModal({ visible, baseUrl, token, onClose, onCreated }: any) {
  const [name, setName] = useState("");
  const [inspectionType, setInspectionType] = useState("frame");
  const [discipline, setDiscipline] = useState("Building Surveyor");
  const [folder, setFolder] = useState("Class 1a");
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(""); setInspectionType("frame"); setDiscipline("Building Surveyor"); setFolder("Class 1a"); };

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert("Required", "Please enter a template name"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${baseUrl}/api/checklist-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), inspectionType, discipline, folder }),
      });
      if (!res.ok) throw new Error("Failed");
      const t = await res.json();
      reset();
      onCreated(t);
    } catch {
      Alert.alert("Error", "Could not create template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        <View style={modal.handle} />
        <Text style={modal.title}>New Template</Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={modal.form}>
          <Text style={modal.label}>Template Name *</Text>
          <TextInput
            style={modal.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Class 1a Frame Inspection"
            placeholderTextColor={Colors.textTertiary}
            autoFocus
          />

          <Text style={modal.label}>Discipline</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modal.optRow}>
            {DISCIPLINES.filter(d => d !== "All").map(d => (
              <Pressable
                key={d}
                onPress={() => setDiscipline(d)}
                style={[modal.optChip, discipline === d && { backgroundColor: DISCIPLINE_COLORS[d], borderColor: DISCIPLINE_COLORS[d] }]}
              >
                <Text style={[modal.optChipText, discipline === d && { color: "#fff" }]} numberOfLines={1}>{d}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={modal.label}>Inspection Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modal.optRow}>
            {Object.entries(INSPECTION_TYPES).map(([k, v]) => (
              <Pressable
                key={k}
                onPress={() => setInspectionType(k)}
                style={[modal.optChip, inspectionType === k && modal.optChipActive]}
              >
                <Text style={[modal.optChipText, inspectionType === k && modal.optChipTextActive]}>{v}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={modal.label}>Folder / NCC Class</Text>
          <TextInput
            style={modal.input}
            value={folder}
            onChangeText={setFolder}
            placeholder="e.g. Class 1a"
            placeholderTextColor={Colors.textTertiary}
          />
        </ScrollView>

        <View style={modal.footer}>
          <Pressable style={modal.cancelBtn} onPress={() => { reset(); onClose(); }}>
            <Text style={modal.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[modal.saveBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving}>
            <Text style={modal.saveText}>{saving ? "Creating…" : "Create Template"}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { padding: 4 },
  title: { flex: 1, fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  addBtn: {
    backgroundColor: Colors.primary, width: 34, height: 34,
    borderRadius: 10, alignItems: "center", justifyContent: "center",
  },
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

  list: { padding: 16, gap: 16 },
  skeleton: { height: 120, borderRadius: 12, backgroundColor: Colors.border, marginBottom: 4 },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textAlign: "center" },

  folderGroup: { gap: 6 },
  folderHeader: {
    flexDirection: "row", alignItems: "center", gap: 7,
    paddingHorizontal: 4, marginBottom: 2,
  },
  folderName: { flex: 1, fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  folderCount: {
    fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary,
    backgroundColor: Colors.infoLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
  },

  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    padding: 14, gap: 12,
  },
  cardLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  disciplineDot: { width: 10, height: 10, borderRadius: 5 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  cardMeta: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, marginTop: 2 },
  cardRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemCountBadge: { alignItems: "center" },
  itemCountText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  itemCountLabel: { fontSize: 9, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
});

const modal = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, textAlign: "center", marginBottom: 4 },
  form: { padding: 20, gap: 6 },
  label: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
    backgroundColor: Colors.background,
  },
  optRow: { gap: 6, paddingVertical: 2 },
  optChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  optChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optChipText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  optChipTextActive: { color: "#fff" },
  footer: {
    flexDirection: "row", gap: 12, padding: 20,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.border, borderRadius: 12,
    paddingVertical: 13, alignItems: "center",
  },
  cancelText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  saveBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: "center",
  },
  saveText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },
});

import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  RefreshControl, Platform, Alert, Modal, TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";

const WEB_TOP = 0;

const RISK_META: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "#ef4444", bg: "#fef2f2" },
  high:     { label: "High",     color: "#f97316", bg: "#fff7ed" },
  medium:   { label: "Medium",   color: "#f59e0b", bg: "#fffbeb" },
  low:      { label: "Low",      color: "#22c55e", bg: "#f0fdf4" },
};

const CATEGORIES = ["General", "Structure", "Fire Safety", "Plumbing", "Electrical", "Waterproofing", "Compliance", "Safety"];
const RISK_LEVELS = ["low", "medium", "high", "critical"];

export default function TemplateDetailScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const qc = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [showAddItem, setShowAddItem] = useState(false);

  const { data: template, isLoading, refetch, isRefetching } = useQuery<any>({
    queryKey: ["checklist-template", id, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/checklist-templates/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!token && !!id,
  });

  const handleDeleteItem = useCallback(async (itemId: number) => {
    Alert.alert("Delete Item", "Remove this checklist item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${baseUrl}/api/checklist-templates/items/${itemId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });
            refetch();
          } catch {
            Alert.alert("Error", "Could not delete item");
          }
        },
      },
    ]);
  }, [baseUrl, token, refetch]);

  const handleDeleteTemplate = useCallback(() => {
    Alert.alert(
      "Delete Template",
      "This will permanently delete the template and all its items. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await fetch(`${baseUrl}/api/checklist-templates/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              });
              qc.invalidateQueries({ queryKey: ["checklist-templates"] });
              router.back();
            } catch {
              Alert.alert("Error", "Could not delete template");
            }
          },
        },
      ]
    );
  }, [baseUrl, token, id, qc]);

  const items: any[] = template?.items || [];
  const categories = [...new Set(items.map((i: any) => i.category))];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={22} color={Colors.text} />
          </Pressable>
          <View style={styles.headerInfo}>
            <Text style={styles.title} numberOfLines={1}>{template?.name || "Template"}</Text>
            <Text style={styles.subtitle}>
              {template?.discipline} · {template?.folder}
            </Text>
          </View>
          <Pressable onPress={handleDeleteTemplate} style={styles.deleteBtn}>
            <Feather name="trash-2" size={18} color={Colors.danger} />
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBadge}>
            <Feather name="list" size={12} color={Colors.secondary} />
            <Text style={styles.statText}>{items.length} items</Text>
          </View>
          {template?.inspectionType && (
            <View style={styles.statBadge}>
              <Feather name="tag" size={12} color={Colors.secondary} />
              <Text style={styles.statText}>{template.inspectionType.replace(/_/g, " ")}</Text>
            </View>
          )}
          <Pressable style={styles.addItemBtn} onPress={() => setShowAddItem(true)}>
            <Feather name="plus" size={14} color="#fff" />
            <Text style={styles.addItemText}>Add Item</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + 8 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <View key={i} style={styles.skeleton} />)
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="clipboard" size={40} color={Colors.borderLight} />
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptyDesc}>Tap "Add Item" to build your checklist</Text>
            <Pressable style={styles.addFirstBtn} onPress={() => setShowAddItem(true)}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.addFirstText}>Add First Item</Text>
            </Pressable>
          </View>
        ) : (
          categories.map(cat => (
            <View key={cat} style={styles.categoryGroup}>
              <Text style={styles.categoryLabel}>{cat}</Text>
              {items.filter((i: any) => i.category === cat).map((item: any) => {
                return (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemLeft}>
                      <View style={styles.itemBody}>
                        <Text style={styles.itemDesc}>{item.description}</Text>
                        {item.codeReference && (
                          <Text style={styles.itemCode}>{item.codeReference}</Text>
                        )}
                        <View style={styles.itemTags}>
                          {item.isRequired && (
                            <View style={styles.requiredTag}>
                              <Text style={styles.requiredTagText}>Required</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    <Pressable onPress={() => handleDeleteItem(item.id)} style={styles.deleteItemBtn}>
                      <Feather name="trash-2" size={14} color={Colors.textTertiary} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      <AddItemModal
        visible={showAddItem}
        baseUrl={baseUrl}
        token={token}
        templateId={id}
        onClose={() => setShowAddItem(false)}
        onAdded={() => { setShowAddItem(false); refetch(); }}
      />
    </View>
  );
}

/* ── Add Item Modal ──────────────────────────────────────────────────────── */
function AddItemModal({ visible, baseUrl, token, templateId, onClose, onAdded }: any) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [codeRef, setCodeRef] = useState("");
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => { setDescription(""); setCategory("General"); setRiskLevel("medium"); setCodeRef(""); setRequired(true); };

  const handleSave = async () => {
    if (!description.trim()) { Alert.alert("Required", "Enter item description"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${baseUrl}/api/checklist-templates/${templateId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          description: description.trim(),
          category,
          riskLevel,
          codeReference: codeRef.trim() || null,
          isRequired: required,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      reset();
      onAdded();
    } catch {
      Alert.alert("Error", "Could not add item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={am.container}>
        <View style={am.handle} />
        <Text style={am.title}>Add Checklist Item</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={am.form}>
          <Text style={am.label}>Description *</Text>
          <TextInput
            style={[am.input, { height: 80 }]}
            value={description}
            onChangeText={setDescription}
            placeholder="What needs to be checked?"
            placeholderTextColor={Colors.textTertiary}
            multiline
            autoFocus
          />

          <Text style={am.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={am.optRow}>
            {CATEGORIES.map(c => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[am.chip, category === c && am.chipActive]}
              >
                <Text style={[am.chipText, category === c && am.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={am.label}>Code Reference (optional)</Text>
          <TextInput
            style={am.input}
            value={codeRef}
            onChangeText={setCodeRef}
            placeholder="e.g. NCC 2022 Cl 3.3.1"
            placeholderTextColor={Colors.textTertiary}
          />

          <Pressable style={am.requiredRow} onPress={() => setRequired(r => !r)}>
            <View style={[am.checkbox, required && am.checkboxActive]}>
              {required && <Feather name="check" size={12} color="#fff" />}
            </View>
            <Text style={am.requiredLabel}>Required item (must be completed)</Text>
          </Pressable>
        </ScrollView>

        <View style={am.footer}>
          <Pressable style={am.cancelBtn} onPress={() => { reset(); onClose(); }}>
            <Text style={am.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[am.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            <Text style={am.saveText}>{saving ? "Adding…" : "Add Item"}</Text>
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
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  title: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  subtitle: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, marginTop: 2 },
  deleteBtn: { padding: 8 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.infoLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  addItemBtn: {
    marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  addItemText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },

  list: { padding: 16, gap: 16 },
  skeleton: { height: 72, borderRadius: 12, backgroundColor: Colors.border, marginBottom: 4 },
  empty: { alignItems: "center", gap: 10, marginTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  emptyDesc: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary },
  addFirstBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 6,
  },
  addFirstText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff" },

  categoryGroup: { gap: 6 },
  categoryLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: 4 },

  itemCard: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  itemLeft: { flex: 1, flexDirection: "row", gap: 12 },
  riskDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  itemBody: { flex: 1, gap: 6 },
  itemDesc: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 20 },
  itemCode: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  itemTags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  riskTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  riskTagText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold" },
  requiredTag: { backgroundColor: Colors.infoLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  requiredTagText: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  deleteItemBtn: { padding: 6, marginLeft: 4 },
});

const am = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 18, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, textAlign: "center", marginBottom: 4 },
  form: { padding: 20, gap: 6 },
  label: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, marginBottom: 4, marginTop: 12 },
  input: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text,
    backgroundColor: Colors.background, textAlignVertical: "top",
  },
  optRow: { gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  chipTextActive: { color: "#fff" },
  riskRow: { flexDirection: "row", gap: 8 },
  riskChip: {
    flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  riskText: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  requiredRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.border,
    alignItems: "center", justifyContent: "center",
  },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  requiredLabel: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
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

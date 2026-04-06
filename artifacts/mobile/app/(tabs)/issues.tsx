import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
  Animated,
  TouchableWithoutFeedback,
  Modal,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { IssueCard } from "@/components/IssueCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { useTabBarHeight } from "@/hooks/useTabBarHeight";
import { Feather } from "@expo/vector-icons";

const WEB_TOP = 0;

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

interface SelectableIssueCardProps {
  issue: any;
  showProject?: boolean;
  isMultiSelect: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

function SelectableIssueCard({ issue, showProject, isMultiSelect, isSelected, onPress, onLongPress }: SelectableIssueCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.cardWrapper,
        isSelected && styles.cardWrapperSelected,
        pressed && { opacity: 0.85 },
      ]}
    >
      {isMultiSelect && (
        <View style={styles.checkboxArea}>
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={12} color="#fff" />}
          </View>
        </View>
      )}
      <View style={styles.cardContent}>
        <IssueCard issue={issue} showProject={showProject} onPress={onPress} />
      </View>
    </Pressable>
  );
}

export default function IssuesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { token } = useAuth();
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  // Multi-select state
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

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

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["users", token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token && isMultiSelect,
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

  const enterMultiSelect = (issueId: number) => {
    setIsMultiSelect(true);
    setSelectedIds(new Set([issueId]));
    setBulkActionMessage(null);
  };

  const exitMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedIds(new Set());
    setBulkActionMessage(null);
  };

  const toggleSelect = (issueId: number) => {
    if (!isMultiSelect) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const handleCardPress = (issue: any) => {
    if (isMultiSelect) {
      toggleSelect(issue.id);
    }
  };

  const handleCardLongPress = (issueId: number) => {
    if (!isMultiSelect) {
      enterMultiSelect(issueId);
    }
  };

  const doBulkAction = async (patch: Record<string, any>, actionLabel: string) => {
    if (selectedIds.size === 0) return;
    setBulkActionPending(true);
    try {
      const res = await fetch(`${baseUrl}/api/issues/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), patch }),
      });
      if (!res.ok) throw new Error("Failed");
      await refetch();
      setBulkActionMessage(`${actionLabel} for ${selectedIds.size} issue${selectedIds.size !== 1 ? "s" : ""}`);
      exitMultiSelect();
    } catch {
      setBulkActionMessage("Action failed. Please try again.");
    } finally {
      setBulkActionPending(false);
    }
  };

  const doBulkRemind = async () => {
    if (selectedIds.size === 0) return;
    setBulkActionPending(true);
    try {
      const res = await fetch(`${baseUrl}/api/issues/bulk-remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setBulkActionMessage(`Sent ${data.remindersSent} reminder email${data.remindersSent !== 1 ? "s" : ""}`);
      exitMultiSelect();
    } catch {
      setBulkActionMessage("Failed to send reminders.");
    } finally {
      setBulkActionPending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + WEB_TOP + 16 }]}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Issues</Text>
          {criticalCount > 0 && !isMultiSelect && (
            <View style={styles.criticalBadge}>
              <Text style={styles.criticalBadgeText}>{criticalCount} Critical</Text>
            </View>
          )}
          {isMultiSelect && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>{selectedIds.size} selected</Text>
            </View>
          )}
        </View>

        {!isMultiSelect && (
          <>
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
          </>
        )}

        {isMultiSelect && (
          <View style={styles.multiSelectHint}>
            <Text style={styles.multiSelectHintText}>Tap to select · Long press to enter</Text>
            <Pressable onPress={exitMultiSelect} style={styles.exitButton}>
              <Feather name="x" size={14} color={Colors.textSecondary} />
              <Text style={styles.exitButtonText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </View>

      {bulkActionMessage && (
        <View style={styles.actionMessage}>
          <Feather name="check-circle" size={14} color={Colors.success} />
          <Text style={styles.actionMessageText}>{bulkActionMessage}</Text>
          <Pressable onPress={() => setBulkActionMessage(null)}>
            <Feather name="x" size={14} color={Colors.textTertiary} />
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: (isMultiSelect ? 120 : 0) + tabBarHeight + 20 }]}
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
          filtered.map(i => (
            <SelectableIssueCard
              key={i.id}
              issue={i}
              showProject
              isMultiSelect={isMultiSelect}
              isSelected={selectedIds.has(i.id)}
              onPress={() => handleCardPress(i)}
              onLongPress={() => handleCardLongPress(i.id)}
            />
          ))
        )}
      </ScrollView>

      {/* Floating action bar for multi-select */}
      {isMultiSelect && (
        <View style={[styles.floatingBar, { bottom: tabBarHeight + 16 }]}>
          <Pressable
            style={[styles.fabAction, bulkActionPending && styles.fabActionDisabled]}
            onPress={() => setShowAssignModal(true)}
            disabled={bulkActionPending || selectedIds.size === 0}
          >
            <Feather name="user" size={16} color={selectedIds.size === 0 ? Colors.textTertiary : "#fff"} />
            <Text style={[styles.fabActionText, selectedIds.size === 0 && { color: Colors.textTertiary }]}>Assign</Text>
          </Pressable>

          <View style={styles.fabDivider} />

          <Pressable
            style={[styles.fabAction, bulkActionPending && styles.fabActionDisabled]}
            onPress={doBulkRemind}
            disabled={bulkActionPending || selectedIds.size === 0}
          >
            <Feather name="bell" size={16} color={selectedIds.size === 0 ? Colors.textTertiary : "#fff"} />
            <Text style={[styles.fabActionText, selectedIds.size === 0 && { color: Colors.textTertiary }]}>Send Reminder</Text>
          </Pressable>
        </View>
      )}

      {/* Assign modal */}
      <Modal visible={showAssignModal} transparent animationType="slide" onRequestClose={() => setShowAssignModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowAssignModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Assign {selectedIds.size} Issue{selectedIds.size !== 1 ? "s" : ""} To</Text>
                <FlatList
                  data={[{ id: null, name: "Unassigned" }, ...users.map((u: any) => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))]}
                  keyExtractor={(item, idx) => String(item.id ?? idx)}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.modalItem}
                      onPress={async () => {
                        setShowAssignModal(false);
                        await doBulkAction({ assignedToId: item.id }, `Assigned to ${item.name}`);
                      }}
                    >
                      <Feather name="user" size={16} color={Colors.textSecondary} />
                      <Text style={styles.modalItemText}>{item.name}</Text>
                    </Pressable>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.danger,
  },
  selectedBadge: {
    backgroundColor: "#e8f0fe",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + "40",
  },
  selectedBadgeText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  filterLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  chipTextActive: { color: "#FFFFFF" },
  chipTextActive2: { color: Colors.accent },
  multiSelectHint: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  multiSelectHintText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textTertiary,
  },
  exitButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exitButtonText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  list: { padding: 16, gap: 10 },
  skeleton: { height: 140, borderRadius: 12, backgroundColor: Colors.border, marginBottom: 10 },
  cardWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cardWrapperSelected: {
    opacity: 1,
  },
  checkboxArea: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  cardContent: {
    flex: 1,
  },
  floatingBar: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    backgroundColor: Colors.text,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
    gap: 0,
  },
  fabAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 2,
  },
  fabActionDisabled: {
    opacity: 0.5,
  },
  fabActionText: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#fff",
  },
  fabDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 4,
  },
  actionMessage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.success + "18",
    borderBottomWidth: 1,
    borderBottomColor: Colors.success + "30",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionMessageText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    color: Colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: "60%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalItemText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.text,
  },
});

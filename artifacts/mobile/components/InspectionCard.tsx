import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { INSPECTION_TYPES } from "@/constants/api";

interface InspectionCardProps {
  inspection: {
    id: number;
    projectId: number;
    projectName: string;
    inspectionType: string;
    status: string;
    scheduledDate: string;
    scheduledTime?: string | null;
    inspectorName?: string | null;
    passCount: number;
    failCount: number;
    naCount: number;
    orgName?: string | null;
  };
  showProject?: boolean;
  showOrgLabel?: boolean;
}

const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  follow_up_required: "Follow-Up",
  cancelled: "Cancelled",
};

const typeIcons: Record<string, string> = {
  footings: "layers",
  slab: "square",
  frame: "grid",
  final: "check-circle",
  fire_safety: "alert-triangle",
  pool_barrier: "shield",
  special: "star",
  preliminary: "eye",
  progress: "trending-up",
};

export function InspectionCard({ inspection, showProject = true, showOrgLabel = false }: InspectionCardProps) {
  const total = inspection.passCount + inspection.failCount;
  const date = new Date(inspection.scheduledDate);
  const formattedDate = date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/inspection/[id]", params: { id: inspection.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
    >
      <View style={styles.header}>
        <View style={styles.typeRow}>
          <View style={[styles.typeIcon, { backgroundColor: inspection.status === "follow_up_required" ? Colors.dangerLight : Colors.infoLight }]}>
            <Feather
              name={(typeIcons[inspection.inspectionType] || "clipboard") as any}
              size={16}
              color={inspection.status === "follow_up_required" ? Colors.danger : Colors.secondary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.type}>{INSPECTION_TYPES[inspection.inspectionType] || (inspection.inspectionType || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} Inspection</Text>
            {showProject && <Text style={styles.projectName} numberOfLines={1}>{inspection.projectName}</Text>}
          </View>
        </View>
        <View style={styles.badgeGroup}>
          {showOrgLabel && inspection.orgName ? (
            <View style={styles.orgBadge}>
              <Feather name="layers" size={10} color="#7c3aed" />
              <Text style={styles.orgBadgeText} numberOfLines={1}>{inspection.orgName}</Text>
            </View>
          ) : null}
          <Badge label={statusLabels[inspection.status] || inspection.status} variant="status" value={inspection.status} size="sm" />
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Feather name="calendar" size={12} color={Colors.textTertiary} />
          <Text style={styles.metaText}>{formattedDate}</Text>
        </View>
        {inspection.scheduledTime && (
          <View style={styles.metaItem}>
            <Feather name="clock" size={12} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{inspection.scheduledTime}</Text>
          </View>
        )}
        {inspection.inspectorName && (
          <View style={styles.metaItem}>
            <Feather name="user" size={12} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{inspection.inspectorName}</Text>
          </View>
        )}
      </View>

      {total > 0 && (
        <View style={styles.checklistSummary}>
          <View style={styles.checkItem}>
            <View style={[styles.dot, { backgroundColor: Colors.success }]} />
            <Text style={styles.checkText}>{inspection.passCount} Pass</Text>
          </View>
          {inspection.failCount > 0 && (
            <View style={styles.checkItem}>
              <View style={[styles.dot, { backgroundColor: Colors.danger }]} />
              <Text style={[styles.checkText, { color: Colors.danger }]}>{inspection.failCount} Fail</Text>
            </View>
          )}
          {inspection.naCount > 0 && (
            <View style={styles.checkItem}>
              <View style={[styles.dot, { backgroundColor: Colors.textTertiary }]} />
              <Text style={styles.checkText}>{inspection.naCount} N/A</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  type: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  projectName: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
    maxWidth: 180,
  },
  badgeGroup: {
    alignItems: "flex-end",
    gap: 4,
  },
  orgBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f3e8ff",
    borderWidth: 1,
    borderColor: "#d8b4fe",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 110,
  },
  orgBadgeText: {
    fontSize: 10,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: "#7c3aed",
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  checklistSummary: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  checkText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
});

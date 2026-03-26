import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { PROJECT_STAGES } from "@/constants/api";

interface ProjectCardProps {
  project: {
    id: number;
    name: string;
    siteAddress: string;
    suburb: string;
    state: string;
    clientName: string;
    projectType: string;
    status: string;
    stage: string;
    totalInspections: number;
    openIssues: number;
    buildingClassification: string;
  };
  compact?: boolean;
}

const statusLabels: Record<string, string> = {
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  archived: "Archived",
};

export function ProjectCard({ project, compact = false }: ProjectCardProps) {
  const hasCriticalIssues = project.openIssues > 0;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/project/[id]", params: { id: project.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
    >
      <View style={styles.header}>
        <Badge label={statusLabels[project.status] || project.status} variant="status" value={project.status} size="sm" />
      </View>

      <Text style={styles.name} numberOfLines={1}>{project.name}</Text>
      <Text style={styles.address} numberOfLines={1}>
        {project.siteAddress}, {project.suburb} {project.state}
      </Text>

      <View style={styles.clientRow}>
        <Feather name="user" size={12} color={Colors.textTertiary} />
        <Text style={styles.clientName}>{project.clientName}</Text>
      </View>

      {!compact && (
        <>
          <View style={styles.divider} />
          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <View style={[styles.stageBadge]}>
                <Text style={styles.stageText}>{PROJECT_STAGES[project.stage] || project.stage}</Text>
              </View>
            </View>
            <View style={styles.footerStats}>
              <View style={styles.stat}>
                <Feather name="clipboard" size={12} color={Colors.textTertiary} />
                <Text style={styles.statText}>{project.totalInspections}</Text>
              </View>
              {hasCriticalIssues && (
                <View style={[styles.stat, styles.issuesStat]}>
                  <Feather name="alert-circle" size={12} color={Colors.danger} />
                  <Text style={[styles.statText, { color: Colors.danger }]}>{project.openIssues} issues</Text>
                </View>
              )}
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    letterSpacing: -0.2,
  },
  address: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  clientName: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 4,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerItem: {},
  stageBadge: {
    backgroundColor: Colors.primary + "12",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stageText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  footerStats: {
    flexDirection: "row",
    gap: 12,
  },
  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  issuesStat: {},
  statText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
});

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { SEVERITY_LABELS, STATUS_LABELS } from "@/constants/api";

interface IssueCardProps {
  issue: {
    id: number;
    title: string;
    description: string;
    severity: string;
    status: string;
    location?: string | null;
    codeReference?: string | null;
    responsibleParty?: string | null;
    dueDate?: string | null;
    projectName: string;
  };
  showProject?: boolean;
  onPress?: () => void;
}

export function IssueCard({ issue, showProject = true, onPress }: IssueCardProps) {
  const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date() && !["resolved", "closed"].includes(issue.status);
  const formattedDue = issue.dueDate
    ? new Date(issue.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : null;

  const handlePress = onPress || (() => router.push({ pathname: "/issue/[id]", params: { id: issue.id } }));

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        issue.severity === "critical" && styles.criticalBorder,
        pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }
      ]}
    >
      <View style={styles.header}>
        <View style={styles.badges}>
          <Badge label={SEVERITY_LABELS[issue.severity] || issue.severity} variant="severity" value={issue.severity} size="sm" />
          <Badge label={STATUS_LABELS[issue.status] || issue.status} variant="status" value={issue.status} size="sm" />
        </View>
        <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
      </View>

      <Text style={styles.title} numberOfLines={2}>{issue.title}</Text>
      <Text style={styles.description} numberOfLines={2}>{issue.description}</Text>

      <View style={styles.footer}>
        {showProject && (
          <View style={styles.metaItem}>
            <Feather name="folder" size={11} color={Colors.textTertiary} />
            <Text style={styles.metaText} numberOfLines={1}>{issue.projectName}</Text>
          </View>
        )}
        {issue.location && (
          <View style={styles.metaItem}>
            <Feather name="map-pin" size={11} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{issue.location}</Text>
          </View>
        )}
        {formattedDue && (
          <View style={styles.metaItem}>
            <Feather name="calendar" size={11} color={isOverdue ? Colors.danger : Colors.textTertiary} />
            <Text style={[styles.metaText, isOverdue && { color: Colors.danger }]}>
              {isOverdue ? "Overdue " : "Due "}{formattedDue}
            </Text>
          </View>
        )}
        {issue.codeReference && (
          <View style={styles.metaItem}>
            <Feather name="book" size={11} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{issue.codeReference}</Text>
          </View>
        )}
      </View>
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
    gap: 8,
  },
  criticalBorder: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.danger,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badges: {
    flexDirection: "row",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textTertiary,
    maxWidth: 160,
  },
});

import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Pressable,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { SEVERITY_LABELS, STATUS_LABELS } from "@/constants/api";

export default function IssueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const { data: issue, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["issue", id, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/issues/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!token && !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  if (!issue) {
    return <EmptyState icon="alert-triangle" title="Issue not found" />;
  }

  const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date() && !["resolved", "closed"].includes(issue.status);
  const dueDate = issue.dueDate ? new Date(issue.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : null;
  const createdAt = new Date(issue.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const updatedAt = new Date(issue.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, issue.severity === "critical" && styles.heroCritical]}>
        <View style={styles.badges}>
          <Badge label={SEVERITY_LABELS[issue.severity] || issue.severity} variant="severity" value={issue.severity} />
          <Badge label={STATUS_LABELS[issue.status] || issue.status} variant="status" value={issue.status} />
        </View>
        <Text style={styles.title}>{issue.title}</Text>
        <Text style={styles.projectName}>{issue.projectName}</Text>
      </View>

      {/* Overdue Warning */}
      {isOverdue && (
        <View style={styles.overdueAlert}>
          <Feather name="clock" size={16} color={Colors.danger} />
          <Text style={styles.overdueText}>This issue is overdue — Due {dueDate}</Text>
        </View>
      )}

      {/* Description */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Description</Text>
        <Text style={styles.description}>{issue.description}</Text>
      </View>

      {/* Key Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Details</Text>
        {[
          { icon: "map-pin", label: "Location", value: issue.location },
          { icon: "book", label: "NCC Reference", value: issue.codeReference },
          { icon: "user", label: "Responsible Party", value: issue.responsibleParty },
          { icon: "calendar", label: "Due Date", value: dueDate, isOverdue: !!isOverdue },
          { icon: "clock", label: "Reported", value: createdAt },
          { icon: "refresh-cw", label: "Last Updated", value: updatedAt },
        ].filter(d => d.value).map((d, i) => (
          <View key={d.label} style={[styles.detailRow, i > 0 && styles.detailBorder]}>
            <View style={styles.detailLabel}>
              <Feather name={d.icon as any} size={13} color={Colors.textTertiary} />
              <Text style={styles.detailLabelText}>{d.label}</Text>
            </View>
            <Text style={[styles.detailValue, d.isOverdue && { color: Colors.danger }]}>{d.value}</Text>
          </View>
        ))}
      </View>

      {/* Code Reference Info */}
      {issue.codeReference && (
        <View style={styles.codeRefCard}>
          <View style={styles.codeRefHeader}>
            <Feather name="book-open" size={16} color={Colors.secondary} />
            <Text style={styles.codeRefTitle}>Australian Standards Reference</Text>
          </View>
          <Text style={styles.codeRefCode}>{issue.codeReference}</Text>
          <Text style={styles.codeRefDesc}>
            This issue references a specific clause or section of the National Construction Code (NCC) or Australian Standards. Refer to the relevant document for compliance requirements.
          </Text>
        </View>
      )}

      {/* Inspection Link */}
      {issue.inspectionId && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Related Inspection</Text>
          <View style={styles.detailRow}>
            <View style={styles.detailLabel}>
              <Feather name="clipboard" size={13} color={Colors.textTertiary} />
              <Text style={styles.detailLabelText}>Inspection #{issue.inspectionId}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Actions */}
      {!["resolved", "closed"].includes(issue.status) && (
        <View style={styles.actionsCard}>
          <Text style={styles.cardTitle}>Actions</Text>
          <View style={styles.actionRow}>
            {issue.status === "open" && (
              <View style={styles.actionItem}>
                <View style={[styles.actionIcon, { backgroundColor: Colors.warningLight }]}>
                  <Feather name="play" size={16} color={Colors.warning} />
                </View>
                <Text style={styles.actionLabel}>Start Remediation</Text>
              </View>
            )}
            {["open", "in_progress"].includes(issue.status) && (
              <View style={styles.actionItem}>
                <View style={[styles.actionIcon, { backgroundColor: Colors.successLight }]}>
                  <Feather name="check-circle" size={16} color={Colors.success} />
                </View>
                <Text style={styles.actionLabel}>Mark Resolved</Text>
              </View>
            )}
            <View style={styles.actionItem}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.infoLight }]}>
                <Feather name="camera" size={16} color={Colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Add Photo</Text>
            </View>
            <View style={styles.actionItem}>
              <View style={[styles.actionIcon, { backgroundColor: Colors.infoLight }]}>
                <Feather name="message-square" size={16} color={Colors.secondary} />
              </View>
              <Text style={styles.actionLabel}>Add Note</Text>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { gap: 16 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: {
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroCritical: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.danger,
  },
  badges: { flexDirection: "row", gap: 8 },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    lineHeight: 26,
  },
  projectName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  overdueAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.dangerLight,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    marginHorizontal: 16,
  },
  overdueText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.danger,
    flex: 1,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  detailBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  detailLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  detailLabelText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    maxWidth: "55%",
    textAlign: "right",
  },
  codeRefCard: {
    backgroundColor: Colors.infoLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    marginHorizontal: 16,
    padding: 16,
    gap: 8,
  },
  codeRefHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  codeRefTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.secondary,
  },
  codeRefCode: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  codeRefDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  actionsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  actionItem: {
    alignItems: "center",
    gap: 6,
    minWidth: 70,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
  },
});

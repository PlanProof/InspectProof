import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { InspectionCard } from "@/components/InspectionCard";
import { IssueCard } from "@/components/IssueCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { PROJECT_STAGES, PROJECT_TYPES } from "@/constants/api";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const fetchWithAuth = async (url: string) => {
    const res = await fetch(`${baseUrl}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed");
    return res.json();
  };

  const { data: project, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["project", id, token],
    queryFn: () => fetchWithAuth(`/api/projects/${id}`),
    enabled: !!token && !!id,
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ["project-inspections", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections?projectId=${id}`),
    enabled: !!token && !!id,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ["project-issues", id, token],
    queryFn: () => fetchWithAuth(`/api/issues?projectId=${id}`),
    enabled: !!token && !!id,
  });

  const openIssues = issues.filter((i: any) => !["resolved", "closed"].includes(i.status));
  const criticalIssues = openIssues.filter((i: any) => i.severity === "critical");
  const upcomingInspections = inspections.filter((i: any) => i.status !== "completed" && i.status !== "cancelled");

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  if (!project) {
    return (
      <EmptyState icon="folder" title="Project not found" description="This project may have been removed or you don't have access to it." />
    );
  }

  const completedInspections = inspections.filter((i: any) => i.status === "completed").length;
  const passRate = project.totalChecklistItems > 0
    ? Math.round((project.passedItems / project.totalChecklistItems) * 100)
    : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.secondary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.typeChip}>
            <Feather
              name={project.projectType === "residential" ? "home" : project.projectType === "commercial" ? "briefcase" : "layers"}
              size={13}
              color={Colors.secondary}
            />
            <Text style={styles.typeText}>{PROJECT_TYPES[project.projectType] || project.projectType}</Text>
          </View>
          <Badge label={project.status} variant="status" value={project.status} />
        </View>

        <Text style={styles.projectName}>{project.name}</Text>

        <View style={styles.metaRow}>
          <Feather name="map-pin" size={14} color={Colors.textTertiary} />
          <Text style={styles.metaText}>
            {project.siteAddress}, {project.suburb} {project.state} {project.postcode}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Feather name="user" size={14} color={Colors.textTertiary} />
          <Text style={styles.metaText}>{project.clientName}</Text>
          {project.clientEmail && <Text style={styles.metaText}> · {project.clientEmail}</Text>}
        </View>

        {project.clientPhone && (
          <View style={styles.metaRow}>
            <Feather name="phone" size={14} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{project.clientPhone}</Text>
          </View>
        )}

        <View style={styles.stagePill}>
          <Text style={styles.stagePillText}>Stage: {PROJECT_STAGES[project.stage] || project.stage}</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{inspections.length}</Text>
          <Text style={styles.statLabel}>Inspections</Text>
        </View>
        <View style={[styles.statBox, styles.statBorder]}>
          <Text style={styles.statValue}>{completedInspections}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={[styles.statBox, styles.statBorder]}>
          <Text style={[styles.statValue, openIssues.length > 0 && { color: Colors.danger }]}>{openIssues.length}</Text>
          <Text style={styles.statLabel}>Open Issues</Text>
        </View>
        {passRate !== null && (
          <View style={[styles.statBox, styles.statBorder]}>
            <Text style={[styles.statValue, { color: passRate >= 80 ? Colors.success : Colors.warning }]}>{passRate}%</Text>
            <Text style={styles.statLabel}>Pass Rate</Text>
          </View>
        )}
      </View>

      {/* Project Details */}
      <View style={styles.detailsCard}>
        <Text style={styles.cardTitle}>Project Details</Text>
        {[
          { label: "Classification", value: project.buildingClassification },
          { label: "Council Approval", value: project.councilApprovalNum },
          { label: "PCA Ref", value: project.pcaRefNumber },
          { label: "Contract Value", value: project.contractValue ? `$${Number(project.contractValue).toLocaleString()}` : null },
          { label: "Area", value: project.floorArea ? `${project.floorArea} m²` : null },
          { label: "Start Date", value: project.startDate ? new Date(project.startDate).toLocaleDateString("en-AU") : null },
          { label: "Expected End", value: project.expectedEndDate ? new Date(project.expectedEndDate).toLocaleDateString("en-AU") : null },
          { label: "Number of Lots", value: project.numberOfLots },
          { label: "Storeys", value: project.numberOfStoreys },
        ].filter(d => d.value !== null && d.value !== undefined).map((d, i) => (
          <View key={d.label} style={[styles.detailRow, i > 0 && styles.detailBorder]}>
            <Text style={styles.detailLabel}>{d.label}</Text>
            <Text style={styles.detailValue}>{String(d.value)}</Text>
          </View>
        ))}
      </View>

      {/* Critical Issues Alert */}
      {criticalIssues.length > 0 && (
        <View style={styles.criticalAlert}>
          <Feather name="alert-triangle" size={16} color={Colors.danger} />
          <Text style={styles.criticalAlertText}>{criticalIssues.length} critical issue{criticalIssues.length > 1 ? "s" : ""} require immediate action</Text>
        </View>
      )}

      {/* Inspections */}
      <View style={styles.section}>
        <SectionHeader
          title={`Inspections (${inspections.length})`}
          actionLabel={inspections.length > 3 ? "View All" : undefined}
          onAction={() => router.push({ pathname: "/(tabs)/inspections" })}
        />
        {upcomingInspections.length === 0 && inspections.filter((i: any) => i.status === "completed").length === 0 ? (
          <EmptyState icon="clipboard" title="No inspections scheduled" />
        ) : (
          <>
            {upcomingInspections.slice(0, 2).map((i: any) => (
              <InspectionCard key={i.id} inspection={i} showProject={false} />
            ))}
            {inspections.filter((i: any) => i.status === "completed").slice(0, 2).map((i: any) => (
              <InspectionCard key={i.id} inspection={i} showProject={false} />
            ))}
          </>
        )}
      </View>

      {/* Issues */}
      <View style={styles.section}>
        <SectionHeader title={`Issues (${openIssues.length} open)`} />
        {openIssues.length === 0 ? (
          <EmptyState icon="check-circle" title="No open issues" description="All issues have been resolved" />
        ) : (
          openIssues.slice(0, 4).map((i: any) => (
            <IssueCard key={i.id} issue={{ ...i, projectName: project.name }} showProject={false} />
          ))
        )}
      </View>

      {/* Notes */}
      {project.notes && (
        <View style={styles.notesCard}>
          <Text style={styles.cardTitle}>Notes</Text>
          <Text style={styles.notesText}>{project.notes}</Text>
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
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.infoLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  typeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.secondary,
  },
  projectName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
  },
  stagePill: {
    alignSelf: "flex-start",
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  stagePillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  statBox: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statBorder: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderLight,
  },
  statValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    overflow: "hidden",
    padding: 16,
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  detailBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    textAlign: "right",
    maxWidth: "60%",
  },
  criticalAlert: {
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
  criticalAlertText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.danger,
    flex: 1,
  },
  section: {
    marginHorizontal: 16,
    gap: 10,
  },
  notesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 8,
  },
  notesText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

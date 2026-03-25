import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IssueCard } from "@/components/IssueCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { INSPECTION_TYPES } from "@/constants/api";

export default function InspectionDetailScreen() {
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

  const { data: inspection, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["inspection", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}`),
    enabled: !!token && !!id,
  });

  const { data: checklistItems = [] } = useQuery({
    queryKey: ["inspection-checklist", id, token],
    queryFn: () => fetchWithAuth(`/api/inspections/${id}/checklist`),
    enabled: !!token && !!id,
  });

  const { data: issues = [] } = useQuery({
    queryKey: ["inspection-issues", id, token],
    queryFn: () => fetchWithAuth(`/api/issues?inspectionId=${id}`),
    enabled: !!token && !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.secondary} />
      </View>
    );
  }

  if (!inspection) {
    return <EmptyState icon="clipboard" title="Inspection not found" />;
  }

  const date = new Date(inspection.scheduledDate).toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  const passItems = checklistItems.filter((i: any) => i.result === "pass");
  const failItems = checklistItems.filter((i: any) => i.result === "fail");
  const naItems = checklistItems.filter((i: any) => i.result === "na");
  const pendingItems = checklistItems.filter((i: any) => !i.result);
  const total = checklistItems.length;
  const passRate = total > 0 ? Math.round((passItems.length / (total - naItems.length)) * 100) : null;

  const groupedChecklist: Record<string, any[]> = {};
  checklistItems.forEach((item: any) => {
    const cat = item.category || "General";
    if (!groupedChecklist[cat]) groupedChecklist[cat] = [];
    groupedChecklist[cat].push(item);
  });

  const resultIcon = (result: string | null) => {
    if (result === "pass") return <Feather name="check-circle" size={18} color={Colors.success} />;
    if (result === "fail") return <Feather name="x-circle" size={18} color={Colors.danger} />;
    if (result === "na") return <Feather name="minus-circle" size={18} color={Colors.textTertiary} />;
    return <Feather name="circle" size={18} color={Colors.border} />;
  };

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
            <Text style={styles.typeText}>{INSPECTION_TYPES[inspection.inspectionType] || inspection.inspectionType}</Text>
          </View>
          <Badge label={inspection.status.replace("_", " ")} variant="status" value={inspection.status} />
        </View>
        <Text style={styles.projectName}>{inspection.projectName}</Text>
        {inspection.projectAddress ? (
          <Text style={styles.projectAddress}>{inspection.projectAddress}</Text>
        ) : null}

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Feather name="calendar" size={13} color={Colors.textTertiary} />
            <Text style={styles.metaText}>{date}</Text>
          </View>
          {inspection.scheduledTime && (
            <View style={styles.metaItem}>
              <Feather name="clock" size={13} color={Colors.textTertiary} />
              <Text style={styles.metaText}>{inspection.scheduledTime}</Text>
            </View>
          )}
          {inspection.inspectorName && (
            <View style={styles.metaItem}>
              <Feather name="user" size={13} color={Colors.textTertiary} />
              <Text style={styles.metaText}>{inspection.inspectorName}</Text>
            </View>
          )}
        </View>

        {inspection.status !== "completed" && inspection.status !== "follow_up_required" && (
          <Pressable
            style={styles.conductBtn}
            onPress={() => router.push(`/inspection/conduct/${inspection.id}` as any)}
          >
            <Feather name="play-circle" size={18} color={Colors.primary} />
            <Text style={styles.conductBtnText}>
              {inspection.status === "in_progress" ? "Continue Inspection" : "Start Inspection"}
            </Text>
            <Feather name="arrow-right" size={16} color={Colors.primary} />
          </Pressable>
        )}
        {(inspection.status === "completed" || inspection.status === "follow_up_required") && (
          <Pressable
            style={styles.reportBtn}
            onPress={() => router.push({ pathname: "/inspection/generate-report", params: { id: inspection.id } } as any)}
          >
            <Feather name="file-text" size={18} color={Colors.surface} />
            <Text style={styles.reportBtnText}>Generate Report</Text>
            <Feather name="arrow-right" size={16} color={Colors.surface} />
          </Pressable>
        )}
      </View>

      {/* Result Summary */}
      {total > 0 && (
        <View style={styles.resultCard}>
          <Text style={styles.cardTitle}>Checklist Summary</Text>
          <View style={styles.resultBar}>
            {passItems.length > 0 && (
              <View style={[styles.barSegment, { flex: passItems.length, backgroundColor: Colors.success }]} />
            )}
            {failItems.length > 0 && (
              <View style={[styles.barSegment, { flex: failItems.length, backgroundColor: Colors.danger }]} />
            )}
            {naItems.length > 0 && (
              <View style={[styles.barSegment, { flex: naItems.length, backgroundColor: Colors.textTertiary }]} />
            )}
            {pendingItems.length > 0 && (
              <View style={[styles.barSegment, { flex: pendingItems.length, backgroundColor: Colors.border }]} />
            )}
          </View>
          <View style={styles.resultStats}>
            <View style={styles.resultStat}>
              <Text style={[styles.resultCount, { color: Colors.success }]}>{passItems.length}</Text>
              <Text style={styles.resultLabel}>Pass</Text>
            </View>
            {failItems.length > 0 && (
              <View style={styles.resultStat}>
                <Text style={[styles.resultCount, { color: Colors.danger }]}>{failItems.length}</Text>
                <Text style={styles.resultLabel}>Fail</Text>
              </View>
            )}
            {naItems.length > 0 && (
              <View style={styles.resultStat}>
                <Text style={[styles.resultCount, { color: Colors.textTertiary }]}>{naItems.length}</Text>
                <Text style={styles.resultLabel}>N/A</Text>
              </View>
            )}
            {pendingItems.length > 0 && (
              <View style={styles.resultStat}>
                <Text style={[styles.resultCount, { color: Colors.textSecondary }]}>{pendingItems.length}</Text>
                <Text style={styles.resultLabel}>Pending</Text>
              </View>
            )}
            {passRate !== null && (
              <View style={[styles.resultStat, styles.passRateStat]}>
                <Text style={[styles.resultCount, { color: passRate >= 80 ? Colors.success : Colors.warning }]}>{passRate}%</Text>
                <Text style={styles.resultLabel}>Pass Rate</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Overall Result */}
      {inspection.overallResult && (
        <View style={[styles.overallBanner, {
          backgroundColor: inspection.overallResult === "pass" ? Colors.successLight : inspection.overallResult === "fail" ? Colors.dangerLight : Colors.warningLight,
          borderColor: inspection.overallResult === "pass" ? Colors.successBorder : inspection.overallResult === "fail" ? Colors.dangerBorder : Colors.warningBorder,
        }]}>
          <Feather
            name={inspection.overallResult === "pass" ? "check-circle" : inspection.overallResult === "fail" ? "x-circle" : "alert-circle"}
            size={20}
            color={inspection.overallResult === "pass" ? Colors.success : inspection.overallResult === "fail" ? Colors.danger : Colors.warning}
          />
          <Text style={[styles.overallText, { color: inspection.overallResult === "pass" ? Colors.success : inspection.overallResult === "fail" ? Colors.danger : Colors.warning }]}>
            Overall Result: {inspection.overallResult.toUpperCase()}
          </Text>
        </View>
      )}

      {/* Inspection Notes */}
      {Array.isArray(inspection.notes) && inspection.notes.length > 0 && (
        <View style={styles.notesCard}>
          <Text style={styles.cardTitle}>Inspection Notes</Text>
          {inspection.notes.map((note: any) => (
            <View key={note.id} style={styles.noteItem}>
              <Text style={styles.notesText}>{note.content}</Text>
              {note.authorName && (
                <Text style={styles.noteAuthor}>— {note.authorName}</Text>
              )}
            </View>
          ))}
        </View>
      )}
      {typeof inspection.notes === "string" && inspection.notes.length > 0 && (
        <View style={styles.notesCard}>
          <Text style={styles.cardTitle}>Inspection Notes</Text>
          <Text style={styles.notesText}>{inspection.notes}</Text>
        </View>
      )}

      {/* Checklist Items by Category */}
      {Object.keys(groupedChecklist).length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={`Checklist (${total} items)`} />
          {Object.entries(groupedChecklist).map(([category, items]) => (
            <View key={category} style={styles.checklistGroup}>
              <Text style={styles.categoryLabel}>{category}</Text>
              {items.map((item: any) => (
                <View key={item.id} style={[styles.checklistItem, { borderLeftColor: item.result === "pass" ? Colors.success : item.result === "fail" ? Colors.danger : Colors.border }]}>
                  <View style={styles.checklistIcon}>{resultIcon(item.result)}</View>
                  <View style={styles.checklistContent}>
                    <Text style={styles.checklistItemText}>{item.description}</Text>
                    {item.codeReference && (
                      <Text style={styles.nccRef}>{item.codeReference}</Text>
                    )}
                    {item.notes && (
                      <Text style={styles.checklistComment}>"{item.notes}"</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title={`Issues (${issues.length})`} />
          {issues.map((i: any) => (
            <IssueCard key={i.id} issue={{ ...i, projectName: inspection.projectName }} showProject={false} />
          ))}
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
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeChip: {
    backgroundColor: Colors.primary + "15",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  typeText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  conductBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 6,
  },
  conductBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.primary,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.secondary,
    paddingVertical: 13,
    borderRadius: 10,
    marginTop: 6,
  },
  reportBtnText: {
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.surface,
  },
  projectName: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    lineHeight: 24,
  },
  projectAddress: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text },
  resultBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: Colors.borderLight,
    gap: 1,
  },
  barSegment: { height: 8 },
  resultStats: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  resultStat: { alignItems: "center", gap: 2 },
  passRateStat: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.borderLight,
    paddingLeft: 16,
  },
  resultCount: { fontSize: 20, fontFamily: "PlusJakartaSans_600SemiBold" },
  resultLabel: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary },
  overallBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    marginHorizontal: 16,
  },
  overallText: { fontSize: 15, fontFamily: "PlusJakartaSans_600SemiBold" },
  notesCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: 16,
    padding: 16,
    gap: 8,
  },
  notesText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 20 },
  noteItem: { gap: 2, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  noteAuthor: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textTertiary, fontStyle: "italic" },
  section: { marginHorizontal: 16, gap: 10 },
  checklistGroup: { gap: 8 },
  categoryLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  checklistItem: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderLeftWidth: 3,
  },
  checklistIcon: { paddingTop: 1 },
  checklistContent: { flex: 1, gap: 3 },
  checklistItemText: { fontSize: 14, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.text, lineHeight: 20 },
  nccRef: { fontSize: 11, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.secondary },
  checklistComment: { fontSize: 12, fontFamily: "PlusJakartaSans_600SemiBold", color: Colors.textSecondary, lineHeight: 16 },
});

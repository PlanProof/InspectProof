import React, { useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/AuthContext";
import { SEVERITY_LABELS, STATUS_LABELS } from "@/constants/api";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "rejected"],
  in_progress: ["pending_review", "closed", "rejected"],
  pending_review: ["closed", "in_progress", "rejected"],
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  open: { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
  in_progress: { bg: "#eff6ff", text: "#2563eb", border: "#93c5fd" },
  pending_review: { bg: "#fefce8", text: "#ca8a04", border: "#fde047" },
  closed: { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
  resolved: { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
  rejected: { bg: "#f9fafb", text: "#6b7280", border: "#d1d5db" },
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  in_progress: "Start Work",
  pending_review: "Submit for Review",
  closed: "Close Out",
  rejected: "Reject",
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function IssueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const baseUrl = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

  const [transitioning, setTransitioning] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const commentInputRef = useRef<TextInput>(null);

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

  const { data: comments = [], refetch: refetchComments } = useQuery({
    queryKey: ["issue-comments", id, token],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}/api/issues/${id}/comments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token && !!id,
  });

  const handleStatusTransition = async (newStatus: string) => {
    if (transitioning) return;

    const needsNotes = newStatus === "closed" || newStatus === "rejected";
    const actionLabel = STATUS_ACTION_LABELS[newStatus] || newStatus;

    if (needsNotes) {
      Alert.prompt(
        newStatus === "closed" ? "Close Out Issue" : "Reject Issue",
        newStatus === "closed"
          ? "Describe the remediation work completed:"
          : "Provide a reason for rejecting this issue:",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: async (notes) => {
              if (!notes?.trim()) {
                Alert.alert("Required", "Please provide notes before continuing.");
                return;
              }
              await doTransition(newStatus, notes.trim());
            },
          },
        ],
        "plain-text"
      );
    } else {
      Alert.alert(
        "Update Status",
        `Move this issue to "${(STATUS_ACTION_LABELS[newStatus] || newStatus).replace(/_/g, " ")}"?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Confirm",
            onPress: () => doTransition(newStatus),
          },
        ]
      );
    }
  };

  const doTransition = async (newStatus: string, notes?: string) => {
    setTransitioning(true);
    try {
      const body: Record<string, any> = { status: newStatus };
      if (notes) body.closeoutNotes = notes;

      const res = await fetch(`${baseUrl}/api/issues/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update status");
      }

      await refetch();
      await refetchComments();
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update issue status");
    } finally {
      setTransitioning(false);
    }
  };

  const handlePostComment = async () => {
    const text = commentText.trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch(`${baseUrl}/api/issues/${id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error("Failed to post comment");
      setCommentText("");
      await refetchComments();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

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

  const isTerminal = ["resolved", "closed", "rejected"].includes(issue.status);
  const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date() && !isTerminal;
  const dueDate = issue.dueDate
    ? new Date(issue.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const createdAt = new Date(issue.createdAt).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });

  const nextStatuses = STATUS_TRANSITIONS[issue.status] ?? [];
  const statusColor = STATUS_COLORS[issue.status] ?? STATUS_COLORS.open;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top + 56}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.secondary} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={[styles.hero, issue.severity === "critical" && styles.heroCritical]}>
          <View style={styles.badges}>
            <Badge label={SEVERITY_LABELS[issue.severity] || issue.severity} variant="severity" value={issue.severity} />
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg, borderColor: statusColor.border }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
                {STATUS_LABELS[issue.status] || issue.status.replace(/_/g, " ")}
              </Text>
            </View>
            {issue.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{issue.category}</Text>
              </View>
            )}
          </View>
          <Text style={styles.title}>{issue.title}</Text>
          <Text style={styles.projectName}>{issue.projectName}</Text>
          {issue.priority && (
            <Text style={styles.priorityText}>Priority: {issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1)}</Text>
          )}
        </View>

        {/* Overdue Warning */}
        {isOverdue && (
          <View style={styles.overdueAlert}>
            <Feather name="clock" size={16} color={Colors.danger} />
            <Text style={styles.overdueText}>Overdue — Due {dueDate}</Text>
          </View>
        )}

        {/* Status Actions */}
        {!isTerminal && nextStatuses.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Update Status</Text>
            {transitioning ? (
              <ActivityIndicator size="small" color={Colors.secondary} />
            ) : (
              <View style={styles.actionButtonRow}>
                {nextStatuses.map((s) => {
                  const sc = STATUS_COLORS[s];
                  const isReject = s === "rejected";
                  const isClose = s === "closed";
                  return (
                    <Pressable
                      key={s}
                      style={({ pressed }) => [
                        styles.transitionBtn,
                        {
                          backgroundColor: pressed
                            ? (sc?.bg ?? Colors.borderLight)
                            : (sc?.bg ?? Colors.borderLight),
                          borderColor: sc?.border ?? Colors.border,
                          opacity: pressed ? 0.85 : 1,
                        },
                        isClose && { borderColor: "#16a34a" },
                        isReject && { borderColor: Colors.danger },
                      ]}
                      onPress={() => handleStatusTransition(s)}
                    >
                      <Feather
                        name={isClose ? "check-circle" : isReject ? "x-circle" : "arrow-right-circle"}
                        size={16}
                        color={isClose ? "#16a34a" : isReject ? Colors.danger : sc?.text ?? Colors.secondary}
                      />
                      <Text
                        style={[
                          styles.transitionBtnText,
                          { color: isClose ? "#16a34a" : isReject ? Colors.danger : sc?.text ?? Colors.secondary },
                        ]}
                      >
                        {STATUS_ACTION_LABELS[s] || s.replace(/_/g, " ")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Closed / Rejected status display */}
        {isTerminal && (
          <View style={[styles.card, { borderColor: statusColor.border, backgroundColor: statusColor.bg }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather
                name={issue.status === "rejected" ? "x-circle" : "check-circle"}
                size={20}
                color={statusColor.text}
              />
              <Text style={[styles.cardTitle, { color: statusColor.text }]}>
                {issue.status === "rejected" ? "Rejected / Not Required" : issue.status === "closed" ? "Closed Out" : "Resolved"}
              </Text>
            </View>
            {issue.closeoutNotes && (
              <Text style={[styles.description, { color: statusColor.text }]}>{issue.closeoutNotes}</Text>
            )}
            {issue.resolvedDate && (
              <Text style={{ fontSize: 12, color: statusColor.text, opacity: 0.8 }}>
                {new Date(issue.resolvedDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
              </Text>
            )}
          </View>
        )}

        {/* Description */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Description</Text>
          <Text style={styles.description}>{issue.description || "No description provided."}</Text>
        </View>

        {/* Key Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Details</Text>
          {[
            { icon: "map-pin", label: "Location", value: issue.location },
            { icon: "user", label: "Assigned To", value: issue.assigneeName },
            { icon: "tag", label: "Responsible Party", value: issue.responsibleParty },
            { icon: "book", label: "NCC Reference", value: issue.codeReference },
            { icon: "calendar", label: "Due Date", value: dueDate, isOverdue: !!isOverdue },
            { icon: "clock", label: "Reported", value: createdAt },
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

        {/* Inspection Link */}
        {issue.inspectionId && (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: "/(tabs)/inspection/conduct/[id]" as any, params: { id: String(issue.inspectionId) } })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="clipboard" size={16} color={Colors.secondary} />
                <Text style={styles.cardTitle}>Linked Inspection #{issue.inspectionId}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={Colors.textTertiary} />
            </View>
          </Pressable>
        )}

        {/* Comments / History */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            History & Comments {comments.length > 0 ? `(${comments.length})` : ""}
          </Text>

          {/* Comment input */}
          <View style={styles.commentComposer}>
            <TextInput
              ref={commentInputRef}
              style={styles.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="Add a comment…"
              placeholderTextColor={Colors.textTertiary}
              multiline
              returnKeyType="default"
            />
            <Pressable
              onPress={handlePostComment}
              disabled={!commentText.trim() || postingComment}
              style={({ pressed }) => [
                styles.commentSendBtn,
                (!commentText.trim() || postingComment) && { opacity: 0.4 },
                pressed && { opacity: 0.7 },
              ]}
            >
              {postingComment
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="send" size={16} color="#fff" />}
            </Pressable>
          </View>

          {/* Feed */}
          {comments.length === 0 ? (
            <Text style={styles.emptyComments}>No activity yet.</Text>
          ) : (
            <View style={styles.commentFeed}>
              {comments.map((item: any) => {
                const isComment = item.type === "comment";
                return (
                  <View key={item.id} style={[styles.commentItem, isComment && styles.commentItemHighlight]}>
                    <View style={[styles.commentDot, { backgroundColor: isComment ? Colors.secondary : Colors.border }]} />
                    <View style={styles.commentBody}>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentUser}>{item.userName}</Text>
                        {isComment && (
                          <View style={styles.commentTypePill}>
                            <Text style={styles.commentTypeText}>comment</Text>
                          </View>
                        )}
                        <Text style={styles.commentTime}>{timeAgo(item.createdAt)}</Text>
                      </View>
                      <Text style={styles.commentText}>{item.description || item.body}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { gap: 14 },
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
  badges: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    textTransform: "capitalize",
  },
  categoryBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.borderLight,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  title: {
    fontSize: 20,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    lineHeight: 26,
  },
  projectName: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  priorityText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textTertiary,
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
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
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
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    maxWidth: "55%",
    textAlign: "right",
  },
  actionButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  transitionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    flex: 1,
    minWidth: 120,
    justifyContent: "center",
  },
  transitionBtnText: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  commentComposer: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end",
    marginBottom: 4,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
    backgroundColor: Colors.background,
    maxHeight: 100,
    minHeight: 42,
  },
  commentSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyComments: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  commentFeed: {
    gap: 2,
    marginTop: 4,
  },
  commentItem: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  commentItemHighlight: {
    backgroundColor: "#f0f6ff",
    borderRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderTopWidth: 0,
    marginTop: 2,
  },
  commentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  commentBody: { flex: 1 },
  commentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
    flexWrap: "wrap",
  },
  commentUser: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.text,
  },
  commentTypePill: {
    backgroundColor: "#dbeafe",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  commentTypeText: {
    fontSize: 10,
    color: "#2563eb",
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  commentTime: {
    fontSize: 11,
    color: Colors.textTertiary,
    fontFamily: "PlusJakartaSans_600SemiBold",
    marginLeft: "auto",
  },
  commentText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: "PlusJakartaSans_600SemiBold",
    lineHeight: 19,
  },
});

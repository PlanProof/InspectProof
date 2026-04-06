import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { Colors } from "@/constants/colors";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, lastSyncTime, triggerSync } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <View style={styles.offlineBanner}>
        <Feather name="wifi-off" size={14} color="#fff" style={styles.icon} />
        <Text style={styles.offlineText}>
          Offline — changes saved locally
          {pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
        </Text>
      </View>
    );
  }

  if (isSyncing) {
    return (
      <View style={styles.syncingBanner}>
        <Feather name="refresh-cw" size={14} color="#fff" style={styles.icon} />
        <Text style={styles.offlineText}>Syncing {pendingCount} change{pendingCount !== 1 ? "s" : ""}…</Text>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <Pressable style={styles.pendingBanner} onPress={triggerSync}>
        <Feather name="upload-cloud" size={14} color="#fff" style={styles.icon} />
        <Text style={styles.offlineText}>
          {pendingCount} unsynced change{pendingCount !== 1 ? "s" : ""} — tap to sync
        </Text>
      </Pressable>
    );
  }

  return null;
}

export function SyncStatusBadge() {
  const { pendingCount, isSyncing, isOnline, failedItems } = useOfflineSync();

  if (failedItems.length > 0) {
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{failedItems.length}</Text>
      </View>
    );
  }

  if (pendingCount > 0 || isSyncing) {
    return (
      <View style={[styles.badge, styles.badgePending]}>
        <Text style={styles.badgeText}>{pendingCount}</Text>
      </View>
    );
  }

  return null;
}

export function SyncStatusIndicator() {
  const { pendingCount, isSyncing, isOnline, lastSyncTime, failedItems, triggerSync } = useOfflineSync();

  let color = Colors.success;
  let iconName: "check-circle" | "refresh-cw" | "wifi-off" | "alert-circle" | "upload-cloud" = "check-circle";
  let label = "Synced";

  if (!isOnline) {
    color = "#718096";
    iconName = "wifi-off";
    label = "Offline";
  } else if (isSyncing) {
    color = Colors.info;
    iconName = "refresh-cw";
    label = "Syncing…";
  } else if (failedItems.length > 0) {
    color = Colors.danger;
    iconName = "alert-circle";
    label = `${failedItems.length} failed`;
  } else if (pendingCount > 0) {
    color = Colors.warning;
    iconName = "upload-cloud";
    label = `${pendingCount} pending`;
  } else if (lastSyncTime) {
    const date = new Date(lastSyncTime);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) label = "Just synced";
    else if (diff < 3600000) label = `${Math.floor(diff / 60000)}m ago`;
    else label = "Synced";
  }

  return (
    <Pressable style={styles.syncIndicator} onPress={pendingCount > 0 ? triggerSync : undefined}>
      <Feather name={iconName} size={12} color={color} />
      <Text style={[styles.syncLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function SyncToastContainer() {
  const { toastMessages, dismissToast } = useOfflineSync();

  if (toastMessages.length === 0) return null;

  return (
    <View style={styles.toastContainer} pointerEvents="box-none">
      {toastMessages.map(toast => (
        <Pressable
          key={toast.id}
          style={[styles.toast, toast.type === "success" ? styles.toastSuccess : styles.toastError]}
          onPress={() => dismissToast(toast.id)}
        >
          <Feather
            name={toast.type === "success" ? "check-circle" : "alert-circle"}
            size={14}
            color="#fff"
            style={styles.icon}
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function FailedSyncCard({ item, onRetry }: { item: { id: string; type: string; errorMessage?: string; failCount: number }; onRetry: (id: string) => void }) {
  const typeLabel: Record<string, string> = {
    checklist_result: "Checklist update",
    defect_create: "Defect record",
    photo_upload: "Photo upload",
    inspection_status: "Status change",
  };

  return (
    <View style={styles.failCard}>
      <View style={styles.failCardContent}>
        <Feather name="alert-circle" size={16} color={Colors.danger} style={styles.icon} />
        <View style={styles.failCardText}>
          <Text style={styles.failCardTitle}>{typeLabel[item.type] ?? "Change"} failed to sync</Text>
          {item.errorMessage ? (
            <Text style={styles.failCardError} numberOfLines={1}>{item.errorMessage}</Text>
          ) : null}
          <Text style={styles.failCardAttempts}>Failed {item.failCount} time{item.failCount !== 1 ? "s" : ""}</Text>
        </View>
      </View>
      <Pressable style={styles.retryButton} onPress={() => onRetry(item.id)}>
        <Feather name="refresh-cw" size={12} color={Colors.info} />
        <Text style={styles.retryButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: "#4A5568",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  syncingBanner: {
    backgroundColor: Colors.info,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  pendingBanner: {
    backgroundColor: Colors.warning,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  offlineText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  icon: {
    marginRight: 6,
  },
  badge: {
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    position: "absolute",
    top: -4,
    right: -4,
  },
  badgePending: {
    backgroundColor: Colors.warning,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  syncIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  syncLabel: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_500Medium",
  },
  toastContainer: {
    position: "absolute",
    bottom: 90,
    left: 16,
    right: 16,
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  toastSuccess: {
    backgroundColor: Colors.success,
  },
  toastError: {
    backgroundColor: Colors.danger,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "PlusJakartaSans_500Medium",
    flex: 1,
  },
  failCard: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  failCardContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
  },
  failCardText: {
    flex: 1,
  },
  failCardTitle: {
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.danger,
  },
  failCardError: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  failCardAttempts: {
    fontSize: 11,
    fontFamily: "PlusJakartaSans_400Regular",
    color: Colors.textTertiary,
    marginTop: 2,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.infoLight,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
  },
  retryButtonText: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: Colors.info,
  },
});

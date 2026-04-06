import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useOfflineSync } from "@/context/OfflineSyncContext";
import { Colors } from "@/constants/colors";

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, justCameOnline, triggerSync } = useOfflineSync();

  if (justCameOnline) {
    return (
      <View style={styles.backOnlineBanner}>
        <Feather name="wifi" size={14} color="#fff" style={styles.icon} />
        <Text style={styles.offlineText}>
          {isSyncing ? "Back online — syncing…" : "Back online"}
        </Text>
      </View>
    );
  }

  if (!isOnline) {
    return (
      <View style={styles.offlineBanner}>
        <Feather name="wifi-off" size={14} color="#fff" style={styles.icon} />
        <Text style={styles.offlineText}>
          No connection — working offline
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
  const { pendingCount, isSyncing, failedItems } = useOfflineSync();

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
  let sublabel: string | null = null;

  const lastSyncLabel = React.useMemo(() => {
    if (!lastSyncTime) return null;
    const date = new Date(lastSyncTime);
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) return `today at ${h12}:${m} ${ampm}`;
    return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${h12}:${m} ${ampm}`;
  }, [lastSyncTime]);

  if (!isOnline) {
    color = "#718096";
    iconName = "wifi-off";
    label = "Offline";
    if (pendingCount > 0) {
      sublabel = `${pendingCount} pending${lastSyncLabel ? ` · synced ${lastSyncLabel}` : ""}`;
    } else if (lastSyncLabel) {
      sublabel = `synced ${lastSyncLabel}`;
    }
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
    if (lastSyncLabel) label = lastSyncLabel === "just now" ? "Just synced" : `Synced ${lastSyncLabel}`;
    else label = "Synced";
  }

  return (
    <Pressable style={styles.syncIndicator} onPress={pendingCount > 0 && isOnline ? triggerSync : undefined}>
      <Feather name={iconName} size={12} color={color} />
      <View>
        <Text style={[styles.syncLabel, { color }]}>{label}</Text>
        {sublabel ? <Text style={styles.syncSublabel}>{sublabel}</Text> : null}
      </View>
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

export function FailedSyncCard({
  item,
  onRetry,
  onDismiss,
}: {
  item: { id: string; type: string; errorMessage?: string; failCount: number; itemName?: string };
  onRetry: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
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
          {item.itemName ? (
            <Text style={styles.failCardItemName} numberOfLines={1}>{item.itemName}</Text>
          ) : null}
          {item.errorMessage ? (
            <Text style={styles.failCardError} numberOfLines={1}>{item.errorMessage}</Text>
          ) : null}
          <Text style={styles.failCardAttempts}>Failed {item.failCount} time{item.failCount !== 1 ? "s" : ""}</Text>
        </View>
      </View>
      <View style={styles.failCardActions}>
        <Pressable style={styles.retryButton} onPress={() => onRetry(item.id)}>
          <Feather name="refresh-cw" size={12} color={Colors.info} />
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
        {onDismiss && (
          <Pressable style={styles.dismissButton} onPress={() => onDismiss(item.id)}>
            <Feather name="x" size={14} color={Colors.textSecondary} />
          </Pressable>
        )}
      </View>
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
  backOnlineBanner: {
    backgroundColor: Colors.success,
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
  syncSublabel: {
    fontSize: 9,
    fontFamily: "PlusJakartaSans_400Regular",
    color: "#718096",
    marginTop: 1,
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
  failCardItemName: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    color: Colors.text,
    marginTop: 1,
  },
  failCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dismissButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Colors.borderLight,
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

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import {
  loadQueue,
  enqueue,
  updateQueueItem,
  removeQueueItem,
  resetItemForRetry,
  recoverStaleSyncingItems,
  clearOfflineBaseline,
  getEligibleItems,
  getLastSyncTime,
  setLastSyncTime,
  QueuedMutation,
  RETRY_DELAYS_MS,
  MAX_FAIL_COUNT,
} from "@/utils/offlineQueue";
import { useAuth } from "@/context/AuthContext";

export interface SyncToastMessage {
  id: string;
  type: "success" | "error";
  message: string;
}

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedItems: QueuedMutation[];
  lastSyncTime: string | null;
  toastMessages: SyncToastMessage[];
  dismissToast: (id: string) => void;
  addToQueue: (mutation: Omit<QueuedMutation, "id" | "syncStatus" | "failCount" | "createdAt">) => Promise<QueuedMutation>;
  retryFailed: () => Promise<void>;
  retrySingleItem: (itemId: string) => Promise<void>;
  triggerSync: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | null>(null);

function getBaseUrl() {
  return process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "";
}

async function executeMutation(mutation: QueuedMutation, token: string | null): Promise<void> {
  const baseUrl = getBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (mutation.type === "checklist_result") {
    const { inspectionId, resultId, ...body } = mutation.payload as {
      inspectionId: number;
      resultId: number;
      [key: string]: unknown;
    };
    const res = await fetch(`${baseUrl}/api/inspections/${inspectionId}/checklist/${resultId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else if (mutation.type === "inspection_status") {
    const { inspectionId, ...body } = mutation.payload as {
      inspectionId: number;
      [key: string]: unknown;
    };
    const res = await fetch(`${baseUrl}/api/inspections/${inspectionId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else if (mutation.type === "defect_create") {
    const { inspectionId, ...body } = mutation.payload as {
      inspectionId: number;
      [key: string]: unknown;
    };
    const res = await fetch(`${baseUrl}/api/issues`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...body, inspectionId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } else if (mutation.type === "photo_upload") {
    const { inspectionId, resultId, photoDataUri } = mutation.payload as {
      inspectionId: number;
      resultId: number;
      photoDataUri: string;
      existingPhotoUrls: string[];
    };
    // Step 1: Upload the binary
    const response = await fetch(photoDataUri);
    const blob = await response.blob();
    const uploadRes = await fetch(`${baseUrl}/api/storage/uploads/file`, {
      method: "POST",
      headers: {
        "Content-Type": "image/jpeg",
        "X-File-Content-Type": "image/jpeg",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: blob,
    });
    if (!uploadRes.ok) throw new Error(`Upload HTTP ${uploadRes.status}`);
    const { objectPath } = await uploadRes.json() as { objectPath: string };
    // Step 2: Fetch current server photoUrls via the checklist list endpoint
    // (single-item GET not guaranteed; list endpoint is always available)
    let serverUrls: string[] = [];
    try {
      const listRes = await fetch(`${baseUrl}/api/inspections/${inspectionId}/checklist`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (listRes.ok) {
        const items = await listRes.json() as { id: number; photoUrls?: string[] }[];
        const target = Array.isArray(items) ? items.find(i => i.id === resultId) : null;
        serverUrls = target?.photoUrls ?? [];
      }
    } catch { /* fall through — append to empty array; no data loss since we're appending */ }
    const mergedUrls = serverUrls.includes(objectPath)
      ? serverUrls
      : [...serverUrls, objectPath];
    const patchRes = await fetch(`${baseUrl}/api/inspections/${inspectionId}/checklist/${resultId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ photoUrls: mergedUrls }),
    });
    if (!patchRes.ok) throw new Error(`Patch HTTP ${patchRes.status}`);
  }
}

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedItems, setFailedItems] = useState<QueuedMutation[]>([]);
  const [lastSyncTime, setLastSyncTimeState] = useState<string | null>(null);
  const [toastMessages, setToastMessages] = useState<SyncToastMessage[]>([]);
  const syncLockRef = useRef(false);
  const justCameOnlineRef = useRef(false);

  const addToast = useCallback((type: "success" | "error", message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToastMessages(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToastMessages(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToastMessages(prev => prev.filter(t => t.id !== id));
  }, []);

  const refreshCounts = useCallback(async () => {
    const queue = await loadQueue();
    const failed = queue.filter(q => q.syncStatus === "failed");
    // "pending" count = items waiting to sync (not yet failed); syncing may be stale so include
    const pending = queue.filter(q => q.syncStatus === "pending" || q.syncStatus === "syncing");
    // Surface pending count separately from failed for accurate badge semantics
    setPendingCount(pending.length);
    setFailedItems(failed);
  }, []);

  useEffect(() => {
    // Recover any items stuck in "syncing" state from a previous app session
    recoverStaleSyncingItems().then(() => {
      refreshCounts();
    });
    getLastSyncTime().then(t => { if (t) setLastSyncTimeState(t); });
  }, [refreshCounts]);

  const performSync = useCallback(async (tokenToUse: string | null) => {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setIsSyncing(true);

    try {
      // Reset any items stuck in "syncing" from a previous interrupted run
      await recoverStaleSyncingItems();
      const eligible = await getEligibleItems();
      if (eligible.length === 0) return;

      let successCount = 0;
      let failedCount = 0;

      // Per-inspectionId set of blocked IDs — once a mutation fails, all subsequent
      // mutations for that inspection are deferred to preserve ordering guarantees
      const blockedInspections = new Set<number>();
      const conflictCheckedInspections = new Set<number>();

      for (const item of eligible) {
        // Skip if an earlier mutation for this inspection already failed
        if (blockedInspections.has(item.inspectionId)) {
          await updateQueueItem(item.id, { syncStatus: "pending", lastAttemptAt: new Date().toISOString() });
          continue;
        }

        await updateQueueItem(item.id, { syncStatus: "syncing", lastAttemptAt: new Date().toISOString() });
        try {
          // Before executing, validate that the server's updatedAt hasn't overtaken
          // our snapshot baseline (skip check if we already checked this inspection)
          if (!conflictCheckedInspections.has(item.inspectionId)) {
            conflictCheckedInspections.add(item.inspectionId);
            const { getCachedInspectionData } = await import("@/utils/offlineQueue");
            const cached = await getCachedInspectionData(item.inspectionId);
            if (cached) {
              try {
                const baseUrl = getBaseUrl();
                const headers: Record<string, string> = tokenToUse
                  ? { Authorization: `Bearer ${tokenToUse}` }
                  : {};
                const res = await fetch(`${baseUrl}/api/inspections/${item.inspectionId}`, { headers });
                if (res.ok) {
                  const serverData = await res.json() as { updatedAt?: string; createdAt?: string };
                  const serverTime = new Date(serverData.updatedAt ?? serverData.createdAt ?? 0).getTime();
                  // Use offlineBaselineAt (immutable snapshot) for conflict check; fall back to cachedAt
                  const baselineAt = cached.offlineBaselineAt ?? cached.cachedAt;
                  const cacheTime = new Date(baselineAt).getTime();
                  if (serverTime > cacheTime + 5000) {
                    addToast("error", "Server has newer data — open inspection to resolve conflict");
                    await updateQueueItem(item.id, {
                      syncStatus: "failed",
                      failCount: MAX_FAIL_COUNT,
                      errorMessage: "Conflict: server updated while offline",
                    });
                    failedCount++;
                    blockedInspections.add(item.inspectionId);
                    continue;
                  }
                }
              } catch { /* best-effort conflict check, proceed with sync */ }
            }
          }
          await executeMutation(item, tokenToUse);
          await removeQueueItem(item.id);
          // Clear baseline after successful sync so next offline session starts fresh
          await clearOfflineBaseline(item.inspectionId);
          successCount++;
        } catch (err: unknown) {
          const newFailCount = (item.failCount ?? 0) + 1;
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          // Block subsequent mutations for this inspection to preserve ordering
          blockedInspections.add(item.inspectionId);
          if (newFailCount >= MAX_FAIL_COUNT) {
            await updateQueueItem(item.id, {
              syncStatus: "failed",
              failCount: newFailCount,
              errorMessage,
              lastAttemptAt: new Date().toISOString(),
              nextAttemptAt: undefined,
            });
            failedCount++;
          } else {
            const delayMs = RETRY_DELAYS_MS[newFailCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
            const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
            await updateQueueItem(item.id, {
              syncStatus: "pending",
              failCount: newFailCount,
              errorMessage,
              lastAttemptAt: new Date().toISOString(),
              nextAttemptAt,
            });
          }
        }
      }

      const now = new Date().toISOString();
      await setLastSyncTime(now);
      setLastSyncTimeState(now);

      if (successCount > 0) {
        addToast("success", `${successCount} change${successCount > 1 ? "s" : ""} synced successfully`);
      }
      if (failedCount > 0) {
        addToast("error", `${failedCount} item${failedCount > 1 ? "s" : ""} failed to sync — tap to retry`);
      }
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);
      await refreshCounts();
    }
  }, [addToast, refreshCounts]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(prev => {
        if (!prev && online) {
          justCameOnlineRef.current = true;
        }
        return online;
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (justCameOnlineRef.current && isOnline && token) {
      justCameOnlineRef.current = false;
      setTimeout(() => performSync(token), 1500);
    }
  }, [isOnline, token, performSync]);

  // Periodic scheduler: re-run sync every 30s to pick up nextAttemptAt-deferred items
  const tokenRef = useRef(token);
  const isOnlineRef = useRef(isOnline);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { isOnlineRef.current = isOnline; }, [isOnline]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!isOnlineRef.current || !tokenRef.current) return;
      const eligible = await getEligibleItems();
      if (eligible.length > 0) {
        performSync(tokenRef.current);
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [performSync]);

  const addToQueue = useCallback(async (
    mutation: Omit<QueuedMutation, "id" | "syncStatus" | "failCount" | "createdAt">
  ) => {
    const item = await enqueue(mutation);
    await refreshCounts();
    return item;
  }, [refreshCounts]);

  const triggerSync = useCallback(async () => {
    if (!isOnline || !token) return;
    await performSync(token);
  }, [isOnline, token, performSync]);

  const retryFailed = useCallback(async () => {
    const queue = await loadQueue();
    const failed = queue.filter(q => q.syncStatus === "failed");
    for (const item of failed) {
      await resetItemForRetry(item.id);
    }
    await refreshCounts();
    if (isOnline && token) {
      await performSync(token);
    }
  }, [isOnline, token, performSync, refreshCounts]);

  const retrySingleItem = useCallback(async (itemId: string) => {
    await resetItemForRetry(itemId);
    await refreshCounts();
    if (isOnline && token) {
      await performSync(token);
    }
  }, [isOnline, token, performSync, refreshCounts]);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        failedItems,
        lastSyncTime,
        toastMessages,
        dismissToast,
        addToQueue,
        retryFailed,
        retrySingleItem,
        triggerSync,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) throw new Error("useOfflineSync must be used within OfflineSyncProvider");
  return ctx;
}

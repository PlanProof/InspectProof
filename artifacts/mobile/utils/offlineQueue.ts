import AsyncStorage from "@react-native-async-storage/async-storage";

export type SyncStatus = "pending" | "syncing" | "failed";

export interface QueuedMutation {
  id: string;
  type: "checklist_result" | "defect_create" | "photo_upload" | "inspection_status";
  inspectionId: number;
  payload: Record<string, unknown>;
  syncStatus: SyncStatus;
  failCount: number;
  nextAttemptAt?: string;
  createdAt: string;
  lastAttemptAt?: string;
  errorMessage?: string;
}

export interface CachedChecklistItem {
  id: number;
  inspectionId: number;
  checklistItemId: number;
  category: string;
  description: string;
  codeReference?: string;
  riskLevel: string;
  requirePhoto?: boolean;
  defectTrigger?: boolean;
  recommendedActionDefault?: string | null;
  result: string;
  notes?: string;
  photoUrls?: string[];
  photoMarkups?: Record<string, unknown>;
  severity?: string | null;
  location?: string | null;
  tradeAllocated?: string | null;
  defectStatus?: string;
  clientVisible?: boolean;
  recommendedAction?: string | null;
  orderIndex: number;
}

export interface CachedDocument {
  id: number;
  name: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  folder: string;
  fileUrl?: string;
  includedInInspection: boolean;
}

export interface InspectionCacheEntry {
  inspection: Record<string, unknown>;
  checklistItems: CachedChecklistItem[];
  documents?: CachedDocument[];
  /** Set once when the inspection is first opened offline; never overwritten while offline */
  offlineBaselineAt?: string;
  /** Updated every time the cache is refreshed from server data */
  cachedAt: string;
}

const QUEUE_KEY = "offline_mutation_queue";
const CACHE_PREFIX = "offline_cache_inspection_";
const LAST_SYNC_KEY = "offline_last_sync_time";

export const RETRY_DELAYS_MS = [10_000, 60_000, 300_000];
export const MAX_FAIL_COUNT = RETRY_DELAYS_MS.length;

// ── Serialised queue write lock ─────────────────────────────────────────────
// All read-modify-write operations on the queue are chained through this lock
// so concurrent callers (e.g. Promise.all bulk-enqueue) cannot overwrite each
// other's writes.
let queueWriteLock: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueWriteLock.then(() => fn(), () => fn());
  queueWriteLock = next.catch(() => {});
  return next;
}

export async function loadQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedMutation[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedMutation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

/**
 * Deduplication key for a mutation — identical mutations from rapid double-taps
 * share the same key and the later one is silently dropped.
 *
 * Mutations that naturally differ (e.g. same item toggled pass→pending→pass) will
 * have the same key, so the LAST queued value wins: we replace the existing pending
 * item rather than appending a duplicate. This is correct for idempotent patches.
 */
function mutationDedupeKey(mutation: Omit<QueuedMutation, "id" | "syncStatus" | "failCount" | "createdAt">): string | null {
  if (mutation.type === "checklist_result") {
    const { inspectionId, resultId } = mutation.payload as { inspectionId: number; resultId: number };
    return `checklist_result:${inspectionId}:${resultId}`;
  }
  if (mutation.type === "inspection_status") {
    const { inspectionId } = mutation.payload as { inspectionId: number };
    return `inspection_status:${inspectionId}`;
  }
  // photo_upload and defect_create are not deduplicated — each upload/defect is unique
  return null;
}

export async function enqueue(
  mutation: Omit<QueuedMutation, "id" | "syncStatus" | "failCount" | "createdAt">
): Promise<QueuedMutation> {
  return withQueueLock(async () => {
    const queue = await loadQueue();
    const dedupeKey = mutationDedupeKey(mutation);

    if (dedupeKey) {
      // Find an existing pending item with the same deduplication key
      const existingIdx = queue.findIndex(q =>
        q.syncStatus === "pending" &&
        mutationDedupeKey(q) === dedupeKey
      );
      if (existingIdx !== -1) {
        // Replace the payload of the existing pending item (last write wins)
        queue[existingIdx] = {
          ...queue[existingIdx],
          payload: mutation.payload,
          lastAttemptAt: undefined,
          nextAttemptAt: undefined,
          errorMessage: undefined,
          failCount: 0,
        };
        await saveQueue(queue);
        return queue[existingIdx];
      }
    }

    const item: QueuedMutation = {
      ...mutation,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      syncStatus: "pending",
      failCount: 0,
      createdAt: new Date().toISOString(),
    };
    queue.push(item);
    await saveQueue(queue);
    return item;
  });
}

export async function updateQueueItem(id: string, updates: Partial<QueuedMutation>): Promise<void> {
  return withQueueLock(async () => {
    const queue = await loadQueue();
    const idx = queue.findIndex(q => q.id === id);
    if (idx !== -1) {
      queue[idx] = { ...queue[idx], ...updates };
      await saveQueue(queue);
    }
  });
}

export async function removeQueueItem(id: string): Promise<void> {
  return withQueueLock(async () => {
    const queue = await loadQueue();
    await saveQueue(queue.filter(q => q.id !== id));
  });
}

export async function resetItemForRetry(id: string): Promise<void> {
  await updateQueueItem(id, {
    syncStatus: "pending",
    failCount: 0,
    nextAttemptAt: undefined,
    errorMessage: undefined,
  });
}

/**
 * Recover stale `syncing` items after app restart or crash.
 * Any item that is still `syncing` was interrupted mid-flight and will never
 * complete; reset them to `pending` with incremented failCount + backoff so
 * the normal retry loop picks them up.
 */
export async function recoverStaleSyncingItems(): Promise<void> {
  return withQueueLock(async () => {
    const queue = await loadQueue();
    let changed = false;
    const recovered = queue.map(item => {
      if (item.syncStatus !== "syncing") return item;
      changed = true;
      const newFailCount = (item.failCount ?? 0) + 1;
      const delayMs = RETRY_DELAYS_MS[Math.min(newFailCount - 1, RETRY_DELAYS_MS.length - 1)];
      const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
      return {
        ...item,
        syncStatus: "pending" as const,
        failCount: newFailCount,
        nextAttemptAt: newFailCount >= MAX_FAIL_COUNT ? undefined : nextAttemptAt,
        errorMessage: "Interrupted (app restart)",
        lastAttemptAt: item.lastAttemptAt,
      };
    });
    if (changed) await saveQueue(recovered);
  });
}

/**
 * Returns items eligible for processing in the current sync pass.
 *
 * Ordering guarantees:
 * 1. Global FIFO: eligible items are returned in global `createdAt` order,
 *    so mutations are processed in the order they were created regardless of
 *    which inspection they belong to.
 * 2. Per-inspection serial ordering: if the earliest mutation for an
 *    inspection is not yet eligible (deferred or failed), ALL later mutations
 *    for that inspection are blocked — even if they would otherwise be ready.
 *    This prevents a later mutation from leapfrogging an earlier failed one.
 */
export async function getEligibleItems(): Promise<QueuedMutation[]> {
  const queue = await loadQueue();
  const now = Date.now();

  // Sort the full queue by createdAt for global FIFO processing
  const globalOrdered = [...queue].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Track which inspections are blocked (due to a failed/deferred earlier item)
  const blockedInspections = new Set<number>();
  const eligible: QueuedMutation[] = [];

  for (const item of globalOrdered) {
    // If an earlier item for this inspection was blocking, skip
    if (blockedInspections.has(item.inspectionId)) continue;

    if (item.syncStatus === "failed") {
      blockedInspections.add(item.inspectionId);
      continue;
    }
    if (item.syncStatus !== "pending") {
      // "syncing" — already in-flight or stale; block subsequent items
      blockedInspections.add(item.inspectionId);
      continue;
    }
    if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > now) {
      // Deferred — blocks subsequent items for this inspection
      blockedInspections.add(item.inspectionId);
      continue;
    }
    eligible.push(item);
  }

  return eligible;
}

export async function cacheInspectionData(
  inspectionId: number,
  data: InspectionCacheEntry
): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CACHE_PREFIX}${inspectionId}`, JSON.stringify(data));
  } catch {}
}

export async function getCachedInspectionData(
  inspectionId: number
): Promise<InspectionCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${inspectionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as InspectionCacheEntry;
  } catch {
    return null;
  }
}

/**
 * Clear `offlineBaselineAt` for an inspection after a successful sync.
 * This ensures the next offline session computes a fresh baseline rather
 * than comparing against an old historical snapshot.
 */
export async function clearOfflineBaseline(inspectionId: number): Promise<void> {
  try {
    const cached = await getCachedInspectionData(inspectionId);
    if (cached?.offlineBaselineAt) {
      await cacheInspectionData(inspectionId, {
        ...cached,
        offlineBaselineAt: undefined,
      });
    }
  } catch {}
}

/**
 * Patch a single checklist item in the cache (optimistic offline update).
 * Preserves all other items and the offlineBaselineAt timestamp unchanged.
 */
export async function patchCachedChecklistItem(
  inspectionId: number,
  itemId: number,
  updates: Partial<CachedChecklistItem>
): Promise<void> {
  try {
    const cached = await getCachedInspectionData(inspectionId);
    if (!cached) return;
    const updatedItems = cached.checklistItems.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    await cacheInspectionData(inspectionId, {
      ...cached,
      checklistItems: updatedItems,
    });
  } catch {}
}

export async function getLastSyncTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export async function setLastSyncTime(time: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SYNC_KEY, time);
  } catch {}
}

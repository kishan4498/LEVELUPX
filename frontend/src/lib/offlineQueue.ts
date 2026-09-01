import { ApiError, apiRequest, errorMessage } from "./api";
import { trackProductEvent } from "./productEvents";
import { useAuthStore } from "@/store/auth.store";

const DB_NAME = "levelupx-offline";
const DB_VERSION = 1;
const STORE = "actions";
const CHANGE_EVENT = "levelupx:offline-queue-changed";

export type OfflineActionStatus = "QUEUED" | "FAILED";

export type OfflineAction = {
  id: string;
  kind: "CREATE_QUEST";
  path: "/quests";
  method: "POST";
  body: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  status: OfflineActionStatus;
  lastError: string | null;
};

type NewOfflineAction = Pick<OfflineAction, "id" | "kind" | "path" | "method" | "body">;

let pendingFlush: Promise<OfflineAction[]> | null = null;

export async function enqueueOfflineAction(draft: NewOfflineAction) {
  const action: OfflineAction = {
    ...draft,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "QUEUED",
    lastError: null
  };

  await saveAction(action);
  emitChange();
  void trackProductEvent("offline_action_queued", { kind: action.kind });
  void registerSync();
  return action;
}

export async function listOfflineActions() {
  const db = await openDb();
  const actions = await readIdb<OfflineAction[]>(
    db.transaction(STORE, "readonly").objectStore(STORE).getAll()
  );

  db.close();
  return actions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countOfflineActions() {
  const db = await openDb();
  const count = await readIdb<number>(
    db.transaction(STORE, "readonly").objectStore(STORE).count()
  );

  db.close();
  return count;
}

export async function removeOfflineAction(id: string) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await waitForTx(tx);
  db.close();
  emitChange();
}

export async function retryOfflineAction(id: string) {
  const action = (await listOfflineActions()).find((queuedAction) => queuedAction.id === id);

  if (!action) {
    return [];
  }

  await saveAction({ ...action, status: "QUEUED", lastError: null });
  return flushOfflineActions();
}

export function flushOfflineActions() {
  if (pendingFlush) {
    return pendingFlush;
  }

  pendingFlush = flushQueue().finally(() => {
    pendingFlush = null;
  });

  return pendingFlush;
}

async function flushQueue() {
  if (!useAuthStore.getState().accessToken || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return listOfflineActions();
  }

  const actions = await listOfflineActions();

  for (const action of actions.filter((queuedAction) => queuedAction.status === "QUEUED")) {
    const canContinue = await syncAction(action);
    if (!canContinue) break;
  }

  emitChange();
  return listOfflineActions();
}

async function syncAction(action: OfflineAction) {
  try {
    await apiRequest(action.path, {
      method: action.method,
      body: JSON.stringify(action.body)
    });
    await removeOfflineAction(action.id);
    void trackProductEvent("offline_action_synced", { kind: action.kind });
    return true;
  } catch (err) {
    const permanent = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);

    await saveAction({
      ...action,
      attempts: action.attempts + 1,
      status: permanent ? "FAILED" : "QUEUED",
      lastError: errorMessage(err, "Sync failed")
    });
    return permanent;
  }
}

async function saveAction(action: OfflineAction) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(action);
  await waitForTx(tx);
  db.close();
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Offline storage is unavailable in this browser."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("status", "status");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
  });
}

function readIdb<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage request failed."));
  });
}

function waitForTx(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Offline storage transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Offline storage transaction was cancelled."));
  });
}

function emitChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

async function registerSync() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const sw = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
    sync?: { register: (tag: string) => Promise<void> };
  };

  await sw.sync?.register("levelupx-sync").catch(() => undefined);
}

export const offlineQueueChangedEvent = CHANGE_EVENT;

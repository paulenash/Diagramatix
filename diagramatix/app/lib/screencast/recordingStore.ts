/**
 * Crash-proof persistence for an in-progress screencast. MediaRecorder emits a
 * chunk ~every second; we write each chunk to IndexedDB as it arrives, so the
 * recording survives ANY interruption — navigating to the Portal, a full page
 * reload, a tab close, or a crash. On the next mount the studio finds the pending
 * session and offers to recover it. Nothing is ever held only in memory.
 *
 * Two stores: `sessions` (one metadata row per recording) and `chunks`
 * (auto-incrementing rows, indexed by session id). Clear a session only after
 * the user has saved or explicitly discarded it.
 */
const DB_NAME = "dgx-screencast";
const DB_VERSION = 1;

export interface RecMeta { id: string; mime: string; ext: string; startedAt: number }

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("sessions")) d.createObjectStore("sessions", { keyPath: "id" });
        if (!d.objectStoreNames.contains("chunks")) {
          const s = d.createObjectStore("chunks", { keyPath: "k", autoIncrement: true });
          s.createIndex("session", "session", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Start a new persisted session; returns its id. */
export async function beginSession(mime: string, ext: string): Promise<string> {
  const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const d = await db();
  const tx = d.transaction("sessions", "readwrite");
  tx.objectStore("sessions").put({ id, mime, ext, startedAt: Date.now() } satisfies RecMeta);
  await done(tx);
  return id;
}

/** Persist one recorded chunk. Best-effort — never throws into the recorder. */
export async function appendChunk(session: string, part: Blob): Promise<void> {
  try {
    const d = await db();
    const tx = d.transaction("chunks", "readwrite");
    tx.objectStore("chunks").add({ session, part });
    await done(tx);
  } catch { /* a dropped chunk must never break recording */ }
}

/** All sessions that haven't been cleared (i.e. still recoverable). */
export async function listPending(): Promise<RecMeta[]> {
  try {
    const d = await db();
    const tx = d.transaction("sessions", "readonly");
    const req = tx.objectStore("sessions").getAll();
    await done(tx);
    return (req.result as RecMeta[]).sort((a, b) => b.startedAt - a.startedAt);
  } catch { return []; }
}

/** Assemble a session's chunks into a single Blob (null if nothing stored). */
export async function getSessionBlob(session: string, mime: string): Promise<Blob | null> {
  try {
    const d = await db();
    const tx = d.transaction("chunks", "readonly");
    const idx = tx.objectStore("chunks").index("session");
    const req = idx.getAll(IDBKeyRange.only(session));
    await done(tx);
    const rows = req.result as { part: Blob }[];
    if (!rows.length) return null;
    return new Blob(rows.map((r) => r.part), { type: mime });
  } catch { return null; }
}

/** Remove a session + its chunks (after a successful save or an explicit discard). */
export async function clearSession(session: string): Promise<void> {
  try {
    const d = await db();
    const tx = d.transaction(["sessions", "chunks"], "readwrite");
    tx.objectStore("sessions").delete(session);
    const idx = tx.objectStore("chunks").index("session");
    const cur = idx.openCursor(IDBKeyRange.only(session));
    cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
    await done(tx);
  } catch { /* ignore */ }
}

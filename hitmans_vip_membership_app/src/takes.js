// Your performances, kept on your own phone.
//
// A take is a video the member recorded of themselves. It stays on the device
// and is never uploaded anywhere by this app — the venue never sees it, and
// there is no account behind it. That is deliberate: people are lip syncing in
// a bar, and the only person who decides where that ends up is them, through
// the share sheet, to the app they pick.
//
// IndexedDB rather than localStorage because these are video blobs — tens of
// megabytes each. localStorage is a ~5MB string store and would throw on the
// first take.

const DB = 'hvas-takes';
const STORE = 'takes';
const VERSION = 1;

// A phone is not a hard drive. Keep a generous but bounded library and drop the
// oldest when it is exceeded, so the app cannot quietly eat someone's storage
// over a season of Fridays.
export const MAX_TAKES = 30;
export const MAX_BYTES = 400 * 1024 * 1024;   // ~400MB

const open = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
  const req = indexedDB.open(DB, VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) {
      const os = db.createObjectStore(STORE, { keyPath: 'id' });
      os.createIndex('at', 'at');
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('idb-open-failed'));
});

const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = fn(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error || new Error('aborted')); };
  });
};

const rows = () => tx('readonly', (s) => s.getAll());

/** Every take, newest first. Returns [] rather than throwing on a device or a
 *  private window where IndexedDB is unavailable — an empty shelf is a fine
 *  answer, a crashed tab is not. */
export async function listTakes() {
  try {
    const all = await rows();
    return (all || []).sort((a, b) => b.at - a.at);
  } catch { return []; }
}

export async function takesUsage() {
  const all = await listTakes();
  return { count: all.length, bytes: all.reduce((n, t) => n + (t.size || 0), 0) };
}

/** Save one performance. Returns the stored record, or null if the device
 *  would not keep it — a failed save must never break the battle that produced
 *  it, so every caller can ignore the result. */
export async function saveTake({ blob, artist, song, mode, won }) {
  if (!blob || !blob.size) return null;
  const rec = {
    id: `t${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    blob,
    size: blob.size,
    type: blob.type || 'video/webm',
    artist: artist || '',
    song: song || '',
    mode: mode || 'solo',            // solo | venue
    won: !!won,
    at: Date.now(),
  };
  try {
    await tx('readwrite', (s) => s.put(rec));
    await prune();
    return rec;
  } catch {
    // Quota exceeded, private browsing, storage disabled. Try once more after
    // making room; if it still will not stick, the take is still in hand and
    // shareable right now — it just is not kept.
    try { await prune(true); await tx('readwrite', (s) => s.put(rec)); return rec; }
    catch { return null; }
  }
}

export async function removeTake(id) {
  try { await tx('readwrite', (s) => s.delete(id)); return true; } catch { return false; }
}

export async function clearTakes() {
  try { await tx('readwrite', (s) => s.clear()); return true; } catch { return false; }
}

/** Drop the oldest until the library is inside both limits. `hard` halves the
 *  byte budget, for when a save has already failed on quota. */
export async function prune(hard = false) {
  const all = await listTakes();                 // newest first
  const byteCap = hard ? MAX_BYTES / 2 : MAX_BYTES;
  let bytes = 0;
  const doomed = [];
  all.forEach((t, i) => {
    bytes += t.size || 0;
    if (i >= MAX_TAKES || bytes > byteCap) doomed.push(t.id);
  });
  for (const id of doomed) await removeTake(id);
  return doomed.length;
}

/** Human-readable size, for telling someone what their phone is holding. */
export const prettyBytes = (n) => {
  if (!n) return '0 MB';
  const mb = n / (1024 * 1024);
  return mb < 1 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
};

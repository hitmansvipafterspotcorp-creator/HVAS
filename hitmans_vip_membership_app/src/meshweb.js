// HVAS Hub — a mesh node that runs IN THE BROWSER, so the app is its own
// backend: no server process, no terminal, no cloud. The op-log (the same CRDT
// the Node mesh uses) is persisted in the device's IndexedDB, and instances
// sync over BroadcastChannel (same device / tabs) and WebRTC (cross-device,
// bootstrapped by the venue QR). Any instance can be the hub.
//
// Merge rules mirror the server reducer, so a browser hub and a Node node would
// converge on the same state:
//   member.upsert / membership.upsert / signal.otw → last-write-wins by ts
//   entry.admit / link.*                            → idempotent set
//   chat / decision / payment.*                     → append / status LWW

const DB_NAME = 'hvas-hub';
const STORE = 'ops';

function hashId(s) {                       // FNV-1a → hex (dedup key)
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
const rand = () => Math.random().toString(36).slice(2, 10);

export class WebMesh {
  constructor(room = 'default') {
    this.room = room;
    this.id = 'web-' + rand();
    this.ops = new Map();
    this.onChange = () => {};
    this.onLive = () => {};
    this._bc = null; this._peers = new Set(); this._db = null;
  }

  async init() {
    this._db = await this._openDB();
    await this._loadAll();
    if (typeof BroadcastChannel !== 'undefined') {
      this._bc = new BroadcastChannel('hvas-' + this.room);
      this._bc.onmessage = (e) => this._recv(e.data);
      this._bc.postMessage({ kind: 'hello' });        // ask peers to backfill us
    }
    return this;
  }

  // ── op-log ──
  apply(t, data) {
    const op = { t, ts: Date.now(), node: this.id, n: rand(), data };
    op.id = hashId(JSON.stringify(op));
    this._ingest(op);
    return op;
  }
  _ingest(op) {
    if (!op || !op.id || this.ops.has(op.id)) return false;
    this.ops.set(op.id, op);
    this._save(op);
    this.onChange(op);
    this._broadcast({ kind: 'op', op });
    return true;
  }
  // Ephemeral (presence/typing) — flooded, never stored.
  live(payload) { this.onLive(payload); this._broadcast({ kind: 'live', payload }); }

  _broadcast(msg) {
    this._bc?.postMessage(msg);
    for (const send of this._peers) { try { send(msg); } catch { /* dropped */ } }
  }
  _recv(msg, reply) {
    if (!msg) return;
    if (msg.kind === 'op') this._ingest(msg.op);
    else if (msg.kind === 'live') this.onLive(msg.payload);
    else if (msg.kind === 'hello') { const all = [...this.ops.values()]; (reply || ((m) => this._broadcast(m)))({ kind: 'ops', ops: all }); }
    else if (msg.kind === 'ops') for (const op of msg.ops) this._ingest(op);
  }

  // WebRTC (or any) peer link: give it a send fn + feed it incoming via recvFromPeer.
  addPeer(send) { this._peers.add(send); send({ kind: 'hello' }); return () => this._peers.delete(send); }
  recvFromPeer(msg, send) { this._recv(msg, send); }

  // ── derived state (reduction over the op-set) ──
  state() {
    const members = new Map(), memberships = new Map(), signals = new Map(), connections = new Map();
    const admissions = new Set(), messages = [], payments = new Map();
    const lww = (map, key, op) => { const c = map.get(key); if (!c || op.ts > c.ts) map.set(key, { ...op.data, ts: op.ts }); };
    for (const op of [...this.ops.values()].sort((a, b) => a.ts - b.ts)) {
      const d = op.data;
      switch (op.t) {
        case 'member.upsert': lww(members, d.id, op); break;
        case 'membership.upsert': lww(memberships, d.member_id, op); break;
        case 'signal.otw': lww(signals, d.member_id, op); break;
        case 'entry.admit': admissions.add(`${d.member_id}|${d.night}`); break;
        case 'chat': messages.push({ id: op.id, ...d }); break;
        case 'link.request': { const [a, b] = [d.from, d.to].sort(); if (!connections.has(a + b)) connections.set(a + b, { a, b, status: 'pending', by: d.from }); break; }
        case 'link.accept': { const [a, b] = [d.from, d.to].sort(); connections.set(a + b, { a, b, status: 'linked', by: d.to }); break; }
        case 'payment.claim': if (!payments.has(d.id)) payments.set(d.id, { ...d, status: 'pending' }); break;
        case 'payment.confirm': { const p = payments.get(d.id); if (p) p.status = 'paid'; break; }
        case 'payment.void': { const p = payments.get(d.id); if (p) p.status = 'void'; break; }
      }
    }
    return { members, memberships, signals, connections, admissions, messages, payments };
  }
  digest() {
    return hashId([...this.ops.keys()].sort().join(','));
  }

  // ── IndexedDB persistence ──
  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME + '-' + this.room, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  _save(op) { try { this._db?.transaction(STORE, 'readwrite').objectStore(STORE).put(op); } catch { /* ignore */ } }
  _loadAll() {
    return new Promise((resolve) => {
      const req = this._db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => { for (const op of req.result || []) this.ops.set(op.id, op); resolve(); };
      req.onerror = () => resolve();
    });
  }
}

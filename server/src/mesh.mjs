// HVAS Mesh — the "always live, no cell tower" layer.
//
// The venue runs as a **peer-to-peer mesh**: every door station (and, in a
// native shell, every phone) is a node. Nodes exchange a signed, append-only
// op-log and converge with no central server and no internet. Any pair that can
// see each other over ANY transport — LAN Wi-Fi, WebRTC, or Bluetooth (native
// shell) — keeps the whole venue in sync.
//
// Convergence is CRDT-style: every op is commutative + idempotent under its
// merge rule, so nodes that saw the same ops in any order, with any partitions
// in between, reduce to the same state.
//
//   member.upsert / membership.upsert  → last-write-wins by ts (per member)
//   entry.admit                        → set-union keyed by member+night
//   signal.otw                         → last-write-wins by ts (per member)
//   decision                           → append-only audit set
//
// Trust: each op is signed with the venue Ed25519 key, so a node can't be
// spoofed onto the mesh. (Production: per-node keys + a signed roster.)
import { sign, verify, createHash } from 'node:crypto';
import net from 'node:net';
import { seal, open } from './crypto.mjs';

const b64u = (b) => Buffer.from(b).toString('base64url');
const canon = (op) => JSON.stringify({ t: op.t, ts: op.ts, node: op.node, data: op.data });
const opId = (op) => b64u(createHash('sha256').update(canon(op)).digest()).slice(0, 22);

export function makeOp(node, privateKey, t, data) {
  const op = { t, ts: Date.now(), node, data };
  op.id = opId(op);
  op.sig = b64u(sign(null, Buffer.from(op.id), privateKey));
  return op;
}

export class MeshNode {
  constructor({ id, privateKey, publicKey }) {
    this.id = id;
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.ops = new Map();          // opId -> op  (the replicated log)
    this.transports = [];          // links to peers
    this.onChange = () => {};
  }

  // ── transport plumbing ──
  addTransport(tp) {
    this.transports.push(tp);
    tp.onMessage((msg, reply) => this._handle(msg, reply));
    return tp;
  }
  _broadcast(msg) { for (const tp of this.transports) tp.send(msg); }

  // ── local writes ──
  apply(t, data) {
    const op = makeOp(this.id, this.privateKey, t, data);
    this._ingest(op);
    this._broadcast({ kind: 'op', op });
    return op;
  }

  // ── receiving ──
  _verify(op) {
    if (!op || !op.id || op.id !== opId(op)) return false;   // id must match content
    try { return verify(null, Buffer.from(op.id), this.publicKey, Buffer.from(op.sig, 'base64url')); }
    catch { return false; }
  }
  _ingest(op) {
    if (this.ops.has(op.id)) return false;
    if (!this._verify(op)) return false;
    this.ops.set(op.id, op);
    this.onChange(op);
    return true;
  }
  _handle(msg, reply) {
    if (msg.kind === 'op') {
      if (this._ingest(msg.op)) this._broadcast({ kind: 'op', op: msg.op }); // relay onward (flood)
    } else if (msg.kind === 'digest') {
      // peer told us which op-ids it has; send back the ones it's missing
      const have = new Set(msg.ids);
      const missing = [...this.ops.values()].filter((o) => !have.has(o.id));
      if (missing.length) reply({ kind: 'ops', ops: missing });
    } else if (msg.kind === 'ops') {
      // backfilled ops must flood onward too, or a multi-hop heal (A→B→C)
      // wouldn't fully propagate in one anti-entropy round.
      for (const op of msg.ops) if (this._ingest(op)) this._broadcast({ kind: 'op', op });
    }
  }

  // Anti-entropy: offer our op-ids so a peer can backfill us. Runs on a timer
  // and right after a link (re)connects, which is what heals a partition.
  syncWith(tp) {
    tp.send({ kind: 'digest', ids: [...this.ops.keys()] });
  }
  syncAll() { for (const tp of this.transports) this.syncWith(tp); }

  // ── derived state (a pure reduction over the op-set) ──
  state() {
    const members = new Map(), memberships = new Map(), signals = new Map();
    const admissions = new Set(), decisions = [];
    const lww = (map, key, op) => { const cur = map.get(key); if (!cur || op.ts > cur.ts) map.set(key, { ...op.data, ts: op.ts }); };
    for (const op of [...this.ops.values()].sort((a, b) => a.ts - b.ts)) {
      if (op.t === 'member.upsert') lww(members, op.data.id, op);
      else if (op.t === 'membership.upsert') lww(memberships, op.data.member_id, op);
      else if (op.t === 'signal.otw') lww(signals, op.data.member_id, op);
      else if (op.t === 'entry.admit') admissions.add(`${op.data.member_id}|${op.data.night}`);
      else if (op.t === 'decision') decisions.push(op.data);
    }
    return { members, memberships, signals, admissions, decisions };
  }

  // Fingerprint for convergence checks: order-independent hash of the op-set.
  digest() {
    return createHash('sha256').update([...this.ops.keys()].sort().join(',')).digest('hex').slice(0, 16);
  }
}

// ── In-process transport (for tests / a single-box multi-node sim) ──────────
// A bidirectional link between two nodes with a controllable "up/down" flag so
// we can simulate a Bluetooth/Wi-Fi partition and then heal it.
export function link(a, b) {
  const chan = { up: true, aCb: null, bCb: null };
  const mk = (selfCb, otherCbName) => ({
    onMessage(cb) { chan[selfCb] = cb; },
    send(msg) {
      if (!chan.up) return;                       // link down = partition
      queueMicrotask(() => {
        const cb = chan[otherCbName];
        if (cb) cb(structuredClone(msg), (r) => chan.up && chan[selfCb] && chan[selfCb](structuredClone(r), () => {}));
      });
    },
  });
  const ta = a.addTransport(mk('aCb', 'bCb'));
  const tb = b.addTransport(mk('bCb', 'aCb'));
  return {
    partition() { chan.up = false; },
    heal() { chan.up = true; a.syncWith(ta); b.syncWith(tb); }, // re-sync on reconnect
  };
}

// ── LAN transport (node:net) ────────────────────────────────────────────────
// Real peer link over a socket — newline-delimited JSON. Works on a venue LAN
// with no internet (a Raspberry Pi AP, an ad-hoc Wi-Fi, etc.). This is also the
// shape the WebRTC data channel and the native-shell BLE bridge implement, so
// the mesh core is transport-agnostic.
function socketTransport(sock, key = null) {
  // With a venue key, every frame is AES-256-GCM sealed — the wire carries only
  // ciphertext. Without one, plain JSON (dev/loopback).
  const enc = (msg) => (key ? seal(key, msg) : JSON.stringify(msg));
  const dec = (line) => (key ? open(key, line) : (() => { try { return JSON.parse(line); } catch { return null; } })());
  let buf = '', handler = null;
  sock.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = dec(line);
      if (msg) handler && handler(msg, (r) => { try { sock.write(enc(r) + '\n'); } catch { /* dropped */ } });
    }
  });
  return { onMessage(cb) { handler = cb; }, send(msg) { try { sock.write(enc(msg) + '\n'); } catch { /* link down */ } } };
}

// Accept inbound peers. Pass a 32-byte `key` to encrypt every message.
export function meshListen(node, port, host = '0.0.0.0', { key = null } = {}) {
  const srv = net.createServer((sock) => {
    sock.setNoDelay(true);
    const tp = node.addTransport(socketTransport(sock, key));
    node.syncWith(tp);                                    // backfill the newcomer
    const drop = () => { node.transports = node.transports.filter((t) => t !== tp); };
    sock.on('error', drop); sock.on('close', drop);
  });
  srv.listen(port, host);
  return srv;
}

// Dial a peer, and auto-reconnect when the link drops — "always live the moment
// the link returns" (Bluetooth/Wi-Fi back in range). Pass `key` to encrypt.
export function meshDial(node, host, port, { retryMs = 1500, alive = { on: true }, key = null } = {}) {
  const connect = () => {
    const sock = net.connect(port, host);
    sock.setNoDelay(true);
    const tp = node.addTransport(socketTransport(sock, key));
    sock.on('connect', () => node.syncWith(tp));          // re-sync on (re)connect = heal
    const drop = () => {
      node.transports = node.transports.filter((t) => t !== tp);
      if (alive.on) setTimeout(connect, retryMs);
    };
    sock.on('error', () => {}); sock.on('close', drop);
  };
  connect();
  return { stop() { alive.on = false; } };
}

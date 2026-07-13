// HVAS BLE transport — the native-shell mesh link over Bluetooth Low Energy.
//
// BLE characteristics carry ~180 bytes per write, so a mesh message must be
// FRAGMENTED into chunks and REASSEMBLED on the far side, tolerant of loss and
// reordering (BLE notifications can drop). That framing is pure logic and is
// tested here without any hardware. The actual radio (scan/advertise/GATT) is
// provided by a native plugin passed in as `radio` — see ble-transport docs.
//
// The transport implements the same { onMessage, send } interface every other
// mesh transport does, and it encrypts with the shared venue key, so the mesh
// core is unchanged whether the link is TCP, WebRTC, or Bluetooth.
import { seal, open } from '../server/src/crypto.mjs';

// 3-byte header: [msgId, seq, total]. msgId rolls 0..255 to group a message.
export function makeFragmenter(mtu = 180) {
  let id = 0;
  const cap = Math.max(1, mtu - 3);
  return function fragment(str) {
    const bytes = Buffer.from(str, 'utf8');
    const mid = (id = (id + 1) & 0xff);
    const total = Math.max(1, Math.ceil(bytes.length / cap));
    const chunks = [];
    for (let i = 0; i < total; i++) {
      chunks.push(Buffer.concat([Buffer.from([mid, i, total]), bytes.subarray(i * cap, (i + 1) * cap)]));
    }
    return chunks;
  };
}

export function makeReassembler(onMessage, { ttlMs = 4000 } = {}) {
  const bufs = new Map(); // msgId -> { parts, total, count, at }
  return function push(chunk) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (b.length < 3) return;
    const [mid, seq, total] = b;
    const part = b.subarray(3);
    let e = bufs.get(mid);
    if (!e) { e = { parts: new Array(total), total, count: 0, at: Date.now() }; bufs.set(mid, e); }
    if (!e.parts[seq]) { e.parts[seq] = part; e.count++; }
    if (e.count === e.total) { bufs.delete(mid); onMessage(Buffer.concat(e.parts).toString('utf8')); }
    const now = Date.now();
    for (const [k, v] of bufs) if (now - v.at > ttlMs) bufs.delete(k); // drop stale partials
  };
}

// A mesh transport over a BLE `radio` adapter:
//   radio.writeChunk(Uint8Array)  — send one <=MTU chunk to the peer
//   radio.onChunk(cb)             — receive chunks from the peer
//   radio.mtu                     — negotiated MTU (default 180)
// `key` is the 32-byte shared venue key (messages are AES-256-GCM sealed).
export function BleTransport(radio, key) {
  const fragment = makeFragmenter(radio.mtu || 180);
  let handler = null;
  const reassemble = makeReassembler((line) => {
    const msg = open(key, line);
    if (msg && handler) handler(msg, (r) => sendRaw(r));
  });
  radio.onChunk((c) => reassemble(c));
  const sendRaw = (msg) => { for (const chunk of fragment(seal(key, msg))) radio.writeChunk(chunk); };
  return { onMessage(cb) { handler = cb; }, send(msg) { sendRaw(msg); } };
}

// BLE transport test — no hardware. A simulated radio with a small MTU that
// can drop and reorder chunks (like real BLE notifications). Proves:
//  1) large messages fragment + reassemble correctly,
//  2) two mesh nodes converge over an encrypted BLE-style link.
import { makeFragmenter, makeReassembler, BleTransport } from './ble.mjs';
import { MeshNode } from '../server/src/mesh.mjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('FRAGMENT / REASSEMBLE (MTU=20, reordered)');
const frag = makeFragmenter(20);
const big = JSON.stringify({ blob: 'x'.repeat(500), n: 42 });
const chunks = frag(big);
ok(chunks.length > 20 && chunks.every((c) => c.length <= 20), `split into ${chunks.length} chunks, all <= MTU`);
let got = null;
const re = makeReassembler((s) => { got = s; });
[...chunks].reverse().forEach((c) => re(c)); // deliver out of order
ok(got === big, 'reassembled exactly despite reordering');

console.log('\nMESH OVER SIMULATED BLE RADIO (lossy)');
// A paired radio: each side writes chunks the other receives, with ~10% loss
// on the FIRST pass (mesh anti-entropy/flood recovers on the next sync round).
function pairRadios(lossFirstBurst = 0.1) {
  const cbs = {};
  let dropped = false;
  const mk = (me, you) => ({
    mtu: 40,
    writeChunk(chunk) {
      // drop a few chunks once, to model a flaky link
      if (!dropped && Math.random() < lossFirstBurst) { dropped = true; return; }
      queueMicrotask(() => cbs[you] && cbs[you](Buffer.from(chunk)));
    },
    onChunk(cb) { cbs[me] = cb; },
  });
  return [mk('a', 'b'), mk('b', 'a')];
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const KEY = randomBytes(32);
const A = new MeshNode({ id: 'A', privateKey, publicKey });
const B = new MeshNode({ id: 'B', privateKey, publicKey });
const [ra, rb] = pairRadios();
const ta = A.addTransport(BleTransport(ra, KEY));
const tb = B.addTransport(BleTransport(rb, KEY));

A.apply('member.upsert', { id: 'm1', number: 'HV-7-7', name: 'Blue' });
A.apply('entry.admit', { member_id: 'm1', night: 'N1' });
await wait(30);
A.syncWith(ta); B.syncWith(tb);         // anti-entropy round recovers any dropped chunks
await wait(60);

ok(B.state().members.has('m1'), 'B received member op over encrypted BLE');
ok(A.digest() === B.digest(), 'nodes converged over lossy BLE link');
ok(B.state().admissions.has('m1|N1'), 'admission replicated over BLE');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

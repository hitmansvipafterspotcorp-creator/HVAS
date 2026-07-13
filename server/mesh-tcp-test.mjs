// Real-socket mesh test — two nodes gossip over actual TCP (node:net), then we
// kill the listener to simulate the peer dropping out of range, apply writes on
// both sides, bring it back, and confirm auto-reconnect heals them. No internet
// involved — this is the LAN/Bluetooth-shaped path.
import { MeshNode, meshListen, meshDial } from './src/mesh.mjs';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const A = new MeshNode({ id: 'A', privateKey, publicKey });
const B = new MeshNode({ id: 'B', privateKey, publicKey });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const PORT = 9911;
const live = [];                                     // track accepted sockets so we can truly cut them
let srv = meshListen(A, PORT, '127.0.0.1');          // A listens
srv.on('connection', (s) => live.push(s));
const dial = meshDial(B, '127.0.0.1', PORT, { retryMs: 200 }); // B dials + auto-reconnects
await wait(150);

A.apply('member.upsert', { id: 'm1', number: 'HV-9-9', name: 'Live' });
await wait(120);
ok(B.state().members.has('m1'), 'B received A’s op over real TCP');

console.log('\nDROP THE LINK (peer out of range)');
srv.close();                                          // stop accepting
live.forEach((s) => s.destroy());                     // AND cut the live socket = real drop
await wait(120);
A.apply('entry.admit', { member_id: 'm1', night: 'N' });   // both write while apart
B.apply('signal.otw', { member_id: 'm1', on: 1, at: 1 });
await wait(200);
ok(A.digest() !== B.digest(), 'diverged while the link is down');

console.log('\nBACK IN RANGE (auto-reconnect heals)');
srv = meshListen(A, PORT, '127.0.0.1');               // A listens again; B auto-redials
await wait(700);
ok(A.digest() === B.digest(), 'auto-reconnect reconverged the mesh');
ok(A.state().signals.has('m1') && B.state().admissions.has('m1|N'), 'both sides backfilled after heal');

console.log(`\n${pass} passed, ${fail} failed`);
dial.stop(); srv.close();
process.exit(fail ? 1 : 0);

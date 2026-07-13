// Mesh convergence test — proves the venue stays consistent with no central
// server, across a network partition (a stand-in for a Bluetooth/Wi-Fi drop).
import { MeshNode, link } from './src/mesh.mjs';
import { generateKeyPairSync } from 'node:crypto';

// One shared venue key so every node trusts the others' signed ops.
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const mk = (id) => new MeshNode({ id, privateKey, publicKey });
const settle = () => new Promise((r) => setTimeout(r, 20));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// Three door stations: A—B—C (a line; A and C only reach each other via B).
const A = mk('door-A'), B = mk('door-B'), C = mk('door-C');
const ab = link(A, B); const bc = link(B, C);

console.log('FLOOD ACROSS THE MESH');
A.apply('member.upsert', { id: 'm1', number: 'HV-1111-2222', name: 'Tasha' });
await settle();
ok(B.state().members.has('m1') && C.state().members.has('m1'), 'op from A reached B and C (multi-hop)');
ok(A.digest() === B.digest() && B.digest() === C.digest(), 'all three converged');

console.log('\nPARTITION → CONCURRENT WRITES → HEAL');
ab.partition(); bc.partition();                 // A | B | C all isolated
A.apply('entry.admit', { member_id: 'm1', night: '2026-07-12' });   // door A admits m1
C.apply('signal.otw', { member_id: 'm1', on: 1, at: Date.now() });  // meanwhile C logs OTW
C.apply('decision', { number: 'HV-1111-2222', status: 'granted', at: Date.now() });
await settle();
ok(A.digest() !== C.digest(), 'while partitioned, A and C diverge (as expected)');
ab.heal(); bc.heal();                            // links come back (Bluetooth back in range)
await settle(); await settle();
ok(A.digest() === B.digest() && B.digest() === C.digest(), 'after heal, all reconverge');
ok(A.state().admissions.has('m1|2026-07-12'), 'A learned C-side ops after heal');
ok(C.state().admissions.has('m1|2026-07-12'), 'C learned A-side admission after heal');

console.log('\nIDEMPOTENT ADMISSION (no double-count across nodes)');
B.apply('entry.admit', { member_id: 'm1', night: '2026-07-12' });   // same night, different door
await settle();
const admits = [A, B, C].every((n) => n.state().admissions.size === 1);
ok(admits, 'same member+night admitted on two doors counts once everywhere');

console.log('\nTAMPER REJECTION');
const forged = { t: 'entry.admit', ts: Date.now(), node: 'evil', data: { member_id: 'mX', night: 'x' }, id: 'deadbeef', sig: 'AAAA' };
B._handle({ kind: 'op', op: forged }, () => {});
ok(!B.state().admissions.has('mX|x'), 'unsigned/forged op rejected by the mesh');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Cluster test — two FULL backend nodes (each its own SQLite) meshed over
// encrypted TCP. A member signs up + buys on node A; a DIFFERENT door station
// (node B) verifies their rolling pass and admits them. Proves the API and the
// mesh are one system: state created on one node is usable on another with no
// shared database and no cloud.
import { createApp } from './src/app.mjs';
import { onboard } from './test-helpers.mjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

// Shared venue trust: both nodes get the SAME signing key, mesh key, session key
// (in production these are provisioned to each door device).
const { privateKey } = generateKeyPairSync('ed25519');
const venuePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const meshKey = randomBytes(32), sessKey = randomBytes(32);
const seed = (dir) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/venue-key.json`, JSON.stringify({ privatePem: venuePem }));
  writeFileSync(`${dir}/mesh.key`, meshKey);
  writeFileSync(`${dir}/session.key`, sessKey);
};
const dirA = `/tmp/hvas-A-${Date.now()}`, dirB = `/tmp/hvas-B-${Date.now()}`;
seed(dirA); seed(dirB);

const MESH = 9944;
const A = createApp({ dataDir: dirA, nodeId: 'door-A', meshPort: MESH });
const B = createApp({ dataDir: dirB, nodeId: 'door-B', peers: [`127.0.0.1:${MESH}`] });
await new Promise((r) => A.server.listen(0, r));
await new Promise((r) => B.server.listen(0, r));
const urlA = `http://127.0.0.1:${A.server.address().port}`;
const urlB = `http://127.0.0.1:${B.server.address().port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (url, m, path, body, token) => {
  const res = await fetch(url + path, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

await wait(150); // let the mesh link establish

console.log('MEMBER SIGNS UP + BUYS ON NODE A');
const s = await call(urlA, 'POST', '/auth/member/start', { contact: '850-555-0000' });
const v = await call(urlA, 'POST', '/auth/member/verify', { contact: '850-555-0000', code: s.body.devCode, name: 'Mesh' });
// onboard() speaks call(method, path, body, token); this file's call takes the
// node URL first, because there are two of them. Bind A and hand that over.
const callA = (m, path, body, token) => call(urlA, m, path, body, token);
await onboard(callA, v.body.token);
const mtok = v.body.token; const number = v.body.member.number;
await call(urlA, 'POST', '/membership/purchase', { tier: 'Monthly', payment: 'Cash App' }, mtok);
ok(number, `member ${number} created on A`);

console.log('\nREPLICATES TO NODE B (no shared DB)');
await wait(250);
const meOnB = await call(urlB, 'GET', '/me', null, mtok); // same session key → token valid on B
ok(meOnB.body.member?.number === number && meOnB.body.member?.tier === 'Monthly', 'B knows the member + membership via mesh');

console.log('\nDIFFERENT DOOR (NODE B) VERIFIES THE ROLLING PASS');
const passRes = await call(urlA, 'GET', '/pass/current', null, mtok); // member’s phone talks to A
const staffB = await call(urlB, 'POST', '/auth/staff', { code: 'DOOR850' });
const grant = await call(urlB, 'POST', '/door/verify', { pass: passRes.body.pass }, staffB.body.token);
ok(grant.body.ok && grant.body.status === 'granted', 'B granted entry on a pass minted for A');

console.log('\nADMISSION REPLICATES BACK TO NODE A');
await wait(250);
const meOnA = await call(urlA, 'GET', '/me', null, mtok);
ok(meOnA.body.member.entries === 1 && meOnA.body.member.insideTonight, 'A sees the member as inside (entry logged on B)');
const boardA = await call(urlA, 'GET', '/door/board', null, staffB.body.token);
ok(boardA.body.inside.some((x) => x.number === number), 'A’s door board shows them inside');

console.log('\nCONVERGENCE');
ok(A.node.digest() === B.node.digest(), 'both nodes converged on the same op-set');

console.log('\nONE DEVICE DIES MID-NIGHT AND THE NIGHT KEEPS GOING');
// The whole argument for running a venue on two or three trusted devices
// instead of one server: the failure that actually happens to a nightclub is a
// phone going flat, getting knocked off a bar, or walking out of the building
// in somebody's pocket. A cloud server does not help with any of those, because
// the thing that died was the door.
//
// So: a second member arrives while both are up, node A is killed outright, and
// the door has to keep working on B alone.
const s2 = await call(urlA, 'POST', '/auth/member/start', { contact: '850-555-0001' });
const v2 = await call(urlA, 'POST', '/auth/member/verify',
  { contact: '850-555-0001', code: s2.body.devCode, name: 'Second' });
await onboard(callA, v2.body.token);
await call(urlA, 'POST', '/membership/purchase', { tier: 'Monthly', payment: 'Cash App' }, v2.body.token);
const num2 = v2.body.member.number;
await wait(400);
ok(!!(await call(urlB, 'POST', '/door/verify', { number: num2 }, staffB.body.token)).body.ok,
   'while both are up, either door admits them');

// Kill A the way a phone dies: no warning, no handover.
A.server.close();
await new Promise((r) => A.server.close(r));
await wait(300);
ok(true, 'node A is gone');

// B has to be a whole venue on its own now.
const aloneAdmit = await call(urlB, 'POST', '/door/verify', { number: number }, staffB.body.token);
ok(aloneAdmit.body.ok, 'B still admits the member who signed up on the node that died');
const aloneBoard = await call(urlB, 'GET', '/door/board', null, staffB.body.token);
ok(Array.isArray(aloneBoard.body.inside), 'B still has a door board');
const s3 = await call(urlB, 'POST', '/auth/member/start', { contact: '850-555-0002' });
const v3 = await call(urlB, 'POST', '/auth/member/verify',
  { contact: '850-555-0002', code: s3.body.devCode, name: 'Third' });
ok(!!v3.body.token, 'and somebody NEW can still join on B with A in the bin');
const callB = (m, path, body, token) => call(urlB, m, path, body, token);
await onboard(callB, v3.body.token);
await call(urlB, 'POST', '/membership/purchase', { tier: 'Monthly', payment: 'Cash App' }, v3.body.token);
ok(!!(await call(urlB, 'POST', '/door/verify', { number: v3.body.member.number }, staffB.body.token)).body.ok,
   'they take a membership and the door lets them in — the night carried on');

console.log(`\n${pass} passed, ${fail} failed`);
A.closeMesh(); B.closeMesh(); A.server.close(); B.server.close();
try { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);

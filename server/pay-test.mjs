// HVAS Pay ledger test — a member on node A pays by a non-instant rail (Zelle to
// the venue's Navy Federal), files a claim; the owner on node B sees it pending
// and confirms; the membership activates and converges back to A. Proves the
// rail-agnostic settlement works across the mesh with no shared DB.
import { createApp } from './src/app.mjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const { privateKey } = generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const meshKey = randomBytes(32), sessKey = randomBytes(32);
const seed = (d) => { mkdirSync(d, { recursive: true }); writeFileSync(`${d}/venue-key.json`, JSON.stringify({ privatePem: pem })); writeFileSync(`${d}/mesh.key`, meshKey); writeFileSync(`${d}/session.key`, sessKey); };
const dA = `/tmp/hvas-pA-${Date.now()}`, dB = `/tmp/hvas-pB-${Date.now()}`; seed(dA); seed(dB);
const MESH = 9966;
const A = createApp({ dataDir: dA, nodeId: 'A', meshPort: MESH });
const B = createApp({ dataDir: dB, nodeId: 'B', peers: [`127.0.0.1:${MESH}`] });
await new Promise((r) => A.server.listen(0, r)); await new Promise((r) => B.server.listen(0, r));
const uA = `http://127.0.0.1:${A.server.address().port}`, uB = `http://127.0.0.1:${B.server.address().port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (u, m, p, b, t) => { const r = await fetch(u + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const signup = async (u, c, n) => { const s = await call(u, 'POST', '/auth/member/start', { contact: c }); const v = await call(u, 'POST', '/auth/member/verify', { contact: c, code: s.body.devCode, name: n }); return v.body; };
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
await wait(150);

console.log('MEMBER PAYS BY ZELLE → files a claim');
const marco = await signup(uA, '850-9', 'Marco');
const claim = await call(uA, 'POST', '/pay/claim', { tier: 'Monthly', rail: 'zelle', reference: 'Zelle ref 4471' }, marco.token);
ok(claim.body.id && claim.body.amount === 300 && claim.body.status === 'pending', `claim filed: ${claim.body.id} $${claim.body.amount} pending`);
const me1 = await call(uA, 'GET', '/me', null, marco.token);
ok(!me1.body.member.tier, 'membership NOT active yet (awaiting confirm)');

console.log('\nOWNER (node B) SEES IT PENDING → confirms');
await wait(250);
const staff = await call(uB, 'POST', '/auth/staff', { code: 'DOOR850' });
let pend = await call(uB, 'GET', '/pay/pending', null, staff.body.token);
ok(pend.body.pending.some((p) => p.id === claim.body.id && p.number === marco.member.number && p.rail === 'zelle'), 'owner sees the pending Zelle claim (via mesh)');
const conf = await call(uB, 'POST', '/pay/confirm', { id: claim.body.id }, staff.body.token);
ok(conf.body.ok && conf.body.activated === 'Monthly', 'owner confirmed → membership activated');

console.log('\nACTIVATION CONVERGES BACK TO NODE A');
await wait(250);
const me2 = await call(uA, 'GET', '/me', null, marco.token);
ok(me2.body.member.tier === 'Monthly', 'A now sees Marco as an active Monthly member');
pend = await call(uB, 'GET', '/pay/pending', null, staff.body.token);
ok(!pend.body.pending.some((p) => p.id === claim.body.id), 'claim no longer pending after confirm');
ok(A.node.digest() === B.node.digest(), 'both nodes converged');

console.log('\nHITKOIN — mints on the same confirm, fails soft when not configured');
const wallet = await call(uA, 'GET', '/wallet', null, marco.token);
ok(wallet.status === 200 && wallet.body.enabled === false, 'reports not-configured (no HITKOIN_* env in this test)');
ok(me2.body.member.tier === 'Monthly', 'membership still activated even though no HitKoin was minted (never a blocker)');

console.log(`\n${pass} passed, ${fail} failed`);
A.closeMesh(); B.closeMesh(); A.server.close(); B.server.close();
try { rmSync(dA, { recursive: true, force: true }); rmSync(dB, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);

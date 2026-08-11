// End-to-end integration test — boots the app on a random port and drives the
// full night through the real HTTP API + crypto. No external deps.
import { createApp } from './src/app.mjs';
import { verifyPass } from './src/crypto.mjs';
import { sign } from 'node:crypto';
import { rmSync } from 'node:fs';

// Forge a validly-signed pass with an arbitrary issue time (to exercise the
// door's freshness check without waiting 45s of wall-clock time).
const forgePass = (privateKey, number, issuedAt) => {
  const body = Buffer.from(JSON.stringify({ m: number, i: issuedAt, n: 'test' })).toString('base64url');
  const sig = Buffer.from(sign(null, Buffer.from(body), privateKey)).toString('base64url');
  return `${body}.${sig}`;
};

const dataDir = `/tmp/hvas-test-${Date.now()}`;
const { server, keys } = createApp({ dataDir });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (m, path, body, token) => {
  const res = await fetch(base + path, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

console.log('MEMBER AUTH');
const start = await call('POST', '/auth/member/start', { contact: '850-555-1234' });
ok(start.body.devCode, 'OTP issued');
const verify = await call('POST', '/auth/member/verify', { contact: '850-555-1234', code: start.body.devCode, name: 'Tasha' });
ok(verify.status === 200 && verify.body.token, 'member signed in');
const mtok = verify.body.token;
ok(/^HV-\d{4}-\d{4}$/.test(verify.body.member.number), 'member number minted');

console.log('MEMBERSHIP + ROLLING PASS');
const buy = await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'Credit / Debit' }, mtok);
ok(buy.body.member.tier === 'Monthly', 'Monthly purchased');
const p1 = await call('GET', '/pass/current', null, mtok);
const p2 = await call('GET', '/pass/current', null, mtok);
ok(p1.body.pass && p1.body.pass !== p2.body.pass, 'pass rotates (two fetches differ)');
const v = verifyPass(keys.publicKey, p1.body.pass);
ok(v.ok && v.number === buy.body.member.number, 'pass signature verifies offline');
// forged pass rejected
ok(!verifyPass(keys.publicKey, p1.body.pass.slice(0, -4) + 'AAAA').ok, 'tampered pass rejected');
// stale pass rejected
const stale = verifyPass(keys.publicKey, p1.body.pass, Date.now() + 60000);
ok(!stale.ok && stale.reason === 'expired-qr', 'stale QR (>45s) rejected');

console.log('STAFF AUTH + DOOR');
const badStaff = await call('POST', '/auth/staff', { code: 'NOPE' });
ok(badStaff.status === 401, 'wrong staff code rejected');
const staff = await call('POST', '/auth/staff', { code: 'DOOR850' });
ok(staff.body.token && staff.body.role === 'staff', 'staff code accepted');
const stok = staff.body.token;

console.log('ON THE WAY → BOARD');
await call('POST', '/signal/otw', { on: true }, mtok);
let b = await call('GET', '/door/board', null, stok);
ok(b.body.onTheWay.length === 1 && b.body.onTheWay[0].number === buy.body.member.number, 'member shows On the way');

console.log('VERIFY AT DOOR');
const fresh = await call('GET', '/pass/current', null, mtok);
const grant = await call('POST', '/door/verify', { pass: fresh.body.pass }, stok);
ok(grant.body.ok && grant.body.status === 'granted', 'valid pass → GRANTED');
b = await call('GET', '/door/board', null, stok);
ok(b.body.inside.length === 1, 'member now Inside');
ok(b.body.onTheWay.length === 0, 'On the way cleared on admit');
ok(b.body.lastDecision.status === 'granted', 'decision logged');
// idempotent: second grant same night doesn't double count
const fresh2 = await call('GET', '/pass/current', null, mtok);
await call('POST', '/door/verify', { pass: fresh2.body.pass }, stok);
const me = await call('GET', '/me', null, mtok);
ok(me.body.member.entries === 1, 'admission idempotent per night (entries=1)');

console.log('DENY CASES');
const trespass = await call('POST', '/door/verify', { number: 'HV-0000-0000' }, stok);
ok(!trespass.body.ok && trespass.body.status === 'trespass', 'unknown number → TRESPASS');
const oldPass = forgePass(keys.privateKey, buy.body.member.number, Date.now() - 60000); // signed 60s ago
const expiredQr = await call('POST', '/door/verify', { pass: oldPass }, stok);
ok(!expiredQr.body.ok && expiredQr.body.status === 'expired-qr', 'stale QR at door → expired-qr');

console.log('LIP SYNC BINGO');
// second member joins bingo alongside Tasha
const s2 = await call('POST', '/auth/member/start', { contact: '850-555-9999' });
const v2 = await call('POST', '/auth/member/verify', { contact: '850-555-9999', code: s2.body.devCode, name: 'Rell' });
const mtok2 = v2.body.token;

let state = await call('GET', '/bingo/state');
ok(state.body.status === 'lobby', 'round starts in lobby');
const join1 = await call('POST', '/bingo/join', {}, mtok);
ok(join1.body.card.length === 25 && join1.body.card[12] === 'FREE SPACE', 'card dealt: 25 squares, free center');
const join2 = await call('POST', '/bingo/join', {}, mtok2);
ok(join2.body.card.length === 25, 'second member dealt a card');
const rejoin = await call('POST', '/bingo/join', {}, mtok);
ok(JSON.stringify(rejoin.body.card) === JSON.stringify(join1.body.card), 'rejoin returns same card, not redealt');
await call('POST', '/bingo/ready', { ready: true }, mtok);

const noCall = await call('POST', '/bingo/call', {}, stok);
ok(noCall.status === 400, 'cannot call before round is live');
const bingoStart = await call('POST', '/bingo/start', {}, stok);
ok(bingoStart.status === 200, 'host starts the round');
state = await call('GET', '/bingo/state');
ok(state.body.status === 'live' && state.body.playerCount === 2 && state.body.readyCount === 1, 'live round shows player/ready counts');

const badClaim = await call('POST', '/bingo/claim', {}, mtok2);
ok(badClaim.status === 400, 'claim rejected when card has no bingo line');

// call out the entire phrase pool — once every phrase has been called, every
// card (including Tasha's and Rell's) is fully marked, so a claim is real.
for (let i = 0; i < 40; i++) { const r = await call('POST', '/bingo/call', {}, stok); if (r.status !== 200) break; }

const claim = await call('POST', '/bingo/claim', {}, mtok);
ok(claim.status === 200 && claim.body.pending, 'valid bingo claim accepted as pending');

const board = await call('GET', '/bingo/board', null, stok);
ok(board.body.players.length === 2 && board.body.claims.length === 1, 'host board shows players + pending claim');
const claimId = board.body.claims[0].id;
const resolve = await call('POST', '/bingo/resolve', { claimId, approve: true }, stok);
ok(resolve.status === 200, 'host approves the claim');
state = await call('GET', '/bingo/state');
ok(state.body.status === 'ended' && state.body.winner?.name === 'Tasha', 'round ends with the right winner');

const reset = await call('POST', '/bingo/reset', {}, stok);
ok(reset.status === 200, 'host resets for a new game');
state = await call('GET', '/bingo/state');
ok(state.body.status === 'lobby' && state.body.playerCount === 0, 'reset clears players + returns to lobby');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);

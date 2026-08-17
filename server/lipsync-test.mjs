// Standalone Lip Sync Battle events — bracket, king of the hill, open floor.
// Drives every format to a champion through the real HTTP API, including the
// bye path a 3-player bracket takes and a king who defends the floor twice.
import { createApp } from './src/app.mjs';
import { rmSync } from 'node:fs';

const dataDir = `/tmp/hvas-lipsync-${Date.now()}`;
const { server } = createApp({ dataDir });
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

// ── cast ──
const member = async (phone, name) => {
  const s = await call('POST', '/auth/member/start', { contact: phone });
  const v = await call('POST', '/auth/member/verify', { contact: phone, code: s.body.devCode, name });
  return { token: v.body.token, id: v.body.member.id, name };
};
const host = (await call('POST', '/auth/staff', { code: process.env.HVAS_HOST_CODE || 'HOST850' })).body.token
  || (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;

const A = await member('850-700-0001', 'Ayo');
const B = await member('850-700-0002', 'Bree');
const C = await member('850-700-0003', 'Cris');
const D = await member('850-700-0004', 'Dre');
const crowd = await member('850-700-0009', 'Watcher');   // votes, never battles
console.log('CAST', [A, B, C, D].map((m) => m.name).join(', '), '+ crowd');

// Run one bout start to finish, with an explicit winner so the test is
// deterministic rather than depending on who the crowd happens to favour.
const runBout = async (boutId, winner, others) => {
  const inBout = [winner, ...others];
  for (const m of inBout) await call('POST', '/battle/respond', { battleId: boutId, accept: true }, m.token);
  for (const m of inBout) {
    await call('POST', '/battle/perform', { battleId: boutId, memberId: m.id, seconds: 5 }, host);
    await call('POST', '/battle/performed', { battleId: boutId }, m.token);
  }
  await call('POST', '/battle/voting', { battleId: boutId, seconds: 60 }, host);
  await call('POST', '/battle/vote', { battleId: boutId, memberId: winner.id }, crowd.token);
  return call('POST', '/battle/resolve', { battleId: boutId, winnerId: winner.id }, host);
};
const state = async (tok = host) => (await call('GET', '/lipsync/state', null, tok)).body.event;
const whoIsUp = async () => {
  const ev = await state();
  const names = (ev.bout?.players || []).map((p) => p.memberId);
  return names;
};
const byId = { [A.id]: A, [B.id]: B, [C.id]: C, [D.id]: D };

console.log('\nBRACKET — 4 players, knockout to a champion');
let r = await call('POST', '/lipsync/create', { format: 'bracket', title: 'Friday Bracket', size: 8 }, host);
ok(r.status === 201 && r.body.event.format === 'bracket', 'host opens a bracket lobby');
ok((await call('POST', '/lipsync/create', { format: 'open' }, host)).status === 409, 'a second event is refused while one runs');
for (const m of [A, B, C, D]) await call('POST', '/lipsync/join', {}, m.token);
ok((await state()).roster.length === 4, 'four join the lobby');
ok((await call('POST', '/lipsync/next', {}, host)).status === 400, 'no bouts before the event starts');
r = await call('POST', '/lipsync/start', {}, host);
ok(r.status === 200 && r.body.boutId, 'start seeds the field and opens bout 1');
ok((await state()).roster.every((p) => p.seed >= 1), 'every player got a seed');

let ev = await state();
ok(ev.bout && ev.bout.artist, 'the bout came with a song to perform');
ok((await call('POST', '/lipsync/next', {}, host)).status === 409, 'next is refused while a bout is on the floor');

// Play it out: the seeded pair fight, winner advances, repeat to a champion.
let guard = 0;
while (guard++ < 10) {
  ev = await state();
  if (ev.status === 'done') break;
  if (!ev.bout) { const n = await call('POST', '/lipsync/next', {}, host); if (!n.body.boutId) break; ev = await state(); }
  const ids = ev.bout.players.map((p) => p.memberId);
  await runBout(ev.bout.id, byId[ids[0]], [byId[ids[1]]]);
}
ev = await state();
ok(ev.status === 'done', 'the bracket finished on its own');
ok(!!ev.champion?.memberId, `champion crowned: ${ev.champion?.name}`);
ok(ev.roster.filter((p) => p.state === 'in').length === 1, 'exactly one player was left standing');
ok(ev.roster.filter((p) => p.state === 'out').length === 3, 'the other three were knocked out');
ok(ev.bouts.length === 3, 'a 4-player knockout took 3 bouts');
ok(ev.roster.find((p) => p.memberId === ev.champion.memberId).wins === 2, 'champion won 2 bouts');

console.log('\nBRACKET — odd field, so somebody takes a bye');
await call('POST', '/lipsync/end', {}, host);
await call('POST', '/lipsync/create', { format: 'bracket', size: 4 }, host);
for (const m of [A, B, C]) await call('POST', '/lipsync/join', {}, m.token);
await call('POST', '/lipsync/start', {}, host);
guard = 0;
while (guard++ < 10) {
  ev = await state();
  if (ev.status === 'done') break;
  if (!ev.bout) { const n = await call('POST', '/lipsync/next', {}, host); if (!n.body.boutId) break; ev = await state(); }
  const ids = ev.bout.players.map((p) => p.memberId);
  await runBout(ev.bout.id, byId[ids[0]], [byId[ids[1]]]);
}
ev = await state();
ok(ev.status === 'done', 'a 3-player bracket also reaches a champion');
ok(ev.bouts.length === 2, 'it took 2 bouts, not 3 — one player had a bye');
ok(ev.bouts.some((b) => b.round === 2), 'the bye advanced the bracket to round 2');

console.log('\nKING OF THE HILL — winner holds the floor');
await call('POST', '/lipsync/end', {}, host);
await call('POST', '/lipsync/create', { format: 'king', title: 'Hold The Floor' }, host);
for (const m of [A, B, C]) await call('POST', '/lipsync/join', {}, m.token);
r = await call('POST', '/lipsync/start', {}, host);
ev = await state();
ok(ev.format === 'king' && ev.bout, 'first bout opens to crown a king');
let ids = ev.bout.players.map((p) => p.memberId);
const king = byId[ids[0]];
await runBout(ev.bout.id, king, [byId[ids[1]]]);
ev = await state();
ok(ev.king?.memberId === king.id, `${king.name} takes the floor`);
ok(ev.king.reign === 1, 'reign starts at 1');
ok(ev.roster.every((p) => p.state === 'in'), 'nobody is eliminated in king of the hill');

r = await call('POST', '/lipsync/next', {}, host);
ev = await state();
ids = ev.bout.players.map((p) => p.memberId);
ok(ids.includes(king.id), 'the king is in the next bout, defending');
const challenger = byId[ids.find((i) => i !== king.id)];
await runBout(ev.bout.id, king, [challenger]);
ev = await state();
ok(ev.king.memberId === king.id && ev.king.reign === 2, 'a successful defence extends the reign to 2');

await call('POST', '/lipsync/next', {}, host);
ev = await state();
ids = ev.bout.players.map((p) => p.memberId);
const usurper = byId[ids.find((i) => i !== king.id)];
await runBout(ev.bout.id, usurper, [king]);
ev = await state();
ok(ev.king.memberId === usurper.id, `${usurper.name} takes the floor from ${king.name}`);
ok(ev.king.reign === 1, 'a new king starts a fresh reign');

console.log('\nOPEN FLOOR — anyone calls anyone out, crowd votes rank it');
await call('POST', '/lipsync/end', {}, host);
await call('POST', '/lipsync/create', { format: 'open' }, host);
for (const m of [A, B, C]) await call('POST', '/lipsync/join', {}, m.token);
await call('POST', '/lipsync/start', {}, host);
ev = await state();
ids = ev.bout.players.map((p) => p.memberId);
await runBout(ev.bout.id, byId[ids[0]], [byId[ids[1]]]);
ev = await state();
ok(ev.roster.every((p) => p.state === 'in'), 'the open floor eliminates nobody');
ok(ev.roster[0].wins === 1 && ev.roster[0].votes === 1, 'standings count wins and crowd votes');

r = await call('POST', '/lipsync/challenge', { memberId: A.id }, C.token);
ok(r.status === 200 && r.body.boutId, 'a member calls someone out directly');
ok((await call('POST', '/lipsync/challenge', { memberId: A.id }, C.token)).status === 409, 'no second challenge while one is live');
ev = await state();
await runBout(ev.bout.id, C, [A]);
ok((await call('POST', '/lipsync/challenge', { memberId: C.id }, C.token)).status === 400, 'you cannot challenge yourself');
ok((await call('POST', '/lipsync/challenge', { memberId: D.id }, C.token)).status === 400, 'you cannot challenge someone not in the event');

console.log('\nGUARDS');
ok((await call('POST', '/lipsync/create', { format: 'nonsense' }, host)).status === 400, 'unknown format refused');
ok((await call('POST', '/lipsync/create', { format: 'open' }, A.token)).status === 401, 'members cannot open an event');
ok((await call('POST', '/lipsync/join', {}, host)).status === 401, 'the host is not a contestant');
ok((await call('POST', '/lipsync/leave', {}, A.token)).status === 400, 'no quiet exit once it is live');
ev = await state();
ok(ev.bouts.every((b) => b.round >= 1), 'every bout is filed under a round');

// A standalone bout must never bar anyone from a bingo square.
const locks = (await call('GET', '/bingo/state', null, host)).status;
ok(locks === 200, 'bingo state still serves alongside a live event');

console.log('\nEND');
r = await call('POST', '/lipsync/end', {}, host);
ok(r.body.event.status === 'done', 'host can end an event early');
ok((await call('POST', '/lipsync/join', {}, A.token)).status === 404, 'no joining once it is over');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
rmSync(dataDir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

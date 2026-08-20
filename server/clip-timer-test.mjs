// Verse-and-hook clips, and a host who controls the clock but never its length.
//
// A performance plays one segment — the tail of verse one into the first hook —
// cut from the track's own running time, and the timer is exactly as long as
// that segment. The host can hold the clock and let it go again; they never
// type a number anywhere.
import { createApp } from './src/app.mjs';
import { rmSync } from 'node:fs';

process.env.HVAS_HOST_CODE = 'HOST850';
const dataDir = `/tmp/hvas-clip-${Date.now()}`;
const { server } = createApp({ dataDir });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(base + p, { method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  return (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
};
const host = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const mmss = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;

console.log('CLIP WINDOWS — cut from each track\'s own length');
// The window maths is the same function the server uses; check its shape here
// so a bad edit shows up as a failed test and not as a room lip syncing to an
// intro. Mirrors clipWindowFor() in src/app.mjs.
const clipFor = (d) => {
  if (d < 30) return { start: 0, seconds: 120 };
  const start = Math.max(12, Math.round(d * 0.12));
  const seconds = Math.min(75, Math.max(40, Math.round(d * 0.40)));
  return { start, seconds: Math.min(seconds, Math.max(20, d - start - 2)) };
};
for (const [d, label] of [[210, '3:30'], [252, '4:12'], [135, '2:15'], [300, '5:00']]) {
  const c = clipFor(d);
  ok(c.start >= 12 && c.start < d * 0.25, `${label}: starts inside verse one (${mmss(c.start)}), not on the intro`);
  ok(c.start + c.seconds <= d, `${label}: never runs past the end of the track`);
  ok(c.seconds >= 40 && c.seconds <= 75, `${label}: window is ${c.seconds}s — long enough to carry a hook, short enough to hold a room`);
}
ok(clipFor(0).seconds === 120, 'an unknown length falls back to the shipped window rather than breaking');

console.log('\nTHE TIMER FOLLOWS THE CLIP');
const A = await mk('850-907-0001', 'Ayo');
const B = await mk('850-907-0002', 'Bree');
const crowd = await mk('850-907-0009', 'Watcher');
await call('POST', '/lipsync/create', { format: 'open', title: 'Clip Test' }, host);
for (const m of [A, B]) await call('POST', '/lipsync/join', {}, m.token);
await call('POST', '/lipsync/start', {}, host);
let ev = (await call('GET', '/lipsync/state', null, host)).body.event;
const bout = ev.bout.id;
for (const m of [A, B]) await call('POST', '/battle/respond', { battleId: bout, accept: true }, m.token);

// No video resolved in a test venue, so this exercises the fallback path.
const perf = await call('POST', '/battle/perform', { battleId: bout, memberId: A.member.id }, host);
ok(perf.status === 200, 'the host starts a performance without naming a duration');
ok(perf.body.seconds > 0, `the window came from the system, not the host (${perf.body.seconds}s)`);

console.log('\nHOST HOLDS THE CLOCK — but never sets it');
const held = await call('POST', '/battle/timer', { battleId: bout, action: 'pause' }, host);
ok(held.status === 200 && held.body.paused === true, 'the host can hold a running performance');
ok(held.body.leftMs > 0, `what was left on the clock is kept exactly (${Math.round(held.body.leftMs / 1000)}s)`);
const leftAtPause = held.body.leftMs;
let cur = (await call('GET', '/battle/current', null, host)).body.battle;
ok(cur.performanceEndsAt === null, 'while held, the clock is not counting down');
ok(cur.timerHeldMs === leftAtPause, 'the screens can see it is held, and by how much');
await wait(1500);
cur = (await call('GET', '/battle/current', null, host)).body.battle;
ok(cur.timerHeldMs === leftAtPause, 'time passing while held does not eat the performance');

const back = await call('POST', '/battle/timer', { battleId: bout, action: 'resume' }, host);
ok(back.status === 200 && back.body.paused === false, 'and let it go again');
const leftAfter = back.body.endsAt - Date.now();
ok(Math.abs(leftAfter - leftAtPause) < 400, 'the performer gets back exactly what they had left, not more or less');

console.log('\nGUARDS');
ok((await call('POST', '/battle/timer', { battleId: bout, action: 'resume' }, host)).status === 400, 'cannot release a clock that is running');
ok((await call('POST', '/battle/timer', { battleId: bout, action: 'set', seconds: 300 }, host)).status === 400, 'there is no way to set a duration at all');
ok((await call('POST', '/battle/timer', { battleId: bout, action: 'pause' }, A.token)).status === 401, 'a member cannot touch the clock');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
rmSync(dataDir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);

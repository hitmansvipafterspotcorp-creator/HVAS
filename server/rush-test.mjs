// THE FIRST HOUR OF THE 31st.
//
// launch-test.mjs walks one person from the street to the dance floor. That is
// the path, and it is green. This is the same path with sixty people on it at
// once, because the way opening night actually breaks is not a wrong endpoint.
// It is a queue: everyone arrives inside twenty minutes, every phone is asking
// for a code at the same time, and two door stations are scanning into the
// same database.
//
// Nothing here is a benchmark. Every check is something that would ruin the
// night if it were false.
import { createApp } from './src/app.mjs';
import { openDb } from './src/db.mjs';
import { freeMemberNumber, randomMemberNumber } from './src/member-number.mjs';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

process.env.HVAS_HOST_CODE = 'HOST850';
const DIR = `/tmp/hvas-rush-${Date.now()}`;
const { server } = createApp({ dataDir: DIR });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

// Every response any of these sixty people saw, so a single 500 anywhere in the
// rush can be found and named rather than averaged away.
const seen = [];
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  const out = { status: r.status, body: await r.json().catch(() => ({})), path: p };
  seen.push(out);
  return out;
};

const N = 60;
const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const door2 = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;

console.log(`SIXTY STRANGERS, ALL AT ONCE`);
// Distinct contacts, because sixty different people is the case. The rate
// limiter is per contact and is tested on its own further down.
const joinOne = async (i) => {
  const contact = `850-555-${String(1000 + i).slice(-4)}`;
  const start = await call('POST', '/auth/member/start', { contact });
  if (!start.body.devCode) return { i, failedAt: 'start', status: start.status };
  const v = await call('POST', '/auth/member/verify',
    { contact, code: start.body.devCode, name: `Guest ${i}` });
  if (!v.body.token) return { i, failedAt: 'verify', status: v.status };
  const me = v.body.token;
  await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, me);
  await call('POST', '/me/role', { role: 'NAILS' }, me);
  await call('POST', '/me/program', { program: 'HOUSING' }, me);
  const buy = await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, me);
  if (buy.status !== 200) return { i, failedAt: 'purchase', status: buy.status };
  const p = await call('GET', '/pass/current', null, me);
  if (!p.body.pass) return { i, failedAt: 'pass', status: p.status };
  return { i, token: me, pass: p.body.pass, number: v.body.member.number };
};

const t0 = Date.now();
const people = await Promise.all(Array.from({ length: N }, (_, i) => joinOne(i)));
const joinMs = Date.now() - t0;
const joined = people.filter((p) => p.pass);
const stuck = people.filter((p) => !p.pass);

eq(joined.length, N, `all ${N} got from the street to a pass in their hand`);
if (stuck.length) console.log(`      stuck: ${JSON.stringify(stuck.slice(0, 5))}`);

// A number two people share is the one bug that lets the door admit the wrong
// person, so it is checked directly rather than trusted to the schema.
const numbers = new Set(joined.map((p) => p.number));
eq(numbers.size, joined.length, 'and every one of them got a member number nobody else has');

const errors = seen.filter((r) => r.status >= 500);
eq(errors.length, 0, 'nothing anywhere in the rush came back as a server error');
if (errors.length) console.log(`      first: ${JSON.stringify(errors[0]).slice(0, 200)}`);

console.log(`      (${N} joined in ${(joinMs / 1000).toFixed(1)}s — ${seen.length} calls)`);
ok(joinMs < 120000, 'and the queue cleared in under two minutes, not long enough for anyone to give up');

console.log('\nTHE DOOR, WITH A LINE OUT OF IT');
const d0 = Date.now();
const scans = await Promise.all(joined.map((p) => call('POST', '/door/verify', { pass: p.pass }, venue)));
const doorMs = Date.now() - d0;
eq(scans.filter((s) => s.body.status === 'granted').length, joined.length, 'the door let every one of them in');
console.log(`      (${joined.length} scans in ${(doorMs / 1000).toFixed(1)}s)`);

const board = await call('GET', '/door/board', null, venue);
eq(board.body.inside?.length, joined.length, 'and the roster inside matches the number of people who walked in');

console.log('\nTWO DOOR STATIONS, ONE PERSON, THE SAME INSTANT');
// A second scanner on the other side of the room, and somebody's friend
// double-tapping. One person cannot be inside twice, and a rescan is not a
// crash — it is the most ordinary thing that happens at a door all night.
const twice = joined[0];
const both = await Promise.all([
  call('POST', '/door/verify', { pass: twice.pass }, venue),
  call('POST', '/door/verify', { pass: twice.pass }, door2),
]);
ok(both.every((r) => r.status === 200), 'both stations answer, neither errors');
const after = await call('GET', '/door/board', null, venue);
eq(after.body.inside.filter((p) => p.number === twice.number).length, 1,
   'and that person is on the roster exactly once, not twice');
eq(after.body.inside.length, joined.length, 'with nobody else duplicated by the race');

console.log('\nONE PHONE ASKING OVER AND OVER DOES NOT STOP THE QUEUE');
const spammer = '850-555-9999';
const burst = await Promise.all(Array.from({ length: 6 }, () => call('POST', '/auth/member/start', { contact: spammer })));
ok(burst.some((r) => r.status === 429), 'the one hammering the button is slowed down');
ok(burst.some((r) => r.status === 200), 'but the first ask still went through');
const bystander = await call('POST', '/auth/member/start', { contact: '850-555-8888' });
eq(bystander.status, 200, 'and the next person in line is completely unaffected by them');

console.log('\nA MEMBER NUMBER NOBODY ELSE HOLDS, EVEN WHEN LUCK IS AGAINST IT');
// 81 million numbers means a clash is rare, and rare is the problem: it would
// have happened once, to one person, at the door, and shown them a raw SQLite
// constraint error. Rig the generator so the collision is certain.
const db = openDb(`${DIR}/collide.db`);
db.prepare('INSERT INTO members(id,name,contact,number,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run('x', 'Taken', 'taken@x', 'HV-1111-1111', Date.now(), Date.now());
let calls = 0;
const rigged = () => { calls++; return calls <= 3 ? 'HV-1111-1111' : 'HV-2222-2222'; };
eq(freeMemberNumber(db, rigged), 'HV-2222-2222', 'a number already held is skipped, not handed out again');
ok(calls === 4, 'and it kept trying until it found a free one');
let threw = null;
try { freeMemberNumber(db, () => 'HV-1111-1111', 5); } catch (e) { threw = e.message; }
ok(/free member number/i.test(threw || ''), 'a generator that can never succeed says so plainly instead of hanging');
ok(/^HV-\d{4}-\d{4}$/.test(randomMemberNumber()), 'and the numbers still look like member numbers');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

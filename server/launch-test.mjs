// THE NIGHT OF THE 31st.
//
// Everything else in this repo is a feature. This is the path the night
// actually depends on, and nothing on it is allowed to be nearly working:
//
//   A stranger finds the room → signs up → is accepted as a member →
//   holds a membership → shows a pass → the door lets them in.
//
// It is written as one unbroken walk rather than as units, because the way
// this breaks in real life is never one endpoint returning the wrong shape.
// It is step four handing step five something step five cannot use, at 11pm,
// with people waiting outside.
import { createApp } from './src/app.mjs';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-launch-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

console.log('THE DOOR IS STAFFED BEFORE ANYBODY ARRIVES');
const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
ok(!!venue, 'the venue code signs somebody in to work the door');
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
ok(!!owner, 'and the owner has a named sign-in of their own');

console.log('\nA STRANGER FINDS THE ROOM');
// This is what the app does when somebody taps the venue in the directory.
const cfg = await call('GET', '/config');
eq(cfg.status, 200, 'the venue answers /config, which is how the app knows it is real');
ok(!!cfg.body.venueId, 'and gives the permanent id the app saves instead of a link');

console.log('\nSIGNING UP, FROM A PHONE, WITH NOBODY HELPING');
const start = await call('POST', '/auth/member/start', { contact: '850-555-0131' });
eq(start.status, 200, 'they put in their number');
ok(!!start.body.devCode, 'and a code comes back');
const verify = await call('POST', '/auth/member/verify',
  { contact: '850-555-0131', code: start.body.devCode, name: 'Simone' });
eq(verify.status, 200, 'the code signs them in');
const me = verify.body.token;
ok(!!me, 'they have a session');
ok(!!verify.body.member?.number, `and a member number (${verify.body.member?.number})`);
const number = verify.body.member.number;
// A wrong code must not.
eq((await call('POST', '/auth/member/verify', { contact: '850-555-0132', code: '000000', name: 'Nobody' })).status,
   401, 'a wrong code does not');

console.log('\nSIGNING IN IS NOT MEMBERSHIP — THE THREE THINGS THEY DO NEXT');
const onb0 = await call('GET', '/onboarding', null, me);
eq(onb0.body.accepted, false, 'they are not accepted yet');
eq(onb0.body.next?.id, 'AGREE', 'and the app is told exactly what to ask for first');
eq((await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, me)).status, 200, 'they agree to the covenant');
eq((await call('POST', '/me/role', { role: 'NAILS' }, me)).status, 200, 'they say what they do');
eq((await call('POST', '/me/program', { program: 'HOUSING' }, me)).status, 200, 'they pick a cause to stand behind');
const mid = await call('GET', '/onboarding', null, me);
eq(mid.body.accepted, false, 'three steps in, they are still not a member — dues are the fourth');
eq(mid.body.next?.id, 'TIER', 'and the app is told that is what is left');
ok((mid.body.tiers || []).length >= 3, 'with the memberships to choose from on the same call');
ok(mid.body.tiers.every((t) => t.price > 0 && t.every), 'each priced, and each saying how long it lasts in words');
// Four screens is the whole cost of joining, and dues are LAST on purpose:
// nobody is asked for money until they know what they are joining, what they
// will be here as, and what they are standing behind.
eq(onb0.body.steps.length, 4, 'joining is four steps');
eq(onb0.body.steps[3].id, 'TIER', 'and paying is the last of them, never the first');

console.log('\nA MEMBERSHIP, AND A PASS TO SHOW FOR IT');
const buy = await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, me);
eq(buy.status, 200, 'they take a membership');
const onb = await call('GET', '/onboarding', null, me);
eq(onb.body.accepted, true, 'and NOW they are a member of this place');
const passRes = await call('GET', '/pass/current', null, me);
eq(passRes.status, 200, 'the app can fetch their pass');
const token = passRes.body.pass;
ok(!!token, 'and there is something to put in a QR');
// The QR is short-lived on purpose: a screenshot of somebody else's pass has
// to stop working, or the door is a photograph away from being open to anyone.
ok(passRes.body.ttlMs > 0 && passRes.body.ttlMs <= 120000,
   `and it goes stale in ${Math.round(passRes.body.ttlMs / 1000)}s, so a screenshot is not a key`);

console.log('\nTHE DOOR');
const at = await call('POST', '/door/verify', { pass: token }, venue);
eq(at.status, 200, 'the door scans it');
eq(at.body.status, 'granted', 'and lets them in');
eq(at.body.member?.name, 'Simone', 'showing the door person who they just admitted');
// The three refusals that matter, because a door that only says yes is a
// door with no lock on it.
eq((await call('POST', '/door/verify', { number: 'HV-0000-0000' }, venue)).body.status, 'trespass',
   'a number nobody holds is refused');
eq((await call('POST', '/door/verify', { pass: token }, me)).status, 401,
   'a member cannot work the door with their own session');
const board = await call('GET', '/door/board', null, venue);
ok(board.body.inside?.some((p) => p.number === number), 'and the roster shows them inside');

console.log('\nTHE RUBBISH A DOOR GETS FED ALL NIGHT');
// A scanner firing on a blank frame, somebody's Snapchat QR, a double-tap on
// an empty search box. None of these is a person, and none of them may ever
// come back as a 500 — on the door that reads as "the system is down".
for (const [what, body] of [
  ['nothing at all', {}],
  ['an empty pass', { pass: '' }],
  ['a null pass', { pass: null }],
  ['a number that is not text', { number: { a: 1 } }],
  ['a QR from another app', { pass: 'https://instagram.com/x' }],
  ['the right shape, a forged signature', { pass: 'eyJhIjoxfQ.bad.sig' }],
  ['fifty thousand characters', { pass: 'x'.repeat(50000) }],
  ['emoji', { pass: '🎫🎫🎫' }],
]) {
  const r = await call('POST', '/door/verify', body, venue);
  ok(r.status === 200 && r.body.ok !== true, `${what} is refused, not a crash (${r.status} ${r.body.status})`);
}
// An unreadable scan is not an accusation. Nobody was identified, so nothing
// about a person is written down — the door is told to scan again instead.
const blank = await call('POST', '/door/verify', {}, venue);
eq(blank.body.status, 'unreadable', 'a blank scan comes back as unreadable');
eq(blank.body.member, null, 'with nobody named');

console.log('\nTHE SAME PERSON, THE SAME NIGHT, TWICE');
// Somebody steps out for a cigarette. This must not read as a new arrival and
// must not read as a stranger.
eq((await call('POST', '/door/checkout', { number }, venue)).status, 200, 'they step out');
const again = await call('POST', '/door/verify', { pass: token }, venue);
eq(again.body.status, 'granted', 'and are let back in');

console.log('\nWHAT THE OWNER SEES WHILE THIS IS HAPPENING');
const pulse = await call('GET', '/venue/pulse', null, owner);
eq(pulse.status, 200, 'the owner has one screen that says what needs a person');
ok(!!pulse.body.now?.headline, `and it always names one thing to do — "${pulse.body.now?.headline}"`);

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

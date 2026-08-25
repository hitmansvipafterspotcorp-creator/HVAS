// Money, and the room's vote, through the real API.
//
// The prize rules are unit-tested next door. This is the other half: that the
// SERVER only ever reports a pot somebody actually paid into, that a member
// cannot mark themselves paid, and that the vote on a called lip sync square
// obeys the one rule that matters — you do not get a say on your own square.
//
// It is worth the round trip because every one of these is about money or about
// making somebody get up in front of a room.
process.env.HVAS_HOST_CODE = 'HOST850';
process.env.BINGO_SONG_SECONDS = '3';
process.env.BINGO_LIPSYNC_SECONDS = '3';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-entry-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const api = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(api + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  return (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
};
const host = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);
const state = async (t) => (await call('GET', '/bingo/state', null, t)).body;

console.log('A NIGHT IS FREE UNTIL A HOST SAYS OTHERWISE');
let st = await state();
eq(st.mode, 'free', 'a fresh round is free play');
eq(st.pot, 0, 'and the pot is zero');
eq(st.cash, false, 'and it is not a cash game');

const a = await mk('850-700-0001', 'Ada');
const b = await mk('850-700-0002', 'Bo');
const c3 = await mk('850-700-0003', 'Cass');
for (const m of [a, b, c3]) await call('POST', '/bingo/join', {}, m.token);

console.log('\nA MEMBER CANNOT MARK THEMSELVES PAID');
// The whole pot rests on this. If a phone can say "I paid", the pot is fiction.
const selfPay = await call('POST', '/bingo/entry', { member_id: a.member.id }, a.token);
ok(selfPay.status === 401 || selfPay.status === 403, `a member's own token is refused (${selfPay.status})`);
eq((await state()).paidPlayers, 0, 'and nobody is marked paid by trying');

console.log('\nTHE POT IS WHAT THE DOOR TOOK');
await call('POST', '/bingo/mode', { mode: 'cash' }, host);
eq((await state()).mode, 'cash', 'the host can make it a cash game');
await call('POST', '/bingo/start', { deckId: 'starter' }, host);
st = await state();
eq(st.paidPlayers, 0, 'a cash game with nobody paid has nobody paid');
eq(st.pot, 0, 'and still no pot');
eq(st.cash, false, 'and still does not pay — a mode is not money');

await call('POST', '/bingo/entry', { member_id: a.member.id, how: 'cash' }, host);
st = await state();
eq(st.paidPlayers, 1, 'one entry is one player');
eq(st.cash, false, 'one payer is not a game yet');
eq(st.pot, 0, 'so there is still nothing to pay out');

await call('POST', '/bingo/entry', { member_id: b.member.id, how: 'cash' }, host);
st = await state();
eq(st.paidPlayers, 2, 'two entries');
eq(st.cash, true, 'and now it is a cash game');
eq(st.pot, 30, 'with a $30 pot — exactly what came in');
eq(st.entryFee, 15, 'at $15 a head');

await call('POST', '/bingo/entry', { member_id: c3.member.id, how: 'app' }, host);
eq((await state()).pot, 45, 'a third payer makes it $45 — the pot follows the room');

console.log('\nA MISKEY AT THE DESK IS NOT PERMANENT');
await call('POST', '/bingo/entry', { member_id: c3.member.id, paid: false }, host);
st = await state();
eq(st.paidPlayers, 2, 'an entry can be taken back');
eq(st.pot, 30, 'and the pot goes back down with it');

console.log('\nFREE AGAIN MEANS FREE AGAIN');
await call('POST', '/bingo/mode', { mode: 'free' }, host);
st = await state();
eq(st.pot, 0, 'switching back to free pays nothing');
eq(st.cash, false, 'whatever was collected');
await call('POST', '/bingo/mode', { mode: 'cash' }, host);
eq((await state()).pot, 30, 'and switching back finds the entries still there');

console.log('\nPAYING FROM YOUR OWN PHONE IS A REQUEST, NOT A PAYMENT');
// The invariant the whole pot rests on, tested from the member's side this
// time: a phone can ASK to be in, and asking must move nothing.
await call('POST', '/bingo/entry', { member_id: c3.member.id, paid: false }, host);   // start clean
let potBefore = (await state()).pot;
const claim = await call('POST', '/bingo/entry/claim', { rail: 'cashapp', reference: 'Cass 8891' }, c3.token);
eq(claim.status, 200, 'a member can say they have paid');
eq(claim.body.status, 'pending', 'and it lands as pending');
eq(claim.body.amount, 15, 'for the entry fee');
st = await state(c3.token);
eq(st.pot, potBefore, 'the pot has not moved');
eq(st.me.paid, false, 'and they are not in the game yet');
eq(st.me.entryClaim.status, 'pending', 'their own screen says it is waiting on the house');

// Tapping again must not queue a second fifteen dollars in front of the host.
const again = await call('POST', '/bingo/entry/claim', { rail: 'cashapp' }, c3.token);
eq(again.body.duplicate, true, 'asking twice is still one request');

let board = (await call('GET', '/bingo/board', null, host)).body;
eq(board.entryClaims.length, 1, 'the host sees exactly one request');
eq(board.entryClaims[0].name, 'Cass', 'with the name of who made it');

console.log('\nONLY THE HOUSE TURNS IT INTO MONEY');
const resolved = await call('POST', '/bingo/entry/resolve', { id: claim.body.id, confirm: true }, host);
eq(resolved.status, 200, 'the host confirms it');
st = await state(c3.token);
eq(st.me.paid, true, 'now they are in');
eq(st.pot, potBefore + 15, 'and the pot went up by exactly the entry');
eq((await call('GET', '/bingo/board', null, host)).body.entryClaims.length, 0, 'and the request is off the list');

// A member must not be able to resolve one — including their own.
await call('POST', '/bingo/entry', { member_id: c3.member.id, paid: false }, host);
const c2 = await call('POST', '/bingo/entry/claim', { rail: 'zelle' }, c3.token);
const sneaky = await call('POST', '/bingo/entry/resolve', { id: c2.body.id, confirm: true }, c3.token);
ok(sneaky.status === 401 || sneaky.status === 403, `a member cannot confirm their own request (${sneaky.status})`);
eq((await state(c3.token)).me.paid, false, 'and trying does not put them in the pot');

console.log('\nAND THERE IS NOTHING TO PAY ON A FREE NIGHT');
await call('POST', '/bingo/mode', { mode: 'free' }, host);
const onFree = await call('POST', '/bingo/entry/claim', { rail: 'cash' }, a.token);
eq(onFree.status, 400, 'a free round refuses to take an entry');
await call('POST', '/bingo/mode', { mode: 'cash' }, host);

console.log('\nYOU DO NOT GET A VOTE ON YOUR OWN SQUARE');
// Call lip sync squares until one lands on a card we can reason about.
// Not just any lip sync call — one that somebody in the room does NOT hold.
// With three players and a deck this size they often all hold it, and a square
// nobody can vote on exercises none of the rule this section exists for.
let mic = null, anyMic = null;
for (let i = 0; i < 120 && !mic; i++) {
  await call('POST', '/bingo/call', {}, host);
  const s2 = await state();
  if (s2.mic) { anyMic = s2.mic; if (s2.mic.voters > 0) mic = s2.mic; }
}
ok(!!anyMic, 'a lip sync square gets called');
ok(!!mic, `and one of them is a square somebody does not hold${mic ? '' : ' (never found one — the vote path went untested)'}`);
mic = mic || anyMic;
if (mic) {
  console.log(`   [square] ${mic.artist} — ${mic.song}, ${mic.holders.length} holding, ${mic.voters} may vote`);
  const holders = new Set(mic.holders);
  const holder = [a, b, c3].find((m) => holders.has(m.member.id));
  const outsider = [a, b, c3].find((m) => !holders.has(m.member.id));
  if (holder) {
    const r = await call('POST', '/bingo/micvote', {}, holder.token);
    eq(r.status, 403, 'a holder voting on their own square is refused');
    eq((await state()).mic.votes, 0, 'and their vote is not counted');
  } else { ok(true, '(nobody held it this time — nothing to refuse)'); ok(true, ''); }
  if (outsider) {
    const r = await call('POST', '/bingo/micvote', {}, outsider.token);
    eq(r.status, 200, 'somebody without the square may vote');
    const after = (await state()).mic;
    eq(after.votes, 1, 'and it counts');
    // Twice is still once.
    await call('POST', '/bingo/micvote', {}, outsider.token);
    eq((await state()).mic.votes, 1, 'voting twice is still one vote');
  } else { ok(true, '(everyone held it — nobody to vote)'); ok(true, ''); ok(true, ''); }
  const s3 = (await state()).mic;
  ok(typeof s3.endsAt === 'number' && s3.endsAt > 0, 'the deadline is a real moment');
  ok(s3.forced === (s3.votes > s3.voters / 2), 'and forced is exactly the rule, not a guess');
}

console.log('\nEVERY PHONE IS TOLD THE SAME THING');
const [asSeenByA, asSeenByB] = await Promise.all([state(a.token), state(b.token)]);
eq(asSeenByA.pot, asSeenByB.pot, 'the pot reads the same to both');
eq(asSeenByA.mic?.forced, asSeenByB.mic?.forced, 'and so does the verdict on the square');
eq(asSeenByA.mic?.endsAt, asSeenByB.mic?.endsAt, 'and the deadline is identical, not per-phone');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

// What needs a person right now, ranked.
//
// The app used to hand the owner a map of every screen, equally available at
// all times, and let them work out which one mattered. This is the other way
// round: the server already knows who is standing there waiting, and says so.
//
// The tests that matter are about ORDER. Any single state is easy to report;
// the useful claim is that when four things are live at once, the one the app
// puts in front of you is the one with a person standing in front of a room.
process.env.HVAS_HOST_CODE = 'HOST850';
process.env.HVAS_STAFF_CODE = 'DOOR850';
process.env.BINGO_SONG_SECONDS = '3';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-pulse-${Date.now()}` });
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
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const hire = async (name, role, by) => {
  const inv = await call('POST', '/staff/invite', { name, role }, by);
  return (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
};
const owner = await hire('Kenya', 'host', venue);
const door = await hire('Trey', 'staff', owner);
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  return (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
};
const pulse = async (t = owner) => (await call('GET', '/venue/pulse', null, t)).body;

console.log('\nA QUIET VENUE STILL HAS A JOB');
const quiet = await pulse();
eq(quiet.now.id, 'door', 'with nothing happening, the door is the answer');
ok(/nobody inside yet/i.test(quiet.now.headline), 'and it says so plainly');
ok(/scan the first member/i.test(quiet.now.detail), 'with the actual next action');
eq(quiet.now.action.screen, 'staff', 'pointing at the door screen');
// A screen that tells somebody standing at a door "nothing to do" is lying.
ok(quiet.then.length === 0, 'and nothing else is pretending to need them');

console.log('\nSOMEBODY ON THE WAY OUTRANKS AN EMPTY ROOM');
const nova = await mk('850-900-0001', 'Nova');
await call('POST', '/signal/otw', { on: true }, nova.token);
const coming = await pulse();
eq(coming.now.id, 'ontheway', 'the person heading over is the top of the list');
eq(coming.now.count, 1, 'counted');
ok(coming.then.some((i) => i.id === 'door'), 'and the door is still there underneath');

console.log('\nA LOBBY WITH ENOUGH PEOPLE IS WAITING ON A DECISION');
const rio = await mk('850-900-0002', 'Rio');
await call('POST', '/bingo/join', {}, nova.token);
await call('POST', '/bingo/join', {}, rio.token);
const lobby = await pulse();
eq(lobby.now.id, 'ready', 'two in the lobby is the thing to act on');
eq(lobby.now.count, 2, 'with how many are sitting there');
ok(/nothing happens until somebody does/i.test(lobby.now.detail), 'and says why it is waiting');
eq(lobby.now.action.tab, 'run', 'landing on the tab that starts it');

console.log('\nA RUNNING ROUND REPORTS ITSELF, NOT A LOBBY');
await call('POST', '/bingo/start', {}, owner);
const live = await pulse();
eq(live.now.id, 'running', 'once it is running, that is the state');
ok(/is live/i.test(live.now.headline), 'said as a fact about the room');
eq(live.round.status, 'live', 'and the round block agrees');

console.log('\nBUT A MEMBER STANDING THERE OUTRANKS THE ROUND');
// Everything below is live at the same time: a round running, people in the
// lobby, somebody on the way. The claim still has to win, because that is the
// one with a person holding a card in front of a room.
// A claim has to be a REAL bingo — the server refuses one that is not, which
// is exactly right and means the test has to actually win. Autofill covers
// Nova's squares as they are called; the host calls until she has a line.
await call('POST', '/bingo/autofill', { on: true }, nova.token);
// Autofill covers called squares, but LIP SYNC squares are never filled in —
// those are earned by performing. So on some deals every line through Nova's
// card contains one, and she cannot win no matter how many songs are called.
// That is correct game behaviour and it made this suite flaky: it looked like
// the RANKING was wrong when the deal simply had no win in it.
//
// Deal again rather than assert against a card that cannot win.
let claimed = null;
for (let deal = 0; deal < 8 && !claimed; deal++) {
  if (deal > 0) {
    await call('POST', '/bingo/reset', {}, owner);
    for (const m of [nova, rio]) await call('POST', '/bingo/join', {}, m.token);
    await call('POST', '/bingo/start', {}, owner);
    await call('POST', '/bingo/autofill', { on: true }, nova.token);
  }
  for (let i = 0; i < 220; i++) {
    const called = await call('POST', '/bingo/call', {}, owner);
    const c = await call('POST', '/bingo/claim', {}, nova.token);
    if (c.status === 200) { claimed = await pulse(); break; }
    if (called.status !== 200 && /all phrases called/i.test(called.body.error || '')) break;
  }
}
ok(!!claimed, 'Nova can actually win a round the server believes in');
claimed = claimed || await pulse();
eq(claimed.now.id, 'claims', 'the bingo claim goes to the front');
ok(/called BINGO/i.test(claimed.now.headline), 'named, so the host knows who to look at');
ok(claimed.now.waitingMs >= 0, 'with how long they have been waiting');
eq(claimed.now.action.screen, 'host', 'pointing into host controls');
eq(claimed.now.action.tab, 'claims', 'on the claims tab, not the top of it');
ok(claimed.then.some((i) => i.id === 'running'), 'and the round is still listed under it');
ok(claimed.then.some((i) => i.id === 'ontheway'), 'along with the door');
// Order is the whole product. Assert it, do not eyeball it.
const order = [claimed.now, ...claimed.then].map((i) => i.id);
console.log('   [order]', order.join(' → '));
ok(order.indexOf('claims') < order.indexOf('running'), 'a claim beats a running round');
ok(order.indexOf('running') < order.indexOf('ontheway'), 'a running round beats the door');
ok(order[order.length - 1] === 'door', 'and the quiet door is always last');

console.log('\nMONEY WAITING SITS BELOW A ROOM WAITING');
await call('POST', '/world/policy',
  { maxReleasePercent: 0.4, defaultVault: 'HOUSING_STABILITY', normalApprovals: 2 }, owner);
await call('POST', '/jubilee/apply',
  { needKind: 'RENT', amountCents: 20000, detail: 'Short on rent.' }, rio.token);
const appId = (await call('GET', '/jubilee/queue', null, owner)).body.applications[0].applicationId;
await call('POST', '/jubilee/verify', { applicationId: appId, note: 'Called the landlord.' }, owner);
const withSupport = await pulse();
const ids = [withSupport.now, ...withSupport.then].map((i) => i.id);
console.log('   [order]', ids.join(' → '));
ok(ids.includes('support-waiting'), 'a checked support case shows up');
ok(ids.indexOf('claims') < ids.indexOf('support-waiting'),
   'but somebody standing in front of a room comes first');

console.log('\nAPPROVED AND UNPAID IS MORE URGENT THAN UNAPPROVED');
await call('POST', '/jubilee/approve', { applicationId: appId }, owner);
await call('POST', '/jubilee/approve', { applicationId: appId }, door);
const approved = await pulse();
const ids2 = [approved.now, ...approved.then].map((i) => i.id);
console.log('   [order]', ids2.join(' → '));
ok(ids2.includes('support-ready'), 'it moves to ready-to-pay');
ok(!ids2.includes('support-waiting'), 'and stops asking to be approved');
ok(ids2.indexOf('support-ready') < ids2.indexOf('ontheway'), 'ranking above the quiet end of the list');

console.log('\nAND IT IS THE HOUSE’S SCREEN');
eq((await call('GET', '/venue/pulse', null, nova.token)).status, 401, 'a member gets nothing');
eq((await call('GET', '/venue/pulse', null, null)).status, 401, 'and so does nobody');
const sharedPulse = await call('GET', '/venue/pulse', null, venue);
eq(sharedPulse.status, 200, 'the shared venue code still runs the night');
eq(sharedPulse.body.you.named, false, 'and is told it is not a person');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

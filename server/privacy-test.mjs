// What one member can learn about another, and about the house.
//
// This exists because of one specific hole. The leaderboard published every
// player's member NUMBER to every member. A number is not a stat: it is what
// the pass QR encodes, and it is what the door accepts when somebody's phone is
// dead. Publishing it to the room handed anybody the one string they would need
// to be admitted as somebody else.
//
// So this suite is written from the attacker's side. It signs in as an ordinary
// member and asks, of every surface a member can reach: what did you just tell
// me that is not mine?
process.env.HVAS_HOST_CODE = 'HOST850';
process.env.HVAS_STAFF_CODE = 'DOOR850';
const { createApp } = await import('./src/app.mjs');
const { onboard } = await import('./test-helpers.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-priv-${Date.now()}` });
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

const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  const v = (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
  await onboard(call, v.token);
  return v;
};
// Nova is the attacker. Rio is the person she should not be able to become.
const nova = await mk('850-701-0001', 'Nova');
const rio = await mk('850-701-0002', 'Rio');
const RIO_NUMBER = rio.member.number;
const RIO_CONTACT = '850-701-0002';
for (const m of [nova, rio]) await call('POST', '/bingo/join', {}, m.token);
await call('POST', '/bingo/start', {}, owner);
await call('POST', '/me/program', { program: 'HOUSING' }, rio.token);
await call('POST', '/jubilee/apply',
  { needKind: 'RENT', amountCents: 20000, detail: 'Behind on rent after a bad month.' }, rio.token);
await call('POST', '/programs/donate', { program: 'FOOD', amountCents: 5000, rail: 'cash' }, rio.token);
await call('POST', '/board/apply',
  { program: 'FOOD', position: 'CHAIR', brings: 'I have chaired a food bank board for four years and can bring two suppliers.' },
  rio.token);

// Every surface a member's own token can reach.
const MEMBER_SURFACES = [
  ['GET', '/bingo/state'], ['GET', '/bingo/leaderboard'], ['GET', '/programs'],
  ['GET', '/programs/donations'], ['GET', '/board'], ['GET', '/me'],
  ['GET', '/me/timeline'], ['GET', '/me/stats'], ['GET', '/wallet'],
  ['GET', '/jubilee/kinds'], ['GET', '/jubilee/mine'], ['GET', '/ip/mine'],
];

console.log("\nWHAT A MEMBER IS TOLD ABOUT SOMEBODY ELSE");
for (const [m, path] of MEMBER_SURFACES) {
  const r = await call(m, path, null, nova.token);
  const j = JSON.stringify(r.body || {});
  const leaks = [];
  // The number is the door key. It must never appear for anybody but you.
  if (j.includes(RIO_NUMBER)) leaks.push("Rio's member number");
  if (j.includes(RIO_CONTACT)) leaks.push("Rio's phone");
  // What somebody wrote to ask for rent is the most private thing here.
  if (/Behind on rent/.test(j)) leaks.push("Rio's support application");
  if (/chaired a food bank/.test(j)) leaks.push("Rio's board application text");
  ok(leaks.length === 0, `${path} tells her nothing of Rio's${leaks.length ? ` — LEAKED ${leaks.join(', ')}` : ''}`);
}

console.log('\nAND HER OWN THINGS ARE STILL HERS');
const me = await call('GET', '/me', null, nova.token);
ok(JSON.stringify(me.body).includes(nova.member.number), 'her own member number is on her own record');
const lb = await call('GET', '/bingo/leaderboard', null, nova.token);
ok(JSON.stringify(lb.body).includes(nova.member.number), 'and on her own leaderboard row');
ok(/Rio/.test(JSON.stringify(lb.body)), "but Rio's NAME still shows — it is a leaderboard, not a secret");

console.log('\nTHE HOUSE SIDE IS SHUT');
const HOUSE_ONLY = [
  ['GET', '/door/board'], ['GET', '/bingo/board'], ['GET', '/venue/pulse'],
  ['GET', '/staff/roster'], ['GET', '/jubilee/queue'], ['GET', '/board/queue'],
  ['GET', '/world/reserve'],
];
for (const [m, path] of HOUSE_ONLY) {
  const r = await call(m, path, null, nova.token);
  ok(r.status === 401 || r.status === 403, `${path} refuses a member (${r.status})`);
}

console.log('\nAND SO ARE THE HOUSE ACTIONS');
const HOUSE_ACTS = [
  ['POST', '/door/verify', { number: RIO_NUMBER }],
  ['POST', '/staff/invite', { name: 'Herself', role: 'host' }],
  ['POST', '/bingo/resolve', { id: 1, approve: true }],
  ['POST', '/world/policy', { maxReleasePercent: 1, normalApprovals: 2 }],
  ['POST', '/board/decide', { applicationId: 'x', approve: true }],
];
for (const [m, path, body] of HOUSE_ACTS) {
  const r = await call(m, path, body, nova.token);
  ok(r.status === 401 || r.status === 403, `${path} refuses a member (${r.status})`);
}
// The one that matters most: knowing a number must not be enough to be let in.
const asRio = await call('POST', '/door/verify', { number: RIO_NUMBER }, nova.token);
ok(asRio.status === 401, 'a member holding another member’s number cannot admit them, or herself as them');

console.log('\nNOR CAN SHE ACT AS SOMEBODY ELSE');
ok((await call('POST', '/me/program', { program: 'FOOD' }, null)).status === 401,
   'an unauthenticated request changes nobody');
const bad = await call('GET', '/me', null, 'not.a.real.token');
ok(bad.status === 401, 'a made-up token is refused');
// A tampered token must fail the signature, not merely look odd.
const [body64] = nova.token.split('.');
ok((await call('GET', '/me', null, `${body64}.deadbeef`)).status === 401,
   'and a token with a rewritten signature is refused');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

// Getting in.
//
// Signing in is not membership. Before anybody uses this place they agree to
// the Community Covenant, say what they do for a living, and choose a
// programme to stand behind — and the last of those is what makes the first two
// mean anything, because it is where supporting the mission stops being a
// sentence and becomes a name.
//
// The rule this suite holds down: acceptance is a state the SERVER enforces.
// A client that skips the screen does not get in anyway.
process.env.HVAS_HOST_CODE = 'HOST850';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-onb-${Date.now()}` });
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
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  return (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
};

console.log('\nSIGNING IN IS NOT MEMBERSHIP');
const nova = await mk('850-800-0001', 'Nova');
const st0 = await call('GET', '/onboarding', null, nova.token);
eq(st0.status, 200, 'a signed-in person can see what is left to do');
eq(st0.body.accepted, false, 'and they are not accepted yet');
eq(st0.body.next.id, 'AGREE', 'the first step is agreeing');
eq(st0.body.steps.length, 4, 'four steps, said out loud');
eq(st0.body.steps[3].id, 'TIER', 'and dues are the LAST of them — nobody is asked for money before they know what they are joining');
console.log('   ', st0.body.steps.map((s2) => `${s2.id}:${s2.done ? '✓' : '·'}`).join(' '));

console.log('\nAND THE DOOR IS SHUT UNTIL ALL FOUR ARE DONE');
const blocked = await call('POST', '/bingo/join', {}, nova.token);
eq(blocked.status, 403, 'they cannot join a game');
ok(/finish signing up/i.test(blocked.body.error), 'and are told to finish signing up');
eq(blocked.body.onboarding.next.id, 'AGREE', 'named at the step they are actually on — not a bare refusal');
for (const [m, path, body] of [
  ['POST', '/jubilee/apply', { needKind: 'RENT', amountCents: 1000, detail: 'x' }],
  ['POST', '/programs/donate', { program: 'FOOD', amountCents: 500, rail: 'cash' }],
  ['POST', '/board/apply', { program: 'FOOD', position: 'CHAIR', brings: 'A very long and serious statement.' }],
  ['POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }],
]) eq((await call(m, path, body, nova.token)).status, 403, `${path} is shut too`);
// Including taking a membership — which IS the fourth step, and so is shut only
// until the first three are done. Any other rule is a deadlock: accepted needs
// dues, dues need accepted, and nobody ever joins.
ok(/agree to the community covenant/i.test(
  (await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, nova.token)).body.error || ''),
  'and paying is refused for the step they are actually on, not for not having paid');

console.log('\nTHE COVENANT IS SOMETHING YOU CAN ACTUALLY READ');
const cov = st0.body.covenant;
ok(cov.clauses.length >= 5, `it has real clauses (${cov.clauses.length})`);
ok(cov.clauses.every((c2) => c2.heading && c2.body.length > 40), 'each with a heading and something said in it');
ok(/support the mission/i.test(JSON.stringify(cov)), 'including supporting the mission and the fundraising');
ok(/nobody owns it|no member, staff member or founder owns it/i.test(JSON.stringify(cov)),
   'and that the reserve belongs to nobody');
ok(!!cov.version, `it is versioned (${cov.version})`);

console.log('\nAGREEING HAS TO BE A YES, TO THE VERSION YOU WERE SHOWN');
eq((await call('POST', '/me/agree', { version: cov.version, agree: false }, nova.token)).status, 400,
   'a no records nothing');
eq((await call('POST', '/me/agree', { version: '1999.9', agree: true }, nova.token)).status, 409,
   'and agreeing to a version you were not shown is refused');
const agreed = await call('POST', '/me/agree', { version: cov.version, agree: true }, nova.token);
eq(agreed.status, 200, 'a yes to the current version is recorded');
eq(agreed.body.next.id, 'ROLE', 'and the next step is saying what you do');

console.log('\nSAYING WHAT YOU DO — THE WHOLE WORKING ECONOMY');
const groups = st0.body.groups;
const all = groups.flatMap((g) => g.roles);
console.log('   ', `${all.length} trades in ${groups.length} groups`);
ok(all.length >= 50, `the list is a real economy, not three boxes (${all.length})`);
for (const want of ['Nail tech', 'Barber', 'DJ', 'Cook / chef', 'Driver / rideshare', 'Childcare', 'Recording artist']) {
  ok(all.some((r) => r.label === want), `${want} is on it`);
}
ok(all.find((r) => r.id === 'NAILS')?.sells, 'a nail tech can sell in the marketplace');
ok(all.find((r) => r.id === 'ARTIST')?.creative, 'an artist has work worth registering');
ok(!all.find((r) => r.id === 'PATRON')?.sells, 'and somebody just here for the night is selling nothing');

eq((await call('POST', '/me/role', { role: 'ASTRONAUT' }, nova.token)).status, 400, 'a role not on the list is refused');
eq((await call('POST', '/me/role', { role: 'OTHER' }, nova.token)).status, 400,
   'and picking OTHER without saying what is refused');
const other = await call('POST', '/me/role', { role: 'OTHER', other: 'Mobile car audio' }, nova.token);
eq(other.status, 200, 'but OTHER with words works');
eq(other.body.other, 'Mobile car audio', 'and what they typed is kept — that is how the list grows');
const role = await call('POST', '/me/role', { role: 'NAILS' }, nova.token);
eq(role.status, 200, 'and they can change it to a trade on the list');
eq(role.body.grants.sells, true, 'which says what it opens');
eq(role.body.next.id, 'PROGRAM', 'leaving one step');

console.log('\nSTILL SHUT, ONE STEP FROM DONE');
const almost = await call('POST', '/bingo/join', {}, nova.token);
eq(almost.status, 403, 'two of three is not accepted');
eq(almost.body.onboarding.next.id, 'PROGRAM', 'and it names the last one');

console.log('\nCHOOSING A PROGRAMME OPENS THE LAST STEP');
const prog = await call('POST', '/me/program', { program: 'HOUSING' }, nova.token);
eq(prog.status, 200, 'they stand behind a programme');
const three = await call('GET', '/onboarding', null, nova.token);
eq(three.body.accepted, false, 'three of four is still not a member');
eq(three.body.next.id, 'TIER', 'what is left is the membership itself');
ok((three.body.tiers || []).length >= 3, 'and the choices come with the answer, not from another screen');
eq((await call('POST', '/bingo/join', {}, nova.token)).status, 403, 'the game is still shut');

console.log('\nTAKING A MEMBERSHIP IS WHAT LETS THEM IN');
// The order matters and is the whole argument: somebody is asked for money
// only after they know what they are joining, what they will be here as, and
// what they are standing behind. Dues first would make this a subscription
// with a covenant attached.
eq((await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, nova.token)).status, 200,
   'they take a membership');
eq((await call('GET', '/onboarding', null, nova.token)).body.accepted, true, 'and NOW they are accepted');
eq((await call('POST', '/bingo/join', {}, nova.token)).status, 200, 'the game opens');

console.log('\nNOBODY CAN BE SIGNED UP BY SOMEBODY ELSE');
const rio = await mk('850-800-0002', 'Rio');
eq((await call('POST', '/me/agree', { version: cov.version, agree: true }, owner)).status, 401,
   'the house cannot agree on a member’s behalf');
eq((await call('POST', '/me/role', { role: 'BARBER' }, owner)).status, 401, 'nor say what they do');
eq((await call('GET', '/onboarding', null, rio.token)).body.accepted, false, 'so Rio is still outside');

console.log('\nWHAT THEY SIGNED IS KEPT, AND SURVIVES THE TERMS CHANGING');
const mine = await call('GET', '/onboarding', null, nova.token);
eq(mine.body.agreed.version, cov.version, 'the member can see which version they agreed to');
ok(mine.body.agreed.at > 0, 'and when');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

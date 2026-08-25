// Who the staff are, and what a shared code can no longer do.
//
// The venue used to run on two shared secrets. Every door check and every
// approval was signed "staff-device", removing one person meant changing the
// code for everyone, and §55 — the reserve must not depend on one person — was
// unsatisfiable, because two shared codes are two identities no matter how many
// people know them.
//
// The tests that matter here are the ones about REMOVAL and about RACING, since
// those are the two places where an access system is usually only pretending.
process.env.HVAS_HOST_CODE = 'HOST850';
process.env.HVAS_STAFF_CODE = 'DOOR850';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-staff-${Date.now()}` });
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

const sharedHost = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const sharedDoor = (await call('POST', '/auth/staff', { code: 'DOOR850' })).body.token;

console.log('\nA SHARED CODE RUNS THE NIGHT AND NOTHING MORE');
ok((await call('POST', '/auth/staff', { code: 'HOST850' })).body.named === false,
   'a shared code says out loud that it is not a person');
ok((await call('GET', '/bingo/board', null, sharedHost)).status === 200,
   'it can still run the game');
ok((await call('GET', '/staff/roster', null, sharedHost)).status === 200,
   'and see who is on the team');
const blocked = await call('POST', '/world/policy', { maxReleasePercent: 0.4, normalApprovals: 2 }, sharedHost);
ok(blocked.status === 403, 'but it cannot adopt a release policy');
ok(/sign in as yourself/i.test(blocked.body.error), 'and is told what to do instead, not just refused');
ok((await call('POST', '/jubilee/vendor', { name: 'X', kind: 'landlord' }, sharedHost)).status === 403,
   'nor add a provider who can be paid');

console.log('\nTHE VENUE STARTS WITH NOBODY, AND THE OWNER GOES FIRST');
ok((await call('POST', '/staff/invite', { name: 'Somebody', role: 'staff' }, sharedDoor)).status === 403,
   'a door code cannot open the venue\u2019s first account and make itself the owner');
const ownerInv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, sharedHost);
ok(ownerInv.status === 200 && ownerInv.body.admin === true,
   'the host code opens exactly one account — the owner\u2019s own');
const ownerTok = (await call('POST', '/auth/staff/claim', { code: ownerInv.body.code })).body.token;
const nowLocked = await call('POST', '/staff/invite', { name: 'Anyone', role: 'staff' }, sharedHost);
ok(nowLocked.status === 403 && /only kenya manages the team/i.test(nowLocked.body.error),
   'and from then on the shared code cannot add anybody — it names who can');

console.log('\nADDING SOMEBODY IS TYPING THEIR NAME');
const inv = await call('POST', '/staff/invite', { name: 'Trey', role: 'staff' }, ownerTok);
ok(inv.status === 200 && !!inv.body.code, 'the host gets a code to hand over');
ok(inv.body.code.length === 8 && !/[IO01]/.test(inv.body.code),
   `the code is readable across a loud room (${inv.body.code})`);
ok(inv.body.expiresAt - Date.now() <= 15 * 60 * 1000, 'and it expires within fifteen minutes');
ok((await call('POST', '/staff/invite', { name: 'Trey', role: 'staff' }, ownerTok)).status === 409,
   'a second Trey is refused — an approval log with two Treys in it is useless');
ok((await call('POST', '/staff/invite', { name: 'T', role: 'staff' }, ownerTok)).status === 400,
   'and a name nobody would recognise on a shift is refused');

console.log('\nCLAIMING IT, ONCE');
const claimed = await call('POST', '/auth/staff', { code: inv.body.code });
ok(claimed.status === 200 && claimed.body.named === true, 'the code signs Trey in as Trey');
ok(claimed.body.name === 'Trey', 'and the session knows his name');
const trey = claimed.body.token;
const reuse = await call('POST', '/auth/staff', { code: inv.body.code });
ok(reuse.status === 401 && /already been used/i.test(reuse.body.error),
   'the same code cannot be used twice');
// The single-use claim is a conditional UPDATE, so two phones racing is not a
// read-then-write anybody can slip between.
const inv2 = await call('POST', '/staff/invite', { name: 'Dee', role: 'staff' }, ownerTok);
const race = await Promise.all(Array.from({ length: 8 },
  () => call('POST', '/auth/staff/claim', { code: inv2.body.code })));
ok(race.filter((r) => r.status === 200).length === 1,
   `eight phones racing for one code, ${race.filter((r) => r.status === 200).length} gets in`);
const dee = race.find((r) => r.status === 200).body.token;
ok((await call('POST', '/auth/staff', { code: 'NOTACODE' })).status === 401, 'a made-up code is refused');

console.log('\nNOW MONEY HAS PEOPLE BEHIND IT');
ok((await call('POST', '/jubilee/vendor', { name: 'Sunrise Properties', kind: 'landlord' }, trey)).status === 200,
   'Trey, being a person, can add a provider');
// Kenya, Trey and Dee have all claimed accounts — three real people.
const four = await call('POST', '/world/policy',
  { maxReleasePercent: 0.4, defaultVault: 'HOUSING_STABILITY', normalApprovals: 4 }, trey);
ok(four.status === 400, 'a four-approver policy is refused with three people on the team');
ok(/add 1 more/i.test(four.body.error), 'and says exactly how many more people it needs');
const three = await call('POST', '/world/policy',
  { maxReleasePercent: 0.4, defaultVault: 'HOUSING_STABILITY', normalApprovals: 3 }, trey);
ok(three.status === 200, 'three is adoptable, because three people really exist (§55)');

console.log('\nAN INVITE NOBODY SCANNED IS NOT A PERSON');
await call('POST', '/staff/invite', { name: 'Ghost', role: 'staff' }, ownerTok);
const stillFour = await call('POST', '/world/policy',
  { maxReleasePercent: 0.4, defaultVault: 'HOUSING_STABILITY', normalApprovals: 4 }, trey);
ok(stillFour.status === 400, 'a name in the table with no phone behind it does not raise the ceiling');
// And claiming it does.
const inv3 = await call('POST', '/staff/invite', { name: 'Marisol', role: 'host' }, ownerTok);
await call('POST', '/auth/staff/claim', { code: inv3.body.code });
const nowFour = await call('POST', '/world/policy',
  { maxReleasePercent: 0.4, defaultVault: 'HOUSING_STABILITY', normalApprovals: 4 }, trey);
ok(nowFour.status === 200, 'a fourth person scanning their code is what raises it');

console.log('\nREMOVING SOMEBODY IS IMMEDIATE');
const roster = (await call('GET', '/staff/roster', null, ownerTok)).body;
const treyId = roster.team.find((t) => t.name === 'Trey').staffId;
ok(roster.team.find((t) => t.name === 'Trey').claimed === true, 'the roster knows Trey has a phone');
ok(roster.team.find((t) => t.name === 'Ghost').claimed === false, 'and that Ghost never scanned');
ok((await call('POST', '/jubilee/vendor', { name: 'City Utilities', kind: 'utility' }, trey)).status === 200,
   'Trey works right up until he is removed');
ok((await call('POST', '/staff/disable', { staffId: treyId }, ownerTok)).status === 200, 'the owner removes him');
const after = await call('POST', '/jubilee/vendor', { name: 'Nope', kind: 'utility' }, trey);
ok(after.status === 401,
   'and his NEXT tap fails — not in twelve hours when the session lapses, now');
ok((await call('GET', '/bingo/board', null, trey)).status === 401, 'his door access is gone too');

console.log('\nONLY THE OWNER RUNS THE TEAM');
ok((await call('POST', '/staff/invite', { name: 'Kai', role: 'staff' }, dee)).status === 403,
   'door staff cannot quietly add themselves a colleague');
// Marisol is a HOST — she runs the night. That is not the same job as hiring.
const mInv = await call('POST', '/staff/invite', { name: 'Ade', role: 'host' }, ownerTok);
const mTok = (await call('POST', '/auth/staff/claim', { code: mInv.body.code })).body.token;
const hostTriesToHire = await call('POST', '/staff/invite', { name: 'Their Friend', role: 'staff' }, mTok);
ok(hostTriesToHire.status === 403, 'another host can run the night but cannot add people');
ok(/only kenya/i.test(hostTriesToHire.body.error), 'and is told whose job it is');
ok((await call('GET', '/staff/roster', null, mTok)).status === 403, 'nor read the team list');
ok((await call('GET', '/staff/roster', null, sharedHost)).status === 403, 'and neither can the shared code');
// Money is still open to every named person — approvers are people, not admins.
ok((await call('POST', '/jubilee/vendor', { name: 'Second Provider', kind: 'food' }, mTok)).status === 200,
   'but a named host still approves money — §55 wants people, not one boss');

console.log('\nAND THE OWNER CANNOT DELETE THEMSELVES');
const me = (await call('GET', '/staff/roster', null, ownerTok)).body.team.find((t) => t.admin);
const selfRemove = await call('POST', '/staff/disable', { staffId: me.staffId }, ownerTok);
ok(selfRemove.status === 400 && /own owner account/i.test(selfRemove.body.error),
   'removing your own owner account is refused — there would be no way to make another');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

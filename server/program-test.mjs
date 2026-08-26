// Belonging to a programme, giving to one, and sitting on its board.
//
// The correction this file exists to hold in place: a member does NOT pay into
// a programme. Playing bingo is not a donation, and an entry fee routed by
// affiliation would quietly turn a game entry into a contribution nobody chose
// to make. Belonging is an affiliation. There are exactly two ways a member
// acts on a programme, and both are their own decision:
//
//   DONATE — a voluntary amount, confirmed by somebody else.
//   APPLY TO THE BOARD — for a named seat, saying what they bring.
//
process.env.HVAS_HOST_CODE = 'HOST850';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-prog-${Date.now()}` });
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

console.log('\nTHE CHOICES ARE VISIBLE BEFORE YOU CHOOSE');
const nova = await mk('850-940-0001', 'Nova');
const list = await call('GET', '/programs', null, nova.token);
eq(list.status, 200, 'a member who has joined nothing can still see the programmes');
eq(list.body.programs.length, 6, 'all six are offered');
eq(list.body.mine, null, 'and they are in none of them yet');
ok(list.body.programs.every((p) => p.label && p.vault), 'each has a name a person would recognise and a vault');
ok(list.body.programs.every((p) => p.members === 0), 'nobody has joined anything yet');
console.log('   ', list.body.programs.map((p) => p.id).join(', '));

console.log('\nJOINING ONE');
const join = await call('POST', '/me/program', { program: 'HOUSING' }, nova.token);
eq(join.status, 200, 'a member joins a programme themselves');
eq(join.body.label, 'Housing stability', 'and is told what they joined, in words');
eq((await call('GET', '/me', null, nova.token)).body.program, 'HOUSING', 'their record carries it');
eq((await call('GET', '/programs', null, nova.token)).body.mine, 'HOUSING', 'and the list knows which is theirs');
const after = (await call('GET', '/programs', null, nova.token)).body.programs.find((p) => p.id === 'HOUSING');
eq(after.members, 1, 'the programme counts them');

console.log('\nAND ONLY A REAL ONE');
const bad = await call('POST', '/me/program', { program: 'CRYPTO_MOONSHOT' }, nova.token);
eq(bad.status, 400, 'an invented programme is refused');
ok(Array.isArray(bad.body.programs) && bad.body.programs.length === 6,
   'and the refusal says what the real ones are');
eq((await call('GET', '/me', null, nova.token)).body.program, 'HOUSING',
   'a refused change leaves them where they were');

console.log('\nNOBODY ELSE PICKS FOR THEM');
eq((await call('POST', '/me/program', { program: 'FOOD' }, owner)).status, 401,
   'the house cannot assign a member to a programme');
eq((await call('POST', '/me/program', { program: 'FOOD' }, null)).status, 401, 'and neither can nobody');

console.log('\nMOVING IS ALLOWED, AND REMEMBERED');
const move = await call('POST', '/me/program', { program: 'FOOD' }, nova.token);
eq(move.body.previous, 'HOUSING', 'switching says where they came from');
const roster = (await call('GET', '/programs', null, nova.token)).body.programs;
eq(roster.find((p) => p.id === 'HOUSING').members, 0, 'the old programme lets them go');
eq(roster.find((p) => p.id === 'FOOD').members, 1, 'the new one counts them');
eq((await call('POST', '/me/program', { program: 'FOOD' }, nova.token)).body.unchanged, true,
   'joining the one you are already in is not a move');

console.log('\nPLAYING IS NOT DONATING');
// The correction. An entry fee is the venue's, and belongs to the venue's own
// reserve vault — not to whichever programme the payer happens to be in.
await call('POST', '/bingo/mode', { mode: 'cash' }, owner);
await call('POST', '/bingo/split', { housePercent: 1, worldPercent: 1 }, owner);
const rio = await mk('850-940-0002', 'Rio');
await call('POST', '/me/program', { program: 'YOUTH' }, rio.token);
for (const m of [nova, rio]) {
  await call('POST', '/bingo/join', {}, m.token);
  const cl = await call('POST', '/bingo/entry/claim', { rail: 'cash' }, m.token);
  await call('POST', '/bingo/entry/resolve', { id: cl.body.id, confirm: true }, owner);
}
const vaults = (await call('GET', '/world/reserve', null, owner)).body.byVault;
console.log('   [vaults]', JSON.stringify(vaults));
ok((vaults.CORE_RESILIENCE || 0) > 0, "entry money goes to the venue's reserve");
ok(!(vaults.FOOD_AND_WATER > 0), "and NOT into Nova's programme — she did not donate, she played bingo");
ok(!(vaults.YOUTH_AND_EDUCATION > 0), "nor into Rio's");
const progs = (await call('GET', '/programs', null, nova.token)).body.programs;
ok(progs.every((p) => p.donatedCents === 0), 'no programme claims a donation nobody made');

console.log('\nDONATING IS A CHOICE, AND SOMEBODY ELSE CONFIRMS IT');
const d = await call('POST', '/programs/donate', { program: 'FOOD', amountCents: 2500, rail: 'cash', note: 'For the pantry run' }, nova.token);
eq(d.status, 200, 'a member can give to a cause');
eq(d.body.status, 'PLEDGED', 'and it starts pledged, not received');
eq((await call('GET', '/programs', null, nova.token)).body.programs.find((p) => p.id === 'FOOD').donatedCents, 0,
   'a pledge is not money — the programme total does not move yet');
eq((await call('POST', '/programs/donate', { program: 'FOOD', amountCents: 0, rail: 'cash' }, nova.token)).status, 400,
   'giving nothing is refused');
eq((await call('POST', '/programs/donate', { program: 'FOOD', amountCents: 500, rail: 'crypto' }, nova.token)).status, 400,
   'and so is a way of paying the venue does not take');
const selfSettle = await call('POST', '/programs/donation/settle', { donationId: d.body.donationId, received: true }, nova.token);
ok(selfSettle.status === 401 || selfSettle.status === 403, 'a member cannot confirm their own donation');
const settled = await call('POST', '/programs/donation/settle', { donationId: d.body.donationId, received: true }, owner);
eq(settled.status, 200, 'the house confirms the money turned up');
eq(settled.body.status, 'RECEIVED', 'and only then is it received');
const food = (await call('GET', '/programs', null, nova.token)).body.programs.find((p) => p.id === 'FOOD');
eq(food.donatedCents, 2500, 'now the programme counts it');
ok((await call('GET', '/world/reserve', null, owner)).body.byVault.FOOD_AND_WATER === 2500,
   'and it landed in that programme\u2019s vault, as a donation');
eq((await call('POST', '/programs/donation/settle', { donationId: d.body.donationId, received: true }, owner)).status, 409,
   'the same donation cannot be banked twice');

console.log('\nEVERY PROGRAMME HAS THE SAME FIVE SEATS');
const board = await call('GET', '/board', null, nova.token);
eq(board.body.positions.length, 5, 'five positions');
ok(board.body.positions.every((p) => p.duty), 'each says what the job actually is');
console.log('   ', board.body.positions.map((p) => p.label).join(', '));
ok(board.body.programs.every((p) => p.openSeats === 5), 'and every seat starts open');

console.log('\nAPPLYING MEANS SAYING WHAT YOU BRING');
const thin = await call('POST', '/board/apply', { program: 'FOOD', position: 'TREASURER', brings: 'i can help' }, nova.token);
eq(thin.status, 400, 'an application with nothing in it is refused');
ok(/what you bring/i.test(thin.body.error), 'and says what is missing');
const apply = await call('POST', '/board/apply', {
  program: 'FOOD', position: 'TREASURER',
  brings: 'I keep the books for two churches on Tennessee Street and I can reconcile a pantry account monthly.',
}, nova.token);
eq(apply.status, 200, 'a real application goes through');
eq((await call('GET', '/board', null, nova.token)).body.openApplication.position, 'TREASURER',
   'and the member can see it waiting');
eq((await call('POST', '/board/apply', { program: 'YOUTH', position: 'CHAIR', brings: 'I ran a youth programme for six years at the community centre.' }, nova.token)).status, 409,
   'one application at a time');

console.log('\nTHE HOUSE DECIDES, BY NAME');
eq((await call('POST', '/board/decide', { applicationId: apply.body.applicationId, approve: true }, nova.token)).status, 401,
   'a member cannot seat themselves');
const noReason = await call('POST', '/board/decide', { applicationId: apply.body.applicationId, approve: false }, owner);
eq(noReason.status, 400, 'declining without a reason is refused');
const yes = await call('POST', '/board/decide', { applicationId: apply.body.applicationId, approve: true, note: 'References checked.' }, owner);
eq(yes.status, 200, 'approving seats them');
eq(yes.body.seatedBy, 'Kenya', 'and the seat carries who seated them');
const seated = (await call('GET', '/programs', null, nova.token)).body.programs.find((p) => p.id === 'FOOD');
eq(seated.board.find((b) => b.id === 'TREASURER').heldBy, 'Nova', 'the seat now shows who holds it');
eq(seated.openSeats, 4, 'and one fewer seat is open');
eq((await call('GET', '/board', null, nova.token)).body.seats[0].positionLabel, 'Treasurer',
   'the member can see what they hold');

console.log('\nA HELD SEAT IS HELD');
const clash = await call('POST', '/board/apply', {
  program: 'FOOD', position: 'TREASURER',
  brings: 'I also do bookkeeping and would like to take this on for the pantry.',
}, rio.token);
eq(clash.status, 409, 'somebody else cannot apply for a seat already held');
ok(/Nova/.test(clash.body.error), 'and is told who has it');
eq((await call('POST', '/board/apply', {
  program: 'FOOD', position: 'OUTREACH',
  brings: 'I drive the FAMU shuttle and know every student who is skipping meals.',
}, rio.token)).status, 200, 'but the other seats are still open to them');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

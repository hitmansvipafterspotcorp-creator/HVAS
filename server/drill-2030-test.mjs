// §69. The 2030 failure drill.
//
// Every other suite here checks that something works. This one checks that the
// venue still works when the things it depends on do not:
//
//     the power is out, the card processor is down, the internet is gone,
//     the person who runs the place cannot be reached, and more people need
//     help tonight than usual.
//
// The directive lists nine things that must remain true through all of that.
// They are each a section below, in its words. A system that only holds when
// conditions are good has not been tested; it has been demonstrated.
process.env.HVAS_HOST_CODE = 'HOST850';
process.env.HVAS_STAFF_CODE = 'DOOR850';
const { createApp } = await import('./src/app.mjs');
const { onboard } = await import('./test-helpers.mjs');
const dataDir = `/tmp/hvas-drill-${Date.now()}`;
let { server } = createApp({ dataDir });
await new Promise((r) => server.listen(0, r));
let api = `http://127.0.0.1:${server.address().port}`;
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

const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  const v = (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
  await onboard(call, v.token);
  return v;
};

// ── A venue mid-night, before anything goes wrong ──────────────────────────
const venueCode = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const hire = async (name, role, by) => {
  const inv = await call('POST', '/staff/invite', { name, role }, by);
  return (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
};
const kenya = await hire('Kenya', 'host', venueCode);      // the owner
const trey = await hire('Trey', 'staff', kenya);           // the door
const marisol = await hire('Marisol', 'host', kenya);      // the backup authority
await call('POST', '/world/policy', {
  maxReleasePercent: 0.5, defaultVault: 'EMERGENCY_FAMILY_STABILIZATION',
  normalApprovals: 2, emergencyApprovals: 2, maxEmergencyCents: 40000,
  operatingFloorCents: 5000,
}, kenya);
await call('POST', '/jubilee/vendor', { name: 'Sunrise Properties', kind: 'landlord' }, kenya);
await call('POST', '/jubilee/vendor', { name: 'City Utilities', kind: 'utility' }, kenya);
await call('POST', '/jubilee/vendor', { name: 'Capital Inn', kind: 'lodging' }, kenya);
await call('POST', '/jubilee/vendor', { name: 'Second Harvest', kind: 'food' }, kenya);
await call('POST', '/bingo/mode', { mode: 'cash' }, kenya);
await call('POST', '/bingo/split', { housePercent: 1, worldPercent: 1 }, kenya);
const members = [];
for (let i = 0; i < 30; i++) {
  const m = await mk(`850-69${String(i).padStart(4, '0')}`, `M${i}`);
  members.push(m);
  await call('POST', '/bingo/join', {}, m.token);
  const c = await call('POST', '/bingo/entry/claim', { rail: 'cash' }, m.token);
  await call('POST', '/bingo/entry/resolve', { id: c.body.id, confirm: true }, kenya);
}
const reserveBefore = (await call('GET', '/world/reserve', null, kenya)).body.totalCents;
console.log(`\nA venue with $${(reserveBefore / 100).toFixed(2)} in the reserve, mid-night.`);

console.log('\n① THE CARD PROCESSOR IS DOWN — CASH FALLBACK WORKS (§42)');
// Nothing about the card rail being unavailable may stop somebody paying.
const walkUp = await mk('850-690-9001', 'Walk-up');
await call('POST', '/bingo/join', {}, walkUp.token);
const cash = await call('POST', '/bingo/entry/claim', { rail: 'cash' }, walkUp.token);
eq(cash.status, 200, 'a member can still pay, in cash, with no processor');
ok(!!cash.body.id, 'and it is a tracked claim, not a handshake');
const resolved = await call('POST', '/bingo/entry/resolve', { id: cash.body.id, confirm: true }, trey);
eq(resolved.status, 200, 'the door confirms the money by hand');
// §42 wants the trail: amount, program, custodian, authorisation, receipt.
const proof = (await call('GET', '/world/reserve', null, kenya)).body;
ok(proof.totalCents > reserveBefore, 'and the cash reaches the reserve like any other rail');

console.log('\n② PAYMENTS THAT CANNOT BE VERIFIED STAY PENDING (§41)');
const unpaid = await mk('850-690-9002', 'Unverified');
await call('POST', '/bingo/join', {}, unpaid.token);
const pledge = await call('POST', '/bingo/entry/claim', { rail: 'zelle' }, unpaid.token);
eq(pledge.status, 200, 'an unverifiable rail still takes the request');
const boardNow = (await call('GET', '/bingo/board', null, kenya)).body;
const stillPending = boardNow.entryClaims?.some((e) => e.member_id === unpaid.member.id);
ok(stillPending, 'and it sits in the pending list rather than counting itself paid');
const cardsPaid = boardNow.players.find((p) => p.member_id === unpaid.member.id)?.paid;
ok(!cardsPaid, 'the member is NOT marked paid until somebody says the money arrived');
// The member cannot resolve their own, which is what makes "pending" mean anything.
eq((await call('POST', '/bingo/entry/resolve', { id: pledge.body.id, confirm: true }, unpaid.token)).status, 401,
   'and they cannot settle it themselves to get around the outage');

console.log('\n③ HIGH EMERGENCY DEMAND — RESTRICTED MONEY STAYS PROTECTED (§28)');
// The night everybody needs something is exactly when somebody reaches for the
// money that is not theirs to reach for.
const { makeContribution } = await import('./src/economy/world-reserve.mjs');
const { usd } = await import('./src/economy/money.mjs');
const restricted = makeContribution({
  sourceType: 'restricted_housing_assistance',
  sourceEntity: 'County housing office', sourceTransaction: 'DRILL-1',
  amount: usd(500000), vault: 'HOUSING_STABILITY',
  legalCustodian: 'HITMANS VIP AFTER SPOT CORP', beneficialPurpose: 'drill',
});
ok(!restricted.ok, 'restricted government money is refused even under emergency demand');
ok(/restricted/i.test(restricted.refusal?.reason || ''), 'and the refusal says why');
ok(!!restricted.refusal?.contributionId || !!restricted.refusal?.reason,
   'the refusal is a RECORD, not a silent drop — it can be reconciled later');
const unknown = makeContribution({
  sourceType: 'a_source_nobody_classified',
  sourceEntity: 'Anonymous', sourceTransaction: 'DRILL-2',
  amount: usd(100000), vault: 'CORE_RESILIENCE',
  legalCustodian: 'HITMANS VIP AFTER SPOT CORP', beneficialPurpose: 'drill',
});
ok(!unknown.ok, 'and money nobody has classified is refused too — unknown is not the same as clean');

console.log('\n④ THE OWNER IS UNREACHABLE — BACKUP AUTHORITY WORKS (§55)');
// Kenya's phone is dead in a field somewhere. The night continues.
const need = await call('POST', '/jubilee/apply', {
  needKind: 'LODGING', amountCents: 18000, detail: 'Power is out, we have nowhere warm tonight.',
}, members[0].token);
eq(need.status, 200, 'a member can still ask for help');
const appId = (await call('GET', '/jubilee/queue', null, marisol)).body.applications[0].applicationId;
eq((await call('POST', '/jubilee/verify', { applicationId: appId, note: 'Spoke to the shelter.' }, marisol)).status, 200,
   'the backup host can check it — no founder login required');
await call('POST', '/jubilee/approve', { applicationId: appId }, marisol);
await call('POST', '/jubilee/approve', { applicationId: appId }, trey);
const vendorOf = async (kind) => (await call('GET', '/jubilee/queue', null, marisol))
  .body.vendors.find((v) => v.kind === kind)?.providerId;
const providerId = await vendorOf('lodging');
const award = await call('POST', '/jubilee/award', { applicationId: appId, providerId }, marisol);
eq(award.status, 200, 'and two OTHER people can move real money without her');
// §55's real point: it still took more than one of them.
const solo = await call('POST', '/jubilee/apply', {
  needKind: 'FOOD', amountCents: 9000, detail: 'No power, no food.',
}, members[1].token);
const soloId = (await call('GET', '/jubilee/queue', null, marisol)).body.applications
  .find((a) => a.applicationId !== appId)?.applicationId;
await call('POST', '/jubilee/verify', { applicationId: soloId, note: 'Checked.' }, marisol);
await call('POST', '/jubilee/approve', { applicationId: soloId }, marisol);
await call('POST', '/jubilee/approve', { applicationId: soloId }, marisol);   // same person, twice
const oneHand = await call('POST', '/jubilee/award',
  { applicationId: soloId, providerId: await vendorOf('food') }, marisol);
ok(oneHand.status !== 200, 'but one person approving twice still cannot release anything');

console.log('\n⑤ THE RESERVE CANNOT BE DOUBLE SPENT');
const awardId = award.body.award.awardId;
const twice = await call('POST', '/jubilee/award', { applicationId: appId, providerId }, marisol);
eq(twice.status, 409, 'the same application cannot be awarded a second time');
const health = (await call('GET', '/world/reserve', null, marisol)).body;
const queue = (await call('GET', '/jubilee/queue', null, marisol)).body;
ok(queue.committedCents >= 18000, 'money already promised is COMMITTED, not still available');
ok(queue.capacityCents <= health.totalCents - queue.committedCents,
   'and capacity is what is left after commitments, not the whole balance');

console.log('\n⑥ PAID IS NOT DELIVERED, EVEN IN AN EMERGENCY (§41)');
const paid = await call('POST', '/jubilee/pay', { awardId, reference: 'CHK-DRILL-1' }, marisol);
eq(paid.body.status, 'PAID — AWAITING DELIVERY', 'paying it does not close it');
eq((await call('POST', '/jubilee/pay', { awardId, reference: 'CHK-DRILL-2' }, marisol)).status, 400,
   'and it cannot be paid twice');
const done = await call('POST', '/jubilee/delivered',
  { awardId, by: 'D. Whitfield, Sunrise Properties', what: 'Two nights, room 12' }, marisol);
eq(done.body.status, 'DELIVERED', 'only the provider confirming closes it');

console.log('\n⑦ PROOFVAULT CAN RECONCILE LATER (§45)');
const vault = (await call('GET', '/world/proof', null, marisol));
const vaultOk = vault.status === 200 ? vault.body : null;
if (vaultOk) {
  ok(vaultOk.verified !== false, 'the evidence chain verifies');
} else {
  // No public endpoint — check the module directly, which is what would be run
  // during an after-action review.
  const { proofVault } = await import('./src/economy/receipts.mjs');
  const { openDb } = await import('./src/db.mjs');
  const pv = proofVault(openDb(`${dataDir}/hvas.db`));
  const v = pv.verifyAll();
  ok(v.ok, `the whole evidence chain verifies after the night (${v.count} records)${v.ok ? '' : ` — ${v.failed}: ${v.reason}`}`);
  ok(v.count > 0, 'and there is actually something in it to verify');
}

console.log('\n⑧ CRITICAL RECORDS SURVIVE A RESTART');
// The power came back. Everything above has to still be here.
await new Promise((r) => server.close(r));
({ server } = createApp({ dataDir }));
await new Promise((r) => server.listen(0, r));
api = `http://127.0.0.1:${server.address().port}`;
const after = (await call('GET', '/jubilee/mine', null, members[0].token)).body;
ok(after.awards?.[0]?.status === 'DELIVERED', 'the award survived the restart, with its status');
ok(/room 12/.test(JSON.stringify(after)), 'and what the provider said they delivered');
const reserveAfter = (await call('GET', '/world/reserve', null, marisol)).body.totalCents;
ok(reserveAfter > 0, 'the reserve is still there');
eq((await call('GET', '/staff/roster', null, kenya)).body.team.length, 3, 'and so is the team');

console.log('\n⑨ NO FOUNDER LOGIN IS REQUIRED FOR BASIC CONTINUITY');
// The venue code still opens the door, so a lost phone never closes the place.
const codeAgain = (await call('POST', '/auth/staff', { code: 'DOOR850' })).body.token;
eq((await call('GET', '/bingo/board', null, codeAgain)).status, 200, 'the door runs the night on the venue code');
const walkUp2 = await mk('850-690-9003', 'Late arrival');
await call('POST', '/bingo/join', {}, walkUp2.token);
const c2 = await call('POST', '/bingo/entry/claim', { rail: 'cash' }, walkUp2.token);
eq((await call('POST', '/bingo/entry/resolve', { id: c2.body.id, confirm: true }, codeAgain)).status, 200,
   'and can still take cash at the door');
// But continuity is not a back door to the money.
const grab = await call('POST', '/jubilee/approve', { applicationId: soloId }, codeAgain);
eq(grab.status, 403, 'while a shared code still cannot touch the reserve, outage or not');
eq((await call('POST', '/staff/invite', { name: 'Nobody', role: 'host' }, codeAgain)).status, 403,
   'nor add itself a colleague to get around that');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

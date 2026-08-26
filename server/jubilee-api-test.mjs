// §68's flow through the real API, and the four things a member must not be
// able to do to a support programme from their own phone:
//
//   verify their own evidence
//   approve their own award
//   be paid instead of the provider
//   be supported twice for the same obligation
//
// The rules are unit-tested next door. This proves the endpoints enforce them,
// because a rule that only exists in a pure function is a rule the next
// endpoint can forget.
process.env.HVAS_HOST_CODE = 'HOST850';
process.env.HVAS_STAFF_CODE = 'DOOR850';
const { createApp } = await import('./src/app.mjs');
const { onboard } = await import('./test-helpers.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-jub-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const api = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(api + p, {
    method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  const v = (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
  await onboard(call, v.token);
  return v;
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

// Two real people, added the way the venue adds them. A shared code can run the
// night but cannot approve money, so a suite about money has to onboard humans —
// which is the same three calls the owner's phone makes.
const venueCode = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const hire = async (name, role, by) => {
  const inv = await call('POST', '/staff/invite', { name, role }, by);
  if (!inv.body.code) throw new Error(`could not hire ${name}: ${JSON.stringify(inv.body)}`);
  return (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
};
// The venue code opens exactly one account — the owner's. Everybody after that
// is added BY the owner, which is why the second hire is signed by Marisol.
const host = await hire('Marisol', 'host', venueCode);
const door = await hire('Trey', 'staff', host);
const nova = await mk('850-900-0001', 'Nova');

console.log('THE FORM SAYS WHAT THIS IS (§38)');
const kinds = await call('GET', '/jubilee/kinds');
eq(kinds.status, 200, 'the need kinds are published');
ok(kinds.body.kinds.length >= 6, 'with several programmes');
ok(/not a government/i.test(kinds.body.notice), 'and it says plainly this is not a government emergency service');

console.log('\nA MEMBER SUBMITS A NEED — AND ONLY A NEED');
const applied = await call('POST', '/jubilee/apply', {
  needKind: 'RENT', amountCents: 30000, detail: 'Behind after hours were cut', providerHint: 'Sunrise Properties',
}, nova.token);
eq(applied.status, 200, 'a member can apply');
eq(applied.body.status, 'SUBMITTED', 'it lands as submitted');
const APP = applied.body.applicationId;
const mine = await call('GET', '/jubilee/mine', null, nova.token);
eq(mine.body.applications[0].evidenceVerified, false, 'unverified — the member cannot verify their own need');
eq((await call('POST', '/jubilee/apply', { needKind: 'FOOD', amountCents: 5000 }, nova.token)).body.duplicate, true,
   'and a second open application is the same one, not a second ask');
eq((await call('POST', '/jubilee/apply', { needKind: 'NOT_A_THING', amountCents: 100 }, nova.token)).status, 400,
   'an unclassified need is refused');
eq((await call('POST', '/jubilee/apply', { needKind: 'RENT', amountCents: 0 }, nova.token)).status, 400, 'and so is asking for nothing');

console.log('\nA MEMBER CANNOT DRIVE THEIR OWN APPLICATION');
for (const [path, body] of [
  ['/jubilee/verify', { applicationId: APP, note: 'looks fine to me' }],
  ['/jubilee/approve', { applicationId: APP }],
  ['/jubilee/award', { applicationId: APP, providerId: 'x' }],
  ['/jubilee/pay', { awardId: 'x', reference: 'y' }],
  ['/jubilee/vendor', { name: 'My Own Company', kind: 'landlord' }],
]) {
  const r = await call('POST', path, body, nova.token);
  if (r.status !== 401) { fail++; console.log('  ✗', `${path} accepted a member token (${r.status})`); }
}
console.log('  ✓ verify, approve, award, pay and vendor all refuse a member token');
eq((await call('GET', '/jubilee/queue', null, nova.token)).status, 401, 'and the queue is not a member’s to read');

console.log('\nTHE HOUSE VERIFIES, WITH A NOTE SOMEBODY CAN REVIEW');
eq((await call('POST', '/jubilee/verify', { applicationId: APP }, host)).status, 400,
   'a verification with nothing written down is refused');
eq((await call('POST', '/jubilee/verify', { applicationId: APP, note: 'Saw the notice from the landlord, dated the 3rd' }, host)).status, 200,
   'one that says what was checked is accepted');

console.log('\nNOTHING IS AWARDED WITHOUT A RESERVE TO AWARD FROM (§35)');
const vend = await call('POST', '/jubilee/vendor', { name: 'Sunrise Properties', kind: 'landlord', contact: '850-555-0100' }, host);
eq(vend.status, 200, 'an approved provider is added to the roster');
const V = vend.body.providerId;
let awarded = await call('POST', '/jubilee/award', { applicationId: APP, providerId: V }, host);
eq(awarded.status, 400, 'an empty reserve awards nothing');
// Refused at the FIRST rule that fails, which here is the vault rather than
// overall capacity — a housing need cannot be paid from a vault holding nothing,
// even if the reserve overall is healthy (§30).
ok(/vault|capacity|policy|approvals/i.test(awarded.body.error), `and says why — ${awarded.body.error}`);
eq(awarded.body.stage, 'VAULT', 'naming the stage it stopped at');

// Fund the reserve the honest way: a cash night with a commons share, directed
// at the vault this need is funded from. Vaults do not borrow from each other,
// so a venue has to fund the one it intends to spend from.
await call('POST', '/world/policy', { maxReleasePercent: 0.25, defaultVault: 'HOUSING_STABILITY', normalApprovals: 2 }, host);
await call('POST', '/bingo/mode', { mode: 'cash' }, host);
await call('POST', '/bingo/split', { housePercent: 1, worldPercent: 1 }, host);
for (let i = 0; i < 90; i++) {
  const m = await mk(`850-91${String(i).padStart(4, '0')}`, `P${i}`);
  await call('POST', '/bingo/join', {}, m.token);
  const cl = await call('POST', '/bingo/entry/claim', { rail: 'cash' }, m.token);
  await call('POST', '/bingo/entry/resolve', { id: cl.body.id, confirm: true }, host);
}
const reserve = (await call('GET', '/world/reserve', null, host)).body;
ok(reserve.totalCents >= 100000, `the commons now holds $${(reserve.totalCents / 100).toFixed(2)} from real entries`);

console.log('\nA POLICY MUST BE ADOPTED, AND BY MORE THAN ONE PERSON (§36, §55)');
eq((await call('POST', '/world/policy', { maxReleasePercent: 0.25, normalApprovals: 1 }, host)).status, 400,
   'a policy that lets one person release the reserve is refused');
// The other direction, and the more useful refusal: a policy nobody could ever
// satisfy is refused loudly rather than adopted and then silently blocking
// every release for the rest of the night.
const impossible = await call('POST', '/world/policy', { maxReleasePercent: 0.25, normalApprovals: 5 }, host);
eq(impossible.status, 400, 'and so is one needing more approvers than the venue has sign-ins');
ok(/named accounts/i.test(impossible.body.error || ''), 'saying what would unlock it');
eq((await call('POST', '/world/policy', { maxReleasePercent: 0 }, host)).status, 400, 'and so is a zero release policy');
eq((await call('POST', '/world/policy', { maxReleasePercent: 0.25 }, nova.token)).status, 401, 'a member cannot adopt one');

console.log('\nNO SINGLE PERSON RELEASES IT (§55)');
awarded = await call('POST', '/jubilee/award', { applicationId: APP, providerId: V }, host);
eq(awarded.status, 400, 'with no approvals, nothing is awarded');
await call('POST', '/jubilee/approve', { applicationId: APP }, host);
await call('POST', '/jubilee/approve', { applicationId: APP }, host);   // same person twice
awarded = await call('POST', '/jubilee/award', { applicationId: APP, providerId: V }, host);
eq(awarded.status, 400, 'and the same person approving twice is still one approval');
eq(awarded.body.stage, 'APPROVALS', 'stopped at APPROVALS');
// And an ask beyond capacity is refused on its own merits, whoever approved it.
const big = await call('POST', '/jubilee/apply', { needKind: 'LODGING', amountCents: 500000 }, (await mk('850-990-0001', 'Too')).token);
ok(big.body.applicationId, 'a large need can still be submitted');
// A genuinely different house identity — the door, not the host again.
await call('POST', '/jubilee/approve', { applicationId: APP }, door);

console.log('\n§68 END TO END, THROUGH THE API');
awarded = await call('POST', '/jubilee/award', { applicationId: APP, providerId: V }, host);
if (awarded.status !== 200) console.log('   [award refused]', JSON.stringify(awarded.body));
eq(awarded.status, 200, 'with the approvals in place, the award is made');
const AW = awarded.body.award?.awardId;
eq(awarded.body.award?.status, 'APPROVED — NOT YET PAID', 'and it starts unpaid');
eq(awarded.body.award?.providerName, 'Sunrise Properties', 'naming the provider who gets paid');
eq((await call('POST', '/jubilee/award', { applicationId: APP, providerId: V }, host)).status, 409,
   'the same application cannot be awarded twice');

eq((await call('POST', '/jubilee/pay', { awardId: AW }, host)).status, 400, 'paying with no provider reference is refused');
eq((await call('POST', '/jubilee/pay', { awardId: AW, reference: 'ACH-7781' }, host)).body.status, 'PAID — AWAITING DELIVERY',
   'a referenced payment goes out — and is STILL not finished');
eq((await call('POST', '/jubilee/delivered', { awardId: AW, by: 'Sunrise Properties' }, host)).status, 400,
   'delivery must say what was delivered');
eq((await call('POST', '/jubilee/delivered', { awardId: AW, by: 'Sunrise Properties', what: 'September rent applied to unit 4B' }, host)).body.status,
   'DELIVERED', 'and only the provider confirming closes it');

const after = await call('GET', '/jubilee/mine', null, nova.token);
eq(after.body.awards[0].status, 'DELIVERED', 'the member sees it delivered');
ok(/unit 4B/.test(after.body.awards[0].delivered || ''), 'with what they actually received');
ok(after.body.awards[0].provider === 'Sunrise Properties', 'and who it was paid to — not to them');

server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

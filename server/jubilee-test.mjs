// §68's required Jubilee test, and the four ways it could quietly become
// something other than support.
//
//   §31  a database saying debt = zero is not a debt cleared
//   §32  never allocate by largest balance; catch duplicate support
//   §35  never distribute beyond available capacity
//   §55  no single person releases reserve money
//
// The flow the directive asks for, in its order:
//   member submits eligible need → program classified → evidence verified →
//   reserve capacity checked → approval → local provider selected →
//   actual payment → vendor confirms delivery → receipt → reserve updated
import { usd, usdFromDollars, formatAmount } from './src/economy/money.mjs';
import { reserveHealth } from './src/economy/world-reserve.mjs';
import { draftAllocationPolicy, adopt } from './src/economy/policy.mjs';
import { makeReceipt } from './src/economy/receipts.mjs';
import {
  PROGRAMS, NEED_KINDS, classify, assess, approvalsSatisfied,
  makeAward, markPaid, confirmDelivery,
} from './src/economy/jubilee.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

const health = reserveHealth({
  actualReserve: usdFromDollars(80000), restricted: usdFromDollars(20000),
  commitments: usdFromDollars(5000), operatingFloor: usdFromDollars(15000), emergencyMinimum: usdFromDollars(10000),
});
const policy = adopt(draftAllocationPolicy({
  transactionType: 'JUBILEE', paymentRail: 'BANK',
  maxJubileeReleasePercent: 0.2, maximumSingleProgramRelease: usdFromDollars(2500),
}), { approver: 'HVAS Board 2026-08' });
const richPolicy = { ...policy, normalApprovals: 3, emergencyApprovals: 2, maximumEmergencyRelease: usdFromDollars(800), emergencyWindowMs: 24 * 3600000 };

const landlord = { providerId: 'V1', name: 'Sunrise Properties', kind: 'landlord', approved: true };
const app = {
  applicationId: 'APP-1', memberId: 'M1', needKind: 'RENT',
  amount: usdFromDollars(900), evidenceVerified: true,
};

console.log('CLASSIFY BEFORE ANYTHING (§68)');
eq(classify('RENT').vault, 'HOUSING_STABILITY', 'rent is funded from housing stability');
eq(classify('FOOD').vault, 'FOOD_AND_WATER', 'food from food & water');
ok(!classify('A_NEW_THING').ok, 'an unclassified need cannot be funded');
ok(!classify(undefined).ok, 'and neither can a blank one');
eq(Object.keys(PROGRAMS).length, 6, 'six programs, each bound to one vault');

console.log('\nTHE GATE, IN ORDER');
ok(!assess({ application: { ...app, evidenceVerified: false }, health, policy: richPolicy, provider: landlord }).ok,
   'unverified evidence stops it at VERIFY');
eq(assess({ application: { ...app, evidenceVerified: false }, health, policy: richPolicy, provider: landlord }).stage, 'VERIFY', 'and says which stage');
eq(assess({ application: app, health, policy: richPolicy, provider: null }).stage, 'PROVIDER',
   'no provider stops it — support is paid to a provider, never handed over as cash (§31)');
eq(assess({ application: app, health, policy: richPolicy, provider: { ...landlord, kind: 'food' } }).stage, 'PROVIDER',
   'a food provider cannot be paid for rent');
eq(assess({ application: app, health, policy: richPolicy, provider: { ...landlord, approved: false } }).stage, 'PROVIDER',
   'and an unapproved vendor cannot be paid at all (§38)');
eq(assess({ application: app, health, policy: richPolicy, provider: landlord, vaultBalance: usdFromDollars(100) }).stage, 'VAULT',
   'a vault that cannot cover it does not borrow from another (§30)');
eq(assess({ application: { ...app, amount: usdFromDollars(9000) }, health, policy: richPolicy, provider: landlord }).stage, 'CAPACITY',
   'and nothing goes out beyond available capacity (§35)');

const good = assess({ application: app, health, policy: richPolicy, provider: landlord, vaultBalance: usdFromDollars(5000) });
ok(good.ok, 'a verified need, an approved provider and enough capacity passes');
eq(good.vault, 'HOUSING_STABILITY', 'to the right vault');
ok(good.reason.length > 10, 'and the YES explains itself too, not just the no');

console.log('\nDUPLICATE SUPPORT IS CAUGHT (§32)');
const prior = [{ memberId: 'M1', needKind: 'RENT', status: 'DELIVERED', at: Date.now() - 10 * 86400000 }];
eq(assess({ application: app, health, policy: richPolicy, provider: landlord, priorAwards: prior }).stage, 'DUPLICATE',
   'the same member and the same need inside 90 days is flagged');
ok(assess({ application: app, health, policy: richPolicy, provider: landlord,
  priorAwards: [{ ...prior[0], at: Date.now() - 200 * 86400000 }] }).ok, 'but an old one is not');
ok(assess({ application: { ...app, memberId: 'M2' }, health, policy: richPolicy, provider: landlord, priorAwards: prior }).ok,
   'and a different member is not');

console.log('\nNO SINGLE PERSON RELEASES RESERVE MONEY (§55, §56)');
const t = Date.now();
ok(!approvalsSatisfied({ approvals: [{ by: 'A', at: t }], amount: app.amount, policy: richPolicy }).ok, 'one approval is not enough');
ok(!approvalsSatisfied({ approvals: [{ by: 'A', at: t }, { by: 'A', at: t }, { by: 'A', at: t }], amount: app.amount, policy: richPolicy }).ok,
   'and the same person three times is one approval wearing three hats');
ok(approvalsSatisfied({ approvals: [{ by: 'A', at: t }, { by: 'B', at: t }, { by: 'C', at: t }], amount: app.amount, policy: richPolicy }).ok,
   'three different people is');
ok(approvalsSatisfied({ approvals: [{ by: 'A', at: t }, { by: 'B', at: t }], amount: usdFromDollars(500), policy: richPolicy, emergency: true }).ok,
   'the emergency path takes two');
ok(!approvalsSatisfied({ approvals: [{ by: 'A', at: t }, { by: 'B', at: t }], amount: usdFromDollars(5000), policy: richPolicy, emergency: true }).ok,
   'but is capped — faster, never unlimited (§56)');
ok(!approvalsSatisfied({ approvals: [{ by: 'A', at: t - 48 * 3600000 }, { by: 'B', at: t }], amount: usdFromDollars(500), policy: richPolicy, emergency: true }).ok,
   'and emergency authority expires rather than keeping');
ok(!approvalsSatisfied({ approvals: [{ by: 'A', at: t }, { by: 'B', at: t }], amount: usdFromDollars(500),
  policy: { ...richPolicy, maximumEmergencyRelease: null }, emergency: true }).ok,
   'with no adopted emergency limit there is no emergency path');

console.log('\n§68 END TO END — AND IT IS NOT DONE WHEN IT IS APPROVED (§31)');
const made = makeAward({ application: app, assessment: good, approvals: [{ by: 'A', at: t }, { by: 'B', at: t }, { by: 'C', at: t }], provider: landlord });
ok(made.ok, 'an award is created');
eq(made.award.status, 'APPROVED — NOT YET PAID', 'and it starts unpaid, in those words');
eq(made.award.approvals.length, 3, 'carrying who approved it');
eq(made.award.providerName, 'Sunrise Properties', 'and who will be paid');
ok(made.award.memberId === 'M1' && made.award.providerId === 'V1', 'the member is the beneficiary, the provider is the payee — not the same party');

ok(!markPaid(made.award, { by: 'treasurer' }).ok, 'a payment with no provider reference cannot be reconciled, so it is refused');
ok(!markPaid(made.award, { reference: 'ACH-99' }).ok, 'and one that names nobody is refused');
const paid = markPaid(made.award, { by: 'treasurer', reference: 'ACH-99' });
ok(paid.ok, 'a named payment with a reference goes through');
eq(paid.award.status, 'PAID — AWAITING DELIVERY', 'and it is STILL not finished');

ok(!confirmDelivery(made.award, { by: 'Sunrise Properties', what: 'rent' }).ok, 'delivery cannot be confirmed on an unpaid award');
ok(!confirmDelivery(paid.award, { by: 'Sunrise Properties' }).ok, 'and confirmation must say what was delivered');
const done = confirmDelivery(paid.award, { by: 'Sunrise Properties', what: 'September rent applied to unit 4B' });
ok(done.ok, 'the provider confirms delivery');
eq(done.award.status, 'DELIVERED', 'and only then is it delivered');
eq(done.award.deliveryConfirmedBy, 'Sunrise Properties', 'confirmed by the provider, not by the venue');

const receipt = makeReceipt({
  eventType: 'RESERVE_UPDATE', memberId: done.award.memberId, amount: done.award.amount,
  rail: 'BANK', authorizedBy: done.award.approvals.map((a) => a.by).join('+'),
  delivered: done.award.delivered, reference: done.award.awardId, settled: true,
});
eq(receipt.status, 'SETTLED', 'the receipt settles');
ok(receipt.delivered.includes('unit 4B'), 'and records what a real person actually received (§31)');
ok(receipt.authorizedBy.includes('+'), 'naming every approver, not one signature');

console.log('\nNOTHING HERE READS A BALANCE (§32)');
const src = (await import('node:fs')).readFileSync(new URL('./src/economy/jubilee.mjs', import.meta.url), 'utf8');
ok(!/balanceOf|tokenBalance|worldBalance|largestHolder/i.test(src), 'no token balance is consulted anywhere in the decision');
ok(/verified need|evidenceVerified/i.test(src), 'eligibility is verified need and program rules');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

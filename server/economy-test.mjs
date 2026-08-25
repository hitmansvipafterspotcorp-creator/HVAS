// The tests the master directive asks for by name: §65 HITK, §66 FIAT,
// §67 WORLD, §68 Jubilee — plus the rules those flows are supposed to make
// impossible to break.
//
// These are unit tests over pure modules on purpose. Every one of them is about
// money, restriction, or who is allowed to say yes, and those are exactly the
// things that must not be discovered to be wrong from a browser at a door on a
// Saturday night.
import { LAYER, RAIL, usd, usdFromDollars, hitk, add, sub, share, formatAmount, railLayer } from './src/economy/money.mjs';
import { economyFlags, economyNetwork, chainLive } from './src/economy/flags.mjs';
import { hitkPricingAvailable, quoteHitkFor, quoteExpired, RATE_SOURCE } from './src/economy/hitk-price.mjs';
import { isEligible, getRestriction, RESTRICTED_SOURCES, OPEN_SOURCES } from './src/economy/world-eligibility.mjs';
import { VAULTS, makeContribution, reserveHealth, releaseLimit, canRelease, vaultBalances, proofOf } from './src/economy/world-reserve.mjs';
import { draftAllocationPolicy, adopt, amend, retire } from './src/economy/policy.mjs';
import { makeReceipt, settleReceipt, RECEIPT_EVENTS } from './src/economy/receipts.mjs';
import {
  ITEM_CLASS, PRICING_MODE, priceItem, quotePayment, selectRail,
  createPayment, verifyPayment, settlePayment, recordApprovedCashPayment, refundPayment,
} from './src/economy/payments.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

console.log('THREE MONEY LAYERS, NEVER COLLAPSED (§3)');
eq(formatAmount(usd(1500)), '$15.00', 'fiat reads as money');
eq(formatAmount(hitk(2500)), '2,500 HITK', 'HITK reads as HITK, not as dollars');
ok(threw(() => add(usd(100), hitk(100))), 'adding dollars to HITK throws rather than guessing');
ok(threw(() => add(usd(100), hitk(100))).includes('§3'), 'and the error says which rule it is protecting');
eq(formatAmount(add(usd(1500), usd(1500))), '$30.00', 'same layer adds fine');
ok(threw(() => usd(10.5)), 'money must be whole units — no floats to disagree about a penny');
eq(share(usd(101), 0.5).units, 50, 'a share rounds DOWN, never up in the house’s favour');
eq(railLayer(RAIL.HITK), LAYER.HITK, 'HITK settles in HITK');
eq(railLayer(RAIL.CASH), LAYER.FIAT, 'and every other rail in fiat');

console.log('\nNO GUARANTEED HITK VALUE (§10)');
eq(hitkPricingAvailable(), false, 'with no adopted rate, HITK has no price');
ok(threw(() => quoteHitkFor(usd(1500))).includes('§10'), 'and quoting refuses rather than inventing 1 HITK = $1');
process.env.HITK_REFERENCE_CENTS_PER_HITK = '5';
process.env.HITK_RATE_SOURCE = RATE_SOURCE.INTERNAL_REFERENCE;
ok(hitkPricingAvailable(), 'once a rate is adopted, pricing works');
const q = quoteHitkFor(usd(1500));
eq(q.hitkAmount.units, 300, '$15.00 at 5c/HITK is 300 HITK');
ok(!!q.quoteId && !!q.rateSource && !!q.expiresAt, 'and the quote carries id, source and expiry (§9)');
ok(quoteExpired(q, q.expiresAt + 1), 'quotes expire — a price nobody refreshed is not a price');
eq(quoteHitkFor(usd(1501)).hitkAmount.units, 301, 'the member’s price rounds up, so the venue never eats the remainder');

console.log('\nFEATURE FLAGS AND NO FAKE MAINNET (§63, §64)');
const f = economyFlags();
ok(f.HITK_ENABLED && f.WORLD_ENABLED, 'both layers start enabled');
ok(!f.HITK_REAL_CHAIN && !f.WORLD_REAL_CHAIN, 'and neither chain does');
ok(!f.WORLD_AUTOMATIC_RELEASE, 'money never leaves the reserve without a human');
eq(economyNetwork(), 'LOCAL', 'the network starts LOCAL (§64)');
eq(chainLive('HITK'), false, 'so no chain is live');
process.env.ECONOMY_NETWORK = 'MAINNET';
eq(economyNetwork(), 'LOCAL', 'asking for MAINNET without the flag stays LOCAL — one variable cannot reach it');
delete process.env.ECONOMY_NETWORK;

console.log('\nRESTRICTED MONEY FIREWALL (§28)');
for (const s of RESTRICTED_SOURCES) {
  const d = isEligible({ sourceType: s });
  if (!d.eligible) pass++; else { fail++; console.log('  ✗', `${s} was allowed into the reserve`); }
}
console.log(`  ✓ all ${RESTRICTED_SOURCES.length} restricted sources are refused by default`);
for (const s of OPEN_SOURCES) if (!isEligible({ sourceType: s }).eligible) { fail++; console.log('  ✗', `${s} should be eligible`); }
console.log(`  ✓ all ${OPEN_SOURCES.length} authorized sources are eligible`);
eq(isEligible({ sourceType: 'something_nobody_classified' }).restriction, 'unknown', 'an unclassified source is unknown');
ok(!isEligible({ sourceType: 'something_nobody_classified' }).eligible, 'and unknown is also a no');
ok(!isEligible({}).eligible, 'so is a blank one');
const authed = isEligible({ sourceType: 'restricted_youth_funds', authorization: { permitsWorldReserve: true, reference: 'GRANT-2026-11 §4(c)' } });
ok(authed.eligible && authed.authorizationId === 'GRANT-2026-11 §4(c)', 'restricted money passes ONLY with a named written authorization');
ok(!isEligible({ sourceType: 'restricted_youth_funds', authorization: { permitsWorldReserve: true } }).eligible,
   'and an authorization that names no document is not an authorization');
ok(isEligible({ sourceType: 'payroll_tax' }).reason.length > 20, 'every refusal explains itself — a no nobody can review is not reviewable (Book II Covenant Test)');

console.log('\n§67 REQUIRED WORLD TEST — contribution → verified → checked → authorized → vault → proof');
const good = makeContribution({
  sourceType: 'unrestricted_donation', sourceEntity: 'A Neighbour', sourceTransaction: 'PAY-1',
  amount: usdFromDollars(500), vault: 'FOOD_AND_WATER',
  legalCustodian: 'HITMANS VIP AFTER SPOT CORP', beneficialPurpose: 'Food & water response',
});
ok(good.ok, 'an eligible, custodied, vaulted contribution is accepted');
eq(good.contribution.restrictionStatus, 'open', 'its restriction status is recorded');
ok(!!good.contribution.proofHash, 'and it carries a proof hash');
eq(proofOf({ a: 1, b: 2 }), proofOf({ b: 2, a: 1 }), 'the proof is stable regardless of key order');
const noCustodian = makeContribution({ sourceType: 'unrestricted_donation', amount: usd(100), vault: 'CORE_RESILIENCE' });
ok(!noCustodian.ok && noCustodian.refusal.reason.includes('§22'), 'no named custodian is refused — assets cannot be held by nobody');
const badVault = makeContribution({ sourceType: 'unrestricted_donation', amount: usd(100), vault: 'SOMEWHERE', legalCustodian: 'X' });
ok(!badVault.ok, 'an invented vault is refused');
const restricted = makeContribution({ sourceType: 'restricted_housing_assistance', amount: usd(100), vault: 'HOUSING_STABILITY', legalCustodian: 'X' });
ok(!restricted.ok, 'restricted money is refused even into the vault it sounds like it belongs in');
ok(!!restricted.refusal.proofHash, 'and the REFUSAL is itself a record with a proof hash');

console.log('\nVAULTS DO NOT LEAK INTO EACH OTHER (§30)');
const contribs = [good.contribution,
  makeContribution({ sourceType: 'venue_contribution', amount: usdFromDollars(200), vault: 'YOUTH_AND_EDUCATION', legalCustodian: 'HVAS', beneficialPurpose: 'Youth' }).contribution,
  restricted.refusal];
const balances = vaultBalances(contribs);
eq(balances.FOOD_AND_WATER.units, 50000, 'food & water holds exactly its own contribution');
eq(balances.YOUTH_AND_EDUCATION.units, 20000, 'youth holds its own');
eq(balances.HOUSING_STABILITY.units, 0, 'and the refused one landed nowhere');
eq(VAULTS.length, 9, 'all nine vaults exist');

console.log('\nNEVER DISTRIBUTE BEYOND CAPACITY (§35, §36)');
const health = reserveHealth({
  actualReserve: usdFromDollars(100000), restricted: usdFromDollars(30000),
  commitments: usdFromDollars(12000), operatingFloor: usdFromDollars(20000), emergencyMinimum: usdFromDollars(15000),
});
eq(health.availableJubileeCapacity.units, 2300000, 'capacity is what is left after every protected slice');
const draft = draftAllocationPolicy({ transactionType: 'BOOKING', paymentRail: 'CARD', maxJubileeReleasePercent: 0.25 });
eq(releaseLimit(health, draft).allowed.units, 0, 'a DRAFT policy releases nothing — writing it down is not adopting it');
const live = adopt(draft, { approver: 'HVAS Board 2026-08' });
eq(releaseLimit(health, live).allowed.units, 575000, 'an adopted policy releases its adopted share');
ok(!canRelease(usdFromDollars(6000), health, live).ok, 'a release over the limit is refused');
ok(canRelease(usdFromDollars(5000), health, live).ok, 'and one under it is allowed');
ok(!canRelease(usdFromDollars(-100), health, live).ok, 'a negative release is refused');
ok(!canRelease(hitk(100), health, live).ok, 'releases settle to a real provider in fiat, not in tokens (§31)');
// The bug this line exists for: an ABSENT single-award cap once meant a cap of
// ZERO, which blocked every release in a fully funded reserve while cheerfully
// reporting the capacity it was refusing to spend.
const noCap = adopt(draftAllocationPolicy({ transactionType: 'JUBILEE', paymentRail: 'BANK', maxJubileeReleasePercent: 0.25 }), { approver: 'Board' });
eq(releaseLimit(health, noCap).allowed.units, 575000, 'with no single-award cap, the percentage governs — an absent cap is not a cap of zero');
const withCap = adopt(draftAllocationPolicy({ transactionType: 'JUBILEE', paymentRail: 'BANK', maxJubileeReleasePercent: 0.25, maximumSingleProgramRelease: usdFromDollars(1000) }), { approver: 'Board' });
eq(releaseLimit(health, withCap).allowed.units, 100000, 'and a real cap still binds when it is lower');
const broke = reserveHealth({ actualReserve: usdFromDollars(1000), commitments: usdFromDollars(5000) });
ok(broke.overCommitted && broke.availableJubileeCapacity.units === 0, 'an over-committed reserve has zero capacity, not negative capacity');
ok(threw(() => adopt(draft, {})), 'a policy cannot be adopted by nobody (§47)');
const v2 = amend(live, { maxJubileeReleasePercent: 0.3 }, { approver: 'HVAS Board 2026-09' });
eq(v2.version, 2, 'a change is a new version');
eq(v2.supersedes.version, 1, 'and it records what it superseded');
ok(!retire(v2, { approver: 'HVAS Board 2026-10' }).active, 'and a policy can be retired by a named approver');

console.log('\n§66 REQUIRED FIAT TEST — member → books → card → verified → receipt → proof');
const seat = priceItem({ itemClass: ITEM_CLASS.ACCESS, fiatPrice: usdFromDollars(15) });
ok(seat.acceptedRails.includes(RAIL.CASH), 'cash is a first-class rail (§42)');
ok(selectRail(seat).length > 1, 'a member has a real choice of rails (§5 MULTI_RAIL)');
const booked = createPayment({ priced: seat, rail: RAIL.CARD, memberId: 'M1', reference: 'seat' });
ok(booked.ok, 'a member can create a payment');
eq(booked.payment.status, 'PENDING', 'which starts pending');
eq(booked.receipt.status, 'PENDING — NOT SETTLED', 'and says so in exactly those words (§41)');
ok(!settlePayment({ ...booked, verifier: { role: 'member', id: 'M1' } }).ok, 'a member cannot settle their own payment');
ok(!settlePayment({ ...booked, verifier: { role: 'chain' } }).ok, 'and a chain that is switched off cannot have confirmed anything');
const settled = settlePayment({ ...booked, verifier: { role: 'processor', id: 'paypal-webhook' }, delivered: 'entry' });
ok(settled.ok, 'a processor can');
eq(settled.receipt.status, 'SETTLED', 'the settled receipt says settled');
eq(settled.receipt.meta.settles, booked.receipt.receiptId, 'and it points at the receipt it settles rather than editing it');
ok(settled.receipt.receiptId !== booked.receipt.receiptId, 'settlement is a new record, not an edit');

console.log('\n§65 REQUIRED HITK TEST — quote → locked → completed → verified → receipt');
const hitkSeat = priceItem({ itemClass: ITEM_CLASS.SERVICE, fiatPrice: usdFromDollars(40) });
ok(hitkSeat.acceptedRails.includes(RAIL.HITK), 'HITK is offered when a rate is adopted');
const hq = quotePayment(hitkSeat, RAIL.HITK);
ok(hq.ok && hq.layer === LAYER.HITK, 'and quoting in HITK works');
eq(hq.amount.units, 800, '$40 at 5c/HITK is 800 HITK');
const hp = createPayment({ priced: hitkSeat, rail: RAIL.HITK, memberId: 'M2' });
ok(hp.ok && !!hp.payment.quoteId, 'the payment records which quote it was priced from');
eq(hp.payment.layer, LAYER.HITK, 'and stays in the HITK layer');
const hs = settlePayment({ ...hp, verifier: { role: 'staff', id: 'door' }, delivered: 'service booked' });
ok(hs.ok && hs.receipt.amountLayer === LAYER.HITK, 'the receipt keeps the layer it was paid in — never converted to dollars');

console.log('\nCASH FALLBACK AND REFUNDS (§42, §5)');
const cash = recordApprovedCashPayment({ priced: seat, memberId: 'M3', verifier: { role: 'staff', id: 'door' } });
ok(cash.ok && cash.payment.status === 'SETTLED', 'cash at the door settles like any other rail');
eq(cash.receipt.delivered, 'cash taken at the door', 'and records what was delivered');
const refunded = refundPayment({ payment: settled.payment, receipt: settled.receipt, verifier: { role: 'host', id: 'h1' }, reason: 'round cancelled' });
ok(refunded.ok && refunded.payment.status === 'REFUNDED', 'a refund is possible');
eq(refunded.receipt.meta.refunds, settled.payment.paymentId, 'and points at what it refunds');
ok(!refundPayment({ payment: settled.payment, receipt: settled.receipt, verifier: { role: 'host' } }).ok, 'a refund must say why');
ok(!refundPayment({ payment: settled.payment, receipt: settled.receipt, verifier: { role: 'member' }, reason: 'x' }).ok, 'and a member cannot refund themselves');

console.log('\n§68 JUBILEE — REAL SUPPORT, NOT A DATABASE SAYING DEBT = ZERO (§31)');
const jubilee = canRelease(usdFromDollars(1200), health, live);
ok(jubilee.ok, 'an approved need within capacity can be released');
const paid = makeReceipt({
  eventType: 'PAYMENT', memberId: 'M4', amount: usdFromDollars(1200), rail: RAIL.BANK,
  authorizedBy: 'HVAS Board 2026-08', restrictionStatus: 'open',
  delivered: 'rent paid directly to landlord — Sunrise Properties', settled: true,
});
eq(paid.status, 'SETTLED', 'and it settles');
ok(paid.delivered.includes('directly to'), 'to a real provider, which is what makes it support rather than an entry (§31)');
ok(RECEIPT_EVENTS.includes('RESERVE_UPDATE'), 'reserve movements are themselves receiptable events (§17)');
ok(threw(() => makeReceipt({ eventType: 'NONSENSE' })), 'an unknown event type is refused');
ok(threw(() => settleReceipt(paid, {})), 'settlement must name who authorized it (§44)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

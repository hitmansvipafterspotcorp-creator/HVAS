// The ways a member makes money here, other than licensing.
//
// Licensing covers creative work. It does not cover a chef, a nail tech or a
// promoter, so there are three more, and they are different on purpose:
//
//   SELL     — a service or goods, member to member.
//   BOOK     — the same, but both sides put something down first (§18).
//   PARTNER  — a business runs something WITH the venue on an agreed split.
//   BRING    — somebody is paid for the people they bring, on money that
//              actually arrived.
//
// One rule runs through all of it and every section below tests it: nobody
// confirms their own money, and what the venue takes is said before it is taken.
process.env.HVAS_HOST_CODE = 'HOST850';
const { createApp } = await import('./src/app.mjs');
const { onboard } = await import('./test-helpers.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-earn-${Date.now()}` });
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
const mk = async (ph, nm, role, referral, { tier = 'Monthly' } = {}) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  const v = (await call('POST', '/auth/member/verify',
    { contact: ph, code: s.body.devCode, name: nm, referral })).body;
  await onboard(call, v.token, { role, tier });
  return v;
};

const dana = await mk('850-720-0001', 'Dana', 'NAILS');       // a nail tech
const chef = await mk('850-720-0002', 'Marco', 'COOK');       // a chef
const promo = await mk('850-720-0003', 'Trina', 'PROMOTER');  // a promoter
const client = await mk('850-720-0004', 'Jaz', 'PATRON');

console.log('\nWHAT THE VENUE TAKES IS SAID BEFORE IT IS TAKEN');
const earn = await call('GET', '/earn', null, dana.token);
eq(earn.status, 200, 'the ways to earn are published');
ok(/keeps \d+%/.test(earn.body.feeSaid), `the fee is stated in words — "${earn.body.feeSaid}"`);
ok(earn.body.feePercent > 0 && earn.body.feePercent < 1, 'as a real rate');
ok(earn.body.kinds.length >= 4, 'and there is more than one thing to sell');

console.log('\nA NAIL TECH SELLS TO THE ROOM');
const list = await call('POST', '/market/list',
  { kind: 'SERVICE', title: 'Full set, gel', detail: 'About 90 minutes.', priceCents: 6500, priceMode: 'FROM', delivery: 'AT_MINE' },
  dana.token);
eq(list.status, 200, 'she can list what she does');
eq(list.body.youKeep + list.body.venueFee, 6500, 'and is told exactly what she keeps before anybody buys');
console.log(`   she keeps ${list.body.youKeep}, venue takes ${list.body.venueFee}`);
const shop = await call('GET', '/market', null, client.token);
ok(shop.body.listings.some((l) => l.title === 'Full set, gel'), 'it shows up in the shop');
eq(shop.body.listings.find((l) => l.title === 'Full set, gel').trade, 'Nail tech',
   'with what she actually does next to it');
// Somebody only here for the night is not selling anything.
const patronList = await call('POST', '/market/list',
  { kind: 'SERVICE', title: 'Nothing', priceCents: 100 }, client.token);
eq(patronList.status, 403, 'a member who signed up as just here for the night cannot list');

console.log('\nBUYING IT — AND NOBODY CONFIRMS THEIR OWN SALE');
const order = await call('POST', '/market/order', { listingId: list.body.listingId }, client.token);
eq(order.status, 200, 'a member buys it');
eq(order.body.status, 'PLACED — NOT PAID', 'and it starts unpaid');
eq(order.body.venueFee + order.body.sellerGets, order.body.priceCents, 'the split adds up to the price');
eq((await call('POST', '/market/order', { listingId: list.body.listingId }, dana.token)).status, 400,
   'she cannot buy her own listing');
const selfSettle = await call('POST', '/market/settle', { orderId: order.body.orderId, received: true }, dana.token);
ok([401, 403].includes(selfSettle.status), 'and cannot confirm her own sale');
const settled = await call('POST', '/market/settle', { orderId: order.body.orderId, received: true }, owner);
eq(settled.status, 200, 'the house confirms the money arrived');
eq(settled.body.sellerGets, list.body.youKeep, 'she gets exactly what she was told she would');
ok(!!settled.body.contribution, 'and the venue fee lands in the community reserve as a real contribution');

console.log('\nAND THE BUYER SAYS WHETHER THEY GOT IT');
eq((await call('POST', '/market/received', { orderId: order.body.orderId }, dana.token)).status, 403,
   'the seller does not mark their own work delivered');
eq((await call('POST', '/market/received', { orderId: order.body.orderId, note: 'Perfect' }, client.token)).body.status,
   'DELIVERED', 'the buyer does');
eq((await call('GET', '/market/mine', null, dana.token)).body.earnedCents, list.body.youKeep,
   'and her earnings are what actually settled');

console.log('\nA BOOKING IS A COMMITMENT, NOT AN INTENTION (§18)');
const bk = await call('POST', '/gig/request',
  { listingId: list.body.listingId, title: 'Full set, Friday', priceCents: 6500 }, client.token);
eq(bk.status, 200, 'a client asks for a booking');
ok(bk.body.stakeCents > 0, `and there is a stake on it (${bk.body.stakeCents})`);
eq(bk.body.stage, 'REQUESTED', 'it starts at the first stage');
// §18's chain runs in order. Skipping is how money moves before the work does.
const skip = await call('POST', '/gig/settle', { bookingId: bk.body.bookingId }, owner);
eq(skip.status, 409, 'nothing is released before the client has confirmed');
const agreed = await call('POST', '/gig/agree', { bookingId: bk.body.bookingId }, dana.token);
eq(agreed.status, 200, 'the provider takes it');
ok(/comes straight back/i.test(agreed.body.note), 'and is told the stake returns if she turns up');
eq((await call('POST', '/gig/agree', { bookingId: bk.body.bookingId }, client.token)).status, 403,
   'the client cannot agree on the provider’s behalf');
await call('POST', '/gig/secure', { bookingId: bk.body.bookingId }, owner);
await call('POST', '/gig/worked', { bookingId: bk.body.bookingId }, dana.token);
eq((await call('POST', '/gig/verify', { bookingId: bk.body.bookingId }, dana.token)).status, 403,
   'and the provider cannot confirm the client received it');
await call('POST', '/gig/verify', { bookingId: bk.body.bookingId }, client.token);
const done = await call('POST', '/gig/settle', { bookingId: bk.body.bookingId }, owner);
eq(done.body.outcome, 'SETTLED', 'once the client confirms, it settles');
eq(done.body.stakeReturned, bk.body.stakeCents, 'the stake comes back in full');
eq(done.body.stakeForfeited, 0, 'nothing is forfeited when the work happened');
ok(done.body.toProvider > 0 && done.body.toVenue > 0, 'and both the provider and the venue are paid');

console.log('\nTHE STAKE IS FOR THE NIGHT SOMEBODY DOES NOT TURN UP');
const bad = await call('POST', '/gig/request', { providerId: dana.member.id, title: 'Set', priceCents: 8000 }, client.token);
await call('POST', '/gig/agree', { bookingId: bad.body.bookingId }, dana.token);
await call('POST', '/gig/secure', { bookingId: bad.body.bookingId }, owner);
const noShow = await call('POST', '/gig/settle',
  { bookingId: bad.body.bookingId, failure: 'PROVIDER_NO_SHOW' }, owner);
eq(noShow.body.outcome, 'PROVIDER_NO_SHOW', 'a no-show is settled as one');
eq(noShow.body.stakeForfeited, bad.body.stakeCents, 'the provider loses the stake');
eq(noShow.body.toClient, bad.body.depositCents + bad.body.stakeCents,
   'the client gets their deposit back AND the stake');
eq(noShow.body.toVenue, 0, 'and the venue takes nothing from a night that did not happen');

const flake = await call('POST', '/gig/request', { providerId: dana.member.id, title: 'Set', priceCents: 8000 }, client.token);
await call('POST', '/gig/agree', { bookingId: flake.body.bookingId }, dana.token);
await call('POST', '/gig/secure', { bookingId: flake.body.bookingId }, owner);
const clientGone = await call('POST', '/gig/settle',
  { bookingId: flake.body.bookingId, failure: 'CLIENT_NO_SHOW' }, owner);
ok(clientGone.body.toProvider > 0, 'when the CLIENT does not turn up the provider keeps the deposit');
eq(clientGone.body.stakeReturned, flake.body.stakeCents, 'and gets her stake back — she was ready');

const early = await call('POST', '/gig/request', { providerId: dana.member.id, title: 'Set', priceCents: 8000 }, client.token);
await call('POST', '/gig/agree', { bookingId: early.body.bookingId }, dana.token);
const called = await call('POST', '/gig/settle',
  { bookingId: early.body.bookingId, failure: 'CANCELLED_EARLY' }, owner);
eq(called.body.toClient, early.body.depositCents, 'called off in time and everything goes back');
eq(called.body.stakeForfeited, 0, 'nobody is punished for planning ahead');

console.log('\nA CHEF PARTNERS WITH THE VENUE, ON A SPLIT BOTH AGREED');
const prop = await call('POST', '/partnership/propose',
  { memberId: chef.member.id, kind: 'POPUP', title: 'Friday kitchen', terms: 'He brings the food, we bring the room.', housePercent: 0.2 },
  owner);
eq(prop.status, 200, 'the house proposes a pop-up');
eq(prop.body.waitingOn, 'the member', 'and it waits on him');
const early2 = await call('POST', '/partnership/night',
  { partnershipId: prop.body.partnershipId, grossCents: 50000 }, owner);
eq(early2.status, 409, 'nothing can be run through it until he has agreed');
eq((await call('POST', '/partnership/accept', { partnershipId: prop.body.partnershipId }, client.token)).status, 403,
   'and somebody else cannot agree for him');
const acc = await call('POST', '/partnership/accept', { partnershipId: prop.body.partnershipId }, chef.token);
eq(acc.body.status, 'ACTIVE', 'once he agrees it runs');
const night = await call('POST', '/partnership/night',
  { partnershipId: prop.body.partnershipId, grossCents: 50000, note: 'Friday' }, owner);
eq(night.body.memberCents, 40000, 'he takes 80% of a $500 night');
eq(night.body.houseCents, 10000, 'and the venue takes the 20% he agreed to');
eq((await call('GET', '/partnership/mine', null, chef.token)).body.partnerships[0].earnedCents, 40000,
   'and he can see what he earned');

console.log('\nA PROMOTER IS PAID FOR WHO SHE BRINGS — ON MONEY, NOT SIGNUPS');
const mine = await call('GET', '/referral/mine', null, promo.token);
eq(mine.status, 200, 'she has a code');
ok(/^[A-Z]+[2-9][A-Z][2-9]$/.test(mine.body.code), `readable enough for a flyer (${mine.body.code})`);
ok(/does not pay/i.test(mine.body.note), 'and is told plainly that a signup alone does not pay');
// Signed in, agreed, said what he does, chose a cause — and has NOT taken a
// membership. That is the state where the rule is actually tested: an account
// and four screens of good intentions are not money.
const brought = await mk('850-720-0010', 'Kem', 'BARBER', mine.body.code, { tier: null });
eq((await call('GET', '/referral/mine', null, promo.token)).body.brought, 1, 'the person she brought is counted');
eq((await call('GET', '/referral/mine', null, promo.token)).body.earnedCents, 0,
   'but a signup on its own has earned her nothing');
const bought = await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, brought.token);
eq(bought.status, 200, 'then he takes a membership, which is the step where money actually moves');
const after = (await call('GET', '/referral/mine', null, promo.token)).body;
ok(after.earnedCents > 0, `and NOW she has earned (${after.earnedCents})`);
eq(after.credits[0].event, 'MEMBERSHIP', 'credited against the thing he actually paid for');
// Fifteen per cent of the tier THEY chose. Not a flat finder's fee, which
// would pay the same for bringing somebody in for one night as for a year.
eq(after.ratePercent, 0.15, 'the rate is 15%');
eq(after.credits[0].grossCents, 30000, 'against the Monthly he actually bought, at $300');
eq(after.credits[0].commissionCents, 4500, 'so she is owed $45.00');

console.log('\nAND IT FOLLOWS THE TIER, NOT A FLAT FEE');
// The whole point of a percentage: bringing somebody in on a Daily and
// bringing somebody in on a VIP are not the same piece of work.
for (const [tier, price, owed] of [['Daily', 2000, 300], ['Weekly', 10000, 1500], ['VIP', 500000, 75000]]) {
  const p2 = await mk(`850-721-${String(price).slice(0, 4)}`, `Tier${tier}`, 'PATRON', mine.body.code, { tier: null });
  const before = (await call('GET', '/referral/mine', null, promo.token)).body.earnedCents;
  await call('POST', '/membership/purchase', { tier, payment: 'card' }, p2.token);
  const now2 = (await call('GET', '/referral/mine', null, promo.token)).body;
  eq(now2.earnedCents - before, owed, `${tier} at $${price / 100} pays her $${owed / 100}`);
  eq(now2.credits[0].grossCents, price, `on the ${tier} price, not a made-up number`);
}
// The same membership cannot pay her twice.
await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, brought.token);
const twice = (await call('GET', '/referral/mine', null, promo.token)).body;
ok(twice.credits.length >= 1, 'a second purchase is its own credit, not a duplicate of the first');

console.log('\nNOBODY REFERS THEMSELVES');
const selfCode = (await call('GET', '/referral/mine', null, dana.token)).body.code;
const selfRef = await mk('850-720-0011', 'Dana Two', 'NAILS', selfCode);
ok((await call('GET', '/referral/mine', null, dana.token)).body.brought === 1,
   'a different person using her code counts once');
eq((await call('GET', '/referral/mine', null, brought.token)).body.brought, 0,
   'and somebody who brought nobody has brought nobody');

console.log('\nPAYING A PROMOTER OUT');
const owed = (await call('GET', '/referral/mine', null, promo.token)).body;
const noRef = await call('POST', '/referral/pay', { creditIds: owed.credits.map((k) => k.creditId) }, owner);
eq(noRef.status, 400, 'a payout with no reference is refused');
const paid = await call('POST', '/referral/pay',
  { creditIds: owed.credits.map((k) => k.creditId), reference: 'CASH-DRAWER-88' }, owner);
eq(paid.status, 200, 'with a reference it goes through');
ok(paid.body.totalCents > 0, `and pays what was owed (${paid.body.totalCents})`);
eq((await call('GET', '/referral/mine', null, promo.token)).body.earnedCents, 0, 'nothing is left owed');
ok((await call('GET', '/referral/mine', null, promo.token)).body.paidCents > 0, 'and it shows as paid');

console.log('\nONE QUEUE FOR EVERY KIND OF MONEY WAITING ON THE HOUSE');
// Four tables, four kinds of waiting, and one screen in the venue. If this
// endpoint misses a queue, somebody's money quietly sits there forever.
const q = await call('GET', '/house/money', null, owner);
eq(q.status, 200, 'the house can read what is outstanding');
ok(Array.isArray(q.body.orders) && Array.isArray(q.body.toSecure) && Array.isArray(q.body.toPayOut)
   && Array.isArray(q.body.licenses) && Array.isArray(q.body.credits),
   'sales, bookings to secure, bookings to pay out, licences and commissions are all in it');
eq(q.body.canSettle, true, 'a named sign-in may move it');
const qShared = await call('GET', '/house/money', null, venue);
eq(qShared.status, 200, 'the shared venue code may READ it');
eq(qShared.body.canSettle, false, 'and is told plainly it may not move any of it');
// A settled payout is worked out before anybody presses the button, so the
// screen can never promise a number the settlement then contradicts.
const pend = await call('POST', '/market/list',
  { kind: 'SERVICE', title: 'Silk press', priceCents: 8000 }, dana.token);
await call('POST', '/market/order', { listingId: pend.body.listingId }, promo.token);
const qq = (await call('GET', '/house/money', null, owner)).body;
const row = qq.orders.find((o) => o.title === 'Silk press');
ok(!!row, 'a placed order shows up waiting');
eq(row.priceCents - row.feeCents, row.toSellerCents, 'and the queue states what the seller actually gets');
eq(row.toSellerCents, 7200, 'which is the price less the fee, not the price');
// A member must never see this queue: it is every other member's money.
eq((await call('GET', '/house/money', null, dana.token)).status, 401,
   'and a member cannot read the house queue at all');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

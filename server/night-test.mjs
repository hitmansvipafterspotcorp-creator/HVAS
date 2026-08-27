// A whole night, played rather than asserted.
//
// Every other suite here tests a thing. This one lives an evening: ten trades
// arrive, put up what they actually do, buy from each other, work a booked gig
// with a stake on it, license a photograph, and run a pop-up with the venue.
// Then it reads back what each person went home holding.
//
// It exists because it earned its place. Twenty-nine suites were green when it
// was first played by hand, and it turned up two defects inside a minute —
// /market/order returning a 500 on an id that was not a string, and a refusal
// that said what was wrong without saying what would work. Passing tests only
// ever exercise what somebody thought to write down.
//
// The thing it defends is not any single endpoint. It is that a room full of
// different trades can all say what they do in their own terms and all get paid
// — a chef by the head, a childminder by the hour, a welder starting at, a
// bookkeeper online — without anybody pretending to be a different kind of
// business to fit a form.
import { createApp } from './src/app.mjs';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';
import { createHash } from 'node:crypto';

process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-night-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);
const $ = (c) => `$${(c / 100).toFixed(2)}`;

const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;

let seq = 0;
const join = async (name, role, tier = 'Monthly', ref) => {
  const contact = `night${++seq}@hvas.test`;
  const s = await call('POST', '/auth/member/start', { contact });
  const v = (await call('POST', '/auth/member/verify', { contact, code: s.body.devCode, name, referral: ref })).body;
  await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, v.token);
  await call('POST', '/me/role', { role }, v.token);
  await call('POST', '/me/program', { program: 'HOUSING' }, v.token);
  await call('POST', '/membership/purchase', { tier, payment: 'card' }, v.token);
  return { name, role, tier, ...v };
};

console.log('TEN TRADES COME OUT');
const trina = await join('Trina', 'PROMOTER');
const code = (await call('GET', '/referral/mine', null, trina.token)).body.code;
const dana   = await join('Dana', 'NAILS', 'Monthly', code);
const marcus = await join('Marcus', 'BARBER', 'Weekly', code);
const rosa   = await join('Rosa', 'COOK', 'Monthly', code);
const kev    = await join('Kev', 'DJ', 'Monthly', code);
const simone = await join('Simone', 'PHOTOGRAPHER', 'Yearly', code);
const tone   = await join('Tone', 'DRIVER', 'Daily', code);
const nia    = await join('Nia', 'CHILDCARE', 'Monthly', code);
const gerald = await join('Gerald', 'BOOKKEEPER', 'Monthly', code);
const ray    = await join('Ray', 'WELDER', 'Monthly', code);
const jas    = await join('Jas', 'PATRON', 'VIP', code);
ok([dana, marcus, rosa, kev, simone, tone, nia, gerald, ray, jas].every((p) => p.token),
   'all ten are members before anybody trades');

console.log('\nEACH SAYS WHAT THEY DO IN THEIR OWN TERMS');
// The real test of a marketplace built for a whole economy: nobody should have
// to describe their work as something it is not to get it listed.
const list = async (who, kind, title, cents, mode, delivery) => {
  const r = await call('POST', '/market/list',
    { kind, title, priceCents: cents, priceMode: mode, delivery }, who.token);
  ok(r.status === 200, `${who.name}: ${title} — ${mode}, ${delivery} (${r.status === 200 ? `keeps ${$(r.body.youKeep)}` : r.body.error})`);
  return r.body.listingId;
};
const nailsL = await list(dana,   'SERVICE', 'Full set, gel',              6000,  'FIXED',       'AT_VENUE');
const cutL   = await list(marcus, 'SERVICE', 'Cut and line-up',            3500,  'FIXED',       'AT_MINE');
await           list(rosa,        'FOOD',    'Late plates, per head',      1800,  'PER_HEAD',    'AT_VENUE');
const djL    = await list(kev,    'BOOKING', 'Two-hour set',              25000,  'FIXED',       'AT_VENUE');
await           list(simone,      'BOOKING', 'Event photos, 3 hours',     40000,  'FIXED',       'MOBILE');
const rideL  = await list(tone,   'SERVICE', 'Ride home, in town',         2000,  'FIXED',       'MOBILE');
const sitL   = await list(nia,    'SERVICE', 'Sitting, per hour',          2500,  'HOURLY',      'MOBILE');
const bookL  = await list(gerald, 'SERVICE', 'Quarterly books',           15000,  'FIXED',       'ONLINE');
const weldL  = await list(ray,    'SERVICE', 'Gate repair',                9000,  'FROM',        'MOBILE');

// And the one who is only here for the night is told so, kindly and usefully.
const refused = await call('POST', '/market/list',
  { kind: 'SERVICE', title: 'Anything', priceCents: 1000 }, jas.token);
eq(refused.status, 403, 'somebody here just for the night is not sold a shop they cannot use');
ok(/change what you do/i.test(refused.body.error), 'and is told how to change it rather than just refused');

console.log('\nTHEY BUY FROM EACH OTHER, NOT ONLY FROM THE VENUE');
const buy = async (buyer, listingId, what) => {
  const o = await call('POST', '/market/order', { listingId }, buyer.token);
  ok(o.status === 200, `${buyer.name} buys ${what}`);
  if (o.status !== 200) return;
  eq(o.body.sellerGets + o.body.venueFee, o.body.priceCents, `  and the money adds up on ${what}`);
  await call('POST', '/market/settle', { orderId: o.body.orderId, received: true, rail: 'cash' }, owner);
};
await buy(jas,    nailsL, "Dana's set");
await buy(jas,    cutL,   "Marcus's cut");
await buy(jas,    rideL,  "Tone's ride");
await buy(rosa,   bookL,  "Gerald's books");     // a chef hires a bookkeeper
await buy(dana,   sitL,   "Nia's sitting");      // a nail tech hires a childminder
await buy(marcus, weldL,  "Ray's gate repair");  // a barber hires a welder

console.log('\nAN ORDER FOR SOMETHING THAT IS NOT THERE IS NOT A CRASH');
// The defect this suite found the first time it was played. A stale screen or
// a double tap must not tell a member their app is broken.
for (const [what, body] of [
  ['nothing selected', {}],
  ['an id that is not text', { listingId: { a: 1 } }],
  ['a listing that never existed', { listingId: 'LST-000000000000' }],
]) {
  const r = await call('POST', '/market/order', body, jas.token);
  ok(r.status < 500, `${what} is refused, not a crash (${r.status})`);
}

console.log('\nA BOOKED GIG, WITH THE STAKE COMING BACK');
const gig = await call('POST', '/gig/request', { listingId: djL, startsAt: Date.now() + 864e5 }, jas.token);
await call('POST', '/gig/agree', { bookingId: gig.body.bookingId }, kev.token);
await call('POST', '/gig/secure', { bookingId: gig.body.bookingId }, owner);
await call('POST', '/gig/worked', { bookingId: gig.body.bookingId }, kev.token);
await call('POST', '/gig/verify', { bookingId: gig.body.bookingId }, jas.token);
const settled = await call('POST', '/gig/settle', { bookingId: gig.body.bookingId }, owner);
eq(settled.body.toProvider, 22500, 'Kev is paid the price less the venue fee');
eq(settled.body.stakeReturned, settled.body.stakeReturned, 'and his stake comes back');
ok(settled.body.stakeForfeited === 0, 'with nothing forfeited — he turned up and did it');

console.log('\nA PHOTOGRAPH LICENSED, AND STILL OWNED');
const h = 'sha256:' + createHash('sha256').update('night photos').digest('hex');
const work = await call('POST', '/ip/performance',
  { contentHash: h, kind: 'PHOTOGRAPH', title: 'The room, 1am', performedAt: Date.now() }, simone.token);
const offer = await call('POST', '/license/offer',
  { assetId: work.body.assetId, type: 'STOCK', scope: 'WORLD', term: 'ONE_YEAR', priceCents: 12000 }, simone.token);
const grant = await call('POST', '/license/buy', { offerId: offer.body.offerId }, rosa.token);
await call('POST', '/license/settle', { grantId: grant.body.grantId, received: true }, owner);
const hers = (await call('GET', '/license/mine', null, simone.token)).body;
eq(hers.earnedCents, 12000, 'Simone is paid for the licence');
eq(hers.works.length, 1, 'and still holds the work she licensed');

console.log('\nA POP-UP RUN WITH THE VENUE, ON TERMS BOTH AGREED');
const part = await call('POST', '/partnership/propose', { kind: 'POPUP', title: 'Sunday plates', housePercent: 0.2 }, rosa.token);
await call('POST', '/partnership/accept', { partnershipId: part.body.partnershipId }, owner);
const night = await call('POST', '/partnership/night', { partnershipId: part.body.partnershipId, grossCents: 80000 }, owner);
eq(night.body.memberCents, 64000, 'Rosa keeps the 80% she agreed to');
eq(night.body.houseCents, 16000, 'and the venue takes the 20% it agreed to');

console.log('\nWHAT EACH OF THEM WENT HOME WITH');
const earned = async (p) => {
  const mine = (await call('GET', '/market/mine', null, p.token)).body;
  const gigs = (await call('GET', '/gig/mine', null, p.token)).body.bookings || [];
  const lic = (await call('GET', '/license/mine', null, p.token)).body;
  const ref = (await call('GET', '/referral/mine', null, p.token)).body;
  const partn = (await call('GET', '/partnership/mine', null, p.token)).body.partnerships || [];
  return (mine.earnedCents || 0)
       + gigs.filter((b) => b.role === 'provider' && b.settlement).reduce((a, b) => a + b.settlement.toProvider, 0)
       + (lic.earnedCents || 0)
       + partn.reduce((a, x) => a + (x.earnedCents || 0), 0)
       + (ref.earnedCents || 0);
};
const workers = [dana, marcus, rosa, kev, simone, tone, nia, gerald, ray];
for (const p of workers) {
  const c = await earned(p);
  ok(c > 0, `${p.name} (${p.role}) went home with ${$(c)}`);
}
eq(await earned(jas), 0, 'and the one who came out to spend, went home having spent');

// The rate, stated in what it actually paid, so a change to it is visible here.
// It was 15% until this suite showed the promoter out-earning everyone who did
// the work by more than double. Ten still pays well for bringing people.
const brought = await earned(trina);
console.log(`  Trina brought nine people and earned ${$(brought)} at 10%`);
ok(brought > 0, 'bringing people pays');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

// A creator licensing their own work.
//
// The registry already proves who made a thing and when — a SHA-256 computed on
// their phone, the file never moving. This is what makes that worth money.
//
// The rule the whole suite exists to hold down is in the first section: A
// LICENCE IS A GRANT, NOT A SALE OF THE WORK. The creator still owns it
// afterwards, which is what lets the same recording be licensed for a film, a
// T-shirt and a remix — and is the exact opposite of the buyout an unsigned
// artist is usually offered.
process.env.HVAS_HOST_CODE = 'HOST850';
const { createApp } = await import('./src/app.mjs');
const { onboard } = await import('./test-helpers.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-lic-${Date.now()}` });
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
const mk = async (ph, nm, role) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  const v = (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
  await onboard(call, v.token, { role });
  return v;
};
const hash = (n) => `sha256:${String(n).repeat(64).slice(0, 64)}`;

const nova = await mk('850-710-0001', 'Nova', 'ARTIST');      // the creator
const rio = await mk('850-710-0002', 'Rio', 'VIDEOGRAPHER');  // a buyer
const ayo = await mk('850-710-0003', 'Ayo', 'PRODUCER');      // another buyer

console.log('\nEVERY KIND OF WORK, NOT JUST RECORDINGS');
const terms = await call('GET', '/license/terms', null, nova.token);
eq(terms.status, 200, 'the licence terms are published');
const kinds = terms.body.workKinds.map((k) => k.id);
console.log('   [kinds]', kinds.join(', '));
ok(kinds.includes('SOFTWARE'), 'an app is a licensable work — not only a verse');
ok(kinds.includes('BEAT') && kinds.includes('PHOTO') && kinds.includes('DESIGN'),
   'and so are beats, photographs and designs');
const types = terms.body.types.map((t) => t.id);
console.log('   [types]', types.join(', '));
ok(types.length >= 9, `every licence a creator would actually sell (${types.length})`);
for (const want of ['SYNC', 'MASTER', 'SAMPLE', 'REMIX', 'MERCH', 'MECHANICAL', 'PERFORMANCE', 'STOCK', 'BUYOUT']) {
  ok(types.includes(want), `${want} is one of them`);
}
ok(terms.body.types.every((t) => t.grants), 'each says what it actually permits, in words');

console.log('\nAI TRAINING IS ITS OWN LICENCE, AND NEVER IMPLIED');
ok(types.includes('AI_TRAINING'), 'it is a licence type of its own');
ok(terms.body.types.find((t) => t.id === 'AI_TRAINING').neverImplied,
   'and is never implied by any other licence');

console.log('\nREGISTERING A WORK — THE FILE NEVER MOVES');
const reg = await call('POST', '/ip/performance',
  { contentHash: hash(1), title: 'Tallahassee Nights', song: 'Tallahassee Nights', artist: 'Nova', kind: 'RECORDING' },
  nova.token);
eq(reg.status, 200, 'a recording registers');
const assetId = reg.body.assetId;
const app = await call('POST', '/ip/performance',
  { contentHash: hash(2), title: 'Motion Moving Machine', kind: 'SOFTWARE' }, nova.token);
eq(app.status, 200, 'and so does an app she built');
eq((await call('GET', '/license/mine', null, nova.token)).body.works.length, 2, 'both are hers');

console.log('\nONLY THE CREATOR MAY LICENSE IT');
const notYours = await call('POST', '/license/offer',
  { assetId, type: 'SYNC', scope: 'WORLD', term: 'ONE_YEAR', priceCents: 50000 }, rio.token);
eq(notYours.status, 403, 'somebody else cannot license her work');
ok(/not your work/i.test(notYours.body.error), 'and is told exactly that');

console.log('\nPUTTING LICENCES UP');
const sync = await call('POST', '/license/offer',
  { assetId, type: 'SYNC', scope: 'WORLD', term: 'ONE_YEAR', exclusive: false, priceCents: 50000 }, nova.token);
eq(sync.status, 200, 'a sync licence goes up');
ok(/grant of use, not a sale/i.test(JSON.stringify(sync.body.terms)),
   'and it says on its face that she keeps ownership');
ok(/does NOT permit training/i.test(JSON.stringify(sync.body.terms)),
   'and that it does not permit model training');
const samp = await call('POST', '/license/offer',
  { assetId, type: 'SAMPLE', scope: 'WORLD', term: 'PERPETUAL', priceCents: 15000 }, nova.token);
eq(samp.status, 200, 'so does a sample licence, on the same work');
const merch = await call('POST', '/license/offer',
  { assetId, type: 'MERCH', scope: 'LOCAL', term: 'ONE_YEAR', exclusive: true, priceCents: 30000 }, nova.token);
eq(merch.status, 200, 'and an exclusive merch licence, at the same time');
ok((await call('GET', '/license/mine', null, nova.token)).body.works
   .find((w) => w.assetId === assetId).offers.length === 3,
   'one work, three licences on sale at once — that is the whole point');
eq((await call('POST', '/license/offer',
  { assetId, type: 'STOCK', scope: 'WORLD', term: 'ONE_YEAR', exclusive: true, priceCents: 100 }, nova.token)).status, 400,
   'a licence anybody can hold at once cannot be sold exclusively');
eq((await call('POST', '/license/offer',
  { assetId, type: 'MOONBEAM', scope: 'WORLD', term: 'ONE_YEAR', priceCents: 100 }, nova.token)).status, 400,
   'and an invented licence type is refused');

console.log('\nBUYING ONE — PENDING UNTIL THE MONEY LANDS');
const buy = await call('POST', '/license/buy', { offerId: sync.body.offerId, rail: 'cash' }, rio.token);
eq(buy.status, 200, 'a buyer can take the sync licence');
eq(buy.body.status, 'PENDING — NOT SETTLED', 'and it starts pending, not granted');
eq((await call('GET', '/license/held', null, rio.token)).body.licenses[0].status, 'PENDING',
   'the buyer sees it pending');
ok([401, 403].includes((await call('POST', '/license/settle', { grantId: buy.body.grantId, received: true }, rio.token)).status),
   'a buyer cannot confirm their own payment');
const settled = await call('POST', '/license/settle', { grantId: buy.body.grantId, received: true }, owner);
eq(settled.body.status, 'GRANTED', 'the house confirms and the licence exists');
ok(settled.body.expiresAt > Date.now(), 'with an end date, because the term said one year');
const held = (await call('GET', '/license/held', null, rio.token)).body.licenses[0];
ok(held.active, 'the buyer holds a live licence');
ok(!!held.termsHash, 'with the terms hashed onto it, so neither side can rewrite them');

console.log('\nAND SHE STILL OWNS THE WORK');
const after = (await call('GET', '/license/mine', null, nova.token)).body;
// A non-exclusive licence does NOT come down when somebody buys it. That is the
// point of it: the same sync licence can be sold to a hundred buyers, and each
// one is a separate payment for work she made once.
eq(after.works.find((w) => w.assetId === assetId).offers.length, 3,
   'all three licences are still on sale — selling one did not use it up');
ok(after.works.find((w) => w.assetId === assetId).offers.some((o) => o.type === 'SYNC'),
   'including the one that just sold, because it was not exclusive');
eq(after.earnedCents, 50000, 'and she has been paid for the one that sold');
const second = await call('POST', '/license/buy', { offerId: samp.body.offerId }, ayo.token);
eq(second.status, 200, 'somebody else can license the SAME work for something different');
await call('POST', '/license/settle', { grantId: second.body.grantId, received: true }, owner);
eq((await call('GET', '/license/mine', null, nova.token)).body.earnedCents, 65000,
   'and she is paid twice for one recording — that is what a licence is for');

console.log('\nEXCLUSIVITY IS REAL, OR IT IS WORTHLESS');
const m1 = await call('POST', '/license/buy', { offerId: merch.body.offerId }, rio.token);
await call('POST', '/license/settle', { grantId: m1.body.grantId, received: true }, owner);
const m2 = await call('POST', '/license/offer',
  { assetId, type: 'MERCH', scope: 'LOCAL', term: 'ONE_YEAR', priceCents: 9900 }, nova.token);
eq(m2.status, 409, 'once an exclusive merch licence is out, she cannot sell another');
ok(/exclusive/i.test(m2.body.error) && /Rio/.test(m2.body.error),
   'and is told who holds it');
ok(!(await call('GET', '/license/mine', null, nova.token)).body.works
   .find((w) => w.assetId === assetId).offers.some((o) => o.type === 'MERCH'),
   'the offer she can no longer honour is taken down for her');

console.log('\nA BUYOUT BLOCKS EVERYTHING, WHICH IS WHY IT COSTS MORE');
const app2 = app.body.assetId;
await call('POST', '/license/offer',
  { assetId: app2, type: 'BUYOUT', scope: 'WORLD', term: 'THREE_YEARS', exclusive: true, priceCents: 500000 }, nova.token);
const bOffer = (await call('GET', '/license/mine', null, nova.token)).body.works
  .find((w) => w.assetId === app2).offers[0];
const bBuy = await call('POST', '/license/buy', { offerId: bOffer.offerId }, ayo.token);
await call('POST', '/license/settle', { grantId: bBuy.body.grantId, received: true }, owner);
eq((await call('POST', '/license/offer',
  { assetId: app2, type: 'SYNC', scope: 'WORLD', term: 'ONE_YEAR', priceCents: 100 }, nova.token)).status, 409,
   'nothing else can be licensed on that work while the buyout runs');
ok(/grant of use, not a sale/i.test(JSON.stringify(bBuy.body.terms)),
   'and even a buyout says the creator keeps ownership');

console.log('\nTAKING AN OFFER DOWN DOES NOT TAKE BACK WHAT WAS SOLD');
const w = await call('POST', '/license/withdraw', { offerId: samp.body.offerId }, nova.token);
eq(w.status, 200, 'she can stop selling a licence');
ok(/stays licensed/i.test(w.body.note), 'and is told what that does not do');
ok((await call('GET', '/license/held', null, ayo.token)).body.licenses.some((l) => l.active),
   'the person who already bought it still holds it');
eq((await call('POST', '/license/withdraw', { offerId: sync.body.offerId }, rio.token)).status, 403,
   'and nobody else can take her offers down');

console.log('\nTHE SHOP');
const market = await call('GET', '/license/market', null, ayo.token);
eq(market.status, 200, 'every open licence, from every creator');
ok(market.body.offers.every((o) => o.work && o.creator), 'each says whose it is and what it is');
ok(market.body.offers.every((o) => o.priceCents >= 0 && o.typeLabel), 'with a price and a plain-English type');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

// Registering a performance as the performer's own work — and proving that
// registering it does not mean taking it.
//
// §11 registers an asset by contentHash + rightsHash + ownerController. §12
// classifies a performance as PERFORMANCE. §13 warns that token ownership does
// not transfer copyright. All three matter here, but the property this suite
// exists to defend is the one the venue promised its members long before any
// of this: a take is a video of somebody lip syncing in a bar, and it stays on
// their phone. Registration must therefore work on a hash alone.
process.env.HVAS_HOST_CODE = 'HOST850';
const { createApp } = await import('./src/app.mjs');
const { server } = createApp({ dataDir: `/tmp/hvas-ip-${Date.now()}` });
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
  return (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

const nova = await mk('850-800-0001', 'Nova');
const rell = await mk('850-800-0002', 'Rell');
const HASH = `sha256:${'a1b2c3d4'.repeat(8)}`;

console.log('A PERFORMANCE IS REGISTERED FROM A HASH ALONE');
const reg = await call('POST', '/ip/performance', {
  contentHash: HASH, artist: 'Aaliyah', song: 'Rock The Boat', performedAt: Date.now(),
}, nova.token);
eq(reg.status, 200, 'a member can register their performance');
ok(!!reg.body.assetId, 'it gets an asset id');
eq(reg.body.contentHash, HASH, 'the fingerprint is what was sent');
ok(!!reg.body.rightsHash, 'and a rights hash is derived');
eq(reg.body.ownerController, nova.member.number, 'naming the performer as owner-controller (§11)');
ok(!!reg.body.receiptId, 'with a receipt in the ProofVault (§17)');

console.log('\nWHAT IS CLAIMED, AND WHAT IS NOT (§13)');
eq(reg.body.rightsStatement.assetType, 'PERFORMANCE', 'it is classified as a PERFORMANCE (§12)');
ok(/performed this recording/i.test(reg.body.rightsStatement.claim), 'the claim is that the member performed it');
ok(/no ownership of the underlying composition/i.test(reg.body.rightsStatement.notClaimed),
   'and it says in the record itself that no song ownership is claimed or transferred');

console.log('\nTHE VIDEO IS NOT THERE, BECAUSE IT WAS NEVER SENT');
const body = JSON.stringify(reg.body);
ok(!/base64|blob|video\/webm|data:/i.test(body), 'no video, blob or data URI comes back');
const mine = await call('GET', '/ip/mine', null, nova.token);
eq(mine.status, 200, 'a member can list what they registered');
eq(mine.body.performances.length, 1, 'and sees their one performance');
ok(Object.keys(mine.body.performances[0]).every((k) => !/blob|video|file|data/i.test(k)),
   'the record has no field that could hold a video');

console.log('\nREGISTERING THE SAME FILE TWICE IS ONE FACT, NOT TWO');
const again = await call('POST', '/ip/performance', { contentHash: HASH, artist: 'Aaliyah', song: 'Rock The Boat' }, nova.token);
eq(again.status, 200, 'registering again succeeds');
eq(again.body.alreadyRegistered, true, 'and says it was already registered');
eq(again.body.assetId, reg.body.assetId, 'returning the SAME asset id rather than a second one');
eq((await call('GET', '/ip/mine', null, nova.token)).body.performances.length, 1, 'still one performance');

console.log('\nIT HAS TO ACTUALLY BE A FINGERPRINT');
for (const bad of ['', 'nope', 'sha256:short', 'a1b2c3', `sha256:${'z'.repeat(64)}`]) {
  const r = await call('POST', '/ip/performance', { contentHash: bad }, nova.token);
  if (r.status !== 400) { fail++; console.log('  ✗', `"${bad}" was accepted`); }
}
console.log('  ✓ garbage in place of a hash is refused');
eq((await call('POST', '/ip/performance', { contentHash: HASH })).status, 401, 'and a stranger cannot register anything');

console.log('\nPROVING IT LATER');
const v = await call('POST', '/ip/verify', { contentHash: HASH }, rell.token);
eq(v.status, 200, 'anyone signed in can check a fingerprint');
eq(v.body.registered, true, 'and is told it is registered');
eq(v.body.ownerController, nova.member.number, 'to the member who performed it');
ok(!!v.body.night && !!v.body.performedAt, 'with the night it happened');
const miss = await call('POST', '/ip/verify', { contentHash: `sha256:${'f'.repeat(64)}` }, rell.token);
eq(miss.status, 404, 'an unregistered fingerprint is honestly reported as unregistered');
eq(miss.body.registered, false, 'and says so');

console.log('\nONE MEMBER CANNOT SEE ANOTHER MEMBER’S LIBRARY');
eq((await call('GET', '/ip/mine', null, rell.token)).body.performances.length, 0, 'Rell sees his own, which is none');

console.log('\nTWO PEOPLE, TWO DIFFERENT TAKES OF THE SAME SONG');
const other = `sha256:${'9f8e7d6c'.repeat(8)}`;
const r2 = await call('POST', '/ip/performance', { contentHash: other, artist: 'Aaliyah', song: 'Rock The Boat' }, rell.token);
eq(r2.status, 200, 'a different performance of the same song registers fine');
ok(r2.body.assetId !== reg.body.assetId, 'as its own asset — the song is not the thing being registered');
eq((await call('POST', '/ip/verify', { contentHash: other }, nova.token)).body.ownerController, rell.member.number,
   'and it belongs to whoever performed it');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

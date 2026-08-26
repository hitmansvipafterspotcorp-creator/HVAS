// What makes this an association rather than an app with a login.
//
// A private membership association rests on one thing being demonstrable: that
// the member affirmatively agreed to join, and that the agreement can still be
// produced afterwards, in the words they agreed to. Everything here defends
// that, plus the two rights that follow from it — to see what is held about
// you, and to leave.
//
// The failure this suite exists to make impossible: the covenant is edited, and
// every member's recorded agreement silently becomes an agreement to the new
// text. That is not a version bump, it is a forgery, and it would void the
// whole structure.
import { createApp } from './src/app.mjs';
import { COVENANT, COVENANT_VERSION, covenantAt, covenantVersions, covenantFingerprint } from './src/economy/covenant.mjs';
import { onboard } from './test-helpers.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

console.log('THE COVENANT IS A DOCUMENT, NOT A CHECKBOX');
ok(COVENANT.clauses.length >= 5, `it has real terms in it (${COVENANT.clauses.length} clauses)`);
ok(COVENANT.clauses.every((c) => c.heading && c.body && c.body.length > 40),
   'every clause says something, rather than being a heading with nothing under it');
ok(/agree/i.test(COVENANT.accept), 'and it ends with the sentence they are actually agreeing to');
eq(covenantVersions().includes(COVENANT_VERSION), true, 'the current version is in the archive');
ok(!!covenantAt(COVENANT_VERSION), 'and can be fetched by version');
eq(covenantAt('1999.1'), null, 'a version that was never published is null, not the current one');

console.log('\nTHE FINGERPRINT IS OF THE TEXT, AND ONLY THE TEXT');
const fp = covenantFingerprint(COVENANT);
ok(/^[0-9a-f]{8}$/.test(fp), `it is short enough to read down a phone (${fp})`);
eq(covenantFingerprint(COVENANT), fp, 'the same document always gives the same answer');
// Change one character of one clause and it has to be a different document.
const tampered = { ...COVENANT, clauses: COVENANT.clauses.map((c, i) =>
  i === 0 ? { ...c, body: `${c.body} ` } : c) };
ok(covenantFingerprint(tampered) !== fp, 'a single space added to a clause makes it a different document');
const reworded = { ...COVENANT, lead: `${COVENANT.lead} Extra.` };
ok(covenantFingerprint(reworded) !== fp, 'and so does a changed lead paragraph');

// This is the assertion that protects every past agreement. If somebody edits
// the published text of a version that members have already signed, this fails.
console.log('\nA PUBLISHED VERSION IS FROZEN');
eq(fp, '462aeb29',
   'covenant 2026.1 still reads exactly as it did when members signed it — if this fails, either bump the version or put the text back');

process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-pma-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;
const mk = async (ph, nm) => {
  const s = await call('POST', '/auth/member/start', { contact: ph });
  return (await call('POST', '/auth/member/verify', { contact: ph, code: s.body.devCode, name: nm })).body;
};
const simone = await mk('850-555-0201', 'Simone');
await onboard(call, simone.token, { role: 'NAILS', program: 'HOUSING' });
await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, simone.token);

console.log('\nA MEMBER CAN RE-READ WHAT THEY SIGNED');
const cov = await call('GET', '/me/covenant', null, simone.token);
eq(cov.status, 200, 'they can ask for it');
eq(cov.body.signed?.version, COVENANT_VERSION, 'it names the version they signed');
ok(cov.body.signed?.at > 0, 'and the moment they signed it');
eq(cov.body.signed?.textAvailable, true, 'the words are there, not just a version number');
eq(cov.body.signed.document.clauses.length, COVENANT.clauses.length, 'all of them');
eq(cov.body.signed.fingerprint, fp, 'with the fingerprint of what they agreed to');
eq(cov.body.outOfDate, false, 'and they are told it is still current');
// Somebody who has not signed anything is told that, rather than being shown
// the current text as though they had.
const nobody = await mk('850-555-0202', 'Rio');
eq((await call('GET', '/me/covenant', null, nobody.token)).body.signed, null,
   'somebody who has not agreed has no agreement, and is not shown one');

console.log('\nEVERYTHING THE ASSOCIATION HOLDS ABOUT THEM');
const rec = await call('GET', '/me/record', null, simone.token);
eq(rec.status, 200, 'a member can ask for their whole record');
eq(rec.body.member.name, 'Simone', 'it is theirs');
eq(rec.body.member.number, simone.member.number, 'with the number the door knows them by');
ok(!!rec.body.membership, 'their membership');
ok(rec.body.agreements.length >= 1, 'every agreement they have made, with dates');
eq(rec.body.agreements[0].version, COVENANT_VERSION, 'and which version each one was');
eq(rec.body.standing.state, 'MEMBER', 'where they stand');
ok(!!rec.body.activity, 'and what they have done here');
ok(/not kept after they are used/.test(rec.body.note), 'it says what is NOT kept, which is the part nobody would think to ask');
// The record is the member's own and nobody else's.
eq((await call('GET', '/me/record', null, venue)).status, 401, 'the house cannot pull a member record from this endpoint');
eq((await call('GET', '/me/record', null, null)).status, 401, 'and a stranger gets nothing');
// One member cannot see another's, which is the whole point of it being theirs.
const other = await call('GET', '/me/record', null, nobody.token);
ok(other.body.member?.name !== 'Simone', 'another member gets their own record, not hers');

console.log('\nAN ASSOCIATION SOMEBODY CANNOT LEAVE IS NOT AN ASSOCIATION');
eq((await call('POST', '/me/resign', {}, simone.token)).status, 400,
   'resigning by mis-tap is refused — it has to be confirmed');
const quit = await call('POST', '/me/resign', { confirm: true, reason: 'Moving out of Tallahassee.' }, simone.token);
eq(quit.status, 200, 'confirmed, it goes through');
eq(quit.body.state, 'RESIGNED', 'and they have resigned');
ok(/record stays/.test(quit.body.note), 'and are told their record is not erased, because it is not');
eq((await call('POST', '/me/resign', { confirm: true }, simone.token)).status, 409, 'twice is not a thing');

console.log('\nRESIGNING IS THE DOOR, NOT A SETTING');
const pass1 = await call('GET', '/pass/current', null, simone.token);
// The membership is suspended, so there may be no pass to fetch at all — either
// way, what must be true is that the door does not admit her.
const atDoor = pass1.body.pass
  ? await call('POST', '/door/verify', { pass: pass1.body.pass }, venue)
  : await call('POST', '/door/verify', { number: simone.member.number }, venue);
eq(atDoor.body.ok, false, 'she is not admitted');
eq(atDoor.body.status, 'resigned', 'and the door says she resigned');
ok(/not a member tonight/.test(atDoor.body.reason), 'in words that do not accuse her of anything');
ok(/rejoin/.test(atDoor.body.reason), 'and tell the door person what she can do about it');

console.log('\nLEAVING IS NOT DELETION — WHAT HAPPENED HAPPENED');
const after = await call('GET', '/me/record', null, simone.token);
eq(after.body.member.name, 'Simone', 'her record is still there');
eq(after.body.agreements.length >= 1, true, 'her agreement is still on it');
eq(after.body.standing.state, 'RESIGNED', 'and now says she resigned');
eq(after.body.standing.reason, 'Moving out of Tallahassee.', 'with the reason she gave');
ok(after.body.standingHistory.length === 1, 'as one entry in a history, not a flag');

console.log('\nAND A DOOR THAT ONLY SWINGS ONE WAY MAKES LEAVING A THREAT');
const back = await call('POST', '/me/rejoin', {}, simone.token);
eq(back.status, 200, 'she can come back');
eq(back.body.state, 'MEMBER', 'as a member');
eq(back.body.membershipRestored, true, 'and her membership had time left, so it is live again');
const rejoined = await call('GET', '/me/record', null, simone.token);
eq(rejoined.body.standing.state, 'MEMBER', 'she is a member again');
eq(rejoined.body.standingHistory.length, 2, 'and both the leaving and the return are on the record');
const pass2 = await call('GET', '/pass/current', null, simone.token);
eq((await call('POST', '/door/verify', { pass: pass2.body.pass }, venue)).body.status, 'granted',
   'the door lets her in again');
eq((await call('POST', '/me/rejoin', {}, simone.token)).status, 409, 'and rejoining twice is not a thing either');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

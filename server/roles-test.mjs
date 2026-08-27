// Every trade in the room, joining.
//
// The claim this app makes is that it serves a whole working economy and not
// just the artists: a nail tech, a barber, a cook, a welder, a childminder, a
// bookkeeper, somebody who is only here for the night. That claim is cheap to
// make in a roles list and expensive to keep, because the ways to break it are
// quiet:
//
//   a trade nobody can actually sign up as;
//   a trade that can sell but has no listing kind it fits;
//   a trade offered a marketplace it is then refused from;
//   somebody here only for the night, sold a shop they cannot use;
//   a recovery route that points at a programme that does not exist.
//
// So this joins as EVERY role and asks the same questions of each. If a trade
// is added later and any of it does not line up, this fails on that trade by
// name rather than on a total.
import { createApp } from './src/app.mjs';
import { MEMBER_ROLES, MEMBER_ROLE, rolesByGroup, roleGrants } from './src/economy/roles.mjs';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-roles-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) console.log(`  ✗ ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m} — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const inv = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: inv.body.code })).body.token;

const ALL = Object.keys(MEMBER_ROLE);
console.log(`EVERY TRADE JOINS — ${ALL.length} of them`);

const groups = rolesByGroup();
ok(groups.length >= 8, `they are grouped so a list this long is choosable (${groups.length} groups)`);
ok(groups.every((g) => g.roles.length > 0), 'and no group is empty');
ok(ALL.length === groups.flatMap((g) => g.roles).length, 'every trade is in exactly one group — none orphaned');

const sellers = [], nonSellers = [], creatives = [];
let n = 0;
for (const roleId of ALL) {
  const label = MEMBER_ROLE[roleId].label;
  const contact = `roles-${String(++n).padStart(3, '0')}@hvas.test`;
  const s = await call('POST', '/auth/member/start', { contact });
  const v = (await call('POST', '/auth/member/verify',
    { contact, code: s.body.devCode, name: label.slice(0, 20) })).body;
  if (!v.token) { ok(false, `${label}: could not even sign in`); continue; }

  await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, v.token);
  // OTHER is the one that needs words with it, by design.
  const r = await call('POST', '/me/role',
    roleId === 'OTHER' ? { role: roleId, other: 'Mobile car audio' } : { role: roleId }, v.token);
  if (r.status !== 200) { ok(false, `${label}: cannot be chosen as a trade (${r.status})`); continue; }
  await call('POST', '/me/program', { program: 'HOUSING' }, v.token);
  const buy = await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, v.token);
  if (buy.status !== 200) { ok(false, `${label}: cannot take a membership (${buy.status})`); continue; }

  const onb = await call('GET', '/onboarding', null, v.token);
  if (onb.body.accepted !== true) { ok(false, `${label}: finished all four steps and is still not a member`); continue; }
  pass++;   // this trade got all the way in

  const grants = roleGrants(roleId);
  (grants.sells ? sellers : nonSellers).push({ roleId, label, token: v.token });
  if (grants.creative) creatives.push({ roleId, label, token: v.token });
}
console.log(`  ${pass} trades signed up, agreed, chose a cause and took a membership`);
console.log(`  ${sellers.length} sell · ${nonSellers.length} do not · ${creatives.length} have work worth registering`);

console.log('\nWHAT A TRADE IS TOLD IT CAN DO IS WHAT IT CAN ACTUALLY DO');
// The quiet failure this catches: a role marked as selling that the marketplace
// then refuses, or one marked as not selling that it lets in anyway. Either way
// the app has lied to somebody about their own livelihood.
for (const { label, token } of sellers) {
  const r = await call('POST', '/market/list',
    { kind: 'SERVICE', title: `${label} work`.slice(0, 60), priceCents: 5000 }, token);
  ok(r.status === 200, `${label} is told they can sell, and can (${r.status})`);
}
for (const { label, token } of nonSellers) {
  const r = await call('POST', '/market/list', { kind: 'SERVICE', title: 'Anything', priceCents: 5000 }, token);
  ok(r.status === 403, `${label} is not a selling trade, and the shop says so rather than half-working`);
  ok(/does not sell|change what you do/i.test(r.body.error || ''),
     `${label} is told how to change it rather than just refused`);
}

console.log('\nA TRADE THAT MAKES THINGS CAN REGISTER AND LICENSE THEM');
const { createHash } = await import('node:crypto');
for (const { roleId, label, token } of creatives) {
  const h = 'sha256:' + createHash('sha256').update(`work-${roleId}`).digest('hex');
  const reg = await call('POST', '/ip/performance',
    { contentHash: h, kind: 'RECORDING', title: `${label} piece`, song: `${label} piece`, performedAt: Date.now() }, token);
  ok(reg.status === 200, `${label} can register something they made (${reg.status})`);
  if (reg.status !== 200) continue;
  const offer = await call('POST', '/license/offer',
    { assetId: reg.body.assetId, type: 'SYNC', scope: 'LOCAL', term: 'ONE_YEAR', priceCents: 10000 }, token);
  ok(offer.status === 200, `${label} can license it (${offer.status})`);
}

console.log('\nAND A TRADE THE LIST DOES NOT CALL CREATIVE STILL OWNS WHAT IT MAKES');
// The flag says what a trade is LIKELY to do, and must never be a permission.
// A nail tech photographing a set she designed made that photograph, and an app
// that told her she is not a creative trade and therefore cannot license it
// would be taking something off her that is hers.
{
  const nails = nonSellers.concat(sellers).find((x) => x.roleId === 'NAILS');
  const h = 'sha256:' + createHash('sha256').update('a photo of a set').digest('hex');
  const reg = await call('POST', '/ip/performance',
    { contentHash: h, kind: 'PHOTOGRAPH', title: 'Chrome set', performedAt: Date.now() }, nails.token);
  eq(reg.status, 200, 'a nail tech can register a photograph of her own work');
  const o = await call('POST', '/license/offer',
    { assetId: reg.body.assetId, type: 'STOCK', scope: 'WORLD', term: 'ONE_YEAR', priceCents: 5000 }, nails.token);
  eq(o.status, 200, 'and license it worldwide, exactly like anybody else');
  eq(roleGrants('NAILS').creative, false, 'even though the list does not call her trade a creative one');
}

console.log('\nEVERY TRADE HAS A WAY TO BE HELPED, AND IT POINTS SOMEWHERE REAL');
const programs = (await call('GET', '/programs', null, owner)).body.programs
  || (await call('GET', '/programs', null, sellers[0].token)).body.programs;
const ids = new Set(programs.map((p) => p.id));
for (const roleId of ALL) {
  const rec = MEMBER_ROLE[roleId].recovery;
  if (!rec) continue;
  ok(ids.has(rec) || ids.has(rec.replace(/_.*/, '')),
     `${MEMBER_ROLE[roleId].label} recovers into a programme that exists (${rec})`);
}

console.log('\nAND EVERY TRADE CAN BRING SOMEBODY');
// Not just promoters. Bringing people is the one kind of work anybody here can
// do, so every trade has a code and it is worth the same 15%.
for (const { label, token } of [sellers[0], nonSellers[0], creatives[0]].filter(Boolean)) {
  const mine = await call('GET', '/referral/mine', null, token);
  ok(mine.status === 200 && !!mine.body.code, `${label} has a code`);
  eq(mine.body.ratePercent, 0.15, `${label} earns the same 15% as anybody else`);
}

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

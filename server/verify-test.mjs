// Proving somebody is who they say they are.
//
// Until now the sign-up endpoint handed the six-digit code back in its own
// response. That is defensible for a laptop serving its own room with no
// internet, and indefensible the moment the venue is reachable from outside:
// it means anybody can sign up as anybody's phone number, and the verification
// step verifies only that you can type.
//
// What this suite holds in place:
//   • a venue that CAN send never puts the code in the response;
//   • a venue that CANNOT send says so, rather than pretending;
//   • breaking the sender does not fall back to echoing — otherwise the way to
//     defeat verification is to make it fail;
//   • nobody can use the code sender to harass a stranger or burn the quota;
//   • what comes back names the inbox enough to find it and not enough to read
//     somebody else's contact off their screen.
import { createApp } from './src/app.mjs';
import { contactKind, e164, deliveryConfig, sendCode, codeMessage, maskContact } from './src/notify.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

console.log('TELLING A PHONE NUMBER FROM AN EMAIL ADDRESS');
eq(contactKind('simone@gmail.com'), 'email', 'an email address is an email address');
eq(contactKind('850-555-0131'), 'phone', 'a number typed the way people type it is a phone');
eq(contactKind('+18505550131'), 'phone', 'and so is one typed properly');
eq(contactKind('(850) 555 0131'), 'phone', 'brackets and spaces do not confuse it');
eq(contactKind('simone'), 'unknown', 'a name is neither');
eq(contactKind(''), 'unknown', 'and nothing is neither');
eq(contactKind('555-0131'), 'unknown', 'seven digits is not a number anybody can text');
console.log('\nTHE ONE SHAPE EVERY SMS API AGREES ON');
eq(e164('850-555-0131'), '+18505550131', 'ten digits get the country on the front');
eq(e164('1 850 555 0131'), '+18505550131', 'eleven starting with 1 are already there');
eq(e164('+44 20 7946 0000'), '+442079460000', 'and a number that came with its own + keeps it');

console.log('\nWHAT THE MEMBER ACTUALLY RECEIVES');
const msg = codeMessage('482913', 'HITMANS VIP After Spot');
ok(msg.subject.startsWith('482913'), 'the code is the first thing in the subject, where a lock screen shows it');
ok(/HITMANS VIP After Spot/.test(msg.subject), 'and the venue is named, so it is not from a stranger');
ok(/5 minutes/.test(msg.text), 'it says how long it lasts');
ok(/did not ask for this/i.test(msg.text), 'and what to do if you did not ask for it');

console.log('\nA VENUE WITH NOTHING SET UP SAYS SO');
const bare = deliveryConfig(() => '');
eq(bare.canSend, false, 'it cannot send');
eq(bare.emailProvider, null, 'by email');
eq(bare.smsProvider, null, 'or by text');
eq((await sendCode({ contact: 'a@b.com', code: '1', cfg: bare })).error, 'no-email-provider',
   'and asking it to says exactly that');

console.log('\nONE KEY IS ENOUGH TO TURN IT ON');
const store = { resend_api_key: 're_test_key', mail_from: 'door@hvas.app' };
const cfg = deliveryConfig((k) => store[k] || '');
eq(cfg.canSend, true, 'a key and a from-address is a working venue');
eq(cfg.emailProvider, 'resend', 'on the first provider configured');
eq(cfg.smsProvider, null, 'texting stays off until it is registered, which is honest');
// A key with no from-address is a half-configured venue and must not count.
eq(deliveryConfig((k) => ({ resend_api_key: 'x' })[k] || '').canSend, false,
   'a key with nowhere to send from is not configured');

console.log('\nTHE SEND ITSELF, WITHOUT SENDING ANYTHING');
let seen = null;
const fakeFetch = async (url, opts) => {
  seen = { url, headers: opts.headers, body: opts.body };
  return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'msg_1' }) };
};
const sent = await sendCode({ contact: 'simone@gmail.com', code: '482913', cfg, fetchImpl: fakeFetch });
eq(sent.ok, true, 'it sends');
eq(sent.via, 'resend', 'through the provider that is configured');
ok(/api\.resend\.com/.test(seen.url), 'to that provider and nowhere else');
ok(seen.headers.Authorization.includes('re_test_key'), 'authenticated with the venue key');
ok(JSON.parse(seen.body).text.includes('482913'), 'carrying the code');
ok(JSON.parse(seen.body).to.includes('simone@gmail.com'), 'to the person who asked');

console.log('\nA PHONE NUMBER CANNOT BE EMAILED');
const smsless = await sendCode({ contact: '850-555-0131', code: '1', cfg, fetchImpl: fakeFetch });
eq(smsless.ok, false, 'an email-only venue refuses a phone number');
eq(smsless.error, 'no-sms-provider', 'and says which road is missing');

console.log('\nNOW THE REAL ENDPOINT');
process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-verify-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const invite = await call('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venue);
const owner = (await call('POST', '/auth/staff/claim', { code: invite.body.code })).body.token;

console.log('\nUNCONFIGURED: THE ROOM STILL WORKS, AND ADMITS WHAT IT IS');
const st0 = await call('GET', '/notify/status', null, owner);
eq(st0.body.canSend, false, 'the owner is told nothing is configured');
ok(/Anybody can sign up as any contact/.test(st0.body.meaning), 'in words, not a boolean they have to interpret');
ok(/A2P 10DLC/.test(st0.body.smsNote), 'and warned that texting needs registration that takes weeks');
const echo = await call('POST', '/auth/member/start', { contact: 'simone@gmail.com' });
eq(echo.body.sent, false, 'a code is not claimed to be sent');
ok(!!echo.body.devCode, 'it is shown instead, so a member in the room is not locked out');
eq(echo.body.echoed, true, 'and flagged as echoed rather than delivered');

console.log('\nA CONTACT ONLY HAS TO BE REACHABLE IF THE VENUE WILL REACH IT');
// With no sender configured the contact is just the name somebody is known by
// on this laptop. Demanding a valid mobile number there would lock out a person
// standing in the room for no benefit. Once the venue CAN send, it has to be
// something that can actually receive — checked further down.
eq((await call('POST', '/auth/member/start', { contact: 'simone' })).status, 200,
   'an unconfigured venue takes any handle, because it is only a name here');
eq((await call('POST', '/auth/member/start', { contact: '' })).status, 400, 'but nothing is still nothing');

console.log('\nNOBODY CAN MAKE A STRANGER’S PHONE BUZZ ALL NIGHT');
const again = await call('POST', '/auth/member/start', { contact: 'simone@gmail.com' });
eq(again.status, 429, 'a second request straight away is refused');
ok(again.body.retryInMs > 0, 'with how long to wait');
ok(/few seconds/.test(again.body.error), 'and said kindly, because this is usually an impatient member');
// A different person is unaffected — the limit is per contact, not per venue.
eq((await call('POST', '/auth/member/start', { contact: 'other@gmail.com' })).status, 200,
   'somebody else signing up at the same moment is not blocked');

console.log('\nAN ECHOED CODE MUST NOT BE A WAY INTO SOMEBODY ELSE\u2019S MEMBERSHIP');
// This is what makes launching without a mail provider survivable. Showing the
// code to somebody NEW is harmless: they are creating an identity nobody holds,
// and a human checks the person at the door. Showing it for a contact that
// already belongs to a member is account takeover — type their number, read the
// code off your own screen, and you are them.
const realOne = await call('POST', '/auth/member/start', { contact: '850-555-4242' });
ok(!!realOne.body.devCode, 'a brand new contact is shown the code, so a stranger can still join');
await call('POST', '/auth/member/verify',
  { contact: '850-555-4242', code: realOne.body.devCode, name: 'Simone' });
const takeover = await call('POST', '/auth/member/start', { contact: '850-555-4242' });
eq(takeover.status, 409, 'but once that contact is a member, it is NOT shown again');
ok(!takeover.body.devCode, 'no code comes back at all');
eq(takeover.body.needsStaff, true, 'and the app is told a person has to do this');
ok(/ask a member of staff/i.test(takeover.body.error), 'with what to actually do about it');

console.log('\nSO A NAMED MEMBER OF STAFF SIGNS THEM IN INSTEAD');
// The other half. Refusing without this would just lock people out — somebody
// who changed phones would have no way back into their own membership.
const shared = await call('POST', '/staff/signin-code', { contact: '850-555-4242' }, venue);
eq(shared.status, 403, 'a shared venue code cannot do it — the point is that a NAME is against it');
const issued = await call('POST', '/staff/signin-code', { contact: '850-555-4242' }, owner);
eq(issued.status, 200, 'a named one can');
ok(/^\d{6}$/.test(issued.body.code || ''), 'and gets a code to read out');
eq(issued.body.member.name, 'Simone', 'for the person standing in front of them');
ok(/recorded against your name/i.test(issued.body.note), 'and is told it is recorded against them');
eq((await call('POST', '/auth/member/verify',
  { contact: '850-555-4242', code: issued.body.code, name: 'Simone' })).status, 200,
  'the code works');
eq((await call('POST', '/staff/signin-code', { number: 'HV-0000-0000' }, owner)).status, 404,
   'and a number nobody holds gets nothing');

console.log('\nCONFIGURED: THE CODE NEVER APPEARS IN THE RESPONSE');
eq((await call('POST', '/notify/config', { resend_api_key: 're_x', mail_from: 'door@hvas.app' }, owner)).status, 200,
   'the owner sets it up from their own screen');
const st1 = await call('GET', '/notify/status', null, owner);
eq(st1.body.canSend, true, 'and the venue can now send');
ok(!JSON.stringify(st1.body).includes('re_x'), 'the key is never echoed back, not even to the owner');
// The venue will really try to reach api.resend.com now and really fail, which
// is exactly the case that must not fall back to echoing.
eq((await call('POST', '/auth/member/start', { contact: 'nobody-can-reach-this' })).status, 400,
   'and NOW that it can send, a handle nobody can reach is refused');
const real = await call('POST', '/auth/member/start', { contact: 'third@gmail.com' });
ok(real.status === 200 || real.status === 502, `a send is attempted for real (${real.status})`);
ok(!real.body.devCode, 'and whatever happens, the code is NOT in the response');
ok(!JSON.stringify(real.body).match(/\b\d{6}\b/), 'nor is any six-digit number');

console.log('\nBREAKING THE SENDER MUST NOT DEFEAT VERIFICATION');
// The attack this stops: if a failed send fell back to echoing, then the way
// past verification is to make sending fail.
eq(real.body.devCode, undefined, 'a failed send does not hand the code over');

console.log('\nWHAT A MEMBER IS TOLD ABOUT WHERE IT WENT');
// Enough to find the inbox, never enough to read somebody's contact off the
// screen they are holding up in a crowded room.
const em = maskContact('averylongname@gmail.com');
ok(em.endsWith('@gmail.com'), `the domain survives, so they know which inbox (${em})`);
ok(!em.includes('averylongname'), 'the local part does not');
ok(em.startsWith('a') && em.includes('e@'), 'first and last letter stay, which is enough to recognise your own');
const ph = maskContact('850-555-0131');
eq(ph, '\u2022\u2022\u2022 \u2022\u2022\u2022 0131', 'a phone shows its last four and nothing else');
eq(maskContact('+18505550131'), ph, 'however it was typed');
eq(maskContact('x'), '\u2022\u2022\u2022', 'and something unreadable gives nothing away');
ok(!maskContact('ab@x.co').includes('ab'), 'even a two-letter name is not handed over whole');

console.log('\nCONFIGURING IT IS THE OWNER’S JOB ALONE');
eq((await call('GET', '/notify/status', null, venue)).status, 403, 'a shared venue code cannot read the setup');
eq((await call('POST', '/notify/config', { mail_from: 'x@y.z' }, venue)).status, 403, 'nor change it');
eq((await call('GET', '/notify/status', null, null)).status, 401, 'and a stranger gets nothing');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

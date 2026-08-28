// THE ROOM — what members do with each other.
//
// Everything Instagram and Snapchat are for, between the people in this
// association, with no restriction on what they say to one another. Profiles,
// posts, photographs, moments that disappear, reactions, comments, following,
// blocking, and direct messages nobody else reads.
//
// Two things make it different from the platforms it borrows from, and this
// suite exists for both:
//
//   THE DOOR IS THE GATE. Not the content. Nobody posts, messages, or is even
//   visible until they have agreed to the covenant, said what they do, chosen a
//   programme and taken a membership. Every route is behind that.
//
//   IT IS CLOSED. There is no public timeline and no outside reader, and a
//   member's contact and door number appear NOWHERE in it. A screenshot of a
//   feed must never be a screenshot of somebody's identity.
import { createApp } from './src/app.mjs';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-room-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

let seq = 0;
const signIn = async (name) => {
  const contact = `room${++seq}@hvas.test`;
  const s = await call('POST', '/auth/member/start', { contact });
  return (await call('POST', '/auth/member/verify', { contact, code: s.body.devCode, name })).body;
};
const accept = async (v, role = 'NAILS') => {
  await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, v.token);
  await call('POST', '/me/role', { role }, v.token);
  await call('POST', '/me/program', { program: 'HOUSING' }, v.token);
  await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, v.token);
  return v;
};

console.log('THE DOOR IS THE GATE — NOT THE CONTENT');
// Somebody who signed in but has not been accepted cannot reach any of it.
const half = await signIn('Halfway');
for (const [m, p, b] of [
  ['GET', '/room/feed', null],
  ['GET', '/room/members', null],
  ['POST', '/room/post', { body: 'hello' }],
  ['POST', '/room/message', { to: 'x', body: 'hi' }],
  ['GET', '/room/threads', null],
  ['POST', '/room/follow', { memberId: 'x' }],
]) {
  const r = await call(m, p, b, half.token);
  ok(r.status === 403, `${m} ${p} is shut until they are accepted (${r.status})`);
}
ok(/finish signing up/i.test((await call('GET', '/room/feed', null, half.token)).body.error || ''),
   'and it says what is left rather than just refusing');
// And a stranger with no session at all gets nothing.
eq((await call('GET', '/room/feed')).status, 401, 'a stranger cannot see the room exists');

console.log('\nONCE THEY ARE IN, IT IS THEIRS');
const dana = await accept(await signIn('Dana'), 'NAILS');
const kev = await accept(await signIn('Kev'), 'DJ');
const rosa = await accept(await signIn('Rosa'), 'COOK');
eq((await call('GET', '/room/feed', null, dana.token)).status, 200, 'an accepted member gets the room');

console.log('\nA PROFILE THEY WRITE THEMSELVES');
const p1 = await call('POST', '/room/profile',
  { handle: 'DanaDoesNails', bio: 'Gel, chrome, and a chair on Tennessee St.' }, dana.token);
eq(p1.status, 200, 'she sets a handle and a bio');
eq(p1.body.profile.handle, 'danadoesnails', 'the handle is normalised so nobody has to remember capitals');
eq(p1.body.profile.tradeLabel, 'Nail tech', 'and it shows what she does, from the trade she chose at the door');
eq((await call('POST', '/room/profile', { handle: 'no' }, kev.token)).status, 400, 'a handle has to be usable');
eq((await call('POST', '/room/profile', { handle: 'danadoesnails' }, kev.token)).status, 409,
   'and two people cannot have the same one');

console.log('\nWHAT A FEED MUST NEVER CONTAIN');
// The rule that separates this from every platform it borrows from.
await call('POST', '/room/post', { body: 'Chairs open Friday' }, dana.token);
const feed = await call('GET', '/room/feed', null, kev.token);
const dump = JSON.stringify(feed.body);
ok(feed.body.feed.length >= 1, 'her post is in the room');
ok(!dump.includes(dana.member.number), 'her door number is NOT in the feed');
ok(!dump.includes('room2@hvas.test') && !dump.includes('@hvas.test'), 'nor is anybody’s contact');
ok(!/"tier"/.test(dump), 'nor what tier anybody pays for');
ok(dump.includes('Nail tech'), 'what IS there is what she does, which is the point of the room');

console.log('\nPOSTS, REACTIONS, COMMENTS');
const post = await call('POST', '/room/post', { body: 'Who is playing Saturday?' }, kev.token);
eq(post.status, 200, 'Kev posts');
const pid = post.body.post.postId;
eq((await call('POST', '/room/react', { postId: pid, emoji: '🔥' }, dana.token)).body.reactions.total, 1,
   'Dana reacts to it');
eq((await call('POST', '/room/react', { postId: pid, emoji: '💯' }, dana.token)).body.reactions.mine, '💯',
   'changing her reaction replaces it rather than adding one');
eq((await call('POST', '/room/react', { postId: pid, emoji: '' }, dana.token)).body.reactions.total, 0,
   'and tapping it off takes it back');
const cm = await call('POST', '/room/comment', { postId: pid, body: 'I am, 11pm' }, rosa.token);
eq(cm.status, 200, 'Rosa comments');
eq(cm.body.comments[0].by.name, 'Rosa', 'and the comment is hers');
eq((await call('POST', '/room/comment', { postId: pid, body: '  ' }, rosa.token)).status, 400,
   'an empty comment is not a comment');

console.log('\nSOMETHING THAT DISAPPEARS');
// A Saturday night should not follow somebody into a Monday.
const moment = await call('POST', '/room/post', { body: 'the floor right now', kind: 'MOMENT' }, kev.token);
eq(moment.body.post.kind, 'MOMENT', 'a moment is its own kind of thing');
ok(moment.body.post.expiresAt > Date.now(), 'and it has an end on it');
ok(moment.body.post.expiresAt - Date.now() <= 24 * 3600 * 1000 + 5000, 'a day, not forever');

console.log('\nTAKING YOUR OWN THING DOWN, AND NOBODY ELSE’S');
eq((await call('POST', '/room/post/hide', { postId: pid }, dana.token)).status, 403,
   'Dana cannot delete Kev’s post');
eq((await call('POST', '/room/post/hide', { postId: pid }, kev.token)).status, 200,
   'Kev can delete his own');
ok(!JSON.stringify((await call('GET', '/room/feed', null, dana.token)).body).includes(pid),
   'and it leaves the room');

console.log('\nFOLLOWING NEEDS NOBODY’S PERMISSION');
eq((await call('POST', '/room/follow', { memberId: dana.member.id }, kev.token)).body.following, true,
   'Kev follows Dana without asking her');
eq((await call('GET', '/room/member?id=' + dana.member.id, null, kev.token)).body.following, true,
   'and it shows on her page');
eq((await call('POST', '/room/follow', { memberId: kev.member.id }, kev.token)).status, 400,
   'nobody follows themselves');

console.log('\nMESSAGES NOBODY ELSE READS');
const dm = await call('POST', '/room/message', { to: dana.member.id, body: 'what do you charge for a full set' }, kev.token);
eq(dm.status, 200, 'Kev writes to Dana');
const thread = await call('GET', '/room/thread?with=' + kev.member.id, null, dana.token);
eq(thread.body.messages.length, 1, 'she has it');
eq(thread.body.messages[0].mine, false, 'attributed to him, not her');
// The third member must not be able to reach into it, and neither must the house.
const nosy = await call('GET', '/room/thread?with=' + kev.member.id, null, rosa.token);
eq(nosy.body.messages.length, 0, 'Rosa cannot read what they said to each other');
const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
eq((await call('GET', '/room/thread?with=' + kev.member.id, null, venue)).status, 401,
   'and neither can the venue — the house does not read the room');
eq((await call('GET', '/room/threads', null, dana.token)).body.threads.length, 1, 'her conversations list him');

console.log('\nBEING LEFT ALONE');
// A private association somebody cannot be left alone in is not private.
eq((await call('POST', '/room/block', { memberId: kev.member.id }, dana.token)).body.blocked, true,
   'Dana blocks Kev');
eq((await call('POST', '/room/message', { to: dana.member.id, body: 'hello?' }, kev.token)).status, 403,
   'he cannot write to her any more');
ok(!JSON.stringify((await call('GET', '/room/feed', null, dana.token)).body).includes('Kev'),
   'and he is out of her feed');
eq((await call('GET', '/room/member?id=' + kev.member.id, null, dana.token)).status, 200,
   'she can still look him up to undo it');
eq((await call('POST', '/room/block', { memberId: kev.member.id, on: false }, dana.token)).body.blocked, false,
   'and unblocking works');

console.log('\nTHE HOUSE HEARS ONLY WHEN SOMEBODY ASKS IT TO');
const rep = await call('POST', '/room/report',
  { kind: 'MEMBER', reference: kev.member.id, reason: 'Kept messaging after I said no.' }, dana.token);
eq(rep.status, 200, 'a member can report something');
ok(/until somebody reports it/i.test(rep.body.note), 'and is told plainly that nothing is watched until they do');

console.log('\nTHE DIRECTORY IS THE POINT OF A ROOM LIKE THIS');
const dir = await call('GET', '/room/members', null, dana.token);
ok(dir.body.members.length >= 2, 'she can see who else is in');
ok(dir.body.members.every((m) => m.id !== dana.member.id), 'without herself in the list');
ok(dir.body.trades.length > 0, 'and can narrow it by trade');
const djs = await call('GET', '/room/members?trade=DJ', null, dana.token);
ok(djs.body.members.every((m) => m.trade === 'DJ'), 'a search for DJs returns DJs');
ok(!JSON.stringify(dir.body).includes('@hvas.test'), 'and the directory still holds nobody’s contact');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);

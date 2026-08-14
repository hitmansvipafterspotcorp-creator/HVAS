// End-to-end integration test — boots the app on a random port and drives the
// full night through the real HTTP API + crypto. No external deps.
import { createApp } from './src/app.mjs';
import { verifyPass } from './src/crypto.mjs';
import { sign } from 'node:crypto';
import { rmSync } from 'node:fs';

// Forge a validly-signed pass with an arbitrary issue time (to exercise the
// door's freshness check without waiting 45s of wall-clock time).
const forgePass = (privateKey, number, issuedAt) => {
  const body = Buffer.from(JSON.stringify({ m: number, i: issuedAt, n: 'test' })).toString('base64url');
  const sig = Buffer.from(sign(null, Buffer.from(body), privateKey)).toString('base64url');
  return `${body}.${sig}`;
};

const dataDir = `/tmp/hvas-test-${Date.now()}`;
const { server, keys } = createApp({ dataDir });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (m, path, body, token) => {
  const res = await fetch(base + path, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

console.log('MEMBER AUTH');
const start = await call('POST', '/auth/member/start', { contact: '850-555-1234' });
ok(start.body.devCode, 'OTP issued');
const verify = await call('POST', '/auth/member/verify', { contact: '850-555-1234', code: start.body.devCode, name: 'Tasha' });
ok(verify.status === 200 && verify.body.token, 'member signed in');
const mtok = verify.body.token;
ok(/^HV-\d{4}-\d{4}$/.test(verify.body.member.number), 'member number minted');

console.log('HITKOIN WALLET (not configured in this test env)');
const walletNoAuth = await call('GET', '/wallet', null, null);
ok(walletNoAuth.status === 401, 'wallet requires member auth');
const wallet0 = await call('GET', '/wallet', null, mtok);
ok(wallet0.status === 200 && wallet0.body.enabled === false, 'reports HitKoin not configured for this venue');
ok(wallet0.body.address === null && wallet0.body.balance === '0' && wallet0.body.mints.length === 0, 'no wallet exists until a real payment mints one');

console.log('MEMBERSHIP + ROLLING PASS');
const buy = await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'Credit / Debit' }, mtok);
ok(buy.body.member.tier === 'Monthly', 'Monthly purchased');
const p1 = await call('GET', '/pass/current', null, mtok);
const p2 = await call('GET', '/pass/current', null, mtok);
ok(p1.body.pass && p1.body.pass !== p2.body.pass, 'pass rotates (two fetches differ)');
const v = verifyPass(keys.publicKey, p1.body.pass);
ok(v.ok && v.number === buy.body.member.number, 'pass signature verifies offline');
// forged pass rejected
ok(!verifyPass(keys.publicKey, p1.body.pass.slice(0, -4) + 'AAAA').ok, 'tampered pass rejected');
// stale pass rejected
const stale = verifyPass(keys.publicKey, p1.body.pass, Date.now() + 60000);
ok(!stale.ok && stale.reason === 'expired-qr', 'stale QR (>45s) rejected');

console.log('STAFF AUTH + DOOR');
const badStaff = await call('POST', '/auth/staff', { code: 'NOPE' });
ok(badStaff.status === 401, 'wrong staff code rejected');
const staff = await call('POST', '/auth/staff', { code: 'DOOR850' });
ok(staff.body.token && staff.body.role === 'staff', 'staff code accepted');
const stok = staff.body.token;

console.log('ON THE WAY → BOARD');
await call('POST', '/signal/otw', { on: true }, mtok);
let b = await call('GET', '/door/board', null, stok);
ok(b.body.onTheWay.length === 1 && b.body.onTheWay[0].number === buy.body.member.number, 'member shows On the way');

console.log('VERIFY AT DOOR');
const fresh = await call('GET', '/pass/current', null, mtok);
const grant = await call('POST', '/door/verify', { pass: fresh.body.pass }, stok);
ok(grant.body.ok && grant.body.status === 'granted', 'valid pass → GRANTED');
b = await call('GET', '/door/board', null, stok);
ok(b.body.inside.length === 1, 'member now Inside');
ok(b.body.onTheWay.length === 0, 'On the way cleared on admit');
ok(b.body.lastDecision.status === 'granted', 'decision logged');
ok(Array.isArray(b.body.recentDecisions) && b.body.recentDecisions[0].status === 'granted', 'recent decisions list includes it');
ok(b.body.recentDecisions[0].name === 'Tasha', 'recent decisions carries the member name (joined)');
// idempotent: second grant same night doesn't double count
const fresh2 = await call('GET', '/pass/current', null, mtok);
await call('POST', '/door/verify', { pass: fresh2.body.pass }, stok);
const me = await call('GET', '/me', null, mtok);
ok(me.body.member.entries === 1, 'admission idempotent per night (entries=1)');

console.log('LEFT → RE-SCANNED → BACK INSIDE');
const checkout1 = await call('POST', '/signal/leave', {}, mtok);
ok(checkout1.status === 200, 'member marks themselves left');
let meLeft = await call('GET', '/me', null, mtok);
ok(meLeft.body.member.insideTonight === false && meLeft.body.member.leftTonight === true, 'now reads Left, not Inside');
b = await call('GET', '/door/board', null, stok);
ok(b.body.inside.length === 0, 'no longer in the Inside list');
const leftMember = b.body.allMembers.find((x) => x.number === buy.body.member.number);
ok(leftMember?.doorStatus === 'left', 'door dashboard roster shows Left');
// staff re-scans the SAME member later — this used to silently no-op
// (INSERT OR IGNORE on a UNIQUE(member_id,night) row) and leave them stuck
// showing "Left" forever even though they were physically let back in.
const freshAfterLeave = await call('GET', '/pass/current', null, mtok);
const regrant = await call('POST', '/door/verify', { pass: freshAfterLeave.body.pass, searched: true }, stok);
ok(regrant.body.ok && regrant.body.status === 'granted', 'rescanning a Left member grants again, not silently ignored');
let meBack = await call('GET', '/me', null, mtok);
ok(meBack.body.member.insideTonight === true && meBack.body.member.leftTonight === false, 'reads Inside again after re-admit');
ok(meBack.body.member.backInside === true, 'flagged as a genuine back-inside, not a first arrival');
ok(meBack.body.member.entries === 1, 'still one night on record (entries table tracks nights, not re-entry count)');
b = await call('GET', '/door/board', null, stok);
const backMember = b.body.allMembers.find((x) => x.number === buy.body.member.number);
ok(backMember?.doorStatus === 'inside' && backMember?.backInside === true, 'roster shows Inside + back-inside flag');

const timeline = await call('GET', `/members/timeline?number=${buy.body.member.number}`, null, stok);
ok(timeline.status === 200, 'staff can pull a member timeline');
const myTimeline = await call('GET', '/me/timeline', null, mtok);
ok(myTimeline.status === 200, 'a member can pull their OWN timeline');
ok(JSON.stringify(myTimeline.body.events) === JSON.stringify(timeline.body.events), 'member sees the exact same events staff do');
const myTimelineNoAuth = await call('GET', '/me/timeline', null, stok);
ok(myTimelineNoAuth.status === 401, 'staff tokens cannot use the member-only /me/timeline');
const kinds = timeline.body.events.map((e) => e.kind);
ok(kinds.includes('signup') && kinds.includes('membership'), 'timeline includes signup + membership purchase');
ok(kinds.filter((k) => k === 'admit').length === 2, 'timeline shows both admits (first arrival + re-entry)');
ok(kinds.filter((k) => k === 'checkout').length === 1, 'timeline shows the one checkout in between');
ok(kinds.includes('otw'), 'timeline includes the earlier On the way signal');
const secondAdmit = timeline.body.events.filter((e) => e.kind === 'admit')[1];
ok(secondAdmit.searched === true, 'the "searched" flag from the re-admit door scan is recorded');
ok(timeline.body.events.every((e, i, arr) => i === 0 || arr[i - 1].at <= e.at), 'events are in chronological order');
const timelineNoAuth = await call('GET', `/members/timeline?number=${buy.body.member.number}`, null, mtok);
ok(timelineNoAuth.status === 401, 'members cannot pull the staff-only timeline');

console.log('MANUAL STAFF ACTIONS (profile buttons — no scan needed)');
const s3 = await call('POST', '/auth/member/start', { contact: '850-555-4321' });
const v3 = await call('POST', '/auth/member/verify', { contact: '850-555-4321', code: s3.body.devCode, name: 'Marcus' });
const mtok3 = v3.body.token;
await call('POST', '/membership/purchase', { tier: 'Daily', payment: 'Cash' }, mtok3);
const marcus = (await call('GET', '/me', null, mtok3)).body.member;

const manageNoAuth = await call('POST', '/members/manage', { number: marcus.number, action: 'grant' }, mtok3);
ok(manageNoAuth.status === 401, 'members cannot use the manual staff-action endpoint');

const manualGrant = await call('POST', '/members/manage', { number: marcus.number, action: 'grant' }, stok);
ok(manualGrant.status === 200 && manualGrant.body.member.insideTonight === true, 'manual "grant" admits without a QR scan');

const manualDeny = await call('POST', '/members/manage', { number: marcus.number, action: 'deny' }, stok);
ok(manualDeny.status === 200 && manualDeny.body.member.insideTonight === true, '"deny" logs a decision but does not change entry status');

const ban = await call('POST', '/members/manage', { number: marcus.number, action: 'banned', reason: 'Fighting' }, stok);
ok(ban.body.member.flag?.kind === 'banned' && ban.body.member.flag?.reason === 'Fighting', 'ban sets a standing flag with reason');

const flagsList = await call('GET', '/members/flags', null, stok);
ok(flagsList.body.members.some((x) => x.number === marcus.number), 'banned member shows up on the shared venue watchlist');

const freshMarcus = await call('GET', '/pass/current', null, mtok3);
const bannedScan = await call('POST', '/door/verify', { pass: freshMarcus.body.pass }, stok);
ok(!bannedScan.body.ok && bannedScan.body.status === 'banned', 'a banned member is denied at the door even with a valid pass');

const unflag = await call('POST', '/members/manage', { number: marcus.number, action: 'unflag' }, stok);
ok(unflag.body.member.flag === null, 'clearing the flag removes it');
const freshMarcus2 = await call('GET', '/pass/current', null, mtok3);
const unflaggedScan = await call('POST', '/door/verify', { pass: freshMarcus2.body.pass }, stok);
ok(unflaggedScan.body.ok && unflaggedScan.body.status === 'granted', 'once cleared, the same member scans in normally again');

const marcusTimeline = await call('GET', `/members/timeline?number=${marcus.number}`, null, stok);
const mKinds = marcusTimeline.body.events.map((e) => e.kind);
ok(mKinds.filter((k) => k === 'decision').length >= 3, 'deny/ban/etc all show up as decision events in the timeline');

console.log('DENY CASES');
const trespass = await call('POST', '/door/verify', { number: 'HV-0000-0000' }, stok);
ok(!trespass.body.ok && trespass.body.status === 'trespass', 'unknown number → TRESPASS');
const oldPass = forgePass(keys.privateKey, buy.body.member.number, Date.now() - 60000); // signed 60s ago
const expiredQr = await call('POST', '/door/verify', { pass: oldPass }, stok);
ok(!expiredQr.body.ok && expiredQr.body.status === 'expired-qr', 'stale QR at door → expired-qr');

console.log('LIP SYNC BINGO');
// second member joins bingo alongside Tasha
const s2 = await call('POST', '/auth/member/start', { contact: '850-555-9999' });
const v2 = await call('POST', '/auth/member/verify', { contact: '850-555-9999', code: s2.body.devCode, name: 'Rell' });
const mtok2 = v2.body.token;

let state = await call('GET', '/bingo/state');
ok(state.body.status === 'lobby', 'round starts in lobby');
ok(state.body.deckId === 'after-spot-starter', 'defaults to the starter deck before any reset ever picks one');

const decks = await call('GET', '/bingo/decks', null, stok);
ok(decks.body.decks.some((d) => d.id === 'after-spot-starter') && decks.body.decks.length >= 4, 'real decks are listed, not a single hardcoded pool');
ok(decks.body.patterns.includes('four_corners') && decks.body.patterns.includes('blackout'), 'multiple win patterns available');
const badDecks = await call('GET', '/bingo/decks', null, mtok);
ok(badDecks.status === 401, 'members cannot see the host-only deck list');

const join1 = await call('POST', '/bingo/join', {}, mtok);
ok(join1.body.card.length === 25 && join1.body.card[12].id === 'FREE', 'card dealt: 25 real artist/song squares, free center');
ok(join1.body.card[0].artist && join1.body.card[0].song, 'squares carry real artist/song, not generic phrases');
const join2 = await call('POST', '/bingo/join', {}, mtok2);
ok(join2.body.card.length === 25, 'second member dealt a card');
const rejoin = await call('POST', '/bingo/join', {}, mtok);
ok(JSON.stringify(rejoin.body.card) === JSON.stringify(join1.body.card), 'rejoin returns same card, not redealt');
await call('POST', '/bingo/ready', { ready: true }, mtok);

const noCall = await call('POST', '/bingo/call', {}, stok);
ok(noCall.status === 400, 'cannot call before round is live');
const bingoStart = await call('POST', '/bingo/start', {}, stok);
ok(bingoStart.status === 200 && bingoStart.body.deckId === 'after-spot-starter', 'host starts the round on the picked deck');
state = await call('GET', '/bingo/state');
ok(state.body.status === 'live' && state.body.playerCount === 2 && state.body.readyCount === 1, 'live round shows player/ready counts');

const badClaim = await call('POST', '/bingo/claim', {}, mtok2);
ok(badClaim.status === 400, 'claim rejected when card has no bingo line');

const badMark = await call('POST', '/bingo/mark', { itemId: 'not-on-my-card', covered: true }, mtok);
ok(badMark.status === 400, 'cannot mark an item that is not on your own card');

// call out the entire deck's pool — once every item has been called, every
// card (including Tasha's and Rell's) COULD be fully covered.
for (let i = 0; i < 40; i++) { const r = await call('POST', '/bingo/call', {}, stok); if (r.status !== 200) break; }

const claimBeforeMarking = await call('POST', '/bingo/claim', {}, mtok);
ok(claimBeforeMarking.status === 400, 'even with everything called, claim fails until the player actually taps squares covered');

// tap every non-free square on Tasha's card covered (this is the real
// gameplay action — marking is never automatic anymore).
for (const item of join1.body.card) {
  if (item.free) continue;
  const m = await call('POST', '/bingo/mark', { itemId: item.id, covered: true }, mtok);
  if (m.status !== 200) { ok(false, `mark failed for ${item.id}`); break; }
}
const claim = await call('POST', '/bingo/claim', {}, mtok);
ok(claim.status === 200 && claim.body.pending, 'valid bingo claim accepted once covered squares match the call history');

const board = await call('GET', '/bingo/board', null, stok);
ok(board.body.players.length === 2 && board.body.claims.length === 1, 'host board shows players + pending claim');
ok(board.body.deckName === 'After Spot Starter', 'host board shows the human-readable deck name');
const claimId = board.body.claims[0].id;
const resolve = await call('POST', '/bingo/resolve', { claimId, approve: true }, stok);
ok(resolve.status === 200, 'host approves the claim');
state = await call('GET', '/bingo/state');
ok(state.body.status === 'ended' && state.body.winner?.name === 'Tasha', 'round ends with the right winner');

const reset = await call('POST', '/bingo/reset', { deckId: 'tally-after-dark', pattern: 'four_corners' }, stok);
ok(reset.status === 200 && reset.body.deckId === 'tally-after-dark' && reset.body.pattern === 'four_corners', 'host resets into a different deck + pattern for the next game');
state = await call('GET', '/bingo/state');
ok(state.body.status === 'lobby' && state.body.playerCount === 0, 'reset clears players + returns to lobby');
ok(state.body.deckId === 'tally-after-dark' && state.body.pattern === 'four_corners', 'the new deck/pattern choice is live for the next round');
ok(state.body.nowPlaying === null, 'reset also clears now-playing media');

console.log('LIP SYNC BINGO: FOUR CORNERS PATTERN');
const cornerJoin = await call('POST', '/bingo/join', {}, mtok2);
ok(cornerJoin.body.card.length === 25, 'Rell gets a fresh card on the new deck');
await call('POST', '/bingo/start', {}, stok);
for (let i = 0; i < 40; i++) { const r = await call('POST', '/bingo/call', {}, stok); if (r.status !== 200) break; }
const corners = [cornerJoin.body.card[0], cornerJoin.body.card[4], cornerJoin.body.card[20], cornerJoin.body.card[24]];
for (const item of corners) await call('POST', '/bingo/mark', { itemId: item.id, covered: true }, mtok2);
const cornerClaim = await call('POST', '/bingo/claim', {}, mtok2);
ok(cornerClaim.status === 200, 'covering only the four corners is enough to win under the Four Corners pattern');

const resetBadDeck = await call('POST', '/bingo/reset', { deckId: 'not-a-real-deck', pattern: 'not-a-real-pattern' }, stok);
ok(resetBadDeck.body.deckId === 'after-spot-starter' && resetBadDeck.body.pattern === 'line', 'unrecognized deck/pattern falls back to a safe default instead of erroring');

console.log('YOUTUBE AUTO-MEDIA');
const search = await call('GET', '/media/youtube-search?q=test', null, stok);
ok(search.status === 503, 'search refuses cleanly when no YOUTUBE_API_KEY is configured (this test env has none)');
const badSearch = await call('GET', '/media/youtube-search?q=test', null, mtok);
ok(badSearch.status === 401, 'members cannot use the host-only search proxy');
const setMedia = await call('POST', '/bingo/media', { videoId: 'dQw4w9WgXcQ', title: 'Test Video' }, stok);
ok(setMedia.status === 200, 'host sets now-playing media');
state = await call('GET', '/bingo/state');
ok(state.body.nowPlaying?.videoId === 'dQw4w9WgXcQ' && state.body.nowPlaying?.title === 'Test Video', 'now-playing syncs to every device via /bingo/state');
const stopMedia = await call('POST', '/bingo/media/stop', {}, stok);
ok(stopMedia.status === 200, 'host stops the media');
state = await call('GET', '/bingo/state');
ok(state.body.nowPlaying === null, 'now-playing cleared after stop');
const badSetMedia = await call('POST', '/bingo/media', { videoId: 'x' }, mtok);
ok(badSetMedia.status === 401, 'members cannot set now-playing media');

console.log('PARTY MODE / BATTLERZ');
const notEnough = await call('POST', '/party/start', {}, stok);
ok(notEnough.status === 400, 'refuses to start with fewer than 5 players in the room');

// bring the room to 5 players (bingo_cards was cleared by the last reset)
await call('POST', '/bingo/join', {}, mtok);
await call('POST', '/bingo/join', {}, mtok2);
for (let i = 0; i < 3; i++) {
  const s = await call('POST', '/auth/member/start', { contact: `850-555-70${i}` });
  const v = await call('POST', '/auth/member/verify', { contact: `850-555-70${i}`, code: s.body.devCode, name: `Guest${i}` });
  await call('POST', '/bingo/join', {}, v.body.token);
}
const partyStart = await call('POST', '/party/start', {}, stok);
ok(partyStart.status === 200, 'host starts Battlerz once 5+ players are in the room');
let party = await call('GET', '/party/state');
ok(party.body.status === 'battling' && party.body.teamA === 'Team Purple' && party.body.teamB === 'Team Pink', 'battle is live with both teams named');

const badVote = await call('POST', '/party/vote', { team: 'a' }, null);
ok(badVote.status === 401, 'voting requires a member session');
await call('POST', '/party/vote', { team: 'a', reaction: '🔥' }, mtok);
await call('POST', '/party/vote', { team: 'b' }, mtok2);
const revote = await call('POST', '/party/vote', { team: 'b' }, mtok); // Tasha changes her mind
ok(revote.status === 200, 'a member can change their vote before the battle ends');
party = await call('GET', '/party/state');
ok(party.body.votesA === 0 && party.body.votesB === 2, 'revote moved cleanly from Team A to Team B — one vote per member, not two');

const partyEnd = await call('POST', '/party/end', {}, stok);
ok(partyEnd.body.winner === 'b', 'winner calculated correctly from the votes');
party = await call('GET', '/party/state');
ok(party.body.status === 'ended' && party.body.winner === 'b', 'ended state shows the winning team');

const partyReset = await call('POST', '/party/reset', {}, stok);
ok(partyReset.status === 200, 'host resets for the next battle');
party = await call('GET', '/party/state');
ok(party.body.status === 'idle' && party.body.winner === null, 'reset returns to idle with no winner');

console.log('VIP TABLE BOOKING');
const tonight = new Date().toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

const noAuthReq = await call('POST', '/booking/request', { night: nextWeek, partySize: 4 }, null);
ok(noAuthReq.status === 401, 'requesting a table requires a member session');

const badDate = await call('POST', '/booking/request', { night: 'not-a-date', partySize: 4 }, mtok);
ok(badDate.status === 400, 'refuses a malformed date');

const pastDate = await call('POST', '/booking/request', { night: lastWeek, partySize: 4 }, mtok);
ok(pastDate.status === 400, 'refuses a night that already passed');

const tooBig = await call('POST', '/booking/request', { night: nextWeek, partySize: 99 }, mtok);
ok(tooBig.status === 400, 'refuses an out-of-range party size');

const req1 = await call('POST', '/booking/request', { night: nextWeek, partySize: 6, note: 'Birthday, need bottle service' }, mtok);
ok(req1.status === 200 && req1.body.status === 'pending', 'Tasha requests a table for next week');

const mine = await call('GET', '/booking/mine', null, mtok);
ok(mine.body.bookings.length === 1 && mine.body.bookings[0].id === req1.body.id, 'Tasha sees her own request');

const notMine = await call('GET', '/booking/mine', null, mtok2);
ok(notMine.body.bookings.length === 0, "another member doesn't see Tasha's booking");

const boardNoAuth = await call('GET', '/booking/board', null, mtok);
ok(boardNoAuth.status === 401, 'members cannot see the staff booking board');

const board1 = await call('GET', '/booking/board', null, stok);
ok(board1.body.bookings.length === 1 && board1.body.bookings[0].name === 'Tasha', 'staff board shows the request with the member name joined in');

const decideNoAuth = await call('POST', '/booking/decide', { id: req1.body.id, approve: true }, mtok);
ok(decideNoAuth.status === 401, 'members cannot approve/decline bookings');

const approve = await call('POST', '/booking/decide', { id: req1.body.id, approve: true, tableLabel: 'VIP Booth 3' }, stok);
ok(approve.status === 200 && approve.body.status === 'approved', 'host approves with a table assignment');

const mineAfterApprove = await call('GET', '/booking/mine', null, mtok);
ok(mineAfterApprove.body.bookings[0].status === 'approved' && mineAfterApprove.body.bookings[0].table_label === 'VIP Booth 3', "Tasha sees it approved with the table label");

const redecide = await call('POST', '/booking/decide', { id: req1.body.id, approve: false }, stok);
ok(redecide.status === 404, 'an already-decided booking cannot be decided again');

const req2 = await call('POST', '/booking/request', { night: nextWeek, partySize: 2 }, mtok2);
const decline = await call('POST', '/booking/decide', { id: req2.body.id, approve: false, reason: 'Fully booked that night' }, stok);
ok(decline.status === 200 && decline.body.status === 'declined', 'host declines a different request with a reason');

const cancelOthers = await call('POST', '/booking/cancel', { id: req1.body.id }, mtok2);
ok(cancelOthers.status === 404, "cancelling someone else's booking is refused outright");
const stillApproved = await call('GET', '/booking/mine', null, mtok);
ok(stillApproved.body.bookings[0].status === 'approved', "a member can't cancel someone else's booking");

const cancelMine = await call('POST', '/booking/cancel', { id: req1.body.id }, mtok);
ok(cancelMine.status === 200, 'Tasha cancels her own approved booking');
const afterCancel = await call('GET', '/booking/mine', null, mtok);
ok(afterCancel.body.bookings[0].status === 'cancelled', 'booking now shows cancelled');

const board2 = await call('GET', '/booking/board', null, stok);
ok(board2.body.bookings.every((b) => b.night >= tonight), 'staff board only shows tonight-or-later, never past nights');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);

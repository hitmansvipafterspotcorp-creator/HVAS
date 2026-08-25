// HVAS backend client — the bridge between the app and the deployed backend.
// When VITE_HVAS_API is set at build time, the app authenticates real member
// sessions (OTP), and the game's social layer (presence/chat/link) comes alive.
// When it's unset, the app runs fully local (demo auth, solo game) — unchanged.
// Backend base URL is resolved at RUNTIME: a venue you connected to (scanned
// QR / pasted URL) wins, else the build-time env. This lets the same deployed
// static site connect to any backend with no rebuild.
const ls = (k) => (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || '';
// When the venue itself is serving this app (a phone on the venue wifi opening
// http://192.168.1.20:8787), that venue IS the backend — the server injects a
// marker saying so. Nobody should have to type an address to play in the room
// they are standing in. A venue the member chose explicitly still wins, so
// connecting to somewhere else from a venue-served page keeps working.
const servedByVenue = () => (typeof window !== 'undefined' && window.__HVAS_VENUE__) || '';
export const apiBase = () => (ls('hvas_api_base') || servedByVenue() || import.meta.env.VITE_HVAS_API || '').replace(/\/+$/, '');
export const apiEnabled = () => !!apiBase();

export const apiToken = () => ls('hvas_api_token');
export const apiMemberId = () => ls('hvas_api_member_id');

// Connect the app to a venue backend at runtime: validate it, cache its config.
// An unreachable address (wrong network, typo, venue offline) can otherwise
// hang far longer than anyone will wait before assuming it's broken — an
// explicit timeout makes "can't reach it" fail fast and clearly instead.
export async function connectVenue(url) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Enter a full https:// URL');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let cfg;
  try {
    const r = await fetch(base + '/config', { signal: controller.signal });
    if (!r.ok) throw new Error('not an HVAS backend');
    cfg = await r.json();
  } catch (e) {
    throw e.name === 'AbortError' ? new Error('Timed out reaching that venue') : e;
  } finally {
    clearTimeout(timer);
  }
  localStorage.setItem('hvas_api_base', base);
  localStorage.setItem('hvas_cfg', JSON.stringify(cfg));
  // The id outlives the address — this is what makes a dead link recoverable.
  if (cfg.venueId) localStorage.setItem('hvas_venue_id', cfg.venueId);
  return cfg;
}

// ── The room directory ───────────────────────────────────────────────────
// A domain points a name at a machine, and dies the day it is not renewed or
// the tunnel restarts. This is the stronger version of the same job: the venue
// has a permanent id, the directory says where that id is reachable right now,
// and the directory itself is served from the app's own address — which is
// already permanent and costs nothing.
//
// The practical difference: a member who joined once never needs a link again.
// When the address moves, the app looks the venue up by id and reconnects
// itself. A saved room cannot rot the way a saved link does.
const DIRECTORY_URL = (import.meta.env.BASE_URL || '/') + 'venues.json';

export async function fetchRooms() {
  try {
    // Cache-busted: the whole point is that this file changes when a venue
    // moves, and a stale copy would send everyone to a dead address.
    const r = await fetch(`${DIRECTORY_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d?.venues) ? d.venues : [];
  } catch { return []; }
}

/** Where this venue is reachable now, by its permanent id. */
export async function findRoom(venueId) {
  if (!venueId) return null;
  return (await fetchRooms()).find((v) => v.venueId === venueId) || null;
}

export const savedVenueId = () => ls('hvas_venue_id');

/** Reconnect a member whose saved address has gone stale, without asking them
 *  for anything. Returns the new base if it worked. */
export async function healVenue() {
  const id = savedVenueId();
  if (!id) return null;
  const room = await findRoom(id);
  if (!room?.url) return null;
  const base = String(room.url).replace(/\/+$/, '');
  if (base === apiBase()) return null;              // already there; something else is wrong
  try {
    const r = await fetch(base + '/config', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const cfg = await r.json();
    if (cfg.venueId && cfg.venueId !== id) return null;   // moved on to a different venue
    localStorage.setItem('hvas_api_base', base);
    localStorage.setItem('hvas_cfg', JSON.stringify(cfg));
    return base;
  } catch { return null; }
}

export const venueConfig = () => { try { return JSON.parse(ls('hvas_cfg') || '{}'); } catch { return {}; } };
export function disconnectVenue() {
  ['hvas_api_base', 'hvas_cfg', 'hvas_api_token', 'hvas_api_member_id', 'hvas_venue_id'].forEach((k) => localStorage.removeItem(k));
}

async function call(method, path, body, token) {
  const res = await fetch(apiBase() + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// Member OTP: start → (code) → verify. Stores the session token + member id so
// the game's social client can use them.
export function memberOtpStart(contact) { return call('POST', '/auth/member/start', { contact }); }
export async function memberOtpVerify(contact, code, name) {
  const r = await call('POST', '/auth/member/verify', { contact, code, name });
  if (r?.token) {
    localStorage.setItem('hvas_api_token', r.token);
    localStorage.setItem('hvas_api_member_id', r.member.id);
  }
  return r;
}
export function apiSignOut() {
  localStorage.removeItem('hvas_api_token');
  localStorage.removeItem('hvas_api_member_id');
}

// Optional: mirror a membership purchase to the backend so the pass is real.
export function apiPurchase(tier, payment) { return call('POST', '/membership/purchase', { tier, payment }, apiToken()); }
export function apiMe() { return call('GET', '/me', null, apiToken()); }
export function apiMyTimeline() { return call('GET', '/me/timeline', null, apiToken()); }
// Server-authoritative on-the-way / left-venue signals — so a different
// staff device (the door dashboard) actually sees them, not just this device.
export function apiSetOtw(on) { return call('POST', '/signal/otw', { on }, apiToken()); }
export function apiSignalLeave() { return call('POST', '/signal/leave', {}, apiToken()); }

// HitKoin — a member's own wallet + reward history. No wallet exists until
// their first real, confirmed payment mints one.
// A member's career across every night, and the venue leaderboard. These
// outlive the round on purpose — they are the reason to come back.
export function apiMyStats() { return call('GET', '/me/stats', null, apiToken()); }
export function apiLeaderboard() { return call('GET', '/bingo/leaderboard', null, apiToken() || apiStaffToken()); }
export function apiWallet() { return call('GET', '/wallet', null, apiToken()); }

// Staff / host: venue-code login, then everything below reads from the ONE
// shared backend database — so a member who signed up on their own phone
// shows up for staff on a completely different device.
export const apiStaffToken = () => ls('hvas_api_staff_token');
export const apiStaffRole = () => ls('hvas_api_staff_role');
export const apiStaffName = () => ls('hvas_api_staff_name');
export const apiStaffNamed = () => ls('hvas_api_staff_named') === '1';
// One box takes both: the venue's shared code, and a personal invite handed to
// somebody joining the team. Nobody being handed a code knows or cares which
// kind it is, and asking them would be a step that exists only because of how
// we happen to store them. The server tells them apart.
export async function apiStaffLogin(code) {
  const r = await call('POST', '/auth/staff', { code });
  if (r?.token) {
    localStorage.setItem('hvas_api_staff_token', r.token);
    localStorage.setItem('hvas_api_staff_role', r.role);
    localStorage.setItem('hvas_api_staff_name', r.name || '');
    localStorage.setItem('hvas_api_staff_named', r.named ? '1' : '0');
  }
  return r;
}
export function apiStaffSignOut() {
  ['hvas_api_staff_token', 'hvas_api_staff_role', 'hvas_api_staff_name', 'hvas_api_staff_named']
    .forEach((k) => localStorage.removeItem(k));
}

// ── The team ──────────────────────────────────────────────────────────────
export function apiStaffRoster() { return call('GET', '/staff/roster', null, apiStaffToken()); }
export function apiStaffInvite(name, role) { return call('POST', '/staff/invite', { name, role }, apiStaffToken()); }
export function apiStaffRemove(staffId) { return call('POST', '/staff/disable', { staffId }, apiStaffToken()); }
export function apiDoorVerify(payload) { return call('POST', '/door/verify', payload, apiStaffToken()); }
export function apiDoorBoard() { return call('GET', '/door/board', null, apiStaffToken()); }
export function apiDoorCheckout(number) { return call('POST', '/door/checkout', { number }, apiStaffToken()); }
export function apiMembersSearch(q) { return call('GET', `/members/search?q=${encodeURIComponent(q)}`, null, apiStaffToken()); }
export function apiMemberTimeline(number) { return call('GET', `/members/timeline?number=${encodeURIComponent(number)}`, null, apiStaffToken()); }
export function apiMemberManage(number, action, reason) { return call('POST', '/members/manage', { number, action, reason }, apiStaffToken()); }
export function apiMemberFlags() { return call('GET', '/members/flags', null, apiStaffToken()); }

// ── Lip Sync Bingo — one shared live round, same on every device ──
// State is public (the TV Display runs unattended with no login) but carries
// `me` when a member token is sent, so the player-facing screens can reuse it.
export function apiBingoState() { return call('GET', '/bingo/state', null, apiToken() || apiStaffToken()); }
export function apiBingoAuto(on) { return call('POST', '/bingo/auto', { on }, apiStaffToken()); }
export function apiBingoAutofill(on) { return call('POST', '/bingo/autofill', { on }, apiToken()); }

// ── Money ─────────────────────────────────────────────────────────────────
// Free or cash, set by the house and by nobody else.
export function apiBingoMode(mode) { return call('POST', '/bingo/mode', { mode }, apiToken()); }
// The door taking an entry, or taking one back. Staff/host only, server-side —
// a member marking themselves paid would make the pot fiction.
export function apiBingoEntry(memberId, { paid = true, how = 'cash' } = {}) {
  return call('POST', '/bingo/entry', { member_id: memberId, paid, how }, apiToken());
}
// Voting to make whoever holds the called lip sync square actually perform it.
export function apiBingoMicVote() { return call('POST', '/bingo/micvote', {}, apiToken()); }

// Paying the entry from a member's own phone. This CLAIMS — it does not pay.
// Nothing about the pot moves until the house confirms it.
export function apiBingoEntryClaim(rail, reference) {
  return call('POST', '/bingo/entry/claim', { rail, reference }, apiToken());
}
// The house agreeing (or not). Staff/host only, server-enforced.
// ── A performance, registered as the performer's own work ─────────────────
// The hash goes up. The video never does — see hashTake() in takes.js.
export function apiRegisterPerformance({ contentHash, artist, song, durationMs, performedAt }) {
  return call('POST', '/ip/performance', { contentHash, artist, song, durationMs, performedAt }, apiToken());
}
export function apiMyPerformances() { return call('GET', '/ip/mine', null, apiToken()); }
export function apiVerifyPerformance(contentHash) { return call('POST', '/ip/verify', { contentHash }, apiToken()); }

// ── Jubilee: community support ────────────────────────────────────────────
// A member submits a NEED. Everything that turns a need into money — verifying
// the evidence, approving it, awarding it, paying it — belongs to the house and
// is refused server-side if a member's token asks.
export function apiJubileeKinds() { return call('GET', '/jubilee/kinds', null, apiToken()); }
export function apiJubileeApply(body) { return call('POST', '/jubilee/apply', body, apiToken()); }
export function apiJubileeMine() { return call('GET', '/jubilee/mine', null, apiToken()); }
export function apiJubileeQueue() { return call('GET', '/jubilee/queue', null, apiStaffToken()); }
export function apiJubileeVerify(applicationId, note, verified = true) {
  return call('POST', '/jubilee/verify', { applicationId, note, verified }, apiStaffToken());
}
export function apiJubileeApprove(applicationId, emergency = false) {
  return call('POST', '/jubilee/approve', { applicationId, emergency }, apiStaffToken());
}
export function apiJubileeAward(applicationId, providerId, emergency = false) {
  return call('POST', '/jubilee/award', { applicationId, providerId, emergency }, apiStaffToken());
}
export function apiJubileePay(awardId, reference) { return call('POST', '/jubilee/pay', { awardId, reference }, apiStaffToken()); }
export function apiJubileeDelivered(awardId, by, what) { return call('POST', '/jubilee/delivered', { awardId, by, what }, apiStaffToken()); }
export function apiJubileeVendor(body) { return call('POST', '/jubilee/vendor', body, apiStaffToken()); }

export function apiBingoEntryResolve(id, confirm) {
  return call('POST', '/bingo/entry/resolve', { id, confirm }, apiToken());
}
export function apiBingoJoin() { return call('POST', '/bingo/join', {}, apiToken()); }
export function apiBingoReady(ready) { return call('POST', '/bingo/ready', { ready }, apiToken()); }
export function apiBingoClaim() { return call('POST', '/bingo/claim', {}, apiToken()); }
export function apiBingoMark(itemId, covered) { return call('POST', '/bingo/mark', { itemId, covered }, apiToken()); }
export function apiBingoStart() { return call('POST', '/bingo/start', {}, apiStaffToken()); }
export function apiBingoCall() { return call('POST', '/bingo/call', {}, apiStaffToken()); }
export function apiBingoResolve(claimId, approve) { return call('POST', '/bingo/resolve', { claimId, approve }, apiStaffToken()); }
export function apiBingoPodiumClose() { return call('POST', '/bingo/podium/close', {}, apiStaffToken()); }
export function apiBingoReset(deckId, pattern) { return call('POST', '/bingo/reset', { deckId, pattern }, apiStaffToken()); }
export function apiBingoBoard() { return call('GET', '/bingo/board', null, apiStaffToken()); }
// ── Lip Sync Battles ──
// Read endpoints accept either token (members perform/vote, staff run the floor).
export function apiBattleCurrent(itemId) {
  const q = itemId ? `?itemId=${encodeURIComponent(itemId)}` : '';
  return call('GET', `/battle/current${q}`, null, apiToken() || apiStaffToken());
}
export function apiBattleMine() { return call('GET', '/battle/mine', null, apiToken()); }
// The room picks which contenders battle when three or more hold the square.
export function apiBattlePick(battleId, memberId) { return call('POST', '/battle/pick', { battleId, memberId }, apiToken()); }
export function apiBattleLock(battleId) { return call('POST', '/battle/lock', { battleId }, apiStaffToken()); }
export function apiBattleRespond(battleId, accept) { return call('POST', '/battle/respond', { battleId, accept }, apiToken()); }
export function apiBattlePerformed(battleId) { return call('POST', '/battle/performed', { battleId }, apiToken()); }
export function apiBattleFrame(battleId, frame) { return call('POST', '/battle/frame', { battleId, frame }, apiToken()); }
export function apiBattleWatch(battleId) { return call('GET', `/battle/frame?battleId=${encodeURIComponent(battleId)}`, null, apiToken() || apiStaffToken()); }
export function apiBattleSay(battleId, body, kind) { return call('POST', '/battle/say', { battleId, body, kind }, apiToken()); }
export function apiBattleVote(battleId, memberId) { return call('POST', '/battle/vote', { battleId, memberId }, apiToken()); }
export function apiBattleStage(battleId, stage) { return call('POST', '/battle/stage', { battleId, stage }, apiStaffToken()); }
export function apiBattlePerform(battleId, memberId, seconds) { return call('POST', '/battle/perform', { battleId, memberId, seconds }, apiStaffToken()); }
export function apiBattleVoting(battleId, seconds) { return call('POST', '/battle/voting', { battleId, seconds }, apiStaffToken()); }
export function apiBattleTimer(battleId, action) { return call('POST', '/battle/timer', { battleId, action }, apiStaffToken()); }
export function apiBattleResolve(battleId, winnerId) { return call('POST', '/battle/resolve', { battleId, winnerId }, apiStaffToken()); }

// ── Standalone Lip Sync Battle events ──
// A whole night of battles with no bingo card involved: its own lobby, its own
// standings. The bout inside an event is an ordinary battle, so every apiBattle*
// call above drives it — only these set the event up and pick the next matchup.
export function apiEventState() { return call('GET', '/lipsync/state', null, apiToken() || apiStaffToken()); }
export function apiEventCreate(format, title, size) { return call('POST', '/lipsync/create', { format, title, size }, apiStaffToken()); }
export function apiEventJoin() { return call('POST', '/lipsync/join', {}, apiToken()); }
export function apiEventLeave() { return call('POST', '/lipsync/leave', {}, apiToken()); }
export function apiEventStart() { return call('POST', '/lipsync/start', {}, apiStaffToken()); }
export function apiEventNext(opts = {}) { return call('POST', '/lipsync/next', opts, apiStaffToken()); }
export function apiEventChallenge(memberId) { return call('POST', '/lipsync/challenge', { memberId }, apiToken()); }
export function apiEventEnd() { return call('POST', '/lipsync/end', {}, apiStaffToken()); }
export function apiBingoDecks() { return call('GET', '/bingo/decks', null, apiStaffToken()); }
// Venue media credentials. Songs only play once one of these two is set up —
// either the venue's own YouTube API key, or the host signing in with Google
// so searches run on their account (and playback ads follow their Premium).
export function apiYoutubeKeyStatus() { return call('GET', '/bingo/youtube-key', null, apiStaffToken()); }
export function apiSetYoutubeKey(key) { return call('POST', '/bingo/youtube-key', { key }, apiStaffToken()); }
export function apiGoogleStatus() { return call('GET', '/auth/google/status', null, apiStaffToken()); }
export function apiGoogleDisconnect() { return call('POST', '/auth/google/disconnect', {}, apiStaffToken()); }
// The sign-in itself is a full-page redirect to Google, so it needs the URL
// rather than a fetch — the token rides as a query param because a redirect
// cannot carry an Authorization header.
export const googleSignInUrl = () => `${apiBase()}/auth/google/start?token=${encodeURIComponent(apiStaffToken())}`;
export function apiYoutubeSearch(q) { return call('GET', `/media/youtube-search?q=${encodeURIComponent(q)}`, null, apiStaffToken()); }
export function apiBingoPlayMedia(videoId, title) { return call('POST', '/bingo/media', { videoId, title }, apiStaffToken()); }
export function apiBingoStopMedia() { return call('POST', '/bingo/media/stop', {}, apiStaffToken()); }

// ── Party Mode / Battlerz ──
export function apiPartyState() { return call('GET', '/party/state', null, apiToken() || apiStaffToken()); }
export function apiPartyStart() { return call('POST', '/party/start', {}, apiStaffToken()); }
export function apiPartyVote(team, reaction) { return call('POST', '/party/vote', { team, reaction }, apiToken()); }
export function apiPartyEnd() { return call('POST', '/party/end', {}, apiStaffToken()); }
export function apiPartyReset() { return call('POST', '/party/reset', {}, apiStaffToken()); }

// ── VIP Table Booking ──
export function apiBookingRequest(night, partySize, note) { return call('POST', '/booking/request', { night, partySize, note }, apiToken()); }
export function apiBookingMine() { return call('GET', '/booking/mine', null, apiToken()); }
export function apiBookingCancel(id) { return call('POST', '/booking/cancel', { id }, apiToken()); }
export function apiBookingBoard() { return call('GET', '/booking/board', null, apiStaffToken()); }
export function apiBookingDecide(id, approve, tableLabel, reason) { return call('POST', '/booking/decide', { id, approve, tableLabel, reason }, apiStaffToken()); }

// ── HVAS Pay ledger — pay by any rail, owner reconciles ──
// Handles prefer the connected venue's config (config-over-the-air), then env.
export const zelleHandle = () => venueConfig().zelle || import.meta.env.VITE_ZELLE_HANDLE || '';
export const paypalMeHandle = () => venueConfig().paypalMe || import.meta.env.VITE_PAYPAL_ME || 'hitmanmusicworldwide';
export function payClaim(tier, rail, reference) { return call('POST', '/pay/claim', { tier, rail, reference }, apiToken()); }
// Reconciling pending payments is a staff/host action — authenticate with the
// staff session, not the member one (a staff device usually has no member
// login at all, so this used to silently fail every time).
export function payPending() { return call('GET', '/pay/pending', null, apiStaffToken()); }
export function payConfirm(id) { return call('POST', '/pay/confirm', { id }, apiStaffToken()); }
export function payVoid(id) { return call('POST', '/pay/void', { id }, apiStaffToken()); }

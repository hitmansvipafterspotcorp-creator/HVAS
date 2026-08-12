// HVAS backend client — the bridge between the app and the deployed backend.
// When VITE_HVAS_API is set at build time, the app authenticates real member
// sessions (OTP), and the game's social layer (presence/chat/link) comes alive.
// When it's unset, the app runs fully local (demo auth, solo game) — unchanged.
// Backend base URL is resolved at RUNTIME: a venue you connected to (scanned
// QR / pasted URL) wins, else the build-time env. This lets the same deployed
// static site connect to any backend with no rebuild.
const ls = (k) => (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || '';
export const apiBase = () => (ls('hvas_api_base') || import.meta.env.VITE_HVAS_API || '').replace(/\/+$/, '');
export const apiEnabled = () => !!apiBase();

export const apiToken = () => ls('hvas_api_token');
export const apiMemberId = () => ls('hvas_api_member_id');

// Connect the app to a venue backend at runtime: validate it, cache its config.
export async function connectVenue(url) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) throw new Error('Enter a full https:// URL');
  const cfg = await fetch(base + '/config').then((r) => { if (!r.ok) throw new Error('not an HVAS backend'); return r.json(); });
  localStorage.setItem('hvas_api_base', base);
  localStorage.setItem('hvas_cfg', JSON.stringify(cfg));
  return cfg;
}
export const venueConfig = () => { try { return JSON.parse(ls('hvas_cfg') || '{}'); } catch { return {}; } };
export function disconnectVenue() {
  ['hvas_api_base', 'hvas_cfg', 'hvas_api_token', 'hvas_api_member_id'].forEach((k) => localStorage.removeItem(k));
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

// HitKoin — a member's own wallet + reward history. No wallet exists until
// their first real, confirmed payment mints one.
export function apiWallet() { return call('GET', '/wallet', null, apiToken()); }

// Staff / host: venue-code login, then everything below reads from the ONE
// shared backend database — so a member who signed up on their own phone
// shows up for staff on a completely different device.
export const apiStaffToken = () => ls('hvas_api_staff_token');
export const apiStaffRole = () => ls('hvas_api_staff_role');
export async function apiStaffLogin(code) {
  const r = await call('POST', '/auth/staff', { code });
  if (r?.token) {
    localStorage.setItem('hvas_api_staff_token', r.token);
    localStorage.setItem('hvas_api_staff_role', r.role);
  }
  return r;
}
export function apiStaffSignOut() {
  localStorage.removeItem('hvas_api_staff_token');
  localStorage.removeItem('hvas_api_staff_role');
}
export function apiDoorVerify(payload) { return call('POST', '/door/verify', payload, apiStaffToken()); }
export function apiDoorBoard() { return call('GET', '/door/board', null, apiStaffToken()); }
export function apiMembersSearch(q) { return call('GET', `/members/search?q=${encodeURIComponent(q)}`, null, apiStaffToken()); }

// ── Lip Sync Bingo — one shared live round, same on every device ──
// State is public (the TV Display runs unattended with no login) but carries
// `me` when a member token is sent, so the player-facing screens can reuse it.
export function apiBingoState() { return call('GET', '/bingo/state', null, apiToken() || apiStaffToken()); }
export function apiBingoJoin() { return call('POST', '/bingo/join', {}, apiToken()); }
export function apiBingoReady(ready) { return call('POST', '/bingo/ready', { ready }, apiToken()); }
export function apiBingoClaim() { return call('POST', '/bingo/claim', {}, apiToken()); }
export function apiBingoStart() { return call('POST', '/bingo/start', {}, apiStaffToken()); }
export function apiBingoCall() { return call('POST', '/bingo/call', {}, apiStaffToken()); }
export function apiBingoResolve(claimId, approve) { return call('POST', '/bingo/resolve', { claimId, approve }, apiStaffToken()); }
export function apiBingoReset() { return call('POST', '/bingo/reset', {}, apiStaffToken()); }
export function apiBingoBoard() { return call('GET', '/bingo/board', null, apiStaffToken()); }
export function apiYoutubeSearch(q) { return call('GET', `/media/youtube-search?q=${encodeURIComponent(q)}`, null, apiStaffToken()); }
export function apiBingoPlayMedia(videoId, title) { return call('POST', '/bingo/media', { videoId, title }, apiStaffToken()); }
export function apiBingoStopMedia() { return call('POST', '/bingo/media/stop', {}, apiStaffToken()); }

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

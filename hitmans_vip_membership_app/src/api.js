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

// ── HVAS Pay ledger — pay by any rail, owner reconciles ──
// Handles prefer the connected venue's config (config-over-the-air), then env.
export const zelleHandle = () => venueConfig().zelle || import.meta.env.VITE_ZELLE_HANDLE || '';
export const paypalMeHandle = () => venueConfig().paypalMe || import.meta.env.VITE_PAYPAL_ME || 'hitmanmusicworldwide';
export function payClaim(tier, rail, reference) { return call('POST', '/pay/claim', { tier, rail, reference }, apiToken()); }
export function payPending() { return call('GET', '/pay/pending', null, apiToken()); }
export function payConfirm(id) { return call('POST', '/pay/confirm', { id }, apiToken()); }
export function payVoid(id) { return call('POST', '/pay/void', { id }, apiToken()); }

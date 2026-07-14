// HVAS backend client — the bridge between the app and the deployed backend.
// When VITE_HVAS_API is set at build time, the app authenticates real member
// sessions (OTP), and the game's social layer (presence/chat/link) comes alive.
// When it's unset, the app runs fully local (demo auth, solo game) — unchanged.
const API = import.meta.env.VITE_HVAS_API || '';
export const apiEnabled = () => !!API;

export const apiToken = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_token')) || '';
export const apiMemberId = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_member_id')) || '';

async function call(method, path, body, token) {
  const res = await fetch(API + path, {
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
export const ZELLE_HANDLE = import.meta.env.VITE_ZELLE_HANDLE || '';   // your Navy Federal Zelle email/phone
export const PAYPAL_ME_HANDLE = import.meta.env.VITE_PAYPAL_ME || 'hitmanmusicworldwide';
export function payClaim(tier, rail, reference) { return call('POST', '/pay/claim', { tier, rail, reference }, apiToken()); }
export function payPending() { return call('GET', '/pay/pending', null, apiToken()); }
export function payConfirm(id) { return call('POST', '/pay/confirm', { id }, apiToken()); }
export function payVoid(id) { return call('POST', '/pay/void', { id }, apiToken()); }

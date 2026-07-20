import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import './styles.css';
import GameCanvas from './game/GameCanvas.jsx';
import { GAME_FIGHTERS } from './game/venues.js';
import { apiBase, apiEnabled, apiToken, apiMemberId, memberOtpStart, memberOtpVerify, apiSignOut, apiPurchase,
  zelleHandle, payClaim, payPending, payConfirm, payVoid, connectVenue, venueConfig, disconnectVenue } from './api.js';
import { paypalConfigured, tierPayable, planFor, loadPayPal, paypalMeEnabled, paypalMeLink } from './paypal.js';
import { hubOn, startHub, stopHub, hubNode } from './hub.js';

// ── Membership: the one source of truth ──────────────────────────────────
// A member is either NOT a member (no card) or has ONE active tier. Buying a
// tier mints a member number + QR; that pass is what shows on their pass/
// profile and what Security scans/enters to verify. No fake sample data.
export const TIERS = [
  // Daily is an OPEN contribution — pay whatever you want, 0.00 is allowed.
  { name: 'Daily', price: 0, days: 1, open: true },
  { name: 'Weekly', price: 100, days: 7 },
  { name: 'Monthly', price: 300, days: 30 },
  { name: 'Yearly', price: 1850, days: 365 },
  { name: 'VIP', price: 5000, days: 365, vip: true },
];
const TIER_BY = Object.fromEntries(TIERS.map((t) => [t.name, t]));
const MEMBER_KEY = 'hvas_member_v1';

// Tier perks. Hospitality tickets are issued per night and expire at 3AM.
export const TIER_PERKS = {
  Daily: { tickets: 0, meal: false, drinks: false, blurb: 'Entry access' },
  Weekly: { tickets: 1, meal: false, drinks: false, blurb: '1 hospitality ticket a night (before 3AM)' },
  Monthly: { tickets: 3, meal: false, drinks: false, blurb: '3 hospitality tickets daily (expire 3AM)' },
  Yearly: { tickets: 3, meal: true, drinks: false, blurb: '3 tickets daily + a free Cafe8Fifty meal' },
  VIP: { tickets: 3, meal: true, drinks: true, blurb: 'Free drinks all night + a free meal daily' },
};

// What each tier comes with — shown when a member taps a card on the buy screen
// so they can choose wisely.
export const TIER_BENEFITS = {
  Daily: ['Entry for the night', 'Pay what you want until 2 AM — even $0', 'Member card, number & door QR', 'Loyalty rank starts counting'],
  Weekly: ['7 days of entry', '1 hospitality ticket every night (before 3 AM)', 'Member card, number & door QR', 'Event & venue access once you check in'],
  Monthly: ['30 days of entry', '3 hospitality tickets every night', 'Event & venue access', 'Faster loyalty rank climb'],
  Yearly: ['365 days of entry', '3 hospitality tickets every night', 'A free Cafe8Fifty meal daily', 'Priority event & venue access'],
  VIP: ['365 days of entry', 'Free drinks all night', 'A free meal daily', 'VIP lounge & VIP areas', 'Priority door entry', 'Top loyalty status'],
};
// The "night" resets at 3AM — shift the clock back 3h and take the date.
function nightKey(ts = Date.now()) { return new Date(ts - 3 * 3600000).toISOString().slice(0, 10); }

// ── Daily entry window ───────────────────────────────────────────────────
// Every night, Daily entry is an OPEN contribution (pay what you want, even
// $0.00) — but only until 2:00 AM. A live countdown ticks down to the cutoff;
// once it passes, Daily entry is a mandatory $15. The free window reopens each
// evening when doors open.
const DAILY_CUTOFF_HOUR = 2;    // 2:00 AM — free/open contribution window closes
const DAILY_REOPEN_HOUR = 6;    // 6:00 AM — free window reopens after the late $15 hours
export const DAILY_LATE_PRICE = 20;
function nextHourMark(hour, now = Date.now()) {
  const d = new Date(now); d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
// Free/open (pay whatever, including $0) every day up until 2:00 AM. From 2:00 AM
// to 6:00 AM — the after-hours entry window — it's a mandatory $15. Then it
// reopens free the rest of the day, counting down to the next 2:00 AM.
export function dailyWindow(now = Date.now()) {
  const h = new Date(now).getHours();
  const late = h >= DAILY_CUTOFF_HOUR && h < DAILY_REOPEN_HOUR;   // 2AM → 6AM = $15
  return late
    ? { free: false, price: DAILY_LATE_PRICE, until: nextHourMark(DAILY_REOPEN_HOUR, now) }
    : { free: true, price: 0, until: nextHourMark(DAILY_CUTOFF_HOUR, now) };
}

// A "paid" membership is an active one you actually paid for (any tier price or
// contribution > $0). Free Daily entry is NOT a paid membership — it gets you in
// tonight but doesn't preserve your loyalty stats over time.
export function isPaidMember(m = memberState) {
  return !!(m && Date.now() < m.expiresAt && (m.paid > 0 || m.vip));
}
// Enforce the rule: keep a paid membership or your stats start over. When a
// membership lapses (expired) without a paid renewal, entries + loyalty reset.
export function enforceMembership() {
  const m = memberState; if (!m) return;
  if (Date.now() >= m.expiresAt && m.status !== 'expired') {
    commitMember({ ...m, status: 'expired', entries: 0, loyalty: 0, lastEntryNight: null });
  }
}

// ── Members With Motion — referral / promoter program ────────────────────
// Any member or staffer can generate a promo code + shareable QR. People who
// buy a package with that code get a discount; the promoter earns a 1/4 (25%)
// payout of what their referred headcount pays, tallied per night and paid out
// weekly. Everything rides the hub op-log so it works serverless + cross-device.
const PROMO_KEY = 'hvas_promo_v1';            // my own promoter code
const PROMO_ACTIVE_KEY = 'hvas_promo_active'; // a code I'm currently redeeming
export const PROMO_DISCOUNT = 0.15;           // buyer saves 15% on paid tiers
export const PROMO_PAYOUT = 0.25;             // promoter earns 25% of referred spend
function promoSlug(name, number) {
  const base = (String(name || '').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase()) || 'HVAS';
  const tail = (String(number || '').replace(/\D/g, '').slice(-3)) || String(Math.floor(100 + Math.random() * 900));
  const rnd = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `${base}${tail}${rnd}`;
}
export function myPromo() { try { return JSON.parse(localStorage.getItem(PROMO_KEY)); } catch { return null; } }
export function generatePromo(owner) {
  const existing = myPromo(); if (existing) return existing;
  const rec = { code: promoSlug(owner?.name, owner?.number), owner: owner?.number || owner?.name || 'me', name: owner?.name || 'Promoter', createdAt: Date.now() };
  try { localStorage.setItem(PROMO_KEY, JSON.stringify(rec)); } catch { /* ignore */ }
  hubNode()?.apply('promo.create', rec);
  return rec;
}
export const activePromo = () => (typeof localStorage !== 'undefined' && localStorage.getItem(PROMO_ACTIVE_KEY)) || '';
export function setActivePromo(code) { if (code) try { localStorage.setItem(PROMO_ACTIVE_KEY, String(code).toUpperCase().trim()); } catch { /* ignore */ } }
export function clearActivePromo() { try { localStorage.removeItem(PROMO_ACTIVE_KEY); } catch { /* ignore */ } }
export function redeemPromo(code, paid) {
  if (!code) return;
  const who = (authState && authState.member) || {};
  hubNode()?.apply('promo.redeem', {
    code: String(code).toUpperCase().trim(),
    buyer: (memberState && memberState.number) || 'guest',
    name: who.name || (memberState && memberState.name) || 'Member',
    contact: who.contact || (memberState && memberState.contact) || '',
    paid: Math.max(0, Number(paid) || 0), night: nightKey(), at: Date.now(),
  });
}
function startOfWeek(now = Date.now()) {              // Monday 00:00
  const d = new Date(now); const day = d.getDay();
  d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.getTime();
}
export function promoStats(code) {
  const hub = hubNode();
  const rs = hub ? [...hub.ops.values()].filter((o) => o.t === 'promo.redeem' && o.data.code === code) : [];
  const night = nightKey(), wk = startOfWeek();
  const sum = (arr) => arr.reduce((s, r) => s + (r.data.paid || 0), 0);
  const tonight = rs.filter((r) => r.data.night === night);
  const week = rs.filter((r) => r.data.at >= wk);
  const people = rs.sort((a, b) => b.at - a.at).map((r) => ({ name: r.data.name || 'Member', contact: r.data.contact || '', paid: r.data.paid || 0, at: r.data.at, night: r.data.night }));
  return {
    tonightHeads: tonight.length, tonightRevenue: sum(tonight),
    weekHeads: week.length, weekRevenue: sum(week),
    weekPayout: Math.round(sum(week) * PROMO_PAYOUT * 100) / 100,
    allHeads: rs.length, allRevenue: sum(rs),
    people,
  };
}

function loadMember() { try { return JSON.parse(localStorage.getItem(MEMBER_KEY)); } catch { return null; } }
const memberListeners = new Set();
let memberState = loadMember();
function commitMember(m) {
  memberState = m;
  try { m ? localStorage.setItem(MEMBER_KEY, JSON.stringify(m)) : localStorage.removeItem(MEMBER_KEY); } catch { /* ignore */ }
  memberListeners.forEach((fn) => fn());
}
function genMemberNumber() {
  const block = () => Math.floor(1000 + Math.random() * 9000);
  return `HV-${block()}-${block()}`;
}
export function purchaseTier(tierName, payment, amount) {
  const t = TIER_BY[tierName]; if (!t) return;
  const now = Date.now();
  const prev = memberState || {};
  const perk = TIER_PERKS[tierName] || TIER_PERKS.Daily;
  const nk = nightKey();
  const paid = t.open ? Math.max(0, Number(amount) || 0) : t.price;
  const number = prev.number || genMemberNumber();
  // Real identity from sign-in — stored on the card so every entry, payment, and
  // referral is provable (name + email/phone, not just a code).
  const who = (authState && authState.member) || {};
  const name = who.name || prev.name || 'Member';
  const contact = who.contact || prev.contact || '';
  commitMember({
    tier: tierName, vip: !!t.vip, number, payment, paid, name, contact,
    purchasedAt: now, expiresAt: now + t.days * 86400000, status: 'active', verifiedAt: null,
    // loyalty carries over across renew/upgrade
    entries: prev.entries || 0, loyalty: prev.loyalty || 0, lastEntryNight: prev.lastEntryNight || null,
    // tonight's perks
    tickets: perk.tickets, ticketsNight: nk, mealUsed: false,
  });
  // Come onto the network: write the membership onto the in-browser hub op-log
  // so this member is live in the mesh the moment they join (no server needed).
  const hub = hubNode();
  if (hub) {
    hub.apply('member.upsert', { id: number, name, contact, number });
    hub.apply('membership.upsert', { member_id: number, tier: tierName, vip: !!t.vip, paid, name, contact, expiresAt: now + t.days * 86400000 });
  }
  // Also mirror to a real backend if one is connected, so the server mints the
  // membership and the rolling QR pass is server-verifiable at the door.
  if (apiEnabled() && apiToken()) apiPurchase(tierName, payment).catch(() => {});
}

// Reissue tonight's hospitality tickets / meal if we've crossed 3AM.
export function refreshNight() {
  if (!memberState) return;
  const nk = nightKey();
  if (memberState.ticketsNight !== nk) {
    const perk = TIER_PERKS[memberState.tier] || TIER_PERKS.Daily;
    commitMember({ ...memberState, tickets: perk.tickets, ticketsNight: nk, mealUsed: false });
  }
}
export function useTicket() {
  if (!memberState || (memberState.tickets || 0) <= 0) return;
  commitMember({ ...memberState, tickets: memberState.tickets - 1 });
}
export function claimMeal() {
  if (!memberState) return;
  commitMember({ ...memberState, mealUsed: true });
}

// Loyalty ranks — earned by nights attended (entries) + loyalty, not bought.
const A_ = import.meta.env.BASE_URL;
export const RANKS = [
  { name: 'Bronze', min: 0, src: `${A_}assets/ui/rank/bronze.png` },
  { name: 'Silver', min: 5, src: `${A_}assets/ui/rank/silver.png` },
  { name: 'Gold', min: 12, src: `${A_}assets/ui/rank/gold.png` },
  { name: 'Platinum', min: 25, src: `${A_}assets/ui/rank/platinum.png` },
  { name: 'VIP', min: 45, src: `${A_}assets/ui/rank/vip.png` },
];
export function rankFor(entries = 0) {
  let r = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (entries >= RANKS[i].min) { r = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { rank: r, next };
}
// Admit the member for tonight — one night per 3AM window, so repeated
// check-ins / door scans never double-count. Counts the night, adds loyalty,
// and (re)issues tonight's hospitality tickets. Returns the next member object.
function admitTonight(m) {
  const nk = nightKey();
  const perk = TIER_PERKS[m.tier] || TIER_PERKS.Daily;
  if (m.lastEntryNight === nk) {
    // already counted tonight — just keep perks fresh across a 3AM rollover
    if (m.ticketsNight === nk) return { ...m, onTheWay: false };
    return { ...m, onTheWay: false, tickets: perk.tickets, ticketsNight: nk, mealUsed: false };
  }
  return {
    ...m,
    onTheWay: false,                 // arrived — clear the incoming signal
    entries: (m.entries || 0) + 1,
    loyalty: (m.loyalty || 0) + 10,
    lastEntryNight: nk,
    tickets: perk.tickets, ticketsNight: nk, mealUsed: false,
  };
}
// Has this member already been admitted for the current night?
export function isInsideTonight(m = memberState) {
  return !!(m && m.lastEntryNight === nightKey());
}
// Member "on the way" signal — set when they flip the OTW toggle, stored on the
// shared member record so door staff can see who's incoming. Timestamped, and
// cleared automatically on admission (in admitTonight).
export function setOnTheWay(flag) {
  if (!memberState) return;
  commitMember({ ...memberState, onTheWay: !!flag, onTheWayAt: flag ? Date.now() : null });
}
export function isOnTheWay(m = memberState) {
  return !!(m && m.onTheWay && !isInsideTonight(m));
}
// Auto-logged when a member checks in (self) — same idempotent path the door
// uses, so member-side check-in and staff verification stay consistent.
export function logEntry() {
  if (!memberState) return;
  commitMember(admitTonight(memberState));
}
// Returns one of three door outcomes: valid (grant), expired (deny), or
// trespass (deny — the number isn't a member at all). Security shows the
// matching alert graphic for each.
export function verifyByNumber(number) {
  const m = memberState;
  const clean = (number || '').trim().toUpperCase();
  if (!m || !m.number || m.number.toUpperCase() !== clean) {
    return { ok: false, status: 'trespass', reason: 'No matching member — unauthorized. Do not admit.' };
  }
  // A trespass/ban flag beats everything else — do not admit, no matter the tier.
  const pen = memberPenalty(clean);
  if (pen) {
    return {
      ok: false, status: pen.kind === 'banned' ? 'banned' : 'trespass', member: m,
      reason: `${PENALTY_LABEL[pen.kind] || 'FLAGGED'} — ${pen.reason || 'do not admit'}${pen.by ? ` · flagged by ${pen.by}` : ''}`,
    };
  }
  if (Date.now() > m.expiresAt) {
    commitMember({ ...m, status: 'expired' });
    return { ok: false, status: 'expired', member: memberState, reason: 'Membership expired — renewal required.' };
  }
  // Grant = admission: verify the pass AND log tonight's entry (idempotent),
  // so the member's loyalty rank, ribbons, and perks update from this one event.
  commitMember(admitTonight({ ...m, status: 'verified', verifiedAt: Date.now() }));
  return { ok: true, status: 'valid', member: memberState, reason: 'Member verified — grant entry. Night logged.' };
}
export function resetMembership() { commitMember(null); }

// ── Member penalties: trespass / ban ────────────────────────────────────
// Door staff can flag a member. The flag rides the hub op-log so it converges
// to every device — the member sees it on their own profile, and any door that
// scans them is warned. Latest op per member number wins; 'cleared' lifts it.
export const PENALTY_LABEL = { trespass: 'TRESPASSED', banned: 'BANNED' };
export function penalizeMember(number, name, kind, reason) {
  const num = String(number || '').trim().toUpperCase();
  if (!num) return;
  const who = (authState && authState.member) || {};
  hubNode()?.apply('member.penalty', {
    number: num, name: name || 'Member', kind, reason: reason || '',
    by: who.name || 'Door staff', at: Date.now(),
  });
  // reflect immediately on the local member record if this is them
  if (memberState && memberState.number && memberState.number.toUpperCase() === num) {
    commitMember({ ...memberState, penalty: kind === 'cleared' ? null : { kind, reason: reason || '', at: Date.now() } });
  }
  memberListeners.forEach((fn) => fn());
}
export function memberPenalty(number) {
  const num = String(number || '').trim().toUpperCase();
  if (!num) return null;
  const hub = hubNode();
  if (hub) {
    const rs = [...hub.ops.values()]
      .filter((o) => o.t === 'member.penalty' && String(o.data.number).toUpperCase() === num)
      .sort((a, b) => (a.data.at || 0) - (b.data.at || 0));
    const last = rs[rs.length - 1];
    if (last) return last.data.kind === 'cleared' ? null : { kind: last.data.kind, reason: last.data.reason, by: last.data.by, at: last.data.at };
  }
  // offline fallback: the member's own stored flag
  if (memberState && memberState.number && memberState.number.toUpperCase() === num) return memberState.penalty || null;
  return null;
}
// Search the shared member registry (hub member.upsert ops) by name or number,
// so door staff can look someone up without a scan. Falls back to the local
// member when there's no hub/backend.
export function searchMembers(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const hub = hubNode();
  let rows = [];
  if (hub) {
    const latest = new Map();
    [...hub.ops.values()].filter((o) => o.t === 'member.upsert')
      .forEach((o) => latest.set(String(o.data.number || o.data.id).toUpperCase(), o.data));
    rows = [...latest.values()].map((d) => ({ number: d.number || d.id, name: d.name || 'Member', contact: d.contact || '' }));
  }
  if (memberState && memberState.number && !rows.some((r) => String(r.number).toUpperCase() === memberState.number.toUpperCase())) {
    rows.push({ number: memberState.number, name: memberState.name || 'Member', contact: memberState.contact || '' });
  }
  return rows.filter((r) => `${r.name} ${r.number} ${r.contact}`.toLowerCase().includes(q)).slice(0, 6);
}
export function penalizedMembers() {
  const hub = hubNode();
  if (!hub) {
    return memberState && memberState.penalty
      ? [{ number: memberState.number, name: memberState.name, ...memberState.penalty }] : [];
  }
  const latest = new Map();
  [...hub.ops.values()].filter((o) => o.t === 'member.penalty')
    .sort((a, b) => (a.data.at || 0) - (b.data.at || 0))
    .forEach((o) => latest.set(String(o.data.number).toUpperCase(), o.data));
  return [...latest.values()].filter((d) => d.kind !== 'cleared')
    .map((d) => ({ number: d.number, name: d.name, kind: d.kind, reason: d.reason, by: d.by, at: d.at }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
}
function useMember() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((n) => n + 1); memberListeners.add(fn); return () => memberListeners.delete(fn); }, []);
  return memberState;
}

// ── Auth ────────────────────────────────────────────────────────────────
// Members self-serve (phone/email identity). Staff & Host are privileged and
// gated by a venue-issued access code. NOTE: this is a client-side demo of the
// FLOW only — the codes live in the bundle, so real staff auth must move to a
// backend before it protects anything. Members' real accounts would likewise
// be verified server-side (SMS/email code).
const AUTH_KEY = 'hvas_auth_v1';
const ROLE_CODES = { staff: 'DOOR850', host: 'HOST850' }; // demo venue codes
function loadAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch { return {}; } }
const authListeners = new Set();
let authState = loadAuth();
function commitAuth(a) {
  authState = a;
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch { /* ignore */ }
  authListeners.forEach((fn) => fn());
}
export function memberSignIn(name, contact) { commitAuth({ ...authState, member: { name: name.trim(), contact: contact.trim(), since: Date.now() } }); }
export function memberSignOut() { commitAuth({ ...authState, member: null }); apiSignOut(); }
export function checkRoleCode(role, code) { return (ROLE_CODES[role] || '').toUpperCase() === (code || '').trim().toUpperCase(); }
function useAuth() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((n) => n + 1); authListeners.add(fn); return () => authListeners.delete(fn); }, []);
  return authState;
}
const fmtUSD = (n) => `$${n.toLocaleString('en-US')}`;
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtDateTime = (ms) => new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const ui = {
  logo: '/assets/ui/source_sheets/ui_05_HITKOIN_LOGO.png',
  // The HITMANS VIP AFTER SPOT badge (crown + shield) — the real brand mark used
  // in QR centers and the pass brand stamp (NOT the HITKOIN coin).
  brandBadge: '/assets/ui/complete_ui_set/new_main_menu/new_main_menu/brand/mm_logo_badge.png',
  // Full high-res HITMANS VIP AFTER SPOT logo — the pixel-assembly loading art.
  fullLogo: '/assets/ui/hvas_logo.png',
  // Boot loading screen: logo shatters + vortex, reforms/bursts into the retro
  // logo, bar 0→100 baked in. Full-screen pure-black overlay (no box).
  loadingVideo: '/assets/ui/loading_screen.mp4',
  loadingVideoWebm: '/assets/ui/loading_screen.webm',
  mainMenuBackground: '/assets/ui/main-menu-background.png',
  loading: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_17_001_1672x941.png',
  banners: {
    granted: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_079_350x108.png',
    denied: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_107_350x110.png',
  },
  chips: {
    active: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_081_121x46.png',
    checkedIn: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_083_134x46.png',
    expired: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_082_126x46.png',
    staff: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_085_119x46.png',
    vip: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_084_108x46.png',
  },
  buttons: {
    scan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_108_201x58.png',
    verify: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_109_210x58.png',
    grant: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_110_205x58.png',
    deny: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_114_201x58.png',
    rescan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_115_210x58.png',
    manual: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_116_205x58.png',
    selectPlan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_091_286x54.png',
    upgradeVip: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_130_286x53.png',
    renewPlan: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_154_286x52.png',
  },
  planActions: [
    { label: 'Select Plan', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_091_286x54.png' },
    { label: 'Upgrade To VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_130_286x53.png' },
    { label: 'Renew Plan', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_154_286x52.png' },
  ],
  // PayPal already covers Apple Pay / Venmo / Cash App at checkout, so those
  // aren't listed separately.
  paymentMethods: [
    { label: 'Credit / Debit', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_019_190x46.png' },
    { label: 'Google Pay', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_033_190x47.png' },
    { label: 'PayPal', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_040_189x47.png' },
  ],
  // Tier cards with the purple modular price digits baked directly into the
  // PRICE slot (from the membership sheet) — pixel-exact, no runtime overlay,
  // no ghost boxes. Daily shows $0 (pay-what-you-want / open contribution).
  tiers: [
    { name: 'Daily', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_025_183x338_priced.png' },
    { name: 'Weekly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_026_183x338_priced.png' },
    { name: 'Monthly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_027_181x337_priced.png' },
    { name: 'Yearly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_028_181x337_priced.png' },
    { name: 'VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_029_179x337_priced.png' },
  ],
  titles: {
    membership: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_01_001_897x135.png',
    entry: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_04_001_905x140.png',
    verification: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_11_001_661x220.png',
  },
  passes: [
    { name: 'Daily', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_013_158x227.png' },
    { name: 'Weekly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_014_159x228.png' },
    { name: 'Monthly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_015_161x228.png' },
    { name: 'Yearly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_016_159x228.png' },
    { name: 'VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_04_017_158x228.png' },
  ],
  ribbons: [
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_038_227x43.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_039_227x42.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_040_227x43.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_041_226x42.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_042_227x42.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_01_043_227x43.png',
  ],
  bingo: {
    welcome: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_08_005_512x217.png',
    invite: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_08_079_254x318.png',
    minPlayers: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_025_465x86.png',
    join: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_092_293x79.png',
    ready: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_140_173x71.png',
    party: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_08_142_213x71.png',
  },
  assembled: {
    membership: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_01_186_661x306.png',
    entryMember: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_04_002_472x247.png',
    entryStaff: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_04_080_310x362.png',
    bingoStyle: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_06_228_421x224.png',
    tv: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_07_215_658x301.png',
    lobby: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_08_121_731x364.png',
    player: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_09_191_521x435.png',
    host: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_10_105_636x517.png',
    verification: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_11_064_393x351.png',
    queue: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_12_105_732x490.png',
    winner: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_13_141_467x256.png',
    party: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_15_112_431x297.png',
  },
  styleKit: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_06_001_663x230.png',
    panel: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_094_241x214.png',
    card: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_095_160x217.png',
    qrJoin: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_119_225x300.png',
    timer: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_06_120_226x201.png',
    playNow: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_172_212x73.png',
    viewCards: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_173_162x57.png',
    inviteFriends: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_174_167x57.png',
    leaveGame: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_175_162x57.png',
    musicToggle: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_188_192x39.png',
    sfxToggle: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_06_208_192x38.png',
  },
  tv: {
    header: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_07_072_1264x109.png',
    timerFrame: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_07_081_426x424.png',
    songBanner: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_07_089_538x171.png',
    prizeBadge: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_07_143_175x211.png',
    winnerBanner: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_07_144_364x175.png',
    ticker: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_07_159_982x45.png',
  },
  player: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_09_001_798x103.png',
    emptyCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_035_168x171.png',
    coveredCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_036_168x172.png',
    calledCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_037_167x172.png',
    bonusCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_038_169x174.png',
    lipSyncCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_09_033_171x176.png',
    mark: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_227_124x60.png',
    undo: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_228_125x60.png',
    confirm: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_229_131x60.png',
    bottomNav: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_09_286_537x102.png',
  },
  host: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_10_001_583x242.png',
    liveRound: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_10_045_500x180.png',
    callSong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_103_139x79.png',
    skipSong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_104_136x79.png',
    nextSong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_060_203x66.png',
    pauseRound: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_058_144x72.png',
    endRound: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_10_059_144x72.png',
    hostNotes: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_10_112_286x222.png',
    songHistory: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_10_119_281x248.png',
  },
  verify: {
    valid: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_024_165x61.png',
    expired: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_025_175x61.png',
    trespass: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_026_179x61.png',
    privateMember: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_055_208x54.png',
    cardNumber: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_056_159x54.png',
    djEnters: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_057_312x52.png',
    cardOwner: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_135_172x61.png',
    entryVerified: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_172_267x75.png',
    verifyCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_146_184x53.png',
    rejectCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_11_147_192x53.png',
    keypad: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_088_237x351.png',
    result: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_089_312x286.png',
    qrFrame: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_087_open.png',
    checkInPanel: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_11_064_393x351.png',
  },
  queue: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_12_001_929x77.png',
    nowPlaying: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_12_014_267x165.png',
    queuePanel: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_12_013_248x296.png',
    roundTracker: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_009_201x45.png',
    songQueue: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_005_212x46.png',
    callOrder: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_008_129x47.png',
    allSongs: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_106_93x34.png',
    hipHop: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_109_80x31.png',
    rb: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_117_81x31.png',
    country: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_118_82x31.png',
    dance: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_12_128_80x30.png',
  },
  winner: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_001_553x190.png',
    spotlight: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_023_227x358.png',
    prize: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_093_274x211.png',
    payout: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_13_098_303x206.png',
    first: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_051_259x93.png',
    second: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_056_259x93.png',
    third: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_059_259x93.png',
    correct: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_094_162x39.png',
    wrong: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_095_161x39.png',
    bingo: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_096_170x39.png',
    missed: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_13_097_167x39.png',
  },
  party: {
    title: '/assets/ui/complete_ui_set/sliced_clean/by_type/screens/source_15_001_663x228.png',
    mode: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_014_143x104.png',
    battlez: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_015_160x104.png',
    notEnough: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_016_128x103.png',
    quickPlay: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_017_110x100.png',
    startBattle: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_15_121_442x175.png',
    battleCard: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_15_046_225x205.png',
    hypeMeter: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_15_045_566x162.png',
    reaction1: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_129_61x67.png',
    reaction2: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_130_61x68.png',
    reaction3: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_131_61x68.png',
    reaction4: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_15_132_61x68.png',
  },
  // Role chips (from the MEMBER ENTRY / STAFF VERIFICATION sheet).
  roleChips: {
    member: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_196_135x50.png',
    staff: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_197_130x50.png',
    host: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_198_131x50.png',
    security: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_04_199_165x50.png',
  },
  // Staff dashboard stat widgets with the baked number cropped out — live gold
  // digits are overlaid at runtime (GoldStat).
  widgets: {
    entries: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_04_135_192x131_empty.png',
    event: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_04_136_192x131_empty.png',
    venue: '/assets/ui/complete_ui_set/sliced_clean/by_type/components/source_04_137_192x131_empty.png',
  },
  digits: [
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_001_198x257.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_002_131x262.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_003_181x259.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_004_184x258.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_005_210x257.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_006_185x258.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_010_195x257.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_007_189x256.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_008_194x261.png',
    '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_16_009_192x258.png',
  ],
};

const screens = [
  {
    id: 'home',
    label: 'Menus',
    eyebrow: 'HITMANS VIP',
    title: 'After Spot Main Menu',
    detail: 'Member access, staff check-in, Lip Sync Bingo, and host controls.',
  },
  {
    id: 'characterSelect',
    label: 'Start the Night',
    eyebrow: 'THE NIGHT',
    title: 'Choose Your Character',
    detail: 'Pick who you are tonight — your class changes how the night plays.',
  },
  {
    id: 'payVerify',
    label: 'Pay & Verify',
    eyebrow: 'Front Door',
    title: 'Pay & Verify Entry',
    detail: 'In-person payment, member lookup, staff verification, and venue entry decision.',
  },
  {
    id: 'memberHome',
    label: 'Home',
    eyebrow: 'Member App',
    title: 'Home',
    detail: 'Member overview, quick status, pass summary, and access shortcuts.',
  },
  {
    id: 'myPass',
    label: 'My Pass',
    eyebrow: 'Member Access',
    title: 'My Pass',
    detail: 'Member pass, tier status, QR access, and renewal status.',
  },
  {
    id: 'membership',
    label: 'Membership',
    eyebrow: 'Member Access',
    title: 'Membership',
    detail: 'Your pass, QR, renewal, loyalty rank, and profile — all in one.',
  },
  {
    id: 'motion',
    label: 'Members With Motion',
    eyebrow: 'Promote & Earn',
    title: 'Members With Motion',
    detail: 'Your promo code, share QR, referred headcount, and weekly payout.',
  },
  {
    id: 'eventAccess',
    label: 'Event Access',
    eyebrow: 'Member Access',
    title: 'Event Access',
    detail: 'Events and activations available to the member.',
  },
  {
    id: 'venueAccess',
    label: 'Venue Access',
    eyebrow: 'Member Access',
    title: 'Venue Access',
    detail: 'Venue permissions and access status.',
  },
  {
    id: 'profile',
    label: 'Profile',
    eyebrow: 'Member Account',
    title: 'Profile',
    detail: 'Account, role, and preference controls.',
  },
  {
    id: 'history',
    label: 'History',
    eyebrow: 'Member Account',
    title: 'History',
    detail: 'Check-ins, entries, and activity history.',
  },
  {
    id: 'staffDashboard',
    label: 'Dashboard',
    eyebrow: 'Staff Check-In',
    title: 'Dashboard',
    detail: 'Door status and check-in overview.',
  },
  {
    id: 'searchMember',
    label: 'Search Member',
    eyebrow: 'Staff Check-In',
    title: 'Search Member',
    detail: 'Find a member by name or member number.',
  },
  {
    id: 'checkInLog',
    label: 'Check-In Log',
    eyebrow: 'Staff Check-In',
    title: 'Check-In Log',
    detail: 'Recent door decisions and check-in history.',
  },
  {
    id: 'pricingDigits',
    label: 'Price Digits',
    eyebrow: 'Dynamic Display',
    title: 'Price / Number Display',
    detail: 'Reusable numeric rendering for prices, counts, and codes.',
  },
  {
    id: 'entry',
    label: 'Entry',
    eyebrow: 'Door Check-In',
    title: 'Member Entry',
    detail: 'Live pass checks, staff scan actions, grant/deny states, and role chips.',
  },
  {
    id: 'bingoStyle',
    label: 'Bingo Style',
    eyebrow: 'Lip Sync Bingo',
    title: 'Game Menu',
    detail: 'Bingo-specific buttons, tabs, panels, timers, rewards, and selectors.',
  },
  {
    id: 'tv',
    label: 'TV Display',
    eyebrow: 'Room Display',
    title: 'TV Live Display',
    detail: 'Fullscreen public display for timer, current song, winners, prize, and ticker.',
  },
  {
    id: 'lobby',
    label: 'Lobby',
    eyebrow: 'Lip Sync Bingo',
    title: 'Lip Sync Bingo Lobby',
    detail: 'Join, ready, party mode, invite, tabs, and lobby status screen.',
  },
  {
    id: 'playerCard',
    label: 'Player Card',
    eyebrow: 'Player Game',
    title: 'Bingo Card',
    detail: 'Player card, current song, card states, navigation, mark/undo/confirm screen.',
  },
  {
    id: 'host',
    label: 'Host',
    eyebrow: 'Operator',
    title: 'Host / DJ Control',
    detail: 'Host controls, round selector, queue, notes, song history, and warning states.',
  },
  {
    id: 'verification',
    label: 'Verify',
    eyebrow: 'Host Approval',
    title: 'Card Verification',
    detail: 'QR scan, keypad, member validation, result banners, and entry status.',
  },
  {
    id: 'songQueue',
    label: 'Queue',
    eyebrow: 'Host Tools',
    title: 'Song Queue / Call History',
    detail: 'Queue, now playing, previous calls, filters, objectives, and round tracking.',
  },
  {
    id: 'winner',
    label: 'Winner',
    eyebrow: 'Rewards',
    title: 'Winner Validation / Payout',
    detail: 'Bingo validation, pattern checks, prize badges, ranks, and host approval.',
  },
  {
    id: 'checkout',
    label: 'Checkout',
    eyebrow: 'Checkout',
    title: 'Payment Methods',
    detail: 'Payment buttons only. Dues, card packs, and sheet example values stay out.',
  },
  {
    id: 'party',
    label: 'Party Mode',
    eyebrow: 'Party Mode',
    title: 'Party Mode Battlez',
    detail: 'Battle mode, audience voting, hype meter, teams, and reaction screen.',
  },
];

const loadingPhases = [
  { until: 25, label: 'Access', message: 'Securing access' },
  { until: 55, label: 'Pass', message: 'Verifying pass' },
  { until: 82, label: 'Venue', message: 'Opening venue' },
  { until: 100, label: 'Ready', message: 'Ready' },
];

// ── Roles & access control ──────────────────────────────────────────────
// Three distinct experiences. A user lands on a role picker and only ever
// sees the screens for their role — members never see staff/host tools, and
// host/operator tools are hidden from everyone but the operator. Items can
// be gated behind a session flag via `requires` (shown locked, not hidden,
// so the member knows the path exists — e.g. Event/Venue Access unlock only
// after check-in). Screens not in a role's ALLOWED set are unreachable.
const ROLES = [
  {
    id: 'member',
    label: 'Member',
    tagline: 'Your night, your access',
    eyebrow: 'MEMBER APP',
    chip: 'vip',
    menu: [
      { title: 'My Pass', detail: 'Pass, QR, event & venue access, renewal, loyalty & profile', chip: ui.chips.vip, target: 'membership' },
      { title: 'History', detail: 'Past entries & activity', chip: ui.chips.checkedIn, target: 'history' },
      { title: 'Start the Night', detail: 'Choose your character and play', chip: ui.chips.active, target: 'characterSelect' },
      { title: 'Members With Motion', detail: 'Promote packages, earn 25% of your headcount, paid weekly', chip: ui.chips.active, target: 'motion' },
    ],
    allowed: ['characterSelect', 'membership', 'myPass', 'profile', 'checkout', 'motion', 'history'],
  },
  {
    id: 'staff',
    label: 'Staff Check-In',
    tagline: 'Door and verification tools',
    eyebrow: 'STAFF',
    chip: 'staff',
    menu: [
      { title: 'Door Dashboard', detail: 'Who’s on the way, who’s inside, recent decisions', chip: ui.chips.staff, target: 'staffDashboard' },
      { title: 'Verify at the Door', detail: 'Scan QR or type the member number', chip: ui.chips.active, target: 'verification' },
      { title: 'Watchlist', detail: 'Trespassed & banned members — flag or lift', chip: ui.chips.vip, target: 'watchlist' },
      { title: 'Check-In Log', detail: 'Tonight’s entries & door history', chip: ui.chips.checkedIn, target: 'checkInLog' },
      { title: 'Payments', detail: 'Confirm Zelle / cash membership payments', chip: ui.chips.vip, target: 'payments' },
      { title: 'Members With Motion', detail: 'Your promo code, referred headcount, and weekly payout', chip: ui.chips.active, target: 'motion' },
    ],
    allowed: ['verification', 'staffDashboard', 'watchlist', 'checkInLog', 'payVerify', 'searchMember', 'entry', 'payments', 'motion'],
  },
  {
    id: 'host',
    label: 'Host / Operator',
    tagline: 'Lip Sync Bingo night controls',
    eyebrow: 'OPERATOR',
    chip: 'staff',
    menu: [
      { title: 'Game Menu', detail: 'Bingo setup and selectors', chip: ui.chips.staff, target: 'bingoStyle' },
      { title: 'Lobby', detail: 'Join, ready, party mode', chip: ui.chips.active, target: 'lobby' },
      { title: 'Player Card', detail: 'Card, marks, confirm', chip: ui.chips.checkedIn, target: 'playerCard' },
      { title: 'Host Control', detail: 'Rounds, queue, notes', chip: ui.chips.staff, target: 'host' },
      { title: 'Song Queue', detail: 'Now playing and history', chip: ui.chips.vip, target: 'songQueue' },
      { title: 'Winner · Payout', detail: 'Validate and pay out', chip: ui.chips.vip, target: 'winner' },
      { title: 'TV Display', detail: 'Public room screen', chip: ui.chips.active, target: 'tv' },
      { title: 'Party Mode', detail: 'Battlez and voting', chip: ui.chips.staff, target: 'party' },
    ],
    allowed: ['bingoStyle', 'lobby', 'playerCard', 'host', 'songQueue', 'winner', 'tv', 'party'],
  },
];
const roleById = (id) => ROLES.find((r) => r.id === id) ?? null;

// ── The real roster ─────────────────────────────────────────────────────
// Playable crew — the fighters you pick to run the night. Each reframes the
// whole run (mission types, combat baseline, networking). Portraits are the
// game's own idle frames.
const ROSTER = [
  { id: 'creator', name: 'The Creator', role: 'Movement builder', portrait: '/assets/fighters/creator.png', strong: 'Networking · influence · event bonuses', weak: 'Weaker combat early', accent: '#ff2bd6' },
  { id: 'dj', name: 'The DJ', role: 'Vibe control', portrait: '/assets/fighters/dj.png', strong: 'Audio / VFX crowd boosts', weak: 'Limited street combat', accent: '#7f3cff' },
  { id: 'promoter', name: 'The Promoter', role: 'Guest list', portrait: '/assets/fighters/promoter.png', strong: 'Referrals · crowd pull', weak: 'Soft in a fight early', accent: '#ff2bd6' },
  { id: 'dancer', name: 'The Dancer', role: 'Floor · hype', portrait: '/assets/fighters/dancer.png', strong: 'Mini-games · charisma', weak: 'Low defense', accent: '#ff6b8a' },
  { id: 'host', name: 'The Host', role: 'Runs the room', portrait: '/assets/fighters/host.png', strong: 'Mini-game + dialogue bonuses', weak: 'Mid combat', accent: '#4cc9ff' },
  { id: 'photographer', name: 'The Lens', role: 'Social proof', portrait: '/assets/fighters/photographer.png', strong: 'Marketing · reputation', weak: 'Fragile in fights', accent: '#ffd66b' },
  { id: 'vendor', name: 'The Vendor', role: 'Sells the night', portrait: '/assets/fighters/vendor.png', strong: 'Money · item bonuses', weak: 'Low special meter', accent: '#ffab4c' },
  { id: 'security', name: 'Security', role: 'Keeps the peace', portrait: '/assets/fighters/security.png', strong: 'Combat · block · crowd control', weak: 'Slow networking', accent: '#52ffa8' },
  { id: 'influencer', name: 'The Influencer', role: 'Clout · reach', portrait: '/assets/fighters/influencer.png', strong: 'Reputation · viral missions', weak: 'Needs protection', accent: '#c9b8ff' },
  { id: 'famu_female', name: 'FAMU Student ♀', role: 'Campus to club', portrait: '/assets/fighters/famu_female.png', strong: 'Fast growth · social missions', weak: 'Low starting money', accent: '#52ffa8' },
  { id: 'famu_male', name: 'FAMU Student ♂', role: 'Campus to club', portrait: '/assets/fighters/famu_male.png', strong: 'Fast growth · social missions', weak: 'Low starting money', accent: '#52ffa8' },
  { id: 'fsu_female', name: 'FSU Student ♀', role: 'New to the scene', portrait: '/assets/fighters/fsu_female.png', strong: 'Fast growth · social missions', weak: 'Low starting money', accent: '#ffd66b' },
  { id: 'fsu_male', name: 'FSU Student ♂', role: 'Chasing status', portrait: '/assets/fighters/fsu_male.png', strong: 'Fast growth · social missions', weak: 'Low starting money', accent: '#ffd66b' },
  { id: 'kendrick', name: 'Kendrick', role: 'Kitchen manager · chef', portrait: '/assets/fighters/kendrick.png', strong: 'Kitchen combos · pan block · crowd feed', weak: 'Mid mobility', accent: '#4c9cff' },
  { id: 'kt', name: 'KT', role: 'Cafe8Fifty owner · boss', portrait: '/assets/fighters/kt.png', strong: 'Owner access · money · boss presence', weak: 'Heavy, slower dodge', accent: '#ff3b3b' },
];
// Story / boss tier — met on the route, unlockable later. Shown locked (also
// keeps the two art-remaster fighters, kendrick & kt, from rendering broken).
const STORY_TIER = [
  { id: 'big_soulja', name: 'Big Soulja', note: 'Story ally / wall' },
  { id: 'eld', name: 'Entry Line Disruptor', note: 'Recurring problem' },
  { id: 'predator_pete', name: 'Predator Pete', note: 'Rival boss' },
  { id: 'agent_snow', name: 'Agent Snow', note: 'Final boss' },
];

// Prefix every '/assets/...' path with the deploy base (e.g. '/hvas') so the
// app works under a GitHub Pages project subpath as well as at root. All
// asset paths funnel through the four data objects above, so one in-place
// recursive pass covers every reference.
const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const prefixAssets = (node) => {
  if (typeof node === 'string') return node.startsWith('/assets/') ? ASSET_BASE + node : node;
  if (Array.isArray(node)) return node.map(prefixAssets);
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) node[key] = prefixAssets(node[key]);
    return node;
  }
  return node;
};
[ui, screens, loadingPhases, ROLES, ROSTER].forEach(prefixAssets);

function App() {
  const [activeScreen, setActiveScreen] = useState('home');
  const [targetScreen, setTargetScreen] = useState('home');
  const [role, setRole] = useState(null);       // null until the user picks a role
  const auth = useAuth();                         // member account (self-serve identity)
  const [unlocked, setUnlocked] = useState({ staff: false, host: false }); // per-session code unlock
  const [gate, setGate] = useState(null);        // role awaiting auth: 'member' | 'staff' | 'host'
  const [team, setTeam] = useState(false);       // hidden Team Access screen (reached by holding the crest)
  const member = useMember();                    // subscribe: door verification updates this
  const onTheWay = isOnTheWay(member);           // shared signal: member heading to the venue
  const inside = isInsideTonight(member);        // set when verified at the door — unlocks access
  const [playing, setPlaying] = useState(null); // { id, name } while in the brawler
  const [transition, setTransition] = useState({
    active: true,
    from: 'Loading',
    to: 'After Spot Access Hub',
    progress: 0,
    phase: loadingPhases[0].label,
    message: loadingPhases[0].message,
  });

  const current = screens.find((screen) => screen.id === activeScreen) ?? screens[0];

  useEffect(() => {
    runTransition('Boot', current.title, () => setActiveScreen('home'));
    enforceMembership();       // keep a paid membership or stats start over
    // A shared promo link (?promo=CODE) applies the referrer's code for checkout.
    try { const c = new URLSearchParams(window.location.search).get('promo'); if (c) setActivePromo(c); } catch { /* ignore */ }
    // The app IS the backend: it always runs its own in-browser hub in the
    // background — no "connect to venue", no server. Members come onto the
    // network the moment they buy a membership (see purchaseTier).
    if (!apiEnabled()) startHub();
  }, []);

  function phaseFor(progress) {
    return loadingPhases.find((phase) => progress <= phase.until) ?? loadingPhases.at(-1);
  }

  function runTransition(from, to, commit) {
    const isBoot = from === 'Boot';
    // boot rides the loading film to the frame; ~9.7s clip → hold until it lands
    const duration = isBoot ? 9550 : 3600;
    let committed = false;
    let rafId = 0;
    const startedAt = performance.now();

    setTransition({
      active: true,
      from,
      to,
      progress: 0,
      phase: loadingPhases[0].label,
      message: loadingPhases[0].message,
    });

    const frame = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = t;                                   // linear fill — classic arcade, watchable build
      const progress = Math.min(100, Math.round(eased * 100));
      const phase = phaseFor(progress);

      if (!committed && progress >= 72) {
        committed = true;
        commit();
      }

      setTransition({
        active: true,
        from,
        to,
        progress,
        phase: phase.label,
        message: phase.message,
      });

      if (progress >= 100) {
        // hold on the WELCOME VIP MEMBER / PRESS START beat, longer on boot
        window.setTimeout(() => {
          setTransition((state) => ({ ...state, active: false, progress: 100 }));
        }, isBoot ? 500 : 320);
        return;
      }

      rafId = window.requestAnimationFrame(frame);
    };

    rafId = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(rafId);
  }

  function navigate(nextId) {
    if (nextId === activeScreen || transition.active) return;
    const next = screens.find((screen) => screen.id === nextId);
    if (!next) return;
    // Access control: outside 'home', the target must be in the active role's
    // allowed set — members can never reach staff/host tools, and vice versa.
    if (nextId !== 'home') {
      const r = roleById(role);
      if (!r || !r.allowed.includes(nextId)) return;
    }
    setTargetScreen(nextId);
    runTransition(current.title, next.title, () => {
      setActiveScreen(nextId);
      setTargetScreen(nextId);
    });
  }

  // 'checkedIn' (menu gate + pass indicator) means admitted/inside — driven by
  // the door verification, not the on-the-way toggle.
  const session = { role, onTheWay, checkedIn: inside };
  function chooseRole(id) { setRole(id); setActiveScreen('home'); setTargetScreen('home'); setGate(null); }
  function switchRole() { setRole(null); setActiveScreen('home'); setTargetScreen('home'); setGate(null); }
  // Gate a role behind its auth: members self-serve (need a signed-in account),
  // staff/host need the venue access code (unlocked per session).
  function requestRole(id) {
    if (id === 'member') return auth.member ? chooseRole('member') : setGate('member');
    if (unlocked[id]) return chooseRole(id);
    return setGate(id);
  }

  // In-game takes over the whole screen.
  if (playing) {
    return <GameCanvas fighterId={playing.id} fighterName={playing.name} onExit={() => setPlaying(null)} />;
  }

  return (
    <main className="app-shell menu-shell">
      <div className="dynamic-bg" aria-hidden="true">
        <span className="dynamic-bg-layer dynamic-bg-hitkoin" />
        <span className="dynamic-bg-layer dynamic-bg-vip" />
      </div>
      <TransitionOverlay transition={transition} destination={targetScreen} />
      {!role ? (
        gate === 'member' ? (
          <MemberAuthScreen onBack={() => setGate(null)} onDone={() => chooseRole('member')} />
        ) : gate ? (
          // staff/host code gate — back returns to the hidden Team Access, not the public door
          <CodeGateScreen role={gate} onBack={() => { setGate(null); setTeam(true); }}
            onDone={() => { setUnlocked((u) => ({ ...u, [gate]: true })); chooseRole(gate); }} />
        ) : team ? (
          <TeamAccessScreen onPick={(id) => { setTeam(false); setGate(id); }} onBack={() => setTeam(false)} />
        ) : (
          <MemberDoor onMember={() => requestRole('member')} onStaff={() => setTeam(true)} auth={auth} onSignOut={memberSignOut} />
        )
      ) : (
        <section className={`screen screen-${current.id}`}>
          {current.id === 'home' ? (
            <RoleBadge
              role={roleById(role)}
              onTheWay={onTheWay}
              inside={inside}
              hasMember={!!member}
              onToggleOtw={() => setOnTheWay(!onTheWay)}
              onSwitch={switchRole}
            />
          ) : (
            <ScreenHeader screen={current} onBack={() => navigate('home')} />
          )}
          {current.id === 'home' ? (
            <HomeScreen role={roleById(role)} session={session} navigate={navigate} />
          ) : (
            <ScreenBody activeScreen={current.id} navigate={navigate} session={session} onStartGame={(id, name) => setPlaying({ id, name })} />
          )}
        </section>
      )}
    </main>
  );
}

// Pixel lightning across the full screen — mostly vertical zig-zags down a side.
function makeBolt(W, H) {
  const side = Math.random();
  let ax, ay, bx, by;
  if (side < 0.42) { ax = W * (0.05 + Math.random() * 0.18); ay = 0; bx = ax + (Math.random() - 0.5) * W * 0.16; by = H; }
  else if (side < 0.84) { ax = W * (0.77 + Math.random() * 0.18); ay = 0; bx = ax + (Math.random() - 0.5) * W * 0.16; by = H; }
  else { ax = 0; ay = H * (0.2 + Math.random() * 0.5); bx = W; by = ay + (Math.random() - 0.5) * H * 0.3; }
  const n = 10, pts = [[ax, ay]], jx = W * 0.05, jy = H * 0.04;
  for (let i = 1; i < n; i++) { const tt = i / n; pts.push([ax + (bx - ax) * tt + (Math.random() - 0.5) * jx, ay + (by - ay) * tt + (Math.random() - 0.5) * jy]); }
  pts.push([bx, by]);
  const branch = Math.random() < 0.5 ? (() => { const k = 2 + (Math.random() * (n - 3) | 0); const p0 = pts[k]; return [p0, [p0[0] + (Math.random() - 0.5) * W * 0.16, p0[1] + H * 0.1]]; })() : null;
  return { pts, branch, life: 1 };
}
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// keep the full logo (purple frame included) — tiny trim of the dead black margin
const LOGO_CROP = { x: 0.012, y: 0.012, w: 0.976, h: 0.976 };

// Full-screen arcade loader. Original logo (frame cropped) breaks down into a
// field of magenta energy pixels, which fly back in and regain their colours,
// settling into a CRISP retro pixel logo. Purple haze, gold dust, pixel lightning
// & sparks, white flash, PRESS START. Crisp integer-aligned pixels (no blur mush).
function PixelAssembly({ progress, active }) {
  const canvasRef = useRef(null);
  const st = useRef({ cells: null, GW: 0, GH: 0, img: null, sparks: [], dust: [], bolts: [], lastBolt: 0, progress: 0, ready: false, shake: 0, flash: 0 });
  st.current.progress = progress;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const GW = 74;
      const iw = img.width, ih = img.height;
      const sx = LOGO_CROP.x * iw, sy = LOGO_CROP.y * ih, sw = LOGO_CROP.w * iw, sh = LOGO_CROP.h * ih;
      const GH = Math.max(1, Math.round(GW * sh / sw));
      const oc = document.createElement('canvas'); oc.width = GW; oc.height = GH;
      const octx = oc.getContext('2d');
      octx.clearRect(0, 0, GW, GH); octx.drawImage(img, sx, sy, sw, sh, 0, 0, GW, GH);
      const data = octx.getImageData(0, 0, GW, GH).data;
      const cells = [];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const i = (y * GW + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const lum = 0.3 * r + 0.6 * g + 0.1 * b;
        if (lum < 10) continue;
        cells.push({ x, y, r, g, b, bright: lum > 78,
          hot: Math.random() < 0.4,                           // ~40% burn white-hot in the cloud (ember cores)
          phase: (y / GH) * 0.30 + Math.random() * 0.20,     // top dissolves first (sweep)
          dx: (Math.random() - 0.5) * 8, dy: 1 + Math.random() * 7 });  // spread + fall (no swirl)
      }
      st.current.cells = cells; st.current.GW = GW; st.current.GH = GH; st.current.img = img; st.current.ready = true;
    };
    img.src = ui.fullLogo;
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const s = st.current;
    s.sparks = []; s.dust = []; s.bolts = []; s.shake = 0; s.flash = 0;
    const buf = document.createElement('canvas');
    let raf = 0, last = 0;
    // dissolve envelope: 0 (solid) → 1 (full glowing cloud) → 0 (reformed)
    // solid → dissolve → cloud → REFORM BY ~50% → hold the retro logo while the bar finishes
    const cloud = (p) => (p < 0.12 ? 0 : p < 0.26 ? (p - 0.12) / 0.14 : p < 0.34 ? 1 : p < 0.50 ? 1 - (p - 0.34) / 0.16 : 0);
    const draw = (t) => {
      const cv = canvasRef.current;
      if (cv && s.ready) {
        const dt = last ? Math.min(2, (t - last) / 16.7) : 1; last = t;
        const DPR = Math.min(2, window.devicePixelRatio || 1);
        const W = Math.round((cv.clientWidth || 320) * DPR), H = Math.round((cv.clientHeight || 480) * DPR);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        if (buf.width !== W || buf.height !== H) { buf.width = W; buf.height = H; }
        const ctx = cv.getContext('2d');
        const { cells, GW, GH, img } = s;
        const p = s.progress / 100;
        const cell = Math.round(Math.min((W * 0.92) / GW, (H * 0.64) / GH));
        const logoW = GW * cell, logoH = GH * cell;
        const originX = Math.round((W - logoW) / 2), originY = Math.round(Math.max(H * 0.03, H * 0.44 - logoH / 2));
        const cx = W / 2, cy = originY + logoH / 2;
        const cloudAmt = cloud(p);
        s.shake *= Math.pow(0.85, dt);
        const shx = (Math.random() - 0.5) * s.shake, shy = (Math.random() - 0.5) * s.shake;
        const bx = buf.getContext('2d'); bx.clearRect(0, 0, W, H); bx.imageSmoothingEnabled = false;
        const gp = Math.max(2, Math.round(cell * 0.2)), blk = cell - gp;
        for (const c of cells) {
          const d = Math.max(0, Math.min(1, cloudAmt * 1.45 - c.phase));   // per-cell dissolve amount
          // colour: real → hot magenta (or white-hot ember core) as it dissolves — stays granular, no blob
          const tr = c.hot ? 255 : 255, tg = c.hot ? 190 : 60, tb = c.hot ? 250 : 235;
          const r = c.r + (tr - c.r) * d, g = c.g + (tg - c.g) * d, b = c.b + (tb - c.b) * d;
          const X = Math.round(originX + c.x * cell + c.dx * cell * d + shx);
          const Y = Math.round(originY + c.y * cell + c.dy * cell * d + shy);
          const bs = Math.max(1, Math.round(blk * (1 + d * 0.3)));   // barely swells — pixels stay distinct like embers
          bx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; bx.fillRect(X, Y, bs, bs);
        }
        ctx.clearRect(0, 0, W, H);
        // purple energy haze
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, logoW * 0.72);
        const hz = Math.min(1, p * 3) * (0.5 + cloudAmt * 0.5);
        grd.addColorStop(0, `rgba(150,50,220,${0.3 * hz})`); grd.addColorStop(0.6, `rgba(120,30,200,${0.12 * hz})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
        // clean logo — visible BEFORE the dissolve, then fades back IN after the pixels
        // reform so the held loading state is the glowing retro logo (not raw pixels)
        let smooth = 0;
        if (p < 0.20) smooth = Math.min(1, p < 0.05 ? p / 0.05 : 1 - (p - 0.10) / 0.10) * 0.95;
        else if (p > 0.47) smooth = Math.min(1, (p - 0.47) / 0.12) * 0.92;
        smooth = Math.max(0, smooth);
        if (smooth > 0.01 && img) {
          const iw = img.width, ih = img.height;
          ctx.globalAlpha = smooth; ctx.imageSmoothingEnabled = true;
          ctx.drawImage(img, LOGO_CROP.x * iw, LOGO_CROP.y * ih, LOGO_CROP.w * iw, LOGO_CROP.h * ih, originX + shx, originY + shy, logoW, logoH);
          ctx.globalAlpha = 1;
        }
        // GLOW (strong, especially while dissolved) then crisp pixels on top (crisp
        // fades out when it's a cloud so the cloud stays soft & glowing)
        ctx.globalCompositeOperation = 'lighter';
        ctx.filter = `blur(${Math.max(3, cell * (1 + cloudAmt * 1.1))}px)`; ctx.globalAlpha = 0.35 + cloudAmt * 0.3; ctx.drawImage(buf, 0, 0);
        ctx.filter = `blur(${Math.max(1, cell * 0.5)}px)`; ctx.globalAlpha = 0.45; ctx.drawImage(buf, 0, 0);
        ctx.filter = 'none'; ctx.imageSmoothingEnabled = false;
        // keep the sharp pixels strongly visible even mid-cloud so it reads as distinct embers, not a blob
        ctx.globalAlpha = 1 - cloudAmt * 0.3; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(buf, 0, 0);
        ctx.globalAlpha = 1;
        // gold sparks + purple lightning (heavier during the dissolve) — no swirl
        if (p > 0.18) { const nE = (1 + cloudAmt * 6) | 0; for (let k = 0; k < nE; k++) { const ex = originX + Math.random() * logoW, ey = originY + Math.random() * logoH; const ang = Math.random() * Math.PI * 2, spd = 0.6 + Math.random() * 2.6; s.dust.push({ x: ex, y: ey, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 0.4, life: 1, gold: Math.random() < 0.72 }); } }
        s.dust = s.dust.filter((d) => d.life > 0).slice(-260);
        for (const d of s.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 0.03 * dt; d.life -= 0.018 * dt; const al = Math.max(0, d.life); ctx.globalAlpha = al; ctx.globalCompositeOperation = 'lighter'; ctx.shadowColor = d.gold ? '#ffb648' : '#ff4ad2'; ctx.shadowBlur = cell * 0.7; ctx.fillStyle = d.gold ? '#ffe08a' : '#ff8be6'; const ds = Math.max(2, Math.round(cell * 0.24 * al)); ctx.fillRect(Math.round(d.x), Math.round(d.y), ds, ds); }
        ctx.shadowBlur = 0;
        const boltGap = cloudAmt > 0.3 ? 60 : 150;
        if (t - s.lastBolt > boltGap + Math.random() * 120 && p > 0.18) { s.lastBolt = t; s.bolts.push(makeBolt(W, H)); if (Math.random() < 0.5 + cloudAmt * 0.4) s.bolts.push(makeBolt(W, H)); }
        s.bolts = s.bolts.filter((bl) => bl.life > 0);
        ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
        for (const bl of s.bolts) { bl.life -= 0.15 * dt; const al = Math.max(0, bl.life); const stroke = (pts, w, color, blur) => { ctx.globalAlpha = al; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.shadowColor = '#a13cff'; ctx.shadowBlur = blur; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }; stroke(bl.pts, Math.max(3, cell * 0.3), 'rgba(150,60,255,.5)', cell * 2.2); stroke(bl.pts, Math.max(1.4, cell * 0.12), '#e6c2ff', cell * 0.9); if (bl.branch) stroke(bl.branch, Math.max(1.2, cell * 0.1), '#d6a6ff', cell * 0.7); }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        if (p >= 0.995 && s.flash === 0) { s.flash = 1; s.shake = 4; }
        if (s.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,220,255,${s.flash * 0.4})`; ctx.fillRect(0, 0, W, H); s.flash = Math.max(0, s.flash - 0.1 * dt); ctx.globalCompositeOperation = 'source-over'; }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return <canvas ref={canvasRef} className="pixel-assembly" aria-hidden="true" />;
}

const BAR_SEGMENTS = 18;
function TransitionOverlay({ transition }) {
  const pct = Math.round(transition.progress);
  const done = pct >= 100;
  const filled = Math.round((pct / 100) * BAR_SEGMENTS);
  const isBoot = transition.from === 'Boot';
  // Boot: the branded loading film (logo shatters → vortex → reforms/bursts into the
  // retro logo, bar 0→100 baked in) plays edge-to-edge on pure black, so it reads as
  // one connected screen — not a video pasted into a page.
  if (isBoot) {
    return (
      <div className={transition.active ? 'transition-overlay boot active' : 'transition-overlay boot'} aria-hidden={!transition.active}>
        <video className="boot-film" autoPlay muted playsInline preload="auto" disablePictureInPicture>
          <source src={ui.loadingVideoWebm} type="video/webm" />
          <source src={ui.loadingVideo} type="video/mp4" />
        </video>
      </div>
    );
  }
  // Page-to-page: quick lightweight branded loader (kept short).
  return (
    <div className={transition.active ? 'transition-overlay active' : 'transition-overlay'} aria-hidden={!transition.active}>
      <div className="assembly-wrap">
        <PixelAssembly progress={transition.progress} active={transition.active} />
        <div className="assembly-hud">
          <span className={`assembly-title${done ? ' win' : ''}`}>{done ? 'WELCOME VIP MEMBER' : 'ASSEMBLING VIP ACCESS'}</span>
          <div className="pixbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}>
            {Array.from({ length: BAR_SEGMENTS }, (_, i) => (
              <span key={i} className={`pixbar-seg${i < filled ? ' on' : ''}${i === filled - 1 ? ' flash' : ''}`} />
            ))}
          </div>
          {done
            ? <span className="press-start">PRESS&nbsp;START</span>
            : <><span className="assembly-pct">{pct}%</span><span className="assembly-sub">◆ PREPARING THE ULTIMATE EXPERIENCE ◆</span></>}
        </div>
      </div>
    </div>
  );
}

function ScreenHeader({ screen, onBack }) {
  return (
    <header className="screen-header">
      <button className="back-to-menu" type="button" onClick={onBack}>Home</button>
      <div>
        <span className="eyebrow">{screen.eyebrow}</span>
        <h1>{screen.title}</h1>
        <p>{screen.detail}</p>
      </div>
    </header>
  );
}

function ScreenBody({ activeScreen, navigate, onStartGame, session }) {
  // 'home' is rendered directly by App (role-scoped); ScreenBody only handles
  // the individual screens below.
  if (activeScreen === 'characterSelect') return <CharacterSelectScreen onStartGame={onStartGame} />;
  if (activeScreen === 'myPass' || activeScreen === 'membership' || activeScreen === 'profile') return <MembershipScreen checkedIn={!!session?.checkedIn} />;
  if (activeScreen === 'history') return <HistoryScreen />;
  if (activeScreen === 'motion') return <MembersWithMotionScreen />;
  if (activeScreen === 'staffDashboard') return <StaffDashboardScreen navigate={navigate} />;
  if (activeScreen === 'watchlist') return <WatchlistScreen />;
  if (activeScreen === 'payments') return <PaymentsScreen />;
  if (activeScreen === 'searchMember' || activeScreen === 'payVerify' || activeScreen === 'entry' || activeScreen === 'verification') return <SecurityVerifyScreen />;
  if (activeScreen === 'checkInLog') return <HistoryScreen />;
  if (activeScreen === 'pricingDigits') return <PricingDigitsScreen />;
  if (activeScreen === 'bingoStyle') return <BingoStyleScreen />;
  if (activeScreen === 'tv') return <TvDisplayScreen />;
  if (activeScreen === 'lobby') return <LobbyScreen />;
  if (activeScreen === 'playerCard') return <PlayerCardScreen />;
  if (activeScreen === 'host') return <HostScreen />;
  if (activeScreen === 'songQueue') return <SongQueueScreen />;
  if (activeScreen === 'winner') return <WinnerScreen />;
  if (activeScreen === 'checkout') return <CheckoutScreen />;
  return <PartyScreen />;
}

// Landing role picker — the app entry gate. A user is one of three things,
// and each sees a completely separate surface after this.
// The public front door — MEMBER ONLY. Staff/host tools are never shown here, so
// nobody browsing the app can see (or poke at) the door system. Venue team gets in
// with a "secret handshake": press-and-hold the crest (~1.4s) to reveal Team Access.
function MemberDoor({ onMember, onStaff, auth, onSignOut }) {
  const [hold, setHold] = useState(0);            // 0..1 hold progress ring
  const t0 = useRef(0); const raf = useRef(0);
  const stopHold = () => { cancelAnimationFrame(raf.current); setHold(0); };
  const startHold = () => {
    t0.current = performance.now();
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0.current) / 1400);
      setHold(p);
      if (p >= 1) { cancelAnimationFrame(raf.current); setHold(0); onStaff(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <section className="screen screen-door">
      <div className="door-wrap">
        <button type="button" className={`door-crest${hold > 0 ? ' holding' : ''}`} aria-label="HITMANS VIP AFTER SPOT"
          onPointerDown={startHold} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
          onContextMenu={(e) => e.preventDefault()}>
          <img src={ui.fullLogo} alt="HITMANS VIP AFTER SPOT" draggable="false" />
          <svg className="door-crest-ring" viewBox="0 0 100 100" aria-hidden="true">
            <rect x="3" y="3" width="94" height="94" rx="22" pathLength="1" style={{ strokeDashoffset: 1 - hold }} />
          </svg>
        </button>
        <h1 className="door-title">HITMANS VIP<span>AFTER SPOT</span></h1>
        <p className="door-tag">Tallahassee’s members-only after spot</p>
        {auth?.member ? (
          <div className="door-actions">
            <button type="button" className="door-primary" onClick={onMember}>Enter · {auth.member.name} →</button>
            <button type="button" className="door-ghost" onClick={onSignOut}>Not you? Sign out</button>
          </div>
        ) : (
          <div className="door-actions">
            <button type="button" className="door-primary" onClick={onMember}>Member Sign In →</button>
            <button type="button" className="door-secondary" onClick={onMember}>New here? Become a member</button>
          </div>
        )}
        <p className="door-fine">Members only · verified at the door</p>
      </div>
    </section>
  );
}

// Hidden Team Access — only reachable by holding the crest on the member door.
// Staff & Host still each need the venue access code (next step).
function TeamAccessScreen({ onPick, onBack }) {
  return (
    <section className="screen screen-landing">
      <div className="home-dashboard auth-screen">
        <section className="sheet-title-banner"><div><span>VENUE TEAM · RESTRICTED</span><h1>Team Access</h1></div></section>
        <div className="team-grid">
          {ROLES.filter((r) => r.id !== 'member').map((r) => (
            <button key={r.id} type="button" className={`role-card role-card-${r.id}`} onClick={() => onPick(r.id)}>
              <span className="role-card-eyebrow">{r.eyebrow}</span>
              <strong className="role-card-label">{r.label}</strong>
              <span className="role-card-tagline">{r.tagline}</span>
              <span className="role-card-go">🔒 Access code →</span>
            </button>
          ))}
        </div>
        <p className="role-landing-note">Door staff and hosts only. Each needs the venue access code.</p>
        <button type="button" className="auth-back" onClick={onBack}>← Back to member door</button>
      </div>
    </section>
  );
}

// Camera QR scanner (reuses the device camera + jsQR, like the door). Calls
// onDecode(text) with the first QR it sees.
function QrScan({ onDecode, onCancel }) {
  const videoRef = useRef(null); const rafRef = useRef(0); const streamRef = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr('No camera — paste the address instead.'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!live) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream; const video = videoRef.current; video.srcObject = stream; await video.play();
        const canvas = document.createElement('canvas');
        const tick = () => {
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code) { onDecode(code.data.trim()); return; }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch { setErr('Camera blocked — paste the address instead.'); }
    })();
    return () => { live = false; cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="qr-scan">
      <div className="qr-framed lg"><video className="qr-code cam" ref={videoRef} playsInline muted /></div>
      {err ? <p className="gate-err">{err}</p> : <p className="venue-connect-note">Point at the venue's Join QR</p>}
      <button type="button" className="auth-back" onClick={onCancel}>← Back</button>
    </div>
  );
}

// A big "Join this venue" QR of the venue address, for others to scan.
function JoinQR({ url, onClose }) {
  const qr = useQrDataUrl(url, ui.brandBadge);
  return (
    <div className="join-qr">
      {qr ? <img src={qr} alt="Join QR" /> : <div className="qr-load">QR…</div>}
      <span>Scan to join</span>
      <small>{url}</small>
      <button type="button" className="auth-back" onClick={onClose}>Done</button>
    </div>
  );
}

// Connect this device to a venue backend at RUNTIME — scan its QR or paste the
// URL. No rebuild. The venue's own device is the server (LAN, no cloud); this
// just points the app at it and pulls its config (name, PayPal.me, Zelle).
function ConnectVenue() {
  const cfg = venueConfig();
  const connected = apiEnabled();
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const connectTo = async (u) => {
    setBusy(true); setErr('');
    try { await connectVenue(u); window.location.reload(); }
    catch (e) { setErr(e.message || 'Could not connect'); setScan(false); } finally { setBusy(false); }
  };
  const base = apiBase();
  if (hubOn()) {
    return (
      <div className="venue-connected">
        <span>● This device is the <b>venue hub</b> — no server</span>
        <button type="button" onClick={() => { stopHub(); window.location.reload(); }}>Stop hosting</button>
      </div>
    );
  }
  if (connected) {
    return (
      <div className="venue-connected-wrap">
        <div className="venue-connected">
          <span>● Connected to <b>{cfg.venue || 'venue'}</b></span>
          <button type="button" onClick={() => setShowQR((v) => !v)}>Show join QR</button>
          <button type="button" onClick={() => { disconnectVenue(); window.location.reload(); }}>Disconnect</button>
        </div>
        {showQR && <JoinQR url={base} onClose={() => setShowQR(false)} />}
      </div>
    );
  }
  return (
    <div className="venue-connect">
      <button type="button" className="venue-connect-toggle" onClick={() => setOpen((v) => !v)}>📡 Connect to venue ▾</button>
      {open && (scan ? (
        <QrScan onDecode={(text) => { if (/^https?:\/\//.test(text)) connectTo(text); else { setUrl(text); setScan(false); } }} onCancel={() => setScan(false)} />
      ) : (
        <div className="venue-connect-form">
          <button type="button" className="venue-scan-btn" onClick={() => setScan(true)}>📷 Scan venue QR</button>
          <p className="venue-connect-note">or enter the address</p>
          <input type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }}
            placeholder="http://192.168.1.20:8787" onKeyDown={(e) => e.key === 'Enter' && connectTo(url)} />
          {err && <p className="gate-err">{err}</p>}
          <button type="button" className="venue-connect-go" disabled={!url.trim() || busy} onClick={() => connectTo(url)}>{busy ? 'Connecting…' : 'Connect'}</button>
          <button type="button" className="venue-hub-btn" onClick={async () => { await startHub(); window.location.reload(); }}>
            ✦ Be the venue hub (no server, this device)
          </button>
        </div>
      ))}
    </div>
  );
}

// Member self-serve sign in / sign up. With a backend configured (VITE_HVAS_API)
// this runs a real OTP: enter name + contact → a code is sent → verify → a
// backend session is minted (so the in-venue social layer comes alive). With no
// backend it's the local demo (single step, no code).
function MemberAuthScreen({ onBack, onDone }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [stage, setStage] = useState('id');   // 'id' | 'code'
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const backend = apiEnabled();
  const idOk = name.trim().length >= 2 && contact.trim().length >= 5;

  const finishLocal = () => { memberSignIn(name, contact); onDone(); };

  const sendCode = async () => {
    if (!idOk) return;
    if (!backend) return finishLocal();          // no backend → local demo
    setBusy(true); setErr('');
    try {
      const r = await memberOtpStart(contact.trim());
      setDevCode(r.devCode || '');               // demo backends echo the code
      setStage('code');
    } catch (e) { setErr('Could not send a code — check the connection.'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setErr('');
    try {
      await memberOtpVerify(contact.trim(), code.trim(), name.trim());
      memberSignIn(name, contact);               // keep the local account in sync
      onDone();
    } catch (e) { setErr('Wrong or expired code — try again.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="screen screen-landing">
      <div className="home-dashboard auth-screen">
        <section className="sheet-title-banner"><div><span>MEMBER ACCESS</span><h1>{stage === 'code' ? 'Enter code' : 'Sign in'}</h1></div></section>
        <div className="auth-card">
          {stage === 'id' ? (
            <>
              <label>Your name<input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" autoComplete="name" /></label>
              <label>Phone or email<input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="(850) 000-0000 or you@email.com" autoComplete="tel" /></label>
              {err && <p className="gate-err">{err}</p>}
              <button type="button" className="auth-continue" disabled={!idOk || busy} onClick={sendCode}>
                {busy ? 'Sending…' : backend ? 'Send code →' : 'Continue →'}
              </button>
              <p className="auth-fine">{backend
                ? 'We’ll send a one-time code to confirm it’s you, then create your member account.'
                : 'New here? This creates your member account. Demo mode — no code is sent.'}</p>
            </>
          ) : (
            <>
              <label>6-digit code<input type="text" inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} placeholder="000000" autoComplete="one-time-code" onKeyDown={(e) => e.key === 'Enter' && verify()} /></label>
              {devCode && <p className="auth-fine">Demo code: <code>{devCode}</code> (a real build sends this by SMS/email).</p>}
              {err && <p className="gate-err">{err}</p>}
              <button type="button" className="auth-continue" disabled={code.trim().length < 4 || busy} onClick={verify}>
                {busy ? 'Verifying…' : 'Verify →'}
              </button>
              <button type="button" className="auth-back" onClick={() => { setStage('id'); setErr(''); }}>← Change details</button>
            </>
          )}
          <button type="button" className="auth-back" onClick={onBack}>← Back</button>
        </div>
      </div>
    </section>
  );
}

// Staff / Host venue access-code gate. Client-side demo — production checks the
// code server-side so it can't be read from the bundle.
function CodeGateScreen({ role, onBack, onDone }) {
  const r = roleById(role);
  const [code, setCode] = useState('');
  const [err, setErr] = useState(false);
  const submit = () => { if (checkRoleCode(role, code)) onDone(); else setErr(true); };
  return (
    <section className="screen screen-landing">
      <div className="home-dashboard auth-screen">
        <section className="sheet-title-banner"><div><span>{r.eyebrow} ACCESS</span><h1>{r.label}</h1></div></section>
        <div className="auth-card">
          <p className="gate-lead">🔒 This role can verify entries and run the night. Enter the venue access code to continue.</p>
          <label>Access code<input type="text" value={code} onChange={(e) => { setCode(e.target.value); setErr(false); }}
            placeholder="Venue code" autoComplete="off" onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
          {err && <p className="gate-err">Wrong code — check with the venue.</p>}
          <button type="button" className="auth-continue" disabled={!code.trim()} onClick={submit}>Unlock {r.label} →</button>
          <p className="auth-fine">Demo code for <b>{r.label}</b>: <code>{ROLE_CODES[role]}</code>. In production this is issued per staff member and verified on a server.</p>
          <button type="button" className="auth-back" onClick={onBack}>← Back</button>
        </div>
      </div>
    </section>
  );
}

// Compact header on the role home: current role, an "on the way" toggle a
// member flips when heading over (not entry — that's the door verification),
// an INSIDE indicator once verified, and a way back to the role picker.
function RoleBadge({ role, onTheWay, inside, hasMember, onToggleOtw, onSwitch }) {
  return (
    <header className="role-badge">
      <div className="role-badge-id">
        {ui.roleChips[role.id] && <img className="role-badge-chip" src={ui.roleChips[role.id]} alt="" />}
        <div>
          <span className="eyebrow">{role.eyebrow}</span>
          <h1>{role.label}</h1>
        </div>
      </div>
      <div className="role-badge-actions">
        {role.id === 'member' && hasMember && (
          inside ? (
            <span className="role-badge-checkin inside">● Inside</span>
          ) : (
            <button type="button" className={`role-badge-checkin ${onTheWay ? 'on' : ''}`} onClick={onToggleOtw}>
              {onTheWay ? '● On the way' : '○ On the way'}
            </button>
          )
        )}
        <button type="button" className="role-badge-switch" onClick={onSwitch}>Switch</button>
      </div>
    </header>
  );
}

function HomeScreen({ role, session, navigate }) {
  return (
    <div className="home-dashboard">
      <div className="app-menu-board">
        <AppPanel title={role.label} subtitle={role.tagline}>
          <div className="menu-flow-list">
            {role.menu.map((item, index) => {
              const locked = Boolean(item.requires) && !session[item.requires];
              return (
                <MenuFlowRow
                  key={item.title}
                  index={index + 1}
                  {...item}
                  detail={locked ? 'Locked · verify at the door to unlock' : item.detail}
                  locked={locked}
                  onSelect={() => { if (!locked) navigate(item.target); }}
                />
              );
            })}
          </div>
        </AppPanel>
      </div>
    </div>
  );
}

function PayVerifyScreen() {
  const [selectedTier, setSelectedTier] = useState('Daily');
  const [selectedPayment, setSelectedPayment] = useState('Credit / Debit');
  const [verified, setVerified] = useState(false);
  const selectedPass = ui.passes.find((pass) => pass.name === selectedTier) ?? ui.passes[0];

  return (
    <div className="door-preview-flow">
      <section className="preview-device member-device">
        <header className="preview-device-header">
          <span>Member App</span>
          <strong>Pay & Pass</strong>
        </header>

        <div className="member-pass-preview">
          <img src={selectedPass.src} alt="" />
          <div className="member-pass-live-copy">
            <span>Selected Plan</span>
            <strong>{selectedTier}</strong>
            <small>{selectedPayment}</small>
            <StatusStrip items={[ui.chips.active, selectedTier === 'VIP' ? ui.chips.vip : ui.chips.checkedIn]} />
          </div>
          <div className="qr-placeholder">SCAN</div>
        </div>

        <div className="preview-wallet-strip">
          {ui.tiers.map((tier) => (
            <button
              className={selectedTier === tier.name ? 'preview-pass-button selected' : 'preview-pass-button'}
              type="button"
              key={tier.name}
              onClick={() => setSelectedTier(tier.name)}
              aria-label={`Select ${tier.name} plan`}
            >
              <img src={tier.src} alt="" />
              <span>{tier.name}</span>
            </button>
          ))}
        </div>

        <div className="preview-payment-grid" aria-label="Payment methods">
          {ui.paymentMethods.map((method) => (
            <button
              className={selectedPayment === method.label ? 'image-action selected' : 'image-action'}
              type="button"
              key={method.label}
              onClick={() => setSelectedPayment(method.label)}
              aria-label={method.label}
            >
              <img src={method.src} alt="" />
            </button>
          ))}
        </div>
      </section>

      <section className="preview-device staff-device">
        <header className="preview-device-header">
          <span>Staff Check-In</span>
          <strong>Verification</strong>
        </header>

        <div className="staff-preview-top">
          <label>
            <span>Search Member</span>
            <input type="text" placeholder="Name, phone, or member ID" />
          </label>
          <label>
            <span>Manual Card Number</span>
            <input type="text" placeholder="Enter card number" />
          </label>
        </div>

        <div className="staff-preview-main">
          <div className="staff-check-panel">
            <img src={ui.verify.checkInPanel} alt="" />
          </div>
          <div className="staff-result-panel">
            <img src={verified ? ui.verify.result : ui.verify.entryVerified} alt="" />
            <StatusStrip items={[verified ? ui.verify.valid : ui.verify.expired, ui.verify.privateMember, ui.verify.cardOwner]} />
          </div>
        </div>

        <div className="preview-action-grid">
          <AssetButton src={ui.buttons.scan} label="Scan App" />
          <AssetButton src={ui.buttons.manual} label="Manual Check-In" />
          <button className="image-action" type="button" onClick={() => setVerified(true)} aria-label="Verify Member">
            <img src={ui.verify.verifyCard} alt="" />
          </button>
          <AssetButton src={ui.verify.rejectCard} label="Reject Card" />
        </div>
      </section>

      <section className="door-preview-decision">
        <div>
          <span>Door Verification</span>
          <strong>{verified ? 'Ready To Grant Entry' : 'Payment And Verification Required'}</strong>
        </div>
        <img src={verified ? ui.banners.granted : ui.banners.denied} alt="" />
        <div className="preview-action-grid final-actions">
          <AssetButton src={ui.buttons.rescan} label="Rescan" />
          <AssetButton src={ui.buttons.grant} label="Grant Entry" />
          <AssetButton src={ui.buttons.deny} label="Deny Entry" />
        </div>
      </section>
    </div>
  );
}

// Tier name -> pricing-card artwork (buy screen). The purple price digits are
// baked into each card's PRICE slot at build time — no runtime overlay needed.
const TIER_SRC = Object.fromEntries(ui.tiers.map((t) => [t.name, t.src]));
// Tier name -> member PASS-card artwork (the pass; "MONTHLY PASS", no price).
const PASS_SRC = Object.fromEntries(ui.passes.map((p) => [p.name, p.src]));
// Door-result status -> its alert chip graphic.
const STATUS_CHIP = { valid: ui.verify.valid, expired: ui.verify.expired, trespass: ui.verify.trespass, banned: ui.verify.trespass };

// Brand stamp shown UNDER every generated QR: the HITMANS VIP logo with the
// neon-pink "AFTER SPOT" wordmark, matching the logo art. Makes each pass
// unmistakably ours (the QR payload itself is already unique per member).
function BrandStamp({ compact = false }) {
  return (
    <div className={`qr-brand${compact ? ' compact' : ''}`}>
      <img className="qr-brand-logo" src={ui.brandBadge} alt="HITMANS VIP" />
      <span className="qr-brand-after">AFTER SPOT</span>
    </div>
  );
}

// A dashboard stat widget (frame + icon art only) with all text and the bottom
// bar rebuilt live: neon label + number (the logo's pink-neon look), and either
// a live sparkline tracker (entries) or a dynamic capacity meter (event/venue).
function Meter({ pct }) {
  return <div className="stat-meter"><span style={{ width: `${Math.max(3, Math.min(100, pct))}%` }} /></div>;
}
function Sparkline({ data }) {
  const n = data.length;
  const W = 160, H = 22;
  if (n < 2) return <div className="stat-meter"><span style={{ width: '4%' }} /></div>;
  const max = Math.max(...data), min = Math.min(...data);
  const rng = Math.max(1, max - min);
  const pts = data.map((v, i) => [(i / (n - 1)) * W, H - 2 - ((v - min) / rng) * (H - 5)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const [ex, ey] = pts[n - 1];
  return (
    <svg className="stat-spark" viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="hv-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff3ccb" stopOpacity="0.34" />
          <stop offset="1" stopColor="#ff3ccb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill="url(#hv-spark)" />
      <path d={line} fill="none" stroke="#ff7ae6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="2" fill="#fff" stroke="#ff3ccb" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
function StatWidget({ src, label, value, sub, cap, series }) {
  return (
    <div className="stat-w">
      <img className="stat-w-art" src={src} alt="" />
      <span className="stat-w-label">{label}</span>
      <span className="stat-w-num">{Math.max(0, Math.round(value || 0))}</span>
      <span className="stat-w-sub">{sub}</span>
      <div className="stat-w-track">
        {series ? <Sparkline data={series} /> : <Meter pct={cap ? (value / cap) * 100 : 0} />}
      </div>
    </div>
  );
}

// The pop-up alert shown when a membership is verified — the same overlay on
// the staff door screen and on the member's own "Verify Membership" tap.
// GRANTED / DENIED with the matching VALID / EXPIRED / TRESPASS chip.
function ScanAlert({ result, onDismiss, onRescan, onGrant, onDeny }) {
  if (!result) return null;
  // Scanner/camera messages are NOT a membership denial — show a neutral note,
  // no ACCESS DENIED banner and no "DO NOT ADMIT" verdict.
  if (result.info) {
    return (
      <div className="scan-alert-overlay" onClick={onDismiss}>
        <div className="scan-alert info" onClick={(e) => e.stopPropagation()}>
          <span className="scan-alert-info-icon">📷</span>
          <p className="scan-alert-sub">{result.reason}</p>
          <button type="button" className="scan-alert-dismiss" onClick={onDismiss}>Got it</button>
        </div>
      </div>
    );
  }
  return (
    <div className="scan-alert-overlay" onClick={onDismiss}>
      <div className={`scan-alert ${result.status}`} onClick={(e) => e.stopPropagation()}>
        <img className="scan-alert-banner" src={result.ok ? ui.banners.granted : ui.banners.denied} alt={result.ok ? 'Access granted' : 'Access denied'} />
        {STATUS_CHIP[result.status] && <img className="scan-alert-chip" src={STATUS_CHIP[result.status]} alt={result.status} />}
        {result.member ? (
          <div className="scan-result-row">
            <strong className="scan-result-name">{result.member.name || 'Member'}</strong>
            <span className="scan-result-tier">{result.member.tier}{result.member.vip ? ' VIP' : ''} Member</span>
            <span className="scan-result-num">{result.member.number}</span>
            <small>
              {result.status === 'valid'
                ? `Valid until ${fmtDate(result.member.expiresAt)}`
                : (result.status === 'banned' || result.status === 'trespass')
                  ? result.reason
                  : `Expired ${fmtDate(result.member.expiresAt)}`}
            </small>
            <small className="scan-result-date">Scanned {fmtDateTime(Date.now())}</small>
          </div>
        ) : (
          <p className="scan-alert-sub">{result.reason}</p>
        )}
        <p className={`scan-alert-verdict ${result.ok ? 'go' : 'no'}`}>{result.ok ? 'GRANT ENTRY' : 'DO NOT ADMIT'}</p>
        {/* Door action buttons (real style-kit assets) — shown for staff scans */}
        {(onGrant || onDeny || onRescan) && (
          <div className="scan-actions">
            {onGrant && result.ok && (
              <button type="button" className="asset-cta" onClick={onGrant} aria-label="Grant entry"><img src={ui.buttons.grant} alt="Grant entry" /></button>
            )}
            {onDeny && (
              <button type="button" className="asset-cta" onClick={onDeny} aria-label="Deny entry"><img src={ui.buttons.deny} alt="Deny entry" /></button>
            )}
            {onRescan && (
              <button type="button" className="asset-cta" onClick={onRescan} aria-label="Rescan"><img src={ui.buttons.rescan} alt="Rescan" /></button>
            )}
          </div>
        )}
        <button type="button" className="scan-alert-dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

// Renders a QR of `text`. If `logo` is given, it's composited into the center on
// a canvas — the QR uses high error correction (30% recovery) so it still scans
// with the badge over the middle. Logo load failure falls back to the plain QR.
function useQrDataUrl(text, logo) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    if (!text) { setUrl(''); return undefined; }
    const W = 260;
    QRCode.toDataURL(text, { margin: 1, width: W, errorCorrectionLevel: logo ? 'H' : 'M', color: { dark: '#1b0b2e', light: '#f7ecff' } })
      .then((qrUrl) => {
        if (!logo) { if (live) setUrl(qrUrl); return; }
        const qrImg = new Image();
        qrImg.onload = () => {
          const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = W;
          const ctx = canvas.getContext('2d'); ctx.drawImage(qrImg, 0, 0, W, W);
          const badge = new Image();
          badge.onload = () => {
            const s = Math.round(W * 0.24), x = (W - s) / 2, y = (W - s) / 2, pad = Math.round(s * 0.14), r = 12;
            const px = x - pad, py = y - pad, pw = s + pad * 2, ph = s + pad * 2;
            ctx.fillStyle = '#f7ecff';                 // clear plate so modules don't fight the logo
            ctx.beginPath();
            ctx.moveTo(px + r, py);
            ctx.arcTo(px + pw, py, px + pw, py + ph, r);
            ctx.arcTo(px + pw, py + ph, px, py + ph, r);
            ctx.arcTo(px, py + ph, px, py, r);
            ctx.arcTo(px, py, px + pw, py, r);
            ctx.closePath(); ctx.fill();
            ctx.drawImage(badge, x, y, s, s);
            if (live) setUrl(canvas.toDataURL('image/png'));
          };
          badge.onerror = () => { if (live) setUrl(qrUrl); };
          badge.src = logo;
        };
        qrImg.onerror = () => { if (live) setUrl(qrUrl); };
        qrImg.src = qrUrl;
      }).catch(() => {});
    return () => { live = false; };
  }, [text, logo]);
  return url;
}

// Live HH:MM:SS countdown to a target timestamp. Ticks every second; returns
// null when there's no target.
function useCountdown(target) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!target) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return null;
  const ms = Math.max(0, target - Date.now());
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return { ms, text: `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` };
}

// THE single membership screen: not a member -> buy a tier; member -> your pass.
// "Renew plan" from the pass opens the same tier selector (renew mode).
function MembershipScreen({ checkedIn }) {
  const member = useMember();
  const [renew, setRenew] = useState(false);
  const boughtAt = useRef(member?.purchasedAt);
  useEffect(() => {                                   // purchased in renew mode -> back to pass
    if (renew && member && member.purchasedAt !== boughtAt.current) setRenew(false);
  }, [member?.purchasedAt, renew]);
  if (member && !renew) {
    return <MemberPass member={member} checkedIn={checkedIn}
      onRenew={() => { boughtAt.current = member.purchasedAt; setRenew(true); }} />;
  }
  return <BuyMembership renewMode={!!member} currentTier={member?.tier} onBack={member ? () => setRenew(false) : undefined} />;
}

// Step 1 — you are not a member yet (or you're renewing). Pick a tier, pick how
// you pay, purchase.
function BuyMembership({ renewMode = false, currentTier, onBack } = {}) {
  const [tier, setTier] = useState(currentTier || 'Monthly');
  const [pay, setPay] = useState('PayPal');   // real payable method up front
  const [give, setGive] = useState('');        // open Daily contribution ('' = 0.00)
  const t = TIER_BY[tier];
  const win = t.open ? dailyWindow() : null;         // Daily: open (pay-what-you-want) until 2AM, else $15
  const cd = useCountdown(win ? win.until : null);   // ticks; flips win.free at 2AM
  const openFree = !!(win && win.free);              // in the pay-what-you-want window
  const amount = t.open
    ? (openFree ? Math.max(0, Math.round((Number(give) || 0) * 100) / 100) : DAILY_LATE_PRICE)
    : t.price;
  const free = openFree && amount <= 0;              // $0 contribution → join free
  // Members With Motion: a referral code gives the buyer a discount and credits
  // the promoter. Applied to any real (non-free) charge.
  const [promoField, setPromoField] = useState(activePromo());
  const promo = (promoField || activePromo()).toUpperCase().trim();
  const payAmount = (promo && !free) ? Math.round(amount * (1 - PROMO_DISCOUNT) * 100) / 100 : amount;
  const finalize = (via, amt) => { purchaseTier(tier, via, amt); if (promo) redeemPromo(promo, amt); clearActivePromo(); };
  return (
    <div className="mem-screen">
      {renewMode && onBack && (
        <button type="button" className="mem-selector-back" onClick={onBack}>← Back to your pass</button>
      )}
      <div className="mem-intro">
        <h2>{renewMode ? 'Renew or change your plan' : 'Become a member'}</h2>
        <p>{renewMode
          ? 'Pick the tier you want to renew or switch to. Your member number and loyalty carry over.'
          : 'You must hold a membership to get in. Buy a tier and you’ll get a member card, a number, and a QR code security scans at the door.'}</p>
      </div>
      <div className="tier-buy-grid">
        {TIERS.map((row) => (
          <button
            key={row.name}
            type="button"
            className={`tier-buy-card${tier === row.name ? ' picked' : ''}`}
            onClick={() => setTier(row.name)}
          >
            {/* tier card with the purple price digits baked into the slot */}
            <img className="tier-buy-art" src={TIER_SRC[row.name]} alt={row.name} />
          </button>
        ))}
      </div>

      {/* what the tapped tier comes with, so members choose wisely */}
      <div className="tier-benefits">
        <div className="tier-benefits-head">
          <strong>{tier}{t.vip && tier !== 'VIP' ? ' VIP' : ''} — what you get</strong>
          <span>{t.open ? 'Pay what you want' : t.days >= 365 ? `${fmtUSD(t.price)} / year` : `${fmtUSD(t.price)} · ${t.days} days`}</span>
        </div>
        <ul>
          {(TIER_BENEFITS[tier] || []).map((b) => (
            <li key={b}><span className="tb-check">✓</span>{b}</li>
          ))}
        </ul>
      </div>

      {t.open && openFree && (
        <div className="mem-give">
          <div className="daily-window open">
            <span className="daily-window-label">🎟️ Open contribution · free entry closes in</span>
            <span className="daily-window-clock">{cd?.text || '00:00:00'}</span>
            <span className="daily-window-sub">until 2:00 AM — then entry is ${DAILY_LATE_PRICE}</span>
          </div>
          <span className="mem-pay-label">Name your contribution</span>
          <div className="mem-give-row">
            <span className="mem-give-cur">$</span>
            <input className="mem-give-input" type="number" min="0" step="0.01" inputMode="decimal"
              value={give} onChange={(e) => setGive(e.target.value)} placeholder="0.00" />
          </div>
          <p className="mem-give-note">Pay what you want — even $0.00. Every bit helps keep the door open.</p>
        </div>
      )}
      {t.open && !openFree && (
        <div className="mem-give">
          <div className="daily-window closed">
            <span className="daily-window-label">⏰ Free window closed for tonight</span>
            <span className="daily-window-clock">${DAILY_LATE_PRICE}</span>
            <span className="daily-window-sub">mandatory for entry · free contribution reopens in {cd?.text || '—'}</span>
          </div>
        </div>
      )}

      <div className="mem-promo">
        <span className="mem-pay-label">Promo code <small>(optional)</small></span>
        <input className="mem-promo-input" type="text" value={promoField}
          onChange={(e) => { setPromoField(e.target.value); setActivePromo(e.target.value); }}
          placeholder="Friend's code — save 15%" autoComplete="off" />
        {promo && !free && <p className="mem-promo-on">✓ Code <b>{promo}</b> applied — {Math.round(PROMO_DISCOUNT * 100)}% off</p>}
      </div>

      <div className="mem-pay">
        <span className="mem-pay-label">Pay with</span>
        <div className="mem-pay-grid">
          {ui.paymentMethods.map((m) => (
            <button key={m.label} type="button" className={`image-action${pay === m.label ? ' selected' : ''}`} onClick={() => setPay(m.label)} aria-label={m.label}>
              <img src={m.src} alt="" />
            </button>
          ))}
        </div>
      </div>

      <div className="buy-checkout">
        <p className="buy-summary">
          {tier} membership · {promo && !free && <s className="buy-was">{fmtUSD(amount)}</s>}
          <b>{free ? 'Free' : fmtUSD(payAmount)}</b>{t.vip ? ' · VIP' : ''} · {free ? 'no charge' : pay}
        </p>
        {free ? (
          // Open contribution set to $0 — join free, straight onto the network.
          <button type="button" className="asset-cta" onClick={() => finalize('Free', 0)} aria-label="Join free">
            <img src={ui.buttons.selectPlan} alt="Join free" />
          </button>
        ) : pay === 'PayPal' && tierPayable(tier) && !t.open && !promo ? (
          // Recurring subscription buttons (card / Apple Pay / Venmo / balance)
          <PayPalSubscribe tier={tier} onPaid={() => finalize('PayPal', payAmount)} />
        ) : pay === 'PayPal' && paypalMeEnabled() ? (
          // Instant PayPal.me — buyer pays with card / Apple Pay / Venmo / balance
          <PayPalMeButton price={payAmount} onPaid={() => finalize('PayPal', payAmount)} />
        ) : (
          <button type="button" className="asset-cta" onClick={() => finalize(pay, payAmount)} aria-label={`Buy ${tier} plan`}>
            <img src={ui.buttons.selectPlan} alt="Select plan" />
          </button>
        )}
      </div>
      <p className="mem-fineprint">
        {free
          ? 'Free membership — your card + QR activate instantly and you come onto the network.'
          : pay === 'PayPal' && tierPayable(tier) && !t.open
            ? 'Recurring billing through PayPal — pay with card, Apple Pay, Venmo, or balance. Your card + QR activate on payment.'
            : pay === 'PayPal' && paypalMeEnabled()
              ? 'Opens PayPal to pay — card, Apple Pay, Venmo, or balance, straight to HITMANS VIP. Your card + QR activate after you pay.'
              : 'Pick PayPal above to pay for real (card, Apple Pay, Venmo, or balance). Other methods are demo.'}
      </p>

      <HvasPayOptions tier={tier} price={payAmount} />
    </div>
  );
}

// HVAS Pay — pay by any rail the venue owns (Zelle → Navy Federal, or cash),
// then the app files a claim the owner confirms. Only shown when a backend is
// connected (that's what records + reconciles claims across the mesh).
function HvasPayOptions({ tier, price }) {
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(null);
  const [ref, setRef] = useState('');
  const [claim, setClaim] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!apiEnabled() || !apiToken()) return null;   // needs the ledger backend
  const file = async () => {
    setBusy(true);
    try { const r = await payClaim(tier, rail, ref); setClaim(r); } catch { /* ignore */ }
    finally { setBusy(false); }
  };
  const RAILS = [
    { id: 'zelle', label: 'Zelle', note: zelleHandle() ? `Send $${price} to ${zelleHandle()}` : 'Ask the venue for the Zelle handle' },
    { id: 'cash', label: 'Cash at the door', note: `Bring $${price} — staff confirms you in` },
  ];
  return (
    <div className="hvaspay">
      <button type="button" className="hvaspay-toggle" onClick={() => setOpen((v) => !v)}>Other ways to pay ▾</button>
      {open && (claim ? (
        <div className="hvaspay-done">
          <strong>Claim filed · {claim.id}</strong>
          <p>Pay ${claim.amount} by {claim.rail}. Your membership activates once the venue confirms it — you'll see your card update.</p>
        </div>
      ) : rail ? (
        <div className="hvaspay-form">
          <p className="hvaspay-note">{RAILS.find((r) => r.id === rail).note}</p>
          <input type="text" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Reference (last 4, Zelle name, note)" />
          <div className="hvaspay-row">
            <button type="button" className="auth-back" onClick={() => setRail(null)}>← Back</button>
            <button type="button" className="hvaspay-file" disabled={busy} onClick={file}>{busy ? 'Filing…' : 'I sent it — file claim'}</button>
          </div>
        </div>
      ) : (
        <div className="hvaspay-rails">
          {RAILS.map((r) => (
            <button key={r.id} type="button" className="hvaspay-rail" onClick={() => setRail(r.id)}>
              <strong>{r.label}</strong><span>{r.note}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// PayPal.me — opens the venue's PayPal for a one-tap payment, then activates
// the membership. On the PayPal page the buyer chooses card / Apple Pay / Venmo
// / balance; it all lands in the venue PayPal. No merchant setup needed.
function PayPalMeButton({ price, onPaid }) {
  const [opened, setOpened] = useState(false);
  const pay = () => { window.open(paypalMeLink(price), '_blank', 'noopener'); setOpened(true); };
  return (
    <div className="paypal-box">
      <button type="button" className="paypalme-cta" onClick={pay}>Pay {`$${price}`} with PayPal</button>
      {opened && (
        <button type="button" className="paypalme-confirm" onClick={onPaid}>
          ✓ I paid — activate my membership
        </button>
      )}
    </div>
  );
}

// Real PayPal subscription button — bills the member on the tier's plan to the
// venue's PayPal, then activates the membership on approval.
function PayPalSubscribe({ tier, onPaid }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancelled = false;
    loadPayPal().then((paypal) => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = '';
      paypal.Buttons({
        style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'subscribe' },
        createSubscription: (data, actions) => actions.subscription.create({
          plan_id: planFor(tier),
          custom_id: apiMemberId() || undefined,   // ties the payment to the member (for the webhook)
        }),
        onApprove: () => onPaid(),
        onError: () => setErr('PayPal had a problem — try again.'),
      }).render(ref.current).catch(() => setErr('Could not load PayPal.'));
    }).catch(() => setErr('Could not load PayPal.'));
    return () => { cancelled = true; };
  }, [tier]);
  return <div className="paypal-box"><div ref={ref} className="paypal-btns" />{err && <p className="gate-err">{err}</p>}</div>;
}

// Step 2 — you are a member. This is your card, number, QR, status + actions.
// Live DDd:HHh:MMm until expiry.
function RenewsIn({ expiresAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const ms = Math.max(0, expiresAt - now);
  const p = (n) => String(n).padStart(2, '0');
  return <span className="renews-time">{p(Math.floor(ms / 86400000))}D : {p(Math.floor(ms / 3600000) % 24)}H : {p(Math.floor(ms / 60000) % 60)}M</span>;
}

// Combined Membership + Profile hub — one page: pass, renewal, loyalty rank,
// access ribbons, and preferences.
function MemberPass({ member, checkedIn, onRenew }) {
  const qr = useQrDataUrl(`HVAS-MEMBER:${member.number}`, ui.brandBadge);
  const isVip = member.vip;
  const verified = member.status === 'verified';
  const entries = member.entries || 0;
  const { rank, next } = rankFor(entries);
  const progress = next ? Math.min(100, Math.round(((entries - rank.min) / (next.min - rank.min)) * 100)) : 100;
  // live membership state
  const msLeft = member.expiresAt - Date.now();
  const expired = msLeft <= 0;
  const soon = !expired && msLeft < 7 * 86400000;
  const beenInside = checkedIn || entries > 0;   // event/venue access indicator
  const tierIdx = TIERS.findIndex((t) => t.name === member.tier);
  const nextUp = TIERS[tierIdx + 1] || null;      // step-up target (null at VIP)
  const perk = TIER_PERKS[member.tier] || TIER_PERKS.Daily;
  const tickets = member.tickets ?? perk.tickets;
  useEffect(() => { enforceMembership(); refreshNight(); }, []);   // reset stats if lapsed; reissue perks if we crossed 3AM
  const [prefs, setPrefs] = useState({ music: true, alerts: true, priv: true });
  const togglePref = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  // Member self-verify: same gate the door uses — pops GRANTED / DENIED / etc.
  const [verifyResult, setVerifyResult] = useState(null);

  const penalty = memberPenalty(member.number);
  return (
    <div className="mem-screen mem-pass">
      {penalty && (
        <div className={`mem-penalty ${penalty.kind}`}>
          <strong>{PENALTY_LABEL[penalty.kind]}</strong>
          <span>{penalty.reason || 'Flagged by the venue'}{penalty.by ? ` · ${penalty.by}` : ''}</span>
          <small>Your access is suspended. See a manager at the door.</small>
        </div>
      )}
      {/* — the pass card — */}
      <div className="mem-pass-card" style={{ '--tier-accent': isVip ? '#ffd66b' : '#b06bff' }}>
        <img className="mem-pass-art" src={PASS_SRC[member.tier]} alt={`${member.tier} pass`} />
        <div className="mem-pass-info">
          <span className="mem-pass-eyebrow">HITMANS VIP · Member</span>
          <strong className="mem-pass-tier">{member.tier}{isVip ? ' VIP' : ''}</strong>
          <div className="mem-chip-row">
            <img className="mem-chip" src={expired ? ui.chips.expired : ui.chips.active} alt={expired ? 'Expired' : 'Active'} />
            {isVip && <img className="mem-chip" src={ui.chips.vip} alt="VIP" />}
          </div>
          <dl className="mem-pass-meta">
            {member.name && <div><dt>Name</dt><dd>{member.name}</dd></div>}
            <div><dt>Member #</dt><dd className="mem-number">{member.number}</dd></div>
            {member.contact && <div><dt>Contact</dt><dd>{member.contact}</dd></div>}
            <div><dt>Valid until</dt><dd>{fmtDate(member.expiresAt)}</dd></div>
            <div><dt>Paid with</dt><dd>{member.payment}</dd></div>
          </dl>
          {verified && <img className="mem-verified-alert" src={ui.verify.entryVerified} alt="Entry status: verified" />}
        </div>
        <div className="mem-qr">
          <div className="qr-clean">
            {qr ? <img src={qr} alt="Member QR code" /> : <div className="qr-load">QR…</div>}
          </div>
          <BrandStamp />
          <span>Show at the door to get scanned</span>
          <button type="button" className="asset-cta compact verify-self" onClick={() => setVerifyResult(verifyByNumber(member.number))} aria-label="Verify membership">
            <img src={ui.verify.verifyCard} alt="Verify membership" />
          </button>
        </div>
      </div>

      {/* — tonight's perks: hospitality tickets / meal / drinks — */}
      <section className="perks">
        <h3>Tonight’s perks</h3>
        {perk.tickets > 0 && (
          <div className="perk-tickets">
            <div className="ticket-stub"><b>{tickets}</b><span>hospitality<br />{tickets === 1 ? 'ticket' : 'tickets'}</span></div>
            <div className="perk-body">
              <p>Use inside before <b>3AM</b> · resets nightly.</p>
              <button type="button" className="perk-use" disabled={tickets <= 0} onClick={useTicket}>
                {tickets > 0 ? 'Use a ticket' : 'Used up tonight'}
              </button>
            </div>
          </div>
        )}
        {perk.meal && (
          <div className="perk-row"><span>🍽 Free Cafe8Fifty meal daily</span>
            {member.mealUsed ? <span className="perk-done">Claimed tonight</span> : <button type="button" className="perk-claim" onClick={claimMeal}>Claim</button>}</div>
        )}
        {perk.drinks && <div className="perk-row"><span>🥂 Drinks free all night</span><span className="perk-vip">VIP</span></div>}
        {perk.tickets === 0 && !perk.meal && !perk.drinks && <p className="perk-none">Entry access only. Upgrade for nightly hospitality tickets.</p>}
      </section>

      {/* — renewal countdown — */}
      <div className={`renews-bar${expired ? ' expiredbar' : soon ? ' soon' : ''}`}>
        <span className="renews-tier">{member.tier}{isVip ? ' VIP' : ''} MEMBER<small>{expired ? 'Expired · renew now' : 'Active · thank you!'}</small></span>
        <span className="renews-right"><small>{expired ? 'Status' : 'Renews in'}</small>{expired ? <span className="renews-time exp">EXPIRED</span> : <RenewsIn expiresAt={member.expiresAt} />}</span>
      </div>

      {/* — loyalty rank (earned by nights, not bought) — */}
      <section className="loyalty">
        <h3>Loyalty rank</h3>
        {!isPaidMember(member) && (
          <p className="loyalty-warn">⚠️ Keep a <b>paid membership</b> active to save your loyalty — if it lapses, your rank and nights start over.</p>
        )}
        <div className="loyalty-badges">
          {RANKS.map((r) => (
            <div key={r.name} className={`loyalty-badge${r.name === rank.name ? ' current' : ''}${entries >= r.min ? ' earned' : ''}`}>
              <img src={r.src} alt={r.name} />
            </div>
          ))}
        </div>
        <div className="loyalty-progress">
          <div className="loyalty-bar"><span style={{ width: `${progress}%` }} /></div>
          <p>{next
            ? <><b>{rank.name}</b> · {entries} {entries === 1 ? 'night' : 'nights'} in · {next.min - entries} more to <b>{next.name}</b></>
            : <><b>VIP rank</b> · {entries} nights in · top tier reached</>}</p>
        </div>
        <p className="loyalty-note">Nights count automatically each time security verifies you at the door.</p>
      </section>

      {/* — status indicators (driven by real state, not buttons) — */}
      <div className="access-ribbons">
        {!expired && !soon && <img src={ui.ribbons[0]} alt="Active plan" />}
        {soon && <img src={ui.ribbons[1]} alt="Expires soon" />}
        {(verified || isVip) && <img src={ui.ribbons[2]} alt="VIP verified" />}
        {beenInside && <img src={ui.ribbons[4]} alt="Event access" />}
        {beenInside && <img src={ui.ribbons[5]} alt="Venue access" />}
      </div>
      <p className="access-note">{checkedIn ? 'Verified at the door — inside tonight.' : entries > 0 ? 'Access unlocks each night you get verified at the door.' : 'Get scanned or tap Verify Membership at the door to unlock event & venue access.'}</p>

      {/* — what event/venue access opens once you're inside (folded in from the
            old Event/Venue Access pages) — */}
      <div className={`access-list${beenInside ? '' : ' locked'}`}>
        <div className="access-col">
          <h4>Events</h4>
          <ul><li>Lip Sync Bingo</li><li>VIP Social</li><li>Tonight’s event</li></ul>
        </div>
        <div className="access-col">
          <h4>Venue</h4>
          <ul><li>Front door</li><li>Networking floor</li><li>VIP lounge</li></ul>
        </div>
        {!beenInside && <span className="access-list-lock">🔒 Unlocks when you’re verified inside</span>}
      </div>

      {/* — actions: renew (prominent when expired) + step-up to the next tier — */}
      {expired && <div className="renew-alert">⚠ Your {member.tier} membership expired — renew to get back in.</div>}
      <div className="mem-actions">
        {nextUp && (
          <button type="button" className="upgrade-next" onClick={() => purchaseTier(nextUp.name, member.payment)}
            aria-label={`Upgrade to ${nextUp.name} ${fmtUSD(nextUp.price)}`}>
            <span className="up-label">▲ Upgrade to {nextUp.name}</span>
            <span className="up-price">{fmtUSD(nextUp.price)}</span>
          </button>
        )}
        <button type="button" className={`asset-cta wide${expired ? ' renew-hot' : ''}`} onClick={onRenew}
          aria-label="Renew or change plan">
          <img src={ui.buttons.renewPlan} alt="Renew plan" />
          <span className="asset-cta-note">Choose a plan</span>
        </button>
        {nextUp && nextUp.name !== 'VIP' && (
          <button type="button" className="jump-vip" onClick={() => purchaseTier('VIP', member.payment)}>or jump to VIP · {fmtUSD(TIER_BY.VIP.price)}</button>
        )}
      </div>

      {/* — profile preferences (folded in from the old Profile page) — */}
      <section className="prefs">
        <h3>Profile &amp; preferences</h3>
        {[['music', 'Music'], ['alerts', 'Entry alerts'], ['priv', 'Private member']].map(([k, label]) => (
          <button key={k} type="button" className={`pref-row${prefs[k] ? ' on' : ''}`} onClick={() => togglePref(k)}>
            <span>{label}</span><span className="pref-toggle" aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="mem-cancel" onClick={resetMembership}>Cancel membership</button>
      </section>
      <p className="mem-fineprint">Everything for your membership lives here — pass, QR, renewal, loyalty rank, and profile.</p>

      <ScanAlert result={verifyResult} onDismiss={() => setVerifyResult(null)} />
    </div>
  );
}

// Members With Motion — the referral / promoter program. Generate a promo code
// + share QR; anyone who buys a package with it saves 15% and you earn 25% of
// what your referred headcount pays, tallied per night and paid out weekly.
function MembersWithMotionScreen() {
  const member = useMember();
  const auth = useAuth();
  const [promo, setPromo] = useState(myPromo());
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(id); }, []);
  const name = auth?.member?.name || member?.name || 'Promoter';
  const base = (typeof window !== 'undefined') ? window.location.origin + import.meta.env.BASE_URL : '';
  const shareUrl = promo ? `${base}?promo=${promo.code}` : '';
  const qr = useQrDataUrl(shareUrl, ui.brandBadge);
  const stats = promo ? promoStats(promo.code) : null;
  const [copied, setCopied] = useState('');
  const copy = (text, what) => { try { navigator.clipboard?.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ } };

  return (
    <div className="mem-screen motion-screen">
      <div className="mem-intro">
        <h2>Members With Motion</h2>
        <p>Share your code, put people on the guest list, and get paid. They save {Math.round(PROMO_DISCOUNT * 100)}% — you earn {Math.round(PROMO_PAYOUT * 100)}% of everything your headcount pays. Tallied each night, paid out weekly.</p>
      </div>

      {!promo ? (
        <div className="motion-generate">
          <p>Generate your personal promo code and share QR. It never expires.</p>
          <button type="button" className="motion-gen-btn" onClick={() => setPromo(generatePromo({ name, number: member?.number }))}>
            ✦ Generate my promo code
          </button>
        </div>
      ) : (
        <>
          <div className="motion-card">
            <div className="motion-qr">
              {qr ? <img src={qr} alt="Promo QR" /> : <div className="qr-load">QR…</div>}
              <BrandStamp compact />
              <span>Scan to join with your code</span>
            </div>
            <div className="motion-code-box">
              <span className="motion-code-label">YOUR CODE</span>
              <strong className="motion-code">{promo.code}</strong>
              <div className="motion-code-actions">
                <button type="button" onClick={() => copy(promo.code, 'code')}>{copied === 'code' ? 'Copied ✓' : 'Copy code'}</button>
                <button type="button" onClick={() => copy(shareUrl, 'link')}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
              </div>
            </div>
          </div>

          <div className="motion-stats">
            <div className="motion-stat"><span className="ms-num">{stats.tonightHeads}</span><span className="ms-lbl">tonight’s headcount</span></div>
            <div className="motion-stat"><span className="ms-num">{fmtUSD(stats.tonightRevenue)}</span><span className="ms-lbl">referred tonight</span></div>
            <div className="motion-stat hot"><span className="ms-num">{fmtUSD(stats.weekPayout)}</span><span className="ms-lbl">this week’s payout ({Math.round(PROMO_PAYOUT * 100)}%)</span></div>
          </div>
          <div className="motion-week">
            <span>This week: <b>{stats.weekHeads}</b> people · <b>{fmtUSD(stats.weekRevenue)}</b> referred</span>
            <span className="motion-payout-note">💸 Paid out every Monday. All-time: {stats.allHeads} joins.</span>
          </div>

          {stats.people.length > 0 && (
            <div className="motion-people">
              <h3>Who used your code <small>(your proof)</small></h3>
              <ul>
                {stats.people.slice(0, 30).map((r, i) => (
                  <li key={i}>
                    <span className="mp-who"><b>{r.name}</b>{r.contact ? ` · ${r.contact}` : ''}</span>
                    <span className="mp-amt">{r.paid > 0 ? fmtUSD(r.paid) : 'free'} · {fmtDate(r.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="motion-how">
            <h3>How it works</h3>
            <ol>
              <li>Share your QR or code — text it, post it, show it at the door.</li>
              <li>They scan or type it at checkout and save {Math.round(PROMO_DISCOUNT * 100)}%.</li>
              <li>You earn {Math.round(PROMO_PAYOUT * 100)}% of what they pay — auto-tallied here.</li>
              <li>Payouts go out weekly to your PayPal.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

// Staff door dashboard — live status driven by the shared member store: who's
// signalled on the way, who's been verified inside tonight, and the last door
// decision. Ticks every 30s so the "on the way" age stays fresh.
// Owner reconciliation — the HVAS Pay board. Pending Zelle/cash claims stream
// here (converged over the mesh); confirm activates the membership, void drops it.
function PaymentsScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    if (!apiEnabled() || !apiToken()) { setErr('Connect a backend to reconcile payments.'); setRows([]); return; }
    payPending().then((r) => setRows(r.pending || [])).catch(() => setErr('Could not load payments.'));
  };
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);
  const act = async (id, kind) => { try { await (kind === 'confirm' ? payConfirm(id) : payVoid(id)); load(); } catch { /* ignore */ } };
  return (
    <div className="staff-dash">
      <AppPanel title="Payments" subtitle="Pending Zelle / cash claims">
        {err && <p className="dash-empty">{err}</p>}
        {rows && rows.length === 0 && !err && <p className="dash-empty">No pending payments — you're all caught up.</p>}
        {rows && rows.map((p) => (
          <div key={p.id} className="pay-claim">
            <div className="pay-claim-info">
              <strong>{p.name} · {p.tier} · ${p.amount}</strong>
              <span className="dash-num">{p.number} · {p.rail}{p.reference ? ` · ${p.reference}` : ''}</span>
            </div>
            <div className="pay-claim-actions">
              <button type="button" className="pay-confirm" onClick={() => act(p.id, 'confirm')}>✓ Confirm</button>
              <button type="button" className="pay-void" onClick={() => act(p.id, 'void')}>Void</button>
            </div>
          </div>
        ))}
      </AppPanel>
      <p className="mem-fineprint">A member's card activates the moment you confirm their payment. PayPal payments auto-activate and don't show here.</p>
    </div>
  );
}

// Trespass / Ban / Clear controls for a member row. Writes to the hub op-log so
// the flag lands on the member's profile and every door instantly.
function PenaltyControls({ member }) {
  const [, force] = useState(0);
  const pen = memberPenalty(member.number);
  const flag = (kind, reason) => { penalizeMember(member.number, member.name, kind, reason); force((n) => n + 1); };
  if (pen) {
    return (
      <div className="dash-actions">
        <span className={`dash-flag ${pen.kind}`}>{PENALTY_LABEL[pen.kind]}</span>
        <button type="button" className="dash-pen clear" onClick={() => flag('cleared', '')}>Lift flag</button>
      </div>
    );
  }
  return (
    <div className="dash-actions">
      <button type="button" className="dash-pen trespass" onClick={() => flag('trespass', 'Trespassed at the door')}>Trespass</button>
      <button type="button" className="dash-pen ban" onClick={() => flag('banned', 'Banned from the venue')}>Ban</button>
    </div>
  );
}

function StaffDashboardScreen({ navigate }) {
  const member = useMember();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(id); }, []);

  const incoming = isOnTheWay(member);
  const inside = isInsideTonight(member);
  const ago = (ts) => {
    if (!ts) return '';
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    return mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} mins ago`;
  };
  const lastDecision = member && member.verifiedAt
    ? { status: member.status === 'expired' ? 'expired' : 'valid', when: member.verifiedAt }
    : null;

  const entriesTotal = member?.entries || 0;
  const insideCount = inside ? 1 : 0;
  // live tracker: append tonight's entry count to a rolling series every 4s
  const [spark, setSpark] = useState(() => Array.from({ length: 14 }, () => entriesTotal));
  useEffect(() => {
    const id = setInterval(() => setSpark((s) => [...s.slice(1), (memberState?.entries || 0)]), 4000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setSpark((s) => [...s.slice(1), entriesTotal]); }, [entriesTotal]);
  return (
    <div className="staff-dash">
      <div className="stat-widgets">
        <StatWidget src={ui.widgets.entries} label="TODAY’S ENTRIES" sub="TOTAL CHECK-INS" value={entriesTotal} series={spark} />
        <StatWidget src={ui.widgets.event} label="EVENT ACCESS" sub="THIS EVENT" value={entriesTotal} cap={150} />
        <StatWidget src={ui.widgets.venue} label="VENUE ACCESS" sub="CURRENTLY INSIDE" value={insideCount} cap={100} />
      </div>
      <AppPanel title="On the way" subtitle="Members heading over">
        {incoming ? (
          <div className="dash-row incoming">
            <span className="dash-dot amber" />
            <div className="dash-info">
              <strong>{member.name || 'Member'} · {member.tier}{member.vip ? ' VIP' : ''}</strong>
              <span className="dash-num">{member.number}{member.contact ? ` · ${member.contact}` : ''}</span>
              <PenaltyControls member={member} />
            </div>
            <span className="dash-when">{ago(member.onTheWayAt)}</span>
          </div>
        ) : (
          <p className="dash-empty">No members signalled on the way right now.</p>
        )}
      </AppPanel>

      <AppPanel title="Inside tonight" subtitle="Verified at the door">
        {inside ? (
          <div className="dash-row inside">
            <span className="dash-dot green" />
            <div className="dash-info">
              <strong>{member.name || 'Member'} · {member.tier}{member.vip ? ' VIP' : ''}</strong>
              <span className="dash-num">{member.number}{member.contact ? ` · ${member.contact}` : ''}</span>
              <PenaltyControls member={member} />
            </div>
            <span className="dash-when">entry #{member.entries}</span>
          </div>
        ) : (
          <p className="dash-empty">Nobody verified inside yet tonight.</p>
        )}
      </AppPanel>

      <AppPanel title="Last door decision" subtitle="Most recent scan">
        {lastDecision ? (
          <div className={`dash-row ${lastDecision.status}`}>
            <img className="dash-chip" src={STATUS_CHIP[lastDecision.status]} alt={lastDecision.status} />
            <div>
              <strong>{lastDecision.status === 'valid' ? 'Granted' : 'Denied'} · {member.name || 'Member'}</strong>
              <span className="dash-num">{member.number}{member.contact ? ` · ${member.contact}` : ''}</span>
            </div>
            <span className="dash-when">{ago(lastDecision.when)}</span>
          </div>
        ) : (
          <p className="dash-empty">No scans yet this shift.</p>
        )}
      </AppPanel>

      <button type="button" className="asset-cta wide" onClick={() => navigate('verification')} aria-label="Verify at the door">
        <img src={ui.verify.verifyCard} alt="Verify at the door" />
      </button>
      <button type="button" className="dash-watchlist-link" onClick={() => navigate('watchlist')}>
        ⚠ Watchlist — trespassed &amp; banned members
      </button>
    </div>
  );
}

// The venue watchlist: every member currently flagged trespass/banned, pulled
// from the hub op-log so it's the same list on every staff device. Staff can
// lift a flag here; that too converges everywhere.
function WatchlistScreen() {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(id); }, []);
  const rows = penalizedMembers();
  const lift = (m) => { penalizeMember(m.number, m.name, 'cleared', ''); tick((n) => n + 1); };
  return (
    <div className="staff-dash">
      <AppPanel title="Watchlist" subtitle="Trespassed & banned — visible to all staff">
        {rows.length === 0 ? (
          <p className="dash-empty">No flagged members. The list is clear.</p>
        ) : rows.map((m) => (
          <div key={m.number} className={`dash-row ${m.kind}`}>
            <img className="dash-chip" src={STATUS_CHIP[m.kind]} alt={m.kind} />
            <div className="dash-info">
              <strong>{m.name || 'Member'} <span className={`dash-flag ${m.kind}`}>{PENALTY_LABEL[m.kind]}</span></strong>
              <span className="dash-num">{m.number}</span>
              <span className="dash-reason">{m.reason || '—'}{m.by ? ` · by ${m.by}` : ''} · {fmtDateTime(m.at)}</span>
            </div>
            <button type="button" className="dash-pen clear" onClick={() => lift(m)}>Lift</button>
          </div>
        ))}
      </AppPanel>
      <p className="mem-fineprint">Flagging a member at the door adds them here and warns every scanner. Lifting a flag restores their access everywhere.</p>
    </div>
  );
}

// Security (staff) side: scan the member's QR or type their number to verify.
// AVAILABLE / ACTIVE / VERIFIED are RESULTS shown here — not buttons.
function SecurityVerifyScreen() {
  const member = useMember();
  const [num, setNum] = useState('');
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [ready, setReady] = useState(false);        // first camera frame arrived
  const [query, setQuery] = useState('');           // "search member" box
  const hits = query ? searchMembers(query) : [];
  const videoRef = useRef(null);
  const rafRef = useRef(0);
  const streamRef = useRef(null);

  function stopScan() {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false); setReady(false);
  }
  useEffect(() => () => stopScan(), []);

  async function startScan() {
    setResult(null); setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) { setResult({ info: true, reason: 'No camera on this device — type the member number below instead.' }); return; }
    setScanning(true);                              // show the live view + "starting" immediately
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      const video = videoRef.current;               // always mounted now — ref is valid
      if (!video) { stream.getTracks().forEach((t) => t.stop()); setScanning(false); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const canvas = document.createElement('canvas');
      let gotFrame = false;
      const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
          if (!gotFrame) { gotFrame = true; setReady(true); }
          canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height);
          if (code) {
            const parsed = code.data.replace('HVAS-MEMBER:', '').trim();
            setNum(parsed); stopScan(); setResult(verifyByNumber(parsed)); return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch { setResult({ info: true, reason: 'Camera permission is blocked. Allow camera access in your browser, or type the member number below.' }); stopScan(); }
  }

  const dismiss = () => setResult(null);
  return (
    <div className="verify-screen">
      <div className="verify-panel">
        <h2>Door verification</h2>
        <p>Search, scan the member’s QR, or type their number. No valid membership = no entry.</p>

        <div className="verify-search">
          <label htmlFor="memsearch">Search member</label>
          <input id="memsearch" type="text" placeholder="Search by name or ID…" value={query}
            onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          {hits.length > 0 && (
            <div className="verify-hits">
              {hits.map((h) => (
                <button type="button" key={h.number} className="verify-hit"
                  onClick={() => { setNum(h.number); setQuery(''); setResult(verifyByNumber(h.number)); }}>
                  <strong>{h.name}</strong>
                  <span>{h.number}{h.contact ? ` · ${h.contact}` : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="verify-scanbox">
          {/* Clean full SQUARE scan window (matches the Master Style Kit's
              SCAN MEMBER QR CODE frame): camera fills the whole square, with a
              crown, thin neon-purple corner brackets, scanline, ALIGN label and
              the logo watermark on top. Video is always mounted so the ref
              exists the moment the stream arrives. */}
          <div className="qr-scanframe sq">
            <video className={`qr-cam${scanning && ready ? ' live' : ''}`} ref={videoRef} playsInline muted autoPlay />
            {scanning && ready && (
              <>
                <div className="qr-scanline2" aria-hidden="true" />
                <img className="qr-scan-logo-img" src={ui.brandBadge} alt="" aria-hidden="true" />
              </>
            )}
            <span className="qr-br tl" aria-hidden="true" />
            <span className="qr-br tr" aria-hidden="true" />
            <span className="qr-br bl" aria-hidden="true" />
            <span className="qr-br br" aria-hidden="true" />
            <span className="qr-align">★ ALIGN QR CODE HERE ★</span>
            {!scanning && <div className="qr-cam-off">Camera off</div>}
            {scanning && !ready && <div className="qr-cam-off starting">Starting camera…</div>}
          </div>
          {scanning
            ? <button type="button" className="mem-cancel" onClick={stopScan}>Stop camera</button>
            : <button type="button" className="asset-cta" onClick={startScan} aria-label="Scan app"><img src={ui.buttons.scan} alt="Scan app" /></button>}
        </div>

        <div className="verify-manual">
          <label htmlFor="memnum">Or enter member number</label>
          <div className="verify-manual-row">
            <input id="memnum" type="text" placeholder="HV-0000-0000" value={num}
              onChange={(e) => setNum(e.target.value)} autoComplete="off" />
            <button type="button" className="asset-cta compact" onClick={() => setResult(verifyByNumber(num))} aria-label="Verify card">
              <img src={ui.verify.verifyCard} alt="Verify card" />
            </button>
          </div>
        </div>

        <p className="verify-hint">{member ? `A member card is on file (${member.number}) — scan or type it to test a pass.` : 'No membership on file yet. Buy one as a Member first, then verify it here.'}</p>
      </div>

      <ScanAlert result={result} onDismiss={dismiss}
        onRescan={() => { setResult(null); startScan(); }}
        onGrant={result?.member ? () => setResult(null) : undefined}
        onDeny={result?.member ? () => setResult(null) : undefined} />
    </div>
  );
}

function PricingDigitsScreen() {
  return (
    <div className="assembled-page digits-page">
      <div className="digit-asset-strip">
        {ui.digits.map((digit, index) => (
          <img src={digit} alt="" key={`${digit}-${index}`} />
        ))}
      </div>
      <div className="metric-grid">
        <MetricTile label="Price" value="$ --" />
        <MetricTile label="Members" value="--" />
        <MetricTile label="Room" value="----" />
      </div>
    </div>
  );
}

function EntryScreen() {
  return (
    <div className="assembled-page entry-page">
      <div className="entry-preview-grid">
        <div className="live-pass-card">
          <img src={ui.logo} alt="" />
          <div>
            <span>Member Pass</span>
            <strong>Active Member</strong>
            <small>Member # HV-000000 - Valid Today</small>
            <StatusStrip items={[ui.chips.active, ui.chips.vip]} />
          </div>
          <div className="qr-placeholder">PASS</div>
        </div>
        <div className="staff-scan-card">
          <strong>Staff Verification</strong>
          <div className="scan-box compact"><span>Ready To Scan</span></div>
          <small>Search, scan, or enter member number.</small>
        </div>
      </div>
      <div className="entry-action-dock">
        <StatusStrip items={[ui.chips.active, ui.chips.checkedIn, ui.chips.vip, ui.chips.staff]} />
        <div className="staff-image-actions">
          <AssetButton src={ui.buttons.scan} label="Scan App" />
          <AssetButton src={ui.buttons.verify} label="Verify Member" />
          <AssetButton src={ui.buttons.grant} label="Grant Entry" />
          <AssetButton src={ui.buttons.deny} label="Deny Entry" />
          <AssetButton src={ui.buttons.rescan} label="Rescan" />
          <AssetButton src={ui.buttons.manual} label="Manual Check-In" />
        </div>
      </div>
    </div>
  );
}

function BingoStyleScreen() {
  return (
    <div className="assembled-page bingo-style-page">
      <div className="style-kit-dock">
        <img src={ui.styleKit.panel} alt="" />
        <img src={ui.styleKit.timer} alt="" />
        <div className="bingo-action-grid">
          <AssetButton src={ui.bingo.join} label="Join Game" />
          <AssetButton src={ui.bingo.ready} label="Ready" />
          <AssetButton src={ui.bingo.party} label="Party Mode" />
        </div>
      </div>
    </div>
  );
}

function TvDisplayScreen() {
  return (
    <div className="assembled-page tv-page">
      <div className="tv-piece-row">
        <img src={ui.tv.header} alt="" />
        <img src={ui.tv.timerFrame} alt="" />
        <img src={ui.tv.songBanner} alt="" />
        <img src={ui.tv.winnerBanner} alt="" />
      </div>
    </div>
  );
}

function LobbyScreen() {
  return (
    <div className="assembled-page lobby-page">
      <div className="lobby-piece-row">
        <img src={ui.bingo.welcome} alt="" />
        <img src={ui.bingo.invite} alt="" />
        <div className="bingo-action-grid">
          <AssetButton src={ui.bingo.join} label="Join Game" />
          <AssetButton src={ui.bingo.ready} label="Ready" />
          <AssetButton src={ui.bingo.party} label="Party Mode" />
        </div>
      </div>
    </div>
  );
}

function PlayerCardScreen() {
  return (
    <div className="assembled-page player-page">
      <div className="player-piece-row">
        <img src={ui.player.emptyCard} alt="" />
        <img src={ui.player.coveredCard} alt="" />
        <img src={ui.player.calledCard} alt="" />
        <img src={ui.player.lipSyncCard} alt="" />
        <div className="staff-image-actions">
          <AssetButton src={ui.player.mark} label="Mark" />
          <AssetButton src={ui.player.undo} label="Undo" />
          <AssetButton src={ui.player.confirm} label="Confirm" />
        </div>
      </div>
    </div>
  );
}

function HostScreen() {
  return (
    <div className="assembled-page host-page">
      <div className="host-piece-row">
        <img src={ui.host.liveRound} alt="" />
        <img src={ui.host.songHistory} alt="" />
        <img src={ui.host.hostNotes} alt="" />
        <div className="staff-image-actions">
          <AssetButton src={ui.host.callSong} label="Call Song" />
          <AssetButton src={ui.host.skipSong} label="Skip Song" />
          <AssetButton src={ui.host.nextSong} label="Next Song" />
          <AssetButton src={ui.host.pauseRound} label="Pause Round" />
        </div>
      </div>
    </div>
  );
}

function VerificationScreen() {
  return (
    <div className="assembled-page verification-page">
      <div className="verify-piece-row">
        <img src={ui.verify.keypad} alt="" />
        <img src={ui.verify.result} alt="" />
        <div className="status-strip">
          {[ui.verify.valid, ui.verify.expired, ui.verify.trespass, ui.verify.privateMember].map((item) => <img src={item} alt="" key={item} />)}
        </div>
        <div className="staff-image-actions">
          <AssetButton src={ui.verify.verifyCard} label="Verify Card" />
          <AssetButton src={ui.verify.rejectCard} label="Reject Card" />
        </div>
      </div>
    </div>
  );
}

function SongQueueScreen() {
  return (
    <div className="assembled-page queue-page">
      <div className="queue-piece-row">
        <img src={ui.queue.nowPlaying} alt="" />
        <img src={ui.queue.queuePanel} alt="" />
        <img src={ui.queue.roundTracker} alt="" />
        <div className="genre-chip-row">
          {[ui.queue.allSongs, ui.queue.hipHop, ui.queue.rb, ui.queue.country, ui.queue.dance].map((item) => <img src={item} alt="" key={item} />)}
        </div>
      </div>
    </div>
  );
}

function WinnerScreen() {
  return (
    <div className="assembled-page winner-page">
      <div className="winner-piece-row">
        <img src={ui.winner.spotlight} alt="" />
        <img src={ui.winner.prize} alt="" />
        <img src={ui.winner.payout} alt="" />
        <div className="genre-chip-row">
          {[ui.winner.correct, ui.winner.wrong, ui.winner.bingo, ui.winner.missed].map((item) => <img src={item} alt="" key={item} />)}
        </div>
      </div>
    </div>
  );
}

function CheckoutScreen() {
  return (
    <div className="sheet-screen-grid checkout-flow">
      <AppPanel title="Payment Methods" subtitle="Checkout">
        <CheckoutMethods />
      </AppPanel>
      <AppPanel title="Checkout State" subtitle="Live payment step">
        <div className="checkout-state">
          <strong>Select Payment</strong>
          <span>Plan price and member status render from app data.</span>
        </div>
      </AppPanel>
    </div>
  );
}

function PartyScreen() {
  return (
    <div className="assembled-page party-page">
      <div className="party-piece-row">
        <img src={ui.party.battleCard} alt="" />
        <img src={ui.party.hypeMeter} alt="" />
        <img src={ui.party.startBattle} alt="" />
        <div className="reaction-row">
          {[ui.party.reaction1, ui.party.reaction2, ui.party.reaction3, ui.party.reaction4].map((item) => <img src={item} alt="" key={item} />)}
        </div>
      </div>
    </div>
  );
}

function PassScreen() {
  return (
    <div className="pass-layout refined">
      <AppPanel title="My Pass" subtitle="Menu destination">
        <p className="panel-note">This page will hold the live member pass after the menu system is approved. Sheet examples with names and fake IDs are not used as live member data.</p>
        <StatusStrip items={[ui.chips.active, ui.chips.vip]} />
      </AppPanel>
      <AppPanel title="Plan Actions" subtitle="Renewal and upgrade controls">
        <div className="tier-live-grid">
          {ui.tiers.map((tier) => (
            <button className="image-action tile-image-button" type="button" key={tier.name} aria-label={`${tier.name} ${tier.status}`}>
              <img src={tier.src} alt="" />
              <span>{tier.status}</span>
            </button>
          ))}
        </div>
        <PlanActionGrid />
        <CheckoutMethods />
      </AppPanel>
    </div>
  );
}

function EventScreen() {
  return (
    <div className="access-screen-grid">
      <AppPanel title="Event Access" subtitle="Tonight">
        <AccessRow title="Main Floor Social" status="Unlocked" chip={ui.chips.active} />
        <AccessRow title="Lip Sync Bingo" status="Available" chip={ui.chips.checkedIn} />
        <AccessRow title="VIP Lounge" status="VIP Verified" chip={ui.chips.vip} />
      </AppPanel>
      <AppPanel title="Plan Actions" subtitle="Shown only when needed">
        <p className="panel-note">If access expires, the member chooses a plan action first, then finishes through a payment method.</p>
        <PlanActionGrid />
        <CheckoutMethods />
      </AppPanel>
    </div>
  );
}

function VenueScreen() {
  return (
    <div className="venue-screen-grid menu-only">
      <AppPanel title="Venue Access" subtitle="Venue menu">
        <AccessRow title="Front Door" status="Granted" chip={ui.chips.active} />
        <AccessRow title="Networking Floor" status="Open" chip={ui.chips.checkedIn} />
        <AccessRow title="VIP Lounge" status="VIP" chip={ui.chips.vip} />
      </AppPanel>
    </div>
  );
}

function StaffScreen() {
  return (
    <div className="staff-grid refined">
      <AppPanel title="Staff Verification" subtitle="Menu destination">
        <p className="panel-note">Staff verification will use live member search, scan, and tier data. Sheet panels with example fields stay as blueprints.</p>
        <div className="staff-image-actions">
          <AssetButton src={ui.buttons.scan} label="Scan App" />
          <AssetButton src={ui.buttons.verify} label="Verify Member" />
        </div>
      </AppPanel>
      <AppPanel title="Door Result" subtitle="Grant or deny entry">
        <div className="staff-actions blueprint-actions">
          <AssetButton src={ui.buttons.rescan} label="Rescan" />
          <AssetButton src={ui.buttons.grant} label="Grant Entry" />
          <AssetButton src={ui.buttons.manual} label="Manual Check-In" />
          <AssetButton src={ui.buttons.deny} label="Deny Entry" />
        </div>
      </AppPanel>
    </div>
  );
}

function BingoScreen() {
  return (
    <div className="bingo-grid refined">
      <AppPanel title="Lip Sync Bingo Lobby" subtitle="Menu destination">
        <p className="panel-note">Bingo lobby room codes, player counts, queues, and timers will be generated live. The sheet numbers are examples only.</p>
      </AppPanel>
      <AppPanel title="Round Status" subtitle="Host and player overview">
        <AccessRow title="Lobby" status="Ready" chip={ui.chips.active} />
        <AccessRow title="Cards" status="Menu" chip={ui.chips.checkedIn} />
        <AccessRow title="Rewards" status="Menu" chip={ui.chips.vip} />
      </AppPanel>
    </div>
  );
}

function SimpleAccessScreen({ title, rows }) {
  const chips = [ui.chips.active, ui.chips.checkedIn, ui.chips.vip];

  return (
    <div className="simple-menu-screen">
      <AppPanel title={title} subtitle="Live menu">
        {rows.map((row, index) => (
          <AccessRow
            key={row}
            title={row}
            status={index === 0 ? 'Active' : 'Ready'}
            chip={chips[index % chips.length]}
          />
        ))}
      </AppPanel>
      <AppPanel title="Member Status" subtitle="System data">
        <StatusStrip items={[ui.chips.active, ui.chips.checkedIn, ui.chips.vip]} />
        <p className="panel-note">This screen is ready for live member, venue, and event data. Sheet example text stays out of the app.</p>
      </AppPanel>
    </div>
  );
}

function ProfileScreen() {
  const member = useMember();
  return (
    <div className="profile-grid">
      <AppPanel title="Member Profile" subtitle="Identity">
        <div className="profile-card">
          <img src={ui.logo} alt="" />
          <div>
            <strong>{member ? `${member.tier}${member.vip ? ' VIP' : ''} Member` : 'Not a member yet'}</strong>
            <span>{member ? `Member # ${member.number}` : 'Buy a tier in Membership & Pass to activate your card.'}</span>
            <div className={`mem-status ${member ? (member.status === 'verified' ? 'verified' : 'active') : 'none'}`}>
              {member ? (member.status === 'verified' ? 'VERIFIED AT DOOR' : 'ACTIVE') : 'NO CARD'}
            </div>
          </div>
        </div>
        {member && <p className="panel-note">Valid until {fmtDate(member.expiresAt)} · paid with {member.payment}. Your card + QR live in Membership &amp; Pass.</p>}
      </AppPanel>
      <AppPanel title="Preferences" subtitle="Member settings">
        <AccessRow title="Music" status="On" chip={ui.chips.active} />
        <AccessRow title="Entry Alerts" status="On" chip={ui.chips.checkedIn} />
        <AccessRow title="Private Member" status={member ? 'Enabled' : 'Members only'} chip={ui.chips.vip} />
      </AppPanel>
    </div>
  );
}

function HistoryScreen() {
  return (
    <div className="history-list">
      <AppPanel title="Activity History" subtitle="Menu destination">
        <p className="panel-note">History rows will be generated from real member activity. The sheet examples are blueprint references only.</p>
      </AppPanel>
    </div>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BingoCard({ compact = false }) {
  return (
    <div className={compact ? 'bingo-card compact' : 'bingo-card'}>
      {Array.from({ length: 25 }, (_, index) => (
        <button type="button" key={index} className={index === 12 ? 'free' : index % 4 === 0 ? 'marked' : ''}>
          {index === 12 ? 'FREE' : ''}
        </button>
      ))}
    </div>
  );
}

function QueueRows() {
  return (
    <div className="queue-rows">
      {['Queued Call', 'Ready Check', 'Round Update', 'Prize Notice'].map((label, index) => (
        <div className="queue-row" key={label}>
          <b>{index + 1}</b>
          <span>{label}</span>
          <small>Live</small>
        </div>
      ))}
    </div>
  );
}

function Keypad() {
  return (
    <div className="keypad">
      {'1234567890'.split('').map((key) => (
        <button type="button" key={key}>{key}</button>
      ))}
      <button type="button">Clear</button>
      <button type="button">Enter</button>
    </div>
  );
}

function ScreenAsset({ src, className = '' }) {
  return (
    <div className={`screen-asset-card ${className}`}>
      <img src={src} alt="" />
    </div>
  );
}

function AppPanel({ title, subtitle, children, className = '' }) {
  return (
    <article className={`app-panel ${className}`}>
      <header>
        <span>{subtitle}</span>
        <h2>{title}</h2>
      </header>
      <div className="app-panel-body">{children}</div>
    </article>
  );
}

function CharacterSelectScreen({ onStartGame }) {
  const [picked, setPicked] = useState(null);
  const chosen = ROSTER.find((c) => c.id === picked) ?? null;
  const canPlay = chosen && GAME_FIGHTERS.has(chosen.id);
  return (
    <div className="char-select">
      <div className="char-grid">
        {ROSTER.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`char-card${picked === c.id ? ' picked' : ''}`}
            style={{ '--accent': c.accent }}
            onClick={() => setPicked(c.id)}
          >
            <span className="char-portrait"><img src={c.portrait} alt={c.name} /></span>
            <span className="char-name">{c.name}</span>
            <span className="char-tag">{c.role}</span>
          </button>
        ))}
      </div>

      {chosen ? (
        <div className="char-detail" style={{ '--accent': chosen.accent }}>
          <h2>{chosen.name}</h2>
          <p className="char-line"><b>Strengths</b><span>{chosen.strong}</span></p>
          <p className="char-line"><b>Weakness</b><span>{chosen.weak}</span></p>
          <button
            type="button"
            className="char-start"
            disabled={!canPlay}
            onClick={() => canPlay && onStartGame(chosen.id, chosen.name)}
          >
            {canPlay ? `Start the Night as ${chosen.name} →` : `${chosen.name} — hitting the streets soon`}
          </button>
          <p className="char-soon">{canPlay
            ? 'Cafe8Fifty street brawler loads now — D-pad to move, A to attack. Inside venues + the 2AM run are next.'
            : 'Playable in Character Select; street frames are being sliced from the new sheets.'}</p>
        </div>
      ) : (
        <p className="char-hint">Tap a fighter to see how your night plays.</p>
      )}

      <div className="story-tier">
        <h3>Story · Rivals · Bosses</h3>
        <div className="story-grid">
          {STORY_TIER.map((s) => (
            <div key={s.id} className="story-card" aria-disabled="true">
              <span className="story-name">{s.name}</span>
              <span className="story-note">{s.note}</span>
              <span className="story-lock" aria-hidden="true">🔒</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuFlowRow({ chip, index, title, detail, target, onSelect, locked = false }) {
  return (
    <button
      className={`menu-flow-row${locked ? ' locked' : ''}`}
      type="button"
      data-target={target}
      aria-label={`${title}. ${detail}`}
      aria-disabled={locked}
      onClick={onSelect}
    >
      <b>{index}</b>
      <img className="beveled-asset chip-asset" src={chip} alt="" />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {locked && <span className="menu-flow-lock" aria-hidden="true">🔒</span>}
    </button>
  );
}

function PlanActionGrid() {
  return (
    <div className="plan-action-grid">
      {ui.planActions.map((action) => (
        <AssetButton key={action.label} src={action.src} label={action.label} />
      ))}
    </div>
  );
}

function CheckoutMethods() {
  return (
    <div className="checkout-methods" aria-label="Payment methods">
      {ui.paymentMethods.map((method) => (
        <AssetButton key={method.label} src={method.src} label={method.label} />
      ))}
    </div>
  );
}

function AccessRow({ title, status, chip }) {
  return (
    <div className="access-row">
      <img src={chip} alt="" />
      <strong>{title}</strong>
      <span>{status}</span>
    </div>
  );
}

function InfoPanel({ title, value, chip }) {
  return (
    <article className="info-panel">
      <img src={chip} alt="" />
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusStrip({ items }) {
  return (
    <div className="status-strip">
      {items.map((item) => (
        <img className="beveled-asset chip-asset" src={item} alt="" key={item} />
      ))}
    </div>
  );
}

function AssetButton({ src, label }) {
  return (
    <button className="image-action" type="button" aria-label={label}>
      <img src={src} alt="" />
    </button>
  );
}

createRoot(document.getElementById('root')).render(<App />);

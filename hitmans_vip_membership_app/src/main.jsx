import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppUpdate, useHoldUpdates, BUILD_ID } from './updates.js';
import { listTakes, saveTake, removeTake, takesUsage, prettyBytes, MAX_TAKES, hashTake } from './takes.js';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import './styles.css';
import './kit.css';
import { burstCover, celebrate } from './vfx';
import {
  BINGO_LINES, BINGO_PATTERN_LABEL, BINGO_PATTERN_NAME, BINGO_PATTERN_IDS, BINGO_PATTERN_GOAL,
  BINGO_ROUND_PATTERN, BINGO_FINAL_ROUND as BINGO_FINAL_ROUND_CLIENT,
  BINGO_ENTRY_FEE, BINGO_CASH_MIN_PAID, bingoIsCashGame, bingoPot, bingoPrizeLabel,
  BINGO_MIC_DECIDE_SECONDS, micDecideEndsAt, micVoters, micIsForced, micOutcome,
  bingoProgress, bingoHasPattern, oneAwayIds,
} from './bingoRules';
import { apiBase, apiEnabled, apiToken, apiMemberId, memberOtpStart, memberOtpVerify, rememberReferral, apiSignOut, apiPurchase, apiWallet, apiMe, apiMyTimeline,
  apiSetOtw, apiSignalLeave, apiMyStats, apiLeaderboard,
  zelleHandle, payClaim, payPending, payConfirm, payVoid, connectVenue, venueConfig, disconnectVenue,
  apiStaffToken, apiStaffRole, apiStaffLogin, apiStaffSignOut, apiDoorVerify, apiDoorBoard, apiDoorCheckout, apiMembersSearch,
  fetchRooms, healVenue, savedVenueId,
  apiMemberTimeline, apiMemberManage, apiMemberFlags,
  apiBattleCurrent, apiBattleMine, apiBattleRespond, apiBattlePick, apiBattleLock, apiBattlePerformed, apiBattleVote, apiBattleSay, apiBattleFrame, apiBattleWatch,
  apiBattleStage, apiBattlePerform, apiBattleVoting, apiBattleResolve, apiBattleTimer,
  apiEventState, apiEventCreate, apiEventJoin, apiEventLeave, apiEventStart, apiEventNext,
  apiEventChallenge, apiEventEnd,
  apiBingoState, apiBingoJoin, apiBingoReady, apiBingoClaim, apiBingoMark, apiBingoStart, apiBingoCall, apiBingoResolve,
  apiBingoAuto, apiBingoAutofill, apiBingoMode, apiBingoEntry, apiBingoMicVote,
  apiBingoEntryClaim, apiBingoEntryResolve, apiRegisterPerformance,
  apiJubileeKinds, apiJubileeApply, apiJubileeMine, apiJubileeQueue, apiJubileeVerify,
  apiJubileeApprove, apiJubileeAward, apiJubileePay, apiJubileeDelivered, apiJubileeVendor,
  apiStaffRoster, apiStaffInvite, apiStaffRemove,
  apiVenuePulse, apiPrograms, apiJoinProgram,
  apiDonate, apiMyDonations, apiBoard, apiBoardApply,
  apiOnboarding, apiAgree, apiSetRole,
  apiEarn, apiMarket, apiMarketMine, apiMarketList, apiMarketClose, apiMarketOrder, apiMarketReceived,
  apiGigs, apiGigRequest, apiGigAgree, apiGigWorked, apiGigVerify,
  apiReferral, apiLicenseTerms, apiLicenseMine, apiLicenseMarket, apiLicenseHeld,
  apiLicenseOffer, apiLicenseWithdraw, apiLicenseBuy, apiRegisterWork,
  apiHouseMoney, apiMarketSettle, apiGigSecure, apiGigSettle, apiLicenseSettle, apiReferralPay,
  apiNotifyStatus, apiNotifyConfig, apiNotifyTest,
  apiMyCovenant, apiMyRecord, apiResign, apiRejoin,
  apiBingoReset, apiBingoBoard, apiBingoDecks, apiYoutubeSearch, apiBingoPlayMedia, apiBingoStopMedia,
  apiYoutubeKeyStatus, apiSetYoutubeKey, apiGoogleStatus, apiGoogleDisconnect, googleSignInUrl,
  apiPartyState, apiPartyStart, apiPartyVote, apiPartyEnd, apiPartyReset,
  apiBookingRequest, apiBookingMine, apiBookingCancel, apiBookingBoard, apiBookingDecide } from './api.js';
import { paypalConfigured, tierPayable, planFor, loadPayPal, paypalMeEnabled, paypalMeLink } from './paypal.js';
import { hubOn, startHub, stopHub, hubNode } from './hub.js';
import { playSfx, sfxMuted, setSfxMuted } from './sfx.js';
// Generated from the venue backend's own deck list — see server/gen-client-decks.mjs.
// Solo has no backend to ask, so it carries the same songs in the bundle.
import { deckList as soloDeckList, deckById as soloDeckById, DEFAULT_DECK_ID as SOLO_DEFAULT_DECK,
         clipWindowFor as soloClipWindow } from './decks.generated.js';

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
  Daily: { tickets: 0, drinks: false, blurb: 'Entry access' },
  Weekly: { tickets: 1, drinks: false, blurb: '1 hospitality ticket a night — entry or a Cafe8Fifty meal' },
  Monthly: { tickets: 3, drinks: false, blurb: '3 hospitality tickets a night — entry or a Cafe8Fifty meal' },
  Yearly: { tickets: 3, drinks: false, blurb: '3 hospitality tickets a night — entry or a Cafe8Fifty meal' },
  VIP: { tickets: 3, drinks: true, blurb: '3 tickets a night (entry or a meal) + free drinks all night' },
};

// What each tier comes with — shown when a member taps a card on the buy screen
// so they can choose wisely.
export const TIER_BENEFITS = {
  // "Pay what you want" is left off here on purpose — the live countdown
  // block right below already says it, no need to say it twice.
  Daily: ['Entry for the night', 'Member card, number & door QR', 'Loyalty rank starts counting'],
  Weekly: ['7 days of entry', '1 hospitality ticket a night — use for entry or a Cafe8Fifty meal', 'Member card, number & door QR', 'Event & venue access once you check in'],
  Monthly: ['30 days of entry', '3 hospitality tickets a night — entry or a Cafe8Fifty meal', 'Event & venue access', 'Faster loyalty rank climb'],
  Yearly: ['365 days of entry', '3 hospitality tickets a night — entry or a Cafe8Fifty meal', 'Priority event & venue access', 'Faster loyalty rank climb'],
  VIP: ['365 days of entry', '3 hospitality tickets a night — entry or a Cafe8Fifty meal', 'Free drinks all night', 'VIP lounge & VIP areas', 'Priority door entry', 'Top loyalty status'],
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
  // Reconciles the local card with the response immediately — without this,
  // the card (and the QR it renders) keeps the client-generated `number`
  // above until the next background sync (up to 8s later, see
  // syncMemberFromBackend), during which it doesn't match what the door
  // actually has on file for this member.
  if (apiEnabled() && apiToken()) {
    apiPurchase(tierName, payment).then((r) => {
      const m = r?.member;
      if (m?.number) commitMember({ ...(memberState || {}), number: m.number, name: m.name || name, entries: m.entries ?? 0 });
    }).catch(() => {});
  }
}

// Pull the member's OWN real state back from the backend. Needed for the
// half of the purchase flow that doesn't happen on this device at all: a
// member files a Zelle/cash claim (HvasPayOptions), then a DIFFERENT
// device — staff, at the door, maybe minutes later — confirms it. Without
// this, "you'll see your card update" (the promise made right there in the
// claim-filed message) was never actually true. Only ever adds a real,
// server-confirmed tier on top of local state — never invents or clears one,
// so local/demo purchases on a disconnected device are untouched.
export async function syncMemberFromBackend() {
  if (!apiEnabled() || !apiToken()) return;
  try {
    const r = await apiMe();
    const m = r?.member;
    if (!m || !m.tier) return;
    const prev = memberState || {};
    const nk = nightKey();
    const wasInside = prev.lastEntryNight === nk && prev.checkedOutNight !== nk;
    const wasLeft = prev.lastEntryNight === nk && prev.checkedOutNight === nk;
    // insideTonight/leftTonight/entries are server-authoritative (computed
    // from the real entries table) — this is what makes a REAL staff
    // admission or checkout, done on a completely different device at the
    // door, actually show up here too. Comparing only tier/status/expiresAt
    // used to skip every admission/checkout sync outright, since neither
    // touches those fields.
    if (prev.tier === m.tier && prev.status === m.status && prev.expiresAt === m.expiresAt
      && wasInside === !!m.insideTonight && wasLeft === !!m.leftTonight
      && (prev.entries ?? 0) === (m.entries ?? 0)) return; // truly no change
    commitMember({
      ...prev,
      tier: m.tier, vip: !!m.vip, payment: m.payment || prev.payment || 'Zelle',
      status: m.status || 'active', expiresAt: m.expiresAt, number: m.number || prev.number,
      name: m.name || prev.name, entries: m.entries ?? prev.entries ?? 0,
      purchasedAt: prev.purchasedAt || Date.now(), verifiedAt: prev.verifiedAt ?? null,
      lastEntryNight: (m.insideTonight || m.leftTonight) ? nk : prev.lastEntryNight,
      checkedOutNight: m.leftTonight ? nk : prev.checkedOutNight,
      onTheWay: (m.insideTonight || m.leftTonight) ? false : (m.onTheWay ?? prev.onTheWay),
    });
  } catch { /* ignore — never break the screen over a background sync */ }
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
// A hospitality ticket is spent EITHER on entry inside OR on a free Cafe8Fifty
// meal — one ticket, either use. Both just decrement the nightly ticket count.
export function useTicket() {
  if (!memberState || (memberState.tickets || 0) <= 0) return;
  commitMember({ ...memberState, tickets: memberState.tickets - 1 });
}
export function claimMeal() {
  if (!memberState || (memberState.tickets || 0) <= 0) return;
  commitMember({ ...memberState, tickets: memberState.tickets - 1 });
}

// Loyalty ranks — earned by nights attended (entries) + loyalty, not bought.
const A_ = import.meta.env.BASE_URL;
export const RANKS = [
  { name: 'Bronze', min: 0, src: `${A_}assets/ui/rank/bronze.png` },
  { name: 'Silver', min: 5, src: `${A_}assets/ui/rank/silver.png` },
  { name: 'Gold', min: 12, src: `${A_}assets/ui/rank/gold.png` },
  { name: 'Platinum', min: 24, src: `${A_}assets/ui/rank/platinum.png` },
  { name: 'Diamond', min: 40, src: `${A_}assets/ui/rank/diamond.png` },
  { name: 'VIP', min: 60, src: `${A_}assets/ui/rank/vip.png` },
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
    // already counted tonight — just keep perks fresh across a 3AM rollover,
    // and clear "left" in case this is a re-admission after checking out
    if (m.ticketsNight === nk) return { ...m, onTheWay: false, checkedOutNight: null };
    return { ...m, onTheWay: false, checkedOutNight: null, tickets: perk.tickets, ticketsNight: nk, mealUsed: false };
  }
  return {
    ...m,
    onTheWay: false,                 // arrived — clear the incoming signal
    checkedOutNight: null,
    entries: (m.entries || 0) + 1,
    loyalty: (m.loyalty || 0) + 10,
    lastEntryNight: nk,
    tickets: perk.tickets, ticketsNight: nk, mealUsed: false,
  };
}
// Has this member already been admitted for the current night — and not yet
// marked as having left. (lastEntryNight itself never gets cleared: it's the
// permanent attendance record used for loyalty/entries counts.)
export function isInsideTonight(m = memberState) {
  return !!(m && m.lastEntryNight === nightKey() && m.checkedOutNight !== nightKey());
}
// Was admitted tonight AND has since checked out — distinct from never having
// come at all, so the door dashboard can tell "left" apart from "signed in".
export function isLeftTonight(m = memberState) {
  return !!(m && m.lastEntryNight === nightKey() && m.checkedOutNight === nightKey());
}
// Member "on the way" signal — set when they flip the OTW toggle, stored on the
// shared member record so door staff can see who's incoming. Timestamped, and
// cleared automatically on admission (in admitTonight). Mirrored to a real
// backend when connected, so a DIFFERENT staff device (the door dashboard)
// actually sees it — a purely local flag here would never leave this phone.
export function setOnTheWay(flag) {
  if (!memberState) return;
  commitMember({ ...memberState, onTheWay: !!flag, onTheWayAt: flag ? Date.now() : null });
  if (apiEnabled() && apiToken()) apiSetOtw(!!flag).catch(() => {});
}
export function isOnTheWay(m = memberState) {
  return !!(m && m.onTheWay && !isInsideTonight(m));
}
// Member marks themselves as having left the venue tonight — shows as "Left"
// on the door dashboard instead of staying "Inside" forever.
export function leaveVenue() {
  if (!memberState || !isInsideTonight(memberState)) return;
  commitMember({ ...memberState, checkedOutNight: nightKey() });
  if (apiEnabled() && apiToken()) apiSignalLeave().catch(() => {});
}
// Auto-logged when a member checks in (self) — same idempotent path the door
// uses, so member-side check-in and staff verification stay consistent.
export function logEntry() {
  if (!memberState) return;
  commitMember(admitTonight(memberState));
}
// Shared grant/deny logic — no side effects, never admits anyone. Used by
// both the real (offline-fallback) door check below and the member's own
// read-only card preview, so they always agree on the same verdict.
function determineStatus(number) {
  const m = memberState;
  const clean = (number || '').trim().toUpperCase();
  if (!m || !m.number || m.number.toUpperCase() !== clean) {
    return { ok: false, status: 'trespass', reason: 'No matching member — unauthorized. Do not admit.' };
  }
  // A trespass/ban flag beats everything else — do not admit, no matter the tier.
  const pen = memberPenalty(clean);
  if (pen) {
    return {
      ok: false, status: pen.kind === 'banned' ? 'banned' : 'trespass',
      reason: `${PENALTY_LABEL[pen.kind] || 'FLAGGED'} — ${pen.reason || 'do not admit'}${pen.by ? ` · flagged by ${pen.by}` : ''}`,
    };
  }
  if (Date.now() > m.expiresAt) return { ok: false, status: 'expired', reason: 'Membership expired — renewal required.' };
  return { ok: true, status: 'valid', reason: 'Membership active.' };
}
// Returns one of three door outcomes: valid (grant), expired (deny), or
// trespass (deny — the number isn't a member at all). Security shows the
// matching alert graphic for each. THIS ADMITS ON A GRANT — only call it from
// an actual door check (verifyAtDoor's offline fallback below), never from
// the member's own device. A member previewing their own card should never
// be able to mark themselves "inside" without staff actually scanning them —
// see previewCardStatus for that.
export function verifyByNumber(number) {
  const result = determineStatus(number);
  if (!result.ok) {
    if (result.status === 'expired') commitMember({ ...memberState, status: 'expired' });
    return { ...result, member: memberState };
  }
  // Grant = admission: verify the pass AND log tonight's entry (idempotent),
  // so the member's loyalty rank, ribbons, and perks update from this one event.
  commitMember(admitTonight({ ...memberState, status: 'verified', verifiedAt: Date.now() }));
  return { ok: true, status: 'valid', member: memberState, reason: 'Member verified — grant entry. Night logged.' };
}
// Read-only: a member checking their OWN card sees the same grant/deny verdict
// a real door scan would give, but nothing here ever admits them. They stay
// "on the way" (or neutral) until staff actually scans them or types their
// number at the door — that's the only thing that can flip them to "inside."
export function previewCardStatus(number) {
  const result = determineStatus(number);
  return { ...result, member: memberState };
}
export function resetMembership() { commitMember(null); }

// Door-side verify when connected to a real venue backend: checks the ONE
// shared members table server-side, so any staff device gets the same answer
// for any member regardless of which device they signed up on. Falls back to
// the offline/local-only check above when there's no backend connected.
export async function verifyAtDoor(number) {
  if (apiEnabled() && apiStaffToken()) {
    try {
      const r = await apiDoorVerify({ number });
      return { ok: r.ok, status: r.status, member: r.member, reason: r.reason };
    } catch (e) {
      return { ok: false, status: 'error', reason: e.message || 'Could not reach the venue backend.' };
    }
  }
  return verifyByNumber(number);
}

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
// Same idea as verifyAtDoor: query the shared backend when connected (any
// member, any device they signed up on), fall back to the local hub-only
// search otherwise.
export async function searchMembersAtDoor(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  if (apiEnabled() && apiStaffToken()) {
    try { return (await apiMembersSearch(q)).members || []; } catch { return []; }
  }
  return searchMembers(query);
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
// There is deliberately no venue code in this file.
//
// It used to hold ROLE_CODES = { staff: 'DOOR850', host: 'HOST850' } so the app
// could check a code with no backend. Two things were wrong with that, and
// neither is theoretical: the codes shipped inside the JavaScript bundle, where
// anybody who opened the file could read them; and the gate PRINTED the code on
// screen as a "demo" hint whenever no venue was connected — so five taps on a
// disconnected phone showed you the door code in plain text.
//
// Staff powers are venue powers. A phone that cannot reach the venue does not
// get them, and the code lives on the server where it can be changed without a
// deploy and rotated without every old build still accepting it.
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
  // Same full logo, background keyed out (transparent) — clean on any surface.
  fullLogoClear: '/assets/ui/hvas_logo_clear.png',
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
    id: 'lipsyncBattle',
    label: 'Lip Sync Battle',
    eyebrow: 'Live Floor',
    title: 'Lip Sync Battle',
    detail: 'Bracket, king of the hill or open floor — battles with no bingo card involved.',
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
    id: 'programs',
    label: 'Programmes',
    eyebrow: 'Community Programs',
    title: 'Programmes',
    detail: 'Give to a cause, or apply for a seat on its board.',
  },
  {
    id: 'standing',
    label: 'Membership',
    eyebrow: 'The Association',
    title: 'Your membership',
    detail: 'What you signed, what we hold about you, and how to leave.',
  },
  {
    id: 'earn',
    label: 'Earn',
    eyebrow: 'Members Market',
    title: 'Earn',
    detail: 'Sell what you do, take bookings, license what you made, or earn on who you bring.',
  },
  {
    id: 'support',
    label: 'Get help',
    eyebrow: 'Community Support',
    title: 'Get help',
    detail: 'Rent, a utility, food, or getting a creator back to work.',
  },
  {
    id: 'staffDashboard',
    label: 'Dashboard',
    eyebrow: 'Staff Check-In',
    title: 'Dashboard',
    detail: 'Door status and check-in overview.',
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    eyebrow: 'Staff Check-In',
    title: 'Watchlist',
    detail: 'Trespassed & banned members — flag or lift.',
  },
  {
    id: 'payments',
    label: 'Payments',
    eyebrow: 'Staff Check-In',
    title: 'Payments',
    detail: 'Confirm Zelle / cash membership payments.',
  },
  {
    id: 'searchMember',
    label: 'Search Member',
    eyebrow: 'Staff Check-In',
    title: 'Search Member',
    detail: 'Find a member by name or member number.',
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
    detail: 'Live round status, quick start/reset, and a shortcut into full Host Control.',
  },
  {
    id: 'tv',
    label: 'TV Display',
    eyebrow: 'Room Display',
    title: 'TV Live Display',
    detail: 'Fullscreen public display — the live call log, the winner banner, and whatever the host sends to auto-play.',
  },
  {
    id: 'lobby',
    label: 'Play',
    eyebrow: 'Lip Sync Bingo',
    // No blurb. This screen now walks you through the steps itself, and the
    // step you are on says what to do — a paragraph explaining the screen above
    // a rail that explains the screen is just the top third of a phone spent
    // twice on the same sentence. It also said "Lobby", which stopped being
    // true when the lobby became a flow.
    title: 'Lip Sync Bingo',
    detail: '',
  },
  {
    id: 'playerCard',
    label: 'Player Card',
    eyebrow: 'Player Game',
    title: 'Bingo Card',
    detail: 'Your real dealt card, live-marked as the host calls phrases, with a Claim Bingo button.',
  },
  {
    id: 'host',
    label: 'Host',
    eyebrow: 'Operator',
    title: 'Host / DJ Control',
    detail: 'Start the round, call phrases, approve or reject bingo claims, and send songs to the TV.',
  },
  {
    id: 'verification',
    label: 'Verify',
    eyebrow: 'Door Verification',
    title: 'Card Verification',
    detail: 'QR scan, keypad, member validation, result banners, and entry status.',
  },
  {
    id: 'songQueue',
    label: 'Queue',
    eyebrow: 'Host Tools',
    title: 'Song Queue / Call History',
    detail: 'Every phrase called this round, most recent first.',
  },
  {
    id: 'winner',
    label: 'Winner',
    eyebrow: 'Rewards',
    title: 'Winner Validation / Payout',
    detail: 'The confirmed winner (once there is one) plus any claims still waiting on approval.',
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
    detail: 'Team Purple vs Team Pink — real audience voting and reactions, live for everyone in the room.',
  },
  {
    id: 'booking',
    label: 'Book a Table',
    eyebrow: 'VIP Table Booking',
    title: 'Book a VIP Table',
    detail: 'Request a night and party size — staff confirms with a table assignment.',
  },
  {
    id: 'bookingBoard',
    label: 'Table Bookings',
    eyebrow: 'Staff Check-In',
    title: 'Table Bookings',
    detail: 'Every upcoming table request — approve with a table, or decline with a reason.',
  },
];

// What the loading screen says, and it is now said out loud.
//
// The app already worked out a phase and a message on every animation frame —
// "Securing access", "Verifying pass", "Opening venue" — and rendered NONE of
// it. The film has a progress bar baked into it, so what a member actually saw
// was a fixed nine and a half second clip with a fake bar, the same words never
// appearing, whether they were opening their pass or starting a game. That is
// what made it feel like it did not belong to anything.
//
// It says where you are going now, in the words of that place. Each script is
// [until%, label, message]; the last entry must reach 100.
const LOADING_SCRIPTS = {
  // Boot deliberately does NOT echo the film, which already says "assembling
  // VIP access". Saying the same thing twice on one screen is how the loading
  // screen stopped meaning anything in the first place. This is the room
  // opening up instead.
  Boot: [
    [24, 'Lights', 'Lights up'],
    [52, 'Sound', 'Sound check'],
    [78, 'Door', 'Unlocking the door'],
    [100, 'Ready', 'Welcome back'],
  ],
  lobby: [
    [38, 'Decks', 'Pulling tonight’s themes'],
    [72, 'Card', 'Shuffling the squares'],
    [100, 'Ready', 'Take your card'],
  ],
  playerCard: [
    [40, 'Room', 'Finding the room'],
    [74, 'Card', 'Dealing you in'],
    [100, 'Ready', 'You’re on the floor'],
  ],
  myPass: [[55, 'Pass', 'Reading your pass'], [100, 'Ready', 'Here it is']],
  membership: [[55, 'Pass', 'Reading your pass'], [100, 'Ready', 'Here it is']],
  lipsyncBattle: [
    [42, 'Stage', 'Clearing the stage'],
    [78, 'Crowd', 'Getting the room in'],
    [100, 'Ready', 'Battle up'],
  ],
  party: [[50, 'Room', 'Opening the room'], [100, 'Ready', 'You’re in']],
  history: [[60, 'Nights', 'Pulling your nights'], [100, 'Ready', 'Here they are']],
  staffDashboard: [[55, 'Door', 'Opening the door'], [100, 'Ready', 'Door ready']],
  entry: [[55, 'Door', 'Opening the door'], [100, 'Ready', 'Door ready']],
  default: [[55, 'Loading', 'One second'], [100, 'Ready', 'Ready']],
};
const scriptFor = (id) => LOADING_SCRIPTS[id] || LOADING_SCRIPTS.default;

// Boot rides the branded film at 1x. A page change plays the same film sped up:
// it used to hold for 3.6 SECONDS on every single tap, which on a screen where
// nothing is actually loading is just a toll on getting anywhere.
const BOOT_MS = 9550;
const NAV_MS = 1500;

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
    // Three doors, not six. A member opens this in a dark room with a drink in
    // one hand: every extra tile is one more thing to read before they find the
    // game. Battles are not a separate destination — they happen inside a round,
    // off a lip sync square — and table booking is not finished, so neither
    // belongs on the menu pretending otherwise.
    //
    // The screens behind them still exist and stay in `allowed` below, so the
    // paths that reach them from inside the game keep working and putting a
    // tile back is one line, not a re-wiring.
    menu: [
      // Two things. A member opens this app to play, or to show their pass at
      // the door — everything else is a detail of one of those. History was a
      // third tile and is now a tab inside My Pass, where the rest of their
      // account already lives.
      { title: 'Play Lip Sync Bingo', detail: 'Tonight’s round, or solo vs CPU', chip: ui.chips.active, target: 'lobby' },
      { title: 'My Pass', detail: 'Pass & QR, access, renewal, loyalty, history', chip: ui.chips.vip, target: 'membership' },
    ],
    // Hosting is a member capability, not a staff one — a member runs the
    // night from inside Lip Sync Bingo (behind the venue's host code), so the
    // host screens have to be reachable from the member role.
    allowed: ['membership', 'myPass', 'profile', 'checkout', 'history', 'lobby', 'playerCard', 'party', 'booking',
      'host', 'songQueue', 'winner', 'tv', 'bingoStyle', 'lipsyncBattle', 'support', 'programs', 'earn', 'standing'],
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
      { title: 'Payments', detail: 'Confirm Zelle / cash membership payments', chip: ui.chips.vip, target: 'payments' },
      { title: 'Table Bookings', detail: 'Approve or decline VIP table requests', chip: ui.chips.staff, target: 'bookingBoard' },
    ],
    allowed: ['verification', 'staffDashboard', 'watchlist', 'payVerify', 'searchMember', 'entry', 'payments', 'bookingBoard'],
  },
];
const roleById = (id) => ROLES.find((r) => r.id === id) ?? null;

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
[ui, screens, ROLES].forEach(prefixAssets);

// Shown the instant a "?connect=" link is present, before the request even
// resolves — an unreachable address can take a while to actually reject, and
// without this the normal door screen (or silent demo mode) would flash up
// first and could get tapped through before the failure even registers.
function ConnectingScreen() {
  return (
    <section className="screen screen-door">
      <div className="door-wrap">
        <span className="door-eyebrow">CONNECTING</span>
        <h1 className="door-title">Reaching the venue…</h1>
        <p className="door-tag">One second.</p>
      </div>
    </section>
  );
}

// A scanned venue QR pointed here but the app couldn't reach it — almost
// always means this phone isn't on the same network the link needs (venue
// wifi vs. cellular data, or a different wifi entirely). Blocks the app
// entirely rather than quietly landing in local demo mode: someone who
// "joins" there gets a real-looking pass and QR that no door scan will ever
// recognize, with nothing telling them it wasn't real until it's too late.
// A saved address that stops answering is not a dead end any more: the venue
// has a permanent id, so the app can look up where it moved to and reconnect
// without asking the member for anything.
function useVenueHealing(failed) {
  const [healing, setHealing] = useState(false);
  useEffect(() => {
    if (!failed || !savedVenueId()) return undefined;
    let live = true;
    setHealing(true);
    healVenue().then((base) => {
      if (!live) return;
      if (base) window.location.reload();          // found it — come back up on the new address
      else setHealing(false);
    });
    return () => { live = false; };
  }, [failed]);
  return healing;
}

function ConnectFailedScreen({ url, onRetry, onForget, stale }) {
  let host = url;
  try { host = new URL(url).host; } catch { /* show the raw string */ }
  // Before telling anyone anything went wrong, try to find the venue again by
  // its permanent id. Most of the time this reconnects and they never see this
  // screen at all.
  const healing = useVenueHealing(true);
  if (healing) {
    return (
      <section className="screen screen-door">
        <div className="door-wrap">
          <span className="door-eyebrow">FINDING THE ROOM</span>
          <h1 className="door-title">One second<span>looking for the venue</span></h1>
          <p className="door-tag">The address moved. Checking where it went — you should not have to do anything.</p>
        </div>
      </section>
    );
  }
  return (
    <section className="screen screen-door">
      <div className="door-wrap">
        <span className="door-eyebrow">{stale ? 'VENUE MOVED' : 'CONNECTION FAILED'}</span>
        <h1 className="door-title">Can’t reach<span>{host}</span></h1>
        {/* Two genuinely different situations, so two different explanations.
            A fresh link that fails is usually a network problem. A SAVED
            address that fails is almost always last night's — the venue's
            public address changes every time it restarts. Telling someone to
            check their wifi in that case sends them hunting for a fault that
            is not theirs. */}
        <p className="door-tag">
          {stale
            ? "This is the address you joined with last time, and the venue isn't answering on it any more. We looked the venue up by name and it isn't listed as running right now either — try again when the room opens, or scan tonight's join QR."
            : "The room isn't answering. Either it isn't open right now, or it isn't reachable from outside the venue yet. Try again in a moment — nothing is wrong with your phone."}
        </p>
        {/* This screen used to tell somebody to get on the venue's wifi. That is
            written for a person standing in the building, and it is exactly
            wrong for the way this launches: somebody scans a code off a poster
            at home, on cellular data, and is told to join a wifi network they
            are nowhere near. It reads as their fault and sends them looking for
            a fault that is not theirs.

            The honest version names the two real causes, and the second one is
            the venue's to fix — so it is said in words the OWNER will recognise
            if a member reads this screen out to them over the phone. */}
        {!stale && (
          <p className="door-note">
            If you are the venue: the room is only reachable to people who are
            already on it. Publish it to the internet, then scan your own code
            with mobile data on to check.
          </p>
        )}
        <div className="door-actions">
          <button type="button" className="door-primary" onClick={onRetry}>Try again →</button>
          {/* There used to be a third button here: "Continue without connecting
              (demo only)". It made this phone its own server — a private game
              with nobody else in it — which is not what anybody standing at a
              door that will not open is asking for. It read as a way in and was
              a way out of the venue entirely.

              Forgetting the venue is the honest version of the same escape: it
              drops back to the door, where the room list, the QR and Solo vs CPU
              all are. It is offered in both cases now, not only a stale one —
              a venue that cannot be reached is a venue that cannot be reached. */}
          {onForget && (
            <button type="button" className="door-secondary" onClick={onForget}>
              {stale ? "Forget this venue — I'll scan tonight's QR" : 'Back to the door'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// Compare venue addresses the way a human would: trailing slashes and case in
// the host should not make two links look like different venues.
function normalizeBase(u) {
  return String(u || '').trim().replace(/\/+$/, '').toLowerCase();
}

function App() {
  // Set only when a scanned "?connect=" link fails to reach the venue — this
  // BLOCKS the normal boot flow so a failed connect can never silently slide
  // into local demo/hub mode looking exactly like the real thing. Someone who
  // "joined" in hub mode gets a working-looking pass + QR that no door scan
  // will ever recognize, with nothing telling them it wasn't real.
  const [connectError, setConnectError] = useState(null); // { url } | null
  // Set synchronously (not in an effect) so the VERY FIRST render already
  // blocks on it — otherwise a pending fetch() to an unreachable venue can
  // take a long time to actually reject, and the normal door screen (or
  // worse, silent hub/demo mode) would flash up in the meantime.
  const [connecting, setConnecting] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('connect');
    // Same test as the effect below: a link to a DIFFERENT venue blocks boot
    // while it re-points, whether or not one was already saved.
    return !!(p && normalizeBase(p) !== normalizeBase(apiBase()));
  });
  const [activeScreen, setActiveScreen] = useState('home');
  const [targetScreen, setTargetScreen] = useState('home');
  const [role, setRole] = useState(null);       // null until the user picks a role
  const auth = useAuth();                         // member account (self-serve identity)
  const [unlocked, setUnlocked] = useState({ staff: false, host: false }); // per-session code unlock
  const [gate, setGate] = useState(null);        // role awaiting auth: 'member' | 'staff' | 'host'
  const [team, setTeam] = useState(false);       // hidden Team Access screen (reached by holding the crest)
  // Whether this member has been accepted: agreed to the covenant, said what
  // they do, and chosen a programme. Starts optimistic so a returning member
  // does not see the sign-up flash on every load — Onboarding asks the server
  // immediately and puts itself back up if they are not actually through.
  const [accepted, setAccepted] = useState(true);
  useEffect(() => {
    if (!apiEnabled() || !apiToken()) return;
    let live = true;
    apiOnboarding().then((r) => { if (live) setAccepted(!!r.accepted); }).catch(() => {});
    return () => { live = false; };
  }, [auth?.member?.contact]);
  const member = useMember();                    // subscribe: door verification updates this
  const onTheWay = isOnTheWay(member);           // shared signal: member heading to the venue
  const inside = isInsideTonight(member);        // set when verified at the door — unlocks access
  const left = isLeftTonight(member);            // was inside tonight, has since checked out
  // Only what actually changes when a transition starts and stops. The progress,
  // the phase and the message used to live here and were rewritten on every
  // animation frame — sixty re-renders a second of the whole application, for
  // nine and a half seconds on boot, to compute three values that were never
  // rendered. The overlay runs its own clock now; this just says go.
  const [transition, setTransition] = useState({
    active: true,
    from: 'Boot',
    to: 'After Spot Access Hub',
    duration: BOOT_MS,
  });

  // Keeps this phone on the published build. Silent almost always — `ready` is
  // only true when a new build is waiting AND something on screen would be
  // ruined by reloading right now, which is the one case worth asking about.
  const update = useAppUpdate();

  const current = screens.find((screen) => screen.id === activeScreen) ?? screens[0];

  useEffect(() => {
    runTransition('Boot', current.title, () => setActiveScreen('home'));
    enforceMembership();       // keep a paid membership or stats start over
    // Scanning the venue's "join QR" with an ordinary camera app (not the
    // in-app scanner) opens this page with ?connect=<backend url> — connect
    // to it immediately so a plain camera scan works, not just the in-app one.
    // Whoever brought them, off the link they followed. Read before anything
    // tidies the URL, because the sign-up that uses it is several screens away.
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) rememberReferral(ref);
    const toConnect = new URLSearchParams(window.location.search).get('connect');
    // A join link RE-POINTS the app, even when it is already connected to
    // something. This used to bail out whenever a venue address was already
    // saved, which is the single worst thing it could do: the venue's public
    // tunnel address is different every time the venue restarts, so everyone
    // who joined on a previous night had a dead address saved, and the host
    // sending them a fresh QR did absolutely nothing — the app read the link
    // and threw it away. Scanning a join QR now always means "use THIS venue".
    const already = apiBase();
    if (toConnect && normalizeBase(toConnect) !== normalizeBase(already)) {
      connectVenue(toConnect)
        .then(() => {
          const clean = window.location.pathname;
          window.history.replaceState(null, '', clean);
          window.location.reload();
        })
        .catch(() => { setConnecting(false); setConnectError({ url: toConnect }); }); // loud, not swallowed
      return;
    }
    // Already pointed at exactly this venue — just tidy the URL.
    if (toConnect) {
      window.history.replaceState(null, '', window.location.pathname);
      setConnecting(false);
    }
    // A saved venue address gets checked once on boot. The venue's public
    // address changes every time it restarts, so a phone that joined on a
    // previous night is holding a dead one — and with nothing checking, every
    // screen just quietly failed to load. Now it says so, and offers the way
    // out (scan tonight's QR, or carry on in demo).
    if (apiEnabled()) {
      const saved = apiBase();
      fetch(`${saved}/config`, { signal: AbortSignal.timeout(9000) })
        .then((r) => { if (!r.ok) throw new Error('bad'); })
        .catch(() => setConnectError({ url: saved, stale: true }));
      return;
    }
    // Hosting resumes for a device that WAS hosting, and only for that device.
    //
    // This used to start on any device with no venue connected, which meant a
    // member opening the public link for the very first time was told they
    // were "the venue hub" under a yellow DEMO MODE warning — two pieces of
    // jargon that mean nothing to someone who just wants to play, on a screen
    // whose actual job is to get them connected to a room. There is a rooms
    // list and a Connect button right there; those are the right first thing
    // to see. Being the hub is a real feature, but it is a choice somebody
    // makes on purpose, not a state they wake up in.
    if (hubOn()) startHub();
  }, []);

  // Signing out (from anywhere — the door or the profile) clears the member
  // identity; whenever that happens while inside the member area, drop back to
  // the public door so logout is one tap and never leaves a dead screen.
  useEffect(() => {
    if (role === 'member' && !auth.member) switchRole();
  }, [role, auth.member]);

  // Two timers instead of six hundred renders.
  //
  // The commit — the actual screen swap — lands behind the film while it is at
  // its busiest, so the change is never seen happening. Everything else is the
  // overlay's own business.
  const transitionTimers = useRef([]);
  function runTransition(from, to, commit) {
    const isBoot = from === 'Boot';
    const duration = isBoot ? BOOT_MS : NAV_MS;
    transitionTimers.current.forEach(clearTimeout);
    transitionTimers.current = [];

    setTransition({ active: true, from, to, duration });

    transitionTimers.current.push(setTimeout(commit, Math.round(duration * 0.66)));
    transitionTimers.current.push(setTimeout(() => {
      setTransition((state) => ({ ...state, active: false }));
    }, duration + (isBoot ? 420 : 160)));
  }
  useEffect(() => () => transitionTimers.current.forEach(clearTimeout), []);

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
  // Every screen below reads roleById(role).something. An id that is not in
  // ROLES therefore does not render a wrong screen — it unmounts the entire
  // app, on a device somebody is standing at a door with. Refusing an unknown
  // id here costs one comparison.
  function chooseRole(id) {
    if (!roleById(id)) return;
    setRole(id); setActiveScreen('home'); setTargetScreen('home'); setGate(null);
  }
  // Members only have My Pass + History — skip the menu and land straight on
  // My Pass instead of showing a 2-item picker for something with no picking
  // to do. Staff/Host still land on 'home' (their menus have real choices).
  function enterMember() { setRole('member'); setActiveScreen('myPass'); setTargetScreen('myPass'); setGate(null); }
  function switchRole() { setRole(null); setActiveScreen('home'); setTargetScreen('home'); setGate(null); }
  // Gate a role behind its auth: members self-serve (need a signed-in account),
  // staff/host need the venue access code (unlocked per session).
  function requestRole(id) {
    if (id === 'member') return auth.member ? enterMember() : setGate('member');
    if (unlocked[id]) return chooseRole(id);
    return setGate(id);
  }

  if (connecting) {
    return <ConnectingScreen />;
  }

  // Signing in is not membership. A member who has not agreed to the covenant,
  // said what they do and chosen a programme sees only that — the server would
  // refuse everything else anyway, and a menu full of things that all fail is
  // worse than one screen that says what is left.
  if (role === 'member' && apiEnabled() && !accepted) {
    return <Onboarding onDone={() => setAccepted(true)} />;
  }

  if (connectError) {
    return (
      <ConnectFailedScreen
        url={connectError.url}
        stale={connectError.stale}
        onForget={() => { disconnectVenue(); window.location.reload(); }}
        onRetry={() => {
          const url = connectError.url;
          setConnectError(null);
          setConnecting(true);
          connectVenue(url)
            .then(() => window.location.reload())
            .catch(() => { setConnecting(false); setConnectError({ url }); });
        }}
      />
    );
  }

  return (
    <main className="app-shell menu-shell">
      <div className="dynamic-bg" aria-hidden="true">
        <span className="dynamic-bg-layer dynamic-bg-hitkoin" />
        <span className="dynamic-bg-layer dynamic-bg-vip" />
      </div>
      <TransitionOverlay transition={transition} destination={targetScreen} />
      {/* There was a full-width DEMO MODE banner here. It said the same thing
          the door's own hub line already says — "this device is the venue hub,
          Stop hosting" — only louder, in warning yellow, above everything else
          on the screen. Hosting locally is a real feature somebody chose, not a
          fault to be warned about, and the quiet indicator is enough. */}
      {!role ? (
        gate === 'member' ? (
          <MemberAuthScreen onBack={() => setGate(null)} onDone={() => enterMember()} />
        ) : gate ? (
          // staff/host code gate — back returns to the hidden Team Access, not the public door
          <CodeGateScreen role={gate} onBack={() => { setGate(null); setTeam(true); }}
            onDone={(grantedRole) => {
              // The server's role and the app's ROLES are not the same list:
              // 'host' is a power a token carries, not a door on the picker —
              // hosts come in through Staff Check-In and open host controls from
              // the game. So a granted role is only followed when it is actually
              // a role somebody can be; otherwise they land where they knocked,
              // with whatever their token lets them do.
              const landed = roleById(grantedRole) ? grantedRole : gate;
              setUnlocked((u) => ({ ...u, [landed]: true }));
              chooseRole(landed);
            }} />
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
              left={left}
              hasMember={!!member}
              onToggleOtw={() => setOnTheWay(!onTheWay)}
              onLeave={leaveVenue}
              onSwitch={switchRole}
            />
          ) : (
            <ScreenHeader screen={current} onBack={() => navigate('home')} />
          )}
          {current.id === 'home' ? (
            <HomeScreen role={roleById(role)} session={session} navigate={navigate} />
          ) : (
            <ScreenBody activeScreen={current.id} navigate={navigate} session={session} />
          )}
        </section>
      )}
      {update.ready && <UpdatePill onApply={update.apply} />}
    </main>
  );
}

// The only time an update is ever mentioned to anybody. The app updates itself
// on its own at every safe moment; this appears only when it has a new build in
// hand and cannot take it yet without wrecking something — a live round, a
// performance being recorded. It stays out of the way and it is not a warning.
function UpdatePill({ onApply }) {
  return (
    <button type="button" className="update-pill" onClick={onApply}>
      <span className="update-pill-dot" />
      New version ready · tap to load
    </button>
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

// One loading screen everywhere: the branded film (logo shatters → vortex → reforms
// into the retro logo, bar 0→100 baked in), full-screen on pure black. Boot plays at
// 1×; page-to-page plays the SAME film sped up so a nav stays quick but looks identical.
function TransitionOverlay({ transition, destination }) {
  const isBoot = transition.from === 'Boot';
  const vref = useRef(null);
  const script = isBoot ? scriptFor('Boot') : scriptFor(destination);
  const duration = transition.duration || NAV_MS;
  // The one piece of state that moves during a transition, and it lives HERE —
  // in the overlay — so stepping it re-renders four lines of caption instead of
  // the entire application.
  const [step, setStep] = useState(0);

  useEffect(() => {
    const v = vref.current;
    if (v) {
      v.playbackRate = isBoot ? 1 : 2.7;
      if (transition.active) { try { v.currentTime = 0; const p = v.play(); if (p?.catch) p.catch(() => {}); } catch { /* ignore */ } }
    }
    if (!transition.active) { setStep(0); return undefined; }
    setStep(0);
    // One timer per phase, fired at the share of the run that phase ends on —
    // no polling, and the words land with the bar rather than near it.
    const timers = script.slice(0, -1).map(([until], i) =>
      setTimeout(() => setStep(i + 1), Math.round(duration * (until / 100))));
    return () => timers.forEach(clearTimeout);
  }, [transition.active, isBoot, destination, duration]);

  const [, label, message] = script[Math.min(step, script.length - 1)];
  return (
    <div className={transition.active ? 'transition-overlay boot active' : 'transition-overlay boot'} aria-hidden={!transition.active}>
      <video ref={vref} className="boot-film" autoPlay muted playsInline preload="auto" disablePictureInPicture>
        <source src={ui.loadingVideoWebm} type="video/webm" />
        <source src={ui.loadingVideo} type="video/mp4" />
      </video>
      {/* One line, and deliberately only one.
      
          The film already carries a bar and a percentage, baked into the video
          — a second bar underneath it is the doubled-progress mess this app has
          been through once already. What the film CANNOT say, because it is the
          same clip every time, is where you are going. So that is all this adds:
          the step being done, and the place being opened. */}
      {transition.active && (
        <div className="boot-caption">
          <strong className="boot-caption-msg">{message}</strong>
          <span className="boot-caption-dest">{label} · {transition.to}</span>
        </div>
      )}
    </div>
  );
}

function ScreenHeader({ screen, onBack }) {
  return (
    <header className="screen-header">
      <button className="back-to-menu" type="button" onClick={onBack}>Home</button>
      <div>
        {/* Only when it adds something. On the play screen the eyebrow and the
            title were both "Lip Sync Bingo" — the same words twice, on the
            screen with the least vertical room in the app. */}
        {screen.eyebrow && screen.eyebrow !== screen.title && <span className="eyebrow">{screen.eyebrow}</span>}
        <h1>{screen.title}</h1>
        {screen.detail && <p>{screen.detail}</p>}
      </div>
    </header>
  );
}

// ── Sideways play ────────────────────────────────────────────────────────
// The game is played in landscape. The card is a square grid with a status
// rail beside it, a battle is a video, and both want width — held upright they
// are cramped at best. So the play surfaces ask for the phone to be turned and
// wait, rather than rendering something nobody can use.
//
// Only the PLAY screens are gated. The pass, the door, the lobby and the host
// console are all fine upright, and locking those would make the app annoying
// for the people who never play a round.

// Lip Sync Bingo used to refuse to draw at all until the phone was turned
// sideways. A 5x5 card is square, so landscape was never actually the roomier
// shape — a phone held upright has MORE width to give a square than one on its
// side has height. The gate cost every player a rotation, cost the app the
// orientation everyone holds a phone in, and bought nothing. Portrait is the
// way the game is played now; landscape still works, it is just never demanded.
function ScreenBody({ activeScreen, navigate, session }) {
  // 'home' is rendered directly by App (role-scoped); ScreenBody only handles
  // the individual screens below.
  if (activeScreen === 'myPass' || activeScreen === 'membership' || activeScreen === 'profile') return <MembershipScreen checkedIn={!!session?.checkedIn} navigate={navigate} />;
  if (activeScreen === 'history') return <HistoryScreen />;
  if (activeScreen === 'support') return <JubileeApply onDone={() => navigate('myPass')} />;
  if (activeScreen === 'team') return <TeamScreen />;
  if (activeScreen === 'programs') return <ProgramActions onDone={() => navigate('myPass')} />;
  if (activeScreen === 'earn') return <EarnScreen onDone={() => navigate('myPass')} />;
  if (activeScreen === 'standing') return <StandingScreen onDone={() => navigate('myPass')} />;
  if (activeScreen === 'staffDashboard') return <StaffDashboardScreen />;
  if (activeScreen === 'watchlist') return <WatchlistScreen />;
  if (activeScreen === 'payments') return <PaymentsScreen />;
  if (activeScreen === 'searchMember' || activeScreen === 'payVerify' || activeScreen === 'entry' || activeScreen === 'verification') return <SecurityVerifyScreen />;
  if (activeScreen === 'pricingDigits') return <PricingDigitsScreen />;
  if (activeScreen === 'bingoStyle') return <BingoStyleScreen navigate={navigate} />;
  if (activeScreen === 'tv') return <TvDisplayScreen />;
  if (activeScreen === 'lobby') return <LobbyScreen navigate={navigate} />;
  if (activeScreen === 'playerCard') return <PlayerCardScreen navigate={navigate} />;
  if (activeScreen === 'host') return <HostScreen />;
  if (activeScreen === 'songQueue') return <SongQueueScreen />;
  if (activeScreen === 'winner') return <WinnerScreen />;
  if (activeScreen === 'checkout') return <CheckoutScreen />;
  if (activeScreen === 'booking') return <TableBookingScreen />;
  if (activeScreen === 'bookingBoard') return <TableBookingBoardScreen />;
  if (activeScreen === 'lipsyncBattle') return <LipSyncBattleScreen isHost={session?.role === 'host' || session?.role === 'staff'} />;
  return <PartyScreen isHost={session?.role === 'host' || session?.role === 'staff'} />;
}

// Landing role picker — the app entry gate. A user is one of three things,
// and each sees a completely separate surface after this.
// The public front door — MEMBER ONLY. Staff/host tools are never shown here, so
// nobody browsing the app can see (or poke at) the door system. Venue team gets in
// with a hidden trigger: 5 quick taps on the year/footer mark opens Team Access.
function MemberDoor({ onMember, onStaff, auth, onSignOut }) {
  const taps = useRef([]);
  const secretTap = () => {
    const now = Date.now();
    taps.current = taps.current.filter((t) => now - t < 1800).concat(now);
    if (taps.current.length >= 5) { taps.current = []; onStaff(); }
  };
  return (
    <section className="screen screen-door">
      <div className="door-wrap">
        <span className="door-eyebrow">TALLAHASSEE</span>
        <h1 className="door-title">HITMANS VIP<span>AFTER SPOT</span></h1>
        <p className="door-tag">The members-only after spot</p>
        <div className="door-rule" aria-hidden="true" />
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
        {/* hidden staff/security entry — 5 quick taps here */}
        <button type="button" className="door-fine" onClick={secretTap}>Members only · verified at the door</button>
        <ConnectVenue />
      </div>
    </section>
  );
}

// Gold neon glyphs for the Team Access cards (drawn, so they can't corrupt).
const TEAM_ICONS = {
  staff: (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="12" y="11" width="24" height="29" rx="3.5" stroke="url(#tgA)" strokeWidth="2.6" />
      <rect x="18.5" y="7.5" width="11" height="7.5" rx="2.4" fill="#1a0b28" stroke="url(#tgA)" strokeWidth="2.6" />
      <path d="M17.5 27l4.2 4.2L30 22.5" stroke="url(#tgA)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <defs><linearGradient id="tgA" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffe9a8" /><stop offset="1" stopColor="#e0991f" /></linearGradient></defs>
    </svg>
  ),
  host: (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M24 5.5l15 5.2V21c0 9.6-6.4 15.9-15 19-8.6-3.1-15-9.4-15-19V10.7z" stroke="url(#tgB)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M24 14.5l2.9 6 6.5.7-4.9 4.4 1.4 6.4L24 28.6l-5.9 3.4 1.4-6.4-4.9-4.4 6.5-.7z" fill="url(#tgB)" />
      <defs><linearGradient id="tgB" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffe9a8" /><stop offset="1" stopColor="#e0991f" /></linearGradient></defs>
    </svg>
  ),
};

// Hidden Team Access — only reachable by the secret taps on the member door,
// and only the door team lives here now. Hosting moved to where the hosting
// happens: a tab inside Lip Sync Bingo, on the member side, behind the same
// venue host code. Whoever runs the night is in the room playing it; making
// them leave the game and come in through a staff door never matched that.
function TeamAccessScreen({ onPick, onBack }) {
  const cards = [
    { id: 'staff', label: 'Staff Check-In', tag: 'Door & verification tools', cta: 'Staff code' },
  ];
  return (
    <section className="screen screen-team">
      <div className="team-access">
        <div className="team-head">
          <span className="team-eyebrow">VENUE TEAM · RESTRICTED</span>
          <h1 className="team-title">Team Access</h1>
        </div>
        <div className="team-grid">
          {cards.map((c) => (
            <button key={c.id} type="button" className={`access-card access-${c.id}`} onClick={() => onPick(c.id)}>
              <span className="access-ring">{TEAM_ICONS[c.id]}</span>
              <strong className="access-label">{c.label}</strong>
              <span className="access-tag">{c.tag}</span>
              <span className="access-div" aria-hidden="true" />
              <span className="access-cta">🔒 {c.cta} <b>›</b></span>
            </button>
          ))}
        </div>
        <p className="team-note">Door staff and hosts only. Each needs the venue access code.</p>
        <button type="button" className="team-back" onClick={onBack}>← Back to member door</button>
      </div>
    </section>
  );
}

// Camera QR scanner (reuses the device camera + jsQR, like the door). Calls
// onDecode(text) with the first QR it sees.
function QrScan({ onDecode, onCancel }) {
  const videoRef = useRef(null); const rafRef = useRef(0); const streamRef = useRef(null);
  const [err, setErr] = useState('');
  // The camera used to be mounted in `.qr-framed.lg`, which draws its size from
  // a frame image this scanner never rendered — so the box collapsed to no
  // height, and the video inside it was styled `opacity: 0` until a `.live`
  // class that nothing here ever added. The stream really did open; there was
  // simply nothing on screen, and no way to aim a phone at a QR you cannot see.
  //
  // This now uses the same square frame the door scanner uses, which works:
  // the video fills it, `ready` flips it visible on the first real frame, and
  // until then it says so instead of showing a black hole.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setErr('No camera on this device.'); return; }
      // getUserMedia is blocked outright on an insecure origin, and the browser
      // does not explain why. Over plain http on someone's phone that reads as
      // "the camera is broken", so say what it actually is.
      if (!window.isSecureContext) { setErr('The camera only works on a secure (https) connection.'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!live) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream; const video = videoRef.current; video.srcObject = stream;
        try { await video.play(); } catch { /* autoPlay covers the browsers that refuse a bare play() */ }
        const canvas = document.createElement('canvas');
        const tick = () => {
          // videoWidth stays 0 until the first frame decodes; drawing before
          // that gives jsQR a blank canvas forever.
          if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
            if (live) setReady(true);
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
            if (code) { onDecode(code.data.trim()); return; }
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setErr(e?.name === 'NotAllowedError'
          ? 'Camera blocked — allow camera for this site in your browser settings, then try again.'
          : 'Could not start the camera.');
      }
    })();
    return () => { live = false; cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="qr-scan">
      <div className="qr-scanframe sq">
        <video className={`qr-cam${ready ? ' live' : ''}`} ref={videoRef} playsInline muted autoPlay />
        {ready && (
          <>
            <div className="qr-scanline2" aria-hidden="true" />
            <img className="qr-scan-logo-img" src={ui.fullLogoClear} alt="" aria-hidden="true" />
          </>
        )}
        <span className="qr-br tl" aria-hidden="true" />
        <span className="qr-br tr" aria-hidden="true" />
        <span className="qr-br bl" aria-hidden="true" />
        <span className="qr-br br" aria-hidden="true" />
        {!ready && !err && <div className="qr-cam-off starting">Starting camera…</div>}
        {err && <div className="qr-cam-off">Camera off</div>}
      </div>
      <span className="qr-align">★ ALIGN QR CODE HERE ★</span>
      {err ? <p className="gate-err">{err}</p> : <p className="venue-connect-note">Point at the venue's Join QR</p>}
      <button type="button" className="auth-back" onClick={onCancel}>← Back</button>
    </div>
  );
}

// A big "Join this venue" QR of the venue address, for others to scan.
function JoinQR({ url, label, onClose }) {
  const qr = useQrDataUrl(url, ui.fullLogoClear);
  return (
    <div className="join-qr">
      {qr ? <img src={qr} alt="Join QR" /> : <div className="qr-load">QR…</div>}
      <span>Scan to join</span>
      <small>{label || url}</small>
      <button type="button" className="auth-back" onClick={onClose}>Done</button>
    </div>
  );
}

// Connect this device to a venue backend at RUNTIME — scan its QR or paste the
// URL. No rebuild. The venue's own device is the server (LAN, no cloud); this
// just points the app at it and pulls its config (name, PayPal.me, Zelle).
// Rooms running right now, read from the directory the app serves from its own
// permanent address. This is the part that replaces a domain: a member never
// holds a link, they hold a room.
function RoomList({ onJoin, busy, onCount }) {
  const [rooms, setRooms] = useState(null);
  // The door needs to know whether this found anything, so it can drop the
  // manual address field on a normal night and bring it back on the one night
  // the directory is unreachable.
  useEffect(() => {
    let live = true;
    fetchRooms().then((r) => { if (!live) return; setRooms(r); onCount?.(r.length); })
      .catch(() => { if (live) { setRooms([]); onCount?.(0); } });
    return () => { live = false; };
  }, [onCount]);
  if (rooms === null) return <p className="mem-fineprint">Looking for rooms…</p>;
  if (!rooms.length) {
    return <p className="mem-fineprint">No rooms listed yet — scan the QR at the door, or enter the address below.</p>;
  }
  return (
    <div className="room-list">
      {rooms.map((r) => (
        <button type="button" key={r.venueId} className="room-row" disabled={busy} onClick={() => onJoin(r.url)}>
          <span className="room-name">
            <strong>{r.name}</strong>
            {r.city && <small>{r.city}</small>}
          </span>
          <span className="room-go">Join →</span>
        </button>
      ))}
    </div>
  );
}

function ConnectVenue() {
  const cfg = venueConfig();
  const connected = apiEnabled();
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [roomCount, setRoomCount] = useState(null);   // null = still looking
  const connectTo = async (u) => {
    setBusy(true); setErr('');
    try { await connectVenue(u); window.location.reload(); }
    catch (e) { setErr(e.message || 'Could not connect'); setScan(false); } finally { setBusy(false); }
  };
  const base = apiBase();
  const join = (u) => connectTo(u);
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
        {showQR && (
          // "localhost" means THIS device, whatever device is reading it. A QR
          // built from it sends every phone that scans it to itself, which is
          // the one address guaranteed not to have a venue on it. Say so rather
          // than handing out a code that cannot work.
          /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/i.test(base) ? (
            <div className="join-qr-wrap">
              <p className="gate-err">This venue is connected as <b>{base}</b>.</p>
              <p className="mem-fineprint">
                “localhost” means whichever device is reading it — so a QR made from this
                would send every phone to itself. Disconnect, then reconnect using the
                public link from the tunnel window (or this laptop’s address on the venue
                wifi, like http://192.168.1.20:8787). Then this QR works for everyone.
              </p>
              <button type="button" className="bingo-btn ghost" onClick={() => setShowQR(false)}>Close</button>
            </div>
          ) : (
            <JoinQR
              url={`${window.location.origin}${window.location.pathname}?connect=${encodeURIComponent(base)}`}
              label={base}
              onClose={() => setShowQR(false)}
            />
          )
        )}
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
          {/* Rooms first, address second. Nobody should have to hold a URL to
              get into a room they have been to before. */}
          <p className="venue-connect-note">rooms playing now</p>
          <RoomList onJoin={join} busy={busy} onCount={setRoomCount} />
          {/* Nobody should have to hold a URL. Tapping the room, or scanning the
              QR at the door, covers every normal night — so the address box is
              not sitting there asking to be typed into.

              It stays for exactly one case: the directory came back with no
              rooms in it. That is when a hand-typed address is the only way in,
              and taking it away would strand somebody at the door. */}
          {roomCount === 0 && (
            <>
              <p className="venue-connect-note">or enter the address</p>
              <input type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setErr(''); }}
                placeholder="http://192.168.1.20:8787" onKeyDown={(e) => e.key === 'Enter' && connectTo(url)} />
              <button type="button" className="venue-connect-go" disabled={!url.trim() || busy} onClick={() => connectTo(url)}>{busy ? 'Connecting…' : 'Connect'}</button>
            </>
          )}
          {err && <p className="gate-err">{err}</p>}
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
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const backend = apiEnabled();
  const idOk = name.trim().length >= 2 && contact.trim().length >= 5;

  const finishLocal = () => { memberSignIn(name, contact); onDone(); };

  const sendCode = async () => {
    if (!idOk) return;
    if (!backend) return finishLocal();          // no backend → local account on this phone
    setBusy(true); setErr('');
    try {
      const r = await memberOtpStart(contact.trim());
      const echoed = r.devCode || '';            // set when the venue echoes the code instead of sending it
      // If the venue hands the code straight back, it is not confirming anything
      // — nothing was sent anywhere, so nobody's phone proved it was theirs. All
      // the extra screen did was make a member read a number off their own
      // display and type it into the field below it. Finish the sign-in.
      //
      // A venue that really sends an SMS or an email returns no code here, and
      // that case still goes through the code screen, because there the typing
      // is the whole point.
      if (echoed) {
        await memberOtpVerify(contact.trim(), echoed, name.trim());
        memberSignIn(name, contact);
        onDone();
        return;
      }
      setDevCode('');
      // Where it went, so nobody sits watching the wrong inbox. Masked by the
      // venue — enough to recognise your own, not enough to read somebody
      // else's off a screen they are holding up in a crowded room.
      setSentTo(r.to || '');
      setStage('code');
    } catch (e) {
      // The venue tells us WHY when it is something the member can act on —
      // asked too soon, a contact it cannot reach, mail that would not send.
      // "Check the connection" for all of those sends somebody to reboot a
      // router over a twenty-second wait.
      setErr(e.message && !/^HTTP /.test(e.message) ? e.message : 'Could not reach the venue — check your connection.');
    }
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
                {busy ? 'Signing you in…' : 'Continue →'}
              </button>
              {/* The label used to read "Send code →" and the line under it
                  promised a one-time code. Neither is true when the venue hands
                  the code straight back — and a button that names a step the app
                  is about to skip is worse than no label at all. A venue that
                  really does send one still shows the code screen; the member
                  finds that out there, where it is actually happening. */}
              <p className="auth-fine">{backend
                ? 'This confirms it’s you and creates your member account.'
                : 'New here? This creates your member account on this phone — no code needed.'}</p>
            </>
          ) : (
            <>
              <label>6-digit code<input type="text" inputMode="numeric" value={code} onChange={(e) => { setCode(e.target.value); setErr(''); }} placeholder="000000" autoComplete="one-time-code" onKeyDown={(e) => e.key === 'Enter' && verify()} /></label>
              {/* The venue can be configured to echo the code back instead of paying
                  for SMS. When it does, show it plainly — a member staring at an
                  empty code box with nothing arriving is stuck at the door. */}
              {sentTo && <p className="auth-fine">Sent to <b>{sentTo}</b>. It expires in 5 minutes.</p>}
              {devCode && <p className="auth-fine">Your code: <code>{devCode}</code></p>}
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

// Staff / Host venue access-code gate. When connected to a venue backend the
// code is checked server-side (POST /auth/staff) and the returned session
// token is what every door-verify/search/board call below authenticates
// with — that's what makes it "one shared venue," not a per-device demo.
// With no backend connected it falls back to the client-side demo check.
function CodeGateScreen({ role, onBack, onDone }) {
  const r = roleById(role);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const backend = apiEnabled();
  const submit = async () => {
    if (backend) {
      setBusy(true); setErr('');
      try {
        // The same box takes the venue's shared code and a personal invite. A
        // personal invite carries its own role, and it wins: somebody handed a
        // door invite who happened to tap the Host card belongs on the door.
        const r = await apiStaffLogin(code.trim());
        onDone(r?.role);
      } catch (e) {
        // "Wrong code" is the least useful thing to say to somebody holding a
        // code that used to work. Expired and already-used are different
        // problems with the same fix, and the server knows which it is.
        setErr(e?.message || 'Wrong code — check with the venue.');
      } finally { setBusy(false); }
      return;
    }
    // No venue, no staff access. The client has nothing to check a code against
    // and must not pretend otherwise.
    setErr('Connect to the venue first — staff access is checked by the venue, not by this phone.');
  };
  return (
    <section className="screen screen-landing">
      <div className="home-dashboard auth-screen">
        <section className="sheet-title-banner"><div><span>{r.eyebrow} ACCESS</span><h1>{r.label}</h1></div></section>
        <div className="auth-card">
          <p className="gate-lead">🔒 This role can verify entries and run the night. Enter the venue code — or the personal code someone on the team gave you.</p>
          <label>Access code<input type="text" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setErr(''); }}
            placeholder="Venue or invite code" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onKeyDown={(e) => e.key === 'Enter' && submit()} /></label>
          {err && <p className="gate-err">{err}</p>}
          <button type="button" className="auth-continue" disabled={!code.trim() || busy} onClick={submit}>
            {busy ? 'Checking…' : `Unlock ${r.label} →`}
          </button>
          <p className="auth-fine">{backend
            ? `Connected to ${venueConfig().venue || 'this venue'}. A personal code signs you in as you — every door check and approval carries your name. The shared venue code runs the night but cannot approve money.`
            : 'This phone is not connected to a venue. Staff access is checked by the venue, so there is nothing to unlock here until it is.'}</p>
          <button type="button" className="auth-back" onClick={onBack}>← Back</button>
        </div>
      </div>
    </section>
  );
}

// Compact header on the role home: current role, an "on the way" toggle a
// member flips when heading over (not entry — that's the door verification),
// an INSIDE indicator once verified, and a way back to the role picker.
function RoleBadge({ role, onTheWay, inside, left, hasMember, onToggleOtw, onLeave, onSwitch }) {
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
            <button type="button" className="role-badge-checkin inside" onClick={onLeave} aria-label="Mark that you've left">
              ● Inside
            </button>
          ) : left ? (
            <span className="role-badge-checkin left">○ Left</span>
          ) : (
            <button type="button" className={`role-badge-checkin ${onTheWay ? 'on' : 'signedin'}`} onClick={onToggleOtw}>
              {onTheWay ? '● On the way' : '✓ Signed in'}
            </button>
          )
        )}
        <button type="button" className="role-badge-switch" onClick={onSwitch}>Switch</button>
      </div>
    </header>
  );
}

function HomeScreen({ role, session, navigate }) {
  // Staff had 5 separate full-screen destinations for tools used together,
  // all night, back-to-back — a tab flow (same pattern as My Pass) keeps
  // them one tap apart instead of round-tripping through this menu each time.
  if (role.id === 'staff') return <StaffHubScreen />;
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
      {role.id === 'member' && <MemberStatsBar navigate={navigate} />}
    </div>
  );
}

const STAFF_TABS = [
  { id: 'tonight', label: 'Tonight' },
  { id: 'verification', label: 'Verify' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'payments', label: 'Payments' },
  { id: 'bookingBoard', label: 'Bookings' },
  // Adding somebody to the team is a door job, done at the door, by the person
  // already standing there. It sat six taps deep inside the bingo host console,
  // which is a good way to guarantee the venue keeps using the shared code.
  { id: 'team', label: 'Team' },
];

// Staff Check-In as one tab flow: Dashboard / Verify / Watchlist / Payments /
// Bookings switch instantly (no full-screen transition) since these get used
// together, constantly, all night — the same reason My Pass is Pass/Loyalty/
// Account tabs instead of three separate screens.
function StaffHubScreen() {
  const [tab, setTab] = useState('tonight');
  // Where in the host console to land. Tonight hands over a destination, not
  // just a screen — arriving on the Run tab when somebody has called bingo
  // would be the same fetch-quest with one fewer step.
  const [hostTab, setHostTab] = useState('run');
  const go = (action) => {
    if (!action) return;
    if (action.screen === 'host') { setHostTab(action.tab || 'run'); setTab('host'); return; }
    setTab(action.tab || 'tonight');
  };
  // Only the owner's phone gets a Team tab. A door person tapping it would get
  // a refusal, and a tab that exists to refuse you is worse than no tab: it
  // reads as something broken rather than as something that is not your job.
  // The venue host code keeps it while the venue has no owner account yet,
  // because that is the tap that creates one.
  const mayManageTeam = apiEnabled() && apiStaffRole() === 'host';
  const tabs = STAFF_TABS.filter((t) => t.id !== 'team' || mayManageTeam);
  return (
    <div className="staff-hub">
      <div className="staff-hub-tabs">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={`staff-hub-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {/* Host controls render INSIDE the hub, so the tab bar above stays put
          and the way back is the same row of tabs you arrived through. */}
      {tab === 'tonight' ? <TonightScreen onGo={go} />
        : tab === 'host' ? <HostScreen initialTab={hostTab} />
        : <ScreenBody activeScreen={tab} navigate={setTab} session={{}} />}
    </div>
  );
}

// Live stats strip under the member menu (design 5): rewards, status, last entry,
// loyalty points — all from the member's real record.
function MemberStatsBar({ navigate }) {
  const member = useMember();
  if (!member) return null;
  const tickets = member.tickets || 0;
  const active = member.status !== 'expired' && (!member.expiresAt || Date.now() < member.expiresAt);
  const lastEntry = member.verifiedAt ? fmtDate(member.verifiedAt) : '—';
  const pts = (member.loyalty || 0).toLocaleString();
  return (
    <div className="member-statsbar">
      <button type="button" className="msb-cell" onClick={() => navigate('membership')}>
        <span className="msb-ic rewards" aria-hidden="true">★</span>
        <span className="msb-text"><span className="msb-label">NIGHT REWARDS</span><b className="msb-val pink">{tickets} available</b></span>
      </button>
      <span className="msb-div" aria-hidden="true" />
      <div className="msb-cell">
        <span className="msb-ic status" aria-hidden="true">🛡</span>
        <span className="msb-text"><span className="msb-label">VIP STATUS</span><b className={`msb-val ${active ? 'ok' : 'off'}`}>{active ? 'ACTIVE' : 'EXPIRED'}</b></span>
      </div>
      <span className="msb-div" aria-hidden="true" />
      <div className="msb-cell">
        <span className="msb-ic entry" aria-hidden="true">🗓</span>
        <span className="msb-text"><span className="msb-label">LAST ENTRY</span><b className="msb-val">{lastEntry}</b></span>
      </div>
      <span className="msb-div" aria-hidden="true" />
      <button type="button" className="msb-cell" onClick={() => navigate('membership')}>
        <span className="msb-ic pts" aria-hidden="true">💎</span>
        <span className="msb-text"><span className="msb-label">LOYALTY POINTS</span><b className="msb-val gold">{pts} PTS</b></span>
      </button>
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

// A dashboard stat widget (frame + icon art only) with all text and the bottom
// bar rebuilt live: neon label + number (the logo's pink-neon look), and either
// a live sparkline tracker (entries) or a dynamic capacity meter (event/venue).
// The little capacity bar inside a dashboard stat tile. Distinct from the
// game's <Meter> below, which is the venue's rank art driven by live play —
// this one is a 22px sliver sharing a slot with a sparkline.
function StatMeter({ pct }) {
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
        {series ? <Sparkline data={series} /> : <StatMeter pct={cap ? (value / cap) * 100 : 0} />}
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
        {/* A scan that read nothing is not a person to refuse. Saying DO NOT
            ADMIT to a blank frame teaches the door to distrust the screen, and
            it accuses whoever happens to be standing there. */}
        <p className={`scan-alert-verdict ${result.ok ? 'go' : result.status === 'unreadable' ? 'again' : 'no'}`}>
          {result.ok ? 'GRANT ENTRY' : result.status === 'unreadable' ? 'SCAN AGAIN' : 'DO NOT ADMIT'}
        </p>
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

// Renders a QR of `text` in our own custom style — real, standard QR data
// (every module sampled at its exact standard grid position; nothing about
// WHERE the data lives ever changes) drawn as vertical rounded bars in a
// brand-color gradient instead of flat black squares, so runs of adjacent
// dark modules read as little "sound wave"/equalizer bars. Finder patterns
// (the 3 big corner squares scanners lock onto) stay solid, ungradiented,
// standard squares for reliable detection. If `badgeSrc` is given, that
// image sits in the center on a dark plate, well within H-level
// error-correction tolerance (~8% of the code's area, vs. the 30% H allows).
function useQrDataUrl(text, badgeSrc) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    if (!text) { setUrl(''); return undefined; }
    renderSoundwaveQr(text, badgeSrc)
      .then((dataUrl) => { if (live) setUrl(dataUrl); })
      .catch(() => {
        // Fall back to a plain standard QR if anything about the custom
        // render fails — a real code that scans beats no code at all.
        QRCode.toDataURL(text, { margin: 1, width: 480, errorCorrectionLevel: 'M', color: { dark: '#1b0b2e', light: '#f7ecff' } })
          .then((qrUrl) => { if (live) setUrl(qrUrl); }).catch(() => {});
      });
    return () => { live = false; };
  }, [text, badgeSrc]);
  return url;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function renderSoundwaveQr(text, badgeSrc) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const isDark = (r, c) => !!data[r * size + c];
  // The 3 finder-pattern corners (7x7 bullseye + 1-module separator ring) —
  // kept as plain solid squares, untouched by the bar/gradient styling, so
  // scanners lock on exactly as they would on a standard QR code.
  const isFinderZone = (r, c) => (r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8);

  const W = 480; // rendered large so it stays crisp blown up full-screen at the door
  const margin = 2; // quiet-zone modules, same as a standard QR's border
  const totalModules = size + margin * 2;
  const cell = W / totalModules;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = W;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f7ecff';
  ctx.fillRect(0, 0, W, W);

  const ox = (c) => (c + margin) * cell;
  const oy = (r) => (r + margin) * cell;

  // All three stops kept deliberately dark (relative luminance ~50-65 out of
  // 255) against the ~240 cream background — confirmed by an independent
  // decoder (ZBar/pyzbar, not just jsQR) that the lighter pink this used to
  // fade to (~131 luminance) was the actual cause of real phones failing to
  // scan it: low-contrast modules are the first thing blur or distance turn
  // into ambiguous gray, which is exactly what happens scanning a QR code
  // off of another phone's screen instead of print.
  const gradient = ctx.createLinearGradient(0, 0, W, W);
  gradient.addColorStop(0, '#5b17a3');
  gradient.addColorStop(0.55, '#a4189c');
  gradient.addColorStop(1, '#c11458');

  // Plain fillRect, no rounding: rounding each module individually here left
  // hairline gaps between adjacent finder-pattern cells, breaking the solid
  // square scanners detect against — confirmed by decoding the actual output
  // with jsQR (this exact bug made every real QR fail to scan).
  ctx.fillStyle = '#1b0b2e';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isDark(r, c) && isFinderZone(r, c)) {
        ctx.fillRect(ox(c), oy(r), cell, cell);
      }
    }
  }

  // Data modules: merge each column's contiguous dark runs into one rounded
  // bar (the "sound wave" look) — every original module's center point is
  // still fully covered, so a scanner reads the exact same bits either way.
  // NOTE: the corner radius here is capped low deliberately — verified by
  // decoding the actual output with jsQR. A higher radius (tried 0.45) still
  // *looked* fine but rounded isolated single-module bars down to near-
  // circles and broke real scanning; 0.22 is confirmed to decode reliably.
  ctx.fillStyle = gradient;
  for (let c = 0; c < size; c++) {
    let r = 0;
    while (r < size) {
      if (isFinderZone(r, c) || !isDark(r, c)) { r++; continue; }
      let r2 = r;
      while (r2 + 1 < size && !isFinderZone(r2 + 1, c) && isDark(r2 + 1, c)) r2++;
      const x = ox(c) + cell * 0.1;
      const y = oy(r) + cell * 0.1;
      const w = cell * 0.8;
      const h = (r2 - r + 1) * cell - cell * 0.2;
      roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.22);
      ctx.fill();
      r = r2 + 1;
    }
  }

  if (!badgeSrc) return Promise.resolve(canvas.toDataURL('image/png'));

  return new Promise((resolve) => {
    const finish = () => resolve(canvas.toDataURL('image/png'));
    const badge = new Image();
    badge.onload = () => {
      const s = Math.round(W * 0.24);
      const x = (W - s) / 2, y = (W - s) / 2;
      const ar = badge.naturalWidth / badge.naturalHeight;
      const bh = s, bw = s * ar;
      const bx = x + (s - bw) / 2, by = y;
      const pad = Math.round(s * 0.16);
      const px = x - pad, py = y - pad, pw = s + pad * 2, ph = s + pad * 2;
      ctx.fillStyle = '#1b0b2e';
      roundRectPath(ctx, px, py, pw, ph, 12);
      ctx.fill();
      ctx.strokeStyle = '#ffd66b';
      ctx.lineWidth = 2;
      roundRectPath(ctx, px + 1, py + 1, pw - 2, ph - 2, 11);
      ctx.stroke();
      ctx.drawImage(badge, bx, by, bw, bh);
      finish();
    };
    badge.onerror = finish;                     // no badge beats a broken canvas
    badge.src = badgeSrc;
  });
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
function MembershipScreen({ checkedIn, navigate }) {
  const member = useMember();
  const [renew, setRenew] = useState(false);
  // Cancelling used to be a single unconfirmed tap that wiped the membership.
  // The member vanished, so this screen re-rendered as the tier rail — and from
  // the outside that is the app throwing you onto a sales screen for no reason
  // you can see. It now lands on an acknowledgement you leave when you choose.
  const [cancelled, setCancelled] = useState(false);
  const boughtAt = useRef(member?.purchasedAt);
  useEffect(() => {                                   // purchased in renew mode -> back to pass
    if (renew && member && member.purchasedAt !== boughtAt.current) setRenew(false);
  }, [member?.purchasedAt, renew]);
  // A Zelle/cash claim confirms on a DIFFERENT device (staff, at the door) —
  // poll for that here so "you'll see your card update" (promised on the
  // claim-filed screen) is actually true, whether or not this device has a
  // local tier yet.
  useEffect(() => {
    syncMemberFromBackend();
    const id = setInterval(syncMemberFromBackend, 8000);
    return () => clearInterval(id);
  }, []);

  if (cancelled) {
    return (
      <AppPanel title="Membership cancelled" subtitle="Nothing is charged again">
        <p className="dash-empty">Your pass is closed. You can join again whenever you want — your member number stays yours.</p>
        <button type="button" className="bingo-btn gold" onClick={() => setCancelled(false)}>See memberships</button>
      </AppPanel>
    );
  }
  if (member && !renew) {
    return <MemberPass member={member} checkedIn={checkedIn} navigate={navigate}
      onRenew={() => { boughtAt.current = member.purchasedAt; setRenew(true); }}
      onCancelled={() => setCancelled(true)} />;
  }
  return <BuyMembership renewMode={!!member} currentTier={member?.tier} onBack={member ? () => setRenew(false) : undefined} />;
}

// Step 1 — you are not a member yet (or you're renewing). Pick a tier, pick how
// you pay, purchase.
function BuyMembership({ renewMode = false, currentTier, onBack } = {}) {
  const [tier, setTier] = useState(currentTier || 'Monthly');
  const [pay, setPay] = useState('PayPal');   // real payable method up front
  const [give, setGive] = useState('');        // open Daily contribution ('' = 0.00)
  const railRef = useRef(null);
  const scrollTimer = useRef(null);
  // Tap OR swipe both pick a tier. Tapping scrolls that card to center;
  // swiping and letting go auto-selects whatever settled at center — the
  // rail is CSS scroll-snap, so "settled" always means centered already.
  // Scrolls ONLY the rail itself (rail.scrollTo, not element.scrollIntoView)
  // — scrollIntoView can drag ancestor scroll containers along with it on
  // mobile, which was scrolling the whole page just from tapping a tier.
  const selectTier = (name) => {
    setTier(name);
    const rail = railRef.current;
    const card = rail?.querySelector(`[data-tier="${name}"]`);
    if (rail && card) {
      rail.scrollTo({ left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
    }
  };
  const onRailScroll = () => {
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const rail = railRef.current;
      if (!rail) return;
      const center = rail.scrollLeft + rail.clientWidth / 2;
      let closest = null, closestDist = Infinity;
      for (const card of rail.querySelectorAll('[data-tier]')) {
        const dist = Math.abs((card.offsetLeft + card.offsetWidth / 2) - center);
        if (dist < closestDist) { closestDist = dist; closest = card.dataset.tier; }
      }
      if (closest) setTier(closest);
    }, 120);
  };
  const t = TIER_BY[tier];
  const win = t.open ? dailyWindow() : null;         // Daily: open (pay-what-you-want) until 2AM, else $15
  const cd = useCountdown(win ? win.until : null);   // ticks; flips win.free at 2AM
  const openFree = !!(win && win.free);              // in the pay-what-you-want window
  const amount = t.open
    ? (openFree ? Math.max(0, Math.round((Number(give) || 0) * 100) / 100) : DAILY_LATE_PRICE)
    : t.price;
  const free = openFree && amount <= 0;              // $0 contribution → join free
  const payAmount = amount;
  const finalize = (via, amt) => { purchaseTier(tier, via, amt); };
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
      <div className="tier-buy-grid" ref={railRef} onScroll={onRailScroll}>
        {TIERS.map((row) => (
          <button
            key={row.name}
            type="button"
            data-tier={row.name}
            className={`tier-buy-card${tier === row.name ? ' picked' : ''}`}
            onClick={() => selectTier(row.name)}
          >
            {/* tier card with the purple price digits baked into the slot */}
            <img className="tier-buy-art" src={TIER_SRC[row.name]} alt={row.name} />
          </button>
        ))}
      </div>
      <div className="tier-buy-dots">
        {TIERS.map((row) => (
          <span key={row.name} className={`tier-buy-dot${tier === row.name ? ' on' : ''}`} />
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
          {tier} membership · <b>{free ? 'Free' : fmtUSD(payAmount)}</b>{t.vip ? ' · VIP' : ''} · {free ? 'no charge' : pay}
        </p>
        {free ? (
          // Open contribution set to $0 — join free, straight onto the network.
          //
          // Text, not the SELECT PLAN artwork. There is no art in the kit that
          // says "join free", and this is the first button a new member ever
          // presses — a plate reading SELECT PLAN on the control that actually
          // completes a membership is the app naming the wrong action at the
          // one moment somebody is deciding whether to trust it.
          <button type="button" className="buy-free-btn" onClick={() => finalize('Free', 0)}>
            Join free — get my card
          </button>
        ) : pay === 'PayPal' && tierPayable(tier) && !t.open ? (
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
function MemberPass({ member, checkedIn, onRenew, onCancelled, navigate }) {
  const qr = useQrDataUrl(`HVAS-MEMBER:${member.number}`, ui.fullLogoClear);
  const isVip = member.vip;
  const verified = member.status === 'verified';
  const entries = member.entries || 0;
  const { rank, next } = rankFor(entries);
  const progress = next ? Math.min(100, Math.round(((entries - rank.min) / (next.min - rank.min)) * 100)) : 100;
  // Where the marker sits on the single continuous loyalty track. Badges are
  // an even 6-column grid, so rank i's badge centre is at (i + 0.5)/6 — the
  // marker parks under your current badge and slides toward the next one as
  // nights accrue. Top tier pins to the far end.
  const rankIdx = RANKS.findIndex((r) => r.name === rank.name);
  const trackPos = !next
    ? 100
    : ((rankIdx + 0.5 + Math.min(1, Math.max(0, (entries - rank.min) / (next.min - rank.min)))) / RANKS.length) * 100;
  // The marker is centred on its position, so at the very ends half of it
  // would hang off the track — keep it just inside instead.
  const markerPos = Math.min(97.8, Math.max(2.2, trackPos));
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
  // Tap the QR to blow it up full-screen — a real "hold it out at the door"
  // card, not a small code buried in the pass layout.
  const [bigQr, setBigQr] = useState(false);
  // Pass / Loyalty & Access / Account — three focused screens instead of one
  // long stack. Nothing was removed, it's just not all on screen at once.
  const [tab, setTab] = useState('pass');
  const [confirmCancel, setConfirmCancel] = useState(false);

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
      {/* Status: Signed in / On the way / Inside (tap to mark left) / Left.
          Lives here — not just RoleBadge's 'home' screen — because members
          land straight on My Pass and never actually visit 'home'. */}
      <div className="mem-status-row">
        {isInsideTonight(member) ? (
          <button type="button" className="role-badge-checkin inside" onClick={leaveVenue} aria-label="Mark that you've left">● Inside</button>
        ) : isLeftTonight(member) ? (
          <span className="role-badge-checkin left">○ Left</span>
        ) : (
          <button type="button" className={`role-badge-checkin ${isOnTheWay(member) ? 'on' : 'signedin'}`} onClick={() => setOnTheWay(!isOnTheWay(member))}>
            {isOnTheWay(member) ? '● On the way' : '✓ Signed in'}
          </button>
        )}
      </div>
      {/* Two tabs, not four.
      
          Four was one row of choices to open a membership card. And they were
          not four subjects — they were two, cut in half: Pass and "Loyalty &
          Access" are both the answer to "who am I here and what does that get
          me", and Account and History are both "what have I paid and what have
          I done". A member arriving at their own card should not have to work
          out which of four places their rank lives in.

          So: MY CARD is everything about standing in the room — the card, the
          QR, tonight's perks, rank, and what you can get into. ACCOUNT is
          everything you do to the membership — renew, upgrade, cancel, HITKOIN,
          and the record of the nights behind it. */}
      <div className="mem-tabs mem-tabs--two">
        <button type="button" className={`mem-tab${tab === 'pass' ? ' on' : ''}`} onClick={() => setTab('pass')}>My Card</button>
        <button type="button" className={`mem-tab${tab === 'account' ? ' on' : ''}`} onClick={() => setTab('account')}>Account</button>
      </div>
      {/* NOTHING GOES ABOVE THE PASS.

          This screen had grown a programme picker and three full-width calls to
          action stacked over the card, which meant a member standing in a queue
          on a Saturday night scrolled past all four to reach the QR that gets
          them through the door. Every one of those is a thing you do sitting at
          home. The pass is the thing you need with somebody waiting behind you.

          So they live under Account now — one tap away, and out of the way. */}
      {tab === 'pass' && (
      <>
      {/* The road in was Continue, pick a tier, join, and then a member is
          looking at their card with no idea that the game is two taps away
          behind HOME. This is the thing they came for, so it says so — right
          here, on the screen they land on the moment they are a member. */}
      {navigate && (
        <button type="button" className="mem-play-cta" onClick={() => navigate('lobby')}>
          ▶ Play Lip Sync Bingo
        </button>
      )}
      {/* Wrapper so landscape (short height, wide width) can lay the pass
          card and everything below it side by side instead of stacking —
          stacked, this tab alone needs ~2x the height a landscape phone has. */}
      <div className="mem-pass-body">
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
            <div className="mem-meta-expiry"><dt>Valid until</dt><dd>{fmtDate(member.expiresAt)}</dd></div>
            <div><dt>Paid with</dt><dd>{member.payment}</dd></div>
          </dl>
          {verified && <img className="mem-verified-alert" src={ui.verify.entryVerified} alt="Entry status: verified" />}
        </div>
        <div className="mem-qr">
          <button type="button" className="qr-clean qr-tap" onClick={() => qr && setBigQr(true)} aria-label="Hold up at the door">
            {qr ? <img src={qr} alt="Member QR code" /> : <div className="qr-load">QR…</div>}
          </button>
          <span>Tap to hold up at the door</span>
          <button type="button" className="asset-cta compact verify-self" onClick={() => setVerifyResult(previewCardStatus(member.number))} aria-label="Verify membership">
            <img src={ui.verify.verifyCard} alt="Verify membership" />
          </button>
        </div>
      </div>

      {bigQr && (
        <div className="big-qr-overlay" onClick={() => setBigQr(false)}>
          <div className="big-qr-card" onClick={(e) => e.stopPropagation()}>
            <div className="big-qr-frame">
              {qr ? <img src={qr} alt="Member QR code" /> : <div className="qr-load">QR…</div>}
            </div>
            <strong className="big-qr-name">{member.name || 'Member'}</strong>
            <span className="big-qr-number">{member.tier}{isVip ? ' VIP' : ''} · {member.number}</span>
            <button type="button" className="big-qr-close" onClick={() => setBigQr(false)}>Done</button>
          </div>
        </div>
      )}

      <div className="mem-pass-side">
      {/* — tonight's perks: hospitality tickets (entry OR a Cafe8Fifty meal) — */}
      <section className="perks">
        <h3>Tonight’s perks</h3>
        {perk.tickets > 0 && (
          <div className="perk-tickets">
            <div className="ticket-stub"><b>{tickets}</b><span>hospitality<br />{tickets === 1 ? 'ticket' : 'tickets'}</span></div>
            <div className="perk-body">
              <p>Use each ticket for <b>entry inside</b> <i>or</i> a <b>free Cafe8Fifty meal</b>. Resets nightly at 3AM.</p>
              {tickets > 0 ? (
                <div className="perk-choices">
                  <button type="button" className="perk-use" onClick={useTicket}>🎟 Use for entry</button>
                  <button type="button" className="perk-use meal" onClick={claimMeal}>🍽 Cafe8Fifty meal</button>
                </div>
              ) : <span className="perk-done">Used up tonight</span>}
            </div>
          </div>
        )}
        {perk.drinks && <div className="perk-row"><span>🥂 Drinks free all night</span><span className="perk-vip">VIP</span></div>}
        {perk.tickets === 0 && !perk.drinks && <p className="perk-none">Entry access only. Upgrade for nightly hospitality tickets.</p>}
      </section>

      {/* — renewal countdown — */}
      <div className={`renews-bar${expired ? ' expiredbar' : soon ? ' soon' : ''}`}>
        <span className="renews-tier">{member.tier}{isVip ? ' VIP' : ''} MEMBER<small>{expired ? 'Expired · renew now' : 'Active · thank you!'}</small></span>
        <span className="renews-right"><small>{expired ? 'Status' : 'Renews in'}</small>{expired ? <span className="renews-time exp">EXPIRED</span> : <RenewsIn expiresAt={member.expiresAt} />}</span>
      </div>
      </div>
      </div>
      </>
      )}

      {tab === 'pass' && (
      <>
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
        {/* ONE continuous track under the whole rank row (this used to be six
            disconnected per-badge slivers, which read as a broken line). The
            marker sits directly under the badge you're on and slides toward
            the next — badges are an even 6-col grid, so rank i's badge centre
            is at (i + 0.5)/6 of the width. */}
        <div className="loyalty-track">
          <span className="loyalty-track-fill" style={{ width: `${trackPos}%` }} />
          <img className="loyalty-track-marker" src={`${A_}assets/ui/rank/loy_marker.png`} style={{ left: `${markerPos}%` }} alt="" />
        </div>
        <div className="loyalty-progress">
          <p>{next
            ? <><b>{rank.name}</b> · {entries} {entries === 1 ? 'night' : 'nights'} in · {next.min - entries} more to <b>{next.name}</b></>
            : <><b>VIP rank</b> · {entries} nights in · top tier reached</>}</p>
        </div>
        <p className="loyalty-note">Nights count automatically each time security verifies you at the door.</p>
      </section>

      <HitKoinWidget />

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
      </>
      )}

      {tab === 'account' && (
      <>
      {/* Where the association lives: what you stand behind, what you can earn,
          and the relationship itself. All three were stacked over the pass and
          are here now — the pass is for the door, this is for the sofa. */}
      {apiEnabled() && <ProgramPicker compact />}
      {apiEnabled() && navigate && (
        <button type="button" className="prog-do" onClick={() => navigate('programs')}>
          <strong>Give to a cause, or serve on a board</strong>
          <span>Playing gives a programme nothing. This is how you actually put something in.</span>
        </button>
      )}
      {/* The other direction: what this place can pay YOU. It sits beside
          giving on purpose — a member should meet both together rather than
          finding out months later that the room was a market the whole time. */}
      {apiEnabled() && navigate && (
        <button type="button" className="prog-do earn-do" onClick={() => navigate('earn')}>
          <strong>Get paid here</strong>
          <span>Sell what you do, take bookings, license what you made, or earn on who you bring.</span>
        </button>
      )}
      {/* The relationship itself, rather than anything done inside it. A member
          of a private association is owed the document they signed, the record
          held about them, and the way out — and none of those should be
          something they have to ask a person for. */}
      {apiEnabled() && navigate && (
        <button type="button" className="prog-do stand-do" onClick={() => navigate('standing')}>
          <strong>Your membership</strong>
          <span>What you signed, what we hold about you, and how to leave.</span>
        </button>
      )}

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
        <button type="button" className="mem-signout" onClick={memberSignOut}>Sign out</button>
        {/* Two taps, and the second one says what it does. Closing a membership
            is not undoable and this was one unguarded tap next to Sign out. */}
        {!confirmCancel ? (
          <button type="button" className="mem-cancel" onClick={() => setConfirmCancel(true)}>Cancel membership</button>
        ) : (
          <div className="mem-confirm">
            <p>Close this membership? Your rank and nights go with it.</p>
            <button type="button" className="mem-cancel" onClick={() => { resetMembership(); onCancelled?.(); }}>Yes, cancel it</button>
            <button type="button" className="bingo-btn ghost" onClick={() => setConfirmCancel(false)}>Keep my membership</button>
          </div>
        )}
      </section>
      <p className="mem-fineprint">Everything for your membership lives here — pass, QR, renewal, loyalty rank, and profile.</p>
      </>
      )}

      {/* The way in, on the tab where a member already deals with their
          membership. Deliberately quiet: somebody who needs this will look for
          it, and somebody who does not should not be asked about it every time
          they open their card. It sits above the history rather than under it,
          because a member in trouble should not have to scroll past a year of
          check-ins to find the one thing on this screen that helps them. */}
      {tab === 'account' && navigate && apiEnabled() && (
        <button type="button" className="jub-entry" onClick={() => navigate('support')}>
          <strong>Need help with rent, a bill or food?</strong>
          <span>The venue pays the provider directly. Ask the door.</span>
        </button>
      )}

      {tab === 'account' && <HistoryScreen />}

      <ScanAlert result={verifyResult} onDismiss={() => setVerifyResult(null)} />
    </div>
  );
}

// HitKoin — the member's real on-chain reward balance. Mints automatically
// on a confirmed payment, so this is read-only here: nothing to buy, tap,
// or claim — it just shows what's already been earned. Hidden entirely
// until the venue has HitKoin turned on and this member has earned some.
function HitKoinWidget() {
  const [wallet, setWallet] = useState(null);
  useEffect(() => {
    if (!apiEnabled() || !apiToken()) return;
    let live = true;
    const load = () => apiWallet().then((w) => live && setWallet(w)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, []);
  if (!wallet?.enabled) return null; // venue hasn't turned HitKoin on
  const balance = Math.round(Number(wallet.balance || 0));
  return (
    <section className="hitkoin">
      <h3>HitKoin</h3>
      {!wallet.address ? (
        <p className="hitkoin-note">Pay for a membership to start earning HitKoin — it mints to your own wallet automatically.</p>
      ) : (
        <>
          <div className="hitkoin-balance">
            <span className="hitkoin-amount">{balance.toLocaleString()}</span>
            <span className="hitkoin-unit">HITK</span>
          </div>
          <p className="hitkoin-note">Redeemable for entry, VIP upgrades, and drink perks at the venue.</p>
          {wallet.mints.length > 0 && (
            <div className="hitkoin-history">
              {wallet.mints.slice(0, 5).map((m) => (
                <div className="hitkoin-row" key={m.id}>
                  <span>{m.reason} · {fmtUSD(m.usdAmount)}</span>
                  <span className="hitkoin-row-amount">+{Math.round(m.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Which build this phone is running. The app keeps itself current on its
          own, but "am I actually on the new one?" had no answer before — for a
          member, for the door, or for me trying to reproduce a bug over text. */}
      <p className="build-stamp">App build {BUILD_ID} · updates automatically</p>
    </section>
  );
}

// Owner reconciliation — the HVAS Pay board. Pending Zelle/cash claims stream
// here (converged over the mesh); confirm activates the membership, void drops it.
function PaymentsScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    if (!apiEnabled() || !apiStaffToken()) { setErr('Connect a backend to reconcile payments.'); setRows([]); return; }
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
// The door-decision action row: Grant / Deny / Trespass / Ban. Grant admits +
// logs the night; Deny turns them away (clears inside/verified); Trespass & Ban
// write penalty flags that ride the hub to every device.
function PenaltyControls({ member }) {
  const [, force] = useState(0);
  const pen = memberPenalty(member.number);
  const rerender = () => force((n) => n + 1);
  const flag = (kind, reason) => { penalizeMember(member.number, member.name, kind, reason); rerender(); };
  const grant = () => { commitMember(admitTonight({ ...member, status: 'verified', verifiedAt: Date.now() })); rerender(); };
  const deny = () => { commitMember({ ...member, verifiedAt: null, lastEntryNight: null }); rerender(); };
  if (pen) {
    return (
      <div className="door-acts flagged">
        <span className={`dash-flag ${pen.kind}`}>{PENALTY_LABEL[pen.kind]}</span>
        <button type="button" className="door-act clear" onClick={() => flag('cleared', '')}>Lift flag</button>
      </div>
    );
  }
  return (
    <div className="door-acts">
      <button type="button" className="door-act grant" onClick={grant}><span className="door-act-ic" aria-hidden="true">🛡</span>Grant</button>
      <button type="button" className="door-act deny" onClick={deny}><span className="door-act-ic" aria-hidden="true">✋</span>Deny</button>
      <button type="button" className="door-act trespass" onClick={() => flag('trespass', 'Trespassed at the door')}><span className="door-act-ic" aria-hidden="true">⚠️</span>Trespass</button>
      <button type="button" className="door-act ban" onClick={() => flag('banned', 'Banned from the venue')}><span className="door-act-ic" aria-hidden="true">⛔</span>Ban</button>
    </div>
  );
}

// ── Lip Sync Battle ──────────────────────────────────────────────────────
// A LIP SYNC square can't be tapped — you perform for it. This is the whole
// floor: the call-out prompt, the TikTok-style portrait recorder with a live
// mic meter, and the vote.

// Live mic level, 0..1, straight off the analyser. This is the "meter" during
// a performance — it reacts to the room, so a performer who's actually going
// for it visibly drives it.
function useMicLevel(stream, active) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream || !active) return undefined;
    let raf = 0, ctx = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => {
        an.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        // smooth it so the bar doesn't strobe on every frame
        setLevel((prev) => prev * 0.72 + Math.min(1, sum / buf.length / 90) * 0.28);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    } catch { /* no mic analysis — the meter just stays flat */ }
    return () => { cancelAnimationFrame(raf); ctx?.close?.().catch(() => {}); };
  }, [stream, active]);
  return level;
}

// Watch the performance live on any screen that isn't the performer's.
function BattleWatch({ battleId, label }) {
  const [frame, setFrame] = useState(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!battleId) return undefined;
    let on = true;
    const tick = async () => {
      try { const r = await apiBattleWatch(battleId); if (on) { setFrame(r.frame); setLive(!!r.live); } }
      catch { if (on) setLive(false); }
    };
    tick();
    const id = setInterval(tick, 450);
    return () => { on = false; clearInterval(id); };
  }, [battleId]);
  if (!live || !frame) return null;
  return (
    <div className="battle-watch">
      <img src={frame} alt={label || 'Live performance'} />
      <span className="battle-watch-live">● LIVE</span>
    </div>
  );
}

const BATTLE_EMOJI = ['🔥', '💯', '😂', '👑', '🎤', '💀'];

// The IG-Live layer: comments scrolling up the bottom of the battle screen,
// one-tap emoji, and running reaction totals.
function BattleChat({ battle, onChanged }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);
  // Pin to the newest comment the way a live chat does.
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [battle?.comments?.length]);

  const say = async (body, kind) => {
    if (!body?.trim() || sending) return;
    setSending(true);
    try { await apiBattleSay(battle.id, body, kind); await onChanged?.(); } catch { /* ignore */ }
    setSending(false);
  };
  const send = async (e) => { e.preventDefault(); const t = text; setText(''); await say(t, 'comment'); };

  return (
    <div className="battle-chat">
      <div className="battle-reactions">
        {BATTLE_EMOJI.map((e) => {
          const n = battle.reactions?.find((r) => r.emoji === e)?.n || 0;
          return (
            <button key={e} type="button" className="battle-emoji" onClick={() => say(e, 'reaction')}>
              <span>{e}</span>{n > 0 && <b>{n}</b>}
            </button>
          );
        })}
      </div>
      <div className="battle-log" ref={logRef}>
        {(battle.comments || []).length === 0
          ? <p className="battle-log-empty">Say something…</p>
          : battle.comments.map((c) => (
            <p key={c.id} className="battle-line"><b>{c.name}</b> {c.body}</p>
          ))}
      </div>
      <form className="battle-say" onSubmit={send}>
        <input type="text" value={text} maxLength={200} placeholder="Add a comment…"
          onChange={(e) => setText(e.target.value)} />
        <button type="submit" disabled={!text.trim() || sending}>Send</button>
      </form>
    </div>
  );
}

// Post your take to Instagram / TikTok / Snapchat / YouTube Shorts.
//
// Deliberately the native share sheet, not per-platform "post" APIs: neither
// Instagram nor TikTok exposes a public web endpoint that lets an arbitrary
// app publish a video on a user's behalf (they gate it behind a Business
// account and app review). The share sheet needs no OAuth, no review, and no
// stored credentials — the member picks the app themselves and lands in its
// own composer, which is what every consumer app actually does on mobile.
// Desktop and older browsers get a plain save instead.
function SharePerformance({ blob, artist, song }) {
  const [msg, setMsg] = useState('');
  // Registering the take as the performer's own work.
  //
  // The video does NOT go anywhere. The phone hashes it and the venue records
  // the 64 characters only this exact file can produce, with the member named
  // as the performer and the night it happened. Proving it later means
  // producing the file and showing it still hashes to the same value — which
  // is why this can be honest about authorship without ever taking custody of
  // somebody's video.
  const [reg, setReg] = useState(null);          // null | 'working' | result | 'off'
  const registerTake = async () => {
    setReg('working');
    try {
      const contentHash = await hashTake(blob);
      if (!contentHash) { setReg('off'); return; }
      const r = await apiRegisterPerformance({
        contentHash, artist, song,
        durationMs: null, performedAt: Date.now(),
      });
      setReg(r);
    } catch (e) {
      setMsg(e.message || 'Could not register that right now — your take is still yours and still here.');
      setReg(null);
    }
  };
  const name = `HVAS-lipsync-${String(artist || 'take').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.webm`;
  const file = new File([blob], name, { type: blob.type || 'video/webm' });
  const canShareFile = typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] });

  const share = async () => {
    try {
      await navigator.share({ files: [file], title: 'My Lip Sync Battle', text: `${artist} — ${song} · HITMANS VIP After Spot` });
    } catch (e) {
      if (e?.name !== 'AbortError') setMsg('Sharing was blocked — save it and post from your camera roll.');
    }
  };
  const save = () => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setMsg('Saved — post it from your camera roll.');
  };

  return (
    <div className="share-take">
      <video className="share-preview" src={URL.createObjectURL(blob)} controls playsInline />
      <p className="share-title">🎬 Your take is ready</p>
      {canShareFile
        ? <button type="button" className="bingo-btn gold" onClick={share}>Share to TikTok · IG · FB · X · Snapchat</button>
        : <p className="mem-fineprint">Direct sharing isn't available on this browser — save it and post from your camera roll.</p>}
      <button type="button" className="bingo-btn ghost" onClick={save}>Save video</button>

      {/* Only offered where there is a venue to register with — solo has no
          witness, and a registration nobody witnessed is worth less than not
          claiming one. */}
      {apiEnabled() && (
        reg && reg.ok ? (
          <div className="take-registered">
            <strong>✓ Registered to you</strong>
            <span>{reg.alreadyRegistered ? 'Already registered' : 'Recorded'} · {reg.ownerController}</span>
            <code>{reg.contentHash.slice(0, 23)}…</code>
            <small>
              The venue holds this fingerprint and the night, naming you as the performer.
              Your video never left this phone. This records that you performed it — it does
              not claim the song.
            </small>
          </div>
        ) : reg === 'off' ? (
          <p className="mem-fineprint">This browser can&rsquo;t fingerprint the file, so it can&rsquo;t be registered here.</p>
        ) : (
          <button type="button" className="bingo-btn ghost" disabled={reg === 'working'} onClick={registerTake}>
            {reg === 'working' ? 'Registering…' : '🔏 Register this as mine'}
          </button>
        )
      )}
      {msg && <p className="mem-fineprint">{msg}</p>}
    </div>
  );
}

// The performer's screen: portrait, camera filling it, record the take.
function BattleStage({ battle, onDone, onTake }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const castRef = useRef(null);
  const watchersRef = useRef(1);           // assume someone is there until told otherwise
  const [stream, setStream] = useState(null);
  const [recording, setRecording] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(null);
  const level = useMicLevel(stream, recording);
  // A take cannot be redone — the song has played, the room has watched. An
  // app update that reloads the page here destroys it, so updates wait.
  useHoldUpdates(recording);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // portrait-shaped constraints — this is a phone-held performance
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
          audio: true,
        });
        if (!live) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s; setStream(s);
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      } catch {
        setErr('Camera and mic access is needed to perform. Allow it, then tap Retry.');
      }
    })();
    return () => { live = false; clearInterval(castRef.current); streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Countdown against the server's window so every device agrees on time left.
  // `total` is what the window was when this stage opened, so the meter below
  // has something to be a fraction of.
  const totalRef = useRef(0);
  const [total, setTotal] = useState(0);
  // The window is a LENGTH, and the clock does not start until you do.
  //
  // performanceEndsAt is an absolute time stamped when the square was tapped —
  // which is while the performer is still on the "Perform it / Pass" screen
  // deciding. Ticking from there meant reading that screen for fifteen seconds
  // cost fifteen seconds of your performance, and if you took long enough the
  // take was cut off the instant you started: `recording && left === 0` stops
  // it. The clock you are racing has to be the one that starts when you do.
  const windowRef = useRef(0);
  const endsAtRef = useRef(0);
  useEffect(() => {
    if (!battle?.performanceEndsAt) { setLeft(null); setTotal(0); return undefined; }
    if (!windowRef.current) {
      windowRef.current = Math.max(1000, battle.performanceEndsAt - Date.now());
      totalRef.current = Math.ceil(windowRef.current / 1000);
      setTotal(totalRef.current);
    }
    // Not performing yet: show the whole window, standing still.
    if (!recording) { setLeft(totalRef.current); endsAtRef.current = 0; return undefined; }
    if (!endsAtRef.current) endsAtRef.current = Date.now() + windowRef.current;
    const tick = () => setLeft(Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [battle?.performanceEndsAt, recording]);

  // Auto-stop when the window runs out — the host's clock ends the take, not
  // the performer deciding they're done.
  useEffect(() => {
    if (recording && left === 0) stop();
  }, [left, recording]);

  const start = () => {
    const s = streamRef.current;
    if (!s) return;
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(s);
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.start(250);
      recRef.current = rec;
      setRecording(true);
      playSfx('battle');
      startBroadcast();
    } catch { setErr('Recording is not supported on this browser.'); }
  };
  // Push downscaled frames so every other phone and the TV can watch live.
  // 6fps at 320px wide is plenty for a lip sync battle and stays small enough
  // to sail over a phone's uplink and the venue tunnel.
  const startBroadcast = () => {
    const cv = document.createElement('canvas');
    const send = async () => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      // 240px, not 320: this used to be a LAN-only feature where frames were
      // free. Over the internet a 320px frame at 6fps is ~24MB of somebody's
      // mobile data per performance and ~50Mbps of venue upload for a crowd of
      // twenty. At 240 and a slower cadence that is roughly a fifth.
      const w = 240, h = Math.round((v.videoHeight / v.videoWidth) * w);
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.translate(w, 0); cx.scale(-1, 1);          // un-mirror for viewers
      cx.drawImage(v, 0, 0, w, h);
      if (battle.solo) return;      // nobody to cast to — solo plays on this phone alone
      try {
        const r = await apiBattleFrame(battle.id, cv.toDataURL('image/jpeg', 0.4));
        // Nobody watching means the TV is off and every phone is looking at
        // something else — drop to a heartbeat rather than shouting into a
        // room that left.
        watchersRef.current = Number(r?.watchers ?? 1);
      } catch { /* a dropped frame costs nothing */ }
    };
    if (battle.solo) return;
    // Self-pacing instead of a fixed interval: full rate while people are
    // watching, a slow heartbeat when nobody is, so the stream can come back
    // the moment a screen opens.
    const tick = async () => {
      await send();
      const gap = watchersRef.current > 0 ? 400 : 2000;
      castRef.current = setTimeout(tick, gap);
    };
    tick();
  };
  const stopBroadcast = () => { clearTimeout(castRef.current); castRef.current = null; };

  const stop = async () => {
    stopBroadcast();
    // Grab the finished blob before tearing down — this is the take the
    // member gets to keep and post.
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      await new Promise((resolve) => { rec.onstop = resolve; try { rec.stop(); } catch { resolve(); } });
    }
    if (chunksRef.current.length) {
      // Hand it to the panel — this component unmounts the moment the
      // performance registers (the battle leaves 'performing'), so a take
      // held in local state would vanish before it could be shared.
      onTake?.(new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'video/webm' }));
    }
    setRecording(false);
    if (!battle.solo) { try { await apiBattlePerformed(battle.id); } catch { /* ignore */ } }
    onDone?.();
  };

  return (
    <div className="battle-stage">
      {/* The whole frame reacts to how loud the performer actually is, not
          just the bar beside them — from the stage's point of view the
          performance IS the light. `--k-lvl` is the smoothed mic level. */}
      <div className={`battle-portrait${recording ? ' battle-live-frame' : ''}`} style={{ '--k-lvl': level.toFixed(3) }}>
        <video ref={videoRef} className="battle-cam" playsInline muted autoPlay />
        {recording && <span className="battle-rec">● REC</span>}
        {left != null && <span className="battle-clock">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span>}
        <div className="battle-meter" aria-hidden="true"><span style={{ width: `${Math.round(level * 100)}%` }} /></div>
      </div>
      {/* The clip draining away. This is the performance length — the take ends
          when the clip does, and this is the performer watching it go. */}
      {left != null && total > 0 && (
        <Meter className="battle-clipmeter" countdown live={recording}
               value={left / total} label="Clip left" right={`${left}s`} />
      )}
      {err && <p className="gate-err">{err}</p>}
      <p className="battle-song"><b>{battle.artist}</b> — {battle.song}</p>
      {!recording
        ? <button type="button" className="bingo-btn gold" onClick={start} disabled={!stream}>● Start performing</button>
        : <button type="button" className="bingo-btn" onClick={stop}>Finish take</button>}
    </div>
  );
}

// Everything that isn't your own take: the call-out, the vote, the result.
function LipSyncBattlePanel({ battle, meId, onChanged, isHost }) {
  const [busy, setBusy] = useState(false);
  const [myTake, setMyTake] = useState(null);   // survives BattleStage unmounting
  const act = async (fn) => { setBusy(true); try { await fn(); await onChanged?.(); } catch { /* ignore */ } setBusy(false); };
  if (!battle) return null;

  const mine = battle.me;
  const performing = battle.performingMemberId === meId;
  const invited = mine?.state === 'invited';
  const iAmIn = mine?.state === 'accepted' || mine?.state === 'performed';

  return (
    <AppPanel className="battle-panel" title="Lip Sync Battle" subtitle={`${battle.artist} — ${battle.song}`}>
      {invited && (
        <div className="battle-callout">
          <strong>🎤 You've been called out!</strong>
          <p>Perform this one to claim the square. Declining gives it up for good.</p>
          <div className="battle-callout-acts">
            <button type="button" className="bingo-btn gold" disabled={busy} onClick={() => act(() => apiBattleRespond(battle.id, true))}>Accept battle</button>
            <button type="button" className="bingo-btn ghost" disabled={busy} onClick={() => act(() => apiBattleRespond(battle.id, false))}>Decline</button>
          </div>
        </div>
      )}
      {mine?.state === 'declined' && <p className="battle-lost">You declined — this square is out for you.</p>}
      {iAmIn && battle.status === 'pending' && <p className="mem-fineprint">You're in. Waiting on the host to put you up.</p>}
      {performing && battle.status === 'performing' && (
        <BattleStage battle={battle} onDone={onChanged}
                     onTake={(blob) => {
                       setMyTake(blob);
                       // Kept on this phone, not uploaded. A failed save must
                       // not disturb the battle, so nothing waits on it.
                       saveTake({ blob, artist: battle.artist, song: battle.song, mode: 'venue' });
                     }} />
      )}
      {myTake && <SharePerformance blob={myTake} artist={battle.artist} song={battle.song} />}
      {!performing && battle.status === 'performing' && (
        <BattleWatch battleId={battle.id} label={`${battle.artist} — ${battle.song}`} />
      )}

      {/* live standings — doubles as the vote UI once voting opens */}
      <div className="battle-players">
        {battle.players.map((p) => (
          <div key={p.memberId} className={`battle-player${battle.winnerMemberId === p.memberId ? ' won' : ''}`}>
            <div className="battle-player-top">
              <strong>{p.name}</strong>
              <span className={`battle-state ${p.state}`}>{p.state}</span>
              {battle.status !== 'pending' && <span className="battle-votes">{p.votes}</span>}
            </div>
            <div className="battle-share"><span style={{ width: `${p.share}%` }} /></div>
            {battle.status === 'voting' && p.state === 'performed' && p.memberId !== meId && (
              <button type="button" className={`bingo-btn${battle.myVote === p.memberId ? ' ready' : ' ghost'}`} disabled={busy}
                onClick={() => act(() => apiBattleVote(battle.id, p.memberId))}>
                {battle.myVote === p.memberId ? '✓ Voted' : `Vote ${p.name}`}
              </button>
            )}
            {isHost && battle.status === 'pending' && p.state === 'accepted' && (
              <button type="button" className="bingo-btn" disabled={busy} onClick={() => act(() => apiBattlePerform(battle.id, p.memberId))}>Put {p.name} up</button>
            )}
          </div>
        ))}
      </div>

      {isHost && (
        <div className="battle-host-acts">
          <button type="button" className="bingo-btn ghost" disabled={busy}
            onClick={() => act(() => apiBattleStage(battle.id, battle.stage === 'tv' ? 'phones' : 'tv'))}>
            {battle.stage === 'tv' ? '📺 On TV — send back to phones' : '📺 Project to TV'}
          </button>
          {battle.status === 'performing' && (
            <>
              {/* Hold the clock, don't set it. The room goes off, a mic dies —
                  the performer gets back exactly what they had left. */}
              <button type="button" className={`bingo-btn ghost${battle.timerHeldMs != null ? ' ready' : ''}`} disabled={busy}
                      onClick={() => act(() => apiBattleTimer(battle.id, battle.timerHeldMs != null ? 'resume' : 'pause'))}>
                {battle.timerHeldMs != null
                  ? `▶ Clock held at ${Math.ceil(battle.timerHeldMs / 1000)}s — release`
                  : '⏸ Hold the clock'}
              </button>
              <button type="button" className="bingo-btn" disabled={busy} onClick={() => act(() => apiBattleVoting(battle.id, 30))}>Open voting</button>
            </>
          )}
          {battle.status === 'voting' && (
            <button type="button" className="bingo-btn gold" disabled={busy} onClick={() => act(() => apiBattleResolve(battle.id))}>Close voting &amp; crown</button>
          )}
        </div>
      )}
      {battle.status === 'voting' && <p className="mem-fineprint">Voting is open — you can't vote for yourself.</p>}
    </AppPanel>
  );
}

const STATUS_LABEL = { inside: 'Inside', onTheWay: 'On the way', signedIn: 'Signed in', left: 'Left' };
const TIMELINE_LABEL = {
  signup: '📝 Signed up',
  membership: '💳 Bought membership',
  otw: '🚗 On the way',
  admit: '✅ Admitted',
  checkout: '🚪 Left',
  decision: '⚠️ Staff decision',
};
const DECISION_LABEL = { trespass: 'Trespassed', banned: 'Banned', suspended: 'Suspended', denied: 'Denied', expired: 'Expired', valid: 'Granted', 'expired-qr': 'QR expired', unreadable: 'Unreadable scan' };

// Tap a member on the door dashboard's roster → this. Real, shared-backend
// version of the grant/deny/trespass/ban controls (see PenaltyControls below
// for the local-demo equivalent) plus the full timestamped timeline: signup,
// membership purchase, every on-the-way/admit/checkout/re-entry, and any
// staff decision — everything in one place instead of piecing it together.
function MemberProfileOverlay({ number, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const load = async () => {
    try { setData(await apiMemberTimeline(number)); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, [number]);

  const act = async (action) => {
    setBusy(true);
    try { await apiMemberManage(number, action, reason.trim() || undefined); await load(); onChanged?.(); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const m = data?.member;
  const events = data?.events || [];
  const flag = m?.flag;
  const doorStatus = !m ? '' : m.insideTonight ? 'inside' : m.leftTonight ? 'left' : m.onTheWay ? 'onTheWay' : 'signedIn';

  return (
    <div className="mem-profile-overlay" onClick={onClose}>
      <div className="mem-profile-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="mem-profile-close" onClick={onClose} aria-label="Close">✕</button>
        {!m ? <p className="dash-empty">Loading…</p> : (
          <>
            <h2>{m.name || 'Member'}</h2>
            <p className="mem-profile-sub">{m.tier}{m.vip ? ' VIP' : ''} · {m.number}</p>
            {m.contact && <p className="mem-profile-contact">{m.contact}</p>}
            <div className="mem-profile-status-row">
              <span className={`dash-status-pill ${doorStatus}`}>{STATUS_LABEL[doorStatus]}</span>
              {m.backInside && <span className="dash-status-pill backinside">↩ Back inside</span>}
            </div>
            {flag && (
              <div className={`mem-profile-flag ${flag.kind}`}>
                <strong>{DECISION_LABEL[flag.kind] || flag.kind}</strong>
                {flag.reason && <span> · {flag.reason}</span>}
                {flag.by && <span> · by {flag.by}</span>}
                <span> · {fmtDateTime(flag.at)}</span>
              </div>
            )}

            <input className="mem-profile-reason" type="text" placeholder="Reason (optional, for trespass/ban/suspend)"
              value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mem-profile-actions">
              <button type="button" className="door-act grant" disabled={busy} onClick={() => act('grant')}><span className="door-act-ic" aria-hidden="true">🛡</span>Grant access</button>
              <button type="button" className="door-act deny" disabled={busy} onClick={() => act('deny')}><span className="door-act-ic" aria-hidden="true">✋</span>Deny</button>
              <button type="button" className="door-act trespass" disabled={busy} onClick={() => act('trespass')}><span className="door-act-ic" aria-hidden="true">⚠️</span>Trespass</button>
              <button type="button" className="door-act ban" disabled={busy} onClick={() => act('banned')}><span className="door-act-ic" aria-hidden="true">⛔</span>Ban</button>
              <button type="button" className="door-act suspend" disabled={busy} onClick={() => act('suspended')}><span className="door-act-ic" aria-hidden="true">⏸</span>Suspend</button>
              {flag && <button type="button" className="door-act clear" disabled={busy} onClick={() => act('unflag')}>Clear flag</button>}
            </div>

            <h3 className="mem-profile-timeline-head">Timeline</h3>
            <div className="mem-profile-timeline">
              {events.length === 0 ? <p className="dash-empty">No activity yet.</p> : events.slice().reverse().map((e, i) => (
                <div className={`mem-timeline-row ${e.kind}`} key={i}>
                  <span className="mem-timeline-kind">
                    {e.kind === 'decision' ? `⚠️ ${DECISION_LABEL[e.status] || e.status}` : TIMELINE_LABEL[e.kind] || e.kind}
                    {e.kind === 'membership' ? ` · ${e.tier}${e.vip ? ' VIP' : ''} · ${e.payment || ''}` : ''}
                    {e.searched ? ' · searched' : ''}
                    {e.byStaff ? ` · by ${e.byStaff}` : ''}
                  </span>
                  <span className="mem-timeline-time">{fmtDateTime(e.at)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Connected to a venue backend: shows EVERY member the shared board knows
// about (poll GET /door/board every 4s) — not just this device's own local
// member. With no backend it falls back to the single local member, same as
// before.
function StaffDashboardScreen() {
  const member = useMember();
  const backend = apiEnabled() && apiStaffToken();
  const [board, setBoard] = useState(null);
  // Live clock — also drives every "Xm ago" / elapsed timer below, so they
  // count up in real time instead of only refreshing on the next poll.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!backend) return;
    let live = true;
    const poll = async () => { try { const b = await apiDoorBoard(); if (live) setBoard(b); } catch { /* ignore */ } };
    poll();
    // Fast enough that a staff Pay & Verify shows up on every other staff
    // device's dashboard within ~1.5s, not the old 4s worst case.
    const id = setInterval(poll, 1500);
    return () => { live = false; clearInterval(id); };
  }, [backend]);
  useEffect(() => {
    if (backend) return;
    const id = setInterval(() => setBoard((b) => ({ ...b })), 30000); // force a re-render tick
    return () => clearInterval(id);
  }, [backend]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const ago = (ts) => {
    if (!ts) return '';
    const mins = Math.max(0, Math.round((now - ts) / 60000));
    return mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} mins ago`;
  };
  const elapsed = (ts) => {
    if (!ts) return '—';
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const clockStr = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

  const insideList = backend ? (board?.inside || []) : (isInsideTonight(member) ? [member] : []);
  // Full roster — every member the venue knows about, always visible (not
  // just whoever's currently on-the-way/inside), so staff have full
  // situational awareness at a glance: exactly what's needed to notice
  // something's wrong (a lost phone, someone who never showed, etc).
  const roster = backend ? (board?.allMembers || []) : (member ? [{
    ...member,
    doorStatus: isInsideTonight(member) ? 'inside' : isLeftTonight(member) ? 'left' : isOnTheWay(member) ? 'onTheWay' : 'signedIn',
    enteredAt: member.verifiedAt || null,
    leftAt: member.checkedOutAt || null,
  }] : []);
  const STATUS_DOT = { inside: 'green', onTheWay: 'amber', signedIn: 'blue', left: 'grey' };
  const rosterWhen = (m) => (
    m.doorStatus === 'inside' ? `In ${elapsed(m.enteredAt)}` :
    m.doorStatus === 'onTheWay' ? `${elapsed(m.onTheWayAt)} ago` :
    m.doorStatus === 'left' ? `Left ${ago(m.leftAt)}` : ''
  );
  async function checkoutMember(m) {
    if (backend) {
      try { await apiDoorCheckout(m.number); setBoard(await apiDoorBoard()); } catch { /* ignore */ }
    } else if (memberState && memberState.number === m.number) {
      leaveVenue();
    }
  }
  // Recent door decisions — the venue-wide audit trail (formerly a separate,
  // broken "Check-In Log" screen). Connected devices get the real multi-entry
  // log from the shared backend; local/demo mode falls back to just this
  // device's own last scan, same as before.
  const recentDecisions = backend
    ? (board?.recentDecisions || []).map((d) => ({ status: d.status === 'granted' ? 'valid' : d.status, when: d.at, number: d.number, name: d.name }))
    : (member && member.verifiedAt ? [{ status: member.status === 'expired' ? 'expired' : 'valid', when: member.verifiedAt, number: member.number, name: member.name }] : []);

  const insideCount = insideList.length;
  // Tonight's total admissions (inside + left — everyone who was actually let
  // in tonight, not just who's still here right now) vs. who's still inside
  // vs. who's headed over — three genuinely different numbers, not the same
  // "currently inside" count relabeled three times.
  const admittedTonight = backend ? roster.filter((m) => m.doorStatus === 'inside' || m.doorStatus === 'left').length : (member?.entries || 0);
  const onTheWayCount = roster.filter((m) => m.doorStatus === 'onTheWay').length;
  const [spark, setSpark] = useState(() => Array.from({ length: 14 }, () => insideCount));
  useEffect(() => { setSpark((s) => [...s.slice(1), insideCount]); }, [insideCount]);

  // Tap a member on a real backend → full profile: timeline + grant/deny/
  // trespass/ban/suspend. Local demo mode keeps the inline PenaltyControls.
  const [profileNumber, setProfileNumber] = useState(null);
  const refreshBoard = async () => { if (backend) { try { setBoard(await apiDoorBoard()); } catch { /* ignore */ } } };

  return (
    <div className="staff-dash">
      <div className="dash-clock"><span className="dash-clock-dot" aria-hidden="true" />{clockStr}</div>
      <div className="stat-widgets">
        <StatWidget src={ui.widgets.entries} label="TODAY’S ENTRIES" sub="TOTAL ADMITTED" value={admittedTonight} series={spark} />
        <StatWidget src={ui.widgets.event} label="ON THE WAY" sub="HEADING OVER NOW" value={onTheWayCount} cap={150} />
        <StatWidget src={ui.widgets.venue} label="VENUE ACCESS" sub="CURRENTLY INSIDE" value={insideCount} cap={100} />
      </div>

      <AppPanel className="dash-roster-panel" title="All members" subtitle="Inside → on the way → signed in → left, live">
        {roster.length > 0 ? roster.map((m) => (
          <div className={`dash-row roster ${m.doorStatus}${backend ? ' tappable' : ''}`} key={m.number}
            onClick={backend ? () => setProfileNumber(m.number) : undefined} role={backend ? 'button' : undefined} tabIndex={backend ? 0 : undefined}>
            <span className={`dash-dot ${STATUS_DOT[m.doorStatus]}`} />
            <div className="dash-info">
              <strong>{m.name || 'Member'}{m.tier ? ` · ${m.tier}${m.vip ? ' VIP' : ''}` : ' · No membership'}</strong>
              <span className="dash-num">{m.number}{m.contact ? ` · ${m.contact}` : ''}</span>
              <span className={`dash-status-pill ${m.doorStatus}`}>{STATUS_LABEL[m.doorStatus]}</span>
              {m.backInside && <span className="dash-status-pill backinside">↩ Back inside</span>}
              {m.flag && <span className={`dash-status-pill ${m.flag.kind}`}>{DECISION_LABEL[m.flag.kind] || m.flag.kind}</span>}
              {!backend && <PenaltyControls member={m} />}
            </div>
            <div className="dash-roster-right">
              <span className="dash-when">{rosterWhen(m)}</span>
              {m.doorStatus === 'inside' && (
                <button type="button" className="dash-pen clear" onClick={(e) => { e.stopPropagation(); checkoutMember(m); }}>Mark left</button>
              )}
            </div>
          </div>
        )) : (
          <p className="dash-empty">No members yet.</p>
        )}
      </AppPanel>
      {backend && profileNumber && (
        <MemberProfileOverlay number={profileNumber} onClose={() => setProfileNumber(null)} onChanged={refreshBoard} />
      )}

      <AppPanel className="dash-scroll-panel" title="Recent door decisions" subtitle="Tonight's check-in log">
        {recentDecisions.length > 0 ? recentDecisions.map((d, i) => (
          <div className={`dash-row ${d.status}`} key={`${d.number}-${d.when}-${i}`}>
            <img className="dash-chip" src={STATUS_CHIP[d.status] || STATUS_CHIP.trespass} alt={d.status} />
            <div>
              <strong>{DECISION_LABEL[d.status] || 'Denied'}{d.name ? ` · ${d.name}` : ''}</strong>
              <span className="dash-num">{d.number}</span>
            </div>
            <span className="dash-when">{ago(d.when)}</span>
          </div>
        )) : (
          <p className="dash-empty">No scans yet this shift.</p>
        )}
      </AppPanel>
    </div>
  );
}

// The venue watchlist: every member currently flagged trespass/banned. On a
// real backend this is the shared server-side list (same on every staff
// device); with no backend it falls back to the local-device demo list.
function WatchlistScreen() {
  const backend = apiEnabled() && apiStaffToken();
  const [, tick] = useState(0);
  const [remoteRows, setRemoteRows] = useState(null);
  const [profileNumber, setProfileNumber] = useState(null);
  useEffect(() => {
    if (!backend) return undefined;
    let live = true;
    const poll = async () => { try { const r = await apiMemberFlags(); if (live) setRemoteRows(r.members); } catch { /* ignore */ } };
    poll();
    const id = setInterval(poll, 5000);
    return () => { live = false; clearInterval(id); };
  }, [backend]);
  useEffect(() => { if (backend) return undefined; const id = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(id); }, [backend]);

  const rows = backend
    ? (remoteRows || []).map((m) => ({ number: m.number, name: m.name, kind: m.flag?.kind, reason: m.flag?.reason, by: m.flag?.by, at: m.flag?.at }))
    : penalizedMembers();
  const lift = async (m) => {
    if (backend) { try { await apiMemberManage(m.number, 'unflag'); setRemoteRows((await apiMemberFlags()).members); } catch { /* ignore */ } }
    else { penalizeMember(m.number, m.name, 'cleared', ''); tick((n) => n + 1); }
  };
  return (
    <div className="staff-dash">
      <AppPanel title="Watchlist" subtitle={backend ? 'Trespassed, banned & suspended — shared with every staff device' : 'Trespassed & banned — visible to all staff'}>
        {rows.length === 0 ? (
          <p className="dash-empty">No flagged members. The list is clear.</p>
        ) : rows.map((m) => (
          <div key={m.number} className={`dash-row ${m.kind}${backend ? ' tappable' : ''}`}
            onClick={backend ? () => setProfileNumber(m.number) : undefined} role={backend ? 'button' : undefined} tabIndex={backend ? 0 : undefined}>
            <img className="dash-chip" src={STATUS_CHIP[m.kind] || STATUS_CHIP.trespass} alt={m.kind} />
            <div className="dash-info">
              <strong>{m.name || 'Member'} <span className={`dash-flag ${m.kind}`}>{DECISION_LABEL[m.kind] || PENALTY_LABEL[m.kind] || m.kind}</span></strong>
              <span className="dash-num">{m.number}</span>
              <span className="dash-reason">{m.reason || '—'}{m.by ? ` · by ${m.by}` : ''} · {fmtDateTime(m.at)}</span>
            </div>
            <button type="button" className="dash-pen clear" onClick={(e) => { e.stopPropagation(); lift(m); }}>Lift</button>
          </div>
        ))}
      </AppPanel>
      <p className="mem-fineprint">Flagging a member at the door adds them here and warns every scanner. Lifting a flag restores their access everywhere.</p>
      {backend && profileNumber && (
        <MemberProfileOverlay number={profileNumber} onClose={() => setProfileNumber(null)} onChanged={async () => setRemoteRows((await apiMemberFlags()).members)} />
      )}
    </div>
  );
}

// Security (staff) side: scan the member's QR or type their number to verify.
// AVAILABLE / ACTIVE / VERIFIED are RESULTS shown here — not buttons.
function SecurityVerifyScreen() {
  const member = useMember();
  const [num, setNum] = useState('');
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ready, setReady] = useState(false);        // first camera frame arrived
  const [query, setQuery] = useState('');           // "search member" box
  const [hits, setHits] = useState([]);
  const videoRef = useRef(null);
  const rafRef = useRef(0);
  const streamRef = useRef(null);

  // Debounced search — hits the shared venue backend when connected, so a
  // member is findable regardless of which device they signed up on.
  useEffect(() => {
    if (!query) { setHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      const rows = await searchMembersAtDoor(query);
      if (live) setHits(rows);
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query]);

  const runVerify = async (number) => {
    setChecking(true);
    const r = await verifyAtDoor(number);
    setChecking(false);
    setResult(r);
  };

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
            setNum(parsed); stopScan(); runVerify(parsed); return;
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
                  onClick={() => { setNum(h.number); setQuery(''); runVerify(h.number); }}>
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
                <img className="qr-scan-logo-img" src={ui.fullLogoClear} alt="" aria-hidden="true" />
              </>
            )}
            <span className="qr-br tl" aria-hidden="true" />
            <span className="qr-br tr" aria-hidden="true" />
            <span className="qr-br bl" aria-hidden="true" />
            <span className="qr-br br" aria-hidden="true" />
            {!scanning && <div className="qr-cam-off">Camera off</div>}
            {scanning && !ready && <div className="qr-cam-off starting">Starting camera…</div>}
          </div>
          {/* Below the frame, not overlapping the camera feed / brackets. */}
          <span className="qr-align">★ ALIGN QR CODE HERE ★</span>
          {scanning
            ? <button type="button" className="mem-cancel" onClick={stopScan}>Stop camera</button>
            : <button type="button" className="asset-cta" onClick={startScan} aria-label="Scan app"><img src={ui.buttons.scan} alt="Scan app" /></button>}
        </div>

        <div className="verify-manual">
          <label htmlFor="memnum">Or enter member number</label>
          <div className="verify-manual-row">
            <input id="memnum" type="text" placeholder="HV-0000-0000" value={num}
              onChange={(e) => setNum(e.target.value)} autoComplete="off" />
            <button type="button" className="asset-cta compact" disabled={checking} onClick={() => runVerify(num)} aria-label="Verify card">
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

// Shared poll of the one live round every device reads — GET /bingo/state
// needs no auth (the TV runs unattended), but carries `me` when a member
// token is sent, so player screens reuse the exact same call.
function useBingoState(pollMs = 3000) {
  const [state, setState] = useState(null);
  const [err, setErr] = useState('');
  const liveRef = useRef(true);
  // Exposed so an action (join / ready / claim) can pull fresh state the
  // moment it lands. Without this the screen sits unchanged until the next
  // poll — up to `pollMs` of the button looking like it did nothing.
  const refresh = async () => {
    try { const s = await apiBingoState(); if (liveRef.current) { setState(s); setErr(''); } }
    catch { if (liveRef.current) setErr('Could not reach the venue backend.'); }
  };
  useEffect(() => {
    if (!apiEnabled()) { setErr('not-connected'); return undefined; }
    liveRef.current = true;
    refresh();
    // pollMs <= 0 means "read it once and stop" — for a screen that is behind a
    // lock and has nothing to show yet. Without this guard setInterval(fn, 0)
    // hammers the venue as fast as the event loop will go.
    if (pollMs <= 0) return () => { liveRef.current = false; };
    const id = setInterval(refresh, pollMs);
    return () => { liveRef.current = false; clearInterval(id); };
  }, [pollMs]);
  return { state, err, refresh };
}
// ── Solo Bingo vs CPU ────────────────────────────────────────────────────
// Fully client-side on purpose: solo play must work with no venue backend,
// no host, and no other players — on the couch, on the way over, anywhere.
// Decks come from the venue's own list (server/src/decks.mjs) via the
// generated client copy, so a themed night the room plays is a themed night
// solo can practise — same songs, same lip sync squares, same ids.
const SOLO_DECK_OPTIONS = soloDeckList();
const soloDeck = (id) => soloDeckById(id).items;

const CPU_PLAYERS = [
  // `skill` is how hard they are to beat in a lip sync battle, matched to how
  // fast they are on the card — the regular who marks quickest also performs.
  { name: 'Rell',  avatar: 'R', delay: [900, 2600], skill: 0.55 },
  { name: 'Tasha', avatar: 'T', delay: [700, 2100], skill: 0.65 },
  { name: 'Marcus', avatar: 'M', delay: [1100, 3000], skill: 0.45 },
];

const shuffled = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// 25 squares, index 12 is the free centre.
const dealCard = (deck) => { const picks = shuffled(deck).slice(0, 24); return [...picks.slice(0, 12), null, ...picks.slice(12)]; };

// Win check for a 5x5 card: any full row, column, or diagonal. The centre
// (index 12) is free and always counts as covered.
const SOLO_LINES = (() => {
  const lines = [];
  for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  lines.push([0, 6, 12, 18, 24]);
  lines.push([4, 8, 12, 16, 20]);
  return lines;
})();
const soloHasLine = (card, covered) =>
  SOLO_LINES.some((line) => line.every((i) => i === 12 || covered.has(card[i].id)));
const soloLineProgress = (card, covered) =>
  Math.max(...SOLO_LINES.map((line) => line.filter((i) => i === 12 || covered.has(card[i].id)).length));
// Solo runs the same three-round ladder the venue round does, so practising
// alone teaches the real game: a line, then two lines, then the whole card.
// Solo's card holds a literal null in the centre; the shared rules expect an
// object there, so normalise before handing it over.
const soloCard = (card) => card.map((c) => c || { id: '__free' });
const soloProgress = (card, covered, pattern) => bingoProgress(soloCard(card), covered, pattern);
const soloHasPattern = (card, covered, pattern) => bingoHasPattern(soloCard(card), covered, pattern);

// Solo round vs CPU opponents. Calls fire on a timer (there's no host), the
// player taps their own called squares, and each CPU covers theirs after a
// short random delay — so you can watch them close in on a line. First
// completed line wins.
//
// How long a called song plays before the next one is called.
//
// Thirty seconds. Long enough to recognise a record and find it on your card,
// short enough that a 25-square round is not an hour long.
//
// It has been two things before this and both were wrong. A flat 2.2s came from
// when solo had no music at all, and meant you heard two seconds of a song —
// unplayable by ear. Then it ran the full clip, 75 seconds of every record,
// which is the right length for PERFORMING to a song and far too long for
// merely naming one.
//
// Those are two different clocks and this is only the first: a lip sync
// performance still runs exactly as long as its clip, because the take ends
// when the music does.
const SOLO_CALL_MS = 30000;
// ── Solo lip sync battles ────────────────────────────────────────────────
// Solo plays by the venue's rules, not an easier version of them: a LIP SYNC
// square is never covered by tapping it. You perform it, or you pass and lose
// it for the round — the same deterrent that makes the square mean something
// in a real room.
//
// The differences are only the ones the format forces. There is no crowd, so
// the vote is simulated. And you never watch the CPU perform — there is
// nothing to watch — so their take is reported, not shown. What you get back
// instead is your own recording, ready to post.
const SOLO_JUDGE_MS = 2200;

// Who takes it. Performing is most of the battle; the rest is the CPU's own
// standard, so the regulars who are hard to beat on the card are hard to beat
// on the floor too.
function soloJudge(performed, cpu) {
  if (!performed) return { you: 0, them: 1, won: false };
  const you = 0.45 + Math.random() * 0.55;
  const them = 0.30 + Math.random() * (cpu?.skill ?? 0.55);
  return { you, them, won: you >= them };
}

function SoloBattle({ battle, cpu, onSettled }) {
  const [stage, setStage] = useState('offer');     // offer | performing | judging | result
  const [take, setTake] = useState(null);
  const [verdict, setVerdict] = useState(null);

  // The judging beat exists so a result does not appear the instant the
  // recording stops — it should feel like the room deciding.
  useEffect(() => {
    if (stage !== 'judging') return undefined;
    const t = setTimeout(() => {
      const v = soloJudge(true, cpu);
      setVerdict(v);
      setStage('result');
      playSfx(v.won ? 'win' : 'buzz');
    }, SOLO_JUDGE_MS);
    return () => clearTimeout(t);
  }, [stage, cpu]);

  const pass = () => {
    playSfx('buzz');
    onSettled({ performed: false, won: false, take: null });
  };

  if (stage === 'offer') {
    return (
      <AppPanel className="battle-panel" title="Lip Sync Battle" subtitle={`${battle.artist} — ${battle.song}`}>
        <p className="solo-battle-line">
          {cpu
            ? <><b>{cpu.avatar} {cpu.name}</b> holds this square too. Perform it to take it.</>
            : <>This one is a LIP SYNC square. Perform it to cover it.</>}
        </p>
        <p className="mem-fineprint">Pass and the square is gone for this round — same as the venue.</p>
        <button type="button" className="k-btn k-btn--go" onClick={() => setStage('performing')}>🎤 Perform it</button>
        <button type="button" className="bingo-btn ghost" onClick={pass}>Pass — give up the square</button>
      </AppPanel>
    );
  }
  if (stage === 'performing') {
    return (
      <BattleStage
        battle={{ ...battle, solo: true }}
        onTake={(blob) => {
          setTake(blob);
          saveTake({ blob, artist: battle.artist, song: battle.song, mode: 'solo' });
        }}
        onDone={() => setStage('judging')}
      />
    );
  }
  if (stage === 'judging') {
    return (
      <AppPanel className="battle-panel" title="The room is deciding" subtitle={`${battle.artist} — ${battle.song}`}>
        <p className="solo-battle-line">{cpu ? <>{cpu.avatar} {cpu.name} took their turn.</> : <>Scoring your take…</>}</p>
        <div className="solo-judging" aria-hidden="true"><i /><i /><i /></div>
      </AppPanel>
    );
  }
  return (
    <AppPanel className="battle-panel"
              title={verdict?.won ? 'You took it' : 'They took it'}
              subtitle={`${battle.artist} — ${battle.song}`}>
      <p className="solo-battle-line">
        {verdict?.won
          ? <>The square is yours.{cpu ? <> {cpu.name} is locked out of it.</> : null}</>
          : <>{cpu ? `${cpu.name} edged it.` : 'Not this time.'} The square stays uncovered.</>}
      </p>
      {/* The take is yours either way — losing a square in a game against a
          phone is no reason to lose the video. */}
      {take && <SharePerformance blob={take} artist={battle.artist} song={battle.song} />}
      <button type="button" className="k-btn k-btn--go"
              onClick={() => onSettled({ performed: true, won: !!verdict?.won, take })}>
        Back to my card
      </button>
    </AppPanel>
  );
}

// ── Meters ───────────────────────────────────────────────────────────────
// The venue's own meter art, driven by real numbers.
//
// These were plain CSS bars sitting next to a brand kit that ships a track, a
// fill and a slider head — so the numbers were live but the instrument looked
// painted on. A meter that never moves is furniture; a meter you can watch
// close on you is the game.
//
//   value 0..1        where the fill sits
//   live              the value is actively moving (adds the travelling sheen)
//   hot               close enough to matter (pulses, and the head flares)
//   countdown         hot means LOW rather than HIGH — for clocks running out
//
// The head is deliberately clamped inside the track so it cannot hang off the
// end at 0% or 100%, which is what made the loyalty one look broken at the
// extremes.
const RANK_ART = `${A_}assets/ui/rank/`;
function Meter({ value, label, right, live = false, hot = false, countdown = false, className = '' }) {
  const pct = Math.max(0, Math.min(100, Math.round((Number(value) || 0) * 100)));
  const isHot = hot || (countdown ? pct <= 22 : pct >= 88);
  // A meter that only slides is furniture. This one reacts to the two things
  // that actually happen to it: it GAINED (you took a square, you got closer)
  // and it is FULL. Both are momentary — a class that puts itself back — so
  // nothing on screen is permanently animating, which is what made the old
  // marker read as cheesy rather than alive.
  const prev = useRef(pct);
  const [bumped, setBumped] = useState(false);
  useEffect(() => {
    const gained = !countdown && pct > prev.current;
    prev.current = pct;
    if (!gained) return undefined;
    setBumped(true);
    const t = setTimeout(() => setBumped(false), 520);
    return () => clearTimeout(t);
  }, [pct, countdown]);
  const cls = ['ui-meter', live && 'is-live', isHot && 'is-hot', countdown && 'is-countdown',
    bumped && 'is-bumped', pct >= 100 && !countdown && 'is-full', className]
    .filter(Boolean).join(' ');
  // One track, one fill, nothing else.
  //
  // This used to draw three overlaid images from the rank kit: a thin purple
  // line for the track, a thicker gold bar for the fill, and a diamond marker
  // riding the end. They are different weights and sit at different heights, so
  // what actually rendered was TWO lines with an ornament between them — read
  // as a doubled bar, and on a small screen as a mess.
  //
  // A progress bar has one job: show how full it is. A groove and a fill do
  // that at any width, on any device, with no art to load, mis-scale or 404 —
  // which is also why it can now be a single element instead of five.
  return (
    <div className={cls}>
      {(label || right) && (
        <div className="ui-meter-head">
          {label && <span className="ui-meter-label">{label}</span>}
          {right && <span className="ui-meter-right">{right}</span>}
        </div>
      )}
      <div className="ui-meter-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
           aria-label={typeof label === 'string' ? label : undefined}>
        <span className="ui-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const TILE_ART = {
  covered: `${import.meta.env.BASE_URL}assets/ui/kit/mark_covered.png`,   // magenta star  — icon_star_accent
  called:  `${import.meta.env.BASE_URL}assets/ui/kit/mark_called.png`,    // violet diamond — icon_diamond_accent
  bonus:   `${import.meta.env.BASE_URL}assets/ui/kit/mark_bonus.png`,     // crown          — icon_membership
  lipsync: `${import.meta.env.BASE_URL}assets/ui/kit/mark_lipsync.png`,   // mic            — lsb sheet 03
};

// Paying your way into tonight's pot, from your own phone.
//
// This CLAIMS an entry — it does not pay one. The member says which way the
// money went and the house confirms it, because a phone that could settle its
// own entry would make every pot in the app a number a member typed. So the
// honest thing to show is the truth: you have told them, and they have not
// agreed yet.
function EntryPay({ fee, pot, paidPlayers, split, claim, onClaim, busy }) {
  const [rail, setRail] = useState('cashapp');
  if (claim?.status === 'pending') {
    return (
      <div className="entry-pay is-waiting">
        <strong>⏳ Waiting on the door</strong>
        <p>You said you sent ${fee} by {RAIL_LABEL[claim.rail] || claim.rail}. You are in the moment they confirm it.</p>
      </div>
    );
  }
  return (
    <div className="entry-pay">
      <strong>💵 ${fee} to play tonight</strong>
      <p>
        Pot is <b>${pot}</b> from {paidPlayers} {paidPlayers === 1 ? 'entry' : 'entries'} so far — it grows with the room.
      </p>
      {/* Where the money goes, BEFORE it is taken.
      
          §46: do not deduct undisclosed reserve allocations from providers.
          Here the players are the providers — the pot is their money — so
          anything the house keeps is shown as the house's, and the community
          share is shown as a slice of THAT, never of the pot. Most places hide
          the rake. This is the opposite move, and it is the reason a member
          should believe the pot number directly above it. */}
      {split && (
        <ul className="entry-split">
          <li><span>Players&rsquo; pot</span><b>${split.pot}</b></li>
          {split.houseFee > 0 ? (
            <>
              <li><span>House</span><b>${split.houseKeeps}</b></li>
              {split.worldReserve > 0 && (
                <li className="to-commons">
                  <span>Community reserve</span><b>${split.worldReserve}</b>
                </li>
              )}
            </>
          ) : (
            <li className="all-players"><span>House takes</span><b>$0</b></li>
          )}
          <li className="entry-split-total"><span>Collected</span><b>${split.collected}</b></li>
        </ul>
      )}
      <div className="entry-rails">
        {['cashapp', 'zelle', 'paypal', 'cash'].map((r) => (
          <button key={r} type="button" className={`entry-rail${rail === r ? ' on' : ''}`} onClick={() => setRail(r)}>
            {RAIL_LABEL[r]}
          </button>
        ))}
      </div>
      <button type="button" className="entry-pay-go" disabled={busy} onClick={() => onClaim(rail)}>
        I sent ${fee} by {RAIL_LABEL[rail]}
      </button>
      <span className="entry-pay-fine">The door confirms it before you are in the pot.</span>
    </div>
  );
}
const RAIL_LABEL = { cashapp: 'Cash App', zelle: 'Zelle', paypal: 'PayPal', cash: 'Cash at the door' };

// The microphone, drawn rather than scaled.
//
// The tile marks are pixel art at 24px, which is exactly right for a corner of
// a bingo square and exactly wrong blown up to 200px in somebody's face — the
// grille turns to mush and the whole moment looks cheap. This is vector: one
// ball grille, one body, real lighting, and it stays crisp on a phone or a TV.
//
// Lit from the upper left with a warm key and a neon rim on the right, which is
// the room this thing lives in — every gradient below is that one lighting
// setup, not decoration picked per shape.
function MicArt({ className = '', progress = null }) {
  const R = 47;                       // ring radius, just outside the grille
  const C = 2 * Math.PI * R;
  return (
    <svg className={className} viewBox="0 0 120 200" fill="none" aria-hidden="true"
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Grille: brushed metal, brightest where the key hits. */}
        <radialGradient id="micHead" cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="#fff3fb" />
          <stop offset="26%" stopColor="#ff8ad6" />
          <stop offset="62%" stopColor="#d4187f" />
          <stop offset="100%" stopColor="#4a0329" />
        </radialGradient>
        {/* Body: a cylinder, so the shading runs across it, not down it. */}
        <linearGradient id="micBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a0d24" />
          <stop offset="18%" stopColor="#7d1a54" />
          <stop offset="20%" stopColor="#ff6fc4" />
          <stop offset="46%" stopColor="#ffd6ee" />
          <stop offset="70%" stopColor="#e0359a" />
          <stop offset="100%" stopColor="#42051f" />
        </linearGradient>
        <linearGradient id="micRing" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a8741c" />
          <stop offset="35%" stopColor="#ffe9a8" />
          <stop offset="60%" stopColor="#e0a53a" />
          <stop offset="100%" stopColor="#7a4d0c" />
        </linearGradient>
        <linearGradient id="micShaft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a0518" />
          <stop offset="30%" stopColor="#8e2160" />
          <stop offset="52%" stopColor="#ffb8e2" />
          <stop offset="78%" stopColor="#7d1a54" />
          <stop offset="100%" stopColor="#1d0311" />
        </linearGradient>
        {/* The mesh, as a real repeating pattern rather than drawn dots. */}
        <pattern id="micMesh" width="4.6" height="4.6" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
          <circle cx="1.15" cy="1.15" r=".78" fill="rgba(24,0,14,.42)" />
        </pattern>
        <radialGradient id="micSpec" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity=".22" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The song draining, drawn around the grille in the SAME coordinate
          space as the mic — which is the only way the two can never drift
          apart at a size nobody tested. */}
      {progress !== null && (
        <g transform="rotate(-90 60 52)">
          <circle cx="60" cy="52" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="3.5" />
          <circle cx="60" cy="52" r={R} fill="none" strokeWidth="3.5" strokeLinecap="round"
                  stroke={progress <= 0.25 ? '#ff3cb4' : '#7dffb4'}
                  strokeDasharray={C}
                  strokeDashoffset={C - C * Math.max(0, Math.min(1, progress))}
                  style={{ transition: 'stroke-dashoffset .12s linear, stroke .3s ease' }} />
        </g>
      )}

      {/* Grille */}
      <circle cx="60" cy="52" r="38" fill="url(#micHead)" />
      <circle cx="60" cy="52" r="38" fill="url(#micMesh)" />
      {/* Rim light down the right edge — the neon in the room. */}
      <path d="M60 14a38 38 0 0 1 0 76" stroke="#ff3cb4" strokeWidth="2.6" strokeOpacity=".9" fill="none" />
      {/* Key highlight, upper left. */}
      <ellipse cx="46" cy="36" rx="15" ry="10" fill="url(#micSpec)" transform="rotate(-28 46 36)" />

      {/* Collar */}
      <rect x="35" y="85" width="50" height="12" rx="6" fill="url(#micRing)" />
      <rect x="35" y="85" width="50" height="4.5" rx="2.2" fill="#fff6d8" fillOpacity=".6" />

      {/* Body */}
      <path d="M37 96h46l-5 50a18 18 0 0 1-36 0z" fill="url(#micBody)" />
      <path d="M47 100l-3 45" stroke="#fff" strokeOpacity=".5" strokeWidth="3.4" strokeLinecap="round" />

      {/* Shaft */}
      <rect x="46" y="152" width="28" height="38" rx="11" fill="url(#micShaft)" />
      <rect x="51" y="156" width="4.5" height="30" rx="2.2" fill="#fff" fillOpacity=".42" />
      {/* Base cap */}
      <rect x="43" y="185" width="34" height="11" rx="5.5" fill="url(#micRing)" />
    </svg>
  );
}

// ── Asking for help ────────────────────────────────────────────────────────
//
// A member submits a NEED. Nothing on this screen verifies, approves, awards or
// pays — not greyed out, absent — because every one of those belongs to the
// house and the server refuses a member's token that asks.
//
// The tone matters as much as the fields. This is somebody's rent. It is not a
// game screen and it is not a charity brochure, and it must never imply that a
// member receives money: the venue pays the landlord, the utility, the supplier,
// and the member gets the thing.
const MONEY = (cents) => `$${(Math.max(0, cents || 0) / 100).toFixed(2)}`;

const JUB_STATUS_COPY = {
  SUBMITTED: 'Waiting for the door to check it',
  VERIFIED: 'Checked — waiting on approval',
  AWARDED: 'Approved',
  'APPROVED — NOT YET PAID': 'Approved — the money has not gone out yet',
  'PAID — AWAITING DELIVERY': 'Paid to the provider — waiting for them to confirm',
  DELIVERED: 'Done',
};

function JubileeApply({ onDone }) {
  const [kinds, setKinds] = useState(null);
  const [mine, setMine] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ needKind: '', amount: '', detail: '', providerHint: '' });

  const load = async () => {
    try {
      const [k, m] = await Promise.all([apiJubileeKinds(), apiJubileeMine()]);
      setKinds(k); setMine(m); setErr('');
    } catch (e) {
      // The venue runs on a laptop in the room and its internet does drop.
      setErr(e.message || 'Could not reach the venue. Try again when you have signal.');
    }
  };
  useEffect(() => { load(); }, []);

  const open = mine?.applications?.find((a) => a.status === 'SUBMITTED' || a.status === 'VERIFIED');
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const cents = Math.round(Number(form.amount) * 100);
      await apiJubileeApply({
        needKind: form.needKind, amountCents: cents,
        detail: form.detail, providerHint: form.providerHint,
      });
      setForm({ needKind: '', amount: '', detail: '', providerHint: '' });
      await load();
    } catch (e) { setErr(e.message || 'That did not send. Nothing was submitted.'); }
    setBusy(false);
  };

  if (!kinds && !err) return <AppPanel title="Ask the door" subtitle="Community reserve"><p className="dash-empty">Loading…</p></AppPanel>;

  return (
    <AppPanel title="Ask the door" subtitle="Community reserve">
      {err && <p className="k-nudge k-nudge--no">{err}</p>}

      {/* §38, in the venue's own words rather than buried in terms. */}
      {kinds?.notice && <p className="jub-notice">{kinds.notice}</p>}

      <p className="jub-how">
        The venue pays your landlord, your utility or the supplier <b>directly</b>.
        You never handle the money.
      </p>

      {open ? (
        <div className="jub-open">
          <strong>{JUB_STATUS_COPY[open.status] || open.status}</strong>
          <span>{kinds?.kinds?.find((k) => k.id === open.needKind)?.label || open.needKind} · {MONEY(open.amount?.units ?? open.amount)}</span>
          {open.detail && <small>&ldquo;{open.detail}&rdquo;</small>}
          <p className="mem-fineprint">One at a time. This one has to finish first.</p>
        </div>
      ) : (
        <div className="jub-form">
          <label className="jub-label">What do you need?</label>
          <div className="jub-kinds">
            {kinds?.kinds?.map((k) => (
              <button type="button" key={k.id}
                      className={`jub-kind${form.needKind === k.id ? ' on' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, needKind: k.id }))}>
                {k.label}
              </button>
            ))}
          </div>

          <label className="jub-label" htmlFor="jub-amt">How much is owed?</label>
          <input id="jub-amt" className="jub-input" inputMode="decimal" placeholder="0.00"
                 value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />

          <label className="jub-label" htmlFor="jub-detail">What&rsquo;s happening?</label>
          <textarea id="jub-detail" className="jub-input jub-textarea" rows={3}
                    placeholder="In your own words — what happened and by when it has to be sorted."
                    value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} />

          <label className="jub-label" htmlFor="jub-prov">Who has to be paid?</label>
          <input id="jub-prov" className="jub-input" placeholder="Landlord, utility or shop — name if you know it"
                 value={form.providerHint} onChange={(e) => setForm((f) => ({ ...f, providerHint: e.target.value }))} />

          <button type="button" className="bingo-btn gold" disabled={busy || !form.needKind || !(Number(form.amount) > 0)}
                  onClick={submit}>
            {busy ? 'Sending…' : 'Send this to the door'}
          </button>
          <p className="mem-fineprint">
            The door checks it, two people have to approve it, and then the provider is paid.
            Nothing is promised.
          </p>
        </div>
      )}

      {/* What already happened. Three award states, never collapsed into "done" —
          the gap between approved, paid and delivered is the whole point. */}
      {mine?.awards?.length > 0 && (
        <div className="jub-awards">
          <h3>Your support</h3>
          {mine.awards.map((a) => (
            <div key={a.awardId} className={`jub-award${a.status === 'DELIVERED' ? ' done' : ''}`}>
              <div className="dash-info">
                <strong>{JUB_STATUS_COPY[a.status] || a.status}</strong>
                <span className="dash-num">{MONEY(a.amountCents)} → {a.provider}</span>
              </div>
              {a.delivered && <small className="jub-delivered">{a.provider} confirmed: {a.delivered}</small>}
              {a.status !== 'DELIVERED' && <small className="jub-pending">{a.status}</small>}
            </div>
          ))}
        </div>
      )}

      {onDone && <button type="button" className="bingo-btn ghost" onClick={onDone}>← Back</button>}
    </AppPanel>
  );
}

// ── The support queue ──────────────────────────────────────────────────────
//
// Where a need becomes a payment, and where §68's gate is visible as a gate:
// verify with a note somebody can review, approve as a named person, award
// against a provider from the roster, pay with a reference that reconciles, and
// then the PROVIDER says what they delivered. Every refusal names the stage it
// stopped at, because "failed" tells a host nothing at 11pm.
function JubileeQueue() {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState({});
  const [refs, setRefs] = useState({});
  const [deliv, setDeliv] = useState({});
  const [picked, setPicked] = useState({});
  const [vendor, setVendor] = useState({ name: '', kind: 'landlord', contact: '' });

  const load = async () => {
    try { setQ(await apiJubileeQueue()); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load the queue.'); }
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); }
    catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  if (!q && !err) return <AppPanel title="Support" subtitle="Community reserve"><p className="dash-empty">Loading…</p></AppPanel>;
  // A queue that did not load is not a queue with nothing in it. Rendering the
  // strip from an absent `q` drew a $0.00 reserve and announced that no policy
  // had been adopted — two confident claims about money, made from a failed
  // request. When the load fails, say that and stop.
  if (!q) {
    return (
      <AppPanel title="Support" subtitle="Community reserve">
        <p className="k-nudge k-nudge--no">{err}</p>
        <p className="mem-fineprint">
          This is the queue failing to load, not an empty reserve — nothing here is a reading of the money.
        </p>
        <button type="button" className="bingo-btn compact ghost" onClick={load}>Try again</button>
      </AppPanel>
    );
  }

  const short = (q?.capacityCents ?? 0) <= 0;
  return (
    <>
      <AppPanel title="Support" subtitle="Community reserve">
        {err && <p className="k-nudge k-nudge--no">{err}</p>}

        {/* What is actually there to spend, and what is already spoken for. */}
        <div className="jub-reserve">
          <span><i>Reserve</i><b>{MONEY(q?.reserveCents)}</b></span>
          <span><i>Committed</i><b>{MONEY(q?.committedCents)}</b></span>
          <span className={short ? 'low' : ''}><i>Can release</i><b>{MONEY(q?.capacityCents)}</b></span>
        </div>
        {!q?.policyAdopted && (
          <p className="k-nudge k-nudge--no">
            No release policy has been adopted, so nothing can be paid out yet — writing one down is not adopting it.
          </p>
        )}
        {q?.policyAdopted && (
          <p className="mem-fineprint">Takes {q.normalApprovals} different people to approve a release.</p>
        )}

        {q?.applications?.length === 0 && <p className="dash-empty">Nobody has asked for help.</p>}

        {q?.applications?.map((a) => {
          const approvals = a.approvals || [];
          const enough = approvals.length >= (q.normalApprovals ?? 2);
          const cents = a.amount?.units ?? 0;
          return (
            <div key={a.applicationId} className="jub-case">
              <div className="jub-case-head">
                <div className="dash-info">
                  <strong>{a.name}</strong>
                  <span className="dash-num">{a.number} · {MONEY(cents)}</span>
                </div>
                <span className={`jub-chip${a.evidenceVerified ? ' ok' : ''}`}>
                  {a.evidenceVerified ? '✓ Checked' : 'Not checked'}
                </span>
              </div>
              {a.detail && <p className="jub-case-detail">&ldquo;{a.detail}&rdquo;</p>}
              {a.providerHint && <p className="mem-fineprint">They say to pay: {a.providerHint}</p>}

              {/* 1. Verify — with a note. A verification nobody can review is not one. */}
              {!a.evidenceVerified ? (
                <div className="jub-step">
                  <input className="jub-input" placeholder="What did you check? (required)"
                         value={notes[a.applicationId] || ''}
                         onChange={(e) => setNotes((n) => ({ ...n, [a.applicationId]: e.target.value }))} />
                  <button type="button" className="bingo-btn compact" disabled={busy || !(notes[a.applicationId] || '').trim()}
                          onClick={() => act(() => apiJubileeVerify(a.applicationId, notes[a.applicationId]))}>
                    Mark checked
                  </button>
                </div>
              ) : (
                <>
                  {a.evidenceNote && <p className="jub-note">Checked: {a.evidenceNote}</p>}

                  {/* 2. Approve — one tap is ONE named approval. */}
                  <div className="jub-approvals">
                    <span className={enough ? 'ok' : ''}>{approvals.length} of {q.normalApprovals} approvals</span>
                    {approvals.map((ap) => <em key={ap.by}>{ap.by}</em>)}
                    {!enough && (
                      <button type="button" className="bingo-btn compact ghost" disabled={busy}
                              onClick={() => act(() => apiJubileeApprove(a.applicationId))}>
                        Approve as me
                      </button>
                    )}
                  </div>

                  {/* 3. Award against a provider from the roster. */}
                  {enough && (
                    <div className="jub-step">
                      <select className="jub-input" value={picked[a.applicationId] || ''}
                              onChange={(e) => setPicked((p) => ({ ...p, [a.applicationId]: e.target.value }))}>
                        <option value="">Who gets paid…</option>
                        {q.vendors?.filter((v) => v.approved).map((v) => (
                          <option key={v.providerId} value={v.providerId}>{v.name} ({v.kind})</option>
                        ))}
                      </select>
                      <button type="button" className="bingo-btn compact gold" disabled={busy || !picked[a.applicationId]}
                              onClick={() => act(() => apiJubileeAward(a.applicationId, picked[a.applicationId]))}>
                        Award
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </AppPanel>

      {/* Money that has been approved and is not finished yet.
          §41's distinction, made operable: APPROVED is not PAID, and PAID is not
          DELIVERED. Each of the three is a separate act by a named person, and
          an award stays on this screen until a PROVIDER says what they actually
          handed over — otherwise "we helped them" means "we filled in a form". */}
      {q.awards?.length > 0 && (
        <AppPanel title="Owed and owing" subtitle="Approved, not finished">
          {q.awards.map((a) => (
            <div key={a.awardId} className="jub-case">
              <div className="jub-case-head">
                <div className="dash-info">
                  <strong>{a.name}</strong>
                  <span className="dash-num">{MONEY(a.amountCents)} → {a.provider}</span>
                </div>
                <span className="jub-chip">{JUB_STATUS_COPY[a.status] || a.status}</span>
              </div>

              {!a.paidAt ? (
                <div className="jub-step">
                  <input className="jub-input" placeholder="Payment reference (check no., transfer id)"
                         value={refs[a.awardId] || ''}
                         onChange={(e) => setRefs((r) => ({ ...r, [a.awardId]: e.target.value }))} />
                  <button type="button" className="bingo-btn compact gold"
                          disabled={busy || !(refs[a.awardId] || '').trim()}
                          onClick={() => act(() => apiJubileePay(a.awardId, refs[a.awardId].trim()))}>
                    Mark paid
                  </button>
                </div>
              ) : (
                <>
                  <p className="jub-note">Paid · reference {a.reference}</p>
                  {/* Deliberately two fields: WHO at the provider is saying it,
                      and WHAT they gave. "Delivered ✓" with neither is the
                      easiest thing in this whole flow to fake. */}
                  <div className="jub-step jub-step--wrap">
                    <input className="jub-input" placeholder="Who at the provider is confirming"
                           value={deliv[a.awardId]?.by || ''}
                           onChange={(e) => setDeliv((d) => ({ ...d, [a.awardId]: { ...d[a.awardId], by: e.target.value } }))} />
                    <input className="jub-input" placeholder="What they delivered"
                           value={deliv[a.awardId]?.what || ''}
                           onChange={(e) => setDeliv((d) => ({ ...d, [a.awardId]: { ...d[a.awardId], what: e.target.value } }))} />
                    <button type="button" className="bingo-btn compact"
                            disabled={busy || !(deliv[a.awardId]?.by || '').trim() || !(deliv[a.awardId]?.what || '').trim()}
                            onClick={() => act(() => apiJubileeDelivered(a.awardId, deliv[a.awardId].by.trim(), deliv[a.awardId].what.trim()))}>
                      Provider confirms
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </AppPanel>
      )}

      {/* The approved vendor roster (§38). Support is paid to a provider on
          this list, never handed over as cash. */}
      <AppPanel title="Providers" subtitle="Who can be paid">
        {q?.vendors?.length === 0 && <p className="dash-empty">No providers yet — add the ones you actually use.</p>}
        {q?.vendors?.map((v) => (
          <div key={v.providerId} className="dash-row">
            <div className="dash-info"><strong>{v.name}</strong><span className="dash-num">{v.kind}{v.contact ? ` · ${v.contact}` : ''}</span></div>
            <span className={`jub-chip${v.approved ? ' ok' : ''}`}>{v.approved ? 'Approved' : 'Not approved'}</span>
          </div>
        ))}
        <div className="jub-step jub-step--wrap">
          <input className="jub-input" placeholder="Name" value={vendor.name}
                 onChange={(e) => setVendor((v) => ({ ...v, name: e.target.value }))} />
          <select className="jub-input" value={vendor.kind} onChange={(e) => setVendor((v) => ({ ...v, kind: e.target.value }))}>
            {['landlord', 'utility', 'lodging', 'food', 'transport', 'admin', 'equipment', 'training'].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input className="jub-input" placeholder="Phone or email" value={vendor.contact}
                 onChange={(e) => setVendor((v) => ({ ...v, contact: e.target.value }))} />
          <button type="button" className="bingo-btn compact" disabled={busy || !vendor.name.trim()}
                  onClick={() => act(async () => { await apiJubileeVendor(vendor); setVendor({ name: '', kind: 'landlord', contact: '' }); })}>
            Add
          </button>
        </div>
      </AppPanel>
    </>
  );
}

// ── Tonight ────────────────────────────────────────────────────────────────
//
// The app used to ask "who are you?" and then hand over a map of every screen,
// equally available at all times. That is fine for a member with two menu items
// and useless for whoever is running the place, who had to hold the whole map
// in their head and go fetch the thing that mattered — including going in as a
// MEMBER, through the game menu, to reach their own host controls.
//
// The question at 11pm is not who you are. It is what is happening and what is
// waiting on you, and that changes every few minutes. The server already knew
// all of it and nobody was asking. This asks, and then does the navigating:
// one thing to do, in the largest type on the screen, and tapping it lands on
// the right console AND the right tab.
//
// Everything else is still exactly where it was. This is a front door, not a
// replacement — the map did not shrink, it just stopped being your problem.
function TonightScreen({ onGo }) {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    const load = async () => {
      try { const r = await apiVenuePulse(); if (live.current) { setP(r); setErr(''); } }
      catch (e) { if (live.current) setErr(e.message || 'Could not reach the venue.'); }
    };
    load();
    // Fast enough that a claim lands while somebody is still standing there.
    const id = setInterval(load, 4000);
    return () => { live.current = false; clearInterval(id); };
  }, []);

  if (!p && !err) return <AppPanel title="Tonight" subtitle="What needs you"><p className="dash-empty">Looking at the room…</p></AppPanel>;
  if (!p) {
    return (
      <AppPanel title="Tonight" subtitle="What needs you">
        <p className="k-nudge k-nudge--no">{err}</p>
        <p className="mem-fineprint">This is the app failing to reach the venue, not a quiet night.</p>
      </AppPanel>
    );
  }

  const waited = (ms) => {
    if (!(ms > 0)) return null;
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  };

  return (
    <>
      {/* The one thing. Deliberately the only thing at this size — a dashboard
          of six equally-weighted panels is the problem this replaces. */}
      <button type="button" className={`tonight-now u-${p.now.id.split('-')[0]}`}
              onClick={() => onGo(p.now.action)}>
        <span className="tonight-eyebrow">
          Now
          {p.now.count > 1 && <b> · {p.now.count}</b>}
          {waited(p.now.waitingMs) && <em>waiting {waited(p.now.waitingMs)}</em>}
        </span>
        <strong className="tonight-headline">{p.now.headline}</strong>
        <span className="tonight-detail">{p.now.detail}</span>
        <span className="tonight-go">{p.now.action.label} →</span>
      </button>

      {/* Everything else that is live, small, in the order it will matter. */}
      {p.then.length > 0 && (
        <div className="tonight-then">
          {p.then.map((it) => (
            <button type="button" key={it.id} className="tonight-row" onClick={() => onGo(it.action)}>
              <span className="tonight-row-main">
                <strong>{it.headline}</strong>
                <em>{it.detail}</em>
              </span>
              <span className="tonight-row-go">→</span>
            </button>
          ))}
        </div>
      )}

      {/* Running the night is two taps from the door, always — not four taps
          through the member app, which is how it used to be reached. */}
      <button type="button" className="tonight-host" onClick={() => onGo({ screen: 'host', tab: 'run' })}>
        Run the night · Host controls →
      </button>

      {/* The old door dashboard, unchanged, underneath. It is the context for
          everything above, which is exactly where context belongs. */}
      <StaffDashboardScreen />
    </>
  );
}

// ── Getting in ─────────────────────────────────────────────────────────────
//
// Signing in is not membership. Before anybody uses this place they read the
// Community Covenant and agree to it, say what they do for a living, and choose
// a programme to stand behind.
//
// The server refuses everything until all three are done, so this screen is not
// the rule — it is how the rule looks to somebody standing at the door with a
// drink in their hand. Which means: one thing at a time, in words, with the
// covenant actually readable rather than a checkbox next to a link nobody opens.
function Onboarding({ onDone }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState(null);
  const [other, setOther] = useState('');

  const load = async () => {
    try {
      const r = await apiOnboarding();
      setD(r);
      if (r.accepted) onDone?.();
    } catch (e) { setErr(e.message || 'Could not reach the venue.'); }
  };
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); }
    catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  if (!d && !err) return <section className="screen onb"><p className="dash-empty">One moment…</p></section>;
  if (!d) {
    return (
      <section className="screen onb">
        <p className="k-nudge k-nudge--no">{err}</p>
        <button type="button" className="bingo-btn compact ghost" onClick={load}>Try again</button>
      </section>
    );
  }

  const step = d.next?.id;
  const stepNo = d.steps.findIndex((s2) => !s2.done) + 1;

  return (
    <section className="screen onb">
      <div className="onb-wrap">
        {/* Where they are, so three steps do not feel like an unknown number. */}
        <ol className="onb-rail">
          {d.steps.map((s2, i) => (
            <li key={s2.id} className={s2.done ? 'done' : (i + 1 === stepNo ? 'on' : '')}>
              <b>{i + 1}</b><span>{s2.label}</span>
            </li>
          ))}
        </ol>
        {err && <p className="k-nudge k-nudge--no">{err}</p>}

        {step === 'AGREE' && (
          <>
            <h1 className="onb-title">{d.covenant.title}</h1>
            <p className="onb-lead">{d.covenant.lead}</p>
            {/* The whole thing, on the screen. A covenant behind a link is a
                checkbox, and a checkbox is not an agreement. */}
            <div className="onb-clauses">
              {d.covenant.clauses.map((c) => (
                <div key={c.id} className="onb-clause">
                  <strong>{c.heading}</strong>
                  <p>{c.body}</p>
                </div>
              ))}
            </div>
            <p className="onb-accept">{d.covenant.accept}</p>
            <button type="button" className="bingo-btn gold" disabled={busy}
                    onClick={() => act(() => apiAgree(d.covenant.version))}>
              {busy ? 'One moment…' : 'I agree'}
            </button>
            <p className="mem-fineprint">Version {d.covenant.version}. If this ever changes you will be asked again.</p>
          </>
        )}

        {step === 'ROLE' && (
          <>
            <h1 className="onb-title">What do you do?</h1>
            <p className="onb-lead">
              This room runs on the people in it — artists, nail techs, barbers, drivers, cooks.
              What you pick decides what opens up for you.
            </p>
            {!group ? (
              <div className="onb-groups">
                {d.groups.map((g) => (
                  <button type="button" key={g.id} className="onb-group" onClick={() => setGroup(g.id)}>
                    <strong>{g.label}</strong>
                    <span>{g.roles.length} to choose from</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <button type="button" className="onb-back" onClick={() => setGroup(null)}>‹ All kinds of work</button>
                <div className="onb-roles">
                  {d.groups.find((g) => g.id === group)?.roles.map((r) => (
                    <button type="button" key={r.id} className="onb-role" disabled={busy}
                            onClick={() => (r.id === 'OTHER' ? null : act(() => apiSetRole(r.id)))}>
                      <strong>{r.label}</strong>
                      {r.creative && <span className="onb-tag">Register your work</span>}
                      {r.sells && <span className="onb-tag alt">Sell in the marketplace</span>}
                    </button>
                  ))}
                </div>
                {/* The list is not the economy. Somebody not on it says so, and
                    what they type is kept. */}
                {d.groups.find((g) => g.id === group)?.roles.some((r) => r.id === 'OTHER') && (
                  <div className="jub-step jub-step--wrap">
                    <input className="jub-input" placeholder="Or type what you do" value={other}
                           maxLength={60} onChange={(e) => setOther(e.target.value)} />
                    <button type="button" className="bingo-btn compact" disabled={busy || other.trim().length < 2}
                            onClick={() => act(() => apiSetRole('OTHER', other.trim()))}>
                      That&rsquo;s me
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {step === 'PROGRAM' && (
          <>
            <h1 className="onb-title">Which cause do you stand behind?</h1>
            <p className="onb-lead">
              A share of what this venue takes goes to a community reserve, and these are what it
              pays for. Standing behind one costs you nothing — it is what you are here for as
              well as the night.
            </p>
            <div className="prog-grid">
              {d.programs.map((p) => (
                <button type="button" key={p.id} className="prog-card" disabled={busy}
                        onClick={() => act(() => apiJoinProgram(p.id))}>
                  <strong>{p.label}</strong>
                  <span className="prog-num">{MONEY(p.donatedCents)}</span>
                  <span className="prog-members">
                    {p.members} {p.members === 1 ? 'member' : 'members'} · {p.openSeats} open
                  </span>
                </button>
              ))}
            </div>
            <p className="mem-fineprint">You can move to another one later, any time.</p>
          </>
        )}

        {/* Last, and last on purpose. Nobody is asked for money until they know
            what they are joining, what they will be here as, and what they are
            standing behind. Dues first would make this a subscription with a
            covenant attached, rather than an association with dues. */}
        {step === 'TIER' && (
          <>
            <h1 className="onb-title">Choose your membership</h1>
            <p className="onb-lead">
              You have agreed to the covenant, said what you do, and chosen a cause.
              This is the last step — pick how long you are in for.
            </p>
            <div className="onb-tiers">
              {(d.tiers || []).map((t) => (
                <button type="button" key={t.id} className={`onb-tier${t.vip ? ' vip' : ''}`} disabled={busy}
                        onClick={() => act(() => apiPurchase(t.id, 'card'))}>
                  <strong>{t.id}</strong>
                  <span className="onb-tier-price">${t.price}</span>
                  <span>for {t.every}</span>
                  {t.vip && <span className="onb-tag">VIP</span>}
                </button>
              ))}
            </div>
            <p className="mem-fineprint">
              You pay at the door or in the app. Nothing is charged to you here —
              the venue confirms the money arrived before your membership starts.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

// ── Your programme ─────────────────────────────────────────────────────────
//
// The six programmes already existed as things the RESERVE pays for, which made
// them a spending category. "A percentage goes to the community" is true and
// unverifiable by the person who paid it.
//
// Every member joins one, and it decides which vault their share of the house
// fee lands in. That is the whole difference: not a badge on a card, but a
// named pot with their money in it and a number they can watch move.
//
// Switching is allowed. Money already contributed stays where it landed —
// changing programme changes where the NEXT share goes, and saying so plainly
// is better than letting somebody assume their history follows them.
function ProgramPicker({ compact, onDone }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!compact);

  const load = async () => {
    try { setData(await apiPrograms()); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load the programmes.'); }
  };
  useEffect(() => { load(); }, []);

  const join = async (id) => {
    setBusy(true); setErr('');
    try { await apiJoinProgram(id); await load(); setOpen(false); onDone?.(id); }
    catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  if (!data && !err) return null;
  if (!data) return <p className="k-nudge k-nudge--no">{err}</p>;

  const mine = data.programs.find((p) => p.id === data.mine) || null;

  // Joined, and not asking to change: one quiet line with the number that
  // makes it real.
  if (mine && compact && !open) {
    return (
      <button type="button" className="prog-mine" onClick={() => setOpen(true)}>
        <span className="prog-mine-eyebrow">Your programme</span>
        <strong>{mine.label}</strong>
        <span className="prog-mine-num">
          {mine.members} {mine.members === 1 ? 'member' : 'members'} · {MONEY(mine.donatedCents)} given
          {mine.openSeats > 0 && <i> · {mine.openSeats} {mine.openSeats === 1 ? 'seat' : 'seats'} open</i>}
        </span>
        <span className="prog-mine-go">Change ›</span>
      </button>
    );
  }

  return (
    <section className={`prog${mine ? '' : ' prog--needed'}`}>
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      <h3>{mine ? 'Move to another programme' : 'Choose your programme'}</h3>
      <p className="prog-lead">
        {mine
          ? 'Anything you have already given stays with the programme you gave it to.'
          : 'Every member stands behind one. Playing does not cost the programme anything and does not give it anything — what you can do for it is give to it, or sit on its board.'}
      </p>
      <div className="prog-grid">
        {data.programs.map((p) => (
          <button type="button" key={p.id} disabled={busy}
                  className={`prog-card${p.id === data.mine ? ' on' : ''}`}
                  onClick={() => join(p.id)}>
            <strong>{p.label}</strong>
            <span className="prog-num">{MONEY(p.donatedCents)}</span>
            <span className="prog-members">
              {p.members} {p.members === 1 ? 'member' : 'members'} · {p.openSeats} open
            </span>
            {p.id === data.mine && <span className="prog-tick">✓ Yours</span>}
          </button>
        ))}
      </div>
      {mine && <button type="button" className="bingo-btn compact ghost" onClick={() => setOpen(false)}>Keep {mine.label}</button>}
    </section>
  );
}

// ── Your standing with the association ─────────────────────────────────────
//
// The three things a member of a private association is owed, and which no
// amount of features elsewhere substitutes for:
//
//   what you signed, in the words you signed it;
//   what is held about you;
//   the way out.
//
// It is one screen because they are one subject — the relationship itself,
// rather than anything you do inside it. And the way out is on it, plainly,
// rather than buried where leaving becomes something you have to ask for.
function StandingScreen({ onDone }) {
  const [tab, setTab] = useState('covenant');
  const [cov, setCov] = useState(null);
  const [rec, setRec] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [why, setWhy] = useState('');
  const [saved, setSaved] = useState('');

  const load = async () => {
    try {
      const [a, b] = await Promise.all([apiMyCovenant(), apiMyRecord()]);
      setCov(a); setRec(b); setErr('');
    } catch (e) { setErr(e.message || 'Could not load.'); }
  };
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  // A copy they keep. The point of a record you cannot take away is limited,
  // so this writes the whole thing to a file on their own phone.
  const download = () => {
    try {
      const blob = new Blob([JSON.stringify({ covenant: cov, record: rec }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `hvas-record-${rec?.member?.number || 'member'}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setSaved('Saved to your phone.');
      setTimeout(() => setSaved(''), 3000);
    } catch { setErr('Could not save the file.'); }
  };

  if (!cov || !rec) {
    return <AppPanel title="Your membership" subtitle="Where you stand"><p className="dash-empty">{err || 'Loading…'}</p></AppPanel>;
  }
  const resigned = rec.standing?.state === 'RESIGNED';
  const doc = cov.signed?.document || cov.current.document;

  return (
    <AppPanel title="Your membership" subtitle="Where you stand">
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      {saved && <p className="k-nudge">{saved}</p>}

      {resigned && (
        <div className="stand-state out">
          <strong>You have resigned</strong>
          <span>
            Your record is unchanged — what happened here happened. You are not being
            admitted at the door until you come back.
          </span>
          <button type="button" className="bingo-btn compact gold" disabled={busy}
                  onClick={() => act(() => apiRejoin())}>Rejoin</button>
        </div>
      )}

      <div className="staff-hub-tabs prog-tabs">
        {[['covenant', 'What you signed'], ['record', 'What we hold'], ['leave', resigned ? 'Rejoining' : 'Leaving']]
          .map(([id, label]) => (
            <button type="button" key={id} className={`staff-hub-tab${tab === id ? ' on' : ''}`}
                    onClick={() => setTab(id)}>{label}</button>
          ))}
      </div>

      {tab === 'covenant' && (
        <>
          {cov.signed ? (
            <p className="earn-note">
              You agreed to version <b>{cov.signed.version}</b> on {fmtDate(cov.signed.at)}.
              {cov.outOfDate
                ? ' The association has published a newer one since — this is still what you agreed to.'
                : ' This is the current version.'}
            </p>
          ) : (
            <p className="k-nudge k-nudge--no">You have not agreed to the covenant yet.</p>
          )}
          <div className="onb-clauses">
            {doc.clauses.map((cl) => (
              <div key={cl.id} className="onb-clause">
                <strong>{cl.heading}</strong>
                <p>{cl.body}</p>
              </div>
            ))}
          </div>
          <p className="onb-accept">{doc.accept}</p>
          {/* Not decoration. A member holding this number and the association
              holding the same number are demonstrably talking about the same
              document, without either having to trust the other's copy. */}
          {cov.signed?.fingerprint && (
            <p className="lic-hash">Document fingerprint · {cov.signed.fingerprint}</p>
          )}
        </>
      )}

      {tab === 'record' && (
        <>
          <div className="rec-grid">
            <span><i>Member since</i><b>{fmtDate(rec.member.joined)}</b></span>
            <span><i>Number</i><b>{rec.member.number}</b></span>
            <span><i>What you do</i><b>{rec.member.tradeLabel || '—'}</b></span>
            <span><i>Nights here</i><b>{rec.nightsAttended}</b></span>
          </div>
          {rec.membership && (
            <div className="give-row">
              <div className="dash-info">
                <strong>{rec.membership.tier}{rec.membership.vip ? ' VIP' : ''}</strong>
                <span className="dash-num">Until {fmtDate(rec.membership.until)}</span>
              </div>
              <span className={`jub-chip${rec.membership.status === 'active' ? ' ok' : ''}`}>{rec.membership.status}</span>
            </div>
          )}
          <div className="give-list">
            <h4>What you have agreed to</h4>
            {rec.agreements.map((a, i) => (
              <div key={i} className="give-row">
                <div className="dash-info">
                  <strong>{a.document === 'COVENANT' ? 'The Community Covenant' : a.document}</strong>
                  <span className="dash-num">Version {a.version} · {fmtDate(a.at)}</span>
                </div>
              </div>
            ))}
          </div>
          {rec.standingHistory.length > 0 && (
            <div className="give-list">
              <h4>Your standing over time</h4>
              {rec.standingHistory.map((h, i) => (
                <div key={i} className="give-row">
                  <div className="dash-info">
                    <strong>{h.state === 'RESIGNED' ? 'You resigned' : h.state === 'REJOINED' ? 'You rejoined' : h.state}</strong>
                    <span className="dash-num">{fmtDate(h.at)}{h.reason ? ` · ${h.reason}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="earn-note">{rec.note}</p>
          <button type="button" className="bingo-btn" onClick={download}>Save a copy to my phone</button>
        </>
      )}

      {tab === 'leave' && (
        resigned ? (
          <>
            <p className="earn-note">
              You resigned on {fmtDate(rec.standing.at)}. Nothing was deleted, and you can come back
              whenever you want to.
            </p>
            <button type="button" className="bingo-btn gold" disabled={busy}
                    onClick={() => act(() => apiRejoin())}>{busy ? 'Coming back…' : 'Rejoin'}</button>
          </>
        ) : (
          <>
            {/* Said honestly, including the part that is in the association's
                interest to leave vague. Somebody deciding whether to leave is
                owed the real consequences, not a warning designed to keep them. */}
            <p className="earn-note">
              You can leave whenever you want. If you do:
            </p>
            <div className="onb-clauses">
              <div className="onb-clause">
                <strong>The door stops</strong>
                <p>Your pass will not be admitted. That is what leaving means.</p>
              </div>
              <div className="onb-clause">
                <strong>Your record stays as it is</strong>
                <p>What happened here happened — the nights, the agreements, anything you were paid.
                   It is not erased, and it is still yours to read.</p>
              </div>
              <div className="onb-clause">
                <strong>You can come back</strong>
                <p>Any time, from this screen. If your membership still has time left on it, it starts again where it was.</p>
              </div>
            </div>
            {!leaving ? (
              <button type="button" className="bingo-btn ghost" onClick={() => setLeaving(true)}>I want to leave</button>
            ) : (
              <div className="jub-form">
                <label className="jub-label">Anything you want to say? (optional)</label>
                <textarea className="jub-input jub-textarea" rows={2} value={why} maxLength={400}
                          onChange={(e) => setWhy(e.target.value)} />
                <button type="button" className="bingo-btn danger" disabled={busy}
                        onClick={() => act(async () => { await apiResign(why.trim()); setLeaving(false); setWhy(''); setTab('record'); })}>
                  {busy ? 'Resigning…' : 'Resign my membership'}
                </button>
                <button type="button" className="bingo-btn compact ghost" onClick={() => setLeaving(false)}>Stay</button>
              </div>
            )}
          </>
        )
      )}

      {onDone && <button type="button" className="bingo-btn ghost" onClick={onDone}>← Back</button>}
    </AppPanel>
  );
}

// ── Making money here ──────────────────────────────────────────────────────
//
// Four ways, on one screen, because they are the same question asked four ways:
// what have I got that this room wants.
//
//   SELL     — a service or goods, member to member.
//   GIGS     — the same, but both sides put something down first (§18).
//   LICENSE  — creative work, sold many times over and still owned.
//   BRING    — paid for the people you bring, on money that actually arrived.
//
// They are tabs rather than four menu items because a nail tech who also DJs
// should not have to know which part of the app her second trade lives in.
function EarnScreen({ onDone }) {
  const [tab, setTab] = useState('sell');
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiEarn().then(setMeta).catch((e) => setErr(e.message || 'Could not load.'));
  }, []);

  if (!meta && !err) return <AppPanel title="Earn" subtitle="Ways to make money here"><p className="dash-empty">Loading…</p></AppPanel>;
  if (!meta) {
    return (
      <AppPanel title="Earn" subtitle="Ways to make money here">
        <p className="k-nudge k-nudge--no">{err}</p>
      </AppPanel>
    );
  }

  const TABS = [
    ['sell', 'Sell'],
    ['gigs', 'Gigs'],
    ['license', 'License'],
    ['bring', 'Bring people'],
  ];

  return (
    <AppPanel title="Earn" subtitle="Ways to make money here">
      {/* Said once, at the top, before anybody lists anything (§46). */}
      <p className="earn-fee">{meta.feeSaid}</p>
      <div className="staff-hub-tabs prog-tabs">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} className={`staff-hub-tab${tab === id ? ' on' : ''}`}
                  onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'sell' && <SellTab meta={meta} />}
      {tab === 'gigs' && <GigsTab />}
      {tab === 'license' && <LicenseTab />}
      {tab === 'bring' && <BringTab />}

      {onDone && <button type="button" className="bingo-btn ghost" onClick={onDone}>← Back</button>}
    </AppPanel>
  );
}

// Selling a service or goods to the room.
function SellTab({ meta }) {
  const [mine, setMine] = useState(null);
  const [shop, setShop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ kind: 'SERVICE', title: '', detail: '', amount: '', priceMode: 'FIXED', delivery: 'AT_VENUE' });

  const load = async () => {
    try { const [a, b] = await Promise.all([apiMarketMine(), apiMarket()]); setMine(a); setShop(b); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load.'); }
  };
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };
  if (!mine) return <p className="dash-empty">{err || 'Loading…'}</p>;

  const cents = Math.round(Number(form.amount) * 100);
  const keep = cents > 0 ? Math.round(cents * (1 - meta.feePercent)) : 0;

  return (
    <>
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      {mine.earnedCents > 0 && (
        <div className="earn-total"><span>Earned selling</span><b>{MONEY(mine.earnedCents)}</b></div>
      )}

      <div className="jub-form">
        <label className="jub-label">What are you offering?</label>
        <div className="jub-kinds">
          {meta.kinds.map((k) => (
            <button type="button" key={k.id} className={`jub-kind${form.kind === k.id ? ' on' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, kind: k.id }))}>{k.label}</button>
          ))}
        </div>
        <input className="jub-input" placeholder="Full set, gel · Friday catering · Two-hour DJ set"
               value={form.title} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <textarea className="jub-input jub-textarea" rows={2} placeholder="What they get, and how long it takes."
                  value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} />
        <div className="jub-step jub-step--wrap">
          <input className="jub-input" inputMode="decimal" placeholder="0.00" value={form.amount}
                 onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <select className="jub-input" value={form.priceMode}
                  onChange={(e) => setForm((f) => ({ ...f, priceMode: e.target.value }))}>
            {meta.priceModes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select className="jub-input" value={form.delivery}
                  onChange={(e) => setForm((f) => ({ ...f, delivery: e.target.value }))}>
            {meta.delivery.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        {/* What they keep, before they list — not after somebody buys. */}
        {cents > 0 && (
          <p className="earn-keep">You keep <b>{MONEY(keep)}</b> of {MONEY(cents)}.</p>
        )}
        <button type="button" className="bingo-btn gold" disabled={busy || form.title.trim().length < 3 || !(cents >= 0 && form.amount !== '')}
                onClick={() => act(async () => {
                  await apiMarketList({ kind: form.kind, title: form.title.trim(), detail: form.detail,
                                        priceCents: cents, priceMode: form.priceMode, delivery: form.delivery });
                  setForm((f) => ({ ...f, title: '', detail: '', amount: '' }));
                })}>
          {busy ? 'Listing…' : 'Put it up'}
        </button>
      </div>

      {mine.listings.filter((l) => l.status === 'OPEN').length > 0 && (
        <div className="give-list">
          <h4>You are selling</h4>
          {mine.listings.filter((l) => l.status === 'OPEN').map((l) => (
            <div key={l.listingId} className="give-row">
              <div className="dash-info">
                <strong>{l.title}</strong>
                <span className="dash-num">{MONEY(l.priceCents)} · {l.priceModeLabel} · {l.deliveryLabel}</span>
              </div>
              <button type="button" className="bingo-btn compact ghost" disabled={busy}
                      onClick={() => act(() => apiMarketClose(l.listingId))}>Close</button>
            </div>
          ))}
        </div>
      )}

      {mine.sold.length > 0 && (
        <div className="give-list">
          <h4>Sold</h4>
          {mine.sold.map((o) => (
            <div key={o.orderId} className={`give-row${o.status === 'DELIVERED' ? ' done' : ''}`}>
              <div className="dash-info">
                <strong>{o.buyer}</strong>
                <span className="dash-num">You get {MONEY(o.youGet)} · venue {MONEY(o.venueFee)}</span>
              </div>
              <span className={`jub-chip${o.status === 'DELIVERED' ? ' ok' : ''}`}>{o.status}</span>
            </div>
          ))}
        </div>
      )}

      <div className="give-list">
        <h4>What the room is selling</h4>
        {shop?.listings.filter((l) => !l.mine).length === 0 && <p className="dash-empty">Nobody else is selling yet.</p>}
        {shop?.listings.filter((l) => !l.mine).map((l) => (
          <div key={l.listingId} className="give-row">
            <div className="dash-info">
              <strong>{l.title}</strong>
              {/* What they actually do, so a buyer knows a nail tech from a mechanic. */}
              <span className="dash-num">{l.seller}{l.trade ? ` · ${l.trade}` : ''} · {MONEY(l.priceCents)}</span>
            </div>
            <button type="button" className="bingo-btn compact" disabled={busy}
                    onClick={() => act(() => apiMarketOrder(l.listingId))}>Buy</button>
          </div>
        ))}
      </div>

      {mine.bought.filter((o) => o.status === 'PAID').length > 0 && (
        <div className="give-list">
          <h4>Say you got it</h4>
          {mine.bought.filter((o) => o.status === 'PAID').map((o) => (
            <div key={o.orderId} className="give-row">
              <div className="dash-info"><strong>{MONEY(o.priceCents)}</strong><span className="dash-num">Paid — did you get it?</span></div>
              <button type="button" className="bingo-btn compact gold" disabled={busy}
                      onClick={() => act(() => apiMarketReceived(o.orderId))}>I got it</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Booking work, which in this app means both sides put something down first.
//
// §18: a stake here is a performance bond, not a yield product. The provider
// posts it because a booking somebody can walk away from for free is not a
// booking. It comes back the moment the work is confirmed — it is not the
// venue's money and it never earns the venue anything.
function GigsTab() {
  const [data, setData] = useState(null);
  const [shop, setShop] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [book, setBook] = useState(null);   // the listing being booked
  const [when, setWhen] = useState('');

  const load = async () => {
    try { const [a, b] = await Promise.all([apiGigs(), apiMarket()]); setData(a); setShop(b); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load.'); }
  };
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };
  if (!data) return <p className="dash-empty">{err || 'Loading…'}</p>;

  // The one button that is actually yours to press, by stage and by side.
  const move = (b) => {
    if (b.stage === 'REQUESTED' && b.role === 'provider') return ['Take it', () => apiGigAgree(b.bookingId)];
    if (b.stage === 'SECURED' && b.role === 'provider') return ['Done — I worked it', () => apiGigWorked(b.bookingId)];
    if (b.stage === 'WORKED' && b.role === 'client') return ['They did it', () => apiGigVerify(b.bookingId)];
    return null;
  };
  const waiting = (b) => {
    if (b.stage === 'REQUESTED') return b.role === 'client' ? 'Waiting on them' : null;
    if (b.stage === 'AGREED') return 'Waiting on the venue to secure it';
    if (b.stage === 'SECURED') return b.role === 'client' ? 'Booked — waiting on the work' : null;
    if (b.stage === 'WORKED') return b.role === 'provider' ? 'Waiting on them to confirm' : null;
    if (b.stage === 'VERIFIED') return 'Confirmed — waiting on the payout';
    return null;
  };

  const open = (shop?.listings || []).filter((l) => !l.mine);

  return (
    <>
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      <p className="earn-note">
        A booking holds a slot. Whoever is doing the work puts down a stake, and it
        comes straight back when the job is confirmed. It is not an investment and
        it does not earn anybody anything — it is there so a booking means something.
      </p>

      <div className="give-list">
        <h4>Book somebody</h4>
        {open.length === 0 && <p className="dash-empty">Nobody is offering work yet.</p>}
        {open.map((l) => (
          <div key={l.listingId} className="give-row">
            <div className="dash-info">
              <strong>{l.title}</strong>
              <span className="dash-num">{l.seller}{l.trade ? ` · ${l.trade}` : ''} · {MONEY(l.priceCents)}</span>
            </div>
            <button type="button" className="bingo-btn compact" disabled={busy}
                    onClick={() => { setBook(book?.listingId === l.listingId ? null : l); setWhen(''); }}>
              {book?.listingId === l.listingId ? 'Cancel' : 'Book'}
            </button>
          </div>
        ))}
      </div>

      {book && (
        <div className="jub-form">
          <label className="jub-label">When do you need {book.title.toLowerCase()}?</label>
          <input className="jub-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          <p className="earn-keep">
            {MONEY(book.priceCents)} · you put down {MONEY(Math.round(book.priceCents * 0.25))} to hold it,
            and it counts toward the price rather than sitting on top of it.
          </p>
          <button type="button" className="bingo-btn gold" disabled={busy || !when}
                  onClick={() => act(async () => {
                    await apiGigRequest({ listingId: book.listingId, startsAt: new Date(when).getTime() });
                    setBook(null); setWhen('');
                  })}>
            {busy ? 'Asking…' : 'Ask for it'}
          </button>
        </div>
      )}

      <div className="give-list">
        <h4>Your bookings</h4>
        {data.bookings.length === 0 && <p className="dash-empty">Nothing booked either way yet.</p>}
        {data.bookings.map((b) => {
          const m = move(b);
          const w = waiting(b);
          return (
            <div key={b.bookingId} className={`give-row${b.stage === 'SETTLED' ? ' done' : ''}${b.yourMove ? ' mine' : ''}`}>
              <div className="dash-info">
                <strong>{b.title}</strong>
                <span className="dash-num">
                  {b.role === 'provider' ? 'You are doing it' : 'You booked it'} · {MONEY(b.priceCents)}
                  {b.role === 'provider' && b.stakeCents > 0 && ` · stake ${MONEY(b.stakeCents)}`}
                </span>
                {/* What actually happened to the money, once it has. */}
                {b.settlement && (
                  <span className="dash-num">
                    {b.role === 'provider' ? `You got ${MONEY(b.settlement.toProvider)}` : `Back to you ${MONEY(b.settlement.toClient)}`}
                    {b.settlement.stakeForfeited > 0 && ' · stake lost'}
                  </span>
                )}
                {b.failureLabel && <span className="dash-num">{b.failureLabel}</span>}
                {w && !m && <span className="dash-num">{w}</span>}
              </div>
              {m
                ? <button type="button" className="bingo-btn compact gold" disabled={busy}
                          onClick={() => act(m[1])}>{m[0]}</button>
                : <span className={`jub-chip${b.stage === 'SETTLED' ? ' ok' : ''}`}>{b.stageLabel}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// A creator's desk, and the shop it sells into.
//
// The rule this whole tab exists to make obvious: a licence is a grant of use,
// not a sale of the work. The same recording can be licensed a hundred times
// and the person who made it still owns it at the end. That is stated on the
// screen and not just in the terms, because the buyout is what most people in
// this room have been offered before and it is the thing worth refusing.
function LicenseTab() {
  const [view, setView] = useState('shop');
  const [terms, setTerms] = useState(null);
  const [mine, setMine] = useState(null);
  const [market, setMarket] = useState(null);
  const [held, setHeld] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [work, setWork] = useState(null);       // which of my works I am offering on
  const [offer, setOffer] = useState({ type: 'SYNC', scope: 'LOCAL', term: 'ONE_YEAR', exclusive: false, amount: '', credit: true });
  const [reg, setReg] = useState({ title: '', kind: 'PERFORMANCE', hash: '', file: '' });

  const load = async () => {
    try {
      const [t, m, k, h] = await Promise.all([apiLicenseTerms(), apiLicenseMine(), apiLicenseMarket(), apiLicenseHeld()]);
      setTerms(t); setMine(m); setMarket(k); setHeld(h); setErr('');
    } catch (e) { setErr(e.message || 'Could not load.'); }
  };
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  // The file is hashed here, on the phone. It is never uploaded — what the
  // registry holds is a fingerprint, so registering a track does not hand
  // anybody the track.
  const hashFile = async (file) => {
    if (!file) return;
    setErr('');
    try {
      const buf = await file.arrayBuffer();
      const d = await crypto.subtle.digest('SHA-256', buf);
      const hex = Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
      setReg((r) => ({ ...r, hash: `sha256:${hex}`, file: file.name, title: r.title || file.name.replace(/\.[^.]+$/, '') }));
    } catch { setErr('Could not read that file.'); }
  };

  if (!terms || !mine) return <p className="dash-empty">{err || 'Loading…'}</p>;

  const cents = Math.round(Number(offer.amount) * 100);
  const VIEWS = [['shop', 'Shop'], ['desk', 'Your works'], ['held', 'You hold']];

  return (
    <>
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      <p className="earn-note">
        A licence sells the <b>use</b> of something you made. You still own it afterwards,
        and you can license it again to somebody else. Nobody buys it out from under you here.
      </p>
      <div className="staff-hub-tabs">
        {VIEWS.map(([id, label]) => (
          <button type="button" key={id} className={`staff-hub-tab${view === id ? ' on' : ''}`}
                  onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === 'shop' && (
        <div className="give-list">
          <h4>Licences for sale</h4>
          {(market?.offers || []).filter((o) => !o.mine).length === 0 && (
            <p className="dash-empty">Nothing on offer yet.</p>
          )}
          {(market?.offers || []).filter((o) => !o.mine).map((o) => (
            <div key={o.offerId} className="lic-card">
              <div className="lic-head">
                <div className="dash-info">
                  <strong>{o.work.title}</strong>
                  <span className="dash-num">{o.creator} · {o.work.kindLabel}</span>
                </div>
                <b className="lic-price">{MONEY(o.priceCents)}</b>
              </div>
              <p className="lic-grants">{o.grants}</p>
              <div className="lic-tags">
                <span className="onb-tag">{o.typeLabel}</span>
                <span className="onb-tag alt">{o.scopeLabel}</span>
                <span className="onb-tag alt">{o.termLabel}</span>
                {o.exclusive && <span className="onb-tag">Exclusive</span>}
              </div>
              {o.note && <p className="jub-note">{o.note}</p>}
              <button type="button" className="bingo-btn compact gold" disabled={busy}
                      onClick={() => act(() => apiLicenseBuy(o.offerId))}>Buy this licence</button>
            </div>
          ))}
        </div>
      )}

      {view === 'desk' && (
        <>
          {mine.earnedCents > 0 && (
            <div className="earn-total"><span>Earned licensing</span><b>{MONEY(mine.earnedCents)}</b></div>
          )}

          <div className="jub-form">
            <label className="jub-label">Register something you made</label>
            <input className="jub-input" type="file" onChange={(e) => hashFile(e.target.files?.[0])} />
            {reg.hash && <p className="jub-note">{reg.file} · fingerprinted on this phone. The file itself does not leave it.</p>}
            <input className="jub-input" placeholder="What is it called?" maxLength={80} value={reg.title}
                   onChange={(e) => setReg((r) => ({ ...r, title: e.target.value }))} />
            <select className="jub-input" value={reg.kind} onChange={(e) => setReg((r) => ({ ...r, kind: e.target.value }))}>
              {terms.workKinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <button type="button" className="bingo-btn" disabled={busy || !reg.hash || reg.title.trim().length < 2}
                    onClick={() => act(async () => {
                      await apiRegisterWork({ contentHash: reg.hash, kind: reg.kind, title: reg.title.trim(),
                                              song: reg.title.trim(), performedAt: Date.now() });
                      setReg({ title: '', kind: 'PERFORMANCE', hash: '', file: '' });
                    })}>
              {busy ? 'Registering…' : 'Register it'}
            </button>
          </div>

          <div className="give-list">
            <h4>Your works</h4>
            {mine.works.length === 0 && <p className="dash-empty">Register something and you can start licensing it.</p>}
            {mine.works.map((w) => (
              <div key={w.assetId} className="lic-card">
                <div className="lic-head">
                  <div className="dash-info">
                    <strong>{w.title}</strong>
                    <span className="dash-num">{w.kindLabel} · {w.granted.length} licensed</span>
                  </div>
                  <button type="button" className="bingo-btn compact" disabled={busy}
                          onClick={() => setWork(work === w.assetId ? null : w.assetId)}>
                    {work === w.assetId ? 'Close' : 'License it'}
                  </button>
                </div>

                {w.offers.map((o) => (
                  <div key={o.offerId} className="give-row">
                    <div className="dash-info">
                      <strong>{o.typeLabel} · {MONEY(o.priceCents)}</strong>
                      <span className="dash-num">{o.scopeLabel} · {o.termLabel}{o.exclusive ? ' · exclusive' : ''}</span>
                    </div>
                    <button type="button" className="bingo-btn compact ghost" disabled={busy}
                            onClick={() => act(() => apiLicenseWithdraw(o.offerId))}>Withdraw</button>
                  </div>
                ))}
                {w.granted.map((g) => (
                  <div key={g.grantId} className={`give-row${g.status === 'GRANTED' ? ' done' : ''}`}>
                    <div className="dash-info">
                      <strong>{g.buyer}</strong>
                      <span className="dash-num">{g.typeLabel} · {MONEY(g.priceCents)}</span>
                    </div>
                    <span className={`jub-chip${g.status === 'GRANTED' ? ' ok' : ''}`}>
                      {g.status === 'PENDING' ? 'Pending — not settled' : g.status}
                    </span>
                  </div>
                ))}

                {work === w.assetId && (
                  <div className="jub-form">
                    <select className="jub-input" value={offer.type}
                            onChange={(e) => setOffer((o) => ({ ...o, type: e.target.value }))}>
                      {terms.types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    {/* What this particular licence actually lets somebody do, in
                        words, before the creator prices it. */}
                    <p className="jub-note">{terms.types.find((t) => t.id === offer.type)?.grants}</p>
                    {terms.types.find((t) => t.id === offer.type)?.neverImplied && (
                      <p className="k-nudge k-nudge--no">
                        This one has to be chosen on purpose. It is never included in any other licence.
                      </p>
                    )}
                    <div className="jub-step jub-step--wrap">
                      <select className="jub-input" value={offer.scope}
                              onChange={(e) => setOffer((o) => ({ ...o, scope: e.target.value }))}>
                        {terms.scopes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <select className="jub-input" value={offer.term}
                              onChange={(e) => setOffer((o) => ({ ...o, term: e.target.value }))}>
                        {terms.terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <input className="jub-input" inputMode="decimal" placeholder="0.00" value={offer.amount}
                             onChange={(e) => setOffer((o) => ({ ...o, amount: e.target.value }))} />
                    </div>
                    <label className="jub-check">
                      <input type="checkbox" checked={offer.exclusive}
                             onChange={(e) => setOffer((o) => ({ ...o, exclusive: e.target.checked }))} />
                      <span>Only them — nobody else gets this licence while it runs</span>
                    </label>
                    <label className="jub-check">
                      <input type="checkbox" checked={offer.credit}
                             onChange={(e) => setOffer((o) => ({ ...o, credit: e.target.checked }))} />
                      <span>They have to credit you</span>
                    </label>
                    <button type="button" className="bingo-btn gold" disabled={busy || !(cents > 0)}
                            onClick={() => act(async () => {
                              await apiLicenseOffer({ assetId: w.assetId, type: offer.type, scope: offer.scope,
                                                      term: offer.term, exclusive: offer.exclusive,
                                                      priceCents: cents, credit: offer.credit });
                              setOffer((o) => ({ ...o, amount: '' })); setWork(null);
                            })}>
                      {busy ? 'Putting it up…' : 'Put it up'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'held' && (
        <div className="give-list">
          <h4>Licences you hold</h4>
          {(held?.licenses || []).length === 0 && <p className="dash-empty">You have not licensed anything yet.</p>}
          {(held?.licenses || []).map((g) => (
            <div key={g.grantId} className="lic-card">
              <div className="lic-head">
                <div className="dash-info">
                  <strong>{g.work.title}</strong>
                  <span className="dash-num">by {g.creator} · {MONEY(g.priceCents)}</span>
                </div>
                <span className={`jub-chip${g.active ? ' ok' : ''}`}>
                  {g.status === 'PENDING' ? 'Pending — not settled' : g.active ? 'Live' : 'Expired'}
                </span>
              </div>
              <div className="lic-tags">
                <span className="onb-tag">{g.typeLabel}</span>
                {g.exclusive && <span className="onb-tag alt">Exclusive</span>}
              </div>
              {/* The terms, verbatim, in the buyer's hands. A licence nobody can
                  read is a licence nobody can rely on — and the two lines the
                  server puts on EVERY licence are the two that decide whether
                  somebody has been taken advantage of: who still owns it, and
                  whether a model may be trained on it. */}
              {g.terms?.grants && <p className="lic-grants">{g.terms.grants}</p>}
              {g.terms?.scopeLabel && (
                <p className="jub-note">
                  {g.terms.scopeLabel} · {g.terms.termLabel}
                  {g.terms.credit ? ' · you must credit the creator' : ''}
                </p>
              )}
              {g.terms?.ownership && <p className="jub-note">{g.terms.ownership}</p>}
              {g.terms?.aiTraining && <p className="jub-note">{g.terms.aiTraining}</p>}
              <p className="lic-hash">{g.termsHash}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// Getting paid for who you bring.
//
// Pays on money that actually arrived, never on a signup — otherwise the way to
// win is to produce accounts rather than people, and this room fills with names
// that never walk through the door.
function BringTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiReferral().then(setData).catch((e) => setErr(e.message || 'Could not load.'));
  }, []);
  if (!data) return <p className="dash-empty">{err || 'Loading…'}</p>;

  // The link carries BOTH: which room to join, and who brought them. Without
  // the venue a stranger lands on a door with a room list; without the code the
  // promoter did the work for nothing.
  const link = `${location.origin}${import.meta.env.BASE_URL}`
    + `?connect=${encodeURIComponent(apiBase())}&ref=${data.code}`;

  return (
    <>
      <div className="ref-code">
        <i>Your code</i>
        <b>{data.code}</b>
        <button type="button" className="bingo-btn compact"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
                  catch { setCopied(false); }
                }}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      {/* Said as the thing it actually is: a share of the membership THEY take.
          A percentage of "what they spend" is vague enough to be a disappointment
          later, and this is the number somebody will repeat to a friend. */}
      <p className="earn-note">
        Give this code to anybody. When they join on it you get <b>{Math.round(data.ratePercent * 100)}%</b> of
        the membership they take — every time, whichever tier they choose. {data.note}
      </p>

      <div className="jub-reserve">
        <span><i>Brought</i><b>{data.brought}</b></span>
        <span><i>Owed you</i><b>{MONEY(data.earnedCents)}</b></span>
        <span><i>Paid out</i><b>{MONEY(data.paidCents)}</b></span>
      </div>

      <div className="give-list">
        <h4>What you have earned</h4>
        {data.credits.length === 0 && <p className="dash-empty">Nothing yet. It starts when somebody you brought spends.</p>}
        {data.credits.map((k) => (
          <div key={k.creditId} className={`give-row${k.status === 'PAID' ? ' done' : ''}`}>
            <div className="dash-info">
              <strong>{MONEY(k.commissionCents)}</strong>
              <span className="dash-num">{k.eventLabel} · on {MONEY(k.grossCents)}</span>
            </div>
            <span className={`jub-chip${k.status === 'PAID' ? ' ok' : ''}`}>{k.status}</span>
          </div>
        ))}
      </div>
    </>
  );
}
// ── Giving, and asking for a seat ──────────────────────────────────────────
//
// The two things a member can actually do about a programme. Neither happens to
// them: playing bingo is not a donation, and nobody is put on a board for
// turning up. Both are asked for and both are answered by a named person.
//
// They sit on one screen because they are the same decision seen from two
// sides — what can I give this, in money or in work.
function ProgramActions({ onDone }) {
  const [tab, setTab] = useState('give');
  const [b, setB] = useState(null);
  const [mineGifts, setMineGifts] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [gift, setGift] = useState({ program: '', amount: '', rail: 'cash', note: '' });
  const [seat, setSeat] = useState({ program: '', position: '', brings: '' });

  const load = async () => {
    try {
      const [board, mine] = await Promise.all([apiBoard(), apiMyDonations()]);
      setB(board); setMineGifts(mine.donations || []); setErr('');
    } catch (e) { setErr(e.message || 'Could not load the programmes.'); }
  };
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); }
    catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  if (!b && !err) return <AppPanel title="Programmes" subtitle="Give or serve"><p className="dash-empty">Loading…</p></AppPanel>;
  if (!b) {
    return (
      <AppPanel title="Programmes" subtitle="Give or serve">
        <p className="k-nudge k-nudge--no">{err}</p>
        <button type="button" className="bingo-btn compact ghost" onClick={load}>Try again</button>
      </AppPanel>
    );
  }

  const cents = Math.round(Number(gift.amount) * 100);
  const chosen = b.programs.find((p) => p.id === seat.program);
  const open = b.openApplication;

  return (
    <AppPanel title="Programmes" subtitle="Give or serve">
      {err && <p className="k-nudge k-nudge--no">{err}</p>}

      <p className="prog-lead">
        Playing here gives a programme nothing and costs it nothing. These are the two ways to
        actually put something in.
      </p>

      {/* What they already hold. A seat is the strongest thing on this screen. */}
      {b.seats?.length > 0 && (
        <div className="seat-mine">
          {b.seats.map((s2) => (
            <div key={`${s2.program}-${s2.position}`}>
              <strong>{s2.positionLabel}</strong>
              <span>{s2.programLabel} · since {fmtDate(s2.since)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="staff-hub-tabs prog-tabs">
        <button type="button" className={`staff-hub-tab${tab === 'give' ? ' on' : ''}`} onClick={() => setTab('give')}>Give</button>
        <button type="button" className={`staff-hub-tab${tab === 'serve' ? ' on' : ''}`} onClick={() => setTab('serve')}>Serve on a board</button>
      </div>

      {tab === 'give' && (
        <div className="jub-form">
          <label className="jub-label">Which cause?</label>
          <div className="jub-kinds">
            {b.programs.map((p) => (
              <button type="button" key={p.id}
                      className={`jub-kind${gift.program === p.id ? ' on' : ''}`}
                      onClick={() => setGift((g) => ({ ...g, program: p.id }))}>
                {p.label}
              </button>
            ))}
          </div>

          <label className="jub-label" htmlFor="give-amt">How much?</label>
          <input id="give-amt" className="jub-input" inputMode="decimal" placeholder="0.00"
                 value={gift.amount} onChange={(e) => setGift((g) => ({ ...g, amount: e.target.value }))} />

          <label className="jub-label" htmlFor="give-rail">How are you paying?</label>
          <select id="give-rail" className="jub-input" value={gift.rail}
                  onChange={(e) => setGift((g) => ({ ...g, rail: e.target.value }))}>
            <option value="cash">Cash at the door</option>
            <option value="zelle">Zelle</option>
            <option value="card">Card</option>
          </select>

          <label className="jub-label" htmlFor="give-note">Anything to say with it? (optional)</label>
          <input id="give-note" className="jub-input" placeholder="In memory of, for the pantry run…"
                 value={gift.note} onChange={(e) => setGift((g) => ({ ...g, note: e.target.value }))} />

          <button type="button" className="bingo-btn gold"
                  disabled={busy || !gift.program || !(cents > 0)}
                  onClick={() => act(async () => {
                    await apiDonate(gift.program, cents, gift.rail, gift.note);
                    setGift({ program: '', amount: '', rail: 'cash', note: '' });
                  })}>
            {busy ? 'Sending…' : 'Give to this cause'}
          </button>
          {/* §41 in the member's own words. A pledge is a promise, not money. */}
          <p className="mem-fineprint">
            Nothing moves until somebody at the door confirms the money arrived. You will see it
            change from pledged to received here.
          </p>

          {mineGifts.length > 0 && (
            <div className="give-list">
              <h4>What you have given</h4>
              {mineGifts.map((g) => (
                <div key={g.donationId} className={`give-row${g.status === 'RECEIVED' ? ' done' : ''}`}>
                  <div className="dash-info">
                    <strong>{g.label}</strong>
                    <span className="dash-num">{MONEY(g.amountCents)} · {g.rail}</span>
                  </div>
                  <span className={`jub-chip${g.status === 'RECEIVED' ? ' ok' : ''}`}>
                    {g.status === 'RECEIVED' ? '✓ Received' : g.status === 'DECLINED' ? 'Declined' : 'Pledged'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'serve' && (open ? (
        <div className="jub-open">
          <strong>Waiting on the board</strong>
          <span>
            {b.programs.find((p) => p.id === open.program)?.label} ·{' '}
            {b.positions.find((p) => p.id === open.position)?.label}
          </span>
          <small>&ldquo;{open.brings}&rdquo;</small>
          <p className="mem-fineprint">One at a time. This one has to be answered first.</p>
        </div>
      ) : (
        <div className="jub-form">
          <label className="jub-label">Which programme?</label>
          <div className="jub-kinds">
            {b.programs.map((p) => (
              <button type="button" key={p.id}
                      className={`jub-kind${seat.program === p.id ? ' on' : ''}`}
                      onClick={() => setSeat((v) => ({ ...v, program: p.id, position: '' }))}>
                {p.label} <i>{p.openSeats} open</i>
              </button>
            ))}
          </div>

          {chosen && (
            <>
              <label className="jub-label">Which seat?</label>
              <div className="seat-grid">
                {chosen.board.map((pos) => (
                  <button type="button" key={pos.id} disabled={!!pos.heldBy}
                          className={`seat-card${seat.position === pos.id ? ' on' : ''}${pos.heldBy ? ' taken' : ''}`}
                          onClick={() => setSeat((v) => ({ ...v, position: pos.id }))}>
                    <strong>{pos.label}</strong>
                    <span className="seat-duty">{pos.duty}</span>
                    {/* Who holds it, by name — a board nobody can see is not one. */}
                    <span className="seat-who">{pos.heldBy ? `Held by ${pos.heldBy}` : 'Open'}</span>
                  </button>
                ))}
              </div>

              <label className="jub-label" htmlFor="seat-brings">What do you bring to the table?</label>
              <textarea id="seat-brings" className="jub-input jub-textarea" rows={4}
                        placeholder="The work you would actually do, and why you can do it. This is what the board decides on."
                        value={seat.brings} onChange={(e) => setSeat((v) => ({ ...v, brings: e.target.value }))} />

              <button type="button" className="bingo-btn gold"
                      disabled={busy || !seat.position || seat.brings.trim().length < 20}
                      onClick={() => act(async () => {
                        await apiBoardApply(seat.program, seat.position, seat.brings.trim());
                        setSeat({ program: '', position: '', brings: '' });
                      })}>
                {busy ? 'Sending…' : 'Apply for this seat'}
              </button>
              <p className="mem-fineprint">
                The board reads what you wrote and answers by name. Nothing is promised.
              </p>
            </>
          )}
        </div>
      ))}

      {onDone && <button type="button" className="bingo-btn ghost" onClick={onDone}>← Back</button>}
    </AppPanel>
  );
}

// ── The team ───────────────────────────────────────────────────────────────
//
// The venue ran on two shared codes, which meant every door check and every
// approval was signed "staff-device", removing one person meant changing the
// code for everybody, and a release could never depend on three people because
// the venue only had two identities to draw on.
//
// The whole replacement is: type a name, tap Add, show them the QR. No email,
// no password, no account for either of you to recover. What the QR carries is
// a single-use code that dies in fifteen minutes, so a photo of it in somebody's
// camera roll is worth nothing by the end of the shift.
function TeamScreen() {
  const [q, setQ] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [invite, setInvite] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = async () => {
    try { setQ(await apiStaffRoster()); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load the team.'); }
  };
  useEffect(() => { load(); }, []);
  // While a code is on screen two things have to move: the countdown, and the
  // roster. The owner is holding this phone up to somebody else's — without a
  // refresh they have no way to know the scan worked, and the natural thing to
  // do about that is generate a second code, which invalidates nothing and
  // helps nobody. Polling stops the moment the code is put away.
  useEffect(() => {
    if (!invite) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(load, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [invite]);

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { const r = await fn(); await load(); return r; }
    catch (e) { setErr(e.message || 'That did not go through.'); return null; }
    finally { setBusy(false); }
  };

  if (!q && !err) return <AppPanel title="Team" subtitle="Who works here"><p className="dash-empty">Loading…</p></AppPanel>;
  if (!q) {
    return (
      <AppPanel title="Team" subtitle="Who works here">
        <p className="k-nudge k-nudge--no">{err}</p>
        <button type="button" className="bingo-btn compact ghost" onClick={load}>Try again</button>
      </AppPanel>
    );
  }

  // The owner runs the team. A second host runs the night — the server refuses
  // them either way, so the screen simply does not offer what they cannot do.
  const mine = !!q.you?.admin || !!q.you?.bootstrap;
  const left = invite ? Math.max(0, invite.expiresAt - now) : 0;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  const live = q.team.filter((t) => !t.disabled);

  return (
    <>
      <AppPanel title="Team" subtitle="Who works here">
        {err && <p className="k-nudge k-nudge--no">{err}</p>}

        {/* Who this phone is. The distinction is not cosmetic — see the nudge. */}
        <div className="team-you">
          <span>Signed in as</span>
          <strong>{q.you?.named ? q.you.name : 'Shared venue code'}</strong>
          <em>{q.you?.role === 'host' ? 'Host' : 'Door'}</em>
        </div>
        {/* The venue's very first tap. Nobody has an account yet, so this is the
            owner giving themselves one — and it is the only thing the shared
            code can do on this screen. */}
        {q.you?.bootstrap && (
          <p className="k-nudge">
            <b>Start here.</b> Add yourself as <b>Host</b>, scan the code with this same phone,
            and you are the owner of this venue. After that only you can add or remove anybody.
          </p>
        )}
        {!q.you?.named && !q.you?.bootstrap && (
          <p className="k-nudge">
            A shared code runs the night — door, check-ins, the game. It cannot approve money,
            because &ldquo;the venue code&rdquo; approving twice is one person approving twice.
            {q.owner ? ` Ask ${q.owner} for your own code.` : ''}
          </p>
        )}

        {/* How many different people could sign off on a release. This number is
            the whole reason the screen exists, so it is stated rather than
            implied by counting rows. */}
        <p className="mem-fineprint">
          {q.namedApprovers === 0
            ? 'Nobody has their own sign-in yet. A release from the community reserve needs at least two different people, so it cannot happen until you add some.'
            : q.namedApprovers === 1
              ? 'One person has their own sign-in. A release needs at least two different people, so add one more.'
              : `${q.namedApprovers} people have their own sign-in, so a release can be set to need up to ${q.namedApprovers} of them.`}
        </p>

        {mine && !invite && (
          <div className="team-add">
            <label className="jub-label" htmlFor="team-name">Add somebody</label>
            <div className="jub-step jub-step--wrap">
              <input id="team-name" className="jub-input" placeholder="Their name" value={name}
                     maxLength={40} onChange={(e) => setName(e.target.value)} />
              <select className="jub-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="staff">Door</option>
                <option value="host">Host</option>
              </select>
              <button type="button" className="bingo-btn compact gold" disabled={busy || name.trim().length < 2}
                      onClick={async () => {
                        const r = await act(() => apiStaffInvite(name.trim(), role));
                        if (r?.code) { setInvite(r); setNow(Date.now()); setName(''); }
                      }}>
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
            <p className="mem-fineprint">
              Use the name people would say on a shift. It is what shows up next to every
              approval they make.
            </p>
          </div>
        )}

        {/* The handover. One screen, held up to another phone. */}
        {invite && (
          <div className="team-invite">
            <strong>
              {invite.admin
                ? `${invite.name} becomes the owner of this venue`
                : `${invite.name} joins as ${invite.role === 'host' ? 'Host' : 'Door'}`}
            </strong>
            <TeamInviteQr code={invite.code} />
            <span className="team-code">{invite.code}</span>
            {q.team.find((t) => t.staffId === invite.staffId)?.claimed ? (
              <small className="team-got-it">✓ {invite.name} is in. You can put this away.</small>
            ) : left > 0 ? (
              <small>Scan it, or type it into <b>Team Access</b> on their phone. Expires in {mmss}.</small>
            ) : (
              <small className="team-dead">This code has expired — add them again for a fresh one.</small>
            )}
            <button type="button" className="bingo-btn compact ghost" onClick={() => { setInvite(null); load(); }}>Done</button>
          </div>
        )}

        {live.map((t) => (
          <div key={t.staffId} className="dash-row team-row">
            <div className="dash-info">
              <strong>{t.name}</strong>
              <span className="dash-num">
                {t.admin ? 'Owner' : t.role === 'host' ? 'Host' : 'Door'}
                {t.claimed ? ` · last on ${fmtDateTime(t.lastSeen)}` : t.inviteOpen ? ' · code not used yet' : ' · never signed in'}
              </span>
            </div>
            {/* Two taps, and the second one says what happens. Removing somebody
                takes effect on their very next tap, not when their session
                lapses — so it is not a thing to do by brushing the screen. */}
            {mine && !t.admin && t.staffId !== q.you?.id && (
              confirm === t.staffId ? (
                <div className="team-confirm">
                  <button type="button" className="mem-cancel" disabled={busy}
                          onClick={() => act(() => apiStaffRemove(t.staffId)).then(() => setConfirm(null))}>
                    Remove {t.name} now
                  </button>
                  <button type="button" className="bingo-btn compact ghost" onClick={() => setConfirm(null)}>Keep</button>
                </div>
              ) : (
                <button type="button" className="bingo-btn compact ghost" onClick={() => setConfirm(t.staffId)}>Remove</button>
              )
            )}
          </div>
        ))}
      </AppPanel>

      {/* Whether a member can be reached at all. It lives here because it is
          the same job as the roster — who is allowed in, and how the venue
          knows they are who they say. Only the owner sees this screen. */}
      <SignInSetupPanel />

      {/* And how anybody finds the room in the first place: a code to post,
          rather than a link to hand out. */}
      <PosterScreen />
    </>
  );
}

// The invite QR. `HVAS-STAFF:` prefixed so the venue scanner can tell a staff
// invite from a member pass without guessing at the payload.
function TeamInviteQr({ code }) {
  const qr = useQrDataUrl(`HVAS-STAFF:${code}`, ui.fullLogoClear);
  return qr
    ? <img className="team-qr" src={qr} alt={`Invite code ${code}`} />
    : <div className="qr-load">QR…</div>;
}

// Being handed the mic.
//
// A LIP SYNC square is the one thing on the card you cannot win by tapping, and
// when one of yours is called the app is not marking a square — it is putting a
// microphone in somebody's hand in a room full of people and asking whether
// they are going to do it. That deserves to arrive like an event, so it does:
// the mic comes up out of the card, turns over, and lands in their face.
//
// Yes or no, and nothing else on screen. Passing gives the square up for good,
// which is why the answer is a decision and not a dismissal.
function MicOffer({ artist, song, endsAt, forced = false, votes = 0, voters = 0, onAnswer }) {
  // The offer is not open-ended, because the SONG is not. You are being handed
  // a mic while the record is playing — decide before it runs out and it is
  // yours to perform, let it run out and it goes the same way as saying no.
  // That is also what stops this being a modal somebody can sit behind: the
  // round is held while it is up, so without a deadline a player could park the
  // whole game here forever.
  const [left, setLeft] = useState(() => Math.max(0, (endsAt || 0) - Date.now()));
  // Letting the clock run out is refusing. Held in a ref so the interval below
  // never closes over a stale handler.
  const passRef = useRef(onAnswer);
  passRef.current = onAnswer;
  useEffect(() => {
    if (!endsAt) return undefined;
    const tick = () => {
      const ms = Math.max(0, endsAt - Date.now());
      setLeft(ms);
      if (ms <= 0) passRef.current?.('refuse');
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [endsAt]);
  // The window this offer opened with. Lazy state, and the parent gives each
  // offer its own key, so it is captured once per offer and never recomputed.
  const [total] = useState(() => Math.max(1, (endsAt || 0) - Date.now()));
  const secs = Math.ceil(left / 1000);
  const urgent = left > 0 && left <= 5000;

  return (
    <div className="mic-offer" role="dialog" aria-modal="true" aria-label={`You have been called out to perform ${artist} — ${song}`}>
      <div className={`mic-offer-scene${urgent ? ' urgent' : ''}`} aria-hidden="true">
        {/* The ring is the song draining. It is drawn around the mic rather than
            put somewhere else on screen, so the thing running out and the thing
            being offered are one object. */}
        <MicArt className="mic-offer-mic" progress={endsAt ? Math.max(0, Math.min(1, left / total)) : null} />
        <i className="mic-spark s1" /><i className="mic-spark s2" /><i className="mic-spark s3" />
        <i className="mic-spark s4" /><i className="mic-spark s5" /><i className="mic-spark s6" />
      </div>
      <strong className={`mic-offer-title${forced ? ' forced' : ''}`}>
        {forced ? 'Room says sing' : 'It\u2019s yours'}
      </strong>
      <span className="mic-offer-song">{artist} — {song}</span>
      {!!endsAt && <span className={`mic-offer-clock${urgent ? ' urgent' : ''}`}>{secs}s to decide</span>}

      {/* The vote, while it is happening. This is the tension: the square is
          free until enough of the people who do NOT have it decide it should
          not be, and you are watching that land while your clock runs. */}
      {voters > 0 && (
        <div className={`mic-vote${forced ? ' forced' : ''}`}>
          <span className="mic-vote-bar">
            <i style={{ width: `${Math.round((votes / voters) * 100)}%` }} />
          </span>
          <span className="mic-vote-label">
            {forced ? `${votes} of ${voters} forced it — you have to perform`
                    : `${votes} of ${voters} want you to sing for it`}
          </span>
        </div>
      )}

      <p className="mic-offer-fine">
        {forced
          ? 'They voted. Perform it, or they block you and the square is gone.'
          : 'Take it without performing — unless enough of them vote to make you sing.'}
      </p>
      <div className="mic-offer-buttons">
        {forced ? (
          <>
            <button type="button" className="mic-yes" onClick={() => onAnswer('perform')}>🎤 Perform it</button>
            <button type="button" className="mic-no" onClick={() => onAnswer('refuse')}>Refuse</button>
          </>
        ) : (
          <>
            <button type="button" className="mic-yes" onClick={() => onAnswer('take')}>✋ Take the square</button>
            <button type="button" className="mic-perform" onClick={() => onAnswer('perform')}>🎤 Perform anyway</button>
            <button type="button" className="mic-no" onClick={() => onAnswer('refuse')}>Pass</button>
          </>
        )}
      </div>
    </div>
  );
}

// Solo's music, and solo's clock — they are the same thing.
//
// The rule the venue plays by: a performance runs exactly as long as the clip
// that plays. Not a fixed timer somebody set. The clip is the tail of a verse
// into the hook, which is the part of a record a room knows, and when it ends
// the take ends. No YouTube, no game — a lip sync round with no song is not a
// harder version of the game, it is a different game.
//
// The venue backend resolves each call to a real video with its own key and
// hands every phone the window. Solo has no backend — that is the point of it —
// so it does the same job here: the IFrame player takes a SEARCH instead of an
// id (listType 'search'), which needs no key and no quota, and the duration
// comes back off the player itself. clipWindowFor is the venue's own rule,
// generated into the bundle, so both sides cut a song identically.
//
// One player for the whole round, mounted above the card/battle split, so
// walking onto the battle stage does not restart the song you are performing to.
function useSoloPlayer({ item, armed, paused }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [status, setStatus] = useState('idle');   // idle | loading | playing | error
  const [clip, setClip] = useState(null);         // { start, seconds } for the current song
  const startedRef = useRef(null);                // item id we have already cued the window for
  // The player object exists the moment YT.Player() returns, but it cannot be
  // driven until onReady fires — loadVideoById before that is a silent no-op.
  // This is state and not a ref on purpose: the effect that loads each song has
  // to RE-RUN when the player becomes usable, and a ref cannot wake it.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    let live = true;
    setStatus('loading');
    loadYoutubeApi().then(() => {
      if (!live || !hostRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1 },
        events: {
          onReady: (e) => { if (!live) return; e.target.unMute?.(); e.target.setVolume?.(100); setReady(true); },
          onError: () => live && setStatus('error'),
          onStateChange: (e) => {
            if (!live) return;
            if (e.data === window.YT?.PlayerState?.PLAYING) {
              setStatus('playing');
              // The duration is only real once something is actually playing.
              // Cut to the venue's window the first time we see this song.
              const p = e.target;
              const dur = Number(p.getDuration?.() || 0);
              // startedRef is the song the load effect last cued. Comparing it
              // against `item` here does not work and quietly disabled the cut
              // for a while: this handler is created once, when the player is
              // built, so it closes over the `item` of that moment — which is
              // null, because nothing has been called yet. The ref is the whole
              // point of the ref.
              const key = startedRef.current;
              if (key && !key.cued && dur > 0) {
                const win = soloClipWindow(dur, SOLO_FALLBACK_CLIP_SECONDS);
                key.cued = true;
                key.clip = win;
                setClip(win);
                try { if (win.start > 1) p.seekTo(win.start, true); } catch { /* fine — play from the top */ }
              }
            }
          },
        },
      });
    }).catch(() => live && setStatus('error'));
    return () => {
      live = false;
      setReady(false);
      try { playerRef.current?.destroy?.(); } catch { /* already gone */ }
      playerRef.current = null;
    };
  }, [armed]);

  // Each call loads that song.
  //
  // This used to be `loadPlaylist({ listType: 'search' })` — hand the player a
  // query and let it find the track, no API key needed. YouTube deprecated
  // search in the IFrame Player API in November 2020 and it no longer returns
  // anything. Crucially it does not throw and it does not fire onError: it
  // simply plays nothing, forever. So the round sat on "Cueing the song", the
  // call loop held waiting for music that could never arrive, and solo shipped
  // with no sound at all while every test passed — because the tests supply
  // their own player, and a stand-in has no reason to reproduce a third party's
  // removed feature.
  //
  // A video id needs no key and no quota, so the deck carries one per song
  // (server/resolve-deck-videos.mjs fills them in). Without an id there is
  // nothing to play, and the watchdog below says so rather than hanging.
  // Waiting on `ready` is what makes the FIRST song of a round play at all.
  // The player is built behind a network fetch of YouTube's API script, and the
  // first square is called 350ms after Start — so this effect used to run with
  // no player yet, return early, and never run again, because `item` never
  // changed afterwards. The round then sat holding for music that was never
  // asked for. Silent, and it looked exactly like YouTube being broken.
  useEffect(() => {
    const p = playerRef.current;
    if (!armed || !ready || !p || !item) return undefined;
    startedRef.current = { id: item.id, cued: false, clip: null };
    setClip(null);
    setStatus('loading');
    try {
      if (item.videoId) p.loadVideoById({ videoId: item.videoId });
      // No id yet for this square. Fall back to the old search call rather than
      // giving up: it is what shipped, and if it works anywhere it is better
      // than silence. It is not expected to — see the note above — so the
      // watchdog below is what actually ends this case, twelve seconds later,
      // with something on screen that explains itself.
      else p.loadPlaylist({ list: `${item.artist} ${item.song}`, listType: 'search', index: 0 });
    } catch { setStatus('error'); return undefined; }
    // Whatever goes wrong — a pulled video, a region block, no signal, another
    // API that quietly stops answering — the round must not wait forever for a
    // song that is not coming. If nothing is playing in twelve seconds, say so.
    const watchdog = setTimeout(() => {
      setStatus((cur) => (cur === 'loading' ? 'error' : cur));
    }, 12000);
    return () => clearTimeout(watchdog);
  }, [armed, ready, item?.id, item?.videoId]);

  // The round holding for a performance does not hold the music — the whole
  // point is that you perform TO the clip. Pausing here is only for when the
  // round itself is over.
  useEffect(() => {
    const p = playerRef.current;
    if (!armed || !ready || !p) return;
    try { paused ? p.pauseVideo?.() : p.playVideo?.(); } catch { /* mid-swap */ }
  }, [armed, ready, paused]);

  /** How much of the current clip is left, in ms. This is the performance
   *  length: the take ends when the clip does. */
  const clipLeftMs = () => {
    const p = playerRef.current;
    const win = startedRef.current?.clip || clip;
    if (!p || !win) return SOLO_FALLBACK_CLIP_SECONDS * 1000;
    let at = 0;
    try { at = Number(p.getCurrentTime?.() || 0); } catch { /* not ready */ }
    const endsAt = (win.start || 0) + win.seconds;
    return Math.max(4000, Math.round((endsAt - at) * 1000));
  };

  return { hostRef, status, clip, clipLeftMs };
}

// Used only when a track's real length is unknown — the same shipped window the
// backend falls back to (BINGO_LIPSYNC_SECONDS).
const SOLO_FALLBACK_CLIP_SECONDS = 120;

const SOLO_STEPS = ['Pick a theme', 'Play'];

// Solo pays nothing, and now says so.
//
// It was printing the venue's real prize table — $5, $10, $25 — on a game
// against three CPU players in an empty room. Nobody was ever going to be paid
// that, which makes it the one thing in the app that lies to a member, on the
// screen they are most likely to try first. The stakes are a record instead:
// rounds are worth stars, and the only thing on the line is your own best.
const SOLO_ROUND_STARS = { 1: 1, 2: 2, 3: 3 };
const SOLO_BEST_KEY = 'hvas_solo_best_v1';

function readSoloBest() {
  try {
    const raw = JSON.parse(localStorage.getItem(SOLO_BEST_KEY) || '{}');
    return { stars: Number(raw.stars) || 0, rounds: Number(raw.rounds) || 0, games: Number(raw.games) || 0 };
  } catch { return { stars: 0, rounds: 0, games: 0 }; }
}
function writeSoloBest(next) {
  try { localStorage.setItem(SOLO_BEST_KEY, JSON.stringify(next)); } catch { /* private mode — the run still counts on screen */ }
}

function SoloBingoGame({ onExit }) {
  const [game, setGame] = useState(null);
  // Solo's only stake. Stars banked this run, and the best run there has been.
  const [best, setBest] = useState(readSoloBest);
  const starsThisRun = game ? [...Array(game.wins || 0)].reduce((n, _, i) => n + (SOLO_ROUND_STARS[i + 1] || 0), 0) : 0;
  // A finished run is a result whether it was won or not, so it is banked
  // either way — a best you can only beat by winning is not a best, it is a
  // trophy case.
  //
  // This lives HERE, above every early return in this component, and must stay
  // here. Below one it is React error #300: the render that takes the early
  // path calls fewer hooks than the one before it, and React does not degrade
  // gracefully — it unmounts the whole app to a white screen. That exact bug
  // has shipped from this file once already.
  const runStatus = game && game.status !== 'playing' && game.status !== 'roundWon' ? game.status : null;
  useEffect(() => {
    if (!runStatus) return;
    setBest((cur) => {
      const next = {
        stars: Math.max(cur.stars, starsThisRun),
        rounds: Math.max(cur.rounds, game?.wins || 0),
        games: cur.games + 1,
      };
      writeSoloBest(next);
      return next;
    });
    // Banked once, when the run ends — not on every re-render of the screen it
    // ends on, which is why the status and not the whole game object is the
    // dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus]);
  const timerRef = useRef(null);
  const cpuTimersRef = useRef([]);
  const soloGridRef = useRef(null);
  const [soloPop, fireSoloPop] = useOneShot(320);
  const [soloWin, fireSoloWin] = useOneShot(950);
  // Which themed deck this round plays. Picked before the round starts and
  // held across the three-round ladder — a night is one theme, not a shuffle
  // of eleven.
  const [deckId, setDeckId] = useState(SOLO_DEFAULT_DECK);
  const [battle, setBattle] = useState(null);   // { item, cpu } while one is on
  // Re-render often enough to move a clock. The call deadline lives in game
  // state; this is just the heartbeat that redraws it.
  const [, setNow] = useState(0);
  // Armed by the first tap on Start — which is also the user gesture every
  // mobile browser demands before it will play audio out loud.
  const [armed, setArmed] = useState(false);
  const nowCallingItem = game && game.calledCount > 0 ? game.order[game.calledCount - 1] : null;
  // The moment the app hands somebody the mic: a LIP SYNC square has been
  // called, it is on THIS card, and it is still up for grabs. Computed up here,
  // before the call loop, because an offer that does not stop the round is not
  // an offer — the next song lands mid-decision and silently swaps the one
  // being asked about.
  const micUp = game && game.status === 'playing' && !battle && nowCallingItem
    && nowCallingItem.type === 'lipsync'
    && game.card.some((sq) => sq && sq.id === nowCallingItem.id)
    && !game.covered.has(nowCallingItem.id)
    && !game.lost?.has(nowCallingItem.id)
    ? nowCallingItem : null;
  const song = useSoloPlayer({ item: nowCallingItem, armed, paused: !!game && game.status !== 'playing' });
  // A round in progress lives in memory — reloading mid-game loses the card,
  // the round and the streak. Hold updates until the round is over; the seam
  // between rounds is a free moment to take one.
  useHoldUpdates(!!game && game.status === 'playing');

  const clearTimers = () => {
    clearTimeout(timerRef.current);      // the call timer is a timeout now
    clearInterval(timerRef.current);     // harmless, and covers anything older

    cpuTimersRef.current.forEach(clearTimeout);
    cpuTimersRef.current = [];
  };
  useEffect(() => clearTimers, []);

  // `round` carries across a deal; everything else is fresh each round.
  const deal = (round, wins, deck) => ({
    round,
    wins,
    deckId: deck,
    pattern: BINGO_ROUND_PATTERN[round] || 'line',
    order: shuffled(soloDeck(deck)),
    calledCount: 0,
    card: dealCard(soloDeck(deck)),
    covered: new Set(),
    // Squares passed on or lost in a battle. Locked for the round, exactly as
    // a forfeited square is locked in the venue round.
    lost: new Set(),
    cpus: CPU_PLAYERS.map((c) => ({ ...c, card: dealCard(soloDeck(deck)), covered: new Set() })),
    status: 'playing',
    winner: null,
    // When the next square gets called. Rendered as a countdown so the player
    // can see the round moving instead of being surprised by it.
    nextCallAt: Date.now() + SOLO_CALL_MS,
  });
  const start = () => { setArmed(true); clearTimers(); setGame(deal(1, 0, deckId)); };
  // Won the round but not the match — deal the next one at the harder pattern,
  // from the same deck: the theme is the night, not the round.
  const nextRound = () => {
    clearTimers();
    setGame((g) => deal(Math.min((g?.round || 1) + 1, BINGO_FINAL_ROUND_CLIENT), g?.wins || 0, g?.deckId || deckId));
  };

  // The call loop + CPU marking. Kept in one effect keyed on status so it
  // tears down cleanly the moment somebody wins.
  //
  // `performing` is in the condition, not just the render, and that is the
  // whole fix for a real complaint: the player would open a lip sync battle,
  // go and perform for thirty seconds, and come back to a round that had
  // called a dozen more squares and possibly been won by a CPU while they were
  // singing. The venue round holds for a performance. Solo now does too — the
  // calls stop, the CPUs stop marking, and the clock below stops with them.
  const performing = !!battle;
  // No YouTube, no game. A lip sync round with no song is not a harder version
  // of this game, it is a different one — you cannot work a square out by ear
  // with nothing to hear.
  //
  // But "hold until the music plays" cannot be the whole rule, and the first
  // draft of it deadlocked on exactly that: the round waited for a song, and
  // the player had nothing to play until a square was called, so neither ever
  // moved. The order is call, then song, then next call. So the FIRST call
  // always goes out; after that, each new call waits for the one before it to
  // actually be playing, and a player that has failed stops the round dead.
  // The song that is up gets exactly as long as its clip runs. Identical to the
  // venue's bingoWindowFor, so practising alone teaches the real pacing rather
  // than a faster arcade version of it.
  // Thirty seconds, or the whole clip if the clip is shorter than that. You
  // cannot play thirty seconds of a twenty-second cut, and a round that sits in
  // silence waiting out a timer longer than its own music is the dead air this
  // pacing exists to avoid.
  const callWindowMs = () => {
    const secs = song.clip?.seconds;
    return secs ? Math.min(SOLO_CALL_MS, Math.round(secs * 1000)) : SOLO_CALL_MS;
  };
  const musicOn = song.status === 'playing';
  const musicFailed = song.status === 'error';
  const awaitingSong = !!game && game.calledCount > 0 && !musicOn;
  // "No song, no game" is the venue's rule and it is the right default. But a
  // rule that bricks the round when a third party changes an API is not a rule,
  // it is a dead end — solo sat frozen on one square with no way forward and no
  // explanation. The player can now choose to keep going without music, which
  // is a worse game and their call to make, not the app's.
  const [noMusic, setNoMusic] = useState(false);
  // Being asked holds the round exactly the way performing does. The clip keeps
  // running underneath — that is what the answer is racing.
  const held = performing || !!micUp || (!noMusic && (musicFailed || awaitingSong));
  // Stamped once, when the offer opens, and stamped DURING the render that
  // opens it rather than in an effect — an effect runs afterwards, so the
  // offer's first frame would draw a ring against a stale deadline. Reading the
  // clip every render instead would slide the deadline along with the song and
  // the ring would never move: the offer has to be racing a fixed moment.
  const micStamp = useRef({ id: null, at: 0 });
  const micId = micUp?.id || null;
  if (micId && micStamp.current.id !== micId) {
    // The same window every player gets, from the shared rule — not this
    // phone's leftover clip. In a room two people holding the same square must
    // be asked for the same length of time, and the host has to be able to keep
    // the night moving rather than waiting on whoever looks down last.
    micStamp.current = { id: micId, at: micDecideEndsAt(Date.now(), song.clipLeftMs()) };
  }
  const micEndsAt = micId ? micStamp.current.at : 0;

  // The room's vote on whether you have to sing for it.
  //
  // Only the players who do NOT hold this square get one — voting on your own
  // square is voting on whether you personally have to sing, which is not a
  // vote. The CPUs make up their minds over the first few seconds of the offer
  // rather than instantly, so the count climbs while you are deciding and you
  // can watch a free square turn into a performance in front of you.
  const eligible = micUp ? micVoters(game?.cpus || [], micUp.id) : [];
  const [micVotes, setMicVotes] = useState([]);
  useEffect(() => {
    setMicVotes([]);
    if (!micId) return undefined;
    // Somebody one square from the pattern has every reason to make you work
    // for it; the rest are likelier to let it go.
    const timers = eligible.map((c, i) => setTimeout(() => {
      const p = soloProgress(c.card, c.covered, game.pattern);
      const keen = p.done >= p.need - 1 ? 0.85 : 0.45;
      if (Math.random() < keen) setMicVotes((v) => (v.includes(c.name) ? v : [...v, c.name]));
    }, 900 + i * 1200 + Math.random() * 900));
    return () => timers.forEach(clearTimeout);
    // Re-run per offer, not per render — eligible is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micId]);
  const forced = micIsForced(micVotes.length, eligible.length);

  // One place where an answer becomes a result, so the rule decides and the
  // buttons only report what was pressed.
  const answerMic = (item, answer) => {
    const outcome = micOutcome({ forced, answer });
    if (outcome === 'performing') {
      playSfx('battle');
      const rival = game.cpus.find((c) => c.card.some((sq) => sq && sq.id === item.id) && !c.covered.has(item.id));
      setBattle({ item, cpu: rival || null, endsAt: Date.now() + song.clipLeftMs() });
      return;
    }
    if (outcome === 'taken') {
      // No performance. The room let it go, so the square is simply yours —
      // this is the case that makes the vote worth caring about.
      playSfx('mark');
      setGame((g) => {
        if (!g || g.status !== 'playing') return g;
        const covered = new Set(g.covered); covered.add(item.id);
        const won = soloHasPattern(g.card, covered, g.pattern);
        const done = won && g.round >= BINGO_FINAL_ROUND_CLIENT;
        return won
          ? { ...g, covered, wins: g.wins + 1, status: done ? 'won' : 'roundWon', winner: 'you' }
          : { ...g, covered };
      });
      return;
    }
    // 'passed' — walked away from a free square. 'blocked' — forced, refused,
    // and the room took it. Both end the same way for the card: it is gone.
    playSfx('buzz');
    setGame((g) => (g && g.status === 'playing'
      ? { ...g, lost: new Set([...(g.lost || []), item.id]) } : g));
  };
  useEffect(() => {
    if (game?.status !== 'playing' || held) return undefined;
    // Coming back from a performance restarts the timer, so restart the
    // countdown with it rather than showing a deadline that passed mid-song.
    // The FIRST call goes out immediately. The window is the gap BETWEEN songs,
    // and applying it before the first one meant starting a round and watching
    // "Dealing…" for thirty seconds with no music and nothing on the card — a
    // game that looks frozen at the exact moment someone is deciding whether it
    // works. Deal, play, then pace.
    const wait = game.calledCount === 0 ? 350 : callWindowMs();
    setGame((g) => (g && g.status === 'playing' ? { ...g, nextCallAt: Date.now() + wait } : g));
    // A self-rescheduling timeout, not an interval: each song's window is its
    // own length, so there is no one period to tick on. The effect re-runs on
    // every call (calledCount is a dependency) and arms the next one.
    timerRef.current = setTimeout(() => {
      setGame((g) => {
        if (!g || g.status !== 'playing') return g;
        if (g.calledCount >= g.order.length) return { ...g, status: 'draw' };
        const item = g.order[g.calledCount];
        playSfx('call');
        // Each CPU covers this square (if they hold it) after its own delay —
        // scheduled outside state so the timers don't rerun on every render.
        g.cpus.forEach((cpu, ci) => {
          if (!cpu.card.some((s) => s && s.id === item.id)) return;
          const [lo, hi] = cpu.delay;
          const t = setTimeout(() => {
            setGame((cur) => {
              if (!cur || cur.status !== 'playing') return cur;
              const cpus = cur.cpus.map((c, i) => (i === ci ? { ...c, covered: new Set([...c.covered, item.id]) } : c));
              const won = cpus[ci];
              if (soloHasPattern(won.card, won.covered, cur.pattern)) {
                playSfx('buzz');
                return { ...cur, cpus, status: 'lost', winner: won.name };
              }
              return { ...cur, cpus };
            });
          }, lo + Math.random() * (hi - lo));
          cpuTimersRef.current.push(t);
        });
        // The next window is not known yet — the next song has not loaded. The
        // effect re-arms with the real one the moment it starts playing.
        return { ...g, calledCount: g.calledCount + 1, nextCallAt: Date.now() + SOLO_CALL_MS };
      });
    }, wait);
    return () => clearTimers();
    // clip.seconds is in here because the window is not known until the song is
    // actually playing: the effect has to re-arm once the real length arrives,
    // or every song would run on the fallback.
  }, [game?.status, held, game?.calledCount, song.clip?.seconds]);

  // The heartbeat behind the countdown. Only runs while a round is actually
  // moving — no timer ticking behind a finished round, a battle, or a silence.
  useEffect(() => {
    if (game?.status !== 'playing' || held) return undefined;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [game?.status, held]);

  const tap = (item, el) => {
    // Everything that is not a state update happens OUT here. A setGame
    // updater runs during the render phase, and firing sound, particles and
    // another component's setState from inside one is both a React warning
    // and, under StrictMode's double-invoke, a doubled effect.
    if (!game || game.status !== 'playing' || !item) return;
    const called = new Set(game.order.slice(0, game.calledCount).map((c) => c.id));
    if (!called.has(item.id)) return;                  // can only cover what's been called
    if (game.lost?.has(item.id)) return;               // passed on, or lost on the floor
    // A LIP SYNC square is performed for, never tapped — the same rule the
    // venue round runs. Whoever else holds it contests it.
    if (item.type === 'lipsync' && !game.covered.has(item.id)) {
      const rival = game.cpus.find((c) => c.card.some((sq) => sq && sq.id === item.id) && !c.covered.has(item.id));
      // Read the clock off the clip that is playing right now, at the moment
      // the square is tapped — that is the performance length.
      setBattle({ item, cpu: rival || null, endsAt: Date.now() + song.clipLeftMs() });
      return;
    }
    const covered = new Set(game.covered);
    const wasCovered = covered.has(item.id);
    wasCovered ? covered.delete(item.id) : covered.add(item.id);
    const won = !wasCovered && soloHasPattern(game.card, covered, game.pattern);
    if (!wasCovered) {
      playSfx('mark');
      fireSoloPop(item.id);
      burstCover(el, item.type === 'lipsync' ? 'lipsync' : 'violet');
    }
    if (won) {
      playSfx('win');
      fireSoloWin('grid');
      celebrate(soloGridRef.current);
    }
    setGame((g) => {
      if (!g || g.status !== 'playing') return g;
      if (!won) return { ...g, covered };
      // Taking round 3 takes the match; anything earlier just moves you up.
      const done = g.round >= BINGO_FINAL_ROUND_CLIENT;
      return { ...g, covered, wins: g.wins + 1, status: done ? 'won' : 'roundWon', winner: 'you' };
    });
  };


  // The player lives here, above everything, and is never unmounted while a
  // round is on. Walking onto the battle stage used to tear the iframe down
  // and take the song with it — which, under a rule that says the clip IS the
  // performance, would mean performing to silence against a clock that had
  // nothing to measure.
  const stage = (() => {
  if (battle) {
    return (
      <SoloBattle
        battle={{
          id: `solo-${battle.item.id}`,
          artist: battle.item.artist,
          song: battle.item.song,
          // Exactly as long as the clip has left to run. Nobody sets this.
          performanceEndsAt: battle.endsAt,
        }}
        cpu={battle.cpu}
        onSettled={({ won }) => {
          const item = battle.item;
          setBattle(null);
          setGame((g) => {
            if (!g || g.status !== 'playing') return g;
            if (!won) return { ...g, lost: new Set([...(g.lost || []), item.id]) };
            const covered = new Set([...g.covered, item.id]);
            const takesIt = soloHasPattern(g.card, covered, g.pattern);
            const done = g.round >= BINGO_FINAL_ROUND_CLIENT;
            return takesIt
              ? { ...g, covered, wins: g.wins + 1, status: done ? 'won' : 'roundWon', winner: 'you' }
              : { ...g, covered };
          });
        }}
      />
    );
  }

  if (!game) {
    return (
      <>
      <PlaySteps steps={SOLO_STEPS} current={0} />
      <AppPanel title="Pick tonight’s theme" subtitle="Step 1 of 2 — then you play">
        <p className="mem-fineprint">You against three regulars, over three rounds — a line, then two lines, then the whole card. Tap your squares as they're called, before they get there first. LIP SYNC squares you perform for, same as the venue — and the take is yours to post.</p>
        {/* Said plainly, because the screen used to print the venue's real
            prize table over a game played against nobody. Solo is practice and
            bragging rights; the money is at the venue. */}
        <div className="solo-stakes">
          <span className="solo-stakes-free">Free play · no prize money</span>
          {best.games > 0 ? (
            <span className="solo-stakes-best">
              Best run <b>{'★'.repeat(best.stars) || '—'}</b> · {best.rounds} of {BINGO_FINAL_ROUND_CLIENT} rounds
            </span>
          ) : (
            <span className="solo-stakes-best">Set your first record</span>
          )}
        </div>
        <div className="k-ladder">
          {[1, 2, 3].map((r) => (
            <span key={r} className="k-ladder-step">
              <b>Round {r}</b>
              <i>{BINGO_PATTERN_GOAL[BINGO_ROUND_PATTERN[r]]}</i>
              <u className="k-ladder-stars">{'★'.repeat(SOLO_ROUND_STARS[r])}</u>
            </span>
          ))}
        </div>
        <div className="solo-roster">
          {CPU_PLAYERS.map((c) => <span key={c.name} className="solo-chip"><b>{c.avatar}</b>{c.name}</span>)}
        </div>
        {/* The deck IS the night. Picking it before the round, rather than
            getting whatever the app felt like, is the difference between a
            generic game and Ladies Night. Same decks the room plays. */}
        <div className="deck-picker">
          {SOLO_DECK_OPTIONS.map((d) => (
            <button type="button" key={d.id}
                    className={`deck-chip${d.id === deckId ? ' on' : ''}`}
                    onClick={() => setDeckId(d.id)}>
              <strong>{d.name}</strong>
              <small>{d.description}</small>
            </button>
          ))}
        </div>
        <button type="button" className="bingo-btn gold" onClick={start}>
          Start Solo Round · {soloDeckById(deckId).name}
        </button>
        {onExit && <button type="button" className="bingo-btn ghost" onClick={onExit}>← Back</button>}
      </AppPanel>
      </>
    );
  }

  const called = new Set(game.order.slice(0, game.calledCount).map((c) => c.id));
  const nowCalling = game.calledCount > 0 ? game.order[game.calledCount - 1] : null;
  const waiting = game.card.filter((it) => it && called.has(it.id) && !game.covered.has(it.id)).length;
  const over = game.status !== 'playing';
  const myProgress = soloProgress(game.card, game.covered, game.pattern);
  // Time left before the next call. Clamped: a backgrounded tab can wake up
  // with a deadline long past, and a negative clock reads as broken.
  // Clamped to the window actually in use, not the fallback constant. Clamping
  // to SOLO_CALL_MS left the countdown reading a frozen "2.2s" for the whole of
  // a 75-second song, and the meter beside it permanently full — the round was
  // pacing correctly and the only thing on screen reporting it was lying.
  const callWindow = callWindowMs();
  const callLeft = Math.max(0, Math.min(callWindow, (game.nextCallAt || 0) - Date.now()));
  const soloOneAway = oneAwayIds(soloCard(game.card), game.covered, called, game.pattern);

  // A dealt round is not a tab any more — it is the game. It takes the screen,
  // and it takes it sideways: a 5x5 card of artist/song squares is unreadable
  // in a portrait column on a phone, which is the whole reason the venue round
  // has always demanded landscape. Solo plays by the same rules, so it gets the
  // same gate and the same big card.
  return (
    <div className="solo-stage">
      {micUp && (
        <MicOffer
          key={micUp.id}
          artist={micUp.artist}
          song={micUp.song}
          endsAt={micEndsAt}
          forced={forced}
          votes={micVotes.length}
          voters={eligible.length}
          onAnswer={(answer) => answerMic(micUp, answer)}
        />
      )}
      {over && (
        <div className={`bingo-winner-banner${game.status === 'lost' ? ' lost' : ''}`}>
          <strong>
            {game.status === 'won' ? `🏆 BINGO — you took all ${BINGO_FINAL_ROUND_CLIENT} rounds!`
              : game.status === 'roundWon' ? `🏆 Round ${game.round} is yours — ${game.wins} of ${BINGO_FINAL_ROUND_CLIENT}`
              : game.status === 'lost' ? `${game.winner} got it first`
              : 'Deck ran out — draw'}
          </strong>
          {/* The run and the record. They used to sit above the card for the
              whole round, where they were two more things to read and never
              changed mid-square. Here they are the result. */}
          <span className="winner-run">
            <em>This run</em><b>{'★'.repeat(starsThisRun) || '—'}</b>
            <em className={starsThisRun > best.stars ? 'beaten' : ''}>
              {starsThisRun > best.stars ? 'New best!' : 'Best'}
            </em>
            <b>{'★'.repeat(Math.max(best.stars, starsThisRun)) || '—'}</b>
          </span>
        </div>
      )}
      <AppPanel title="Solo vs CPU" subtitle={over ? 'Round over' : `Live · ${game.calledCount} called`}>
        {/* The status rail: what is playing, the round, and who you are racing.
            Above the card on a phone, beside it on a laptop. */}
        <div className="play-rail">
        <div className="bingo-side">
          {/* One strip, not six panels.
          
              This was a stack: a three-line "now playing" card, a round card, a
              run-and-record pair, a labelled clock, and up to two paragraphs of
              nudge — all ABOVE the card, on the screen where the card is the
              entire point. It pushed the thing you came to play to the bottom
              and asked you to read your way down to it.

              Everything still here earns its place while a square is live: what
              is playing, which round, how long is left, and who is closing in.
              The run and the record moved to the end of the round, where they
              are actually news. */}
          <div className="hud-strip">
            <span className="hud-strip-now">
              {nowCalling && !over ? (
                musicOn ? (
                  <>
                    <span className="k-hud-ear" aria-hidden="true"><i /><i /><i /><i /></span>
                    <b>By ear</b>
                  </>
                ) : (
                  /* No sound means the title is all there is to go on, so it is
                     shown — and marked, so it never reads as the game simply
                     giving the answer away. The mark is an icon rather than the
                     paragraph it used to be, but it still has to be THERE. */
                  <>
                    <em className="hud-strip-mute" title="No sound — the song is shown instead">🔇</em>
                    <b>{nowCalling.artist}</b><i>{nowCalling.song}</i>
                  </>
                )
              ) : <b>{over ? 'Round over' : 'Dealing…'}</b>}
              {nowCalling && !over && nowCalling.type === 'lipsync' && <em className="hud-strip-lip">Lip sync</em>}
            </span>

            {/* How deep into the deck. One number — it was a sentence, but the
                count itself is worth keeping: it is how you know whether the
                squares you need are still coming. */}
            <span className="hud-strip-count" title={`${game.calledCount} called`}>{game.calledCount} called</span>

            <span className="hud-strip-round">
              <b>R{game.round}</b>
              <u>{'★'.repeat(SOLO_ROUND_STARS[game.round] ?? 1)}</u>
              <i>{BINGO_PATTERN_GOAL[game.pattern]}</i>
            </span>

            {!over && (
              <span className={`hud-strip-clock${callLeft <= 5000 && !performing ? ' hot' : ''}`}>
                {performing ? '⏸' : `${Math.ceil(callLeft / 1000)}s`}
              </span>
            )}
          </div>

          {!over && (
            <Meter
              className="solo-callclock"
              countdown
              live={!performing}
              value={callLeft / callWindow}
            />
          )}

          {/* The only nudge left, because it is the only one with something to
              do about it. A square waiting to be tapped is already lit on the
              card, and telling somebody in a sentence what a glowing square
              tells them instantly is the reading this screen had too much of. */}
          {!over && musicFailed && !noMusic && (
            <div className="k-nudge k-nudge--no">
              <p>That song did not start. The round is holding — working it out by ear is the game.</p>
              <button type="button" className="bingo-btn ghost" onClick={() => setNoMusic(true)}>
                Keep playing without music
              </button>
            </div>
          )}
        </div>

        <div className="solo-cpus">
          {game.cpus.map((c) => {
            const p = soloProgress(c.card, c.covered, game.pattern);
            return (
              <div key={c.name} className={`solo-cpu${p.done >= p.need - 1 ? ' close' : ''}`} title={c.name}>
                <b>{c.avatar}</b>
                <Meter className="solo-cpu-meter" value={p.done / p.need} hot={p.done >= p.need - 1} />
                <span className="solo-cpu-prog">{p.done}/{p.need}</span>
              </div>
            );
          })}
        </div>

        </div>

        {/* The card and everything that belongs to it. On a phone this simply
            stacks under the status rail; from a laptop up, the rail moves
            alongside it and this is the column it sits next to. */}
        <div className="play-board">
        {/* The board's own temperature. `--heat` is how close this card is to
            the pattern, 0 to 1, and the frame burns harder as it climbs — so
            being one square away is something you can SEE without a word of it
            being written down. The flash is keyed on the call count, which
            remounts it, which replays the animation: every new song lands as a
            pulse across the card instead of a sentence above it. */}
        <div className={`k-grid${soloWin.id ? ' k-grid--win' : ''}${over ? '' : ' is-live'}`}
             style={{ '--heat': Math.max(0, Math.min(1, myProgress.done / myProgress.need)) }}
             key={`sg${soloWin.token}`} ref={soloGridRef}>
          {!over && game.calledCount > 0 && (
            <span key={`call${game.calledCount}`} className="k-callflash" aria-hidden="true" />
          )}
          {game.card.map((item, i) => {
            const isFree = i === 12;
            const isCalled = !isFree && called.has(item.id);
            const isCovered = isFree || game.covered.has(item.id);
            const isLip = !isFree && item.type === 'lipsync';
            const state3 = isFree ? 'free' : isCovered ? 'covered'
              : !over && soloOneAway.has(item.id) ? 'oneaway' : isCalled && !over ? 'called' : '';
            // A square passed on, or lost on the floor, is gone for the round.
            // It has to look gone, or the player keeps tapping a dead tile.
            const isLost = !isFree && game.lost?.has(item.id);
            const cls = ['k-tile', state3 && `k-tile--${state3}`, isLip && !isCovered && !isLost && 'k-tile--lipsync',
              isLost && 'k-tile--lost',
              !isFree && soloPop.id === item.id && 'k-tile--pop'].filter(Boolean).join(' ');
            const mark = isCovered && !isFree ? TILE_ART.covered : isCalled && !over ? TILE_ART.called : isLip ? TILE_ART.lipsync : null;
            return (
              <button type="button" key={`${isFree ? 'free' : item.id}-${!isFree && soloPop.id === item.id ? soloPop.token : 0}`} className={cls} onClick={(e) => tap(item, e.currentTarget)} disabled={isFree || !isCalled || over || isLost}>
                {isFree ? 'Free space' : (
                  <>
                    <span className="k-tile-artist">{item.artist}</span>
                    <span className="k-tile-song">{item.song}</span>
                  </>
                )}
                {mark && <img className="k-tile-mark" src={mark} alt="" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="k-cardfoot">
          <Meter
            value={myProgress.done / myProgress.need}
            label={BINGO_PATTERN_GOAL[game.pattern]}
            right={`${myProgress.done} / ${myProgress.need}`}
            hot={myProgress.done >= myProgress.need - 1}
          />
        </div>

        {game.status === 'roundWon' && (
          <button type="button" className="k-btn k-btn--go" onClick={nextRound}>
            Round {game.round} won → play round {game.round + 1} ({BINGO_PATTERN_GOAL[BINGO_ROUND_PATTERN[game.round + 1]]})
          </button>
        )}
        {over && game.status !== 'roundWon' && <button type="button" className="k-btn k-btn--gold" onClick={start}>Play Again</button>}
        {/* Leaving the game goes back to the deck picker, not out of Bingo —
            the way out of the whole screen is the tab bar you came in through. */}
        <button type="button" className="k-btn k-btn--tertiary" onClick={() => { clearTimers(); setGame(null); }}>
          ← Leave round
        </button>
        </div>
      </AppPanel>
    </div>
  );
  })();

  return (
    <>
      {/* Sealed exactly like play-along in the venue round: the title is drawn
          inside the frame, and the title is the answer. Kept mounted across
          every screen below so the song never restarts under a performer. */}
      {armed && (
        <div className="solo-player" aria-hidden="true">
          {/* The player is a real, full-size, on-screen element — and then it is
              covered. It used to be two pixels across at one percent opacity,
              which reads to a phone as "not visible", and a browser will not
              autoplay a video it thinks nobody can see. That is the other half
              of why solo was silent. Occluding it with an opaque shield keeps
              the title unreadable while leaving the player genuinely rendered,
              which is the part the autoplay rules actually measure. */}
          <div className="playalong-frame playalong-frame--real"><div ref={song.hostRef} /></div>
          <div className="playalong-shield" />
        </div>
      )}
      {stage}
    </>
  );
}

// The only art the card screen loads. Everything else on it — frames, chips,
// buttons, bars, the timer dial — is drawn in kit.css, so it stays sharp at
// any size and restyles from one place.
// Every one of these is written out in full, deliberately. Building the path
// from a variable — `${BASE_URL}assets/ui/kit/${name}.png` — compiles to a
// concatenation, and the deploy step that works out which public/ files the
// bundle actually needs can only see complete literal paths. A helper function
// here shipped a live site with every one of these missing. Same failure as
// the loyalty badges earlier: if it is not a whole string, the deploy cannot
// find it.

const BINGO_STATUS_LABEL = { lobby: 'Lobby — waiting to start', live: 'Live now', ended: 'Round over' };
// One-shot animation flags, driven by state rather than by touching
// classList. Adding a class imperatively to a React-rendered element does not
// survive: the next render reconciles className from the vdom and silently
// strips it, so the particles fired but the tile never popped. `token` changes
// on every trigger so tapping the same square twice restarts the animation
// instead of being a no-op.
function useOneShot(ms) {
  const [state, setState] = useState({ id: null, token: 0 });
  const timer = useRef(0);
  const fire = (id) => {
    clearTimeout(timer.current);
    setState((s) => ({ id, token: s.token + 1 }));
    timer.current = setTimeout(() => setState((s) => ({ id: null, token: s.token })), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [state, fire];
}



// Countdown for the square currently on screen. The server stamps every call
// with `at` and publishes the window it gets (lip sync squares run longer),
// so the clock is derived, never pushed — a late poll cannot desync it.
function useCallClock(state) {
  const [, tick] = useState(0);
  const running = state?.status === 'live' && !!state?.calls?.[state.calls.length - 1]?.at;
  useEffect(() => {
    if (!running) return undefined; // don't re-render 4x/second all night in the lobby
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [running]);
  const last = state?.calls?.[state.calls.length - 1];
  if (!running) return null;
  const window = state.currentWindowMs || 60000;
  const left = Math.max(0, last.at + window - Date.now());
  const secs = Math.ceil(left / 1000);
  const text = secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `${secs}s`;
  return { left, pct: Math.max(0, Math.min(1, left / window)), text };
}

// The podium. A round used to end the moment one person won and everyone else
// simply lost at the same time; now first place opens a short sprint and the
// rest of the room races for second and third. This shows the live race while
// it runs and the finished three when it lands — on the card, the host screen
// and the TV, because the whole room is watching the same board.
function PodiumBoard({ state, meId, isHost = false, onChanged }) {
  const left = useCountdown(state?.podiumEndsAt);
  const [busy, setBusy] = useState(false);
  const running = state?.status === 'podium';
  const firstId = state?.podiumFirst || state?.podium?.[0]?.memberId;
  // While the sprint runs the server sends standings ranked purely by
  // progress. First place is already settled though, so the claimant is
  // pinned to the top and everybody else is racing for second — otherwise a
  // chaser who has covered more squares renders with a gold medal next to the
  // person who actually took the round.
  const ranked = running
    ? (() => {
        const list = state.standings || [];
        const champ = list.find((p) => p.memberId === firstId);
        const rest = list.filter((p) => p.memberId !== firstId);
        return [...(champ ? [{ ...champ, place: 1 }] : []), ...rest.map((p, i) => ({ ...p, place: i + 2 }))];
      })()
    : (state?.podium || []);
  const rows = ranked.slice(0, 5);
  if (!rows.length) return null;
  return (
    <div className={`podium${running ? ' is-live' : ''}`}>
      <div className="podium-head">
        <span className="k-chip k-chip--gold k-chip--live">{running ? 'Race for 2nd & 3rd' : 'Podium'}</span>
        {running && left && <span className="podium-clock">{Math.ceil(left.ms / 1000)}s</span>}
      </div>
      {running && <p className="podium-hint">First place is taken. Cover everything you can — closest two take second and third.</p>}
      <ol className="podium-list">
        {rows.map((p, i) => {
          const place = p.place ?? i + 1;
          return (
            <li key={p.memberId} className={`podium-row p${Math.min(place, 4)}${p.memberId === meId ? ' is-me' : ''}`}>
              <span className="podium-place">{place <= 3 ? ['🥇', '🥈', '🥉'][place - 1] : place}</span>
              <span className="podium-who">
                <strong>{p.name}{p.memberId === meId ? ' (you)' : ''}</strong>
                {p.memberId === firstId && <small>took the round</small>}
              </span>
              {typeof p.pct === 'number' && (
                <span className="podium-meter"><i style={{ width: `${p.pct}%` }} /></span>
              )}
              <span className="podium-num">{p.done ?? '–'}/{p.need ?? '–'}</span>
            </li>
          );
        })}
      </ol>
      {isHost && running && (
        <button type="button" className="k-btn k-btn--go" disabled={busy}
                onClick={async () => { setBusy(true); try { await apiBingoPodiumClose(); await onChanged?.(); } catch { /* ignore */ } setBusy(false); }}>
          Close the podium now
        </button>
      )}
    </div>
  );
}

// The roster call-out.// The roster call-out. When three or more players hold the same lip sync
// square, the whole room — not just the contenders — decides which two
// perform for it. This renders identically on a player's phone, the host
// screen and the TV, because everybody is looking at the same decision.
//
// `pickable` is false on the TV and the host screen: they display the vote,
// they do not cast one.
function BattleRoster({ battle, meId, pickable = true, isHost = false, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const left = useCountdown(battle?.pickEndsAt);   // { ms, text } | null
  if (!battle || battle.status !== 'picking') return null;
  const pick = async (memberId) => {
    if (!pickable || busy) return;
    setBusy(true); setErr('');
    try { await apiBattlePick(battle.id, memberId); await onChanged?.(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <div className="roster">
      <div className="roster-head">
        <span className="k-chip k-chip--neon k-chip--live">Who battles?</span>
        <strong className="roster-song">{battle.artist} — {battle.song}</strong>
        {left && <span className="roster-clock">{Math.ceil(left.ms / 1000)}s</span>}
      </div>
      <p className="roster-hint">
        {pickable
          ? 'Tap the two you want to see go head to head.'
          : 'The room is choosing the matchup.'}
      </p>
      <div className="roster-cards">
        {battle.contenders.map((c) => {
          const mine = battle.myPick === c.memberId;
          const isMe = c.memberId === meId;
          return (
            <button
              type="button"
              key={c.memberId}
              className={`roster-card${c.leading ? ' is-leading' : ''}${mine ? ' is-mine' : ''}${isMe ? ' is-you' : ''}`}
              onClick={() => pick(c.memberId)}
              disabled={!pickable || isMe || busy}
            >
              <span className="roster-tier" data-tier={(c.tier || 'Member').toLowerCase()}>{c.vip ? 'VIP' : (c.tier || 'Member')}</span>
              <span className="roster-name">{c.name}{isMe ? ' (you)' : ''}</span>
              <span className="roster-num">#{c.number}</span>
              {c.battleWins > 0 && <span className="roster-wins">{c.battleWins}W</span>}
              {c.leading && <span className="roster-lead">IN</span>}
              <span className="roster-meter"><i style={{ width: `${c.share}%` }} /></span>
              <span className="roster-share">{c.picks} {c.picks === 1 ? 'pick' : 'picks'} · {c.share}%</span>
            </button>
          );
        })}
      </div>
      {err && <p className="roster-err">{err}</p>}
      {isHost && (
        <button type="button" className="k-btn k-btn--go" disabled={busy}
                onClick={async () => { setBusy(true); try { await apiBattleLock(battle.id); await onChanged?.(); } catch (e) { setErr(e.message); } setBusy(false); }}>
          Lock the matchup now
        </button>
      )}
    </div>
  );
}

// Host-facing deck + win-pattern picker for the NEXT game — shared by Game
// Menu and Host Control. Deliberately only takes effect on reset (not
// start), so nobody's already-dealt card can be pulled out from under them
// mid-lobby by a deck change.
function DeckPatternPicker({ currentDeckId, currentPattern, onReset, busy }) {
  const [decks, setDecks] = useState(null);
  const [deckId, setDeckId] = useState(currentDeckId || '');
  const [pattern, setPattern] = useState(currentPattern || 'line');
  useEffect(() => { apiBingoDecks().then((r) => setDecks(r.decks)).catch(() => {}); }, []);
  useEffect(() => { if (currentDeckId) setDeckId(currentDeckId); }, [currentDeckId]);
  useEffect(() => { if (currentPattern) setPattern(currentPattern); }, [currentPattern]);
  return (
    <div className="bingo-deck-picker">
      <label className="bingo-picker-label">Deck for next game
        <select value={deckId} onChange={(e) => setDeckId(e.target.value)} disabled={!decks}>
          {(decks || []).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.count})</option>)}
        </select>
      </label>
      <label className="bingo-picker-label">Win pattern
        <select value={pattern} onChange={(e) => setPattern(e.target.value)}>
          {BINGO_PATTERN_IDS.map((p) => <option key={p} value={p}>{BINGO_PATTERN_NAME[p]}</option>)}
        </select>
      </label>
      <button type="button" className="bingo-btn ghost" disabled={busy} onClick={() => onReset(deckId, pattern)}>Reset for New Game</button>
    </div>
  );
}
function NotConnectedBingo({ title }) {
  return (
    <div className="staff-dash">
      <AppPanel title={title} subtitle="Lip Sync Bingo">
        <p className="dash-empty">Connect to a venue backend to play tonight's round.</p>
      </AppPanel>
    </div>
  );
}

// Game Menu — quick round-control panel for the host (start/reset + status).
function BingoStyleScreen({ navigate }) {
  const { state, err } = useBingoState(4000);
  const [busy, setBusy] = useState(false);
  if (err === 'not-connected') return <NotConnectedBingo title="Game Menu" />;
  const act = async (fn) => { setBusy(true); try { await fn(); } catch { /* ignore */ } setBusy(false); };
  return (
    <div className="staff-dash">
      <AppPanel title="Game Menu" subtitle={state ? `${BINGO_STATUS_LABEL[state.status]} · ${state.deckName}` : 'Loading…'}>
        <p className="dash-num">{state ? `${state.playerCount} joined · ${state.readyCount} ready · ${state.calls.length} called` : ''}</p>
        <button type="button" className="bingo-btn" disabled={busy || state?.status === 'live'} onClick={() => act(apiBingoStart)}>Start Round</button>
        <DeckPatternPicker currentDeckId={state?.deckId} currentPattern={state?.pattern} busy={busy} onReset={(deckId, pattern) => act(() => apiBingoReset(deckId, pattern))} />
        <button type="button" className="bingo-btn gold" onClick={() => navigate('host')}>Open Host Control →</button>
      </AppPanel>
    </div>
  );
}

// Public room screen — unattended TV, no login, big call log.
// Loads the YouTube IFrame Player API once (shared across mounts) and reports
// when window.YT.Player is ready to construct — no personal login involved,
// the API just embeds public videos.
let ytApiPromise = null;
function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise;
}
function YouTubeStage({ video }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [playerReady, setPlayerReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadYoutubeApi().then(() => {
      if (!live || !hostRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => live && setPlayerReady(true) },
      });
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const p = playerRef.current;
    if (!playerReady || !p) return;
    if (!video?.videoId) { p.stopVideo?.(); return; }
    // Play the verse-and-hook cut, not the whole track: the backend works the
    // window out from the song's real length and sends it with the video, so
    // the music ends exactly when the performance timer does. No window (an
    // older call, or a video whose length never resolved) plays from the top.
    const clip = video.clip;
    if (clip?.seconds) {
      p.loadVideoById({ videoId: video.videoId, startSeconds: clip.start || 0,
                        endSeconds: (clip.start || 0) + clip.seconds });
    } else {
      p.loadVideoById(video.videoId);
    }
  }, [playerReady, video?.videoId, video?.clip?.start, video?.clip?.seconds]);
  if (!video?.videoId) return null;
  return <div className="bingo-tv-media"><div ref={hostRef} /></div>;
}

function TvDisplayScreen() {
  const { state, err } = useBingoState(3000);
  // A battle the host has thrown to the TV takes the whole screen — that's
  // the point of projecting it.
  const [battle, setBattle] = useState(null);
  useEffect(() => {
    if (!apiEnabled()) return undefined;
    const poll = async () => { try { setBattle((await apiBattleCurrent()).battle); } catch { /* ignore */ } };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);
  if (err === 'not-connected') return <NotConnectedBingo title="TV Display" />;
  const calls = state?.calls || [];
  const onTv = battle && battle.stage === 'tv' && battle.status !== 'done' && battle.status !== 'void';
  // The podium owns the TV while it runs. It is the one moment every night
  // when the whole room looks at the same screen at the same time.
  if (state?.status === 'podium' || (state?.podium?.length > 0 && state?.status === 'ended')) {
    return (
      <div className="staff-dash tv-battle">
        <PodiumBoard state={state} meId={null} />
      </div>
    );
  }
  // Picking takes the TV regardless of stage: the whole room is voting on it,
  // so the whole room has to be able to see the running count.
  if (battle && battle.status === 'picking') {
    return (
      <div className="staff-dash tv-battle">
        <BattleRoster battle={battle} meId={null} pickable={false} />
        <p className="tv-roster-cta">Pick on your phone — the top two battle for the square.</p>
      </div>
    );
  }
  if (onTv) {
    return (
      <div className="staff-dash tv-battle">
        <div className="tv-battle-head">
          <span className="bingo-now-label">LIP SYNC BATTLE</span>
          <strong>{battle.artist}</strong><span className="bingo-now-song">{battle.song}</span>
        </div>
        <BattleWatch battleId={battle.id} label={`${battle.artist} — ${battle.song}`} />
        <div className="tv-battle-players">
          {battle.players.map((p) => (
            <div key={p.memberId} className={`tv-battle-player${battle.performingMemberId === p.memberId ? ' up' : ''}${battle.winnerMemberId === p.memberId ? ' won' : ''}`}>
              <strong>{p.name}</strong>
              <div className="battle-share big"><span style={{ width: `${p.share}%` }} /></div>
              <span className="tv-battle-votes">{p.votes} {p.votes === 1 ? 'vote' : 'votes'}</span>
              {battle.performingMemberId === p.memberId && <span className="tv-battle-up">● PERFORMING</span>}
            </div>
          ))}
        </div>
        {battle.status === 'voting' && <p className="tv-battle-cta">VOTE ON YOUR PHONE</p>}
        {battle.winnerMemberId && <div className="bingo-winner-banner"><strong>🏆 {battle.players.find((p) => p.memberId === battle.winnerMemberId)?.name} takes it</strong></div>}
      </div>
    );
  }
  return (
    <div className="staff-dash">
      <YouTubeStage video={state?.nowPlaying} />
      {state?.winner && (
        <div className="bingo-winner-banner">
          <strong>🏆 {state.winner.name} has BINGO!</strong>
          <span>{state.winner.number}</span>
        </div>
      )}
      <AppPanel title="Lip Sync Bingo" subtitle={state ? `${BINGO_STATUS_LABEL[state.status]} · ${state.deckName}` : 'Loading…'}>
        <p className="dash-num">{state ? `${state.playerCount} playing · ${state.readyCount} ready · ${BINGO_PATTERN_NAME[state.pattern]}` : ''}</p>
        {calls.length > 0 && (
          <div className="bingo-current-call">
            {calls[calls.length - 1].type === 'lipsync' && <span className="bingo-cell-tag">LIP SYNC</span>}
            <strong>{calls[calls.length - 1].artist}</strong>
            <span>{calls[calls.length - 1].song}</span>
          </div>
        )}
        <div className="bingo-call-log">
          {calls.length === 0 && <p className="dash-empty">Calls will appear here once the round goes live.</p>}
          {calls.map((c, i) => <span key={c.id} className={`bingo-chip${i === calls.length - 1 ? ' latest' : ''}`}>{c.artist} — {c.song}</span>)}
        </div>
      </AppPanel>
    </div>
  );
}

// Member: join + ready up before the round starts.
// Sound is great in an empty room and terrible when staff are running a door
// three feet from a speaker — so it's one tap to kill, and the choice sticks.
function SfxToggle() {
  const [muted, setMuted] = useState(() => sfxMuted());
  const toggle = () => {
    const next = !muted;
    setSfxMuted(next);
    setMuted(next);
    if (!next) playSfx('mark');   // unmuting confirms itself audibly
  };
  return (
    <button type="button" className="sfx-toggle" onClick={toggle}
      aria-pressed={muted} title={muted ? 'Sound off — tap to turn on' : 'Sound on — tap to mute'}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

/** Where you are in setting up a round.
 *
 *  This was a row of numbered pills — ① PICK A THEME ② PLAY — which is the
 *  shape of a checkout wizard, not a game. It read as cheesy because it was
 *  loud about a thing that should be quiet: nobody opens a bingo app to admire
 *  its progress tracker.
 *
 *  What apps that get this right do is state the step in words and draw one
 *  thin line that fills. So: the step you are on, the count, and a bar. It
 *  takes one line of height instead of a row of chips, which is also what makes
 *  it survive a landscape phone. */
function PlaySteps({ steps, current }) {
  const pct = Math.round(((current + 1) / steps.length) * 100);
  return (
    <div className="play-steps" role="group" aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      <div className="play-steps-head">
        <span className="play-steps-now">{steps[current]}</span>
        <span className="play-steps-count">{current + 1}<i>/</i>{steps.length}</span>
      </div>
      <div className="play-steps-rail"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function LobbyScreen({ navigate }) {
  // Lip Sync Bingo used to open on a row of peer tabs — Venue Round, Solo vs
  // CPU, Record — so the first thing a member met after choosing a game was
  // another menu asking them to choose again. Three doors, no indication which
  // one was theirs.
  //
  // There is almost always a right answer, and the app already knows it: if
  // this phone is connected to a venue, you are here to play with the room; if
  // it is not, the room is not reachable and solo is the only thing that can
  // work. So it picks, opens on the path, and shows the steps of that path.
  // The other way is still one tap away on a line underneath — an escape
  // hatch, not a question you have to answer before you can start.
  const connected = apiEnabled();
  const [mode, setMode] = useState(() => (connected ? 'venue' : 'solo'));
  // Chosen once per visit, not pinned forever: connecting to the venue while
  // sitting on the solo screen should move you to the round, because that is
  // plainly what connecting was for.
  const wasConnected = useRef(connected);
  useEffect(() => {
    if (connected && !wasConnected.current) setMode('venue');
    wasConnected.current = connected;
  }, [connected]);

  const playing = mode === 'venue' || mode === 'solo';
  return (
    // The mode is on the wrapper so layout rules can target one path. Record
    // wants two columns in landscape; Solo, which shares this screen, does
    // not — scoping it to .staff-dash alone knocked Solo past the fold.
    <div className={`staff-dash mode-${mode}`}>
      {mode === 'solo' ? <SoloBingoGame />
        : mode === 'record' ? <PlayerRecord onBack={() => setMode(connected ? 'venue' : 'solo')} />
        : mode === 'host' ? <HostMode navigate={navigate} onExit={() => setMode('venue')} />
        : <VenueLobby navigate={navigate} />}

      {/* Everything that is not the game itself lives down here, under the
          thing you came to do — reachable, not competing with it. */}
      {playing && (
        <div className="play-elsewhere">
          <button type="button" className="play-switch" onClick={() => setMode(mode === 'venue' ? 'solo' : 'venue')}>
            {mode === 'venue'
              ? <>Venue not running? <b>Play solo vs CPU →</b></>
              : <>At the venue? <b>Join the room’s round →</b></>}
          </button>
          <button type="button" className="play-switch" onClick={() => setMode('record')}>
            <b>My takes →</b>
          </button>
          <SfxToggle />
        </div>
      )}
      {mode !== 'host' && (
        <button type="button" className="bingo-host-link" onClick={() => setMode('host')}>
          Running the night? <b>Host controls →</b>
        </button>
      )}
    </div>
  );
}

// Hosting, from inside the game. A member unlocks it with the venue's host
// code once and the device keeps that session, so the person running the
// night can host and play from the same phone instead of signing out of the
// member app and back in through a staff door.
function HostMode({ navigate, onExit }) {
  const [unlocked, setUnlocked] = useState(() => !!apiStaffToken());
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Every hook this component calls has to run on every render of it, which is
  // why the round poll and the deck list are up here above the two gates below
  // rather than tucked in beside the thing that uses them.
  const { state, refresh } = useBingoState(unlocked ? 3000 : 0);
  const [decks, setDecks] = useState(null);
  const [pick, setPick] = useState('');
  useEffect(() => {
    if (!unlocked) return;
    apiBingoDecks().then((r) => setDecks(r.decks)).catch(() => setDecks([]));
  }, [unlocked]);
  // Follow the venue until the host actually chooses something, so the picker
  // shows tonight's real deck rather than guessing.
  useEffect(() => { if (state?.deckId && !pick) setPick(state.deckId); }, [state?.deckId, pick]);

  const unlock = async () => {
    setBusy(true); setErr('');
    try { await apiStaffLogin(code.trim()); setUnlocked(true); }
    catch { setErr('That code was not accepted by the venue.'); }
    setBusy(false);
  };
  const act = async (fn) => { setBusy(true); setErr(''); try { await fn(); await refresh(); } catch (e) { setErr(e?.message || 'That did not go through.'); } setBusy(false); };

  if (!apiEnabled()) {
    return (
      <AppPanel title="Host the night" subtitle="Not connected to a venue">
        <p className="mem-fineprint">Hosting runs the real round for everyone in the room, so it needs a venue connection. Connect to the venue first.</p>
        {onExit && <button type="button" className="k-btn k-btn--tertiary" onClick={onExit}>← Back to the game</button>}
      </AppPanel>
    );
  }
  if (!unlocked) {
    return (
      <AppPanel title="Host the night" subtitle="Venue host code required">
        <p className="mem-fineprint">Running the round means calling songs for everyone in the room, so the venue gates it. Ask the venue for tonight&apos;s host code.</p>
        <label className="host-code-label">Host code
          <input type="text" value={code} autoComplete="off" placeholder="Host code"
                 onChange={(e) => { setCode(e.target.value); setErr(''); }}
                 onKeyDown={(e) => e.key === 'Enter' && code.trim() && unlock()} />
        </label>
        {err && <p className="gate-err">{err}</p>}
        <button type="button" className="k-btn k-btn--gold" disabled={!code.trim() || busy} onClick={unlock}>
          {busy ? 'Checking…' : 'Unlock hosting'}
        </button>
        {onExit && <button type="button" className="k-btn k-btn--tertiary" onClick={onExit}>← Back to the game</button>}
      </AppPanel>
    );
  }

  // This used to be a flat grid of six tools in no particular order — Host
  // Control next to Winner · Payout next to Song Queue — which told a host
  // running their first night nothing about what to press or when. A night has
  // an order: choose the theme, get people in, start it, run it, pay out. So
  // does this now, and the step you are actually on is the one that is lit.
  const status = state?.status || 'idle';
  const live = status === 'live';
  const ready = (state?.readyCount ?? 0);
  const joined = (state?.playerCount ?? 0);
  const step = live ? 3 : joined > 0 ? 2 : 1;

  return (
    <AppPanel title="Host the night" subtitle={state ? `${BINGO_STATUS_LABEL[status]} · ${state.deckName}` : 'Reading the room…'}>
      <div className="host-flow">
        <section className={`host-step${step === 1 ? ' now' : ''}${live ? ' done' : ''}`}>
          <header><b>1</b><strong>Tonight&apos;s theme</strong>
            <span>{live ? 'Locked in — the round is live' : 'The deck is the night'}</span>
          </header>
          {live ? (
            <p className="mem-fineprint">Playing <b>{state?.deckName}</b>. Reset the round to change it.</p>
          ) : (
            <>
              <div className="deck-picker">
                {(decks || []).map((d) => (
                  <button type="button" key={d.id} className={`deck-chip${d.id === pick ? ' on' : ''}`}
                          onClick={() => setPick(d.id)}>
                    <strong>{d.name}</strong>
                    <small>{d.description}</small>
                  </button>
                ))}
                {decks === null && <p className="mem-fineprint">Reading the venue&apos;s decks…</p>}
              </div>
              <button type="button" className="k-btn k-btn--secondary" disabled={busy || !pick}
                      onClick={() => act(() => apiBingoReset(pick, state?.pattern || 'line'))}>
                Deal a fresh game on {decks?.find((d) => d.id === pick)?.name || 'this deck'}
              </button>
            </>
          )}
        </section>

        <section className={`host-step${step === 2 ? ' now' : ''}${live ? ' done' : ''}`}>
          <header><b>2</b><strong>Get the room in</strong>
            <span>{joined} joined · {ready} ready</span>
          </header>
          <Meter value={joined ? ready / joined : 0} label="Ready to play"
                 right={`${ready} / ${joined}`} live={!live && joined > 0} hot={joined > 0 && ready === joined} />
          <p className="mem-fineprint">Members join from Lip Sync Bingo on their own phones. You do not have to wait for everyone.</p>
          <button type="button" className="k-btn k-btn--tertiary" onClick={() => navigate('tv')}>
            Put the join screen on the TV →
          </button>
        </section>

        <section className={`host-step${step === 3 ? ' now' : ''}`}>
          <header><b>3</b><strong>Run the round</strong>
            <span>{live ? 'Live — call the songs' : 'Not started yet'}</span>
          </header>
          {!live && (
            <button type="button" className="k-btn k-btn--go" disabled={busy || joined === 0}
                    onClick={() => act(apiBingoStart)}>
              {joined === 0 ? 'Waiting for the first player…' : `Start the round · ${joined} playing`}
            </button>
          )}
          <button type="button" className="k-btn k-btn--gold" onClick={() => navigate('host')}>
            {live ? 'Host Control — call songs, judge battles →' : 'Open Host Control →'}
          </button>
        </section>

        <section className="host-step">
          <header><b>4</b><strong>Finish it</strong><span>Validate the claim, pay the winner</span></header>
          <button type="button" className="k-btn k-btn--tertiary" onClick={() => navigate('winner')}>Winner · Payout →</button>
        </section>
      </div>

      {err && <p className="gate-err">{err}</p>}

      <details className="host-more">
        <summary>Other tools</summary>
        <button type="button" className="k-btn k-btn--tertiary" onClick={() => navigate('songQueue')}>Song Queue — everything called so far</button>
        <button type="button" className="k-btn k-btn--tertiary" onClick={() => navigate('bingoStyle')}>Game Menu — win pattern, reset</button>
        <button type="button" className="k-btn k-btn--tertiary" onClick={() => navigate('lipsyncBattle')}>Lip Sync Battle — bracket, king of the hill, open floor</button>
      </details>

      <button type="button" className="k-btn k-btn--tertiary" onClick={() => { apiStaffSignOut(); setUnlocked(false); }}>
        Stop hosting
      </button>
      {onExit && <button type="button" className="k-btn k-btn--tertiary" onClick={onExit}>← Back to the game</button>}
    </AppPanel>
  );
}

// A member's career, and where they sit in the venue. The round resets every
// night; this does not, which is the point. Shown as a tab in Lip Sync Bingo
// so it is one tap from the game rather than buried in a profile.
// Your takes, on your phone. Shown in the Record tab above the venue stats,
// and — unlike those stats — available with no venue, no signal and no account,
// because the videos never left the device in the first place.
function MyTakes() {
  const [takes, setTakes] = useState(null);
  const [usage, setUsage] = useState({ count: 0, bytes: 0 });
  const [open, setOpen] = useState(null);        // id of the take being watched
  const urls = useRef(new Map());

  const load = useCallback(async () => {
    const rows = await listTakes();
    setTakes(rows);
    setUsage(await takesUsage());
  }, []);
  useEffect(() => { load(); }, [load]);
  // Object URLs are handed out per take and revoked together on unmount —
  // holding a video blob URL open is a real leak on a phone.
  useEffect(() => () => { for (const u of urls.current.values()) URL.revokeObjectURL(u); urls.current.clear(); }, []);
  const urlFor = (t) => {
    if (!urls.current.has(t.id)) urls.current.set(t.id, URL.createObjectURL(t.blob));
    return urls.current.get(t.id);
  };

  const drop = async (t) => {
    await removeTake(t.id);
    const u = urls.current.get(t.id);
    if (u) { URL.revokeObjectURL(u); urls.current.delete(t.id); }
    if (open === t.id) setOpen(null);
    await load();
  };

  if (takes === null) return null;
  if (!takes.length) {
    return (
      <AppPanel title="Your takes" subtitle="Saved on this phone">
        <p className="mem-fineprint">
          Perform a LIP SYNC square and the video is kept here — on your phone, not the venue's.
          Post it whenever you want, or delete it and it is gone.
        </p>
      </AppPanel>
    );
  }
  return (
    <AppPanel title="Your takes" subtitle={`${usage.count} on this phone · ${prettyBytes(usage.bytes)}`}>
      <p className="mem-fineprint">
        These never leave your phone unless you post them. The last {MAX_TAKES} are kept — older ones drop off.
      </p>
      <div className="takes-list">
        {takes.map((t) => (
          <div key={t.id} className={`take-row${open === t.id ? ' is-open' : ''}`}>
            <button type="button" className="take-head" onClick={() => setOpen(open === t.id ? null : t.id)}>
              <span className="take-when">{new Date(t.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className="take-song">
                <strong>{t.artist || 'Your take'}</strong>
                <small>{t.song}</small>
              </span>
              <span className={`take-tag take-tag--${t.mode}`}>{t.mode === 'venue' ? 'VENUE' : 'SOLO'}</span>
              <span className="take-size">{prettyBytes(t.size)}</span>
            </button>
            {open === t.id && (
              <div className="take-body">
                <video className="share-preview" src={urlFor(t)} controls playsInline />
                <SharePerformance blob={t.blob} artist={t.artist} song={t.song} />
                <button type="button" className="bingo-btn ghost" onClick={() => drop(t)}>Delete this take</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </AppPanel>
  );
}

function PlayerRecord() {
  const [stats, setStats] = useState(null);
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [s, b] = await Promise.all([apiMyStats(), apiLeaderboard()]);
        if (live) { setStats(s.stats); setBoard(b); }
      } catch { if (live) setErr('Could not reach the venue.'); }
    })();
    return () => { live = false; };
  }, []);
  // Takes are on the phone, so they are shown whether or not there is a venue
  // to talk to — that is the whole point of keeping them locally.
  if (!apiEnabled()) {
    return (
      <>
        <MyTakes />
        <AppPanel title="Your record" subtitle="Not connected">
          <p className="mem-fineprint">Connect to the venue to see your nights, titles and the leaderboard. Your takes above are on this phone either way.</p>
        </AppPanel>
      </>
    );
  }
  if (err) return <><MyTakes /><AppPanel title="Your record" subtitle="Offline"><p className="dash-empty">{err}</p></AppPanel></>;
  if (!stats) return <><MyTakes /><AppPanel title="Your record" subtitle="Loading…"><p className="dash-empty">Reading your card…</p></AppPanel></>;
  const cells = [
    ['Nights', stats.nights],
    ['Rounds won', stats.roundsWon],
    ['Battles won', stats.battlesWon],
    ['Squares', stats.squares],
    ['Performances', stats.performances],
    ['Best streak', stats.bestStreak],
  ];
  return (
    <>
      <MyTakes />
      <AppPanel title="Your record" subtitle={stats.playedTonight ? 'You have played tonight' : 'Not played yet tonight'}>
        <div className="rec-title k-frame k-frame--gold">
          <span className="k-label">Your title</span>
          <strong className="rec-title-name">{stats.title}</strong>
          {stats.next
            ? <span className="rec-next">{stats.next.need} more to <b>{stats.next.title}</b></span>
            : <span className="rec-next">Top title — nothing above this one</span>}
        </div>
        {/* A streak is the single strongest reason to come back tomorrow, so
            it gets its own line rather than being one stat among six. */}
        <div className={`rec-streak${stats.streak > 1 ? ' hot' : ''}`}>
          <strong>{stats.streak > 0 ? `${stats.streak} night${stats.streak === 1 ? '' : 's'} in a row` : 'No streak yet'}</strong>
          <span>{stats.playedTonight
            ? (stats.streak > 1 ? 'Come back tomorrow to keep it alive.' : 'Play again tomorrow to start a run.')
            : 'Take a card tonight to keep your streak.'}</span>
        </div>
        <div className="rec-grid">
          {cells.map(([label, value]) => (
            <div key={label} className="rec-cell">
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        {stats.battleWinRate != null && (
          <div className="rec-rate">
            <span className="k-label">Battle win rate</span>
            <div className="k-progress"><i style={{ width: `${stats.battleWinRate}%` }} /></div>
            <span className="rec-rate-num">{stats.battleWinRate}% · {stats.battlesWon}W {stats.battlesLost}L</span>
          </div>
        )}
      </AppPanel>
      <AppPanel title="Leaderboard" subtitle="Everyone who has played here">
        {board?.top?.length ? (
          <ol className="lb">
            {board.top.map((r) => (
              <li key={r.memberId} className={`lb-row${r.isMe ? ' is-me' : ''}${r.place <= 3 ? ' podium' : ''}`}>
                <span className="lb-place">{r.place}</span>
                <span className="lb-who"><strong>{r.name}{r.isMe ? ' (you)' : ''}</strong><small>{r.title}</small></span>
                <span className="lb-stat">{r.roundsWon}<i>rounds</i></span>
                <span className="lb-stat">{r.battlesWon}<i>battles</i></span>
                {r.streak > 1 && <span className="lb-streak">{r.streak}🔥</span>}
              </li>
            ))}
          </ol>
        ) : <p className="dash-empty">Nobody has played a round here yet. Be first.</p>}
      </AppPanel>
    </>
  );
}

// Two step sets, because connecting is not a step you are ABOUT to take once
// you have already taken it. Counting it anyway opened the venue path at
// "Join 2/3" — which tells a member they have skipped something, and leaves
// them looking for the step they missed. If the phone is on the venue, the
// journey is Join then Ready, and it starts at one.
const VENUE_STEPS_UNCONNECTED = ['Connect', 'Join', 'Ready'];
const VENUE_STEPS = ['Join', 'Ready'];

function VenueLobby({ navigate }) {
  const { state, err, refresh } = useBingoState(3000);
  const [busy, setBusy] = useState(false);
  // These used to swallow every error. A member tapped Join, nothing happened,
  // and there was nothing on screen to explain why — in a loud room that reads
  // as "the app is broken" and ends with them asking staff.
  //
  // It has to be declared HERE, above the not-connected return. Every hook this
  // component calls must run on every render: the first render happens before
  // the venue poll has answered, so err is null and all three run; the moment
  // the poll comes back 'not-connected' the early return below fires and this
  // one does not. React counts hooks, sees three become two, and throws — which
  // white-screens the whole app, taking the tab bar and Solo down with it. The
  // one screen a member opens when the venue is unreachable was the one screen
  // that could not survive the venue being unreachable.
  const [msg, setMsg] = useState('');
  // Auto-advance: once the host starts the round there is nothing left to
  // decide, so stop asking and put the member on their card. Waiting on a
  // lobby screen while the room has already started is the one place this flow
  // could still strand somebody.
  const live = state?.status === 'live';
  const iAmIn = !!state?.me;
  useEffect(() => {
    if (live && iAmIn) navigate('playerCard');
  }, [live, iAmIn, navigate]);

  if (err === 'not-connected') {
    return (
      <>
        <PlaySteps steps={VENUE_STEPS_UNCONNECTED} current={0} />
        <AppPanel title="Connect to the venue" subtitle="Step 1 of 3">
          <p className="dash-empty">Scan the QR at the door, or pick the room from the door screen.</p>
          <p className="mem-fineprint">Not at the venue tonight? Solo vs CPU works anywhere — the link is below.</p>
        </AppPanel>
      </>
    );
  }
  const me = state?.me;
  const join = async () => {
    setBusy(true); setMsg('');
    try { await apiBingoJoin(); await refresh(); }
    catch (e) { setMsg(e.message === 'Failed to fetch' ? "Couldn't reach the venue — check you're on the venue wifi." : (e.message || 'Could not join — try again.')); }
    setBusy(false);
  };
  const toggleReady = async () => {
    setBusy(true); setMsg('');
    try { await apiBingoReady(!me?.ready); await refresh(); }
    catch (e) { setMsg(e.message === 'Failed to fetch' ? "Couldn't reach the venue — check you're on the venue wifi." : (e.message || 'Could not change that — try again.')); }
    setBusy(false);
  };
  const step = !me ? 0 : 1;
  return (
    <>
      <PlaySteps steps={VENUE_STEPS} current={step} />
      <AppPanel
        title={!me ? 'Join tonight’s round' : me.ready ? 'You’re ready' : 'Mark yourself ready'}
        subtitle={state ? `${BINGO_STATUS_LABEL[state.status]} · ${state.deckName}` : 'Loading…'}>
        <p className="dash-num">{state ? `${state.playerCount} joined · ${state.readyCount} ready` : ''}</p>
        {!me ? (
          <>
            <button type="button" className="bingo-btn" disabled={busy} onClick={join}>Join Game</button>
            <p className="mem-fineprint">One tap. You get a card dealt from tonight’s deck.</p>
          </>
        ) : (
          <>
            <button type="button" className={`bingo-btn${me.ready ? ' ready' : ''}`} disabled={busy} onClick={toggleReady}>{me.ready ? '✓ Ready' : 'Mark Ready'}</button>
            <p className="mem-fineprint">{me.ready
              ? 'Waiting on the host to start. Your card opens on its own the moment it does.'
              : 'Tell the host you’re in, then the round can start.'}</p>
            <button type="button" className="bingo-btn ghost" onClick={() => navigate('playerCard')}>See my card →</button>
          </>
        )}
        {msg && <p className="gate-err">{msg}</p>}
      </AppPanel>
    </>
  );
}

// Member: their real dealt card, live-marked as the host calls phrases.
// Real bingo, not decoration: a called square only counts once the player
// actually taps it. Tapping is optimistic (instant local feedback) and
// reconciled by the next poll, but the server is the one that ultimately
// decides whether a claim is real — see bingoHasWin() on the backend.
// ── Playing along from somewhere else ────────────────────────────────────
// In the room you hear the song off the venue's speakers. From another city
// there is nothing — the video only ever played on the TV, which made a round
// unplayable for anyone not standing in the building.
//
// So the same clip can play on the member's own phone. Two rules make it the
// same game rather than an easier one:
//
//  * You hear it, you never see it. The YouTube frame is covered — the title
//    sits in that frame, and reading it would hand over the answer that the
//    whole card is built on working out by ear.
//  * It is off until asked for. A phone in the venue playing the song a
//    half-second behind the room is worse than useless, and browsers block
//    audio without a tap anyway.
function PlayAlong({ nowPlaying }) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    loadYoutubeApi().then(() => {
      if (!live || !hostRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(hostRef.current, {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1 },
        events: {
          onReady: (e) => { if (live) { e.target.unMute?.(); e.target.setVolume?.(100); setReady(true); } },
          onError: () => live && setErr('That one would not play here — the room still has it.'),
        },
      });
    }).catch(() => live && setErr('Could not load the player.'));
    return () => { live = false; };
  }, [on]);

  useEffect(() => {
    const p = playerRef.current;
    if (!on || !ready || !p) return;
    if (!nowPlaying?.videoId) { p.stopVideo?.(); return; }
    const clip = nowPlaying.clip;
    setErr('');
    if (clip?.seconds) {
      p.loadVideoById({ videoId: nowPlaying.videoId, startSeconds: clip.start || 0,
                        endSeconds: (clip.start || 0) + clip.seconds });
    } else {
      p.loadVideoById(nowPlaying.videoId);
    }
  }, [on, ready, nowPlaying?.videoId, nowPlaying?.clip?.start, nowPlaying?.clip?.seconds]);

  if (!on) {
    return (
      <button type="button" className="playalong-start" onClick={() => setOn(true)}>
        🎧 Playing from somewhere else? Hear the song here
      </button>
    );
  }
  return (
    <div className="playalong">
      {/* The frame is deliberately covered rather than merely small: the title
          is drawn inside it, and that is the answer. */}
      <div className="playalong-frame" aria-hidden="true"><div ref={hostRef} /></div>
      <div className="playalong-face">
        <span className="playalong-eq" aria-hidden="true"><i /><i /><i /><i /></span>
        <strong>{err ? 'Nothing playing' : nowPlaying?.videoId ? 'Playing in your ear' : 'Waiting for the next song'}</strong>
        <small>{err || 'Do not look it up — find it on your card.'}</small>
      </div>
      <button type="button" className="playalong-off" onClick={() => setOn(false)}>Stop</button>
    </div>
  );
}

function PlayerCardScreen({ navigate }) {
  const { state, err, refresh } = useBingoState(2500);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [localCovered, setLocalCovered] = useState(null); // optimistic override until the next poll lands
  // Every hook in this component has to run before any early return. `err`
  // starts empty and only becomes 'not-connected' once a poll fails, so
  // returning above the hooks below would change the hook count between two
  // renders of the same component and blow up with "rendered fewer hooks
  // than expected" the first time the backend goes away mid-round.
  const me = state?.me;
  const calls = state?.calls || [];
  const calledIds = new Set(calls.map((c) => c.id));
  const nowCalling = calls[calls.length - 1] || null;
  const covered = new Set(localCovered ?? me?.covered ?? []);
  // The server has run a 3-round ladder since the backend work, but nothing
  // on the player's screen ever said so. These drive the round chip.
  const roundNo = state?.roundNo || 1;
  const finalRound = state?.finalRound || 3;
  const pattern = state?.pattern || 'line';
  // Whether tonight's round is playing for money, decided by the rule rather
  // than by a number typed into a screen. `paidPlayers` is what the backend
  // says has actually been collected — until it reports that, this is a free
  // game and says so, which is the honest default. A round that claims a pot
  // nobody paid into is worse than a round that pays nothing.
  // The server does this arithmetic too, from the same shared rules, and its
  // answer is the one that counts — `state.cash` and `state.pot` are what the
  // house will actually pay. Recomputing here keeps the screen honest if a poll
  // is briefly stale, but it can only ever agree: same rule, same inputs.
  const cashCtx = { hosted: !!state?.hosted, paidPlayers: state?.paidPlayers ?? 0 };
  const cash = state?.mode === 'cash' && bingoIsCashGame(cashCtx);
  const pot = cash ? (state?.pot ?? bingoPot(cashCtx)) : 0;
  const progress = bingoProgress(me?.card, covered, pattern);

  // Being handed the mic, in a room. Everything about the vote is the server's
  // — this only works out whether the square is MINE, and remembers that I have
  // already answered so the offer does not come back while the same square is
  // still the one being called.
  // Paying in. The claim goes to the door; nothing here can make somebody paid.
  const [entryBusy, setEntryBusy] = useState(false);
  const claimEntry = async (rail) => {
    setEntryBusy(true);
    try { await apiBingoEntryClaim(rail); await refresh(); }
    catch (e) { setMsg(e.message || 'Could not send that — try again.'); }
    setEntryBusy(false);
  };

  const [micAnswered, setMicAnswered] = useState(null);
  const rawMic = state?.mic || null;
  const mic = rawMic ? {
    ...rawMic,
    iHold: !!me?.card?.some((sq) => sq && sq.id === rawMic.squareId),
    answered: micAnswered === rawMic.squareId,
  } : null;
  const answerMic = async (answer) => {
    if (!rawMic) return;
    setMicAnswered(rawMic.squareId);
    const outcome = micOutcome({ forced: !!rawMic.forced, answer });
    if (outcome === 'performing') { playSfx('battle'); setBattleOpen(true); return; }
    if (outcome === 'taken') {
      // No performance: the room let it go, so the square is simply covered.
      playSfx('mark');
      try { await apiBingoMark(rawMic.squareId, true); await refresh(); }
      catch { /* the poll will put it right */ }
      return;
    }
    // 'passed' or 'blocked' — either way the square is gone for this round.
    playSfx('buzz');
  };
  // Voting to make whoever holds it get up. Only offered to people who do not
  // hold the square, which the server enforces as well — a rule that lives only
  // in a hidden button is not a rule.
  const [micVoted, setMicVoted] = useState(null);
  const voteMic = async () => {
    if (!rawMic || micVoted === rawMic.squareId) return;
    setMicVoted(rawMic.squareId);
    try { await apiBingoMicVote(); await refresh(); } catch { /* already voted, or too late */ }
  };

  const clock = useCallClock(state);
  const gridRef = useRef(null);
  const [pop, firePop] = useOneShot(320);
  const [win, fireWin] = useOneShot(950);
  const [nope, fireNope] = useOneShot(420);
  // Ring the call sting when a genuinely new song lands (poll-driven, so guard
  // against re-firing on every 2.5s refresh of the same call).
  const lastHeard = useRef(null);
  useEffect(() => {
    if (!nowCalling) return;
    if (lastHeard.current === null) { lastHeard.current = nowCalling.id; return; } // don't shout on first load
    if (lastHeard.current === nowCalling.id) return;
    lastHeard.current = nowCalling.id;
    playSfx('call');
    // Nothing points at the square that was just called, on purpose. An
    // earlier version sparkled it so you could find it quickly, which meant
    // the app was answering the only question the game asks.
  }, [nowCalling?.id]);
  // Any battle this member is personally in takes over the screen — being
  // called out is time-critical and must not be buried under the card.
  const [myBattles, setMyBattles] = useState([]);
  // Battles you are personally in, PLUS any battle currently choosing its
  // roster. Picking is the whole room's decision — someone who does not hold
  // the square still votes on who performs for it — so /battle/mine alone is
  // not enough to put it on every phone.
  const loadBattles = async () => {
    try {
      const [mine, current] = await Promise.all([apiBattleMine(), apiBattleCurrent().catch(() => ({}))]);
      const list = mine.battles || [];
      const cur = current?.battle;
      if (cur && cur.status === 'picking' && !list.some((b) => b.id === cur.id)) list.unshift(cur);
      setMyBattles(list);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!apiEnabled() || !apiToken()) return undefined;
    loadBattles();
    const id = setInterval(loadBattles, 2500);
    return () => clearInterval(id);
  }, []);
  const activeBattle = myBattles[0] || null;
  const [battleOpen, setBattleOpen] = useState(false);
  // The battle screen is fixed and full-viewport; the page underneath must not
  // scroll behind it, or a swipe drags the card around under the overlay.
  useEffect(() => {
    if (!battleOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [battleOpen]);
  // Being put up to perform is time-critical — don't make them find it.
  useEffect(() => {
    if (activeBattle?.performingMemberId && activeBattle.performingMemberId === apiMemberId()) setBattleOpen(true);
  }, [activeBattle?.performingMemberId]);
  if (err === 'not-connected') return <NotConnectedBingo title="Your Card" />;
  const claim = async () => {
    setBusy(true); setMsg('');
    try { await apiBingoClaim(); await refresh(); setMsg('Bingo claimed! Waiting on the host to confirm…'); }
    catch (e) { setMsg(e.message === 'not a bingo yet' ? 'Not a bingo yet — cover a full pattern first!' : 'Could not submit — try again.'); }
    setBusy(false);
  };
  const tap = async (item, el) => {
    if (item.free) return;
    const wasCovered = covered.has(item.id);
    // Uncovering is always allowed — that is how you undo your own mistake.
    if (wasCovered) {
      const next = new Set(covered); next.delete(item.id);
      setLocalCovered([...next]);
      try { await apiBingoMark(item.id, false); } catch { setLocalCovered(null); }
      return;
    }
    // Covering is a GUESS. The card does not say which songs have played, so
    // the server is the only thing that knows whether this one has — ask it
    // first and let the answer drive the feedback.
    try {
      await apiBingoMark(item.id, true);
    } catch (e) {
      playSfx('buzz');
      fireNope(item.id);
      setMsg(/has not played/.test(e.message) ? "That one hasn't played yet — keep listening."
        : /battle|declined|lost/.test(e.message) ? e.message
        : 'Could not mark that — try again.');
      return;
    }
    const next = new Set(covered); next.add(item.id);
    playSfx('mark');
    firePop(item.id);
    burstCover(el, item.type === 'lipsync' ? 'lipsync' : 'violet');
    setMsg('');
    setLocalCovered([...next]);
    const after = bingoProgress(me.card, next, pattern);
    if (after.done >= after.need) {
      playSfx('win');
      fireWin('grid');
      celebrate(gridRef.current);
    }
  };
  if (!me) {
    return (
      <div className="staff-dash">
        <AppPanel title="Your Card" subtitle="Lip Sync Bingo">
          <p className="dash-empty">You haven't joined tonight's round yet.</p>
          <button type="button" className="bingo-btn" onClick={() => navigate('lobby')}>Go to Lobby</button>
        </AppPanel>
      </div>
    );
  }
  return (
    <div className="staff-dash">
      {/* The podium says more than a winner banner ever did: it names all
          three, and while the sprint runs it is a live race rather than an
          announcement. */}
      <PodiumBoard state={state} meId={apiMemberId()} onChanged={refresh} />
      {state.winner && !state.podium?.length && (
        <div className="bingo-winner-banner">
          <strong>🏆 {state.winner.name} won!</strong>
        </div>
      )}
      {/* A battle is its own full screen, never stacked on top of the card —
          together they were far taller than any phone. The card keeps a slim
          alert; the battle takes over when you enter it (and takes over on
          its own the moment you're actually up to perform). */}
      {activeBattle && !battleOpen && (
        <button type="button" className="battle-alert" onClick={() => setBattleOpen(true)}>
          <span className="battle-alert-dot" aria-hidden="true" />
          <span className="battle-alert-text">
            <strong>🎤 Lip Sync Battle</strong>
            <small>{activeBattle.artist} — {activeBattle.song}</small>
          </span>
          <span className="battle-alert-go">
            {activeBattle.status === 'picking' ? 'PICK'
              : activeBattle.me?.state === 'invited' ? 'RESPOND'
              : activeBattle.status === 'voting' ? 'VOTE' : 'ENTER'}
          </span>
        </button>
      )}
      {activeBattle && battleOpen && (
        <div className="battle-fullscreen">
          <button type="button" className="battle-close" onClick={() => setBattleOpen(false)} aria-label="Back to card">✕ Card</button>
          <div className="battle-fullscreen-body">
            {activeBattle.status === 'picking'
              ? <BattleRoster battle={activeBattle} meId={apiMemberId()} onChanged={loadBattles} />
              : <LipSyncBattlePanel battle={activeBattle} meId={apiMemberId()} onChanged={loadBattles} isHost={false} />}
          </div>
          <BattleChat battle={activeBattle} onChanged={loadBattles} />
        </div>
      )}
      {/* The same moment solo has, with a real room behind it. Who holds the
          square, who may vote and whether they have forced it all come from the
          server, so every phone shows the same verdict and the same deadline —
          two people holding one square must never be asked for different
          lengths of time, and the host has to be able to keep the night moving. */}
      {mic && mic.iHold && !mic.answered && (
        <MicOffer
          key={mic.squareId}
          artist={mic.artist}
          song={mic.song}
          endsAt={mic.endsAt}
          forced={mic.forced}
          votes={mic.votes}
          voters={mic.voters}
          onAnswer={answerMic}
        />
      )}
      {/* On a cash night, whether this member is actually in the pot. Shown
          above the card because it is the one thing that changes what the
          round is worth to them — and hidden entirely on a free night, which
          is most nights. */}
      {state?.mode === 'cash' && me && !me.paid && (
        <EntryPay
          fee={state.entryFee ?? 15}
          pot={state.pot ?? 0}
          paidPlayers={state.paidPlayers ?? 0}
          split={state.split || null}
          claim={me.entryClaim}
          onClaim={claimEntry}
          busy={entryBusy}
        />
      )}
      <AppPanel title="Your Card" subtitle={state ? `${BINGO_STATUS_LABEL[state.status]} · ${state.deckName}` : 'Loading…'}>
        {/* Layout follows lsb_sheet_03's assembled card screen: a status strip
            across the top (what's playing, how long is left, what this round
            pays and what it takes to win), the grid, then progress. In
            landscape the strip becomes the right-hand rail beside the grid —
            a 5x5 card is square, so it is sized off height and leaves a wide
            gutter that this exactly fills. */}
        <div className="play-rail">
        {/* The other side of the mic: a lip sync square is up and you do NOT
            hold it. Somebody is about to get a free square unless enough of the
            room says otherwise. Only shown to people entitled to vote — the
            server refuses the rest, so this is the polite half of the rule
            rather than the whole of it. */}
        {mic && !mic.iHold && !mic.forced && (
          <button type="button" className={`mic-force${micVoted === mic.squareId ? ' voted' : ''}`}
                  onClick={voteMic} disabled={micVoted === mic.squareId}>
            <span className="mic-force-top">
              {micVoted === mic.squareId ? '✓ You voted — make them sing' : '🎤 Make them sing for it'}
            </span>
            <span className="mic-force-sub">{mic.artist} — {mic.song} · {mic.votes} of {mic.voters}</span>
            <span className="mic-force-bar"><i style={{ width: `${mic.voters ? Math.round((mic.votes / mic.voters) * 100) : 0}%` }} /></span>
          </button>
        )}
        {mic && !mic.iHold && mic.forced && (
          <p className="mic-forced-note">🔥 The room forced it — they have to perform {mic.song}.</p>
        )}
        <div className="bingo-side">
          {/* Calling stops while the podium is being settled, so "Now playing
              — Listen" would be telling players to listen to silence. The
              podium above is the screen at that point. */}
          {state.status !== 'podium' && (
          <div className="k-hud">
            {/* Deliberately NOT the artist and song. The player is meant to
                work out what is playing by listening to it — printing the
                answer on their own card is the whole game given away. The
                host screen and the TV still show it. */}
            <div className="k-hud-now k-frame k-frame--flat">
              <span className="k-label">{nowCalling ? 'Now playing' : 'Standing by'}</span>
              {nowCalling ? (
                <>
                  <strong className="k-value k-listen">🎧 Listen</strong>
                  {/* Not while a call-out is live. A lip sync square is
                      performed for, never tapped — telling the player to tap it
                      contradicts the rule the battle above is enforcing, on the
                      same screen, about the same song.

                      Saying so gives nothing away either: the call-out already
                      names the artist and the song. The secret is only a secret
                      until somebody is called out on it. */}
                  <span className="k-hud-song k-dim">{activeBattle
                    ? 'This one is performed for — answer the call-out above'
                    : 'Find it on your card and tap it'}</span>
                </>
              ) : <span className="k-hud-song k-dim">Waiting on the host…</span>}
            </div>
            {clock && (
              <div className={`k-timer${clock.left < 10000 ? ' k-timer--low' : ''}`} style={{ '--k-pct': clock.pct }}
                   role="timer" aria-label={`${Math.floor(clock.left / 1000)} seconds left`}>
                <span>{clock.text}</span>
              </div>
            )}
            {/* Round + goal. Until now the round ladder existed only on the
                server, so a player had no way to know that round 2 needs two
                lines and round 3 needs the whole card. */}
            {/* What this round pays, and it is the truth or it is nothing.
                This used to print a flat $5 / $10 / $20 on every card drawn,
                whoever was in the room and whether or not a cent had been
                collected. A round pays only when a host is running it and at
                least two members have paid the entry; the pot is what was
                actually paid in. Everything else says free play. */}
            <div className={`k-hud-round k-frame k-frame--gold${cash ? '' : ' is-free'}`}>
              <span className="k-label"><img className="k-hud-crown" src={TILE_ART.bonus} alt="" aria-hidden="true" />Round {roundNo} of {finalRound}</span>
              {cash
                ? <strong className="k-money" title={`Pot $${pot} from ${state?.paidPlayers ?? 0} entries`}>{bingoPrizeLabel(roundNo, cashCtx)}</strong>
                : <strong className="k-freeplay">Free play</strong>}
              <span className="k-hud-goal">{BINGO_PATTERN_GOAL[pattern] || '1 LINE'}</span>
            </div>
          </div>
          )}
          {msg && <p className={`k-nudge${nope.id ? ' k-nudge--no' : ''}`}>{msg}</p>}
          {/* The already-called list used to live here. It is a list of
              answers — anyone who missed a song could read it off instead of
              listening — so it belongs to the host screen and the TV, not to
              a player's card. */}
        </div>
        </div>

        {/* Same two-part shape as the solo card: the board here, the status
            rail above it on a phone and beside it on anything wider. */}
        <div className="play-board">
        <div className={`k-grid${win.id ? ' k-grid--win' : ''}`} key={`g${win.token}`} ref={gridRef}>
          {me.card.map((item, i) => {
            const isFree = i === 12;
            const isCovered = isFree || covered.has(item.id);
            const isLip = item.type === 'lipsync';
            // Two states only: free and covered. There is deliberately no
            // "called" state here — lighting up the squares the host has
            // already played would hand the player every answer. The lip sync
            // mark stays, because that is a property of the square itself and
            // not a hint about what is playing.
            const state3 = isFree ? 'free' : isCovered ? 'covered' : '';
            const cls = ['k-tile', state3 && `k-tile--${state3}`, isLip && !isCovered && 'k-tile--lipsync',
              pop.id === item.id && 'k-tile--pop', nope.id === item.id && 'k-tile--nope'].filter(Boolean).join(' ');
            const mark = isCovered && !isFree ? TILE_ART.covered : isLip ? TILE_ART.lipsync : null;
            return (
              <button type="button" key={`${i}-${item.id}-${pop.id === item.id ? pop.token : 0}-${nope.id === item.id ? nope.token : 0}`} data-item={item.id} className={cls} onClick={(e) => tap(item, e.currentTarget)} disabled={isFree || state.status !== 'live'}>
                {isFree ? 'Free space' : (
                  <>
                    <span className="k-tile-artist">{item.artist}</span>
                    <span className="k-tile-song">{item.song}</span>
                  </>
                )}
                {mark && <img className="k-tile-mark" src={mark} alt="" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="k-cardfoot">
          <div className="k-progressrow">
            <span className="k-label">{progress.done} / {progress.need} to bingo</span>
            <div className="k-progress"><i style={{ width: `${Math.round((progress.done / progress.need) * 100)}%` }} /></div>
          </div>
          {!state.winner && (
            <button type="button" className="k-btn k-btn--gold" disabled={busy || me.hasPendingClaim || state.status !== 'live'} onClick={claim}>
              {me.hasPendingClaim ? 'Claim pending…' : 'Claim Bingo!'}
            </button>
          )}
          {/* For anyone not in the room: the song, in their ear. */}
          {state.status === 'live' && <PlayAlong nowPlaying={state.nowPlaying} />}
          {/* Tapping what you hear is the game, so it stays the default. This
              is here for anyone who would rather watch the room than their
              phone — it never fills a LIP SYNC square, because those are won
              by performing. */}
          <button type="button" className={`k-autofill${me.autofill ? ' is-on' : ''}`} disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try { await apiBingoAutofill(!me.autofill); setLocalCovered(null); await refresh(); }
                    catch (e) { setMsg(e.message || 'Could not change that — try again.'); }
                    setBusy(false);
                  }}>
            <span className="k-autofill-box" aria-hidden="true">{me.autofill ? '✓' : ''}</span>
            {me.autofill ? 'Filling my card for me' : 'Fill my card for me'}
          </button>
        </div>
        </div>
      </AppPanel>
    </div>
  );
}

// Host: run the round — start/call, watch players, approve/reject claims.
// Whatever battle is live, surfaced at the top of Host Control so the host
// can run the floor without hunting for it.
function HostBattleControl() {
  const [battle, setBattle] = useState(null);
  const [open, setOpen] = useState(false);
  const load = async () => { try { setBattle((await apiBattleCurrent()).battle); } catch { /* ignore */ } };
  useEffect(() => {
    if (!apiEnabled() || !apiStaffToken()) return undefined;
    load();
    const id = setInterval(load, 2500);
    return () => clearInterval(id);
  }, []);
  // The moment a battle needs the host — someone is up, or the vote is in —
  // it opens itself rather than waiting to be found.
  useEffect(() => {
    if (battle?.status === 'performing' || battle?.status === 'voting') setOpen(true);
  }, [battle?.status]);
  if (!battle || battle.status === 'done' || battle.status === 'void') return null;
  // Same shape as the player's card: a slim always-visible alert, and the
  // battle takes over the screen when the host opens it. Rendered inline it
  // was a tall panel sitting on top of the controls the host needs between
  // songs, and it pushed the console past the fold on a phone.
  const PHASE = { picking: 'ROOM IS PICKING', pending: 'WAITING ON THEM', performing: 'PERFORMING', voting: 'VOTING' };
  return (
    <>
      <button type="button" className="battle-alert" onClick={() => setOpen(true)}>
        <span className="battle-alert-dot" aria-hidden="true" />
        <span className="battle-alert-text">
          <strong>🎤 {PHASE[battle.status] || 'LIVE BATTLE'}</strong>
          <small>{battle.artist} — {battle.song}</small>
        </span>
        <span className="battle-alert-go">OPEN</span>
      </button>
      {open && (
        <div className="battle-fullscreen">
          <button type="button" className="battle-close" onClick={() => setOpen(false)} aria-label="Back to host controls">✕ Controls</button>
          <div className="battle-fullscreen-body">
            {battle.status === 'picking'
              ? <BattleRoster battle={battle} meId={null} pickable={false} isHost onChanged={load} />
              : <LipSyncBattlePanel battle={battle} meId={null} onChanged={load} isHost />}
          </div>
        </div>
      )}
    </>
  );
}

// ── The house settling everybody else's money ──────────────────────────────
//
// Four queues, one screen, in the order somebody has been waiting. Nothing on
// it is automatic: every row is a person here saying the money actually
// arrived, and every row says what pressing it does BEFORE it is pressed.
//
// A shared venue code can read this and cannot move any of it. That is not a
// UI choice — the server refuses it — but the screen says so rather than
// letting somebody find out by tapping.
// ── Can this venue actually reach a member? ────────────────────────────────
//
// The question this screen exists to answer is not "is a key saved". It is
// "will a code arrive", and the only honest way to know that is to have one
// arrive. So the last control here sends a real message to a real inbox.
//
// Until a sender is configured the venue shows the code on screen instead,
// which means anybody can sign up as any contact. That is fine for a laptop
// serving its own room and it is not fine on the open internet, so this says
// so in words rather than leaving it to a green tick nobody reads.
// ── The thing you post ─────────────────────────────────────────────────────
//
// Launching by handing out a URL means the URL IS the venue: it gets pasted
// into a group chat, it outlives the night, and the address it points at
// changes every time the venue's tunnel restarts.
//
// A code posted as a picture is a different object. Somebody points a camera
// at it, the app opens already connected to this room, and what lands on their
// home screen afterwards is the logo rather than a browser bookmark. This is
// the screen that makes that picture, big enough to photograph off a phone and
// clean enough to put on a flyer.
function PosterScreen({ onDone }) {
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState(false);
  const base = apiBase();
  const app = `${location.origin}${import.meta.env.BASE_URL}`;
  // ?connect points the app at THIS venue on a plain camera scan — no in-app
  // scanner, no typing an address, and no room list to guess from.
  const url = `${app}?connect=${encodeURIComponent(base)}`
    + (ref.trim() ? `&ref=${encodeURIComponent(ref.trim().toUpperCase())}` : '');
  const qr = useQrDataUrl(url, ui.fullLogoClear);

  return (
    <AppPanel title="Post this" subtitle="A code, not a link">
      {!base && (
        <p className="k-nudge k-nudge--no">
          This phone is not connected to the venue, so there is nothing to point a code at yet.
        </p>
      )}
      <div className="poster">
        {qr ? <img className="poster-qr" src={qr} alt="Join HITMANS VIP" /> : <div className="qr-load">Making the code…</div>}
        <strong className="poster-name">HITMANS VIP After Spot</strong>
        <span className="poster-sub">Point your camera. Members only.</span>
      </div>

      <p className="earn-note">
        Screenshot this and post it. Whoever scans it lands in the sign-up already
        pointed at this room — they agree to the covenant, say what they do, choose
        a cause to stand behind, and take a membership. Then they are in.
      </p>

      <div className="jub-form">
        <label className="jub-label">Credit somebody for who this brings (optional)</label>
        {/* The same poster, made twice with two codes, is how a promoter gets
            paid for the people they actually brought. */}
        <input className="jub-input" placeholder="Member code — e.g. TRINA2L5" value={ref}
               maxLength={16} onChange={(e) => setRef(e.target.value)} />
        <p className="jub-note">
          Every member has a code. Whoever's code is on this poster earns 15% of the
          membership each person takes after scanning it.
        </p>
      </div>

      <button type="button" className="bingo-btn" disabled={!base}
              onClick={async () => {
                try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
                catch { setCopied(false); }
              }}>
        {copied ? 'Link copied' : 'Copy the link behind it'}
      </button>
      <p className="mem-fineprint">
        The code and the link are the same thing. Post the picture — the link is
        here for a message where a picture will not do.
      </p>
      {onDone && <button type="button" className="bingo-btn ghost" onClick={onDone}>← Back</button>}
    </AppPanel>
  );
}

function SignInSetupPanel() {
  const [st, setSt] = useState(null);
  const [form, setForm] = useState({ resend_api_key: '', mail_from: '', venue_display_name: '' });
  const [test, setTest] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setSt(await apiNotifyStatus()); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load.'); }
  };
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setErr(''); setMsg('');
    try { await fn(); await load(); } catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };
  if (!st) return <AppPanel title="Sign-ups" subtitle="How members get their code"><p className="dash-empty">{err || 'Loading…'}</p></AppPanel>;

  return (
    <AppPanel title="Sign-ups" subtitle="How members get their code">
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      {msg && <p className="k-nudge">{msg}</p>}

      <div className={`sign-state ${st.canSend ? 'on' : 'off'}`}>
        <strong>{st.canSend ? 'Codes are being sent' : 'Codes are shown on screen'}</strong>
        <span>{st.meaning}</span>
        {st.email && <span className="dash-num">Email · {st.email} · from {st.from}</span>}
        {st.sms && <span className="dash-num">Text · {st.smsFrom}</span>}
      </div>

      {st.smsNote && <p className="earn-note">{st.smsNote}</p>}

      <div className="jub-form">
        <label className="jub-label">Set up email codes</label>
        {/* One provider, named, rather than a list of five the owner has to
            choose between at midnight. The server accepts the others; this
            screen recommends the one that opens fastest. */}
        <p className="jub-note">
          Make a free account at resend.com, add your domain (or use their test
          address to start), and paste the API key here.
        </p>
        <input className="jub-input" placeholder="Resend API key (re_…)" value={form.resend_api_key}
               onChange={(e) => setForm((f) => ({ ...f, resend_api_key: e.target.value }))} />
        <input className="jub-input" placeholder="Send from — door@yourdomain.com" value={form.mail_from}
               onChange={(e) => setForm((f) => ({ ...f, mail_from: e.target.value }))} />
        <input className="jub-input" placeholder="Name on the message — HITMANS VIP After Spot"
               value={form.venue_display_name}
               onChange={(e) => setForm((f) => ({ ...f, venue_display_name: e.target.value }))} />
        <button type="button" className="bingo-btn gold"
                disabled={busy || !(form.resend_api_key.trim() && form.mail_from.trim())}
                onClick={() => act(async () => {
                  await apiNotifyConfig({
                    resend_api_key: form.resend_api_key.trim(),
                    mail_from: form.mail_from.trim(),
                    ...(form.venue_display_name.trim() ? { venue_display_name: form.venue_display_name.trim() } : {}),
                  });
                  setForm((f) => ({ ...f, resend_api_key: '' }));
                  setMsg('Saved. Now send yourself a test.');
                })}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* The only control on this screen that proves anything. */}
      <div className="jub-form">
        <label className="jub-label">Prove it works</label>
        <p className="jub-note">Send a real message to yourself. Do this before the night, not during it.</p>
        <input className="jub-input" placeholder="your@email.com" value={test}
               onChange={(e) => setTest(e.target.value)} />
        <button type="button" className="bingo-btn" disabled={busy || !st.canSend || test.trim().length < 5}
                onClick={() => act(async () => {
                  const r = await apiNotifyTest(test.trim());
                  setMsg(`Sent via ${r.via}. ${r.note}`);
                })}>
          {busy ? 'Sending…' : 'Send me a test'}
        </button>
      </div>
    </AppPanel>
  );
}

function HouseMoneyPanel() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ref, setRef] = useState('');

  const load = async () => {
    try { setData(await apiHouseMoney()); setErr(''); }
    catch (e) { setErr(e.message || 'Could not load.'); }
  };
  useEffect(() => { load(); }, []);
  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message || 'That did not go through.'); }
    setBusy(false);
  };

  if (!data) {
    return <AppPanel title="Money" subtitle="Waiting on somebody here"><p className="dash-empty">{err || 'Loading…'}</p></AppPanel>;
  }
  const total = data.orders.length + data.toSecure.length + data.toPayOut.length
              + data.licenses.length + data.credits.length;

  return (
    <AppPanel title="Money" subtitle={total ? `${total} waiting on somebody here` : 'Nothing outstanding'}>
      {err && <p className="k-nudge k-nudge--no">{err}</p>}
      {!data.canSettle && (
        <p className="k-nudge k-nudge--no">
          You are signed in on the venue code. You can see what is outstanding, but
          approving money takes a named sign-in.
        </p>
      )}
      {total === 0 && <p className="dash-empty">Every sale, booking, licence and commission is settled.</p>}

      {data.orders.length > 0 && (
        <div className="give-list">
          <h4>Sales to confirm</h4>
          {data.orders.map((o) => (
            <div key={o.orderId} className="give-row">
              <div className="dash-info">
                <strong>{o.title}</strong>
                <span className="dash-num">
                  {o.buyer} → {o.seller} · {MONEY(o.priceCents)} · seller gets {MONEY(o.toSellerCents)}
                </span>
              </div>
              <button type="button" className="bingo-btn compact gold" disabled={busy || !data.canSettle}
                      onClick={() => act(() => apiMarketSettle(o.orderId, true, 'cash'))}>Money in</button>
              <button type="button" className="bingo-btn compact ghost" disabled={busy || !data.canSettle}
                      onClick={() => act(() => apiMarketSettle(o.orderId, false))}>No</button>
            </div>
          ))}
        </div>
      )}

      {data.toSecure.length > 0 && (
        <div className="give-list">
          <h4>Bookings to secure</h4>
          {data.toSecure.map((b) => (
            <div key={b.bookingId} className="give-row">
              <div className="dash-info">
                <strong>{b.title}</strong>
                <span className="dash-num">
                  {b.client} booked {b.provider} · deposit {MONEY(b.depositCents)} · stake {MONEY(b.stakeCents)}
                </span>
              </div>
              <button type="button" className="bingo-btn compact gold" disabled={busy || !data.canSettle}
                      onClick={() => act(() => apiGigSecure(b.bookingId))}>Deposit in</button>
            </div>
          ))}
        </div>
      )}

      {data.toPayOut.length > 0 && (
        <div className="give-list">
          <h4>Bookings to pay out</h4>
          {data.toPayOut.map((b) => (
            <div key={b.bookingId} className="give-row">
              <div className="dash-info">
                <strong>{b.title}</strong>
                <span className="dash-num">
                  {b.provider} gets {MONEY(b.toProviderCents)} · venue {MONEY(b.toVenueCents)} · stake back {MONEY(b.stakeCents)}
                </span>
              </div>
              <button type="button" className="bingo-btn compact gold" disabled={busy || !data.canSettle}
                      onClick={() => act(() => apiGigSettle(b.bookingId))}>Pay it out</button>
            </div>
          ))}
        </div>
      )}

      {data.licenses.length > 0 && (
        <div className="give-list">
          <h4>Licences to confirm</h4>
          {data.licenses.map((g) => (
            <div key={g.grantId} className="give-row">
              <div className="dash-info">
                <strong>{g.work}</strong>
                <span className="dash-num">
                  {g.buyer} → {g.creator} · {g.typeLabel} · {MONEY(g.priceCents)}
                </span>
              </div>
              <button type="button" className="bingo-btn compact gold" disabled={busy || !data.canSettle}
                      onClick={() => act(() => apiLicenseSettle(g.grantId, true))}>Money in</button>
              <button type="button" className="bingo-btn compact ghost" disabled={busy || !data.canSettle}
                      onClick={() => act(() => apiLicenseSettle(g.grantId, false))}>No</button>
            </div>
          ))}
        </div>
      )}

      {data.credits.length > 0 && (
        <div className="give-list">
          <h4>Commission owed</h4>
          {/* A payout carries a reference so it reconciles against a bank line
              later. Without one there is a payment nobody can trace. */}
          <input className="jub-input" placeholder="Reference — cash drawer, Zelle, cheque no."
                 maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} />
          {data.credits.map((k) => (
            <div key={k.creditId} className="give-row">
              <div className="dash-info">
                <strong>{k.referrer} · {MONEY(k.commissionCents)}</strong>
                <span className="dash-num">{k.eventLabel} · on {MONEY(k.grossCents)}</span>
              </div>
              <button type="button" className="bingo-btn compact gold"
                      disabled={busy || !data.canSettle || !ref.trim()}
                      onClick={() => act(async () => { await apiReferralPay([k.creditId], ref.trim()); })}>
                Paid
              </button>
            </div>
          ))}
        </div>
      )}
    </AppPanel>
  );
}

function HostScreen({ initialTab = 'run' }) {
  const [board, setBoard] = useState(null);
  const [tab, setTab] = useState(initialTab);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const liveRef = useRef(true);
  const poll = async () => {
    if (!apiEnabled() || !apiStaffToken()) { setErr('not-connected'); return; }
    try { const b = await apiBingoBoard(); if (liveRef.current) { setBoard(b); setErr(''); } } catch { if (liveRef.current) setErr('Could not reach the venue backend.'); }
  };
  useEffect(() => {
    liveRef.current = true;
    poll();
    const id = setInterval(poll, 3000);
    return () => { liveRef.current = false; clearInterval(id); };
  }, []);
  // A claim is the one thing on this screen that cannot wait, so it pulls the
  // host to it rather than sitting behind a tab they might not be looking at.
  const claimCount = board?.claims.length || 0;
  const seenClaims = useRef(0);
  useEffect(() => {
    if (claimCount > seenClaims.current) setTab('claims');
    seenClaims.current = claimCount;
  }, [claimCount]);
  if (err === 'not-connected') return <NotConnectedBingo title="Host Control" />;
  // Re-poll right after an action instead of waiting up to 3s for the next
  // tick — a host tapping "Call Next Phrase" should see it change instantly.
  const act = async (fn) => { setBusy(true); try { await fn(); await poll(); } catch { /* ignore */ } setBusy(false); };
  const resolve = async (claimId, approve) => { setBusy(true); try { await apiBingoResolve(claimId, approve); await poll(); } catch { /* ignore */ } setBusy(false); };
  return (
    <div className="staff-dash host-console">
      {/* A live battle always shows, whichever tab you are on — it is the one
          thing on this screen that is time-critical. */}
      <HostBattleControl />
      {/* The rest is tabbed. Stacked, these five panels ran ~730px past the
          fold on a phone, and a host hunting for "Approve" mid-round while
          scrolling is how a claim gets missed. */}
      <div className="staff-hub-tabs host-tabs">
        {[
          ['run', 'Run'],
          ['claims', `Claims${board?.claims.length ? ` (${board.claims.length})` : ''}`],
          ['players', `Players${board?.players.length ? ` (${board.players.length})` : ''}`],
          ['support', 'Support'],
          ['money', 'Money'],
          ['media', 'TV'],
        ].map(([id, label]) => (
          <button type="button" key={id} className={`staff-hub-tab${tab === id ? ' on' : ''}${id === 'claims' && board?.claims.length ? ' alert' : ''}`}
                  onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {(board?.status === 'podium' || board?.podium?.length > 0) && (
        <PodiumBoard state={board} meId={null} isHost onChanged={poll} />
      )}
      {tab === 'money' && <HouseMoneyPanel />}
      {tab === 'run' && (
        <AppPanel title="Host Control" subtitle={board ? `${BINGO_STATUS_LABEL[board.status]} · ${board.deckName} · ${BINGO_PATTERN_NAME[board.pattern]}` : 'Loading…'}>
          {/* Said here, where the round gets started, rather than only on the
              TV tab a host might never open. Calling songs with no YouTube
              access looks like the app is broken; it is just not set up. */}
          {board && board.youtubeEnabled === false && (
            <button type="button" className="k-nudge k-nudge--no media-warn" onClick={() => setTab('media')}>
              🔇 No YouTube access — calling a song will play nothing. Tap to set it up.
            </button>
          )}
          {board?.youtubeEnabled && board.mediaError && (
            <button type="button" className="k-nudge k-nudge--no media-warn" onClick={() => setTab('media')}>
              🔇 {board.mediaError} — tap to check the setup.
            </button>
          )}
          <div className="bingo-status-row">
            <span>{board ? `${board.players.length} players` : ''}</span>
            <span>{board ? `${board.calls.length} called` : ''}</span>
          </div>
          {board?.calls.length > 0 && (
            <div className="bingo-current-call">
              {board.calls[board.calls.length - 1].type === 'lipsync' && <span className="bingo-cell-tag">LIP SYNC</span>}
              <strong>{board.calls[board.calls.length - 1].artist}</strong>
              <span>{board.calls[board.calls.length - 1].song}</span>
              {/* Which part of the track is playing, and how we know. The host
                  should be able to see when a window was guessed rather than
                  read off the crowd's own replays. */}
              {board.nowPlaying?.clip?.seconds && (
                <span className={`clip-src clip-src--${board.nowPlaying.clip.source || 'estimate'}`}>
                  {(() => {
                    const c = board.nowPlaying.clip;
                    const mm = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
                    const span = `${mm(c.start)}–${mm(c.start + c.seconds)}`;
                    return c.source === 'replayed' ? `▶ ${span} · hook from replays`
                      : c.source === 'chapter' ? `▶ ${span} · chorus chapter`
                      : `▶ ${span} · estimated`;
                  })()}
                </span>
              )}
            </div>
          )}
          {/* Free or cash, and it is the host's call every night — never
              inferred from how many turned up. A round that starts charging
              because the room filled is a round nobody agreed to pay for.
              The pot below is what the door has actually taken, not a target. */}
          <div className={`host-money${board?.mode === 'cash' ? ' is-cash' : ''}`}>
            <button type="button" className="host-money-toggle" disabled={busy}
                    onClick={() => act(() => apiBingoMode(board?.mode === 'cash' ? 'free' : 'cash'))}>
              {board?.mode === 'cash'
                ? `💵 Cash game · $${board?.entryFee ?? 15} entry`
                : '🆓 Free play · tap to make it a cash game'}
            </button>
            {board?.mode === 'cash' && (
              <p className="host-money-pot">
                {board?.paidPlayers ?? 0} paid · pot <b>${board?.pot ?? 0}</b>
                {(board?.paidPlayers ?? 0) < 2 && <em> — needs 2 paid before it pays anything</em>}
              </p>
            )}
          </div>
          <button type="button" className="bingo-btn" disabled={busy || board?.status === 'live'} onClick={() => act(apiBingoStart)}>Start Round</button>
          <button type="button" className="bingo-btn gold" disabled={busy || board?.status !== 'live'} onClick={() => act(apiBingoCall)}>Call Next Phrase</button>
          {/* The night is manual by default — the host decides when the next
              song goes on. Auto hands that to the play timer for hosts who
              would rather work the room than the phone. */}
          <button type="button" className={`bingo-btn ghost${board?.autoCall ? ' ready' : ''}`} disabled={busy}
                  onClick={() => act(() => apiBingoAuto(!board?.autoCall))}>
            {board?.autoCall ? `✓ Auto-play is ON · every ${Math.round((board?.songMs || 60000) / 1000)}s` : 'Songs are manual · switch to auto'}
          </button>
          {/* Deck and pattern live in Game Menu, which is one tap away. They
              were on both screens, and the copy here was the last thing
              pushing this console past the fold. */}
        </AppPanel>
      )}

      {tab === 'claims' && (
        <>
        {/* Money first. A bingo claim ends a round; an entry claim is somebody
            standing there having sent $15 and waiting to be let in, which is
            the more urgent of the two and the one that costs the venue a
            player if it is missed. */}
        {board?.mode === 'cash' && (
          <AppPanel title="Entries to confirm" subtitle={`$${board?.entryFee ?? 15} each · pot $${board?.pot ?? 0}`}>
            {(!board?.entryClaims || board.entryClaims.length === 0) && (
              <p className="dash-empty">Nobody is waiting to pay in.</p>
            )}
            {board?.entryClaims?.map((ec) => (
              <div key={ec.id} className="entry-claim-row">
                <div className="dash-info">
                  <strong>{ec.name}</strong>
                  <span className="dash-num">{ec.number} · says {RAIL_LABEL[ec.rail] || ec.rail}{ec.reference ? ` · ${ec.reference}` : ''}</span>
                </div>
                <button type="button" className="bingo-btn gold compact" disabled={busy}
                        onClick={() => act(() => apiBingoEntryResolve(ec.id, true))}>
                  ✓ Got it — ${board?.entryFee ?? 15}
                </button>
                <button type="button" className="bingo-btn ghost compact" disabled={busy}
                        onClick={() => act(() => apiBingoEntryResolve(ec.id, false))}>
                  Not received
                </button>
              </div>
            ))}
          </AppPanel>
        )}
        <AppPanel title="Pending claims" subtitle="Approve to end the round">
          {board && board.claims.length === 0 && <p className="dash-empty">No claims yet.</p>}
          {board?.claims.map((c) => (
            <div key={c.id} className="bingo-claim-row">
              <div className="dash-info"><strong>{c.name}</strong><span className="dash-num">{c.number}</span></div>
              <div className="bingo-claim-actions">
                <button type="button" className="pay-confirm" disabled={busy} onClick={() => resolve(c.id, true)}>✓ Approve</button>
                <button type="button" className="pay-void" disabled={busy} onClick={() => resolve(c.id, false)}>Reject</button>
              </div>
            </div>
          ))}
        </AppPanel>
        </>
      )}

      {tab === 'players' && (
        <AppPanel title="Players" subtitle="Joined tonight's round">
          {board && board.players.length === 0 && <p className="dash-empty">Nobody has joined yet.</p>}
          <div className="host-scroll">
            {board?.players.map((p) => (
              <div key={p.member_id} className={`dash-row${p.paid ? ' is-paid' : ''}`}>
                <span className={`dash-dot ${p.ready ? 'green' : 'amber'}`} />
                <div className="dash-info"><strong>{p.name}</strong><span className="dash-num">{p.number}</span></div>
                {/* Taking the money, on the list of people standing in front of
                    you. On a cash night this is the whole job: tap a name when
                    they pay, tap it again if you took it in error. Nothing else
                    in the app can mark somebody paid — a member's own phone is
                    refused by the server. */}
                {board?.mode === 'cash' ? (
                  <button type="button" className={`entry-btn${p.paid ? ' on' : ''}`} disabled={busy}
                          onClick={() => act(() => apiBingoEntry(p.member_id, { paid: !p.paid }))}>
                    {p.paid ? `✓ Paid $${board?.entryFee ?? 15}` : `Take $${board?.entryFee ?? 15}`}
                  </button>
                ) : (
                  <span className="dash-when">{p.ready ? 'ready' : 'not ready'}</span>
                )}
              </div>
            ))}
          </div>
        </AppPanel>
      )}

      {tab === 'support' && <JubileeQueue />}

      {tab === 'media' && (
        <>
          {/* The key is set once and then it is the venue's business, not the
              host's. A password box sitting on the Music tab every night is an
              invitation to break something that is already working, so it only
              appears when songs actually are not playing — which is the only
              night anyone needs it. */}
          <MediaSetupPanel onChange={poll} />
          <TvAutoMediaPanel nowPlaying={board?.nowPlaying} onChange={poll} />
        </>
      )}
    </div>
  );
}

// Host: search YouTube and send a video to every TV Display — no personal
// login needed, since search runs on the venue's own key and playback embeds
// a public video. If the venue hasn't added a YOUTUBE_API_KEY yet, search
// fails with a clear "not connected" message instead of silently doing nothing.
// Turning the music on. Nothing plays until the venue has one of these, and
// until now there was no way to set either from inside the app — the endpoints
// existed but nothing called them, so a host whose songs were silent had no
// way to find out why, let alone fix it.
//
// Two routes on purpose. A YouTube API key is the quick one and belongs to the
// venue. Signing in with Google is the one that matters for ads: search then
// runs on the host's own account, and playback on a screen signed into their
// Premium account is ad-free. Neither removes ads on a screen signed into
// nobody — that is a property of the account watching, not of this app.
function MediaSetupPanel({ onChange }) {
  const [ytStatus, setYtStatus] = useState(null);
  const [google, setGoogle] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = async () => {
    try {
      const [y, g] = await Promise.all([apiYoutubeKeyStatus(), apiGoogleStatus().catch(() => null)]);
      setYtStatus(y); setGoogle(g);
    } catch { setMsg('Could not read the venue media settings.'); }
  };
  useEffect(() => { load(); }, []);
  const saveKey = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await apiSetYoutubeKey(key.trim());
      setKey('');
      setMsg(r.youtubeEnabled ? 'Saved — songs will play from the next call.' : 'Key cleared.');
      await load(); await onChange?.();
    } catch (e) { setMsg(e.message || 'Could not save that key.'); }
    setBusy(false);
  };
  const on = !!ytStatus?.youtubeEnabled || !!google?.connected;

  // Still reading the venue's settings — say nothing rather than flashing
  // "NOT SET UP" at a host whose music is fine.
  if (ytStatus === null) return null;

  // Working. The host gets one line confirming it and no controls: the key
  // lives in the venue's own settings, it is already there, and there is
  // nothing here for them to do. The exception is a venue that is set up and
  // still silent — that has a cause, and the cause comes from YouTube itself.
  if (on) {
    return ytStatus?.lastError ? (
      <AppPanel title="Music &amp; TV" subtitle="Set up, but the last song did not play">
        <p className="k-nudge k-nudge--no">{ytStatus.lastError}</p>
        <p className="mem-fineprint">
          Usually a song with no playable result, or the day&apos;s search quota. The next call will try again.
        </p>
      </AppPanel>
    ) : (
      <p className="mem-fineprint">♪ Songs are on — calling one plays it.</p>
    );
  }

  return (
    <AppPanel title="Music &amp; TV" subtitle="Not set up — songs will NOT play">
      <p className="k-nudge k-nudge--no">
        No YouTube access yet, so calling a song plays nothing. Set up either option below — one is enough.
        This is the only night you should see this panel.
      </p>
      <div className="media-route">
        <div className="media-route-head">
          <strong>Host&apos;s Google account</strong>
          <span className={`k-chip${google?.connected ? ' k-chip--cyan' : ''}`}>
            {google?.connected ? 'Connected' : google?.configured ? 'Not connected' : 'Unavailable'}
          </span>
        </div>
        <p className="mem-fineprint">
          Searches run on your account and its quota. If the screen you play on is signed into your
          YouTube Premium, playback has no ads — that comes from the account watching, not from here.
        </p>
        {google?.configured ? (
          google.connected
            ? <button type="button" className="k-btn k-btn--tertiary" disabled={busy}
                      onClick={async () => { setBusy(true); try { await apiGoogleDisconnect(); await load(); } catch { /* ignore */ } setBusy(false); }}>
                Disconnect Google
              </button>
            : <a className="k-btn k-btn--go media-google" href={googleSignInUrl()}>Sign in with Google</a>
        ) : (
          <p className="mem-fineprint">
            This venue has no Google app set up yet, so this route is off. It needs GOOGLE_CLIENT_ID and
            GOOGLE_CLIENT_SECRET in the venue&apos;s .env — see SELF_HOST.md. The API key below works without it.
          </p>
        )}
      </div>
      <div className="media-route">
        <div className="media-route-head">
          <strong>Venue YouTube API key</strong>
          <span className={`k-chip${ytStatus?.youtubeEnabled ? ' k-chip--cyan' : ''}`}>
            {ytStatus?.usingHostKey ? `Set ${ytStatus.hint || ''}` : ytStatus?.youtubeEnabled ? 'From .env' : 'Not set'}
          </span>
        </div>
        <p className="mem-fineprint">
          A key from the Google Cloud console with the YouTube Data API enabled. Quickest route — it does
          nothing about ads, but it does make the songs play.
        </p>
        <label className="host-code-label">Paste a key
          <input type="password" value={key} autoComplete="off" placeholder="AIza…"
                 onChange={(e) => { setKey(e.target.value); setMsg(''); }} />
        </label>
        <button type="button" className="k-btn k-btn--secondary" disabled={busy || !key.trim()} onClick={saveKey}>
          {busy ? 'Saving…' : 'Save key'}
        </button>
      </div>
      {msg && <p className="mem-fineprint">{msg}</p>}
    </AppPanel>
  );
}

function TvAutoMediaPanel({ nowPlaying, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const search = async (e) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true); setErr(''); setResults(null);
    try { const r = await apiYoutubeSearch(q.trim()); setResults(r.results || []); }
    catch (e2) { setErr(e2.message || 'Search failed.'); }
    setBusy(false);
  };
  const play = async (v) => { setBusy(true); try { await apiBingoPlayMedia(v.videoId, v.title); await onChange?.(); } catch { /* ignore */ } setBusy(false); };
  const stop = async () => {
    setBusy(true); try { await apiBingoStopMedia(); await onChange?.(); } catch { /* ignore */ } setBusy(false); };
  return (
    <AppPanel title="TV Auto Media" subtitle="Search a song, send it to every TV">
      {nowPlaying?.videoId ? (
        <div className="bingo-nowplaying-row">
          <div className="dash-info"><strong>▶ Now playing</strong><span className="dash-num">{nowPlaying.title || nowPlaying.videoId}</span></div>
          <button type="button" className="pay-void" disabled={busy} onClick={stop}>Stop</button>
        </div>
      ) : (
        <p className="dash-empty">Nothing playing on the TV right now.</p>
      )}
      <form className="bingo-media-search" onSubmit={search}>
        <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a song or artist…" />
        <button type="submit" className="bingo-btn gold" disabled={busy || q.trim().length < 2}>Search</button>
      </form>
      {err && <p className="dash-empty">{err}</p>}
      {results && results.length === 0 && !err && <p className="dash-empty">No results.</p>}
      {results?.map((v) => (
        <div key={v.videoId} className="bingo-media-result">
          {v.thumbnail && <img src={v.thumbnail} alt="" />}
          <div className="dash-info"><strong>{v.title}</strong><span className="dash-num">{v.channel}</span></div>
          <button type="button" className="bingo-btn ready" disabled={busy} onClick={() => play(v)}>Play on TV</button>
        </div>
      ))}
    </AppPanel>
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

// Call history — every phrase called this round, most recent first.
function SongQueueScreen() {
  const { state, err } = useBingoState(3000);
  if (err === 'not-connected') return <NotConnectedBingo title="Call History" />;
  const calls = [...(state?.calls || [])].reverse();
  return (
    <div className="staff-dash">
      <AppPanel title="Call History" subtitle={state ? `${calls.length} called · ${state.deckName}` : 'Loading…'}>
        {calls.length === 0 && <p className="dash-empty">Nothing called yet this round.</p>}
        <div className="bingo-call-log">
          {calls.map((c, i) => <span key={c.id} className={`bingo-chip${i === 0 ? ' latest' : ''}`}>{c.type === 'lipsync' ? '🎤 ' : ''}{c.artist} — {c.song}</span>)}
        </div>
      </AppPanel>
    </div>
  );
}

// Winner spotlight + any claims still waiting on a host decision.
function WinnerScreen() {
  const [board, setBoard] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const liveRef = useRef(true);
  const poll = async () => {
    if (!apiEnabled() || !apiStaffToken()) { setErr('not-connected'); return; }
    try { const b = await apiBingoBoard(); if (liveRef.current) { setBoard(b); setErr(''); } } catch { if (liveRef.current) setErr('Could not reach the venue backend.'); }
  };
  useEffect(() => {
    liveRef.current = true;
    poll();
    const id = setInterval(poll, 3000);
    return () => { liveRef.current = false; clearInterval(id); };
  }, []);
  const { state } = useBingoState(4000);
  if (err === 'not-connected') return <NotConnectedBingo title="Winner · Payout" />;
  const resolve = async (claimId, approve) => { setBusy(true); try { await apiBingoResolve(claimId, approve); await poll(); } catch { /* ignore */ } setBusy(false); };
  return (
    <div className="staff-dash">
      {state?.winner ? (
        <div className="bingo-winner-banner">
          <strong>🏆 {state.winner.name} won this round!</strong>
          <span>{state.winner.number} · pay out the prize, then reset for the next game.</span>
        </div>
      ) : (
        <AppPanel title="Winner · Payout" subtitle="No winner yet">
          <p className="dash-empty">Waiting on a confirmed bingo this round.</p>
        </AppPanel>
      )}
      <AppPanel title="Pending claims" subtitle="Validate before you pay out">
        {board && board.claims.length === 0 && <p className="dash-empty">No claims waiting.</p>}
        {board?.claims.map((c) => (
          <div key={c.id} className="bingo-claim-row">
            <div className="dash-info"><strong>{c.name}</strong><span className="dash-num">{c.number}</span></div>
            <div className="bingo-claim-actions">
              <button type="button" className="pay-confirm" disabled={busy} onClick={() => resolve(c.id, true)}>✓ Approve</button>
              <button type="button" className="pay-void" disabled={busy} onClick={() => resolve(c.id, false)}>Reject</button>
            </div>
          </div>
        ))}
      </AppPanel>
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

const PARTY_STATUS_LABEL = { idle: 'No battle right now', battling: 'Battle live — vote now!', ended: 'Battle over' };
const PARTY_REACTIONS = ['🔥', '😍', '😂', '👏', '💯', '⭐'];

// Party Mode / Battlerz — Team Purple vs Team Pink, real audience voting.
// Host starts/ends the battle and needs 5+ players in the room; members
// vote for a team and can react once they've picked one. Same shared state
// for everyone, same as the rest of Lip Sync Bingo.
// ── Standalone Lip Sync Battle ───────────────────────────────────────────
// Bingo battles happen because a square got called. This is the night that is
// only battles, in the three shapes a room actually asks for:
//   bracket — a seeded knockout down to one champion
//   king    — whoever wins holds the floor until somebody takes it
//   open    — anyone calls anyone out, and the crowd's votes are the table
// The bout itself is an ordinary battle, so LipSyncBattlePanel and BattleChat
// below are the same components the bingo flow uses — nothing is duplicated.
const EVENT_FORMATS = [
  { id: 'bracket', name: 'Bracket', blurb: 'Seeded knockout. Lose once and you are out.' },
  { id: 'king', name: 'King of the Hill', blurb: 'Winner holds the floor. Challengers line up.' },
  { id: 'open', name: 'Open Floor', blurb: 'Anyone calls anyone out. Crowd votes rank it.' },
];
const EVENT_FORMAT_NAME = { bracket: 'Bracket', king: 'King of the Hill', open: 'Open Floor' };

// What the format is doing right now, in one line, for the header.
function eventSubtitle(ev) {
  if (!ev) return 'Lip Sync Battle';
  if (ev.status === 'lobby') return `${EVENT_FORMAT_NAME[ev.format]} · lobby open`;
  if (ev.status === 'done') return `${EVENT_FORMAT_NAME[ev.format]} · finished`;
  if (ev.format === 'bracket') return `Bracket · round ${ev.round} · ${ev.remaining} left`;
  if (ev.format === 'king') return ev.king ? `${ev.king.name} holds the floor · ${ev.king.reign} straight` : 'King of the Hill · no king yet';
  return `Open Floor · ${ev.roster.length} on the list`;
}

function EventStandings({ ev, meId, onChallenge, busy }) {
  const knockout = ev.format === 'bracket';
  return (
    <div className="ev-standings">
      <div className="ev-standings-head">
        <span>{knockout ? 'Field' : 'Standings'}</span>
        <span>{knockout ? 'Seed · W–L' : 'W–L · votes'}</span>
      </div>
      {ev.roster.map((p, i) => {
        const out = p.state === 'out';
        const isKing = ev.king?.memberId === p.memberId;
        return (
          <div key={p.memberId} className={`ev-row${out ? ' is-out' : ''}${isKing ? ' is-king' : ''}`}>
            {/* The venue's placement plates are 259x93 — legible on the
                champion banner, mush at rank-column size. So the leader is
                marked in gold instead, and the plates stay where they read. */}
            <span className={`ev-rank${!knockout && i === 0 && p.wins > 0 ? ' is-lead' : ''}`}>
              {knockout ? (p.seed ? `#${p.seed}` : '—') : i + 1}
            </span>
            <span className="ev-name">
              {isKing && <span className="ev-crown" aria-label="king">👑</span>}
              {p.name}{p.memberId === meId ? ' (you)' : ''}
              {out && <small> · out R{p.outRound}</small>}
            </span>
            <span className="ev-record">{p.wins}–{p.losses}{!knockout && <small> · {p.votes}</small>}</span>
            {onChallenge && !out && p.memberId !== meId
              && (ev.format !== 'king' || isKing) && (
              <button type="button" className="ev-challenge" disabled={busy} onClick={() => onChallenge(p.memberId)}>
                {ev.format === 'king' ? 'Challenge' : 'Call out'}
              </button>
            )}
          </div>
        );
      })}
      {ev.roster.length === 0 && <p className="dash-empty">Nobody has joined yet.</p>}
    </div>
  );
}

// The bracket as it actually played out, grouped by round. Rendered from the
// bouts the backend recorded rather than a predicted tree, so a bye or a
// declined bout shows the truth instead of a diagram that no longer matches.
function EventBracket({ ev }) {
  if (!ev.bouts.length) return null;
  const rounds = [...new Set(ev.bouts.map((b) => b.round))].sort((a, b) => a - b);
  return (
    <div className="ev-bracket">
      {rounds.map((r) => (
        <div key={r} className="ev-round">
          <span className="ev-round-label">{ev.format === 'bracket' ? `Round ${r}` : `Bout ${r}`}</span>
          {ev.bouts.filter((b) => b.round === r).map((b) => (
            <div key={b.id} className={`ev-bout is-${b.status}`}>
              <span className="ev-bout-names">{b.names || '—'}</span>
              <span className="ev-bout-song">{b.artist ? `${b.artist} — ${b.song}` : ''}</span>
              <span className="ev-bout-state">
                {b.status === 'done' ? '✓' : b.status === 'void' ? '—' : '● live'}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function LipSyncBattleScreen({ isHost }) {
  const [ev, setEv] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [format, setFormat] = useState('bracket');
  const [size, setSize] = useState(8);
  const [title, setTitle] = useState('');
  const meId = apiMemberId();

  const load = useCallback(async () => {
    try { const r = await apiEventState(); setEv(r.event); setErr(''); }
    catch (e) { setErr(e.message); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!apiEnabled()) { setLoaded(true); return undefined; }
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!apiEnabled()) return <NotConnectedBingo title="Lip Sync Battle" />;
  if (!loaded) {
    return (
      <div className="staff-dash">
        <AppPanel title="Lip Sync Battle" subtitle="Loading…"><p className="dash-empty">One second…</p></AppPanel>
      </div>
    );
  }

  const live = ev && ev.status === 'live';
  const canChallenge = live && ev.format !== 'bracket' && !ev.bout && ev.joined;

  return (
    <div className="staff-dash">
      {ev?.champion && ev.status === 'done' && (
        <div className="ev-champion">
          <img className="ev-champion-plate" src={ui.winner.first} alt="1st place" />
          <strong>{ev.champion.name} takes it</strong>
        </div>
      )}

      {/* The bout takes the screen while one is on the floor — same components
          the bingo battle uses, so it behaves identically to what the room
          already knows. */}
      {ev?.bout && (
        <>
          <div className="ev-onfloor">
            <img src={ui.party.battleCard} alt="" aria-hidden="true" />
            <span>{(ev.bout.players || []).map((p) => p.name).join('  vs  ')}</span>
          </div>
          <LipSyncBattlePanel battle={ev.bout} meId={meId} onChanged={load} isHost={isHost} />
          <BattleChat battle={ev.bout} onChanged={load} />
        </>
      )}

      <AppPanel title={ev?.title || 'Lip Sync Battle'} subtitle={eventSubtitle(ev)}>
        {/* The venue's own plate, not a typed heading — this screen is the one
            the room looks at on the big screen. */}
        <img className="ev-banner" src={ui.party.hypeMeter} alt="Battlerz Mode — lipsync, battle, dominate" />
        {err && <p className="roster-err">{err}</p>}

        {/* No event: the host opens one, everyone else waits. */}
        {!ev || ev.status === 'done' ? (
          isHost ? (
            <div className="ev-create">
              <div className="ev-formats">
                {EVENT_FORMATS.map((f) => (
                  <button type="button" key={f.id}
                          className={`ev-format${format === f.id ? ' is-on' : ''}`}
                          onClick={() => setFormat(f.id)}>
                    <strong>{f.name}</strong><small>{f.blurb}</small>
                  </button>
                ))}
              </div>
              <label className="bingo-picker-label">Name it (optional)
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Friday Night Bracket" />
              </label>
              {format === 'bracket' && (
                <label className="bingo-picker-label">Field size
                  <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
                    {[4, 8, 16].map((n) => <option key={n} value={n}>{n} players</option>)}
                  </select>
                </label>
              )}
              <button type="button" className="ev-start" disabled={busy}
                      onClick={() => act(() => apiEventCreate(format, title.trim() || null, size))}>
                <img src={ui.party.startBattle} alt="Start battle — let the lip sync war begin!" />
                <span className="ev-start-sub">{busy ? 'Opening…' : `Open the ${EVENT_FORMAT_NAME[format]} lobby`}</span>
              </button>
            </div>
          ) : (
            <p className="dash-empty">
              {ev?.status === 'done'
                ? 'That one is a wrap. The host opens the next battle when the floor is ready.'
                : 'No battle running right now. The host opens the next one.'}
            </p>
          )
        ) : null}

        {/* Lobby: sign up, then the host starts it. */}
        {ev?.status === 'lobby' && (
          <>
            <p className="ev-hint">
              {EVENT_FORMATS.find((f) => f.id === ev.format)?.blurb}
              {ev.size ? ` Room for ${ev.size}.` : ''}
            </p>
            <EventStandings ev={ev} meId={meId} />
            {!isHost && (
              <button type="button" className={`k-btn ${ev.joined ? '' : 'k-btn--go'}`} disabled={busy}
                      onClick={() => act(() => (ev.joined ? apiEventLeave() : apiEventJoin()))}>
                {ev.joined ? 'Leave the lobby' : "I'm in — sign me up"}
              </button>
            )}
            {isHost && (
              <>
                <button type="button" className="k-btn k-btn--go" disabled={busy || ev.roster.length < 2}
                        onClick={() => act(apiEventStart)}>
                  {ev.roster.length < 2 ? 'Need 2 signed up' : `Start with ${ev.roster.length}`}
                </button>
                <button type="button" className="bingo-btn ghost" disabled={busy} onClick={() => act(apiEventEnd)}>
                  Cancel this event
                </button>
              </>
            )}
          </>
        )}

        {/* Live, between bouts. */}
        {live && (
          <>
            {ev.format === 'king' && ev.king && (
              <p className="ev-hint">👑 <strong>{ev.king.name}</strong> holds the floor — {ev.king.reign} in a row.</p>
            )}
            <EventStandings ev={ev} meId={meId}
                            onChallenge={canChallenge ? ((id) => act(() => apiEventChallenge(id))) : null}
                            busy={busy} />
            {canChallenge && (
              <p className="ev-hint">
                {ev.format === 'king' ? 'Tap the king to challenge for the floor.' : 'Tap anyone to call them out.'}
              </p>
            )}
            {isHost && !ev.bout && (
              <button type="button" className="k-btn k-btn--go" disabled={busy} onClick={() => act(() => apiEventNext())}>
                Put the next bout on the floor
              </button>
            )}
            {isHost && (
              <button type="button" className="bingo-btn ghost" disabled={busy} onClick={() => act(apiEventEnd)}>
                End the event
              </button>
            )}
            <EventBracket ev={ev} />
          </>
        )}

        {ev?.status === 'done' && (
          <>
            <EventStandings ev={ev} meId={meId} />
            <EventBracket ev={ev} />
          </>
        )}
      </AppPanel>
    </div>
  );
}

function PartyScreen({ isHost }) {
  const [party, setParty] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const liveRef = useRef(true);
  const poll = async () => {
    if (!apiEnabled()) { setErr('not-connected'); return; }
    try { const p = await apiPartyState(); if (liveRef.current) { setParty(p); setErr(''); } }
    catch { if (liveRef.current) setErr('Could not reach the venue backend.'); }
  };
  useEffect(() => {
    liveRef.current = true;
    poll();
    const id = setInterval(poll, 2500);
    return () => { liveRef.current = false; clearInterval(id); };
  }, []);
  if (err === 'not-connected') return <NotConnectedBingo title="Party Mode" />;
  const act = async (fn) => { setBusy(true); setErr(''); try { await fn(); await poll(); } catch (e) { setErr(e.message || 'Could not do that.'); } setBusy(false); };
  const vote = async (team, reaction) => { setBusy(true); try { await apiPartyVote(team, reaction); await poll(); } catch { /* ignore */ } setBusy(false); };

  const total = (party?.votesA || 0) + (party?.votesB || 0);
  const pctA = total ? Math.round((party.votesA / total) * 100) : 50;
  const myTeam = party?.myVote?.team;

  return (
    <div className="staff-dash">
      <AppPanel title="Party Mode Battlerz" subtitle={party ? PARTY_STATUS_LABEL[party.status] : 'Loading…'}>
        {party?.status === 'idle' && !isHost && <p className="dash-empty">No battle right now — check back when the host starts one.</p>}
        {party && party.status !== 'idle' && (
          <>
            <div className="party-vs-row">
              <div className={`party-team a${myTeam === 'a' ? ' mine' : ''}`}><strong>{party.teamA}</strong><span>{party.votesA} votes</span></div>
              <div className="party-vs">VS</div>
              <div className={`party-team b${myTeam === 'b' ? ' mine' : ''}`}><strong>{party.teamB}</strong><span>{party.votesB} votes</span></div>
            </div>
            <div className="party-hype-bar"><span style={{ width: `${pctA}%` }} /></div>
            {party.status === 'battling' && !isHost && (
              <div className="party-vote-row">
                <button type="button" className="bingo-btn" disabled={busy} onClick={() => vote('a')}>{myTeam === 'a' ? '✓ Voted ' : 'Vote '}{party.teamA}</button>
                <button type="button" className="bingo-btn gold" disabled={busy} onClick={() => vote('b')}>{myTeam === 'b' ? '✓ Voted ' : 'Vote '}{party.teamB}</button>
              </div>
            )}
            {party.status === 'ended' && party.winner && (
              <div className="bingo-winner-banner"><strong>🏆 {party.winner === 'a' ? party.teamA : party.teamB} wins the battle!</strong></div>
            )}
          </>
        )}
      </AppPanel>
      {!isHost && party?.status === 'battling' && (
        <AppPanel title="React" subtitle={myTeam ? 'Hype up your team' : 'Vote for a team first'}>
          <div className="party-reaction-row">
            {PARTY_REACTIONS.map((r) => (
              <button type="button" key={r} className="party-reaction-chip" disabled={busy || !myTeam} onClick={() => vote(myTeam, r)}>{r}</button>
            ))}
          </div>
        </AppPanel>
      )}
      {isHost && (
        <AppPanel title="Host Controls" subtitle={`Minimum ${party?.minPlayers ?? 2} players to start`}>
          <p className="dash-num">{party ? `${party.playerCount} in the room` : ''}</p>
          {err && <p className="dash-empty">{err}</p>}
          <button type="button" className="bingo-btn" disabled={busy || party?.status === 'battling'} onClick={() => act(apiPartyStart)}>Start Battle</button>
          <button type="button" className="bingo-btn gold" disabled={busy || party?.status !== 'battling'} onClick={() => act(apiPartyEnd)}>End Battle</button>
          <button type="button" className="bingo-btn ghost" disabled={busy} onClick={() => act(apiPartyReset)}>Reset</button>
        </AppPanel>
      )}
    </div>
  );
}

// ── VIP Table Booking — the in-house "Cal.com": a member requests a night +
// party size, staff approves with a table assignment or declines with a
// reason. Same op-log → SQLite pattern as everything else, no external
// scheduling service. ──
const BOOKING_STATUS_LABEL = { pending: 'Pending', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };

function TableBookingScreen() {
  const [bookings, setBookings] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [night, setNight] = useState('');
  const [partySize, setPartySize] = useState(4);
  const [note, setNote] = useState('');
  const [formErr, setFormErr] = useState('');

  const load = () => {
    if (!apiEnabled() || !apiToken()) { setErr('Connect to a venue backend to request a table.'); setBookings([]); return; }
    apiBookingMine().then((r) => { setBookings(r.bookings || []); setErr(''); }).catch(() => setErr('Could not load your bookings.'));
  };
  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);

  const submit = async () => {
    setFormErr(''); setBusy(true);
    try {
      await apiBookingRequest(night, Number(partySize), note.trim());
      setNight(''); setNote(''); setPartySize(4);
      load();
    } catch (e) { setFormErr(e.message || 'Could not request a table.'); }
    setBusy(false);
  };
  const cancel = async (id) => { setBusy(true); try { await apiBookingCancel(id); load(); } catch { /* ignore */ } setBusy(false); };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="staff-dash">
      <AppPanel title="Book a VIP Table" subtitle="Pick a night, party size, and any notes for the host">
        {err && <p className="dash-empty">{err}</p>}
        {!err && (
          <div className="auth-card booking-form">
            <label>Night<input type="date" min={today} value={night} onChange={(e) => setNight(e.target.value)} /></label>
            <label>Party size<input type="number" min="1" max="20" value={partySize} onChange={(e) => setPartySize(e.target.value)} /></label>
            <label>Note (optional)<input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Birthday, bottle service, etc." /></label>
            {formErr && <p className="gate-err">{formErr}</p>}
            <button type="button" className="bingo-btn" disabled={busy || !night} onClick={submit}>Request Table</button>
          </div>
        )}
      </AppPanel>
      {bookings && bookings.length > 0 && (
        <AppPanel title="Your Requests" subtitle="Most recent first">
          {bookings.map((b) => (
            <div key={b.id} className="pay-claim booking-row">
              <div className="pay-claim-info">
                <strong>{b.night} · {b.party_size} {b.party_size === 1 ? 'guest' : 'guests'}</strong>
                <span className="dash-num">
                  <span className={`booking-status booking-status-${b.status}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
                  {b.table_label ? ` · ${b.table_label}` : ''}
                  {b.reason ? ` · ${b.reason}` : ''}
                </span>
              </div>
              {['pending', 'approved'].includes(b.status) && (
                <div className="pay-claim-actions">
                  <button type="button" className="pay-void" disabled={busy} onClick={() => cancel(b.id)}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </AppPanel>
      )}
    </div>
  );
}

// Staff-facing board — approve (with a table assignment) or decline (with an
// optional reason), inline, no native browser dialogs.
function TableBookingBoardScreen() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null); // { id, kind: 'approve' | 'decline' }
  const [value, setValue] = useState('');

  const load = () => {
    if (!apiEnabled() || !apiStaffToken()) { setErr('Connect to a venue backend to manage table bookings.'); setRows([]); return; }
    apiBookingBoard().then((r) => { setRows(r.bookings || []); setErr(''); }).catch(() => setErr('Could not load table bookings.'));
  };
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);

  const openApprove = (id) => { setAction({ id, kind: 'approve' }); setValue('VIP Booth'); };
  const openDecline = (id) => { setAction({ id, kind: 'decline' }); setValue(''); };
  const cancelAction = () => { setAction(null); setValue(''); };
  const confirmAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'approve') await apiBookingDecide(action.id, true, value.trim());
      else await apiBookingDecide(action.id, false, '', value.trim());
      setAction(null); setValue('');
      load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const pending = (rows || []).filter((b) => b.status === 'pending');
  const decided = (rows || []).filter((b) => b.status !== 'pending');

  return (
    <div className="staff-dash">
      <AppPanel title="Table Bookings" subtitle="Pending requests">
        {err && <p className="dash-empty">{err}</p>}
        {rows && pending.length === 0 && !err && <p className="dash-empty">No pending requests — you're all caught up.</p>}
        {pending.map((b) => (
          <div key={b.id} className="pay-claim booking-row">
            <div className="pay-claim-info">
              <strong>{b.name} · {b.night} · {b.party_size} {b.party_size === 1 ? 'guest' : 'guests'}</strong>
              <span className="dash-num">{b.number}{b.note ? ` · ${b.note}` : ''}</span>
              {action?.id === b.id && (
                <div className="booking-inline-action">
                  <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
                    placeholder={action.kind === 'approve' ? 'Table / booth (e.g. VIP Booth 3)' : 'Reason (optional)'} />
                  <button type="button" className="pay-confirm" disabled={busy} onClick={confirmAction}>
                    {action.kind === 'approve' ? '✓ Confirm Approve' : 'Confirm Decline'}
                  </button>
                  <button type="button" className="bingo-btn ghost" disabled={busy} onClick={cancelAction}>Cancel</button>
                </div>
              )}
            </div>
            {action?.id !== b.id && (
              <div className="pay-claim-actions">
                <button type="button" className="pay-confirm" disabled={busy} onClick={() => openApprove(b.id)}>✓ Approve</button>
                <button type="button" className="pay-void" disabled={busy} onClick={() => openDecline(b.id)}>Decline</button>
              </div>
            )}
          </div>
        ))}
      </AppPanel>
      {decided.length > 0 && (
        <AppPanel title="Decided" subtitle="Approved & declined, upcoming nights">
          {decided.map((b) => (
            <div key={b.id} className="pay-claim booking-row">
              <div className="pay-claim-info">
                <strong>{b.name} · {b.night} · {b.party_size} {b.party_size === 1 ? 'guest' : 'guests'}</strong>
                <span className="dash-num">
                  <span className={`booking-status booking-status-${b.status}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
                  {b.table_label ? ` · ${b.table_label}` : ''}
                  {b.reason ? ` · ${b.reason}` : ''}
                </span>
              </div>
            </div>
          ))}
        </AppPanel>
      )}
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

// Turns a /me/timeline event into the row shape this screen already renders.
function timelineEventToRow(e) {
  switch (e.kind) {
    case 'signup': return { ic: '◇', tone: 'muted', title: 'Member account created', sub: 'Welcome', t: e.at, status: 'Done' };
    case 'membership': return { ic: '★', tone: 'gold', title: `${e.tier}${e.vip ? ' VIP' : ''} membership activated`, sub: e.payment ? `Paid with ${e.payment}` : 'Membership active', t: e.at, status: 'Success' };
    case 'otw': return { ic: '🚗', tone: 'ok', title: 'On the way', sub: 'Signaled heading to the venue', t: e.at, status: 'Sent' };
    case 'admit': return { ic: '✓', tone: 'ok', title: 'Verified at the door', sub: 'Entry approved' + (e.searched ? ' · searched' : ''), t: e.at, status: 'Approved' };
    case 'checkout': return { ic: '🚪', tone: 'muted', title: 'Left the venue', sub: 'Checked out for the night', t: e.at, status: 'Left' };
    case 'decision': return { ic: '⚑', tone: 'bad', title: DECISION_LABEL[e.status] || 'Flagged', sub: 'Recorded by staff', t: e.at, status: DECISION_LABEL[e.status] || 'Flag' };
    default: return null;
  }
}

function HistoryScreen() {
  const member = useMember();
  const auth = useAuth();
  const { rank } = rankFor(member?.entries || 0);
  const backend = apiEnabled() && apiToken();
  const [remoteEvents, setRemoteEvents] = useState(null);

  useEffect(() => {
    if (!backend) return undefined;
    let live = true;
    const poll = async () => { try { const r = await apiMyTimeline(); if (live) setRemoteEvents(r.events); } catch { /* ignore */ } };
    poll();
    const id = setInterval(poll, 10000);
    return () => { live = false; clearInterval(id); };
  }, [backend]);

  // Backend timeline is the complete, authoritative picture (every OTW,
  // admit, checkout, re-entry, and staff decision — not just this device's
  // local guesses) — use it whenever connected. Local/demo mode keeps the
  // original state-derived feed.
  let rows;
  if (backend && remoteEvents) {
    rows = remoteEvents.map(timelineEventToRow).filter(Boolean);
  } else {
    rows = [];
    if (member) {
      if (member.verifiedAt) rows.push({
        ic: '✓', tone: 'ok', title: 'Verified at the door',
        sub: member.number ? `Entry approved · ${member.number}` : 'Entry approved',
        t: member.verifiedAt, status: 'Approved',
      });
      if (member.purchasedAt) rows.push({
        ic: '★', tone: 'gold', title: `${member.tier} membership activated`,
        sub: member.payment ? `Paid with ${member.payment}` : 'Membership active',
        t: member.purchasedAt, status: 'Success',
      });
    }
    const since = auth?.member?.since;
    if (since) rows.push({ ic: '◇', tone: 'muted', title: 'Member account created', sub: auth.member.name ? `Welcome, ${auth.member.name}` : 'Welcome', t: since, status: 'Done' });
    // real penalty events (trespass / ban) recorded for this member
    if (member?.number) {
      penalizedMembers().filter((d) => String(d.number).toUpperCase() === String(member.number).toUpperCase())
        .forEach((d) => rows.push({ ic: '⚑', tone: 'bad', title: d.kind === 'ban' ? 'Banned' : 'Trespass flag', sub: d.reason || 'Flagged by security', t: d.at || Date.now(), status: d.kind === 'ban' ? 'Ban' : 'Flag' }));
    }
  }
  rows.sort((a, b) => b.t - a.t);

  const stats = [
    { label: 'Nights in', value: member?.entries ?? 0 },
    { label: 'Loyalty', value: (member?.loyalty ?? 0).toLocaleString() },
    { label: 'Rank', value: member ? rank.name : '—' },
    { label: 'Tickets', value: member?.tickets ?? 0 },
  ];

  return (
    <div className="history-screen">
      <div className="hist-stats">
        {stats.map((s) => (
          <div key={s.label} className="hist-stat"><span>{s.label}</span><strong>{s.value}</strong></div>
        ))}
      </div>
      <div className="hist-feed">
        <h3>Activity</h3>
        {rows.length === 0 ? (
          <div className="hist-empty">
            <span className="hist-empty-ic">🗓</span>
            <strong>No activity yet</strong>
            <p>Your check-ins, entries, and membership events will show up here automatically.</p>
          </div>
        ) : rows.map((r, i) => (
          <div key={i} className="hist-row">
            <span className={`hist-ic hist-ic-${r.tone}`}>{r.ic}</span>
            <div className="hist-row-main">
              <strong>{r.title}</strong>
              <span className="hist-row-sub">{r.sub}</span>
            </div>
            <div className="hist-row-meta">
              <span className="hist-time">{fmtDateTime(r.t)}</span>
              <span className={`hist-badge hist-badge-${r.tone}`}>{r.status}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="hist-foot">Every verified entry, payment, and door decision is logged here as it happens.</p>
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

// Register the PWA service worker — this is what makes "Add to Home Screen" /
// the Android install prompt available at all, and what keeps the app loadable
// when the venue loses its internet.
//
// Any OTHER worker on this origin is still unregistered on sight: the old
// cache-first legacy-app worker serves stale content forever and would shadow
// real deploys.
//
// What is NOT done here any more is emptying the caches. That ran on every
// page load, which meant the offline cache was destroyed a moment after it was
// filled and the app could never actually survive losing the network — the
// exact thing it is for. Clearing old caches belongs to the worker's own
// activate handler, which deletes everything that is not the current version
// (including the legacy one) and does it once per deploy instead of once per
// load.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => {
        const active = r.active || r.waiting || r.installing;
        if (!active || !active.scriptURL.endsWith('/sw.js')) return r.unregister();
        return Promise.resolve();
      }));
    } catch { /* ignore */ }
    // updateViaCache:'none' is the difference between an app that updates and
    // one that does not. By default the browser may serve sw.js itself from its
    // HTTP cache for up to 24 hours — so the file that exists to notice new
    // deploys is the one file guaranteed to be stale. Never cache it.
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
      // Ask right away rather than waiting for the browser's own schedule: a
      // home-screen app that is never closed can otherwise go a full day
      // between checks.
      reg.update().catch(() => {});
    } catch { /* no worker: the app still runs, it just cannot work offline */ }
  });
}

import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import './styles.css';
import GameCanvas from './game/GameCanvas.jsx';
import { GAME_FIGHTERS } from './game/venues.js';

// ── Membership: the one source of truth ──────────────────────────────────
// A member is either NOT a member (no card) or has ONE active tier. Buying a
// tier mints a member number + QR; that pass is what shows on their pass/
// profile and what Security scans/enters to verify. No fake sample data.
export const TIERS = [
  { name: 'Daily', price: 20, days: 1 },
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
// The "night" resets at 3AM — shift the clock back 3h and take the date.
function nightKey(ts = Date.now()) { return new Date(ts - 3 * 3600000).toISOString().slice(0, 10); }

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
export function purchaseTier(tierName, payment) {
  const t = TIER_BY[tierName]; if (!t) return;
  const now = Date.now();
  const prev = memberState || {};
  const perk = TIER_PERKS[tierName] || TIER_PERKS.Daily;
  const nk = nightKey();
  commitMember({
    tier: tierName, vip: !!t.vip, number: prev.number || genMemberNumber(), payment,
    purchasedAt: now, expiresAt: now + t.days * 86400000, status: 'active', verifiedAt: null,
    // loyalty carries over across renew/upgrade
    entries: prev.entries || 0, loyalty: prev.loyalty || 0, lastEntryNight: prev.lastEntryNight || null,
    // tonight's perks
    tickets: perk.tickets, ticketsNight: nk, mealUsed: false,
  });
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
    if (m.ticketsNight === nk) return m;
    return { ...m, tickets: perk.tickets, ticketsNight: nk, mealUsed: false };
  }
  return {
    ...m,
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
function useMember() {
  const [, force] = useState(0);
  useEffect(() => { const fn = () => force((n) => n + 1); memberListeners.add(fn); return () => memberListeners.delete(fn); }, []);
  return memberState;
}
const fmtUSD = (n) => `$${n.toLocaleString('en-US')}`;
const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const ui = {
  logo: '/assets/ui/source_sheets/ui_05_HITKOIN LOGO.png',
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
  paymentMethods: [
    { label: 'Credit / Debit', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_019_190x46.png' },
    { label: 'Apple Pay', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_022_190x48.png' },
    { label: 'Google Pay', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_033_190x47.png' },
    { label: 'PayPal', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_040_189x47.png' },
    { label: 'Cash App', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/buttons/source_14_046_189x46.png' },
  ],
  tiers: [
    { name: 'Daily', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_025_183x338.png', price: '$ --', status: 'Available' },
    { name: 'Weekly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_026_183x338.png', price: '$ --', status: 'Available' },
    { name: 'Monthly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_027_181x337.png', price: '$ --', status: 'Active' },
    { name: 'Yearly', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_028_181x337.png', price: '$ --', status: 'Available' },
    { name: 'VIP', src: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_01_029_179x337.png', price: '$ --', status: 'Verified' },
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
    qrFrame: '/assets/ui/complete_ui_set/sliced_clean/by_type/cards/source_11_087_239x270.png',
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
      { title: 'Start the Night', detail: 'Choose your character and play', chip: ui.chips.active, target: 'characterSelect' },
      { title: 'Home', detail: 'Overview and quick status', chip: ui.chips.active, target: 'memberHome' },
      { title: 'Membership & Profile', detail: 'Pass, QR, renewal, loyalty rank & profile', chip: ui.chips.vip, target: 'membership' },
      { title: 'Event Access', detail: 'Events you can attend', chip: ui.chips.checkedIn, target: 'eventAccess', requires: 'checkedIn' },
      { title: 'Venue Access', detail: 'Venues you can enter', chip: ui.chips.active, target: 'venueAccess', requires: 'checkedIn' },
      { title: 'History', detail: 'Past entries and activity', chip: ui.chips.checkedIn, target: 'history' },
    ],
    allowed: ['characterSelect', 'memberHome', 'membership', 'myPass', 'profile', 'eventAccess', 'venueAccess', 'history', 'checkout'],
  },
  {
    id: 'staff',
    label: 'Staff Check-In',
    tagline: 'Door and verification tools',
    eyebrow: 'STAFF',
    chip: 'staff',
    menu: [
      { title: 'Verify at the Door', detail: 'Scan QR or type the member number', chip: ui.chips.active, target: 'verification' },
      { title: 'Dashboard', detail: 'Door status and stats', chip: ui.chips.staff, target: 'staffDashboard' },
      { title: 'Check-In Log', detail: 'Recent door decisions', chip: ui.chips.checkedIn, target: 'checkInLog' },
    ],
    allowed: ['verification', 'staffDashboard', 'checkInLog', 'payVerify', 'searchMember', 'entry'],
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
  const member = useMember();                    // subscribe: door verification updates this
  const [onTheWay, setOnTheWay] = useState(false); // member signal: heading to the venue (OTW)
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
  }, []);

  function phaseFor(progress) {
    return loadingPhases.find((phase) => progress <= phase.until) ?? loadingPhases.at(-1);
  }

  function runTransition(from, to, commit) {
    const duration = from === 'Boot' ? 1550 : 1050;
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
      const eased = 1 - Math.pow(1 - t, 3);
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
        window.setTimeout(() => {
          setTransition((state) => ({ ...state, active: false, progress: 100 }));
        }, 180);
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
  function chooseRole(id) { setRole(id); setActiveScreen('home'); setTargetScreen('home'); }
  function switchRole() { setRole(null); setActiveScreen('home'); setTargetScreen('home'); }

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
        <RoleLanding onPick={chooseRole} />
      ) : (
        <section className={`screen screen-${current.id}`}>
          {current.id === 'home' ? (
            <RoleBadge
              role={roleById(role)}
              onTheWay={onTheWay}
              inside={inside}
              onToggleOtw={() => setOnTheWay((v) => !v)}
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

function TransitionOverlay({ transition }) {
  const overlayStyle = {
    '--progress': transition.progress,
    '--progress-pct': `${transition.progress}%`,
  };

  return (
    <div className={transition.active ? 'transition-overlay active' : 'transition-overlay'} style={overlayStyle} aria-hidden={!transition.active}>
      <div className="transition-frame">
        <div className="transition-bg" />
        <div className="source-progress-shell" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={transition.progress}>
          <span />
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
  if (activeScreen === 'memberHome') return <MemberHomeScreen />;
  if (activeScreen === 'myPass' || activeScreen === 'membership' || activeScreen === 'profile') return <MembershipScreen checkedIn={!!session?.checkedIn} />;
  if (activeScreen === 'eventAccess') return <SimpleAccessScreen title="Event Access" rows={['Tonight Event', 'Lip Sync Bingo', 'VIP Social']} />;
  if (activeScreen === 'venueAccess') return <SimpleAccessScreen title="Venue Access" rows={['Front Door', 'Networking Floor', 'VIP Lounge']} />;
  if (activeScreen === 'profile') return <ProfileScreen />;
  if (activeScreen === 'history') return <HistoryScreen />;
  if (activeScreen === 'staffDashboard') return <SimpleAccessScreen title="Staff Dashboard" rows={['Door Status', 'Active Members', 'Pending Review']} />;
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
function RoleLanding({ onPick }) {
  return (
    <section className="screen screen-landing">
      <div className="home-dashboard">
        <section className="sheet-title-banner">
          <div>
            <span>HITMANS VIP AFTER SPOT CORP.</span>
            <h1>Choose Access</h1>
          </div>
        </section>
        <div className="role-landing">
          {ROLES.map((r) => (
            <button key={r.id} type="button" className={`role-card role-card-${r.id}`} onClick={() => onPick(r.id)}>
              <span className="role-card-eyebrow">{r.eyebrow}</span>
              <strong className="role-card-label">{r.label}</strong>
              <span className="role-card-tagline">{r.tagline}</span>
              <span className="role-card-go">Enter →</span>
            </button>
          ))}
        </div>
        <p className="role-landing-note">Members, door staff, and hosts each get their own screens. You only see what your role allows.</p>
      </div>
    </section>
  );
}

// Compact header on the role home: current role, an "on the way" toggle a
// member flips when heading over (not entry — that's the door verification),
// an INSIDE indicator once verified, and a way back to the role picker.
function RoleBadge({ role, onTheWay, inside, onToggleOtw, onSwitch }) {
  return (
    <header className="role-badge">
      <div className="role-badge-id">
        <span className="eyebrow">{role.eyebrow}</span>
        <h1>{role.label}</h1>
      </div>
      <div className="role-badge-actions">
        {role.id === 'member' && (
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

// Tier name -> pricing-card artwork (buy screen, has the $ price slot).
const TIER_SRC = Object.fromEntries(ui.tiers.map((t) => [t.name, t.src]));
// Tier name -> member PASS-card artwork (the pass; "MONTHLY PASS", no price).
const PASS_SRC = Object.fromEntries(ui.passes.map((p) => [p.name, p.src]));
// Door-result status -> its alert chip graphic.
const STATUS_CHIP = { valid: ui.verify.valid, expired: ui.verify.expired, trespass: ui.verify.trespass };

// The pop-up alert shown when a membership is verified — the same overlay on
// the staff door screen and on the member's own "Verify Membership" tap.
// GRANTED / DENIED with the matching VALID / EXPIRED / TRESPASS chip.
function ScanAlert({ result, onDismiss }) {
  if (!result) return null;
  return (
    <div className="scan-alert-overlay" onClick={onDismiss}>
      <div className={`scan-alert ${result.status}`} onClick={(e) => e.stopPropagation()}>
        <img className="scan-alert-banner" src={result.ok ? ui.banners.granted : ui.banners.denied} alt={result.ok ? 'Access granted' : 'Access denied'} />
        {STATUS_CHIP[result.status] && <img className="scan-alert-chip" src={STATUS_CHIP[result.status]} alt={result.status} />}
        {result.member ? (
          <div className="scan-result-row">
            <strong>{result.member.tier}{result.member.vip ? ' VIP' : ''} Member</strong>
            <span className="scan-result-num">{result.member.number}</span>
            <small>{result.status === 'valid' ? `Valid until ${fmtDate(result.member.expiresAt)}` : `Expired ${fmtDate(result.member.expiresAt)}`}</small>
          </div>
        ) : (
          <p className="scan-alert-sub">{result.reason}</p>
        )}
        <p className={`scan-alert-verdict ${result.ok ? 'go' : 'no'}`}>{result.ok ? 'GRANT ENTRY' : 'DO NOT ADMIT'}</p>
        <button type="button" className="scan-alert-dismiss" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

function useQrDataUrl(text) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    if (!text) { setUrl(''); return undefined; }
    QRCode.toDataURL(text, { margin: 1, width: 260, color: { dark: '#1b0b2e', light: '#f7ecff' } })
      .then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [text]);
  return url;
}

// THE single membership screen: not a member -> buy a tier; member -> your pass.
function MembershipScreen({ checkedIn }) {
  const member = useMember();
  return member ? <MemberPass member={member} checkedIn={checkedIn} /> : <BuyMembership />;
}

// Step 1 — you are not a member yet. Pick a tier, pick how you pay, purchase.
function BuyMembership() {
  const [tier, setTier] = useState('Monthly');
  const [pay, setPay] = useState('Credit / Debit');
  const t = TIER_BY[tier];
  return (
    <div className="mem-screen">
      <div className="mem-intro">
        <h2>Become a member</h2>
        <p>You must hold a membership to get in. Buy a tier and you’ll get a member card, a number, and a QR code security scans at the door.</p>
      </div>
      <div className="tier-buy-grid">
        {TIERS.map((row) => (
          <button
            key={row.name}
            type="button"
            className={`tier-buy-card${tier === row.name ? ' picked' : ''}`}
            onClick={() => setTier(row.name)}
          >
            <img className="tier-buy-art" src={TIER_SRC[row.name]} alt={`${row.name} — ${fmtUSD(row.price)}`} />
          </button>
        ))}
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
        <p className="buy-summary">{tier} membership · <b>{fmtUSD(t.price)}</b>{t.vip ? ' · VIP' : ''} · {pay}</p>
        <button type="button" className="asset-cta" onClick={() => purchaseTier(tier, pay)} aria-label={`Buy ${tier} plan`}>
          <img src={ui.buttons.selectPlan} alt="Select plan" />
        </button>
      </div>
      <p className="mem-fineprint">Demo checkout — no real charge. Buying mints your card + QR instantly.</p>
    </div>
  );
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
function MemberPass({ member, checkedIn }) {
  const qr = useQrDataUrl(`HVAS-MEMBER:${member.number}`);
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
  useEffect(() => { refreshNight(); }, []);       // reissue perks if we crossed 3AM
  const [prefs, setPrefs] = useState({ music: true, alerts: true, priv: true });
  const togglePref = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  // Member self-verify: same gate the door uses — pops GRANTED / DENIED / etc.
  const [verifyResult, setVerifyResult] = useState(null);

  return (
    <div className="mem-screen mem-pass">
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
            <div><dt>Member #</dt><dd className="mem-number">{member.number}</dd></div>
            <div><dt>Valid until</dt><dd>{fmtDate(member.expiresAt)}</dd></div>
            <div><dt>Paid with</dt><dd>{member.payment}</dd></div>
          </dl>
          {verified && <img className="mem-verified-alert" src={ui.verify.entryVerified} alt="Entry status: verified" />}
        </div>
        <div className="mem-qr">
          <div className="qr-clean">
            {qr ? <img src={qr} alt="Member QR code" /> : <div className="qr-load">QR…</div>}
          </div>
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
        <button type="button" className={`asset-cta wide${expired ? ' renew-hot' : ''}`} onClick={() => purchaseTier(member.tier, member.payment)}
          aria-label={`Renew ${member.tier} ${fmtUSD(TIER_BY[member.tier].price)}`}>
          <img src={ui.buttons.renewPlan} alt="Renew plan" />
          <span className="asset-cta-note">{fmtUSD(TIER_BY[member.tier].price)}</span>
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

// Security (staff) side: scan the member's QR or type their number to verify.
// AVAILABLE / ACTIVE / VERIFIED are RESULTS shown here — not buttons.
function SecurityVerifyScreen() {
  const member = useMember();
  const [num, setNum] = useState('');
  const [result, setResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef(null);
  const rafRef = useRef(0);
  const streamRef = useRef(null);

  function stopScan() {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }
  useEffect(() => () => stopScan(), []);

  async function startScan() {
    setResult(null);
    if (!navigator.mediaDevices?.getUserMedia) { setResult({ ok: false, reason: 'No camera here — type the member number instead.' }); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream; setScanning(true);
      const video = videoRef.current; video.srcObject = stream; await video.play();
      const canvas = document.createElement('canvas');
      const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
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
    } catch { setResult({ ok: false, reason: 'Camera blocked — type the member number instead.' }); setScanning(false); }
  }

  const dismiss = () => setResult(null);
  return (
    <div className="verify-screen">
      <div className="verify-panel">
        <h2>Door verification</h2>
        <p>Scan the member’s QR or type their number. No valid membership = no entry.</p>

        <div className="verify-scanbox">
          <div className="qr-framed lg">
            <img className="qr-frame" src={ui.verify.qrFrame} alt="" />
            {scanning
              ? <video className="qr-code cam" ref={videoRef} playsInline muted />
              : <div className="qr-load">Camera off</div>}
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

      <ScanAlert result={result} onDismiss={dismiss} />
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

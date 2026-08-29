// HVAS backend — HTTP API. Zero-dependency router over node:http.
//
// Auth model (matches the app's product design):
//   • Members self-serve: phone/email → OTP → session token.
//   • Staff / Host are privileged: a venue access code → role session token.
//
// The door verifies rolling Ed25519 passes (see crypto.mjs) and logs one
// admission per 3AM night. A live board streams over SSE.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve as pathResolve, join as pathJoin, normalize as pathNormalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';
import { openDb, nightKey } from './db.mjs';
import { COVENANT, COVENANT_VERSION, onboardingState, covenantAt, covenantVersions,
         covenantFingerprint } from './economy/covenant.mjs';
import { MEMBER_ROLE, rolesByGroup, roleGrants } from './economy/roles.mjs';
import {
  LICENSE_TYPES, LICENSE_TYPE_LIST, LICENSE_SCOPES, LICENSE_TERMS, WORK_KIND_LIST, WORK_KINDS,
  licenseActive, licenseConflict, licenseTerms, newOfferId, newGrantId,
} from './economy/licensing.mjs';
import {
  LISTING_KINDS, PRICE_MODES, DELIVERY, PARTNERSHIP_KINDS, REFERRAL_EVENTS,
  BOOKING_STAGES, BOOKING_STAGE, BOOKING_FAILURES,
  marketSplit, partnershipSplit, referralCommission, referralCodeFor,
  bookingCanAdvance, bookingOutcome, stakeFor,
} from './economy/earning.mjs';
import { deliveryConfig, sendCode, contactKind, maskContact } from './notify.mjs';
// The SAME rules the phones run. Imported rather than restated: a prize table
// or a vote threshold that exists twice is a prize table that will eventually
// disagree with itself, and the disagreement would be about money in a room.
import {
  BINGO_ENTRY_FEE, bingoIsCashGame, bingoPot, bingoRoundPrize, bingoSplit,
  micIsForced, micDecideEndsAt,
} from '../../hitmans_vip_membership_app/src/bingoRules.js';
import { makeReceipt, proofVault } from './economy/receipts.mjs';
import { economyFlags } from './economy/flags.mjs';
import { usd } from './economy/money.mjs';
import { makeContribution, reserveHealth, VAULTS } from './economy/world-reserve.mjs';
import { draftAllocationPolicy, adopt } from './economy/policy.mjs';
import {
  NEED_KINDS, PROGRAMS, BOARD_POSITIONS, BOARD_POSITION, classify, assess, approvalsSatisfied,
  makeAward, markPaid, confirmDelivery,
} from './economy/jubilee.mjs';
import {
  loadOrCreateKeys, publicKeyRaw, issuePass, verifyPass,
  sessionSecret, signSession, readSession, venueSecret,
} from './crypto.mjs';
import { freeMemberNumber } from './member-number.mjs';
import { MeshNode, meshListen, meshDial } from './mesh.mjs';
import { applyOp } from './reduce.mjs';
import { hitkoinEnabled, mintForPayment, walletSummary } from './hitkoin.mjs';
import { BINGO_DECKS, DEFAULT_DECK_ID, deckList, deckById } from './decks.mjs';
import { clipWindowFor as clipWindowRule, windowAroundHook } from './clip.mjs';

const TIERS = {
  Daily: { days: 1, vip: false, price: 20 }, Weekly: { days: 7, vip: false, price: 100 },
  Monthly: { days: 30, vip: false, price: 300 }, Yearly: { days: 365, vip: false, price: 1850 },
  VIP: { days: 365, vip: true, price: 5000 },
};
const STAFF_CODES = { staff: process.env.HVAS_STAFF_CODE || 'DOOR850', host: process.env.HVAS_HOST_CODE || 'HOST850' };
const SESSION_TTL = 12 * 3600 * 1000;
// Long enough to hand somebody a phone across a bar, short enough that a photo
// of the QR is worthless by the end of the shift.
const STAFF_INVITE_TTL = 15 * 60 * 1000;

// YouTube auto-media: search is a server-held API key (never shipped to the
// client — a leaked key gets used up by anyone), playback itself needs no
// login at all since the IFrame Player embeds public videos directly.
// Venue-wide fallback key from env. The host can override it at runtime with
// their OWN key (see POST /bingo/youtube-key) — the reason being ads: a host
// signed into their own YouTube/Premium account on the TV browser gets their
// own playback experience, and search then runs on their quota, not ours.
const YOUTUBE_ENV_KEY = process.env.YOUTUBE_API_KEY || '';
// "Sign in with Google" for the host. Needs a Google Cloud OAuth client
// (console.cloud.google.com -> Credentials -> OAuth client ID -> Web app),
// with this backend's /auth/google/callback as an authorised redirect URI.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
// How long a called square holds the TV before the next one is called — the
// performance window. A plain song square is a minute; a LIP SYNC square is an
// actual performance on the floor, so it gets two. Overridable per venue, and
// kept short in tests.
const BINGO_SONG_MS = Math.max(3, Number(process.env.BINGO_SONG_SECONDS) || 60) * 1000;
// How long the room gets to choose which two of three-or-more contenders
// actually battle. Short on purpose: it happens while the song is still
// playing, so it cannot outlast the square it is deciding.
// After somebody takes a round, the room gets a short sprint to settle second
// and third rather than the round simply stopping dead on one winner. Long
// enough to finish squares already called, short enough that the night moves.
//
// Read at call time, not at import. As a module-level const it was fixed the
// instant app.mjs was imported, which in an ES module happens before any
// statement in the file that imports it — so a test setting the env var could
// never affect it, and a venue would have to restart to change it.
const bingoPodiumMs = () => Math.max(5, Number(process.env.BINGO_PODIUM_SECONDS) || 30) * 1000;
const BATTLE_PICK_MS = Math.max(5, Number(process.env.BATTLE_PICK_SECONDS) || 25) * 1000;
const BINGO_LIPSYNC_MS = Math.max(3, Number(process.env.BINGO_LIPSYNC_SECONDS) || 120) * 1000;
// ── Verse-and-hook clip window ──
// Nobody lip syncs to an intro, and nobody should have to sit through a third
// verse. A performance plays one segment: the back half of verse one straight
// into the first hook, which is the part a room actually knows.
//
// There is no song-structure data in any API, so this is derived from the
// track's own length rather than guessed at a flat number — a 2:30 cut and a
// 5:00 album version get proportionally different windows. Roughly: skip the
// intro, start inside verse one, and run long enough to carry the hook.
const YT_DURATION = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/;
const ytSeconds = (iso) => {
  const m = YT_DURATION.exec(String(iso || ''));
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + Math.round(+m[4] || 0);
};
// The replay heatmap YouTube renders under the scrubber: an array of equal
// slices, each scored 0..1 by how much people rewind into it. On a music video
// the top slice is the hook, near enough every time — it is the room voting
// with its thumbs. Parsed straight out of the watch page, which is where the
// player itself gets it.
const hookFromHeatmap = (html) => {
  const markers = [];
  const re = /"heatMarkerRenderer":\{"timeRangeStartMillis":(\d+),"markerDurationMillis":(\d+),"heatMarkerIntensityScoreNormalized":([0-9.]+)\}/g;
  let m;
  while ((m = re.exec(html))) markers.push({ start: +m[1] / 1000, dur: +m[2] / 1000, score: +m[3] });
  if (markers.length < 4) return null;
  // The opening seconds always score high — that is people restarting the
  // video, not the hook. Ignore the first tenth before picking the peak.
  const floor = markers[markers.length - 1].start * 0.1;
  const body = markers.filter((k) => k.start >= floor);
  const peak = (body.length ? body : markers).reduce((a, b) => (b.score > a.score ? b : a));
  const spread = peak.score - (markers.reduce((n, k) => n + k.score, 0) / markers.length);
  return {
    hookAt: Math.round(peak.start),
    // A pronounced peak is a real hook; a flat heatmap means the video is
    // watched evenly and the read is worth less.
    confidence: Math.max(35, Math.min(95, Math.round(spread * 220))),
  };
};

// Some music videos are chaptered, and the chorus is often labelled outright.
// Free and exact when it is there.
const hookFromChapters = (html) => {
  const re = /"chapterRenderer":\{"title":\{"simpleText":"([^"]{1,80})"\},"timeRangeStartMillis":(\d+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (/\b(chorus|hook|refrain)\b/i.test(m[1])) return { hookAt: Math.round(+m[2] / 1000), confidence: 90 };
  }
  return null;
};

// Both of these now live in src/clip.mjs, alone, because Solo vs CPU needs the
// same numbers and has no backend to ask. See that file for why.
const clipWindowFor = (durationSec) => clipWindowRule(durationSec, BINGO_LIPSYNC_MS / 1000);

const bingoWindowFor = (item, clip) => {
  // The performance runs as long as the clip does — that is the whole point of
  // cutting to the verse and hook, and it means nobody sets a duration by hand.
  if (item?.type === 'lipsync') return clip?.seconds ? clip.seconds * 1000 : BINGO_LIPSYNC_MS;
  return clip?.seconds ? clip.seconds * 1000 : BINGO_SONG_MS;
};

// ── Lip Sync Bingo ──
const FREE_ITEM = { id: 'FREE', free: true, artist: '', song: '', type: 'free' };
const BINGO_PATTERN_IDS = ['line', 'two_lines', 'four_corners', 'x', 'around_the_world', 'blackout'];
// The spec'd three-round game (qa/device_checklist.md): round 1 is any single
// line, round 2 needs two lines, round 3 is the full card. A round's pattern
// comes from here unless the host has explicitly picked a one-off pattern.
const BINGO_ROUND_PATTERN = { 1: 'line', 2: 'two_lines', 3: 'blackout' };
const BINGO_FINAL_ROUND = 3;
// Party Mode floor. Was 5, which made the mode untestable and unusable on a
// slow night — two people in the room should be able to run a Battlerz round.
const PARTY_MIN_PLAYERS = Math.max(2, Number(process.env.PARTY_MIN_PLAYERS) || 2);
// 5x5 card, index 12 is the free center square.
const BINGO_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
];
const bingoLineCount = (m) => BINGO_LINES.filter((line) => line.every((i) => m[i])).length;
const BINGO_PATTERNS = {
  line: (m) => BINGO_LINES.some((line) => line.every((i) => m[i])),
  // Two DISTINCT completed lines. They may legitimately share the free centre
  // (e.g. a row and a column both through index 12) — that's still two lines
  // by the normal bingo reading, so no overlap rule beyond being different lines.
  two_lines: (m) => bingoLineCount(m) >= 2,
  four_corners: (m) => [0, 4, 20, 24].every((i) => m[i]),
  x: (m) => [0, 6, 12, 18, 24, 4, 8, 16, 20].every((i) => m[i]),
  around_the_world: (m) => [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24].every((i) => m[i]),
  blackout: (m) => m.every(Boolean),
};
// A square only counts if it's FREE, or the player tapped it covered AND it
// was actually called — tapping alone (or being called alone) isn't enough,
// so a claim can't be faked by covering something never called.
function bingoHasWin(card, calledIds, coveredIds, pattern) {
  const marked = card.map((item, i) => i === 12 || (coveredIds.has(item.id) && calledIds.has(item.id)));
  return (BINGO_PATTERNS[pattern] || BINGO_PATTERNS.line)(marked);
}
// How far a card is toward the round's pattern, as done/need. Same shape the
// client uses, but the server's version is the one that decides a podium, so
// it counts only squares that were BOTH called and covered.
function bingoProgressFor(card, calledIds, coveredIds, pattern) {
  const marked = card.map((item, i) => i === 12 || (coveredIds.has(item.id) && calledIds.has(item.id)));
  const lines = BINGO_LINES.filter((l) => l.every((i) => marked[i])).length;
  const ring = [...Array(25).keys()].filter((i) => i < 5 || i > 19 || i % 5 === 0 || i % 5 === 4);
  switch (pattern) {
    case 'two_lines': return { done: Math.min(lines, 2), need: 2, covered: marked.filter(Boolean).length };
    case 'four_corners': return { done: [0, 4, 20, 24].filter((i) => marked[i]).length, need: 4, covered: marked.filter(Boolean).length };
    case 'x': return { done: [0, 6, 18, 24, 4, 8, 16, 20].filter((i) => marked[i]).length, need: 8, covered: marked.filter(Boolean).length };
    case 'around_the_world': return { done: ring.filter((i) => marked[i]).length, need: ring.length, covered: marked.filter(Boolean).length };
    case 'blackout': return { done: marked.filter(Boolean).length, need: 25, covered: marked.filter(Boolean).length };
    default: {
      const best = Math.max(0, ...BINGO_LINES.map((l) => l.filter((i) => marked[i]).length));
      return { done: lines >= 1 ? 5 : best, need: 5, covered: marked.filter(Boolean).length };
    }
  }
}

function bingoDealCard(items) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picks = pool.slice(0, 24);
  picks.splice(12, 0, FREE_ITEM);
  return picks;
}

// PayPal plan id → tier (from the same env the app uses), so a verified
// subscription activation maps to the right membership.
const PAYPAL_PLAN_TIER = Object.fromEntries([
  [process.env.VITE_PAYPAL_PLAN_DAILY || process.env.PAYPAL_PLAN_DAILY, 'Daily'],
  [process.env.VITE_PAYPAL_PLAN_WEEKLY || process.env.PAYPAL_PLAN_WEEKLY, 'Weekly'],
  [process.env.VITE_PAYPAL_PLAN_MONTHLY || process.env.PAYPAL_PLAN_MONTHLY, 'Monthly'],
  [process.env.VITE_PAYPAL_PLAN_YEARLY || process.env.PAYPAL_PLAN_YEARLY, 'Yearly'],
  [process.env.VITE_PAYPAL_PLAN_VIP || process.env.PAYPAL_PLAN_VIP, 'VIP'],
].filter(([id]) => id));
const PAYPAL = {
  env: (process.env.PAYPAL_ENV || 'live') === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com',
  clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_SECRET, webhookId: process.env.PAYPAL_WEBHOOK_ID,
};

// Verify a webhook came from PayPal (only when configured; otherwise refuse to
// activate, so a misconfigured server can't be spoofed into granting access).
async function paypalVerify(headers, rawBody) {
  if (!PAYPAL.clientId || !PAYPAL.secret || !PAYPAL.webhookId) return false;
  const auth = await fetch(`${PAYPAL.env}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${PAYPAL.clientId}:${PAYPAL.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  }).then((r) => r.json()).catch(() => ({}));
  if (!auth.access_token) return false;
  const v = await fetch(`${PAYPAL.env}/v1/notifications/verify-webhook-signature`, {
    method: 'POST', headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'], cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'], transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'], webhook_id: PAYPAL.webhookId,
      webhook_event: JSON.parse(rawBody),
    }),
  }).then((r) => r.json()).catch(() => ({}));
  return v.verification_status === 'SUCCESS';
}


const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
};
// Always a plain object, whatever arrived. Every handler here does
// `const { x } = await readBody(req)`, and JSON.parse('null') is null, which
// destructures into a TypeError and comes back as a 500 — the status that
// tells a member their app is broken when what really happened is that a
// retrying phone, a proxy or a fat-fingered curl sent a body of `null`.
// A bare array, number or string has the same problem. None of them is a shape
// any handler can read, so none of them gets past here.
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on('end', () => {
    let v;
    try { v = d ? JSON.parse(d) : {}; } catch { v = {}; }
    resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  });
});
const readRaw = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on('end', () => resolve(d));
});

// ── Serving the app itself ───────────────────────────────────────────────
// A phone on the venue wifi can talk to this laptop directly — no tunnel, no
// Cloudflare, no internet. What stopped that was where the app came from: a
// page served over HTTPS from the public web is not allowed to call an
// insecure http://192.168.x.x address, so the browser blocked every request
// and a tunnel became mandatory just to stand in the room.
//
// Serving the app from here removes the mismatch. Phone opens
// http://192.168.1.20:8787, gets the app AND the backend from one origin, and
// the whole night runs on a laptop and a router.
//
// Nothing is required: with no app folder present this does nothing at all and
// the venue behaves exactly as before, serving only its API.
const APP_DIR = process.env.HVAS_APP_DIR
  || pathResolve(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const APP_BASE = '/HVAS/';                    // the built app references this path
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const appAvailable = () => existsSync(pathJoin(APP_DIR, 'index.html'));

// Tell the app it is being served BY a venue, so it connects to that venue
// without anyone typing an address or scanning anything. Injected rather than
// built in, because the same built files are also served from the public web
// where this must not apply.
const markVenue = (html) => html.replace('<head>',
  '<head><script>window.__HVAS_VENUE__=location.origin;</script>');

const serveApp = (req, res, pathname) => {
  let rel = pathname.slice(APP_BASE.length);
  if (!rel || rel.endsWith('/')) rel = 'index.html';
  // Contain it: a request may not climb out of the app folder.
  const full = pathJoin(APP_DIR, pathNormalize(rel).replace(/^([.][.][/\\])+/, ''));
  if (!full.startsWith(APP_DIR)) { res.writeHead(403).end('no'); return true; }
  let file = full;
  if (!existsSync(file) || !statSync(file).isFile()) file = pathJoin(APP_DIR, 'index.html');  // SPA routes
  try {
    const isHtml = extname(file) === '.html';
    const body = isHtml ? markVenue(readFileSync(file, 'utf8')) : readFileSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      // The venue is the source of truth for its own copy; never let a phone
      // hold a stale build of a room it is standing in.
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=86400',
    });
    res.end(body);
  } catch { res.writeHead(500).end('app read failed'); }
  return true;
};

export function createApp({ dataDir, nodeId = `node-${randomBytes(3).toString('hex')}`, meshPort = null, peers = [] } = {}) {
  const db = openDb(`${dataDir}/hvas.db`);
  const keys = loadOrCreateKeys(`${dataDir}/venue-key.json`);
  const secret = sessionSecret(`${dataDir}/session.key`);
  const meshKey = venueSecret(`${dataDir}/mesh.key`);    // shared AES key for the mesh
  const walletKey = venueSecret(`${dataDir}/hitkoin-wallet.key`); // encrypts each member's custodial wallet key at rest
  const sse = new Set(); // live door-board subscribers

  // ── mesh (background) ──
  // Every mutation goes through the mesh op-log: the op materializes into this
  // node's SQLite (via applyOp) AND replicates, encrypted, to peer nodes — so a
  // verification at one door shows up at every other door with no cloud.
  const node = new MeshNode({ id: nodeId, privateKey: keys.privateKey, publicKey: keys.publicKey });
  // Durable chat/link ops also fan out to this node's live subscribers.
  node.onChange = (op) => {
    applyOp(db, op); emitBoard();
    if (op.t === 'chat') fanout(op.data.to, { kind: 'chat', ...op.data });
    if (op.t === 'link.request' || op.t === 'link.accept') fanout(op.data.to, { kind: op.t, ...op.data });
  };
  const commit = (t, data) => node.apply(t, data);       // apply local + broadcast

  // ── realtime social layer (top-down venues) ──────────────────────────────
  // Presence: who's in each venue right now, with their top-down character +
  // position. Ephemeral, TTL'd, gossiped over the mesh live channel (never
  // stored). liveSubs is one realtime pipe per member carrying targeted events:
  // chat, typing, reactions, snaps (chunked media), and WebRTC signaling for
  // live video/audio calls — all peer-to-peer over the encrypted mesh, no cloud.
  const presence = new Map();                            // memberId -> {…, ts}
  const PRESENCE_TTL = 15000;
  const presenceSubs = new Set();                        // { v, res }
  const liveSubs = new Map();                            // memberId -> Set(SSE res)

  node.onLive = (p) => {
    if (!p) return;
    if (p.type === 'presence') { presence.set(p.id, { ...p, ts: Date.now() }); emitPresence(p.venue); }
    else if (p.type === 'dm') { for (const res of (liveSubs.get(p.to) || [])) res.write(`data: ${JSON.stringify(p.msg)}\n\n`); }
  };
  const fanout = (to, msg) => { for (const res of (liveSubs.get(to) || [])) res.write(`data: ${JSON.stringify(msg)}\n\n`); };
  // Send a realtime event to a member anywhere on the mesh (local + gossip).
  const sendLive = (to, msg) => { fanout(to, msg); node.live({ type: 'dm', to, msg }); };
  const liveMembers = (venue) => {
    const now = Date.now(); const out = [];
    for (const [id, p] of presence) {
      if (now - p.ts > PRESENCE_TTL) { presence.delete(id); continue; }
      if (!venue || p.venue === venue) out.push({ id, name: p.name, number: p.number, avatar: p.avatar, x: p.x, y: p.y, vip: p.vip });
    }
    return out;
  };
  const emitPresence = (venue) => {
    const data = `data: ${JSON.stringify({ venue, members: liveMembers(venue) })}\n\n`;
    for (const { v, res } of presenceSubs) if (!v || v === venue) res.write(data);
  };
  setInterval(() => { const now = Date.now(); for (const [id, p] of presence) if (now - p.ts > PRESENCE_TTL) { presence.delete(id); emitPresence(p.venue); } }, 5000).unref?.();

  // ── data helpers ──
  const memberByNumber = (n) => db.prepare('SELECT * FROM members WHERE number=?').get(n);
  const membershipOf = (id) => db.prepare('SELECT * FROM memberships WHERE member_id=?').get(id);
  const publicMember = (m) => {
    if (!m) return null;
    const ms = membershipOf(m.id);
    const nights = db.prepare('SELECT COUNT(*) c FROM entries WHERE member_id=?').get(m.id).c;
    const entryRow = db.prepare('SELECT * FROM entries WHERE member_id=? AND night=?').get(m.id, nightKey());
    const insideTonight = !!entryRow && !entryRow.left_at;
    const leftTonight = !!entryRow && !!entryRow.left_at;
    const sig = db.prepare('SELECT * FROM signals WHERE member_id=?').get(m.id);
    // How many times they've been ADMITTED tonight — >1 means they left and
    // got scanned back in ("back inside"), not just their first arrival.
    const admitsTonight = db.prepare(`SELECT COUNT(*) c FROM entry_events WHERE member_id=? AND night=? AND kind='admit'`)
      .get(m.id, nightKey()).c;
    const flagRow = db.prepare('SELECT * FROM member_flags WHERE member_id=?').get(m.id);
    return {
      id: m.id, name: m.name, number: m.number, contact: m.contact ?? null,
      tier: ms?.tier || null, vip: !!ms?.vip, payment: ms?.payment || null,
      status: ms?.status || null, expiresAt: ms?.expires_at || null,
      entries: nights, insideTonight, leftTonight,
      enteredAt: entryRow?.at || null, leftAt: entryRow?.left_at || null,
      onTheWay: !!sig?.on_the_way && !insideTonight, onTheWayAt: sig?.at || null,
      backInside: insideTonight && admitsTonight > 1,
      flag: flagRow ? { kind: flagRow.kind, reason: flagRow.reason, by: flagRow.by_staff, at: flagRow.at } : null,
    };
  };
  // Full timestamped timeline for one member: signup, membership purchase,
  // and the complete on-the-way / admit / checkout history (every re-entry
  // included, not just tonight's current state) — one place staff can see
  // everything about a member instead of piecing it together.
  const memberTimeline = (m) => {
    const ms = membershipOf(m.id);
    const events = [];
    events.push({ kind: 'signup', at: m.created_at });
    if (ms) events.push({ kind: 'membership', at: ms.purchased_at, tier: ms.tier, vip: !!ms.vip, payment: ms.payment });
    for (const e of db.prepare('SELECT * FROM entry_events WHERE member_id=? ORDER BY at ASC').all(m.id)) {
      events.push({ kind: e.kind, at: e.at, night: e.night, byStaff: e.by_staff || null, searched: !!e.searched });
    }
    for (const d of db.prepare(`SELECT * FROM decisions WHERE member_id=? AND status!='granted' ORDER BY at ASC`).all(m.id)) {
      events.push({ kind: 'decision', at: d.at, status: d.status, byStaff: d.by_staff || null });
    }
    events.sort((a, b) => a.at - b.at);
    return events;
  };
  // ── Lip Sync Bingo helpers ──
  // ── Host's Google / YouTube account ──
  const setting = (k) => db.prepare('SELECT value FROM settings WHERE key=?').get(k)?.value || '';

  // ── Asking for a code, and not being able to abuse it ────────────────────
  //
  // Two separate limits, because they stop two different things. The short one
  // stops a stuck retry loop and a person mashing the button. The long one
  // stops somebody deciding to make a stranger's phone buzz for an evening, or
  // burning the venue's sending quota on the night it is needed.
  //
  // In memory on purpose: a restart forgiving everybody is the right failure,
  // and nothing here is worth a table.
  const otpHits = new Map();
  const OTP_MIN_GAP_MS = 20 * 1000;
  const OTP_WINDOW_MS = 60 * 60 * 1000;
  const OTP_PER_WINDOW = 5;
  const otpRate = (contact, now) => {
    const key = String(contact).toLowerCase();
    const h = otpHits.get(key) || { at: [], last: 0 };
    if (now - h.last < OTP_MIN_GAP_MS) {
      return { ok: false, retryInMs: OTP_MIN_GAP_MS - (now - h.last),
               error: 'A code was just sent. Give it a few seconds before asking for another.' };
    }
    const recent = h.at.filter((t) => now - t < OTP_WINDOW_MS);
    if (recent.length >= OTP_PER_WINDOW) {
      return { ok: false, retryInMs: OTP_WINDOW_MS - (now - recent[0]),
               error: 'Too many codes for that contact in the last hour. Try later, or ask a member of staff to sign you in.' };
    }
    recent.push(now);
    otpHits.set(key, { at: recent, last: now });
    // Keep the map from growing all night on a busy door.
    if (otpHits.size > 5000) {
      for (const [k, v] of otpHits) { if (now - v.last > OTP_WINDOW_MS) otpHits.delete(k); }
    }
    return { ok: true };
  };

  const putSetting = (k, v) => {
    if (!v) return db.prepare('DELETE FROM settings WHERE key=?').run(k);
    return db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(k, v, Date.now());
  };
  // ── The venue's permanent name on the network ──
  // A tunnel address is disposable — quick tunnels mint a new one every run,
  // and even a paid domain is one unpaid renewal from dead. What has to be
  // permanent is the VENUE, not the URL it happens to be behind tonight.
  //
  // This id is generated once, lives in the venue's own database, and never
  // changes. Members hold onto it instead of a link: when the address moves,
  // the app looks the venue up again by id and reconnects itself. A saved
  // room cannot rot the way a saved link does.
  const venueId = () => {
    let id = setting('venue_id');
    if (!id) {
      // Short, unambiguous, and readable down a phone line if it ever has to be.
      id = 'v' + randomBytes(6).toString('hex');
      putSetting('venue_id', id);
    }
    return id;
  };

  // Swap the stored refresh token for a live access token. Google access
  // tokens last ~1h, so this runs per burst of calls rather than being cached
  // to disk where it would go stale mid-night.
  const googleAccessToken = async () => {
    const refresh = setting('google_refresh_token');
    if (!refresh || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return '';
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
      });
      const d = await r.json();
      return d.access_token || '';
    } catch { return ''; }
  };

  // Host-supplied key wins over the env key when present.
  const youtubeKey = () => {
    const row = db.prepare(`SELECT value FROM settings WHERE key='youtube_api_key'`).get();
    return (row?.value || '').trim() || YOUTUBE_ENV_KEY;
  };

  // Can this venue actually play a song? Either route counts. Checked as the
  // PRESENCE of a Google refresh token rather than by minting an access token,
  // so it stays synchronous and cheap enough to publish on every poll.
  const mediaReady = () => !!youtubeKey() || !!setting('google_refresh_token');

  const getBingoRound = () => {
    const r = db.prepare('SELECT * FROM bingo_round WHERE id=1').get();
    const roundNo = r.round_no || 1;
    // Playing the round ladder, the pattern is derived from the round number.
    // Only a host-picked one-off pattern overrides it.
    const pattern = r.custom_pattern ? (r.pattern || 'line') : (BINGO_ROUND_PATTERN[roundNo] || 'line');
    return {
      ...r, phrases: JSON.parse(r.phrases), calls: JSON.parse(r.calls),
      nowPlaying: r.now_playing ? JSON.parse(r.now_playing) : null,
      deckId: r.deck_id || DEFAULT_DECK_ID, pattern,
      roundNo, finalRound: BINGO_FINAL_ROUND, customPattern: !!r.custom_pattern,
      roundWins: JSON.parse(r.round_wins || '[]'),
      podium: JSON.parse(r.podium || '[]'),
      podiumEndsAt: r.podium_ends_at,
      podiumFirst: r.podium_first,
      autoCall: !!r.auto_call,
      mode: r.mode === 'cash' ? 'cash' : 'free',
      songSeconds: Math.round(BINGO_SONG_MS / 1000),
      lipsyncSeconds: Math.round(BINGO_LIPSYNC_MS / 1000),
    };
  };

  // The adopted split of what the door collects.
  //
  // Absent means ZERO, and that is the honest default: with no adopted policy
  // the players take everything and the screen says so. A venue that wants to
  // fund the commons has to set it deliberately, and the moment it does every
  // member sees the split before they pay — §46: do not deduct undisclosed
  // reserve allocations from providers.
  const bingoSplitPolicy = () => ({
    housePercent: Number(setting('bingo_house_percent') || 0) || 0,
    worldPercent: Number(setting('bingo_world_percent') || 0) || 0,
    adoptedBy: setting('bingo_split_adopted_by') || null,
    adoptedAt: Number(setting('bingo_split_adopted_at') || 0) || null,
  });

  /**
   * One entry's share of the commons.
   *
   * Runs through the SAME eligibility check as any other contribution — a
   * booking platform fee is on §27's authorized list, and going through the
   * check rather than around it is what stops this becoming the one path where
   * money enters the reserve unexamined.
   */
  const recordEntryContribution = ({ memberId, entryId, by }) => {
    const pol = bingoSplitPolicy();
    if (!(pol.worldPercent > 0) || !economyFlags().WORLD_RESERVE_LEDGER) return null;
    const cents = Math.floor(BINGO_ENTRY_FEE * 100 * pol.worldPercent);
    if (cents <= 0) return null;
    const made = makeContribution({
      sourceType: 'booking_platform_fee',
      sourceEntity: process.env.HVAS_VENUE_NAME || 'HITMANS VIP AFTER SPOT',
      sourceTransaction: entryId,
      amount: usd(cents),
      // The venue's own reserve vault. An entry fee is NOT a donation to a
      // member's programme — they are not paying into anything by playing, and
      // routing their entry money by affiliation would have quietly turned a
      // game entry into a contribution nobody chose to make. What a member can
      // do for a programme is donate to it, or sit on its board.
      vault: setting('bingo_world_vault') || 'CORE_RESILIENCE',
      legalCustodian: setting('world_custodian') || 'HITMANS VIP AFTER SPOT CORP',
      beneficialPurpose: 'Community reserve share of a Lip Sync Bingo entry',
    });
    const rec = made.ok ? made.contribution : made.refusal;
    try {
      db.prepare(`INSERT OR IGNORE INTO world_contributions
        (contribution_id, source_type, source_entity, source_transaction, amount_units, currency,
         asset_type, restriction_status, authorization_id, vault, legal_custodian,
         beneficial_purpose, refused, reason, timestamp, proof_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(rec.contributionId, rec.sourceType, rec.sourceEntity, rec.sourceTransaction,
             rec.amount.units, rec.currency, rec.assetType, rec.restrictionStatus,
             rec.authorizationId, rec.vault, rec.legalCustodian, rec.beneficialPurpose,
             rec.refused ? 1 : 0, rec.reason, rec.timestamp, rec.proofHash);
    } catch { return null; }
    record({ eventType: 'RESERVE_UPDATE', memberId, amount: usd(cents),
             authorizedBy: by, restrictionStatus: rec.restrictionStatus,
             delivered: made.ok ? `contributed to ${rec.vault}` : null,
             reference: rec.contributionId, settled: !!made.ok,
             meta: { entry: entryId, refused: !!rec.refused, reason: rec.reason } });
    return rec;
  };

  // Everything material that happens in a room, written once, in one place.
  //
  // This is the event spine. Before it, the app had a bingo event log, a
  // payments table, a takes store on each phone and nothing that could answer
  // the SAPEMS questions in §44 across all of them. Now a door scan, a paid
  // entry, a settled pot and a membership all land in the SAME table with the
  // same shape, so "what happened, who authorized it, what money, whose money,
  // who received value" has one place to be asked.
  //
  // Fails soft, deliberately and on every path: a receipt that cannot be
  // written must never stop somebody getting through a door or being paid. The
  // record is evidence of the thing, not the thing.
  const vault = proofVault(db);
  const record = (fields) => {
    if (!economyFlags().WORLD_PROOFVAULT) return null;
    try { return vault.put(makeReceipt(fields)); } catch { return null; }
  };

  // The room's vote on the square being called.
  //
  // Everything here is derived from what the host already did — which square is
  // up, when it was called — so every phone gets the same verdict without a
  // deadline having to be pushed around. Only players who do NOT hold the
  // square may vote: voting on your own square is voting on whether you
  // personally have to sing.
  const micState = (r) => {
    const last = r.calls[r.calls.length - 1];
    if (!last || last.type !== 'lipsync' || r.status !== 'live') return null;
    const cards = db.prepare('SELECT member_id, card FROM bingo_cards').all()
      .map((row) => ({ member_id: row.member_id, card: JSON.parse(row.card) }));
    const holders = cards.filter((c) => c.card.some((sq) => sq && sq.id === last.id)).map((c) => c.member_id);
    const voters = cards.length - holders.length;
    const votes = db.prepare('SELECT COUNT(*) c FROM bingo_mic_votes WHERE square_id=?').get(String(last.id)).c;
    return {
      squareId: last.id, artist: last.artist, song: last.song,
      holders, voters, votes,
      forced: micIsForced(votes, voters),
      // Same input, same answer, on every phone in the room.
      endsAt: micDecideEndsAt(last.at, bingoWindowFor(last, r.nowPlaying?.clip)),
    };
  };

  // Everyone still in the round, ranked by how close they are to the pattern.
  // This is what turns one winner into a podium: second and third are decided
  // on the board, not on who happened to shout first.
  const bingoStandings = () => {
    const r = getBingoRound();
    const calledIds = new Set(r.calls.map((c) => c.id));
    return db.prepare(`SELECT c.member_id, c.card, c.covered, m.name, m.number
      FROM bingo_cards c JOIN members m ON m.id=c.member_id`).all()
      .map((row) => {
        const p = bingoProgressFor(JSON.parse(row.card), calledIds, new Set(JSON.parse(row.covered)), r.pattern);
        return {
          memberId: row.member_id, name: row.name, number: row.number,
          done: p.done, need: p.need, covered: p.covered,
          pct: p.need ? Math.round((p.done / p.need) * 100) : 0,
        };
      })
      // Closest to the pattern first; ties break on total squares covered,
      // then on name so the order never jitters between polls.
      .sort((a, b) => b.done - a.done || b.covered - a.covered || a.name.localeCompare(b.name));
  };

  // Settle the podium: the claimant takes first, the sprint decides the rest.
  const closePodium = () => {
    const r = getBingoRound();
    if (r.status !== 'podium') return null;
    const rest = bingoStandings().filter((p) => p.memberId !== r.podium_first);
    const winner = bingoStandings().find((p) => p.memberId === r.podium_first);
    const standings = [
      { ...(winner || { memberId: r.podium_first, name: '', number: '' }), place: 1 },
      ...rest.slice(0, 2).map((p, i) => ({ ...p, place: i + 2 })),
    ];
    commit('bingo.podium', { standings, first: r.podium_first, at: Date.now(), final_round: BINGO_FINAL_ROUND });
    return standings;
  };
  // No manual links, ever: the moment a real song gets called, search
  // YouTube for it and send the top result straight to the TV. Best-effort
  // — if it fails or no key is configured, the call itself already landed
  // and gameplay keeps going regardless.
  // Where this song's hook is. Worked out once, written down, and reused for
  // every night after — so the second time a song comes up there is no lookup
  // at all. Best source wins:
  //   replayed — YouTube's own replay heatmap, the crowd showing you the hook
  //   chapter  — the uploader labelled the chorus
  //   estimate — nothing to read, so cut it from the track's proportions
  const resolveClip = async (songId, videoId, ytKey, ytToken) => {
    const known = db.prepare('SELECT * FROM song_clips WHERE song_id=?').get(songId);
    // A stored read is reused unless it was a weak guess and the video changed.
    if (known && (known.video_id === videoId || known.confidence >= 60)) {
      return { start: known.start, seconds: known.seconds, hookAt: known.hook_at,
               source: known.source, confidence: known.confidence };
    }

    let duration = 0;
    try {
      const durUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}${ytToken ? '' : `&key=${ytKey}`}`;
      const dr = await fetch(durUrl, ytToken ? { headers: { Authorization: `Bearer ${ytToken}` } } : undefined);
      duration = ytSeconds((await dr.json()).items?.[0]?.contentDetails?.duration);
    } catch { /* fall through to the estimate */ }

    let found = null;
    try {
      // The watch page carries the heatmap and any chapters. This is the same
      // public page the embedded player loads; it is read once per song.
      const wr = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
                   'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (wr.ok) {
        const html = await wr.text();
        const chap = hookFromChapters(html);
        const heat = hookFromHeatmap(html);
        // A labelled chorus beats a read of the heatmap; a strong heatmap beats
        // a weak one. Either beats guessing.
        found = (chap && heat) ? (chap.confidence >= heat.confidence ? { ...chap, source: 'chapter' } : { ...heat, source: 'replayed' })
              : chap ? { ...chap, source: 'chapter' }
              : heat ? { ...heat, source: 'replayed' } : null;
      }
    } catch { /* the round never waits on this */ }

    const clip = found
      ? { ...windowAroundHook(found.hookAt, duration), hookAt: found.hookAt, source: found.source, confidence: found.confidence }
      : { ...clipWindowFor(duration), hookAt: null, source: 'estimate', confidence: duration ? 30 : 10 };

    try {
      db.prepare(`INSERT INTO song_clips(song_id,video_id,start,seconds,hook_at,source,confidence,updated_at)
        VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(song_id) DO UPDATE SET video_id=excluded.video_id, start=excluded.start,
          seconds=excluded.seconds, hook_at=excluded.hook_at, source=excluded.source,
          confidence=excluded.confidence, updated_at=excluded.updated_at`)
        .run(songId, videoId, clip.start, clip.seconds, clip.hookAt, clip.source, clip.confidence, Date.now());
    } catch { /* a failed write just means we look it up again next time */ }
    return clip;
  };

  const autoResolveMedia = async (item) => {
    const ytKey = youtubeKey();
    const ytToken = await googleAccessToken();
    if ((!ytKey && !ytToken) || !item || item.free || !item.artist) return;
    try {
      const q = `${item.artist} ${item.song}`;
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&videoEmbeddable=true&q=${encodeURIComponent(q)}${ytToken ? '' : `&key=${ytKey}`}`;
      // Signed-in host → the search runs on THEIR account and quota.
      const r = await fetch(url, ytToken ? { headers: { Authorization: `Bearer ${ytToken}` } } : undefined);
      const data = await r.json();
      // Remember WHY nothing played. A rejected key or an exhausted quota used
      // to be swallowed here, which put the host back where they started —
      // songs silent, no reason given. The round still never blocks on it.
      if (data.error) {
        putSetting('media_last_error', String(data.error.message || 'YouTube rejected the request'));
        return;
      }
      const it = data.items?.[0];
      if (it) {
        putSetting('media_last_error', '');
        const clip = await resolveClip(item.id, it.id.videoId, ytKey, ytToken);
        commit('bingo.media', {
          video: { videoId: it.id.videoId, title: it.snippet.title, clip },
          at: Date.now(),
        });
      } else {
        putSetting('media_last_error', `No YouTube result for "${q}"`);
      }
    } catch (e) {
      putSetting('media_last_error', `Could not reach YouTube: ${String(e.message || e).slice(0, 120)}`);
      /* media is a bonus, never a blocker */
    }
  };
  // Votes per performer, highest first — drives both the live meter and the
  // automatic winner when the host closes voting.
  // Who is currently looking at a battle's stream. A watcher counts for a few
  // seconds after their last poll, so a phone that locks or a TV that closes
  // stops being counted on its own without anything to clean up.
  const battleWatchers = new Map();          // battleId -> Map(viewer -> lastSeen)
  const WATCHER_TTL = 6000;
  const noteWatcher = (battleId, viewer) => {
    const key = String(battleId);
    if (!battleWatchers.has(key)) battleWatchers.set(key, new Map());
    battleWatchers.get(key).set(viewer, Date.now());
  };
  const watcherCount = (battleId) => {
    const m = battleWatchers.get(String(battleId));
    if (!m) return 0;
    const cut = Date.now() - WATCHER_TTL;
    for (const [v, t] of m) if (t < cut) m.delete(v);
    return m.size;
  };

  // Latest live frame per battle. In-memory and intentionally unbounded-free:
  // one small entry per battle, cleared when the battle resolves.
  const battleFrames = new Map();

  const battleTally = (battleId) => db.prepare(`
    SELECT p.member_id AS memberId, m.name, m.number, p.state, ms.tier, ms.vip,
           (SELECT COUNT(*) FROM lipsync_battles w WHERE w.winner_member_id=p.member_id) AS battleWins,
           (SELECT COUNT(*) FROM lipsync_battle_votes v WHERE v.battle_id=p.battle_id AND v.member_id=p.member_id) AS votes
    FROM lipsync_battle_players p
    JOIN members m ON m.id=p.member_id
    LEFT JOIN memberships ms ON ms.member_id=p.member_id
    WHERE p.battle_id=? ORDER BY votes DESC, m.name ASC`).all(battleId);

  const battlePublic = (b, viewerId) => {
    const players = battleTally(b.id);
    const total = players.reduce((n, p) => n + p.votes, 0);
    return {
      id: b.id, itemId: b.item_id, artist: b.artist, song: b.song,
      status: b.status, stage: b.stage,
      performingMemberId: b.performing_member_id, performanceEndsAt: b.performance_ends_at,
      // Set while the host is holding the clock; the number is what was left on it.
      timerHeldMs: b.paused_ms ?? null,
      votingEndsAt: b.voting_ends_at, winnerMemberId: b.winner_member_id,
      totalVotes: total,
      // share of the vote — the on-screen meter during voting
      players: players.map((p) => ({ ...p, share: total ? Math.round((p.votes / total) * 100) : 0 })),
      // Contender roster for the picking phase: who holds this square, and
      // how much of the room wants to see each of them do it. Every screen
      // renders this, so it carries enough to draw a profile card.
      pickEndsAt: b.pick_ends_at,
      contenders: (() => {
        if (b.status !== 'picking') return [];
        const rows = battlePicks(b.id);
        const cast = rows.reduce((n, r) => n + r.picks, 0);
        return rows.map((r, i) => ({
          ...r,
          share: cast ? Math.round((r.picks / cast) * 100) : 0,
          // Who would be chosen if the window closed right now.
          leading: i < 2,
        }));
      })(),
      totalPicks: b.status === 'picking' ? battlePicks(b.id).reduce((n, r) => n + r.picks, 0) : 0,
      myPick: db.prepare('SELECT member_id FROM lipsync_battle_picks WHERE battle_id=? AND voter_id=?').get(b.id, viewerId)?.member_id || null,
      // Live IG-Live layer: the last stretch of chat, plus running emoji totals.
      comments: db.prepare(`SELECT c.id, c.member_id AS memberId, m.name, c.body, c.at
        FROM lipsync_battle_comments c JOIN members m ON m.id=c.member_id
        WHERE c.battle_id=? AND c.kind='comment' ORDER BY c.at DESC LIMIT 40`).all(b.id).reverse(),
      reactions: db.prepare(`SELECT body AS emoji, COUNT(*) n FROM lipsync_battle_comments
        WHERE battle_id=? AND kind='reaction' GROUP BY body ORDER BY n DESC`).all(b.id),
      me: players.find((p) => p.memberId === viewerId) || null,
      myVote: db.prepare('SELECT member_id FROM lipsync_battle_votes WHERE battle_id=? AND voter_id=?').get(b.id, viewerId)?.member_id || null,
    };
  };

  // Who is allowed to cover a given LIP SYNC square. You must have won its
  // battle — or, when you were the only player holding it, have performed it.
  const lipSyncGate = (memberId, itemId) => {
    const locked = db.prepare('SELECT reason FROM lipsync_locks WHERE member_id=? AND item_id=?').get(memberId, itemId);
    if (locked) {
      return { ok: false, error: locked.reason === 'declined' ? 'you declined this battle'
        : locked.reason === 'not_picked' ? 'the room picked someone else for this one'
        : 'you lost this battle' };
    }
    const battle = db.prepare(`SELECT * FROM lipsync_battles WHERE item_id=? ORDER BY id DESC LIMIT 1`).get(itemId);
    if (!battle) return { ok: false, error: 'lip sync squares must be performed' };
    if (battle.status !== 'done') return { ok: false, error: 'battle not finished', battleId: battle.id };
    if (battle.winner_member_id !== memberId) return { ok: false, error: 'you did not win this battle', battleId: battle.id };
    return { ok: true };
  };

  // A called LIP SYNC square opens a battle between everyone holding it. Two
  // or more is a real battle; a single holder still has to perform it solo
  // before the square counts.
  // Titles are earned, not bought. Thresholds are deliberately reachable in a
  // few nights at the bottom and genuinely hard at the top, so there is always
  // a next one visible.
  const PLAYER_TITLES = [
    { at: 0,  title: 'First Timer' },
    { at: 2,  title: 'Regular' },
    { at: 5,  title: 'Card Shark' },
    { at: 10, title: 'Mic Holder' },
    { at: 18, title: 'Crowd Favorite' },
    { at: 30, title: 'Headliner' },
    { at: 50, title: 'After Spot Legend' },
  ];
  // One number behind every title: rounds are worth most, battles next, and
  // simply turning up still counts for something.
  const playerScore = (s) => (s.roundsWon || 0) * 5 + (s.seconds || 0) * 3 + (s.thirds || 0) * 2
    + (s.battlesWon || 0) * 2 + (s.nights || 0);
  const playerTitle = (s) => {
    const score = playerScore(s);
    let t = PLAYER_TITLES[0].title;
    for (const step of PLAYER_TITLES) if (score >= step.at) t = step.title;
    return t;
  };
  const nextTitle = (s) => {
    const score = playerScore(s);
    const step = PLAYER_TITLES.find((x) => x.at > score);
    return step ? { title: step.title, need: step.at - score } : null;
  };
  const playerStats = (memberId) => {
    const row = db.prepare(`SELECT nights, rounds_won AS roundsWon, seconds, thirds, battles_won AS battlesWon,
      battles_lost AS battlesLost, forfeits, squares, performances, streak, best_streak AS bestStreak, last_night AS lastNight
      FROM player_stats WHERE member_id=?`).get(memberId)
      || { nights: 0, roundsWon: 0, seconds: 0, thirds: 0, battlesWon: 0, battlesLost: 0, forfeits: 0, squares: 0, performances: 0, streak: 0, bestStreak: 0, lastNight: null };
    const fought = (row.battlesWon || 0) + (row.battlesLost || 0);
    return {
      ...row,
      score: playerScore(row),
      title: playerTitle(row),
      next: nextTitle(row),
      // Only meaningful once they have actually been in one.
      battleWinRate: fought ? Math.round((row.battlesWon / fought) * 100) : null,
      playedTonight: row.lastNight === nightKey(),
    };
  };

  const openBattleFor = (item) => {
    if (item?.type !== 'lipsync') return null;
    const existing = db.prepare(`SELECT id FROM lipsync_battles WHERE item_id=? AND status NOT IN ('done','void')`).get(item.id);
    if (existing) return existing.id;
    const holders = db.prepare('SELECT member_id, card FROM bingo_cards').all()
      .filter((r) => JSON.parse(r.card).some((s) => s && s.id === item.id))
      .map((r) => r.member_id)
      // someone who already forfeited this square isn't dragged back in
      .filter((m) => !db.prepare('SELECT 1 FROM lipsync_locks WHERE member_id=? AND item_id=?').get(m, item.id));
    if (holders.length === 0) return null;
    const id = Date.now();
    // Two contenders just battle. Three or more and the room chooses which two
    // — otherwise a square with five holders is decided by whoever taps
    // "accept" fastest, which is not a battle, it is a reflex test.
    const picking = holders.length > 2;
    commit('battle.open', {
      id, item_id: item.id, artist: item.artist, song: item.song, members: holders,
      status: picking ? 'picking' : 'pending',
      pick_ends_at: picking ? Date.now() + BATTLE_PICK_MS : null,
      at: Date.now(),
    });
    return id;
  };

  // ── Standalone Lip Sync Battle events ──
  // Bingo battles belong to a called square. An event is the standalone version:
  // its own lobby, its own matchmaking, its own standings. The bouts are plain
  // rows in lipsync_battles tagged with event_id, so perform / stream / vote /
  // chat all run on the code above unchanged.
  const activeEvent = () => db.prepare(`SELECT * FROM lipsync_events WHERE status!='done' ORDER BY id DESC LIMIT 1`).get();

  // Standings order IS the leaderboard for the open floor: wins, then how much
  // of the room voted for you, then name so the order never jitters mid-poll.
  const eventRoster = (eventId) => db.prepare(`
    SELECT p.member_id AS memberId, m.name, m.number, p.seed, p.wins, p.losses,
           p.votes_for AS votes, p.state, p.out_round AS outRound, ms.tier, ms.vip
    FROM lipsync_event_players p
    JOIN members m ON m.id=p.member_id
    LEFT JOIN memberships ms ON ms.member_id=p.member_id
    WHERE p.event_id=? ORDER BY p.wins DESC, p.votes_for DESC, m.name ASC`).all(eventId);

  const eventBouts = (eventId) => db.prepare(`
    SELECT b.id, b.round, b.slot, b.status, b.artist, b.song, b.winner_member_id AS winnerId,
           (SELECT GROUP_CONCAT(m.name, ' vs ') FROM lipsync_battle_players bp
              JOIN members m ON m.id=bp.member_id WHERE bp.battle_id=b.id) AS names
    FROM lipsync_battles b WHERE b.event_id=? ORDER BY b.round, b.slot`).all(eventId);

  const nameOf = (id) => db.prepare('SELECT name FROM members WHERE id=?').get(id)?.name || null;

  const eventPublic = (ev, viewerId) => {
    const roster = eventRoster(ev.id);
    const live = db.prepare(`SELECT * FROM lipsync_battles WHERE event_id=? AND status NOT IN ('done','void')
      ORDER BY id DESC LIMIT 1`).get(ev.id);
    return {
      id: ev.id, format: ev.format, title: ev.title, size: ev.size, status: ev.status, round: ev.round,
      king: ev.king_member_id ? { memberId: ev.king_member_id, name: nameOf(ev.king_member_id), reign: ev.reign } : null,
      champion: ev.champion_member_id ? { memberId: ev.champion_member_id, name: nameOf(ev.champion_member_id) } : null,
      roster, bouts: eventBouts(ev.id),
      remaining: roster.filter((r) => r.state === 'in').length,
      joined: roster.some((r) => r.memberId === viewerId),
      bout: live ? battlePublic(live, viewerId) : null,
    };
  };

  // A standalone bout still needs a song to perform. Host can name one; other-
  // wise take a lip-sync entry from whichever deck the venue is running —
  // skipping anything already performed this event, because back-to-back bouts
  // on the same song is the fastest way to make a bracket feel cheap.
  const boutSong = (eventId, artist, song) => {
    if (artist && song) return { artist, song };
    const r = getBingoRound();
    const items = deckById(r?.deckId || DEFAULT_DECK_ID).items.filter((i) => i.type === 'lipsync');
    const used = new Set(db.prepare('SELECT artist, song FROM lipsync_battles WHERE event_id=?').all(eventId)
      .map((b) => `${b.artist}|${b.song}`));
    const fresh = items.filter((i) => !used.has(`${i.artist}|${i.song}`));
    // Once the deck is exhausted the night can keep going — repeats beat
    // stopping — so fall back to the full list rather than to nothing.
    const pool = fresh.length ? fresh : items;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    return pick ? { artist: pick.artist, song: pick.song } : { artist: null, song: null };
  };

  // How many bouts a member has already been in, this event.
  const boutsFought = (eventId, memberId) => db.prepare(`SELECT COUNT(*) n FROM lipsync_battles b
    JOIN lipsync_battle_players p ON p.battle_id=b.id AND p.member_id=?
    WHERE b.event_id=?`).get(memberId, eventId).n;

  // Who is still waiting to fight in the current bracket round.
  const awaitingThisRound = (ev) => {
    const fought = new Set(db.prepare(`SELECT p.member_id FROM lipsync_battles b
      JOIN lipsync_battle_players p ON p.battle_id=b.id
      WHERE b.event_id=? AND b.round=?`).all(ev.id, ev.round).map((r) => r.member_id));
    return eventRoster(ev.id).filter((r) => r.state === 'in' && !fought.has(r.memberId));
  };

  // Open one bout of an event. Both names go in as 'invited' exactly like a
  // bingo battle, so a contender can still decline on their own phone.
  const openBout = (ev, pair, artist, song) => {
    // A bracket groups several bouts into one round; king of the hill and the
    // open floor are a single running sequence, so there each bout IS the
    // round — otherwise every bout files under "Bout 1" forever.
    const total = db.prepare('SELECT COUNT(*) n FROM lipsync_battles WHERE event_id=?').get(ev.id).n;
    const round = ev.format === 'bracket' ? ev.round : total + 1;
    const slot = db.prepare('SELECT COUNT(*) n FROM lipsync_battles WHERE event_id=? AND round=?').get(ev.id, round).n;
    const id = Date.now();
    const s = boutSong(ev.id, artist, song);
    commit('battle.open', {
      id, item_id: `event:${ev.id}:r${round}:s${slot}`, artist: s.artist, song: s.song,
      members: pair, status: 'pending', event_id: ev.id, round, slot, at: Date.now(),
    });
    return id;
  };

  // Pick the next matchup for an event. Each format answers one question —
  // bracket: who is left in this round; king: who takes on the throne; open
  // floor: who has performed least, so nobody sits out all night.
  const openNextBout = (ev, opts = {}) => {
    const { a, b, artist, song } = opts;
    const isIn = (m) => db.prepare(`SELECT state FROM lipsync_event_players WHERE event_id=? AND member_id=?`).get(ev.id, m);
    if (a && b) {                                        // host named the pair
      if (a === b) return { error: 'that is one person' };
      for (const m of [a, b]) {
        const row = isIn(m);
        if (!row) return { error: 'both battlers must be in the event' };
        if (row.state !== 'in') return { error: 'that member is already knocked out' };
      }
      return { boutId: openBout(ev, [a, b], artist, song) };
    }
    // Fewest bouts first keeps the floor moving through everybody; name breaks
    // ties so two polls never disagree about who is up.
    const byFewest = (x, y) => (boutsFought(ev.id, x.memberId) - boutsFought(ev.id, y.memberId))
      || String(x.name).localeCompare(String(y.name));

    if (ev.format === 'bracket') {
      let cur = ev;
      // Advance through rounds until a pair falls out. A lone survivor in a
      // round has nobody to fight, so they take a bye into the next one.
      for (let guard = 0; guard < 8; guard++) {
        const waiting = awaitingThisRound(cur).slice().sort((x, y) => (x.seed || 0) - (y.seed || 0));
        if (waiting.length >= 2) {
          // Top seed against bottom seed, the standard bracket draw.
          return { boutId: openBout(cur, [waiting[0].memberId, waiting[waiting.length - 1].memberId], artist, song) };
        }
        const stillIn = eventRoster(cur.id).filter((r) => r.state === 'in');
        if (stillIn.length <= 1) return { note: 'the bracket is finished' };
        commit('event.round', { event_id: cur.id, round: cur.round + 1 });
        cur = db.prepare('SELECT * FROM lipsync_events WHERE id=?').get(cur.id);
      }
      return { error: 'could not work out the next matchup' };
    }

    if (ev.format === 'king') {
      const roster = eventRoster(ev.id);
      if (!ev.king_member_id) {                          // first bout crowns one
        const two = roster.slice().sort(byFewest).slice(0, 2);
        if (two.length < 2) return { error: 'need 2 to open the floor' };
        return { boutId: openBout(ev, [two[0].memberId, two[1].memberId], artist, song) };
      }
      const challenger = roster.filter((r) => r.memberId !== ev.king_member_id).sort(byFewest)[0];
      if (!challenger) return { error: 'nobody left to challenge the king' };
      return { boutId: openBout(ev, [ev.king_member_id, challenger.memberId], artist, song) };
    }

    const roster = eventRoster(ev.id).slice().sort(byFewest);
    if (roster.length < 2) return { error: 'need at least 2 in the event' };
    return { boutId: openBout(ev, [roster[0].memberId, roster[1].memberId], artist, song) };
  };

  // Who the room voted to see battle, highest first. Ties break on name so the
  // order is stable between polls rather than jittering on every render.
  const battlePicks = (battleId) => db.prepare(`
    SELECT p.member_id AS memberId, m.name, m.number, p.state,
           ms.tier, ms.vip,
           (SELECT COUNT(*) FROM lipsync_battle_picks k WHERE k.battle_id=p.battle_id AND k.member_id=p.member_id) AS picks,
           (SELECT COUNT(*) FROM lipsync_battles w WHERE w.winner_member_id=p.member_id) AS battleWins
    FROM lipsync_battle_players p
    JOIN members m ON m.id=p.member_id
    LEFT JOIN memberships ms ON ms.member_id=p.member_id
    WHERE p.battle_id=? ORDER BY picks DESC, m.name ASC`).all(battleId);

  // Lock the roster to the top two. With no picks at all it still has to
  // choose somebody, or a square nobody voted on would hang forever.
  const lockBattleRoster = (battleId) => {
    const b = db.prepare('SELECT * FROM lipsync_battles WHERE id=?').get(battleId);
    if (!b || b.status !== 'picking') return null;
    const chosen = battlePicks(battleId).slice(0, 2).map((p) => p.memberId);
    commit('battle.lock', { battle_id: battleId, chosen, at: Date.now() });
    return chosen;
  };

  const bingoCallNext = async () => {
    const r = getBingoRound();
    if (r.status !== 'live') return null;
    const calledIds = new Set(r.calls.map((c) => c.id));
    const remaining = r.phrases.filter((p) => !calledIds.has(p.id));
    if (!remaining.length) return null;
    const item = { ...remaining[Math.floor(Math.random() * remaining.length)], at: Date.now() };
    commit('bingo.call', { calls: [...r.calls, item] });
    autoResolveMedia(item);
    openBattleFor(item);            // LIP SYNC squares must be performed for
    autofillCall(item);             // players who asked not to tap
    return item;
  };

  // Players who switched their card to auto-fill get the called square covered
  // for them. A LIP SYNC square is never auto-filled: those are earned by
  // performing, and handing one over for free would delete the battle.
  const autofillCall = (item) => {
    if (!item || item.type === 'lipsync') return;
    for (const row of db.prepare('SELECT member_id, card, covered FROM bingo_cards WHERE autofill=1').all()) {
      try {
        if (!JSON.parse(row.card).some((sq) => sq && sq.id === item.id)) continue;
        if (JSON.parse(row.covered).includes(item.id)) continue;
        commit('bingo.mark', { member_id: row.member_id, item_id: item.id, covered: true, at: Date.now() });
      } catch { /* one bad card must not stop the call */ }
    }
  };
  // Each call swaps the YouTube video on the TV, so the gap between calls IS
  // how long a song gets to play. At the old flat 6s the video was replaced
  // before anyone could lip sync to it — the whole point of the game. Now a
  // called song holds the screen for a real performance window, and the
  // ticker only advances once that window is up. A host pressing "Call Song"
  // still overrides immediately (that goes through bingoCallNext directly).
  setInterval(() => {
    // Close any picking window whose time is up. This runs regardless of round
    // status: a battle stuck in 'picking' would block its square forever.
    for (const b of db.prepare(`SELECT id FROM lipsync_battles WHERE status='picking' AND pick_ends_at IS NOT NULL AND pick_ends_at <= ?`).all(Date.now())) {
      try { lockBattleRoster(b.id); } catch { /* one stuck battle must not kill the ticker */ }
    }
    const r = getBingoRound();
    // A podium sprint that nobody closes must still end on its own, or the
    // round hangs and the night stops.
    if (r.status === 'podium') {
      if (r.podiumEndsAt && Date.now() >= r.podiumEndsAt) { try { closePodium(); } catch { /* never kill the ticker */ } }
      return;
    }
    if (r.status !== 'live') return;
    // Manual is the default: the host decides when the next song goes on.
    // Auto is a switch they can flip when they want the night to run itself.
    if (!r.autoCall) return;
    const last = r.calls[r.calls.length - 1];
    if (last?.at && Date.now() - last.at < bingoWindowFor(last, r.nowPlaying?.clip)) return;  // clip still running
    bingoCallNext().catch(() => {});
  }, 2000).unref?.();

  const emitBoard = () => {
    const payload = `data: ${JSON.stringify(board())}\n\n`;
    for (const res of sse) res.write(payload);
  };
  const board = () => {
    const nk = nightKey();
    const onTheWay = db.prepare(`SELECT m.* FROM signals s JOIN members m ON m.id=s.member_id
       WHERE s.on_the_way=1 AND m.id NOT IN (SELECT member_id FROM entries WHERE night=?)`).all(nk).map(publicMember);
    const inside = db.prepare(`SELECT m.* FROM entries e JOIN members m ON m.id=e.member_id WHERE e.night=? AND e.left_at IS NULL`).all(nk).map(publicMember);
    // Full recent audit trail (venue-wide, every staff device sees the same
    // list) — the door dashboard's "Recent door decisions" panel. Includes the
    // member's name via a join so staff don't have to look up bare numbers.
    const recentDecisions = db.prepare(
      `SELECT d.*, m.name FROM decisions d LEFT JOIN members m ON m.id = d.member_id ORDER BY d.at DESC LIMIT 25`
    ).all();
    // Full member roster for the door dashboard's safety view — every member,
    // always visible, not just whoever is currently on-the-way/inside. Lets
    // staff see at a glance who's signed in but hasn't shown, who's left, etc.
    // (e.g. flagging a lost phone or a no-show). Ordered inside → on the way
    // → signed in → left, and by most-recently-relevant timestamp within each
    // group, so the most actionable members surface first.
    const STATUS_ORDER = { inside: 0, onTheWay: 1, signedIn: 2, left: 3 };
    const allMembers = db.prepare('SELECT * FROM members').all().map(publicMember).map((pm) => ({
      ...pm,
      doorStatus: pm.insideTonight ? 'inside' : pm.leftTonight ? 'left' : pm.onTheWay ? 'onTheWay' : 'signedIn',
    })).sort((a, b) => {
      const byStatus = STATUS_ORDER[a.doorStatus] - STATUS_ORDER[b.doorStatus];
      if (byStatus) return byStatus;
      const atOf = (x) => (x.doorStatus === 'inside' ? x.enteredAt : x.doorStatus === 'onTheWay' ? x.onTheWayAt : x.doorStatus === 'left' ? x.leftAt : 0);
      return (atOf(b) || 0) - (atOf(a) || 0);
    });
    return { onTheWay, inside, lastDecision: recentDecisions[0] || null, recentDecisions, allMembers };
  };

  // ── Who is asking ────────────────────────────────────────────────────────
  //
  // A signed token says who you were when it was minted. For a named staff
  // account that is not enough: "Remove Trey" has to mean Trey's phone stops
  // working NOW, not whenever his 12-hour session happens to lapse. So a named
  // session is re-checked against the account on every single request, and a
  // disabled account fails the next tap.
  //
  // The cost is one indexed primary-key lookup per staff request. The thing it
  // buys is that removing somebody is a real act rather than a note in a table.
  const staffAccount = db.prepare('SELECT * FROM staff_accounts WHERE staff_id=?');
  const touchStaff = db.prepare('UPDATE staff_accounts SET last_seen_at=? WHERE staff_id=?');
  const auth = (req, role) => {
    const h = req.headers.authorization || '';
    const claims = readSession(secret, h.replace(/^Bearer /, ''));
    if (!claims) return null;
    if (role && claims.role !== role) return null;
    if (claims.named) {
      const acct = staffAccount.get(claims.sub);
      if (!acct || acct.disabled_at) return null;
      // The role lives on the account, not on the token — a token minted when
      // somebody was a host must not outlive their being one.
      if (acct.role !== claims.role) return null;
      touchStaff.run(Date.now(), claims.sub);
      return { ...claims, name: acct.name };
    }
    return claims;
  };
  // Running the night and releasing money are different powers. A shared code
  // still opens the door, checks members in and runs the game — the owner can
  // never be locked out of their own venue by a lost phone. What it cannot do
  // is be one of the people who approve a payment, because "staff-device"
  // approving twice is one person approving twice, and §55 exists to stop
  // exactly that. Nothing here refuses a shared code until a money action asks.
  const houseAuth = (req) => {
    const c = auth(req);
    if (!c || (c.role !== 'staff' && c.role !== 'host')) return null;
    return c;
  };
  // Who runs the team. Exactly one account does, and it is the owner's.
  //
  // The bootstrap is the only interesting case: on a brand-new venue nobody has
  // a named account yet, so the shared host code is allowed to create the FIRST
  // one — that is the owner giving themselves an identity, and it is the only
  // thing the shared code can do here. The moment an admin exists, the shared
  // code stops being able to add anyone, and so does every other host.
  const adminAccount = () => db.prepare(
    `SELECT * FROM staff_accounts WHERE admin=1 AND disabled_at IS NULL`).get() || null;
  const adminAuth = (req, res) => {
    const c = auth(req);
    if (!c || (c.role !== 'staff' && c.role !== 'host')) { json(res, 401, { error: 'unauthorized' }); return null; }
    const admin = adminAccount();
    if (!admin) {
      // Nothing to protect yet. Only the host code can open the venue's first
      // account — a door code must not be able to make itself the owner.
      if (c.role === 'host') return { ...c, bootstrap: true };
      json(res, 403, { error: 'Only the owner sets up the team. Sign in with the venue host code first.' });
      return null;
    }
    if (c.named && c.sub === admin.staff_id) return c;
    json(res, 403, { error: `Only ${admin.name} manages the team.` });
    return null;
  };
  // The venue's cut of a member-to-member sale, and what a referral pays.
  // Both are SETTINGS, adopted by the house, never constants — a rate baked
  // into the code is a rate nobody agreed to and nobody can change tonight.
  const rateSetting = (key, fallback) => {
    const raw = setting(key);
    if (raw == null || String(raw).trim() === '') return fallback;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  };
  const marketFeePercent = () => rateSetting('market_fee_percent', 0.10);
  // Ten per cent of the tier the person they brought actually paid for.
  //
  // It was fifteen. Playing a whole night through showed what that actually
  // meant: the promoter who brought nine people went home with more than double
  // what the chef who cooked took, having done no work in the room. Ten keeps
  // bringing people well paid without making it the best-paid thing here.
  //
  // Every member has a code, not only promoters — bringing somebody is the one
  // kind of work here that anybody can do, and it pays on the membership rather
  // than on the signup, so producing accounts earns nothing.
  const referralRatePercent = () => rateSetting('referral_rate_percent', 0.10);
  // Everybody has a code, made the first time somebody asks for it, derived
  // from their name so a promoter can put it on a flyer.
  const codeFor = (memberId) => {
    const m = db.prepare('SELECT id, name, referral_code FROM members WHERE id=?').get(memberId);
    if (!m) return null;
    if (m.referral_code) return m.referral_code;
    for (let i = 0; i < 40; i++) {
      const code = referralCodeFor(m.name, `${m.id}:${i}`);
      const taken = db.prepare('SELECT id FROM members WHERE referral_code=?').get(code);
      if (!taken) { db.prepare('UPDATE members SET referral_code=? WHERE id=?').run(code, m.id); return code; }
    }
    return null;
  };
  // Credit whoever brought this member, for money that actually arrived.
  //
  // Paid on real settled money and never on a signup: otherwise the incentive is
  // to produce accounts rather than people, and a promoter who fills a room and
  // one who fills a spreadsheet earn the same.
  const creditReferrer = ({ memberId, event, reference, grossCents }) => {
    const m = db.prepare('SELECT referred_by FROM members WHERE id=?').get(memberId);
    if (!m?.referred_by) return null;
    const calc = referralCommission({ grossCents, ratePercent: referralRatePercent(), event });
    if (!calc.ok || calc.commissionCents <= 0) return null;
    const creditId = `REF-${randomBytes(6).toString('hex').toUpperCase()}`;
    try {
      db.prepare(`INSERT INTO referral_credits
        (credit_id, referrer_id, member_id, event, reference, gross_units, commission_units, rate_percent, status, at)
        VALUES (?,?,?,?,?,?,?,?, 'EARNED', ?)`)
        .run(creditId, m.referred_by, memberId, event, String(reference),
             calc.grossCents, calc.commissionCents, calc.ratePercent, Date.now());
    } catch { return null; }   // the unique index: one credit per paid thing
    return { creditId, commissionCents: calc.commissionCents };
  };
  const bookingRow = (b) => ({
    bookingId: b.booking_id, title: b.title, detail: b.detail || null,
    startsAt: b.starts_at || null, priceCents: b.price_units,
    depositCents: b.deposit_units, stakeCents: b.stake_units, stakeLayer: b.stake_layer,
    stage: b.stage, stageLabel: BOOKING_STAGE[b.stage]?.label,
    nextIs: BOOKING_STAGES[(BOOKING_STAGE[b.stage]?.order ?? 0) + 1] || null,
    failure: b.failure || null,
    failureLabel: b.failure ? BOOKING_FAILURES[b.failure]?.label : null,
    settlement: b.settled_at ? {
      toProvider: b.to_provider_units, toVenue: b.to_venue_units, toClient: b.to_client_units,
      stakeReturned: b.stake_returned_units, stakeForfeited: b.stake_forfeited_units,
    } : null,
    at: b.at,
  });
  const listingRow = (l) => ({
    listingId: l.listing_id, kind: l.kind, kindLabel: LISTING_KINDS[l.kind]?.label,
    title: l.title, detail: l.detail || null,
    priceCents: l.price_units, priceMode: l.price_mode,
    priceModeLabel: PRICE_MODES[l.price_mode]?.label,
    delivery: l.delivery, deliveryLabel: DELIVERY[l.delivery]?.label,
    status: l.status, at: l.at,
  });

  const offerRow = (o) => ({
    offerId: o.offer_id, assetId: o.asset_id, type: o.type,
    typeLabel: LICENSE_TYPES[o.type]?.label, grants: LICENSE_TYPES[o.type]?.grants,
    scope: o.scope, scopeLabel: LICENSE_SCOPES[o.scope]?.label,
    term: o.term, termLabel: LICENSE_TERMS[o.term]?.label,
    exclusive: !!o.exclusive, priceCents: o.price_units, credit: !!o.credit,
    note: o.note || null, status: o.status, at: o.at,
  });
  const grantRow = (g) => ({
    grantId: g.grant_id, offerId: g.offer_id, assetId: g.asset_id,
    buyer: g.buyer_name, type: g.type, typeLabel: LICENSE_TYPES[g.type]?.label,
    scope: g.scope, term: g.term, exclusive: !!g.exclusive,
    priceCents: g.price_units, status: g.status,
    startsAt: g.starts_at || null, expiresAt: g.expires_at,
    terms: (() => { try { return JSON.parse(g.terms_json); } catch { return null; } })(),
    termsHash: g.terms_hash,
  });

  // ── The Room's helpers ────────────────────────────────────────────────────

  // Somebody as the room sees them. NOT as the door sees them: no contact, no
  // member number, no tier. Those belong to the person and to the door, and a
  // social feed is the last place they should surface — a screenshot of a feed
  // must never be a screenshot of somebody's identity.
  const profileOf = (memberId) => {
    const m = db.prepare('SELECT id, name, member_role FROM members WHERE id=?').get(memberId);
    if (!m) return null;
    const p = db.prepare('SELECT * FROM profiles WHERE member_id=?').get(memberId) || {};
    return {
      id: m.id,
      name: m.name,
      handle: p.handle || null,
      bio: p.bio || null,
      avatar: p.avatar || null,
      links: (() => { try { return JSON.parse(p.links || 'null'); } catch { return null; } })(),
      trade: m.member_role || null,
      tradeLabel: m.member_role ? MEMBER_ROLE[m.member_role]?.label : null,
      followers: db.prepare('SELECT COUNT(*) n FROM follows WHERE followee_id=?').get(memberId).n,
      following: db.prepare('SELECT COUNT(*) n FROM follows WHERE follower_id=?').get(memberId).n,
      posts: db.prepare('SELECT COUNT(*) n FROM posts WHERE member_id=? AND hidden_at IS NULL').get(memberId).n,
    };
  };

  // Messages from `other` that arrived after this member last opened the thread.
  const unreadFrom = (memberId, otherId) => {
    const seen = db.prepare('SELECT read_at FROM thread_reads WHERE member_id=? AND other_id=?')
      .get(memberId, otherId)?.read_at || 0;
    return db.prepare('SELECT COUNT(*) n FROM messages WHERE from_id=? AND to_id=? AND at>?')
      .get(otherId, memberId, seen).n;
  };

  const blocked = (a, b) =>
    !!db.prepare('SELECT 1 FROM member_blocks WHERE member_id=? AND blocked_id=?').get(a, b);

  const reactionsOn = (postId, viewerId) => {
    const rows = db.prepare('SELECT emoji, member_id FROM post_reactions WHERE post_id=?').all(postId);
    const counts = {};
    let mine = null;
    for (const r of rows) {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      if (r.member_id === viewerId) mine = r.emoji;
    }
    return { counts, mine, total: rows.length };
  };

  const commentsOn = (postId, viewerId) =>
    db.prepare(`SELECT * FROM post_comments WHERE post_id=? AND hidden_at IS NULL ORDER BY at ASC LIMIT 200`)
      .all(postId)
      .filter((x) => !blocked(x.member_id, viewerId) && !blocked(viewerId, x.member_id))
      .map((x) => ({
        commentId: x.comment_id, body: x.body, at: x.at,
        by: profileOf(x.member_id), mine: x.member_id === viewerId,
      }));

  const postRow = (p, viewerId) => ({
    postId: p.post_id,
    by: profileOf(p.member_id),
    body: p.body || null,
    media: p.media || null,
    kind: p.kind,
    expiresAt: p.expires_at || null,
    at: p.at,
    mine: p.member_id === viewerId,
    reactions: reactionsOn(p.post_id, viewerId),
    comments: db.prepare('SELECT COUNT(*) n FROM post_comments WHERE post_id=? AND hidden_at IS NULL').get(p.post_id).n,
  });

  // Where a member stands with the association: in, gone, or put out.
  //
  // Derived from the history rather than stored as a flag, so that leaving and
  // coming back twice reads as two departures and two returns — which is what
  // it was — instead of one boolean that has been flipped four times and
  // remembers none of it.
  const standingOf = (memberId) => {
    const last = db.prepare(
      `SELECT state, reason, at, by_name FROM member_standing WHERE member_id=? ORDER BY at DESC, id DESC LIMIT 1`)
      .get(memberId);
    if (!last || last.state === 'REJOINED') return { state: 'MEMBER', since: last?.at || null };
    return { state: last.state, at: last.at, reason: last.reason || null, by: last.by_name || null };
  };

  // Where somebody is in becoming a member here.
  const onboardingOf = (memberId) => {
    const m = db.prepare('SELECT member_role, program FROM members WHERE id=?').get(memberId);
    const a = db.prepare(
      `SELECT version FROM member_agreements WHERE member_id=? AND document='COVENANT' ORDER BY at DESC LIMIT 1`)
      .get(memberId);
    return onboardingState({
      agreedVersion: a?.version || null,
      memberRole: m?.member_role || null,
      program: m?.program || null,
      // Dues are the last step of joining, not a separate errand afterwards.
      // A membership that has lapsed is not a joined member either — they are
      // asked again rather than quietly kept inside on an expired one.
      hasMembership: (() => {
        const ms = membershipOf(memberId);
        return !!ms && ms.status === 'active' && ms.expires_at > Date.now();
      })(),
      knownRole: (r) => !!MEMBER_ROLE[r],
    });
  };
  // Acceptance is a moment worth having a date on — it is when somebody became
  // a member of this place rather than an account that had signed in.
  const markAcceptedIfDone = (memberId) => {
    if (!onboardingOf(memberId).accepted) return false;
    const row = db.prepare('SELECT accepted_at FROM members WHERE id=?').get(memberId);
    if (row?.accepted_at) return true;
    db.prepare('UPDATE members SET accepted_at=? WHERE id=?').run(Date.now(), memberId);
    return true;
  };
  // Using the place requires having been accepted into it. This gates the doing
  // — playing, asking for support, giving, the marketplace — and never the
  // steps themselves, or somebody could not finish what they started.
  //
  // It refuses with the step they are on, because "not accepted" tells a person
  // standing there nothing they can act on.
  const acceptedMember = (req, res) => {
    const c = auth(req, 'member');
    if (!c) { json(res, 401, { error: 'unauthorized' }); return null; }
    const st = onboardingOf(c.sub);
    if (!st.accepted) {
      json(res, 403, {
        error: st.next ? `Finish signing up first: ${st.next.label.toLowerCase()}.` : 'Finish signing up first.',
        onboarding: st,
      });
      return null;
    }
    return c;
  };

  // Taking a membership is the LAST step of joining, which means it cannot
  // require joining to be finished — that is a deadlock, and it is exactly the
  // one that appears the moment dues become part of the sign-up.
  //
  // So this gate is the same as acceptedMember with the dues step excused: they
  // have read the covenant and agreed to it, said what they do, and chosen a
  // programme. What they have not done yet is the thing they are about to do.
  const joiningMember = (req, res) => {
    const c = auth(req, 'member');
    if (!c) { json(res, 401, { error: 'unauthorized' }); return null; }
    const st = onboardingOf(c.sub);
    const owed = st.steps.filter((s2) => !s2.done && s2.id !== 'TIER');
    if (owed.length) {
      json(res, 403, {
        error: `Finish signing up first: ${owed[0].label.toLowerCase()}.`,
        onboarding: st,
      });
      return null;
    }
    return c;
  };

  // Money needs a person, not a role. Returns the claims, or writes the refusal
  // and returns null — and the refusal says how to fix it, because "403" to a
  // host at 1am is a support call rather than a security control.
  const moneyAuth = (req, res) => {
    const c = houseAuth(req);
    if (!c) { json(res, 401, { error: 'unauthorized' }); return null; }
    if (!c.named) {
      json(res, 403, { error: 'A shared venue code can run the night but cannot approve money. Sign in as yourself — the host can add you on the Team screen in about ten seconds.' });
      return null;
    }
    return c;
  };

  // ── Jubilee ──────────────────────────────────────────────────────────────
  //
  // The reserve's real numbers, from the rows that produced them. Nothing here
  // is a figure somebody typed: the reserve is the sum of accepted
  // contributions, and commitments are awards that have been approved and not
  // yet paid — money already spoken for, which is the part a naive balance
  // would double-count into a release it cannot fund.
  const reserveNow = () => {
    const accepted = db.prepare(`SELECT vault, SUM(amount_units) u FROM world_contributions WHERE refused=0 GROUP BY vault`).all();
    const total = accepted.reduce((n, r) => n + r.u, 0);
    const committed = db.prepare(`SELECT SUM(amount_units) u FROM jubilee_awards WHERE status LIKE 'APPROVED%'`).get()?.u || 0;
    const byVault = Object.fromEntries(VAULTS.map((v) => [v, 0]));
    for (const r of accepted) if (byVault[r.vault] !== undefined) byVault[r.vault] += r.u;
    return {
      health: reserveHealth({
        actualReserve: usd(total),
        restricted: usd(0),                       // refused money never entered
        commitments: usd(committed),
        operatingFloor: usd(Number(setting('world_operating_floor_cents') || 0) || 0),
        emergencyMinimum: usd(Number(setting('world_emergency_min_cents') || 0) || 0),
      }),
      byVault,
    };
  };

  // The adopted release policy. Absent means nothing releases — a draft policy
  // funds nothing, which is the KODEX's own rule about instruments that have
  // been written but not adopted.
  const jubileePolicy = () => {
    const pct = Number(setting('world_max_release_percent') || 0) || 0;
    const by = setting('world_policy_adopted_by');
    if (!by || pct <= 0) return draftAllocationPolicy({ transactionType: 'JUBILEE', paymentRail: 'BANK' });
    return {
      ...adopt(draftAllocationPolicy({
        transactionType: 'JUBILEE', paymentRail: 'BANK',
        maxJubileeReleasePercent: pct,
        maximumSingleProgramRelease: Number(setting('world_max_single_cents') || 0) > 0
          ? usd(Number(setting('world_max_single_cents'))) : null,
      }), { approver: by, effectiveDate: Number(setting('world_policy_adopted_at') || Date.now()) }),
      normalApprovals: Number(setting('world_normal_approvals') || 3) || 3,
      emergencyApprovals: Number(setting('world_emergency_approvals') || 2) || 2,
      maximumEmergencyRelease: Number(setting('world_max_emergency_cents') || 0) > 0
        ? usd(Number(setting('world_max_emergency_cents'))) : null,
      emergencyWindowMs: Number(setting('world_emergency_window_ms') || 24 * 3600000) || 24 * 3600000,
    };
  };

  const vendorRow = (v) => ({ providerId: v.provider_id, name: v.name, kind: v.kind, approved: !!v.approved, contact: v.contact });
  const appRow = (r) => ({
    applicationId: r.application_id, memberId: r.member_id, needKind: r.need_kind,
    amount: usd(r.amount_units), detail: r.detail, providerHint: r.provider_hint,
    evidenceNote: r.evidence_note, evidenceVerified: !!r.evidence_verified,
    verifiedBy: r.verified_by, status: r.status, at: r.at,
  });

  // ── routes ──
  // Spending an invite. Single-use is enforced here and nowhere else, so this
  // is the only place that can get it wrong: the row is claimed by a
  // conditional UPDATE, and a second phone racing the first loses because its
  // UPDATE matches no rows rather than because it read a flag a moment later.
  // Every programme, with the two numbers that make joining mean something:
  // how many members stand behind it, and what is actually in its vault.
  const programBoard = () => {
    const counts = Object.fromEntries(db.prepare(
      `SELECT program, COUNT(*) n FROM members WHERE program IS NOT NULL GROUP BY program`)
      .all().map((r) => [r.program, r.n]));
    // What members have GIVEN, which is the only member money a programme ever
    // holds. An entry fee is not a donation and is not counted here.
    const given = Object.fromEntries(db.prepare(
      `SELECT program, SUM(amount_units) c FROM program_donations WHERE status='RECEIVED' GROUP BY program`)
      .all().map((r) => [r.program, r.c || 0]));
    const seats = db.prepare(
      `SELECT bs.program, bs.position, bs.seated_at, m.name FROM board_seats bs
       LEFT JOIN members m ON m.id = bs.member_id WHERE bs.member_id IS NOT NULL`).all();
    const { byVault } = reserveNow();
    return Object.entries(PROGRAMS).map(([id, p]) => {
      const held = seats.filter((s) => s.program === id);
      return {
        id, label: p.label, vault: p.vault,
        members: counts[id] || 0,
        donatedCents: given[id] || 0,
        vaultCents: byVault?.[p.vault] || 0,
        board: BOARD_POSITIONS.map((pos) => {
          const seat = held.find((h) => h.position === pos.id);
          return { ...pos, heldBy: seat?.name || null, since: seat?.seated_at || null };
        }),
        openSeats: BOARD_POSITIONS.length - held.length,
      };
    });
  };

  const claimInvite = (req, res, code) => {
    const inv = db.prepare('SELECT * FROM staff_invites WHERE code=?').get(code);
    if (!inv) return json(res, 401, { error: 'bad code' });
    if (inv.used_at) return json(res, 401, { error: 'That code has already been used. Ask for a new one.' });
    if (Date.now() > inv.expires_at) return json(res, 401, { error: 'That code has expired. Ask for a new one.' });
    const acct = db.prepare('SELECT * FROM staff_accounts WHERE staff_id=?').get(inv.staff_id);
    if (!acct || acct.disabled_at) return json(res, 401, { error: 'That account is no longer on the team.' });
    const device = (req.headers['user-agent'] || '').slice(0, 120);
    const spent = db.prepare('UPDATE staff_invites SET used_at=?, used_device=? WHERE code=? AND used_at IS NULL')
      .run(Date.now(), device, code);
    if (!spent.changes) return json(res, 401, { error: 'That code has already been used. Ask for a new one.' });
    db.prepare('UPDATE staff_accounts SET last_seen_at=? WHERE staff_id=?').run(Date.now(), acct.staff_id);
    json(res, 200, {
      token: signSession(secret, { sub: acct.staff_id, role: acct.role, named: true, name: acct.name }, SESSION_TTL),
      role: acct.role, name: acct.name, named: true, staffId: acct.staff_id,
    });
  };
  // How many DIFFERENT people could sign off on a release. This is what makes
  // §55 a number instead of a wish: a policy asking for more approvers than
  // the venue has real people is one nobody can ever satisfy.
  // Only accounts somebody has actually claimed count. An invite that was made
  // and never scanned is a name in a table, not a second person in the room.
  // An approval is KEYED by the account id — names can be reused after somebody
  // leaves, and two different Chrises must not collapse into one approver. But
  // an id is unreadable on a rota, so it is resolved to a name on the way out.
  const staffNameOf = (id) => db.prepare('SELECT name FROM staff_accounts WHERE staff_id=?').get(id)?.name || id;
  const countNamedApprovers = () => db.prepare(
    `SELECT COUNT(*) n FROM staff_accounts WHERE disabled_at IS NULL AND last_seen_at IS NOT NULL`).get().n;

  const routes = {
    'GET /health': (req, res) => json(res, 200, { ok: true, service: 'hvas', time: Date.now() }),

    // PayPal subscription webhook — verified server-side activation. On a
    // confirmed BILLING.SUBSCRIPTION.ACTIVATED, map plan → tier and activate the
    // member's membership (custom_id = member id, set on the button). Only
    // activates when the webhook signature verifies, so it can't be spoofed.
    'POST /paypal/webhook': async (req, res) => {
      const raw = await readRaw(req);
      let event; try { event = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad body' }); }
      const okSig = await paypalVerify(req.headers, raw);
      if (!okSig) return json(res, 202, { received: true, verified: false }); // ack but do nothing
      if (event.event_type === 'BILLING.SUBSCRIPTION.ACTIVATED' || event.event_type === 'PAYMENT.SALE.COMPLETED') {
        const r = event.resource || {};
        const memberId = r.custom_id || r.custom || null;
        const tier = PAYPAL_PLAN_TIER[r.plan_id] || null;
        const t = tier && TIERS[tier];
        if (memberId && t && db.prepare('SELECT 1 FROM members WHERE id=?').get(memberId)) {
          const now = Date.now();
          commit('membership.upsert', { member_id: memberId, tier, vip: t.vip, payment: 'PayPal', purchased_at: now, expires_at: now + t.days * 86400000, status: 'active' });
          mintForPayment(db, walletKey, { memberId, usdAmount: t.price, reason: 'paypal' }).catch(() => {});
        }
      }
      json(res, 200, { received: true, verified: true });
    },
    'GET /keys/pub': (req, res) => json(res, 200, { alg: 'Ed25519', publicKey: publicKeyRaw(keys.publicKey), rollTtlMs: 45000 }),

    // Config-over-the-air: an app that knows only this node's URL pulls the
    // venue name + receiving handles from here, so config lives in one place
    // (the backend) and every device picks it up — no per-device rebuild.
    'GET /config': (req, res) => json(res, 200, {
      venue: process.env.HVAS_VENUE_NAME || 'HITMANS VIP After Spot',
      venueId: venueId(),   // permanent; the address is not
      paypalMe: process.env.PAYPAL_ME || process.env.VITE_PAYPAL_ME || '',
      zelle: process.env.HVAS_ZELLE || process.env.VITE_ZELLE_HANDLE || '',
      features: { social: true, pay: true, mesh: !!meshPort, youtube: !!youtubeKey(), hitkoin: hitkoinEnabled() },
      hitkoinPerDollar: Number(process.env.HITKOIN_PER_DOLLAR || 100),
    }),

    // Member self-serve auth (mock OTP — dev code returned; wire a real SMS
    // provider here in production).
    // Asking for a code.
    //
    // This used to hand the code straight back in its own response, which is
    // fine on a laptop in a locked room and indefensible on the open internet:
    // it means anybody can sign up as anybody's number, and the verification
    // step verifies nothing but that you can type.
    //
    // Now: if the venue has a way to send, it sends, and the code never
    // touches the response. If it has no way to send — a laptop serving its
    // own room with no internet — it echoes as before, because a member
    // standing in the venue must not be locked out by a mail provider.
    // ── Can this venue actually reach a member? ──────────────────────────────
    //
    // The owner needs to know this BEFORE the night, not from a member standing
    // at the door saying nothing arrived. So: what is configured, what it can
    // send, and a button that sends a real one to prove it.
    'GET /notify/status': (req, res) => {
      const c = adminAuth(req, res); if (!c) return;
      const cfg = deliveryConfig(setting);
      json(res, 200, {
        canSend: cfg.canSend,
        email: cfg.emailProvider,
        sms: cfg.smsProvider,
        from: cfg.emailProvider ? (cfg[cfg.emailProvider]?.from || null) : null,
        smsFrom: cfg.smsProvider ? cfg.twilio.from : null,
        venueName: cfg.venueName,
        // Said plainly, because the difference decides whether sign-ups are
        // real verification or a formality.
        meaning: cfg.canSend
          ? 'Codes are sent. A member has to receive one to sign up.'
          : 'No sender configured, so the code is shown on screen instead. Anybody can sign up as any contact until this is set.',
        // SMS in the US cannot simply be switched on, and finding that out the
        // day before a launch is how a launch slips.
        smsNote: cfg.smsProvider
          ? null
          : 'Texting needs A2P 10DLC carrier registration, which takes days to weeks. Email works immediately.',
        providers: ['resend', 'postmark', 'sendgrid', 'mailgun', 'twilio'],
      });
    },

    // Setting it up from the venue's own screen, so nobody has to edit a file
    // and restart a server on the afternoon of a launch.
    'POST /notify/config': async (req, res) => {
      const c = adminAuth(req, res); if (!c) return;
      const body = await readBody(req);
      const ALLOWED = ['resend_api_key', 'postmark_token', 'sendgrid_api_key', 'mailgun_api_key',
                       'mailgun_domain', 'mail_from', 'twilio_account_sid', 'twilio_auth_token',
                       'twilio_from', 'venue_display_name'];
      const wrote = [];
      for (const k of ALLOWED) {
        if (!(k in body)) continue;
        putSetting(k, String(body[k] ?? '').trim());
        wrote.push(k);
      }
      if (!wrote.length) return json(res, 400, { error: 'nothing to set', allowed: ALLOWED });
      const cfg = deliveryConfig(setting);
      // Never echo a key back. The screen that set it does not need to read it.
      json(res, 200, { ok: true, set: wrote, canSend: cfg.canSend, email: cfg.emailProvider, sms: cfg.smsProvider });
    },

    // A real send, to the owner, on demand. The only honest way to know this
    // works is to have it work once.
    'POST /notify/test': async (req, res) => {
      const c = adminAuth(req, res); if (!c) return;
      const { contact } = await readBody(req);
      const who = String(contact || '').trim();
      if (contactKind(who) === 'unknown') return json(res, 400, { error: 'Enter a phone number or an email address.' });
      const cfg = deliveryConfig(setting);
      if (!cfg.canSend) return json(res, 400, { error: 'Nothing is configured to send with yet.' });
      const out = await sendCode({ contact: who, code: '000000', cfg });
      if (!out.ok) return json(res, 502, { error: out.error, kind: out.kind, via: out.via || null });
      json(res, 200, { ok: true, via: out.via, kind: out.kind, id: out.id || null,
                       note: 'Sent. If it does not arrive, the provider accepted it and the problem is downstream — check spam, then the provider dashboard.' });
    },

    'POST /auth/member/start': async (req, res) => {
      const { contact } = await readBody(req);
      const who = String(contact || '').trim();
      if (who.length < 5) return json(res, 400, { error: 'contact required' });
      const cfg = deliveryConfig(setting);
      // A contact only has to be REACHABLE if this venue is going to reach it.
      // With no sender configured the contact is just the name a member is
      // known by on this laptop, and demanding a valid mobile number would
      // lock out somebody standing in the room for no benefit at all.
      if (cfg.canSend && contactKind(who) === 'unknown') {
        return json(res, 400, { error: 'Enter a phone number or an email address.' });
      }
      const now = Date.now();

      // Checked before the rate gate on purpose. It sends nothing, so it should
      // not eat somebody's allowance — and being told to wait twenty seconds
      // for an answer that was never going to be yes is the worst version of
      // this conversation to have at a door.
      //
      // Showing the code to somebody NEW is harmless: they are creating an
      // identity nobody holds, and a human checks the person at the door.
      // Showing it for a contact that already belongs to a member is account
      // takeover — type their number, read the code off your own screen, and
      // you are them.
      if (!cfg.canSend && db.prepare('SELECT id FROM members WHERE contact=?').get(who)) {
        return json(res, 409, {
          error: 'That contact already belongs to a member, and this venue cannot send codes yet. '
               + 'Ask a member of staff to sign you in at the door.',
          needsStaff: true,
        });
      }

      // A code sender with no limit on it is two things: a way to burn the
      // venue's sending quota, and a way to make somebody's phone buzz all
      // night. Both are somebody else's problem to endure and this venue's
      // reputation to lose.
      const gate = otpRate(who, now);
      if (!gate.ok) return json(res, 429, { error: gate.error, retryInMs: gate.retryInMs });

      const code = String(100000 + Math.floor(Math.random() * 900000));
      db.prepare('INSERT INTO otps(contact,code,expires_at) VALUES(?,?,?) ON CONFLICT(contact) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at')
        .run(who, code, now + 5 * 60000);

      if (!cfg.canSend) {
        // No provider configured, so the code is shown on screen. That is
        // harmless for somebody NEW — they are creating an identity nobody
        // holds yet, and the person is checked by a human at the door anyway.
        //
        // For a contact that already belongs to a member it is account
        // takeover: type a member's number, read the code off your own screen,
        // and you are them. So an existing member always needs a code that was
        // really sent, and when the venue cannot send one they are signed in by
        // a named member of staff who is looking at them.
        return json(res, 200, { sent: false, echoed: true, devCode: code,
          note: 'This venue is not set up to send codes, so it is shown here instead.' });
      }
      const out = await sendCode({ contact: who, code, cfg });
      if (!out.ok) {
        // The code stays valid — a member who retries in ten seconds should not
        // be starting over. What must never happen is falling back to echoing
        // it, which would hand anybody a way to turn delivery off by breaking it.
        const why = out.error === 'no-email-provider' ? 'This venue cannot send email codes yet.'
          : out.error === 'no-sms-provider' ? 'This venue cannot text codes yet — use an email address.'
          : 'The code could not be sent. Try again, or ask a member of staff.';
        return json(res, 502, { error: why, kind: out.kind });
      }
      json(res, 200, { sent: true, via: out.kind, to: maskContact(who) });
    },
    'POST /auth/member/verify': async (req, res) => {
      const { contact, code, name, referral } = await readBody(req);
      const row = db.prepare('SELECT * FROM otps WHERE contact=?').get(contact);
      if (!row || row.code !== String(code) || Date.now() > row.expires_at) return json(res, 401, { error: 'bad code' });
      let m = db.prepare('SELECT * FROM members WHERE contact=?').get(contact);
      if (!m) {
        const id = randomBytes(8).toString('hex');
        // Two attempts, because the free-number check cannot see a number that
        // arrived from another venue device over the mesh — that one only shows
        // up as a constraint error here.
        for (let attempt = 0; ; attempt++) {
          try {
            commit('member.upsert', { id, name: (name || 'Member').trim(), contact,
                                      number: freeMemberNumber(db), created_at: Date.now() });
            break;
          } catch (e) {
            if (attempt >= 2) {
              // The code is still theirs — see below — so the honest thing is to
              // say try again rather than to hand back a database error.
              return json(res, 503, { error: 'Could not finish signing you up just then. Tap the button again.' });
            }
          }
        }
        m = db.prepare('SELECT * FROM members WHERE id=?').get(id);
        // Who brought them, written ONCE, here, and never again. A promoter's
        // work cannot be reassigned after the fact, and somebody who arrived on
        // their own cannot later be claimed by whoever asks first.
        const said = String(referral || '').trim().toUpperCase();
        if (said) {
          const by = db.prepare('SELECT id FROM members WHERE UPPER(referral_code)=?').get(said);
          // Nobody refers themselves, which the id check makes structural
          // rather than a rule somebody has to remember.
          if (by && by.id !== id) {
            db.prepare('UPDATE members SET referred_by=?, referred_at=? WHERE id=?').run(by.id, Date.now(), id);
          }
        }
      }
      // The code is spent here, at the end, and not the moment it matched.
      // Consuming it first meant that anything going wrong between the two
      // left the person with no member record AND no way back in: their code
      // was gone, and the rate limiter made them wait twenty seconds for
      // another one, at the door, in front of everybody. Spending it once
      // there is a membership to spend it on costs nothing — it is the same
      // person, and it still expires on its own.
      db.prepare('DELETE FROM otps WHERE contact=?').run(contact);
      json(res, 200, { token: signSession(secret, { sub: m.id, role: 'member' }, SESSION_TTL), member: publicMember(m) });
    },
    // Staff / Host code login.
    // The venue code. Opens the door and runs the night; see namedActor above
    // for what it deliberately cannot do.
    'POST /auth/staff': async (req, res) => {
      const { code } = await readBody(req);
      const entered = String(code || '').trim().toUpperCase();
      // A staff invite is redeemable from the same box the venue code goes in.
      // Somebody handed a code does not know or care which kind it is, and a
      // second "which sort of code is this?" question is a step that only
      // exists because of how we store them.
      if (db.prepare('SELECT code FROM staff_invites WHERE code=?').get(entered)) {
        return claimInvite(req, res, entered);
      }
      const role = Object.keys(STAFF_CODES).find((r) => STAFF_CODES[r] === entered);
      if (!role) return json(res, 401, { error: 'bad code' });
      json(res, 200, {
        token: signSession(secret, { sub: `${role}-device`, role, named: false }, SESSION_TTL),
        role, named: false, name: 'Shared code',
      });
    },

    // ── The team ─────────────────────────────────────────────────────────────
    //
    // Onboarding, in full: the owner types a name and taps Add. The app shows a
    // QR. The other person scans it. That is the entire flow — no email, no
    // password, no account to recover, nothing for either of them to remember.
    //
    // What the QR carries is a single-use code that expires in fifteen minutes,
    // so the screenshot of it in somebody's camera roll is worthless by the
    // time it could be misused.
    // Signing a member in when the venue cannot send them a code.
    //
    // The other half of refusing to echo a code to an existing member. Without
    // this that refusal just locks people out: somebody who changed phones, or
    // whose venue has no mail provider, would have no way back into their own
    // membership.
    //
    // So a NAMED member of staff, looking at the person, issues them one. It is
    // deliberately not something a shared venue code can do — the whole value
    // of this is that somebody's name is against it — and it is recorded, so
    // "who let that account back in" always has an answer.
    'POST /staff/signin-code': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { number, contact } = await readBody(req);
      const m = number
        ? memberByNumber(String(number || '').trim())
        : db.prepare('SELECT * FROM members WHERE contact=?').get(String(contact || '').trim());
      if (!m) return json(res, 404, { error: 'No member with that number.' });
      const code = String(100000 + Math.floor(Math.random() * 900000));
      const now = Date.now();
      // Short. This is read out to somebody standing in front of you, not sent
      // across a network to be typed later.
      db.prepare(`INSERT INTO otps(contact,code,expires_at) VALUES(?,?,?)
        ON CONFLICT(contact) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at`)
        .run(m.contact, code, now + 3 * 60000);
      record({ eventType: 'ACCESS', memberId: m.id, authorizedBy: c.name || c.sub,
               delivered: 'signed in at the door by staff', reference: `SIGNIN-${now}`, settled: true,
               meta: { by: c.name || c.sub, reason: 'venue cannot send codes' } });
      json(res, 200, {
        ok: true, code, expiresInMs: 3 * 60000,
        member: { name: m.name, number: m.number },
        note: 'Read this to them. It lasts three minutes and it is recorded against your name.',
      });
    },

    'POST /staff/invite': async (req, res) => {
      const c = adminAuth(req, res); if (!c) return;
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 40);
      const role = body.role === 'host' ? 'host' : 'staff';
      if (name.length < 2) return json(res, 400, { error: 'give them a name people would recognise on a shift' });
      const clash = db.prepare('SELECT staff_id FROM staff_accounts WHERE name=? AND disabled_at IS NULL').get(name);
      if (clash) return json(res, 409, { error: `${name} is already on the team — use something that tells them apart on a rota` });
      const now = Date.now();
      const staffId = `ST-${randomBytes(6).toString('hex').toUpperCase()}`;
      // Crockford-ish: no I, O, 0 or 1, because this gets read aloud across a
      // loud room at least as often as it gets scanned.
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(randomBytes(8)).map((b) => A[b % A.length]).join('');
      // The venue's first host account is the owner's own. After that nobody is
      // made admin by being added — the owner stays the owner.
      const isFirstAdmin = role === 'host' && !adminAccount();
      db.prepare(`INSERT INTO staff_accounts(staff_id,name,role,created_at,created_by,admin) VALUES(?,?,?,?,?,?)`)
        .run(staffId, name, role, now, c.name || c.sub, isFirstAdmin ? 1 : 0);
      db.prepare(`INSERT INTO staff_invites(code,staff_id,name,role,created_by,created_at,expires_at)
                  VALUES(?,?,?,?,?,?,?)`)
        .run(code, staffId, name, role, c.name || c.sub, now, now + STAFF_INVITE_TTL);
      json(res, 200, { code, staffId, name, role, admin: isFirstAdmin,
                       expiresAt: now + STAFF_INVITE_TTL, ttlMs: STAFF_INVITE_TTL });
    },

    // Redeeming one. Also reachable through POST /auth/staff above, which is
    // where a person handed a code will actually type it.
    'POST /auth/staff/claim': async (req, res) => {
      const { code } = await readBody(req);
      return claimInvite(req, res, String(code || '').trim().toUpperCase());
    },

    // Who is on the team, and whether their phone has been anywhere near the
    // venue lately. `lastSeen` is the honest answer to "is this account still
    // in use or did they quit in March?".
    // ── What needs a person right now ───────────────────────────────────────
    //
    // The app used to ask "who are you?" — member, door, host — and then hand
    // over a map of every screen, equally available at all times. At 11pm the
    // real question is not who you are. It is what is happening and what is
    // waiting on you, and the answer changes every few minutes.
    //
    // The server already knows all of it: who is at the door, whether a round
    // is running, who has yelled bingo, who has paid and is waiting to be let
    // in, which support case has its approvals. Nobody was ever asking. This
    // asks, in one call, and ranks the answer.
    //
    // Ordering is by who is STANDING THERE WAITING, not by importance in the
    // abstract. A member holding a finished card in front of a room outranks a
    // rent decision that has been fine for two days, and both outrank a quiet
    // door. Every item carries where to go, so the screen never has to guess
    // and the owner never has to know which console owns which job.
    'GET /venue/pulse': (req, res) => {
      const c = houseAuth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const now = Date.now();
      const r = getBingoRound();
      const b = board();
      const items = [];

      // 1. Somebody has called bingo and is waiting in front of a room.
      const claims = db.prepare(`SELECT bc.*, m.name FROM bingo_claims bc
        JOIN members m ON m.id=bc.member_id WHERE bc.status='pending' ORDER BY bc.at ASC`).all();
      if (claims.length) {
        items.push({
          id: 'claims', urgency: 100, count: claims.length,
          headline: claims.length === 1 ? `${claims[0].name} called BINGO` : `${claims.length} bingo claims waiting`,
          detail: 'They are standing there. Check the card and call it.',
          waitingMs: now - claims[0].at,
          action: { label: 'Check the card', screen: 'host', tab: 'claims' },
        });
      }

      // 2. Somebody paid to play and cannot be dealt in until it is confirmed.
      const entry = db.prepare(`SELECT ec.*, m.name FROM bingo_entry_claims ec
        JOIN members m ON m.id=ec.member_id WHERE ec.status='pending' ORDER BY ec.at ASC`).all();
      if (entry.length) {
        items.push({
          id: 'entry', urgency: 90, count: entry.length,
          headline: entry.length === 1 ? `${entry[0].name} paid to play` : `${entry.length} entry payments to confirm`,
          detail: 'They are not in the game until somebody says the money arrived.',
          waitingMs: now - entry[0].at,
          action: { label: 'Confirm it', screen: 'host', tab: 'claims' },
        });
      }

      // 3. A round that is running needs somebody calling it.
      const players = db.prepare('SELECT ready, paid FROM bingo_cards').all();
      if (r.status === 'live') {
        items.push({
          id: 'running', urgency: 60,
          headline: `Round ${r.roundNo || 1} is live`,
          detail: `${players.length} playing · ${(r.calls || []).length} called so far`,
          action: { label: 'Call the next song', screen: 'host', tab: 'run' },
        });
      } else if (players.length >= 2) {
        // 4. Enough people are sitting in the lobby to start.
        items.push({
          id: 'ready', urgency: 70, count: players.length,
          headline: `${players.length} waiting in the lobby`,
          detail: 'Enough to start. Nothing happens until somebody does.',
          action: { label: 'Start the round', screen: 'host', tab: 'run' },
        });
      }

      // 5. Money that is one approval away. Not time-critical the way a member
      //    at the front of a room is, but it is somebody's rent.
      const jubPolicy = jubileePolicy();
      if (jubPolicy.adopted) {
        const waiting = db.prepare(`SELECT ja.application_id, ja.amount_units, m.name FROM jubilee_applications ja
          JOIN members m ON m.id=ja.member_id WHERE ja.status='VERIFIED' ORDER BY ja.at ASC`).all();
        const ready = waiting.filter((a) => db.prepare(
          'SELECT COUNT(*) n FROM jubilee_approvals WHERE award_ref=?').get(a.application_id).n
          >= (jubPolicy.normalApprovals ?? 2));
        if (ready.length) {
          items.push({
            id: 'support-ready', urgency: 50, count: ready.length,
            headline: ready.length === 1 ? `${ready[0].name}\u2019s support is approved` : `${ready.length} support cases approved`,
            detail: 'Approved and not paid. It only helps when the provider has the money.',
            action: { label: 'Pay the provider', screen: 'host', tab: 'support' },
          });
        } else if (waiting.length) {
          items.push({
            id: 'support-waiting', urgency: 40, count: waiting.length,
            headline: `${waiting.length} support ${waiting.length === 1 ? 'case needs' : 'cases need'} approving`,
            detail: `Checked already. Takes ${jubPolicy.normalApprovals ?? 2} different people.`,
            action: { label: 'Look at them', screen: 'host', tab: 'support' },
          });
        }
      }

      // 5b. Members' money waiting on somebody here. A seller who delivered and
      //     has not been paid out, a booking that is not really booked, a
      //     creator whose licence is still PENDING, a promoter owed commission.
      //     One line, because four would push the door off the screen — the
      //     count is what makes it worth walking over for.
      const moneyWaiting =
        db.prepare(`SELECT COUNT(*) n FROM market_orders WHERE status='PLACED'`).get().n
        + db.prepare(`SELECT COUNT(*) n FROM bookings WHERE stage IN ('AGREED','VERIFIED') AND settled_at IS NULL`).get().n
        + db.prepare(`SELECT COUNT(*) n FROM ip_license_grants WHERE status='PENDING'`).get().n
        + db.prepare(`SELECT COUNT(*) n FROM referral_credits WHERE status='EARNED'`).get().n;
      if (moneyWaiting > 0) {
        const oldest = db.prepare(`SELECT MIN(at) a FROM (
          SELECT at FROM market_orders WHERE status='PLACED'
          UNION ALL SELECT at FROM bookings WHERE stage IN ('AGREED','VERIFIED') AND settled_at IS NULL
          UNION ALL SELECT at FROM ip_license_grants WHERE status='PENDING'
          UNION ALL SELECT at FROM referral_credits WHERE status='EARNED')`).get().a;
        items.push({
          id: 'members-money', urgency: 45, count: moneyWaiting,
          headline: moneyWaiting === 1 ? 'A member is waiting to be paid' : `${moneyWaiting} members waiting on money`,
          detail: 'Sales, bookings, licences and commissions. None of it moves until somebody here confirms it.',
          waitingMs: oldest ? now - oldest : 0,
          action: { label: 'Settle them', screen: 'host', tab: 'money' },
        });
      }

      // 5c. A member asked the house to look at something. Nothing in the room
      //     is read by staff until this happens, which is exactly why it must
      //     not sit in a table nobody opens.
      const reports = db.prepare('SELECT report_id, at FROM room_reports WHERE handled_at IS NULL ORDER BY at ASC').all();
      if (reports.length) {
        items.push({
          id: 'room-reports', urgency: 55, count: reports.length,
          headline: reports.length === 1 ? 'A member reported something' : `${reports.length} things members reported`,
          detail: 'They asked a person to look. Nothing else in the room is read by staff.',
          waitingMs: now - reports[0].at,
          action: { label: 'Look at it', screen: 'host', tab: 'reports' },
        });
      }

      // 6. Somebody said they are on their way and has not arrived.
      if (b.onTheWay?.length) {
        items.push({
          id: 'ontheway', urgency: 30, count: b.onTheWay.length,
          headline: `${b.onTheWay.length} on the way`,
          detail: 'Heading over now. They scan when they get here.',
          action: { label: 'Open the door', screen: 'staff', tab: 'verification' },
        });
      }

      // 7. And when nothing is waiting, the door IS the job — which is a real
      //    answer, not an empty state. A screen that says "nothing to do" to
      //    somebody standing at a door is lying to them.
      items.push({
        id: 'door', urgency: 10, count: b.inside?.length || 0,
        headline: b.inside?.length ? `${b.inside.length} inside` : 'Nobody inside yet',
        detail: b.inside?.length ? 'Scan anybody else who turns up.' : 'Scan the first member in when they arrive.',
        action: { label: 'Scan a member in', screen: 'staff', tab: 'verification' },
      });

      items.sort((a, z) => z.urgency - a.urgency);
      json(res, 200, {
        at: now,
        // The single thing to do. Everything else is context for it.
        now: items[0],
        then: items.slice(1),
        round: { status: r.status, round: r.roundNo || 1, players: players.length },
        inside: b.inside?.length || 0,
        you: { name: c.name || 'Shared code', role: c.role, named: !!c.named },
      });
    },

    'GET /staff/roster': (req, res) => {
      const c = adminAuth(req, res); if (!c) return;
      const rows = db.prepare(`SELECT * FROM staff_accounts ORDER BY disabled_at IS NOT NULL, name`).all();
      const pending = new Set(db.prepare(
        `SELECT staff_id FROM staff_invites WHERE used_at IS NULL AND expires_at > ?`).all(Date.now())
        .map((r) => r.staff_id));
      json(res, 200, {
        you: { id: c.sub, name: c.name || 'Shared code', role: c.role, named: !!c.named,
               admin: !!c.named && c.sub === adminAccount()?.staff_id, bootstrap: !!c.bootstrap },
        owner: adminAccount()?.name || null,
        team: rows.map((r) => ({
          staffId: r.staff_id, name: r.name, role: r.role,
          addedBy: r.created_by, addedAt: r.created_at,
          lastSeen: r.last_seen_at || null,
          claimed: !!r.last_seen_at,
          inviteOpen: pending.has(r.staff_id),
          disabled: !!r.disabled_at,
          admin: !!r.admin,
        })),
        namedApprovers: countNamedApprovers(),
      });
    },

    // Removing somebody. Their next tap fails — see auth() above.
    'POST /staff/disable': async (req, res) => {
      const c = adminAuth(req, res); if (!c) return;
      const { staffId } = await readBody(req);
      const row = db.prepare('SELECT * FROM staff_accounts WHERE staff_id=?').get(staffId);
      if (!row) return json(res, 404, { error: 'no such person' });
      if (row.disabled_at) return json(res, 200, { ok: true, alreadyOff: true });
      // Removing the owner's own account leaves a venue with no owner and no way
      // to make one — the shared code only bootstraps when there is no admin at
      // all, and a disabled admin is still an admin row.
      if (row.admin) return json(res, 400, { error: 'You cannot remove your own owner account.' });
      // Taking the last host off the team leaves a venue nobody can add anyone
      // back to. The shared code would still open the door, but it cannot make
      // staff accounts, so the team would be frozen where it stands.
      db.prepare('UPDATE staff_accounts SET disabled_at=?, disabled_by=? WHERE staff_id=?')
        .run(Date.now(), c.name || c.sub, staffId);
      // An unspent invite for somebody who has been removed must not still work.
      db.prepare('DELETE FROM staff_invites WHERE staff_id=? AND used_at IS NULL').run(staffId);
      json(res, 200, { ok: true, name: row.name });
    },

    // ── Ways to earn ─────────────────────────────────────────────────────────
    //
    // Licensing covers creative work. It does not cover a chef, a nail tech or a
    // promoter, so there are three more: SELL to the room, PARTNER with the
    // venue, and be paid for who you BRING.
    'GET /earn': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const mine = c.role === 'member';
      const feePct = marketFeePercent();
      json(res, 200, {
        // §46: what the venue takes is stated before anybody lists anything.
        feePercent: feePct,
        feeSaid: `The venue keeps ${Math.round(feePct * 100)}% of a member-to-member sale. It goes to the community reserve.`,
        referralPercent: referralRatePercent(),
        kinds: Object.entries(LISTING_KINDS).map(([id, v]) => ({ id, ...v })),
        priceModes: Object.entries(PRICE_MODES).map(([id, v]) => ({ id, ...v })),
        delivery: Object.entries(DELIVERY).map(([id, v]) => ({ id, ...v })),
        partnershipKinds: Object.entries(PARTNERSHIP_KINDS).map(([id, v]) => ({ id, ...v })),
        bookingStages: BOOKING_STAGES,
        bookingFailures: Object.entries(BOOKING_FAILURES).map(([id, v]) => ({ id, ...v })),
        referralEvents: Object.entries(REFERRAL_EVENTS).map(([id, v]) => ({ id, ...v })),
        ...(mine ? { code: codeFor(c.sub), grants: (() => {
          const r = db.prepare('SELECT member_role FROM members WHERE id=?').get(c.sub)?.member_role;
          return r ? roleGrants(r) : null;
        })() } : {}),
      });
    },

    // Putting up what you do. Open to any trade that sells — which is every
    // role on the list except somebody who is only here for the night.
    'POST /market/list': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { kind, title, detail, priceCents, priceMode = 'FIXED', delivery = 'AT_VENUE' } = await readBody(req);
      const role = db.prepare('SELECT member_role FROM members WHERE id=?').get(c.sub)?.member_role;
      if (role && !roleGrants(role).sells) {
        return json(res, 403, {
          error: 'The kind of member you signed up as does not sell anything. Change what you do on your card and you can list.',
        });
      }
      if (!LISTING_KINDS[kind]) return json(res, 400, { error: `"${kind}" is not a kind of listing`, kinds: Object.keys(LISTING_KINDS) });
      // Naming the valid options is not politeness — a refusal that does not say
      // what would work leaves whoever is integrating guessing, and the line
      // above has always done it.
      if (!PRICE_MODES[priceMode]) {
        return json(res, 400, { error: `"${priceMode}" is not a way to price something`,
                                priceModes: Object.keys(PRICE_MODES) });
      }
      if (!DELIVERY[delivery]) {
        return json(res, 400, { error: `"${delivery}" is not a way to deliver something`,
                                delivery: Object.keys(DELIVERY) });
      }
      const t = String(title || '').trim().slice(0, 80);
      if (t.length < 3) return json(res, 400, { error: 'Say what you are offering.' });
      const price = Math.floor(Number(priceCents));
      if (!Number.isFinite(price) || price < 0) return json(res, 400, { error: 'Put a price on it. Free is allowed; blank is not.' });
      const listingId = `LST-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO market_listings
        (listing_id, member_id, kind, title, detail, price_units, price_mode, delivery, status, at)
        VALUES (?,?,?,?,?,?,?,?, 'OPEN', ?)`)
        .run(listingId, c.sub, kind, t, String(detail || '').slice(0, 500), price, priceMode, delivery, Date.now());
      const split = marketSplit({ priceCents: price, feePercent: marketFeePercent() });
      json(res, 200, { ok: true, listingId, youKeep: split.sellerCents, venueFee: split.feeCents });
    },

    'POST /market/close': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { listingId } = await readBody(req);
      const l = db.prepare('SELECT * FROM market_listings WHERE listing_id=?').get(listingId);
      if (!l) return json(res, 404, { error: 'no such listing' });
      if (l.member_id !== c.sub) return json(res, 403, { error: 'That is not your listing.' });
      db.prepare(`UPDATE market_listings SET status='CLOSED' WHERE listing_id=?`).run(listingId);
      json(res, 200, { ok: true, note: 'Closed. Orders already placed still stand.' });
    },

    // The shop. Everything members are selling each other.
    'GET /market': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT l.*, m.name AS seller, m.member_role, m.role_other
        FROM market_listings l JOIN members m ON m.id=l.member_id
        WHERE l.status='OPEN' ORDER BY l.at DESC LIMIT 200`).all();
      json(res, 200, {
        feePercent: marketFeePercent(),
        listings: rows.map((r) => ({
          ...listingRow(r),
          seller: r.seller,
          // What they do, so a buyer knows a nail tech from a mechanic.
          trade: r.member_role === 'OTHER' ? r.role_other : (MEMBER_ROLE[r.member_role]?.label || null),
          mine: r.member_id === c.sub,
        })),
      });
    },

    // Buying. The fee is stored on the order, so what was taken is what was
    // disclosed at the time even if the venue's rate changes tomorrow (§46).
    'POST /market/order': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { listingId, note } = await readBody(req);
      // Coerce before this reaches SQLite. An id that arrived as undefined — a
      // stale screen, a listing that failed to create, a double tap — used to
      // come back as a 500, which tells a member their app is broken when what
      // actually happened is that the thing they tapped is no longer there.
      const wanted = (typeof listingId === 'string' || typeof listingId === 'number')
        ? String(listingId).trim() : '';
      if (!wanted) return json(res, 400, { error: 'Nothing was selected to buy.' });
      const l = db.prepare('SELECT * FROM market_listings WHERE listing_id=?').get(wanted);
      if (!l) return json(res, 404, { error: 'That listing is no longer there.' });
      if (l.status !== 'OPEN') return json(res, 409, { error: 'that listing is closed' });
      if (l.member_id === c.sub) return json(res, 400, { error: 'That is your own listing.' });
      const split = marketSplit({ priceCents: l.price_units, feePercent: marketFeePercent() });
      if (!split.ok) return json(res, 400, { error: split.reason });
      const me = db.prepare('SELECT name FROM members WHERE id=?').get(c.sub);
      const orderId = `ORD-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO market_orders
        (order_id, listing_id, seller_id, buyer_id, buyer_name, price_units, fee_units, fee_percent,
         seller_units, note, status, at)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'PLACED', ?)`)
        .run(orderId, listingId, l.member_id, c.sub, me?.name || 'member',
             split.priceCents, split.feeCents, split.feePercent, split.sellerCents,
             String(note || '').slice(0, 300), Date.now());
      json(res, 200, {
        ok: true, orderId, status: 'PLACED — NOT PAID',
        priceCents: split.priceCents, venueFee: split.feeCents, sellerGets: split.sellerCents,
      });
    },

    // ── The house's side of everybody else's money ──────────────────────────
    //
    // Four separate queues in the tables, one screen in the venue. Every one of
    // them is somebody waiting on a person here to say the money arrived — a
    // seller who has not been paid out, a booking that is not really booked
    // until a deposit is in, a creator whose licence is still PENDING, a
    // promoter owed commission. They are gathered in one call because the
    // alternative is four tabs and three of them never getting opened.
    'GET /house/money': (req, res) => {
      const c = houseAuth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const named = !!c.named;
      const feePct = marketFeePercent();
      const orders = db.prepare(`SELECT o.*, s.name AS seller, b.name AS buyer, l.title
        FROM market_orders o JOIN members s ON s.id=o.seller_id JOIN members b ON b.id=o.buyer_id
        JOIN market_listings l ON l.listing_id=o.listing_id
        WHERE o.status='PLACED' ORDER BY o.at ASC LIMIT 60`).all();
      const toSecure = db.prepare(`SELECT bk.*, p.name AS provider, cl.name AS client
        FROM bookings bk JOIN members p ON p.id=bk.provider_id JOIN members cl ON cl.id=bk.client_id
        WHERE bk.stage='AGREED' AND bk.settled_at IS NULL ORDER BY bk.at ASC LIMIT 60`).all();
      const toPayOut = db.prepare(`SELECT bk.*, p.name AS provider, cl.name AS client
        FROM bookings bk JOIN members p ON p.id=bk.provider_id JOIN members cl ON cl.id=bk.client_id
        WHERE bk.stage='VERIFIED' AND bk.settled_at IS NULL ORDER BY bk.at ASC LIMIT 60`).all();
      const grants = db.prepare(`SELECT g.*, cr.name AS creator, pr.title, pr.song
        FROM ip_license_grants g JOIN members cr ON cr.id=g.creator_id
        JOIN performance_rights pr ON pr.asset_id=g.asset_id
        WHERE g.status='PENDING' ORDER BY g.at ASC LIMIT 60`).all();
      const credits = db.prepare(`SELECT k.*, m.name AS referrer
        FROM referral_credits k JOIN members m ON m.id=k.referrer_id
        WHERE k.status='EARNED' ORDER BY k.at ASC LIMIT 60`).all();
      json(res, 200, {
        // A shared venue code can see the queue so the room knows what is
        // outstanding; it cannot move any of it (§55, and moneyAuth).
        canSettle: named,
        feePercent: feePct,
        orders: orders.map((o) => ({
          orderId: o.order_id, title: o.title, seller: o.seller, buyer: o.buyer,
          priceCents: o.price_units, feeCents: o.fee_units,
          toSellerCents: o.price_units - o.fee_units, at: o.at,
        })),
        toSecure: toSecure.map((b) => ({
          bookingId: b.booking_id, title: b.title, provider: b.provider, client: b.client,
          priceCents: b.price_units, depositCents: b.deposit_units, stakeCents: b.stake_units,
          startsAt: b.starts_at || null, at: b.at,
        })),
        toPayOut: toPayOut.map((b) => {
          const out = bookingOutcome({ priceCents: b.price_units, depositCents: b.deposit_units,
                                       stakeCents: b.stake_units, feePercent: b.fee_percent });
          return {
            bookingId: b.booking_id, title: b.title, provider: b.provider, client: b.client,
            priceCents: b.price_units, stakeCents: b.stake_units,
            // What settling actually does, worked out before anybody presses it.
            toProviderCents: out.ok ? out.toProvider : null,
            toVenueCents: out.ok ? out.toVenue : null, at: b.at,
          };
        }),
        licenses: grants.map((g) => ({
          grantId: g.grant_id, work: g.title || g.song || 'Untitled', creator: g.creator,
          buyer: g.buyer_name, type: g.type, typeLabel: LICENSE_TYPES[g.type]?.label,
          priceCents: g.price_units, rail: g.rail, at: g.at,
        })),
        credits: credits.map((k) => ({
          creditId: k.credit_id, referrer: k.referrer, event: k.event,
          eventLabel: REFERRAL_EVENTS[k.event]?.label,
          grossCents: k.gross_units, commissionCents: k.commission_units, at: k.at,
        })),
      });
    },

    // The house confirming the money arrived. The seller never confirms their
    // own sale, for the same reason a member never confirms their own payment.
    'POST /market/settle': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { orderId, received, rail = 'cash' } = await readBody(req);
      const o = db.prepare('SELECT * FROM market_orders WHERE order_id=?').get(orderId);
      if (!o) return json(res, 404, { error: 'no such order' });
      if (o.status !== 'PLACED') return json(res, 409, { error: `that order is already ${o.status}` });
      if (o.seller_id === c.sub) return json(res, 403, { error: 'You cannot confirm your own sale.' });
      const now = Date.now();
      if (!received) {
        db.prepare(`UPDATE market_orders SET status='CANCELLED', paid_by=? WHERE order_id=?`).run(c.name || c.sub, orderId);
        return json(res, 200, { ok: true, status: 'CANCELLED' });
      }
      db.prepare(`UPDATE market_orders SET status='PAID', paid_at=?, paid_by=?, rail=? WHERE order_id=?`)
        .run(now, c.name || c.sub, String(rail), orderId);
      // The venue's cut is a real contribution to the reserve, not a number in
      // a column — §27 names marketplace_platform_fee as a source it accepts.
      let contribution = null;
      if (o.fee_units > 0 && economyFlags().WORLD_RESERVE_LEDGER) {
        const made = makeContribution({
          sourceType: 'marketplace_platform_fee',
          sourceEntity: process.env.HVAS_VENUE_NAME || 'HITMANS VIP AFTER SPOT',
          sourceTransaction: orderId, amount: usd(o.fee_units),
          vault: setting('bingo_world_vault') || 'CORE_RESILIENCE',
          legalCustodian: setting('world_custodian') || 'HITMANS VIP AFTER SPOT CORP',
          beneficialPurpose: 'Platform fee on a member-to-member sale',
        });
        if (made.ok) {
          const k = made.contribution;
          db.prepare(`INSERT OR IGNORE INTO world_contributions
            (contribution_id, source_type, source_entity, source_transaction, amount_units, currency,
             asset_type, restriction_status, authorization_id, vault, legal_custodian,
             beneficial_purpose, refused, reason, timestamp, proof_hash)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(k.contributionId, k.sourceType, k.sourceEntity, k.sourceTransaction, k.amount.units,
                 k.currency, k.assetType, k.restrictionStatus, k.authorizationId || null, k.vault,
                 k.legalCustodian, k.beneficialPurpose, 0, null, k.timestamp, k.proofHash || null);
          db.prepare('UPDATE market_orders SET contribution_id=? WHERE order_id=?').run(k.contributionId, orderId);
          contribution = k.contributionId;
        }
      }
      // No referral is paid here, and that is deliberate.
      //
      // This used to credit whoever brought the BUYER, 10% of every member-to-
      // member sale, forever. Two things wrong with it. It is a cut of somebody
      // else's livelihood — a nail tech's client pays her, and a share leaves
      // for a person who did no part of the work and posted a code once. And it
      // was not funded: the whole venue fee on the sale went to the referrer, so
      // the community reserve got nothing from it, and at the old rate the venue
      // paid out more than it had taken.
      //
      // Bringing somebody here is real work and it is paid for — once, when they
      // join, which is when the work actually happened.
      json(res, 200, { ok: true, status: 'PAID', sellerGets: o.seller_units, venueFee: o.fee_units, contribution });
    },

    // The BUYER says they got it. The seller saying so would be the seller
    // marking their own homework, which is the thing this venue never does.
    'POST /market/received': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { orderId, note } = await readBody(req);
      const o = db.prepare('SELECT * FROM market_orders WHERE order_id=?').get(orderId);
      if (!o) return json(res, 404, { error: 'no such order' });
      if (o.buyer_id !== c.sub) return json(res, 403, { error: 'Only the buyer says whether they got it.' });
      if (o.status !== 'PAID') return json(res, 409, { error: `that order is ${o.status}, not paid for yet` });
      db.prepare(`UPDATE market_orders SET status='DELIVERED', delivered_at=?, delivered_note=? WHERE order_id=?`)
        .run(Date.now(), String(note || '').slice(0, 300), orderId);
      json(res, 200, { ok: true, status: 'DELIVERED' });
    },

    // What a member is selling, what they have sold, and what they have bought.
    'GET /market/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const sold = db.prepare('SELECT * FROM market_orders WHERE seller_id=? ORDER BY at DESC LIMIT 50').all(c.sub);
      json(res, 200, {
        listings: db.prepare(`SELECT * FROM market_listings WHERE member_id=? ORDER BY at DESC`).all(c.sub).map(listingRow),
        sold: sold.map((o) => ({ orderId: o.order_id, buyer: o.buyer_name, priceCents: o.price_units,
          youGet: o.seller_units, venueFee: o.fee_units, status: o.status, at: o.at })),
        bought: db.prepare('SELECT * FROM market_orders WHERE buyer_id=? ORDER BY at DESC LIMIT 50').all(c.sub)
          .map((o) => ({ orderId: o.order_id, priceCents: o.price_units, status: o.status, at: o.at })),
        // Only money that actually settled.
        earnedCents: sold.filter((o) => o.status === 'PAID' || o.status === 'DELIVERED')
          .reduce((a, o) => a + o.seller_units, 0),
      });
    },

    // ── Bookings, and the stake (§18) ────────────────────────────────────────
    //
    // §18's chain, stage for stage, and its closing rule: staking must not be
    // passive-yield speculation. So the stake here is a PERFORMANCE BOND. The
    // real failure in a members' marketplace is not fraud — it is the provider
    // who does not turn up and the client who books three and picks one. Both
    // put something down; whoever fails to show is the one who loses it.
    'POST /gig/request': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { listingId, providerId, title, detail, startsAt, priceCents, depositCents } = await readBody(req);
      const listing = listingId ? db.prepare('SELECT * FROM market_listings WHERE listing_id=?').get(listingId) : null;
      const provider = listing?.member_id || providerId;
      if (!provider) return json(res, 400, { error: 'say who you are booking' });
      if (provider === c.sub) return json(res, 400, { error: 'You cannot book yourself.' });
      if (!db.prepare('SELECT id FROM members WHERE id=?').get(provider)) return json(res, 404, { error: 'no such member' });
      const price = Math.floor(Number(priceCents ?? listing?.price_units));
      if (!Number.isFinite(price) || price <= 0) return json(res, 400, { error: 'a booking needs a price' });
      const deposit = Math.min(price, Math.max(0, Math.floor(Number(depositCents) || Math.floor(price * 0.25))));
      const bookingId = `BKG-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO bookings
        (booking_id, listing_id, provider_id, client_id, title, detail, starts_at,
         price_units, deposit_units, stake_units, stake_layer, fee_percent, stage, at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'REQUESTED', ?)`)
        .run(bookingId, listingId || null, provider, c.sub,
             String(title || listing?.title || 'Booking').slice(0, 80),
             String(detail || '').slice(0, 400), Number(startsAt) || null,
             price, deposit, stakeFor({ priceCents: price }),
             // With no chain live the stake is a recorded hold in the venue's own
             // books, and the response says so rather than implying a token moved.
             economyFlags().HITK_REAL_CHAIN ? 'HITK' : 'USD',
             marketFeePercent(), Date.now());
      db.prepare(`INSERT INTO booking_events(booking_id, stage, by_id, by_name, at) VALUES(?,?,?,?,?)`)
        .run(bookingId, 'REQUESTED', c.sub, 'client', Date.now());
      const b = db.prepare('SELECT * FROM bookings WHERE booking_id=?').get(bookingId);
      json(res, 200, { ok: true, ...bookingRow(b),
        stakeNote: 'The provider posts a stake when they agree. If they do not turn up, it goes to you.' });
    },

    // The provider taking it. This is §18's AGREEMENT, and posting the stake is
    // what makes it more than a reply.
    'POST /gig/agree': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { bookingId } = await readBody(req);
      const b = db.prepare('SELECT * FROM bookings WHERE booking_id=?').get(bookingId);
      if (!b) return json(res, 404, { error: 'no such booking' });
      if (b.provider_id !== c.sub) return json(res, 403, { error: 'Only the provider can take this booking.' });
      const step = bookingCanAdvance(b.stage, 'AGREED');
      if (!step.ok) return json(res, 409, { error: step.reason });
      db.prepare(`UPDATE bookings SET stage='AGREED', agreed_at=? WHERE booking_id=?`).run(Date.now(), bookingId);
      db.prepare(`INSERT INTO booking_events(booking_id, stage, by_id, by_name, at) VALUES(?,?,?,?,?)`)
        .run(bookingId, 'AGREED', c.sub, 'provider', Date.now());
      json(res, 200, { ok: true, stage: 'AGREED', stakeCents: b.stake_units,
        note: `You are staking ${(b.stake_units / 100).toFixed(2)} on turning up. Do the work and it comes straight back.` });
    },

    // Deposit in, stake posted — the house confirms both, because it is the
    // house that actually took the money.
    'POST /gig/secure': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { bookingId } = await readBody(req);
      const b = db.prepare('SELECT * FROM bookings WHERE booking_id=?').get(bookingId);
      if (!b) return json(res, 404, { error: 'no such booking' });
      const step = bookingCanAdvance(b.stage, 'SECURED');
      if (!step.ok) return json(res, 409, { error: step.reason });
      const now = Date.now();
      db.prepare(`UPDATE bookings SET stage='SECURED', secured_at=?, secured_by=? WHERE booking_id=?`)
        .run(now, c.name || c.sub, bookingId);
      db.prepare(`INSERT INTO booking_events(booking_id, stage, by_id, by_name, at) VALUES(?,?,?,?,?)`)
        .run(bookingId, 'SECURED', c.sub, c.name || 'house', now);
      json(res, 200, { ok: true, stage: 'SECURED', depositCents: b.deposit_units, stakeCents: b.stake_units });
    },

    // The provider says the work is done. Saying it is not the same as it being
    // true, which is why the next stage belongs to the client.
    'POST /gig/worked': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { bookingId, note } = await readBody(req);
      const b = db.prepare('SELECT * FROM bookings WHERE booking_id=?').get(bookingId);
      if (!b) return json(res, 404, { error: 'no such booking' });
      if (b.provider_id !== c.sub) return json(res, 403, { error: 'Only the provider says the work is done.' });
      const step = bookingCanAdvance(b.stage, 'WORKED');
      if (!step.ok) return json(res, 409, { error: step.reason });
      db.prepare(`UPDATE bookings SET stage='WORKED', worked_at=? WHERE booking_id=?`).run(Date.now(), bookingId);
      db.prepare(`INSERT INTO booking_events(booking_id, stage, by_id, by_name, at, note) VALUES(?,?,?,?,?,?)`)
        .run(bookingId, 'WORKED', c.sub, 'provider', Date.now(), String(note || '').slice(0, 300));
      json(res, 200, { ok: true, stage: 'WORKED', note: 'Waiting on the client to confirm they got it.' });
    },

    // §18's VERIFICATION. The client, and only the client.
    'POST /gig/verify': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { bookingId, note } = await readBody(req);
      const b = db.prepare('SELECT * FROM bookings WHERE booking_id=?').get(bookingId);
      if (!b) return json(res, 404, { error: 'no such booking' });
      if (b.client_id !== c.sub) return json(res, 403, { error: 'Only the person who booked it says they got it.' });
      const step = bookingCanAdvance(b.stage, 'VERIFIED');
      if (!step.ok) return json(res, 409, { error: step.reason });
      db.prepare(`UPDATE bookings SET stage='VERIFIED', verified_at=? WHERE booking_id=?`).run(Date.now(), bookingId);
      db.prepare(`INSERT INTO booking_events(booking_id, stage, by_id, by_name, at, note) VALUES(?,?,?,?,?,?)`)
        .run(bookingId, 'VERIFIED', c.sub, 'client', Date.now(), String(note || '').slice(0, 300));
      json(res, 200, { ok: true, stage: 'VERIFIED', note: 'Payment and stake release next.' });
    },

    // PAYMENT RELEASE and STAKE RELEASE, together, with the receipt (§18).
    // Also the only place a booking that went wrong is settled, so every ending
    // is decided by the same function rather than four scattered refund rules.
    'POST /gig/settle': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { bookingId, failure = null } = await readBody(req);
      const b = db.prepare('SELECT * FROM bookings WHERE booking_id=?').get(bookingId);
      if (!b) return json(res, 404, { error: 'no such booking' });
      if (b.settled_at) return json(res, 409, { error: 'that booking is already settled' });
      if (failure && !BOOKING_FAILURES[failure]) return json(res, 400, { error: `"${failure}" is not one of the ways a booking fails` });
      // A clean settlement is only available once the client has verified. A
      // failure can be settled from any stage, because that is when they happen.
      if (!failure && b.stage !== 'VERIFIED') {
        return json(res, 409, { error: `nothing is released until the client confirms — this booking is ${BOOKING_STAGE[b.stage]?.label}` });
      }
      const out = bookingOutcome({
        priceCents: b.price_units, depositCents: b.deposit_units,
        stakeCents: b.stake_units, feePercent: b.fee_percent, failure,
      });
      if (!out.ok) return json(res, 400, { error: out.reason });
      const now = Date.now();
      db.prepare(`UPDATE bookings SET stage=?, failure=?, settled_at=?, settled_by=?,
        to_provider_units=?, to_venue_units=?, to_client_units=?,
        stake_returned_units=?, stake_forfeited_units=? WHERE booking_id=?`)
        .run(failure ? b.stage : 'SETTLED', failure, now, c.name || c.sub,
             out.toProvider, out.toVenue, out.toClient, out.stakeReturned, out.stakeForfeited, bookingId);
      db.prepare(`INSERT INTO booking_events(booking_id, stage, by_id, by_name, at, note) VALUES(?,?,?,?,?,?)`)
        .run(bookingId, failure || 'SETTLED', c.sub, c.name || 'house', now, out.note);
      record({ eventType: 'BOOKING', memberId: b.provider_id, amount: usd(out.toProvider),
               rail: 'CASH', authorizedBy: c.name || c.sub,
               delivered: failure ? BOOKING_FAILURES[failure].label : b.title,
               reference: bookingId, settled: true,
               meta: { outcome: out.outcome, stakeForfeited: out.stakeForfeited, toClient: out.toClient } });
      json(res, 200, { ok: true, outcome: out.outcome, ...out, note: out.note });
    },

    'GET /gig/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT * FROM bookings WHERE provider_id=? OR client_id=? ORDER BY at DESC LIMIT 60`)
        .all(c.sub, c.sub);
      json(res, 200, {
        bookings: rows.map((b) => ({
          ...bookingRow(b),
          role: b.provider_id === c.sub ? 'provider' : 'client',
          // Whose move it is. A stage chart nobody can read is a stage chart.
          yourMove: (b.stage === 'REQUESTED' && b.provider_id === c.sub)
                 || (b.stage === 'WORKED' && b.client_id === c.sub)
                 || (b.stage === 'SECURED' && b.provider_id === c.sub),
        })),
      });
    },

    // ── Partnerships: a business running something WITH the venue ────────────
    //
    // A chef, a caterer, a supplier, a residency. The split is agreed by BOTH
    // sides before anything runs — neither can set it alone, which is the whole
    // difference between a partnership and a venue dictating terms.
    'POST /partnership/propose': async (req, res) => {
      const c = auth(req);
      if (!c) return json(res, 401, { error: 'unauthorized' });
      const { memberId, kind, title, terms, housePercent } = await readBody(req);
      const house = c.role === 'staff' || c.role === 'host';
      const member = house ? memberId : c.sub;
      if (!PARTNERSHIP_KINDS[kind]) return json(res, 400, { error: `"${kind}" is not a kind of partnership`, kinds: Object.keys(PARTNERSHIP_KINDS) });
      if (!db.prepare('SELECT id FROM members WHERE id=?').get(member)) return json(res, 404, { error: 'no such member' });
      const t = String(title || '').trim().slice(0, 80);
      if (t.length < 3) return json(res, 400, { error: 'Say what the partnership is.' });
      const split = partnershipSplit({ grossCents: 0, housePercent });
      if (!split.ok) return json(res, 400, { error: split.reason });
      const id = `PTN-${randomBytes(6).toString('hex').toUpperCase()}`;
      const now = Date.now();
      db.prepare(`INSERT INTO partnerships
        (partnership_id, member_id, kind, title, terms, house_percent, status, proposed_by, proposed_at,
         member_agreed_at, house_agreed_at, house_agreed_by)
        VALUES (?,?,?,?,?,?, 'PROPOSED', ?,?,?,?,?)`)
        .run(id, member, kind, t, String(terms || '').slice(0, 800), split.housePercent,
             house ? 'house' : 'member', now,
             house ? null : now, house ? now : null, house ? (c.name || c.sub) : null);
      json(res, 200, { ok: true, partnershipId: id, housePercent: split.housePercent,
        waitingOn: house ? 'the member' : 'the house' });
    },

    // The other side agreeing. Only then does it run.
    'POST /partnership/accept': async (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { partnershipId } = await readBody(req);
      const p = db.prepare('SELECT * FROM partnerships WHERE partnership_id=?').get(partnershipId);
      if (!p) return json(res, 404, { error: 'no such partnership' });
      if (p.status !== 'PROPOSED') return json(res, 409, { error: `that partnership is already ${p.status}` });
      const now = Date.now();
      if (c.role === 'member') {
        if (p.member_id !== c.sub) return json(res, 403, { error: 'That is not your partnership.' });
        db.prepare('UPDATE partnerships SET member_agreed_at=? WHERE partnership_id=?').run(now, partnershipId);
      } else {
        const h = moneyAuth(req, res); if (!h) return;
        db.prepare('UPDATE partnerships SET house_agreed_at=?, house_agreed_by=? WHERE partnership_id=?')
          .run(now, h.name || h.sub, partnershipId);
      }
      const after = db.prepare('SELECT * FROM partnerships WHERE partnership_id=?').get(partnershipId);
      const both = !!after.member_agreed_at && !!after.house_agreed_at;
      if (both) db.prepare(`UPDATE partnerships SET status='ACTIVE' WHERE partnership_id=?`).run(partnershipId);
      json(res, 200, { ok: true, status: both ? 'ACTIVE' : 'PROPOSED',
        waitingOn: both ? null : (after.member_agreed_at ? 'the house' : 'the member') });
    },

    // A night it actually ran, and what each side got. Recorded by the house
    // because the house counted the till, and stored with the split that was
    // agreed rather than whatever the rate is today.
    'POST /partnership/night': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { partnershipId, grossCents, note } = await readBody(req);
      const p = db.prepare('SELECT * FROM partnerships WHERE partnership_id=?').get(partnershipId);
      if (!p) return json(res, 404, { error: 'no such partnership' });
      if (p.status !== 'ACTIVE') return json(res, 409, { error: `that partnership is ${p.status}, not running` });
      const split = partnershipSplit({ grossCents, housePercent: p.house_percent });
      if (!split.ok) return json(res, 400, { error: split.reason });
      db.prepare(`INSERT INTO partnership_events(partnership_id, at, gross_units, house_units, member_units, house_percent, note, recorded_by)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(partnershipId, Date.now(), split.grossCents, split.houseCents, split.memberCents,
             p.house_percent, String(note || '').slice(0, 200), c.name || c.sub);
      json(res, 200, { ok: true, ...split });
    },

    'GET /partnership/mine': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = c.role === 'member'
        ? db.prepare('SELECT * FROM partnerships WHERE member_id=? ORDER BY proposed_at DESC').all(c.sub)
        : db.prepare(`SELECT p.*, m.name FROM partnerships p JOIN members m ON m.id=p.member_id ORDER BY p.proposed_at DESC LIMIT 100`).all();
      json(res, 200, {
        partnerships: rows.map((p) => {
          const nights = db.prepare('SELECT * FROM partnership_events WHERE partnership_id=? ORDER BY at DESC').all(p.partnership_id);
          return {
            partnershipId: p.partnership_id, kind: p.kind, kindLabel: PARTNERSHIP_KINDS[p.kind]?.label,
            title: p.title, terms: p.terms || null, housePercent: p.house_percent,
            status: p.status, member: p.name, proposedBy: p.proposed_by,
            waitingOn: p.status === 'PROPOSED' ? (p.member_agreed_at ? 'the house' : 'the member') : null,
            nights: nights.length,
            earnedCents: nights.reduce((a, n) => a + n.member_units, 0),
            venueCents: nights.reduce((a, n) => a + n.house_units, 0),
          };
        }),
      });
    },

    // ── Bringing people: promoters and influencers ───────────────────────────
    //
    // Everybody has a code. It pays on money that ARRIVED — never on a signup,
    // because otherwise the incentive is to produce accounts rather than people.
    'GET /referral/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const credits = db.prepare('SELECT * FROM referral_credits WHERE referrer_id=? ORDER BY at DESC LIMIT 100').all(c.sub);
      json(res, 200, {
        code: codeFor(c.sub),
        ratePercent: referralRatePercent(),
        brought: db.prepare('SELECT COUNT(*) n FROM members WHERE referred_by=?').get(c.sub).n,
        earnedCents: credits.filter((k) => k.status === 'EARNED').reduce((a, k) => a + k.commission_units, 0),
        paidCents: credits.filter((k) => k.status === 'PAID').reduce((a, k) => a + k.commission_units, 0),
        credits: credits.map((k) => ({
          creditId: k.credit_id, event: k.event, eventLabel: REFERRAL_EVENTS[k.event]?.label,
          grossCents: k.gross_units, commissionCents: k.commission_units,
          status: k.status, at: k.at,
        })),
        // Said plainly, because somebody deserves to know exactly what pays and
        // what does not — including the generous-sounding thing this does NOT
        // do, so nobody is counting on money that is never coming.
        note: 'You earn once, when somebody you brought takes a membership. '
            + 'Not on the signup, and not on anything they earn or spend here afterwards — '
            + 'what a member makes is theirs.',
      });
    },

    // Paying a promoter what they earned. A separate act by the house, with a
    // reference, so it can be reconciled like every other payment here.
    'POST /referral/pay': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { creditIds, reference } = await readBody(req);
      const ids = Array.isArray(creditIds) ? creditIds : [creditIds];
      if (!String(reference || '').trim()) return json(res, 400, { error: 'a payout needs a reference that reconciles' });
      const now = Date.now();
      let paid = 0, total = 0;
      for (const id of ids) {
        const k = db.prepare(`SELECT * FROM referral_credits WHERE credit_id=? AND status='EARNED'`).get(id);
        if (!k) continue;
        if (k.referrer_id === c.sub) continue;   // nobody pays themselves
        db.prepare(`UPDATE referral_credits SET status='PAID', paid_at=?, paid_by=?, paid_reference=? WHERE credit_id=?`)
          .run(now, c.name || c.sub, String(reference).slice(0, 80), id);
        paid += 1; total += k.commission_units;
      }
      json(res, 200, { ok: true, paid, totalCents: total });
    },

    // ── Licensing ────────────────────────────────────────────────────────────
    //
    // The registry proves a creator made a thing. This is what makes that worth
    // something: they put up OFFERS, somebody buys one, and what they hold is a
    // GRANT with the terms written into it and hashed.
    //
    // The creator keeps ownership every time. That is the whole difference
    // between this and the buyout an unsigned artist is usually offered.
    'GET /license/terms': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, {
        types: LICENSE_TYPE_LIST,
        scopes: Object.entries(LICENSE_SCOPES).map(([id, v]) => ({ id, ...v })),
        terms: Object.entries(LICENSE_TERMS).map(([id, v]) => ({ id, ...v })),
        workKinds: WORK_KIND_LIST,
      });
    },

    // What the creator has put up, and what is already out on each work.
    'GET /license/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const works = db.prepare('SELECT * FROM performance_rights WHERE member_id=? ORDER BY registered_at DESC').all(c.sub);
      json(res, 200, {
        works: works.map((w) => ({
          assetId: w.asset_id, title: w.title || w.song || 'Untitled',
          kind: w.work_kind || 'PERFORMANCE', kindLabel: WORK_KINDS[w.work_kind || 'PERFORMANCE']?.label,
          artist: w.artist, song: w.song, contentHash: w.content_hash, registeredAt: w.registered_at,
          offers: db.prepare(`SELECT * FROM ip_license_offers WHERE asset_id=? AND status='OPEN' ORDER BY at DESC`)
            .all(w.asset_id).map(offerRow),
          granted: db.prepare('SELECT * FROM ip_license_grants WHERE asset_id=? ORDER BY at DESC').all(w.asset_id)
            .map(grantRow),
        })),
        // What they have actually been paid for licences that settled.
        earnedCents: db.prepare(
          `SELECT COALESCE(SUM(price_units),0) c FROM ip_license_grants WHERE creator_id=? AND status='GRANTED'`)
          .get(c.sub).c,
      });
    },

    // Putting a licence up for sale. Only the creator of the work may.
    'POST /license/offer': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      if (!economyFlags().HITK_IP_REGISTRY) return json(res, 503, { error: 'ip registry is off' });
      const { assetId, type, scope, term, exclusive = false, priceCents, credit = true, note } = await readBody(req);
      const work = db.prepare('SELECT * FROM performance_rights WHERE asset_id=?').get(assetId);
      if (!work) return json(res, 404, { error: 'no such work' });
      // You cannot license what you did not make. The registry is the only
      // thing that decides that, and it decided it when they registered.
      if (work.member_id !== c.sub) return json(res, 403, { error: 'That is not your work to license.' });
      const t = LICENSE_TYPES[type];
      if (!t) return json(res, 400, { error: `"${type}" is not a licence type`, types: Object.keys(LICENSE_TYPES) });
      if (!LICENSE_SCOPES[scope]) return json(res, 400, { error: `"${scope}" is not a scope` });
      if (!LICENSE_TERMS[term]) return json(res, 400, { error: `"${term}" is not a term` });
      const price = Math.floor(Number(priceCents));
      if (!Number.isFinite(price) || price < 0) return json(res, 400, { error: 'Say what you are charging. Free is allowed; a blank is not.' });
      const wantExclusive = !!exclusive;
      if (wantExclusive && !t.exclusive) {
        return json(res, 400, { error: `A ${t.label} licence cannot be exclusive — it is the kind anybody can hold at once.` });
      }
      // Refuse now rather than at the sale, so a creator does not advertise
      // something they have already sold away.
      const live = db.prepare('SELECT * FROM ip_license_grants WHERE asset_id=?').all(assetId);
      const clash = licenseConflict({ type, exclusive: wantExclusive, existing: live });
      if (!clash.ok) return json(res, 409, { error: clash.reason, blockedBy: clash.blockedBy });
      const offerId = newOfferId();
      db.prepare(`INSERT INTO ip_license_offers
        (offer_id, asset_id, member_id, type, scope, term, exclusive, price_units, credit, note, status, at)
        VALUES (?,?,?,?,?,?,?,?,?,?, 'OPEN', ?)`)
        .run(offerId, assetId, c.sub, type, scope, term, wantExclusive ? 1 : 0, price,
             credit ? 1 : 0, String(note || '').slice(0, 300), Date.now());
      json(res, 200, { ok: true, offerId, terms: licenseTerms({ type, scope, term, exclusive: wantExclusive, credit }) });
    },

    // Taking one down. Only stops FUTURE sales — what is already granted stays
    // granted, because a licence somebody paid for cannot be withdrawn from
    // under them.
    'POST /license/withdraw': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { offerId } = await readBody(req);
      const o = db.prepare('SELECT * FROM ip_license_offers WHERE offer_id=?').get(offerId);
      if (!o) return json(res, 404, { error: 'no such offer' });
      if (o.member_id !== c.sub) return json(res, 403, { error: 'That is not your offer.' });
      db.prepare(`UPDATE ip_license_offers SET status='WITHDRAWN' WHERE offer_id=?`).run(offerId);
      json(res, 200, {
        ok: true,
        note: 'Taken down. Anything already licensed stays licensed — that cannot be withdrawn.',
      });
    },

    // Everything on sale, from every creator. This is the shop.
    'GET /license/market': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT o.*, p.title, p.song, p.artist, p.work_kind, p.content_hash, m.name AS creator
        FROM ip_license_offers o
        JOIN performance_rights p ON p.asset_id=o.asset_id
        JOIN members m ON m.id=o.member_id
        WHERE o.status='OPEN' ORDER BY o.at DESC LIMIT 200`).all();
      json(res, 200, {
        offers: rows.map((r) => ({
          ...offerRow(r),
          creator: r.creator, creatorId: r.member_id === c.sub ? c.sub : undefined,
          mine: r.member_id === c.sub,
          work: {
            assetId: r.asset_id, title: r.title || r.song || 'Untitled',
            artist: r.artist, song: r.song,
            kind: r.work_kind || 'PERFORMANCE',
            kindLabel: WORK_KINDS[r.work_kind || 'PERFORMANCE']?.label,
            contentHash: r.content_hash,
          },
        })),
      });
    },

    // Buying one. Like every other payment here it is a CLAIM until somebody
    // confirms the money arrived — the licence is not granted before that.
    'POST /license/buy': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { offerId, rail = 'cash' } = await readBody(req);
      const o = db.prepare('SELECT * FROM ip_license_offers WHERE offer_id=?').get(offerId);
      if (!o) return json(res, 404, { error: 'no such offer' });
      if (o.status !== 'OPEN') return json(res, 409, { error: 'that licence is no longer offered' });
      if (o.member_id === c.sub) return json(res, 400, { error: 'You already own this. You do not need a licence for it.' });
      if (!['cash', 'zelle', 'card', 'paypal'].includes(String(rail))) return json(res, 400, { error: 'bad rail' });
      const live = db.prepare('SELECT * FROM ip_license_grants WHERE asset_id=?').all(o.asset_id);
      const clash = licenseConflict({ type: o.type, exclusive: !!o.exclusive, existing: live });
      if (!clash.ok) return json(res, 409, { error: clash.reason, blockedBy: clash.blockedBy });
      const me = db.prepare('SELECT name FROM members WHERE id=?').get(c.sub);
      const terms = licenseTerms({ type: o.type, scope: o.scope, term: o.term, exclusive: !!o.exclusive, credit: !!o.credit });
      const grantId = newGrantId();
      const body = JSON.stringify(terms);
      db.prepare(`INSERT INTO ip_license_grants
        (grant_id, offer_id, asset_id, creator_id, buyer_id, buyer_name, type, scope, term, exclusive,
         price_units, terms_json, terms_hash, status, rail, at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'PENDING', ?, ?)`)
        .run(grantId, offerId, o.asset_id, o.member_id, c.sub, me?.name || 'member', o.type, o.scope, o.term,
             o.exclusive, o.price_units, body, createHash('sha256').update(body).digest('hex'),
             String(rail), Date.now());
      json(res, 200, {
        ok: true, grantId, status: 'PENDING — NOT SETTLED',
        priceCents: o.price_units, terms,
      });
    },

    // The house confirming the money reached the creator, which is the moment
    // the licence actually exists.
    'POST /license/settle': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { grantId, received } = await readBody(req);
      const g = db.prepare('SELECT * FROM ip_license_grants WHERE grant_id=?').get(grantId);
      if (!g) return json(res, 404, { error: 'no such licence' });
      if (g.status !== 'PENDING') return json(res, 409, { error: `that licence is already ${g.status}` });
      if (g.buyer_id === c.sub) return json(res, 403, { error: 'You cannot confirm your own purchase.' });
      const now = Date.now();
      if (!received) {
        db.prepare(`UPDATE ip_license_grants SET status='REFUNDED', settled_by=? WHERE grant_id=?`)
          .run(c.name || c.sub, grantId);
        return json(res, 200, { ok: true, status: 'REFUNDED' });
      }
      // Re-check the conflict at the moment of granting. Two buyers can both be
      // pending on the same exclusive licence; only one can end up holding it.
      const live = db.prepare(`SELECT * FROM ip_license_grants WHERE asset_id=? AND status='GRANTED'`).all(g.asset_id);
      const clash = licenseConflict({ type: g.type, exclusive: !!g.exclusive, existing: live });
      if (!clash.ok) return json(res, 409, { error: clash.reason, blockedBy: clash.blockedBy });
      const ms = LICENSE_TERMS[g.term]?.ms ?? null;
      db.prepare(`UPDATE ip_license_grants SET status='GRANTED', paid_at=?, settled_by=?, starts_at=?, expires_at=? WHERE grant_id=?`)
        .run(now, c.name || c.sub, now, ms == null ? null : now + ms, grantId);
      // An exclusive grant closes every offer it now conflicts with, rather than
      // leaving the creator advertising something they can no longer sell.
      if (g.exclusive) {
        const blocked = [g.type, ...(LICENSE_TYPES[g.type]?.conflicts || [])];
        for (const t of blocked) {
          db.prepare(`UPDATE ip_license_offers SET status='WITHDRAWN' WHERE asset_id=? AND type=? AND status='OPEN'`)
            .run(g.asset_id, t);
        }
      }
      record({ eventType: 'IP_LICENSE', memberId: g.creator_id, amount: usd(g.price_units),
               rail: g.rail === 'cash' ? 'CASH' : 'BANK', authorizedBy: c.name || c.sub,
               delivered: `${LICENSE_TYPES[g.type]?.label} licence to ${g.buyer_name}`,
               reference: grantId, settled: true,
               meta: { assetId: g.asset_id, termsHash: g.terms_hash, exclusive: !!g.exclusive } });
      json(res, 200, { ok: true, status: 'GRANTED', expiresAt: ms == null ? null : now + ms });
    },

    // What a buyer holds, and whether it is still running.
    'GET /license/held': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT g.*, p.title, p.song, p.artist, m.name AS creator
        FROM ip_license_grants g
        JOIN performance_rights p ON p.asset_id=g.asset_id
        JOIN members m ON m.id=g.creator_id
        WHERE g.buyer_id=? ORDER BY g.at DESC`).all(c.sub);
      json(res, 200, {
        licenses: rows.map((r) => ({
          ...grantRow(r),
          creator: r.creator,
          work: { assetId: r.asset_id, title: r.title || r.song || 'Untitled', artist: r.artist },
          active: licenseActive(r),
        })),
      });
    },

    // ── Getting in ───────────────────────────────────────────────────────────
    //
    // Signing in is not membership. Before anybody uses this place they agree to
    // the Community Covenant, say what they do, and choose a programme to stand
    // behind. All three are the member's own act; none of them can be done for
    // them by the house.
    // ── THE ROOM ─────────────────────────────────────────────────────────────
    //
    // What members do with each other. Profiles, posts, photographs, reactions,
    // comments, following, and messages — the things Instagram and Snapchat are
    // for, between the people in this association, with no restriction on what
    // they say to one another.
    //
    // The gate is the door, not the content. Nothing in here opens until
    // somebody has agreed to the covenant, said what they do, chosen a
    // programme and taken a membership — which is why every single route below
    // is behind acceptedMember and not merely behind a session.
    //
    // And it is private by construction. There is no public timeline, no share
    // link, no outside reader, and a member's contact and door number never
    // appear anywhere in it. What makes this different from the platforms it
    // borrows from is not the features. It is that the room is closed.

    // Who somebody is here, in their own words.
    'GET /room/me': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      json(res, 200, { profile: profileOf(c.sub), you: true });
    },

    'POST /room/profile': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { handle, bio, avatar, links } = await readBody(req);
      const now = Date.now();
      if (handle != null) {
        // A handle is how one member points another at somebody. Letters,
        // numbers and underscore, because anything else is a handle nobody can
        // read out loud in a dark room.
        const h = String(handle).trim().replace(/^@+/, '').toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(h)) {
          return json(res, 400, { error: 'A handle is 3–20 letters, numbers or underscores.' });
        }
        const taken = db.prepare('SELECT member_id FROM profiles WHERE handle=? AND member_id<>?').get(h, c.sub);
        if (taken) return json(res, 409, { error: `@${h} is taken.` });
      }
      // An avatar is stored as the member sent it and capped, because a photo
      // nobody can load is worse than no photo.
      if (avatar != null && String(avatar).length > 400000) {
        return json(res, 413, { error: 'That picture is too big — try a smaller one.' });
      }
      const cur = db.prepare('SELECT * FROM profiles WHERE member_id=?').get(c.sub);
      db.prepare(`INSERT INTO profiles(member_id, handle, bio, avatar, links, updated_at)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(member_id) DO UPDATE SET
          handle=excluded.handle, bio=excluded.bio, avatar=excluded.avatar,
          links=excluded.links, updated_at=excluded.updated_at`)
        .run(c.sub,
             handle != null ? String(handle).trim().replace(/^@+/, '').toLowerCase() : cur?.handle || null,
             bio != null ? String(bio).slice(0, 300) : cur?.bio || null,
             avatar != null ? String(avatar) : cur?.avatar || null,
             links != null ? JSON.stringify(links).slice(0, 1000) : cur?.links || null,
             now);
      json(res, 200, { ok: true, profile: profileOf(c.sub) });
    },

    // Somebody else, as the room sees them.
    'GET /room/member': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const url = new URL(req.url, 'http://x');
      const who = String(url.searchParams.get('id') || url.searchParams.get('handle') || '').trim();
      if (!who) return json(res, 400, { error: 'who?' });
      const row = who.startsWith('@') || !/^[0-9a-f]{16}$/.test(who)
        ? db.prepare('SELECT member_id FROM profiles WHERE handle=?').get(who.replace(/^@/, '').toLowerCase())
        : { member_id: who };
      if (!row?.member_id) return json(res, 404, { error: 'no such member' });
      if (blocked(row.member_id, c.sub)) return json(res, 404, { error: 'no such member' });
      json(res, 200, {
        profile: profileOf(row.member_id),
        following: !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(c.sub, row.member_id),
        blocked: !!db.prepare('SELECT 1 FROM member_blocks WHERE member_id=? AND blocked_id=?').get(c.sub, row.member_id),
        posts: db.prepare(`SELECT * FROM posts WHERE member_id=? AND hidden_at IS NULL
                           AND (expires_at IS NULL OR expires_at > ?) ORDER BY at DESC LIMIT 30`)
          .all(row.member_id, Date.now()).map((p) => postRow(p, c.sub)),
      });
    },

    // Everybody who is in. This is the directory a private association is FOR:
    // a room full of people you can actually reach, listed by what they do.
    'GET /room/members': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const url = new URL(req.url, 'http://x');
      const trade = String(url.searchParams.get('trade') || '').trim().toUpperCase();
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const rows = db.prepare(`SELECT m.id, m.name, m.member_role FROM members m
        WHERE m.accepted_at IS NOT NULL ORDER BY m.accepted_at DESC LIMIT 500`).all();
      const out = [];
      for (const m of rows) {
        if (m.id === c.sub) continue;
        if (blocked(m.id, c.sub) || blocked(c.sub, m.id)) continue;
        if (trade && m.member_role !== trade) continue;
        const p = profileOf(m.id);
        if (q && !(`${p.name} ${p.handle || ''} ${p.tradeLabel || ''}`.toLowerCase().includes(q))) continue;
        out.push({ ...p, following: !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(c.sub, m.id) });
      }
      json(res, 200, { members: out, trades: rolesByGroup() });
    },

    // The feed. Everybody's, newest first — a room this size does not need an
    // algorithm deciding who a member gets to see, and one would quietly become
    // the venue picking favourites among people who pay the same dues.
    'GET /room/feed': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const url = new URL(req.url, 'http://x');
      const only = String(url.searchParams.get('only') || '').toLowerCase();
      const now = Date.now();
      const rows = db.prepare(`SELECT p.* FROM posts p
        WHERE p.hidden_at IS NULL AND (p.expires_at IS NULL OR p.expires_at > ?)
        ORDER BY p.at DESC LIMIT 200`).all(now);
      const feed = [];
      for (const p of rows) {
        if (blocked(p.member_id, c.sub) || blocked(c.sub, p.member_id)) continue;
        if (only === 'following' && p.member_id !== c.sub
            && !db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(c.sub, p.member_id)) continue;
        if (only === 'moments' && p.kind !== 'MOMENT') continue;
        feed.push(postRow(p, c.sub));
      }
      json(res, 200, { feed, at: now });
    },

    'POST /room/post': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { body, media, kind = 'POST' } = await readBody(req);
      const text = String(body || '').trim().slice(0, 2000);
      if (!text && !media) return json(res, 400, { error: 'Say something, or put a picture up.' });
      if (media && String(media).length > 2500000) {
        return json(res, 413, { error: 'That picture is too big — try a smaller one.' });
      }
      const k = kind === 'MOMENT' ? 'MOMENT' : 'POST';
      const now = Date.now();
      const postId = `PST-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO posts(post_id, member_id, body, media, kind, expires_at, at)
        VALUES (?,?,?,?,?,?,?)`)
        // A MOMENT is gone in a day. Somebody should be able to put something up
        // on a Saturday night without it following them into a Monday.
        .run(postId, c.sub, text || null, media ? String(media) : null, k,
             k === 'MOMENT' ? now + 24 * 3600 * 1000 : null, now);
      const p = db.prepare('SELECT * FROM posts WHERE post_id=?').get(postId);
      json(res, 200, { ok: true, post: postRow(p, c.sub) });
    },

    // Taking your own thing down. Nobody else's — not even the house's, from
    // here; that goes through a report and a named decision.
    'POST /room/post/hide': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { postId } = await readBody(req);
      const p = db.prepare('SELECT * FROM posts WHERE post_id=?').get(String(postId || ''));
      if (!p) return json(res, 404, { error: 'no such post' });
      if (p.member_id !== c.sub) return json(res, 403, { error: 'That is not yours to take down.' });
      db.prepare('UPDATE posts SET hidden_at=? WHERE post_id=?').run(Date.now(), p.post_id);
      json(res, 200, { ok: true });
    },

    'POST /room/react': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { postId, emoji } = await readBody(req);
      const p = db.prepare('SELECT * FROM posts WHERE post_id=?').get(String(postId || ''));
      if (!p) return json(res, 404, { error: 'no such post' });
      if (blocked(p.member_id, c.sub)) return json(res, 403, { error: 'no' });
      const e = String(emoji || '').trim().slice(0, 8);
      if (!e) {
        // Tapping the same one again takes it back, the way it works everywhere.
        db.prepare('DELETE FROM post_reactions WHERE post_id=? AND member_id=?').run(p.post_id, c.sub);
        return json(res, 200, { ok: true, reactions: reactionsOn(p.post_id, c.sub) });
      }
      db.prepare(`INSERT INTO post_reactions(post_id, member_id, emoji, at) VALUES (?,?,?,?)
        ON CONFLICT(post_id, member_id) DO UPDATE SET emoji=excluded.emoji, at=excluded.at`)
        .run(p.post_id, c.sub, e, Date.now());
      json(res, 200, { ok: true, reactions: reactionsOn(p.post_id, c.sub) });
    },

    'POST /room/comment': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { postId, body } = await readBody(req);
      const p = db.prepare('SELECT * FROM posts WHERE post_id=?').get(String(postId || ''));
      if (!p) return json(res, 404, { error: 'no such post' });
      if (blocked(p.member_id, c.sub) || blocked(c.sub, p.member_id)) return json(res, 403, { error: 'no' });
      const text = String(body || '').trim().slice(0, 1000);
      if (!text) return json(res, 400, { error: 'Say something.' });
      const id = `CMT-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare('INSERT INTO post_comments(comment_id, post_id, member_id, body, at) VALUES (?,?,?,?,?)')
        .run(id, p.post_id, c.sub, text, Date.now());
      json(res, 200, { ok: true, comments: commentsOn(p.post_id, c.sub) });
    },

    'GET /room/post': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const url = new URL(req.url, 'http://x');
      const p = db.prepare('SELECT * FROM posts WHERE post_id=?').get(String(url.searchParams.get('id') || ''));
      if (!p || p.hidden_at) return json(res, 404, { error: 'no such post' });
      if (blocked(p.member_id, c.sub)) return json(res, 404, { error: 'no such post' });
      json(res, 200, { post: postRow(p, c.sub), comments: commentsOn(p.post_id, c.sub) });
    },

    // Following needs nobody's permission, the way it works everywhere else.
    'POST /room/follow': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { memberId, on = true } = await readBody(req);
      const who = String(memberId || '');
      if (who === c.sub) return json(res, 400, { error: 'You already know what you are doing.' });
      if (!db.prepare('SELECT id FROM members WHERE id=?').get(who)) return json(res, 404, { error: 'No member by that id.' });
      if (on) {
        if (blocked(who, c.sub)) return json(res, 403, { error: 'no' });
        db.prepare('INSERT OR IGNORE INTO follows(follower_id, followee_id, at) VALUES (?,?,?)')
          .run(c.sub, who, Date.now());
      } else {
        db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(c.sub, who);
      }
      json(res, 200, { ok: true, following: !!on });
    },

    // Being left alone. Theirs alone to set, needing no reason and no approval —
    // a private association somebody cannot be left alone in is not private.
    'POST /room/block': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { memberId, on = true } = await readBody(req);
      const who = String(memberId || '');
      // Without this, a call that names nobody wrote an empty id straight into
      // a foreign key and came back as a 500 — "the app is down", for what is
      // really a tap that lost its argument.
      if (!who || !db.prepare('SELECT 1 FROM members WHERE id=?').get(who)) {
        return json(res, 404, { error: 'No member by that id.' });
      }
      if (who === c.sub) return json(res, 400, { error: 'You cannot block yourself.' });
      if (on) {
        db.prepare('INSERT OR IGNORE INTO member_blocks(member_id, blocked_id, at) VALUES (?,?,?)')
          .run(c.sub, who, Date.now());
        // Blocking somebody undoes the following in both directions, because
        // otherwise their name keeps arriving in a feed you asked to be rid of.
        db.prepare('DELETE FROM follows WHERE (follower_id=? AND followee_id=?) OR (follower_id=? AND followee_id=?)')
          .run(c.sub, who, who, c.sub);
      } else {
        db.prepare('DELETE FROM member_blocks WHERE member_id=? AND blocked_id=?').run(c.sub, who);
      }
      json(res, 200, { ok: true, blocked: !!on });
    },

    // Telling the house about something. A member asking, never the venue
    // watching — nothing in here is read by staff until somebody reports it.
    'POST /room/report': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { kind, reference, reason } = await readBody(req);
      if (!['POST', 'COMMENT', 'MESSAGE', 'MEMBER'].includes(String(kind))) {
        return json(res, 400, { error: 'what kind of thing?' });
      }
      const id = `RPT-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare('INSERT INTO room_reports(report_id, by_id, kind, reference, reason, at) VALUES (?,?,?,?,?,?)')
        .run(id, c.sub, String(kind), String(reference || '').slice(0, 120),
             String(reason || '').slice(0, 500), Date.now());
      json(res, 200, { ok: true, reportId: id,
        note: 'A person will look at this. Nothing in the room is read by staff until somebody reports it.' });
    },

    // ── What the house does hear about ───────────────────────────────────────
    //
    // Nothing in the room is read by staff until a member reports it. That is
    // the deal, and it only holds if the reports actually reach somebody — a
    // member is told "a person will look at this", and until now that sentence
    // was false: reports were written to a table nothing ever read.
    //
    // Named sign-in only. A shared venue code runs a door; it does not read
    // what members said to each other, even when it was reported.
    'GET /room/reports': (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const rows = db.prepare(`SELECT r.*, m.name AS by_name FROM room_reports r
        JOIN members m ON m.id=r.by_id ORDER BY r.handled_at IS NOT NULL, r.at ASC LIMIT 200`).all();
      json(res, 200, {
        reports: rows.map((r) => ({
          reportId: r.report_id, kind: r.kind, reference: r.reference,
          reason: r.reason || null, at: r.at, by: r.by_name,
          handled: !!r.handled_at,
          handledAt: r.handled_at || null, handledBy: r.handled_by || null, outcome: r.outcome || null,
          // The thing complained about, resolved so nobody has to go digging
          // for it — and ONLY the thing complained about. Reporting a post does
          // not hand the house the rest of somebody's feed.
          about: (() => {
            if (r.kind === 'POST') {
              const p = db.prepare('SELECT post_id, member_id, body, at, hidden_at FROM posts WHERE post_id=?').get(r.reference);
              return p ? { by: profileOf(p.member_id)?.name, body: p.body, at: p.at, alreadyDown: !!p.hidden_at } : null;
            }
            if (r.kind === 'COMMENT') {
              const x = db.prepare('SELECT member_id, body, at, hidden_at FROM post_comments WHERE comment_id=?').get(r.reference);
              return x ? { by: profileOf(x.member_id)?.name, body: x.body, at: x.at, alreadyDown: !!x.hidden_at } : null;
            }
            if (r.kind === 'MEMBER') {
              const p = profileOf(r.reference);
              return p ? { by: p.name, trade: p.tradeLabel } : null;
            }
            // A reported MESSAGE is named but NOT quoted. The member reporting
            // it can say what was said; the house does not get to read a
            // private conversation because one line of it was complained about.
            return { note: 'A message was reported. Its text is not shown here — ask the member what was said.' };
          })(),
        })),
        open: rows.filter((r) => !r.handled_at).length,
      });
    },

    // Answering one. Every outcome is a named person's decision with words
    // against it, the same as every other decision in this venue.
    'POST /room/report/handle': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { reportId, outcome } = await readBody(req);
      const r = db.prepare('SELECT * FROM room_reports WHERE report_id=?').get(String(reportId || ''));
      if (!r) return json(res, 404, { error: 'no such report' });
      if (r.handled_at) return json(res, 409, { error: 'that report has already been answered' });
      const said = String(outcome || '').trim().slice(0, 500);
      if (said.length < 4) {
        return json(res, 400, { error: 'Say what was decided. A report closed with nothing said is a report ignored.' });
      }
      db.prepare('UPDATE room_reports SET handled_at=?, handled_by=?, outcome=? WHERE report_id=?')
        .run(Date.now(), c.name || c.sub, said, r.report_id);
      json(res, 200, { ok: true });
    },

    // ── Messages, member to member ───────────────────────────────────────────
    //
    // No restriction on what two members say to each other, and no eye on it.
    // The house does not read this; the only way anything here reaches staff is
    // a member reporting it. That is the deal a private association makes and it
    // is worth being explicit about, because every platform this borrows from
    // makes the opposite one quietly.
    'GET /room/threads': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const rows = db.prepare(`SELECT * FROM messages
        WHERE (from_id=? OR to_id=?) AND to_id IS NOT NULL ORDER BY at DESC LIMIT 800`).all(c.sub, c.sub);
      const byPerson = new Map();
      for (const m of rows) {
        const other = m.from_id === c.sub ? m.to_id : m.from_id;
        if (!other || blocked(c.sub, other) || blocked(other, c.sub)) continue;
        if (!byPerson.has(other)) {
          byPerson.set(other, {
            with: profileOf(other),
            last: { body: m.body, at: m.at, mine: m.from_id === c.sub },
            // How many of theirs have arrived since this member last opened it.
            // This was hardcoded to zero, which made the whole thing a messaging
            // app that never tells you somebody wrote to you.
            unread: unreadFrom(c.sub, other),
          });
        }
      }
      const threads = [...byPerson.values()].filter((t) => t.with);
      json(res, 200, {
        threads,
        // What a badge on the tab is drawn from.
        unread: threads.reduce((a, t) => a + t.unread, 0),
      });
    },

    'GET /room/thread': (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const url = new URL(req.url, 'http://x');
      const other = String(url.searchParams.get('with') || '');
      if (!db.prepare('SELECT id FROM members WHERE id=?').get(other)) return json(res, 404, { error: 'no such member' });
      if (blocked(other, c.sub)) return json(res, 403, { error: 'You cannot message them.' });
      const rows = db.prepare(`SELECT * FROM messages
        WHERE ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) ORDER BY at ASC LIMIT 500`)
        .all(c.sub, other, other, c.sub);
      const unread = unreadFrom(c.sub, other);
      // Opening it is what marks it read. Not receiving it, and not a separate
      // call the client might forget to make.
      db.prepare(`INSERT INTO thread_reads(member_id, other_id, read_at) VALUES (?,?,?)
        ON CONFLICT(member_id, other_id) DO UPDATE SET read_at=excluded.read_at`)
        .run(c.sub, other, Date.now());
      json(res, 200, {
        with: profileOf(other),
        blockedByYou: blocked(c.sub, other),
        // What it was when they opened it, so the screen can show what is new
        // rather than silently swallowing it.
        wasUnread: unread,
        messages: rows.map((m) => ({ id: m.id, body: m.body, at: m.at, mine: m.from_id === c.sub })),
      });
    },

    'POST /room/message': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { to, body } = await readBody(req);
      const other = String(to || '');
      if (other === c.sub) return json(res, 400, { error: 'You are already talking to yourself.' });
      if (!db.prepare('SELECT id FROM members WHERE id=?').get(other)) return json(res, 404, { error: 'no such member' });
      // Blocking runs both ways here: somebody who blocked you does not hear
      // from you, and somebody you blocked does not get to reach you either.
      if (blocked(other, c.sub)) return json(res, 403, { error: 'You cannot message them.' });
      if (blocked(c.sub, other)) return json(res, 403, { error: 'You blocked them. Unblock them to write.' });
      const text = String(body || '').trim().slice(0, 4000);
      if (!text) return json(res, 400, { error: 'Say something.' });
      const id = `MSG-${randomBytes(8).toString('hex')}`;
      const now = Date.now();
      db.prepare('INSERT INTO messages(id, from_id, to_id, venue, body, at) VALUES (?,?,?,?,?,?)')
        .run(id, c.sub, other, null, text, now);
      json(res, 200, { ok: true, message: { id, body: text, at: now, mine: true } });
    },

    // ── What a member can ask of the association about themselves ────────────
    //
    // A private membership association rests on one thing being true: that the
    // member affirmatively agreed to join, and that the agreement can still be
    // produced afterwards. Three things follow from that, and none of them was
    // possible here until now.
    //
    //   You can re-read what YOU signed, at the version you signed it — not
    //   whatever the text happens to say today.
    //
    //   You can see everything the association holds about you, in one place,
    //   and take a copy away.
    //
    //   You can leave.
    //
    // Each of these is the member's own right and none of them needs the
    // house's permission, which is why every one is authorised by the member's
    // own session and nobody else's.
    'GET /me/covenant': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const mine = db.prepare(
        `SELECT version, at FROM member_agreements WHERE member_id=? AND document='COVENANT' ORDER BY at DESC LIMIT 1`)
        .get(c.sub);
      const signedDoc = mine ? covenantAt(mine.version) : null;
      json(res, 200, {
        // What they signed, in the words they signed. If the association has
        // moved on, this does not move with it.
        signed: mine ? {
          version: mine.version, at: mine.at,
          document: signedDoc,
          fingerprint: signedDoc ? covenantFingerprint(signedDoc) : null,
          // A version so old its text is no longer carried is a gap the member
          // is told about rather than one they discover.
          textAvailable: !!signedDoc,
        } : null,
        current: { version: COVENANT_VERSION, document: COVENANT, fingerprint: covenantFingerprint(COVENANT) },
        // The one question a member actually has: is what I agreed to still
        // what is being asked of me?
        outOfDate: !!mine && mine.version !== COVENANT_VERSION,
        versions: covenantVersions(),
      });
    },

    // Everything this association holds about one member, to that member.
    //
    // Not a summary and not a dashboard — the record. Somebody who wants to
    // know what a private association knows about them should not have to ask
    // a person, and should not get an answer that was curated for them.
    'GET /me/record': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const m = db.prepare('SELECT * FROM members WHERE id=?').get(c.sub);
      if (!m) return json(res, 404, { error: 'no such member' });
      const ms = membershipOf(c.sub);
      const agreements = db.prepare(
        `SELECT document, version, at FROM member_agreements WHERE member_id=? ORDER BY at DESC`).all(c.sub);
      const standing = db.prepare(
        `SELECT state, reason, at, by_name FROM member_standing WHERE member_id=? ORDER BY at DESC`).all(c.sub);
      const nights = db.prepare(
        `SELECT night, at FROM entries WHERE member_id=? ORDER BY at DESC LIMIT 200`).all(c.sub);
      const broughtBy = m.referred_by
        ? db.prepare('SELECT name FROM members WHERE id=?').get(m.referred_by)?.name || null
        : null;
      json(res, 200, {
        member: {
          name: m.name, contact: m.contact, number: m.number,
          joined: m.created_at,
          trade: m.member_role || null,
          tradeLabel: m.member_role ? MEMBER_ROLE[m.member_role]?.label : null,
          programme: m.program || null,
          broughtBy,
          referralCode: codeFor(c.sub),
        },
        membership: ms ? {
          tier: ms.tier, vip: !!ms.vip, status: ms.status,
          since: ms.purchased_at, until: ms.expires_at,
        } : null,
        standing: standingOf(c.sub),
        // The agreements are the spine of the whole thing, so they come with
        // their date and their version and are never collapsed into "accepted".
        agreements,
        standingHistory: standing,
        nightsAttended: nights.length,
        nights: nights.map((n) => n.night),
        // What they have done here that involved money. Named individually
        // rather than as one number, because "you have spent $340" is not an
        // answer to "what do you hold about me".
        activity: {
          donations: db.prepare(
            `SELECT program, amount_units, status, at FROM program_donations WHERE member_id=? ORDER BY at DESC`).all(c.sub),
          listings: db.prepare(
            `SELECT listing_id, title, price_units, status, at FROM market_listings WHERE member_id=? ORDER BY at DESC`).all(c.sub),
          bookings: db.prepare(
            `SELECT booking_id, title, stage, price_units, at FROM bookings WHERE provider_id=? OR client_id=? ORDER BY at DESC`)
            .all(c.sub, c.sub),
          works: db.prepare(
            `SELECT asset_id, title, content_hash, registered_at FROM performance_rights WHERE member_id=? ORDER BY registered_at DESC`)
            .all(c.sub),
          licencesHeld: db.prepare(
            `SELECT grant_id, type, price_units, status, at FROM ip_license_grants WHERE buyer_id=? ORDER BY at DESC`).all(c.sub),
          supportCases: db.prepare(
            `SELECT application_id, need_kind, amount_units, status, at FROM jubilee_applications WHERE member_id=? ORDER BY at DESC`)
            .all(c.sub),
        },
        // Said out loud, because an association that holds a person's data owes
        // them the shape of it and not only the contents.
        note: 'This is everything HITMANS VIP holds about you. Your six-digit sign-in codes are not kept after they are used, '
            + 'and your door pass is generated fresh each time rather than stored.',
        producedAt: Date.now(),
      });
    },

    // Leaving. The member's own act, needing nobody's approval.
    //
    // It does NOT delete the record. What happened here happened, the reserve's
    // books have to still add up, and somebody who was admitted on a night was
    // admitted on that night. What it does is end the membership and stop the
    // door — which is what leaving actually means.
    'POST /me/resign': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { reason, confirm } = await readBody(req);
      // Asked for deliberately, because this is not a thing to do by mis-tap on
      // a screen in a dark room.
      if (confirm !== true) {
        return json(res, 400, { error: 'Resigning has to be confirmed.', confirmWith: { confirm: true } });
      }
      const cur = standingOf(c.sub);
      if (cur.state === 'RESIGNED') return json(res, 409, { error: 'You have already resigned.', since: cur.at });
      if (cur.state === 'EXPELLED') return json(res, 409, { error: 'Your membership was ended by the board.' });
      const now = Date.now();
      const m = db.prepare('SELECT name FROM members WHERE id=?').get(c.sub);
      db.prepare(`INSERT INTO member_standing(member_id, state, reason, at, by_id, by_name) VALUES(?,?,?,?,?,?)`)
        .run(c.sub, 'RESIGNED', String(reason || '').slice(0, 400) || null, now, c.sub, m?.name || 'member');
      // The door is the thing that actually changes. Suspending the membership
      // rather than deleting it keeps every past night true.
      db.prepare(`UPDATE memberships SET status='suspended', updated_at=? WHERE member_id=?`).run(now, c.sub);
      json(res, 200, {
        ok: true, state: 'RESIGNED', at: now,
        note: 'You have resigned. Your pass will no longer be admitted. '
            + 'Your record stays as it was — what happened here happened — and you can rejoin at any time.',
      });
    },

    // And coming back. A door that only swings one way makes leaving a threat
    // rather than a choice.
    'POST /me/rejoin': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const cur = standingOf(c.sub);
      if (cur.state === 'EXPELLED') {
        return json(res, 403, { error: 'A membership ended by the board is not rejoined from this screen.' });
      }
      if (cur.state !== 'RESIGNED') return json(res, 409, { error: 'You have not resigned.' });
      const now = Date.now();
      const m = db.prepare('SELECT name FROM members WHERE id=?').get(c.sub);
      db.prepare(`INSERT INTO member_standing(member_id, state, reason, at, by_id, by_name) VALUES(?,?,?,?,?,?)`)
        .run(c.sub, 'REJOINED', null, now, c.sub, m?.name || 'member');
      // A membership that lapsed while they were away is not silently restored
      // — they are back in the association, and they buy a membership again if
      // theirs ran out. Anything else would hand out free time for leaving.
      const ms = membershipOf(c.sub);
      if (ms && ms.expires_at > now) {
        db.prepare(`UPDATE memberships SET status='active', updated_at=? WHERE member_id=?`).run(now, c.sub);
      }
      json(res, 200, { ok: true, state: 'MEMBER', at: now,
        membershipRestored: !!(ms && ms.expires_at > now),
        note: ms && ms.expires_at > now
          ? 'Welcome back. Your membership had time left on it and is active again.'
          : 'Welcome back. Your membership had run out while you were away, so you will need to take one again.' });
    },

    'GET /onboarding': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const m = db.prepare('SELECT member_role, role_other, program FROM members WHERE id=?').get(c.sub);
      const agreed = db.prepare(
        `SELECT version, at FROM member_agreements WHERE member_id=? AND document='COVENANT' ORDER BY at DESC LIMIT 1`)
        .get(c.sub);
      json(res, 200, {
        ...onboardingOf(c.sub),
        covenant: COVENANT,
        agreed: agreed ? { version: agreed.version, at: agreed.at } : null,
        groups: rolesByGroup(),
        role: m?.member_role || null,
        roleOther: m?.role_other || null,
        grants: m?.member_role ? roleGrants(m.member_role) : null,
        programs: programBoard(),
        program: m?.program || null,
        // The last step needs its options on the same call, or the app has to
        // go somewhere else mid-sign-up to find out what it is asking for.
        tiers: Object.entries(TIERS).map(([id, t]) => ({
          id, days: t.days, vip: !!t.vip, price: t.price,
          // What the length actually means to somebody choosing, rather than a
          // number of days they have to convert in their head at the door.
          every: t.days === 1 ? 'a night' : t.days === 7 ? 'a week'
               : t.days === 30 ? 'a month' : t.days === 365 ? 'a year' : `${t.days} days`,
        })),
        membership: (() => {
          const ms = membershipOf(c.sub);
          return ms ? { tier: ms.tier, vip: !!ms.vip, status: ms.status, until: ms.expires_at } : null;
        })(),
      });
    },

    // Agreeing. The VERSION is stored with it, so when the terms change what
    // somebody actually accepted does not change with them — they are asked
    // again, and the old record still says what they signed.
    'POST /me/agree': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { document = 'COVENANT', version, agree } = await readBody(req);
      if (document !== 'COVENANT') return json(res, 400, { error: `there is no document called "${document}"` });
      if (agree !== true) return json(res, 400, { error: 'Agreement has to be a yes. Nothing was recorded.' });
      // Agreeing to a version you were not shown is not agreement.
      if (version !== COVENANT_VERSION) {
        return json(res, 409, {
          error: 'The covenant has changed since this screen loaded. Read it again — it is short.',
          version: COVENANT_VERSION,
        });
      }
      db.prepare(`INSERT INTO member_agreements(member_id, document, version, at, device) VALUES(?,?,?,?,?)`)
        .run(c.sub, 'COVENANT', COVENANT_VERSION, Date.now(), (req.headers['user-agent'] || '').slice(0, 120));
      markAcceptedIfDone(c.sub);
      json(res, 200, { ok: true, version: COVENANT_VERSION, ...onboardingOf(c.sub) });
    },

    // What they do. Sixty-odd trades, and OTHER for the ones the list does not
    // have yet — what somebody types there is kept, because that is how the list
    // grows from the room rather than from a guess.
    'POST /me/role': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { role, other } = await readBody(req);
      const id = String(role || '').trim().toUpperCase();
      if (!MEMBER_ROLE[id]) return json(res, 400, { error: `"${role}" is not on the list`, groups: rolesByGroup() });
      const said = String(other || '').trim().slice(0, 60);
      if (id === 'OTHER' && said.length < 2) {
        return json(res, 400, { error: 'Say what you do — a couple of words is plenty.' });
      }
      db.prepare('UPDATE members SET member_role=?, role_other=?, updated_at=? WHERE id=?')
        .run(id, id === 'OTHER' ? said : null, Date.now(), c.sub);
      markAcceptedIfDone(c.sub);
      json(res, 200, { ok: true, role: id, other: id === 'OTHER' ? said : null,
                       grants: roleGrants(id), ...onboardingOf(c.sub) });
    },

    // ── Programmes ───────────────────────────────────────────────────────────
    //
    // Open to anybody signed in, including a member who has not joined one yet —
    // they cannot choose without seeing the choices.
    'GET /programs': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const mine = c.role === 'member'
        ? db.prepare('SELECT program FROM members WHERE id=?').get(c.sub)?.program || null
        : null;
      json(res, 200, { programs: programBoard(), mine });
    },

    // ── Donating to a cause ─────────────────────────────────────────────────
    //
    // Voluntary, member-chosen, and never taken automatically. The member says
    // what they are giving and how; somebody at the house confirms the money
    // actually arrived. A member confirming their own donation would make the
    // programme's total a number anybody could type.
    'POST /programs/donate': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { program, amountCents, rail, note } = await readBody(req);
      const id = String(program || '').trim().toUpperCase();
      if (!PROGRAMS[id]) return json(res, 400, { error: `"${program}" is not one of the programmes` });
      const cents = Math.floor(Number(amountCents) || 0);
      if (!(cents > 0)) return json(res, 400, { error: 'Say how much you want to give.' });
      const r = ['cash', 'zelle', 'card'].includes(String(rail || '').toLowerCase())
        ? String(rail).toLowerCase() : null;
      if (!r) return json(res, 400, { error: 'Say how you are paying: cash, Zelle or card.' });
      const donationId = `DON-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO program_donations(donation_id, member_id, program, amount_units, rail, note, status, at)
                  VALUES(?,?,?,?,?,?, 'PLEDGED', ?)`)
        .run(donationId, c.sub, id, cents, r, String(note || '').slice(0, 300), Date.now());
      // PLEDGED, not RECEIVED. §41: nothing is settled until somebody says it is.
      json(res, 200, { ok: true, donationId, status: 'PLEDGED', amountCents: cents, program: id });
    },

    // What a member has given, and what is still outstanding.
    'GET /programs/donations': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, {
        donations: db.prepare('SELECT * FROM program_donations WHERE member_id=? ORDER BY at DESC LIMIT 30')
          .all(c.sub).map((d) => ({
            donationId: d.donation_id, program: d.program, label: PROGRAMS[d.program]?.label || d.program,
            amountCents: d.amount_units, rail: d.rail, status: d.status, at: d.at, note: d.note || null,
          })),
      });
    },

    // The house confirming the money turned up — and only then does it become a
    // contribution the programme can count.
    'POST /programs/donation/settle': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { donationId, received } = await readBody(req);
      const row = db.prepare('SELECT * FROM program_donations WHERE donation_id=?').get(donationId);
      if (!row) return json(res, 404, { error: 'no such donation' });
      if (row.status !== 'PLEDGED') return json(res, 409, { error: `that donation is already ${row.status}` });
      if (row.member_id === c.sub) return json(res, 403, { error: 'You cannot confirm your own donation.' });
      if (!received) {
        db.prepare(`UPDATE program_donations SET status='DECLINED', settled_at=?, settled_by=? WHERE donation_id=?`)
          .run(Date.now(), c.name || c.sub, donationId);
        return json(res, 200, { ok: true, status: 'DECLINED' });
      }
      const made = makeContribution({
        sourceType: 'unrestricted_donation',
        sourceEntity: db.prepare('SELECT name FROM members WHERE id=?').get(row.member_id)?.name || 'member',
        sourceTransaction: donationId,
        amount: usd(row.amount_units),
        vault: PROGRAMS[row.program]?.vault || 'CORE_RESILIENCE',
        legalCustodian: setting('world_custodian') || 'HITMANS VIP AFTER SPOT CORP',
        beneficialPurpose: `Member donation to ${PROGRAMS[row.program]?.label || row.program}`,
      });
      if (!made.ok) {
        return json(res, 400, { error: made.refusal?.reason || 'that donation cannot be accepted' });
      }
      const cont = made.contribution;
      db.prepare(`INSERT OR IGNORE INTO world_contributions
        (contribution_id, source_type, source_entity, source_transaction, amount_units, currency,
         asset_type, restriction_status, authorization_id, vault, legal_custodian,
         beneficial_purpose, refused, reason, timestamp, proof_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(cont.contributionId, cont.sourceType, cont.sourceEntity, cont.sourceTransaction,
             cont.amount.units, cont.currency, cont.assetType, cont.restrictionStatus,
             cont.authorizationId || null, cont.vault, cont.legalCustodian,
             cont.beneficialPurpose, 0, null, cont.timestamp, cont.proofHash || null);
      db.prepare(`UPDATE program_donations SET status='RECEIVED', settled_at=?, settled_by=?, contribution_id=? WHERE donation_id=?`)
        .run(Date.now(), c.name || c.sub, cont.contributionId, donationId);
      json(res, 200, { ok: true, status: 'RECEIVED', contributionId: cont.contributionId });
    },

    // ── The board ───────────────────────────────────────────────────────────
    //
    // Every programme has the same five seats. A member applies for one and has
    // to say what they bring — a board application with nothing in it is a name
    // on a list, and the whole point of the seat is that somebody is answerable
    // for the work.
    'GET /board': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const mine = c.role === 'member'
        ? db.prepare(`SELECT * FROM board_applications WHERE member_id=? AND status='SUBMITTED'`).get(c.sub)
        : null;
      const held = c.role === 'member'
        ? db.prepare('SELECT program, position, seated_at FROM board_seats WHERE member_id=?').all(c.sub)
        : [];
      json(res, 200, {
        positions: BOARD_POSITIONS,
        programs: programBoard(),
        openApplication: mine ? {
          applicationId: mine.application_id, program: mine.program, position: mine.position,
          brings: mine.brings, at: mine.at,
        } : null,
        seats: held.map((h) => ({
          program: h.program, programLabel: PROGRAMS[h.program]?.label || h.program,
          position: h.position, positionLabel: BOARD_POSITION[h.position]?.label || h.position,
          since: h.seated_at,
        })),
      });
    },

    'POST /board/apply': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const { program, position, brings } = await readBody(req);
      const pid = String(program || '').trim().toUpperCase();
      const seat = String(position || '').trim().toUpperCase();
      if (!PROGRAMS[pid]) return json(res, 400, { error: `"${program}" is not one of the programmes` });
      if (!BOARD_POSITION[seat]) return json(res, 400, { error: `"${position}" is not a board seat` });
      const said = String(brings || '').trim();
      if (said.length < 20) {
        return json(res, 400, {
          error: 'Say what you bring to the table — a sentence or two. This is what the board is deciding on.',
        });
      }
      const taken = db.prepare('SELECT member_id FROM board_seats WHERE program=? AND position=?').get(pid, seat);
      if (taken?.member_id) {
        const who = db.prepare('SELECT name FROM members WHERE id=?').get(taken.member_id)?.name || 'somebody';
        return json(res, 409, { error: `${who} already holds that seat. Try another one, or another programme.` });
      }
      const open = db.prepare(`SELECT application_id FROM board_applications WHERE member_id=? AND status='SUBMITTED'`).get(c.sub);
      if (open) return json(res, 409, { error: 'You already have an application waiting. One at a time.' });
      const applicationId = `BRD-${randomBytes(6).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO board_applications(application_id, member_id, program, position, brings, status, at)
                  VALUES(?,?,?,?,?, 'SUBMITTED', ?)`)
        .run(applicationId, c.sub, pid, seat, said.slice(0, 1200), Date.now());
      json(res, 200, { ok: true, applicationId, status: 'SUBMITTED' });
    },

    'GET /board/queue': (req, res) => {
      const c = houseAuth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT ba.*, m.name, m.number FROM board_applications ba
        JOIN members m ON m.id=ba.member_id WHERE ba.status='SUBMITTED' ORDER BY ba.at ASC`).all();
      json(res, 200, {
        applications: rows.map((r) => ({
          applicationId: r.application_id, name: r.name, number: r.number,
          program: r.program, programLabel: PROGRAMS[r.program]?.label || r.program,
          position: r.position, positionLabel: BOARD_POSITION[r.position]?.label || r.position,
          brings: r.brings, at: r.at,
        })),
        programs: programBoard(),
      });
    },

    // Approving seats somebody. Declining says why — a member turned down with
    // no reason has nothing to act on and will simply apply again.
    'POST /board/decide': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { applicationId, approve, note } = await readBody(req);
      const row = db.prepare('SELECT * FROM board_applications WHERE application_id=?').get(applicationId);
      if (!row) return json(res, 404, { error: 'no such application' });
      if (row.status !== 'SUBMITTED') return json(res, 409, { error: `that application is already ${row.status}` });
      if (row.member_id === c.sub) return json(res, 403, { error: 'You cannot decide your own application.' });
      const now = Date.now();
      if (!approve) {
        const why = String(note || '').trim();
        if (why.length < 5) return json(res, 400, { error: 'Say why. A refusal with no reason is not one.' });
        db.prepare(`UPDATE board_applications SET status='DECLINED', decided_at=?, decided_by=?, decision_note=? WHERE application_id=?`)
          .run(now, c.name || c.sub, why.slice(0, 600), applicationId);
        return json(res, 200, { ok: true, status: 'DECLINED' });
      }
      const taken = db.prepare('SELECT member_id FROM board_seats WHERE program=? AND position=?')
        .get(row.program, row.position);
      if (taken?.member_id) return json(res, 409, { error: 'Somebody was seated there while this was waiting.' });
      db.prepare(`INSERT INTO board_seats(program, position, member_id, seated_at, seated_by)
                  VALUES(?,?,?,?,?)
                  ON CONFLICT(program, position) DO UPDATE SET member_id=excluded.member_id,
                    seated_at=excluded.seated_at, seated_by=excluded.seated_by`)
        .run(row.program, row.position, row.member_id, now, c.name || c.sub);
      db.prepare(`UPDATE board_applications SET status='APPROVED', decided_at=?, decided_by=?, decision_note=? WHERE application_id=?`)
        .run(now, c.name || c.sub, String(note || '').slice(0, 600), applicationId);
      json(res, 200, { ok: true, status: 'APPROVED', seatedBy: c.name || c.sub });
    },

    // Joining one, or moving to another. A member's own choice — the house does
    // not assign it, and nobody else can change it for them.
    'POST /me/program': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { program } = await readBody(req);
      const id = String(program || '').trim().toUpperCase();
      if (!PROGRAMS[id]) {
        return json(res, 400, {
          error: `"${program}" is not one of the programmes`,
          programs: Object.keys(PROGRAMS),
        });
      }
      const now = Date.now();
      const prev = db.prepare('SELECT program FROM members WHERE id=?').get(c.sub)?.program || null;
      if (prev === id) {
        return json(res, 200, { ok: true, program: id, unchanged: true, label: PROGRAMS[id].label });
      }
      db.prepare('UPDATE members SET program=?, program_at=?, updated_at=? WHERE id=?')
        .run(id, now, now, c.sub);
      db.prepare('INSERT INTO member_program_history(member_id, program, at) VALUES(?,?,?)')
        .run(c.sub, id, now);
      markAcceptedIfDone(c.sub);
      // Contributions already made stay where they landed. Moving programme
      // changes where the NEXT share goes; it does not reach back and move money
      // that has already been recorded as belonging somewhere.
      json(res, 200, { ok: true, program: id, previous: prev, label: PROGRAMS[id].label });
    },

    'GET /me': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const row = db.prepare('SELECT * FROM members WHERE id=?').get(c.sub);
      json(res, 200, {
        member: publicMember(row),
        program: row?.program || null,
        programLabel: row?.program ? PROGRAMS[row.program]?.label || null : null,
      });
    },
    // A member's own full timeline — same event set staff see on the door
    // dashboard, so "everything tracked and timestamped" is true on both
    // ends, not just the staff side.
    'GET /me/timeline': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const m = db.prepare('SELECT * FROM members WHERE id=?').get(c.sub);
      if (!m) return json(res, 404, { error: 'not found' });
      json(res, 200, { events: memberTimeline(m) });
    },
    // A member's career. The round resets every night; this does not, which
    // is the point — it is the thing you come back to grow.
    'GET /me/stats': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, { stats: playerStats(c.sub) });
    },
    // Who is actually good at this. Public on purpose: the TV shows it between
    // rounds, and being on it is most of the reason to try for it.
    'GET /bingo/leaderboard': (req, res) => {
      const c = auth(req);
      const rows = db.prepare(`
        SELECT s.member_id AS memberId, m.name, m.number,
               s.rounds_won AS roundsWon, s.seconds, s.thirds,
               s.battles_won AS battlesWon, s.battles_lost AS battlesLost,
               s.nights, s.streak, s.best_streak AS bestStreak, s.squares, s.performances
        FROM player_stats s JOIN members m ON m.id=s.member_id
        WHERE s.nights > 0
        ORDER BY (s.rounds_won * 5 + s.seconds * 3 + s.thirds * 2 + s.battles_won * 2 + s.nights) DESC,
                 s.rounds_won DESC, s.battles_won DESC, m.name ASC
        LIMIT 20`).all();
      // A member NUMBER is not a stat, and it does not belong on a leaderboard
      // every member can read. It is what the pass QR encodes and what the door
      // accepts when somebody's phone is dead — so publishing it to the room
      // hands anybody the one string they would need to be admitted as somebody
      // else. Names and scores are the point; the number never leaves the house
      // side or the member it belongs to.
      const safe = ({ number, memberId, ...rest }, i) => ({
        ...rest, place: i + 1, score: playerScore({ ...rest, number, memberId }),
        title: playerTitle({ ...rest, number, memberId }),
        isMe: memberId === c?.sub,
        // Their own number is theirs to see; nobody else's is.
        ...(memberId === c?.sub ? { number, memberId } : {}),
      });
      json(res, 200, {
        // `score` is published rather than left to each screen to recompute —
        // one formula, in one place, or the board and the card disagree.
        top: rows.map(safe),
        // Longest current run in the venue — a streak is worth chasing only if
        // somebody can see it.
        streaks: db.prepare(`
          SELECT m.name, s.streak FROM player_stats s JOIN members m ON m.id=s.member_id
          WHERE s.streak > 1 ORDER BY s.streak DESC, m.name ASC LIMIT 5`).all(),
      });
    },
    // HitKoin: a member's own wallet + reward history. No wallet exists
    // until their first mint (their first real, confirmed payment).
    'GET /wallet': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, { enabled: hitkoinEnabled(), ...walletSummary(db, c.sub) });
    },
    'POST /membership/purchase': async (req, res) => {
      // The last step of joining, so it is gated on the first three and not on
      // its own completion — see joiningMember.
      const c = joiningMember(req, res); if (!c) return;
      const { tier, payment } = await readBody(req);
      const t = TIERS[tier]; if (!t) return json(res, 400, { error: 'bad tier' });
      const now = Date.now();
      commit('membership.upsert', {
        member_id: c.sub, tier, vip: t.vip, payment: payment || null,
        purchased_at: now, expires_at: now + t.days * 86400000, status: 'active',
      });
      // Whoever brought them earns on the money, not on the signup.
      const credit = creditReferrer({
        memberId: c.sub, event: 'MEMBERSHIP', reference: `${c.sub}:${tier}:${now}`,
        grossCents: Math.round((t.price || 0) * 100),
      });
      // Dues are the LAST of the four steps, so this is the moment somebody
      // actually becomes a member of this association — and the moment that has
      // to be stamped.
      //
      // It was missing. The stamp was written on the three earlier steps, every
      // one of which runs while the member is still incomplete, so
      // markAcceptedIfDone found them not-yet-accepted, returned false, and was
      // never called again. Since dues became step four, accepted_at has been
      // null for everybody: onboarding said accepted while the column recording
      // WHEN it happened stayed empty.
      markAcceptedIfDone(c.sub);
      json(res, 200, {
        member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(c.sub)),
        referral: credit,
      });
    },

    // ── HVAS Pay: rail-agnostic settlement ledger ──
    // A member pays by ANY rail (paypal/zelle/cash/other) to an account the
    // venue owns, then files a signed claim. PayPal.me is fast; the rest wait on
    // an owner confirm. Claims + confirmations converge across the mesh.
    'POST /pay/claim': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { tier, rail, reference } = await readBody(req);
      const t = TIERS[tier]; if (!t) return json(res, 400, { error: 'bad tier' });
      if (!['paypal', 'zelle', 'cash', 'other'].includes(rail)) return json(res, 400, { error: 'bad rail' });
      const id = `PMT-${randomBytes(4).toString('hex').toUpperCase()}`;
      commit('payment.claim', { id, member_id: c.sub, tier, rail, amount: t.price, reference: (reference || '').slice(0, 120), at: Date.now() });
      json(res, 200, { id, tier, rail, amount: t.price, status: 'pending' });
    },
    'GET /pay/pending': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT p.*, m.name, m.number FROM payments p JOIN members m ON m.id=p.member_id WHERE p.status='pending' ORDER BY p.at ASC`).all();
      json(res, 200, { pending: rows });
    },
    'POST /pay/confirm': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { id } = await readBody(req);
      const p = db.prepare(`SELECT * FROM payments WHERE id=? AND status='pending'`).get(id);
      if (!p) return json(res, 404, { error: 'no pending payment' });
      const t = TIERS[p.tier]; const now = Date.now();
      commit('payment.confirm', { id, by: c.sub, at: now });
      commit('membership.upsert', { member_id: p.member_id, tier: p.tier, vip: t.vip, payment: p.rail, purchased_at: now, expires_at: now + t.days * 86400000, status: 'active' });
      await mintForPayment(db, walletKey, { memberId: p.member_id, usdAmount: t.price, reason: p.rail }).catch(() => {});
      json(res, 200, { ok: true, activated: p.tier });
    },
    'POST /pay/void': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { id } = await readBody(req);
      commit('payment.void', { id, by: c.sub, at: Date.now() });
      json(res, 200, { ok: true });
    },

    // Rolling signed pass — the member's app fetches this every ~30s and renders
    // it as a QR. Valid 45s, so a screenshot is useless.
    'GET /pass/current': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const m = db.prepare('SELECT * FROM members WHERE id=?').get(c.sub);
      const ms = membershipOf(c.sub);
      if (!ms) return json(res, 403, { error: 'no membership' });
      json(res, 200, { pass: issuePass(keys.privateKey, m.number), ttlMs: 45000, refreshMs: 30000 });
    },
    'POST /signal/otw': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { on } = await readBody(req);
      commit('signal.otw', { member_id: c.sub, on: on ? 1 : 0, night: nightKey() });
      json(res, 200, { ok: true });
    },
    // Member marks themselves as having left the venue tonight — shows up as
    // "Left" on the door dashboard instead of staying "Inside" forever.
    'POST /signal/leave': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      commit('entry.checkout', { member_id: c.sub, night: nightKey(), at: Date.now() });
      json(res, 200, { ok: true });
    },

    // ── social: presence in the top-down venue (with their top-down character) ──
    'POST /presence': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { venue, avatar, x, y } = await readBody(req);
      const m = db.prepare('SELECT * FROM members WHERE id=?').get(c.sub);
      const ms = membershipOf(c.sub);
      node.live({ type: 'presence', id: c.sub, name: m?.name, number: m?.number, avatar: avatar || 'creator', venue, x, y, vip: !!ms?.vip });
      json(res, 200, { ok: true, here: liveMembers(venue) });
    },
    'GET /venue/presence': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const venue = new URL(req.url, 'http://x').searchParams.get('venue');
      json(res, 200, { venue, members: liveMembers(venue) });
    },

    // ── one realtime pipe per member: chat, typing, reactions, snaps, RTC ──
    'GET /live/stream': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write('data: {"kind":"hello"}\n\n');
      if (!liveSubs.has(c.sub)) liveSubs.set(c.sub, new Set());
      liveSubs.get(c.sub).add(res);
      req.on('close', () => liveSubs.get(c.sub)?.delete(res));
    },
    'GET /venue/stream': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const v = new URL(req.url, 'http://x').searchParams.get('venue');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`data: ${JSON.stringify({ venue: v, members: liveMembers(v) })}\n\n`);
      const sub = { v, res }; presenceSubs.add(sub);
      req.on('close', () => presenceSubs.delete(sub));
    },

    // ── networking: link up (durable graph over the mesh) ──
    'POST /link': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { to } = await readBody(req);
      if (!to || to === c.sub) return json(res, 400, { error: 'bad target' });
      commit('link.request', { from: c.sub, to, at: Date.now() });
      json(res, 200, { ok: true });
    },
    'POST /link/accept': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { from } = await readBody(req);
      commit('link.accept', { from: c.sub, to: from, at: Date.now() }); // c accepts `from`
      json(res, 200, { ok: true });
    },
    'GET /network': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT * FROM connections WHERE a=? OR b=?').all(c.sub, c.sub);
      const conns = rows.map((r) => ({ peer: r.a === c.sub ? r.b : r.a, status: r.status, requestedBy: r.requested_by, at: r.at }));
      json(res, 200, { connections: conns });
    },

    // ── chat: durable text (history converges via mesh) + instant live push ──
    'POST /chat': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { to, venue, body } = await readBody(req);
      if (!body || (!to && !venue)) return json(res, 400, { error: 'need body + (to or venue)' });
      commit('chat', { from: c.sub, to: to || null, venue: venue || null, body: String(body).slice(0, 2000), at: Date.now() });
      json(res, 200, { ok: true });
    },
    'GET /chat/history': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const peer = new URL(req.url, 'http://x').searchParams.get('peer');
      const rows = db.prepare(`SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY at ASC LIMIT 200`)
        .all(c.sub, peer, peer, c.sub);
      json(res, 200, { messages: rows });
    },

    // ── snaps + live video: ephemeral media / WebRTC signaling over the mesh ──
    // A snap is chunked encrypted media pushed as live events (view-once on the
    // client). RTC signaling (offer/answer/ICE) rides the SAME pipe — so live
    // video/audio is peer-to-peer with NO cloud signaling server.
    'POST /live/send': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { to, kind, data } = await readBody(req);
      if (!to || !kind) return json(res, 400, { error: 'need to + kind' });
      // kind: 'typing' | 'reaction' | 'snap' | 'rtc-offer' | 'rtc-answer' | 'rtc-ice'
      sendLive(to, { kind, from: c.sub, data, at: Date.now() });
      json(res, 200, { ok: true });
    },

    // Door verification — the heart of it. Verify the rolling signature +
    // freshness, then check membership status/expiry, then log one admission
    // per night. Returns the outcome the door UI shows.
    'POST /door/verify': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const body = await readBody(req);
      const { searched } = body;
      // A door gets fed rubbish all night: a scanner firing on a blank frame, a
      // Snapchat QR, a double-tap on an empty search box. Every one of those
      // used to reach SQLite as a non-string and come back a 500 — which reads
      // to the person on the door as "the system is down", not as "this is not
      // a member". Coerce first, refuse cleanly, never crash.
      const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
      const pass = str(body.pass);
      const number = str(body.number);
      let num = number, checked = { ok: !!number };
      if (pass) { checked = verifyPass(keys.publicKey, pass); num = str(checked.number); }
      const decide = (status, member) => {
        commit('decision', { member_id: member?.id || null, number: num || null, status, at: Date.now(), by_staff: c.sub });
        return json(res, 200, { ok: status === 'granted', status, member: member ? publicMember(member) : null, reason: REASONS[status] });
      };
      if (pass && !checked.ok) return decide(checked.reason === 'expired-qr' ? 'expired-qr' : 'trespass', null);
      // Nothing readable came in. This is an answer, not an error — the scanner
      // caught a blank frame or somebody's Snapchat code. It goes back as a 200
      // so the door screen renders it like any other verdict, and NO decision is
      // recorded, because no person was identified to record one about.
      if (!num) return json(res, 200, { ok: false, status: 'unreadable', member: null,
        reason: 'Nothing readable in that scan. Try again, or look them up by number.' });
      const m = memberByNumber(num);
      if (!m) return decide('trespass', null);
      const flag = db.prepare('SELECT * FROM member_flags WHERE member_id=?').get(m.id);
      if (flag) return decide(flag.kind, m);   // manual staff flag always wins, regardless of membership state
      // Somebody who resigned is not a member tonight, and the door should say
      // that rather than the generic "suspended" — a person who left of their
      // own accord has not been penalised and should not be told they were.
      const stand = standingOf(m.id);
      if (stand.state === 'RESIGNED') return decide('resigned', m);
      if (stand.state === 'EXPELLED') return decide('banned', m);
      const ms = membershipOf(m.id);
      if (!ms) return decide('trespass', m);
      if (ms.status === 'suspended') return decide('suspended', m);
      if (Date.now() > ms.expires_at) return decide('expired', m);
      // grant → admission op (idempotent per night; clears OTW in the reducer;
      // re-admits someone who'd left as a real "back inside" event)
      commit('entry.admit', { member_id: m.id, night: nightKey(), at: Date.now(), by_staff: c.sub, searched: !!searched });
      // Proof of presence: a named person, admitted by a named member of staff,
      // at a known time. Nothing else this system records is as hard to fake.
      record({ eventType: 'ACCESS', memberId: m.id, authorizedBy: c.sub,
               delivered: 'admitted to the venue', reference: nightKey(), settled: true,
               meta: { night: nightKey(), searched: !!searched, tier: ms.tier } });
      return decide('granted', m);
    },

    'GET /door/board': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, board());
    },

    // Staff checks a member out — marks them "Left" on the roster instead of
    // staying "Inside" indefinitely. Same op member self-checkout uses.
    'POST /door/checkout': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { number } = await readBody(req);
      const m = memberByNumber(number);
      if (!m) return json(res, 404, { error: 'not found' });
      commit('entry.checkout', { member_id: m.id, night: nightKey(), at: Date.now() });
      json(res, 200, { ok: true, member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(m.id)) });
    },

    // Staff/host lookup by name, member number, or contact — every device
    // hitting this backend searches the one shared members table, so a member
    // who signed up on their own phone shows up at the door on a different one.
    'GET /members/search': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim();
      if (q.length < 2) return json(res, 200, { members: [] });
      const like = `%${q}%`;
      const rows = db.prepare(
        `SELECT * FROM members WHERE name LIKE ? OR number LIKE ? OR contact LIKE ? ORDER BY created_at DESC LIMIT 8`
      ).all(like, like, like);
      json(res, 200, { members: rows.map(publicMember) });
    },
    // Full timeline for one member — signup, membership/payment, every OTW /
    // admit / checkout / re-entry, and any non-grant door decisions — so
    // staff can see everything about a member in one place instead of piecing
    // it together across the roster.
    'GET /members/timeline': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const number = (new URL(req.url, 'http://x').searchParams.get('number') || '').trim();
      const m = memberByNumber(number);
      if (!m) return json(res, 404, { error: 'not found' });
      json(res, 200, { member: publicMember(m), events: memberTimeline(m) });
    },
    // Manual staff action from a member's profile — no scan needed. Covers
    // the buttons the door needs beyond "scan and see what happens": approve
    // entry by hand, deny on the spot, or set/clear a standing flag (trespass
    // / banned / suspended) that auto-denies every future scan until cleared.
    'POST /members/manage': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { number, action, reason } = await readBody(req);
      const m = memberByNumber(number);
      if (!m) return json(res, 404, { error: 'not found' });
      const at = Date.now();
      if (action === 'grant') {
        commit('entry.admit', { member_id: m.id, night: nightKey(), at, by_staff: c.sub });
        commit('decision', { member_id: m.id, number: m.number, status: 'granted', at, by_staff: c.sub });
      } else if (action === 'deny') {
        commit('decision', { member_id: m.id, number: m.number, status: 'denied', at, by_staff: c.sub });
      } else if (action === 'trespass' || action === 'banned' || action === 'suspended') {
        commit('member.flag', { member_id: m.id, kind: action, reason: reason || null, by_staff: c.sub });
        commit('decision', { member_id: m.id, number: m.number, status: action, at, by_staff: c.sub });
      } else if (action === 'unflag') {
        commit('member.flag', { member_id: m.id, kind: null, by_staff: c.sub });
      } else {
        return json(res, 400, { error: 'unknown action' });
      }
      json(res, 200, { ok: true, member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(m.id)) });
    },

    // The venue watchlist — every member currently flagged, on every staff
    // device (backend-shared, unlike a per-device local list).
    'GET /members/flags': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT m.* FROM member_flags f JOIN members m ON m.id = f.member_id ORDER BY f.at DESC`).all();
      json(res, 200, { members: rows.map(publicMember) });
    },

    'GET /door/stream': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`data: ${JSON.stringify(board())}\n\n`);
      sse.add(res);
      req.on('close', () => sse.delete(res));
    },

    // ── Lip Sync Bingo: one shared live round, same on every device ──
    // No auth required to read state — the TV Display screen runs unattended
    // at the venue with no login. When a member token IS present, `me` carries
    // their own card/ready/claim status so PlayerCard can use the same call.
    // What this venue is, for the directory that lets people find it. Public
    // and deliberately thin — a name, whether a round is on, how busy it is.
    // No member data, because anyone on the internet can read this.
    'GET /beacon': (req, res) => {
      const r = getBingoRound();
      const players = db.prepare('SELECT COUNT(*) n FROM bingo_cards').get().n;
      const ev = db.prepare(`SELECT format, status FROM lipsync_events WHERE status!='done' ORDER BY id DESC LIMIT 1`).get();
      json(res, 200, {
        venueId: venueId(),
        name: process.env.HVAS_VENUE_NAME || 'HITMANS VIP After Spot',
        live: r.status === 'live' || r.status === 'podium',
        round: r.status === 'live' ? r.roundNo : null,
        players,
        battle: ev ? { format: ev.format, status: ev.status } : null,
        youtube: mediaReady(),
        at: Date.now(),
      });
    },
    'GET /bingo/state': (req, res) => {
      const r = getBingoRound();
      const players = db.prepare('SELECT member_id, ready, paid FROM bingo_cards').all();
      // The pot, from what was actually collected. Counting rows is the whole
      // point: a prize figure that is not backed by entries in this table is a
      // number on a screen, and the app has told a member that lie once already.
      const paidPlayers = players.filter((p) => p.paid).length;
      const hosted = r.status === 'live' || r.status === 'podium' || r.status === 'ended';
      const pendingClaims = db.prepare(`SELECT COUNT(*) c FROM bingo_claims WHERE status='pending'`).get().c;
      const winner = r.winner_member_id ? publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(r.winner_member_id)) : null;
      let me = null;
      const c = auth(req, 'member');
      if (c) {
        const mine = db.prepare('SELECT * FROM bingo_cards WHERE member_id=?').get(c.sub);
        const myClaim = db.prepare(`SELECT 1 FROM bingo_claims WHERE member_id=? AND status='pending'`).get(c.sub);
        const myEntry = db.prepare(`SELECT id, rail, status FROM bingo_entry_claims WHERE member_id=? ORDER BY at DESC`).get(c.sub);
        const myCard = db.prepare('SELECT paid FROM bingo_cards WHERE member_id=?').get(c.sub);
        me = mine ? {
          card: JSON.parse(mine.card), ready: !!mine.ready, covered: JSON.parse(mine.covered),
          autofill: !!mine.autofill, hasPendingClaim: !!myClaim,
          // Whether this member is actually in the pot, and where their own
          // request stands if they have made one.
          paid: !!myCard?.paid,
          entryClaim: myEntry ? { id: myEntry.id, rail: myEntry.rail, status: myEntry.status } : null,
        } : null;
      }
      json(res, 200, {
        status: r.status, calls: r.calls, startedAt: r.started_at,
        deckId: r.deckId, deckName: deckById(r.deckId).name, pattern: r.pattern,
        roundNo: r.roundNo, finalRound: r.finalRound, customPattern: r.customPattern, roundWins: r.roundWins,
        // The podium sprint: who took it, how long is left, and the live race
        // for second and third. Every screen shows the same board.
        podium: r.podium, podiumEndsAt: r.podiumEndsAt, podiumFirst: r.podiumFirst,
        standings: (r.status === 'podium' || r.status === 'ended') ? bingoStandings().slice(0, 8) : [],
        songMs: BINGO_SONG_MS, lipSyncMs: BINGO_LIPSYNC_MS, youtubeEnabled: mediaReady(),
        // Whether the night is advancing itself, so the host screen can say so.
        autoCall: r.autoCall,
        // window for the square currently on screen (lip sync squares run longer)
        currentWindowMs: r.calls.length ? bingoWindowFor(r.calls[r.calls.length - 1], r.nowPlaying?.clip) : BINGO_SONG_MS,
        playerCount: players.length, readyCount: players.filter((p) => p.ready).length,
        // Money, and only what is true: which kind of night the host set, how
        // many have actually paid, and whether that adds up to a game that pays.
        // The client decides what to PRINT from these — it never invents a pot.
        mode: r.mode, entryFee: BINGO_ENTRY_FEE, paidPlayers, hosted,
        cash: r.mode === 'cash' && bingoIsCashGame({ hosted, paidPlayers }),
        pot: r.mode === 'cash' ? bingoPot({ hosted, paidPlayers, housePercent: bingoSplitPolicy().housePercent }) : 0,
        // Where the money goes, shown before anybody pays rather than
        // reconciled after (§46).
        split: r.mode === 'cash'
          ? { ...bingoSplit({ paidPlayers, ...bingoSplitPolicy() }), ...bingoSplitPolicy() }
          : null,
        // The room's vote on the square being called: who may vote, how many
        // have, and whether that has forced it. Derived the same way on every
        // phone from the same numbers, so nobody sees a different verdict.
        mic: micState(r),
        pendingClaims, winner, me, nowPlaying: r.nowPlaying,
      });
    },
    // Decks + patterns the host can pick from — used to populate Host
    // Control's selectors before starting a round.
    'GET /bingo/decks': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, { decks: deckList(), patterns: BINGO_PATTERN_IDS, defaultDeckId: DEFAULT_DECK_ID });
    },
    'POST /bingo/join': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      const existing = db.prepare('SELECT * FROM bingo_cards WHERE member_id=?').get(c.sub);
      if (existing) return json(res, 200, { card: JSON.parse(existing.card), ready: !!existing.ready, covered: JSON.parse(existing.covered) });
      const r = getBingoRound();
      const card = bingoDealCard(deckById(r.deckId).items);
      commit('bingo.join', { night: nightKey(), member_id: c.sub, card, at: Date.now() });
      json(res, 200, { card, ready: false, covered: [] });
    },
    'POST /bingo/ready': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { ready } = await readBody(req);
      if (!db.prepare('SELECT 1 FROM bingo_cards WHERE member_id=?').get(c.sub)) return json(res, 400, { error: 'join first' });
      commit('bingo.ready', { member_id: c.sub, ready: !!ready });
      json(res, 200, { ok: true });
    },
    // Player taps a square once the host has called it — marking it
    // "covered" is a real action (not automatic), matching real bingo.
    'POST /bingo/mark': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { itemId, covered } = await readBody(req);
      if (!itemId) return json(res, 400, { error: 'itemId required' });
      const row = db.prepare('SELECT card FROM bingo_cards WHERE member_id=?').get(c.sub);
      if (!row) return json(res, 400, { error: 'join first' });
      const square = JSON.parse(row.card).find((it) => it.id === itemId);
      if (!square) return json(res, 400, { error: 'not on your card' });
      // You cover what you HEAR. The player's card deliberately does not show
      // which songs have been called — only the host and the TV know that, and
      // working it out by ear is the game — so the server is the only thing
      // standing between a guess and a covered square. It used to trust the
      // client entirely here, which was fine only while the client refused to
      // let you tap an uncalled square in the first place.
      if (covered && !getBingoRound().calls.some((cl) => cl.id === itemId)) {
        return json(res, 403, { error: 'that song has not played yet' });
      }
      // A LIP SYNC square is earned by performing, never by tapping. Covering
      // one requires having won its battle; declining or losing locks it out.
      if (covered && square.type === 'lipsync') {
        const gate = lipSyncGate(c.sub, itemId);
        if (!gate.ok) return json(res, 403, { error: gate.error, battleId: gate.battleId ?? null });
      }
      commit('bingo.mark', { member_id: c.sub, item_id: itemId, covered: !!covered });
      json(res, 200, { ok: true });
    },
    // ── Lip Sync Battles ──
    // Live view of a battle: who's in, who's up, votes so far. Members see it
    // to perform/vote; the TV and host poll the same shape.
    // Several squares can be mid-battle at once (one per called lip-sync
    // square), so this can be aimed at a specific square; with no itemId it
    // returns the most recent open one, which is what the TV/host want.
    'GET /battle/current': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const itemId = new URL(req.url, 'http://x').searchParams.get('itemId');
      const b = itemId
        ? db.prepare(`SELECT * FROM lipsync_battles WHERE item_id=? ORDER BY id DESC LIMIT 1`).get(itemId)
        : db.prepare(`SELECT * FROM lipsync_battles WHERE status NOT IN ('done','void') ORDER BY id DESC LIMIT 1`).get();
      if (!b) return json(res, 200, { battle: null });
      json(res, 200, { battle: battlePublic(b, c.sub) });
    },
    // Every battle a member is personally in and hasn't answered yet — the
    // "you've been called out" prompt on their card.
    'GET /battle/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT b.* FROM lipsync_battles b
        JOIN lipsync_battle_players p ON p.battle_id=b.id AND p.member_id=?
        WHERE b.status NOT IN ('done','void') ORDER BY b.id ASC`).all(c.sub);
      json(res, 200, { battles: rows.map((b) => battlePublic(b, c.sub)) });
    },
    // Anyone in the room votes on which contenders should battle — including
    // people who do not hold the square. That is the point: the crowd picks
    // the matchup it wants to watch.
    'POST /battle/pick': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { battleId, memberId } = await readBody(req);
      const b = db.prepare('SELECT * FROM lipsync_battles WHERE id=?').get(battleId);
      if (!b) return json(res, 404, { error: 'no such battle' });
      if (b.status !== 'picking') return json(res, 400, { error: 'the roster is already set' });
      const isContender = db.prepare('SELECT 1 FROM lipsync_battle_players WHERE battle_id=? AND member_id=?').get(battleId, memberId);
      if (!isContender) return json(res, 400, { error: 'that member is not up for this square' });
      // A contender voting themselves in would make the pick meaningless.
      if (memberId === c.sub) return json(res, 400, { error: 'you cannot pick yourself' });
      commit('battle.pick', { battle_id: battleId, voter_id: c.sub, member_id: memberId, at: Date.now() });
      json(res, 200, { ok: true, battle: battlePublic(db.prepare('SELECT * FROM lipsync_battles WHERE id=?').get(battleId), c.sub) });
    },
    // The host can close the picking window early — the room is usually ready
    // long before the timer is.
    'POST /battle/lock': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { battleId } = await readBody(req);
      const chosen = lockBattleRoster(battleId);
      if (!chosen) return json(res, 400, { error: 'that battle is not picking' });
      json(res, 200, { ok: true, chosen });
    },
    'POST /battle/respond': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { battleId, accept } = await readBody(req);
      const p = db.prepare('SELECT state FROM lipsync_battle_players WHERE battle_id=? AND member_id=?').get(battleId, c.sub);
      if (!p) return json(res, 404, { error: 'not in this battle' });
      if (p.state !== 'invited') return json(res, 400, { error: 'already responded' });
      commit('battle.respond', { battle_id: battleId, member_id: c.sub, accept: !!accept, at: Date.now() });
      // Nobody willing to perform → the battle dies and the square goes uncovered.
      const left = db.prepare(`SELECT COUNT(*) n FROM lipsync_battle_players WHERE battle_id=? AND state IN ('invited','accepted')`).get(battleId).n;
      if (left === 0) commit('battle.void', { battle_id: battleId, at: Date.now() });
      json(res, 200, { ok: true });
    },
    // Host runs the floor: who performs now, where it shows, when voting opens.
    'POST /battle/stage': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { battleId, stage } = await readBody(req);
      commit('battle.stage', { battle_id: battleId, stage });
      json(res, 200, { ok: true, stage: stage === 'tv' ? 'tv' : 'phones' });
    },
    'POST /battle/perform': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { battleId, memberId, seconds } = await readBody(req);
      const p = db.prepare('SELECT state FROM lipsync_battle_players WHERE battle_id=? AND member_id=?').get(battleId, memberId);
      if (!p) return json(res, 404, { error: 'not in this battle' });
      if (p.state !== 'accepted') return json(res, 400, { error: 'that member has not accepted' });
      // The performance window is the clip's own length: verse into hook, so
      // the music and the timer run out together. `seconds` stays available
      // for tests and for a bout with no video behind it.
      const clip = getBingoRound().nowPlaying?.clip;
      const auto = clip?.seconds || BINGO_LIPSYNC_MS / 1000;
      const ms = Math.max(5, Number(seconds) || auto) * 1000;
      commit('battle.perform', { battle_id: battleId, member_id: memberId, ends_at: Date.now() + ms });
      json(res, 200, { ok: true, endsAt: Date.now() + ms, seconds: Math.round(ms / 1000), fromClip: !seconds && !!clip?.seconds });
    },
    // The performer's own device reports the take is finished.
    // Host controls the timer, never its length: hold it, let it go again.
    'POST /battle/timer': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { battleId, action } = await readBody(req);
      if (!['pause', 'resume'].includes(action)) return json(res, 400, { error: 'action must be pause or resume' });
      const b = db.prepare('SELECT status, performance_ends_at, paused_ms FROM lipsync_battles WHERE id=?').get(battleId);
      if (!b) return json(res, 404, { error: 'no such battle' });
      if (b.status !== 'performing') return json(res, 400, { error: 'nobody is performing' });
      if (action === 'pause' && !b.performance_ends_at) return json(res, 400, { error: 'the clock is already held' });
      if (action === 'resume' && b.paused_ms == null) return json(res, 400, { error: 'the clock is not held' });
      commit('battle.timer', { battle_id: battleId, action, at: Date.now() });
      const after = db.prepare('SELECT performance_ends_at, paused_ms FROM lipsync_battles WHERE id=?').get(battleId);
      json(res, 200, { ok: true, paused: after.paused_ms != null, endsAt: after.performance_ends_at, leftMs: after.paused_ms });
    },
    'POST /battle/performed': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { battleId } = await readBody(req);
      commit('battle.performed', { battle_id: battleId, member_id: c.sub, at: Date.now() });
      json(res, 200, { ok: true });
    },
    'POST /battle/voting': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { battleId, seconds } = await readBody(req);
      const performed = db.prepare(`SELECT COUNT(*) n FROM lipsync_battle_players WHERE battle_id=? AND state='performed'`).get(battleId).n;
      if (performed === 0) return json(res, 400, { error: 'nobody has performed yet' });
      const ms = Math.max(5, Number(seconds) || 30) * 1000;
      commit('battle.voting', { battle_id: battleId, ends_at: Date.now() + ms });
      json(res, 200, { ok: true, endsAt: Date.now() + ms });
    },
    // Any member in the room votes — one vote each, changeable while open.
    // ── Sign in with Google (host's own YouTube account) ──
    // Step 1: hand the host the consent URL. `redirect` is this backend's own
    // callback, which must be registered in the Google Cloud OAuth client.
    'GET /auth/google/start': (req, res) => {
      // This one is entered by NAVIGATING the browser to it, not by fetch, so
      // it cannot carry an Authorization header — the session rides in the
      // query string instead. Same session check either way.
      const qs = new URL(req.url, 'http://x').searchParams;
      const c = auth(req) || (qs.get('token') ? readSession(secret, qs.get('token')) : null);
      if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      if (!GOOGLE_CLIENT_ID) return json(res, 503, { error: 'Google sign-in is not configured for this venue yet (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' });
      const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${origin}/auth/google/callback`,
        response_type: 'code',
        scope: GOOGLE_SCOPE,
        // offline + consent is what actually yields a refresh token, so the
        // host stays signed in across restarts instead of re-authing nightly
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      });
      json(res, 200, { url, redirectUri: `${origin}/auth/google/callback` });
    },
    // Step 2: Google sends the host back here with a code. Exchange it for a
    // refresh token and store it. Renders a plain page — this opens in a
    // browser tab, not the app.
    'GET /auth/google/callback': async (req, res) => {
      const q = new URL(req.url, 'http://x').searchParams;
      const code = q.get('code');
      const page = (title, msg) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
          <body style="background:#140a20;color:#f4ecff;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
          <div><h2 style="color:#ffd66b">${title}</h2><p>${msg}</p><p style="opacity:.7">You can close this tab.</p></div>`);
      };
      if (q.get('error')) return page('Sign-in cancelled', 'Nothing was changed.');
      if (!code) return page('Sign-in failed', 'No authorisation code came back from Google.');
      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return page('Not configured', 'This venue has no Google client configured.');
      try {
        const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: `${origin}/auth/google/callback`, grant_type: 'authorization_code',
          }),
        });
        const d = await r.json();
        if (!d.refresh_token) return page('Sign-in incomplete', 'Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and try once more.');
        putSetting('google_refresh_token', d.refresh_token);
        putSetting('google_connected_at', String(Date.now()));
        page('YouTube connected', 'This venue now runs song lookups on your own Google account.');
      } catch {
        page('Sign-in failed', 'Could not reach Google to complete sign-in.');
      }
    },
    'GET /auth/google/status': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, {
        configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
        connected: !!setting('google_refresh_token'),
        connectedAt: Number(setting('google_connected_at')) || null,
      });
    },
    'POST /auth/google/disconnect': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      putSetting('google_refresh_token', '');
      putSetting('google_connected_at', '');
      json(res, 200, { ok: true, connected: false });
    },

    // The host points the venue at THEIR OWN YouTube account. Playback ads are
    // the reason: a host signed into their own (Premium) account on the TV
    // browser gets their own playback, and search runs on their quota. Send an
    // empty key to fall back to whatever the venue was configured with.
    'POST /bingo/youtube-key': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { key } = await readBody(req);
      const clean = String(key || '').trim();
      if (clean) {
        db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES('youtube_api_key',?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(clean, Date.now());
      } else {
        db.prepare(`DELETE FROM settings WHERE key='youtube_api_key'`).run();
      }
      putSetting('media_last_error', '');   // a new key gets a clean slate
      // Never echo the key back — it's a credential.
      json(res, 200, { ok: true, usingHostKey: !!clean, youtubeEnabled: mediaReady() });
    },
    'GET /bingo/youtube-key': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const row = db.prepare(`SELECT value, updated_at FROM settings WHERE key='youtube_api_key'`).get();
      json(res, 200, {
        usingHostKey: !!row,
        youtubeEnabled: mediaReady(),
        // The last reason a called song did not play, if there was one.
        lastError: setting('media_last_error') || null,
        // enough to confirm which key is live without exposing it
        hint: row ? `••••${String(row.value).slice(-4)}` : null,
        updatedAt: row?.updated_at || null,
      });
    },

    // ── Live performance stream ──
    // The performer's phone pushes downscaled JPEG frames; every other screen
    // (phones + TV) pulls the latest. Deliberately NOT WebRTC: a mesh needs
    // signalling, TURN and NAT traversal per viewer and falls apart past a
    // handful of phones, whereas this is one small POST and one small GET, it
    // works over the venue's Cloudflare tunnel unchanged, and a dropped frame
    // costs nothing. Frames live in memory only — they're ephemeral by nature
    // and have no business in SQLite or the mesh op-log.
    'POST /battle/frame': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { battleId, frame } = await readBody(req);
      const b = db.prepare('SELECT performing_member_id, status FROM lipsync_battles WHERE id=?').get(battleId);
      if (!b) return json(res, 404, { error: 'no such battle' });
      // Only whoever is actually up can broadcast — nobody else can hijack the screen.
      if (b.performing_member_id !== c.sub) return json(res, 403, { error: 'you are not performing' });
      if (typeof frame !== 'string' || frame.length > 400000) return json(res, 400, { error: 'bad frame' });
      battleFrames.set(String(battleId), { frame, at: Date.now(), by: c.sub });
      // Tell the performer's phone how many screens are actually watching, so
      // it can stop paying to cast into an empty room. Over a venue LAN that
      // was free; over the internet every frame is somebody's mobile data and
      // the venue's own upload.
      json(res, 200, { ok: true, watchers: watcherCount(battleId) });
    },
    'GET /battle/frame': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const id = new URL(req.url, 'http://x').searchParams.get('battleId');
      noteWatcher(id, c.sub || c.role || 'screen');
      const f = battleFrames.get(String(id));
      // Treat a stale frame as "no stream" so a frozen image never masquerades
      // as a live performance after the performer's phone drops off.
      if (!f || Date.now() - f.at > 4000) return json(res, 200, { frame: null, live: false });
      json(res, 200, { frame: f.frame, at: f.at, live: true });
    },

    // Live chat + emoji during a battle. Open to any member in the room —
    // the crowd reacting IS the show.
    'POST /battle/say': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { battleId, body, kind } = await readBody(req);
      if (!body || !String(body).trim()) return json(res, 400, { error: 'empty' });
      const b = db.prepare('SELECT status FROM lipsync_battles WHERE id=?').get(battleId);
      if (!b) return json(res, 404, { error: 'no such battle' });
      if (b.status === 'done' || b.status === 'void') return json(res, 400, { error: 'battle is over' });
      commit('battle.say', { battle_id: battleId, member_id: c.sub, kind, body: String(body).trim(), at: Date.now() });
      json(res, 200, { ok: true });
    },
    'POST /battle/vote': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { battleId, memberId } = await readBody(req);
      const b = db.prepare('SELECT status FROM lipsync_battles WHERE id=?').get(battleId);
      if (!b) return json(res, 404, { error: 'no such battle' });
      if (b.status !== 'voting') return json(res, 400, { error: 'voting is not open' });
      const target = db.prepare(`SELECT state FROM lipsync_battle_players WHERE battle_id=? AND member_id=?`).get(battleId, memberId);
      if (!target || target.state !== 'performed') return json(res, 400, { error: 'can only vote for someone who performed' });
      // Performers don't vote for themselves — that's the whole "fair" part.
      if (memberId === c.sub) return json(res, 400, { error: 'you cannot vote for yourself' });
      commit('battle.vote', { battle_id: battleId, voter_id: c.sub, member_id: memberId, at: Date.now() });
      json(res, 200, { ok: true });
    },
    // Close it out: most votes wins, host breaks a tie by passing winnerId.
    'POST /battle/resolve': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { battleId, winnerId } = await readBody(req);
      const b = db.prepare('SELECT * FROM lipsync_battles WHERE id=?').get(battleId);
      if (!b) return json(res, 404, { error: 'no such battle' });
      if (b.status === 'done' || b.status === 'void') return json(res, 400, { error: 'already resolved' });
      const tally = battleTally(battleId);
      let winner = winnerId || null;
      if (!winner) {
        const top = tally[0];
        const tied = top && tally.filter((t) => t.votes === top.votes).length > 1;
        if (!top || top.votes === 0) return json(res, 400, { error: 'no votes yet — pass winnerId to decide it' });
        if (tied) return json(res, 409, { error: 'tie — pass winnerId to break it', tally });
        winner = top.memberId;
      }
      const ok = db.prepare(`SELECT state FROM lipsync_battle_players WHERE battle_id=? AND member_id=?`).get(battleId, winner);
      if (!ok || ok.state !== 'performed') return json(res, 400, { error: 'winner must have performed' });
      commit('battle.resolve', { battle_id: battleId, winner_id: winner, at: Date.now() });
      battleFrames.delete(String(battleId));
      json(res, 200, { ok: true, winnerId: winner, tally });
    },

    // ── Standalone Lip Sync Battle events ──
    // The whole event in one shape: roster, standings, bracket so far, and the
    // live bout (already in /battle/current form, so the TV reuses that view).
    'GET /lipsync/state': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent()
        || db.prepare(`SELECT * FROM lipsync_events ORDER BY id DESC LIMIT 1`).get();
      json(res, 200, { event: ev ? eventPublic(ev, c.sub) : null });
    },
    // Host opens a lobby. One event at a time — two live brackets on one TV is
    // not a feature, it is a support call.
    'POST /lipsync/create': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { format, title, size } = await readBody(req);
      if (!['bracket', 'king', 'open'].includes(format)) return json(res, 400, { error: 'format must be bracket, king or open' });
      const running = activeEvent();
      if (running) return json(res, 409, { error: 'an event is already running — end it first', eventId: running.id });
      const id = Date.now();
      const validSize = [4, 8, 16].includes(Number(size)) ? Number(size) : (format === 'bracket' ? 8 : null);
      commit('event.create', { id, format, title: title || null, size: validSize, at: Date.now() });
      json(res, 201, { ok: true, event: eventPublic(db.prepare('SELECT * FROM lipsync_events WHERE id=?').get(id), c.sub) });
    },
    'POST /lipsync/join': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent();
      if (!ev) return json(res, 404, { error: 'no event open' });
      if (ev.status !== 'lobby') return json(res, 400, { error: 'this event has already started' });
      const n = db.prepare('SELECT COUNT(*) n FROM lipsync_event_players WHERE event_id=?').get(ev.id).n;
      if (ev.size && n >= ev.size) return json(res, 400, { error: `this bracket is full (${ev.size})` });
      commit('event.join', { event_id: ev.id, member_id: c.sub, at: Date.now() });
      json(res, 200, { ok: true, event: eventPublic(activeEvent(), c.sub) });
    },
    'POST /lipsync/leave': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent();
      if (!ev) return json(res, 404, { error: 'no event open' });
      if (ev.status !== 'lobby') return json(res, 400, { error: 'too late to leave — you are in the running' });
      commit('event.leave', { event_id: ev.id, member_id: c.sub });
      json(res, 200, { ok: true, event: eventPublic(activeEvent(), c.sub) });
    },
    // Seed and open the first bout. Bracket seeds on career battle wins so the
    // two strongest performers do not meet in round one.
    'POST /lipsync/start': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent();
      if (!ev) return json(res, 404, { error: 'no event open' });
      if (ev.status !== 'lobby') return json(res, 400, { error: 'already started' });
      const roster = db.prepare(`SELECT p.member_id AS memberId,
          COALESCE(ps.battles_won,0) AS won, m.name
        FROM lipsync_event_players p JOIN members m ON m.id=p.member_id
        LEFT JOIN player_stats ps ON ps.member_id=p.member_id
        WHERE p.event_id=? ORDER BY won DESC, m.name ASC`).all(ev.id);
      if (roster.length < 2) return json(res, 400, { error: 'need at least 2 in the lobby' });
      const seeds = roster.map((r, i) => ({ member_id: r.memberId, seed: i + 1 }));
      commit('event.start', { id: ev.id, seeds, at: Date.now() });
      const fresh = activeEvent();
      const bout = openNextBout(fresh);
      json(res, 200, { ok: true, seeded: seeds.length, boutId: bout.boutId || null, note: bout.note || null,
        event: eventPublic(activeEvent(), c.sub) });
    },
    // Open the next bout. Host-paced on purpose: one battle on the TV at a time.
    'POST /lipsync/next': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent();
      if (!ev) return json(res, 404, { error: 'no event open' });
      if (ev.status !== 'live') return json(res, 400, { error: 'event is not live' });
      const open = db.prepare(`SELECT id FROM lipsync_battles WHERE event_id=? AND status NOT IN ('done','void')`).get(ev.id);
      if (open) return json(res, 409, { error: 'finish the bout on the floor first', boutId: open.id });
      const { artist, song, a, b } = await readBody(req);
      const out = openNextBout(ev, { a, b, artist, song });
      if (out.error) return json(res, 400, { error: out.error });
      json(res, 200, { ok: true, boutId: out.boutId || null, note: out.note || null,
        event: eventPublic(activeEvent(), c.sub) });
    },
    // Open floor and king of the hill: a member calls somebody out themselves.
    // The host still opens the bout, but this is how the queue gets its names.
    'POST /lipsync/challenge': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent();
      if (!ev) return json(res, 404, { error: 'no event open' });
      if (ev.format === 'bracket') return json(res, 400, { error: 'a bracket decides its own matchups' });
      if (ev.status !== 'live') return json(res, 400, { error: 'event is not live' });
      const { memberId } = await readBody(req);
      if (memberId === c.sub) return json(res, 400, { error: 'you cannot challenge yourself' });
      const inEvent = (m) => db.prepare('SELECT 1 FROM lipsync_event_players WHERE event_id=? AND member_id=?').get(ev.id, m);
      if (!inEvent(c.sub)) return json(res, 400, { error: 'join the event first' });
      if (!inEvent(memberId)) return json(res, 400, { error: 'they are not in this event' });
      // King of the hill has exactly one target: whoever holds the floor.
      if (ev.format === 'king' && ev.king_member_id && memberId !== ev.king_member_id) {
        return json(res, 400, { error: 'in king of the hill you challenge the king' });
      }
      const open = db.prepare(`SELECT id FROM lipsync_battles WHERE event_id=? AND status NOT IN ('done','void')`).get(ev.id);
      if (open) return json(res, 409, { error: 'a bout is already on the floor', boutId: open.id });
      const id = openBout(ev, [c.sub, memberId]);
      json(res, 200, { ok: true, boutId: id, event: eventPublic(activeEvent(), c.sub) });
    },
    'POST /lipsync/end': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const ev = activeEvent();
      if (!ev) return json(res, 404, { error: 'no event open' });
      // Whoever is top of the standings takes it when a host stops early.
      const top = eventRoster(ev.id).filter((r) => r.state === 'in')[0];
      commit('event.end', { event_id: ev.id, champion_id: ev.champion_member_id || top?.memberId || null, at: Date.now() });
      json(res, 200, { ok: true, event: eventPublic(db.prepare('SELECT * FROM lipsync_events WHERE id=?').get(ev.id), c.sub) });
    },

    // Manual by default: the host calls each song. Flipping this on lets the
    // play timer advance the night by itself — same songs, nobody tapping.
    'POST /bingo/auto': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { on } = await readBody(req);
      commit('bingo.auto', { on: !!on });
      json(res, 200, { ok: true, autoCall: !!on, songSeconds: Math.round(BINGO_SONG_MS / 1000) });
    },
    // A player's own choice, per card: tap what you hear (default), or have
    // the called squares covered for you. Lip sync squares are never filled
    // in — those are still earned by performing.
    'POST /bingo/autofill': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { on } = await readBody(req);
      const mine = db.prepare('SELECT member_id FROM bingo_cards WHERE member_id=?').get(c.sub);
      if (!mine) return json(res, 400, { error: 'join first' });
      commit('bingo.autofill', { member_id: c.sub, on: !!on, at: Date.now() });
      // Turning it on mid-round catches up on everything already played, or it
      // would look broken until the next song lands.
      if (on) {
        const row = db.prepare('SELECT card, covered FROM bingo_cards WHERE member_id=?').get(c.sub);
        const held = new Set(JSON.parse(row.card).filter((sq) => sq && sq.type !== 'lipsync' && !sq.free).map((sq) => sq.id));
        const already = new Set(JSON.parse(row.covered));
        for (const call of getBingoRound().calls) {
          if (held.has(call.id) && !already.has(call.id)) {
            commit('bingo.mark', { member_id: c.sub, item_id: call.id, covered: true, at: Date.now() });
          }
        }
      }
      json(res, 200, { ok: true, autofill: !!on });
    },
    // ── Money ──────────────────────────────────────────────────────────────
    // The host says which kind of night it is. Free is the default and this is
    // the ONLY way it becomes a cash game — a round must never start charging
    // because enough people happened to turn up.
    'POST /bingo/mode': async (req, res) => {
      // Staff or host, the same pair every other control on the night takes —
      // the door and the person running it are both "the house".
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { mode } = await readBody(req);
      if (mode !== 'cash' && mode !== 'free') return json(res, 400, { error: 'mode must be cash or free' });
      commit('bingo.mode', { mode, at: Date.now() });
      json(res, 200, { ok: true, mode, entryFee: BINGO_ENTRY_FEE });
    },
    // Adopting the split. This is the venue deciding, in public, what it keeps
    // and what it sends to the commons — and it only ever comes out of the
    // house's own share, never out of the players' pot (§46).
    'POST /bingo/split': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { housePercent, worldPercent } = await readBody(req);
      const h = Number(housePercent), w = Number(worldPercent);
      if (!Number.isFinite(h) || h < 0 || h > 1) return json(res, 400, { error: 'housePercent must be 0..1' });
      if (!Number.isFinite(w) || w < 0 || w > 1) return json(res, 400, { error: 'worldPercent must be 0..1' });
      if (w > h) {
        // Refused rather than silently clamped: a host who typed this meant
        // something, and quietly changing it would hide a decision they think
        // they made.
        return json(res, 400, { error: 'the reserve share cannot exceed the house share — the reserve comes out of what the house keeps, never out of the players\' pot (§46)' });
      }
      putSetting('bingo_house_percent', h > 0 ? String(h) : '');
      putSetting('bingo_world_percent', w > 0 ? String(w) : '');
      putSetting('bingo_split_adopted_by', h > 0 || w > 0 ? c.sub : '');
      putSetting('bingo_split_adopted_at', h > 0 || w > 0 ? String(Date.now()) : '');
      const players = db.prepare('SELECT paid FROM bingo_cards').all().filter((p) => p.paid).length;
      json(res, 200, { ok: true, split: { ...bingoSplit({ paidPlayers: players, housePercent: h, worldPercent: w }), housePercent: h, worldPercent: w } });
    },
    // The door takes an entry. Staff-only, because this is money changing hands
    // in a room — a member cannot mark themselves paid any more than they can
    // wave themselves through the door.
    'POST /bingo/entry': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { member_id: memberId, how, paid = true } = await readBody(req);
      if (!memberId) return json(res, 400, { error: 'member_id required' });
      const card = db.prepare('SELECT member_id FROM bingo_cards WHERE member_id=?').get(memberId);
      if (!card) return json(res, 400, { error: 'that member has not joined the round' });
      // Taking one back has to be possible, or a miskey at the desk is
      // permanent and the pot is wrong for the rest of the night.
      commit(paid ? 'bingo.entry' : 'bingo.entry.void', { member_id: memberId, how: how || 'cash', at: Date.now() });
      const players = db.prepare('SELECT paid FROM bingo_cards').all();
      const paidPlayers = players.filter((p) => p.paid).length;
      const hosted = getBingoRound().status !== 'lobby';
      json(res, 200, {
        ok: true, paid: !!paid, paidPlayers,
        pot: bingoPot({ hosted, paidPlayers }),
        cash: bingoIsCashGame({ hosted, paidPlayers }),
      });
    },
    // ── Paying the entry from your own phone ───────────────────────────────
    // A member CLAIMS. A member never grants. This creates a request the house
    // has to look at, and nothing about the pot moves until it does — if a
    // phone could settle its own entry the pot would be a number a member
    // typed, which is the one failure this whole feature exists to avoid.
    'POST /bingo/entry/claim': async (req, res) => {
      const cl = acceptedMember(req, res); if (!cl) return;
      const { rail, reference } = await readBody(req);
      if (!['paypal', 'zelle', 'cashapp', 'cash'].includes(rail)) return json(res, 400, { error: 'bad rail' });
      const r = getBingoRound();
      if (r.mode !== 'cash') return json(res, 400, { error: 'tonight is free play — there is nothing to pay' });
      const card = db.prepare('SELECT paid FROM bingo_cards WHERE member_id=?').get(cl.sub);
      if (!card) return json(res, 400, { error: 'join the round first' });
      if (card.paid) return json(res, 409, { error: 'you are already in' });
      const open = db.prepare(`SELECT id FROM bingo_entry_claims WHERE member_id=? AND status='pending'`).get(cl.sub);
      // One open request at a time, or a member tapping twice puts two rows in
      // front of the host for the same fifteen dollars.
      if (open) return json(res, 200, { id: open.id, status: 'pending', duplicate: true, amount: BINGO_ENTRY_FEE });
      const id = `ENT-${randomBytes(4).toString('hex').toUpperCase()}`;
      commit('bingo.entry.claim', { id, member_id: cl.sub, rail, reference: reference || '', at: Date.now() });
      json(res, 200, { id, status: 'pending', amount: BINGO_ENTRY_FEE, rail });
    },
    // The house looking at it. Confirming is what actually takes the money into
    // the pot — it commits the entry itself, so there is exactly one way for a
    // player to become paid.
    'POST /bingo/entry/resolve': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { id, confirm } = await readBody(req);
      const row = db.prepare(`SELECT * FROM bingo_entry_claims WHERE id=? AND status='pending'`).get(id);
      if (!row) return json(res, 404, { error: 'no pending entry claim' });
      const now = Date.now();
      commit('bingo.entry.claim.resolve', { id, status: confirm ? 'confirmed' : 'rejected', by: c.sub, at: now });
      if (confirm) commit('bingo.entry', { member_id: row.member_id, how: row.rail, at: now });
      // Both outcomes are recorded. A refused entry is something that happened
      // to somebody who says they paid, and it has to be reviewable.
      record({ eventType: 'ACCESS', memberId: row.member_id, amount: usd(BINGO_ENTRY_FEE * 100),
               rail: String(row.rail || '').toUpperCase(), authorizedBy: c.sub,
               delivered: confirm ? 'entry to tonight’s round' : null,
               reference: id, settled: !!confirm,
               meta: { claim: id, outcome: confirm ? 'confirmed' : 'rejected' } });
      // The commons share of THIS entry, recorded as it is collected rather
      // than reconciled at the end of the night. Per-entry so the reserve
      // ledger can be walked back to the individual payments that built it.
      if (confirm) recordEntryContribution({ memberId: row.member_id, entryId: id, by: c.sub });
      const players = db.prepare('SELECT paid FROM bingo_cards').all();
      const paidPlayers = players.filter((p) => p.paid).length;
      const hosted = getBingoRound().status !== 'lobby';
      json(res, 200, { ok: true, confirmed: !!confirm, paidPlayers, pot: bingoPot({ hosted, paidPlayers }) });
    },

    // ── The room's vote on a called lip sync square ────────────────────────
    // You may only vote on a square you do NOT hold. Enforced here and not just
    // hidden in the UI: the rule is about who is allowed to make somebody else
    // sing, and a rule that only exists in a button is not a rule.
    'POST /bingo/micvote': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const r = getBingoRound();
      const last = r.calls[r.calls.length - 1];
      if (r.status !== 'live' || !last || last.type !== 'lipsync') {
        return json(res, 400, { error: 'nothing to vote on' });
      }
      const mine = db.prepare('SELECT card FROM bingo_cards WHERE member_id=?').get(c.sub);
      if (!mine) return json(res, 400, { error: 'join first' });
      if (JSON.parse(mine.card).some((sq) => sq && sq.id === last.id)) {
        return json(res, 403, { error: 'you hold that square — you do not get a vote on it' });
      }
      // Past the deadline the answer is already settled; a late vote would
      // change a verdict somebody has acted on.
      const endsAt = micDecideEndsAt(last.at, bingoWindowFor(last, r.nowPlaying?.clip));
      if (endsAt && Date.now() > endsAt) return json(res, 409, { error: 'too late — that one is decided' });
      commit('bingo.micvote', { square_id: last.id, member_id: c.sub, at: Date.now() });
      json(res, 200, { ok: true, mic: micState(getBingoRound()) });
    },
    // ── A performance, registered as the performer's own work ──────────────
    //
    // §12 classifies a Model Appearance as PERFORMANCE, and §11 registers an
    // asset by contentHash + rightsHash + ownerController. This does exactly
    // that for a lip sync take — and does it WITHOUT the video, because the
    // video belongs to the person who made it and this app has never uploaded
    // one. The phone hashes the file; the venue registers the hash.
    //
    // What the member gets is the thing almost no app gives them: a dated,
    // venue-witnessed record naming them as the performer, which they can prove
    // later by producing the file and matching the hash. §13's warning applies
    // and is stated on the record itself — this registers authorship of a
    // performance, it does not transfer or create copyright in the song.
    'POST /ip/performance': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      if (!economyFlags().HITK_IP_REGISTRY) return json(res, 503, { error: 'ip registry is off' });
      const { contentHash, artist, song, durationMs, performedAt, kind, title } = await readBody(req);
      // The registry began as performances. An app somebody builds is as
      // licensable as a verse somebody sings, so a work says what kind it is.
      const workKind = WORK_KINDS[String(kind || '').toUpperCase()] ? String(kind).toUpperCase() : 'PERFORMANCE';
      // A hash is the whole submission, so it has to actually be one.
      if (!/^sha256:[0-9a-f]{64}$/.test(String(contentHash || ''))) {
        return json(res, 400, { error: 'contentHash must be sha256:<64 hex>' });
      }
      const m = db.prepare('SELECT * FROM members WHERE id=?').get(c.sub);
      if (!m) return json(res, 400, { error: 'no member' });

      const existing = db.prepare('SELECT * FROM performance_rights WHERE member_id=? AND content_hash=?')
        .get(c.sub, contentHash);
      if (existing) {
        // Idempotent: the same file registered twice is one fact stated twice.
        return json(res, 200, { ok: true, alreadyRegistered: true, assetId: existing.asset_id,
          contentHash: existing.content_hash, rightsHash: existing.rights_hash, registeredAt: existing.registered_at });
      }

      const now = Date.now();
      const assetId = `PERF-${randomBytes(6).toString('hex').toUpperCase()}`;
      // The rights statement is hashed so the CLAIM is fixed too, not just the
      // file — otherwise a record could be reinterpreted later.
      const rightsStatement = {
        assetType: 'PERFORMANCE',
        ownerController: m.number,
        claim: 'the named member performed this recording',
        notClaimed: 'no ownership of the underlying composition or master recording is claimed or transferred',
        venue: process.env.HVAS_VENUE_NAME || 'HITMANS VIP AFTER SPOT',
        night: nightKey(), performedAt: performedAt || now,
      };
      const rightsHash = `sha256:${createHash('sha256').update(JSON.stringify(rightsStatement, Object.keys(rightsStatement).sort())).digest('hex')}`;

      const receipt = record({
        eventType: 'IP_REGISTRATION', memberId: c.sub, authorizedBy: 'venue-registry',
        delivered: `performance registered to ${m.number}`, reference: assetId, settled: true,
        meta: { contentHash, rightsHash, artist: artist || null, song: song || null, night: nightKey() },
      });

      db.prepare(`INSERT INTO performance_rights
        (asset_id, member_id, content_hash, rights_hash, artist, song, duration_ms,
         venue_night, performed_at, registered_at, owner_controller, status, receipt_id,
         work_kind, title)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(assetId, c.sub, contentHash, rightsHash, artist || null, song || null,
             Number(durationMs) || null, nightKey(), performedAt || now, now, m.number,
             'registered', receipt?.receiptId || null,
             workKind, String(title || song || '').slice(0, 120) || null);

      json(res, 200, {
        ok: true, assetId, contentHash, rightsHash, registeredAt: now,
        ownerController: m.number, rightsStatement,
        receiptId: receipt?.receiptId || null,
      });
    },
    // ── Jubilee: a member asking for help ──────────────────────────────────
    //
    // A member submits a NEED. They do not submit an approval, an amount the
    // reserve owes them, or a verification of their own evidence — every one of
    // those belongs to somebody else, and putting them here is how a support
    // programme becomes a self-service withdrawal.
    'GET /jubilee/kinds': (req, res) => {
      json(res, 200, {
        kinds: Object.entries(NEED_KINDS).map(([id, k]) => ({ id, label: k.label, program: k.program, providerKind: k.providerKind })),
        programs: PROGRAMS,
        // Said plainly on the form: this is a community support network, not a
        // government emergency authority (§38).
        notice: 'HITMANS VIP is a community support network, not a government emergency service. Applying does not guarantee support.',
      });
    },
    'POST /jubilee/apply': async (req, res) => {
      const c = acceptedMember(req, res); if (!c) return;
      if (!economyFlags().WORLD_JUBILEE_PROGRAMS) return json(res, 503, { error: 'jubilee programmes are not running' });
      const { needKind, amountCents, detail, providerHint } = await readBody(req);
      const cls = classify(needKind);
      if (!cls.ok) return json(res, 400, { error: cls.reason });
      const cents = Math.floor(Number(amountCents) || 0);
      if (cents <= 0) return json(res, 400, { error: 'how much is needed?' });
      const open = db.prepare(`SELECT application_id FROM jubilee_applications WHERE member_id=? AND status IN ('SUBMITTED','VERIFIED')`).get(c.sub);
      if (open) return json(res, 200, { applicationId: open.application_id, duplicate: true, status: 'already open' });
      const id = `APP-${randomBytes(5).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO jubilee_applications
        (application_id, member_id, need_kind, amount_units, detail, provider_hint, status, at)
        VALUES (?,?,?,?,?,?, 'SUBMITTED', ?)`)
        .run(id, c.sub, needKind, cents, String(detail || '').slice(0, 600), String(providerHint || '').slice(0, 200), Date.now());
      json(res, 200, { applicationId: id, status: 'SUBMITTED', program: cls.program, label: cls.label });
    },
    'GET /jubilee/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const apps = db.prepare('SELECT * FROM jubilee_applications WHERE member_id=? ORDER BY at DESC LIMIT 20').all(c.sub).map(appRow);
      const awards = db.prepare('SELECT * FROM jubilee_awards WHERE member_id=? ORDER BY at DESC LIMIT 20').all(c.sub)
        .map((a) => ({ awardId: a.award_id, status: a.status, amountCents: a.amount_units, provider: a.provider_name, delivered: a.delivered, at: a.at }));
      json(res, 200, { applications: apps, awards });
    },

    // ── The house's side ───────────────────────────────────────────────────
    'GET /jubilee/queue': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT ja.*, m.name, m.number FROM jubilee_applications ja
        JOIN members m ON m.id=ja.member_id WHERE ja.status IN ('SUBMITTED','VERIFIED') ORDER BY ja.at ASC`).all();
      const { health, byVault } = reserveNow();
      const policy = jubileePolicy();
      json(res, 200, {
        applications: rows.map((r) => ({ ...appRow(r), name: r.name, number: r.number,
          verifiedBy: r.verified_by ? staffNameOf(r.verified_by) : null,
          approvals: db.prepare('SELECT by, at FROM jubilee_approvals WHERE award_ref=?').all(r.application_id)
            .map((a) => ({ ...a, by: staffNameOf(a.by) })) })),
        // An awarded case leaves the application queue, which left the money
        // approved and nobody holding it: no way to record the payment, and no
        // way for the provider to confirm delivery. Unfinished awards belong on
        // this screen until somebody has actually received something (§31).
        awards: db.prepare(`SELECT jaw.*, m.name, m.number FROM jubilee_awards jaw
          JOIN members m ON m.id=jaw.member_id WHERE jaw.status <> 'DELIVERED' ORDER BY jaw.at ASC`)
          .all().map((r) => ({
            awardId: r.award_id, name: r.name, number: r.number, status: r.status,
            amountCents: r.amount_units, provider: r.provider_name, needKind: r.need_kind,
            vault: r.vault, at: r.at, paidAt: r.paid_at || null, reference: r.payment_reference || null,
          })),
        vendors: db.prepare('SELECT * FROM jubilee_vendors ORDER BY name').all().map(vendorRow),
        capacityCents: health.availableJubileeCapacity.units,
        reserveCents: health.actualReserve.units,
        committedCents: health.commitments.units,
        byVault,
        policyAdopted: !!policy.adopted,
        normalApprovals: policy.normalApprovals ?? 3,
      });
    },
    // Evidence is verified BY THE HOUSE. A member cannot verify their own need,
    // for the same reason they cannot confirm their own payment.
    'POST /jubilee/verify': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { applicationId, note, verified = true } = await readBody(req);
      const row = db.prepare('SELECT * FROM jubilee_applications WHERE application_id=?').get(applicationId);
      if (!row) return json(res, 404, { error: 'no such application' });
      if (verified && !note) return json(res, 400, { error: 'say what was checked — a verification nobody can review is not one' });
      db.prepare(`UPDATE jubilee_applications SET evidence_verified=?, evidence_note=?, verified_by=?, verified_at=?, status=? WHERE application_id=?`)
        .run(verified ? 1 : 0, String(note || '').slice(0, 400), c.sub, Date.now(), verified ? 'VERIFIED' : 'SUBMITTED', applicationId);
      json(res, 200, { ok: true, applicationId, evidenceVerified: !!verified });
    },
    // One approval, from one person. Three of these make a release (§55).
    'POST /jubilee/approve': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { applicationId, emergency = false } = await readBody(req);
      const row = db.prepare('SELECT * FROM jubilee_applications WHERE application_id=?').get(applicationId);
      if (!row) return json(res, 404, { error: 'no such application' });
      // INSERT OR IGNORE on (award_ref, by): approving twice is still one
      // approval, enforced by the key rather than by a read-then-write two
      // people could race.
      db.prepare('INSERT OR IGNORE INTO jubilee_approvals(award_ref, by, at, emergency) VALUES(?,?,?,?)')
        .run(applicationId, c.sub, Date.now(), emergency ? 1 : 0);
      const approvals = db.prepare('SELECT by, at FROM jubilee_approvals WHERE award_ref=?').all(applicationId);
      const policy = jubileePolicy();
      const sat = approvalsSatisfied({ approvals, emergency: !!emergency, amount: usd(row.amount_units), policy });
      json(res, 200, { ok: true, approvals: approvals.length, satisfied: sat.ok, reason: sat.reason });
    },
    // Turning an approved, verified, funded need into an award against a real
    // provider. This is where §68's gate actually runs.
    'POST /jubilee/award': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { applicationId, providerId, emergency = false } = await readBody(req);
      const row = db.prepare('SELECT * FROM jubilee_applications WHERE application_id=?').get(applicationId);
      if (!row) return json(res, 404, { error: 'no such application' });
      if (row.status === 'AWARDED') return json(res, 409, { error: 'that application already has an award' });
      const vendor = db.prepare('SELECT * FROM jubilee_vendors WHERE provider_id=?').get(providerId);
      if (!vendor) return json(res, 400, { error: 'no such provider' });

      const application = { ...appRow(row), amount: usd(row.amount_units) };
      const { health, byVault } = reserveNow();
      const policy = jubileePolicy();
      const cls = classify(row.need_kind);
      const prior = db.prepare(`SELECT member_id, need_kind, status, at FROM jubilee_awards WHERE member_id=? AND need_kind=?`)
        .all(row.member_id, row.need_kind).map((a) => ({ memberId: a.member_id, needKind: a.need_kind, status: a.status, at: a.at }));

      const decision = assess({
        application, health, policy,
        vaultBalance: usd(byVault[cls.ok ? cls.vault : 'CORE_RESILIENCE'] || 0),
        priorAwards: prior, provider: vendorRow(vendor),
      });
      if (!decision.ok) return json(res, 400, { error: decision.reason, stage: decision.stage });

      const approvals = db.prepare('SELECT by, at FROM jubilee_approvals WHERE award_ref=?').all(applicationId);
      const sat = approvalsSatisfied({ approvals, emergency: !!emergency, amount: application.amount, policy });
      if (!sat.ok) return json(res, 400, { error: sat.reason, stage: 'APPROVALS' });

      const made = makeAward({ application, assessment: decision, approvals, provider: vendorRow(vendor), emergency: !!emergency });
      if (!made.ok) return json(res, 400, { error: made.reason });
      const a = made.award;
      db.prepare(`INSERT INTO jubilee_awards
        (award_id, application_id, member_id, need_kind, program, vault, amount_units,
         provider_id, provider_name, emergency, status, at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(a.awardId, a.applicationId, a.memberId, a.needKind, a.program, a.vault,
             a.amount.units, a.providerId, a.providerName, a.emergency ? 1 : 0, a.status, a.at);
      db.prepare(`UPDATE jubilee_applications SET status='AWARDED' WHERE application_id=?`).run(applicationId);
      record({ eventType: 'RESERVE_UPDATE', memberId: a.memberId, amount: a.amount,
               authorizedBy: approvals.map((x) => x.by).join('+'),
               delivered: null, reference: a.awardId, settled: false,
               meta: { stage: 'approved', provider: a.providerName, vault: a.vault, emergency: a.emergency } });
      json(res, 200, { ok: true, award: { ...a, amountCents: a.amount.units } });
    },
    // The money leaving, to the provider.
    'POST /jubilee/pay': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { awardId, reference } = await readBody(req);
      const row = db.prepare('SELECT * FROM jubilee_awards WHERE award_id=?').get(awardId);
      if (!row) return json(res, 404, { error: 'no such award' });
      const paid = markPaid({ ...row, awardId: row.award_id }, { by: c.sub, reference });
      if (!paid.ok) return json(res, 400, { error: paid.reason });
      db.prepare(`UPDATE jubilee_awards SET status=?, paid_at=?, paid_by=?, payment_reference=? WHERE award_id=?`)
        .run(paid.award.status, paid.award.paidAt, c.sub, reference, awardId);
      json(res, 200, { ok: true, status: paid.award.status });
    },
    // The provider confirming what they delivered. Until this, the venue has
    // spent money and nobody has yet said the person got the thing (§31).
    'POST /jubilee/delivered': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { awardId, by, what } = await readBody(req);
      const row = db.prepare('SELECT * FROM jubilee_awards WHERE award_id=?').get(awardId);
      if (!row) return json(res, 404, { error: 'no such award' });
      const done = confirmDelivery({ ...row, status: row.status }, { by, what });
      if (!done.ok) return json(res, 400, { error: done.reason });
      db.prepare(`UPDATE jubilee_awards SET status=?, delivered_at=?, delivery_confirmed_by=?, delivered=? WHERE award_id=?`)
        .run(done.award.status, done.award.deliveredAt, by, done.award.delivered, awardId);
      record({ eventType: 'RESERVE_UPDATE', memberId: row.member_id, amount: usd(row.amount_units),
               rail: 'BANK', authorizedBy: row.paid_by || c.sub,
               delivered: done.award.delivered, reference: awardId, settled: true,
               meta: { stage: 'delivered', provider: row.provider_name, confirmedBy: by } });
      json(res, 200, { ok: true, status: done.award.status });
    },
    // Adopting the release policy, and the floors that protect the reserve.
    //
    // §36: do not hard-code permanent percentages, policy must be versioned.
    // §34: actual governance policy must be explicitly adopted before
    // activation. So this is the act of adoption, it names who adopted it, and
    // until it happens nothing is released no matter how much money is sitting
    // there.
    'POST /world/policy': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const {
        maxReleasePercent, maxSingleCents, operatingFloorCents, emergencyMinCents,
        normalApprovals, emergencyApprovals, maxEmergencyCents, defaultVault,
      } = await readBody(req);
      const pct = Number(maxReleasePercent);
      if (!Number.isFinite(pct) || pct <= 0 || pct > 1) return json(res, 400, { error: 'maxReleasePercent must be 0..1' });
      // §55 wants a release to depend on more than one person, and how many
      // people this venue HAS is a fact about the team, not a constant. It used
      // to be hard-coded to two, because staff and host shared codes and the
      // venue only had two distinct house identities to draw on. Now it counts
      // claimed staff accounts, so adding somebody to the team is what raises
      // the ceiling — and a policy nobody could ever satisfy is still refused,
      // because adopting one would quietly make every release impossible.
      const distinctIdentities = countNamedApprovers();
      const normal = Math.floor(Number(normalApprovals) || Math.max(2, Math.min(3, distinctIdentities)));
      if (normal > distinctIdentities) {
        return json(res, 400, {
          error: distinctIdentities < 2
            ? `only ${distinctIdentities} ${distinctIdentities === 1 ? 'person has' : 'people have'} a named account here, so a ${normal}-approver policy could never be satisfied — add your team on the Team screen first (§55)`
            : `this venue has ${distinctIdentities} people with named accounts, so a ${normal}-approver policy could never be satisfied — add ${normal - distinctIdentities} more before adopting it (§55)`,
        });
      }
      if (normal < 2) {
        // §55: the reserve must not depend on one person. Two is the smallest
        // number that is not one person, and this refuses rather than clamps
        // so nobody thinks they adopted something they did not.
        return json(res, 400, { error: 'a normal release needs at least two approvers — the reserve must not depend on one person (§55)' });
      }
      if (defaultVault && !VAULTS.includes(defaultVault)) return json(res, 400, { error: `${defaultVault} is not a WORLD vault` });
      putSetting('world_max_release_percent', String(pct));
      // Stored only when it is a real cap. Writing "0" here would read back as
      // a cap of nothing at all — see releaseLimit().
      putSetting('world_max_single_cents', Math.floor(Number(maxSingleCents) || 0) > 0 ? String(Math.floor(Number(maxSingleCents))) : '');
      putSetting('world_operating_floor_cents', String(Math.floor(Number(operatingFloorCents) || 0)));
      putSetting('world_emergency_min_cents', String(Math.floor(Number(emergencyMinCents) || 0)));
      putSetting('world_normal_approvals', String(normal));
      putSetting('world_emergency_approvals', String(Math.max(2, Math.floor(Number(emergencyApprovals) || 2))));
      putSetting('world_max_emergency_cents', String(Math.floor(Number(maxEmergencyCents) || 0)));
      if (defaultVault) putSetting('bingo_world_vault', defaultVault);
      putSetting('world_policy_adopted_by', c.sub);
      putSetting('world_policy_adopted_at', String(Date.now()));
      const { health } = reserveNow();
      json(res, 200, { ok: true, adoptedBy: c.sub, capacityCents: health.availableJubileeCapacity.units });
    },
    // The approved vendor roster (§38).
    'POST /jubilee/vendor': async (req, res) => {
      const c = moneyAuth(req, res); if (!c) return;
      const { name, kind, contact, approved = true } = await readBody(req);
      if (!name || !kind) return json(res, 400, { error: 'a provider needs a name and a kind' });
      const id = `V-${randomBytes(4).toString('hex').toUpperCase()}`;
      db.prepare(`INSERT INTO jubilee_vendors(provider_id,name,kind,contact,approved,approved_by,approved_at,added_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, name, kind, contact || null, approved ? 1 : 0, approved ? c.sub : null, approved ? Date.now() : null, Date.now());
      json(res, 200, { ok: true, providerId: id });
    },

    // What the commons has actually received, and from what. Aggregate only —
    // §51 says show safe aggregate information and never expose private
    // beneficiary data.
    'GET /world/reserve': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT vault, refused, SUM(amount_units) units, COUNT(*) n FROM world_contributions GROUP BY vault, refused').all();
      const byVault = {}; let total = 0, refusedTotal = 0, refusedCount = 0;
      for (const r of rows) {
        if (r.refused) { refusedTotal += r.units; refusedCount += r.n; continue; }
        byVault[r.vault] = (byVault[r.vault] || 0) + r.units;
        total += r.units;
      }
      json(res, 200, {
        totalCents: total, byVault, contributions: rows.filter((r) => !r.refused).reduce((n, r) => n + r.n, 0),
        // Refusals are reported, not hidden. Money the firewall turned away is
        // the clearest evidence the firewall is working.
        refusedCents: refusedTotal, refusedCount,
        split: bingoSplitPolicy(),
      });
    },
    // What a member has registered. Their own only.
    'GET /ip/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare('SELECT * FROM performance_rights WHERE member_id=? ORDER BY registered_at DESC LIMIT 100').all(c.sub);
      json(res, 200, { performances: rows.map((r) => ({
        assetId: r.asset_id, contentHash: r.content_hash, rightsHash: r.rights_hash,
        artist: r.artist, song: r.song, night: r.venue_night,
        performedAt: r.performed_at, registeredAt: r.registered_at,
        ownerController: r.owner_controller, status: r.status, receiptId: r.receipt_id,
      })) });
    },
    // Proving it later: hand back the file's hash and see what the venue holds.
    // Open to any signed-in member because a proof nobody can check is not a
    // proof — it returns the registration, never the file, which does not exist
    // here to return.
    'POST /ip/verify': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { contentHash } = await readBody(req);
      const row = db.prepare('SELECT * FROM performance_rights WHERE content_hash=? ORDER BY registered_at ASC').get(String(contentHash || ''));
      if (!row) return json(res, 404, { registered: false, reason: 'no performance registered with that hash' });
      json(res, 200, {
        registered: true, assetId: row.asset_id, ownerController: row.owner_controller,
        night: row.venue_night, performedAt: row.performed_at, registeredAt: row.registered_at,
        rightsHash: row.rights_hash,
      });
    },
    'POST /bingo/claim': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const r = getBingoRound();
      if (r.status !== 'live') return json(res, 400, { error: 'no live round' });
      const row = db.prepare('SELECT * FROM bingo_cards WHERE member_id=?').get(c.sub);
      if (!row) return json(res, 400, { error: 'no card' });
      const calledIds = new Set(r.calls.map((it) => it.id));
      const coveredIds = new Set(JSON.parse(row.covered));
      if (!bingoHasWin(JSON.parse(row.card), calledIds, coveredIds, r.pattern)) return json(res, 400, { error: 'not a bingo yet' });
      commit('bingo.claim', { member_id: c.sub, at: Date.now() });
      json(res, 200, { ok: true, pending: true });
    },
    // Host controls — start a fresh live round using whichever deck/pattern
    // is set on the round (picked via /bingo/reset before this).
    'POST /bingo/start': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const r = getBingoRound();
      commit('bingo.start', { phrases: deckById(r.deckId).items, at: Date.now() });
      json(res, 200, { ok: true, deckId: r.deckId, pattern: r.pattern });
    },
    // Manual "call next" for host pacing control — the round also auto-calls
    // every ~6s on its own so the TV display keeps moving unattended.
    'POST /bingo/call': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const item = await bingoCallNext();
      if (!item) return json(res, 400, { error: 'no live round or all phrases called' });
      json(res, 200, { item });
    },
    'POST /bingo/resolve': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { claimId, approve } = await readBody(req);
      const claim = db.prepare(`SELECT * FROM bingo_claims WHERE id=? AND status='pending'`).get(claimId);
      if (!claim) return json(res, 404, { error: 'no pending claim' });
      // Read BEFORE the reducer advances the ladder: the prize belongs to the
      // round that was just won, not to the one that starts next.
      const before = getBingoRound();
      commit('bingo.resolve', { claim_id: claimId, approve: !!approve, member_id: claim.member_id, by: c.sub,
        at: Date.now(), final_round: BINGO_FINAL_ROUND,
        podium_ends_at: approve ? Date.now() + bingoPodiumMs() : null });
      const after = getBingoRound();
      // A round settled by the house, with the money it is worth attached. On a
      // free night the amount is zero and the receipt says so — which is the
      // point: the record is true either way, and nobody can later claim a
      // payout that has no row behind it.
      {
        const players = db.prepare('SELECT paid FROM bingo_cards').all();
        const paidPlayers = players.filter((p) => p.paid).length;
        const cash = after.mode === 'cash' && bingoIsCashGame({ hosted: true, paidPlayers });
        const owed = cash ? bingoRoundPrize(before.roundNo, { hosted: true, paidPlayers, housePercent: bingoSplitPolicy().housePercent }) : 0;
        record({ eventType: 'PAYMENT', memberId: claim.member_id, amount: usd(owed * 100),
                 authorizedBy: c.sub,
                 delivered: approve ? (owed > 0 ? `round ${before.roundNo} prize owed` : `round ${before.roundNo} won — free play, no payout`) : null,
                 reference: String(claimId), settled: !!approve && owed === 0,
                 meta: { round: before.roundNo, approved: !!approve, mode: after.mode, paidPlayers } });
      }
      json(res, 200, { ok: true, roundNo: after.roundNo, pattern: after.pattern, status: after.status });
    },
    // Reset also sets up the NEXT game's deck/pattern — chosen here, before
    // anyone joins, so nobody's card ever gets dealt from a deck that later
    // changes out from under them.
    // Close the podium sprint early — the room is usually done before the
    // clock is.
    'POST /bingo/podium/close': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const standings = closePodium();
      if (!standings) return json(res, 400, { error: 'no podium is open' });
      json(res, 200, { ok: true, standings });
    },
    'POST /bingo/reset': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { deckId, pattern } = await readBody(req);
      const validDeckId = BINGO_DECKS[deckId] ? deckId : DEFAULT_DECK_ID;
      // No pattern given → play the standard three-round ladder. An explicit
      // pattern means the host wants that one pattern for a single round.
      const custom = BINGO_PATTERN_IDS.includes(pattern);
      const validPattern = custom ? pattern : 'line';
      commit('bingo.reset', { deck_id: validDeckId, pattern: validPattern, custom_pattern: custom, at: Date.now() });
      json(res, 200, { ok: true, deckId: validDeckId, pattern: validPattern, rounds: custom ? 1 : BINGO_FINAL_ROUND });
    },
    'GET /bingo/board': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      // `paid` is on this list because taking the money happens against the
      // names of the people standing at the desk — the host's player list IS
      // the door's till sheet on a cash night.
      const players = db.prepare(`SELECT bc.member_id, bc.ready, bc.joined_at, bc.paid, bc.paid_how, m.name, m.number
        FROM bingo_cards bc JOIN members m ON m.id=bc.member_id ORDER BY bc.joined_at ASC`).all();
      const claims = db.prepare(`SELECT bc.*, m.name, m.number FROM bingo_claims bc
        JOIN members m ON m.id=bc.member_id WHERE bc.status='pending' ORDER BY bc.at ASC`).all();
      const r = getBingoRound();
      const paidPlayers = players.filter((p) => p.paid).length;
      const hosted = r.status !== 'lobby';
      // What members have said they paid, waiting on the house to agree.
      const entryClaims = db.prepare(`SELECT ec.*, m.name, m.number FROM bingo_entry_claims ec
        JOIN members m ON m.id=ec.member_id WHERE ec.status='pending' ORDER BY ec.at ASC`).all();
      json(res, 200, { status: r.status, calls: r.calls, players, claims, entryClaims, nowPlaying: r.nowPlaying,
        deckId: r.deckId, deckName: deckById(r.deckId).name, pattern: r.pattern,
        // The money, as it actually stands, so the console never shows the host
        // a pot they have not collected.
        mode: r.mode, entryFee: BINGO_ENTRY_FEE, paidPlayers,
        pot: r.mode === 'cash' ? bingoPot({ hosted, paidPlayers, housePercent: bingoSplitPolicy().housePercent }) : 0,
        cash: r.mode === 'cash' && bingoIsCashGame({ hosted, paidPlayers }),
        split: { ...bingoSplit({ paidPlayers, ...bingoSplitPolicy() }), ...bingoSplitPolicy() },
        songMs: BINGO_SONG_MS,
        // So Host Control can say plainly that calling a song will play nothing.
        youtubeEnabled: mediaReady(),
        mediaError: setting('media_last_error') || null,
        podium: r.podium, podiumEndsAt: r.podiumEndsAt, podiumFirst: r.podiumFirst,
        standings: (r.status === 'podium' || r.status === 'ended') ? bingoStandings().slice(0, 8) : [] });
    },

    // ── Party Mode / Battlerz: Team Purple vs Team Pink, audience votes ──
    // Reuses the bingo room's joined players as "the crew" for the min-
    // player check — same room, same people, no separate roster to manage.
    'GET /party/state': (req, res) => {
      const b = db.prepare('SELECT * FROM party_battle WHERE id=1').get();
      const votesA = db.prepare(`SELECT COUNT(*) c FROM party_votes WHERE round=? AND team='a'`).get(b.round).c;
      const votesB = db.prepare(`SELECT COUNT(*) c FROM party_votes WHERE round=? AND team='b'`).get(b.round).c;
      const playerCount = db.prepare('SELECT COUNT(*) c FROM bingo_cards').get().c;
      let myVote = null;
      const c = auth(req, 'member');
      if (c) myVote = db.prepare('SELECT team, reaction FROM party_votes WHERE round=? AND member_id=?').get(b.round, c.sub) || null;
      json(res, 200, { status: b.status, teamA: b.team_a, teamB: b.team_b, votesA, votesB, hype: votesA + votesB, winner: b.winner, playerCount, minPlayers: PARTY_MIN_PLAYERS, myVote });
    },
    'POST /party/start': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const playerCount = db.prepare('SELECT COUNT(*) c FROM bingo_cards').get().c;
      if (playerCount < PARTY_MIN_PLAYERS) return json(res, 400, { error: `Not enough players — ${PARTY_MIN_PLAYERS} needed to start.` });
      commit('party.start', { at: Date.now() });
      json(res, 200, { ok: true });
    },
    'POST /party/vote': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const b = db.prepare('SELECT status FROM party_battle WHERE id=1').get();
      if (b.status !== 'battling') return json(res, 400, { error: 'no battle live right now' });
      const { team, reaction } = await readBody(req);
      if (!['a', 'b'].includes(team)) return json(res, 400, { error: 'bad team' });
      commit('party.vote', { member_id: c.sub, team, reaction: reaction ? String(reaction).slice(0, 8) : null, at: Date.now() });
      json(res, 200, { ok: true });
    },
    'POST /party/end': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const b = db.prepare('SELECT round FROM party_battle WHERE id=1').get();
      const votesA = db.prepare(`SELECT COUNT(*) c FROM party_votes WHERE round=? AND team='a'`).get(b.round).c;
      const votesB = db.prepare(`SELECT COUNT(*) c FROM party_votes WHERE round=? AND team='b'`).get(b.round).c;
      const winner = votesA === votesB ? null : (votesA > votesB ? 'a' : 'b');
      commit('party.end', { winner, at: Date.now() });
      json(res, 200, { ok: true, winner, votesA, votesB });
    },
    'POST /party/reset': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      commit('party.reset', { at: Date.now() });
      json(res, 200, { ok: true });
    },

    // ── VIP Table Booking: member requests a night + party size, staff decides ──
    'POST /booking/request': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { night, partySize, note } = await readBody(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(night || '')) return json(res, 400, { error: 'pick a valid date' });
      if (night < nightKey()) return json(res, 400, { error: 'that night has already passed' });
      const size = Math.round(Number(partySize));
      if (!Number.isFinite(size) || size < 1 || size > 20) return json(res, 400, { error: 'party size must be 1-20' });
      const id = `BK-${randomBytes(4).toString('hex').toUpperCase()}`;
      commit('booking.request', { id, member_id: c.sub, night, party_size: size, note: (note || '').slice(0, 200), at: Date.now() });
      json(res, 200, { id, night, partySize: size, status: 'pending' });
    },
    'GET /booking/mine': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT * FROM table_bookings WHERE member_id=? ORDER BY at DESC`).all(c.sub);
      json(res, 200, { bookings: rows });
    },
    'POST /booking/cancel': async (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { id } = await readBody(req);
      const b = db.prepare(`SELECT * FROM table_bookings WHERE id=? AND member_id=?`).get(id, c.sub);
      if (!b) return json(res, 404, { error: 'not found' });
      if (!['pending', 'approved'].includes(b.status)) return json(res, 400, { error: 'nothing to cancel' });
      commit('booking.cancel', { id, member_id: c.sub, at: Date.now() });
      json(res, 200, { ok: true });
    },
    'GET /booking/board': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const rows = db.prepare(`SELECT b.*, m.name, m.number FROM table_bookings b JOIN members m ON m.id=b.member_id
        WHERE b.night >= ? ORDER BY b.night ASC, b.at ASC`).all(nightKey());
      json(res, 200, { bookings: rows });
    },
    'POST /booking/decide': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { id, approve, tableLabel, reason } = await readBody(req);
      const b = db.prepare(`SELECT * FROM table_bookings WHERE id=? AND status='pending'`).get(id);
      if (!b) return json(res, 404, { error: 'no pending booking' });
      commit('booking.decide', {
        id, approve: !!approve, by: c.sub, at: Date.now(),
        table_label: approve ? (tableLabel || '').slice(0, 60) || null : null,
        reason: !approve ? (reason || '').slice(0, 200) || null : null,
      });
      json(res, 200, { ok: true, status: approve ? 'approved' : 'declined' });
    },

    // ── YouTube auto-media: no personal login needed at all — search runs on
    // this venue's own app-level key, and the IFrame Player embeds public
    // videos directly. Host picks a result; it syncs to every TV/device the
    // same way a bingo call does. ──
    'GET /media/youtube-search': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const searchToken = await googleAccessToken();
      const searchKey = youtubeKey();
      if (!searchKey && !searchToken) return json(res, 503, { error: 'YouTube search isn’t connected for this venue yet.' });
      const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim();
      if (q.length < 2) return json(res, 200, { results: [] });
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&videoEmbeddable=true&q=${encodeURIComponent(q)}${searchToken ? '' : `&key=${searchKey}`}`;
      try {
        const r = await fetch(url);
        const data = await r.json();
        if (!r.ok) return json(res, 502, { error: data?.error?.message || 'YouTube search failed.' });
        const results = (data.items || []).map((it) => ({
          videoId: it.id.videoId,
          title: it.snippet.title,
          channel: it.snippet.channelTitle,
          thumbnail: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url || '',
        }));
        json(res, 200, { results });
      } catch {
        json(res, 502, { error: 'Could not reach YouTube.' });
      }
    },
    'POST /bingo/media': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const { videoId, title } = await readBody(req);
      if (!videoId) return json(res, 400, { error: 'videoId required' });
      commit('bingo.media', { video: { videoId, title: String(title || '').slice(0, 200) }, at: Date.now() });
      json(res, 200, { ok: true });
    },
    'POST /bingo/media/stop': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      commit('bingo.media', { video: null, at: Date.now() });
      json(res, 200, { ok: true });
    },
  };

  const REASONS = {
    granted: 'Member verified — grant entry.',
    expired: 'Membership expired — renewal required.',
    'expired-qr': 'Pass expired — ask them to refresh their QR.',
    suspended: 'Membership suspended — do not admit.',
    trespass: 'No matching member — unauthorized. Do not admit.',
    banned: 'Banned from the venue — do not admit.',
    denied: 'Denied by staff — do not admit.',
    // A person who left is not a person who was thrown out, and the door should
    // not treat them the same way or say the same thing to them.
    resigned: 'Resigned their membership — not a member tonight. They can rejoin in the app.',
  };

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url, 'http://x');
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) {
      // Not an API route — it may be the app, if this venue is serving one.
      if (req.method === 'GET' && appAvailable()) {
        if (url.pathname === '/' || url.pathname === '/HVAS') {
          res.writeHead(302, { Location: APP_BASE });
          return res.end();
        }
        if (url.pathname.startsWith(APP_BASE)) return serveApp(req, res, url.pathname);
      }
      return json(res, 404, { error: 'not found' });
    }
    try {
      await handler(req, res);
    } catch (e) {
      // A required field that never arrived reaches the database as undefined,
      // and node:sqlite refuses to bind it. That is the caller's request being
      // incomplete, not this server failing — and the difference matters,
      // because a 500 on a phone is read as "the venue is down" and sends
      // somebody to restart a laptop that was fine all along.
      const msg = String(e?.message || e);
      if (/cannot be bound to SQLite parameter/i.test(msg)) {
        return json(res, 400, { error: 'That request was missing something it needed. Nothing was changed.' });
      }
      json(res, 500, { error: msg });
    }
  });

  // Join the encrypted mesh in the background (peers = other door nodes).
  let meshServer = null; const dials = [];
  if (meshPort) meshServer = meshListen(node, meshPort, '0.0.0.0', { key: meshKey });
  for (const p of peers) {
    const [host, port] = p.split(':');
    dials.push(meshDial(node, host, Number(port), { key: meshKey }));
  }
  const closeMesh = () => { meshServer?.close(); dials.forEach((d) => d.stop()); };

  return { server, db, keys, node, closeMesh };
}

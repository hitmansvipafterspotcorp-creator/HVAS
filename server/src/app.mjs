// HVAS backend — HTTP API. Zero-dependency router over node:http.
//
// Auth model (matches the app's product design):
//   • Members self-serve: phone/email → OTP → session token.
//   • Staff / Host are privileged: a venue access code → role session token.
//
// The door verifies rolling Ed25519 passes (see crypto.mjs) and logs one
// admission per 3AM night. A live board streams over SSE.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { openDb, nightKey } from './db.mjs';
import {
  loadOrCreateKeys, publicKeyRaw, issuePass, verifyPass,
  sessionSecret, signSession, readSession, venueSecret,
} from './crypto.mjs';
import { MeshNode, meshListen, meshDial } from './mesh.mjs';
import { applyOp } from './reduce.mjs';
import { hitkoinEnabled, mintForPayment, walletSummary } from './hitkoin.mjs';
import { BINGO_DECKS, DEFAULT_DECK_ID, deckList, deckById } from './decks.mjs';

const TIERS = {
  Daily: { days: 1, vip: false, price: 20 }, Weekly: { days: 7, vip: false, price: 100 },
  Monthly: { days: 30, vip: false, price: 300 }, Yearly: { days: 365, vip: false, price: 1850 },
  VIP: { days: 365, vip: true, price: 5000 },
};
const STAFF_CODES = { staff: process.env.HVAS_STAFF_CODE || 'DOOR850', host: process.env.HVAS_HOST_CODE || 'HOST850' };
const SESSION_TTL = 12 * 3600 * 1000;

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
const bingoWindowFor = (item) => (item?.type === 'lipsync' ? BINGO_LIPSYNC_MS : BINGO_SONG_MS);

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

const memNumber = () => `HV-${1000 + Math.floor(Math.random() * 9000)}-${1000 + Math.floor(Math.random() * 9000)}`;
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
const readBody = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
});
const readRaw = (req) => new Promise((resolve) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 1e6) req.destroy(); });
  req.on('end', () => resolve(d));
});

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
  const putSetting = (k, v) => {
    if (!v) return db.prepare('DELETE FROM settings WHERE key=?').run(k);
    return db.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(k, v, Date.now());
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
      songSeconds: Math.round(BINGO_SONG_MS / 1000),
      lipsyncSeconds: Math.round(BINGO_LIPSYNC_MS / 1000),
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
        commit('bingo.media', { video: { videoId: it.id.videoId, title: it.snippet.title }, at: Date.now() });
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
    if (last?.at && Date.now() - last.at < bingoWindowFor(last)) return;   // current song still playing
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

  const auth = (req, role) => {
    const h = req.headers.authorization || '';
    const claims = readSession(secret, h.replace(/^Bearer /, ''));
    if (!claims) return null;
    if (role && claims.role !== role) return null;
    return claims;
  };

  // ── routes ──
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
      paypalMe: process.env.PAYPAL_ME || process.env.VITE_PAYPAL_ME || '',
      zelle: process.env.HVAS_ZELLE || process.env.VITE_ZELLE_HANDLE || '',
      features: { social: true, pay: true, mesh: !!meshPort, youtube: !!youtubeKey(), hitkoin: hitkoinEnabled() },
      hitkoinPerDollar: Number(process.env.HITKOIN_PER_DOLLAR || 100),
    }),

    // Member self-serve auth (mock OTP — dev code returned; wire a real SMS
    // provider here in production).
    'POST /auth/member/start': async (req, res) => {
      const { contact } = await readBody(req);
      if (!contact || contact.length < 5) return json(res, 400, { error: 'contact required' });
      const code = String(100000 + Math.floor(Math.random() * 900000));
      db.prepare('INSERT INTO otps(contact,code,expires_at) VALUES(?,?,?) ON CONFLICT(contact) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at')
        .run(contact, code, Date.now() + 5 * 60000);
      json(res, 200, { sent: true, devCode: code }); // devCode only in demo
    },
    'POST /auth/member/verify': async (req, res) => {
      const { contact, code, name } = await readBody(req);
      const row = db.prepare('SELECT * FROM otps WHERE contact=?').get(contact);
      if (!row || row.code !== String(code) || Date.now() > row.expires_at) return json(res, 401, { error: 'bad code' });
      db.prepare('DELETE FROM otps WHERE contact=?').run(contact);
      let m = db.prepare('SELECT * FROM members WHERE contact=?').get(contact);
      if (!m) {
        const id = randomBytes(8).toString('hex');
        commit('member.upsert', { id, name: (name || 'Member').trim(), contact, number: memNumber(), created_at: Date.now() });
        m = db.prepare('SELECT * FROM members WHERE id=?').get(id);
      }
      json(res, 200, { token: signSession(secret, { sub: m.id, role: 'member' }, SESSION_TTL), member: publicMember(m) });
    },
    // Staff / Host code login.
    'POST /auth/staff': async (req, res) => {
      const { code } = await readBody(req);
      const role = Object.keys(STAFF_CODES).find((r) => STAFF_CODES[r] === String(code || '').toUpperCase());
      if (!role) return json(res, 401, { error: 'bad code' });
      json(res, 200, { token: signSession(secret, { sub: `${role}-device`, role }, SESSION_TTL), role });
    },

    'GET /me': (req, res) => {
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, { member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(c.sub)) });
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
      json(res, 200, {
        // `score` is published rather than left to each screen to recompute —
        // one formula, in one place, or the board and the card disagree.
        top: rows.map((r, i) => ({ ...r, place: i + 1, score: playerScore(r), title: playerTitle(r), isMe: r.memberId === c?.sub })),
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
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
      const { tier, payment } = await readBody(req);
      const t = TIERS[tier]; if (!t) return json(res, 400, { error: 'bad tier' });
      const now = Date.now();
      commit('membership.upsert', {
        member_id: c.sub, tier, vip: t.vip, payment: payment || null,
        purchased_at: now, expires_at: now + t.days * 86400000, status: 'active',
      });
      json(res, 200, { member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(c.sub)) });
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
      const { pass, number, searched } = await readBody(req);
      let num = number, checked = { ok: !!number };
      if (pass) { checked = verifyPass(keys.publicKey, pass); num = checked.number; }
      const decide = (status, member) => {
        commit('decision', { member_id: member?.id || null, number: num || null, status, at: Date.now(), by_staff: c.sub });
        return json(res, 200, { ok: status === 'granted', status, member: member ? publicMember(member) : null, reason: REASONS[status] });
      };
      if (pass && !checked.ok) return decide(checked.reason === 'expired-qr' ? 'expired-qr' : 'trespass', null);
      const m = memberByNumber(num);
      if (!m) return decide('trespass', null);
      const flag = db.prepare('SELECT * FROM member_flags WHERE member_id=?').get(m.id);
      if (flag) return decide(flag.kind, m);   // manual staff flag always wins, regardless of membership state
      const ms = membershipOf(m.id);
      if (!ms) return decide('trespass', m);
      if (ms.status === 'suspended') return decide('suspended', m);
      if (Date.now() > ms.expires_at) return decide('expired', m);
      // grant → admission op (idempotent per night; clears OTW in the reducer;
      // re-admits someone who'd left as a real "back inside" event)
      commit('entry.admit', { member_id: m.id, night: nightKey(), at: Date.now(), by_staff: c.sub, searched: !!searched });
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
    'GET /bingo/state': (req, res) => {
      const r = getBingoRound();
      const players = db.prepare('SELECT member_id, ready FROM bingo_cards').all();
      const pendingClaims = db.prepare(`SELECT COUNT(*) c FROM bingo_claims WHERE status='pending'`).get().c;
      const winner = r.winner_member_id ? publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(r.winner_member_id)) : null;
      let me = null;
      const c = auth(req, 'member');
      if (c) {
        const mine = db.prepare('SELECT * FROM bingo_cards WHERE member_id=?').get(c.sub);
        const myClaim = db.prepare(`SELECT 1 FROM bingo_claims WHERE member_id=? AND status='pending'`).get(c.sub);
        me = mine ? { card: JSON.parse(mine.card), ready: !!mine.ready, covered: JSON.parse(mine.covered), autofill: !!mine.autofill, hasPendingClaim: !!myClaim } : null;
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
        currentWindowMs: r.calls.length ? bingoWindowFor(r.calls[r.calls.length - 1]) : BINGO_SONG_MS,
        playerCount: players.length, readyCount: players.filter((p) => p.ready).length,
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
      const c = auth(req, 'member'); if (!c) return json(res, 401, { error: 'unauthorized' });
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
      const ms = Math.max(5, Number(seconds) || BINGO_LIPSYNC_MS / 1000) * 1000;
      commit('battle.perform', { battle_id: battleId, member_id: memberId, ends_at: Date.now() + ms });
      json(res, 200, { ok: true, endsAt: Date.now() + ms });
    },
    // The performer's own device reports the take is finished.
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
      json(res, 200, { ok: true });
    },
    'GET /battle/frame': (req, res) => {
      const c = auth(req); if (!c) return json(res, 401, { error: 'unauthorized' });
      const id = new URL(req.url, 'http://x').searchParams.get('battleId');
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
      commit('bingo.resolve', { claim_id: claimId, approve: !!approve, member_id: claim.member_id, by: c.sub,
        at: Date.now(), final_round: BINGO_FINAL_ROUND,
        podium_ends_at: approve ? Date.now() + bingoPodiumMs() : null });
      const after = getBingoRound();
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
      const players = db.prepare(`SELECT bc.member_id, bc.ready, bc.joined_at, m.name, m.number
        FROM bingo_cards bc JOIN members m ON m.id=bc.member_id ORDER BY bc.joined_at ASC`).all();
      const claims = db.prepare(`SELECT bc.*, m.name, m.number FROM bingo_claims bc
        JOIN members m ON m.id=bc.member_id WHERE bc.status='pending' ORDER BY bc.at ASC`).all();
      const r = getBingoRound();
      json(res, 200, { status: r.status, calls: r.calls, players, claims, nowPlaying: r.nowPlaying,
        deckId: r.deckId, deckName: deckById(r.deckId).name, pattern: r.pattern,
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
  };

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    const url = new URL(req.url, 'http://x');
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return json(res, 404, { error: 'not found' });
    try { await handler(req, res); } catch (e) { json(res, 500, { error: String(e.message || e) }); }
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

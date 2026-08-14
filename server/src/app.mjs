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
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
// How long a called square holds the TV before the next one is called — the
// performance window. A plain song square is a minute; a LIP SYNC square is an
// actual performance on the floor, so it gets two. Overridable per venue, and
// kept short in tests.
const BINGO_SONG_MS = Math.max(3, Number(process.env.BINGO_SONG_SECONDS) || 60) * 1000;
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
    };
  };
  // No manual links, ever: the moment a real song gets called, search
  // YouTube for it and send the top result straight to the TV. Best-effort
  // — if it fails or no key is configured, the call itself already landed
  // and gameplay keeps going regardless.
  const autoResolveMedia = async (item) => {
    if (!YOUTUBE_API_KEY || !item || item.free || !item.artist) return;
    try {
      const q = `${item.artist} ${item.song}`;
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&videoEmbeddable=true&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
      const r = await fetch(url);
      const data = await r.json();
      const it = data.items?.[0];
      if (it) commit('bingo.media', { video: { videoId: it.id.videoId, title: it.snippet.title }, at: Date.now() });
    } catch { /* media is a bonus, never a blocker */ }
  };
  // Votes per performer, highest first — drives both the live meter and the
  // automatic winner when the host closes voting.
  const battleTally = (battleId) => db.prepare(`
    SELECT p.member_id AS memberId, m.name, m.number, p.state,
           (SELECT COUNT(*) FROM lipsync_battle_votes v WHERE v.battle_id=p.battle_id AND v.member_id=p.member_id) AS votes
    FROM lipsync_battle_players p JOIN members m ON m.id=p.member_id
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
      me: players.find((p) => p.memberId === viewerId) || null,
      myVote: db.prepare('SELECT member_id FROM lipsync_battle_votes WHERE battle_id=? AND voter_id=?').get(b.id, viewerId)?.member_id || null,
    };
  };

  // Who is allowed to cover a given LIP SYNC square. You must have won its
  // battle — or, when you were the only player holding it, have performed it.
  const lipSyncGate = (memberId, itemId) => {
    const locked = db.prepare('SELECT reason FROM lipsync_locks WHERE member_id=? AND item_id=?').get(memberId, itemId);
    if (locked) {
      return { ok: false, error: locked.reason === 'declined' ? 'you declined this battle' : 'you lost this battle' };
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
    commit('battle.open', { id, item_id: item.id, artist: item.artist, song: item.song, members: holders, at: Date.now() });
    return id;
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
    return item;
  };
  // Each call swaps the YouTube video on the TV, so the gap between calls IS
  // how long a song gets to play. At the old flat 6s the video was replaced
  // before anyone could lip sync to it — the whole point of the game. Now a
  // called song holds the screen for a real performance window, and the
  // ticker only advances once that window is up. A host pressing "Call Song"
  // still overrides immediately (that goes through bingoCallNext directly).
  setInterval(() => {
    const r = getBingoRound();
    if (r.status !== 'live') return;
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
      features: { social: true, pay: true, mesh: !!meshPort, youtube: !!YOUTUBE_API_KEY, hitkoin: hitkoinEnabled() },
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
        me = mine ? { card: JSON.parse(mine.card), ready: !!mine.ready, covered: JSON.parse(mine.covered), hasPendingClaim: !!myClaim } : null;
      }
      json(res, 200, {
        status: r.status, calls: r.calls, startedAt: r.started_at,
        deckId: r.deckId, deckName: deckById(r.deckId).name, pattern: r.pattern,
        roundNo: r.roundNo, finalRound: r.finalRound, customPattern: r.customPattern, roundWins: r.roundWins,
        songMs: BINGO_SONG_MS, lipSyncMs: BINGO_LIPSYNC_MS, youtubeEnabled: !!YOUTUBE_API_KEY,
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
      commit('bingo.join', { member_id: c.sub, card, at: Date.now() });
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
      json(res, 200, { ok: true, winnerId: winner, tally });
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
      commit('bingo.resolve', { claim_id: claimId, approve: !!approve, member_id: claim.member_id, by: c.sub, at: Date.now(), final_round: BINGO_FINAL_ROUND });
      const after = getBingoRound();
      json(res, 200, { ok: true, roundNo: after.roundNo, pattern: after.pattern, status: after.status });
    },
    // Reset also sets up the NEXT game's deck/pattern — chosen here, before
    // anyone joins, so nobody's card ever gets dealt from a deck that later
    // changes out from under them.
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
      json(res, 200, { status: r.status, calls: r.calls, players, claims, nowPlaying: r.nowPlaying, deckId: r.deckId, deckName: deckById(r.deckId).name, pattern: r.pattern });
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
      json(res, 200, { status: b.status, teamA: b.team_a, teamB: b.team_b, votesA, votesB, hype: votesA + votesB, winner: b.winner, playerCount, minPlayers: 5, myVote });
    },
    'POST /party/start': async (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      const playerCount = db.prepare('SELECT COUNT(*) c FROM bingo_cards').get().c;
      if (playerCount < 5) return json(res, 400, { error: 'Not enough players — gather your crew and try again.' });
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
      if (!YOUTUBE_API_KEY) return json(res, 503, { error: 'YouTube search isn’t connected for this venue yet.' });
      const q = (new URL(req.url, 'http://x').searchParams.get('q') || '').trim();
      if (q.length < 2) return json(res, 200, { results: [] });
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=6&videoEmbeddable=true&q=${encodeURIComponent(q)}&key=${YOUTUBE_API_KEY}`;
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

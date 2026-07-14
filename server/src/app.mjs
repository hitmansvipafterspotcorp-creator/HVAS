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

const TIERS = {
  Daily: { days: 1, vip: false, price: 20 }, Weekly: { days: 7, vip: false, price: 100 },
  Monthly: { days: 30, vip: false, price: 300 }, Yearly: { days: 365, vip: false, price: 1850 },
  VIP: { days: 365, vip: true, price: 5000 },
};
const STAFF_CODES = { staff: process.env.HVAS_STAFF_CODE || 'DOOR850', host: process.env.HVAS_HOST_CODE || 'HOST850' };
const SESSION_TTL = 12 * 3600 * 1000;

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
    const insideTonight = !!db.prepare('SELECT 1 FROM entries WHERE member_id=? AND night=?').get(m.id, nightKey());
    const sig = db.prepare('SELECT * FROM signals WHERE member_id=?').get(m.id);
    return {
      id: m.id, name: m.name, number: m.number,
      tier: ms?.tier || null, vip: !!ms?.vip, payment: ms?.payment || null,
      status: ms?.status || null, expiresAt: ms?.expires_at || null,
      entries: nights, insideTonight, onTheWay: !!sig?.on_the_way && !insideTonight, onTheWayAt: sig?.at || null,
    };
  };
  const emitBoard = () => {
    const payload = `data: ${JSON.stringify(board())}\n\n`;
    for (const res of sse) res.write(payload);
  };
  const board = () => {
    const nk = nightKey();
    const onTheWay = db.prepare(`SELECT m.* FROM signals s JOIN members m ON m.id=s.member_id
       WHERE s.on_the_way=1 AND m.id NOT IN (SELECT member_id FROM entries WHERE night=?)`).all(nk).map(publicMember);
    const inside = db.prepare(`SELECT m.* FROM entries e JOIN members m ON m.id=e.member_id WHERE e.night=?`).all(nk).map(publicMember);
    const last = db.prepare('SELECT * FROM decisions ORDER BY at DESC LIMIT 1').get();
    return { onTheWay, inside, lastDecision: last || null };
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
      features: { social: true, pay: true, mesh: !!meshPort },
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
      commit('signal.otw', { member_id: c.sub, on: on ? 1 : 0 });
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
      const { pass, number } = await readBody(req);
      let num = number, checked = { ok: !!number };
      if (pass) { checked = verifyPass(keys.publicKey, pass); num = checked.number; }
      const decide = (status, member) => {
        commit('decision', { member_id: member?.id || null, number: num || null, status, at: Date.now(), by_staff: c.sub });
        return json(res, 200, { ok: status === 'granted', status, member: member ? publicMember(member) : null, reason: REASONS[status] });
      };
      if (pass && !checked.ok) return decide(checked.reason === 'expired-qr' ? 'expired-qr' : 'trespass', null);
      const m = memberByNumber(num);
      if (!m) return decide('trespass', null);
      const ms = membershipOf(m.id);
      if (!ms) return decide('trespass', m);
      if (ms.status === 'suspended') return decide('suspended', m);
      if (Date.now() > ms.expires_at) return decide('expired', m);
      // grant → admission op (idempotent per night; clears OTW in the reducer)
      commit('entry.admit', { member_id: m.id, night: nightKey(), at: Date.now(), by_staff: c.sub });
      return decide('granted', m);
    },

    'GET /door/board': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      json(res, 200, board());
    },
    'GET /door/stream': (req, res) => {
      const c = auth(req); if (!c || (c.role !== 'staff' && c.role !== 'host')) return json(res, 401, { error: 'unauthorized' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`data: ${JSON.stringify(board())}\n\n`);
      sse.add(res);
      req.on('close', () => sse.delete(res));
    },
  };

  const REASONS = {
    granted: 'Member verified — grant entry.',
    expired: 'Membership expired — renewal required.',
    'expired-qr': 'Pass expired — ask them to refresh their QR.',
    suspended: 'Membership suspended — do not admit.',
    trespass: 'No matching member — unauthorized. Do not admit.',
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

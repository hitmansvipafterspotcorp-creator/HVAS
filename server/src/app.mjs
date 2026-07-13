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
  sessionSecret, signSession, readSession,
} from './crypto.mjs';

const TIERS = {
  Daily: { days: 1, vip: false }, Weekly: { days: 7, vip: false },
  Monthly: { days: 30, vip: false }, Yearly: { days: 365, vip: false },
  VIP: { days: 365, vip: true },
};
const STAFF_CODES = { staff: process.env.HVAS_STAFF_CODE || 'DOOR850', host: process.env.HVAS_HOST_CODE || 'HOST850' };
const SESSION_TTL = 12 * 3600 * 1000;

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

export function createApp({ dataDir }) {
  const db = openDb(`${dataDir}/hvas.db`);
  const keys = loadOrCreateKeys(`${dataDir}/venue-key.json`);
  const secret = sessionSecret(`${dataDir}/session.key`);
  const sse = new Set(); // live door-board subscribers

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
    'GET /keys/pub': (req, res) => json(res, 200, { alg: 'Ed25519', publicKey: publicKeyRaw(keys.publicKey), rollTtlMs: 45000 }),

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
        db.prepare('INSERT INTO members(id,name,contact,number,created_at) VALUES(?,?,?,?,?)')
          .run(id, (name || 'Member').trim(), contact, memNumber(), Date.now());
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
      db.prepare(`INSERT INTO memberships(member_id,tier,vip,payment,purchased_at,expires_at,status)
        VALUES(?,?,?,?,?,?, 'active')
        ON CONFLICT(member_id) DO UPDATE SET tier=excluded.tier, vip=excluded.vip, payment=excluded.payment,
          purchased_at=excluded.purchased_at, expires_at=excluded.expires_at, status='active'`)
        .run(c.sub, tier, t.vip ? 1 : 0, payment || null, now, now + t.days * 86400000);
      json(res, 200, { member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(c.sub)) });
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
      db.prepare('INSERT INTO signals(member_id,on_the_way,at) VALUES(?,?,?) ON CONFLICT(member_id) DO UPDATE SET on_the_way=excluded.on_the_way, at=excluded.at')
        .run(c.sub, on ? 1 : 0, on ? Date.now() : null);
      emitBoard();
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
        db.prepare('INSERT INTO decisions(member_id,number,status,at,by_staff) VALUES(?,?,?,?,?)')
          .run(member?.id || null, num || null, status, Date.now(), c.sub);
        emitBoard();
        return json(res, 200, { ok: status === 'granted', status, member: member ? publicMember(member) : null, reason: REASONS[status] });
      };
      if (pass && !checked.ok) return decide(checked.reason === 'expired-qr' ? 'expired-qr' : 'trespass', null);
      const m = memberByNumber(num);
      if (!m) return decide('trespass', null);
      const ms = membershipOf(m.id);
      if (!ms) return decide('trespass', m);
      if (ms.status === 'suspended') return decide('suspended', m);
      if (Date.now() > ms.expires_at) return decide('expired', m);
      // grant → log admission (idempotent per night) + clear OTW
      db.prepare('INSERT OR IGNORE INTO entries(member_id,night,at,by_staff) VALUES(?,?,?,?)').run(m.id, nightKey(), Date.now(), c.sub);
      db.prepare('UPDATE signals SET on_the_way=0 WHERE member_id=?').run(m.id);
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
  return { server, db, keys };
}

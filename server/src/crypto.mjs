// HVAS backend — crypto. Two primitives, both from Node's built-in crypto:
//
//   1. Ed25519 "rolling passes" — the innovative bit. A member's QR is NOT a
//      static number; it's a short-lived token signed with the venue's private
//      key. The door verifies the SIGNATURE (offline-capable, no DB round-trip)
//      and the FRESHNESS (issued < ROLL_TTL ago), so a screenshotted QR expires
//      in seconds and can't be forged without the private key.
//
//   2. HMAC session tokens (JWT-lite) — compact signed {sub, role, exp} for
//      authenticating API calls.
import {
  generateKeyPairSync, sign, verify, createHmac, randomBytes,
  createPublicKey, createPrivateKey,
} from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (str) => Buffer.from(str, 'base64url');

// ── Venue signing key (persisted so passes stay verifiable across restarts) ──
export function loadOrCreateKeys(path) {
  if (existsSync(path)) {
    const { privatePem } = JSON.parse(readFileSync(path, 'utf8'));
    const privateKey = createPrivateKey(privatePem);
    const publicKey = createPublicKey(privateKey);
    return { privateKey, publicKey };
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(path, JSON.stringify({
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }));
  return { privateKey, publicKey };
}

// Raw 32-byte Ed25519 public key, base64url — small enough to embed in a door
// app for fully-offline verification.
export function publicKeyRaw(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return b64u(der.subarray(der.length - 32)); // last 32 bytes = raw key
}

export const ROLL_TTL = 45_000; // a pass is valid 45s from issue

// Issue a rolling pass for a member: payload {m: number, i: issuedAt, n: nonce}.
export function issuePass(privateKey, memberNumber) {
  const payload = { m: memberNumber, i: Date.now(), n: b64u(randomBytes(6)) };
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(sign(null, Buffer.from(body), privateKey));
  return `${body}.${sig}`;
}

// Verify a scanned pass: signature valid AND issued within ROLL_TTL.
export function verifyPass(publicKey, token, now = Date.now()) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return { ok: false, reason: 'malformed' };
    if (!verify(null, Buffer.from(body), publicKey, unb64u(sig))) {
      return { ok: false, reason: 'bad-signature' };
    }
    const p = JSON.parse(unb64u(body).toString());
    if (now - p.i > ROLL_TTL) return { ok: false, reason: 'expired-qr', number: p.m };
    return { ok: true, number: p.m, issuedAt: p.i };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

// ── HMAC session tokens ──────────────────────────────────────────────────
export function sessionSecret(path) {
  if (existsSync(path)) return readFileSync(path);
  const s = randomBytes(32);
  writeFileSync(path, s);
  return s;
}
export function signSession(secret, claims, ttlMs) {
  const body = b64u(JSON.stringify({ ...claims, exp: Date.now() + ttlMs }));
  const mac = b64u(createHmac('sha256', secret).update(body).digest());
  return `${body}.${mac}`;
}
export function readSession(secret, token) {
  try {
    const [body, mac] = String(token).split('.');
    const expected = b64u(createHmac('sha256', secret).update(body).digest());
    if (mac !== expected) return null;
    const claims = JSON.parse(unb64u(body).toString());
    if (Date.now() > claims.exp) return null;
    return claims;
  } catch { return null; }
}

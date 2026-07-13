# HVAS Backend

A custom, zero-dependency backend for the HITMANS VIP After Spot membership +
door system. Built on Node 22 built-ins only (`node:http`, `node:sqlite`,
`node:crypto`) — no npm install, no native builds, deploys anywhere Node runs.

## The idea: rolling, offline-verifiable door passes

A nightclub door has two problems a naive "look up the number in a database"
system handles badly:

1. **Spotty wifi.** The door often can't reach a server, but the line still
   needs to move.
2. **Screenshot sharing.** A static QR/number can be photographed and passed
   around.

This backend solves both with **rolling Ed25519 passes**:

- The member's app fetches a signed token every ~30s (`GET /pass/current`) and
  renders it as a QR. The token is `base64url({member#, issuedAt, nonce}).sig`,
  signed with the **venue's Ed25519 private key**.
- The door verifies the **signature** with the venue's **public key**
  (`GET /keys/pub`, 32 bytes — small enough to embed). That's a local
  operation: **no server round-trip needed to prove the pass is authentic.**
- The token is only valid **45 seconds** from issue, so a screenshot is dead
  almost immediately, and it can't be forged without the private key.
- When the door is online, it `POST /door/verify`s to check membership
  status/expiry and log the admission; when offline it can trust the signature
  and sync the entry later.

Everything else (auth, admissions, the live board) is built around that core.

## Auth model

- **Members self-serve:** `POST /auth/member/start` → OTP (a real SMS/email
  provider plugs in here; the demo returns a `devCode`), then
  `POST /auth/member/verify` → session token. Buying a membership and getting a
  card is open to anyone.
- **Staff / Host are privileged:** `POST /auth/staff` with the venue access
  code (`HVAS_STAFF_CODE` / `HVAS_HOST_CODE`, default `DOOR850` / `HOST850`) →
  role session token. These roles can verify entries, so they're gated.

Sessions are HMAC-signed compact tokens (JWT-lite), 12h TTL.

## Endpoints

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /health` | — | liveness |
| `GET /keys/pub` | — | venue public key for **offline** pass verification |
| `POST /auth/member/start` | — | begin member OTP |
| `POST /auth/member/verify` | — | finish OTP → session + member |
| `POST /auth/staff` | — | staff/host code → role session |
| `GET /me` | member | current member state |
| `POST /membership/purchase` | member | buy/renew a tier |
| `GET /pass/current` | member | issue a rolling signed pass (QR payload) |
| `POST /signal/otw` | member | set "on the way" |
| `POST /door/verify` | staff/host | verify a pass or number → grant/deny + log |
| `GET /door/board` | staff/host | on-the-way / inside / last decision |
| `GET /door/stream` | staff/host | same board, live over SSE |

Door outcomes: `granted`, `expired` (membership lapsed), `expired-qr` (stale
pass — refresh the QR), `suspended`, `trespass` (unknown number).

Admissions are **idempotent per 3AM night** — scanning twice never
double-counts a member's nights (which drive their loyalty rank).

## Run

```bash
cd server
npm start                 # PORT=8787 by default
npm test                  # 18-check end-to-end integration test
```

Data (SQLite DB + the venue key) lives in `server/data/` and is gitignored —
the private key never leaves the host.

## Deploy

It's a single `node src/index.mjs` process, so any Node host works:

- **Render / Railway / Fly.io:** start command `node src/index.mjs`, set
  `PORT`, `HVAS_STAFF_CODE`, `HVAS_HOST_CODE`, and mount a volume at
  `HVAS_DATA_DIR` so the key + DB persist.
- **A small VPS:** `node src/index.mjs` behind nginx/Caddy for TLS.

Then point the static frontend at it with `VITE_HVAS_API=https://your-host`.
Without that env var the app stays in its offline localStorage demo mode, so the
GitHub Pages build keeps working with or without a live backend.

## Production hardening (not done here)

- Swap the mock OTP for a real SMS/email provider; stop returning `devCode`.
- Replace shared staff codes with per-person provisioned accounts (add an
  owner/admin role that issues them).
- Rotate the venue signing key on a schedule; publish key IDs so old passes can
  be aged out.
- Rate-limit `/auth/*` and `/door/verify`.

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

## HVAS Mesh — always live, no cell towers

The venue runs as a **peer-to-peer mesh**, not a single server everyone depends
on. Every door station is a node; in a native shell (below) every phone is too.
Nodes replicate a **signed, append-only op-log** and converge with **no central
server and no internet** — any pair of nodes that can see each other over *any*
transport keeps the whole venue in sync.

Why it survives a dead network:

- **Offline pass verification.** Any node/phone with the 32-byte venue public
  key can verify a rolling pass with zero connectivity — the door never *needs*
  the network to say grant/deny.
- **CRDT convergence.** Every op is commutative + idempotent under its merge
  rule (memberships last-write-wins; admissions are a set-union keyed by
  member+night; decisions append), so nodes reconcile no matter the order or how
  long they were apart. Admissions never double-count across doors.
- **Partition tolerance + auto-heal.** Nodes flood ops to peers and run
  anti-entropy (digest → backfill) on every (re)connect. When a link drops
  (peer out of range) each side keeps working locally; when it returns, they
  re-sync automatically. Proven in `mesh-test.mjs` (partition → concurrent
  writes → heal → reconverge) and `mesh-tcp-test.mjs` (real sockets, socket
  cut, auto-reconnect heal).
- **Tamper-proof.** Every op is Ed25519-signed with the venue key; forged/
  unsigned ops are rejected by the mesh.

### Transport matrix (the mesh core is transport-agnostic)

Each transport just implements `{ onMessage(cb), send(msg) }`:

| Transport | Status | Use |
|---|---|---|
| **LAN TCP** (`meshListen`/`meshDial`, `node:net`) | ✅ built + tested | Door stations / a venue Raspberry-Pi AP with no internet |
| **In-process** (`link`) | ✅ built + tested | Multi-node sim on one box, and the partition tests |
| **WebRTC data channel** | interface-ready | Browser phone-to-phone once peers are introduced (QR/LAN signaling) |
| **Bluetooth (BLE)** | needs native shell | True phone-to-phone with no Wi-Fi at all |

### The honest Bluetooth boundary

A browser **cannot** form a Bluetooth mesh: Web Bluetooth can only act as a
central (it can't advertise as a peripheral) and there's no browser mesh API.
Literal phone-to-phone Bluetooth requires wrapping this web app in a **native
shell** — Capacitor or React Native — and implementing a `BleTransport` against
a native BLE/Nearby plugin. Because the mesh core is transport-agnostic, that
`BleTransport` drops in beside the LAN/WebRTC ones with no changes to the sync
logic. Until then, "always live, no cell tower" is delivered by the **LAN mesh
on venue Wi-Fi + offline crypto passes**, which needs no internet and no towers.

### API ↔ mesh bridge (it's one system, running in the background)

The HTTP API and the mesh are wired together (`src/reduce.mjs`): **every**
mutation — member sign-up, membership purchase, on-the-way, admission, door
decision — is created as a signed mesh op, materialized into this node's SQLite,
and replicated (encrypted) to peer nodes, which materialize it into theirs. The
op-log is the source of truth; each node's SQLite is a convergent view.

This runs as **background infrastructure**: the public app never sees the mesh —
it just talks to whichever node it can reach. Start a node in the mesh with:

```bash
# door A accepts peers
MESH_PORT=9944 NODE_ID=door-A npm start
# door B dials A (and any others)
MESH_PEERS=door-a.local:9944 NODE_ID=door-B npm start
```

Proven by `cluster-test.mjs`: two full nodes with **separate databases** — a
member buys on node A, a different door (node B) verifies their rolling pass and
admits them, and the admission replicates back to A. Both converge.

### Run the tests

```bash
npm run test:mesh       # convergence + partition/heal (in-process)
npm run test:mesh-tcp   # real TCP sockets + auto-reconnect heal
npm run test:encrypted  # wire is ciphertext-only
npm run test:cluster    # two full API nodes: buy on A, admit on B
npm run test:all        # everything (API + mesh + encrypted + cluster + BLE)
```

## Production hardening (not done here)

- Swap the mock OTP for a real SMS/email provider; stop returning `devCode`.
- Replace shared staff codes with per-person provisioned accounts (add an
  owner/admin role that issues them).
- Rotate the venue signing key on a schedule; publish key IDs so old passes can
  be aged out.
- Rate-limit `/auth/*` and `/door/verify`.

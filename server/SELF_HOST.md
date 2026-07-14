# Run HVAS with no cloud — the venue is the server

You don't need a cloud host, a serverless platform, or a monthly bill. The HVAS
backend is zero-dependency Node, so it runs on any device you already have and
members' phones connect to it over the **venue wifi**. On the LAN it's *faster*
than cloud (no round-trip to a datacenter) and it keeps working with **no
internet** — the mesh + offline crypto passes handle the door either way.

## 1. Pick a device to be the server
Anything that runs Node 22+:
- a laptop or mini-PC at the venue (easiest),
- a **Raspberry Pi** (~$35, leave it plugged in),
- even an **old Android phone** via [Termux](https://termux.dev) (`pkg install nodejs`).

## 2. Start it
```bash
cd server
npm run host        # PORT=8787 by default
```
It prints the address to connect to, e.g.:

```
  HVAS is LIVE on this device — the venue is the server.
  On the venue wifi, open the app → Connect to venue →
      http://192.168.1.20:8787
  Staff code: DOOR850   Host code: HOST850
```

Set your codes + receiving handles first (so members can pay you):
```bash
HVAS_STAFF_CODE=yourcode HVAS_HOST_CODE=yourcode \
PAYPAL_ME=hitmanmusicworldwide HVAS_ZELLE=you@email.com \
HVAS_VENUE_NAME="HITMANS VIP After Spot" npm run host
```

## 3. Connect phones (no rebuild)
On each phone, open the app → **Connect to venue** → paste the address (or scan
the venue QR you make from that URL). The app pulls the venue name + PayPal.me +
Zelle from the server automatically — configure once, every device picks it up.

That's it. Members sign in, get their rolling QR pass, network in the top-down
venues, and pay (PayPal instant; Zelle/cash confirmed on the Payments screen) —
all against your own device.

## Two or more door stations
Run the node on each and cluster them so they stay in sync with no coordinator:
```bash
# station A
MESH_PORT=9944 npm run host
# station B (dials A)
MESH_PEERS=192.168.1.20:9944 npm run host
```
Every op (admissions, payments, links, chat) converges across them, and each
keeps working if the link drops.

## Reaching phones that aren't on the venue wifi (optional)
For pre-arrival ("on the way") from anywhere, expose the device without a cloud
host using a free tunnel — the venue device stays the server:
- **Cloudflare Tunnel:** `cloudflared tunnel --url http://localhost:8787`
- **Tailscale:** put the device + phones on your tailnet, connect to its
  Tailscale IP.

Either gives a URL to paste into **Connect to venue**; no hosting bill, no
serverless.

## Why this runs better than cloud
- **Latency:** LAN hop vs. a round-trip to a datacenter.
- **Cost:** $0/month — it's your hardware.
- **Offline:** the door verifies rolling Ed25519 passes with no network at all.
- **Ownership:** the data + the venue signing key never leave your device.

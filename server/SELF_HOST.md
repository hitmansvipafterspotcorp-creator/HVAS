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

## Windows laptop, start to finish (copy-paste, $0)
If your device is a Windows laptop, this is the exact path — self-restarting,
self-updating, and reachable from any phone by the end. Open **PowerShell**
for all of this.

**1. Install Node and Git** (one time):
```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```
Close and reopen PowerShell so both are on PATH.

**2. Get the code:**
```powershell
cd $HOME
git clone https://github.com/hitmansvipafterspotcorp-creator/HVAS.git hvas
cd hvas\server
npm install
```

**3. Set your venue's codes** — create `hvas\server\.env`:
```
HVAS_STAFF_CODE=DOOR850
HVAS_HOST_CODE=HOST850
```
(Pick your own — these are what staff/host type in to unlock their tools.
Full list of optional vars, incl. YOUTUBE_API_KEY / HitKoin, in `.env.example`.)

**4. Run it.** For a normal night, double-click **`start-hvas.bat`** in the
repo root — it opens the backend and the public link in their own windows and
is the thing to use on the 31st. Keep both windows open.

To have the venue also pull, test and deploy new pushes on its own, run Deploy
Keeper instead (see below). It restarts the app if it crashes, cleans up a
checkout somebody has edited by hand, and re-syncs itself if the code will not
start at all:
```powershell
node --env-file=.env deploy-keeper.mjs
```
Leave this window open (minimizing is fine). If the laptop ever gets stuck,
double-click `fix-hvas.bat` — see below.

**5. Stop the laptop from sleeping while it's running:**
Settings → System → Power & battery → Screen and sleep → "When plugged in,
put my device to sleep" → **Never**. If you want to close the lid: Control
Panel → Power Options → "Choose what closing the lid does" → **Do nothing**
(while plugged in).

**6. Make it reachable from any phone, not just your wifi** — Cloudflare
Tunnel (see the full section below for what this does and why it's free):
```powershell
cd $HOME
curl.exe -L -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
```

**Fastest path — no domain, no account, one double-click every time you open
tonight:** run `start-hvas.bat` in the repo root. It starts the backend in
its own window, starts a fresh quick tunnel, prints the public link the
moment it's ready, and opens the app already connected to it — no manual
copy-paste. Downside: the link changes every time you start it (quick
tunnels are anonymous/ephemeral by design), so re-share **Show join QR**
each night. Good enough for most venues; skip straight to step 7.

**Permanent path — same link forever, needs a domain (~$10-12/yr):**
```powershell
.\cloudflared.exe tunnel login
.\cloudflared.exe tunnel create hvas
.\cloudflared.exe tunnel route dns hvas app.yourdomain.com
```
Copy `hvas\server\cloudflared\config.yml.example` to `config.yml` in that same
folder, fill in the tunnel id + `app.yourdomain.com` (Windows paths look like
`C:\Users\you\.cloudflared\<id>.json`), then:
```powershell
.\cloudflared.exe service install --config C:\Users\you\hvas\server\cloudflared\config.yml
```
That runs it as a Windows service from now on — starts on its own, survives
reboots, no window to babysit, and the link/QR never changes.

**7. Play it.** Open the app at
`https://hitmansvipafterspotcorp-creator.github.io/HVAS/` on any phone → on the
very first screen, tap **📡 Connect to venue** near the bottom. There is no
address to type: the panel lists the rooms playing right now by name, and
joining is one tap on yours. If it is not listed yet, **📷 Scan venue QR** —
the owner's screen has the code under My Pass → *Show join QR*.

Both routes pull the venue's real name and payment details and go live on the
same backend — same data, every device.

Typing an address was the old way, and it was removed on purpose: a member who
has joined once never needs a link again. The app remembers the venue by a
permanent id and looks up where it has moved to, so a tunnel that changed
address overnight does not strand anybody. If you are testing on the same wifi
before any of that is set up, the laptop serves the app itself — open
`http://<your laptop's LAN IP>:8787` and the phone is connected by being there.

### The tunnel window watches itself

The window running `start-tunnel.mjs` is a supervisor, not just a launcher. If
cloudflared dies mid-night it restarts it with backoff — and on a quick tunnel
it says plainly that the address people already have is now dead, then prints
the replacement. It also re-checks the public link every minute all night. When
that goes dark it tells you whether the venue itself is down (go look at the
server window) or only the way in from outside is (the door and everyone inside
are fine; nobody new can sign up until it's back).

That last part matters because the failure is otherwise invisible: the people a
dead link hits are the ones who never get inside to complain.

### If the venue laptop gets stuck

Double-click **`fix-hvas.bat`**. It stops everything, saves a copy of anything
that got edited on the laptop into `server\data\clobbered-<date>`, puts the
code files back the way they should be, pulls the latest version, and runs the
full test suite before telling you it's safe. Then double-click
`start-hvas.bat` as normal.

It does not open `server\.env` or `server\data`, so your members, entries,
money and staff codes come through it untouched.

## 2. Start it (other devices — Mac / Linux / Pi / Termux)
```bash
cd server
npm run host        # PORT=8787 by default
```

**Or, so it stays up on its own** — no terminal window to keep open, survives
crashes and power blips, and updates itself when you push new code:
```bash
npm run keeper       # runs host.mjs under the Deploy Keeper (see below)
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

## Make it reachable from anywhere — Cloudflare Tunnel (free, no VPS)
Every member on any network (home wifi, cellular, another city) needs the
SAME thing a venue-wifi phone gets: a URL to paste into **Connect to venue**.
Cloudflare Tunnel gets you a real public `https://` URL without a cloud
server, without opening a port on your router, and without paying anything —
the venue device (the one already running `npm run keeper`) makes an
*outbound* connection to Cloudflare; Cloudflare routes public traffic back
through it. Unlimited tunnels, unlimited requests, genuinely free.

**Quick test (no account, no domain, URL changes every run):**
```bash
cloudflared tunnel --url http://localhost:8787
```
Prints a random `https://something.trycloudflare.com` URL on the spot. Great
for trying this out; not for a QR code that has to keep working.

**Permanent URL (needs a domain on Cloudflare's free DNS — about $10-12/yr,
one-time-ish, not a hosting fee):**
```bash
cloudflared tunnel login                       # opens a browser, pick your domain
cloudflared tunnel create hvas                 # creates a named tunnel, prints its ID
cloudflared tunnel route dns hvas app.yourdomain.com
```
Then point it at the backend with `cloudflared/config.yml` (copy
`cloudflared/config.yml.example`, fill in the tunnel ID from above):
```yaml
tunnel: <the-tunnel-id-just-printed>
credentials-file: /home/you/.cloudflared/<the-tunnel-id>.json
ingress:
  - hostname: app.yourdomain.com
    service: http://localhost:8787
  - service: http_status:404
```
Run it (`cloudflared tunnel run hvas`), or install it as a service so it
survives reboots the same way Deploy Keeper does — either the official
installer:
```bash
sudo cloudflared service install
```
or a manual unit if you'd rather manage it alongside `hvas-keeper`:
```ini
# /etc/systemd/system/hvas-tunnel.service
[Unit]
Description=HVAS Cloudflare Tunnel
After=network.target

[Service]
WorkingDirectory=/home/you/hvas-deploy/server
ExecStart=/usr/local/bin/cloudflared tunnel --config cloudflared/config.yml run hvas
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now hvas-tunnel
```
`https://app.yourdomain.com` now works from any phone, anywhere — paste it
into **Connect to venue** once and it's remembered. Two independent, free
safety nets running side by side: Deploy Keeper keeps the app itself up,
`cloudflared` keeps it reachable.

**Alternative:** Tailscale — put the device + your members' phones on one
tailnet, connect to its Tailscale IP. Simpler for a small, known group of
devices; Cloudflare Tunnel is the better fit for "any member, any phone,
no app to install on their end."

## Deploy Keeper — your own Coolify, built in

`deploy-keeper.mjs` is a small, zero-dependency supervisor: it runs the
backend as a child process, restarts it if it ever crashes, and watches your
deploy branch for new pushes. When one lands, it pulls it into a **dedicated
checkout**, runs the real test suite against it, and only flips traffic to
the new code if every test passes — otherwise it rolls the checkout back and
keeps the last good version running. No Docker, no external PaaS account,
no separate service to configure.

```bash
git clone <your fork> hvas-deploy && cd hvas-deploy/server   # a checkout just for this
npm install
KEEPER_BRANCH=main npm run keeper
```

Useful env vars (all optional):
```bash
KEEPER_POLL_SECONDS=120        # how often to check for new commits
KEEPER_NOTIFY_WEBHOOK=https://ntfy.sh/your-topic   # POSTed on crash/deploy events
```

Live status (pid, current commit, restart count, crash streak, last event) is
written to `server/data/keeper-status.json`.

**If a source file on the venue machine gets edited by hand**, the keeper does
not stop deploying. It copies the edited files into
`server/data/clobbered-<timestamp>/`, discards the edits, and carries on. It
only ever touches files git is tracking — `server/.env`, `server/data/` and
`server/venue-key.json` are ignored files, so members, entries, money and your
staff codes are never in its path.

**If the app can't start at all**, five crashes in a row (`KEEPER_HEAL_AFTER_CRASHES`)
make the keeper clean the checkout and force it back onto `origin/<branch>`,
then let the app try again. If the checkout is already clean and current, it
says so — `heal-exhausted` — instead of healing in circles, because at that
point the committed code itself is the problem and only a person can fix it.

**Run it forever, even across reboots**, with systemd (Linux — mini-PC, Pi, or
a $5/mo VPS all work the same way):
```ini
# /etc/systemd/system/hvas-keeper.service
[Unit]
Description=HVAS Deploy Keeper
After=network.target

[Service]
WorkingDirectory=/home/you/hvas-deploy/server
ExecStart=/usr/bin/node deploy-keeper.mjs
Restart=always
Environment=KEEPER_BRANCH=main

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now hvas-keeper
```
Systemd restarts the *keeper* if it ever dies; the keeper restarts the *app*
if it ever dies — two independent safety nets, no monthly fee either way.

## Why this runs better than cloud
- **Latency:** LAN hop vs. a round-trip to a datacenter.
- **Cost:** $0/month — it's your hardware.
- **Offline:** the door verifies rolling Ed25519 passes with no network at all.
- **Ownership:** the data + the venue signing key never leave your device.

# Lip Sync Bingo — Store Notes

**What this is:** the perfected Lip Sync Bingo game for HITMANS VIP AFTER SPOT CORP,
packaged as a PWA (Progressive Web App) in this folder. It is a plain
HTML/CSS/JavaScript web app — no build step, no server code, no API keys,
no accounts, $0 to run. It replaces the two half-finished versions in the
HVAS repo (this folder does not change that repo).

## What's inside

| File | What it does |
|---|---|
| `index.html` | The whole app shell — home, lobby, game, stage, scores, hotspot pairing, deck builder |
| `style.css` | Purple/gold VIP theme |
| `decks.js` | The 110-song pool (Korey's original 39 + the 24 starter-card songs + 50 era records added Nov 19, 2026) and 15 built-in decks |
| `js/core.js` | Pure game logic: seeded cards, win rules, host claim verification, vote tally |
| `js/net.js` | Networking: PeerJS online rooms + server-free hotspot WebRTC pairing (QR / copy-paste) |
| `js/app.js` | Screens + the host-authoritative game controller and guest client |
| `manifest.json` + `service-worker.js` | PWA packaging — installable, runs offline after first load |
| `icons/` | App icons (PNG 192/512 + SVG), gold mic on purple |
| `tests/test-core.js` | Node logic tests — run `node tests/test-core.js` |

## How the game works (plain language)

- The **host's phone runs the game**. It deals every player's card from a
  secret seed, calls the songs, and checks everything.
- **You can't cheat it:** a square only counts if its song was actually
  called, and when somebody yells BINGO the host's phone re-checks their
  card against every song called so far before a winner is announced.
- **Rounds:** Round 1 = one line, Round 2 = two lines, Round 3 = full card.
  Marks carry over between rounds.
- **Perform squares (🎤):** five on every card. When a perform song is
  called, that player takes the stage — the song's YouTube video plays
  for the whole room, they get 30 seconds, then everybody votes
  🔥 FIRE (3 pts) / 👏 SOLID (2) / 😐 MID (1). Round winners also score
  (50 / 100 / 150).
- **Online mode:** the host gets a 4-letter room code; players type it in.
  Uses the free public PeerJS broker — no account, no key.
- **Hotspot mode (no internet):** players join the host's Android hotspot,
  then pair with QR codes (or copy/paste code text). After pairing, the
  game runs phone-to-phone — no internet, no servers at all.
- **Solo mode** is practice only — there are no fake CPU players anywhere.
- **Decks:** 15 built in (After Spot Starter, Winners Circle, Hip-Hop Heat,
  R&B Ladies Night, Old School Hip Hop, Old School Classics, 90s Hip Hop,
  Crunk Night, Verzuz Night, Queens of Hip Hop, Cookout Classics, Slow Jamz,
  FAMU Rattlers, FSU Seminoles, TCC Eagles) plus a
  deck builder in the app — name a deck, pick any 24+ songs from the pool,
  it saves on the phone and plays like any other deck.
- **YouTube:** 73 songs have verified video IDs (the 24 starter songs plus
  49 of the 50 era records added Nov 19, 2026) and play inside the app.
  The other 37 pool songs show a "Find on YouTube" button
  instead of a guessed ID.

## Install it on Android (PWA — works today, $0)

1. Put this folder on any HTTPS web host (for example GitHub Pages, where
   the HVAS site already deploys) — or open it once from a local server.
2. Open the page in Chrome on the phone.
3. Menu (⋮) → **Add to Home screen / Install app**.
4. Done — it opens full-screen like a real app, and after that first load
   it works **offline**, which is what makes hotspot mode possible
   anywhere.

> First load needs internet (or the local server) once, so the app and
> its libraries can cache. After that, hotspot games need nothing.

## Putting it on Google Play (the remaining steps)

A PWA can't go on the Play Store by itself — it needs a thin Android
wrapper. The standard $0-tooling route is **Capacitor**:

1. **Google Play developer account** — one-time **$25** fee, paid by the
   account holder (this is the only hard cost; it is Google's, not ours).
   Sign up at play.google.com/console with the HITMANS VIP AFTER SPOT
   Google account.
2. On a computer with Node.js installed:
   - `npm init @capacitor/app` (name: Lip Sync Bingo, id suggestion:
     `corp.hvfafterspot.lipsyncbingo`)
   - Copy this folder's files into the Capacitor project's `www/` folder
     (Capacitor calls it the web dir) — no code changes needed.
   - `npx cap add android`, then `npx cap sync`.
3. Open the generated Android project in **Android Studio** (free),
   confirm the app name, icon (use `icons/icon-512.png`), and version.
4. Build → **Generate Signed Bundle/APK** → create the upload keystore
   (KEEP THIS FILE + ITS PASSWORD SAFE — losing it means you can never
   update the app) → build an **Android App Bundle (.aab)**.
5. In Play Console: create the app, upload the .aab, fill the listing
   (title, short + full description, screenshots from the phone, the
   icon), set content rating (the questionnaire — music party game,
   no ads, no purchases), privacy policy URL (a simple page stating the
   app collects no data — true for this app), and target audience.
6. Roll out to **Internal testing** first, install it from the Play link
   on your own phone, play a full game, then promote to Production.
   Google reviews new apps — expect a few days.

Notes:
- The app asks for **camera** permission only (QR scanning + the optional
  on-stage camera preview). The preview never leaves the phone; say so in
  the Data Safety section: "No data collected, no data shared."
- Because playback uses YouTube embeds, keep the store description to
  "plays the song's official video on YouTube" — don't claim the app
  hosts the music.

## Known limits (honest list)

- PeerJS's free public broker is a community service; if it is ever down,
  hotspot mode still works (it uses nothing external).
- Hotspot pairing is one phone at a time (make invite → player replies →
  pair). A room of 6 pairs in a few minutes.
- Hotspot invite/reply codes are long — QR is the smooth path; the text
  codes are the fallback when a camera won't scan.
- If a guest's phone refreshes mid-game there is no auto-rejoin; they
  re-pair/re-join and the host can deal them back in (they'll get a fresh
  card). Scores for a dropped player stay on the host's board.
- "Old School Classics" is built from the pool Korey already had: 12 true
  pre-2011 classics plus the oldest-feeling 2014–2017 cuts to reach 24.
  Add more classics later with the deck builder.
- "Old School Hip Hop" was rebuilt Nov 19, 2026 on the expanded pool:
  all 24 records on it are 1986–1998 (Run-DMC and the Beastie Boys up
  front, then the early-90s pillars).
- (Resolved in v12) Every song in the pool — all 110 — now carries a
  YouTube ID verified through YouTube's oEmbed endpoint, including
  T.I. - What You Know (from T.I.'s own channel). One older ID for
  Aaliyah - Rock The Boat turned out to be embed-blocked and was
  replaced with the official Blackground Records 2.0 upload.

## v12 — the TikTok stage (Nov 20, 2026)

Korey's rules, built exactly as ordered:

- **Mic squares are earned on stage, never tapped.** When a mic song is
  called, its holders get a 10-second claim window. Claim it and you
  perform — live camera on every screen in the room, TikTok-style —
  while the track plays for one full minute (60-second stage). Pass or
  decline and the square is gone; a plain tap on a mic cell is refused
  by the host.
- **Battles:** if two players hold the same called mic song and both
  claim it, it's a battle — both live side by side on the same track.
  The room picks a winner (each pick 3 pts, winner +10 bonus) and the
  winner takes the square; the loser doesn't get it. A tie gives the
  square to nobody. If one battler declines mid-battle, the other wins
  the square by walkover.
- **Live video:** online rooms use PeerJS media calls; hotspot rooms
  use two video slots pre-negotiated at pairing time (no mid-game
  renegotiation — QR pairing can't redo signaling), with the host
  forwarding each performer's track to the other phones. Video only —
  no audio channel, so there's never feedback; the track itself plays
  on every phone from the song's verified YouTube embed.
- **Verification:** 24/24 engine tests, and a 55-check live run
  (host + 2 players + audience) covering claim/decline/battle/
  walkover/anti-cheat plus the full v11 regression set — all passed
  Nov 20, 2026.

## v13 — the Royal Stage (Nov 20, 2026)

Korey's order: nothing basic, nothing old or corny — a stage that looks
like nothing people have seen before, delivered for his 2 PM
presentation. Same rules and engine as v12; the whole stage was
re-dressed:

- **Living stage:** animated aurora backdrop with a twinkling
  starfield, sweeping spotlight beams and a glowing stage floor.
- **Gold-foil titles** with a shine sweep; buttons carry a gold sheen;
  panels are frosted violet glass.
- **Mic cells** wear a rotating ring of light; deck covers shimmer.
- **Battle stage:** performer tiles get animated gold-pink-teal
  gradient borders and red LIVE pills; a big pulsing VS badge; a
  96px gold timer ring counts the minute; equalizer bars dance while
  the track plays.
- **Battle voting:** a tug-of-war bar (pink vs gold-teal) with names
  and live counts, fed by the host's vote-count broadcast as each
  vote lands.
- **Result:** the winner's tile glows gold and takes the crown; the
  loser's tile dims to gray. Confetti over the stage.
- **Fix:** a global `[hidden] { display: none !important }` rule —
  component display styles were overriding the hidden attribute, so
  controls could show when they should be gone.
- **Verification:** 24/24 engine tests + the full 55-check live run
  re-passed on the final build, plus a dedicated hidden-state probe
  in both directions. Screenshots of home, board, claim, battle,
  vote bar and result were reviewed frame by frame.
- Respects prefers-reduced-motion.

## v14 — NOIR GOLD (Nov 20, 2026)
Korey rejected the v13 Royal Stage look ("corny… old") and picked all three
directions combined. v14 is ONE clean stylesheet written from scratch (the
old file had seven theme passes stacked on each other — that layering was
the mud). System: true-black casino luxury — gold reserved for money
moments (titles, claim/win buttons, marked squares, winner states); neon
arcade energy reserved for live action — pink = mic squares + battle side
A, cyan = called squares + battle side B, red = LIVE pills; clean modern
flat structure — solid #101013 panels, 1px borders, no glass, no blur, no
aurora, no starfield, no foil sweep. The purple neon header banner image
is out — replaced with a black-and-gold text wordmark (HITMANS VIP AFTER
SPOT / LIP SYNC BINGO); the animated crest stays (corp brand mark).
Winner crown moved inside the tile so it never clips. Service worker
cache bumped to lsb-shell-v13 / lsb-cdn-v13. Mechanics unchanged from v12:
verified 24/24 engine tests + full live check suite (ALL CHECKS PASSED).

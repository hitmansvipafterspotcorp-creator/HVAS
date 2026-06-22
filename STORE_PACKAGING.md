# Shipping HITGEAR OS to App Stores

This game is a **PWA** (installable web app). It is already store-packageable.
This doc covers the three realistic targets, easiest first.

> ⚠️ **PlayStation / PSN is NOT possible from this codebase.** Sony only accepts
> native titles built on the official PlayStation SDK (C/C++) by a licensed
> developer. A web/Canvas game cannot be submitted. PS would require a full
> rebuild in Unity or Unreal (the art, characters, venues and design carry over;
> the code is rewritten). Everything below is for the platforms a PWA *can* ship to.

---

## Live URL

```
https://hitmansvipafterspotcorp-creator.github.io/hvas/
```

Open it on a phone → browser menu → **Add to Home Screen** to install instantly
with the HITMANS VIP icon. No store needed for this path.

---

## 1. Xbox (Microsoft Store) — easiest "console" target  ✅

Microsoft accepts PWAs directly. Use **PWABuilder**.

1. Go to **https://www.pwabuilder.com**
2. Paste the live URL above and run the report (manifest + service worker +
   icons + screenshots are all already in place → expect a high score).
3. Click **Package For Stores → Windows**.
4. Download the generated **`.msixbundle`** + the test `.cer`.
5. Create a one-time **Microsoft Partner Center** account (~$19 individual),
   reserve the app name, upload the bundle, fill the listing, submit.

PWABuilder's Windows package runs the same PWA inside the Edge WebView, so it
behaves identically to the live site, including offline play.

---

## 2. Google Play (Android) — TWA  ✅

Two ways:

### A) PWABuilder (no local tooling)
1. PWABuilder → paste URL → **Package For Stores → Android**.
2. Download the **`.aab`** (App Bundle) + the signing info / `assetlinks.json`
   that PWABuilder generates.
3. Create a **Google Play Console** account (one-time $25), upload the `.aab`.

### B) Bubblewrap (CLI, uses `twa-manifest.json` in this repo)
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest=https://hitmansvipafterspotcorp-creator.github.io/hvas/manifest.webmanifest
# (or point it at the twa-manifest.json in this repo)
bubblewrap build      # produces app-release-bundle.aab + signing key
```

### ⚠️ The one catch: Digital Asset Links
A TWA with **no browser address bar** must serve
`/.well-known/assetlinks.json` at the **domain root**. `github.io` is a shared
domain whose root you don't control, so:

- **Recommended:** put the game on your **own custom domain**
  (e.g. `play.hitmansvip.com` → CNAME to GitHub Pages), drop the generated
  `assetlinks.json` at its root, and update `host`/URLs in `twa-manifest.json`.
  Result: clean fullscreen app, no URL bar.
- **Without a custom domain:** the app still builds and installs, but Chrome
  shows a thin address bar (unverified link). Fine for testing / internal track.

---

## 3. iOS (App Store)

Apple does not accept raw PWAs. Wrap with **Capacitor**:
```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/ios
npx cap init "HITGEAR OS" com.hitmansvip.afterspot --web-dir=.
npx cap add ios
npx cap open ios   # build & submit in Xcode (needs Apple Developer, $99/yr)
```
The whole repo is the web root (`--web-dir=.`), so no build step is required.

---

## Assets already in place for store review
- `manifest.webmanifest` — full metadata, `id`, scope, categories
- `icons/` — 192 / 512 / 512-maskable / 1024 PNGs (from the HITMANS VIP art)
- `screenshots/` — 1280×720 wide screenshots (real in-game venues)
- `service-worker.js` — offline-capable, relative paths (works at /hvas/ subpath)

## Before you submit (any store)
- Replace the placeholder `packageId` (`com.hitmansvip.afterspot`) if you want a
  different reverse-domain id — **it can never change after first publish**.
- Capture a few real **gameplay** screenshots for the store listing (the manifest
  ones are venue art; stores want shots of actual play).
- Write a short store description + privacy policy URL (required by Google/Apple).

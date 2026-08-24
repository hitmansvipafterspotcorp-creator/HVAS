// Keeping every member's app current, without anybody being told to do
// anything.
//
// The app is installed to home screens. That is the whole problem: an installed
// PWA is not a tab somebody refreshes. Android and iOS keep the window alive and
// RESUME it when the icon is tapped, so the document — and the JavaScript in it
// — can be days old while the phone is online the entire time. There is no
// reload button on a home-screen app. A member has no way to ask for the new
// build and no way to know they are missing one.
//
// So the app checks for itself:
//   • when it starts
//   • every time it comes back to the foreground
//   • when the network comes back
//   • every few minutes while it sits open
//
// and when the build it is running is not the build that is published, it
// reloads — at a moment that costs the member nothing.
//
// That last part is the reason this is not three lines. Reloading during a
// performance destroys a take that cannot be redone; reloading mid-round drops
// somebody out of a game the room is watching. So anything that would be
// ruined by a reload holds it off, and the update lands the moment the hold
// clears.

import { useEffect, useRef, useState } from 'react';

/** The build this code was compiled from. Stamped by vite.config.js. */
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

// ── Holds ──────────────────────────────────────────────────────────────────
// A count, not a boolean: two things can want the app to stay put at once (a
// live round AND a performance inside it), and the first one to finish must not
// speak for the other.
let holds = 0;
const holdListeners = new Set();

/** Hold off reloads until the returned function is called. */
export function holdUpdates() {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;         // releasing twice would let a reload through
    released = true;
    holds -= 1;
    if (holds === 0) for (const fn of holdListeners) fn();
  };
}

export const updatesHeld = () => holds > 0;

// Reachable from the page on purpose. The browser suite has to be able to take
// a hold the way a recording screen does — and asserting that the app does NOT
// reload mid-take matters as much as asserting that it does reload otherwise.
// It is also the seam for anything added later that must not be interrupted.
if (typeof window !== 'undefined') window.__hvasHoldUpdates = holdUpdates;

/** Hold reloads for as long as `active` is true. */
export function useHoldUpdates(active) {
  useEffect(() => {
    if (!active) return undefined;
    return holdUpdates();
  }, [active]);
}

// ── Checking ───────────────────────────────────────────────────────────────
const CHECK_EVERY_MS = 4 * 60 * 1000;

/**
 * Is a different build published than the one running?
 *
 * Cache-busted twice over, because there are two caches between here and the
 * file: `no-store` keeps the browser from answering, and the timestamp keeps
 * the CDN from answering — GitHub Pages holds files for ten minutes, which
 * would otherwise be ten minutes of the app being told it is current.
 */
async function publishedBuild() {
  const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`version check failed: ${res.status}`);
  const body = await res.json();
  return typeof body?.build === 'string' ? body.build : null;
}

/**
 * Watches for a new build and applies it when it is safe to.
 *
 * Returns { ready, apply, BUILD_ID } — `ready` is only ever true when a new
 * build is waiting AND something is holding the reload off, which is the one
 * case a human needs to be offered the choice.
 */
export function useAppUpdate() {
  const [ready, setReady] = useState(false);
  const pending = useRef(false);      // a new build is out there
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let stopped = false;

    // The reload itself. Guarded so that a check firing twice — foregrounding
    // and the interval landing together — cannot reload a reloading page.
    let reloading = false;
    const applyNow = () => {
      if (reloading || stopped) return;
      reloading = true;
      // Straight to the network, no history entry: the point is to stop being
      // the old build, and going "back" to it afterwards makes no sense.
      window.location.reload();
    };

    const applyWhenSafe = () => {
      if (!pending.current) return;
      if (updatesHeld()) { setReady(true); return; }

      // Fresh out of the gate — nothing to lose, so take it immediately and the
      // member never sees a stale screen at all.
      if (Date.now() - startedAt.current < 10000) { applyNow(); return; }

      // Otherwise wait for a natural seam: the app going to the background and
      // coming back is a moment where a reload is indistinguishable from the
      // app simply opening. Until then, offer it.
      if (document.visibilityState === 'hidden') { applyNow(); return; }
      setReady(true);
    };

    const check = async () => {
      if (stopped || reloading) return;
      // Ask the browser to look for a new worker too. Without this an installed
      // app can go a full day before it thinks to check.
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        reg?.update?.();
      } catch { /* no worker, or the browser refused — the version check still stands */ }

      try {
        const published = await publishedBuild();
        if (!published || published === BUILD_ID) return;
        pending.current = true;
        applyWhenSafe();
      } catch { /* offline or the file is briefly missing mid-deploy — try again later */ }
    };

    // Every seam worth checking at.
    const onVisible = () => { if (document.visibilityState === 'visible') { applyWhenSafe(); check(); } };
    const onFocus = () => { applyWhenSafe(); check(); };
    const onOnline = () => check();
    // The worker telling us a deploy landed — faster than waiting for a poll.
    const onSwMessage = (e) => {
      if (e.data?.type !== 'hvas-updated') return;
      pending.current = true;
      applyWhenSafe();
    };
    // A hold clearing is the moment a deferred update becomes safe.
    const onHoldClear = () => applyWhenSafe();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    navigator.serviceWorker?.addEventListener?.('message', onSwMessage);
    holdListeners.add(onHoldClear);
    const timer = setInterval(check, CHECK_EVERY_MS);
    check();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
      holdListeners.delete(onHoldClear);
      clearInterval(timer);
    };
  }, []);

  return { ready, apply: () => window.location.reload(), build: BUILD_ID };
}

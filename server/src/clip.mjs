// Where to cut a song, and for how long.
//
// A lip sync performance runs exactly as long as the clip that plays — nobody
// sets a duration by hand, and there is no fixed 30-second timer. The clip is
// the verse tail into the hook, because that is the part of a record a room
// knows and the part a performer can actually carry.
//
// These numbers live here, alone, because two places need them and they must
// not drift: the venue backend (which resolves a real video and hands the
// window to every phone) and Solo vs CPU (which has no backend at all, reads
// the duration off its own player, and has to arrive at the same window or
// solo would be practising a different game).
//
// server/gen-client-decks.mjs copies CLIP_RULE into the app bundle, and
// deck-sync-test.mjs fails the deploy if that copy goes stale.

export const CLIP_RULE = {
  minStart: 12,        // never open on the very first seconds
  startPct: 0.12,      // ...but on a long record, clear proportionally more intro
  minSeconds: 40,      // short enough to hold a room
  maxSeconds: 75,      // long enough to be a performance, not a snippet
  lengthPct: 0.40,     // the share of the record a clip is allowed to take
  tailGuard: 2,        // stop before the very end, so it never runs off
  floorSeconds: 20,    // a clip shorter than this is not worth performing
  runUp: 18,           // verse to get set in, when the hook's position is known
  shortTrack: 30,      // under this, treat the length as unknown
};

/** The window to play when nothing is known about the song but its length. */
export const clipWindowFor = (durationSec, fallbackSeconds) => {
  const R = CLIP_RULE;
  const d = Number(durationSec) || 0;
  // Unknown length: fall back to the shipped performance window, from the top.
  if (d < R.shortTrack) return { start: 0, seconds: Math.round(fallbackSeconds), estimated: true };
  const start = Math.max(R.minStart, Math.round(d * R.startPct));
  const seconds = Math.min(R.maxSeconds, Math.max(R.minSeconds, Math.round(d * R.lengthPct)));
  const capped = Math.min(seconds, Math.max(R.floorSeconds, d - start - R.tailGuard));
  return { start, seconds: capped, estimated: false };
};

/** The window when the hook's position IS known — back up into the verse so the
 *  performer gets a run-up, then carry through the hook. */
export const windowAroundHook = (hookAt, durationSec) => {
  const R = CLIP_RULE;
  const d = Number(durationSec) || 0;
  const start = Math.max(0, Math.round(hookAt) - R.runUp);
  let seconds = Math.min(R.maxSeconds, Math.max(R.minSeconds, Math.round((d || 210) * R.lengthPct)));
  if (d) seconds = Math.min(seconds, Math.max(R.floorSeconds, d - start - R.tailGuard));
  return { start, seconds };
};

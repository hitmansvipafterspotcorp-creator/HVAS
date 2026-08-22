// One deck list, two places that need it.
//
// The venue backend owns the decks (server/src/decks.mjs) — it deals the cards
// and runs the calls. But Solo vs CPU runs with no backend at all, on a phone
// that may have no signal, so it cannot ask anybody what is in a deck. It needs
// the same data in the bundle.
//
// Copying by hand guarantees drift: someone adds a themed deck for the venue,
// solo silently keeps playing last month's list, and nothing fails. So the
// client copy is generated from the server's, checked in, and a gate test
// re-runs this and fails if the checked-in copy no longer matches.
//
//   node gen-client-decks.mjs          write the client copy
//   node gen-client-decks.mjs --check  fail if it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINGO_DECKS, DEFAULT_DECK_ID } from './src/decks.mjs';
import { CLIP_RULE } from './src/clip.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../hitmans_vip_membership_app/src/decks.generated.js');

// Only what a card needs. The server keeps genre/era/energy for its own song
// picking; shipping them would bloat the bundle for no gain on a phone.
// videoId rides along because Solo has no backend to resolve a song with. It
// used to hand the IFrame player a search query instead, which YouTube removed
// in 2020 — so solo played silence. An id needs no key and no quota, which also
// means an unlimited number of people can play at once without sharing a search
// budget. Filled in by resolve-deck-videos.mjs.
const trim = (i) => ({ id: i.id, artist: i.artist, song: i.song, type: i.type,
  ...(i.mood ? { mood: i.mood } : {}), ...(i.videoId ? { videoId: i.videoId } : {}) });

const decks = Object.fromEntries(Object.entries(BINGO_DECKS).map(([id, d]) => [id, {
  name: d.name, description: d.description, items: d.items.map(trim),
}]));

export const render = () => `// GENERATED — do not edit.
//
// Written by server/gen-client-decks.mjs from server/src/decks.mjs, which is
// the one source of truth for what a deck contains. Edit that file and re-run
// the generator; editing this one is undone by the next run, and the deck-sync
// gate test will fail in the meantime.
//
// This exists because Solo vs CPU has no backend to ask. The venue deals cards
// server-side; solo deals them here, from exactly the same songs, so practising
// alone teaches the deck the room actually plays.

export const DECKS = ${JSON.stringify(decks, null, 2)};

export const DEFAULT_DECK_ID = ${JSON.stringify(DEFAULT_DECK_ID)};

// Where to cut a song, and for how long — copied from server/src/clip.mjs so
// solo arrives at the same window the venue would. A performance runs exactly
// as long as its clip, on both sides.
export const CLIP_RULE = ${JSON.stringify(CLIP_RULE, null, 2)};

/** The window to play, given a real track length in seconds. */
export function clipWindowFor(durationSec, fallbackSeconds) {
  const R = CLIP_RULE;
  const d = Number(durationSec) || 0;
  if (d < R.shortTrack) return { start: 0, seconds: Math.round(fallbackSeconds), estimated: true };
  const start = Math.max(R.minStart, Math.round(d * R.startPct));
  const seconds = Math.min(R.maxSeconds, Math.max(R.minSeconds, Math.round(d * R.lengthPct)));
  const capped = Math.min(seconds, Math.max(R.floorSeconds, d - start - R.tailGuard));
  return { start, seconds: capped, estimated: false };
}
/** Every deck as a pickable list — id, name, blurb and how many squares deep. */
export const deckList = () => Object.entries(DECKS).map(([id, d]) => ({ id, name: d.name, description: d.description, count: d.items.length }));
export const deckById = (id) => DECKS[id] || DECKS[DEFAULT_DECK_ID];
`;

// Only act when run as a command. deck-sync-test.mjs imports `render` from
// here to compare against the checked-in copy — if importing this file also
// WROTE that copy, the staleness check would regenerate the thing it is
// checking and could never fail. Which is the one job it has.
const runDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!runDirectly) { /* imported for `render` only */ }
else if (process.argv.includes('--check')) {
  const next = render();
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== next) {
    console.error('The client deck copy is out of date.\n\n  cd server && node gen-client-decks.mjs\n');
    process.exit(1);
  }
  console.log('Client decks are in sync.');
} else {
  const next = render();
  writeFileSync(OUT, next);
  console.log(`Wrote ${OUT}\n${Object.keys(decks).length} decks, ${Object.values(decks).reduce((n, d) => n + d.items.length, 0)} squares.`);
}

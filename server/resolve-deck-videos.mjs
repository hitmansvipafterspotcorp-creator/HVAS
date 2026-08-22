// Find a YouTube video id for every song in the decks, once, here.
//
//   node resolve-deck-videos.mjs                 fill in what today's quota allows
//   node resolve-deck-videos.mjs --deck trap     just one deck
//   node resolve-deck-videos.mjs --budget 20     stop after 20 lookups
//   node resolve-deck-videos.mjs --dry           show what it would do
//
// WHY: Solo vs CPU has no backend, so it cannot ask anyone what to play. It
// used to hand the IFrame player a search query and let YouTube find the track.
// YouTube removed search from that API in November 2020 — silently, no error —
// so solo played nothing at all. Playing by ID needs no key and no quota; only
// finding the ID costs, and that is what this does, one time, on your machine.
//
// QUOTA: a search costs 100 units and a Google project gets 10,000 a day. That
// is 100 songs a day, and the decks hold more than that — so this is resumable.
// It only looks up ids that are missing, writes after every single one, and
// stops cleanly when the quota is gone. Run it again tomorrow, or pass --deck
// to do the ones you actually play first. The key stays on this machine; it is
// never shipped to a phone.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINGO_DECKS } from './src/decks.mjs';
import { DECK_VIDEO_IDS } from './src/deck-videos.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'src/deck-videos.mjs');

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

// The venue's key, from the same place the backend reads it.
let KEY = process.env.YOUTUBE_API_KEY || '';
if (!KEY) {
  try {
    const env = readFileSync(resolve(__dirname, '.env'), 'utf8');
    KEY = (env.match(/^\s*YOUTUBE_API_KEY\s*=\s*(.+)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
  } catch { /* no .env — fall through to the message below */ }
}
if (!KEY && !has('dry')) {
  console.log('No YouTube API key found.\n');
  console.log('Put it in server/.env as:');
  console.log('  YOUTUBE_API_KEY=your-key-here\n');
  console.log('It is only used here, on this machine, to look ids up once.');
  console.log('It is never built into the app and never reaches a phone.');
  process.exit(1);
}

const onlyDeck = arg('deck');
const budget = Number(arg('budget', '95'));     // a little under the 100/day a default quota allows

// Every square, deduplicated: the same song appears in more than one deck and
// there is no reason to pay for it twice.
const wanted = new Map();
for (const [deckId, deck] of Object.entries(BINGO_DECKS)) {
  if (onlyDeck && deckId !== onlyDeck) continue;
  for (const item of deck.items) {
    if (DECK_VIDEO_IDS[item.id]) continue;               // already known — never re-paid for
    if (!wanted.has(item.id)) wanted.set(item.id, { ...item, decks: [deckId] });
    else wanted.get(item.id).decks.push(deckId);
  }
}

const known = Object.keys(DECK_VIDEO_IDS).length;
console.log(`\n  ${known} songs already have an id`);
console.log(`  ${wanted.size} still need one${onlyDeck ? ` in "${onlyDeck}"` : ''}`);
if (!wanted.size) { console.log('\nNothing to do — every song has a video.\n'); process.exit(0); }
console.log(`  doing up to ${budget} now (each costs 100 of your 10,000 daily units)\n`);

if (has('dry')) {
  for (const [, it] of [...wanted].slice(0, budget)) console.log(`   ${it.artist} — ${it.song}`);
  console.log(`\n(dry run — nothing looked up, nothing written)\n`);
  process.exit(0);
}

const write = (map) => {
  const head = readFileSync(OUT, 'utf8').split('export const DECK_VIDEO_IDS')[0];
  const body = Object.keys(map).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n');
  writeFileSync(OUT, `${head}export const DECK_VIDEO_IDS = {\n${body}\n};\n`);
};

const found = { ...DECK_VIDEO_IDS };
let used = 0, ok = 0, missed = 0;

for (const [id, item] of wanted) {
  if (used >= budget) break;
  const q = `${item.artist} ${item.song}`;
  const url = 'https://www.googleapis.com/youtube/v3/search'
    + '?part=snippet&type=video&maxResults=1&videoEmbeddable=true&videoSyndicated=true'
    + `&q=${encodeURIComponent(q)}&key=${KEY}`;
  used += 1;
  let res;
  try { res = await fetch(url, { signal: AbortSignal.timeout(15000) }); }
  catch (e) { console.log(`   ✗ ${q} — ${e.message}`); missed += 1; continue; }

  if (res.status === 403) {
    const why = await res.text().catch(() => '');
    // Out of quota is the expected end of a run, not a failure. Everything
    // found so far is already on disk.
    console.log(/quota/i.test(why)
      ? `\n  Daily quota is gone — that is normal. ${ok} saved this run.\n  Run this again tomorrow to carry on.\n`
      : `\n  YouTube refused the key (403). Check it is a YouTube Data API v3 key\n  with no HTTP-referrer restriction (this runs from a terminal, not a page).\n`);
    break;
  }
  if (!res.ok) { console.log(`   ✗ ${q} — YouTube answered ${res.status}`); missed += 1; continue; }

  const json = await res.json().catch(() => ({}));
  const vid = json?.items?.[0]?.id?.videoId;
  const title = json?.items?.[0]?.snippet?.title || '';
  if (!vid) { console.log(`   ✗ ${q} — nothing embeddable came back`); missed += 1; continue; }

  found[id] = vid;
  ok += 1;
  write(found);                                    // after every one, so a crash costs nothing
  console.log(`   ✓ ${item.artist} — ${item.song}  →  ${vid}  ${title.slice(0, 46)}`);
}

const left = wanted.size - ok;
console.log(`\n  ${ok} resolved, ${missed} could not be matched, ${left} still to do.`);
console.log(`  Written to src/deck-videos.mjs`);
if (ok) console.log(`\n  Now run:  node gen-client-decks.mjs\n  then commit both files so the app ships with them.`);
if (left > 0) console.log(`\n  ${left} left — run this again tomorrow, or pass --deck <id> to prioritise one.`);
console.log('');

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
import { videoIdsFrom, searchQuery, looksRight } from './src/yt-search.mjs';

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
console.log(`  up to ${budget} via the API (100 units each); the rest cost nothing\n`);

if (has('dry')) {
  for (const [, it] of [...wanted].slice(0, budget)) console.log(`   ${it.artist} — ${it.song}`);
  console.log(`\n(dry run — nothing looked up, nothing written)\n`);
  process.exit(0);
}

// ── Finding an id without spending quota ────────────────────────────────────
//
// search.list costs 100 units and a project gets 10,000 a day, so the full deck
// list is four days of quota. That is not a workable answer for the one thing
// the game is built on, so there is a second path.
//
// It reads the same public search page a browser gets and takes the first
// result's id out of the ytInitialData blob the page ships with. No key, no
// quota, no account. The backend already reads public watch pages this way for
// hook detection, so the venue is not doing anything here it was not doing
// already — and the id is only ever used to embed the video in YouTube's own
// player, which serves YouTube's ads and counts YouTube's views.
//
// It is HTML, so it can change shape without warning. Every id is checked
// through oEmbed afterwards, which is a documented public endpoint: it confirms
// the video exists AND that it is embeddable, and it hands back the real title
// so a bad match is visible rather than silent.
// The CONSENT cookie matters: without it YouTube bounces some regions around a
// consent interstitial until undici gives up with "redirect count exceeded",
// which is what ended the first real run at song 11 of 369.
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
             'Accept-Language': 'en-US,en;q=0.9',
             Cookie: 'CONSENT=YES+cb; SOCS=CAI' };

/** One request, with a second go at the transient failures. Never throws. */
const get = async (url, ms = 20000) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(ms) });
      return { ok: r.ok, status: r.status, res: r };
    } catch (e) {
      if (attempt) return { ok: false, status: 0, error: e?.cause?.message || e.message };
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  return { ok: false, status: 0, error: 'unreachable' };
};

const oembed = async (videoId) => {
  const u = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const r = await get(u, 12000);
  if (!r.ok) return null;                         // 401/404 here means not embeddable
  try { const j = await r.res.json(); return { title: j.title || '', author: j.author_name || '' }; }
  catch { return null; }
};

const lookupFree = async (q) => {
  // gl/hl pin the result set to one region and language, so the same run gives
  // the same answers wherever the venue laptop happens to be.
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&gl=US&hl=en`;
  const r = await get(url);
  if (!r.ok) return { error: r.error ? `search page: ${r.error}` : `search page answered ${r.status}` };
  const html = await r.res.text().catch(() => '');
  // Take the first handful and keep the first that oEmbed will actually serve,
  // so a top result that cannot be embedded does not become a silent dead song.
  const ids = videoIdsFrom(html).slice(0, 5);
  if (!ids.length) return { error: 'no video id in the search page — the page shape may have changed' };
  for (const id of ids) {
    const meta = await oembed(id);
    if (meta) return { videoId: id, title: meta.title, author: meta.author };
  }
  return { error: 'nothing in the first results is embeddable' };
};

const write = (map) => {
  const head = readFileSync(OUT, 'utf8').split('export const DECK_VIDEO_IDS')[0];
  const body = Object.keys(map).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(map[k])},`).join('\n');
  writeFileSync(OUT, `${head}export const DECK_VIDEO_IDS = {\n${body}\n};\n`);
};

const found = { ...DECK_VIDEO_IDS };
let ok = 0, missed = 0, apiCalls = 0;
const doubtful = [];
let apiDuds = 0;
// --free skips the API entirely; otherwise the API leads and this flips the
// moment quota runs out, so one run finishes the job either way.
let useApi = !!KEY && !has('free');
if (!useApi) console.log('  using the no-quota lookup\n');

for (const [id, item] of wanted) {
  if (ok + missed >= budget && useApi) break;
  const q = searchQuery(item.artist, item.song);
  let videoId = null, title = '', author = '', how = '';

  if (useApi) {
    const url = 'https://www.googleapis.com/youtube/v3/search'
      + '?part=snippet&type=video&maxResults=1&videoEmbeddable=true&videoSyndicated=true'
      + `&q=${encodeURIComponent(q)}&key=${KEY}`;
    apiCalls += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 403) {
        const why = await res.text().catch(() => '');
        if (/quota/i.test(why)) {
          console.log(`\n  Daily API quota is gone after ${apiCalls - 1} lookups.`);
          console.log('  Switching to the no-quota lookup — this run will still finish.\n');
        } else {
          console.log('\n  YouTube refused the key (403). Check it is a YouTube Data API v3 key');
          console.log('  with no HTTP-referrer restriction — this runs from a terminal, not a page.');
          console.log('  Carrying on without it.\n');
        }
        useApi = false;
      } else if (res.ok) {
        const json = await res.json().catch(() => ({}));
        videoId = json?.items?.[0]?.id?.videoId || null;
        title = json?.items?.[0]?.snippet?.title || '';
        if (videoId) { how = 'api'; apiDuds = 0; }
        else if (++apiDuds >= 3) {
          console.log('\n  The API key answers but is not returning results — ignoring it from here.\n');
          useApi = false;
        }
      }
    } catch (e) { console.log(`   … ${q} — ${e.message}, trying the other way`); }
  }

  if (!videoId) {
    // This was not wrapped, and one failed request threw straight out of the
    // loop and ended a 369-song run at song 11 — losing nothing already written,
    // but stopping dead with hundreds to go. No single song may do that.
    let r;
    try { r = await lookupFree(q); }
    catch (e) { r = { error: e?.cause?.message || e.message || 'lookup failed' }; }
    if (r.videoId) { videoId = r.videoId; title = r.title; author = r.author || ''; how = 'free'; }
    else { console.log(`   ✗ ${item.artist} — ${item.song} — ${r.error}`); missed += 1; continue; }
    // Be a good guest: this is somebody else's public page, read once per song.
    await new Promise((r2) => setTimeout(r2, 400));
  }

  found[id] = videoId;
  ok += 1;
  write(found);                                    // after every one, so a crash costs nothing
  // A wrong match is worse than a miss: the square plays the wrong record and
  // nobody can work it out by ear. Flag the doubtful ones so they can be
  // checked, rather than burying them in a wall of ticks.
  const sure = !title || looksRight(item.artist, item.song, title, author);
  console.log(`   ${sure ? '✓' : '?'} ${item.artist} — ${item.song}  →  ${videoId}  [${how}] ${title.slice(0, 44)}`);
  if (!sure) doubtful.push(`${item.artist} — ${item.song}  →  ${title.slice(0, 60)}  (${videoId})`);
}

const left = wanted.size - ok;
console.log(`\n  ${ok} resolved, ${missed} could not be matched, ${left} still to do.`);
console.log(`  Written to src/deck-videos.mjs`);
if (doubtful.length) {
  console.log(`\n  ${doubtful.length} match${doubtful.length === 1 ? '' : 'es'} to eyeball — the title did not obviously match the song:`);
  for (const d of doubtful) console.log(`    ? ${d}`);
  console.log('  Fix any wrong one by editing its id in src/deck-videos.mjs.');
}
if (ok) console.log(`\n  Now run:  node gen-client-decks.mjs\n  then commit both files so the app ships with them.`);
if (left > 0) console.log(`\n  ${left} left — run this again to carry on.`);
console.log('');

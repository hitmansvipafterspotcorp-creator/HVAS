// The decks the venue deals and the decks solo deals have to be the same decks.
//
// Solo runs with no backend, so it cannot ask the venue what is in a deck — it
// carries its own copy in the bundle. Two copies of the same list is a drift
// waiting to happen, and drift here is invisible: someone adds a themed deck
// for the room, solo keeps dealing last month's songs, nothing errors, and the
// practice mode quietly stops teaching the real game.
//
// So the client copy is generated, and this fails the deploy if it is stale.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BINGO_DECKS, DEFAULT_DECK_ID, deckList, deckById } from './src/decks.mjs';
import { render } from './gen-client-decks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT = resolve(__dirname, '../hitmans_vip_membership_app/src/decks.generated.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('THE CLIENT COPY IS NOT STALE');
let current = null;
try { current = readFileSync(CLIENT, 'utf8'); } catch { /* reported below */ }
ok(current !== null, 'the generated client deck file exists');
ok(current === render(), 'and matches what the generator produces from the server decks');
if (current !== null && current !== render()) {
  console.log('      run: cd server && node gen-client-decks.mjs');
}

console.log('\nAND CUTS SONGS THE SAME WAY THE VENUE DOES');
// Solo reads a duration off its own player and has to land on the same window
// the backend would, or a performance is a different length depending on which
// mode you are in — and the whole rule is that the clip IS the timer.
const { clipWindowFor: serverClip } = await import('./src/clip.mjs');
const clientSrc = readFileSync(CLIENT, 'utf8');
const clientMod = await import(`data:text/javascript,${encodeURIComponent(clientSrc)}`);
for (const d of [0, 29, 45, 120, 210, 240, 400, 600]) {
  const a = serverClip(d, 120), b = clientMod.clipWindowFor(d, 120);
  ok(a.start === b.start && a.seconds === b.seconds,
     `a ${d}s track cuts to the same window on both sides (${a.start}s for ${a.seconds}s)`);
}

console.log('\nEVERY DECK CAN ACTUALLY BE PLAYED');
// A card is 24 squares plus a free centre. A deck shorter than that cannot deal
// one, and a deck barely longer deals nearly the same card to everybody.
for (const d of deckList()) {
  ok(d.count >= 24, `${d.name} has enough squares to deal a card (${d.count})`);
}

console.log('\nAND HOLDS A LIP SYNC SQUARE ON EVERY ROW');
// The lip sync square is the whole game — it is what somebody has to perform
// for. A deck with too few deals cards that are just bingo.
for (const [id, d] of Object.entries(BINGO_DECKS)) {
  const lips = d.items.filter((i) => i.type === 'lipsync').length;
  ok(lips >= 5, `${d.name} carries at least five lip sync squares (${lips})`);
}

console.log('\nNO DECK CAN DEAL THE SAME SQUARE TWICE');
// `covered` is keyed by id. A duplicate id inside one deck shows the same
// square twice on a card and covers both at once — a free line.
for (const [id, d] of Object.entries(BINGO_DECKS)) {
  const ids = d.items.map((i) => i.id);
  ok(new Set(ids).size === ids.length, `${d.name} has no duplicate square ids`);
}

console.log('\nTHE THEMES THE VENUE ASKED FOR ARE ALL THERE');
for (const want of ['ladies-night', 'rnb-slow-jams', 'country', 'edm-house', 'afrobeats',
                    'tallahassees-finest', 'trap', 'crunk', 'kings-of-rnb', 'pop', 'movies']) {
  ok(!!BINGO_DECKS[want], `${want}`);
}

console.log('\nAND A BAD PICK STILL DEALS A GAME');
ok(deckById('no-such-deck').name === BINGO_DECKS[DEFAULT_DECK_ID].name,
   'an unknown deck id falls back to the default rather than dealing nothing');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

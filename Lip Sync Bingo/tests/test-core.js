/*
 * test-core.js — Node logic tests for Lip Sync Bingo.
 * Run: node tests/test-core.js   (exit code 0 = all pass)
 * Covers: seeded reproducibility, card integrity, win detection for
 * rounds 1/2/3, anti-cheat claim verification, deck integrity, votes.
 */
'use strict';
const assert = require('assert');
const path = require('path');
const Core = require(path.join(__dirname, '..', 'js', 'core.js'));
const Data = require(path.join(__dirname, '..', 'decks.js'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + ' :: ' + e.message); }
}

const starter = Data.DECK_MAP['after-spot-starter'];

console.log('— Seeded RNG + cards —');

test('same seed deals the identical card (reproducible)', () => {
  const a = Core.generateCard(starter.songs, 'room42:player7');
  const b = Core.generateCard(starter.songs, 'room42:player7');
  assert.deepStrictEqual(a.cells, b.cells);
  assert.deepStrictEqual(a.mic, b.mic);
});

test('different seeds deal different cards', () => {
  const a = Core.generateCard(starter.songs, 'seed-A');
  const b = Core.generateCard(starter.songs, 'seed-B');
  assert.notDeepStrictEqual(a.cells, b.cells);
});

test('card integrity: 25 cells, FREE center, 24 unique deck songs', () => {
  for (const seed of ['s1', 's2', 's3', 'xyz', 12345]) {
    const card = Core.generateCard(starter.songs, seed);
    assert.strictEqual(card.cells.length, 25);
    assert.strictEqual(card.cells[Core.CENTER], Core.FREE);
    const songs = card.cells.filter(c => c !== Core.FREE);
    assert.strictEqual(songs.length, 24);
    assert.strictEqual(new Set(songs).size, 24, 'duplicate song on card');
    songs.forEach(id => assert.ok(starter.songs.includes(id), 'song not in deck: ' + id));
  }
});

test('card has exactly 5 MIC squares, none on the free space, deterministic', () => {
  const a = Core.generateCard(starter.songs, 'mic-seed');
  const b = Core.generateCard(starter.songs, 'mic-seed');
  assert.strictEqual(a.mic.length, 5);
  assert.ok(!a.mic.includes(Core.CENTER));
  assert.deepStrictEqual(a.mic, b.mic);
});

test('call order is a reproducible full permutation of the deck', () => {
  const a = Core.callOrder(starter.songs, 'room42');
  const b = Core.callOrder(starter.songs, 'room42');
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual([...a].sort(), [...starter.songs].sort());
});

test('shuffle is unbiased enough: no negative-index corruption over 500 runs', () => {
  for (let i = 0; i < 500; i++) {
    const c = Core.generateCard(starter.songs, 'run-' + i);
    assert.strictEqual(new Set(c.cells).size, 25);
  }
});

console.log('— Win detection —');

const row = [0, 1, 2, 3, 4];
const col = [0, 5, 10, 15, 20];

test('round 1: one line wins, four-in-a-row does not', () => {
  assert.strictEqual(Core.checkWin(row, 1), true);
  assert.strictEqual(Core.checkWin([0, 1, 2, 3], 1), false);
  assert.strictEqual(Core.checkWin([0, 6, 18, 24], 1), true); // diagonal via free center
});

test('round 2: needs two lines', () => {
  assert.strictEqual(Core.checkWin(row, 2), false);
  assert.strictEqual(Core.checkWin([...row, ...col], 2), true); // row + col share cell 0
});

test('round 3: only a full card wins', () => {
  const all = Array.from({ length: 25 }, (_, i) => i);
  assert.strictEqual(Core.checkWin(all, 3), true);
  assert.strictEqual(Core.checkWin(all.filter(i => i !== 7), 3), false);
  assert.strictEqual(Core.checkWin([...row, ...col], 3), false);
});

test('countLines counts rows/cols/diagonals', () => {
  assert.strictEqual(Core.countLines([...row, ...col]), 2);
  assert.strictEqual(Core.countLines([12]), 0);
});

console.log('— Anti-cheat —');

test('validateMark rejects uncalled songs and songs not on the card', () => {
  const card = Core.generateCard(starter.songs, 'ac-1');
  const onCard = card.cells.find(c => c !== Core.FREE);
  assert.deepStrictEqual(Core.validateMark(card, [], onCard), { ok: false, reason: 'not-called' });
  assert.deepStrictEqual(Core.validateMark(card, [onCard], onCard), { ok: true });
  assert.deepStrictEqual(Core.validateMark(card, ['not-a-song'], 'not-a-song'),
    { ok: false, reason: 'not-on-card' });
});

test('verifyClaim ACCEPTS an honest winning claim', () => {
  const card = Core.generateCard(starter.songs, 'ac-2');
  const marks = [0, 1, 2, 3, 4];
  const called = marks.map(i => card.cells[i]);
  const res = Core.verifyClaim({
    deckSongIds: starter.songs, seed: 'ac-2', cells: card.cells,
    marks, calledSongIds: called, round: 1
  });
  assert.strictEqual(res.ok, true);
});

test('verifyClaim REJECTS a mark for a song that was never called (the original cheat)', () => {
  const card = Core.generateCard(starter.songs, 'ac-3');
  const marks = [0, 1, 2, 3, 4];
  const called = marks.slice(0, 4).map(i => card.cells[i]); // 5th song never called
  const res = Core.verifyClaim({
    deckSongIds: starter.songs, seed: 'ac-3', cells: card.cells,
    marks, calledSongIds: called, round: 1
  });
  assert.strictEqual(res.ok, false);
  assert.ok(res.reason.startsWith('uncalled-mark'), 'reason: ' + res.reason);
});

test('verifyClaim REJECTS a forged/swapped card', () => {
  const card = Core.generateCard(starter.songs, 'ac-4');
  const forged = [...card.cells];
  [forged[0], forged[1]] = [forged[1], forged[0]];
  const res = Core.verifyClaim({
    deckSongIds: starter.songs, seed: 'ac-4', cells: forged,
    marks: [0, 1, 2, 3, 4], calledSongIds: starter.songs, round: 1
  });
  assert.deepStrictEqual(res, { ok: false, reason: 'card-mismatch' });
});

test('verifyClaim REJECTS honest marks that do not form a win', () => {
  const card = Core.generateCard(starter.songs, 'ac-5');
  const marks = [0, 1, 2];
  const called = marks.map(i => card.cells[i]);
  const res = Core.verifyClaim({
    deckSongIds: starter.songs, seed: 'ac-5', cells: card.cells,
    marks, calledSongIds: called, round: 1
  });
  assert.deepStrictEqual(res, { ok: false, reason: 'no-win' });
});

console.log('— Decks —');

test('pool: 110 unique songs, EVERY song has a playable yt id (any song can play)', () => {
  assert.strictEqual(Data.SONGS.length, 110);
  assert.strictEqual(new Set(Data.SONGS.map(s => s.id)).size, 110);
  Data.SONGS.forEach(s => assert.ok(/^[A-Za-z0-9_-]{11}$/.test(s.yt), 'missing/bad yt for ' + s.id));
});

test('every built-in deck: >= 24 unique songs, all present in the pool', () => {
  for (const deck of Data.DECKS) {
    assert.ok(deck.songs.length >= 24, deck.id + ' has only ' + deck.songs.length);
    assert.strictEqual(new Set(deck.songs).size, deck.songs.length, deck.id + ' has duplicates');
    deck.songs.forEach(id => assert.ok(Data.SONG_MAP[id], deck.id + ' references unknown song ' + id));
  }
});

test('a card can be dealt from every deck with no duplicates', () => {
  for (const deck of Data.DECKS) {
    const card = Core.generateCard(deck.songs, 'deck-check-' + deck.id);
    assert.strictEqual(new Set(card.cells).size, 25, deck.id);
  }
});

console.log('— Votes + room codes —');

test('tallyVotes: FIRE=3, SOLID=2, MID=1, junk ignored', () => {
  const t = Core.tallyVotes(['fire', 'fire', 'solid', 'mid', 'bogus']);
  assert.strictEqual(t.points, 9);
  assert.deepStrictEqual(t.breakdown, { fire: 2, solid: 1, mid: 1 });
  assert.strictEqual(Core.tallyVotes([]).points, 0);
});

test('room codes: 4 chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    assert.ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(Core.makeRoomCode()));
  }
  assert.strictEqual(Core.normalizeRoomCode(' ab-cd '), 'ABCD');
});

console.log('— Stage + battles —');

test('findPerformers: only MIC-square holders, in player order', () => {
  const mk = seed => Core.generateCard(starter.songs, seed);
  const cards = { p1: mk('fp-1'), p2: mk('fp-2'), p3: mk('fp-3') };
  // pick a song that is a mic square on p2's card
  const micSong = cards.p2.cells[cards.p2.mic[0]];
  const holders = Core.findPerformers(cards, ['p1', 'p2', 'p3'], micSong);
  assert.ok(holders.includes('p2'), 'mic holder must be found');
  holders.forEach(pid => {
    const c = cards[pid];
    assert.ok(c.mic.includes(c.cells.indexOf(micSong)), pid + ' is not a mic holder');
  });
  // a song nobody holds on a mic square -> empty
  const plain = starter.songs.find(s => !holders.length ||
    !Object.values(cards).some(c => c.mic.includes(c.cells.indexOf(s))));
  assert.deepStrictEqual(Core.findPerformers(cards, ['p1', 'p2', 'p3'], 'no-such-song'), []);
  assert.ok(Array.isArray(Core.findPerformers(cards, ['p1', 'p2'], plain)));
});

test('findPerformers: cap respected', () => {
  const cards = { p1: Core.generateCard(starter.songs, 'fc-1'), p2: Core.generateCard(starter.songs, 'fc-2') };
  const all = Core.findPerformers(cards, ['p1', 'p2'], starter.songs[0], 1);
  assert.ok(all.length <= 1);
});

test('tallyBattle: picks pay 3 each, winner bonus 10, loser keeps vote points', () => {
  const t = Core.tallyBattle(['a', 'a', 'b', 'a', 'junk'], 'a', 'b');
  assert.strictEqual(t.votesA, 3);
  assert.strictEqual(t.votesB, 1);
  assert.strictEqual(t.winner, 'a');
  assert.strictEqual(t.points.a, 3 * 3 + 10);
  assert.strictEqual(t.points.b, 1 * 3);
});

test('tallyBattle: a tie pays no bonus and names no winner (no square)', () => {
  const t = Core.tallyBattle(['b', 'a'], 'a', 'b');
  assert.strictEqual(t.winner, null);
  assert.strictEqual(t.points.a, 3);
  assert.strictEqual(t.points.b, 3);
  assert.strictEqual(Core.tallyBattle([], 'a', 'b').winner, null);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

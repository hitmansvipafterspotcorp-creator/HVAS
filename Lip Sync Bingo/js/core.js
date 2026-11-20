/*
 * core.js — Pure Lip Sync Bingo game logic. No DOM, no network.
 *
 * This module fixes the four flaws found in Korey's original HVAS code:
 *  1. ONE engine (this file) — no divergent second implementation.
 *  2. ANTI-CHEAT: a mark only counts if its song has been CALLED, and the
 *     host verifies every BINGO claim against the call history AND against
 *     the claimant's own seeded card before declaring a winner
 *     (verifyClaim). The original markCell/verifyCard checked nothing.
 *  3. SHUFFLE: proper Fisher-Yates driven by a seeded PRNG (mulberry32).
 *     The original Math.sin hashRand could go negative and used
 *     Math.random(), so cards were biased and impossible to reproduce.
 *     Here, the same seed always deals the same card — the host can
 *     re-derive and audit any player's card from its seed alone.
 *  4. Multiplayer/decks/perform-vote support lives here as pure logic
 *     (room codes, vote tallying, mic-square selection) so it is testable.
 *
 * UMD: browser -> window.LSB_CORE, Node -> module.exports (for tests).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LSB_CORE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FREE = 'FREE';
  var CENTER = 12; // index of the center cell in a 25-cell card

  /* ---------------------------------------------------------------- */
  /* Seeded RNG (mulberry32) + string seed hashing (xmur3-style).      */
  /* Deterministic: same seed -> same stream, on every device.        */
  /* ---------------------------------------------------------------- */
  function hashSeed(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  function mulberry32(seedInt) {
    var a = seedInt >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFromSeed(seed) {
    return mulberry32(typeof seed === 'number' ? seed : hashSeed(String(seed)));
  }

  /* Fisher-Yates shuffle — unbiased, driven by the supplied rng. */
  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------------------------------------------------------- */
  /* Cards                                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Deal a 5x5 card from a deck's song ids.
   * @param {string[]} deckSongIds  >= 24 unique song ids
   * @param {string|number} seed    card seed (host-issued, reproducible)
   * @param {number} [micCount=5]   number of MIC (perform) squares
   * @returns {{cells:string[], mic:number[], seed:string}}
   *   cells: 25 entries, index 12 is FREE. mic: cell indices that are
   *   performance squares (never the free space), sorted ascending.
   */
  function generateCard(deckSongIds, seed, micCount) {
    if (!Array.isArray(deckSongIds) || deckSongIds.length < 24) {
      throw new Error('generateCard: deck needs at least 24 songs');
    }
    var rng = rngFromSeed(seed);
    var picked = shuffle(deckSongIds, rng).slice(0, 24);
    var cells = [];
    var p = 0;
    for (var i = 0; i < 25; i++) {
      cells.push(i === CENTER ? FREE : picked[p++]);
    }
    // MIC squares: continue the SAME rng stream so the whole card —
    // songs and mic placement — is reproducible from the seed alone.
    var candidates = [];
    for (var k = 0; k < 25; k++) if (k !== CENTER) candidates.push(k);
    var mic = shuffle(candidates, rng).slice(0, micCount == null ? 5 : micCount)
      .sort(function (a, b) { return a - b; });
    return { cells: cells, mic: mic, seed: String(seed) };
  }

  /** Shuffled call order for a deck, reproducible from a seed. */
  function callOrder(deckSongIds, seed) {
    return shuffle(deckSongIds, rngFromSeed('calls:' + seed));
  }

  /** Per-player card seed derived from the room seed + player id. */
  function playerSeed(roomSeed, playerId) {
    return 'card:' + roomSeed + ':' + playerId;
  }

  /* ---------------------------------------------------------------- */
  /* Win detection. The 12 lines of a 5x5 card.                        */
  /* ---------------------------------------------------------------- */
  var LINES = [
    [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],           // rows
    [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],               // columns
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]                // diagonals
  ];

  /** marks: Set/array of cell indices (or a {idx:true} map). */
  function markSet(marks) {
    if (marks instanceof Set) return marks;
    var s = new Set();
    if (Array.isArray(marks)) marks.forEach(function (m) { s.add(m); });
    else if (marks && typeof marks === 'object') {
      Object.keys(marks).forEach(function (k) { if (marks[k]) s.add(Number(k)); });
    }
    return s;
  }

  function countLines(marks) {
    var m = markSet(marks);
    m.add(CENTER); // free space always counts as marked
    var n = 0;
    for (var i = 0; i < LINES.length; i++) {
      var line = LINES[i], ok = true;
      for (var j = 0; j < line.length; j++) if (!m.has(line[j])) { ok = false; break; }
      if (ok) n++;
    }
    return n;
  }

  /**
   * Round win check — Korey's round ladder:
   *  Round 1 = any 1 line, Round 2 = any 2 lines, Round 3 = full card.
   */
  function checkWin(marks, round) {
    var m = markSet(marks);
    m.add(CENTER);
    if (round === 3) return m.size >= 25;
    return countLines(m) >= (round === 2 ? 2 : 1);
  }

  /* ---------------------------------------------------------------- */
  /* Anti-cheat: mark validation + claim verification (HOST side).     */
  /* ---------------------------------------------------------------- */

  /**
   * A mark is legal only if the song is on the player's card AND has
   * been called. Returns {ok:true} or {ok:false, reason}.
   */
  function validateMark(card, calledSongIds, songId) {
    if (!card || card.cells.indexOf(songId) === -1) {
      return { ok: false, reason: 'not-on-card' };
    }
    var called = calledSongIds instanceof Set ? calledSongIds : new Set(calledSongIds);
    if (!called.has(songId)) return { ok: false, reason: 'not-called' };
    return { ok: true };
  }

  /**
   * Verify a BINGO claim the way the original code never did:
   *  1. Re-derive the claimant's card from its seed and check the
   *     claimed card matches it (no swapped/forged cards).
   *  2. Every claimed mark must be a song that was actually CALLED.
   *  3. The verified marks must actually satisfy the round's win rule.
   * @returns {{ok:true, lines:number} | {ok:false, reason:string}}
   */
  function verifyClaim(opts) {
    var deckSongIds = opts.deckSongIds;
    var seed = opts.seed;
    var claimedCells = opts.cells;
    var claimedMarks = opts.marks; // array of cell indices the player marked
    var calledSongIds = opts.calledSongIds;
    var round = opts.round;

    var card = generateCard(deckSongIds, seed);
    if (JSON.stringify(card.cells) !== JSON.stringify(claimedCells)) {
      return { ok: false, reason: 'card-mismatch' };
    }
    var called = new Set(calledSongIds);
    var verified = [];
    for (var i = 0; i < claimedMarks.length; i++) {
      var idx = claimedMarks[i];
      if (idx === CENTER) { verified.push(idx); continue; }
      var songId = card.cells[idx];
      if (!songId || songId === FREE) return { ok: false, reason: 'bad-cell' };
      if (!called.has(songId)) return { ok: false, reason: 'uncalled-mark:' + songId };
      verified.push(idx);
    }
    if (!checkWin(verified, round)) return { ok: false, reason: 'no-win' };
    return { ok: true, lines: countLines(verified) };
  }

  /* ---------------------------------------------------------------- */
  /* Perform + vote                                                    */
  /* ---------------------------------------------------------------- */
  var VOTE_POINTS = { fire: 3, solid: 2, mid: 1 };

  /** votes: array of 'fire'|'solid'|'mid' -> {points, breakdown}. */
  function tallyVotes(votes) {
    var breakdown = { fire: 0, solid: 0, mid: 0 };
    var points = 0;
    (votes || []).forEach(function (v) {
      if (Object.prototype.hasOwnProperty.call(VOTE_POINTS, v)) {
        breakdown[v]++;
        points += VOTE_POINTS[v];
      }
    });
    return { points: points, breakdown: breakdown };
  }

  /** Round-win points (in addition to performance points). */
  function roundWinPoints(round) {
    return round === 1 ? 50 : round === 2 ? 100 : 150;
  }

  /* ---------------------------------------------------------------- */
  /* Stage selection + BATTLE (TikTok-style head-to-head)              */
  /* ---------------------------------------------------------------- */

  /**
   * Every player holding `songId` on a MIC square, in player order.
   * These are the players called to the stage for that song: one
   * holder performs solo; two or more means a BATTLE for the square.
   * @param {Object} cardsById  playerId -> card ({cells, mic})
   * @param {string[]} order    player ids in room order
   * @param {number} [cap]      max holders to return (default: all)
   */
  function findPerformers(cardsById, order, songId, cap) {
    var out = [];
    var max = cap == null ? Infinity : cap;
    for (var i = 0; i < (order || []).length && out.length < max; i++) {
      var card = cardsById[order[i]];
      if (!card) continue;
      var idx = card.cells.indexOf(songId);
      if (idx !== -1 && card.mic.indexOf(idx) !== -1) out.push(order[i]);
    }
    return out;
  }

  var BATTLE_VOTE_POINTS = 3;  // per vote, to the performer picked
  var BATTLE_WIN_BONUS = 10;   // extra to the battle winner

  /**
   * Battle tally. votes: array of performer ids (one pick per voter).
   * Each pick is worth BATTLE_VOTE_POINTS to that performer; the
   * winner (more picks) also gets BATTLE_WIN_BONUS — and, by Korey's
   * rule, the winner is the one who earns the square. A tie pays no
   * bonus and no square.
   */
  function tallyBattle(votes, idA, idB) {
    var a = 0, b = 0;
    (votes || []).forEach(function (v) {
      if (v === idA) a++;
      else if (v === idB) b++;
    });
    var winner = a === b ? null : (a > b ? idA : idB);
    var points = {};
    points[idA] = a * BATTLE_VOTE_POINTS + (winner === idA ? BATTLE_WIN_BONUS : 0);
    points[idB] = b * BATTLE_VOTE_POINTS + (winner === idB ? BATTLE_WIN_BONUS : 0);
    return { votesA: a, votesB: b, winner: winner, points: points };
  }

  /* ---------------------------------------------------------------- */
  /* Room codes: 4 letters from an unambiguous alphabet (no 0/O/1/I).  */
  /* ---------------------------------------------------------------- */
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makeRoomCode(rng) {
    rng = rng || Math.random;
    var code = '';
    for (var i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    }
    return code;
  }
  function normalizeRoomCode(raw) {
    return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  return {
    FREE: FREE,
    CENTER: CENTER,
    LINES: LINES,
    VOTE_POINTS: VOTE_POINTS,
    hashSeed: hashSeed,
    mulberry32: mulberry32,
    rngFromSeed: rngFromSeed,
    shuffle: shuffle,
    generateCard: generateCard,
    callOrder: callOrder,
    playerSeed: playerSeed,
    countLines: countLines,
    checkWin: checkWin,
    validateMark: validateMark,
    verifyClaim: verifyClaim,
    tallyVotes: tallyVotes,
    roundWinPoints: roundWinPoints,
    findPerformers: findPerformers,
    tallyBattle: tallyBattle,
    BATTLE_VOTE_POINTS: BATTLE_VOTE_POINTS,
    BATTLE_WIN_BONUS: BATTLE_WIN_BONUS,
    makeRoomCode: makeRoomCode,
    normalizeRoomCode: normalizeRoomCode
  };
});

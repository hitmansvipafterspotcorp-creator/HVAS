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

  /** marks: Set/array of cell indices (or a {idx:true} map).
      Always returns a FRESH Set: callers (countLines/checkWin/
      checkPattern/patternProgress) add CENTER to the result, and
      returning a caller's own Set would silently mutate their state. */
  function markSet(marks) {
    if (marks instanceof Set) return new Set(marks);
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
   *  When a patternId is given (host picked a shape for the round),
   *  the ACTIVE PATTERN decides instead of the ladder.
   */
  function checkWin(marks, round, patternId) {
    if (patternId) return checkPattern(marks, patternId);
    var m = markSet(marks);
    m.add(CENTER);
    if (round === 3) return m.size >= 25;
    return countLines(m) >= (round === 2 ? 2 : 1);
  }

  /* ---------------------------------------------------------------- */
  /* Win-PATTERN library (Korey's order, Nov 20 2026: "all the        */
  /* different ways you could win like Ls, Xs, full card").           */
  /* Data-driven: every pattern is a list of VARIANTS, each variant a */
  /* list of cell indices (row-major 0..24, CENTER=12 is the FREE     */
  /* space and always counts as marked). A card wins a pattern when   */
  /* ANY variant is fully marked. `size` = squares in the shape;      */
  /* points = size x 10 when the host picks the pattern.              */
  /* ---------------------------------------------------------------- */
  var ROW = function (r) { return [0, 1, 2, 3, 4].map(function (c) { return r * 5 + c; }); };
  var COL = function (c) { return [0, 1, 2, 3, 4].map(function (r) { return r * 5 + c; }); };
  function unionCells() {
    var s = new Set();
    for (var i = 0; i < arguments.length; i++) {
      arguments[i].forEach(function (c) { s.add(c); });
    }
    return Array.from(s).sort(function (a, b) { return a - b; });
  }

  var PATTERNS = [
    { id: 'line', name: 'Line', size: 5,
      blurb: 'Any full row, column, or diagonal.',
      variants: LINES, preview: ROW(0) },
    { id: 'two-lines', name: 'Two Lines', size: 10,
      blurb: 'Any two full lines.',
      variants: null, preview: unionCells(ROW(0), ROW(1)) },
    { id: 'x', name: 'X', size: 9,
      blurb: 'Both diagonals.',
      variants: [unionCells([0, 6, 12, 18, 24], [4, 8, 12, 16, 20])],
      preview: unionCells([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]) },
    { id: 'l', name: 'L', size: 9,
      blurb: 'A full outside column plus the full top or bottom row at its corner.',
      variants: [
        unionCells(COL(0), ROW(4)), unionCells(COL(0), ROW(0)),
        unionCells(COL(4), ROW(4)), unionCells(COL(4), ROW(0))
      ],
      preview: unionCells(COL(0), ROW(4)) },
    { id: 't', name: 'T', size: 9,
      blurb: 'Full top row plus the full center column.',
      variants: [unionCells(ROW(0), COL(2))], preview: unionCells(ROW(0), COL(2)) },
    { id: 'u', name: 'U', size: 13,
      blurb: 'Both outside columns plus the full bottom row.',
      variants: [unionCells(COL(0), COL(4), ROW(4))],
      preview: unionCells(COL(0), COL(4), ROW(4)) },
    { id: 'corners', name: 'Four Corners', size: 4,
      blurb: 'Just the four corner squares.',
      variants: [[0, 4, 20, 24]], preview: [0, 4, 20, 24] },
    { id: 'plus', name: 'Plus / Cross', size: 9,
      blurb: 'Full center row plus full center column.',
      variants: [unionCells(ROW(2), COL(2))], preview: unionCells(ROW(2), COL(2)) },
    { id: 'frame', name: 'Frame', size: 16,
      blurb: 'Every square around the edge.',
      variants: [unionCells(ROW(0), ROW(4), COL(0), COL(4))],
      preview: unionCells(ROW(0), ROW(4), COL(0), COL(4)) },
    { id: 'full', name: 'Full Card', size: 25,
      blurb: 'Every square on the card — the blackout.',
      variants: null,
      preview: Array.from({ length: 25 }, function (_, i) { return i; }) }
  ];
  var PATTERN_MAP = {};
  PATTERNS.forEach(function (p) { PATTERN_MAP[p.id] = p; });

  /** The ladder defaults when the host doesn't pick a shape. */
  var ROUND_PATTERNS = { 1: 'line', 2: 'two-lines', 3: 'full' };

  function patternById(id) { return PATTERN_MAP[id] || null; }

  /** Points for a host-picked pattern: squares needed x 10. */
  function patternPoints(patternId) {
    var p = patternById(patternId);
    return p ? p.size * 10 : 0;
  }

  function variantComplete(m, cells) {
    for (var i = 0; i < cells.length; i++) if (!m.has(cells[i])) return false;
    return true;
  }

  /** Does this mark set satisfy the pattern (any variant)? */
  function checkPattern(marks, patternId) {
    var p = patternById(patternId);
    if (!p) return false;
    var m = markSet(marks);
    m.add(CENTER); // free space always counts as marked
    if (p.id === 'full') return m.size >= 25;
    if (p.id === 'two-lines') return countLines(m) >= 2;
    for (var i = 0; i < p.variants.length; i++) {
      if (variantComplete(m, p.variants[i])) return true;
    }
    return false;
  }

  /**
   * Progress toward a pattern, for card shading + the goal meter:
   * the variant the player is CLOSEST to completing.
   * @returns {{cells:number[], have:number, need:number, complete:boolean}}
   *   cells = the target squares to shade (best variant; for Two Lines
   *   the union of the best pair of lines; for Full Card, all cells).
   */
  function patternProgress(marks, patternId) {
    var p = patternById(patternId);
    var m = markSet(marks);
    m.add(CENTER);
    if (!p) return { cells: [], have: 0, need: 0, complete: false };
    if (p.id === 'full') {
      return { cells: p.preview, have: m.size, need: 25, complete: m.size >= 25 };
    }
    if (p.id === 'two-lines') {
      // Best pair of distinct lines, by total marked cells in their union.
      var best = null;
      for (var i = 0; i < LINES.length; i++) {
        for (var j = i + 1; j < LINES.length; j++) {
          var u = unionCells(LINES[i], LINES[j]);
          var have = 0;
          u.forEach(function (c) { if (m.has(c)) have++; });
          if (!best || have > best.have) best = { cells: u, have: have, need: u.length };
        }
      }
      best.complete = countLines(m) >= 2;
      return best;
    }
    var win = null;
    for (var k = 0; k < p.variants.length; k++) {
      var cells = p.variants[k], haveK = 0;
      cells.forEach(function (c) { if (m.has(c)) haveK++; });
      if (!win || haveK > win.have) win = { cells: cells, have: haveK, need: cells.length };
    }
    win.complete = win.have >= win.need;
    return win;
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
    var patternId = opts.patternId || null; // host-picked shape, if any

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
    if (!checkWin(verified, round, patternId)) return { ok: false, reason: 'no-win' };
    return { ok: true, lines: countLines(verified), pattern: patternId };
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
  /* Saved nights: the record of a finished game ("make a night       */
  /* stick"). Pure data shaping only — storage lives in the app.      */
  /* ---------------------------------------------------------------- */

  /** Standings sorted best-first. Ties keep their incoming order.
      Returns fresh {name, score} objects — never mutates the input. */
  function sortStandings(players) {
    return (players || []).map(function (p, i) {
      return {
        name: String(p && p.name != null ? p.name : 'Player'),
        score: Number(p && p.score) || 0, _i: i
      };
    }).sort(function (a, b) { return (b.score - a.score) || (a._i - b._i); })
      .map(function (p) { return { name: p.name, score: p.score }; });
  }

  /**
   * A content signature for a finished game: same room + deck + call
   * count + final standings + winner -> same signature, on any device,
   * at any save time (the timestamp is deliberately NOT an input).
   * The app uses it to avoid saving one night twice.
   */
  function nightSignature(parts) {
    parts = parts || {};
    var standings = sortStandings(parts.players).map(function (p) {
      return p.name + '=' + p.score;
    }).join(',');
    return 'n' + hashSeed([
      parts.roomCode || '', parts.deckId || '', parts.deckName || '',
      parts.calledCount || 0, standings,
      parts.winner ? parts.winner.name : ''
    ].join('|')).toString(36);
  }

  /**
   * Normalize a finished game into a saved-night record.
   * input: {endedAt, roomCode, deckId, deckName, mode,
   *         players:[{name,score}], winner:{name,score?}|null,
   *         calledCount, patterns?, patternsPicked?}
   * Players come out sorted best-first; the winner (if any) gets their
   * final score attached from the standings when it isn't supplied.
   */
  function buildNightRecord(input) {
    input = input || {};
    var players = sortStandings(input.players);
    var winner = null;
    if (input.winner && input.winner.name) {
      var wScore = (typeof input.winner.score === 'number') ? input.winner.score : null;
      if (wScore == null) {
        for (var i = 0; i < players.length; i++) {
          if (players[i].name === input.winner.name) { wScore = players[i].score; break; }
        }
      }
      winner = { name: String(input.winner.name), score: wScore };
    }
    var rec = {
      v: 1,
      endedAt: input.endedAt || 0,
      roomCode: input.roomCode || '',
      deckId: input.deckId || null,
      deckName: input.deckName || '',
      mode: input.mode || 'online',
      players: players,
      winner: winner,
      calledCount: input.calledCount || 0
    };
    if (input.patterns) rec.patterns = input.patterns;
    if (input.patternsPicked) rec.patternsPicked = input.patternsPicked;
    rec.sig = nightSignature(rec);
    return rec;
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
    PATTERNS: PATTERNS,
    PATTERN_MAP: PATTERN_MAP,
    ROUND_PATTERNS: ROUND_PATTERNS,
    patternById: patternById,
    patternPoints: patternPoints,
    checkPattern: checkPattern,
    patternProgress: patternProgress,
    validateMark: validateMark,
    verifyClaim: verifyClaim,
    tallyVotes: tallyVotes,
    roundWinPoints: roundWinPoints,
    findPerformers: findPerformers,
    tallyBattle: tallyBattle,
    BATTLE_VOTE_POINTS: BATTLE_VOTE_POINTS,
    BATTLE_WIN_BONUS: BATTLE_WIN_BONUS,
    sortStandings: sortStandings,
    nightSignature: nightSignature,
    buildNightRecord: buildNightRecord,
    makeRoomCode: makeRoomCode,
    normalizeRoomCode: normalizeRoomCode
  };
});

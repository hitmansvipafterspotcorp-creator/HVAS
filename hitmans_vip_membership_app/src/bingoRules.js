// Pure bingo rules — no React, no DOM. Kept apart from main.jsx so they can be
// exercised directly: pattern completion is the one place in the app where a
// quiet mistake means a player is told they won when they did not, and driving
// a browser through a randomly dealt round is a poor way to find that out.
//
// The server remains the authority on every real claim. These exist so the
// player's own screen can show progress and highlight the square that would
// finish the pattern, and so Solo (which never talks to a backend) can run the
// same ladder.

export const BINGO_ROUND_PATTERN = { 1: 'line', 2: 'two_lines', 3: 'blackout' };
export const BINGO_FINAL_ROUND = 3;
// ── Money ─────────────────────────────────────────────────────────────────
//
// A round only pays when it is a real game: a host running it, and at least two
// members who have paid the entry. Anything else is free play and pays nothing
// — including every solo round, which is played against three CPUs in an empty
// room and used to print this table as if somebody were going to hand over $20.
//
// The pot is what was actually paid in. It is NOT a fixed promise: printing
// "$20" on a screen does not conjure twenty dollars, and a round with three
// players in it does not owe the same as a round with thirty.
export const BINGO_ENTRY_FEE = 15;
export const BINGO_CASH_MIN_PAID = 2;

// How the pot is split across the three rounds. Same 1:2:4 shape the old fixed
// table had, so the last round is still the one worth playing for.
export const BINGO_ROUND_SHARE = { 1: 0.2, 2: 0.3, 3: 0.5 };

/** Is this a game that pays? Both conditions, every time. */
export function bingoIsCashGame({ hosted = false, paidPlayers = 0 } = {}) {
  return !!hosted && Number(paidPlayers) >= BINGO_CASH_MIN_PAID;
}

/** Everything paid in. Zero unless it is a cash game. */
export function bingoPot({ hosted = false, paidPlayers = 0 } = {}) {
  if (!bingoIsCashGame({ hosted, paidPlayers })) return 0;
  return Math.floor(Number(paidPlayers)) * BINGO_ENTRY_FEE;
}

/**
 * What one round pays. Whole dollars, and the three rounds can never add up to
 * more than was collected — the last round takes the rounding rather than the
 * pot quietly growing a dollar.
 */
export function bingoRoundPrize(round, { hosted = false, paidPlayers = 0 } = {}) {
  const pot = bingoPot({ hosted, paidPlayers });
  if (!pot) return 0;
  const share = BINGO_ROUND_SHARE[round];
  if (!share) return 0;
  if (Number(round) !== BINGO_FINAL_ROUND) return Math.floor(pot * share);
  const earlier = Object.entries(BINGO_ROUND_SHARE)
    .filter(([r]) => Number(r) !== BINGO_FINAL_ROUND)
    .reduce((sum, [, sh]) => sum + Math.floor(pot * sh), 0);
  return pot - earlier;
}

/** What to put on screen where a prize used to be printed unconditionally. */
export function bingoPrizeLabel(round, ctx) {
  const prize = bingoRoundPrize(round, ctx);
  return prize > 0 ? `$${prize}` : 'Free play';
}

export const BINGO_PATTERN_LABEL = {
  line: 'complete a line', two_lines: 'complete two lines', four_corners: 'cover all four corners',
  x: 'cover an X', around_the_world: 'cover the outer ring', blackout: 'cover the whole card',
};
export const BINGO_PATTERN_NAME = {
  line: 'Line', two_lines: 'Two Lines', four_corners: 'Four Corners',
  x: 'X', around_the_world: 'Around The World', blackout: 'Blackout',
};
export const BINGO_PATTERN_IDS = ['line', 'two_lines', 'four_corners', 'x', 'around_the_world', 'blackout'];
// Short goal text for the round chip — the sentence above does not fit a 90px
// panel, and on the card the player only needs the target.
export const BINGO_PATTERN_GOAL = {
  line: '1 LINE', two_lines: '2 LINES', four_corners: '4 CORNERS',
  x: 'THE X', around_the_world: 'OUTER RING', blackout: 'FULL CARD',
};

// The 12 winning lines of a 5x5 card, as flat indexes.
export const BINGO_LINES = (() => {
  const L = [];
  for (let r = 0; r < 5; r++) L.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) L.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  L.push([0, 6, 12, 18, 24]);
  L.push([4, 8, 12, 16, 20]);
  return L;
})();

const RING = [...Array(25).keys()].filter((i) => i < 5 || i > 19 || i % 5 === 0 || i % 5 === 4);

// Squares covered, as booleans. Index 12 is the free space everywhere.
const coverMask = (card, coveredIds) =>
  card.map((it, i) => i === 12 || (!!it && coveredIds.has(it.id)));

// How far along the current pattern this card is, as done/need.
export function bingoProgress(card, coveredIds, pattern) {
  if (!card?.length) return { done: 0, need: 1 };
  const on = coverMask(card, coveredIds);
  const lines = BINGO_LINES.filter((l) => l.every((i) => on[i])).length;
  switch (pattern) {
    case 'two_lines': return { done: Math.min(lines, 2), need: 2 };
    case 'four_corners': return { done: [0, 4, 20, 24].filter((i) => on[i]).length, need: 4 };
    case 'x': return { done: [0, 6, 18, 24, 4, 8, 16, 20].filter((i) => on[i]).length, need: 8 };
    case 'around_the_world': return { done: RING.filter((i) => on[i]).length, need: RING.length };
    case 'blackout': return { done: on.filter(Boolean).length, need: 25 };
    default: {
      // Closest line, so "4 / 5" means one square from a bingo.
      const best = Math.max(0, ...BINGO_LINES.map((l) => l.filter((i) => on[i]).length));
      return { done: lines >= 1 ? 5 : best, need: 5 };
    }
  }
}

export const bingoHasPattern = (card, coveredIds, pattern) => {
  const { done, need } = bingoProgress(card, coveredIds, pattern);
  return done >= need;
};

// Which not-yet-covered squares would complete the pattern on their own. The
// player already holds this information — it is sitting on their card — but
// finding it by eye mid-round is exactly what a phone should do for you.
// Only squares that have actually been called count: highlighting one the host
// has not reached yet would be telling them to tap something illegal.
export function oneAwayIds(card, coveredIds, calledIds, pattern) {
  if (!card?.length) return new Set();
  if (bingoHasPattern(card, coveredIds, pattern)) return new Set();
  const need = bingoProgress(card, coveredIds, pattern).need;
  const out = new Set();
  card.forEach((item, i) => {
    if (i === 12 || !item || coveredIds.has(item.id) || !calledIds.has(item.id)) return;
    const probe = new Set(coveredIds);
    probe.add(item.id);
    if (bingoProgress(card, probe, pattern).done >= need) out.add(item.id);
  });
  return out;
}

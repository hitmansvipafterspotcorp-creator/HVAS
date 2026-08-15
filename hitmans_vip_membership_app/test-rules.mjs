// Unit tests for the pure bingo rules. These exist because the one case that
// matters most — "this square would finish the pattern" — is the case a
// randomly dealt browser round almost never reaches, so driving the UI is a
// poor way to check it.
//   node test-rules.mjs
import {
  BINGO_LINES, BINGO_ROUND_PATTERN, BINGO_FINAL_ROUND,
  bingoProgress, bingoHasPattern, oneAwayIds,
} from './src/bingoRules.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
const card = [...Array(25)].map((_, i) => ({ id: `s${i}`, artist: `A${i}`, song: `T${i}` }));
const ids = (...ix) => new Set(ix.map((i) => `s${i}`));
const all = new Set(card.map((c) => c.id));

console.log('LINES');
ok(BINGO_LINES.length === 12, '12 winning lines: 5 rows, 5 columns, 2 diagonals');
ok(BINGO_LINES.every((l) => l.length === 5), 'every line is 5 squares');
ok(BINGO_LINES.filter((l) => l.includes(12)).length === 4, 'the free centre sits on 4 of them');

console.log('PROGRESS — line');
ok(bingoProgress(card, new Set(), 'line').done === 1, 'an empty card is already 1/5: the free space counts');
ok(bingoProgress(card, ids(0, 1, 2, 3), 'line').done === 4, 'four of a row reads 4/5');
ok(bingoHasPattern(card, ids(0, 1, 2, 3, 4), 'line'), 'a full top row is a bingo');
ok(bingoHasPattern(card, ids(0, 6, 18, 24), 'line'), 'a diagonal wins with only 4 taps — the centre is free');
ok(!bingoHasPattern(card, ids(0, 1, 2, 3), 'line'), 'four of a row is NOT a bingo');

console.log('PROGRESS — two lines');
ok(!bingoHasPattern(card, ids(0, 1, 2, 3, 4), 'two_lines'), 'one row does not take round 2');
ok(bingoHasPattern(card, ids(0, 1, 2, 3, 4, 5, 6, 7, 8, 9), 'two_lines'), 'two full rows do');
ok(bingoProgress(card, ids(0, 1, 2, 3, 4), 'two_lines').done === 1, 'one row reads 1/2');

console.log('PROGRESS — blackout');
ok(bingoProgress(card, new Set(), 'blackout').done === 1, 'blackout starts at 1/25 for the free space');
ok(bingoHasPattern(card, all, 'blackout'), 'covering everything is a blackout');
const everyTappable = ids(...[...Array(25).keys()].filter((i) => i !== 12));
ok(bingoHasPattern(card, everyTappable, 'blackout'), 'all 24 tappable squares plus the free centre is a blackout');
const missingOne = ids(...[...Array(24).keys()].filter((i) => i !== 12));
ok(!bingoHasPattern(card, missingOne, 'blackout'), 'leaving a single square uncovered is not');

console.log('PROGRESS — other patterns');
ok(bingoHasPattern(card, ids(0, 4, 20, 24), 'four_corners'), 'four corners');
ok(bingoHasPattern(card, ids(0, 6, 18, 24, 4, 8, 16, 20), 'x'), 'the X');
ok(bingoProgress(card, new Set(), 'around_the_world').need === 16, 'the outer ring is 16 squares');

console.log('ONE AWAY');
const called = all;
let near = oneAwayIds(card, ids(0, 1, 2, 3), called, 'line');
ok(near.has('s4'), 'with four of the top row covered, the fifth is flagged');
ok(near.size === 1, 'and nothing else is');
near = oneAwayIds(card, ids(0, 6, 18), called, 'line');
ok(near.has('s24'), 'a diagonal three-plus-free flags the last corner');
ok(oneAwayIds(card, ids(0, 1, 2, 3, 4), called, 'line').size === 0, 'nothing is flagged once you have already won');
ok(oneAwayIds(card, new Set(), called, 'line').size === 0, 'an empty card flags nothing');
// The square has to have been CALLED — highlighting an uncalled one tells the
// player to tap something the server will refuse.
near = oneAwayIds(card, ids(0, 1, 2, 3), ids(0, 1, 2, 3), 'line');
ok(near.size === 0, 'a winning square that has not been called yet is NOT flagged');
// A cross shape is one square from two different lines at once.
// Top row needs s4; left column (0,5,10,15,20) needs s20. Both are one tap
// away at the same time, and both must light up.
near = oneAwayIds(card, ids(0, 1, 2, 3, 5, 10, 15), called, 'line');
ok(near.has('s4') && near.has('s20') && near.size === 2, 'two separate finishing squares are both flagged');
near = oneAwayIds(card, ids(0, 1, 2, 3, 4, 5, 6, 7, 8), called, 'two_lines');
ok(near.has('s9'), 'round 2: the square completing the second line is flagged');
ok(oneAwayIds(card, ids(0, 1, 2, 3), called, 'blackout').size === 0, 'blackout flags nothing until the last square');
const oneLeft = new Set(card.map((c) => c.id)); oneLeft.delete('s7');
ok(oneAwayIds(card, oneLeft, called, 'blackout').has('s7'), 'blackout flags the final square');

console.log('LADDER');
ok(BINGO_ROUND_PATTERN[1] === 'line' && BINGO_ROUND_PATTERN[2] === 'two_lines' && BINGO_ROUND_PATTERN[3] === 'blackout',
  'the ladder is line -> two lines -> blackout');
ok(BINGO_FINAL_ROUND === 3, 'three rounds');
// A CPU must not be able to take round 2 on a single line.
ok(!bingoHasPattern(card, ids(0, 1, 2, 3, 4), BINGO_ROUND_PATTERN[2]), 'one line cannot take round 2');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

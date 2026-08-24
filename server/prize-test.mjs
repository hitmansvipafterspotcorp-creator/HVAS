// What a round pays, and — far more important — when it pays nothing.
//
// The app used to print a flat prize table, $5/$10/$20, on every card it drew.
// It printed it in solo, a game against three CPU players in an empty room
// where nobody was ever going to hand over a cent. A screen that promises money
// it cannot pay is the one bug in this app that costs the venue real trust at
// the door, so the rule that decides it gets tested directly rather than
// through a browser.
//
// The rule: a round pays only when a HOST is running it and at least TWO
// members have paid the entry. The pot is what was actually collected.
import {
  BINGO_ENTRY_FEE, BINGO_CASH_MIN_PAID, BINGO_FINAL_ROUND,
  bingoIsCashGame, bingoPot, bingoRoundPrize, bingoPrizeLabel,
} from '../hitmans_vip_membership_app/src/bingoRules.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, `${m}${a === b ? '' : ` — got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`}`);

console.log('NOTHING PAYS UNLESS IT IS A REAL GAME');
ok(!bingoIsCashGame({ hosted: false, paidPlayers: 9 }), 'nine payers and no host is not a cash game');
ok(!bingoIsCashGame({ hosted: true, paidPlayers: 1 }), 'a host and one payer is not a cash game');
ok(!bingoIsCashGame({ hosted: true, paidPlayers: 0 }), 'a host and nobody is not a cash game');
ok(bingoIsCashGame({ hosted: true, paidPlayers: 2 }), 'a host and two payers is');
ok(bingoIsCashGame({ hosted: true, paidPlayers: 40 }), 'and so is a full room');
ok(!bingoIsCashGame(), 'called with nothing at all, it does not pay');

console.log('\nSOLO PAYS NOTHING, EVER');
// Solo has no host and no payers by construction. This is the case that was
// wrong on screen for months.
eq(bingoPot({ hosted: false, paidPlayers: 0 }), 0, 'the pot is zero');
for (let r = 1; r <= BINGO_FINAL_ROUND; r++) {
  eq(bingoRoundPrize(r, { hosted: false, paidPlayers: 0 }), 0, `round ${r} pays nothing`);
}
eq(bingoPrizeLabel(1, { hosted: false, paidPlayers: 0 }), 'Free play', 'and the screen says free play rather than a number');

console.log('\nTHE POT IS WHAT WAS PAID IN');
eq(BINGO_ENTRY_FEE, 15, 'entry is $15');
eq(BINGO_CASH_MIN_PAID, 2, 'and it takes two of them');
eq(bingoPot({ hosted: true, paidPlayers: 2 }), 30, 'two players is a $30 pot');
eq(bingoPot({ hosted: true, paidPlayers: 7 }), 105, 'seven is $105');
eq(bingoPot({ hosted: true, paidPlayers: 30 }), 450, 'thirty is $450');
ok(bingoPot({ hosted: true, paidPlayers: 3 }) > bingoPot({ hosted: true, paidPlayers: 2 }),
   'a bigger room is a bigger pot — it is not a fixed promise');

console.log('\nTHE ROUNDS NEVER PAY OUT MORE THAN WAS COLLECTED');
// The bug that would actually cost money: three rounds each rounded up, adding
// to more than anybody put in.
for (const players of [2, 3, 4, 5, 7, 9, 11, 13, 17, 23, 30, 41, 100]) {
  const ctx = { hosted: true, paidPlayers: players };
  const pot = bingoPot(ctx);
  let paidOut = 0;
  for (let r = 1; r <= BINGO_FINAL_ROUND; r++) paidOut += bingoRoundPrize(r, ctx);
  ok(paidOut === pot, `${players} players: $${pot} in, $${paidOut} out`);
  ok([1, 2, 3].every((r) => Number.isInteger(bingoRoundPrize(r, ctx))), `  and every round is whole dollars`);
}

console.log('\nTHE LAST ROUND IS STILL THE ONE WORTH PLAYING FOR');
const big = { hosted: true, paidPlayers: 10 };
ok(bingoRoundPrize(3, big) > bingoRoundPrize(2, big), 'round 3 beats round 2');
ok(bingoRoundPrize(2, big) > bingoRoundPrize(1, big), 'round 2 beats round 1');
eq(bingoPrizeLabel(3, big), `$${bingoRoundPrize(3, big)}`, 'and the label is the money when there is money');

console.log('\nA ROUND THAT DOES NOT EXIST PAYS NOTHING');
eq(bingoRoundPrize(0, big), 0, 'round 0');
eq(bingoRoundPrize(9, big), 0, 'round 9');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

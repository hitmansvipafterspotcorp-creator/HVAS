export type AttackButton = 'light' | 'medium' | 'heavy' | 'special';

export type SheetMove = {
  button: AttackButton;
  anim: 'combo1' | 'combo2' | 'combo3' | 'special';
  name: string;
  damage: number;
  knockback: number;
  meterGain: number;
  lockMs: number;
  activeStartMs: number;
  activeEndMs: number;
  bannerColor: string;
};

export type CharacterMoveSet = {
  light: SheetMove;
  medium: SheetMove;
  heavy: SheetMove;
  special: SheetMove;
};

const makeSet = (
  light: string,
  medium: string,
  heavy: string,
  special: string,
  damageBias = 0,
): CharacterMoveSet => ({
  light: {
    button: 'light',
    anim: 'combo1',
    name: light,
    damage: 6 + damageBias,
    knockback: 12,
    meterGain: 6,
    lockMs: 210,
    activeStartMs: 70,
    activeEndMs: 150,
    bannerColor: '#ffee88',
  },
  medium: {
    button: 'medium',
    anim: 'combo2',
    name: medium,
    damage: 10 + damageBias,
    knockback: 22,
    meterGain: 9,
    lockMs: 280,
    activeStartMs: 95,
    activeEndMs: 200,
    bannerColor: '#ffb84a',
  },
  heavy: {
    button: 'heavy',
    anim: 'combo3',
    name: heavy,
    damage: 15 + damageBias,
    knockback: 42,
    meterGain: 13,
    lockMs: 380,
    activeStartMs: 130,
    activeEndMs: 275,
    bannerColor: '#ff5a2f',
  },
  special: {
    button: 'special',
    anim: 'special',
    name: special,
    damage: 18 + damageBias,
    knockback: 58,
    meterGain: 18,
    lockMs: 460,
    activeStartMs: 150,
    activeEndMs: 340,
    bannerColor: '#c100ff',
  },
});

export const DEFAULT_MOVE_SET = makeSet(
  'Light Opener',
  'Medium Pressure',
  'Heavy Launcher',
  'Signature Special',
);

// Combat sheets are read by row:
// row 00 = Light, row 01 = Medium, row 02 = Heavy, row 03 = Special.
// FSU rows use the visible labels from the uploaded character sheets.
export const SHEET_MOVES: Record<number, CharacterMoveSet> = {
  1: makeSet('Beat Jab', 'Mic Swing', 'Crown Slam', 'Beat Drop', 1),
  2: makeSet('Needle Tap', 'Bass Hook', 'Speaker Kick', 'Bass Cannon', 0),
  3: makeSet('Rattler Jab', 'Orange Chop', 'Strike Step Kick', 'Rattler Rush', -1),
  4: makeSet('Rattler Jab', 'Campus Chop', 'Thunder Step Kick', 'Thunder Dash', 0),
  5: makeSet('Flash Jab', 'Story Swipe', 'Viral Kick', 'Flash Mob', -2),
  6: makeSet('Shutter Jab', 'Camera Chop', 'Wide Step Kick', 'Shutter Strike', 0),
  7: makeSet('Flyer Jab', 'Crowd Chop', 'Door Step Kick', 'Hype Up', 0),
  8: makeSet('Step Jab', 'Spin Chop', 'Stage Kick', 'Spin Cycle', -1),
  9: makeSet('Tray Jab', 'Cart Chop', 'Stock Kick', 'Tray Slam', 4),
  10: makeSet('Bouncer Jab', 'Crowd Chop', 'Door Kick', 'Crowd Removal', 6),
  11: makeSet('Mic Jab', 'Crowd Chop', 'Stage Kick', 'Mic Drop', 1),
  12: makeSet('Garnet Jab', 'Campus Chop', 'Spear Step Kick', 'War Chant Burst', 2),
  13: makeSet('Garnet Jab', 'Campus Chop', 'Spear Step Kick', 'War Chant Burst', 2),
  14: makeSet('Smokehouse Jab', 'Kitchen Chop', 'Headliner Kick', 'Smokehouse Spin', 2),
  20: makeSet('Cafe Jab', 'Owner Chop', 'Eight Fifty Kick', 'House Special', 1),
  21: makeSet('Soulja Jab', 'Gold Chop', 'Big Kick', 'Gold Avalanche', 4),
  22: makeSet('Line Jab', 'Entry Chop', 'Disruptor Kick', 'Line Breaker', 2),
  30: makeSet('Predator Jab', 'Pete Chop', 'Hunt Kick', 'Predator Pounce', 3),
  31: makeSet('Agent Jab', 'Snow Chop', 'Frost Kick', 'Cold Front', 2),
};

export function movesFor(charId: number): CharacterMoveSet {
  return SHEET_MOVES[charId] ?? DEFAULT_MOVE_SET;
}

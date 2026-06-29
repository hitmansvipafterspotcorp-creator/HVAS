// ── Character animation manifest ────────────────────────────────────────────
// The repo's per-character frames are pre-sliced PNGs at a uniform layout:
//   assets/characters/frames/<folder>/<type>/r<RR>_f<CC>.png
// Every character shares the same row scheme (mirrored from the original
// vanilla-JS SpriteSystem CHAR_DEFS), so one map covers all 19 fighters.

export const FRAME_W = 131;
export const FRAME_H = 181;
export const COLS = 8; // frames per row

// charId -> frames folder name. Must match assets/characters/frames/{folder}/.
export const CHAR_FOLDERS: Record<number, string> = {
  1: 'creator',
  2: 'dj',
  3: 'famu_female',
  4: 'famu_male',
  5: 'influencer',
  6: 'photographer',
  7: 'promoter',
  8: 'dancer',
  9: 'vendor',
  10: 'security',
  11: 'host',
  12: 'fsu_female',
  13: 'fsu_male',
  14: 'kendrick',
  20: 'kt',
  21: 'big_soulja',
  22: 'eld',
  30: 'predator_pete',
  31: 'agent_snow',
};

// Only these chars have sliced topdown direction frames.
// All others fall back to loco idle in VenueScene.
export const TOPDOWN_CHAR_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 30, 31] as const;

export type AnimDef = {
  type: string; // sheet/type folder
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
};

// Animation name -> sheet row. Names match the original engine.
export const ANIMS: Record<string, AnimDef> = {
  // locomotion
  idle: { type: 'loco', row: 0, frames: 8, fps: 6, loop: true },
  walk: { type: 'loco', row: 1, frames: 8, fps: 10, loop: true },
  run: { type: 'loco', row: 2, frames: 8, fps: 14, loop: true },
  dodge: { type: 'loco', row: 3, frames: 8, fps: 16, loop: false },
  block: { type: 'loco', row: 4, frames: 8, fps: 8, loop: true },
  interact: { type: 'loco', row: 5, frames: 8, fps: 8, loop: false },
  // combat
  combo1: { type: 'combat', row: 0, frames: 8, fps: 18, loop: false },
  combo2: { type: 'combat', row: 1, frames: 8, fps: 16, loop: false },
  combo3: { type: 'combat', row: 2, frames: 8, fps: 14, loop: false },
  special: { type: 'combat', row: 3, frames: 8, fps: 14, loop: false },
  // damage
  hurt: { type: 'damage', row: 0, frames: 8, fps: 16, loop: false },
  knockdown: { type: 'damage', row: 1, frames: 8, fps: 12, loop: false },
  recover: { type: 'damage', row: 2, frames: 8, fps: 10, loop: false },
  victory: { type: 'damage', row: 3, frames: 8, fps: 6, loop: true },
  defeated: { type: 'damage', row: 4, frames: 8, fps: 5, loop: false },
  // supers
  super1: { type: 'supers', row: 0, frames: 8, fps: 14, loop: false },
  super2: { type: 'supers', row: 1, frames: 8, fps: 14, loop: false },
  super3: { type: 'supers', row: 2, frames: 8, fps: 14, loop: false },
  finisher: { type: 'supers', row: 3, frames: 8, fps: 10, loop: false },
  // top-down (4 facings × idle/walk)
  // Sheets have col 0 = label; frames start at col 2 for most chars (6 frames),
  // col 1 for pete/snow style sheets (7 frames). animMap uses 6 — extra f06
  // for pete/snow is silently skipped rather than the other way around.
  td_idle_s: { type: 'topdown', row: 0, frames: 6, fps: 6, loop: true },
  td_idle_n: { type: 'topdown', row: 1, frames: 6, fps: 6, loop: true },
  td_idle_w: { type: 'topdown', row: 2, frames: 6, fps: 6, loop: true },
  td_idle_e: { type: 'topdown', row: 3, frames: 6, fps: 6, loop: true },
  td_walk_s: { type: 'topdown', row: 4, frames: 6, fps: 10, loop: true },
  td_walk_n: { type: 'topdown', row: 5, frames: 6, fps: 10, loop: true },
  td_walk_w: { type: 'topdown', row: 6, frames: 6, fps: 10, loop: true },
  // Row 7 = props/accessories for creator-type sheets; not an east walk.
  // East walking is handled by mirroring td_walk_w via setFlipX in VenueScene.

  // ── Per-character VFX sheet (assets/characters/frames/{folder}/vfx/) ────────
  // 8 rows × 8 frames each. Played on a separate sprite at hit/effect location.
  vfx_hit:      { type: 'vfx', row: 0, frames: 8, fps: 24, loop: false },
  vfx_block:    { type: 'vfx', row: 1, frames: 8, fps: 20, loop: false },
  vfx_dodge:    { type: 'vfx', row: 2, frames: 8, fps: 20, loop: false },
  vfx_super:    { type: 'vfx', row: 3, frames: 8, fps: 18, loop: false },
  vfx_ko:       { type: 'vfx', row: 4, frames: 8, fps: 16, loop: false },
  vfx_special:  { type: 'vfx', row: 5, frames: 8, fps: 18, loop: false },
  vfx_grab:     { type: 'vfx', row: 6, frames: 8, fps: 20, loop: false },
  vfx_finisher: { type: 'vfx', row: 7, frames: 8, fps: 14, loop: false },
};

// Which anims each mode needs (keeps loads small — we never preload all frames).
export const BRAWLER_ANIMS = [
  'idle',
  'walk',
  'run',
  'dodge',
  'block',
  'combo1',
  'combo2',
  'combo3',
  'special',
  'hurt',
  'knockdown',
  'defeated',
  'super1',
  'super2',
  'super3',
  'finisher',
];

export const VFX_ANIMS = [
  'vfx_hit',
  'vfx_block',
  'vfx_dodge',
  'vfx_super',
  'vfx_ko',
  'vfx_special',
  'vfx_grab',
  'vfx_finisher',
];

// Only loaded for chars listed in TOPDOWN_CHAR_IDS to avoid mass 404s.
export const VENUE_ANIMS = [
  'td_idle_s',
  'td_idle_n',
  'td_idle_w',
  'td_idle_e',
  'td_walk_s',
  'td_walk_n',
  'td_walk_w',
  // td_walk_e omitted — east walking mirrors td_walk_w via setFlipX
];

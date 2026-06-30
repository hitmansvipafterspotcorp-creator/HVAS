import Phaser from 'phaser';
import { ASSET_BASE } from '../config';
import { CHAR_FOLDERS, ANIMS } from '../data/animMap';

// ── AnimationSystem ─────────────────────────────────────────────────────────
// Loads per-character sprite sheets (one per anim type) instead of individual
// frame PNGs, reducing ~5062 HTTP requests down to ~114 sheet loads.
//
// Sheet layout (all sheets):
//   frameWidth  = 181 px (8 cols × 181 = 1448)
//   frameHeight = varies by type (see SHEET_FRAME_H)
//   Frame index = row * 8 + col
//
// pete/snow have vfx and topdown sheet numbers swapped vs everyone else.

// charId → sprite-sheet file prefix (may differ from frames folder name)
const SHEET_PREFIX: Record<number, string> = {
  1:  'creator',
  2:  'dj',
  3:  'famu_female',
  4:  'famu_male',
  5:  'influencer',
  6:  'photographer',
  7:  'promoter',
  8:  'dancer',
  9:  'vendor',
  10: 'security',
  11: 'host',
  12: 'fsu_female',
  13: 'fsu_male',
  14: 'kendrick',
  20: 'kt',
  21: 'bigsoulja',
  22: 'eld',
  30: 'pete',
  31: 'snow',
};

// These chars have vfx=sheet05, topdown=sheet06 (all others: topdown=05, vfx=06)
const REVERSED_TOPDOWN_VFX = new Set([30, 31]);

// type → (sheet number for standard chars, sheet number for pete/snow)
const TYPE_SHEET: Record<string, [number, number]> = {
  loco:    [1, 1],
  combat:  [2, 2],
  damage:  [3, 3],
  supers:  [4, 4],
  topdown: [5, 6],
  vfx:     [6, 5],
};

// type → frame height in the sprite sheet (width is always 181)
const SHEET_FRAME_H: Record<string, number> = {
  loco:    181,
  combat:  217,
  damage:  217,
  supers:  271,
  topdown: 135,
  vfx:     135,
};

const SHEET_FRAME_W = 181;
const SHEET_COLS    = 8;

function sheetTextureKey(charId: number, type: string): string {
  return `ss__${charId}__${type}`;
}

function sheetUrl(charId: number, type: string): string {
  const prefix = SHEET_PREFIX[charId];
  const [stdNum, revNum] = TYPE_SHEET[type];
  const sheetNum = REVERSED_TOPDOWN_VFX.has(charId) ? revNum : stdNum;
  const n = String(sheetNum).padStart(2, '0');
  return `${ASSET_BASE}characters/${prefix}_sheet${n}_${type}.png`;
}

// Track which (charId, type) sheets have been queued to avoid duplicates.
const queuedSheets = new Set<string>();

export const AnimationSystem = {
  animKey(charId: number, name: string): string {
    return `c${charId}_${name}`;
  },

  // Queue sprite sheets needed for the given anim names. Call inside preload().
  queue(scene: Phaser.Scene, charId: number, animNames: string[]): void {
    if (!CHAR_FOLDERS[charId]) return;

    // Collect which sheet types are needed
    const typesNeeded = new Set<string>();
    for (const name of animNames) {
      const a = ANIMS[name];
      if (a) typesNeeded.add(a.type);
    }

    for (const type of typesNeeded) {
      const ssKey = sheetTextureKey(charId, type);
      const trackKey = `${charId}__${type}`;
      if (scene.textures.exists(ssKey) || queuedSheets.has(trackKey)) continue;
      queuedSheets.add(trackKey);
      scene.load.spritesheet(ssKey, sheetUrl(charId, type), {
        frameWidth:  SHEET_FRAME_W,
        frameHeight: SHEET_FRAME_H[type] ?? 181,
      });
    }
  },

  // Build Phaser animations from already-loaded sprite sheets.
  build(scene: Phaser.Scene, charId: number, animNames: string[]): void {
    if (!CHAR_FOLDERS[charId]) return;
    for (const name of animNames) {
      const a = ANIMS[name];
      if (!a) continue;
      const key = this.animKey(charId, name);
      if (scene.anims.exists(key)) continue;

      const ssKey = sheetTextureKey(charId, a.type);
      if (!scene.textures.exists(ssKey)) continue;

      const startFrame = a.row * SHEET_COLS;
      const endFrame   = startFrame + a.frames - 1;

      // Clamp to available frames in the texture
      const texture = scene.textures.get(ssKey);
      const totalFrames = texture.frameTotal - 1; // frameTotal includes __BASE
      if (startFrame >= totalFrames) continue;
      const clampedEnd = Math.min(endFrame, totalFrames - 1);

      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(ssKey, {
          start: startFrame,
          end:   clampedEnd,
        }),
        frameRate: a.fps,
        repeat:    a.loop ? -1 : 0,
      });
    }
  },

  // True if the character has at least its idle animation built.
  ready(scene: Phaser.Scene, charId: number, name = 'idle'): boolean {
    return scene.anims.exists(this.animKey(charId, name));
  },
};

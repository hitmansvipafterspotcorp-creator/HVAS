import Phaser from 'phaser';
import { ASSET_BASE } from '../config';
import { CHAR_FOLDERS, ANIMS } from '../data/animMap';

// ── AnimationSystem ─────────────────────────────────────────────────────────
// Loads the pre-sliced character frame PNGs as individual Phaser textures and
// assembles them into Phaser animations. Textures + anims live on the global
// (game-level) managers, so a character loaded once is reusable across scenes.
// We only ever queue the frames a mode actually needs — never all 19×6 sheets.

function frameKey(folder: string, type: string, row: number, col: number): string {
  return `${folder}__${type}__r${row}_f${col}`;
}

function frameUrl(folder: string, type: string, row: number, col: number): string {
  const r = String(row).padStart(2, '0');
  const c = String(col).padStart(2, '0');
  return `${ASSET_BASE}characters/frames/${folder}/${type}/r${r}_f${c}.png`;
}

// Keys already handed to a loader this session — avoids duplicate-load warnings.
const queued = new Set<string>();

export const AnimationSystem = {
  animKey(charId: number, name: string): string {
    return `c${charId}_${name}`;
  },

  // Queue every frame for the given anim names into the scene loader.
  // Call inside a scene's preload(), or followed by scene.load.start().
  queue(scene: Phaser.Scene, charId: number, animNames: string[]): void {
    const folder = CHAR_FOLDERS[charId];
    if (!folder) return;
    for (const name of animNames) {
      const a = ANIMS[name];
      if (!a) continue;
      for (let c = 0; c < a.frames; c++) {
        const key = frameKey(folder, a.type, a.row, c);
        if (scene.textures.exists(key) || queued.has(key)) continue;
        queued.add(key);
        scene.load.image(key, frameUrl(folder, a.type, a.row, c));
      }
    }
  },

  // Build Phaser animations from already-loaded textures. Missing frames are
  // skipped so a partially-sliced character still gets a playable fallback
  // (e.g. pete/snow have no topdown rows yet).
  build(scene: Phaser.Scene, charId: number, animNames: string[]): void {
    const folder = CHAR_FOLDERS[charId];
    if (!folder) return;
    for (const name of animNames) {
      const a = ANIMS[name];
      if (!a) continue;
      const key = this.animKey(charId, name);
      if (scene.anims.exists(key)) continue;
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let c = 0; c < a.frames; c++) {
        const tk = frameKey(folder, a.type, a.row, c);
        if (scene.textures.exists(tk)) frames.push({ key: tk });
      }
      if (frames.length === 0) continue;
      scene.anims.create({
        key,
        frames,
        frameRate: a.fps,
        repeat: a.loop ? -1 : 0,
      });
    }
  },

  // True if the character has at least its idle animation built.
  ready(scene: Phaser.Scene, charId: number, name = 'idle'): boolean {
    return scene.anims.exists(this.animKey(charId, name));
  },
};

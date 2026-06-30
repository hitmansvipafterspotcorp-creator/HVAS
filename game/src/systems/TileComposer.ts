// TileComposer: assembles a stage backdrop from individual modular tiles
// rather than a single pre-composited PNG. Each layout entry specifies a
// tile key, target position, optional size, depth, alpha, and flipX.
//
// Tiles are loaded on demand via a native Image probe (avoids Phaser loader
// errors when a key is missing) and added to the scene with origin (0.5, 1)
// so positions specify the BOTTOM-CENTER of each tile — matches the way the
// player feet sit on the floor.

import Phaser from 'phaser';
import { ASSET_BASE } from '../config';

export type TilePlacement = {
  tile: string;            // file basename under /assets/venues/props/<venue>/<area>/
  x: number;
  y: number;
  w?: number;              // optional explicit display width
  h?: number;              // optional explicit display height
  scale?: number;          // optional uniform scale (overrides w/h if set)
  depth?: number;          // z-order; default = y
  alpha?: number;
  flipX?: boolean;
  origin?: [number, number]; // default [0.5, 1] (bottom-center)
};

export type TileLayout = {
  id: string;              // unique key for this layout
  area: string;            // path segment: 'cafe8fifty/outside', 'hvas/inside', etc.
  prefix: string;          // file prefix: 'cafe8fifty_outside_', 'hvas_inside_'
  tiles: TilePlacement[];
};

export const TileComposer = {
  /** Place every tile in the layout, loading each via Image probe. */
  compose(scene: Phaser.Scene, layout: TileLayout): void {
    for (const p of layout.tiles) {
      const key = `tile_${layout.id}_${p.tile}`;
      if (scene.textures.exists(key)) {
        this.place(scene, key, p);
        continue;
      }
      const url = `${ASSET_BASE}venues/props/${layout.area}/${layout.prefix}${p.tile}.png`;
      const probe = new Image();
      probe.onload = () => {
        if (!scene.scene.isActive()) return;
        if (!scene.textures.exists(key)) scene.textures.addImage(key, probe);
        this.place(scene, key, p);
      };
      probe.onerror = () => { /* silent — graybox fallback already present */ };
      probe.src = url;
    }
  },

  place(scene: Phaser.Scene, key: string, p: TilePlacement): void {
    const img = scene.add.image(p.x, p.y, key);
    const [ox, oy] = p.origin ?? [0.5, 1];
    img.setOrigin(ox, oy);
    if (p.scale != null) {
      img.setScale(p.scale);
    } else if (p.w != null && p.h != null) {
      img.setDisplaySize(p.w, p.h);
    }
    img.setDepth(p.depth ?? p.y);
    if (p.alpha != null) img.setAlpha(p.alpha);
    if (p.flipX) img.setFlipX(true);
  },
};

// AssetManifestLoader: queues + builds only the character animation sheets a
// given stage or venue actually needs. Keeps PreloadScene lean — large casts in
// future stages don't force loading unrelated fighter frames.
import Phaser from 'phaser';
import { AnimationSystem } from './AnimationSystem';
import { BRAWLER_ANIMS, VENUE_ANIMS } from '../data/animMap';
import { PLAYER_ID } from '../data/roster';
import type { StageData } from '../data/stageTypes';

export type AssetMode = 'brawler' | 'venue';

export const AssetManifestLoader = {
  // Call in a scene's preload() — queues PNGs for this stage's cast only.
  queue(scene: Phaser.Scene, stage: Pick<StageData, 'enemies'>, mode: AssetMode = 'brawler'): void {
    const anims = mode === 'brawler' ? BRAWLER_ANIMS : VENUE_ANIMS;
    for (const id of castIds(stage.enemies)) AnimationSystem.queue(scene, id, anims);
  },

  // Call in create() after the load completes — assembles Phaser anims.
  build(scene: Phaser.Scene, stage: Pick<StageData, 'enemies'>, mode: AssetMode = 'brawler'): void {
    const anims = mode === 'brawler' ? BRAWLER_ANIMS : VENUE_ANIMS;
    for (const id of castIds(stage.enemies)) AnimationSystem.build(scene, id, anims);
  },
};

function castIds(enemies: number[]): Set<number> {
  return new Set([PLAYER_ID, ...enemies]);
}

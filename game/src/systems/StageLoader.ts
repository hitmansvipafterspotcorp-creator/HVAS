// StageLoader: places a brawler stage's backdrop using a native Image probe.
// A missing PNG falls back silently to graybox — no Phaser loader error spam.
import Phaser from 'phaser';
import { ASSET_BASE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import type { StageData } from '../data/stageTypes';

export const StageLoader = {
  loadBackdrop(scene: Phaser.Scene, stage: StageData): void {
    const key = `stage_bg_${stage.id}`;
    if (scene.textures.exists(key)) {
      placeBackdrop(scene, key);
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      if (!scene.scene.isActive()) return;
      if (!scene.textures.exists(key)) scene.textures.addImage(key, probe);
      placeBackdrop(scene, key);
    };
    probe.onerror = () => {}; // silent; graybox floor already visible
    probe.src = `${ASSET_BASE}${stage.backdrop}`;
  },
};

function placeBackdrop(scene: Phaser.Scene, key: string): void {
  scene.add
    .image(0, 0, key)
    .setOrigin(0, 0)
    .setDepth(-2000)
    .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
}

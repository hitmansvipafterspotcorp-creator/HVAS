import Phaser from 'phaser';
import { SCENE } from '../config';

// BootScene: minimal, no asset loads. Sets up scale handling then hands off to
// PreloadScene. Kept separate so the very first frame can never crash on a
// missing asset.
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.Boot);
  }

  create(): void {
    this.scene.start(SCENE.Preload);
  }
}

import Phaser from 'phaser';
import { SCENE, ASSET_BASE } from '../config';

// BootScene: loads ONLY the loading-screen splash art, then hands off to
// PreloadScene which loads everything else. Kept minimal so it never crashes.
const LOADING_ART: Array<[string, string]> = [
  ['ld_logo_large',   'ui/elements/loading/ld_logo_large.png'],
  ['ld_bar_gold',     'ui/elements/loading/ld_bar_gold.png'],
  ['ld_now_loading',  'ui/elements/loading/ld_now_loading.png'],
  ['ld_tip_panel',    'ui/elements/loading/ld_tip_panel.png'],
  ['ld_skyline_strip','ui/elements/loading/ld_skyline_strip.png'],
  ['ld_spinner',      'ui/elements/loading/ld_spinner.png'],
];

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE.Boot);
  }

  preload(): void {
    for (const [key, path] of LOADING_ART) {
      this.load.image(key, `${ASSET_BASE}${path}`);
    }
  }

  create(): void {
    this.scene.start(SCENE.Preload);
  }
}

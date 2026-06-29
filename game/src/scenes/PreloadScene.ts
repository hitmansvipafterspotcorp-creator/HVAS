import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { AnimationSystem } from '../systems/AnimationSystem';
import { BRAWLER_ANIMS, VENUE_ANIMS } from '../data/animMap';
import { PLAYER_ID, ENEMY_IDS, VENUE_NPC_IDS } from '../data/roster';
import { UISystem } from '../systems/UISystem';

// PreloadScene: shows an animated HITGEAR-style logo pulse while assets load.
// Right now the brawler runs on graybox primitives (no texture loads required),
// so this scene also doubles as the animated-logo splash. Real sprite-sheet
// loads get wired here once the asset manifest lands.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENE.Preload);
  }

  preload(): void {
    // Loading bar — proves the pipeline even before real assets exist.
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const title = this.add
      .text(cx, cy - 40, 'HITMANS VIP', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '44px',
        color: '#ffd700',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 6, 'AFTER SPOT', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: '#c100ff',
      })
      .setOrigin(0.5);

    // Animated logo pulse.
    this.tweens.add({
      targets: title,
      scale: 1.06,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    const barW = 280;
    const barBg = this.add
      .rectangle(cx, cy + 60, barW, 10, COLORS.floorLine)
      .setOrigin(0.5);
    const bar = this.add
      .rectangle(cx - barW / 2, cy + 60, 1, 10, COLORS.meter)
      .setOrigin(0, 0.5);

    this.load.on('progress', (p: number) => {
      bar.width = Math.max(1, barW * p);
    });
    barBg.setData('noop', true); // referenced so it isn't tree-shaken visually

    // Queue the real UI art kit (logo, HUD, digit font).
    UISystem.queue(this);

    // Queue the real character frames the brawler + venue actually use.
    const chars = new Set<number>([
      PLAYER_ID,
      ...ENEMY_IDS,
      ...VENUE_NPC_IDS,
    ]);
    for (const id of chars) {
      AnimationSystem.queue(this, id, BRAWLER_ANIMS);
      AnimationSystem.queue(this, id, VENUE_ANIMS);
    }
  }

  create(): void {
    // All queued frames are now loaded — assemble animations once, globally.
    const chars = new Set<number>([
      PLAYER_ID,
      ...ENEMY_IDS,
      ...VENUE_NPC_IDS,
    ]);
    for (const id of chars) {
      AnimationSystem.build(this, id, BRAWLER_ANIMS);
      AnimationSystem.build(this, id, VENUE_ANIMS);
    }

    // Brief hold so the splash reads, then into the menu.
    this.time.delayedCall(600, () => this.scene.start(SCENE.MainMenu));
  }
}

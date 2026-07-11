import Phaser from 'phaser';

// First playable slice of the street-brawler: the chosen fighter walks around
// Cafe8Fifty and throws a combo. Full combat/enemies/waves come next; this
// proves the game runs embedded in the app with the real sprite frames and
// the A/B/X/Y + D-pad contract.

const GAME_W = 960;
const GAME_H = 540;
const BASE = import.meta.env.BASE_URL; // '/HVAS/'
const A = (p) => `${BASE}assets/game/${p}`;

// Fighters that already have sliced street frames (kt/kendrick pending slice).
export const GAME_FIGHTERS = new Set([
  'creator', 'dj', 'promoter', 'dancer', 'host', 'photographer', 'vendor',
  'security', 'influencer', 'famu_female', 'famu_male', 'fsu_female', 'fsu_male',
]);

export function makeBrawler(parent, fighterId) {
  class Brawler extends Phaser.Scene {
    preload() {
      this.load.image('cafe_bg', A('venues/cafe8fifty.png'));
      for (const anim of ['idle', 'walk', 'atk']) {
        for (let i = 0; i < 8; i++) {
          this.load.image(`f_${anim}_${i}`, A(`fighters/${fighterId}/${anim}_${i}.png`));
        }
      }
    }

    create() {
      // Backdrop — fill width, anchor floor near the bottom of the view.
      const bg = this.add.image(0, GAME_H, 'cafe_bg').setOrigin(0, 1);
      const bgScale = GAME_W / bg.width;
      bg.setScale(bgScale);
      if (bg.displayHeight < GAME_H) bg.setScale(GAME_H / bg.height); // never leave a gap

      const mk = (key, anim, fps, repeat) => this.anims.create({
        key,
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `f_${anim}_${i}` })),
        frameRate: fps,
        repeat,
      });
      mk('idle', 'idle', 6, -1);
      mk('walk', 'walk', 10, -1);
      mk('atk', 'atk', 16, 0);

      this.player = this.add.sprite(GAME_W * 0.32, GAME_H * 0.86, 'f_idle_0').setOrigin(0.5, 1);
      // Normalize on-screen height (~150px) regardless of the frame's native size.
      this.player.setScale(150 / this.player.height);
      this.player.play('idle');
      this.facing = 1;
      this.attacking = false;

      this.cursors = this.input.keyboard.createCursorKeys();
      this.keyJ = this.input.keyboard.addKey('J'); // A = attack
      this.floorTop = GAME_H * 0.62;
      this.floorBot = GAME_H * 0.95;

      // Simple hit spark so the attack reads as a hit.
      this.spark = this.add.circle(0, 0, 14, 0xffd66b, 0.9).setVisible(false).setDepth(99999);
    }

    doAttack() {
      if (this.attacking) return;
      this.attacking = true;
      this.player.play('atk');
      const sx = this.player.x + this.facing * 70;
      const sy = this.player.y - 70;
      this.spark.setPosition(sx, sy).setScale(0.4).setAlpha(0.9).setVisible(true);
      this.tweens.add({ targets: this.spark, scale: 1.3, alpha: 0, duration: 220, onComplete: () => this.spark.setVisible(false) });
      this.player.once('animationcomplete', () => { this.attacking = false; });
    }

    update() {
      const inp = window.__hvasInput || {};
      const L = this.cursors.left.isDown || inp.left;
      const R = this.cursors.right.isDown || inp.right;
      const U = this.cursors.up.isDown || inp.up;
      const D = this.cursors.down.isDown || inp.down;
      const attack = Phaser.Input.Keyboard.JustDown(this.keyJ) || inp.attackQueued;
      if (inp.attackQueued) inp.attackQueued = false;

      let vx = 0, vy = 0;
      const spd = 4;
      if (L) { vx = -spd; this.facing = -1; }
      if (R) { vx = spd; this.facing = 1; }
      if (U) vy = -spd * 0.6;
      if (D) vy = spd * 0.6;
      this.player.setFlipX(this.facing < 0);

      if (attack) this.doAttack();

      if (!this.attacking) {
        this.player.play((vx || vy) ? 'walk' : 'idle', true);
      }
      this.player.x = Phaser.Math.Clamp(this.player.x + vx, 60, GAME_W - 60);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, this.floorTop, this.floorBot);
      this.player.setDepth(this.player.y);
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_W,
    height: GAME_H,
    backgroundColor: '#08040f',
    pixelArt: false,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: Brawler,
  });
}

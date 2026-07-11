import Phaser from 'phaser';

// First playable slice of the street-brawler: the chosen fighter walks around
// Cafe8Fifty and throws a combo. RESIZE scale mode + a cover-fit backdrop so
// the venue fills the whole screen (no black letterbox bars) on any phone.

const BASE = import.meta.env.BASE_URL; // '/HVAS/'
const A = (p) => `${BASE}assets/game/${p}`;

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

    layout() {
      const W = this.scale.width;
      const H = this.scale.height;
      // Cover-fit the backdrop: fill both dimensions, crop the overflow, anchor
      // to the bottom so the floor + venue entrance stay framed.
      const tex = this.textures.get('cafe_bg').getSourceImage();
      const sc = Math.max(W / tex.width, H / tex.height);
      this.bg.setScale(sc).setPosition(W / 2, H);
      // Floor band the fighter can walk in.
      this.floorY = H * 0.90;
      this.floorDepth = H * 0.12;
      this.leftB = W * 0.13;
      this.rightB = W * 0.87;
      if (this.player) {
        // keep the fighter a readable size relative to the view height
        this.player.setScale(Math.min(2.4, (H * 0.30) / this.player.height / this.player.scale * this.player.scale));
        this.player.y = Math.min(this.player.y, this.floorY);
      }
    }

    create() {
      this.bg = this.add.image(0, 0, 'cafe_bg').setOrigin(0.5, 1);

      const mk = (key, anim, fps, repeat) => this.anims.create({
        key, frameRate: fps, repeat,
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `f_${anim}_${i}` })),
      });
      mk('idle', 'idle', 6, -1);
      mk('walk', 'walk', 10, -1);
      mk('atk', 'atk', 16, 0);

      this.player = this.add.sprite(this.scale.width * 0.4, this.scale.height * 0.9, 'f_idle_0').setOrigin(0.5, 1);
      const baseScale = (this.scale.height * 0.30) / this.player.height;
      this.player.setScale(Math.min(2.4, baseScale));
      this.player.play('idle');
      this.facing = 1;
      this.attacking = false;

      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D');
      this.keyJ = this.input.keyboard.addKey('J');
      this.spark = this.add.circle(0, 0, 16, 0xffd66b, 0.9).setVisible(false).setDepth(1e6);

      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    }

    doAttack() {
      if (this.attacking) return;
      this.attacking = true;
      this.player.play('atk');
      const sx = this.player.x + this.facing * this.player.displayWidth * 0.5;
      const sy = this.player.y - this.player.displayHeight * 0.5;
      this.spark.setPosition(sx, sy).setScale(0.4).setAlpha(0.9).setVisible(true);
      this.tweens.add({ targets: this.spark, scale: 1.5, alpha: 0, duration: 240, onComplete: () => this.spark.setVisible(false) });
      this.player.once('animationcomplete', () => { this.attacking = false; });
    }

    update() {
      const inp = window.__hvasInput || {};
      const L = this.cursors.left.isDown || this.wasd.A.isDown || inp.left;
      const R = this.cursors.right.isDown || this.wasd.D.isDown || inp.right;
      const U = this.cursors.up.isDown || this.wasd.W.isDown || inp.up;
      const D = this.cursors.down.isDown || this.wasd.S.isDown || inp.down;
      const attack = Phaser.Input.Keyboard.JustDown(this.keyJ) || inp.attackQueued;
      if (inp.attackQueued) inp.attackQueued = false;

      const spd = Math.max(3, this.scale.width * 0.011);
      let vx = 0, vy = 0;
      if (L) { vx = -spd; this.facing = -1; }
      if (R) { vx = spd; this.facing = 1; }
      if (U) vy = -spd * 0.55;
      if (D) vy = spd * 0.55;
      this.player.setFlipX(this.facing < 0);

      if (attack) this.doAttack();
      if (!this.attacking) this.player.play((vx || vy) ? 'walk' : 'idle', true);

      this.player.x = Phaser.Math.Clamp(this.player.x + vx, this.leftB, this.rightB);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, this.floorY - this.floorDepth, this.floorY);
      this.player.setDepth(this.player.y);
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#06030d',
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, parent, width: '100%', height: '100%' },
    scene: Brawler,
  });
}

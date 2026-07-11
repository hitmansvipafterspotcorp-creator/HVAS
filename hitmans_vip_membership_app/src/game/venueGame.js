import Phaser from 'phaser';
import { VENUES, VENUE_ASSET } from './venues.js';

const BASE = import.meta.env.BASE_URL;
const FIG = (id, anim, i) => `${BASE}assets/game/fighters/${id}/${anim}_${i}.png`;

// Shared: load a fighter's idle/walk/atk frames and build the anims.
function loadFighter(scene, fighterId) {
  for (const anim of ['idle', 'walk', 'atk']) {
    for (let i = 0; i < 8; i++) scene.load.image(`f_${anim}_${i}`, FIG(fighterId, anim, i));
  }
}
function makeFighterAnims(scene) {
  const mk = (key, prefix, fps, repeat) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({ key, frameRate: fps, repeat, frames: Array.from({ length: 8 }, (_, i) => ({ key: `${prefix}_${i}` })) });
  };
  mk('idle', 'f_idle', 6, -1); mk('walk', 'f_walk', 10, -1); mk('atk', 'f_atk', 16, 0);
}

function titleCard(scene, name) {
  const W = scene.scale.width, H = scene.scale.height;
  const t = scene.add.text(W / 2, H * 0.13, name, {
    fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.04)}px`,
    color: '#ffe8a3', stroke: '#20102e', strokeThickness: 5, align: 'center',
  }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6);
  scene.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 700, onComplete: () => t.destroy() });
}

function promptText(scene) {
  const W = scene.scale.width, H = scene.scale.height;
  return scene.add.text(W / 2, H * 0.06, '', {
    fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.028)}px`,
    color: '#fff', backgroundColor: '#20102ecc', padding: { x: 8, y: 4 },
  }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6).setVisible(false);
}

function readInput() {
  const i = window.__hvasInput || {};
  return {
    L: i.left, R: i.right, U: i.up, D: i.down,
    atk: i.attackQueued, y: i.yQueued,
  };
}

export function makeVenueGame(parent, { fighterId, venueId, onPortal }) {
  const V = VENUES[venueId] || VENUES.cafe8fifty_exterior;
  const fire = (to) => { if (onPortal) onPortal(to); };

  class Base extends Phaser.Scene {
    preload() { this.load.image('bg', VENUE_ASSET(V.bg)); loadFighter(this, fighterId); }
    keys() {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D');
      this.keyJ = this.input.keyboard.addKey('J');
      this.keyE = this.input.keyboard.addKey('E');
    }
    kbd() {
      const inp = readInput();
      return {
        L: this.cursors.left.isDown || this.wasd.A.isDown || inp.L,
        R: this.cursors.right.isDown || this.wasd.D.isDown || inp.R,
        U: this.cursors.up.isDown || this.wasd.W.isDown || inp.U,
        D: this.cursors.down.isDown || this.wasd.S.isDown || inp.D,
        atk: Phaser.Input.Keyboard.JustDown(this.keyJ) || inp.atk,
        interact: Phaser.Input.Keyboard.JustDown(this.keyE) || inp.y,
      };
    }
    consume() { const i = window.__hvasInput || {}; i.attackQueued = false; i.yQueued = false; }
  }

  class ExteriorBrawler extends Base {
    layout() {
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get('bg').getSourceImage();
      const s = H / img.height;
      this.bg.setScale(s).setPosition(0, 0);
      this.worldW = img.width * s;
      this.floorY = H * (V.floorY || 0.9);
      this.laneDepth = H * (V.laneDepth || 0.08);
      this.leftB = W * 0.04; this.rightB = this.worldW - W * 0.04;
      // single-door exterior: the door is the end of the block — stop there so
      // you can't overshoot past the entrance.
      const dd = V.doors || [];
      if (dd.length === 1) this.rightB = Math.min(this.rightB, this.worldW * dd[0].x + W * 0.06);
      this.cameras.main.setBounds(0, 0, Math.max(this.worldW, W), H);
      if (this.player) this.player.setScale((H * 0.3) / this.player.height);
    }
    create() {
      makeFighterAnims(this);
      this.bg = this.add.image(0, 0, 'bg').setOrigin(0, 0);
      this.player = this.add.sprite(0, 0, 'f_idle_0').setOrigin(0.5, 1).play('idle');
      this.facing = 1; this.attacking = false;
      this.spark = this.add.circle(0, 0, 16, 0xffd66b, 0.9).setVisible(false).setDepth(1e6);
      this.keys();
      this.prompt = promptText(this);
      this.layout();
      this.player.setPosition(this.leftB + 40, this.floorY);
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      // door markers
      this.doors = (V.doors || []).map((d) => {
        const wx = this.worldW * d.x;
        const glow = this.add.ellipse(wx, this.floorY, this.scale.width * 0.16, this.scale.height * 0.04, 0xba6bff, 0.4).setDepth(1);
        return { ...d, wx, glow };
      });
      titleCard(this, V.name);
      this.canPortal = false; this.time.delayedCall(500, () => { this.canPortal = true; });
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    }
    doAttack() {
      if (this.attacking) return; this.attacking = true; this.player.play('atk');
      const reach = this.player.displayWidth * 0.55;
      this.spark.setPosition(this.player.x + this.facing * reach, this.player.y - this.player.displayHeight * 0.5).setScale(0.4).setAlpha(0.9).setVisible(true);
      this.tweens.add({ targets: this.spark, scale: 1.6, alpha: 0, duration: 220, onComplete: () => this.spark.setVisible(false) });
      this.player.once('animationcomplete', () => { this.attacking = false; });
    }
    update() {
      const k = this.kbd();
      const spd = Math.max(3, this.scale.width * 0.012);
      let vx = 0, vy = 0;
      if (k.L) { vx = -spd; this.facing = -1; }
      if (k.R) { vx = spd; this.facing = 1; }
      if (k.U) vy = -spd * 0.5;
      if (k.D) vy = spd * 0.5;
      this.player.setFlipX(this.facing < 0);
      if (k.atk) this.doAttack();
      if (!this.attacking) this.player.play((vx || vy) ? 'walk' : 'idle', true);
      this.player.x = Phaser.Math.Clamp(this.player.x + vx, this.leftB, this.rightB);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, this.floorY - this.laneDepth, this.floorY);
      this.player.setDepth(this.player.y);
      // nearest door
      let near = null;
      for (const d of this.doors) if (Math.abs(this.player.x - d.wx) < this.scale.width * 0.16) near = d;
      if (near) { this.prompt.setText(`Y — enter ${near.label}`).setVisible(true); if (this.canPortal && k.interact) { this.consume(); fire(near.to); } }
      else this.prompt.setVisible(false);
      this.consume();
    }
  }

  class InteriorTopDown extends Base {
    layout() {
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get('bg').getSourceImage();
      const s = Math.min(W / img.width, H / img.height);
      this.bg.setScale(s).setPosition(W / 2, H / 2);
      this.roomW = img.width * s; this.roomH = img.height * s;
      this.rx0 = (W - this.roomW) / 2; this.ry0 = (H - this.roomH) / 2;
      // walkable inset (avoid the outer wall band)
      const mx = this.roomW * 0.1, myTop = this.roomH * 0.28, myBot = this.roomH * 0.08;
      this.walk = { x0: this.rx0 + mx, x1: this.rx0 + this.roomW - mx, y0: this.ry0 + myTop, y1: this.ry0 + this.roomH - myBot };
      this.doorPts = (V.doors || []).map((d) => ({ ...d, sx: this.rx0 + d.x * this.roomW, sy: this.ry0 + d.y * this.roomH }));
      if (this.player) this.player.setScale((H * 0.16) / this.player.height);
    }
    create() {
      makeFighterAnims(this);
      this.bg = this.add.image(0, 0, 'bg').setOrigin(0.5, 0.5);
      this.player = this.add.sprite(0, 0, 'f_idle_0').setOrigin(0.5, 1).play('idle');
      this.facing = 1;
      this.keys();
      this.prompt = promptText(this);
      this.layout();
      const sp = V.spawn || { x: 0.5, y: 0.8 };
      this.player.setPosition(this.rx0 + sp.x * this.roomW, this.ry0 + sp.y * this.roomH);
      // door glows
      this.glows = this.doorPts.map((d) => this.add.ellipse(d.sx, d.sy, this.scale.width * 0.1, this.scale.height * 0.03, 0xba6bff, 0.4).setDepth(0.5));
      titleCard(this, V.name);
      this.canPortal = false; this.time.delayedCall(500, () => { this.canPortal = true; });
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    }
    update() {
      const k = this.kbd();
      const spd = Math.max(2.4, this.scale.height * 0.007);
      let vx = 0, vy = 0;
      if (k.L) { vx = -spd; this.facing = -1; }
      if (k.R) { vx = spd; this.facing = 1; }
      if (k.U) vy = -spd;
      if (k.D) vy = spd;
      this.player.setFlipX(this.facing < 0);
      this.player.play((vx || vy) ? 'walk' : 'idle', true);
      this.player.x = Phaser.Math.Clamp(this.player.x + vx, this.walk.x0, this.walk.x1);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, this.walk.y0, this.walk.y1);
      this.player.setDepth(this.player.y);
      let near = null;
      for (const d of this.doorPts) if (Phaser.Math.Distance.Between(this.player.x, this.player.y, d.sx, d.sy) < this.scale.width * 0.11) near = d;
      if (near) { this.prompt.setText(`Y — ${near.label}`).setVisible(true); if (this.canPortal && k.interact) { this.consume(); fire(near.to); } }
      else this.prompt.setVisible(false);
      this.consume();
    }
  }

  const Scene = V.mode === 'topdown' ? InteriorTopDown : ExteriorBrawler;
  return new Phaser.Game({
    type: Phaser.AUTO, backgroundColor: '#08040e', roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, parent, width: '100%', height: '100%' },
    scene: Scene,
  });
}

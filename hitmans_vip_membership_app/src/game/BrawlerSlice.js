import Phaser from 'phaser';

// Side-scroller brawler slice. The block scrolls as you walk it: a wide
// backdrop, a camera that follows you, a floor lane, goon enemies to clear,
// and a door at the end you reach to finish the stage.
//
// Venues never share art. Each is its own entry in VENUES with its own
// backdrop, floor line, and door position — Cafe8Fifty stays Cafe8Fifty,
// Kingdom Come stays Kingdom Come. Add a venue = add a row here.

const BASE = import.meta.env.BASE_URL; // '/HVAS/'
const A = (p) => `${BASE}assets/game/${p}`;

// Fighters that have sliced idle/walk/atk game frames.
export const GAME_FIGHTERS = new Set([
  'creator', 'dj', 'promoter', 'dancer', 'host', 'photographer', 'vendor',
  'security', 'influencer', 'famu_female', 'famu_male', 'fsu_female', 'fsu_male',
  'kt', 'kendrick',
]);

// Per-venue stage definitions. `scroll:true` => wide side-scroller block.
// floor/door/enter are fractions of the scaled stage so any backdrop drops in.
export const VENUES = {
  social_gaines: {
    name: 'Social Gaines',
    goal: 'Walk the block → reach the doors',
    bg: 'venues/social_gaines.png',
    scroll: true,
    floorY: 0.92,      // walk lane baseline (fraction of stage height)
    laneDepth: 0.08,   // how far up/down the lane the fighter can shift
    doorX: 0.5,        // the double doors sit mid-block
    waves: 0,          // goons off until real, distinct enemy art exists
  },
  cafe8fifty: {
    name: 'Cafe8Fifty',
    goal: 'Back to HITMANS by 2AM',
    bg: 'venues/cafe8fifty.png',
    scroll: false,     // single-screen intro, art untouched
    floorY: 0.90,
    laneDepth: 0.10,
    doorX: 0.5,
    waves: 0,
  },
};

const ENEMY_ID = 'security'; // stand-in goon art until enemy sheets land

export function makeBrawler(parent, fighterId, venueId = 'social_gaines') {
  const V = VENUES[venueId] || VENUES.social_gaines;

  class Brawler extends Phaser.Scene {
    preload() {
      this.load.image('stage_bg', A(V.bg));
      for (const anim of ['idle', 'walk', 'atk']) {
        for (let i = 0; i < 8; i++) {
          this.load.image(`f_${anim}_${i}`, A(`fighters/${fighterId}/${anim}_${i}.png`));
          if (V.scroll) this.load.image(`e_${anim}_${i}`, A(`fighters/${ENEMY_ID}/${anim}_${i}.png`));
        }
      }
    }

    makeAnims() {
      const mk = (key, prefix, fps, repeat) => {
        if (this.anims.exists(key)) return;
        this.anims.create({
          key, frameRate: fps, repeat,
          frames: Array.from({ length: 8 }, (_, i) => ({ key: `${prefix}_${i}` })),
        });
      };
      mk('idle', 'f_idle', 6, -1);
      mk('walk', 'f_walk', 10, -1);
      mk('atk', 'f_atk', 16, 0);
      if (V.scroll) {
        mk('e_idle', 'e_idle', 5, -1);
        mk('e_walk', 'e_walk', 8, -1);
        mk('e_atk', 'e_atk', 14, 0);
      }
    }

    layout() {
      const W = this.scale.width, H = this.scale.height;
      const bg = this.textures.get('stage_bg').getSourceImage();
      if (V.scroll) {
        // fill height, keep width => world is wider than the view => scrolls
        const s = H / bg.height;
        this.bg.setScale(s).setPosition(0, 0);
        this.worldW = bg.width * s;
      } else {
        // cover-fit single screen (unchanged Cafe8Fifty look)
        const s = Math.max(W / bg.width, H / bg.height);
        this.bg.setScale(s).setPosition(W / 2, H);
        this.worldW = W;
      }
      this.floorY = H * V.floorY;
      this.laneDepth = H * V.laneDepth;
      this.leftB = W * 0.05;
      this.rightB = this.worldW - W * 0.05;
      this.doorWorldX = this.worldW * V.doorX;
      this.cameras.main.setBounds(0, 0, Math.max(this.worldW, W), H);
      const targetH = H * 0.30;
      if (this.player) this.player.setScale(targetH / this.player.height);
      for (const e of this.enemies || []) e.spr.setScale((H * 0.31) / e.spr.height);
      if (this.doorGlow) this.doorGlow.setPosition(this.doorWorldX, this.floorY);
    }

    create() {
      const W = this.scale.width, H = this.scale.height;
      this.bg = this.add.image(0, 0, 'stage_bg').setOrigin(V.scroll ? 0 : 0.5, V.scroll ? 0 : 1);
      this.makeAnims();

      this.enemies = [];
      this.player = this.add.sprite(0, 0, 'f_idle_0').setOrigin(0.5, 1).play('idle');
      this.facing = 1; this.attacking = false; this.cleared = 0;
      this.spark = this.add.circle(0, 0, 16, 0xffd66b, 0.9).setVisible(false).setDepth(1e6);

      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D');
      this.keyJ = this.input.keyboard.addKey('J');

      // banner text (fixed to camera)
      this.banner = this.add.text(W / 2, H * 0.14, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.035)}px`,
        color: '#ffe8a3', stroke: '#20102e', strokeThickness: 4, align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6);

      this.layout();
      this.player.setPosition(this.leftB + 40, this.floorY);

      if (V.scroll) {
        this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
        this.remaining = V.waves;
        // door glow marker at the entrance
        this.doorGlow = this.add.ellipse(this.doorWorldX, this.floorY, W * 0.22, H * 0.05, 0xba6bff, V.waves > 0 ? 0.0 : 0.45);
        if (V.waves > 0) {
          for (let i = 0; i < V.waves; i++) this.spawnEnemy(this.worldW * (0.42 + 0.14 * i));
          this.setBanner(`${V.name}\n${this.remaining} in your way`);
        } else {
          this.setBanner(`${V.name}\nwalk the block →`);
        }
      }
      this.player.setDepth(this.player.y);

      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    }

    setBanner(t) { if (this.banner) this.banner.setText(t); }

    spawnEnemy(worldX) {
      const H = this.scale.height;
      const spr = this.add.sprite(worldX, this.floorY, 'e_idle_0').setOrigin(0.5, 1).play('e_idle');
      spr.setScale((H * 0.31) / spr.height);
      spr.setTint(0xff8a8a); // reddish so goons read as opponents
      this.enemies.push({ spr, hp: 3, face: -1, cd: 0, dead: false });
    }

    doAttack() {
      if (this.attacking) return;
      this.attacking = true;
      this.player.play('atk');
      const reach = this.player.displayWidth * 0.55;
      const sx = this.player.x + this.facing * reach;
      const sy = this.player.y - this.player.displayHeight * 0.5;
      this.spark.setPosition(sx, sy).setScale(0.4).setAlpha(0.9).setVisible(true);
      this.tweens.add({ targets: this.spark, scale: 1.6, alpha: 0, duration: 220, onComplete: () => this.spark.setVisible(false) });
      // hit any goon in front within reach
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.spr.x - this.player.x;
        const near = Math.abs(dx) < reach + e.spr.displayWidth * 0.4 && Math.sign(dx) === this.facing;
        const sameLane = Math.abs(e.spr.y - this.player.y) < this.laneDepth + 8;
        if (near && sameLane) this.hitEnemy(e);
      }
      this.player.once('animationcomplete', () => { this.attacking = false; });
    }

    hitEnemy(e) {
      e.hp -= 1;
      this.cameras.main.shake(90, 0.006);
      this.tweens.add({ targets: e.spr, x: e.spr.x + this.facing * 22, duration: 90, yoyo: true });
      e.spr.setTint(0xffffff);
      this.time.delayedCall(70, () => { if (!e.dead) e.spr.setTint(0xff8a8a); });
      if (e.hp <= 0) {
        e.dead = true;
        this.tweens.add({ targets: e.spr, alpha: 0, angle: this.facing * 70, y: e.spr.y + 10, duration: 320, onComplete: () => e.spr.destroy() });
        this.remaining -= 1;
        if (this.remaining <= 0) { this.doorGlow.setFillStyle(0xba6bff, 0.5); this.setBanner('Block clear — reach the doors →'); }
        else this.setBanner(`${this.remaining} in your way`);
      }
    }

    update() {
      const inp = window.__hvasInput || {};
      const L = this.cursors.left.isDown || this.wasd.A.isDown || inp.left;
      const R = this.cursors.right.isDown || this.wasd.D.isDown || inp.right;
      const U = this.cursors.up.isDown || this.wasd.W.isDown || inp.up;
      const D = this.cursors.down.isDown || this.wasd.S.isDown || inp.down;
      const attack = Phaser.Input.Keyboard.JustDown(this.keyJ) || inp.attackQueued;
      if (inp.attackQueued) inp.attackQueued = false;

      const spd = Math.max(3, this.scale.width * 0.012);
      let vx = 0, vy = 0;
      if (L) { vx = -spd; this.facing = -1; }
      if (R) { vx = spd; this.facing = 1; }
      if (U) vy = -spd * 0.5;
      if (D) vy = spd * 0.5;
      this.player.setFlipX(this.facing < 0);
      if (attack) this.doAttack();
      if (!this.attacking) this.player.play((vx || vy) ? 'walk' : 'idle', true);

      this.player.x = Phaser.Math.Clamp(this.player.x + vx, this.leftB, this.rightB);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, this.floorY - this.laneDepth, this.floorY);
      this.player.setDepth(this.player.y);

      if (V.scroll) this.updateEnemies(spd);
    }

    updateEnemies(spd) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = this.player.x - e.spr.x;
        const dy = this.player.y - e.spr.y;
        const dist = Math.abs(dx);
        e.face = dx < 0 ? -1 : 1;
        e.spr.setFlipX(e.face > 0); // security art faces left by default
        if (dist > e.spr.displayWidth * 0.6) {
          e.spr.x += Math.sign(dx) * spd * 0.45;
          e.spr.y += Math.sign(dy) * Math.min(Math.abs(dy), spd * 0.3);
          if (!e.atk) e.spr.play('e_walk', true);
        } else {
          if (!e.atk) e.spr.play('e_idle', true);
        }
        e.spr.setDepth(e.spr.y);
      }
      // reached the doors after clearing
      if (this.remaining <= 0 && !this.done && this.player.x > this.doorWorldX - this.scale.width * 0.06) {
        this.done = true;
        this.setBanner(`You made it into\n${V.name}`);
        window.__hvasStageDone = true;
      }
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#0a0410',
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, parent, width: '100%', height: '100%' },
    scene: Brawler,
  });
}

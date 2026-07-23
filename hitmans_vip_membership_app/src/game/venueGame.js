import Phaser from 'phaser';
import { VENUES, VENUE_ASSET } from './venues.js';
import { joinVenue, socialEnabled } from './social.js';

const BASE = import.meta.env.BASE_URL;
const FIG = (id, anim, i) => `${BASE}assets/game/fighters/${id}/${anim}_${i}.png`;
const TOPDOWN = (id, row, i) => `${BASE}assets/game/topdown/${id}/r${String(row).padStart(2, '0')}_f${String(i).padStart(2, '0')}.png`;
const PORTRAIT = (id) => `${BASE}assets/fighters/${id}.png`;
const selfMemberId = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_member_id')) || '';
const TOPDOWN_ROWS = {
  idle_s: 0, idle_n: 1, idle_w: 2, idle_e: 3,
  walk_s: 4, walk_n: 5, walk_w: 6, walk_e: 7,
};

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
function loadTopDownFighter(scene, fighterId) {
  for (const [anim, row] of Object.entries(TOPDOWN_ROWS)) {
    for (let i = 0; i < 8; i++) scene.load.image(`f_td_${anim}_${i}`, TOPDOWN(fighterId, row, i));
  }
}
function makeTopDownAnims(scene) {
  for (const anim of Object.keys(TOPDOWN_ROWS)) {
    const key = `td_${anim}`;
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frameRate: anim.startsWith('walk') ? 10 : 6,
      repeat: -1,
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `f_td_${anim}_${i}` })),
    });
  }
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
    preload() {
      this.load.image('bg', VENUE_ASSET(V.bg));
    }
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
    preload() {
      super.preload();
      loadFighter(this, fighterId);
      for (const id of ['security', 'promoter', 'vendor']) this.load.image(`enemy_${id}`, PORTRAIT(id));
    }
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
      this.initStreetFight();
      titleCard(this, V.name);
      this.canPortal = false; this.time.delayedCall(500, () => { this.canPortal = true; });
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    }
    initStreetFight() {
      const W = this.scale.width, H = this.scale.height;
      this.playerHp = 5;
      this.waveDone = false;
      this.fightArmed = false;
      this.enemyHitCooldown = 0;
      this.objective = this.add.text(14, 14, 'CLEAR THE ENTRY LINE', {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.026)}px`,
        color: '#ffe8a3', stroke: '#13031e', strokeThickness: 5,
      }).setScrollFactor(0).setDepth(1e6);
      this.healthText = this.add.text(14, 14 + H * 0.038, 'VIP HEALTH 5/5', {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.02)}px`,
        color: '#52ffa8', stroke: '#13031e', strokeThickness: 4,
      }).setScrollFactor(0).setDepth(1e6);
      const crew = ['security', 'promoter', 'vendor'];
      this.enemies = crew.map((id, index) => {
        const spawnX = Phaser.Math.Clamp(this.leftB + W * (0.78 + index * 0.26), this.leftB + W * 0.58, this.rightB - W * 0.08);
        const sprite = this.add.image(spawnX, this.floorY - (index % 2) * this.laneDepth * 0.55, `enemy_${id}`).setOrigin(0.5, 1);
        sprite.setScale((H * 0.22) / sprite.height).setDepth(sprite.y);
        const label = this.add.text(sprite.x, sprite.y - sprite.displayHeight - 6, ['Line Breaker', 'List Crasher', 'Side Hustler'][index], {
          fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.018)}px`,
          color: '#ffd66b', stroke: '#13031e', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(1e5);
        const barBg = this.add.rectangle(sprite.x, label.y + 3, 58, 5, 0x19071f, 0.95).setOrigin(0.5, 0).setDepth(1e5);
        const bar = this.add.rectangle(sprite.x - 29, label.y + 3, 58, 5, 0xff3b8b, 0.95).setOrigin(0, 0).setDepth(1e5 + 1);
        return { id, sprite, label, barBg, bar, hp: 3, maxHp: 3, cooldown: 0, ko: false };
      });
      this.time.delayedCall(1200, () => { this.fightArmed = true; });
    }
    enemyScale() { return (this.scale.height * 0.22); }
    floatText(x, y, text, color = '#ffe8a3') {
      const t = this.add.text(x, y, text, {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(this.scale.height * 0.026)}px`,
        fontStyle: '800', color, stroke: '#13031e', strokeThickness: 5,
      }).setOrigin(0.5).setDepth(1e6);
      this.tweens.add({ targets: t, y: y - this.scale.height * 0.08, alpha: 0, duration: 620, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }
    updateEnemyHud(enemy) {
      const { sprite, label, barBg, bar } = enemy;
      label.setPosition(sprite.x, sprite.y - sprite.displayHeight - 6);
      barBg.setPosition(sprite.x, label.y + 3);
      bar.setPosition(sprite.x - 29, label.y + 3);
      bar.width = 58 * Math.max(0, enemy.hp / enemy.maxHp);
    }
    resolveHits() {
      let hit = false;
      const reach = this.player.displayWidth * 0.72;
      for (const enemy of this.enemies) {
        if (enemy.ko) continue;
        const dx = enemy.sprite.x - this.player.x;
        const dy = Math.abs(enemy.sprite.y - this.player.y);
        if (Math.sign(dx || this.facing) === this.facing && Math.abs(dx) < reach && dy < this.laneDepth + this.player.displayHeight * 0.12) {
          hit = true;
          enemy.hp -= 1;
          enemy.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
          this.time.delayedCall(80, () => enemy.sprite.clearTint());
          this.floatText(enemy.sprite.x, enemy.sprite.y - enemy.sprite.displayHeight * 0.55, enemy.hp <= 0 ? 'KO' : 'HIT', enemy.hp <= 0 ? '#ffd66b' : '#ff8be8');
          this.updateEnemyHud(enemy);
          if (enemy.hp <= 0) {
            enemy.ko = true;
            enemy.label.destroy(); enemy.barBg.destroy(); enemy.bar.destroy();
            this.tweens.add({ targets: enemy.sprite, alpha: 0.25, y: enemy.sprite.y + 12, angle: this.facing * 8, duration: 240 });
          }
        }
      }
      if (hit) this.cameras.main.shake(90, 0.003);
      if (!this.waveDone && this.enemies.every((e) => e.ko)) {
        this.waveDone = true;
        this.objective.setText('STREET CLEAR - ENTER THE DOOR');
        this.floatText(this.player.x + this.scale.width * 0.08, this.player.y - this.player.displayHeight, 'ENTRY LINE CLEARED', '#52ffa8');
      }
    }
    updateEnemies() {
      if (!this.enemies) return;
      const now = this.time.now;
      for (const enemy of this.enemies) {
        if (enemy.ko) continue;
        const sprite = enemy.sprite;
        const dx = this.player.x - sprite.x;
        const dy = this.player.y - sprite.y;
        const dist = Math.hypot(dx, dy);
        const keep = this.player.displayWidth * 0.58;
        if (dist > keep) {
          sprite.x += Math.sign(dx) * Math.min(Math.abs(dx), this.scale.width * 0.0022);
          sprite.y += Math.sign(dy) * Math.min(Math.abs(dy), this.scale.height * 0.0014);
          sprite.setFlipX(dx < 0);
        } else if (this.fightArmed && now > enemy.cooldown) {
          enemy.cooldown = now + 900;
          this.playerHp = Math.max(0, this.playerHp - 1);
          this.healthText.setText(`VIP HEALTH ${this.playerHp}/5`);
          this.healthText.setColor(this.playerHp <= 2 ? '#ff5f6d' : '#52ffa8');
          this.player.setTint(0xff5f6d).setTintMode(Phaser.TintModes.FILL);
          this.time.delayedCall(80, () => this.player.clearTint());
          this.cameras.main.shake(110, 0.004);
          this.floatText(this.player.x, this.player.y - this.player.displayHeight * 0.75, this.playerHp ? '-1' : 'RESET', '#ff5f6d');
          if (!this.playerHp) {
            this.playerHp = 5;
            this.healthText.setText('VIP HEALTH 5/5');
            this.healthText.setColor('#52ffa8');
            this.player.setPosition(this.leftB + 40, this.floorY);
          }
        }
        sprite.setDepth(sprite.y);
        this.updateEnemyHud(enemy);
      }
    }
    doAttack() {
      if (this.attacking) return; this.attacking = true; this.player.play('atk');
      const reach = this.player.displayWidth * 0.55;
      this.spark.setPosition(this.player.x + this.facing * reach, this.player.y - this.player.displayHeight * 0.5).setScale(0.4).setAlpha(0.9).setVisible(true);
      this.tweens.add({ targets: this.spark, scale: 1.6, alpha: 0, duration: 220, onComplete: () => this.spark.setVisible(false) });
      this.resolveHits();
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
      this.updateEnemies();
      // nearest door
      let near = null;
      for (const d of this.doors) if (Math.abs(this.player.x - d.wx) < this.scale.width * 0.16) near = d;
      if (near) { this.prompt.setText(`Y — enter ${near.label}`).setVisible(true); if (this.canPortal && k.interact) { this.consume(); fire(near.to); } }
      else this.prompt.setVisible(false);
      this.consume();
    }
  }

  class InteriorTopDown extends Base {
    preload() {
      super.preload();
      loadTopDownFighter(this, fighterId);
    }
    layout() {
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get('bg').getSourceImage();
      const s = Math.max(W / img.width, H / img.height) * (V.zoom || 1.28);
      this.bg.setScale(s).setPosition(0, 0);
      this.roomW = img.width * s; this.roomH = img.height * s;
      this.rx0 = 0; this.ry0 = 0;
      const walk = V.walk || {};
      const x0 = walk.x0 ?? 0.08, x1 = walk.x1 ?? 0.92, y0 = walk.y0 ?? 0.18, y1 = walk.y1 ?? 0.91;
      this.walk = { x0: this.roomW * x0, x1: this.roomW * x1, y0: this.roomH * y0, y1: this.roomH * y1 };
      this.doorPts = (V.doors || []).map((d) => ({ ...d, sx: this.rx0 + d.x * this.roomW, sy: this.ry0 + d.y * this.roomH }));
      this.cameras.main.setBounds(0, 0, Math.max(this.roomW, W), Math.max(this.roomH, H));
      if (this.player) this.player.setScale(Phaser.Math.Clamp((H * 0.13) / this.player.height, 0.5, 1.6));
      if (this.glows) {
        this.glows.forEach((glow, i) => {
          const d = this.doorPts[i];
          if (d) glow.setPosition(d.sx, d.sy).setDisplaySize(W * 0.12, H * 0.04);
        });
      }
    }
    create() {
      makeTopDownAnims(this);
      this.bg = this.add.image(0, 0, 'bg').setOrigin(0, 0);
      this.player = this.add.sprite(0, 0, 'f_td_idle_s_0').setOrigin(0.5, 1).play('td_idle_s');
      this.dir = 's';
      this.keys();
      this.prompt = promptText(this);
      this.layout();
      const sp = V.spawn || { x: 0.5, y: 0.8 };
      this.player.setPosition(this.rx0 + sp.x * this.roomW, this.ry0 + sp.y * this.roomH);
      this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
      // door glows
      this.glows = this.doorPts.map((d) => this.add.ellipse(d.sx, d.sy, this.scale.width * 0.1, this.scale.height * 0.03, 0xba6bff, 0.4).setDepth(0.5));
      titleCard(this, V.name);
      this.canPortal = false; this.time.delayedCall(500, () => { this.canPortal = true; });
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => { this.scale.off('resize', this.layout, this); this.social?.leave(); });
      this.initSocial();
    }
    // ── member networking: other members appear here as their characters ──
    initSocial() {
      this.remotes = new Map();       // memberId -> { sprite, label, target, bubble }
      this.selfId = selfMemberId();
      this.lastPing = 0;
      if (!socialEnabled()) return;
      this.social = joinVenue(venueId, {
        onMembers: (list) => this.syncRemotes(list),
        onChat: (m) => this.showBubble(m.from, m.body),
      });
    }
    remoteFrac(x, y) { return { sx: this.rx0 + x * this.roomW, sy: this.ry0 + y * this.roomH }; }
    syncRemotes(list) {
      const seen = new Set();
      for (const m of list) {
        if (!m.id || m.id === this.selfId) continue;
        seen.add(m.id);
        const { sx, sy } = this.remoteFrac(m.x ?? 0.5, m.y ?? 0.5);
        let r = this.remotes.get(m.id);
        if (!r) {
          const label = this.add.text(0, 0, m.name || 'Member', {
            fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(this.scale.height * 0.02)}px`,
            color: m.vip ? '#ffd66b' : '#e7dcff', stroke: '#20102e', strokeThickness: 4,
          }).setOrigin(0.5, 1).setDepth(1e5);
          const dot = this.add.circle(0, 0, Math.max(6, this.scale.height * 0.012), m.vip ? 0xffd66b : 0x8f6bff, 0.9).setDepth(1);
          r = { dot, label, target: { sx, sy }, avatar: m.avatar, bubble: null };
          this.remotes.set(m.id, r);
          this.loadRemoteAvatar(r, m.avatar);
        }
        r.target = { sx, sy };
      }
      for (const [id, r] of this.remotes) if (!seen.has(id)) { r.dot.destroy(); r.label.destroy(); r.sprite?.destroy(); r.bubble?.destroy(); this.remotes.delete(id); }
    }
    loadRemoteAvatar(r, avatar) {
      if (!avatar) return;
      const key = `rf_td_${avatar}_idle_s_0`;
      const attach = () => {
        if (r.dot?.active) r.dot.destroy();
        r.sprite = this.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(1);
        r.sprite.setScale(Phaser.Math.Clamp((this.scale.height * 0.105) / r.sprite.height, 0.45, 1.4));
      };
      if (this.textures.exists(key)) return attach();
      this.load.image(key, TOPDOWN(avatar, TOPDOWN_ROWS.idle_s, 0));
      this.load.once('complete', () => { if (this.remotes.has([...this.remotes].find(([, v]) => v === r)?.[0])) attach(); });
      this.load.start();
    }
    showBubble(fromId, text) {
      const r = this.remotes.get(fromId); if (!r) return;
      r.bubble?.destroy();
      r.bubble = this.add.text(0, 0, String(text).slice(0, 80), {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(this.scale.height * 0.02)}px`,
        color: '#fff', backgroundColor: '#20102ee6', padding: { x: 7, y: 4 }, wordWrap: { width: this.scale.width * 0.3 },
      }).setOrigin(0.5, 1).setDepth(1e5);
      this.time.delayedCall(5000, () => { if (r.bubble) { r.bubble.destroy(); r.bubble = null; } });
    }
    drawRemotes() {
      for (const r of this.remotes.values()) {
        const node = r.sprite || r.dot;
        node.x += (r.target.sx - node.x) * 0.2;
        node.y += (r.target.sy - node.y) * 0.2;
        node.setDepth(node.y);
        r.label.setPosition(node.x, node.y - (r.sprite ? r.sprite.displayHeight : 14) - 2).setDepth(node.y + 1);
        if (r.bubble) r.bubble.setPosition(node.x, r.label.y - r.label.height - 2).setDepth(1e5);
      }
    }
    nearestRemote() {
      let best = null, bd = this.scale.width * 0.09;
      for (const [id, r] of this.remotes) {
        const node = r.sprite || r.dot;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, node.x, node.y);
        if (d < bd) { bd = d; best = { id, label: r.label.text }; }
      }
      return best;
    }
    update() {
      const k = this.kbd();
      const spd = Math.max(2.4, this.scale.height * 0.007);
      let vx = 0, vy = 0;
      if (k.L) { vx = -spd; this.facing = -1; }
      if (k.R) { vx = spd; this.facing = 1; }
      if (k.U) vy = -spd;
      if (k.D) vy = spd;
      if (vx && vy) { vx *= 0.707; vy *= 0.707; }
      if (Math.abs(vx) > Math.abs(vy)) this.dir = vx < 0 ? 'w' : 'e';
      else if (vy) this.dir = vy < 0 ? 'n' : 's';
      this.player.play(`td_${(vx || vy) ? 'walk' : 'idle'}_${this.dir}`, true);
      this.player.x = Phaser.Math.Clamp(this.player.x + vx, this.walk.x0, this.walk.x1);
      this.player.y = Phaser.Math.Clamp(this.player.y + vy, this.walk.y0, this.walk.y1);
      this.player.setDepth(this.player.y);
      // networking: animate other members + ping my position (throttled)
      this.drawRemotes();
      if (this.social && this.time.now - this.lastPing > 350) {
        this.lastPing = this.time.now;
        const fx = (this.player.x - this.rx0) / this.roomW, fy = (this.player.y - this.ry0) / this.roomH;
        this.social.ping(fighterId, +fx.toFixed(3), +fy.toFixed(3));
      }
      // prompt: a door takes priority; otherwise a nearby member to link with
      let near = null;
      for (const d of this.doorPts) if (Phaser.Math.Distance.Between(this.player.x, this.player.y, d.sx, d.sy) < this.scale.width * 0.11) near = d;
      if (near) { this.prompt.setText(`Y — ${near.label}`).setVisible(true); if (this.canPortal && k.interact) { this.consume(); fire(near.to); } }
      else {
        const peer = this.social ? this.nearestRemote() : null;
        if (peer) { this.prompt.setText(`Y — link with ${peer.label}`).setVisible(true); if (k.interact) { this.consume(); this.social.link(peer.id); } }
        else this.prompt.setVisible(false);
      }
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

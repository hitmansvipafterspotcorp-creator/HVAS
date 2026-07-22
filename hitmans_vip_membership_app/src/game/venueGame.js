import Phaser from 'phaser';
import { VENUES, VENUE_ASSET } from './venues.js';
import { joinVenue, socialEnabled } from './social.js';

const BASE = import.meta.env.BASE_URL;
const FIG = (id, anim, i) => `${BASE}assets/game/fighters/${id}/${anim}_${i}.png`;
const selfMemberId = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_member_id')) || '';

// Shared: load a fighter's idle/walk/atk frames and build the anims. `p` is the
// texture-key prefix ('f' = player, 'e' = enemy) so a stage can hold both.
function loadFighter(scene, fighterId, p = 'f') {
  for (const anim of ['idle', 'walk', 'atk']) {
    for (let i = 0; i < 8; i++) scene.load.image(`${p}_${anim}_${i}`, FIG(fighterId, anim, i));
  }
}
function makeFighterAnims(scene, p = 'f', animPrefix = '') {
  const mk = (key, prefix, fps, repeat) => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({ key, frameRate: fps, repeat, frames: Array.from({ length: 8 }, (_, i) => ({ key: `${prefix}_${i}` })) });
  };
  mk(`${animPrefix}idle`, `${p}_idle`, 6, -1); mk(`${animPrefix}walk`, `${p}_walk`, 10, -1); mk(`${animPrefix}atk`, `${p}_atk`, 16, 0);
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
  // enemies use a different fighter so the roster reads as a crowd of opps
  const ENEMY_ID = fighterId === 'fsu_male' ? 'famu_male' : 'fsu_male';

  class Base extends Phaser.Scene {
    preload() {
      this.load.image('bg', VENUE_ASSET(V.bg));
      loadFighter(this, fighterId, 'f');
      if (V.mode !== 'topdown') loadFighter(this, ENEMY_ID, 'e');  // brawler stages fight
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
    layout() {
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get('bg').getSourceImage();
      const s = Math.max(W / img.width, H / img.height);   // COVER: fill the screen, no black bars
      this.bg.setScale(s).setOrigin(0, 1).setPosition(0, H); // anchor the floor to the bottom, crop sky
      this.worldW = img.width * s;
      this.floorY = H * (V.floorY || 0.9);
      this.laneDepth = H * (V.laneDepth || 0.09);
      this.leftB = W * 0.04; this.rightB = this.worldW - W * 0.04;
      const dd = V.doors || [];
      if (dd.length === 1) this.rightB = Math.min(this.rightB, this.worldW * dd[0].x + W * 0.06);
      this.cameras.main.setBounds(0, 0, Math.max(this.worldW, W), H);
      if (this.player) this.player.setScale((H * 0.17) / this.player.height);
      if (this.enemies) this.enemies.forEach((e) => e.spr.setScale((H * 0.16) / e.spr.height));
    }
    create() {
      makeFighterAnims(this, 'f', '');       // player anims: idle/walk/atk
      makeFighterAnims(this, 'e', 'e');       // enemy anims: eidle/ewalk/eatk
      this.bg = this.add.image(0, 0, 'bg').setOrigin(0, 0);
      this.player = this.add.sprite(0, 0, 'f_idle_0').setOrigin(0.5, 1).play('idle');
      this.facing = 1; this.attacking = false;
      this.hp = 100; this.maxHp = 100; this.invulnUntil = 0; this.freezeUntil = 0;
      this.spark = this.add.circle(0, 0, 16, 0xffd66b, 0.9).setVisible(false).setDepth(1e6);
      this.keys();
      this.prompt = promptText(this);
      this.layout();
      this.player.setPosition(this.leftB + 40, this.floorY);
      this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
      this.doors = (V.doors || []).map((d) => {
        const wx = this.worldW * d.x;
        const glow = this.add.ellipse(wx, this.floorY, this.scale.width * 0.16, this.scale.height * 0.04, 0xba6bff, 0.4).setDepth(1);
        return { ...d, wx, glow };
      });
      this.spawnWave();
      this.buildHud();
      titleCard(this, V.name);
      this.canPortal = false; this.time.delayedCall(500, () => { this.canPortal = true; });
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    }
    // ── a wave of opps blocks the door until you clear them ──
    spawnWave() {
      const H = this.scale.height, n = 3;
      this.enemies = [];
      const doorX = this.doors[0] ? this.doors[0].wx : this.worldW * 0.75;
      for (let i = 0; i < n; i++) {
        const spr = this.add.sprite(0, 0, 'e_idle_0').setOrigin(0.5, 1).play('eidle');
        spr.setScale((H * 0.28) / spr.height);
        const x = Phaser.Math.Clamp(doorX - this.scale.width * (0.28 + i * 0.14), this.leftB + 120, this.rightB - 20);
        const y = this.floorY - Phaser.Math.Between(0, this.laneDepth);
        spr.setPosition(x, y);
        this.enemies.push({ spr, hp: 24, x, y, facing: -1, state: 'idle', nextAtk: 0, hurtUntil: 0, ko: false });
      }
      this.rusher = null;
      this.cleared = false;
    }
    buildHud() {
      const W = this.scale.width, H = this.scale.height;
      this.hpBg = this.add.rectangle(16, 14, W * 0.32, 14, 0x2a0f1e).setOrigin(0, 0).setScrollFactor(0).setDepth(1e6).setStrokeStyle(2, 0xba6bff);
      this.hpFg = this.add.rectangle(18, 16, W * 0.32 - 4, 10, 0x52ffa8).setOrigin(0, 0).setScrollFactor(0).setDepth(1e6);
      this.hpMax = W * 0.32 - 4;
      this.banner = this.add.text(W / 2, H * 0.1, '', { fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(H * 0.03)}px`, color: '#ff6b6b', stroke: '#20102e', strokeThickness: 5 }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6);
    }
    aliveCount() { return this.enemies.filter((e) => !e.ko).length; }
    doAttack() {
      if (this.attacking) return; this.attacking = true;
      // aim at the fight: face the nearest standing opp so swings always land forward
      const alive = (this.enemies || []).filter((e) => !e.ko);
      if (alive.length) {
        const near = alive.slice().sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))[0];
        if (Math.abs(near.x - this.player.x) < this.scale.width * 0.4) this.facing = near.x < this.player.x ? -1 : 1;
      }
      this.player.setFlipX(this.facing < 0);
      this.player.play('atk');
      const reach = this.player.displayWidth * 0.62;
      const tipX = this.player.x + this.facing * reach;
      this.spark.setPosition(tipX, this.player.y - this.player.displayHeight * 0.5).setScale(0.4).setAlpha(0.9).setVisible(true);
      this.tweens.add({ targets: this.spark, scale: 1.6, alpha: 0, duration: 220, onComplete: () => this.spark.setVisible(false) });
      // hit every enemy in horizontal reach AND the same floor lane (2.5D depth gate)
      let connected = false;
      for (const e of this.enemies) {
        if (e.ko) continue;
        const dx = e.x - this.player.x;
        const inReach = Math.sign(dx || this.facing) === this.facing && Math.abs(dx) < reach + e.spr.displayWidth * 0.4;
        const inLane = Math.abs(e.y - this.player.y) < this.laneDepth * 1.1;
        if (inReach && inLane) { this.hitEnemy(e); connected = true; }
      }
      if (connected) { this.freezeUntil = this.time.now + 90; this.cameras.main.shake(120, 0.006); }
      this.player.once('animationcomplete', () => { this.attacking = false; });
    }
    hitEnemy(e) {
      e.hp -= 12; e.hurtUntil = this.time.now + 260; e.state = 'hurt';
      e.spr.setTint(0xffffff); this.time.delayedCall(90, () => e.spr.clearTint());
      e.x = Phaser.Math.Clamp(e.x + this.facing * this.scale.width * 0.04, this.leftB, this.rightB); // knockback
      const burst = this.add.circle(e.spr.x, e.spr.y - e.spr.displayHeight * 0.5, 10, 0xffd66b, 0.9).setDepth(1e6);
      this.tweens.add({ targets: burst, scale: 2.2, alpha: 0, duration: 240, onComplete: () => burst.destroy() });
      if (e.hp <= 0) this.koEnemy(e);
    }
    koEnemy(e) {
      e.ko = true; if (this.rusher === e) this.rusher = null;
      this.tweens.add({ targets: e.spr, alpha: 0, angle: this.facing * 70, y: e.spr.y + 10, duration: 420, onComplete: () => e.spr.destroy() });
    }
    hurtPlayer(dmg, fromX) {
      if (this.time.now < this.invulnUntil) return;
      this.hp = Math.max(0, this.hp - dmg); this.invulnUntil = this.time.now + 650;
      this.freezeUntil = this.time.now + 70; this.cameras.main.shake(160, 0.008);
      const dir = Math.sign(this.player.x - fromX) || 1;
      this.player.x = Phaser.Math.Clamp(this.player.x + dir * this.scale.width * 0.05, this.leftB, this.rightB);
      this.player.setTint(0xff5b5b); this.time.delayedCall(120, () => this.player.clearTint());
      if (this.hp <= 0) { this.hp = this.maxHp; this.player.setPosition(this.leftB + 40, this.floorY); this.spawnWave(); } // wipe → reset block
    }
    update() {
      const now = this.time.now;
      if (now < this.freezeUntil) { this.consume(); return; }   // hit-stop
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
      if (this.time.now < this.invulnUntil) this.player.setAlpha(0.5 + 0.5 * Math.sin(now * 0.03)); else this.player.setAlpha(1);

      // ── enemy AI: crowd control — only one rusher closes at a time ──
      const alive = this.enemies.filter((e) => !e.ko);
      if (!this.rusher || this.rusher.ko) {
        this.rusher = alive.slice().sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))[0] || null;
      }
      const eSpd = spd * 0.82;               // rusher keeps pace with a walking player
      for (const e of alive) {
        e.facing = this.player.x < e.x ? -1 : 1;
        const dist = Math.abs(e.x - this.player.x);
        const laned = Math.abs(e.y - this.player.y) < this.laneDepth * 1.1;
        if (now < e.hurtUntil) { e.spr.play('eidle', true); }
        else if (e === this.rusher && !(dist < e.spr.displayWidth * 0.7 && laned)) {
          // close in on the player (match lane, then approach)
          e.x += Math.sign(this.player.x - e.x) * eSpd;
          e.y += Math.sign(this.player.y - e.y) * eSpd * 0.6;
          e.spr.play('ewalk', true);
        } else if (e !== this.rusher && dist > this.scale.width * 0.14) {
          // non-rushers drift in so they don't get left behind (but hold their swing)
          e.x += Math.sign(this.player.x - e.x) * eSpd * 0.45;
          e.spr.play('ewalk', true);
        } else if (e === this.rusher && dist < e.spr.displayWidth * 0.9 && laned && now > e.nextAtk) {
          // in range: swing
          e.spr.play('eatk', true); e.nextAtk = now + 1100;
          this.time.delayedCall(220, () => { if (!e.ko && Math.abs(e.x - this.player.x) < e.spr.displayWidth * 1.1 && Math.abs(e.y - this.player.y) < this.laneDepth * 1.2) this.hurtPlayer(8, e.x); });
        } else { e.spr.play('eidle', true); }
        e.x = Phaser.Math.Clamp(e.x, this.leftB, this.rightB);
        e.y = Phaser.Math.Clamp(e.y, this.floorY - this.laneDepth, this.floorY);
        e.spr.setPosition(e.x, e.y).setFlipX(e.facing < 0).setDepth(e.y);
      }

      // ── HUD + door gating ──
      this.hpFg.width = this.hpMax * (this.hp / this.maxHp);
      this.hpFg.fillColor = this.hp > 40 ? 0x52ffa8 : 0xff5b5b;
      const remaining = this.aliveCount();
      this.cleared = remaining === 0;
      let near = null;
      for (const d of this.doors) if (Math.abs(this.player.x - d.wx) < this.scale.width * 0.16) near = d;
      if (!this.cleared) {
        this.banner.setText(`CLEAR THE BLOCK · ${remaining} left`).setVisible(true);
        this.prompt.setVisible(false);
      } else {
        this.banner.setVisible(false);
        if (near) { this.prompt.setText(`Y — enter ${near.label}`).setVisible(true); if (this.canPortal && k.interact) { this.consume(); fire(near.to); } }
        else this.prompt.setVisible(false);
      }
      this.consume();
    }
  }

  class InteriorTopDown extends Base {
    layout() {
      const W = this.scale.width, H = this.scale.height;
      const img = this.textures.get('bg').getSourceImage();
      const s = Math.max(W / img.width, H / img.height);   // COVER: fill the screen
      this.bg.setScale(s).setPosition(W / 2, H / 2);
      this.roomW = img.width * s; this.roomH = img.height * s;
      this.rx0 = (W - this.roomW) / 2; this.ry0 = (H - this.roomH) / 2;
      const fx = (f) => this.rx0 + f * this.roomW, fy = (f) => this.ry0 + f * this.roomH;
      // walkable region: per-venue override, else the default outer-wall inset
      const wk = V.walk || { left: 0.1, right: 0.9, top: 0.28, bottom: 0.92 };
      this.walk = { x0: fx(wk.left), x1: fx(wk.right), y0: fy(wk.top), y1: fy(wk.bottom) };
      // solid furniture rectangles the player walks around
      this.blockRects = (V.blockers || []).map((b) => ({ x0: fx(b.x), y0: fy(b.y), x1: fx(b.x + b.w), y1: fy(b.y + b.h) }));
      this.doorPts = (V.doors || []).map((d) => ({ ...d, sx: fx(d.x), sy: fy(d.y) }));
      this.spotPts = (V.spots || []).map((sp) => ({ ...sp, sx: fx(sp.x), sy: fy(sp.y) }));
      if (this.spotVis) this.spotVis.forEach((v, i) => {
        const p = this.spotPts[i]; if (!p) return;
        v.marker.setPosition(p.sx, p.sy); v.label.setPosition(p.sx, p.sy - H * 0.032);
      });
      if (this.player) this.player.setScale((H * 0.13) / this.player.height);
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
      // interactive hotspots / NPCs (gold pulsing star + floating label)
      this.spotVis = (this.spotPts || []).map((sp) => {
        const r = this.scale.height * 0.018;
        const marker = this.add.star(sp.sx, sp.sy, 5, r * 0.5, r, 0xffd66b, 0.95).setDepth(0.6);
        const label = this.add.text(sp.sx, sp.sy - this.scale.height * 0.032, sp.label, {
          fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(this.scale.height * 0.02)}px`,
          color: '#ffe8a3', stroke: '#20102e', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(0.7);
        this.tweens.add({ targets: marker, scaleX: 1.35, scaleY: 1.35, yoyo: true, duration: 720, repeat: -1, ease: 'Sine.inOut' });
        return { marker, label };
      });
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
      const key = `rf_${avatar}_idle0`;
      const attach = () => {
        if (r.dot?.active) r.dot.destroy();
        r.sprite = this.add.image(0, 0, key).setOrigin(0.5, 1).setDepth(1);
        r.sprite.setScale((this.scale.height * 0.13) / r.sprite.height);
      };
      if (this.textures.exists(key)) return attach();
      this.load.image(key, FIG(avatar, 'idle', 0));
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
    blockedAt(x, y, pad) {
      for (const b of (this.blockRects || [])) {
        if (x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad) return true;
      }
      return false;
    }
    sayLine(spot) {
      this.lineBubble?.destroy();
      this.lineBubble = this.add.text(this.player.x, this.player.y - this.player.displayHeight - 6, `${spot.label}: ${spot.line}`, {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(this.scale.height * 0.021)}px`,
        color: '#fff', backgroundColor: '#20102ee6', padding: { x: 8, y: 5 },
        wordWrap: { width: this.scale.width * 0.44 }, align: 'center',
      }).setOrigin(0.5, 1).setDepth(1e6);
      this.time.delayedCall(4200, () => { if (this.lineBubble) { this.lineBubble.destroy(); this.lineBubble = null; } });
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
      this.player.setFlipX(this.facing < 0);
      this.player.play((vx || vy) ? 'walk' : 'idle', true);
      // move with wall clamp + furniture collision (axis-separated so you slide)
      const pad = this.scale.width * 0.012;
      const nx = Phaser.Math.Clamp(this.player.x + vx, this.walk.x0, this.walk.x1);
      if (!this.blockedAt(nx, this.player.y, pad)) this.player.x = nx;
      const ny = Phaser.Math.Clamp(this.player.y + vy, this.walk.y0, this.walk.y1);
      if (!this.blockedAt(this.player.x, ny, pad)) this.player.y = ny;
      this.player.setDepth(this.player.y);
      // networking: animate other members + ping my position (throttled)
      this.drawRemotes();
      if (this.social && this.time.now - this.lastPing > 350) {
        this.lastPing = this.time.now;
        const fx = (this.player.x - this.rx0) / this.roomW, fy = (this.player.y - this.ry0) / this.roomH;
        this.social.ping(fighterId, +fx.toFixed(3), +fy.toFixed(3));
      }
      // prompt priority: door > hotspot/NPC > nearby member to link with
      let near = null;
      for (const d of this.doorPts) if (Phaser.Math.Distance.Between(this.player.x, this.player.y, d.sx, d.sy) < this.scale.width * 0.11) near = d;
      if (near) { this.prompt.setText(`Y — ${near.label}`).setVisible(true); if (this.canPortal && k.interact) { this.consume(); fire(near.to); } }
      else {
        let spot = null, sd = this.scale.width * 0.1;
        for (const sp of (this.spotPts || [])) {
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, sp.sx, sp.sy);
          if (d < sd) { sd = d; spot = sp; }
        }
        if (spot) { this.prompt.setText(`Y — ${spot.label}`).setVisible(true); if (k.interact) { this.consume(); this.sayLine(spot); } }
        else {
          const peer = this.social ? this.nearestRemote() : null;
          if (peer) { this.prompt.setText(`Y — link with ${peer.label}`).setVisible(true); if (k.interact) { this.consume(); this.social.link(peer.id); } }
          else this.prompt.setVisible(false);
        }
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

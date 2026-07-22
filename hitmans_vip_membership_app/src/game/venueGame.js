import Phaser from 'phaser';
import { VENUES, VENUE_ASSET } from './venues.js';
import { joinVenue, socialEnabled } from './social.js';

const BASE = import.meta.env.BASE_URL;
const FIG = (id, anim, i) => `${BASE}assets/game/fighters/${id}/${anim}_${i}.png`;
const selfMemberId = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_member_id')) || '';

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

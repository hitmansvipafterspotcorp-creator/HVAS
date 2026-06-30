import Phaser from 'phaser';
import {
  SCENE,
  GAME_WIDTH,
  GAME_HEIGHT,
  FLOOR_TOP,
  FLOOR_BOTTOM,
  COLORS,
  PLAYER_SPEED,
  PLAYER_DEPTH_SPEED,
} from '../config';
import { Fighter } from '../entities/Fighter';
import { InputSystem } from '../systems/InputSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemyAISystem } from '../systems/EnemyAISystem';
import { WaveSystem } from '../systems/WaveSystem';
import { StageLoader } from '../systems/StageLoader';
import { PropDestructionSystem } from '../systems/PropDestructionSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import { BossSystem } from '../systems/BossSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { FloatingTextSystem } from '../systems/FloatingTextSystem';
import { PLAYER_ID } from '../data/roster';
import { UISystem, UI, NumberDisplay } from '../systems/UISystem';
import { VFXSystem } from '../systems/VFXSystem';
import { AudioSystem } from '../systems/AudioSystem';
import type { StageData } from '../data/stageTypes';
import cafe8fiftyStage from '../data/stages/cafe8fifty.json';

// BrawlerScene: data-driven brawler. Defaults to the Cafe8Fifty street stage;
// pass a different StageData via scene.start(SCENE.Brawler, { stage: ... })
// to load any JSON-authored stage without touching this file.
const DEFAULT_STAGE: StageData = cafe8fiftyStage as StageData;

// World is 3 screens wide — camera scrolls to follow the player.
const ZONE_COUNT = 3;

export class BrawlerScene extends Phaser.Scene {
  private stage!: StageData;
  private worldWidth = GAME_WIDTH * ZONE_COUNT;
  private player!: Fighter;
  private controls!: InputSystem;
  private combat!: CombatSystem;
  private ai!: EnemyAISystem;
  private waves!: WaveSystem;
  private props!: PropDestructionSystem;
  private weapon!: WeaponSystem;
  private floatingText!: FloatingTextSystem;
  private boss: BossSystem | null = null;
  private bossRevealTriggered = false;
  private venueDoorSpawned = false;

  // Scrolling world
  private currentZone = 0;
  private zoneBarriers: Phaser.GameObjects.Rectangle[] = [];
  private zoneBarrierTexts: Phaser.GameObjects.Text[] = [];

  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugOn = false;
  private vfx!: VFXSystem;
  private paused = false;
  private pauseGroup?: Phaser.GameObjects.Container;

  // Real-art HUD pieces (populated when the UI kit is loaded).
  private hpFill?: Phaser.GameObjects.Rectangle;
  private hpInner = { x: 0, w: 0 };
  private hpNum?: NumberDisplay;
  private comboLabel?: Phaser.GameObjects.Image;
  private comboNum?: NumberDisplay;
  private meterPips: Phaser.GameObjects.Image[] = [];
  private dangerOverlay?: Phaser.GameObjects.Image;
  private hitFlashOverlay?: Phaser.GameObjects.Image;
  private hitFlashTimer = 0;
  private prevPlayerHp = 0;

  constructor() {
    super(SCENE.Brawler);
  }

  create(data?: { stage?: StageData }): void {
    this.stage = data?.stage ?? DEFAULT_STAGE;
    AudioSystem.playForStage(this, this.stage.id);

    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Real backdrop if the PNG exists; graybox floor always drawn underneath.
    StageLoader.loadBackdrop(this, this.stage);

    // Floor band spans the full scrolling world.
    const g = this.add.graphics().setDepth(-1999);
    g.fillStyle(COLORS.floor, 0.45);
    g.fillRect(0, FLOOR_TOP, this.worldWidth, FLOOR_BOTTOM - FLOOR_TOP);
    g.lineStyle(2, COLORS.floorLine, 0.6);
    g.strokeRect(0, FLOOR_TOP, this.worldWidth, FLOOR_BOTTOM - FLOOR_TOP);

    // Zone separator markers (visual only — barriers added below).
    for (let z = 1; z < ZONE_COUNT; z++) {
      const bx = GAME_WIDTH * z;
      const bar = this.add.rectangle(bx, GAME_HEIGHT / 2, 6, GAME_HEIGHT, 0xffd700, 0.8).setDepth(500);
      const txt = this.add.text(bx, FLOOR_TOP - 18, `ZONE ${z + 1}`, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffd700',
      }).setOrigin(0.5, 1).setDepth(501);
      this.zoneBarriers.push(bar);
      this.zoneBarrierTexts.push(txt);
    }

    // Player — uses real sprite art if its anims are built, else graybox.
    this.player = new Fighter(this, 'player', 180, FLOOR_BOTTOM - 20, 120, PLAYER_ID);
    this.prevPlayerHp = this.player.maxHp;

    // Systems.
    this.controls = new InputSystem(this);
    this.combat = new CombatSystem(this);
    this.vfx = new VFXSystem(this);
    this.floatingText = new FloatingTextSystem(this);
    this.ai = new EnemyAISystem();
    this.waves = new WaveSystem(this, this.stage.waves, this.stage.enemies);
    this.weapon = new WeaponSystem();
    this.props = new PropDestructionSystem(this);
    if (this.stage.props?.length) this.props.init(this.stage.props, this.stage.id);
    if (this.stage.boss) this.boss = new BossSystem(this, this.stage.boss);

    // Camera: follow player across the full scrolling world.
    this.cameras.main.setBounds(0, 0, this.worldWidth, GAME_HEIGHT);
    this.cameras.main.startFollow(this.player.sprite!, false, 0.08, 0);

    // HUD — real art kit when available, text otherwise.
    this.buildHud();
    this.hud = this.add
      .text(12, 54, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(50000);

    this.banner = this.add
      .text(GAME_WIDTH / 2, 90, '', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '30px',
        color: '#ffd700',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(50000);

    this.debugGfx = this.add.graphics().setDepth(60000);

    // Toggles.
    const kb = this.input.keyboard!;
    kb.on('keydown-F1', () => (this.debugOn = !this.debugOn));
    kb.on('keydown-ESC', () => this.togglePause());

    this.add
      .text(GAME_WIDTH - 12, 10, 'F1 debug • ESC menu', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8877aa',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(50000);

    // Stage intro: name fades in then out before wave 1 starts.
    const stageName = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, this.stage.name.toUpperCase(), {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '28px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(50001)
      .setAlpha(0);

    this.tweens.add({
      targets: stageName,
      alpha: 1,
      duration: 400,
      ease: 'Quad.out',
      onComplete: () => {
        this.time.delayedCall(900, () => {
          this.tweens.add({
            targets: stageName,
            alpha: 0,
            duration: 500,
            onComplete: () => stageName.destroy(),
          });
          // Kick off wave 1 after name fades.
          this.waves.tryAdvance();
          this.flashBanner('WAVE 1');
        });
      },
    });
  }

  override update(_time: number, delta: number): void {
    if (this.paused) return;
    // Cutscene: freeze player and AI but keep rendering.
    const inCutscene = this.boss?.cutsceneRunning ?? false;
    const run = this.combat.tick(delta);
    if (run && !inCutscene) {
      this.updatePlayer(delta);
      this.ai.update(this.waves.enemies, this.player, this.combat, delta);
      this.waves.reap();
      this.handleWaveFlow();
    }

    // Boss AI + HP bar (runs outside hit-stop but not during cutscene).
    if (!inCutscene && this.boss?.active) {
      const alive = this.boss.update(this.player, this.combat, delta);
      if (!alive && !this.boss.defeated) {
        // boss.defeated is set internally; handled in drawHud
      }
    }

    // Prop hit check runs whenever player attack is active (outside hit-stop).
    if (this.player.attackActive) this.props.checkHits(this.player);
    // Also allow hits on boss.
    if (this.player.attackActive && this.boss?.active && this.boss.boss) {
      this.props.checkHits(this.player); // props
      const opts = this.weapon.augmentOpts({ damage: 9, knockback: 18, meterGain: 8 });
      const hit = this.combat.resolve(this.player, [this.boss.boss], opts);
      if (hit) {
        this.weapon.use();
        this.combat.triggerHitStop(120);
        this.floatingText.damage(this.boss.boss.x, this.boss.boss.feetY - 30, opts.damage);
        this.floatingText.comboFlash(this.player.x, this.player.feetY - 50, this.player.combo);
      }
    }

    // Drop pickup checks every frame.
    this.props.checkPickup(this.player, (kind) => {
      if (kind === 'health') {
        this.player.hp = Math.min(this.player.hp + 30, this.player.maxHp);
        this.floatingText.pickup(this.player.x, this.player.feetY, 'health');
        AudioSystem.sfx(this, 'pickup_health');
      } else {
        this.player.meter = Math.min(this.player.meter + 25, 100);
        this.floatingText.pickup(this.player.x, this.player.feetY, 'meter');
        AudioSystem.sfx(this, 'pickup_meter');
      }
    });
    this.weapon.checkPickup(this.player, this.props.weaponDrops);

    this.player.syncView();
    for (const e of this.waves.enemies) e.syncView();
    this.combat.decayCombo(this.player, delta);
    this.checkVenueDoors();

    // Trigger hit-flash when player HP drops
    if (this.player.hp < this.prevPlayerHp) this.triggerHitFlash();
    this.prevPlayerHp = this.player.hp;

    this.drawHud();
    this.drawDebug();
  }

  private updatePlayer(delta: number): void {
    const p = this.player;
    const b = this.controls.read();
    const dt = delta / 1000;

    if (p.invuln > 0) p.invuln -= delta;

    // Locked states: dodge, attack, hit — play out before control returns.
    if (p.state === 'dodge') {
      p.stateTimer -= delta;
      // Slide the character in the dodge direction at high speed.
      p.x     += this.dodgeVX * PLAYER_SPEED * 2.8 * dt;
      p.feetY += this.dodgeVY * PLAYER_DEPTH_SPEED * 2.8 * dt;
      if (p.sprite) this.vfx.dodgeGhost(p.sprite, delta);
      this.clampPlayer();
      if (p.stateTimer <= 0) {
        p.state = 'idle';
        p.invuln = 0;
      }
      return;
    }

    if (p.state === 'attack' || p.state === 'hit') {
      p.stateTimer -= delta;
      // Active hit frames sit in the middle of an attack.
      if (p.state === 'attack') {
        p.attackActive = p.stateTimer > 120 && p.stateTimer < 240;
        if (p.attackActive) {
          const base = { damage: 9, knockback: 18, meterGain: 8 };
          const opts = this.weapon.augmentOpts(base);
          const hit = this.combat.resolve(p, this.waves.enemies, opts);
          if (hit) {
            AudioSystem.sfx(this, 'hit');
            this.weapon.use();
            this.combat.triggerHitStop(60);
            for (const e of this.waves.enemies) {
              if ((e.state === 'hit' || e.state === 'block') && e.alive) {
                this.floatingText.damage(e.x, e.feetY - 30, opts.damage);
                this.vfx.hitSpark(e.x, e.feetY - 60, p.facing);
                if (e.state === 'block') this.vfx.parryFlash(e.x, e.feetY - 55);
              }
            }
            this.floatingText.comboFlash(p.x, p.feetY - 50, p.combo);
          }
        }
      }
      if (p.stateTimer <= 0) {
        p.state = 'idle';
        p.attackActive = false;
      }
      this.clampPlayer();
      return;
    }

    // Super (highest priority action).
    if (b.superMove && this.combat.trySuper(p, this.waves.enemies)) {
      AudioSystem.sfx(this, 'superhit');
      p.playOneShot('super1');
      this.flashBanner('SUPER!');
      return;
    }

    // Dodge: block + direction just-pressed → short invulnerable burst.
    // Interrupts blocking and normal movement but NOT attacks/supers.
    if (b.dodge) {
      p.state = 'dodge';
      p.stateTimer = 220; // ms
      p.invuln = 260;     // slightly longer than duration (i-frames)
      this.dodgeVX = b.dodgeX;
      this.dodgeVY = b.dodgeY;
      // Snap facing to the horizontal component of the dodge direction.
      if (b.dodgeX !== 0) p.facing = b.dodgeX > 0 ? 1 : -1;
      // AudioSystem.sfx(this, 'dodge'); // add 'dodge' sfx key when audio asset exists
      return;
    }

    // Grab: block HELD + attack just-pressed → grab/throw.
    if (b.block && b.attack) {
      this.tryGrab(p);
      return;
    }

    // Block: SHIFT held with no other action → enter block stance.
    if (b.block) {
      p.state = 'block';
      this.clampPlayer();
      return;
    }

    // Attack start — cycle combo1 -> combo2 -> combo3.
    if (b.attack) {
      p.attackIndex = (p.attackIndex + 1) % 3;
      p.state = 'attack';
      p.stateTimer = 300;
      p.attackActive = false;
      return;
    }

    // Movement (8-way: x + depth). Double-tap = run at higher speed.
    let vx = 0;
    let vy = 0;
    if (b.left)  vx -= 1;
    if (b.right) vx += 1;
    if (b.up)    vy -= 1;
    if (b.down)  vy += 1;

    if (vx !== 0) p.facing = vx > 0 ? 1 : -1;

    const isMoving = vx !== 0 || vy !== 0;
    const speedMul = b.running ? 1.85 : 1.0;

    p.x     += vx * PLAYER_SPEED       * speedMul * dt;
    p.feetY += vy * PLAYER_DEPTH_SPEED * speedMul * dt;

    if (!isMoving)       p.state = 'idle';
    else if (b.running)  p.state = 'run';
    else                 p.state = 'walk';

    this.clampPlayer();
  }

  // Dodge direction (set when entering dodge state, consumed during the slide).
  private dodgeVX = 0;
  private dodgeVY = 0;

  private tryGrab(p: Fighter): void {
    const GRAB_RANGE = 70;
    const target = this.waves.enemies.find(
      (e) =>
        e.alive &&
        Math.abs(e.x - p.x) < GRAB_RANGE &&
        Math.abs(e.feetY - p.feetY) < 30,
    );
    if (!target) return;

    // Slam them with bonus unblockable damage and a meterGain burst.
    const dmg = 22;
    target.hp = Math.max(0, target.hp - dmg);
    target.state = 'knockdown';
    target.stateTimer = 600;
    p.meter = Math.min(100, p.meter + 18);
    p.combo = (p.combo ?? 0) + 1;

    AudioSystem.sfx(this, 'hit');
    this.combat.triggerHitStop(80);
    this.floatingText.damage(target.x, target.feetY - 40, dmg);
    this.floatingText.comboFlash(p.x, p.feetY - 50, p.combo);

    // Play the special anim as the grab animation on the player sprite.
    p.playOneShot('special');
    p.state = 'attack';
    p.stateTimer = 420;
    p.attackActive = false;
  }

  private clampPlayer(): void {
    const p = this.player;
    // Clamp to current zone: can't pass the next barrier until it dissolves.
    const zoneMax = GAME_WIDTH * (this.currentZone + 1) - 20;
    p.x = Phaser.Math.Clamp(p.x, 20, Math.min(zoneMax, this.worldWidth - 20));
    p.feetY = Phaser.Math.Clamp(p.feetY, FLOOR_TOP + 10, FLOOR_BOTTOM - 5);
  }

  private handleWaveFlow(): void {
    if (this.waves.cleared) {
      if (this.boss) {
        if (!this.bossRevealTriggered) {
          this.bossRevealTriggered = true;
          this.boss.reveal(() => {
            this.flashBanner(`FIGHT ${this.stage.boss!.name}!`);
          });
        }
        if (this.boss.defeated && !this.venueDoorSpawned) {
          this.venueDoorSpawned = true;
          this.onBossDefeated();
        }
        return;
      }
      // All waves in this zone cleared — advance to next zone if available.
      if (this.currentZone < ZONE_COUNT - 1) {
        if (!this.venueDoorSpawned) {
          this.venueDoorSpawned = true; // reuse flag as zone-advance-in-progress
          this.advanceZone();
        }
        return;
      }
      // Final zone clear — stage done (no boss scenario).
      if (!this.venueDoorSpawned) {
        this.venueDoorSpawned = true;
        this.banner.setText('STAGE CLEAR!');
        this.banner.setVisible(true);
        this.time.delayedCall(2000, () => this.scene.start(SCENE.StageSelect));
      }
      return;
    }
    if (!this.waves.locked) {
      const advanced = this.waves.tryAdvance();
      if (advanced) this.flashBanner(`WAVE ${this.waves.current + 1}`);
    }
  }

  private advanceZone(): void {
    this.currentZone++;
    const barrierIdx = this.currentZone - 1;
    const bar  = this.zoneBarriers[barrierIdx];
    const txt  = this.zoneBarrierTexts[barrierIdx];
    this.flashBanner(`ZONE ${this.currentZone + 1}`);
    // Dissolve the barrier with a tween.
    if (bar) {
      this.tweens.add({
        targets: [bar, txt], alpha: 0, duration: 600, ease: 'Quad.out',
        onComplete: () => { bar.destroy(); txt?.destroy(); },
      });
    }
    // Spawn next zone's wave a beat later.
    this.time.delayedCall(800, () => {
      this.venueDoorSpawned = false; // reset so next zone-clear can fire
      this.waves.tryAdvance();
      this.flashBanner(`WAVE ${this.waves.current + 1}`);
    });
  }

  private onBossDefeated(): void {
    this.flashBanner('STAGE CLEAR!');

    // Persist progression.
    const stageId = this.stage.id as Parameters<typeof ProgressionSystem.beatBoss>[0];
    ProgressionSystem.beatBoss(stageId);

    // Persist every unlock declared on this stage JSON.
    if (this.stage.venueUnlocks) ProgressionSystem.unlockVenue(this.stage.venueUnlocks);
    if (this.stage.aboveVenueUnlocks) ProgressionSystem.unlockVenue(this.stage.aboveVenueUnlocks);
    if (this.stage.stripEntrances) {
      for (const ent of this.stage.stripEntrances) ProgressionSystem.unlockVenue(ent.venueId);
    }

    // Spawn venue entrance doors after a short pause.
    this.time.delayedCall(1200, () => this.spawnVenueDoors());
  }

  private spawnVenueDoors(): void {
    const s = this.stage;

    // Tally strip: show all five sub-venue entrances along the strip.
    if (s.stripEntrances?.length) {
      for (const ent of s.stripEntrances) {
        this.addVenueDoor(ent.x, FLOOR_BOTTOM - 40, ent.label, ent.venueId);
      }
      return;
    }

    // Standard single-venue unlock.
    if (s.venueUnlocks) {
      this.addVenueDoor(this.worldWidth - 120, FLOOR_BOTTOM - 40, 'Enter Venue', s.venueUnlocks);
    }

    // Above-venue (rooftop etc.) unlocked at the same time.
    if (s.aboveVenueUnlocks) {
      this.addVenueDoor(this.worldWidth - 240, FLOOR_BOTTOM - 80, 'Rooftop', s.aboveVenueUnlocks);
    }
  }

  // Draw a glowing door trigger rectangle on the floor. Player walks into it.
  private addVenueDoor(cx: number, cy: number, label: string, venueId: string): void {
    const W = 110;
    const H = 30;
    const gfx = this.add.graphics().setDepth(cy);
    gfx.lineStyle(2, 0xffd700, 0.9);
    gfx.fillStyle(0x332200, 0.6);
    gfx.fillRect(cx - W / 2, cy - H / 2, W, H);
    gfx.strokeRect(cx - W / 2, cy - H / 2, W, H);

    this.add
      .text(cx, cy, label, { fontFamily: 'monospace', fontSize: '11px', color: '#ffd700' })
      .setOrigin(0.5)
      .setDepth(cy + 1);

    // Simple proximity check each frame via a zone.
    const zone = this.add.zone(cx, cy, W, H).setDepth(cy);
    zone.setData('venueId', venueId);

    // Watch player overlap with the door zone (checked in update via manual distance).
    zone.setInteractive();
    // We'll poll in update; store doors in array.
    this.venueDoors.push({ cx, cy, W, H, venueId });
  }

  private venueDoors: Array<{ cx: number; cy: number; W: number; H: number; venueId: string }> = [];

  private checkVenueDoors(): void {
    if (!this.venueDoors.length) return;
    const px = this.player.x;
    const py = this.player.feetY;
    for (const door of this.venueDoors) {
      if (
        Math.abs(px - door.cx) < door.W / 2 + 10 &&
        Math.abs(py - door.cy) < door.H / 2 + 20
      ) {
        this.venueDoors = [];
        AudioSystem.sfx(this, 'door');
        this.scene.start(SCENE.Venue, { venueId: door.venueId });
        return;
      }
    }
  }

  triggerHitFlash(): void {
    if (this.hitFlashOverlay) {
      this.hitFlashTimer = 120;
      this.hitFlashOverlay.setVisible(true).setAlpha(1);
    }
  }

  private flashBanner(text: string): void {
    this.banner.setText(text).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      scale: 1.3,
      duration: 1100,
      ease: 'Cubic.out',
      onComplete: () => this.banner.setVisible(false),
    });
  }

  // Assemble the real HUD art: portrait frame, health/super/guard bars,
  // timer badge, combo counter, score chip.
  private buildHud(): void {
    if (!UISystem.ready(this)) return;

    const DEPTH = 50001;

    // ── Player-side HUD (top-left) ────────────────────────────────────────
    // Portrait frame
    if (this.textures.exists(UI.hudPortraitFrame)) {
      this.add.image(8, 8, UI.hudPortraitFrame)
        .setOrigin(0, 0).setDisplaySize(90, 112)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // Health bar — full-width art, dark mask depletes from right
    const hpTex = this.textures.exists(UI.hudHealthBar)
      ? this.textures.get(UI.hudHealthBar).getSourceImage() : null;
    const hpW = 280, hpH = hpTex ? Math.round((hpTex.height / hpTex.width) * hpW) : 22;
    const hpX = 104, hpY = 14;
    this.hpInner.x = hpX + hpW * 0.04;
    this.hpInner.w = hpW * 0.89;
    const innerY = hpY + hpH * 0.5;
    this.hpFill = this.add.rectangle(
      this.hpInner.x + this.hpInner.w, innerY, 0, hpH * 0.55, 0x1a0608, 0.92,
    ).setOrigin(1, 0.5).setScrollFactor(0).setDepth(DEPTH - 1);
    if (hpTex) {
      this.add.image(hpX, hpY, UI.hudHealthBar)
        .setOrigin(0, 0).setDisplaySize(hpW, hpH)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // Super bar below health
    if (this.textures.exists(UI.hudSuperBar)) {
      this.add.image(hpX, hpY + hpH + 4, UI.hudSuperBar)
        .setOrigin(0, 0).setDisplaySize(hpW, 20)
        .setScrollFactor(0).setDepth(DEPTH);
    }
    // Guard bar below super
    if (this.textures.exists(UI.hudGuardBar)) {
      this.add.image(hpX, hpY + hpH + 28, UI.hudGuardBar)
        .setOrigin(0, 0).setDisplaySize(hpW, 20)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // HP digit readout
    this.hpNum = new NumberDisplay(this, hpX + 6, hpY + hpH + 58, 18).setDepth(DEPTH + 1);

    // Combo counter (hidden until combo > 1)
    if (this.textures.exists(UI.hudComboCounter)) {
      this.comboLabel = this.add.image(hpX + 130, hpY + hpH + 58, UI.hudComboCounter)
        .setOrigin(0, 0.5).setDisplaySize(56, 22)
        .setScrollFactor(0).setDepth(DEPTH).setVisible(false);
    }
    this.comboNum = new NumberDisplay(this, hpX + 192, hpY + hpH + 58, 20).setDepth(DEPTH + 1);

    // ── Center top: timer badge ───────────────────────────────────────────
    if (this.textures.exists(UI.hudTimer)) {
      this.add.image(GAME_WIDTH / 2, 10, UI.hudTimer)
        .setOrigin(0.5, 0).setDisplaySize(70, 72)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // ── Score chip (top-right) ────────────────────────────────────────────
    if (this.textures.exists(UI.hudScoreChip)) {
      this.add.image(GAME_WIDTH - 8, 14, UI.hudScoreChip)
        .setOrigin(1, 0).setDisplaySize(120, 38)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // ── Controls strip (bottom-center) ───────────────────────────────────
    if (this.textures.exists(UI.hudControls)) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 4, UI.hudControls)
        .setOrigin(0.5, 1).setDisplaySize(400, 36)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // Meter pips (star icons below guard bar)
    if (this.textures.exists(UI.hudPipStar)) {
      for (let i = 0; i < 10; i++) {
        const pip = this.add.image(hpX + i * 26, hpY + hpH + 82, UI.hudPipStar)
          .setOrigin(0, 0.5).setDisplaySize(20, 22)
          .setScrollFactor(0).setDepth(DEPTH).setAlpha(0.25);
        this.meterPips.push(pip);
      }
    }

    // ── Screen-edge overlays (depth above everything) ─────────────────────
    if (this.textures.exists(UI.hudDanger)) {
      this.dangerOverlay = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI.hudDanger)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setScrollFactor(0).setDepth(60000).setAlpha(0).setVisible(false);
    }
    if (this.textures.exists(UI.hudHitFlash)) {
      this.hitFlashOverlay = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI.hudHitFlash)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setScrollFactor(0).setDepth(60001).setAlpha(0).setVisible(false);
    }
  }

  private drawHud(): void {
    const p = this.player;
    const alive = this.waves.enemies.filter((e) => e.alive).length;

    const weaponTag = this.weapon.equipped ? `  BAT x${this.weapon.durability}` : '';
    if (this.hpFill) {
      // Real-art HUD.
      const frac = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
      this.hpFill.width = this.hpInner.w * (1 - frac);
      this.hpNum?.setValue(Math.ceil(p.hp));
      const litPips = Math.round((p.meter / 100) * this.meterPips.length);
      this.meterPips.forEach((pip, i) => pip.setAlpha(i < litPips ? 1 : 0.25));
      const showCombo = p.combo > 1;
      this.comboLabel?.setVisible(showCombo);
      this.comboNum?.setVisible(showCombo);
      if (showCombo) this.comboNum?.setValue(p.combo);
      this.hud.setText(
        `WAVE ${this.waves.current + 1}/${this.waves.total}   ENEMIES ${alive}${weaponTag}`,
      );

      // Danger vignette: pulse when HP < 25%
      if (this.dangerOverlay) {
        const danger = frac < 0.25;
        this.dangerOverlay.setVisible(danger);
        if (danger) {
          const pulse = 0.35 + 0.25 * Math.sin(this.time.now / 220);
          this.dangerOverlay.setAlpha(pulse);
        }
      }

      // Hit flash: triggered externally via triggerHitFlash(), fades on its own
      if (this.hitFlashOverlay && this.hitFlashTimer > 0) {
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - 16);
        const a = this.hitFlashTimer / 120;
        this.hitFlashOverlay.setVisible(a > 0).setAlpha(a);
      }
    } else {
      // Text fallback.
      const hpBars = '█'.repeat(Math.ceil((p.hp / p.maxHp) * 20)).padEnd(20, '·');
      const meter = '▮'.repeat(Math.ceil((p.meter / 100) * 10)).padEnd(10, '·');
      this.hud.setText(
        `HP [${hpBars}] ${Math.ceil(p.hp)}/${p.maxHp}\n` +
          `SUPER [${meter}] ${p.meter}%   COMBO x${p.combo}\n` +
          `WAVE ${this.waves.current + 1}/${this.waves.total}   ENEMIES ${alive}${weaponTag}`,
      );
    }

    if (p.hp <= 0 && p.state !== 'ko') {
      p.state = 'ko';
      this.flashBanner('K.O.');
      this.time.delayedCall(1200, () => this.showKoScreen());
    }
  }

  private showKoScreen(): void {
    AudioSystem.sfx(this, 'ko');
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
      .setDepth(90000).setScrollFactor(0);
    this.tweens.add({ targets: overlay, alpha: { from: 0, to: 0.72 }, duration: 300 });

    this.add.text(cx, cy - 50, 'K.O.', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '64px', color: '#ff2244',
    }).setOrigin(0.5).setDepth(90001).setScrollFactor(0);

    this.add.text(cx, cy + 14, 'RETRY STAGE?', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(90001).setScrollFactor(0);

    this.add.text(cx, cy + 50, 'SPACE — Retry     M — Main Menu', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(90001).setScrollFactor(0);

    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', () => this.scene.restart());
    kb.once('keydown-M',     () => this.scene.start(SCENE.MainMenu));
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.showPauseOverlay();
    } else {
      this.pauseGroup?.destroy(true);
      this.pauseGroup = undefined;
    }
  }

  private showPauseOverlay(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const g = this.add.container(0, 0).setDepth(95000).setScrollFactor(0);
    this.pauseGroup = g;

    // Dim backdrop
    g.add(this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65).setScrollFactor(0));

    // Large panel frame — prefer pmxPanelLarge > pmPanelWide > rectangle
    if (this.textures.exists(UI.pmxPanelLarge)) {
      g.add(this.add.image(cx, cy, UI.pmxPanelLarge)
        .setDisplaySize(480, 380).setScrollFactor(0));
    } else if (this.textures.exists(UI.pmPanelWide)) {
      g.add(this.add.image(cx, cy, UI.pmPanelWide)
        .setDisplaySize(460, 360).setScrollFactor(0));
    } else {
      g.add(this.add.rectangle(cx, cy, 440, 340, 0x0a0614, 0.97)
        .setStrokeStyle(2, 0xffd700, 0.9).setScrollFactor(0));
    }

    // 4-button panel inside the large frame
    if (this.textures.exists(UI.pmxBtnPanel)) {
      g.add(this.add.image(cx, cy + 30, UI.pmxBtnPanel)
        .setDisplaySize(320, 260).setScrollFactor(0).setAlpha(0.65));
    }

    // Title banner — prefer pmxTitle > pmTitleBanner > text
    const bannerY = cy - 150;
    if (this.textures.exists(UI.pmxTitle)) {
      g.add(this.add.image(cx, bannerY, UI.pmxTitle)
        .setDisplaySize(400, 72).setScrollFactor(0));
    } else if (this.textures.exists(UI.pmTitleBanner)) {
      g.add(this.add.image(cx, bannerY, UI.pmTitleBanner)
        .setDisplaySize(380, 76).setScrollFactor(0));
    } else {
      g.add(this.add.text(cx, bannerY, '★ PAUSE ★', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffd700',
        stroke: '#000000', strokeThickness: 5,
      }).setOrigin(0.5).setScrollFactor(0));
    }

    // Pause buttons with hover art
    const BTNS: Array<{ label: string; key: string; hov: string; action: () => void }> = [
      { label: 'RESUME',       key: UI.pmBtnContinue, hov: UI.pmBtnContinueHov, action: () => this.togglePause() },
      { label: 'RESTART',      key: UI.pmBtnRestart,  hov: UI.pmBtnRestartHov,  action: () => { this.paused = false; this.scene.restart(); } },
      { label: 'STAGE SELECT', key: UI.pmBtnRetry,    hov: UI.pmBtnRetryHov,    action: () => { this.paused = false; this.scene.start(SCENE.StageSelect); } },
      { label: 'SETTINGS',     key: UI.pmBtnSettings, hov: UI.pmBtnSettingsHov, action: () => { this.paused = false; this.scene.start(SCENE.Options); } },
      { label: 'MAIN MENU',    key: UI.pmBtnQuit,     hov: UI.pmBtnQuitHov,     action: () => this.showConfirmQuit() },
    ];

    const btnH = 46;
    const btnW = 260;
    const startY = cy - 70;

    BTNS.forEach((opt, i) => {
      const y = startY + i * (btnH + 6);
      if (this.textures.exists(opt.key)) {
        const img = this.add.image(cx, y, opt.key)
          .setDisplaySize(btnW, btnH).setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        img.on('pointerover', () => {
          if (this.textures.exists(opt.hov)) img.setTexture(opt.hov);
          img.setDisplaySize(btnW * 1.05, btnH * 1.05);
        });
        img.on('pointerout',  () => { img.setTexture(opt.key); img.setDisplaySize(btnW, btnH); });
        img.on('pointerdown', () => opt.action());
        g.add(img);
      } else {
        // Text fallback for missing button art
        const btn = this.add.text(cx, y, opt.label, {
          fontFamily: 'Arial Black, sans-serif', fontSize: '20px',
          color: i === 0 ? '#ffd700' : '#ffffff',
          stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
        btn.on('pointerover', () => btn.setColor('#ffd700').setScale(1.08));
        btn.on('pointerout',  () => btn.setColor(i === 0 ? '#ffd700' : '#ffffff').setScale(1.0));
        btn.on('pointerdown', () => opt.action());
        g.add(btn);
      }
    });

    // Save badge top-right of panel
    if (this.textures.exists(UI.pmSaveBadge)) {
      g.add(this.add.image(cx + 200, cy - 160, UI.pmSaveBadge)
        .setDisplaySize(60, 24).setOrigin(1, 0).setScrollFactor(0));
    }
  }

  private showConfirmQuit(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const dlgW = 340, dlgH = 160;

    // Overlay container at depth above pause overlay
    const dc = this.add.container(0, 0).setDepth(96000).setScrollFactor(0);

    // Panel art or rect
    if (this.textures.exists(UI.pmxConfirmDialog)) {
      dc.add(this.add.image(cx, cy, UI.pmxConfirmDialog)
        .setDisplaySize(dlgW, dlgH).setScrollFactor(0));
    } else {
      dc.add(this.add.rectangle(cx, cy, dlgW, dlgH, 0x0a0614)
        .setStrokeStyle(2, 0xffd700).setScrollFactor(0));
    }

    dc.add(this.add.text(cx, cy - 46, 'QUIT TO MAIN MENU?', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0));

    dc.add(this.add.text(cx, cy - 16, 'All unsaved progress will be lost.', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ccbbee',
    }).setOrigin(0.5).setScrollFactor(0));

    const mkDlgBtn = (bx: number, label: string, color: string, action: () => void) => {
      const artKey = label === 'YES' ? UI.u1BtnDanger : UI.u1BtnGhost;
      const btn = this.textures.exists(artKey)
        ? this.add.image(bx, cy + 38, artKey).setDisplaySize(120, 38).setScrollFactor(0)
            .setInteractive({ useHandCursor: true })
        : this.add.rectangle(bx, cy + 38, 120, 38, 0x220011).setScrollFactor(0)
            .setInteractive({ useHandCursor: true }) as unknown as Phaser.GameObjects.Image;
      dc.add(btn);
      const txt = this.add.text(bx, cy + 38, label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '15px', color,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
      txt.on('pointerdown', action);
      btn.on('pointerdown', action);
      dc.add(txt);
    };

    mkDlgBtn(cx - 72, 'YES', '#ff4444', () => { this.paused = false; this.scene.start(SCENE.MainMenu); });
    mkDlgBtn(cx + 72, 'NO',  '#ccbbee', () => dc.destroy(true));
  }

  // Debug overlay: floor contact points, depth bands, attack reach + hurt spans.
  private drawDebug(): void {
    const d = this.debugGfx;
    d.clear();
    if (!this.debugOn) return;

    // Lane tolerance band around the player's feet.
    d.lineStyle(1, COLORS.debug, 0.5);
    d.strokeRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);

    const all = [this.player, ...this.waves.enemies];
    for (const f of all) {
      if (!f.alive) continue;
      // Feet contact point.
      d.fillStyle(COLORS.debug, 1);
      d.fillCircle(f.x, f.feetY, 3);
      // Hurt span.
      const h = f.hurtSpan();
      d.lineStyle(1, 0x44aaff, 0.9);
      d.strokeRect(h.x1, h.laneY - 6, h.x2 - h.x1, 12);
      // Attack reach when active.
      if (f.attackActive) {
        const r = f.attackReach();
        d.lineStyle(2, 0xff3344, 1);
        d.strokeRect(r.x1, r.laneY - 8, r.x2 - r.x1, 16);
      }
    }
  }
}

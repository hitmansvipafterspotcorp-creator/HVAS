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

export class BrawlerScene extends Phaser.Scene {
  private stage!: StageData;
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

  constructor() {
    super(SCENE.Brawler);
  }

  create(data?: { stage?: StageData }): void {
    this.stage = data?.stage ?? DEFAULT_STAGE;
    AudioSystem.playForStage(this, this.stage.id);

    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Real backdrop if the PNG exists; graybox floor always drawn underneath.
    StageLoader.loadBackdrop(this, this.stage);

    // Floor band — visible over the backdrop so the walkable lane reads clearly.
    const g = this.add.graphics().setDepth(-1999);
    g.fillStyle(COLORS.floor, 0.45);
    g.fillRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);
    g.lineStyle(2, COLORS.floorLine, 0.6);
    g.strokeRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);

    // Player — uses real sprite art if its anims are built, else graybox.
    this.player = new Fighter(this, 'player', 180, FLOOR_BOTTOM - 20, 120, PLAYER_ID);

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
    p.x = Phaser.Math.Clamp(p.x, 20, GAME_WIDTH - 20);
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
      // No boss — immediate clear (guard so this only fires once).
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
      this.addVenueDoor(GAME_WIDTH - 120, FLOOR_BOTTOM - 40, 'Enter Venue', s.venueUnlocks);
    }

    // Above-venue (rooftop etc.) unlocked at the same time.
    if (s.aboveVenueUnlocks) {
      this.addVenueDoor(GAME_WIDTH - 240, FLOOR_BOTTOM - 80, 'Rooftop', s.aboveVenueUnlocks);
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

  // Assemble the real HUD art: gold health-bar frame with a depletion mask,
  // a digit-font HP readout, the combo label + count, and star meter pips.
  private buildHud(): void {
    if (!UISystem.ready(this)) return;

    const frameX = 12;
    const frameY = 12;
    const frameW = 340;
    const tex = this.textures.get(UI.healthBar).getSourceImage();
    const frameH = (tex.height / tex.width) * frameW;

    // The art's inner red channel sits between ~16.5% and ~86% of the width.
    this.hpInner.x = frameX + frameW * 0.165;
    this.hpInner.w = frameW * (0.86 - 0.165);
    const innerY = frameY + frameH * 0.5;
    const innerH = frameH * 0.42;

    // Depletion mask: a dark rect that grows from the right as HP drops, drawn
    // UNDER the frame so the gold border stays crisp.
    this.hpFill = this.add
      .rectangle(this.hpInner.x + this.hpInner.w, innerY, 0, innerH, 0x1a0608, 0.9)
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(50000);

    this.add
      .image(frameX, frameY, UI.healthBar)
      .setOrigin(0, 0)
      .setDisplaySize(frameW, frameH)
      .setScrollFactor(0)
      .setDepth(50001);

    // HP number in the gold digit font, right under the bar.
    this.hpNum = new NumberDisplay(this, frameX + 18, frameY + frameH + 14, 20)
      .setDepth(50002);

    // Combo label + count (hidden until combo > 0).
    this.comboLabel = this.add
      .image(frameX + 150, frameY + frameH + 14, UI.comboLabel)
      .setOrigin(0, 0.5)
      .setDisplaySize(30, 28)
      .setScrollFactor(0)
      .setDepth(50002)
      .setVisible(false);
    this.comboNum = new NumberDisplay(this, frameX + 186, frameY + frameH + 14, 22)
      .setDepth(50002);

    // Meter: 10 star pips that light up with super meter.
    for (let i = 0; i < 10; i++) {
      const pip = this.add
        .image(this.hpInner.x + i * 16, frameY + frameH + 40, UI.pipStar)
        .setOrigin(0, 0.5)
        .setDisplaySize(13, 15)
        .setScrollFactor(0)
        .setDepth(50002)
        .setAlpha(0.25);
      this.meterPips.push(pip);
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
    g.add(this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setScrollFactor(0));

    // Panel art (pausePanel 607×385) or fallback rectangle
    if (this.textures.exists(UI.pausePanel)) {
      const panel = this.add.image(cx, cy, UI.pausePanel).setOrigin(0.5).setScrollFactor(0);
      const panelScale = Math.min(560 / panel.width, 340 / panel.height);
      panel.setScale(panelScale);
      g.add(panel);
    } else {
      g.add(this.add.rectangle(cx, cy, 560, 340, 0x110022, 0.95).setScrollFactor(0));
    }

    // Title art (pauseTitle 578×111) or fallback text
    if (this.textures.exists(UI.pauseTitle)) {
      const title = this.add.image(cx, cy - 130, UI.pauseTitle).setOrigin(0.5).setScrollFactor(0);
      title.setScale(Math.min(340 / title.width, 70 / title.height));
      g.add(title);
    } else {
      g.add(this.add.text(cx, cy - 130, 'PAUSED', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '36px', color: '#ffd700',
        stroke: '#000000', strokeThickness: 6,
      }).setOrigin(0.5).setScrollFactor(0));
    }

    // Menu options
    const OPTIONS = [
      { label: 'RESUME',      action: () => this.togglePause() },
      { label: 'RESTART',     action: () => { this.paused = false; this.scene.restart(); } },
      { label: 'STAGE SELECT',action: () => { this.paused = false; this.scene.start(SCENE.StageSelect); } },
      { label: 'MAIN MENU',   action: () => { this.paused = false; this.scene.start(SCENE.MainMenu); } },
    ];
    OPTIONS.forEach((opt, i) => {
      const y = cy - 50 + i * 52;
      const btn = this.add.text(cx, y, opt.label, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: i === 0 ? '#ffd700' : '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setColor('#ffd700').setScale(1.08));
      btn.on('pointerout',  () => btn.setColor(i === 0 ? '#ffd700' : '#ffffff').setScale(1));
      btn.on('pointerdown', () => opt.action());
      g.add(btn);
    });
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

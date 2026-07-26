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
import { TileComposer, type TileLayout } from '../systems/TileComposer';
import { CAFE8FIFTY_EXTERIOR_LAYOUT } from '../data/layouts/cafe8fifty_exterior';

const STAGE_LAYOUTS: Record<string, TileLayout> = {
  cafe8fifty: CAFE8FIFTY_EXTERIOR_LAYOUT,
};
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
import { movesFor, type AttackButton, type SheetMove } from '../data/sheetMoves';

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
  private hpLiveFill?: Phaser.GameObjects.Rectangle;
  private meterLiveFill?: Phaser.GameObjects.Rectangle;
  private guardLiveFill?: Phaser.GameObjects.Rectangle;
  private hudBarGlow?: Phaser.GameObjects.Graphics;
  private hpInner = { x: 0, w: 0 };
  private hpNum?: NumberDisplay;
  private comboLabel?: Phaser.GameObjects.Image;
  private comboNum?: NumberDisplay;
  private meterPips: Phaser.GameObjects.Image[] = [];
  private dangerOverlay?: Phaser.GameObjects.Image;
  private prevPlayerHp = 0;
  private _stageStartTime = 0;
  private _enemiesDefeated = 0;
  private currentMove?: SheetMove;
  private attackHitLanded = false;
  private chainStep = 0;
  private chainLastAt = 0;
  private readonly chainWindowMs = 720;

  constructor() {
    super(SCENE.Brawler);
  }

  create(data?: { stage?: StageData }): void {
    this.stage = data?.stage ?? DEFAULT_STAGE;
    this._stageStartTime = this.time.now;
    this._enemiesDefeated = 0;
    AudioSystem.playForStage(this, this.stage.id);

    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Tile-composed backdrop when we have a layout for this stage; falls
    // back to the pre-composited PNG via StageLoader otherwise. Pass
    // ?nobackdrop=tiles in the URL to force the legacy path for A/B testing.
    const forceLegacy = typeof window !== 'undefined'
      && window.location.search.includes('nobackdrop=tiles');
    const layout = STAGE_LAYOUTS[this.stage.id];
    if (layout && !forceLegacy) {
      TileComposer.compose(this, layout);
    } else {
      StageLoader.loadBackdrop(this, this.stage);
    }

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
    this.player = new Fighter(this, 'player', 220, FLOOR_BOTTOM - 20, 120, PLAYER_ID);
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
      // Count fresh KOs before reap removes them.
      this._enemiesDefeated += this.waves.enemies.filter(e => !e.alive && (e.sprite ?? e.body).alpha > 0.98).length;
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
      const move = this.currentMove ?? movesFor(this.player.charId).light;
      const opts = this.weapon.augmentOpts({
        damage: move.damage,
        knockback: move.knockback,
        meterGain: move.meterGain,
      });
      const hit = this.combat.resolve(this.player, [this.boss.boss], opts);
      if (hit) {
        this.weapon.use();
        this.combat.triggerHitStop(120);
        this.floatingText.damage(this.boss.boss.x, this.boss.boss.feetY - 30, opts.damage);
        this.playMoveImpactVfx(this.boss.boss, move);
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
        const move = this.currentMove ?? movesFor(p.charId).light;
        const elapsed = move.lockMs - p.stateTimer;
        p.attackActive = elapsed >= move.activeStartMs && elapsed <= move.activeEndMs;
        if (p.attackActive && !this.attackHitLanded) {
          const base = {
            damage: move.damage,
            knockback: move.knockback,
            meterGain: move.meterGain,
          };
          const opts = this.weapon.augmentOpts(base);
          const hit = this.combat.resolve(p, this.waves.enemies, opts);
          if (hit) {
            this.attackHitLanded = true;
            AudioSystem.sfx(this, 'hit');
            this.weapon.use();
            this.combat.triggerHitStop(move.button === 'heavy' || move.button === 'special' ? 90 : 55);
            for (const e of this.waves.enemies) {
              if ((e.state === 'hit' || e.state === 'block') && e.alive) {
                this.floatingText.damage(e.x, e.feetY - 30, opts.damage);
                this.playMoveImpactVfx(e, move, e.state === 'block');
              }
            }
            this.floatingText.comboFlash(p.x, p.feetY - 50, p.combo);
          }
        }
      }
      if (p.stateTimer <= 0) {
        p.state = 'idle';
        p.attackActive = false;
        this.attackHitLanded = false;
        this.currentMove = undefined;
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
    if (b.special) {
      this.startSheetAttack('special');
      return;
    }

    if (b.heavy) {
      this.startSheetAttack('heavy');
      return;
    }

    if (b.attack) {
      this.startChainAttack();
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

  private startChainAttack(): void {
    const now = this.time.now;
    if (now - this.chainLastAt > this.chainWindowMs) {
      this.chainStep = 0;
    } else {
      this.chainStep = (this.chainStep + 1) % 3;
    }
    this.chainLastAt = now;
    const button: AttackButton = ['light', 'medium', 'heavy'][this.chainStep] as AttackButton;
    this.startSheetAttack(button);
  }

  private startSheetAttack(button: AttackButton): void {
    const p = this.player;
    const move: SheetMove = { ...movesFor(p.charId)[button] };
    if (button === 'special') {
      const chainBonus = this.chainStep * 2;
      move.damage += chainBonus;
      move.knockback += chainBonus * 3;
      this.chainStep = 0;
      this.chainLastAt = 0;
    }
    this.currentMove = move;
    this.attackHitLanded = false;
    p.attackIndex =
      move.button === 'light' ? 0 :
        move.button === 'medium' ? 1 :
          move.button === 'heavy' ? 2 : 3;
    p.state = 'attack';
    p.stateTimer = move.lockMs;
    p.attackActive = false;
    this.flashMove(move);
  }

  private flashMove(move: SheetMove): void {
    this.banner
      .setText(`${move.button.toUpperCase()} - ${move.name}`)
      .setVisible(true)
      .setAlpha(1)
      .setScale(1);
    this.banner.setColor(move.bannerColor);
    this.tweens.add({
      targets: this.banner,
      alpha: 0,
      scale: 1.18,
      duration: 650,
      ease: 'Cubic.out',
      onComplete: () => {
        this.banner.setVisible(false);
        this.banner.setColor('#ffd700');
      },
    });
  }

  private playMoveImpactVfx(target: Fighter, move: SheetMove, blocked = false): void {
    const x = target.x - this.player.facing * 10;
    const y = target.feetY - 62;
    const flipX = this.player.facing < 0;

    if (blocked) {
      const shield = this.vfx.charVfx(this.player.charId, 'vfx_shield_pulse', x, y, 1.35, 91500, flipX)
        || this.vfx.charVfx(this.player.charId, 'vfx_block', x, y, 1.35, 91500, flipX);
      if (!shield) this.vfx.parryFlash(x, y);
      return;
    }

    let usedSheetVfx = false;
    if (move.button === 'light') {
      usedSheetVfx = this.vfx.charVfx(this.player.charId, 'vfx_hit_light', x, y, 0.72, 91500, flipX);
    } else if (move.button === 'medium') {
      usedSheetVfx = this.vfx.charVfx(this.player.charId, 'vfx_arc', x + this.player.facing * 12, y, 0.86, 91500, flipX)
        || this.vfx.charVfx(this.player.charId, 'vfx_hit_light', x, y, 0.78, 91500, flipX);
    } else if (move.button === 'heavy') {
      usedSheetVfx = this.vfx.charVfx(this.player.charId, 'vfx_hit_heavy', x, y + 4, 0.98, 91500, flipX)
        || this.vfx.charVfx(this.player.charId, 'vfx_burst', x, y + 8, 0.92, 91500, flipX);
    } else {
      const trail = this.vfx.charVfx(this.player.charId, 'vfx_chant_trail', x + this.player.facing * 18, y, 1.05, 91500, flipX);
      const burst = this.vfx.charVfx(this.player.charId, 'vfx_super_burst', x, y + 10, 1.1, 91501, flipX);
      usedSheetVfx = trail || burst || this.vfx.charVfx(this.player.charId, 'vfx_special', x, y, 1.02, 91500, flipX);
    }

    if (!usedSheetVfx) this.vfx.hitSpark(x, y, this.player.facing);
  }

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
    const visibleHalf = Math.max(90, (p.sprite?.displayWidth ?? 160) * 0.45);
    const zoneMax = GAME_WIDTH * (this.currentZone + 1) - visibleHalf;
    p.x = Phaser.Math.Clamp(p.x, visibleHalf, Math.min(zoneMax, this.worldWidth - visibleHalf));
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

    // Show mission summary overlay, then spawn venue doors.
    this.time.delayedCall(1200, () => this.showMissionSummary());
  }

  private showMissionSummary(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panelW = 420, panelH = 240;

    const dc = this.add.container(0, 0).setDepth(91000).setScrollFactor(0);

    // Dim backdrop
    dc.add(this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setScrollFactor(0));

    // Panel art or fallback rect
    if (this.textures.exists(UI.pmxMissionSummary)) {
      dc.add(this.add.image(cx, cy, UI.pmxMissionSummary)
        .setDisplaySize(panelW, panelH).setScrollFactor(0));
    } else {
      dc.add(this.add.rectangle(cx, cy, panelW, panelH, 0x0a0614)
        .setStrokeStyle(2, 0xffd700).setScrollFactor(0));
    }

    // Title
    dc.add(this.add.text(cx, cy - panelH / 2 + 24, 'MISSION COMPLETE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0));

    // Stage name
    dc.add(this.add.text(cx, cy - panelH / 2 + 52, this.stage.name ?? this.stage.id, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ccbbee',
    }).setOrigin(0.5).setScrollFactor(0));

    // Stats rows
    const elapsed = Math.floor((this.time.now - (this._stageStartTime ?? this.time.now)) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const statRows = [
      ['TIME',    `${mm}:${ss}`],
      ['ENEMIES', String(this._enemiesDefeated ?? 0)],
    ];
    statRows.forEach(([lbl, val], i) => {
      const ry = cy - 14 + i * 28;
      dc.add(this.add.text(cx - 80, ry, lbl, {
        fontFamily: 'monospace', fontSize: '13px', color: '#887799',
      }).setOrigin(0, 0.5).setScrollFactor(0));
      dc.add(this.add.text(cx + 80, ry, val, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffffff',
      }).setOrigin(1, 0.5).setScrollFactor(0));
    });

    // Rank star strip
    if (this.textures.exists(UI.vmStarBadge)) {
      for (let s = 0; s < 3; s++) {
        dc.add(this.add.image(cx - 28 + s * 28, cy + 68, UI.vmStarBadge)
          .setDisplaySize(24, 24).setScrollFactor(0));
      }
    }

    dc.add(this.add.text(cx, cy + panelH / 2 - 18, 'TAP TO CONTINUE', {
      fontFamily: 'monospace', fontSize: '11px', color: '#665577',
    }).setOrigin(0.5).setScrollFactor(0));

    // Dismiss on click or 4 seconds
    const dismiss = () => { dc.destroy(true); this.spawnVenueDoors(); };
    this.time.delayedCall(4000, dismiss);
    this.input.once('pointerdown', dismiss);
    this.input.keyboard!.once('keydown-SPACE', dismiss);
    this.input.keyboard!.once('keydown-ENTER', dismiss);
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
    const flash = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0xffffff,
      0.18,
    ).setScrollFactor(0).setDepth(60001);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 110,
      ease: 'Quad.out',
      onComplete: () => flash.destroy(),
    });
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
      this.add.image(24, 14, UI.hudPortraitFrame)
        .setOrigin(0, 0).setDisplaySize(78, 98)
        .setScrollFactor(0).setDepth(DEPTH);
    }

    // Health bar — full-width art, dark mask depletes from right
    const hpTex = this.textures.exists(UI.hudHealthBar)
      ? this.textures.get(UI.hudHealthBar).getSourceImage() : null;
    const hpW = 388, hpH = hpTex ? Math.round((hpTex.height / hpTex.width) * hpW) : 42;
    const hpX = 82, hpY = 16;
    this.hpInner.x = hpX + hpW * 0.18;
    this.hpInner.w = hpW * 0.72;
    const innerY = hpY + hpH * 0.5;
    this.hpLiveFill = this.add.rectangle(
      this.hpInner.x, innerY, this.hpInner.w, Math.max(10, hpH * 0.34), 0xff1738, 0.9,
    ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH - 2);
    this.hpFill = this.add.rectangle(
      this.hpInner.x + this.hpInner.w, innerY, 0, Math.max(12, hpH * 0.42), 0x050009, 0.92,
    ).setOrigin(1, 0.5).setScrollFactor(0).setDepth(DEPTH + 1);
    if (hpTex) {
      this.add.image(hpX, hpY, UI.hudHealthBar)
        .setOrigin(0, 0).setDisplaySize(hpW, hpH)
        .setScrollFactor(0).setDepth(DEPTH + 2);
    }

    // Super bar below health
    if (this.textures.exists(UI.hudSuperBar)) {
      this.meterLiveFill = this.add.rectangle(
        hpX + 90, hpY + hpH + 19, 0, 10, 0xd620ff, 0.85,
      ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH - 2);
      this.add.image(hpX + 56, hpY + hpH + 5, UI.hudSuperBar)
        .setOrigin(0, 0).setDisplaySize(360, 30)
        .setScrollFactor(0).setDepth(DEPTH + 2);
    }
    // Guard bar below super
    if (this.textures.exists(UI.hudGuardBar)) {
      this.guardLiveFill = this.add.rectangle(
        hpX + 90, hpY + hpH + 47, 0, 10, 0x1c8dff, 0.78,
      ).setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH - 2);
      this.add.image(hpX + 56, hpY + hpH + 33, UI.hudGuardBar)
        .setOrigin(0, 0).setDisplaySize(360, 30)
        .setScrollFactor(0).setDepth(DEPTH + 2);
    }
    this.hudBarGlow = this.add.graphics().setScrollFactor(0).setDepth(DEPTH + 3);

    // HP digit readout
    this.hpNum = new NumberDisplay(this, hpX + 92, hpY + hpH + 74, 18).setDepth(DEPTH + 4);

    // Combo counter (hidden until combo > 1)
    if (this.textures.exists(UI.hudComboCounter)) {
      this.comboLabel = this.add.image(hpX + 190, hpY + hpH + 74, UI.hudComboCounter)
        .setOrigin(0, 0.5).setDisplaySize(56, 22)
        .setScrollFactor(0).setDepth(DEPTH + 3).setVisible(false);
    }
    this.comboNum = new NumberDisplay(this, hpX + 252, hpY + hpH + 74, 20).setDepth(DEPTH + 4);

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
        .setOrigin(0.5, 1).setDisplaySize(420, 44)
        .setScrollFactor(0).setDepth(DEPTH);
    }
    const promptY = GAME_HEIGHT - 33;
    const prompts: Array<[string, string, number, number]> = [
      [UI.hudBtnLight, 'CHAIN', GAME_WIDTH - 306, 78],
      [UI.hudBtnHeavy, 'HEAVY', GAME_WIDTH - 222, 82],
      [UI.hudBtnBlock, 'BLOCK', GAME_WIDTH - 140, 74],
      [UI.hudBtnSpecial, 'SPECIAL', GAME_WIDTH - 62, 82],
    ];
    for (const [key, label, x, w] of prompts) {
      if (this.textures.exists(key)) {
        this.add.image(x, promptY, key)
          .setDisplaySize(w, 20)
          .setScrollFactor(0).setDepth(DEPTH + 1);
      }
      this.add.text(x, promptY, label, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '8px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 2);
    }

    // Meter pips (star icons below guard bar)
    if (this.textures.exists(UI.hudPipStar)) {
      for (let i = 0; i < 10; i++) {
        const pip = this.add.image(hpX + 88 + i * 23, hpY + hpH + 97, UI.hudPipStar)
          .setOrigin(0, 0.5).setDisplaySize(20, 22)
          .setScrollFactor(0).setDepth(DEPTH + 3).setAlpha(0.25);
        this.meterPips.push(pip);
      }
    }

    // ── Screen-edge overlays (depth above everything) ─────────────────────
    if (this.textures.exists(UI.hudDanger)) {
      this.dangerOverlay = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI.hudDanger)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setScrollFactor(0).setDepth(60000).setAlpha(0).setVisible(false);
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
      this.hpLiveFill?.setFillStyle(frac < 0.25 ? 0xff2933 : 0xff1738, frac < 0.25 ? 1 : 0.9);
      this.meterLiveFill?.setDisplaySize(360 * 0.76 * Phaser.Math.Clamp(p.meter / 100, 0, 1), 10);
      this.guardLiveFill?.setDisplaySize(360 * 0.76 * (p.state === 'block' ? 1 : 0.62), 10);
      if (this.hudBarGlow) {
        this.hudBarGlow.clear();
        const pulse = 0.35 + 0.25 * Math.sin(this.time.now / 180);
        this.hudBarGlow.lineStyle(2, frac < 0.25 ? 0xff3344 : 0xffd700, pulse);
        this.hudBarGlow.strokeRoundedRect(78, 13, 398, 101, 8);
      }
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

    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setDepth(90000).setScrollFactor(0);
    this.tweens.add({ targets: overlay, alpha: { from: 0, to: 0.78 }, duration: 300 });

    // Panel art or fallback
    if (this.textures.exists(UI.pmxPanelSmall)) {
      this.add.image(cx, cy + 10, UI.pmxPanelSmall)
        .setDisplaySize(380, 200).setDepth(90001).setScrollFactor(0);
    } else {
      this.add.rectangle(cx, cy + 10, 380, 200, 0x0a0614)
        .setStrokeStyle(2, 0xff2244).setDepth(90001).setScrollFactor(0);
    }

    // Title bar behind K.O. text
    if (this.textures.exists(UI.u1TitleBar4)) {
      this.add.image(cx, cy - 52, UI.u1TitleBar4)
        .setDisplaySize(340, 52).setDepth(90002).setScrollFactor(0).setAlpha(0.8);
    }

    this.add.text(cx, cy - 52, 'K.O.', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '56px', color: '#ff2244',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(90003).setScrollFactor(0);

    this.add.text(cx, cy + 14, 'RETRY STAGE?', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(90003).setScrollFactor(0);

    // Retry / Menu buttons
    const mkKoBtn = (bx: number, label: string, artKey: string, color: string, action: () => void) => {
      if (this.textures.exists(artKey)) {
        const btn = this.add.image(bx, cy + 60, artKey)
          .setDisplaySize(140, 38).setDepth(90003).setScrollFactor(0)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerdown', action);
      }
      this.add.text(bx, cy + 60, label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color,
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(90004).setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', action);
    };
    mkKoBtn(cx - 80, 'RETRY', UI.u1BtnConfirm,  '#ffd700', () => this.scene.restart());
    mkKoBtn(cx + 80, 'MENU',  UI.u1BtnBack,     '#ccbbee', () => this.scene.start(SCENE.MainMenu));

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

    // Most pm_* exports include design-guide annotation text ("PM_PANEL_LEFT_01",
    // "PM_BTN_RESTART_DEFAULT") baked in. Use clean rendered panel + buttons.

    // Dim backdrop
    g.add(this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75).setScrollFactor(0));

    // Main panel
    g.add(this.add.rectangle(cx, cy, 380, 320, 0x0a0420, 0.96)
      .setStrokeStyle(3, 0xffd700, 0.9).setScrollFactor(0));

    // Title banner
    g.add(this.add.rectangle(cx, cy - 130, 320, 44, 0x1a0a3a, 0.96)
      .setStrokeStyle(2, 0xffd700, 0.8).setScrollFactor(0));
    g.add(this.add.text(cx, cy - 130, '★ PAUSE MENU ★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0));

    // Buttons
    const BTNS: Array<{ label: string; action: () => void }> = [
      { label: 'RESUME',       action: () => this.togglePause() },
      { label: 'RESTART',      action: () => { this.paused = false; this.scene.restart(); } },
      { label: 'STAGE SELECT', action: () => { this.paused = false; this.scene.start(SCENE.StageSelect); } },
      { label: 'SETTINGS',     action: () => { this.paused = false; this.scene.start(SCENE.Options); } },
      { label: 'MAIN MENU',    action: () => this.showConfirmQuit() },
    ];

    const btnH = 38;
    const btnW = 260;
    const startY = cy - 80;

    BTNS.forEach((opt, i) => {
      const y = startY + i * (btnH + 4);
      const rect = this.add.rectangle(cx, y, btnW, btnH, 0x12082c, 0.96)
        .setStrokeStyle(2, 0x6644aa, 0.9)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(cx, y, opt.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0);
      rect.on('pointerover', () => {
        rect.setStrokeStyle(2, 0xffd700, 1).setFillStyle(0x2a124a, 0.96);
        txt.setColor('#ffd700');
      });
      rect.on('pointerout', () => {
        rect.setStrokeStyle(2, 0x6644aa, 0.9).setFillStyle(0x12082c, 0.96);
        txt.setColor('#ffffff');
      });
      rect.on('pointerdown', () => opt.action());
      g.add(rect);
      g.add(txt);
    });
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

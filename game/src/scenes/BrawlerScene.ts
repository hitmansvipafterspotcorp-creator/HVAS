import Phaser from 'phaser';
import {
  SCENE,
  GAME_WIDTH,
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
import { PLAYER_ID } from '../data/roster';
import { UISystem, UI, NumberDisplay } from '../systems/UISystem';
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
  private boss: BossSystem | null = null;
  private bossRevealTriggered = false;

  private hud!: Phaser.GameObjects.Text; // wave/enemies line (text)
  private banner!: Phaser.GameObjects.Text;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugOn = false;

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
    kb.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));

    this.add
      .text(GAME_WIDTH - 12, 10, 'F1 debug • ESC menu', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8877aa',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(50000);

    // Kick off wave 1.
    this.waves.tryAdvance();
    this.flashBanner('WAVE 1');
  }

  override update(_time: number, delta: number): void {
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
      if (hit) this.weapon.use();
    }

    // Drop pickup checks every frame.
    this.props.checkPickup(this.player, (kind) => {
      if (kind === 'health') this.player.hp = Math.min(this.player.hp + 30, this.player.maxHp);
      else this.player.meter = Math.min(this.player.meter + 25, 100);
    });
    this.weapon.checkPickup(this.player, this.props.weaponDrops);

    this.player.syncView();
    for (const e of this.waves.enemies) e.syncView();
    this.combat.decayCombo(this.player, delta);
    this.drawHud();
    this.drawDebug();
  }

  private updatePlayer(delta: number): void {
    const p = this.player;
    const b = this.controls.read();
    const dt = delta / 1000;

    if (p.invuln > 0) p.invuln -= delta;

    // Locked states (attack/hit) play out before control returns.
    if (p.state === 'attack' || p.state === 'hit') {
      p.stateTimer -= delta;
      // Active hit frames sit in the middle of an attack.
      if (p.state === 'attack') {
        p.attackActive = p.stateTimer > 120 && p.stateTimer < 240;
        if (p.attackActive) {
          const base = { damage: 9, knockback: 18, meterGain: 8 };
          const opts = this.weapon.augmentOpts(base);
          const hit = this.combat.resolve(p, this.waves.enemies, opts);
          if (hit) this.weapon.use();
        }
      }
      if (p.stateTimer <= 0) {
        p.state = 'idle';
        p.attackActive = false;
      }
      this.clampPlayer();
      return;
    }

    // Super.
    if (b.superMove && this.combat.trySuper(p, this.waves.enemies)) {
      p.playOneShot('super1');
      this.flashBanner('SUPER!');
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

    // Movement (8-way: x + depth).
    let vx = 0;
    let vy = 0;
    if (b.left) vx -= 1;
    if (b.right) vx += 1;
    if (b.up) vy -= 1;
    if (b.down) vy += 1;
    if (vx !== 0) p.facing = vx > 0 ? 1 : -1;
    p.x += vx * PLAYER_SPEED * dt;
    p.feetY += vy * PLAYER_DEPTH_SPEED * dt;
    p.state = vx !== 0 || vy !== 0 ? 'walk' : 'idle';

    this.clampPlayer();
  }

  private clampPlayer(): void {
    const p = this.player;
    p.x = Phaser.Math.Clamp(p.x, 20, GAME_WIDTH - 20);
    p.feetY = Phaser.Math.Clamp(p.feetY, FLOOR_TOP + 10, FLOOR_BOTTOM - 5);
  }

  private handleWaveFlow(): void {
    if (this.waves.cleared) {
      // Boss stage: trigger reveal once, then watch for boss defeat.
      if (this.boss) {
        if (!this.bossRevealTriggered) {
          this.bossRevealTriggered = true;
          this.boss.reveal(() => {
            this.flashBanner(`FIGHT ${this.def.name ?? this.stage.boss!.name}!`.trim());
          });
        }
        if (this.boss.defeated) {
          this.banner.setText('STAGE CLEAR!');
          this.banner.setVisible(true);
          this.time.delayedCall(2000, () => this.scene.start(SCENE.MainMenu));
        }
        return;
      }
      // No boss — immediate clear.
      this.banner.setText('STAGE CLEAR!');
      this.banner.setVisible(true);
      this.time.delayedCall(2000, () => this.scene.start(SCENE.MainMenu));
      return;
    }
    if (!this.waves.locked) {
      const advanced = this.waves.tryAdvance();
      if (advanced) this.flashBanner(`WAVE ${this.waves.current + 1}`);
    }
  }

  // Convenience: boss def alias for the reveal callback label.
  private get def(): { name: string } {
    return this.stage.boss ?? { name: '' };
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
      this.time.delayedCall(1500, () => this.scene.start(SCENE.MainMenu));
    }
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

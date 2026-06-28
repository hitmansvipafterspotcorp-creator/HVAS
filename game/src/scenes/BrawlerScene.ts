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
import { WaveSystem, type WaveDef } from '../systems/WaveSystem';

// BrawlerScene: the playable Streets-of-Rage graybox. Boots with a player on a
// floor, runs camera-locked waves, resolves combat through the depth gate, and
// shows an HUD + debug overlay. Real backdrops/sprites slot in over this layer.
const DEFAULT_WAVES: WaveDef[] = [
  { count: 3, hp: 40 },
  { count: 4, hp: 45 },
  { count: 5, hp: 55 },
];

export class BrawlerScene extends Phaser.Scene {
  private player!: Fighter;
  private controls!: InputSystem;
  private combat!: CombatSystem;
  private ai!: EnemyAISystem;
  private waves!: WaveSystem;

  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private debugOn = false;

  constructor() {
    super(SCENE.Brawler);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Floor band — the walkable depth region.
    const g = this.add.graphics().setDepth(-2000);
    g.fillStyle(COLORS.floor, 1);
    g.fillRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);
    g.lineStyle(2, COLORS.floorLine, 1);
    g.strokeRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);

    // Player.
    this.player = new Fighter(this, 'player', 180, FLOOR_BOTTOM - 20, 120);

    // Systems.
    this.controls = new InputSystem(this);
    this.combat = new CombatSystem(this);
    this.ai = new EnemyAISystem();
    this.waves = new WaveSystem(this, DEFAULT_WAVES);

    // HUD.
    this.hud = this.add
      .text(12, 10, '', {
        fontFamily: 'monospace',
        fontSize: '15px',
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
    // Hit-stop freezes the world (but not the render) for impact weight.
    const run = this.combat.tick(delta);
    if (run) {
      this.updatePlayer(delta);
      this.ai.update(this.waves.enemies, this.player, this.combat, delta);
      this.waves.reap();
      this.handleWaveFlow();
    }

    // Always sync views + HUD so freeze frames still render correctly.
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
          this.combat.resolve(p, this.waves.enemies, {
            damage: 9,
            knockback: 18,
            meterGain: 8,
          });
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
      this.flashBanner('SUPER!');
      return;
    }

    // Attack start.
    if (b.attack) {
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
      this.banner.setText('STAGE CLEAR!');
      this.banner.setVisible(true);
      return;
    }
    if (!this.waves.locked) {
      const advanced = this.waves.tryAdvance();
      if (advanced) this.flashBanner(`WAVE ${this.waves.current + 1}`);
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

  private drawHud(): void {
    const p = this.player;
    const alive = this.waves.enemies.filter((e) => e.alive).length;
    const hpBars = '█'.repeat(Math.ceil((p.hp / p.maxHp) * 20)).padEnd(20, '·');
    const meter = '▮'.repeat(Math.ceil((p.meter / 100) * 10)).padEnd(10, '·');
    this.hud.setText(
      `HP [${hpBars}] ${Math.ceil(p.hp)}/${p.maxHp}\n` +
        `SUPER [${meter}] ${p.meter}%   COMBO x${p.combo}\n` +
        `WAVE ${this.waves.current + 1}/${this.waves.total}   ENEMIES ${alive}`,
    );
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

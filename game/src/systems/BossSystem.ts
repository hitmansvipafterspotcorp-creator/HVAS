// BossSystem: end-of-stage boss encounter with a garage-door reveal cutscene
// and heavier AI (telegraphed charge attack). The cutscene locks player input,
// slides a door graphic upward to reveal the boss, then hands control back.
import Phaser from 'phaser';
import { Fighter } from '../entities/Fighter';
import { GAME_WIDTH, GAME_HEIGHT, FLOOR_TOP, FLOOR_BOTTOM } from '../config';
import type { BossDef } from '../data/stageTypes';
import type { CombatSystem } from './CombatSystem';
import { UISystem, UI } from './UISystem';

// How long the full reveal cutscene takes (ms).
const REVEAL_DURATION = 2800;

// Boss AI phases.
type BossPhase = 'idle' | 'approach' | 'charge' | 'recover';

export class BossSystem {
  boss: Fighter | null = null;
  active = false;        // true after cutscene completes
  defeated = false;

  private scene: Phaser.Scene;
  private def: BossDef;
  private phase: BossPhase = 'idle';
  private phaseTimer = 0;
  private chargeTarget = 0;

  // Exposed so BrawlerScene can block input during cutscene.
  cutsceneRunning = false;

  // Boss health bar (top of screen, enemy-side).
  private bossBarBg?: Phaser.GameObjects.Rectangle;
  private bossBarFill?: Phaser.GameObjects.Rectangle;
  private bossBarArt?: Phaser.GameObjects.Image;
  private bossLabel?: Phaser.GameObjects.Text;
  private bossBarW = 340;

  constructor(scene: Phaser.Scene, def: BossDef) {
    this.scene = scene;
    this.def = def;
  }

  // Trigger the reveal. Called by BrawlerScene once all regular waves clear.
  reveal(onComplete: () => void): void {
    this.cutsceneRunning = true;

    // Pre-spawn boss off-screen right; will walk in during cutscene.
    const startX = GAME_WIDTH + 80;
    const feetY = FLOOR_BOTTOM - 24;
    this.boss = new Fighter(
      this.scene,
      'enemy',
      startX,
      feetY,
      this.def.hp,
      this.def.charId,
    );
    this.boss.facing = -1;

    // ── Cutscene ────────────────────────────────────────────────────────────
    // 1. Flash WARNING banner.
    const warning = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30, '⚠ WARNING ⚠', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '40px',
        color: '#ff3300',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(80000)
      .setAlpha(0);

    // 2. Garage door — dark rect that fills lower 2/3 of screen then slides up.
    const doorH = GAME_HEIGHT * 0.7;
    const door = this.scene.add
      .rectangle(0, GAME_HEIGHT, GAME_WIDTH, doorH, 0x0a0a14)
      .setOrigin(0, 1)
      .setDepth(79000);

    const bossLabel = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20, this.def.revealLabel, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '48px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(80001)
      .setAlpha(0);

    // t=0 Warning flashes in.
    this.scene.tweens.add({ targets: warning, alpha: 1, duration: 300, ease: 'Linear' });

    // t=500 Warning fades.
    this.scene.tweens.add({ targets: warning, alpha: 0, duration: 300, delay: 500, ease: 'Linear' });

    // t=600 Door rises (scaleY shrinks so it appears to open upward).
    this.scene.tweens.add({
      targets: door,
      scaleY: 0,
      duration: 700,
      delay: 600,
      ease: 'Cubic.out',
    });

    // t=800 Boss label fades in.
    this.scene.tweens.add({ targets: bossLabel, alpha: 1, duration: 500, delay: 800, ease: 'Cubic.out' });

    // t=900 Boss walks from right edge to position.
    this.scene.time.delayedCall(900, () => {
      if (!this.boss) return;
      this.boss.state = 'walk';
      const walkTarget = { x: startX };
      this.scene.tweens.add({
        targets: walkTarget,
        x: GAME_WIDTH - 180,
        duration: 800,
        ease: 'Linear',
        onUpdate: () => {
          if (this.boss) this.boss.x = walkTarget.x;
        },
      });
    });

    // t=2100 Boss label fades out.
    this.scene.tweens.add({ targets: bossLabel, alpha: 0, duration: 400, delay: 2100, ease: 'Cubic.in' });

    // t=REVEAL_DURATION cutscene ends.
    this.scene.time.delayedCall(REVEAL_DURATION, () => {
      warning.destroy();
      door.destroy();
      bossLabel.destroy();
      if (this.boss) this.boss.state = 'idle';
      this.cutsceneRunning = false;
      this.active = true;
      this.phase = 'approach';
      this.phaseTimer = 1200;
      this.buildBossBar();
      onComplete();
    });

  }

  private buildBossBar(): void {
    const barH = 26;
    const bx = GAME_WIDTH - 12 - this.bossBarW;
    const by = 12;

    // Dark trough background
    this.bossBarBg = this.scene.add
      .rectangle(bx, by, this.bossBarW, barH, 0x1a0608)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(50003);

    // Red fill (depletes from right)
    this.bossBarFill = this.scene.add
      .rectangle(bx + this.bossBarW, by + barH / 2, 0, barH * 0.6, 0xcc2211)
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(50004);

    // Art overlay on top of fill (if available)
    if (UISystem.ready(this.scene) && this.scene.textures.exists(UI.hudBossBar)) {
      this.bossBarArt = this.scene.add
        .image(bx, by, UI.hudBossBar)
        .setOrigin(0, 0)
        .setDisplaySize(this.bossBarW, barH + 4)
        .setScrollFactor(0)
        .setDepth(50005);
    }

    this.bossLabel = this.scene.add
      .text(bx + this.bossBarW / 2, by + barH / 2, this.def.name.toUpperCase(), {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(50006);
  }

  // Call every frame while active. Returns true if the boss is still alive.
  update(player: Fighter, combat: CombatSystem, delta: number): boolean {
    if (!this.active || !this.boss || this.defeated) return !this.defeated;

    const b = this.boss;
    if (!b.alive) {
      this.defeated = true;
      this.teardownBar();
      return false;
    }

    this.phaseTimer -= delta;
    b.syncView();

    // Update boss HP bar (fill depletes from right using origin-1 pattern).
    if (this.bossBarFill) {
      this.bossBarFill.width = this.bossBarW * Math.max(0, b.hp / b.maxHp);
    }

    // State machine.
    if (b.state === 'hit') {
      b.stateTimer -= delta;
      if (b.stateTimer <= 0) { b.state = 'idle'; b.stateTimer = 0; }
      return true;
    }
    if (b.state === 'attack') {
      b.stateTimer -= delta;
      b.attackActive = b.stateTimer > 100 && b.stateTimer < 250;
      if (b.attackActive) {
        combat.resolve(b, [player], { damage: 15, knockback: 30, meterGain: 0 });
      }
      if (b.stateTimer <= 0) {
        b.state = 'idle';
        b.attackActive = false;
        this.phase = 'recover';
        this.phaseTimer = 900;
      }
      return true;
    }

    switch (this.phase) {
      case 'approach': {
        b.facing = player.x < b.x ? -1 : 1;
        const dx = player.x - b.x;
        const dy = player.feetY - b.feetY;
        if (Math.abs(dx) > 80 || Math.abs(dy) > 30) {
          b.x += Math.sign(dx) * 110 * (delta / 1000);
          b.feetY += Math.sign(dy) * 70 * (delta / 1000);
          b.x = Phaser.Math.Clamp(b.x, 20, GAME_WIDTH - 20);
          b.feetY = Phaser.Math.Clamp(b.feetY, FLOOR_TOP + 10, FLOOR_BOTTOM - 5);
          b.state = 'walk';
        }
        if (this.phaseTimer <= 0) {
          this.phase = 'charge';
          this.chargeTarget = player.x;
          this.phaseTimer = 600;
          b.state = 'idle'; // telegraph pause
        }
        break;
      }
      case 'charge': {
        // Telegraphed dash then punch.
        const cdx = this.chargeTarget - b.x;
        b.x += Math.sign(cdx) * 320 * (delta / 1000);
        b.facing = Math.sign(cdx) as 1 | -1;
        b.state = 'walk';
        if (Math.abs(cdx) < 50 || this.phaseTimer <= 0) {
          b.state = 'attack';
          b.stateTimer = 400;
          b.attackActive = false;
          this.phase = 'recover';
          this.phaseTimer = 1400;
        }
        break;
      }
      case 'recover': {
        b.state = 'idle';
        if (this.phaseTimer <= 0) {
          this.phase = 'approach';
          this.phaseTimer = 1800;
        }
        break;
      }
    }

    return true;
  }

  private teardownBar(): void {
    this.bossBarBg?.destroy();
    this.bossBarFill?.destroy();
    this.bossBarArt?.destroy();
    this.bossLabel?.destroy();
  }
}

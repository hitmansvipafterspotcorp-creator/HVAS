import Phaser from 'phaser';
import { FLOOR_TOP, FLOOR_BOTTOM, GAME_WIDTH } from '../config';
import { Fighter } from '../entities/Fighter';

// WaveSystem: spawns enemies in camera-locked waves. The scene stays gated
// (camera locked, can't advance) until the current wave is cleared, then the
// gate opens for the next. Data-driven so real stages can define waves in JSON.
export type WaveDef = { count: number; hp: number };

export class WaveSystem {
  private scene: Phaser.Scene;
  private waves: WaveDef[];
  private enemyCharIds: number[];
  private spawnCount = 0;
  private index = -1;
  enemies: Fighter[] = [];
  cleared = false; // all waves done

  constructor(scene: Phaser.Scene, waves: WaveDef[], enemyCharIds: number[] = []) {
    this.scene = scene;
    this.waves = waves;
    this.enemyCharIds = enemyCharIds;
  }

  get current(): number {
    return this.index;
  }
  get total(): number {
    return this.waves.length;
  }

  // True while enemies remain in the active wave (camera should stay locked).
  get locked(): boolean {
    return this.enemies.some((e) => e.alive);
  }

  // Advance to the next wave if the current one is cleared. Returns true if a
  // new wave was spawned.
  tryAdvance(): boolean {
    if (this.locked) return false;
    if (this.index + 1 >= this.waves.length) {
      this.cleared = true;
      return false;
    }
    this.index += 1;
    this.spawn(this.waves[this.index]);
    return true;
  }

  private spawn(def: WaveDef): void {
    this.enemies = this.enemies.filter((e) => e.alive); // keep none; all dead
    for (let i = 0; i < def.count; i++) {
      const fromLeft = i % 2 === 0;
      const x = fromLeft
        ? -40 - i * 30
        : GAME_WIDTH + 40 + i * 30;
      const feetY = Phaser.Math.Between(FLOOR_TOP + 20, FLOOR_BOTTOM - 10);
      const charId =
        this.enemyCharIds.length > 0
          ? this.enemyCharIds[this.spawnCount % this.enemyCharIds.length]
          : 0;
      this.spawnCount += 1;
      this.enemies.push(new Fighter(this.scene, 'enemy', x, feetY, def.hp, charId));
    }
  }

  // Drop KO'd enemies after a beat so the floor doesn't fill with corpses.
  reap(): void {
    for (const e of this.enemies) {
      if (!e.alive) {
        e.stateTimer -= 16;
        if (e.stateTimer < 99000) {
          const view = e.sprite ?? e.body;
          view.setAlpha(Math.max(0, view.alpha - 0.04));
          e.shadow.setAlpha(Math.max(0, e.shadow.alpha - 0.04));
        }
      }
    }
    this.enemies = this.enemies.filter((e) => {
      const a = (e.sprite ?? e.body).alpha;
      return e.alive || a > 0.02;
    });
  }
}

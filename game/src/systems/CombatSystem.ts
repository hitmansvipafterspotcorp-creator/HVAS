import { DepthGateSystem } from './DepthGateSystem';
import type { Fighter } from '../entities/Fighter';

// CombatSystem: resolves attacks into damage with juice (hit-stop, shake,
// knockback, spark VFX, combo + meter). Stateless — call resolve() each frame
// with the live attackers/targets. Damage only applies through the depth gate.
export class CombatSystem {
  private scene: Phaser.Scene;
  hitStopMs = 0; // global hit-stop; the scene pauses sim while > 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // Try to land `attacker`'s active attack against any of `targets`.
  resolve(
    attacker: Fighter,
    targets: Fighter[],
    opts: { damage: number; knockback: number; meterGain: number },
  ): boolean {
    let landed = false;
    for (const t of targets) {
      if (t === attacker) continue;
      if (!DepthGateSystem.connects(attacker, t)) continue;

      // Apply damage.
      t.hp = Math.max(0, t.hp - opts.damage);
      t.invuln = 220; // brief i-frames so one swing = one hit
      t.state = 'hit';
      t.stateTimer = 180;

      // Knockback along attacker facing, clamped by the scene later.
      t.x += attacker.facing * opts.knockback;

      // Combo + meter for the attacker.
      attacker.combo += 1;
      attacker.meter = Math.min(100, attacker.meter + opts.meterGain);

      // Juice.
      this.spark(t.x, t.feetY - 60);
      this.hitStopMs = Math.max(this.hitStopMs, 70);
      this.scene.cameras.main.shake(90, 0.006);

      if (t.hp <= 0) {
        t.state = 'ko';
        t.stateTimer = 99999;
      }
      landed = true;
    }
    return landed;
  }

  private spark(x: number, y: number): void {
    const s = this.scene.add
      .star(x, y, 5, 6, 16, 0xfff2a0)
      .setDepth(9999);
    this.scene.tweens.add({
      targets: s,
      scale: 0.2,
      alpha: 0,
      angle: 90,
      duration: 180,
      onComplete: () => s.destroy(),
    });
  }

  triggerHitStop(ms: number): void {
    this.hitStopMs = Math.max(this.hitStopMs, ms);
  }

  // Decrement global hit-stop. Returns true if the world should run this frame.
  tick(deltaMs: number): boolean {
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - deltaMs);
      return false;
    }
    return true;
  }

  // Reset combo if the player has not hit anything for a while.
  decayCombo(f: Fighter, deltaMs: number): void {
    const data = f as unknown as { _comboTimer?: number };
    if (f.combo > 0) {
      data._comboTimer = (data._comboTimer ?? 0) + deltaMs;
      if (data._comboTimer > 1200) {
        f.combo = 0;
        data._comboTimer = 0;
      }
    } else {
      data._comboTimer = 0;
    }
  }

  // Marvel-vs-Capcom-style super: needs full meter, hits all in-lane targets
  // hard with a screen-wide flash.
  trySuper(attacker: Fighter, targets: Fighter[]): boolean {
    if (attacker.meter < 100) return false;
    attacker.meter = 0;

    const flash = this.scene.add
      .rectangle(
        this.scene.cameras.main.centerX,
        this.scene.cameras.main.centerY,
        this.scene.scale.width,
        this.scene.scale.height,
        0xffffff,
        0.85,
      )
      .setScrollFactor(0)
      .setDepth(99999);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 350,
      onComplete: () => flash.destroy(),
    });

    this.scene.cameras.main.shake(280, 0.014);
    let hit = false;
    for (const t of targets) {
      if (t === attacker || !t.alive) continue;
      if (!DepthGateSystem.sameLane(attacker, t)) continue;
      if (Math.abs(t.x - attacker.x) > 220) continue;
      t.hp = Math.max(0, t.hp - 45);
      t.state = 'hit';
      t.stateTimer = 320;
      t.x += attacker.facing * 60;
      attacker.combo += 1;
      this.spark(t.x, t.feetY - 60);
      if (t.hp <= 0) {
        t.state = 'ko';
        t.stateTimer = 99999;
      }
      hit = true;
    }
    return hit;
  }
}

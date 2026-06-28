import Phaser from 'phaser';
import { DepthGateSystem } from './DepthGateSystem';
import { FLOOR_TOP, FLOOR_BOTTOM, LANE_TOLERANCE } from '../config';
import type { Fighter } from '../entities/Fighter';
import type { CombatSystem } from './CombatSystem';

// EnemyAISystem with crowd control: only ONE enemy holds the "attacker" token
// at a time and rushes the player; the rest circle, reposition, and wait at a
// stand-off distance. This is the Streets-of-Rage politeness that stops the
// player from being swarmed.
export class EnemyAISystem {
  private attackerToken: Fighter | null = null;
  private tokenTimer = 0;

  update(
    enemies: Fighter[],
    player: Fighter,
    combat: CombatSystem,
    deltaMs: number,
  ): void {
    const living = enemies.filter((e) => e.alive);

    // Rotate the attack token so different enemies get a turn.
    this.tokenTimer -= deltaMs;
    if (
      !this.attackerToken ||
      !this.attackerToken.alive ||
      this.tokenTimer <= 0
    ) {
      this.attackerToken =
        living.length > 0
          ? living[Phaser.Math.Between(0, living.length - 1)]
          : null;
      this.tokenTimer = Phaser.Math.Between(900, 1600);
    }

    const dt = deltaMs / 1000;
    for (const e of living) {
      // Respect locked states (hit/attack) — don't override animation locks.
      if (e.state === 'hit' || e.state === 'attack') {
        e.stateTimer -= deltaMs;
        if (e.stateTimer <= 0) {
          e.state = 'idle';
          e.attackActive = false;
        }
        continue;
      }
      if (e.invuln > 0) e.invuln -= deltaMs;

      e.facing = player.x >= e.x ? 1 : -1;

      if (e === this.attackerToken) {
        this.rush(e, player, combat, dt);
      } else {
        this.circle(e, player, living, dt);
      }
      e.feetY = Phaser.Math.Clamp(e.feetY, FLOOR_TOP, FLOOR_BOTTOM);
    }
  }

  // The token-holder closes in and attacks when in range + in lane.
  private rush(
    e: Fighter,
    player: Fighter,
    combat: CombatSystem,
    dt: number,
  ): void {
    const dx = player.x - e.x;
    const dist = Math.abs(dx);
    const speed = 110;

    // Match the player's depth lane first.
    if (!DepthGateSystem.sameLane(e, player)) {
      e.feetY += Math.sign(player.feetY - e.feetY) * 80 * dt;
    }

    if (dist > 50) {
      e.x += Math.sign(dx) * speed * dt;
      e.state = 'walk';
    } else if (DepthGateSystem.sameLane(e, player)) {
      // In range and in lane — throw a punch.
      e.state = 'attack';
      e.stateTimer = 360;
      e.attackActive = true;
      // The active hit window resolves immediately this frame.
      combat.resolve(e, [player], {
        damage: 6,
        knockback: 14,
        meterGain: 0,
      });
      // After this frame the active flag is cleared by the state lock above.
      e.attackActive = false;
    }
  }

  // Non-token enemies circle the player at a stand-off radius and spread out so
  // they don't stack on one pixel (simple separation/flocking).
  private circle(
    e: Fighter,
    player: Fighter,
    others: Fighter[],
    dt: number,
  ): void {
    const standoff = 150;
    const dx = player.x - e.x;
    const dist = Math.abs(dx);
    const speed = 70;

    if (dist > standoff + 20) {
      e.x += Math.sign(dx) * speed * dt; // approach to the ring
      e.state = 'walk';
    } else if (dist < standoff - 20) {
      e.x -= Math.sign(dx) * speed * dt; // back off to the ring
      e.state = 'walk';
    } else {
      e.state = 'idle';
    }

    // Depth drift toward an open lane near the player (looks like circling).
    const targetLane = Phaser.Math.Clamp(
      player.feetY + (e.x < player.x ? -LANE_TOLERANCE : LANE_TOLERANCE),
      FLOOR_TOP,
      FLOOR_BOTTOM,
    );
    e.feetY += Math.sign(targetLane - e.feetY) * 30 * dt;

    // Separation: push apart from any neighbor that's too close on x.
    for (const o of others) {
      if (o === e) continue;
      const sep = e.x - o.x;
      if (Math.abs(sep) < 36 && Math.abs(e.feetY - o.feetY) < 24) {
        e.x += Math.sign(sep || 1) * 40 * dt;
      }
    }
  }
}

// WeaponSystem: tracks whether the player is holding a bat (or similar melee
// pickup). Armed attacks get a flat damage boost and extended reach. The weapon
// breaks after DURABILITY_MAX hits — it doesn't reset between waves.
import type { Fighter } from '../entities/Fighter';

export const WEAPON_DAMAGE_BONUS = 14;
export const WEAPON_KNOCKBACK_BONUS = 12;
export const WEAPON_REACH_BONUS = 40; // extra px added to attack X span
const DURABILITY_MAX = 4;

export class WeaponSystem {
  equipped = false;
  durability = 0;

  pickup(): void {
    this.equipped = true;
    this.durability = DURABILITY_MAX;
  }

  // Call once per attack hit to drain the weapon. Returns true while still armed.
  use(): boolean {
    if (!this.equipped) return false;
    this.durability -= 1;
    if (this.durability <= 0) {
      this.equipped = false;
      this.durability = 0;
    }
    return true;
  }

  // Apply weapon modifiers to a resolve() opts object when armed.
  augmentOpts(opts: { damage: number; knockback: number; meterGain: number }): { damage: number; knockback: number; meterGain: number } {
    if (!this.equipped) return opts;
    return {
      damage: opts.damage + WEAPON_DAMAGE_BONUS,
      knockback: opts.knockback + WEAPON_KNOCKBACK_BONUS,
      meterGain: opts.meterGain,
    };
  }

  // Check whether the player walks over a weapon-drop pickup rectangle.
  checkPickup(p: Fighter, drops: WeaponDrop[]): void {
    for (const d of drops) {
      if (!d.active) continue;
      if (Math.abs(p.x - d.x) < 24 && Math.abs(p.feetY - d.feetY) < 20) {
        d.active = false;
        d.gfx.destroy();
        this.pickup();
      }
    }
  }
}

export type WeaponDrop = { x: number; feetY: number; active: boolean; gfx: Phaser.GameObjects.GameObject };

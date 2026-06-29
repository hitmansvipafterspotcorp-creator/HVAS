// PropDestructionSystem: manages breakable foreground props (trashcans, chairs,
// cones). A single attack hit from any fighter destroys a prop and spawns a
// drop. Real prop PNGs are probed silently; graybox rects appear if missing.
import Phaser from 'phaser';
import { ASSET_BASE, LANE_TOLERANCE, FLOOR_BOTTOM } from '../config';
import type { Fighter } from '../entities/Fighter';
import type { PropDef, PropDropType } from '../data/stageTypes';
import type { WeaponDrop } from './WeaponSystem';

// Drop pickup radius (pixels).
const PICKUP_R = 22;

// Visual sizes per prop type (w × h at brawler scale).
const PROP_SIZES: Record<string, [number, number]> = {
  trashcan: [28, 52],
  folding_chair: [38, 44],
  round_cafe_table: [52, 36],
  safety_cone: [24, 42],
};
const DEFAULT_SIZE: [number, number] = [32, 48];

// Fallback tint colours per type.
const PROP_COLORS: Record<string, number> = {
  trashcan: 0x556677,
  folding_chair: 0x8b6040,
  round_cafe_table: 0x5a3820,
  safety_cone: 0xff6600,
};
const DEFAULT_COLOR = 0x886644;

// Drop colours.
const DROP_COLORS: Record<PropDropType, number> = {
  health: 0x22dd44,
  meter: 0x4477ff,
  weapon: 0xffd700,
  none: 0x000000,
};

type Drop = {
  x: number;
  feetY: number;
  kind: 'health' | 'meter';
  gfx: Phaser.GameObjects.Arc;
  active: boolean;
};

type Prop = {
  x: number;
  feetY: number;
  w: number;
  alive: boolean;
  drop: PropDropType;
  body: Phaser.GameObjects.GameObject; // rect or sprite
};

export class PropDestructionSystem {
  private scene: Phaser.Scene;
  private props: Prop[] = [];
  private drops: Drop[] = [];
  weaponDrops: WeaponDrop[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // Spawn all props defined in the stage JSON.
  init(defs: PropDef[], stageId: string): void {
    for (const def of defs) {
      const [w, h] = PROP_SIZES[def.type] ?? DEFAULT_SIZE;
      const feetY = def.feetY ?? FLOOR_BOTTOM - 20;
      const depth = feetY + 1;

      // Try to load real art; fall back to a colored rect.
      const key = `prop_${stageId}_${def.type}`;
      const body = this.buildPropBody(def, stageId, key, w, h, feetY, depth);

      this.props.push({
        x: def.x,
        feetY,
        w,
        alive: true,
        drop: def.drop ?? 'none',
        body,
      });
    }
  }

  private buildPropBody(
    def: PropDef,
    stageId: string,
    key: string,
    w: number,
    h: number,
    feetY: number,
    depth: number,
  ): Phaser.GameObjects.GameObject {
    const color = PROP_COLORS[def.type] ?? DEFAULT_COLOR;

    // Immediate graybox; replaced by real PNG if probe succeeds.
    const rect = this.scene.add
      .rectangle(def.x, feetY - h / 2, w, h, color)
      .setDepth(depth);

    if (!this.scene.textures.exists(key)) {
      const folder = stageId.replace(/_exterior$|_interior$/, '');
      const side = stageId.endsWith('_interior') ? 'inside' : 'outside';
      const prefix = `${folder}_${side}_`;
      const url = `${ASSET_BASE}venues/props/${folder}/${side}/${prefix}${def.type}.png`;

      const probe = new Image();
      probe.onload = () => {
        if (!this.scene.scene.isActive()) return;
        if (!this.scene.textures.exists(key)) this.scene.textures.addImage(key, probe);
        // Swap graybox for real sprite.
        const sprite = this.scene.add
          .image(def.x, feetY, key)
          .setOrigin(0.5, 1)
          .setDepth(depth)
          .setDisplaySize(w, h);
        rect.destroy();
        // Update body reference for future destroy calls.
        const p = this.props.find((pp) => pp.x === def.x && pp.feetY === feetY);
        if (p) p.body = sprite;
      };
      probe.onerror = () => {};
      probe.src = url;
    }

    return rect;
  }

  // Call every frame when an attack is active.
  checkHits(attacker: Fighter): void {
    if (!attacker.attackActive) return;
    const reach = attacker.attackReach();
    for (const prop of this.props) {
      if (!prop.alive) continue;
      if (Math.abs(attacker.feetY - prop.feetY) > LANE_TOLERANCE) continue;
      const half = prop.w / 2;
      if (reach.x2 < prop.x - half || reach.x1 > prop.x + half) continue;
      this.break(prop);
    }
  }

  private break(prop: Prop): void {
    prop.alive = false;

    // Flash white then fade out.
    const body = prop.body as Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
    this.scene.tweens.add({
      targets: body,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 0.3,
      duration: 240,
      ease: 'Cubic.out',
      onComplete: () => body.destroy(),
    });

    // Spawn drop.
    if (prop.drop === 'none') return;
    if (prop.drop === 'weapon') {
      this.spawnWeaponDrop(prop.x, prop.feetY);
    } else {
      this.spawnStatDrop(prop.x, prop.feetY, prop.drop);
    }
  }

  private spawnStatDrop(x: number, feetY: number, kind: 'health' | 'meter'): void {
    const gfx = this.scene.add
      .circle(x, feetY - 10, 10, DROP_COLORS[kind], 0.9)
      .setDepth(feetY + 2);
    this.scene.tweens.add({
      targets: gfx,
      y: feetY - 16,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.drops.push({ x, feetY, kind, gfx, active: true });
  }

  private spawnWeaponDrop(x: number, feetY: number): void {
    const gfx = this.scene.add
      .circle(x, feetY - 10, 12, DROP_COLORS.weapon, 1)
      .setDepth(feetY + 2);
    this.scene.add
      .text(x, feetY - 10, '🏏', { fontSize: '14px' })
      .setOrigin(0.5)
      .setDepth(feetY + 3);
    this.scene.tweens.add({
      targets: gfx,
      y: feetY - 18,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.weaponDrops.push({ x, feetY, active: true, gfx });
  }

  // Check if the player walks over a stat drop (health or meter restore).
  checkPickup(p: Fighter, onPickup: (kind: Exclude<PropDropType, 'none' | 'weapon'>) => void): void {
    for (const d of this.drops) {
      if (!d.active) continue;
      if (Math.abs(p.x - d.x) < PICKUP_R && Math.abs(p.feetY - d.feetY) < PICKUP_R) {
        d.active = false;
        d.gfx.destroy();
        onPickup(d.kind);
      }
    }
  }
}

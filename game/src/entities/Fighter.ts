import Phaser from 'phaser';
import { COLORS, FLOOR_TOP, FLOOR_BOTTOM } from '../config';

export type FighterState =
  | 'idle'
  | 'walk'
  | 'attack'
  | 'hit'
  | 'knockdown'
  | 'ko';

export type FighterKind = 'player' | 'enemy' | 'boss';

// A Fighter is a graybox body for now: a tall rounded rect + a flat floor
// shadow that marks its true feet position. The shadow's center y IS the
// fighter's depth lane — the depth gate reads `feetY` from here, never the
// sprite's visual top. This separation is what makes the 2.5D math correct
// once real sprites replace the rectangle.
export class Fighter {
  scene: Phaser.Scene;
  kind: FighterKind;
  body: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Ellipse;

  x: number;
  feetY: number; // depth lane (FLOOR_TOP..FLOOR_BOTTOM)
  facing: 1 | -1 = 1;

  hp: number;
  maxHp: number;
  meter = 0;
  combo = 0;

  state: FighterState = 'idle';
  stateTimer = 0; // ms remaining in a locked state (attack/hit/etc.)
  attackActive = false; // true during the active frames of an attack
  invuln = 0; // ms of invulnerability remaining

  private readonly w: number;
  private readonly h: number;

  constructor(
    scene: Phaser.Scene,
    kind: FighterKind,
    x: number,
    feetY: number,
    maxHp: number,
  ) {
    this.scene = scene;
    this.kind = kind;
    this.x = x;
    this.feetY = Phaser.Math.Clamp(feetY, FLOOR_TOP, FLOOR_BOTTOM);
    this.maxHp = maxHp;
    this.hp = maxHp;

    const color =
      kind === 'player'
        ? COLORS.player
        : kind === 'boss'
          ? COLORS.boss
          : COLORS.enemy;
    this.w = kind === 'boss' ? 64 : 40;
    this.h = kind === 'boss' ? 150 : 110;

    this.shadow = scene.add
      .ellipse(x, this.feetY, this.w * 1.1, 16, 0x000000, 0.35)
      .setDepth(this.feetY - 1000);
    this.body = scene.add
      .rectangle(x, this.feetY - this.h / 2, this.w, this.h, color)
      .setStrokeStyle(2, 0xffffff, 0.25)
      .setDepth(this.feetY);
  }

  get alive(): boolean {
    return this.state !== 'ko';
  }

  // Sync visuals to logical position. Depth = feetY so nearer fighters draw on
  // top — the painter's-algorithm half of the 2.5D illusion.
  syncView(): void {
    this.body.x = this.x;
    this.body.y = this.feetY - this.h / 2;
    this.body.setDepth(this.feetY);
    this.shadow.x = this.x;
    this.shadow.y = this.feetY;
    this.shadow.setDepth(this.feetY - 1000);

    // Flash white briefly when in hit state; tint by state otherwise.
    if (this.state === 'hit') this.body.setFillStyle(0xffffff);
    else if (this.state === 'ko') this.body.setFillStyle(COLORS.enemyDark);
    else {
      const base =
        this.kind === 'player'
          ? COLORS.player
          : this.kind === 'boss'
            ? COLORS.boss
            : COLORS.enemy;
      this.body.setFillStyle(this.attackActive ? COLORS.hitspark : base);
    }
  }

  // The reach box of an attack, projected to the floor lane. x extends in the
  // facing direction; y is the feet lane. Returned as {x1,x2,laneY}.
  attackReach(): { x1: number; x2: number; laneY: number } {
    const reach = 56;
    const x1 = this.facing === 1 ? this.x : this.x - reach;
    const x2 = this.facing === 1 ? this.x + reach : this.x;
    return { x1, x2, laneY: this.feetY };
  }

  // Hurt footprint on the floor (x span at the feet lane).
  hurtSpan(): { x1: number; x2: number; laneY: number } {
    return { x1: this.x - this.w / 2, x2: this.x + this.w / 2, laneY: this.feetY };
  }

  destroy(): void {
    this.body.destroy();
    this.shadow.destroy();
  }
}

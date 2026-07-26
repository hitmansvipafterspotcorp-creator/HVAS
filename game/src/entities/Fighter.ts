import Phaser from 'phaser';
import { COLORS, FLOOR_TOP, FLOOR_BOTTOM } from '../config';
import { AnimationSystem } from '../systems/AnimationSystem';

export type FighterState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'block'
  | 'dodge'
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
  charId: number;
  body: Phaser.GameObjects.Rectangle; // graybox fallback
  sprite?: Phaser.GameObjects.Sprite; // real art (when anims are built)
  shadow: Phaser.GameObjects.Ellipse;
  attackIndex = 0; // cycles combo1->2->3
  private lastAnim = '';

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
    charId = 0,
  ) {
    this.scene = scene;
    this.kind = kind;
    this.charId = charId;
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

    // If real animations exist for this character, use a sprite and hide the
    // graybox. The sprite's origin is at the feet so feetY drives both position
    // and draw depth — same contract the depth gate relies on.
    if (charId && AnimationSystem.ready(scene, charId)) {
      const displayH = kind === 'boss' ? 210 : 168;
      this.sprite = scene.add
        .sprite(x, this.feetY, '__DEFAULT')
        .setOrigin(0.5, 1)
        .setDepth(this.feetY);
      this.sprite.setScale(displayH / 181); // frames are 181px tall
      this.body.setVisible(false);
      this.playAnim('idle');
    }
  }

  // Pick the anim for the current state and play it (no restart if unchanged).
  private playAnim(name: string): void {
    if (!this.sprite) return;
    const key = AnimationSystem.animKey(this.charId, name);
    if (!this.scene.anims.exists(key)) return;
    if (this.lastAnim === key) return;
    this.lastAnim = key;
    this.sprite.play(key, true);
  }

  // Map logical state -> animation name.
  private stateAnim(): string {
    switch (this.state) {
      case 'walk':  return 'walk';
      case 'run':   return 'run';
      case 'block': return 'block';
      case 'dodge': return 'dodge';
      case 'attack':
        return ['combo1', 'combo2', 'combo3', 'special'][this.attackIndex % 4];
      case 'hit':        return 'hurt';
      case 'knockdown':  return 'knockdown';
      case 'ko':         return 'defeated';
      default:           return 'idle';
    }
  }

  get alive(): boolean {
    return this.state !== 'ko';
  }

  // Sync visuals to logical position. Depth = feetY so nearer fighters draw on
  // top — the painter's-algorithm half of the 2.5D illusion.
  syncView(): void {
    this.shadow.x = this.x;
    this.shadow.y = this.feetY;
    this.shadow.setDepth(this.feetY - 1000);

    if (this.sprite) {
      this.sprite.x = this.x;
      this.sprite.y = this.feetY;
      this.sprite.setDepth(this.feetY);
      this.sprite.setFlipX(this.facing === -1);
      this.playAnim(this.stateAnim());
      // White flash on hit (Phaser 4 tint-fill mode).
      if (this.state === 'hit') {
        this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      } else {
        this.sprite.clearTint();
      }
      return;
    }

    // Graybox fallback.
    this.body.x = this.x;
    this.body.y = this.feetY - this.h / 2;
    this.body.setDepth(this.feetY);
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

  // Play a one-off animation (used for supers); falls through to nothing in
  // graybox mode.
  playOneShot(name: string): void {
    if (!this.sprite) return;
    const key = AnimationSystem.animKey(this.charId, name);
    if (this.scene.anims.exists(key)) {
      this.lastAnim = key;
      this.sprite.play(key, true);
    }
  }

  // The reach box of an attack, projected to the floor lane. x extends in the
  // facing direction; y is the feet lane. Returned as {x1,x2,laneY}.
  attackReach(): { x1: number; x2: number; laneY: number } {
    const reach = [52, 68, 88, 112][this.attackIndex % 4];
    const x1 = this.facing === 1 ? this.x : this.x - reach;
    const x2 = this.facing === 1 ? this.x + reach : this.x;
    return { x1, x2, laneY: this.feetY };
  }

  // Hurt footprint on the floor (x span at the feet lane).
  hurtSpan(): { x1: number; x2: number; laneY: number } {
    return { x1: this.x - this.w / 2, x2: this.x + this.w / 2, laneY: this.feetY };
  }

  destroy(): void {
    this.sprite?.destroy();
    this.body.destroy();
    this.shadow.destroy();
  }
}

import Phaser from 'phaser';
import { AnimationSystem } from './AnimationSystem';

// VFXSystem: reusable visual effects for any combat scene.
// Sparks, dodge trails, parry flashes, screen shake, KO burst.
// charVfx() plays the character's own VFX sprite sheet at a world position.
export class VFXSystem {
  private scene: Phaser.Scene;
  private dodgeTrailTimer = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // Play a per-character VFX animation (from vfx/ sheet) at a world position.
  // Spawns a temporary sprite that auto-destroys when the animation ends.
  charVfx(
    charId: number,
    animName: string, // one of: vfx_hit, vfx_block, vfx_dodge, vfx_super, vfx_ko, vfx_special, vfx_grab, vfx_finisher
    wx: number,
    wy: number,
    scale = 1.4,
    depth = 91500,
    flipX = false,
  ): boolean {
    const key = AnimationSystem.animKey(charId, animName);
    const anims = this.scene.anims;
    if (!anims.exists(key)) return false; // frames not loaded for this char/anim

    const spr = this.scene.add
      .sprite(wx, wy, key)
      .setOrigin(0.5, 0.5)
      .setScale(scale)
      .setFlipX(flipX)
      .setDepth(depth);

    spr.play(key);
    spr.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      spr.destroy();
    });
    return true;
  }

  // Small starburst on hit contact point.
  hitSpark(wx: number, wy: number, dir: 1 | -1 = 1): void {
    const PALETTE = [0xffffff, 0xfff2a0, 0xff8833, 0xff3322];
    for (let i = 0; i < 9; i++) {
      const angle = (Math.random() * Math.PI) - Math.PI / 2 + (dir > 0 ? 0 : Math.PI);
      const spread = Math.random() * Math.PI * 0.7;
      const finalAngle = angle + spread - spread / 2;
      const speed = 70 + Math.random() * 140;
      const size = 2 + Math.random() * 4;
      const s = this.scene.add
        .rectangle(wx, wy, size, size, PALETTE[Math.floor(Math.random() * PALETTE.length)])
        .setDepth(91000);
      this.scene.tweens.add({
        targets: s,
        x: wx + Math.cos(finalAngle) * speed * 0.5,
        y: wy + Math.sin(finalAngle) * speed * 0.5 - 10,
        alpha: 0,
        scaleX: 0.1,
        scaleY: 0.1,
        duration: 200 + Math.random() * 180,
        ease: 'Cubic.out',
        onComplete: () => s.destroy(),
      });
    }
    // Central flash ring
    const ring = this.scene.add.circle(wx, wy, 10, 0xffffff, 0.8).setDepth(91001);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 2.5, scaleY: 2.5,
      alpha: 0,
      duration: 180,
      ease: 'Quad.out',
      onComplete: () => ring.destroy(),
    });
  }

  // Gold flash ring when a block absorbs a hit.
  parryFlash(wx: number, wy: number): void {
    for (let r = 0; r < 2; r++) {
      const ring = this.scene.add.circle(wx, wy - 20, 6 + r * 4, 0xffd700, 0.9).setDepth(91002);
      this.scene.tweens.add({
        targets: ring,
        scaleX: 3.5 - r * 0.5, scaleY: 3.5 - r * 0.5,
        alpha: 0,
        duration: 300 + r * 80,
        ease: 'Quad.out',
        delay: r * 40,
        onComplete: () => ring.destroy(),
      });
    }
    // "BLOCKED!" label
    const lbl = this.scene.add.text(wx, wy - 50, 'BLOCKED!', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '13px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(91003);
    this.scene.tweens.add({
      targets: lbl,
      y: wy - 85,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.out',
      onComplete: () => lbl.destroy(),
    });
  }

  // Blue ghost behind player during dodge i-frames.
  dodgeGhost(sprite: Phaser.GameObjects.Sprite, dt: number): void {
    this.dodgeTrailTimer -= dt;
    if (this.dodgeTrailTimer > 0) return;
    this.dodgeTrailTimer = 60; // every 60ms

    if (!sprite.texture || sprite.texture.key === '__DEFAULT') return;
    // Clone the current sprite as a ghost
    const ghost = this.scene.add
      .sprite(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setOrigin(sprite.originX, sprite.originY)
      .setScale(sprite.scaleX, sprite.scaleY)
      .setFlipX(sprite.flipX)
      .setTint(0x44aaff)
      .setAlpha(0.55)
      .setDepth(sprite.depth - 1);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 180,
      onComplete: () => ghost.destroy(),
    });
  }

  // Big multi-ring burst when a fighter is KO'd.
  koExplosion(wx: number, wy: number): void {
    this.scene.cameras.main.shake(400, 0.018);
    // Rings
    for (let i = 0; i < 3; i++) {
      const ring = this.scene.add.circle(wx, wy, 12 + i * 6, 0xffd700, 0.85).setDepth(92000);
      this.scene.tweens.add({
        targets: ring,
        scaleX: 5 + i * 1.5, scaleY: 5 + i * 1.5,
        alpha: 0,
        duration: 500 + i * 100,
        delay: i * 60,
        ease: 'Quad.out',
        onComplete: () => ring.destroy(),
      });
    }
    // Debris
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const speed = 80 + Math.random() * 180;
      const size = 4 + Math.random() * 8;
      const col = i % 3 === 0 ? 0xffd700 : i % 3 === 1 ? 0xff3344 : 0xffffff;
      const s = this.scene.add.rectangle(wx, wy, size, size, col).setDepth(92001);
      this.scene.tweens.add({
        targets: s,
        x: wx + Math.cos(angle) * speed,
        y: wy + Math.sin(angle) * speed - 30,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        duration: 600 + Math.random() * 400,
        ease: 'Cubic.out',
        onComplete: () => s.destroy(),
      });
    }
  }

  // White screen flash on super/KO entry.
  screenFlash(color = 0xffffff, alpha = 0.75, duration = 300): void {
    const { width, height } = this.scene.scale;
    const f = this.scene.add
      .rectangle(this.scene.cameras.main.centerX, this.scene.cameras.main.centerY, width, height, color, alpha)
      .setScrollFactor(0)
      .setDepth(99990);
    this.scene.tweens.add({
      targets: f,
      alpha: 0,
      duration,
      onComplete: () => f.destroy(),
    });
  }

  // Quick camera pop (used on super/round start).
  screenShake(duration = 120, intensity = 0.006): void {
    this.scene.cameras.main.shake(duration, intensity);
  }
}

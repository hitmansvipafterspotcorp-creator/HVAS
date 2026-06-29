import Phaser from 'phaser';

// Spawns damage/pickup numbers that float up and fade out.
export class FloatingTextSystem {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  damage(x: number, y: number, amount: number, isCrit = false): void {
    const color = isCrit ? '#ff3344' : '#ffffff';
    const size  = isCrit ? '22px' : '16px';
    const txt = this.scene.add.text(x, y - 40, `-${amount}`, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: size,
      color,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(95000).setScrollFactor(0);

    this.scene.tweens.add({
      targets: txt,
      y: y - 90,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.out',
      onComplete: () => txt.destroy(),
    });
  }

  pickup(x: number, y: number, kind: 'health' | 'meter' | 'weapon'): void {
    const labels = { health: '+HP', meter: '+METER', weapon: 'BAT!' };
    const colors = { health: '#22dd44', meter: '#4477ff', weapon: '#ffd700' };
    const txt = this.scene.add.text(x, y - 50, labels[kind], {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '15px',
      color: colors[kind],
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(95000).setScrollFactor(0);

    this.scene.tweens.add({
      targets: txt,
      y: y - 100,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.out',
      onComplete: () => txt.destroy(),
    });
  }

  comboFlash(x: number, y: number, combo: number): void {
    if (combo < 2) return;
    const txt = this.scene.add.text(x, y - 30, `${combo}x COMBO`, {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '13px',
      color: '#ffd700',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(95000).setScrollFactor(0);

    this.scene.tweens.add({
      targets: txt,
      scaleX: 1.3, scaleY: 1.3,
      alpha: 0,
      duration: 600,
      ease: 'Cubic.out',
      onComplete: () => txt.destroy(),
    });
  }
}

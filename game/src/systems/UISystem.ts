import Phaser from 'phaser';
import { ASSET_BASE } from '../config';

// ── UISystem ────────────────────────────────────────────────────────────────
// Wires the real HITGEAR UI art kit (assets/ui/) into the engine. Only the
// cleanly-named pieces are used — logo, HUD health-bar frame, the gold digit
// font, combo label, and meter pip. The unlabeled auto-sliced *_NNN blobs are
// intentionally left out: their placement isn't documented and guessing would
// put the wrong art in the wrong slot.

export const UI = {
  logo: 'ui_logo',
  healthBar: 'ui_health_bar',
  comboLabel: 'ui_combo_label',
  pipStar: 'ui_pip_star',
  digit: (d: number | string) => `ui_digit_${d}`,
} as const;

const FILES: Array<[string, string]> = [
  [UI.logo, 'ui/hvas_logo.png'],
  [UI.healthBar, 'ui/elements/hud/hud_health_bar.png'],
  [UI.comboLabel, 'ui/elements/hud/hud_combo_label.png'],
  [UI.pipStar, 'ui/elements/hud/hud_pip_star.png'],
];

export const UISystem = {
  // Queue all UI textures into a scene loader (call in preload()).
  queue(scene: Phaser.Scene): void {
    for (const [key, path] of FILES) {
      if (!scene.textures.exists(key)) scene.load.image(key, `${ASSET_BASE}${path}`);
    }
    for (let d = 0; d <= 9; d++) {
      const key = UI.digit(d);
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `${ASSET_BASE}ui/elements/hud/digit_${d}.png`);
      }
    }
  },

  ready(scene: Phaser.Scene): boolean {
    return scene.textures.exists(UI.logo);
  },
};

// A reusable gold-digit number readout. Caches one sprite per digit slot and
// swaps textures on update — no per-frame allocations.
export class NumberDisplay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private digits: Phaser.GameObjects.Image[] = [];
  private height: number;
  private align: 'left' | 'right';
  private baseX: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    height = 22,
    align: 'left' | 'right' = 'left',
  ) {
    this.scene = scene;
    this.height = height;
    this.align = align;
    this.baseX = x;
    this.container = scene.add
      .container(x, y)
      .setScrollFactor(0)
      .setDepth(60000);
  }

  setValue(value: number): void {
    const str = String(Math.max(0, Math.round(value)));
    // Grow the sprite pool to fit.
    while (this.digits.length < str.length) {
      const img = this.scene.add.image(0, 0, UI.digit(0)).setOrigin(0, 0.5);
      this.container.add(img);
      this.digits.push(img);
    }
    let cursor = 0;
    const gap = this.height * 0.06;
    for (let i = 0; i < str.length; i++) {
      const img = this.digits[i];
      img.setTexture(UI.digit(str[i])).setVisible(true);
      const tex = this.scene.textures.get(UI.digit(str[i])).getSourceImage();
      const w = (tex.width / tex.height) * this.height;
      img.setDisplaySize(w, this.height).setPosition(cursor, 0);
      cursor += w + gap;
    }
    for (let i = str.length; i < this.digits.length; i++) {
      this.digits[i].setVisible(false);
    }
    // Right-align by shifting the container.
    this.container.x =
      this.align === 'right' ? this.baseX - cursor : this.baseX;
  }

  setDepth(d: number): this {
    this.container.setDepth(d);
    return this;
  }

  setVisible(v: boolean): this {
    this.container.setVisible(v);
    return this;
  }
}

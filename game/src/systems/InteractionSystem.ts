import Phaser from 'phaser';

export type Interactable = {
  x: number;
  y: number;
  radius: number;
  label: string;
  activate: () => void;
};

// InteractionSystem: shows a floating "Press E — <label>" prompt over the
// nearest in-range interactable and fires it when the interact button is hit.
// Data-driven: the scene registers interactables built from venue JSON.
export class InteractionSystem {
  private items: Interactable[] = [];
  private prompt: Phaser.GameObjects.Text;
  private nearest: Interactable | null = null;

  constructor(scene: Phaser.Scene) {
    this.prompt = scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(90000)
      .setVisible(false);
  }

  register(item: Interactable): void {
    this.items.push(item);
  }

  // Call each frame with the player position. Highlights the nearest in-range
  // interactable.
  update(px: number, py: number): void {
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.items) {
      const d = Phaser.Math.Distance.Between(px, py, it.x, it.y);
      if (d <= it.radius && d < bestD) {
        bestD = d;
        best = it;
      }
    }
    this.nearest = best;
    if (best) {
      this.prompt
        .setText(`E — ${best.label}`)
        .setPosition(best.x, best.y - 70)
        .setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }

  // Fire the highlighted interactable, if any.
  tryActivate(): boolean {
    if (!this.nearest) return false;
    this.nearest.activate();
    return true;
  }
}

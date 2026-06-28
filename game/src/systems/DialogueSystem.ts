import Phaser from 'phaser';

// DialogueSystem: a bottom dialogue box that steps through an array of lines.
// While open it reports `active`, so the scene freezes player movement. Advance
// with the same interact key. Pure presentation — content comes from JSON.
export class DialogueSystem {
  private box: Phaser.GameObjects.Container;
  private nameText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private idx = 0;
  active = false;

  constructor(scene: Phaser.Scene) {
    const w = scene.scale.width;
    const h = scene.scale.height;

    const bg = scene.add
      .rectangle(0, 0, w - 40, 110, 0x0a0712, 0.92)
      .setStrokeStyle(2, 0xffd700, 0.8)
      .setOrigin(0.5);
    this.nameText = scene.add
      .text(-(w - 40) / 2 + 18, -38, '', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '18px',
        color: '#ffd700',
      })
      .setOrigin(0, 0.5);
    this.bodyText = scene.add
      .text(-(w - 40) / 2 + 18, 4, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#ffffff',
        wordWrap: { width: w - 90 },
      })
      .setOrigin(0, 0.5);
    const hint = scene.add
      .text((w - 40) / 2 - 18, 38, '▶ next', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8877aa',
      })
      .setOrigin(1, 0.5);

    this.box = scene.add
      .container(w / 2, h - 70, [bg, this.nameText, this.bodyText, hint])
      .setScrollFactor(0)
      .setDepth(100000)
      .setVisible(false);
  }

  open(name: string, lines: string[]): void {
    this.lines = lines.length ? lines : ['...'];
    this.idx = 0;
    this.active = true;
    this.nameText.setText(name);
    this.bodyText.setText(this.lines[0]);
    this.box.setVisible(true);
  }

  // Advance to the next line; closes after the last. Returns true if still open.
  advance(): boolean {
    if (!this.active) return false;
    this.idx += 1;
    if (this.idx >= this.lines.length) {
      this.close();
      return false;
    }
    this.bodyText.setText(this.lines[this.idx]);
    return true;
  }

  close(): void {
    this.active = false;
    this.box.setVisible(false);
  }
}

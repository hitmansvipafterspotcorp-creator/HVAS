import Phaser from 'phaser';
import { UI } from './UISystem';

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
    const boxW = w - 40;
    const boxH = 130;

    let bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (scene.textures.exists(UI.dialoguePanel)) {
      bg = scene.add.image(0, 0, UI.dialoguePanel).setOrigin(0.5).setDisplaySize(boxW, boxH);
    } else {
      bg = scene.add
        .rectangle(0, 0, boxW, boxH, 0x0a0712, 0.92)
        .setStrokeStyle(2, 0xffd700, 0.8)
        .setOrigin(0.5);
    }
    this.nameText = scene.add
      .text(-(boxW) / 2 + 38, -42, '', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '18px',
        color: '#ffd700',
      })
      .setOrigin(0, 0.5);
    this.bodyText = scene.add
      .text(-(boxW) / 2 + 38, 6, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        wordWrap: { width: boxW - 100 },
      })
      .setOrigin(0, 0.5);
    const hint = scene.add
      .text((boxW) / 2 - 38, 46, '▶ next', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8877aa',
      })
      .setOrigin(1, 0.5);

    this.box = scene.add
      .container(w / 2, h - 80, [bg, this.nameText, this.bodyText, hint])
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

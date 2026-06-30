import Phaser from 'phaser';
import { UI } from './UISystem';

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
    const boxH = 138;

    // Real dialogue frame art, or fallback dark rectangle
    let bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (scene.textures.exists(UI.dlgFrameLarge)) {
      bg = scene.add.image(0, 0, UI.dlgFrameLarge)
        .setOrigin(0.5).setDisplaySize(boxW, boxH);
    } else {
      bg = scene.add
        .rectangle(0, 0, boxW, boxH, 0x0a0712, 0.92)
        .setStrokeStyle(2, 0xffd700, 0.8)
        .setOrigin(0.5);
    }

    // Speaker nameplate — use art if available
    let namePlate: Phaser.GameObjects.Image | null = null;
    if (scene.textures.exists(UI.dlgSpeakerPlate)) {
      namePlate = scene.add.image(-(boxW / 2) + 120, -54, UI.dlgSpeakerPlate)
        .setOrigin(0.5).setDisplaySize(180, 36);
    }

    this.nameText = scene.add
      .text(-(boxW / 2) + 40, -46, '', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '16px',
        color: '#ffd700',
      })
      .setOrigin(0, 0.5);

    this.bodyText = scene.add
      .text(-(boxW / 2) + 40, 10, '', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
        wordWrap: { width: boxW - 90 },
      })
      .setOrigin(0, 0.5);

    const hint = scene.add
      .text((boxW / 2) - 30, 50, '▶ E / click', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8877aa',
      })
      .setOrigin(1, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [bg, this.nameText, this.bodyText, hint];
    if (namePlate) children.push(namePlate);

    this.box = scene.add
      .container(w / 2, h - 80, children)
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

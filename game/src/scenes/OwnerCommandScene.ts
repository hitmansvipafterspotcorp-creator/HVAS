import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AudioSystem } from '../systems/AudioSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';

// ── OwnerCommandScene ─────────────────────────────────────────────────────
// Admin panel: quest progression reset/unlock, quick links to every other
// app surface. Clean button grid, no raw asset sheets.

type AdminAction = { label: string; sub: string; run: () => void; color: number };

export class OwnerCommandScene extends Phaser.Scene {
  private msgText!: Phaser.GameObjects.Text;

  constructor() { super(SCENE.OwnerCommand); }

  create(): void {
    AudioSystem.playForScene(this, 'MainMenu');
    this.cameras.main.setBackgroundColor(0x0a0602);

    this.add.rectangle(GAME_WIDTH / 2, 32, GAME_WIDTH, 64, 0x1a1204, 0.96).setDepth(100);
    this.add.text(GAME_WIDTH / 2, 32, '👑 OWNER COMMAND', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ff9900',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(101);

    const actions: AdminAction[] = [
      {
        label: 'UNLOCK ALL QUESTS', sub: 'Clear boss/venue gates',
        color: 0x44cc44,
        run: () => { ProgressionSystem.unlockAll(); this.flash('✔ ALL QUESTS UNLOCKED'); },
      },
      {
        label: 'RESET PROGRESS', sub: 'Wipe quest save data',
        color: 0xff4444,
        run: () => { ProgressionSystem.reset(); this.flash('✔ PROGRESS RESET'); },
      },
      {
        label: 'GO TO MAIN MENU', sub: 'Return to game',
        color: 0xc100ff,
        run: () => this.scene.start(SCENE.MainMenu),
      },
      {
        label: 'GO TO APP HUB', sub: 'Member app home',
        color: 0x00aaff,
        run: () => this.scene.start(SCENE.AppHub),
      },
    ];

    const cardW = 260, cardH = 110, gap = 16;
    const cols = 2;
    const rows = Math.ceil(actions.length / cols);
    const gridW = cols * cardW + (cols - 1) * gap;
    const gridH = rows * cardH + (rows - 1) * gap;
    const startX = (GAME_WIDTH - gridW) / 2 + cardW / 2;
    const startY = (GAME_HEIGHT - gridH) / 2 + cardH / 2;

    actions.forEach((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gap);
      const cy = startY + row * (cardH + gap);
      const rect = this.add.rectangle(cx, cy, cardW, cardH, 0x100c04, 0.95)
        .setStrokeStyle(2, a.color, 0.85).setDepth(50).setInteractive({ useHandCursor: true });
      this.add.text(cx, cy - 16, a.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '14px',
        color: `#${a.color.toString(16).padStart(6, '0')}`,
        align: 'center', wordWrap: { width: cardW - 24 },
      }).setOrigin(0.5).setDepth(51);
      this.add.text(cx, cy + 18, a.sub, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#998866',
      }).setOrigin(0.5).setDepth(51);
      rect.on('pointerdown', () => a.run());
      rect.on('pointerover', () => rect.setStrokeStyle(3, a.color, 1));
      rect.on('pointerout',  () => rect.setStrokeStyle(2, a.color, 0.85));
    });

    this.msgText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 40, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(60);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, '[ESC] BACK TO HUB', {
      fontFamily: 'monospace', fontSize: '10px', color: '#665533',
    }).setOrigin(0.5, 1).setDepth(100);

    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENE.AppHub));
  }

  private flash(msg: string): void {
    this.msgText.setText(msg).setAlpha(1);
    this.tweens.add({ targets: this.msgText, alpha: 0, delay: 1500, duration: 500 });
  }
}

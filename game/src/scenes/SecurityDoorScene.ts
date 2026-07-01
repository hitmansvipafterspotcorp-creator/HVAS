import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AudioSystem } from '../systems/AudioSystem';

// ── SecurityDoorScene ─────────────────────────────────────────────────────
// Guard console: PASS / FLAG a member card number at the door. Standalone
// tool from Staff Door Scan (which does registration + payment); this is
// a fast approve/deny console for security staff.

type LogEntry = { card: string; result: 'PASS' | 'FLAG'; time: string };

export class SecurityDoorScene extends Phaser.Scene {
  private input_field = '';
  private fieldText!: Phaser.GameObjects.Text;
  private log: LogEntry[] = [];
  private logTexts: Phaser.GameObjects.Text[] = [];

  constructor() { super(SCENE.SecurityDoor); }

  create(): void {
    AudioSystem.playForScene(this, 'Venue');
    this.input_field = '';
    this.log = [];

    this.cameras.main.setBackgroundColor(0x0a0505);

    // Header
    this.add.rectangle(GAME_WIDTH / 2, 32, GAME_WIDTH, 64, 0x140505, 0.96).setDepth(100);
    this.add.text(GAME_WIDTH / 2, 32, '🛡 SECURITY DOOR MODE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ff4444',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(101);

    // Card number entry field
    this.add.rectangle(GAME_WIDTH / 2, 130, 400, 60, 0x140a0a, 0.9)
      .setStrokeStyle(2, 0xff4444).setDepth(50);
    this.fieldText = this.add.text(GAME_WIDTH / 2, 130, 'TYPE CARD NUMBER…', {
      fontFamily: 'monospace', fontSize: '18px', color: '#ff8888',
    }).setOrigin(0.5).setDepth(51);

    // PASS / FLAG buttons
    const passBtn = this.add.rectangle(GAME_WIDTH / 2 - 110, 210, 180, 50, 0x0a1a00, 0.9)
      .setStrokeStyle(2, 0x44cc44).setDepth(50).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2 - 110, 210, '✔ PASS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#44cc44',
    }).setOrigin(0.5).setDepth(51);
    passBtn.on('pointerdown', () => this.record('PASS'));

    const flagBtn = this.add.rectangle(GAME_WIDTH / 2 + 110, 210, 180, 50, 0x1a0000, 0.9)
      .setStrokeStyle(2, 0xff4444).setDepth(50).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2 + 110, 210, '✕ FLAG', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#ff4444',
    }).setOrigin(0.5).setDepth(51);
    flagBtn.on('pointerdown', () => this.record('FLAG'));

    // Log header
    this.add.text(GAME_WIDTH / 2, 270, 'RECENT SCANS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '12px', color: '#aa6666',
    }).setOrigin(0.5).setDepth(50);
    this.add.rectangle(GAME_WIDTH / 2, 285, GAME_WIDTH - 80, 1, 0x662222).setDepth(50);

    // Footer
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, '[ESC] BACK TO HUB — Type digits, click PASS or FLAG', {
      fontFamily: 'monospace', fontSize: '10px', color: '#665555',
    }).setOrigin(0.5, 1).setDepth(100);

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key) && this.input_field.length < 16) {
        this.input_field += e.key;
        this.updateField();
      } else if (e.key === 'Backspace') {
        this.input_field = this.input_field.slice(0, -1);
        this.updateField();
      }
    });
    kb.on('keydown-ESC', () => this.scene.start(SCENE.AppHub));
  }

  private updateField(): void {
    this.fieldText.setText(this.input_field || 'TYPE CARD NUMBER…');
    this.fieldText.setColor(this.input_field ? '#ffffff' : '#ff8888');
  }

  private record(result: 'PASS' | 'FLAG'): void {
    if (!this.input_field) return;
    const time = new Date().toLocaleTimeString();
    this.log.unshift({ card: this.input_field, result, time });
    this.log = this.log.slice(0, 6);
    this.input_field = '';
    this.updateField();
    this.redrawLog();
  }

  private redrawLog(): void {
    this.logTexts.forEach(t => t.destroy());
    this.logTexts = [];
    this.log.forEach((entry, i) => {
      const y = 305 + i * 22;
      const color = entry.result === 'PASS' ? '#44cc44' : '#ff4444';
      const t = this.add.text(GAME_WIDTH / 2, y,
        `${entry.result === 'PASS' ? '✔' : '✕'}  ${entry.card}  —  ${entry.result}  (${entry.time})`, {
          fontFamily: 'monospace', fontSize: '11px', color,
        }).setOrigin(0.5).setDepth(50);
      this.logTexts.push(t);
    });
  }
}

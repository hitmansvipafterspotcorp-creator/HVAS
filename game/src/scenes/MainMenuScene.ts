import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';

// MainMenuScene: the HITGEAR hub entry. Lists the playable modes; QUEST routes
// into the brawler. Other modes are stubbed as "COMING SOON" so navigation is
// never broken / never blank.
type MenuItem = { label: string; scene?: string; soon?: boolean };

const ITEMS: MenuItem[] = [
  { label: 'QUEST (Brawler)', scene: SCENE.Brawler },
  { label: 'VENUE (Top-Down)', soon: true },
  { label: 'LIPSYNC BINGO', soon: true },
  { label: 'TV MODE', soon: true },
  { label: 'HOST / DJ', soon: true },
];

export class MainMenuScene extends Phaser.Scene {
  private index = 0;
  private rows: Phaser.GameObjects.Text[] = [];

  constructor() {
    super(SCENE.MainMenu);
  }

  create(): void {
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 70, 'HITMANS VIP AFTER SPOT', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '34px',
        color: '#ffd700',
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 108, 'MAIN MENU', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#c100ff',
      })
      .setOrigin(0.5);

    ITEMS.forEach((item, i) => {
      const y = 180 + i * 54;
      const txt = this.add
        .text(cx, y, item.label + (item.soon ? '  (COMING SOON)' : ''), {
          fontFamily: 'Arial, sans-serif',
          fontSize: '24px',
          color: item.soon ? '#776688' : '#ffffff',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      txt.on('pointerover', () => this.select(i));
      txt.on('pointerdown', () => this.activate(i));
      this.rows.push(txt);
    });

    this.add
      .text(cx, GAME_HEIGHT - 30, 'Arrow keys / mouse • Enter to select', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        color: '#8877aa',
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => this.select(this.index - 1));
    kb.on('keydown-DOWN', () => this.select(this.index + 1));
    kb.on('keydown-ENTER', () => this.activate(this.index));
    kb.on('keydown-SPACE', () => this.activate(this.index));

    this.select(0);
  }

  private select(i: number): void {
    this.index = Phaser.Math.Wrap(i, 0, ITEMS.length);
    this.rows.forEach((r, ri) => {
      const soon = ITEMS[ri].soon;
      r.setColor(ri === this.index ? '#ffd700' : soon ? '#776688' : '#ffffff');
      r.setScale(ri === this.index ? 1.1 : 1.0);
    });
  }

  private activate(i: number): void {
    const item = ITEMS[i];
    if (item.soon || !item.scene) return;
    this.scene.start(item.scene);
  }
}

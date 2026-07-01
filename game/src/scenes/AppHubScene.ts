import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AudioSystem } from '../systems/AudioSystem';

// ── AppHubScene ───────────────────────────────────────────────────────────
// The private member-app home screen. Eight role-based entry points, each
// its own clean card — no raw asset-sheet chunks, no overlap, no dev labels.
// Layout: top bar (logo + status) / center 4x2 card grid / bottom footer.

type HubCard = {
  label: string;
  sub: string;
  icon: string;
  color: number;
  scene: string;
};

const CARDS: HubCard[] = [
  { label: 'MEMBER PASS',       sub: 'View your card',      icon: '🎫', color: 0xc100ff, scene: SCENE.Membership },
  { label: 'MEMBERSHIP DUES',   sub: 'Pay & renew',         icon: '💳', color: 0xffd700, scene: SCENE.Membership },
  { label: 'STAFF DOOR SCAN',   sub: 'Verify entry',        icon: '🚪', color: 0x44cc44, scene: SCENE.MemberCheckIn },
  { label: 'SECURITY DOOR MODE',sub: 'Guard console',       icon: '🛡',  color: 0xff4444, scene: SCENE.SecurityDoor },
  { label: 'LIP SYNC BINGO',    sub: 'Play the game',       icon: '🎤', color: 0xff66cc, scene: SCENE.LipsyncBingo },
  { label: 'HOST / DJ CONTROL', sub: 'Run the show',        icon: '🎧', color: 0x00aaff, scene: SCENE.HostDj },
  { label: 'TV DISPLAY',        sub: 'Big-screen view',     icon: '📺', color: 0x8844ff, scene: SCENE.TvMode },
  { label: 'OWNER COMMAND',     sub: 'Admin controls',      icon: '👑', color: 0xff9900, scene: SCENE.OwnerCommand },
];

const COLS = 4;
const CARD_W = 210;
const CARD_H = 150;
const GAP_X = 16;
const GAP_Y = 16;

export class AppHubScene extends Phaser.Scene {
  private cursor = 0;
  private cardRects: Phaser.GameObjects.Rectangle[] = [];

  constructor() { super(SCENE.AppHub); }

  create(): void {
    AudioSystem.playForScene(this, 'MainMenu');
    this.cameras.main.setBackgroundColor(0x06030e);
    this.cursor = 0;
    this.cardRects = [];

    this.buildTopBar();
    this.buildGrid();
    this.buildFooter();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT',  () => this.move(-1, 0));
    kb.on('keydown-RIGHT', () => this.move(1, 0));
    kb.on('keydown-UP',    () => this.move(0, -1));
    kb.on('keydown-DOWN',  () => this.move(0, 1));
    kb.on('keydown-ENTER', () => this.activate(this.cursor));
    kb.on('keydown-SPACE', () => this.activate(this.cursor));
    kb.on('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));

    this.refreshSelection();
  }

  // ── Top bar: logo + app name + active status ─────────────────────────────
  private buildTopBar(): void {
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, 32, GAME_WIDTH, 64, 0x0a0420, 0.96)
      .setStrokeStyle(0, 0, 0).setDepth(100);
    this.add.rectangle(cx, 64, GAME_WIDTH, 2, 0xffd700, 0.6).setOrigin(0.5, 1).setDepth(101);

    this.add.text(cx, 18, 'HITMANS VIP', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(102);
    this.add.text(cx, 42, 'MEMBER APP', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#c100ff',
    }).setOrigin(0.5).setDepth(102);

    // Status pill top-right
    this.add.rectangle(GAME_WIDTH - 90, 32, 150, 30, 0x0a1a00, 0.9)
      .setStrokeStyle(1, 0x44cc44).setDepth(102);
    this.add.text(GAME_WIDTH - 90, 32, '● ACTIVE MEMBER', {
      fontFamily: 'monospace', fontSize: '10px', color: '#44cc44',
    }).setOrigin(0.5).setDepth(103);

    // Back chip top-left
    const back = this.add.rectangle(64, 32, 100, 30, 0x1a0030, 0.9)
      .setStrokeStyle(1, 0xc100ff).setDepth(102).setInteractive({ useHandCursor: true });
    this.add.text(64, 32, 'ESC — GAME', {
      fontFamily: 'monospace', fontSize: '10px', color: '#c100ff',
    }).setOrigin(0.5).setDepth(103);
    back.on('pointerdown', () => this.scene.start(SCENE.MainMenu));
  }

  // ── Center: 4x2 grid of clean cards ───────────────────────────────────────
  private buildGrid(): void {
    const rows = Math.ceil(CARDS.length / COLS);
    const gridW = COLS * CARD_W + (COLS - 1) * GAP_X;
    const gridH = rows * CARD_H + (rows - 1) * GAP_Y;
    const startX = (GAME_WIDTH - gridW) / 2 + CARD_W / 2;
    const startY = (GAME_HEIGHT - gridH) / 2 + CARD_H / 2 + 12;

    CARDS.forEach((card, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = startX + col * (CARD_W + GAP_X);
      const cy = startY + row * (CARD_H + GAP_Y);

      const rect = this.add.rectangle(cx, cy, CARD_W, CARD_H, 0x0d0620, 0.95)
        .setStrokeStyle(2, card.color, 0.8)
        .setDepth(50)
        .setInteractive({ useHandCursor: true });
      this.cardRects.push(rect);

      // Icon
      this.add.text(cx, cy - 42, card.icon, { fontSize: '32px' })
        .setOrigin(0.5).setDepth(51);

      // Label
      this.add.text(cx, cy + 6, card.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '13px',
        color: `#${card.color.toString(16).padStart(6, '0')}`,
        align: 'center', wordWrap: { width: CARD_W - 24 },
      }).setOrigin(0.5).setDepth(51);

      // Sub-label
      this.add.text(cx, cy + 40, card.sub, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#888899',
      }).setOrigin(0.5).setDepth(51);

      rect.on('pointerover', () => { this.cursor = i; this.refreshSelection(); });
      rect.on('pointerdown', () => this.activate(i));
    });
  }

  // ── Bottom footer strip ───────────────────────────────────────────────────
  private buildFooter(): void {
    const y = GAME_HEIGHT - 14;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 2, GAME_WIDTH, 24, 0x0a0420, 0.9)
      .setOrigin(0.5, 1).setDepth(100);
    this.add.text(GAME_WIDTH / 2, y, '◀ ▶ ▲ ▼ NAVIGATE   [ENTER] SELECT   [ESC] BACK TO GAME', {
      fontFamily: 'monospace', fontSize: '10px', color: '#665577',
    }).setOrigin(0.5, 1).setDepth(101);
  }

  // ── Selection / navigation ────────────────────────────────────────────────
  private move(dx: number, dy: number): void {
    const rows = Math.ceil(CARDS.length / COLS);
    const col = Phaser.Math.Clamp((this.cursor % COLS) + dx, 0, COLS - 1);
    const row = Phaser.Math.Clamp(Math.floor(this.cursor / COLS) + dy, 0, rows - 1);
    const next = row * COLS + col;
    if (next < CARDS.length) this.cursor = next;
    this.refreshSelection();
  }

  private refreshSelection(): void {
    this.cardRects.forEach((rect, i) => {
      const card = CARDS[i];
      const sel = i === this.cursor;
      rect.setStrokeStyle(sel ? 3 : 2, card.color, sel ? 1 : 0.8);
      rect.setScale(sel ? 1.04 : 1.0);
    });
  }

  private activate(i: number): void {
    this.scene.start(CARDS[i].scene);
  }
}

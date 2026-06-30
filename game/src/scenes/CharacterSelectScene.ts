import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { UISystem, UI } from '../systems/UISystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { CHAR_NAMES } from '../data/roster';
import { AudioSystem } from '../systems/AudioSystem';

const ALL_CHARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 30, 31];
const COLS = 5;
const ROWS = Math.ceil(ALL_CHARS.length / COLS);
const CELL = 100;
const GRID_X = (GAME_WIDTH - COLS * CELL) / 2;
const GRID_Y = 130;

export class CharacterSelectScene extends Phaser.Scene {
  private cursor = 0;
  private selectedId = ALL_CHARS[0];
  private previewSpr!: Phaser.GameObjects.Sprite;
  private nameTxt!: Phaser.GameObjects.Text;
  private cells: Phaser.GameObjects.Rectangle[] = [];

  constructor() { super(SCENE.CharacterSelect); }

  create(): void {
    AudioSystem.playForScene(this, 'ArcadeVs');
    this.cameras.main.setBackgroundColor(COLORS.bg);

    const hasUI = UISystem.ready(this);

    // ── Title banner ───────────────────────────────────────────────────────
    const titleBannerKey = [UI.csTitleBanner, UI.u1TitleBar2, UI.u1TitleBar1]
      .find(k => hasUI && this.textures.exists(k));
    if (titleBannerKey) {
      this.add.image(GAME_WIDTH / 2, 26, titleBannerKey)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH - 40, 44).setDepth(5);
    }
    this.add.text(GAME_WIDTH / 2, 26, 'CHARACTER SELECT', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(6);

    // ── Corner bracket art ─────────────────────────────────────────────────
    if (hasUI && this.textures.exists(UI.u1CornerBrackets)) {
      this.add.image(4, 4, UI.u1CornerBrackets)
        .setOrigin(0, 0).setDisplaySize(60, 60).setDepth(4).setAlpha(0.7);
      this.add.image(GAME_WIDTH - 4, 4, UI.u1CornerBrackets)
        .setOrigin(1, 0).setDisplaySize(60, 60).setDepth(4).setAlpha(0.7).setFlipX(true);
    }

    // ── Slot grid background ───────────────────────────────────────────────
    if (hasUI && this.textures.exists(UI.csSlotGrid)) {
      this.add.image(GRID_X - 8, GRID_Y - 8, UI.csSlotGrid)
        .setOrigin(0, 0).setDisplaySize(COLS * CELL + 16, ROWS * CELL + 16).setAlpha(0.55);
    }

    // ── Character grid cells ───────────────────────────────────────────────
    this.cells = [];
    ALL_CHARS.forEach((charId, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = GRID_X + col * CELL + CELL / 2;
      const cy = GRID_Y + row * CELL + CELL / 2;

      // Slot background
      const slotKey = hasUI && this.textures.exists(UI.csSlotIdle) ? UI.csSlotIdle : '';
      let cell: Phaser.GameObjects.Rectangle;
      if (slotKey) {
        this.add.image(cx, cy, slotKey).setDisplaySize(CELL - 6, CELL - 6);
        cell = this.add.rectangle(cx, cy, CELL - 6, CELL - 6, 0, 0)
          .setStrokeStyle(2, 0x3a2a5a, 0);
      } else {
        cell = this.add.rectangle(cx, cy, CELL - 6, CELL - 6, 0x110820)
          .setStrokeStyle(1, 0x3a2a5a);
      }
      this.cells.push(cell);

      // Character sprite or block
      const idleKey = AnimationSystem.animKey(charId, 'idle');
      if (this.anims.exists(idleKey)) {
        const spr = this.add.sprite(cx, cy + 10, '__DEFAULT')
          .setOrigin(0.5, 1).setScale((CELL - 16) / 181);
        spr.play(idleKey);
      } else {
        this.add.rectangle(cx, cy, 28, 50, charId === 1 ? COLORS.player : COLORS.enemy);
      }

      // Short name label
      const short = (CHAR_NAMES[charId] ?? `#${charId}`).split(' ').pop()!;
      this.add.text(cx, cy + CELL / 2 - 8, short, {
        fontFamily: 'monospace', fontSize: '8px', color: '#ccbbee',
      }).setOrigin(0.5);

      // Click to select
      cell.setInteractive({ useHandCursor: true });
      cell.on('pointerover', () => { this.cursor = i; this.refreshGrid(); });
      cell.on('pointerdown', () => { this.cursor = i; this.confirmSelection(); });
    });

    // ── Right panel: large portrait + stat panel ───────────────────────────
    const panelX = GAME_WIDTH - 10;
    const panelY = GRID_Y;
    const panelW = GAME_WIDTH - (GRID_X + COLS * CELL + 20);
    const portraitH = panelW * 1.25;

    // Portrait frame — prefer new csxPortraitGold crop, fall back to old art
    const portraitFrameKey = [UI.csxPortraitGold, UI.csPortraitFrameLarge]
      .find(k => hasUI && this.textures.exists(k));
    if (portraitFrameKey) {
      this.add.image(panelX, panelY, portraitFrameKey)
        .setOrigin(1, 0).setDisplaySize(panelW, portraitH);
    }

    this.previewSpr = this.add.sprite(panelX - panelW / 2, panelY + portraitH * 0.88, '__DEFAULT')
      .setOrigin(0.5, 1).setScale((panelW - 24) / 181);

    // Name bar — csxNameBar crop sits between portrait and stat panel
    const nameBarY = panelY + portraitH + 2;
    const nameBarKey = hasUI && this.textures.exists(UI.csxNameBar) ? UI.csxNameBar : null;
    if (nameBarKey) {
      this.add.image(panelX - panelW / 2, nameBarY, nameBarKey)
        .setOrigin(0.5, 0).setDisplaySize(panelW, 28);
    }

    // Stat panel — prefer csxStatPanel crop, fall back to old art
    const statPanelKey = [UI.csxStatPanel, UI.csStatPanel]
      .find(k => hasUI && this.textures.exists(k));
    const statY = nameBarY + 30;
    if (statPanelKey) {
      this.add.image(panelX, statY, statPanelKey)
        .setOrigin(1, 0).setDisplaySize(panelW, 110);
    }

    this.nameTxt = this.add.text(panelX - panelW / 2, nameBarY + 14,
      '', { fontFamily: 'Arial Black, sans-serif', fontSize: '12px', color: '#ffd700',
        stroke: '#000000', strokeThickness: 3 },
    ).setOrigin(0.5);

    // ── Bottom strip ───────────────────────────────────────────────────────
    if (hasUI && this.textures.exists(UI.csInstructionStrip)) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 4, UI.csInstructionStrip)
        .setOrigin(0.5, 1).setDisplaySize(700, 36);
    } else {
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 10,
        'Arrow keys / mouse to navigate • Enter / click to confirm • ESC back',
        { fontFamily: 'monospace', fontSize: '11px', color: '#8877aa' }).setOrigin(0.5, 1);
    }

    // ── Keyboard nav ─────────────────────────────────────────────────────
    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT',  () => { this.cursor = Phaser.Math.Wrap(this.cursor - 1, 0, ALL_CHARS.length); this.refreshGrid(); });
    kb.on('keydown-RIGHT', () => { this.cursor = Phaser.Math.Wrap(this.cursor + 1, 0, ALL_CHARS.length); this.refreshGrid(); });
    kb.on('keydown-UP',    () => { this.cursor = Phaser.Math.Wrap(this.cursor - COLS, 0, ALL_CHARS.length); this.refreshGrid(); });
    kb.on('keydown-DOWN',  () => { this.cursor = Phaser.Math.Wrap(this.cursor + COLS, 0, ALL_CHARS.length); this.refreshGrid(); });
    kb.on('keydown-ENTER', () => this.confirmSelection());
    kb.on('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));

    this.refreshGrid();
  }

  private refreshGrid(): void {
    const charId = ALL_CHARS[this.cursor];
    this.selectedId = charId;

    // Update preview
    const idleKey = AnimationSystem.animKey(charId, 'idle');
    if (this.anims.exists(idleKey)) {
      this.previewSpr.play(idleKey, true);
    }
    this.nameTxt.setText(CHAR_NAMES[charId] ?? `Character ${charId}`);

    // Highlight selected cell
    this.cells.forEach((c, i) => {
      c.setStrokeStyle(i === this.cursor ? 3 : 1, i === this.cursor ? 0xffd700 : 0x3a2a5a);
    });
  }

  private confirmSelection(): void {
    this.scene.start(SCENE.ArcadeVs, { p1CharId: this.selectedId });
  }
}

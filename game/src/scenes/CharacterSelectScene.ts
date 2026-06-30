import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { UISystem, UI } from '../systems/UISystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { CHAR_NAMES } from '../data/roster';
import { AudioSystem } from '../systems/AudioSystem';

// ── Roster ────────────────────────────────────────────────────────────────────
const ALL_CHARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 30, 31];

// ── Layout — 960×540 ──────────────────────────────────────────────────────────
const TITLE_H  = 52;
const PANEL_W  = 188;

// Character grid (center block)
const GRID_COLS    = 7;
const CELL         = 78;
const GRID_W       = GRID_COLS * CELL;
const GRID_LEFT    = (GAME_WIDTH - GRID_W) / 2;   // ~228
const GRID_TOP     = TITLE_H + 6;                  // 58
const GRID_ROWS    = Math.ceil(ALL_CHARS.length / GRID_COLS); // 3

// Left/right panels
const LPANEL_X = 0;
const RPANEL_X = GAME_WIDTH - PANEL_W;
const PANELS_Y  = TITLE_H + 4;
const PORT_W    = PANEL_W - 12;
const PORT_H    = 210;
const NAME_Y    = PANELS_Y + PORT_H + 4;
const STAT_Y    = NAME_Y + 28;
const STAT_H    = 96;

// Bottom area (stage preview + category tabs + action buttons)
const BOTTOM_Y      = GRID_TOP + GRID_ROWS * CELL + 8;  // ~302
const STAGE_PREV_Y  = BOTTOM_Y + 4;
const STAGE_PREV_W  = 360;
const STAGE_PREV_H  = 108;
const CAT_TABS_Y    = STAGE_PREV_Y + STAGE_PREV_H + 4;
const ACTION_Y      = CAT_TABS_Y + 4;
const STRIP_Y       = GAME_HEIGHT - 2;

export class CharacterSelectScene extends Phaser.Scene {
  private cursor = 0;
  private cells: (Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle)[] = [];
  private cellSprites: Phaser.GameObjects.Sprite[] = [];
  private previewSpr!: Phaser.GameObjects.Sprite;
  private nameTxt!: Phaser.GameObjects.Text;

  constructor() { super(SCENE.CharacterSelect); }

  create(): void {
    AudioSystem.playForScene(this, 'ArcadeVs');
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Lazy-load idle frames for every roster char so the grid renders sprites,
    // not red placeholder rectangles, for chars that weren't preloaded.
    AnimationSystem.loadOnDemand(this, ALL_CHARS, ['idle']).then(() => {
      for (const id of ALL_CHARS) AnimationSystem.build(this, id, ['idle']);
      this.refreshGrid();
    }).catch(() => {});

    const tex = (k: string) => this.textures.exists(k);
    const hasUI = UISystem.ready(this);
    const img = (key: string, x: number, y: number, w: number, h: number,
                 ox = 0.5, oy = 0, depth = 10, alpha = 1) => {
      if (!hasUI || !tex(key)) return;
      this.add.image(x, y, key).setOrigin(ox, oy)
        .setDisplaySize(w, h).setDepth(depth).setAlpha(alpha).setScrollFactor(0);
    };

    // ── 1. TITLE BANNER ──────────────────────────────────────────────────────
    img(UI.csTitleBanner, GAME_WIDTH / 2, 0, GAME_WIDTH, TITLE_H, 0.5, 0, 50);
    this.add.text(GAME_WIDTH / 2, TITLE_H / 2, 'CHARACTER SELECT', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(51).setScrollFactor(0);

    // ── 2. SLOT GRID (center) ────────────────────────────────────────────────
    img(UI.csSlotGrid,
      GRID_LEFT - 4, GRID_TOP - 4,
      GRID_W + 8, GRID_ROWS * CELL + 8,
      0, 0, 8, 0.6);

    this.cells = [];
    this.cellSprites = [];
    ALL_CHARS.forEach((charId, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      const cx = GRID_LEFT + col * CELL + CELL / 2;
      const cy = GRID_TOP  + row * CELL + CELL / 2;

      // Slot frame — respect actual texture aspect (~68×104) so it doesn't squish
      let cell: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
      if (hasUI && tex(UI.csSlotIdle)) {
        cell = this.add.image(cx, cy, UI.csSlotIdle)
          .setDisplaySize(CELL - 6, CELL + 8).setDepth(9);
      } else {
        cell = this.add.rectangle(cx, cy, CELL - 4, CELL - 4, 0x110820).setStrokeStyle(1, 0x3a2a5a).setDepth(9);
      }
      this.cells.push(cell);

      // Character sprite slot (texture set later when idle anim loads)
      const spr = this.add.sprite(cx, cy + CELL * 0.46, '__DEFAULT')
        .setOrigin(0.5, 1).setScale((CELL - 18) / 181).setDepth(11).setVisible(false);
      this.cellSprites.push(spr);
      const idleKey = AnimationSystem.animKey(charId, 'idle');
      if (this.anims.exists(idleKey)) spr.setVisible(true).play(idleKey);

      // Short name
      const short = (CHAR_NAMES[charId] ?? `#${charId}`).split(' ').pop()!;
      this.add.text(cx, cy + CELL / 2 - 7, short, {
        fontFamily: 'monospace', fontSize: '7px', color: '#ccbbee',
      }).setOrigin(0.5, 1).setDepth(12);

      cell.setInteractive({ useHandCursor: true });
      cell.on('pointerover', () => { this.cursor = i; this.refreshGrid(); });
      cell.on('pointerdown', () => { this.cursor = i; this.confirm(); });
    });

    // ── 3. LEFT PANEL (Player 1) ──────────────────────────────────────────────
    // Player 1 badge — top corner
    img(UI.csxRankShield, LPANEL_X + 6, PANELS_Y, 78, 48, 0, 0, 20);

    // Featured portrait frame
    const portFrameKey = tex(UI.csxPortraitGold) ? UI.csxPortraitGold : UI.csPortraitFrameLarge;
    img(portFrameKey, LPANEL_X + PANEL_W / 2, PANELS_Y + 50, PORT_W, PORT_H, 0.5, 0, 15);

    // Character preview sprite (P1 preview)
    this.previewSpr = this.add.sprite(LPANEL_X + PANEL_W / 2, PANELS_Y + 50 + PORT_H - 8, '__DEFAULT')
      .setOrigin(0.5, 1).setScale((PORT_W - 24) / 181).setDepth(16);

    // Name bar
    img(UI.csxNameBar, LPANEL_X + PANEL_W / 2, NAME_Y, PORT_W, 26, 0.5, 0, 17);
    this.nameTxt = this.add.text(LPANEL_X + PANEL_W / 2, NAME_Y + 13, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(18);

    // Stat panel
    const statKey = tex(UI.csxStatPanel) ? UI.csxStatPanel : UI.csStatPanel;
    img(statKey, LPANEL_X + PANEL_W / 2, STAT_Y, PORT_W, STAT_H, 0.5, 0, 15);

    // Style tags
    img(UI.csStyleTags, LPANEL_X + PANEL_W / 2, STAT_Y + STAT_H + 2, PORT_W, 42, 0.5, 0, 15);

    // ── 4. RIGHT PANEL (CPU / Opponent) ───────────────────────────────────────
    // CPU badge — top right
    img(UI.csReadyCpu, RPANEL_X + PANEL_W - 6, PANELS_Y, 78, 48, 1, 0, 20);

    // Portrait frame (mirrored)
    img(portFrameKey, RPANEL_X + PANEL_W / 2, PANELS_Y + 50, PORT_W, PORT_H, 0.5, 0, 15);

    // Stat panel
    img(statKey, RPANEL_X + PANEL_W / 2, STAT_Y, PORT_W, STAT_H, 0.5, 0, 15);

    // Style tags
    img(UI.csStyleTags, RPANEL_X + PANEL_W / 2, STAT_Y + STAT_H + 2, PORT_W, 42, 0.5, 0, 15);

    // ── 5. BOTTOM AREA ───────────────────────────────────────────────────────
    // Instruction strip / divider
    img(UI.csDivider, GAME_WIDTH / 2, BOTTOM_Y - 2, GAME_WIDTH - PANEL_W * 2 - 16, 10, 0.5, 0.5, 20);

    // Stage preview frame (bottom center)
    img(UI.csSlotGrid, GAME_WIDTH / 2, STAGE_PREV_Y, STAGE_PREV_W, STAGE_PREV_H, 0.5, 0, 12, 0.5);

    // Category tabs (ALL / ASSASSINS / ENFORCERS / TECH / WILDCARDS)
    img(UI.csCategoryTabs, GAME_WIDTH / 2, CAT_TABS_Y, STAGE_PREV_W, 32, 0.5, 0, 20);

    // Color / skin tabs (left of action buttons)
    img(UI.csColorTabs, GAME_WIDTH / 2 - 90, ACTION_Y, 160, 32, 0.5, 0, 20);

    // Action buttons: RANDOM / BACK / CONFIRM (bottom right)
    img(UI.csActionBtns, GAME_WIDTH - PANEL_W - 4, ACTION_Y, 196, 32, 1, 0, 20);

    // ── 6. INSTRUCTION STRIP (bottom) ─────────────────────────────────────────
    img(UI.csInstructionStrip, GAME_WIDTH / 2, STRIP_Y, GAME_WIDTH, 36, 0.5, 1, 30);
    if (!hasUI || !tex(UI.csInstructionStrip)) {
      this.add.text(GAME_WIDTH / 2, STRIP_Y - 2,
        'Arrow keys · Enter to confirm · ESC back',
        { fontFamily: 'monospace', fontSize: '11px', color: '#8877aa' },
      ).setOrigin(0.5, 1).setDepth(31);
    }

    // ── 7. INPUT ─────────────────────────────────────────────────────────────
    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT',  () => this.move(-1, 0));
    kb.on('keydown-RIGHT', () => this.move(1, 0));
    kb.on('keydown-UP',    () => this.move(0, -1));
    kb.on('keydown-DOWN',  () => this.move(0, 1));
    kb.on('keydown-ENTER', () => this.confirm());
    kb.on('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));

    this.refreshGrid();
  }

  private move(dx: number, dy: number): void {
    const col = this.cursor % GRID_COLS + dx;
    const row = Math.floor(this.cursor / GRID_COLS) + dy;
    const r = Phaser.Math.Clamp(row, 0, Math.floor((ALL_CHARS.length - 1) / GRID_COLS));
    const c = Phaser.Math.Clamp(col, 0, GRID_COLS - 1);
    const next = r * GRID_COLS + c;
    this.cursor = Math.min(next, ALL_CHARS.length - 1);
    this.refreshGrid();
  }

  private refreshGrid(): void {
    const charId = ALL_CHARS[this.cursor];
    const tex = (k: string) => this.textures.exists(k);
    const hasUI = UISystem.ready(this);

    this.cells.forEach((cell, i) => {
      if (cell instanceof Phaser.GameObjects.Image) {
        const key = i === this.cursor
          ? (hasUI && tex(UI.csSlotSelected) ? UI.csSlotSelected : UI.csSlotIdle)
          : UI.csSlotIdle;
        cell.setTexture(key);
        cell.setScale(i === this.cursor ? 1.08 : 1.0);
      } else {
        (cell as Phaser.GameObjects.Rectangle).setStrokeStyle(
          i === this.cursor ? 3 : 1,
          i === this.cursor ? 0xffd700 : 0x3a2a5a,
        );
      }
    });

    // Bring any newly-built idle anims onto the grid sprites
    this.cellSprites.forEach((spr, i) => {
      if (!spr.visible) {
        const k = AnimationSystem.animKey(ALL_CHARS[i], 'idle');
        if (this.anims.exists(k)) spr.setVisible(true).play(k);
      }
    });

    const idleKey = AnimationSystem.animKey(charId, 'idle');
    if (this.anims.exists(idleKey)) this.previewSpr.play(idleKey, true);
    this.nameTxt.setText(CHAR_NAMES[charId] ?? `Character ${charId}`);
  }

  private confirm(): void {
    this.scene.start(SCENE.ArcadeVs, { p1CharId: ALL_CHARS[this.cursor] });
  }
}

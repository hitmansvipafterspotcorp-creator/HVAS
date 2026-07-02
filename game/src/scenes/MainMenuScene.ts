import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { UISystem, UI } from '../systems/UISystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { AudioSystem } from '../systems/AudioSystem';

// ── Layout constants for 960×540 ─────────────────────────────────────────────
const CX = GAME_WIDTH / 2;

// Top bar
const LOGO_X = 10;
const LOGO_Y = 8;

const PROFILE_X = GAME_WIDTH - 8;
const PROFILE_Y = 8;

// Center buttons column — asset is 232×56, keep that aspect.
const BTN_X   = 490;
const BTN_W   = 232;
const BTN_H   = 50;
const BTN_Y0  = 130;
const BTN_GAP = 54;

// ── Menu items ────────────────────────────────────────────────────────────────
// NOTE: the mm_btn_* button textures (ui/elements/main_menu/mm_btn_*.png) are a
// corrupted design-guide export — every slice is shifted one slot from its
// intended label (mm_btn_newgame.png reads "CONTINUE", mm_btn_charselect.png
// reads "NEW GA" cropped mid-word, mm_btn_vsmode.png reads "CHARACTER", etc.),
// and mm_btn_continue.png isn't a button at all (it's an unrelated "Night."/
// "UNSEC" fragment). None of them are usable as live UI — same class of bug as
// cs_title_banner/cs_slot_idle fixed earlier. Buttons are drawn clean below.
type MenuItem = { label: string; scene: string };

const ITEMS: MenuItem[] = [
  { label: 'CONTINUE QUEST',   scene: SCENE.StageSelect },
  { label: 'NEW GAME',         scene: SCENE.StageSelect },
  { label: 'CHARACTER SELECT', scene: SCENE.CharacterSelect },
  { label: 'VS MODE',          scene: SCENE.ArcadeVs },
  { label: 'VENUE MAP',        scene: SCENE.VenueSelect },
  { label: 'OPTIONS',          scene: SCENE.Options },
  { label: 'EXIT',             scene: SCENE.MainMenu },
];

export class MainMenuScene extends Phaser.Scene {
  private index = 0;
  private btnRects: Phaser.GameObjects.Rectangle[] = [];
  private btnTexts: Phaser.GameObjects.Text[] = [];

  constructor() { super(SCENE.MainMenu); }

  create(): void {
    AudioSystem.playForScene(this, 'MainMenu');
    this.cameras.main.setBackgroundColor(COLORS.bg);

    UISystem.ready(this) ? this.buildWithArt() : this.buildFallback();

    const kb = this.input.keyboard!;
    kb.on('keydown-UP',    () => this.select(this.index - 1));
    kb.on('keydown-DOWN',  () => this.select(this.index + 1));
    kb.on('keydown-ENTER', () => this.activate(this.index));
    kb.on('keydown-SPACE', () => this.activate(this.index));
    kb.on('keydown-U', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) { ProgressionSystem.unlockAll(); this.scene.restart(); }
    });
    kb.on('keydown-R', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey) { ProgressionSystem.reset(); this.scene.restart(); }
    });
    kb.on('keydown-M', () => this.scene.start(SCENE.AppHub));

    this.select(0);
  }

  // ── Art build ─────────────────────────────────────────────────────────────
  // Most exported UI panel assets are design-guide fragments that include
  // annotation text and adjacent ornaments. We use only the confirmed-clean
  // assets (logo, profile bar, default button textures) and render every
  // other panel/strip ourselves so nothing looks broken.
  private buildWithArt(): void {
    const tex = (k: string) => this.textures.exists(k);

    // ── BACKDROP TINT ───────────────────────────────────────────────────────
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x080318, 1)
      .setOrigin(0, 0).setDepth(0);

    // ── TOP BAR ─────────────────────────────────────────────────────────────
    // mm_logo.png's bottom ~24% is a "QUEST" neon-script wordmark physically
    // cropped by the source export's own canvas edge (cut off mid-glyph) —
    // same corrupted-export class as the other fixed assets. The top ~76%
    // (crown + "HITMANS" crest) is clean, so crop to that and draw the
    // "QUEST" line ourselves.
    if (tex(UI.mmLogo)) {
      const logoH = 60;
      const logo = this.add.image(LOGO_X, LOGO_Y, UI.mmLogo).setOrigin(0, 0).setDepth(150);
      logo.setCrop(0, 0, 439, 175);
      logo.setDisplaySize(439 * (logoH / 175), logoH);
      this.add.text(LOGO_X + 16, LOGO_Y + logoH + 1, '★ QUEST', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ff2fd0',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0).setDepth(150);
    }
    if (tex(UI.mmProfileBar)) {
      this.add.image(PROFILE_X, PROFILE_Y, UI.mmProfileBar)
        .setOrigin(1, 0).setDisplaySize(320, 42).setDepth(150);
    }

    // Decorative divider under top bar
    this.add.rectangle(GAME_WIDTH / 2, 76, GAME_WIDTH - 40, 1, 0xffd700, 0.45)
      .setOrigin(0.5).setDepth(120);

    // ── LEFT COLUMN: tagline / mode badges ──────────────────────────────────
    const drawPanel = (x: number, y: number, w: number, h: number, title: string) => {
      this.add.rectangle(x, y, w, h, 0x140628, 0.9).setOrigin(0, 0)
        .setStrokeStyle(2, 0xffd700, 0.6).setDepth(100);
      this.add.text(x + 8, y + 4, title, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffd700',
      }).setOrigin(0, 0).setDepth(101);
    };

    drawPanel(8, 90, 200, 130, '★ THE VIP EXPERIENCE');
    this.add.text(20, 112, 'FAME · FORTUNE · LEGEND', {
      fontFamily: 'monospace', fontSize: '10px', color: '#c0a0ff',
    }).setDepth(102);
    this.add.text(20, 128, 'Complete missions to', {
      fontFamily: 'monospace', fontSize: '9px', color: '#aaaacc',
    }).setDepth(102);
    this.add.text(20, 142, 'unlock VIP venues.', {
      fontFamily: 'monospace', fontSize: '9px', color: '#aaaacc',
    }).setDepth(102);
    this.add.text(20, 168, 'STORY · PVP · CO-OP', {
      fontFamily: 'monospace', fontSize: '9px', color: '#88aadd',
    }).setDepth(102);
    this.add.text(20, 184, 'TIME TRIAL · EVENTS', {
      fontFamily: 'monospace', fontSize: '9px', color: '#88aadd',
    }).setDepth(102);

    drawPanel(8, 232, 200, 80, '★ RANK · GOLD');
    this.add.text(20, 254, 'XP   12,450 / 25,000', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffd700',
    }).setDepth(102);
    this.add.text(20, 270, 'BRONZE · SILVER · GOLD', {
      fontFamily: 'monospace', fontSize: '9px', color: '#c0a0ff',
    }).setDepth(102);
    this.add.text(20, 284, 'PLATINUM · DIAMOND', {
      fontFamily: 'monospace', fontSize: '9px', color: '#c0a0ff',
    }).setDepth(102);

    drawPanel(8, 324, 200, 100, '★ CONTROLS');
    this.add.text(20, 346, 'Arrow keys / Mouse', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(20, 362, 'Enter — Select', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(20, 378, 'ESC — Back', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(20, 394, 'Ctrl+Shift+U: unlock', {
      fontFamily: 'monospace', fontSize: '9px', color: '#664488',
    }).setDepth(102);

    // ── RIGHT COLUMN: news / daily quests ────────────────────────────────────
    drawPanel(GAME_WIDTH - 208, 90, 200, 160, '★ NEWS & EVENTS');
    this.add.text(GAME_WIDTH - 196, 112, '• VIP Tournament now live', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 126, '• New venue: Tally Den', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 140, '• Double XP weekend', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 168, 'VIP REWARDS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffd700',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 184, 'Double rewards', {
      fontFamily: 'monospace', fontSize: '9px', color: '#c0a0ff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 200, 'this weekend!', {
      fontFamily: 'monospace', fontSize: '9px', color: '#c0a0ff',
    }).setDepth(102);

    drawPanel(GAME_WIDTH - 208, 262, 200, 130, '★ DAILY QUESTS');
    const beaten = ProgressionSystem.getBeatenBosses().length;
    this.add.text(GAME_WIDTH - 196, 284, `Complete missions  ${beaten}/7`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 300, 'Win 3 VS matches    0/3', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 316, 'Visit 5 venues      0/5', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffffff',
    }).setDepth(102);
    this.add.text(GAME_WIDTH - 196, 344, 'Weekly Bonus: 2× XP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffd700',
    }).setDepth(102);

    // ── CENTER: MENU BUTTONS ─────────────────────────────────────────────────
    this.btnRects = [];
    this.btnTexts = [];
    ITEMS.forEach((item, i) => {
      const by = BTN_Y0 + i * BTN_GAP;
      const rect = this.add.rectangle(BTN_X, by, BTN_W, BTN_H, 0x1a0a30, 0.92)
        .setOrigin(0.5, 0.5).setStrokeStyle(2, 0xffd700, 0.7).setDepth(200)
        .setScrollFactor(0).setInteractive({ useHandCursor: true });
      const label = this.add.text(BTN_X, by, item.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(201);

      rect.on('pointerover', () => this.select(i));
      rect.on('pointerdown', () => this.activate(i));
      this.btnRects.push(rect);
      this.btnTexts.push(label);
    });

    // ── BOTTOM STRIP ────────────────────────────────────────────────────────
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 1, GAME_WIDTH, 28, 0x0a0220, 0.95)
      .setOrigin(0.5, 1).setStrokeStyle(1, 0xffd700, 0.5).setDepth(110);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 8,
      '★ COMPLETE MISSIONS TO UNLOCK VIP REWARDS  ★  WEEKLY BONUS  ★  [M] MEMBER APP ★',
      { fontFamily: 'monospace', fontSize: '10px', color: '#ffd700' },
    ).setOrigin(0.5, 1).setDepth(111);
  }

  // ── Fallback ──────────────────────────────────────────────────────────────
  private buildFallback(): void {
    this.add.text(CX, 60, 'HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '30px', color: '#ffd700',
    }).setOrigin(0.5);

    ITEMS.forEach((item, i) => {
      const y = 160 + i * 50;
      const txt = this.add.text(CX, y, item.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '20px', color: '#ffffff',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      txt.on('pointerover', () => this.select(i));
      txt.on('pointerdown', () => this.activate(i));
      this.btnTexts.push(txt);
    });

    this.add.text(CX, GAME_HEIGHT - 28, 'Arrow keys / mouse · Enter to select', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#8877aa',
    }).setOrigin(0.5);
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  private select(i: number): void {
    this.index = Phaser.Math.Wrap(i, 0, ITEMS.length);
    const hasUI = UISystem.ready(this);
    this.btnTexts.forEach((txt, ri) => {
      const sel = ri === this.index;
      txt.setColor(sel ? '#ffd700' : '#ffffff');
      if (hasUI) {
        const rect = this.btnRects[ri];
        rect.setStrokeStyle(2, sel ? 0xffffff : 0xffd700, sel ? 1 : 0.7);
        rect.setScale(sel ? 1.06 : 1.0);
        txt.setScale(sel ? 1.06 : 1.0);
      }
    });
  }

  private activate(i: number): void {
    const item = ITEMS[i];
    if (item.scene === SCENE.MainMenu) {
      this.scene.start(SCENE.VenueSelect);
      return;
    }
    this.scene.start(item.scene);
  }
}

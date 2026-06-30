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

// Left column (taglines → mode badges → rank chips)
const LEFT_X = 8;
const TAGLINES_Y   = 82;
const TAGLINES_W   = 196;
const TAGLINES_H   = 108;
const BADGES_Y     = 200;
const BADGES_W     = 196;
const BADGES_H     = 88;
const RANK_Y       = 302;
const RANK_W       = 196;
const RANK_H       = 78;
const PROMPT_X     = 8;
const PROMPT_Y     = 392;
const PROMPT_W     = 196;
const PROMPT_H     = 56;

// Center buttons column — asset is 232×56, keep that aspect.
const BTN_X   = 490;
const BTN_W   = 232;
const BTN_H   = 50;
const BTN_Y0  = 130;
const BTN_GAP = 54;

// Right panels (News & Events, Daily Quests)
const RIGHT_X  = GAME_WIDTH - 8;
const NEWS_Y   = 82;
const NEWS_W   = 196;
const NEWS_H   = 152;
const QUEST_Y  = 248;
const QUEST_W  = 196;
const QUEST_H  = 132;
const BOTTOM_ICONS_Y = 394;
const BOTTOM_ICONS_W = 196;
const BOTTOM_ICONS_H = 56;

// Bottom strip
const REWARD_Y  = GAME_HEIGHT - 2;
const FOOTER_X  = GAME_WIDTH - 4;
const FOOTER_Y  = GAME_HEIGHT - 2;

// ── Menu items (map to real button textures) ──────────────────────────────────
type MenuItem = { label: string; btnKey: string; btnSelKey: string; scene: string };

const ITEMS: MenuItem[] = [
  { label: 'CONTINUE QUEST', btnKey: UI.mmBtnContinue,    btnSelKey: UI.mmBtnContinueSel,    scene: SCENE.StageSelect },
  { label: 'NEW GAME',       btnKey: UI.mmBtnNewGame,      btnSelKey: UI.mmBtnNewGameSel,      scene: SCENE.StageSelect },
  { label: 'CHARACTER SELECT', btnKey: UI.mmBtnCharSelect, btnSelKey: UI.mmBtnCharSelectSel,   scene: SCENE.CharacterSelect },
  { label: 'VS MODE',        btnKey: UI.mmBtnVsMode,       btnSelKey: UI.mmBtnVsModeSel,       scene: SCENE.ArcadeVs },
  { label: 'VENUE MAP',      btnKey: UI.mmBtnVenueMap,     btnSelKey: UI.mmBtnVenueMapSel,     scene: SCENE.VenueSelect },
  { label: 'OPTIONS',        btnKey: UI.mmBtnOptions,      btnSelKey: UI.mmBtnOptionsSel,      scene: SCENE.Options },
  { label: 'EXIT',           btnKey: UI.mmBtnExit,         btnSelKey: UI.mmBtnExitSel,         scene: SCENE.MainMenu },
];

export class MainMenuScene extends Phaser.Scene {
  private index = 0;
  private btnImages: Phaser.GameObjects.Image[] = [];

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

    this.select(0);
  }

  // ── Art build ─────────────────────────────────────────────────────────────
  private buildWithArt(): void {
    const tex = (k: string) => this.textures.exists(k);
    const img = (key: string, x: number, y: number, w: number, h: number,
                 ox = 0, oy = 0, depth = 100, alpha = 1) => {
      if (!tex(key)) return;
      this.add.image(x, y, key)
        .setOrigin(ox, oy).setDisplaySize(w, h).setDepth(depth).setAlpha(alpha).setScrollFactor(0);
    };

    // ── TOP BAR ─────────────────────────────────────────────────────────────
    // Logo — keep 2:1 aspect (asset is 439×230). 220×115 fits the top-left area.
    img(UI.mmLogo, LOGO_X, LOGO_Y, 220, 115, 0, 0, 150);

    // Profile/Status bar — top-right
    img(UI.mmProfileBar, PROFILE_X, PROFILE_Y, 370, 46, 1, 0, 150);

    // (mm_decorative is a SHEET of small ornaments, not a single bar — omit
    //  rather than stretch it across the screen which produced the "ASSEMBLY
    //  GUIDE" overlay artifact in the previous render.)

    // ── LEFT COLUMN ─────────────────────────────────────────────────────────
    // Taglines (THE ULTIMATE VIP EXPERIENCE / FAME. FORTUNE. LEGEND. etc.)
    img(UI.mmTaglines,   LEFT_X, TAGLINES_Y, TAGLINES_W, TAGLINES_H, 0, 0, 100);

    // Mode badges (STORY / VS / CO-OP / TIME TRIAL / EVENT)
    img(UI.mmModeBadges, LEFT_X, BADGES_Y, BADGES_W, BADGES_H, 0, 0, 100);

    // Rank chips (BRONZE / SILVER / GOLD / PLATINUM / DIAMOND)
    img(UI.mmRankChips,  LEFT_X, RANK_Y, RANK_W, RANK_H, 0, 0, 100);

    // Prompt chips (A SELECT / B BACK / navigate / LT RT)
    img(UI.mmPromptChips, PROMPT_X, PROMPT_Y, PROMPT_W, PROMPT_H, 0, 0, 100);

    // ── RIGHT PANELS ────────────────────────────────────────────────────────
    // News & Events panel — top-right
    img(UI.mmNewsPanel,   RIGHT_X, NEWS_Y,   NEWS_W,   NEWS_H,   1, 0, 100);

    // Daily Quests panel — below news
    img(UI.mmQuestsPanel, RIGHT_X, QUEST_Y,  QUEST_W,  QUEST_H,  1, 0, 100);

    // Bottom icons (VIP promo / double rewards)
    img(UI.mmBottomIcons, RIGHT_X, BOTTOM_ICONS_Y, BOTTOM_ICONS_W, BOTTOM_ICONS_H, 1, 0, 100);

    // ── CENTER: MENU BUTTONS ─────────────────────────────────────────────────
    this.btnImages = [];
    ITEMS.forEach((item, i) => {
      const by = BTN_Y0 + i * BTN_GAP;
      const btnImg = this.add.image(BTN_X, by, item.btnKey)
        .setDisplaySize(BTN_W, BTN_H)
        .setOrigin(0.5, 0.5)
        .setDepth(200)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      btnImg.on('pointerover', () => this.select(i));
      btnImg.on('pointerdown', () => this.activate(i));
      this.btnImages.push(btnImg);
    });

    // ── BOTTOM STRIP ────────────────────────────────────────────────────────
    // Reward strip — full width at bottom
    img(UI.mmRewardStrip, CX, REWARD_Y, GAME_WIDTH, 46, 0.5, 1, 110);

    // Footer ornament — bottom-right
    img(UI.mmFooterOrnament, FOOTER_X, FOOTER_Y, 180, 44, 1, 1, 111);

    // Progress readout
    const beaten = ProgressionSystem.getBeatenBosses().length;
    if (beaten > 0) {
      this.add.text(BTN_X, BTN_Y0 + ITEMS.length * BTN_GAP + 14,
        `Quest: ${beaten}/7 bosses defeated`,
        { fontFamily: 'monospace', fontSize: '11px', color: '#44dd88' },
      ).setOrigin(0.5, 0).setDepth(110).setScrollFactor(0);
    }
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
      this.btnImages.push(txt as unknown as Phaser.GameObjects.Image);
    });

    this.add.text(CX, GAME_HEIGHT - 28, 'Arrow keys / mouse · Enter to select', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#8877aa',
    }).setOrigin(0.5);
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  private select(i: number): void {
    this.index = Phaser.Math.Wrap(i, 0, ITEMS.length);
    const hasUI = UISystem.ready(this);
    this.btnImages.forEach((btn, ri) => {
      if (hasUI) {
        const key = ri === this.index ? ITEMS[ri].btnSelKey : ITEMS[ri].btnKey;
        (btn as Phaser.GameObjects.Image).setTexture(key);
        const scale = ri === this.index ? 1.06 : 1.0;
        btn.setDisplaySize(BTN_W * scale, BTN_H * scale);
      } else {
        const txt = btn as unknown as Phaser.GameObjects.Text;
        if (txt.setColor) txt.setColor(ri === this.index ? '#ffd700' : '#ffffff');
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

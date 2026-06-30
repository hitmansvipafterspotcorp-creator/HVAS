import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { UISystem, UI } from '../systems/UISystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { AudioSystem } from '../systems/AudioSystem';

// Menu entries wired to real mm_btn_* textures
type MenuItem = {
  label: string;
  btnKey: string;
  btnSelKey: string;
  scene?: string;
};

const ITEMS: MenuItem[] = [
  { label: 'QUEST',          btnKey: UI.mmBtnNewGame,    btnSelKey: UI.mmBtnNewGameSel,    scene: SCENE.StageSelect },
  { label: 'ARCADE VS',      btnKey: UI.mmBtnVsMode,     btnSelKey: UI.mmBtnVsModeSel,     scene: SCENE.ArcadeVs },
  { label: 'CHAR SELECT',    btnKey: UI.mmBtnCharSelect, btnSelKey: UI.mmBtnCharSelectSel, scene: SCENE.CharacterSelect },
  { label: 'VENUES',         btnKey: UI.mmBtnVenueMap,   btnSelKey: UI.mmBtnVenueMapSel,   scene: SCENE.VenueSelect },
  { label: 'OPTIONS',        btnKey: UI.mmBtnOptions,    btnSelKey: UI.mmBtnOptionsSel,    scene: SCENE.Options },
  { label: 'EXIT / MAIN',    btnKey: UI.mmBtnExit,       btnSelKey: UI.mmBtnExitSel,       scene: SCENE.MainMenu },
];

const BTN_W  = 220;
const BTN_H  = 44;
const BTN_X  = 480;    // center x of button column
const BTN_Y0 = 268;    // top of first button
const BTN_GAP = 54;    // spacing between buttons

export class MainMenuScene extends Phaser.Scene {
  private index = 0;
  private btnImages: Phaser.GameObjects.Image[] = [];

  constructor() {
    super(SCENE.MainMenu);
  }

  create(): void {
    AudioSystem.playForScene(this, 'MainMenu');
    this.cameras.main.setBackgroundColor(COLORS.bg);

    const hasUI = UISystem.ready(this);

    if (hasUI) {
      this.buildWithArt();
    } else {
      this.buildFallback();
    }

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
    const cx = GAME_WIDTH / 2;

    // ── Center top: full game logo (feGameLogo = HITMANS VIP AFTER SPOT) ──
    if (this.textures.exists(UI.feGameLogo)) {
      const logo = this.add.image(cx, 120, UI.feGameLogo)
        .setOrigin(0.5).setDisplaySize(480, 200).setDepth(150).setScrollFactor(0);
      this.tweens.add({
        targets: logo,
        scaleX: logo.scaleX * 1.035, scaleY: logo.scaleY * 1.035,
        duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    } else if (this.textures.exists(UI.mmLogo)) {
      // Fallback to smaller logo art
      UISystem.place(this, UI.mmLogo, cx, 90, { originX: 0.5, originY: 0.5, depth: 150 });
    }

    // ── Top-left: MAIN MENU banner strip ──────────────────────────────────
    if (this.textures.exists(UI.feMainMenuBanner)) {
      this.add.image(cx, 232, UI.feMainMenuBanner)
        .setOrigin(0.5).setDisplaySize(320, 52).setDepth(120).setScrollFactor(0).setAlpha(0.85);
    }

    // ── Top-left: profile bar ─────────────────────────────────────────────
    UISystem.place(this, UI.mmProfileBar, GAME_WIDTH - 10, 14, { originX: 1, originY: 0, depth: 100 });

    // ── Top-right: profile bar ────────────────────────────────────────────
    UISystem.place(this, UI.mmProfileBar, GAME_WIDTH - 10, 14, { originX: 1, originY: 0, depth: 100 });

    // ── Left column: taglines + mode badges + rank chips ──────────────────
    UISystem.place(this, UI.mmTaglines,   22, 178, { originX: 0, originY: 0, depth: 100 });
    UISystem.place(this, UI.mmModeBadges, 22, 362, { originX: 0, originY: 0, depth: 100 });
    UISystem.place(this, UI.mmRankChips,  22, 498, { originX: 0, originY: 0, depth: 100 });

    // ── Right column: news + quests panels ───────────────────────────────
    UISystem.place(this, UI.mmNewsPanel,   GAME_WIDTH - 22, 160, { originX: 1, originY: 0, depth: 100 });
    UISystem.place(this, UI.mmQuestsPanel, GAME_WIDTH - 22, 440, { originX: 1, originY: 0, depth: 100 });

    // ── Bottom: reward strip + footer ornament ────────────────────────────
    UISystem.place(this, UI.mmRewardStrip,    cx, GAME_HEIGHT - 4, { originX: 0.5, originY: 1, depth: 100 });
    UISystem.place(this, UI.mmFooterOrnament, GAME_WIDTH - 6, GAME_HEIGHT - 2, { originX: 1, originY: 1, depth: 100 });

    // ── Progress readout ──────────────────────────────────────────────────
    const beaten = ProgressionSystem.getBeatenBosses().length;
    if (beaten > 0) {
      this.add.text(cx, GAME_HEIGHT - 70,
        `Quest: ${beaten}/7 bosses defeated`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#44dd88' },
      ).setOrigin(0.5).setDepth(110).setScrollFactor(0);
    }

    // ── Center: title menu full panel behind the buttons ─────────────────
    if (this.textures.exists(UI.tmPanelFull)) {
      this.add.image(cx, 390, UI.tmPanelFull)
        .setOrigin(0.5).setDisplaySize(300, 280).setDepth(90).setAlpha(0.45).setScrollFactor(0);
    }

    // ── Crown and shield emblems flanking the logo ────────────────────────
    if (this.textures.exists(UI.feCrown)) {
      this.add.image(cx - 240, 120, UI.feCrown)
        .setOrigin(0.5).setDisplaySize(44, 44).setDepth(140).setAlpha(0.7).setScrollFactor(0);
      this.add.image(cx + 240, 120, UI.feCrown)
        .setOrigin(0.5).setDisplaySize(44, 44).setDepth(140).setAlpha(0.7).setScrollFactor(0);
    }

    // ── Center buttons ────────────────────────────────────────────────────
    this.btnImages = [];
    ITEMS.forEach((item, i) => {
      const y = BTN_Y0 + i * BTN_GAP;
      const img = this.add.image(BTN_X, y, item.btnKey)
        .setDisplaySize(BTN_W, BTN_H)
        .setOrigin(0.5)
        .setDepth(200)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      img.on('pointerover', () => this.select(i));
      img.on('pointerdown', () => this.activate(i));
      this.btnImages.push(img);
    });

    // Hint text
    this.add.text(BTN_X, BTN_Y0 + ITEMS.length * BTN_GAP + 18,
      'Arrow keys or mouse • Enter/Space to select',
      { fontFamily: 'monospace', fontSize: '11px', color: '#8877aa' },
    ).setOrigin(0.5).setDepth(110).setScrollFactor(0);
  }

  // ── Fallback (art not loaded yet) ─────────────────────────────────────────
  private buildFallback(): void {
    const cx = GAME_WIDTH / 2;
    this.add.text(cx, 70, 'HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '32px',
      color: '#ffd700',
    }).setOrigin(0.5);

    ITEMS.forEach((item, i) => {
      const y = 200 + i * 54;
      const txt = this.add.text(cx, y, item.label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      txt.on('pointerover', () => this.select(i));
      txt.on('pointerdown', () => this.activate(i));
      this.btnImages.push(txt as unknown as Phaser.GameObjects.Image);
    });

    this.add.text(cx, GAME_HEIGHT - 30, 'Arrow keys / mouse • Enter to select', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#8877aa',
    }).setOrigin(0.5);

    const beaten = ProgressionSystem.getBeatenBosses().length;
    if (beaten > 0) {
      this.add.text(cx, GAME_HEIGHT - 46,
        `Quest: ${beaten}/7 bosses defeated`,
        { fontFamily: 'monospace', fontSize: '12px', color: '#44dd88' },
      ).setOrigin(0.5);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  private select(i: number): void {
    this.index = Phaser.Math.Wrap(i, 0, ITEMS.length);
    const hasUI = UISystem.ready(this);
    this.btnImages.forEach((btn, ri) => {
      if (hasUI) {
        const item = ITEMS[ri];
        const key = ri === this.index ? item.btnSelKey : item.btnKey;
        (btn as Phaser.GameObjects.Image).setTexture(key);
        const scale = ri === this.index ? 1.08 : 1.0;
        btn.setDisplaySize(BTN_W * scale, BTN_H * scale);
      } else {
        const txt = btn as unknown as Phaser.GameObjects.Text;
        if (txt.setColor) {
          txt.setColor(ri === this.index ? '#ffd700' : '#ffffff');
          txt.setScale(ri === this.index ? 1.1 : 1.0);
        }
      }
    });
  }

  private activate(i: number): void {
    const item = ITEMS[i];
    if (!item.scene) return;
    if (item.scene === SCENE.MainMenu) {
      this.scene.start(SCENE.VenueSelect);
      return;
    }
    this.scene.start(item.scene);
  }
}

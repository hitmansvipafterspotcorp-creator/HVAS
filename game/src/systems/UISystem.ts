import Phaser from 'phaser';
import { ASSET_BASE } from '../config';

// ── UISystem ────────────────────────────────────────────────────────────────
// Loads every named UI element from assets/ui/. Full sheets serve as scene
// backdrops; named element slices are wired into specific HUD / menu slots.

export const UI = {
  // Core
  logo:            'ui_logo',
  shell:           'ui_shell',
  // HUD named pieces
  healthBar:       'ui_health_bar',
  comboLabel:      'ui_combo_label',
  pipStar:         'ui_pip_star',
  digit:           (d: number | string) => `ui_digit_${d}`,
  hudPortrait:     'ui_hud_portrait',       // hud_001  portrait frame
  hudTimer:        'ui_hud_timer',          // hud_002  timer badge
  hudSuperBar:     'ui_hud_super_bar',      // hud_003  super bar
  hudGuardBar:     'ui_hud_guard_bar',      // hud_004  guard/block bar
  hudBossBar:      'ui_hud_boss_bar',       // hud_005  boss HP bar
  hudCombo:        'ui_hud_combo',          // hud_006  "10 COMBO" graphic
  hudDanger:       'ui_hud_danger',         // hud_015  "DANGER LOW HEALTH" badge
  // Full backdrop sheets (used as scene backgrounds)
  sheetTitle:      'ui_sheet_title',
  sheetCharSelect: 'ui_sheet_charselect',
  sheetPause:      'ui_sheet_pause',
  sheetVenueMap:   'ui_sheet_venuemap',
  sheetHud:        'ui_sheet_hud',
  sheetDialogue:   'ui_sheet_dialogue',
  sheetOptions:    'ui_sheet_options',
  // Pause menu slices
  pauseTitle:      'ui_pause_title',      // pause_menu_000  578×111
  pausePanel:      'ui_pause_panel',      // pause_menu_001  607×385
  // Character-select slices
  csFrameL:        'ui_cs_frame_l',       // character_select_000  205×331 (P1 portrait frame)
  csFrameR:        'ui_cs_frame_r',       // character_select_001  204×324 (P2 portrait frame)
  csGrid:          'ui_cs_grid',          // character_select_027  474×352 (grid background)
  csLabelP1:       'ui_cs_label_p1',      // character_select_005  274×50
  csLabelP2:       'ui_cs_label_p2',      // character_select_006  276×52
  csVs:            'ui_cs_vs',            // character_select_008  268×174
  // Dialogue panel
  dialoguePanel:   'ui_dialogue_panel',   // dialogue_mission_001  413×317
} as const;

// ─── Named element load manifest ─────────────────────────────────────────────
const FILES: Array<[string, string]> = [
  [UI.logo,            'ui/hvas_logo.png'],
  [UI.shell,           'ui/hitgear_shell.png'],
  // HUD
  [UI.healthBar,       'ui/elements/hud/hud_health_bar.png'],
  [UI.comboLabel,      'ui/elements/hud/hud_combo_label.png'],
  [UI.pipStar,         'ui/elements/hud/hud_pip_star.png'],
  [UI.hudPortrait,     'ui/elements/hud/hud_001.png'],
  [UI.hudTimer,        'ui/elements/hud/hud_002.png'],
  [UI.hudSuperBar,     'ui/elements/hud/hud_003.png'],
  [UI.hudGuardBar,     'ui/elements/hud/hud_004.png'],
  [UI.hudBossBar,      'ui/elements/hud/hud_005.png'],
  [UI.hudCombo,        'ui/elements/hud/hud_006.png'],
  [UI.hudDanger,       'ui/elements/hud/hud_015.png'],
  // Full sheets
  [UI.sheetTitle,      'ui/ui_sheet_01_title_main_menu.png'],
  [UI.sheetCharSelect, 'ui/ui_sheet_04_character_select.png'],
  [UI.sheetPause,      'ui/ui_sheet_03_pause_menu.png'],
  [UI.sheetVenueMap,   'ui/ui_sheet_06_venue_map_stage_select.png'],
  [UI.sheetHud,        'ui/ui_sheet_05_hud.png'],
  [UI.sheetDialogue,   'ui/ui_sheet_07_dialogue_mission_reward.png'],
  [UI.sheetOptions,    'ui/ui_sheet_09_options_settings.png'],
  // Pause menu pieces
  [UI.pauseTitle,      'ui/elements/pause_menu/pause_menu_000.png'],
  [UI.pausePanel,      'ui/elements/pause_menu/pause_menu_001.png'],
  // Character-select pieces
  [UI.csFrameL,        'ui/elements/character_select/character_select_000.png'],
  [UI.csFrameR,        'ui/elements/character_select/character_select_001.png'],
  [UI.csGrid,          'ui/elements/character_select/character_select_027.png'],
  [UI.csLabelP1,       'ui/elements/character_select/character_select_005.png'],
  [UI.csLabelP2,       'ui/elements/character_select/character_select_006.png'],
  [UI.csVs,            'ui/elements/character_select/character_select_008.png'],
  [UI.dialoguePanel,   'ui/elements/dialogue_mission/dialogue_mission_001.png'],
];

export const UISystem = {
  queue(scene: Phaser.Scene): void {
    for (const [key, path] of FILES) {
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `${ASSET_BASE}${path}`);
      }
    }
    for (let d = 0; d <= 9; d++) {
      const key = UI.digit(d);
      if (!scene.textures.exists(key)) {
        scene.load.image(key, `${ASSET_BASE}ui/elements/hud/digit_${d}.png`);
      }
    }
  },

  ready(scene: Phaser.Scene): boolean {
    return scene.textures.exists(UI.logo);
  },

  // Place a full-sheet backdrop scaled to fit the game canvas.
  backdrop(scene: Phaser.Scene, key: string, alpha = 1, depth = -5000): Phaser.GameObjects.Image | null {
    if (!scene.textures.exists(key)) return null;
    const { width, height } = scene.scale;
    return scene.add.image(0, 0, key)
      .setOrigin(0, 0)
      .setDisplaySize(width, height)
      .setAlpha(alpha)
      .setDepth(depth)
      .setScrollFactor(0);
  },
};

// ── NumberDisplay ─────────────────────────────────────────────────────────────
// Gold-digit readout that swaps textures — zero per-frame allocations.
export class NumberDisplay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private digits: Phaser.GameObjects.Image[] = [];
  private height: number;
  private align: 'left' | 'right';
  private baseX: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    height = 22,
    align: 'left' | 'right' = 'left',
  ) {
    this.scene = scene;
    this.height = height;
    this.align = align;
    this.baseX = x;
    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(60000);
  }

  setValue(value: number): void {
    const str = String(Math.max(0, Math.round(value)));
    while (this.digits.length < str.length) {
      const img = this.scene.add.image(0, 0, UI.digit(0)).setOrigin(0, 0.5);
      this.container.add(img);
      this.digits.push(img);
    }
    let cursor = 0;
    const gap = this.height * 0.06;
    for (let i = 0; i < str.length; i++) {
      const img = this.digits[i];
      img.setTexture(UI.digit(str[i])).setVisible(true);
      const tex = this.scene.textures.get(UI.digit(str[i])).getSourceImage();
      const w = (tex.width / tex.height) * this.height;
      img.setDisplaySize(w, this.height).setPosition(cursor, 0);
      cursor += w + gap;
    }
    for (let i = str.length; i < this.digits.length; i++) {
      this.digits[i].setVisible(false);
    }
    this.container.x = this.align === 'right' ? this.baseX - cursor : this.baseX;
  }

  setDepth(d: number): this { this.container.setDepth(d); return this; }
  setVisible(v: boolean): this { this.container.setVisible(v); return this; }
}

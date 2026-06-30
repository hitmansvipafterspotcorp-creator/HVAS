import Phaser from 'phaser';
import {
  SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS,
  FLOOR_TOP, FLOOR_BOTTOM, PLAYER_SPEED, PLAYER_DEPTH_SPEED, LANE_TOLERANCE,
} from '../config';
import { Fighter } from '../entities/Fighter';
import { InputSystem } from '../systems/InputSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { VFXSystem } from '../systems/VFXSystem';
import { UISystem, UI, NumberDisplay } from '../systems/UISystem';
import { CHAR_NAMES } from '../data/roster';
import { AudioSystem } from '../systems/AudioSystem';
import { BRAWLER_ANIMS, VFX_ANIMS } from '../data/animMap';

// ── Roster ────────────────────────────────────────────────────────────────────
const ALL_CHARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 30, 31];

const DIFFICULTIES = [
  { label: 'EASY',   color: '#44dd88', aiSpeed: 0.35, aiReact: 900,  aiBravery: 0.25, aiBlock: 0.10 },
  { label: 'NORMAL', color: '#ffd700', aiSpeed: 0.55, aiReact: 600,  aiBravery: 0.50, aiBlock: 0.25 },
  { label: 'HARD',   color: '#ff8833', aiSpeed: 0.75, aiReact: 380,  aiBravery: 0.70, aiBlock: 0.45 },
  { label: 'INSANE', color: '#ff3355', aiSpeed: 1.00, aiReact: 180,  aiBravery: 0.90, aiBlock: 0.70 },
] as const;
type Difficulty = typeof DIFFICULTIES[number];

type Phase = 'p1select' | 'p2select' | 'diffselect' | 'vs' | 'fight' | 'result';

const COLS = 5;
const ROWS = Math.ceil(ALL_CHARS.length / COLS);
const CELL = 86;
const GRID_X = (GAME_WIDTH - COLS * CELL) / 2;
const GRID_Y = 148;

// ── ArcadeVsScene ─────────────────────────────────────────────────────────────
export class ArcadeVsScene extends Phaser.Scene {
  // Selection state
  private phase: Phase = 'p1select';
  private p1CharId = ALL_CHARS[0];
  private p2CharId = ALL_CHARS[1];
  private diffIdx = 1;
  private cursorIdx = 0;

  // Fight state
  private p1!: Fighter;
  private p2!: Fighter;
  private controls!: InputSystem;
  private combat!: CombatSystem;
  private vfx!: VFXSystem;
  private difficulty!: Difficulty;
  private aiTimer = 0;
  private aiBlockTimer = 0;
  private aiDodgeTimer = 0;
  private roundOver = false;
  private p1RoundWins = 0;
  private p2RoundWins = 0;
  private roundNum = 1;

  // Dodge slide for P1
  private dodgeVX = 0;
  private dodgeVY = 0;

  // HUD references
  private selGroup!: Phaser.GameObjects.Container;
  private phaseLabel!: Phaser.GameObjects.Text;
  private cursorRect!: Phaser.GameObjects.Rectangle;
  private p1PortraitSpr!: Phaser.GameObjects.Sprite;
  private p2PortraitSpr!: Phaser.GameObjects.Sprite;
  private p1NameTxt!: Phaser.GameObjects.Text;
  private p2NameTxt!: Phaser.GameObjects.Text;
  private diffButtons: Phaser.GameObjects.Text[] = [];

  // Fight HUD
  private p1HpBar!: Phaser.GameObjects.Rectangle;   // depletion mask
  private p2HpBar!: Phaser.GameObjects.Rectangle;   // depletion mask
  private p1HpInner = { x: 0, w: 0, y: 0, h: 0 };
  private p2HpInner = { x: 0, w: 0, y: 0, h: 0 };
  private p1HpNum?: NumberDisplay;
  private p2HpNum?: NumberDisplay;
  private roundPipsP1: Phaser.GameObjects.Rectangle[] = [];
  private roundPipsP2: Phaser.GameObjects.Rectangle[] = [];
  private fightBanner!: Phaser.GameObjects.Text;
  private stateLabel!: Phaser.GameObjects.Text;

  private paused = false;
  private pauseGroup?: Phaser.GameObjects.Container;

  constructor() { super(SCENE.ArcadeVs); }

  // ── create ─────────────────────────────────────────────────────────────────
  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    AudioSystem.playForScene(this, 'ArcadeVs');
    this.phase = 'p1select';
    this.p1RoundWins = 0;
    this.p2RoundWins = 0;
    this.roundNum = 1;
    this.buildSelectionScreen();
    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.phase === 'fight') { this.togglePause(); return; }
      this.scene.start(SCENE.MainMenu);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTION SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  private buildSelectionScreen(): void {
    this.selGroup?.destroy(true);
    this.roundOver = false;

    const grp = this.add.container(0, 0);
    this.selGroup = grp;

    this.cameras.main.setBackgroundColor(0x0a0614);

    const tex = (k: string) => this.textures.exists(k);
    const addImg = (key: string, x: number, y: number, w: number, h: number,
                   ox = 0.5, oy = 0, depth = 10, alpha = 1) => {
      if (!tex(key)) return null;
      return this.add.image(x, y, key).setOrigin(ox, oy)
        .setDisplaySize(w, h).setDepth(depth).setAlpha(alpha).setScrollFactor(0);
    };

    // ── Title banner (CHARACTER SELECT) ──────────────────────────────────────
    const titleBanner = addImg(UI.csTitleBanner, GAME_WIDTH / 2, 0, GAME_WIDTH, 50, 0.5, 0, 50);
    if (titleBanner) grp.add(titleBanner);

    const titleTxt = this.add.text(GAME_WIDTH / 2, 25, 'ARCADE VS · CHARACTER SELECT', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(51);
    grp.add(titleTxt);

    this.phaseLabel = this.add.text(GAME_WIDTH / 2, 55, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ccbbdd',
    }).setOrigin(0.5).setDepth(51);
    grp.add(this.phaseLabel);

    // ── LEFT PANEL — P1 portrait ──────────────────────────────────────────────
    const LPORT_X = 88;
    const LPORT_Y = 66;
    const LPORT_W = 148;
    const LPORT_H = 196;

    const portFrameKey = tex(UI.csxPortraitGold) ? UI.csxPortraitGold : UI.csPortraitFrameLarge;
    const lFrame = addImg(portFrameKey, LPORT_X, LPORT_Y, LPORT_W, LPORT_H, 0.5, 0, 15);
    if (lFrame) grp.add(lFrame);

    this.p1PortraitSpr = this.add.sprite(LPORT_X, LPORT_Y + LPORT_H - 8, '__DEFAULT')
      .setOrigin(0.5, 1).setScale((LPORT_W - 20) / 181).setDepth(16);
    grp.add(this.p1PortraitSpr);

    grp.add(this.add.text(LPORT_X, LPORT_Y - 2, '★ PLAYER 1 ★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#44aaff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(17));

    this.p1NameTxt = this.add.text(LPORT_X, LPORT_Y + LPORT_H + 4, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ffd700',
    }).setOrigin(0.5, 0).setDepth(17);
    grp.add(this.p1NameTxt);

    const lStatKey = tex(UI.csxStatPanel) ? UI.csxStatPanel : UI.csStatPanel;
    const lStat = addImg(lStatKey, LPORT_X, LPORT_Y + LPORT_H + 16, LPORT_W, 80, 0.5, 0, 15);
    if (lStat) grp.add(lStat);

    // ── RIGHT PANEL — CPU portrait ────────────────────────────────────────────
    const RPORT_X = GAME_WIDTH - 88;
    const RPORT_Y = 66;

    const rFrame = addImg(portFrameKey, RPORT_X, RPORT_Y, LPORT_W, LPORT_H, 0.5, 0, 15);
    if (rFrame) grp.add(rFrame);

    this.p2PortraitSpr = this.add.sprite(RPORT_X, RPORT_Y + LPORT_H - 8, '__DEFAULT')
      .setOrigin(0.5, 1).setScale((LPORT_W - 20) / 181).setDepth(16).setFlipX(true);
    grp.add(this.p2PortraitSpr);

    grp.add(this.add.text(RPORT_X, RPORT_Y - 2, '★ CPU ★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ff6644',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(17));

    this.p2NameTxt = this.add.text(RPORT_X, RPORT_Y + LPORT_H + 4, '', {
      fontFamily: 'monospace', fontSize: '9px', color: '#ff9977',
    }).setOrigin(0.5, 0).setDepth(17);
    grp.add(this.p2NameTxt);

    const rStat = addImg(lStatKey, RPORT_X, RPORT_Y + LPORT_H + 16, LPORT_W, 80, 0.5, 0, 15);
    if (rStat) grp.add(rStat);

    // ── CENTER CHARACTER GRID ─────────────────────────────────────────────────
    if (tex(UI.csGrid)) {
      const gw = COLS * CELL + 12;
      const gh = ROWS * CELL + 12;
      const gridBg = this.add.image(GRID_X - 6, GRID_Y - 6, UI.csGrid)
        .setOrigin(0, 0).setDisplaySize(gw, gh).setAlpha(0.5).setDepth(8);
      grp.add(gridBg);
    }

    for (let i = 0; i < ALL_CHARS.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = GRID_X + col * CELL + CELL / 2;
      const cy = GRID_Y + row * CELL + CELL / 2;
      const charId = ALL_CHARS[i];

      let cellObj: Phaser.GameObjects.GameObject;
      if (tex(UI.csSlotIdle)) {
        cellObj = this.add.image(cx, cy, UI.csSlotIdle).setDisplaySize(CELL - 4, CELL - 4).setDepth(9);
      } else {
        cellObj = this.add.rectangle(cx, cy, CELL - 4, CELL - 4, 0x110820).setStrokeStyle(1, 0x3a2a5a).setDepth(9);
      }
      grp.add(cellObj);

      const idleKey = AnimationSystem.animKey(charId, 'idle');
      if (this.anims.exists(idleKey)) {
        const spr = this.add.sprite(cx, cy + CELL * 0.4, '__DEFAULT')
          .setOrigin(0.5, 1).setScale((CELL - 16) / 181).setDepth(11);
        spr.play(idleKey);
        grp.add(spr as Phaser.GameObjects.GameObject);
      } else {
        grp.add(this.add.rectangle(cx, cy, 26, 44, charId === 1 ? COLORS.player : COLORS.enemy).setDepth(11));
      }

      grp.add(this.add.text(cx, cy + CELL / 2 - 7,
        (CHAR_NAMES[charId] ?? `#${charId}`).split(' ').slice(-1)[0], {
          fontFamily: 'monospace', fontSize: '7px', color: '#ccbbee',
        }).setOrigin(0.5, 1).setDepth(12));
    }

    // Cursor highlight
    this.cursorRect = this.add.rectangle(0, 0, CELL - 2, CELL - 2, 0xffd700, 0)
      .setStrokeStyle(3, 0xffd700).setDepth(13);
    grp.add(this.cursorRect);

    // ── DIFFICULTY BUTTONS (shown during diffselect phase) ────────────────────
    const diffY = GRID_Y + ROWS * CELL + 14;
    this.diffButtons = [];
    for (let d = 0; d < DIFFICULTIES.length; d++) {
      const btn = this.add.text(
        GAME_WIDTH / 2 + (d - 1.5) * 108, diffY,
        DIFFICULTIES[d].label,
        { fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: DIFFICULTIES[d].color,
          stroke: '#000000', strokeThickness: 3 },
      ).setOrigin(0.5).setAlpha(0.3).setVisible(false).setDepth(51);
      grp.add(btn);
      this.diffButtons.push(btn);
    }

    // ── BOTTOM — instruction strip / action buttons ───────────────────────────
    const instrKey = tex(UI.csInstructionStrip) ? UI.csInstructionStrip : null;
    if (instrKey) {
      const strip = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 2, instrKey)
        .setOrigin(0.5, 1).setDisplaySize(GAME_WIDTH, 30).setDepth(30);
      grp.add(strip);
    } else {
      grp.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 8,
        'WASD/Arrows navigate  ·  Space/Enter confirm  ·  ESC back', {
          fontFamily: 'monospace', fontSize: '11px', color: '#554466',
        }).setOrigin(0.5, 1).setDepth(30));
    }

    if (tex(UI.csActionBtns)) {
      const actBtns = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT - 34, UI.csActionBtns)
        .setOrigin(0.5, 1).setDisplaySize(280, 28).setDepth(29);
      grp.add(actBtns);
    }

    // Keyboard navigation
    const kb = this.input.keyboard!;
    ['LEFT','RIGHT','UP','DOWN','A','D','W','S','SPACE','ENTER'].forEach(k =>
      kb.removeAllListeners(`keydown-${k}`));

    kb.on('keydown-LEFT',  () => this.moveCursor(-1, 0));
    kb.on('keydown-RIGHT', () => this.moveCursor(1, 0));
    kb.on('keydown-UP',    () => this.moveCursor(0, -1));
    kb.on('keydown-DOWN',  () => this.moveCursor(0, 1));
    kb.on('keydown-A',     () => this.moveCursor(-1, 0));
    kb.on('keydown-D',     () => this.moveCursor(1, 0));
    kb.on('keydown-W',     () => this.moveCursor(0, -1));
    kb.on('keydown-S',     () => this.moveCursor(0, 1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());

    this.refreshSelectionUI();
  }

  private moveCursor(dx: number, dy: number): void {
    if (this.phase === 'diffselect') {
      this.diffIdx = Phaser.Math.Clamp(this.diffIdx + dx, 0, DIFFICULTIES.length - 1);
      this.refreshSelectionUI();
      return;
    }
    const col = this.cursorIdx % COLS;
    const row = Math.floor(this.cursorIdx / COLS);
    const nc = Phaser.Math.Clamp(col + dx, 0, COLS - 1);
    const nr = Phaser.Math.Clamp(row + dy, 0, ROWS - 1);
    const ni = nr * COLS + nc;
    if (ni < ALL_CHARS.length) this.cursorIdx = ni;
    this.refreshSelectionUI();
  }

  private confirm(): void {
    if (this.phase === 'p1select') {
      this.p1CharId = ALL_CHARS[this.cursorIdx];
      this.phase = 'p2select';
      this.cursorIdx = (this.cursorIdx + 1) % ALL_CHARS.length;
      this.refreshSelectionUI();
    } else if (this.phase === 'p2select') {
      this.p2CharId = ALL_CHARS[this.cursorIdx];
      this.phase = 'diffselect';
      this.refreshSelectionUI();
    } else if (this.phase === 'diffselect') {
      this.difficulty = DIFFICULTIES[this.diffIdx];
      this.showVsScreen();
    }
  }

  private refreshSelectionUI(): void {
    const phaseText: Record<Phase, string> = {
      p1select: '— PLAYER 1: CHOOSE YOUR FIGHTER —',
      p2select: '— CPU: CHOOSE YOUR FIGHTER —',
      diffselect: '— SELECT DIFFICULTY —',
      vs: '', fight: '', result: '',
    };
    this.phaseLabel.setText(phaseText[this.phase]);

    const col = this.cursorIdx % COLS;
    const row = Math.floor(this.cursorIdx / COLS);
    this.cursorRect.setPosition(
      GRID_X + col * CELL + CELL / 2,
      GRID_Y + row * CELL + CELL / 2,
    );

    const p1Key = AnimationSystem.animKey(this.p1CharId, 'idle');
    if (this.anims.exists(p1Key)) this.p1PortraitSpr.play(p1Key, true);
    this.p1NameTxt.setText(CHAR_NAMES[this.p1CharId] ?? `#${this.p1CharId}`);

    if (this.phase !== 'p1select') {
      const p2Key = AnimationSystem.animKey(this.p2CharId, 'idle');
      if (this.anims.exists(p2Key)) this.p2PortraitSpr.play(p2Key, true);
      this.p2NameTxt.setText(CHAR_NAMES[this.p2CharId] ?? `#${this.p2CharId}`);
    }

    const showDiff = this.phase === 'diffselect';
    for (let d = 0; d < this.diffButtons.length; d++) {
      this.diffButtons[d].setVisible(showDiff).setAlpha(d === this.diffIdx ? 1 : 0.3);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VS INTRO SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  private showVsScreen(): void {
    this.phase = 'vs';
    this.selGroup.destroy(true);
    ['LEFT','RIGHT','UP','DOWN','SPACE','ENTER','A','D','W','S'].forEach(k =>
      this.input.keyboard!.removeAllListeners(`keydown-${k}`));

    this.cameras.main.setBackgroundColor(0x050210);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const tex = (k: string) => this.textures.exists(k);

    const p1Name = CHAR_NAMES[this.p1CharId] ?? `Fighter ${this.p1CharId}`;
    const p2Name = CHAR_NAMES[this.p2CharId] ?? `Fighter ${this.p2CharId}`;

    // ── 1. STAGE BANNER ──────────────────────────────────────────────────────
    // vs_stage_banners.png is an almost-empty 32x32 export fragment — skip it.
    this.add.rectangle(0, 0, cx, GAME_HEIGHT, 0x001a3a).setOrigin(0, 0).setDepth(0);
    this.add.rectangle(cx, 0, cx, GAME_HEIGHT, 0x3a0011).setOrigin(0, 0).setDepth(0);

    // Diagonal center slash
    const gfx = this.add.graphics().setDepth(1);
    gfx.fillStyle(0xffd700, 0.08);
    gfx.fillTriangle(cx - 20, 0, cx + 20, 0, cx - 20, GAME_HEIGHT);
    gfx.fillTriangle(cx + 20, 0, cx - 20, GAME_HEIGHT, cx + 20, GAME_HEIGHT);

    // ── 2. TOP TITLE BANNER ──────────────────────────────────────────────────
    // vs_title_logo is 442x225 (~2:1) — keep aspect at 200x100 so it sits
    // cleanly above the portraits instead of being width-stretched and clipped.
    if (tex(UI.vsTitleLogo)) {
      this.add.image(cx, 2, UI.vsTitleLogo)
        .setOrigin(0.5, 0).setDisplaySize(200, 100).setDepth(20);
    } else {
      this.add.text(cx, 18, 'HITMANS VIP QUEST', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(20);
    }

    // Round indicators (top center, below title)
    if (tex(UI.vsRoundIndicators)) {
      this.add.image(cx, 56, UI.vsRoundIndicators)
        .setOrigin(0.5, 0).setDisplaySize(200, 24).setDepth(20);
    }

    // ── 3. PORTRAIT FRAMES (left / right) ────────────────────────────────────
    const portW = 296;
    const portH = 360;
    const portY  = 82;
    const p1X   = cx / 2;   // ~240
    const p2X   = cx + cx / 2; // ~720

    // vs_portrait_large_l/r exports include "PORTRAIT FRAMES — LARGE" guide
    // annotation text at the top edge — bypass with clean rectangles.
    this.add.rectangle(p1X, portY, portW, portH, 0x0a0330, 0.96).setOrigin(0.5, 0)
      .setStrokeStyle(3, 0x5522aa).setDepth(5);
    this.add.rectangle(p2X, portY, portW, portH, 0x1a0010, 0.96).setOrigin(0.5, 0)
      .setStrokeStyle(3, 0xaa2255).setDepth(5);

    // ── 4. CHARACTER SPRITES ──────────────────────────────────────────────────
    const sprScale = 200 / 181;
    const p1Key = AnimationSystem.animKey(this.p1CharId, 'idle');
    if (this.anims.exists(p1Key)) {
      this.add.sprite(p1X, portY + portH - 8, '__DEFAULT')
        .setOrigin(0.5, 1).setScale(sprScale).play(p1Key).setDepth(6);
    }
    const p2Key = AnimationSystem.animKey(this.p2CharId, 'idle');
    if (this.anims.exists(p2Key)) {
      this.add.sprite(p2X, portY + portH - 8, '__DEFAULT')
        .setOrigin(0.5, 1).setScale(sprScale).setFlipX(true).play(p2Key).setDepth(6);
    }

    // ── 5. PLAYER NAMEPLATES ──────────────────────────────────────────────────
    // vs_nameplate_p1/p2 exports are blank — draw the plates ourselves.
    const nameY = portY + portH + 4;
    const drawPlate = (x: number, color: number) => {
      this.add.rectangle(x, nameY, portW, 36, 0x0a0220, 0.92).setOrigin(0.5, 0)
        .setStrokeStyle(2, color).setDepth(15);
    };
    drawPlate(p1X, 0x44aaff);
    this.add.text(p1X, nameY + 18, `★ ${p1Name.toUpperCase()} ★`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(16);

    drawPlate(p2X, 0xff6644);
    this.add.text(p2X, nameY + 18, `★ ${p2Name.toUpperCase()} ★`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(16);

    // ── 6/7/8. LEVEL / RANK / WIN / READY ─────────────────────────────────────
    // vs_level_chips / vs_rank_badges / vs_win_dots / vs_ready_markers /
    // vs_match_rules are all guide-export crops that include "RANK BADGES",
    // "MATCH RULES PANEL" header text from the design guide. Skip them all
    // and render clean replacements.
    const chipY = nameY + 40;
    [p1X, p2X].forEach((x, idx) => {
      this.add.text(x, chipY + 4, `LV ${20 + idx * 3}   ★★★★`, {
        fontFamily: 'monospace', fontSize: '10px', color: '#ffd700',
      }).setOrigin(0.5).setDepth(16);
      this.add.text(x, chipY + 22, '● ● ○ ○ ○', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff8866',
      }).setOrigin(0.5).setDepth(16);
      this.add.text(x, chipY + 42, 'READY', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#44dd88',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(16);
    });

    // ── 9. CENTER VS EMBLEM ──────────────────────────────────────────────────
    // The exported vs_emblem.png is a cropped section of the design guide that
    // includes a stray VIP shield; rendering it shows a giant "VIP" badge over
    // the center. Always use clean rendered "VS" text instead.
    {
      const vs = this.add.text(cx, cy - 20, 'VS', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '88px', color: '#ffd700',
        stroke: '#000000', strokeThickness: 12,
      }).setOrigin(0.5).setScale(3).setAlpha(0).setDepth(22);
      this.tweens.add({ targets: vs, scale: 1, alpha: 1, duration: 350, delay: 80, ease: 'Back.out' });
    }

    // ── 10. MATCH RULES + ROUND LABEL ────────────────────────────────────────
    const rulesY = GAME_HEIGHT - 60;
    this.add.rectangle(cx, rulesY, 320, 44, 0x0a0220, 0.92)
      .setOrigin(0.5, 0).setStrokeStyle(2, 0xffd700, 0.7).setDepth(18);
    this.add.text(cx, rulesY + 8, 'BEST OF 3  ·  NO CONTINUES', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffd700',
    }).setOrigin(0.5, 0).setDepth(20);
    const roundLabel = this.add.text(cx, rulesY + 26,
      `ROUND ${this.roundNum}  ·  ${this.difficulty.label}`, {
        fontFamily: 'monospace', fontSize: '12px', color: this.difficulty.color,
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setAlpha(0).setDepth(20);
    this.tweens.add({ targets: roundLabel, alpha: 1, duration: 300, delay: 180 });

    // ── 11. BUTTON PROMPTS (bottom strip) ────────────────────────────────────
    this.add.text(cx, GAME_HEIGHT - 6, '[Z] ATTACK   [SHIFT] BLOCK   [SHIFT+DIR] DODGE   [ESC] PAUSE', {
      fontFamily: 'monospace', fontSize: '10px', color: '#aa99cc',
    }).setOrigin(0.5, 1).setDepth(20);

    // ── COUNTDOWN ────────────────────────────────────────────────────────────
    // Countdown 3, 2, 1, FIGHT!
    let count = 3;
    const countTxt = this.add.text(cx, cy + 80, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '54px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5);

    const tick = () => {
      if (count > 0) {
        countTxt.setText(String(count)).setAlpha(1).setScale(1.4);
        this.tweens.add({
          targets: countTxt, scale: 1, alpha: 0.3, duration: 850, ease: 'Quad.out',
        });
        count--;
        this.time.delayedCall(900, tick);
      } else {
        countTxt.setText('FIGHT!').setAlpha(1).setScale(1).setStyle({ color: '#ffd700' });
        this.tweens.add({
          targets: countTxt, scale: 1.5, alpha: 0, duration: 600, ease: 'Quad.out',
          onComplete: () => {
            // Lazy-load BOTH fighters' anims before entering the fight so the
            // CPU side doesn't render as a red placeholder rectangle.
            AnimationSystem.loadOnDemand(this,
              [this.p1CharId, this.p2CharId],
              [...BRAWLER_ANIMS, ...VFX_ANIMS],
            ).then(() => {
              for (const id of [this.p1CharId, this.p2CharId]) {
                AnimationSystem.build(this, id, BRAWLER_ANIMS);
                AnimationSystem.build(this, id, VFX_ANIMS);
              }
              this.startFight();
            }).catch(() => this.startFight());
          },
        });
      }
    };
    this.time.delayedCall(600, tick);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIGHT
  // ─────────────────────────────────────────────────────────────────────────
  private startFight(): void {
    this.phase = 'fight';
    this.children.list.slice().forEach(c => c.destroy());

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.roundOver = false;
    this.dodgeVX = 0;
    this.dodgeVY = 0;

    // Floor
    const g = this.add.graphics().setDepth(-1999);
    g.fillStyle(COLORS.floor, 0.55);
    g.fillRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);
    g.lineStyle(2, COLORS.floorLine, 0.6);
    g.strokeRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);

    // Fighters
    this.p1 = new Fighter(this, 'player', 220, FLOOR_BOTTOM - 20, 120, this.p1CharId);
    this.p2 = new Fighter(this, 'enemy', GAME_WIDTH - 220, FLOOR_BOTTOM - 20, 120, this.p2CharId);
    this.p2.facing = -1;

    // Systems
    this.controls = new InputSystem(this);
    this.combat = new CombatSystem(this);
    this.vfx = new VFXSystem(this);
    this.aiTimer = 0;
    this.aiBlockTimer = 0;
    this.aiDodgeTimer = 0;

    // Build HUD
    this.buildFightHUD();

    // ESC = pause — remove any prior listener before adding to prevent accumulation
    this.input.keyboard!.off('keydown-ESC');
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());

    this.flashBanner(`ROUND ${this.roundNum}`);
    this.vfx.screenShake(200, 0.005);
  }

  private buildFightHUD(): void {
    const HUD_Y = 12;
    const BAR_W = 300;

    const useArt = UISystem.ready(this) && this.textures.exists(UI.healthBar);

    if (useArt) {
      const tex = this.textures.get(UI.healthBar).getSourceImage() as HTMLImageElement;
      const frameH = (tex.height / tex.width) * BAR_W;
      const innerW = BAR_W * (0.86 - 0.165);
      const innerH = frameH * 0.42;
      const cy = HUD_Y + frameH * 0.5;

      // ── P1 HP bar (left) ──
      const p1InnerX = 14 + BAR_W * 0.165;
      this.p1HpInner = { x: p1InnerX, w: innerW, y: cy, h: innerH };
      // Fill (full) behind depletion mask
      this.add.rectangle(p1InnerX, cy, innerW, innerH, 0xcc2233, 0.9)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50000);
      // Depletion mask (dark, grows from right)
      this.p1HpBar = this.add.rectangle(p1InnerX + innerW, cy, 0, innerH, 0x0a0008, 0.95)
        .setOrigin(1, 0.5).setScrollFactor(0).setDepth(50001);
      // Art frame overlay
      this.add.image(14 + BAR_W / 2, HUD_Y + frameH / 2, UI.healthBar)
        .setDisplaySize(BAR_W, frameH).setScrollFactor(0).setDepth(50002);

      // ── P2 HP bar (right, horizontally flipped) ──
      const p2RightX = GAME_WIDTH - 14;
      const p2LeftEdge = p2RightX - BAR_W * 0.86;
      this.p2HpInner = { x: p2LeftEdge, w: innerW, y: cy, h: innerH };
      this.add.rectangle(p2LeftEdge, cy, innerW, innerH, 0x2244cc, 0.9)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50000);
      this.p2HpBar = this.add.rectangle(p2LeftEdge, cy, 0, innerH, 0x0a0008, 0.95)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50001);
      this.add.image(p2RightX - BAR_W / 2, HUD_Y + frameH / 2, UI.healthBar)
        .setDisplaySize(BAR_W, frameH).setFlipX(true).setScrollFactor(0).setDepth(50002);

      // Names
      this.add.text(16, HUD_Y + frameH + 2, (CHAR_NAMES[this.p1CharId] ?? 'P1').toUpperCase(), {
        fontFamily: 'monospace', fontSize: '11px', color: '#44aaff',
      }).setScrollFactor(0).setDepth(50003);
      this.add.text(GAME_WIDTH - 16, HUD_Y + frameH + 2, (CHAR_NAMES[this.p2CharId] ?? 'CPU').toUpperCase(), {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff6644',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(50003);

      // Digit HP readouts
      if (this.textures.exists(UI.digit(0))) {
        this.p1HpNum = new NumberDisplay(this, 20, HUD_Y + frameH + 18, 16).setDepth(50004);
        this.p2HpNum = new NumberDisplay(this, GAME_WIDTH - 20, HUD_Y + frameH + 18, 16, 'right').setDepth(50004);
      }
    } else {
      // Fallback plain rectangles
      const BAR_H = 22;
      this.add.rectangle(14, HUD_Y, BAR_W, BAR_H, 0x110008)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(50000);
      this.p1HpBar = this.add.rectangle(14 + BAR_W, HUD_Y + BAR_H / 2, 0, BAR_H, 0x0a0008)
        .setOrigin(1, 0.5).setScrollFactor(0).setDepth(50001);
      this.add.rectangle(14, HUD_Y, BAR_W, BAR_H, 0)
        .setStrokeStyle(2, 0xffd700, 0.6).setOrigin(0, 0).setScrollFactor(0).setDepth(50002);
      this.p1HpInner = { x: 14, w: BAR_W, y: HUD_Y + BAR_H / 2, h: BAR_H };

      this.add.rectangle(GAME_WIDTH - 14, HUD_Y, BAR_W, BAR_H, 0x110008)
        .setOrigin(1, 0).setScrollFactor(0).setDepth(50000);
      this.p2HpBar = this.add.rectangle(GAME_WIDTH - 14 - BAR_W, HUD_Y + BAR_H / 2, 0, BAR_H, 0x0a0008)
        .setOrigin(0, 0.5).setScrollFactor(0).setDepth(50001);
      this.add.rectangle(GAME_WIDTH - 14, HUD_Y, BAR_W, BAR_H, 0)
        .setStrokeStyle(2, 0xffd700, 0.6).setOrigin(1, 0).setScrollFactor(0).setDepth(50002);
      this.p2HpInner = { x: GAME_WIDTH - 14 - BAR_W, w: BAR_W, y: HUD_Y + BAR_H / 2, h: BAR_H };

      this.add.text(16, HUD_Y + BAR_H + 2, (CHAR_NAMES[this.p1CharId] ?? 'P1').toUpperCase(), {
        fontFamily: 'monospace', fontSize: '11px', color: '#44aaff',
      }).setScrollFactor(0).setDepth(50003);
      this.add.text(GAME_WIDTH - 16, HUD_Y + BAR_H + 2, (CHAR_NAMES[this.p2CharId] ?? 'CPU').toUpperCase(), {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff6644',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(50003);

      if (this.textures.exists(UI.digit(0))) {
        this.p1HpNum = new NumberDisplay(this, 20, HUD_Y + BAR_H + 18, 16).setDepth(50004);
        this.p2HpNum = new NumberDisplay(this, GAME_WIDTH - 20, HUD_Y + BAR_H + 18, 16, 'right').setDepth(50004);
      }
    }

    // Round label center
    this.add.text(GAME_WIDTH / 2, HUD_Y + 2,
      `ROUND ${this.roundNum}  [${this.difficulty.label}]`, {
        fontFamily: 'monospace', fontSize: '12px', color: this.difficulty.color,
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(50003);

    // Round win pips (3 pips per side) — use vsWinDots strip art if available
    this.roundPipsP1 = [];
    this.roundPipsP2 = [];
    if (this.textures.exists(UI.vsWinDots)) {
      // vsWinDots strip: place 3 copies (inactive alpha 0.3, active 1.0)
      for (let i = 0; i < 3; i++) {
        const p1img = this.add.image(20 + i * 18, HUD_Y + 58, UI.vsWinDots)
          .setDisplaySize(14, 14).setScrollFactor(0).setDepth(50003).setAlpha(0.25);
        const p2img = this.add.image(GAME_WIDTH - 20 - i * 18, HUD_Y + 58, UI.vsWinDots)
          .setDisplaySize(14, 14).setScrollFactor(0).setDepth(50003).setAlpha(0.25);
        // Store as rects (type mismatch OK — we only use setFillStyle in refreshRoundPips)
        this.roundPipsP1.push(p1img as unknown as Phaser.GameObjects.Rectangle);
        this.roundPipsP2.push(p2img as unknown as Phaser.GameObjects.Rectangle);
      }
    } else {
      for (let i = 0; i < 3; i++) {
        const p1pip = this.add.rectangle(20 + i * 14, HUD_Y + 56, 10, 10, 0x333333)
          .setStrokeStyle(1, 0x666666).setScrollFactor(0).setDepth(50003);
        const p2pip = this.add.rectangle(GAME_WIDTH - 20 - i * 14, HUD_Y + 56, 10, 10, 0x333333)
          .setStrokeStyle(1, 0x666666).setScrollFactor(0).setDepth(50003);
        this.roundPipsP1.push(p1pip);
        this.roundPipsP2.push(p2pip);
      }
    }
    this.refreshRoundPips();

    // Banners
    this.fightBanner = this.add.text(GAME_WIDTH / 2, 90, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '38px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50010).setVisible(false);


    // State label (block/dodge indicator)
    this.stateLabel = this.add.text(220, FLOOR_TOP - 18, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#44ffdd',
    }).setOrigin(0.5).setDepth(50010);

    // Controls hint
    this.add.text(GAME_WIDTH - 10, 4,
      'J attack  K super  SHIFT block  SHIFT+dir dodge  SHIFT+J grab  double-tap run  ESC pause', {
        fontFamily: 'monospace', fontSize: '9px', color: '#443355',
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(50003);
  }

  private refreshRoundPips(): void {
    const useImgPips = this.textures.exists(UI.vsWinDots);
    for (let i = 0; i < 3; i++) {
      const p1 = this.roundPipsP1[i];
      const p2 = this.roundPipsP2[i];
      if (useImgPips) {
        // Image-based pips: use alpha to show earned vs not
        (p1 as unknown as Phaser.GameObjects.Image).setAlpha(i < this.p1RoundWins ? 1.0 : 0.25);
        (p2 as unknown as Phaser.GameObjects.Image).setAlpha(i < this.p2RoundWins ? 1.0 : 0.25);
      } else {
        p1?.setFillStyle(i < this.p1RoundWins ? 0x44aaff : 0x222233);
        p2?.setFillStyle(i < this.p2RoundWins ? 0xff6644 : 0x221111);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────
  override update(_t: number, delta: number): void {
    if (this.phase !== 'fight' || !this.p1 || !this.p2 || this.paused) return;
    if (!this.combat.tick(delta)) return;
    if (this.roundOver) return;

    this.updateP1(delta);
    this.updateCpuP2(delta);

    this.p1.syncView();
    this.p2.syncView();
    this.combat.decayCombo(this.p1, delta);
    this.combat.decayCombo(this.p2, delta);

    // Dodge ghost trail
    if (this.p1.state === 'dodge' && this.p1.sprite) {
      this.vfx.dodgeGhost(this.p1.sprite, delta);
    }

    this.drawFightHUD();
    this.checkRoundEnd();

    // State label
    const stMap: Partial<Record<string, string>> = {
      block: '🛡 BLOCKING', dodge: '⚡ DODGE', run: '💨 RUN',
    };
    this.stateLabel?.setText(stMap[this.p1.state] ?? '').setX(this.p1.x);
  }

  // ── P1 (player-controlled) ─────────────────────────────────────────────
  private updateP1(delta: number): void {
    const p = this.p1;
    const b = this.controls.read();
    const dt = delta / 1000;

    if (p.invuln > 0) p.invuln -= delta;

    // Locked: dodge slide
    if (p.state === 'dodge') {
      p.stateTimer -= delta;
      p.x     += this.dodgeVX * PLAYER_SPEED * 2.8 * dt;
      p.feetY += this.dodgeVY * PLAYER_DEPTH_SPEED * 2.8 * dt;
      this.clamp(p);
      if (p.stateTimer <= 0) { p.state = 'idle'; p.invuln = 0; }
      return;
    }

    // Locked: attack / hit
    if (p.state === 'attack' || p.state === 'hit') {
      p.stateTimer -= delta;
      if (p.state === 'attack') {
        p.attackActive = p.stateTimer > 120 && p.stateTimer < 240;
        if (p.attackActive) {
          const opts = { damage: 9, knockback: 18, meterGain: 8 };
          const hit = this.combat.resolve(p, [this.p2], opts);
          if (hit) {
            AudioSystem.sfx(this, 'hit');
            this.vfx.hitSpark(this.p2.x, this.p2.feetY - 60, p.facing);
            this.vfx.charVfx(this.p1CharId, this.p2.state === 'block' ? 'vfx_block' : 'vfx_hit', this.p2.x, this.p2.feetY - 60);
            p.attackActive = false;
          }
        }
      }
      if (p.stateTimer <= 0) { p.state = 'idle'; p.attackActive = false; }
      this.clamp(p);
      return;
    }

    // Super
    if (b.superMove && this.combat.trySuper(p, [this.p2])) {
      AudioSystem.sfx(this, 'superhit');
      p.playOneShot('super1');
      this.flashBanner('SUPER!');
      this.vfx.screenFlash(0xffffff, 0.7, 280);
      this.vfx.charVfx(this.p1CharId, 'vfx_super', this.p2.x, this.p2.feetY - 60, 2.0);
      return;
    }

    // Grab = block + attack
    if (b.block && b.attack) {
      this.tryGrab(p, this.p2);
      return;
    }

    // Dodge = block + direction just-pressed
    if (b.dodge) {
      p.state = 'dodge';
      p.stateTimer = 220;
      p.invuln = 260;
      this.dodgeVX = b.dodgeX;
      this.dodgeVY = b.dodgeY;
      if (b.dodgeX !== 0) p.facing = b.dodgeX > 0 ? 1 : -1;
      this.vfx.charVfx(this.p1CharId, 'vfx_dodge', p.x, p.feetY - 50, 1.2);
      return;
    }

    // Block
    if (b.block) {
      p.state = 'block';
      this.clamp(p);
      return;
    }

    // Attack
    if (b.attack) {
      p.attackIndex = (p.attackIndex + 1) % 3;
      p.state = 'attack';
      p.stateTimer = 300;
      p.attackActive = false;
      return;
    }

    // Movement
    let vx = 0, vy = 0;
    if (b.left) vx -= 1;
    if (b.right) vx += 1;
    if (b.up) vy -= 1;
    if (b.down) vy += 1;
    if (vx !== 0) p.facing = vx > 0 ? 1 : -1;

    const isMoving = vx !== 0 || vy !== 0;
    const spd = b.running ? 1.85 : 1.0;
    p.x     += vx * PLAYER_SPEED       * spd * dt;
    p.feetY += vy * PLAYER_DEPTH_SPEED * spd * dt;

    p.state = !isMoving ? 'idle' : b.running ? 'run' : 'walk';
    this.clamp(p);
  }

  // ── CPU P2 ─────────────────────────────────────────────────────────────
  private updateCpuP2(delta: number): void {
    const cpu = this.p2;
    const target = this.p1;
    const diff = this.difficulty;
    const dt = delta / 1000;

    if (cpu.invuln > 0) cpu.invuln -= delta;

    // Locked states
    if (cpu.state === 'attack' || cpu.state === 'hit' || cpu.state === 'dodge') {
      cpu.stateTimer -= delta;
      if (cpu.state === 'attack') {
        cpu.attackActive = cpu.stateTimer > 120 && cpu.stateTimer < 240;
        if (cpu.attackActive) {
          const hit = this.combat.resolve(cpu, [target], { damage: 9, knockback: 18, meterGain: 8 });
          if (hit) {
            AudioSystem.sfx(this, 'hit');
            this.vfx.hitSpark(target.x, target.feetY - 60, cpu.facing);
            this.vfx.charVfx(this.p2CharId, target.state === 'block' ? 'vfx_block' : 'vfx_hit', target.x, target.feetY - 60);
            cpu.attackActive = false;
          }
        }
      }
      if (cpu.stateTimer <= 0) { cpu.state = 'idle'; cpu.attackActive = false; }
      this.clamp(cpu);
      return;
    }

    // While blocking, tick down a timer
    this.aiBlockTimer -= delta;
    if (cpu.state === 'block') {
      if (this.aiBlockTimer <= 0) cpu.state = 'idle';
      this.clamp(cpu);
      return;
    }

    // AI decision (throttled by reaction time)
    this.aiTimer -= delta;
    if (this.aiTimer > 0) { this.clamp(cpu); return; }
    this.aiTimer = diff.aiReact + Math.random() * 200;

    const dx = target.x - cpu.x;
    const dy = target.feetY - cpu.feetY;
    const dist = Math.abs(dx);
    cpu.facing = dx < 0 ? -1 : 1;

    const attackRange = 80;
    const inRange = dist < attackRange && Math.abs(dy) < LANE_TOLERANCE + 10;

    // Dodge away when hurt and low HP
    this.aiDodgeTimer -= this.aiTimer;
    if (cpu.hp < cpu.maxHp * 0.3 && Math.random() < 0.25 && this.aiDodgeTimer <= 0) {
      cpu.state = 'dodge';
      cpu.stateTimer = 200;
      cpu.invuln = 240;
      this.aiDodgeTimer = 1500;
      return;
    }

    if (inRange) {
      // Block if player is attacking
      if (target.state === 'attack' && Math.random() < diff.aiBlock) {
        cpu.state = 'block';
        this.aiBlockTimer = 350 + Math.random() * 200;
        return;
      }
      // Super if meter full
      if (cpu.meter >= 100 && Math.random() < 0.4) {
        const hit = this.combat.trySuper(cpu, [target]);
        if (hit) {
          cpu.playOneShot('super1');
          AudioSystem.sfx(this, 'superhit');
          return;
        }
      }
      // Attack
      if (Math.random() < diff.aiBravery) {
        cpu.attackIndex = (cpu.attackIndex + 1) % 3;
        cpu.state = 'attack';
        cpu.stateTimer = 300;
        cpu.attackActive = false;
        return;
      }
    }

    // Move toward target
    const spd = PLAYER_SPEED * diff.aiSpeed;
    if (dist > attackRange * 0.5) cpu.x += Math.sign(dx) * spd * dt;
    if (Math.abs(dy) > 10) cpu.feetY += Math.sign(dy) * PLAYER_DEPTH_SPEED * diff.aiSpeed * dt;
    cpu.state = 'walk';
    this.clamp(cpu);
  }

  private tryGrab(attacker: Fighter, target: Fighter): void {
    if (Math.abs(target.x - attacker.x) > 80 || Math.abs(target.feetY - attacker.feetY) > 30) return;
    const dmg = 22;
    target.hp = Math.max(0, target.hp - dmg);
    target.state = 'knockdown';
    target.stateTimer = 600;
    attacker.meter = Math.min(100, attacker.meter + 18);
    attacker.combo = (attacker.combo ?? 0) + 1;
    AudioSystem.sfx(this, 'hit');
    this.combat.triggerHitStop(80);
    this.vfx.hitSpark(target.x, target.feetY - 50, attacker.facing);
    const grabberCharId = attacker === this.p1 ? this.p1CharId : this.p2CharId;
    this.vfx.charVfx(grabberCharId, 'vfx_grab', target.x, target.feetY - 50);
    this.vfx.screenShake(100, 0.008);
    attacker.playOneShot('special');
    attacker.state = 'attack';
    attacker.stateTimer = 420;
    attacker.attackActive = false;
  }

  private clamp(f: Fighter): void {
    f.x = Phaser.Math.Clamp(f.x, 20, GAME_WIDTH - 20);
    f.feetY = Phaser.Math.Clamp(f.feetY, FLOOR_TOP + 10, FLOOR_BOTTOM - 5);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ROUND MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────
  private checkRoundEnd(): void {
    const p1dead = this.p1.hp <= 0;
    const p2dead = this.p2.hp <= 0;
    if (!p1dead && !p2dead) return;
    this.roundOver = true;

    if (p2dead && !p1dead) {
      this.p1RoundWins++;
      this.flashBanner(`${(CHAR_NAMES[this.p1CharId] ?? 'P1').toUpperCase()} WINS!`);
      this.vfx.koExplosion(this.p2.x, this.p2.feetY - 60);
      this.vfx.charVfx(this.p1CharId, 'vfx_ko', this.p2.x, this.p2.feetY - 60, 2.0);
    } else if (p1dead && !p2dead) {
      this.p2RoundWins++;
      this.flashBanner(`${(CHAR_NAMES[this.p2CharId] ?? 'CPU').toUpperCase()} WINS!`);
      this.vfx.koExplosion(this.p1.x, this.p1.feetY - 60);
      this.vfx.charVfx(this.p2CharId, 'vfx_ko', this.p1.x, this.p1.feetY - 60, 2.0);
    } else {
      this.flashBanner('DRAW!');
    }

    this.refreshRoundPips();

    const matchOver = this.p1RoundWins >= 2 || this.p2RoundWins >= 2;
    this.time.delayedCall(matchOver ? 1800 : 1400, () => {
      if (matchOver) this.showMatchResult();
      else this.nextRound();
    });
  }

  private nextRound(): void {
    this.roundNum++;
    this.showVsScreen();
  }

  private showMatchResult(): void {
    this.phase = 'result';
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Dark overlay
    const overlay = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72)
      .setDepth(90000).setScrollFactor(0);
    this.tweens.add({ targets: overlay, alpha: { from: 0, to: 0.72 }, duration: 350 });

    const p1Wins = this.p1RoundWins > this.p2RoundWins;
    const winner = p1Wins
      ? (CHAR_NAMES[this.p1CharId] ?? 'P1')
      : (CHAR_NAMES[this.p2CharId] ?? 'CPU');
    const winnerCharId = p1Wins ? this.p1CharId : this.p2CharId;
    const color = p1Wins ? '#44aaff' : '#ff6644';

    // Stage banner art behind result text
    if (this.textures.exists(UI.vsStageBanners)) {
      this.add.image(cx, cy - 50, UI.vsStageBanners)
        .setDisplaySize(500, 140).setDepth(90001).setAlpha(0.55).setScrollFactor(0);
    }

    // Winner marker art (crown / trophy icon strip)
    if (this.textures.exists(UI.vsWinnerMarkers)) {
      this.add.image(cx, cy - 110, UI.vsWinnerMarkers)
        .setDisplaySize(160, 44).setDepth(90002).setScrollFactor(0);
    }

    // Winner character sprite
    const winKey = AnimationSystem.animKey(winnerCharId, 'idle');
    if (this.anims.exists(winKey)) {
      this.add.sprite(cx, cy + 20, '__DEFAULT')
        .setOrigin(0.5, 1).setScale(1.6).play(winKey)
        .setDepth(90002).setScrollFactor(0)
        .setFlipX(!p1Wins);
    }

    this.add.text(cx, cy - 75, winner.toUpperCase(), {
      fontFamily: 'Arial Black, sans-serif', fontSize: '38px', color,
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(90003).setScrollFactor(0);

    this.add.text(cx, cy - 36, 'WINS THE MATCH!', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(90003).setScrollFactor(0);

    this.add.text(cx, cy + 74, `${this.p1RoundWins} — ${this.p2RoundWins}`, {
      fontFamily: 'monospace', fontSize: '22px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(90003).setScrollFactor(0);

    this.add.text(cx, cy + 104, 'SPACE — Rematch  ·  R — Character Select  ·  ESC — Menu', {
      fontFamily: 'monospace', fontSize: '12px', color: '#998899',
    }).setOrigin(0.5).setDepth(90003).setScrollFactor(0);

    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', () => {
      this.p1RoundWins = 0;
      this.p2RoundWins = 0;
      this.roundNum = 1;
      this.showVsScreen();
    });
    kb.once('keydown-R', () => {
      this.p1RoundWins = 0;
      this.p2RoundWins = 0;
      this.roundNum = 1;
      this.buildSelectionScreen();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HUD
  // ─────────────────────────────────────────────────────────────────────────
  private drawFightHUD(): void {
    if (!this.p1 || !this.p2 || !this.p1HpBar || !this.p2HpBar) return;
    const p1f = Phaser.Math.Clamp(this.p1.hp / this.p1.maxHp, 0, 1);
    const p2f = Phaser.Math.Clamp(this.p2.hp / this.p2.maxHp, 0, 1);

    // Depletion masks: grow from the dead side as HP falls
    this.p1HpBar.width = this.p1HpInner.w * (1 - p1f);
    this.p2HpBar.width = this.p2HpInner.w * (1 - p2f);

    this.p1HpNum?.setValue(Math.ceil(this.p1.hp));
    this.p2HpNum?.setValue(Math.ceil(this.p2.hp));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PAUSE
  // ─────────────────────────────────────────────────────────────────────────
  private togglePause(): void {
    if (this.phase !== 'fight') return;
    this.paused = !this.paused;
    if (this.paused) this.showPauseOverlay();
    else this.hidePauseOverlay();
  }

  private showPauseOverlay(): void {
    this.pauseGroup = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.pauseGroup.setDepth(99000);

    // Dim overlay
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.65)
      .setScrollFactor(0);
    this.pauseGroup.add(dim);

    // Menu panel — clean dark rectangle with gold border
    this.pauseGroup.add(this.add.rectangle(0, 0, 480, 300, 0x0d0818)
      .setStrokeStyle(2, 0xffd700, 0.9));

    // Title banner art (pause_menu_000.png) or fallback text
    if (this.textures.exists(UI.pauseTitle)) {
      this.pauseGroup.add(this.add.image(0, -108, UI.pauseTitle).setDisplaySize(380, 60));
    } else {
      this.pauseGroup.add(this.add.text(0, -100, '★ PAUSE MENU ★', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffd700',
        stroke: '#000000', strokeThickness: 5,
      }).setOrigin(0.5));
    }

    const items = [
      { label: 'RESUME', key: 'keydown-SPACE', fn: () => this.togglePause() },
      { label: 'RESTART ROUND', key: 'keydown-R', fn: () => { this.paused = false; this.hidePauseOverlay(); this.startFight(); } },
      { label: 'CHARACTER SELECT', key: 'keydown-C', fn: () => { this.paused = false; this.hidePauseOverlay(); this.p1RoundWins = 0; this.p2RoundWins = 0; this.roundNum = 1; this.buildSelectionScreen(); } },
      { label: 'MAIN MENU', key: 'keydown-M', fn: () => { this.paused = false; this.scene.start(SCENE.MainMenu); } },
    ];

    items.forEach((item, i) => {
      const y = -30 + i * 50;
      const btn = this.add.text(0, y, item.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setColor('#ffd700'));
      btn.on('pointerout', () => btn.setColor('#ffffff'));
      btn.on('pointerdown', () => item.fn());
      this.pauseGroup!.add(btn);
      this.input.keyboard!.once(item.key, () => item.fn());
    });

    this.pauseGroup.add(this.add.text(0, 140, 'SPACE resume  R restart  C char select  M menu', {
      fontFamily: 'monospace', fontSize: '11px', color: '#665577',
    }).setOrigin(0.5));
  }

  private hidePauseOverlay(): void {
    this.pauseGroup?.destroy(true);
    this.pauseGroup = undefined;
    // ESC handler already set persistently in startFight() — no re-wire needed
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UTIL
  // ─────────────────────────────────────────────────────────────────────────
  private flashBanner(text: string): void {
    if (!this.fightBanner) return;
    this.fightBanner.setText(text).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.add({
      targets: this.fightBanner,
      alpha: 0, scale: 1.3,
      duration: 1200, ease: 'Cubic.out',
      onComplete: () => this.fightBanner?.setVisible(false),
    });
  }
}

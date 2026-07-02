import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AudioSystem } from '../systems/AudioSystem';
import { UISystem, UI } from '../systems/UISystem';

// ── MemberCheckInScene ───────────────────────────────────────────────────────
// Layout from LSB Sheet 5 (lsb_sheet_05_card_verification.png):
//   Title:   CARD VERIFICATION • MEMBER CHECK-IN UI KIT
//   Left:    PANEL_CHECK_IN — QR_SCAN_FRAME + card number boxes + PRIVATE CLUB ACCESS
//   Center:  KEYPAD_CARD_NUMBER — numpad 1-9 / backspace / 0 / clear / ENTER
//            PANEL_VERIFICATION_RESULT — MEMBER VERIFIED / ACCESS GRANTED
//            BUTTON_VERIFY_CARD (green) / BUTTON_REJECT_CARD (red)
//   Right:   MEMBER_STATUS_ROWS — name + card# + VALID/EXPIRED/TRESPASS chips
//            CHIP_MEMBER_PROFILE / BADGE_CARD_OWNERSHIP / HOST APPROVAL REQUIRED
//            BANNER_ENTRY_STATUS: ENTRY STATUS: VERIFIED
//   Bottom:  PAYMENT METHODS + ESC footer

// Card numbers: 16-digit in 4 groups of 4 — e.g. "7845 2210 3987 6621"

const COLORS = {
  bg:       0x0a0614,
  panel:    0x0d0820,
  gold:     0xffd700,
  purple:   0x6622bb,
  bright:   0x9b11e8,
  valid:    0x00cc44,
  expired:  0xdd2233,
  trespass: 0x8844cc,
  dim:      0x554477,
};

const PAYMENT_METHODS = [
  { icon: '💳', label: 'CREDIT / DEBIT' },
  { icon: '🍎', label: 'APPLE PAY'      },
  { icon: 'G',  label: 'GOOGLE PAY'    },
  { icon: '🅿', label: 'PAYPAL'        },
  { icon: '$',  label: 'CASH APP'      },
];

type MemberStatus = 'valid' | 'expired' | 'trespass';
interface Member { card: string; name: string; status: MemberStatus; tier?: string }

// Demo members — card numbers are 16-digit no-space strings stored internally
const DEMO_MEMBERS: Member[] = [
  { card: '7845221039876621', name: 'Jordan Reyes',  status: 'valid',    tier: 'VIP MEMBER'    },
  { card: '1176550194227710', name: 'Morgan Blake',  status: 'expired',  tier: 'MONTHLY MEMBER' },
  { card: '5521009833447712', name: 'Alex Taylor',   status: 'trespass', tier: 'WEEKLY MEMBER'  },
];

const MAX_DIGITS = 16;

function fmt(raw: string): string {
  // Format raw 16-digit string as "XXXX XXXX XXXX XXXX"
  return raw.replace(/(.{4})/g, '$1 ').trim();
}

export class MemberCheckInScene extends Phaser.Scene {
  private enteredDigits = '';
  private digitTexts: Phaser.GameObjects.Text[] = [];
  private digitBoxGraphics: Phaser.GameObjects.Graphics[] = [];
  private resultBg!: Phaser.GameObjects.Rectangle;
  private resultTitle!: Phaser.GameObjects.Text;
  private resultSub!: Phaser.GameObjects.Text;
  private profileChip!: Phaser.GameObjects.Container;
  private entryBanner!: Phaser.GameObjects.Container;
  private selectedPayment = 0;
  private paymentBgs: Phaser.GameObjects.Rectangle[] = [];

  constructor() { super(SCENE.MemberCheckIn); }

  create(): void {
    AudioSystem.playForScene(this, 'Venue');
    this.enteredDigits = '';
    this.selectedPayment = 0;
    this.seedDemoMembers();

    // Background — solid color only. The raw lsb_sheet_05_card_verification.png
    // is a developer reference sheet, not live UI. All UI below is drawn from
    // code (or, once sliced, individual cropped component assets).
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // ── Header ─────────────────────────────────────────────────────────────
    this.add.rectangle(GAME_WIDTH / 2, 30, GAME_WIDTH, 60, 0x08020e, 0.95).setDepth(100);
    this.add.text(GAME_WIDTH / 2, 16, 'CARD VERIFICATION', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffd700',
      stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(101);
    this.add.text(GAME_WIDTH / 2, 42, '✦ MEMBER CHECK-IN UI KIT ✦', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#c100ff',
    }).setOrigin(0.5, 0).setDepth(101);

    // Status chips row
    this.buildStatusChips();

    // Left: check-in panel
    this.buildCheckInPanel();

    // Center: numpad + result
    this.buildNumpad();
    this.buildResultPanel();

    // Right: recent scans + profile
    this.buildRecentScans();

    // Bottom: entry schedule + payment methods
    this.buildEntrySchedule();
    this.buildPaymentMethods();

    // Keyboard
    const kb = this.input.keyboard!;
    for (let d = 0; d <= 9; d++) {
      kb.on(`keydown-${d}`, () => this.typeDigit(String(d)));
      kb.on(`keydown-NUMPAD_${d}`, () => this.typeDigit(String(d)));
    }
    kb.on('keydown-BACKSPACE', () => this.backspace());
    kb.on('keydown-ENTER',     () => this.verify());
    kb.on('keydown-ESC',       () => this.scene.start(SCENE.AppHub));

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 8, 'ESC — Main Menu   |   ENTER — Verify', {
      fontFamily: 'monospace', fontSize: '11px', color: '#443355',
    }).setOrigin(0.5).setDepth(200);
  }

  // ── Status chips: CHIP_VALID / CHIP_EXPIRED / CHIP_TRESPASS ──────────────
  private buildStatusChips(): void {
    const chips = [
      { label: '✔ VALID',    color: COLORS.valid    },
      { label: '⏱ EXPIRED',  color: COLORS.expired  },
      { label: '✋ TRESPASS', color: COLORS.trespass },
      { label: '👑 PRIVATE MEMBER', color: COLORS.gold    },
      { label: '💳 CARD #',         color: 0x8844cc        },
      { label: '🎧 DJ ENTERS CARD NUMBER TO VERIFY', color: 0x8844cc },
    ];
    const startX = 20;
    let x = startX;
    chips.forEach(c => {
      const t = this.add.text(x, 72, c.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px',
        color: `#${c.color.toString(16).padStart(6, '0')}`,
        backgroundColor: '#08020e',
        padding: { x: 8, y: 4 },
      }).setDepth(102);
      const border = this.add.graphics().setDepth(101);
      border.lineStyle(1, c.color, 0.6);
      border.strokeRect(x - 1, 71, t.width + 2, t.height + 2);
      x += t.width + 12;
      border; // referenced
    });
  }

  // ── PANEL_CHECK_IN: QR frame + 16-digit boxes + PRIVATE CLUB ACCESS ───────
  private buildCheckInPanel(): void {
    const px = 20, py = 96, pw = 320, ph = 400;

    // Real sliced panel-frame art as the container background, falling back
    // to the code-drawn rounded rect if the texture failed to load.
    if (UISystem.ready(this) && this.textures.exists(UI.cvCheckInPanel)) {
      this.add.image(px + pw / 2, py + ph / 2, UI.cvCheckInPanel)
        .setDisplaySize(pw, ph).setDepth(30);
    } else {
      const bg = this.add.graphics().setDepth(30);
      bg.fillStyle(COLORS.panel);
      bg.fillRoundedRect(px, py, pw, ph, 10);
      bg.lineStyle(2, COLORS.gold);
      bg.strokeRoundedRect(px, py, pw, ph, 10);
    }

    const cx = px + pw / 2;

    this.add.text(cx, py + 22, '★ MEMBER CHECK-IN ★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(31);

    this.add.text(cx, py + 44, 'SCAN MEMBER CARD', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(31);

    // QR_SCAN_FRAME
    const qg = this.add.graphics().setDepth(31);
    qg.lineStyle(3, COLORS.bright);
    qg.strokeRoundedRect(cx - 90, py + 58, 180, 140, 8);
    qg.fillStyle(0x0a0018);
    qg.fillRoundedRect(cx - 89, py + 59, 178, 138, 8);
    // QR pattern
    qg.fillStyle(0xffffff, 1);
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const on = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2) || ((r + c) % 3 === 0);
        if (on) qg.fillRect(cx - 74 + c * 18, py + 73 + r * 18, 14, 14);
      }
    }
    this.add.text(cx, py + 200, '★ ALIGN QR CODE HERE ★', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#9b11e8',
    }).setOrigin(0.5).setDepth(32);

    this.add.text(cx, py + 220, '— OR ENTER CARD NUMBER —', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#8877aa',
    }).setOrigin(0.5).setDepth(31);

    // 16 digit boxes in 4 groups of 4
    const boxW = 26, boxH = 32, gap = 2, groupGap = 10;
    const totalW = 4 * (4 * boxW + 3 * gap) + 3 * groupGap;
    const startX = cx - totalW / 2;
    this.digitTexts = [];
    this.digitBoxGraphics = [];
    let digitIdx = 0;
    for (let g2 = 0; g2 < 4; g2++) {
      for (let d = 0; d < 4; d++) {
        const bx = startX + g2 * (4 * (boxW + gap) + groupGap) + d * (boxW + gap);
        const by = py + 238;
        const dbg = this.add.graphics().setDepth(31);
        dbg.fillStyle(0x1a0e2e);
        dbg.fillRoundedRect(bx, by, boxW, boxH, 3);
        dbg.lineStyle(1, COLORS.purple);
        dbg.strokeRoundedRect(bx, by, boxW, boxH, 3);
        this.digitBoxGraphics.push(dbg);
        const t = this.add.text(bx + boxW / 2, by + boxH / 2, '', {
          fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
        }).setOrigin(0.5).setDepth(32);
        this.digitTexts.push(t);
        digitIdx++;
      }
    }
    digitIdx; // suppress warning

    this.add.text(cx, py + ph - 22, '🔒 PRIVATE CLUB ACCESS', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#8844cc',
    }).setOrigin(0.5).setDepth(31);
  }

  // ── KEYPAD_CARD_NUMBER ────────────────────────────────────────────────────
  private buildNumpad(): void {
    const nx = 360, ny = 96;
    const pw = 200, ph = 310;

    const bg = this.add.graphics().setDepth(30);
    bg.fillStyle(COLORS.panel);
    bg.fillRoundedRect(nx, ny, pw, ph, 10);
    bg.lineStyle(2, 0x3a2a55);
    bg.strokeRoundedRect(nx, ny, pw, ph, 10);

    this.add.text(nx + pw / 2, ny + 18, 'ENTER CARD NUMBER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(31);

    const rows = [['1','2','3'],['4','5','6'],['7','8','9'],['⌫','0','✕']];
    const bw = 54, bh = 44, gap = 5;
    const startX = nx + (pw - (3 * bw + 2 * gap)) / 2;

    rows.forEach((row, ri) => {
      row.forEach((lbl, ci) => {
        const bx = startX + ci * (bw + gap);
        const by = ny + 34 + ri * (bh + gap);
        const isBack = lbl === '⌫';
        const isClear = lbl === '✕';
        const fillCol = isBack ? 0x330a0a : isClear ? 0x1a0820 : COLORS.panel;
        const borderCol = isBack ? COLORS.expired : isClear ? COLORS.trespass : COLORS.purple;

        const g = this.add.graphics().setDepth(31);
        g.fillStyle(fillCol);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.lineStyle(2, borderCol);
        g.strokeRoundedRect(bx, by, bw, bh, 6);

        const t = this.add.text(bx + bw / 2, by + bh / 2, lbl, {
          fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffffff',
        }).setOrigin(0.5).setDepth(32);

        const zone = this.add.zone(bx, by, bw, bh).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          if (lbl === '⌫') this.backspace();
          else if (lbl === '✕') this.clearEntry();
          else this.typeDigit(lbl);
        });
        zone.on('pointerover', () => { g.lineStyle(3, COLORS.gold); g.strokeRoundedRect(bx, by, bw, bh, 6); t.setColor('#ffd700'); });
        zone.on('pointerout',  () => { g.lineStyle(2, borderCol); g.strokeRoundedRect(bx, by, bw, bh, 6); t.setColor('#ffffff'); });
      });
    });

    // ENTER button (full width)
    const enterY = ny + 34 + 4 * (bh + gap) + 4;
    const eg = this.add.graphics().setDepth(31);
    eg.fillStyle(0x006622);
    eg.fillRoundedRect(startX, enterY, 3 * bw + 2 * gap, bh, 6);
    eg.lineStyle(2, COLORS.valid);
    eg.strokeRoundedRect(startX, enterY, 3 * bw + 2 * gap, bh, 6);
    const et = this.add.text(nx + pw / 2, enterY + bh / 2, 'ENTER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#00cc44',
    }).setOrigin(0.5).setDepth(32);
    const eZone = this.add.zone(startX, enterY, 3 * bw + 2 * gap, bh).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    eZone.on('pointerdown', () => this.verify());
    eZone.on('pointerover', () => { eg.lineStyle(3, 0xaaffcc); eg.strokeRoundedRect(startX, enterY, 3 * bw + 2 * gap, bh, 6); et.setColor('#aaffcc'); });
    eZone.on('pointerout',  () => { eg.lineStyle(2, COLORS.valid); eg.strokeRoundedRect(startX, enterY, 3 * bw + 2 * gap, bh, 6); et.setColor('#00cc44'); });

    // VERIFY / REJECT card buttons
    const vy = ny + ph - 54;
    this.makeActionBtn(nx + 8,  vy, 90, 36, '✔ VERIFY CARD', COLORS.valid,    () => this.verify());
    this.makeActionBtn(nx + 102, vy, 90, 36, '✋ REJECT CARD',  COLORS.expired, () => this.clearEntry());
  }

  private makeActionBtn(x: number, y: number, w: number, h: number, label: string, col: number, cb: () => void): void {
    const g = this.add.graphics().setDepth(31);
    g.fillStyle(col, 0.18);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(2, col);
    g.strokeRoundedRect(x, y, w, h, 6);
    this.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: `#${col.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5).setDepth(32);
    const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', cb);
  }

  // ── PANEL_VERIFICATION_RESULT ─────────────────────────────────────────────
  private buildResultPanel(): void {
    const rx = 360, ry = 420, rw = 200, rh = 140;

    // Real sliced panel-frame art sits behind the dynamic color-tint rect —
    // the rect's stroke color still switches valid/expired/trespass live.
    if (UISystem.ready(this) && this.textures.exists(UI.cvResultPanel)) {
      this.add.image(rx + rw / 2, ry + rh / 2, UI.cvResultPanel)
        .setDisplaySize(rw, rh).setDepth(49);
    }

    this.resultBg = this.add.rectangle(rx + rw / 2, ry + rh / 2, rw, rh, COLORS.panel, 0.35)
      .setStrokeStyle(3, COLORS.valid).setDepth(50).setVisible(false);

    this.resultTitle = this.add.text(rx + rw / 2, ry + 38, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#00cc44',
      align: 'center', wordWrap: { width: rw - 20 },
    }).setOrigin(0.5, 0).setDepth(51).setVisible(false);

    this.resultSub = this.add.text(rx + rw / 2, ry + 80, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#ffffff',
      align: 'center', wordWrap: { width: rw - 20 },
    }).setOrigin(0.5, 0).setDepth(51).setVisible(false);

    // Profile chip + card ownership
    this.profileChip = this.add.container(rx, ry + 106).setDepth(52).setVisible(false);
    const pcBg = this.add.rectangle(rw / 2, 12, rw - 8, 22, 0x110022).setStrokeStyle(1, COLORS.bright);
    const pcT = this.add.text(rw / 2, 12, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '9px', color: '#c100ff',
    }).setOrigin(0.5).setName('profile_name');
    this.profileChip.add([pcBg, pcT]);

    // Entry status banner
    this.entryBanner = this.add.container(rx, ry + 130).setDepth(52).setVisible(false);
    const ebBg = this.add.rectangle(rw / 2, 10, rw - 8, 20, 0x001a00).setStrokeStyle(1, COLORS.valid);
    const ebT = this.add.text(rw / 2, 10, 'ENTRY STATUS: VERIFIED  ★  ENJOY THE EXPERIENCE  ★', {
      fontFamily: 'Arial, sans-serif', fontSize: '8px', color: '#00cc44',
    }).setOrigin(0.5).setName('entry_status');
    this.entryBanner.add([ebBg, ebT]);
  }

  // ── MEMBER_STATUS_ROWS ────────────────────────────────────────────────────
  private buildRecentScans(): void {
    const lx = 575, ly = 96, lw = GAME_WIDTH - 580, lh = 408;

    if (UISystem.ready(this) && this.textures.exists(UI.cvHistoryPanel)) {
      this.add.image(lx + lw / 2, ly + lh / 2, UI.cvHistoryPanel)
        .setDisplaySize(lw, lh).setDepth(30);
    } else {
      const bg = this.add.graphics().setDepth(30);
      bg.fillStyle(COLORS.panel);
      bg.fillRoundedRect(lx, ly, lw, lh, 10);
      bg.lineStyle(2, 0x3a2a55);
      bg.strokeRoundedRect(lx, ly, lw, lh, 10);
    }

    this.add.text(lx + lw / 2, ly + 18, 'RECENT SCANS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(31);

    const members = this.loadMembers();
    members.forEach((m, i) => {
      const ry2 = ly + 40 + i * 72;
      const rg = this.add.graphics().setDepth(31);
      rg.fillStyle(0x0a0514);
      rg.fillRoundedRect(lx + 10, ry2, lw - 20, 60, 6);
      rg.lineStyle(1, COLORS.dim);
      rg.strokeRoundedRect(lx + 10, ry2, lw - 20, 60, 6);

      // Avatar
      const ag = this.add.graphics().setDepth(32);
      ag.fillStyle(COLORS.purple, 1);
      ag.fillCircle(lx + 30, ry2 + 30, 16);
      ag.fillStyle(0xffd700, 1);
      this.add.text(lx + 30, ry2 + 30, m.name[0], {
        fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
      }).setOrigin(0.5).setDepth(33);

      this.add.text(lx + 52, ry2 + 14, m.name.toUpperCase(), {
        fontFamily: 'Arial Black, sans-serif', fontSize: '12px', color: '#ffffff',
      }).setDepth(32);
      this.add.text(lx + 52, ry2 + 32, `CARD # ${fmt(m.card)}`, {
        fontFamily: 'monospace', fontSize: '9px', color: '#8877aa',
      }).setDepth(32);

      const statusCol = m.status === 'valid' ? COLORS.valid : m.status === 'expired' ? COLORS.expired : COLORS.trespass;
      const statusLabel = m.status === 'valid' ? '✔ VALID' : m.status === 'expired' ? '⏱ EXPIRED' : '✋ TRESPASS';
      const sg = this.add.graphics().setDepth(32);
      sg.fillStyle(statusCol, 0.18);
      sg.fillRoundedRect(lx + lw - 90, ry2 + 16, 72, 26, 4);
      sg.lineStyle(1, statusCol);
      sg.strokeRoundedRect(lx + lw - 90, ry2 + 16, 72, 26, 4);
      this.add.text(lx + lw - 54, ry2 + 29, statusLabel, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '9px',
        color: `#${statusCol.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5).setDepth(33);

      ag; rg; sg; // suppress unused
    });

    // HOST APPROVAL REQUIRED chip
    const haY = ly + 40 + members.length * 72 + 8;
    const haBg = this.add.graphics().setDepth(31);
    haBg.fillStyle(0x1a1000, 1);
    haBg.fillRoundedRect(lx + 10, haY, lw - 20, 26, 4);
    haBg.lineStyle(1, COLORS.gold);
    haBg.strokeRoundedRect(lx + 10, haY, lw - 20, 26, 4);
    this.add.text(lx + lw / 2, haY + 13, '👑 HOST APPROVAL REQUIRED', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(32);
  }

  // ── ENTRY SCHEDULE ────────────────────────────────────────────────────────
  // Posted for staff reference at the door.
  // Tue–Wed: Women/Students free until 2AM | Men $5 before 2AM
  // Thu–Sat: Women/Students free→$5→$10 | Men $5→$10→$15→$20
  private buildEntrySchedule(): void {
    const baseY = GAME_HEIGHT - 148;
    this.add.rectangle(GAME_WIDTH / 2, baseY + 30, GAME_WIDTH - 40, 66, 0x08020e)
      .setStrokeStyle(1, 0x3a2a55).setOrigin(0.5).setDepth(60);

    this.add.text(24, baseY + 4, '📋 ENTRY SCHEDULE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffd700',
    }).setDepth(61);

    // Tue–Wed column
    this.add.text(180, baseY + 4, 'TUE – WED', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: '#aaaaaa',
    }).setOrigin(0.5, 0).setDepth(61);
    const twRows = [
      { g: '👩 WOMEN',    v: 'FREE until 2AM',  c: '#44cc44' },
      { g: '🎓 STUDENTS', v: 'FREE until 2AM',  c: '#44cc44' },
      { g: '👨 MEN',      v: '$5 before 2AM',   c: '#ffd700' },
    ];
    twRows.forEach((r, i) => {
      this.add.text(100, baseY + 18 + i * 14, r.g, {
        fontFamily: 'monospace', fontSize: '9px', color: '#888888',
      }).setDepth(61);
      this.add.text(260, baseY + 18 + i * 14, r.v, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: r.c,
      }).setOrigin(1, 0).setDepth(61);
    });

    // Divider
    const dg = this.add.graphics().setDepth(61);
    dg.lineStyle(1, 0x3a2a55, 1);
    dg.strokeRect(275, baseY + 2, 0, 58);

    // Thu–Sat column
    this.add.text(640, baseY + 4, 'THU – SAT', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: '#aaaaaa',
    }).setOrigin(0.5, 0).setDepth(61);

    // Header row
    const headers = ['GROUP', 'BEFORE 2AM', 'AFTER 2AM', 'AFTER 3AM', 'AFTER 4AM'];
    const cols    = [290, 400, 490, 576, 660];
    headers.forEach((h, i) => {
      this.add.text(cols[i], baseY + 14, h, {
        fontFamily: 'monospace', fontSize: '8px', color: '#555555',
      }).setDepth(61);
    });

    const tsRows = [
      { g: '👩 WOMEN',    vals: ['FREE',  '$5',  '$10', '$10'], colors: ['#44cc44','#ffd700','#ff8800','#ff8800'] },
      { g: '🎓 STUDENTS', vals: ['FREE*', '$5',  '$10', '$10'], colors: ['#44cc44','#ffd700','#ff8800','#ff8800'] },
      { g: '👨 MEN',      vals: ['$5',   '$10', '$15', '$20'], colors: ['#ffd700','#ff8800','#ff5500','#ff2200'] },
    ];
    tsRows.forEach((r, i) => {
      const y2 = baseY + 24 + i * 14;
      this.add.text(cols[0], y2, r.g, {
        fontFamily: 'monospace', fontSize: '9px', color: '#888888',
      }).setDepth(61);
      r.vals.forEach((v, ci) => {
        this.add.text(cols[ci + 1] + 28, y2, v, {
          fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: r.colors[ci],
        }).setOrigin(0.5, 0).setDepth(61);
      });
    });
    this.add.text(cols[1] + 28, baseY + 66, '*Student ID required', {
      fontFamily: 'monospace', fontSize: '8px', color: '#444444',
    }).setOrigin(0.5, 0).setDepth(61);
  }

  // ── PAYMENT METHODS ───────────────────────────────────────────────────────
  private buildPaymentMethods(): void {
    const baseY = GAME_HEIGHT - 74;
    this.add.rectangle(GAME_WIDTH / 2, baseY + 20, GAME_WIDTH - 40, 50, 0x08020e)
      .setStrokeStyle(1, 0x3a2a55).setOrigin(0.5).setDepth(60);

    this.add.text(24, baseY + 4, '💳 PAYMENT METHOD:', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffd700',
    }).setDepth(61);

    this.paymentBgs = [];
    PAYMENT_METHODS.forEach((pm, i) => {
      const bx = 180 + i * 180;
      const pbg = this.add.rectangle(bx + 78, baseY + 20, 154, 34, i === this.selectedPayment ? 0x1a0830 : 0x08020e)
        .setStrokeStyle(2, i === this.selectedPayment ? 0xc100ff : 0x2a1a44)
        .setDepth(61).setInteractive({ useHandCursor: true });
      pbg.on('pointerdown', () => this.selectPayment(i));
      this.paymentBgs.push(pbg);

      this.add.text(bx + 24, baseY + 20, pm.icon, { fontSize: '14px' }).setOrigin(0, 0.5).setDepth(62);
      this.add.text(bx + 46, baseY + 20, pm.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#aaaaaa',
      }).setOrigin(0, 0.5).setDepth(62);
    });
  }

  private selectPayment(idx: number): void {
    this.selectedPayment = idx;
    this.paymentBgs.forEach((bg, i) => {
      bg.setFillStyle(i === idx ? 0x1a0830 : 0x08020e)
        .setStrokeStyle(2, i === idx ? 0xc100ff : 0x2a1a44);
    });
  }

  // ── Input logic ───────────────────────────────────────────────────────────
  private typeDigit(d: string): void {
    if (this.enteredDigits.length >= MAX_DIGITS) return;
    this.enteredDigits += d;
    this.refreshBoxes();
  }

  private backspace(): void {
    this.enteredDigits = this.enteredDigits.slice(0, -1);
    this.refreshBoxes();
    this.hideResult();
  }

  private clearEntry(): void {
    this.enteredDigits = '';
    this.refreshBoxes();
    this.hideResult();
  }

  private refreshBoxes(): void {
    for (let i = 0; i < MAX_DIGITS; i++) {
      this.digitTexts[i].setText(i < this.enteredDigits.length ? this.enteredDigits[i] : '');
      // Highlight active box
      const g = this.digitBoxGraphics[i];
      g.clear();
      const isActive = i === this.enteredDigits.length;
      g.fillStyle(isActive ? 0x2a1040 : 0x1a0e2e);
      g.lineStyle(1, isActive ? COLORS.bright : COLORS.purple);
    }
  }

  private verify(): void {
    if (this.enteredDigits.length < 8) {
      this.showResult('INCOMPLETE', 'Enter at least 8 digits', COLORS.expired, null);
      return;
    }
    const members = this.loadMembers();
    const query = this.enteredDigits.replace(/\s/g, '');
    const found = members.find(m => m.card.startsWith(query) || m.card === query.padEnd(16, '0'));

    if (!found) {
      this.showResult('✗ NOT FOUND', `Card not recognised.\nPlease try again or contact host.`, COLORS.expired, null);
    } else if (found.status === 'valid') {
      this.showResult('✔ MEMBER VERIFIED\nWELCOME BACK!', 'ACCESS GRANTED', COLORS.valid, found);
    } else if (found.status === 'expired') {
      this.showResult('✗ MEMBERSHIP EXPIRED', `${found.name}\nRENEWAL REQUIRED`, COLORS.expired, found);
    } else {
      this.showResult('⚠ TRESPASS NOTICE', `${found.name}\nENTRY DENIED — CONTACT HOST`, COLORS.trespass, found);
    }
  }

  private showResult(title: string, sub: string, col: number, member: Member | null): void {
    this.resultBg.setStrokeStyle(3, col).setVisible(true);
    this.resultTitle.setText(title).setColor(`#${col.toString(16).padStart(6, '0')}`).setVisible(true);
    this.resultSub.setText(sub).setVisible(true);
    this.tweens.add({ targets: this.resultBg, scaleX: { from: 0.8, to: 1 }, scaleY: { from: 0.8, to: 1 }, duration: 220, ease: 'Back.out' });

    if (member) {
      const nameT = this.profileChip.getByName('profile_name') as Phaser.GameObjects.Text;
      nameT.setText(`👤 ${member.name.toUpperCase()}  •  ${member.tier ?? 'MEMBER'}`);
      this.profileChip.setVisible(true);
      const isValid = member.status === 'valid';
      this.entryBanner.setVisible(isValid);
      const ebT = this.entryBanner.getByName('entry_status') as Phaser.GameObjects.Text;
      if (isValid) ebT.setText('ENTRY STATUS: VERIFIED  ★  ENJOY THE EXPERIENCE  ★');
    } else {
      this.profileChip.setVisible(false);
      this.entryBanner.setVisible(false);
    }
  }

  private hideResult(): void {
    this.resultBg.setVisible(false);
    this.resultTitle.setVisible(false);
    this.resultSub.setVisible(false);
    this.profileChip.setVisible(false);
    this.entryBanner.setVisible(false);
  }

  private loadMembers(): Member[] {
    try {
      const raw = localStorage.getItem('hvas_members');
      if (raw) return JSON.parse(raw) as Member[];
    } catch { /* ignore */ }
    return DEMO_MEMBERS;
  }

  private seedDemoMembers(): void {
    if (!localStorage.getItem('hvas_members')) {
      localStorage.setItem('hvas_members', JSON.stringify(DEMO_MEMBERS));
    }
  }
}

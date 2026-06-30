import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';

// ── Color palette ─────────────────────────────────────────────────────────────
const C = {
  bg:       0x0a0614,
  panel:    0x0d0820,
  gold:     0xffd700,
  purple:   0x6622bb,
  bright:   0x9b11e8,
  valid:    0x00cc44,
  expired:  0xdd2233,
  trespass: 0x8844cc,
  white:    0xffffff,
  dim:      0x554477,
};

type MemberStatus = 'valid' | 'expired' | 'trespass';
interface Member { card: string; name: string; status: MemberStatus }

const DEMO_MEMBERS: Member[] = [
  { card: '78452103', name: 'Jordan Reyes',  status: 'valid'    },
  { card: '11765501', name: 'Morgan Blake',  status: 'expired'  },
  { card: '55210098', name: 'Alex Taylor',   status: 'trespass' },
];

const MAX_DIGITS = 8;

export class MemberCheckInScene extends Phaser.Scene {
  private enteredDigits = '';
  private digitBoxes: Phaser.GameObjects.Text[] = [];
  private resultTitle!: Phaser.GameObjects.Text;
  private resultSub!: Phaser.GameObjects.Text;
  private resultBg!: Phaser.GameObjects.Rectangle;

  constructor() { super(SCENE.MemberCheckIn); }

  create(): void {
    this.enteredDigits = '';
    this.cameras.main.setBackgroundColor(C.bg);
    this.seedDemoMembers();

    const cx = GAME_WIDTH / 2;

    // Title
    this.add.text(cx, 28, '★ MEMBER CHECK-IN ★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#ffd700',
    }).setOrigin(0.5);

    // Left panel
    this.buildLeftPanel();
    // Numpad
    this.buildNumpad();
    // Recent scans list
    this.buildRecentList();
    // Result panel (hidden initially)
    this.buildResultPanel();

    // Keyboard input
    const kb = this.input.keyboard!;
    for (let d = 0; d <= 9; d++) {
      kb.on(`keydown-${d}`, () => this.typeDigit(String(d)));
      kb.on(`keydown-NUMPAD_${d}`, () => this.typeDigit(String(d)));
    }
    kb.on('keydown-BACKSPACE', () => this.backspace());
    kb.on('keydown-ENTER',     () => this.verify());
    kb.on('keydown-ESC',       () => this.scene.start(SCENE.MainMenu));

    this.add.text(cx, GAME_HEIGHT - 18, 'ESC — Main Menu', {
      fontFamily: 'monospace', fontSize: '12px', color: '#554477',
    }).setOrigin(0.5);
  }

  // ── Left panel ──────────────────────────────────────────────────────────────
  private buildLeftPanel(): void {
    const px = 60, py = 60, pw = 340, ph = 390;
    const g = this.add.graphics();
    g.fillStyle(C.panel);
    g.fillRoundedRect(px, py, pw, ph, 12);
    g.lineStyle(2, C.gold);
    g.strokeRoundedRect(px, py, pw, ph, 12);

    const cx = px + pw / 2;

    this.add.text(cx, py + 28, 'SCAN MEMBER CARD', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
    }).setOrigin(0.5);

    // QR frame
    const qg = this.add.graphics();
    qg.lineStyle(3, C.bright);
    qg.strokeRoundedRect(cx - 90, py + 55, 180, 140, 8);
    qg.fillStyle(0x1a0830);
    qg.fillRoundedRect(cx - 89, py + 56, 178, 138, 8);

    this.add.text(cx, py + 128, 'ALIGN QR CODE\nHERE', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#9b11e8',
      align: 'center',
    }).setOrigin(0.5);

    this.add.text(cx, py + 210, '— OR ENTER CARD NUMBER —', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#8877aa',
    }).setOrigin(0.5);

    // 8 digit boxes
    const boxW = 32, boxH = 36, gap = 4;
    const totalW = 8 * boxW + 7 * gap;
    const startX = cx - totalW / 2;
    this.digitBoxes = [];
    for (let i = 0; i < 8; i++) {
      const bx = startX + i * (boxW + gap);
      const by = py + 230;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a0e2e);
      bg.fillRoundedRect(bx, by, boxW, boxH, 4);
      bg.lineStyle(1, C.purple);
      bg.strokeRoundedRect(bx, by, boxW, boxH, 4);
      const t = this.add.text(bx + boxW / 2, by + boxH / 2, '', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
      }).setOrigin(0.5);
      this.digitBoxes.push(t);
    }

    this.add.text(cx, py + ph - 22, '🔒 PRIVATE CLUB ACCESS', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#8844cc',
    }).setOrigin(0.5);
  }

  // ── Numpad ──────────────────────────────────────────────────────────────────
  private buildNumpad(): void {
    const nx = 420, ny = 80;
    this.add.text(nx + 90, ny, 'ENTER CARD NUMBER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffd700',
    }).setOrigin(0.5);

    const labels = [['1','2','3'],['4','5','6'],['7','8','9'],['⌫','0','↵']];
    const bw = 56, bh = 44, gap = 6;

    labels.forEach((row, ri) => {
      row.forEach((lbl, ci) => {
        const bx = nx + ci * (bw + gap);
        const by = ny + 20 + ri * (bh + gap);
        const isAction = lbl === '⌫' || lbl === '↵';
        const fillCol = isAction ? (lbl === '↵' ? 0x006622 : 0x330a0a) : C.panel;
        const borderCol = isAction ? (lbl === '↵' ? C.valid : C.expired) : C.purple;

        const g = this.add.graphics();
        g.fillStyle(fillCol);
        g.fillRoundedRect(bx, by, bw, bh, 6);
        g.lineStyle(2, borderCol);
        g.strokeRoundedRect(bx, by, bw, bh, 6);

        const t = this.add.text(bx + bw / 2, by + bh / 2, lbl, {
          fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffffff',
        }).setOrigin(0.5);

        const zone = this.add.zone(bx, by, bw, bh).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          if (lbl === '⌫') this.backspace();
          else if (lbl === '↵') this.verify();
          else this.typeDigit(lbl);
        });
        zone.on('pointerover', () => { g.lineStyle(2, C.gold); g.strokeRoundedRect(bx, by, bw, bh, 6); t.setColor('#ffd700'); });
        zone.on('pointerout',  () => { g.lineStyle(2, borderCol); g.strokeRoundedRect(bx, by, bw, bh, 6); t.setColor('#ffffff'); });
      });
    });

    // VERIFY / REJECT buttons
    const vy = ny + 230;
    this.makeButton(nx, vy, 90, 38, 'VERIFY CARD', C.valid, () => this.verify());
    this.makeButton(nx + 96, vy, 90, 38, 'REJECT CARD', C.expired, () => this.clearEntry());
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, col: number, cb: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(col, 0.2);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(2, col);
    g.strokeRoundedRect(x, y, w, h, 6);
    this.add.text(x + w / 2, y + h / 2, label, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);
    const zone = this.add.zone(x, y, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', cb);
  }

  // ── Recent scans list ────────────────────────────────────────────────────────
  private buildRecentList(): void {
    const lx = 630, ly = 80;
    this.add.text(lx, ly, 'RECENT SCANS', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffd700',
    });

    DEMO_MEMBERS.forEach((m, i) => {
      const ry = ly + 28 + i * 56;
      const rg = this.add.graphics();
      rg.fillStyle(C.panel);
      rg.fillRoundedRect(lx, ry, 296, 48, 6);
      rg.lineStyle(1, C.dim);
      rg.strokeRoundedRect(lx, ry, 296, 48, 6);

      // Avatar circle
      const ag = this.add.graphics();
      ag.fillStyle(C.purple);
      ag.fillCircle(lx + 24, ry + 24, 16);
      this.add.text(lx + 24, ry + 24, m.name[0], {
        fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
      }).setOrigin(0.5);

      this.add.text(lx + 48, ry + 12, m.name, {
        fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffffff',
      });
      this.add.text(lx + 48, ry + 28, `CARD #${m.card}`, {
        fontFamily: 'monospace', fontSize: '10px', color: '#8877aa',
      });

      const statusCol = m.status === 'valid' ? C.valid : m.status === 'expired' ? C.expired : C.trespass;
      const sg = this.add.graphics();
      sg.fillStyle(statusCol, 0.2);
      sg.fillRoundedRect(lx + 220, ry + 12, 68, 22, 4);
      sg.lineStyle(1, statusCol);
      sg.strokeRoundedRect(lx + 220, ry + 12, 68, 22, 4);
      this.add.text(lx + 254, ry + 23, m.status.toUpperCase(), {
        fontFamily: 'Arial Black, sans-serif', fontSize: '9px', color: `#${statusCol.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);
    });
  }

  // ── Result panel ─────────────────────────────────────────────────────────────
  private buildResultPanel(): void {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT - 90;
    this.resultBg = this.add.rectangle(cx, cy, GAME_WIDTH - 40, 80, C.panel).setStrokeStyle(2, C.gold).setVisible(false);
    this.resultTitle = this.add.text(cx, cy - 16, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffd700',
    }).setOrigin(0.5).setVisible(false);
    this.resultSub = this.add.text(cx, cy + 14, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5).setVisible(false);
  }

  // ── Logic ────────────────────────────────────────────────────────────────────
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
    for (let i = 0; i < 8; i++) {
      this.digitBoxes[i].setText(i < this.enteredDigits.length ? this.enteredDigits[i] : '');
    }
  }

  private verify(): void {
    if (!this.enteredDigits) return;
    const members = this.loadMembers();
    const found = members.find(m => m.card === this.enteredDigits.padStart(8, '0') || m.card === this.enteredDigits);

    if (!found) {
      this.showResult('UNKNOWN CARD', `Card #${this.enteredDigits} not found`, C.expired);
    } else if (found.status === 'valid') {
      this.showResult('✓ MEMBER VERIFIED', `WELCOME BACK, ${found.name.toUpperCase()}! — ACCESS GRANTED`, C.valid);
    } else if (found.status === 'expired') {
      this.showResult('✗ MEMBERSHIP EXPIRED', `${found.name} — RENEWAL REQUIRED`, C.expired);
    } else {
      this.showResult('⚠ TRESPASS NOTICE', `${found.name} — ENTRY DENIED. CONTACT HOST.`, C.trespass);
    }
  }

  private showResult(title: string, sub: string, col: number): void {
    this.resultBg.setStrokeStyle(3, col).setVisible(true);
    this.resultTitle.setText(title).setColor(`#${col.toString(16).padStart(6, '0')}`).setVisible(true);
    this.resultSub.setText(sub).setVisible(true);
    this.tweens.add({ targets: this.resultBg, scaleX: { from: 0.8, to: 1 }, duration: 200, ease: 'Back.out' });
  }

  private hideResult(): void {
    this.resultBg.setVisible(false);
    this.resultTitle.setVisible(false);
    this.resultSub.setVisible(false);
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

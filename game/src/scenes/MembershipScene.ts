import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { UISystem, UI } from '../systems/UISystem';
import { AudioSystem } from '../systems/AudioSystem';

// ── MembershipScene ─────────────────────────────────────────────────────────
// Layout from LSB Sheet 8 (lsb_sheet_08_membership.png):
//   Header:  MEMBERSHIP • DUES • CARD PACKS • QR JOIN
//   Top chips: PRIVATE MEMBERS ONLY | ENTRY DUES | UNLOCK 2-3 CARDS | JOIN LIVE BY QR
//   Left:    DUES OPTIONS — $20 WEEKLY / $50 MONTHLY / $100 YEARLY
//   Center:  CARD PACKS — BUY 2 CARDS / BUY 3 CARDS
//   Right:   QR JOIN CARD + PAYMENT METHODS
//   Bottom:  MEMBERSHIP STATUS BAR + PRIVATE MEMBER RULES
//   Footer:  SECURE & ENCRYPTED | NO REFUNDS | QUESTIONS? CONTACT HOST | THANK YOU

interface MemberRecord {
  tier: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'VIP';
  cardCount: number;
  cardNumber: string;
  renewsAt: number; // timestamp ms
  badge: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'VIP';
  active: boolean;
}

function loadMember(): MemberRecord | null {
  try {
    const raw = localStorage.getItem('hvas_lsb_member');
    if (raw) return JSON.parse(raw) as MemberRecord;
  } catch { /* ignore */ }
  return null;
}

function saveMember(m: MemberRecord): void {
  localStorage.setItem('hvas_lsb_member', JSON.stringify(m));
}

function generateCardNumber(): string {
  const seg = () => String(Math.floor(1000 + Math.random() * 9000));
  return `${seg()} ${seg()} ${seg()} ${seg()}`;
}

function renewMs(tier: MemberRecord['tier']): number {
  const days: Record<MemberRecord['tier'], number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30, YEARLY: 365, VIP: 365 };
  return Date.now() + days[tier] * 24 * 60 * 60 * 1000;
}

function countdownStr(ms: number): string {
  const diff = Math.max(0, ms - Date.now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${String(d).padStart(2, '0')}D : ${String(h).padStart(2, '0')}H : ${String(m).padStart(2, '0')}M`;
}

// ── APP MEMBERSHIP TIERS — pay for access to the app to become a member ─────
// DAILY = try it; WEEKLY/MONTHLY/YEARLY/VIP = scale up
const DUES = [
  { tier: 'DAILY'   as const, price: '$5',      label: 'DAILY',   badge: 'BRONZE'   as const },
  { tier: 'WEEKLY'  as const, price: '$100',    label: 'WEEKLY',  badge: 'SILVER'   as const },
  { tier: 'MONTHLY' as const, price: '$300',    label: 'MONTHLY', badge: 'GOLD'     as const },
  { tier: 'YEARLY'  as const, price: '$1,000',  label: 'YEARLY',  badge: 'PLATINUM' as const },
  { tier: 'VIP'     as const, price: '$5,000',  label: 'VIP',     badge: 'VIP'      as const },
];

const PAYMENT_METHODS = [
  { icon: '💳', label: 'CREDIT / DEBIT' },
  { icon: '🍎', label: 'APPLE PAY'      },
  { icon: 'G',  label: 'GOOGLE PAY'    },
  { icon: '🅿', label: 'PAYPAL'        },
  { icon: '$',  label: 'CASH APP'      },
];

export class MembershipScene extends Phaser.Scene {
  private member: MemberRecord | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private selectedTier: MemberRecord['tier'] | null = null;
  private selectedCards = 0;

  constructor() { super(SCENE.Membership); }

  create(): void {
    AudioSystem.playForScene(this, 'Venue');
    this.member = loadMember();
    this.selectedTier = null;
    this.selectedCards = 0;

    // Background
    if (UISystem.ready(this)) {
      UISystem.backdrop(this, UI.lsbMembership, 1, -5000);
    } else {
      this.cameras.main.setBackgroundColor(0x06030e);
    }

    this.buildHeader();
    this.buildTopChips();
    this.buildDuesSection();
    this.buildCardPacksSection();
    this.buildQrSection();
    this.buildStatusBar();
    this.buildPrivateRules();
    this.buildFooter();

    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));
  }

  // ── Header ────────────────────────────────────────────────────────────────
  private buildHeader(): void {
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, 36, GAME_WIDTH, 72, 0x08020e, 0.95).setDepth(100);

    // Crown ornament (geometric)
    const g = this.add.graphics().setDepth(101);
    g.fillStyle(0xffd700, 1);
    g.fillTriangle(cx - 30, 10, cx, 2, cx + 30, 10);
    g.fillRect(cx - 35, 10, 70, 8);

    this.add.text(cx, 28, 'MEMBERSHIP', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#ffd700',
      stroke: '#3d1a00', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(101);

    this.add.text(cx, 58, '✦ PAY FOR APP ACCESS  ✦  BECOME A MEMBER  ✦  SCALE YOUR EXPERIENCE ✦', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#c100ff',
    }).setOrigin(0.5, 0).setDepth(101);

    // Back button
    this.makeChip(60, 36, 'ESC — BACK', 0x1a0030, 0xc100ff, 12)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start(SCENE.MainMenu));
  }

  // ── Top chips: PRIVATE MEMBERS ONLY | ENTRY DUES | UNLOCK 2-3 CARDS | JOIN LIVE BY QR
  private buildTopChips(): void {
    const labels = ['🔒 PRIVATE MEMBERS ONLY', '👑 ENTRY DUES', '🎴 UNLOCK 2-3 CARDS', '📷 JOIN LIVE BY QR'];
    const colors = [0x1a0030, 0x1a1000, 0x0a1a00, 0x001020];
    const borders = [0xc100ff, 0xffd700, 0x44cc44, 0x00aaff];
    const totalW = labels.length * 240 + (labels.length - 1) * 8;
    let x = (GAME_WIDTH - totalW) / 2;
    labels.forEach((lbl, i) => {
      const chip = this.add.rectangle(x + 120, 92, 238, 28, colors[i])
        .setStrokeStyle(1, borders[i]).setOrigin(0.5).setDepth(50);
      this.add.text(x + 120, 92, lbl, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px',
        color: `#${borders[i].toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5).setDepth(51);
      chip; x += 248;
    });
  }

  // ── DUES OPTIONS: $100 WEEKLY / $300 MONTHLY / $1,000 YEARLY / $5,000 VIP ──
  private buildDuesSection(): void {
    const secX = 20, secY = 118;
    const cardW = 100, cardGap = 8;
    const totalW = DUES.length * (cardW + cardGap) + 20;
    this.add.rectangle(secX + totalW / 2, secY + 155, totalW, 320, 0x08020e, 0.7)
      .setStrokeStyle(1, 0xffd700, 0.4).setOrigin(0.5).setDepth(40);

    this.makeChip(secX + totalW / 2, secY + 12, '✦ MEMBERSHIP DUES ✦', 0x0a0500, 0xffd700, 11);

    DUES.forEach((due, i) => {
      const cx = secX + 10 + cardW / 2 + i * (cardW + cardGap);
      const cy = secY + 130;
      // Badge card
      const bg = this.add.rectangle(cx, cy, 110, 170, 0x0a0200)
        .setStrokeStyle(2, 0xffd700).setOrigin(0.5).setDepth(50)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectTier(due.tier, i));
      bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffd700));
      bg.on('pointerout',  () => bg.setStrokeStyle(
        this.selectedTier === due.tier ? 3 : 2,
        this.selectedTier === due.tier ? 0xc100ff : 0xffd700,
      ));

      this.add.text(cx, cy - 58, due.price, {
        fontFamily: 'Arial Black, sans-serif', fontSize: due.price.length > 5 ? '20px' : '26px', color: '#ffd700',
        stroke: '#3d1a00', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(51).setName(`price_${i}`);

      this.add.text(cx, cy - 22, due.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#c100ff',
      }).setOrigin(0.5).setDepth(51);

      // Calendar icon (geometric)
      const g = this.add.graphics().setDepth(51);
      g.lineStyle(1, 0x8844cc, 1);
      g.strokeRect(cx - 18, cy + 5, 36, 28);
      g.fillStyle(0xc100ff, 0.3);
      g.fillRect(cx - 18, cy + 5, 36, 8);
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 2; row++) {
          g.fillStyle(0xffd700, 0.5);
          g.fillRect(cx - 12 + col * 13, cy + 18 + row * 9, 8, 6);
        }
      }

      if (due.tier === 'VIP') {
        this.add.text(cx, cy + 50, '👑', { fontSize: '18px' }).setOrigin(0.5).setDepth(52);
      }
    });

    // SELECT button centred under the cards
    const btnCx = secX + 10 + DUES.length * (cardW + cardGap) / 2;
    const selBtn = this.add.rectangle(btnCx, secY + 228, 220, 38, 0x1a1000)
      .setStrokeStyle(2, 0xffd700).setOrigin(0.5).setDepth(55).setInteractive({ useHandCursor: true });
    const selLbl = this.add.text(btnCx, secY + 228, 'SELECT MEMBERSHIP', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '12px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(56).setName('sel_dues_lbl');
    selBtn.on('pointerdown', () => this.confirmDues(selLbl));
  }

  // ── CARD PACKS: BUY 2 CARDS / BUY 3 CARDS ────────────────────────────────
  private buildCardPacksSection(): void {
    const secX = GAME_WIDTH / 2 - 120, secY = 118;
    this.add.rectangle(secX + 120, secY + 155, 260, 320, 0x08020e, 0.7)
      .setStrokeStyle(1, 0xc100ff, 0.4).setOrigin(0.5).setDepth(40);

    this.makeChip(secX + 120, secY + 12, '✦ CARD PACKS ✦', 0x0a0020, 0xc100ff, 11);

    const packs = [{ n: 2, label: '2\nCARDS' }, { n: 3, label: '3\nCARDS' }];
    packs.forEach((pack, i) => {
      const cx = secX + 60 + i * 120;
      const cy = secY + 125;
      const bg = this.add.rectangle(cx, cy, 100, 150, 0x060018)
        .setStrokeStyle(2, 0xc100ff).setOrigin(0.5).setDepth(50)
        .setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.selectCards(pack.n, bg));

      this.add.text(cx, cy - 20, String(pack.n), {
        fontFamily: 'Arial Black, sans-serif', fontSize: '38px', color: '#c100ff',
      }).setOrigin(0.5).setDepth(51);
      this.add.text(cx, cy + 22, 'CARDS', {
        fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffd700',
      }).setOrigin(0.5).setDepth(51);

      // Card icons (stacked)
      const g = this.add.graphics().setDepth(51);
      for (let c = pack.n - 1; c >= 0; c--) {
        g.lineStyle(1, 0xffd700, 0.7);
        g.fillStyle(0x1a0040, 1);
        g.fillRoundedRect(cx - 18 + c * 6, cy + 34 + c * (-4), 30, 24, 3);
        g.strokeRoundedRect(cx - 18 + c * 6, cy + 34 + c * (-4), 30, 24, 3);
        g.fillStyle(0xc100ff, 0.5);
        g.fillRect(cx - 5 + c * 6, cy + 44 + c * (-4), 6, 6);
      }
    });

    // BUY buttons
    const buyColors = [0x4400aa, 0x880000];
    const buyBorders = [0xc100ff, 0xff4444];
    packs.forEach((pack, i) => {
      const bx = secX + 60 + i * 120;
      const btn = this.add.rectangle(bx, secY + 238, 94, 36, buyColors[i])
        .setStrokeStyle(2, buyBorders[i]).setOrigin(0.5).setDepth(55)
        .setInteractive({ useHandCursor: true });
      const icon = i === 0 ? '♦' : '♦';
      this.add.text(bx, secY + 229, `${icon} BUY ${pack.n}`, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(56);
      this.add.text(bx, secY + 243, `CARDS $${pack.n * 5}`, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffd700',
      }).setOrigin(0.5).setDepth(56);
      btn.on('pointerdown', () => this.buyCards(pack.n));
      btn; icon;
    });
  }

  // ── QR JOIN CARD + PAYMENT METHODS ───────────────────────────────────────
  private buildQrSection(): void {
    const secX = GAME_WIDTH - 280, secY = 118;
    this.add.rectangle(secX + 120, secY + 155, 248, 320, 0x08020e, 0.7)
      .setStrokeStyle(1, 0x00aaff, 0.4).setOrigin(0.5).setDepth(40);

    this.makeChip(secX + 120, secY + 12, '✦ QR JOIN CARD ✦', 0x00061a, 0x00aaff, 11);

    // QR card
    const qrBg = this.add.rectangle(secX + 120, secY + 100, 160, 150, 0x060010)
      .setStrokeStyle(2, 0x00aaff).setOrigin(0.5).setDepth(50);
    this.add.text(secX + 120, secY + 46, 'JOIN THE GAME', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(51);

    // QR pattern (geometric grid)
    const g = this.add.graphics().setDepth(51);
    const qx = secX + 50, qy = secY + 60;
    g.fillStyle(0xffffff, 1);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 0 || (r < 2 && c < 2) || (r < 2 && c > 5) || (r > 5 && c < 2)) {
          g.fillRect(qx + c * 10, qy + r * 10, 9, 9);
        }
      }
    }
    g.lineStyle(2, 0x00aaff, 1);
    g.strokeRect(qx - 2, qy - 2, 84, 84);

    this.add.text(secX + 120, secY + 148, 'SCAN TO JOIN', {
      fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#00aaff',
    }).setOrigin(0.5).setDepth(51);
    this.add.text(secX + 120, secY + 162, '★ ★ ★', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(51);

    qrBg; // referenced

    // PAYMENT METHODS
    this.makeChip(secX + 120, secY + 182, '✦ PAYMENT METHODS ✦', 0x00061a, 0x00aaff, 10);

    PAYMENT_METHODS.forEach((pm, i) => {
      const py = secY + 200 + i * 24;
      this.add.rectangle(secX + 120, py, 200, 20, 0x060010)
        .setStrokeStyle(1, 0x004466).setOrigin(0.5).setDepth(50);
      this.add.text(secX + 44, py, pm.icon, { fontSize: '12px' }).setOrigin(0, 0.5).setDepth(51);
      this.add.text(secX + 64, py, pm.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#aaaaaa',
      }).setOrigin(0, 0.5).setDepth(51);
    });
  }

  // ── MEMBERSHIP STATUS BAR ─────────────────────────────────────────────────
  private buildStatusBar(): void {
    const barY = GAME_HEIGHT - 100;
    this.add.rectangle(GAME_WIDTH / 2, barY, GAME_WIDTH - 40, 44, 0x08020e)
      .setStrokeStyle(1, 0xffd700).setOrigin(0.5).setDepth(60);

    this.makeChip(140, barY, '★ MEMBERSHIP STATUS BAR ★', 0x080010, 0xffd700, 10)
      .setDepth(61);

    // Avatar icon
    const g = this.add.graphics().setDepth(61);
    g.fillStyle(0xc100ff, 1);
    g.fillCircle(32, barY, 12);
    g.fillStyle(0x440088, 1);
    g.fillCircle(32, barY, 8);

    const m = this.member;
    const tierLabel = m ? `${m.badge} MEMBER` : 'GUEST';
    const statusLabel = m ? (m.active ? '★ ACTIVE • THANK YOU!' : '⚠ INACTIVE') : 'NOT ENROLLED';
    const renewLabel = m ? `RENEWS IN  ${countdownStr(m.renewsAt)}` : '';

    this.statusText = this.add.text(200, barY - 8, tierLabel, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
    }).setOrigin(0, 0.5).setDepth(61);

    this.add.text(200, barY + 8, statusLabel, {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#c100ff',
    }).setOrigin(0, 0.5).setDepth(61);

    this.countdownText = this.add.text(GAME_WIDTH - 40, barY, renewLabel, {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd700',
    }).setOrigin(1, 0.5).setDepth(61);

    // Countdown tick
    this.time.addEvent({
      delay: 30000,
      callback: () => {
        if (this.member) this.countdownText.setText(`RENEWS IN  ${countdownStr(this.member.renewsAt)}`);
      },
      loop: true,
    });

    // Upgrade badges
    const badges = ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'VIP'];
    const badgeColors = [0x8B4513, 0xC0C0C0, 0xFFD700, 0xE5E4E2, 0xC100FF];
    badges.forEach((b, i) => {
      const bx = GAME_WIDTH / 2 + 60 + i * 60;
      const isOwned = m?.badge === b;
      const bg = this.add.graphics().setDepth(61);
      bg.fillStyle(isOwned ? badgeColors[i] : 0x111111, isOwned ? 0.9 : 0.4);
      bg.fillRoundedRect(bx - 22, barY - 16, 44, 32, 4);
      bg.lineStyle(1, isOwned ? badgeColors[i] : 0x333333, 1);
      bg.strokeRoundedRect(bx - 22, barY - 16, 44, 32, 4);
      this.add.text(bx, barY, b, {
        fontFamily: 'monospace', fontSize: '7px',
        color: isOwned ? '#000000' : '#333333',
      }).setOrigin(0.5).setDepth(62);
    });
  }

  // ── PRIVATE MEMBER RULES ──────────────────────────────────────────────────
  private buildPrivateRules(): void {
    const rx = GAME_WIDTH / 2, ry = GAME_HEIGHT - 174;
    this.makeChip(rx, ry - 10, '✦ PRIVATE MEMBER RULES ✦', 0x080010, 0xffd700, 10).setDepth(55);

    const rules = [
      { icon: '🔒', rule: 'MEMBERS ONLY: This game is for active members only.' },
      { icon: '$',  rule: 'ENTRY DUES: Dues must be paid to participate.'       },
      { icon: '🎴', rule: 'CARD PACKS: Unlock 2 or 3 cards per round.'          },
      { icon: '♥',  rule: 'RESPECT: Be respectful and follow host rules.'       },
      { icon: '🚫', rule: 'NO REFUNDS: All dues and purchases are final.'       },
    ];
    rules.forEach((r, i) => {
      const lx = GAME_WIDTH / 2 - 240;
      const ly = ry + 6 + i * 16;
      this.add.text(lx, ly, r.icon, { fontSize: '11px' }).setOrigin(0, 0.5).setDepth(55);
      this.add.text(lx + 22, ly, r.rule, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#888888',
      }).setOrigin(0, 0.5).setDepth(55);
    });
    this.add.text(rx, ry + 88, '★ ★ ★', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(55);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  private buildFooter(): void {
    const y = GAME_HEIGHT - 18;
    const items = [
      { icon: '🔒', label: 'SECURE & ENCRYPTED' },
      { icon: '🚫', label: 'NO REFUNDS'          },
      { icon: '💬', label: 'QUESTIONS? CONTACT HOST' },
      { icon: '♥',  label: 'THANK YOU FOR SUPPORTING!' },
    ];
    const totalW = items.length * 280;
    let x = (GAME_WIDTH - totalW) / 2 + 140;
    items.forEach(item => {
      this.add.text(x, y, `${item.icon} ${item.label}`, {
        fontFamily: 'Arial, sans-serif', fontSize: '10px', color: '#444444',
      }).setOrigin(0.5).setDepth(55);
      x += 280;
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private makeChip(x: number, y: number, label: string, fill: number, border: number, fontSize: number): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, label, {
      fontFamily: 'Arial, sans-serif', fontSize: `${fontSize}px`,
      color: `#${border.toString(16).padStart(6, '0')}`,
      backgroundColor: `#${fill.toString(16).padStart(6, '0')}`,
      padding: { x: 10, y: 4 },
    }).setOrigin(0.5).setDepth(52);
    return t;
  }

  private selectTier(tier: MemberRecord['tier'], idx: number): void {
    this.selectedTier = tier;
    const lbl = this.children.getByName('sel_dues_lbl') as Phaser.GameObjects.Text | null;
    if (lbl) lbl.setText(`SELECT: ${DUES[idx].price} ${tier}`);
  }

  private selectCards(n: number, _bg: Phaser.GameObjects.Rectangle): void {
    this.selectedCards = n;
  }

  private confirmDues(btn: Phaser.GameObjects.Text): void {
    if (!this.selectedTier) {
      btn.setText('PICK A TIER FIRST!');
      this.time.delayedCall(1500, () => btn.setText('SELECT DUES'));
      return;
    }
    const due = DUES.find(d => d.tier === this.selectedTier)!;
    const m: MemberRecord = {
      tier: this.selectedTier,
      cardCount: this.selectedCards || 2,
      cardNumber: generateCardNumber(),
      renewsAt: renewMs(this.selectedTier),
      badge: due.badge,
      active: true,
    };
    saveMember(m);
    this.member = m;
    this.showConfirmation(m);
  }

  private buyCards(n: number): void {
    if (!this.member) {
      this.showToast('PICK A DUES TIER FIRST!');
      return;
    }
    this.member.cardCount += n;
    saveMember(this.member);
    this.showToast(`✔ ${n} CARDS ADDED — TOTAL: ${this.member.cardCount}`);
  }

  private showConfirmation(m: MemberRecord): void {
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8).setDepth(9000);
    this.tweens.add({ targets: overlay, alpha: { from: 0, to: 0.8 }, duration: 300 });

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 500, 280, 0x08020e)
      .setStrokeStyle(3, 0xffd700).setDepth(9001);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, '★ APP ACCESS ACTIVATED ★', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(9002);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 55, m.badge + ' MEMBER', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#c100ff',
    }).setOrigin(0.5).setDepth(9002);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, 'YOUR CARD NUMBER:', {
      fontFamily: 'monospace', fontSize: '11px', color: '#888888',
    }).setOrigin(0.5).setDepth(9002);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 2, m.cardNumber, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffd700',
      stroke: '#3d1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(9002);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 32, 'Show this number to Security / Staff / Host to verify entry.', {
      fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(9002);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 65, `CARDS UNLOCKED: ${m.cardCount}   |   RENEWS: ${countdownStr(m.renewsAt)}`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#44cc44',
    }).setOrigin(0.5).setDepth(9002);

    const closeBtn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 200, 36, 0x1a1000)
      .setStrokeStyle(2, 0xffd700).setDepth(9002).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100, 'DONE — THANK YOU!', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(9003);
    closeBtn.on('pointerdown', () => {
      overlay.destroy(); panel.destroy();
      this.scene.restart();
    });

    this.statusText.setText(m.badge + ' MEMBER');
    this.countdownText.setText(`RENEWS IN  ${countdownStr(m.renewsAt)}`);
    panel; closeBtn;
  }

  private showToast(msg: string): void {
    const t = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, msg, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ffd700',
      backgroundColor: '#08020e', padding: { x: 16, y: 8 },
    }).setOrigin(0.5).setDepth(9990);
    this.tweens.add({
      targets: t, alpha: { from: 1, to: 0 }, delay: 1800, duration: 400,
      onComplete: () => t.destroy(),
    });
  }
}

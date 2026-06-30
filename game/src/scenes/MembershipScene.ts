import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { UISystem, UI } from '../systems/UISystem';

// ── MembershipScene ──────────────────────────────────────────────────────────
// Two views controlled by M key or toggle button:
//   MEMBER VIEW  — shows own pass, QR code, wallet strip
//   STAFF VIEW   — shows 5 tier cards with pricing + manage buttons

const TIERS = [
  { id: 'DAILY',   label: 'DAILY',   price: '$9.99',    color: 0x1a3a1a, border: 0x44cc44, ribbon: 'EVENT ACCESS'  },
  { id: 'WEEKLY',  label: 'WEEKLY',  price: '$24.99',   color: 0x1a1a3a, border: 0x4444ee, ribbon: 'VENUE ACCESS'  },
  { id: 'MONTHLY', label: 'MONTHLY', price: '$79.99',   color: 0x3a1a1a, border: 0xee4444, ribbon: 'ACTIVE PLAN'   },
  { id: 'YEARLY',  label: 'YEARLY',  price: '$799.99',  color: 0x2a1a00, border: 0xffd700, ribbon: 'VIP VERIFIED'  },
  { id: 'VIP',     label: 'VIP',     price: '$1,999.99',color: 0x1a0030, border: 0xc100ff, ribbon: 'STAFF ACCESS'  },
] as const;

type TierId = typeof TIERS[number]['id'];

interface MemberRecord {
  name: string;
  id: string;
  tier: TierId;
  expiry: string;
  status: 'ACTIVE' | 'EXPIRES SOON' | 'EXPIRED';
}

function loadMember(): MemberRecord {
  try {
    const raw = localStorage.getItem('hvas_member');
    if (raw) return JSON.parse(raw) as MemberRecord;
  } catch { /* ignore */ }
  return {
    name: 'GUEST',
    id: 'HMVIP-00000000',
    tier: 'DAILY',
    expiry: '31 DEC 2025',
    status: 'ACTIVE',
  };
}

function saveMember(m: MemberRecord): void {
  localStorage.setItem('hvas_member', JSON.stringify(m));
}

export class MembershipScene extends Phaser.Scene {
  private mode: 'member' | 'staff' = 'member';
  private memberView!: Phaser.GameObjects.Container;
  private staffView!: Phaser.GameObjects.Container;
  private member: MemberRecord = loadMember();

  constructor() { super('Membership'); }

  create(): void {
    this.member = loadMember();

    // Background
    if (UISystem.ready(this)) {
      UISystem.backdrop(this, UI.lsbMembership, 1, -5000);
    } else {
      this.cameras.main.setBackgroundColor(0x080412);
    }

    // Header
    this.add.rectangle(GAME_WIDTH / 2, 28, GAME_WIDTH, 56, 0x08020f, 0.92).setDepth(100);
    this.add.text(GAME_WIDTH / 2, 18, 'HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#c100ff',
    }).setOrigin(0.5, 0).setDepth(101);
    this.add.text(GAME_WIDTH / 2, 38, 'MEMBERSHIP PORTAL', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#ffd700',
    }).setOrigin(0.5, 0).setDepth(101);

    // Toggle button
    const toggleBg = this.add.rectangle(GAME_WIDTH - 120, 28, 190, 36, 0x1a0030)
      .setStrokeStyle(1, 0xc100ff).setDepth(200).setInteractive({ useHandCursor: true });
    const toggleLbl = this.add.text(GAME_WIDTH - 120, 28, '[ MEMBER VIEW ]', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(201);
    toggleBg.on('pointerdown', () => {
      this.mode = this.mode === 'member' ? 'staff' : 'member';
      toggleLbl.setText(this.mode === 'member' ? '[ MEMBER VIEW ]' : '[ STAFF VIEW ]');
      this.memberView.setVisible(this.mode === 'member');
      this.staffView.setVisible(this.mode === 'staff');
    });

    // Build both views
    this.memberView = this.buildMemberView();
    this.staffView = this.buildStaffView();
    this.staffView.setVisible(false);

    // Footer
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'ESC — Back   M — Toggle View', {
      fontFamily: 'monospace', fontSize: '12px', color: '#554466',
    }).setOrigin(0.5).setDepth(200);

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));
    kb.on('keydown-M', () => toggleBg.emit('pointerdown'));
  }

  private buildMemberView(): Phaser.GameObjects.Container {
    const grp = this.add.container(0, 0).setDepth(50);
    const cx = GAME_WIDTH / 2;

    const tier = TIERS.find(t => t.id === this.member.tier) ?? TIERS[0];

    // Main pass card
    const cardW = 480, cardH = 280, cardY = 260;
    const card = this.add.rectangle(cx, cardY, cardW, cardH, tier.color)
      .setStrokeStyle(3, tier.border);
    grp.add(card);

    // Shield emblem (geometric stand-in)
    const shield = this.add.graphics();
    shield.fillStyle(tier.border, 0.25);
    shield.fillRoundedRect(cx - cardW / 2 + 20, cardY - cardH / 2 + 20, 80, 80, 8);
    shield.lineStyle(2, tier.border, 0.9);
    shield.strokeRoundedRect(cx - cardW / 2 + 20, cardY - cardH / 2 + 20, 80, 80, 8);
    shield.fillStyle(0xffffff, 0.08);
    shield.fillTriangle(
      cx - cardW / 2 + 60, cardY - cardH / 2 + 28,
      cx - cardW / 2 + 28, cardY - cardH / 2 + 72,
      cx - cardW / 2 + 92, cardY - cardH / 2 + 72,
    );
    grp.add(shield);

    // Tier badge
    const tierBg = this.add.rectangle(cx + cardW / 2 - 60, cardY - cardH / 2 + 24, 100, 28, tier.border)
      .setOrigin(0.5);
    grp.add(tierBg);
    const tierLbl = this.add.text(cx + cardW / 2 - 60, cardY - cardH / 2 + 24, tier.label, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '13px', color: '#000000',
    }).setOrigin(0.5);
    grp.add(tierLbl);

    // Member name & ID
    const nameT = this.add.text(cx - cardW / 2 + 120, cardY - cardH / 2 + 30, this.member.name, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffffff',
    }).setOrigin(0, 0);
    grp.add(nameT);

    const idT = this.add.text(cx - cardW / 2 + 120, cardY - cardH / 2 + 58, this.member.id, {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0, 0);
    grp.add(idT);

    // Expiry
    const expT = this.add.text(cx - cardW / 2 + 120, cardY - cardH / 2 + 78, `EXPIRES: ${this.member.expiry}`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#888888',
    }).setOrigin(0, 0);
    grp.add(expT);

    // Status ribbon
    const statusColor = this.member.status === 'ACTIVE' ? 0x44cc44
      : this.member.status === 'EXPIRES SOON' ? 0xffaa00 : 0xee4444;
    const ribbonBg = this.add.rectangle(cx - cardW / 2 + 20, cardY + cardH / 2 - 28, 160, 28, statusColor, 0.18)
      .setStrokeStyle(1, statusColor).setOrigin(0, 0.5);
    grp.add(ribbonBg);
    const ribbonT = this.add.text(cx - cardW / 2 + 100, cardY + cardH / 2 - 28, this.member.status, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: `#${statusColor.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5);
    grp.add(ribbonT);

    // Ribbon label from tier
    const tierRibbonBg = this.add.rectangle(cx - cardW / 2 + 200, cardY + cardH / 2 - 28, 140, 28, tier.border, 0.12)
      .setStrokeStyle(1, tier.border).setOrigin(0, 0.5);
    grp.add(tierRibbonBg);
    const tierRibbonT = this.add.text(cx - cardW / 2 + 270, cardY + cardH / 2 - 28, tier.ribbon, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: `#${tier.border.toString(16).padStart(6, '0')}`,
    }).setOrigin(0.5);
    grp.add(tierRibbonT);

    // QR placeholder
    const qrX = cx + cardW / 2 - 80, qrY = cardY + 20;
    const qr = this.add.rectangle(qrX, qrY, 110, 110, 0x111111).setStrokeStyle(2, 0x444444);
    grp.add(qr);
    const qrT = this.add.text(qrX, qrY, 'QR', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5);
    grp.add(qrT);
    const qrSub = this.add.text(qrX, qrY + 30, 'SHOW TO STAFF', {
      fontFamily: 'monospace', fontSize: '9px', color: '#555555',
    }).setOrigin(0.5);
    grp.add(qrSub);

    // Pass wallet strip (scrollable)
    const walletY = GAME_HEIGHT - 90;
    this.add.text(cx - cardW / 2, walletY - 28, 'MY PASSES', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '11px', color: '#8877aa',
    }).setDepth(51);

    const walletBg = this.add.rectangle(cx, walletY, GAME_WIDTH - 40, 70, 0x0a0718)
      .setStrokeStyle(1, 0x2a1a44).setDepth(50);
    grp.add(walletBg);

    TIERS.forEach((t, i) => {
      const wx = cx - (TIERS.length * 140) / 2 + i * 140 + 70;
      const isOwned = t.id === this.member.tier;
      const passCard = this.add.rectangle(wx, walletY, 130, 58, isOwned ? t.color : 0x0a0614)
        .setStrokeStyle(2, isOwned ? t.border : 0x2a1a44).setDepth(52);
      grp.add(passCard);
      const passT = this.add.text(wx, walletY - 10, t.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '12px',
        color: isOwned ? `#${t.border.toString(16).padStart(6,'0')}` : '#333333',
      }).setOrigin(0.5).setDepth(53);
      grp.add(passT);
      const priceT = this.add.text(wx, walletY + 10, t.price, {
        fontFamily: 'monospace', fontSize: '11px', color: isOwned ? '#ffd700' : '#333333',
      }).setOrigin(0.5).setDepth(53);
      grp.add(priceT);
    });

    return grp;
  }

  private buildStaffView(): Phaser.GameObjects.Container {
    const grp = this.add.container(0, 0).setDepth(50);
    const CARD_W = 210, CARD_H = 300;
    const startX = (GAME_WIDTH - TIERS.length * (CARD_W + 16)) / 2 + CARD_W / 2;

    TIERS.forEach((tier, i) => {
      const cx = startX + i * (CARD_W + 16);
      const cy = GAME_HEIGHT / 2 - 20;

      const card = this.add.rectangle(cx, cy, CARD_W, CARD_H, tier.color)
        .setStrokeStyle(3, tier.border);
      grp.add(card);

      // Shield
      const sg = this.add.graphics();
      sg.fillStyle(tier.border, 0.2);
      sg.fillRoundedRect(cx - 30, cy - CARD_H / 2 + 16, 60, 60, 6);
      sg.lineStyle(2, tier.border, 0.9);
      sg.strokeRoundedRect(cx - 30, cy - CARD_H / 2 + 16, 60, 60, 6);
      sg.fillStyle(0xffffff, 0.1);
      sg.fillTriangle(cx, cy - CARD_H / 2 + 22, cx - 22, cy - CARD_H / 2 + 70, cx + 22, cy - CARD_H / 2 + 70);
      grp.add(sg);

      const nameT = this.add.text(cx, cy - CARD_H / 2 + 88, tier.label, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '16px',
        color: `#${tier.border.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5, 0);
      grp.add(nameT);

      const priceT = this.add.text(cx, cy - CARD_H / 2 + 112, tier.price, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffd700',
      }).setOrigin(0.5, 0);
      grp.add(priceT);

      // Ribbon
      const ribbonBg = this.add.rectangle(cx, cy - CARD_H / 2 + 148, CARD_W - 20, 24, tier.border, 0.18)
        .setStrokeStyle(1, tier.border);
      grp.add(ribbonBg);
      const ribbonT = this.add.text(cx, cy - CARD_H / 2 + 148, tier.ribbon, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '10px',
        color: `#${tier.border.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);
      grp.add(ribbonT);

      // Price digits display (gold-style)
      const digitsT = this.add.text(cx, cy - CARD_H / 2 + 180, `PER ${tier.label}`, {
        fontFamily: 'monospace', fontSize: '10px', color: '#555555',
      }).setOrigin(0.5);
      grp.add(digitsT);

      // SELECT / UPGRADE / RENEW button
      const isOwned = tier.id === this.member.tier;
      const btnLabel = isOwned
        ? 'RENEW PLAN'
        : (TIERS.indexOf(tier) > TIERS.findIndex(t => t.id === this.member.tier)
            ? 'UPGRADE' : 'SELECT PLAN');
      const btnBg = this.add.rectangle(cx, cy + CARD_H / 2 - 28, CARD_W - 20, 34, 0x000000, 0)
        .setStrokeStyle(2, tier.border).setInteractive({ useHandCursor: true });
      btnBg.on('pointerdown', () => this.selectTier(tier.id));
      btnBg.on('pointerover', () => btnBg.setFillStyle(tier.border, 0.15));
      btnBg.on('pointerout',  () => btnBg.setFillStyle(0x000000, 0));
      grp.add(btnBg);
      const btnT = this.add.text(cx, cy + CARD_H / 2 - 28, btnLabel, {
        fontFamily: 'Arial Black, sans-serif', fontSize: '11px',
        color: `#${tier.border.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);
      grp.add(btnT);

      if (isOwned) {
        const ownedChip = this.add.rectangle(cx, cy + CARD_H / 2 - 66, CARD_W - 20, 24, tier.border, 0.25);
        grp.add(ownedChip);
        const ownedT = this.add.text(cx, cy + CARD_H / 2 - 66, '✓ CURRENT PLAN', {
          fontFamily: 'Arial Black, sans-serif', fontSize: '10px', color: '#ffffff',
        }).setOrigin(0.5);
        grp.add(ownedT);
      }
    });

    return grp;
  }

  private selectTier(tier: TierId): void {
    this.member.tier = tier;
    this.member.status = 'ACTIVE';
    saveMember(this.member);
    // Rebuild views
    this.memberView.destroy();
    this.staffView.destroy();
    this.memberView = this.buildMemberView();
    this.staffView = this.buildStaffView();
    const isStaff = this.mode === 'staff';
    this.memberView.setVisible(!isStaff);
    this.staffView.setVisible(isStaff);
  }
}

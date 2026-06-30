import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS, ASSET_BASE } from '../config';
import { ProgressionSystem, STAGE_SEQUENCE, STAGE_UNLOCKS } from '../systems/ProgressionSystem';
import { UISystem, UI } from '../systems/UISystem';
import type { StageId } from '../systems/ProgressionSystem';

// Map stage index (0-based) to vmStageBadge key.
const STAGE_BADGE_KEYS: string[] = [
  UI.vmStageBadge1, UI.vmStageBadge2, UI.vmStageBadge3, UI.vmStageBadge4,
  UI.vmStageBadge5, UI.vmStageBadge6, UI.vmStageBadge7,
];
// Venue interior thumbnail keys cycle for card backgrounds.
const THUMB_KEYS: string[] = [UI.vmThumb2, UI.vmThumb0, UI.vmThumb1, UI.vmThumb3];

// Stage display metadata — name, boss name, boss charId, backdrop hint.
const STAGE_META: Record<StageId, { name: string; boss: string; bossCharId: number }> = {
  cafe8fifty:             { name: 'Cafe8Fifty Streets',        boss: 'Big Soulja',    bossCharId: 21 },
  dukes_exterior:         { name: "Duke's — Outside",          boss: 'ELD',           bossCharId: 22 },
  kcs_exterior:           { name: 'Kingdom Come Saloon',       boss: 'KT',            bossCharId: 20 },
  outta_exterior:         { name: 'Outta Pocket — Outside',    boss: 'Predator Pete', bossCharId: 30 },
  qhf_exterior:           { name: 'Quick Hit Fuel — Outside',  boss: 'The Dancer',    bossCharId: 8  },
  social_gaines_exterior: { name: 'Social Gaines — Outside',   boss: 'The Photographer', bossCharId: 6 },
  tally_exterior:         { name: 'Tally Row',                 boss: 'Kendrick',      bossCharId: 14 },
};

const VENUE_NAMES: Record<string, string> = {
  hitmans_vip_inside:       "Hitman's VIP",
  dukes_inside:             "Duke's — Inside",
  kcs_inside:               'Kingdom Come Saloon',
  outta_inside:             'Outta Pocket',
  qhf_inside:               'Quick Hit Fuel',
  social_gaines_inside:     'Social Gaines',
  success_inside:           'Success Rooftop',
  tally_public_hall_inside: 'Public Hall',
  tally_sammys_inside:      "Sammy's",
  tally_13rave_inside:      '13Rave',
  tally_den_inside:         'The Den',
  tally_itus_inside:        'Itus',
};

const CARD_W = 120;
const CARD_H = 170;
const CARD_PAD = 12;
const TOTAL_W = STAGE_SEQUENCE.length * (CARD_W + CARD_PAD) - CARD_PAD;
const START_X = (GAME_WIDTH - TOTAL_W) / 2 + CARD_W / 2;
const CARDS_Y = GAME_HEIGHT / 2 - 10;

export class StageSelectScene extends Phaser.Scene {
  private cursor = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private detailText!: Phaser.GameObjects.Text;
  private venueText!: Phaser.GameObjects.Text;

  constructor() { super(SCENE.StageSelect); }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // District map frame background — prefer the full city map art
    if (UISystem.ready(this) && this.textures.exists(UI.vmMapFrame)) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI.vmMapFrame)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH - 20, GAME_HEIGHT - 20)
        .setAlpha(0.22).setDepth(-100);
    } else if (UISystem.ready(this) && this.textures.exists(UI.ssMapFrame)) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, UI.ssMapFrame)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH - 20, GAME_HEIGHT - 20)
        .setAlpha(0.18).setDepth(-100);
    }

    // Stage info panel (right side)
    if (UISystem.ready(this) && this.textures.exists(UI.ssStageInfoPanel)) {
      this.add.image(GAME_WIDTH - 10, GAME_HEIGHT / 2 + 10, UI.ssStageInfoPanel)
        .setOrigin(1, 0.5).setDisplaySize(240, 280).setAlpha(0.7).setDepth(-50);
    }

    // Legend panel (top-left overlay)
    if (UISystem.ready(this) && this.textures.exists(UI.ssLegendPanel)) {
      this.add.image(8, GAME_HEIGHT - 8, UI.ssLegendPanel)
        .setOrigin(0, 1).setDisplaySize(200, 80).setAlpha(0.65);
    }

    // Title.
    this.add.text(GAME_WIDTH / 2, 28, 'QUEST — STAGE SELECT', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '26px',
      color: '#ffd700',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 60, 'Arrow keys / A·D to choose • Enter / Space to fight • ESC back', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#554466',
    }).setOrigin(0.5);

    // Progress line (beaten count).
    const beaten = ProgressionSystem.getBeatenBosses().length;
    const total = STAGE_SEQUENCE.length;
    this.add.text(GAME_WIDTH / 2, 82, `${beaten} / ${total} stages cleared`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // Stage cards.
    for (let i = 0; i < STAGE_SEQUENCE.length; i++) {
      this.cards.push(this.buildCard(i));
    }

    // Detail strip at bottom.
    this.detailText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 60, '', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);

    this.venueText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 36, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#aaaaaa',
      align: 'center',
    }).setOrigin(0.5);

    // Keyboard nav.
    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT',  () => this.move(-1));
    kb.on('keydown-A',     () => this.move(-1));
    kb.on('keydown-RIGHT', () => this.move(1));
    kb.on('keydown-D',     () => this.move(1));
    kb.on('keydown-ENTER', () => this.launch());
    kb.on('keydown-SPACE', () => this.launch());
    kb.on('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));

    this.refreshCards();
  }

  private buildCard(i: number): Phaser.GameObjects.Container {
    const stageId = STAGE_SEQUENCE[i];
    const meta = STAGE_META[stageId];
    const beaten = ProgressionSystem.isBossBeaten(stageId);
    const locked = i > 0 && !ProgressionSystem.isBossBeaten(STAGE_SEQUENCE[i - 1]);

    const cx = START_X + i * (CARD_W + CARD_PAD);
    const cy = CARDS_Y;

    const grp = this.add.container(cx, cy);

    // Card background.
    const bgColor = locked ? 0x0e0b16 : beaten ? 0x0d2010 : 0x1a1030;
    const strokeColor = locked ? 0x2a2040 : beaten ? 0x33aa55 : 0x6644aa;
    const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, bgColor)
      .setStrokeStyle(2, strokeColor);
    grp.add(bg);

    // Venue thumbnail background inside card (from vmThumb set).
    const thumbKey = THUMB_KEYS[i % THUMB_KEYS.length];
    if (!locked && this.textures.exists(thumbKey)) {
      grp.add(
        this.add.image(0, -10, thumbKey)
          .setDisplaySize(CARD_W - 8, CARD_H - 50)
          .setAlpha(beaten ? 0.45 : 0.6)
          .setDepth(-1),
      );
    }

    // Probe for real stage backdrop as an upgrade (async, uses world coords).
    const backdropKey = `stage_thumb_${stageId}`;
    if (!locked) {
      this.probeThumb(stageId, backdropKey, cx, cy - 10);
    }

    // Lock overlay.
    if (locked) {
      grp.add(this.add.text(0, -20, '🔒', { fontSize: '28px' }).setOrigin(0.5));
      grp.add(this.add.text(0, 16, 'LOCKED', {
        fontFamily: 'monospace', fontSize: '10px', color: '#443355',
      }).setOrigin(0.5));
      const prevMeta = STAGE_META[STAGE_SEQUENCE[i - 1]];
      grp.add(this.add.text(0, 32, `Beat ${prevMeta.boss}`, {
        fontFamily: 'monospace', fontSize: '9px', color: '#443355',
        wordWrap: { width: CARD_W - 12 },
      }).setOrigin(0.5));
    } else {
      // Stage name.
      grp.add(this.add.text(0, -CARD_H / 2 + 12, meta.name, {
        fontFamily: 'monospace', fontSize: '9px', color: beaten ? '#44dd88' : '#ccbbee',
        wordWrap: { width: CARD_W - 10 },
        align: 'center',
      }).setOrigin(0.5));

      // Boss label.
      grp.add(this.add.text(0, CARD_H / 2 - 28, `BOSS: ${meta.boss}`, {
        fontFamily: 'monospace', fontSize: '9px', color: '#ff8844',
      }).setOrigin(0.5));

      // Beaten stamp.
      if (beaten) {
        const stamp = this.add.text(0, 0, 'CLEARED', {
          fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#33dd66',
        }).setOrigin(0.5).setAlpha(0.6).setAngle(-18);
        grp.add(stamp);
      }
    }

    // Stage number badge — real art if available, plain text fallback.
    const badgeKey = STAGE_BADGE_KEYS[i];
    if (badgeKey && this.textures.exists(badgeKey)) {
      grp.add(
        this.add.image(-CARD_W / 2 + 20, -CARD_H / 2 + 22, badgeKey)
          .setOrigin(0.5).setDisplaySize(38, 38),
      );
    } else {
      grp.add(
        this.add.text(-CARD_W / 2 + 8, -CARD_H / 2 + 8, `${i + 1}`, {
          fontFamily: 'monospace', fontSize: '11px', color: '#887799',
        }).setOrigin(0, 0),
      );
    }

    // Click support.
    bg.setInteractive({ useHandCursor: !locked });
    bg.on('pointerover', () => { this.cursor = i; this.refreshCards(); });
    bg.on('pointerdown', () => { this.cursor = i; this.launch(); });

    return grp;
  }

  private probeThumb(stageId: string, key: string, cx: number, cy: number): void {
    // Map stageId to backdrop path same way stage JSONs do.
    const pathMap: Record<StageId, string> = {
      cafe8fifty:             'venues/cafe8fifty_exterior.png',
      dukes_exterior:         'venues/dukes_exterior.png',
      kcs_exterior:           'venues/kingdom_come_exterior.png',
      outta_exterior:         'venues/outta_exterior.png',
      qhf_exterior:           'venues/qhf_exterior.png',
      social_gaines_exterior: 'venues/social_gaines.png',
      tally_exterior:         'venues/tally_exterior.png',
    };
    const path = pathMap[stageId as StageId];
    if (!path) return;

    const addThumb = (texKey: string) => {
      if (!this.scene.isActive()) return;
      const img = this.add.image(cx, cy, texKey)
        .setDisplaySize(CARD_W - 8, CARD_H - 50)
        .setDepth(-1)
        .setAlpha(0.55);
      // Position relative to card center (container is at cx,cy so we use world coords).
      img.setPosition(cx, cy - 4);
    };

    if (this.textures.exists(key)) { addThumb(key); return; }
    if (this.textures.exists(`stage_bg_${stageId}`)) {
      if (!this.textures.exists(key)) {
        // Alias: just reuse the same source.
        addThumb(`stage_bg_${stageId}`);
      }
      return;
    }
    const probe = new Image();
    probe.onload = () => {
      if (!this.scene.isActive()) return;
      if (!this.textures.exists(key)) this.textures.addImage(key, probe);
      addThumb(key);
    };
    probe.onerror = () => {};
    probe.src = `${ASSET_BASE}${path}`;
  }

  private refreshCards(): void {
    for (let i = 0; i < this.cards.length; i++) {
      const grp = this.cards[i];
      const selected = i === this.cursor;
      const locked = i > 0 && !ProgressionSystem.isBossBeaten(STAGE_SEQUENCE[i - 1]);

      // Scale selected card up.
      this.tweens.add({
        targets: grp,
        scaleX: selected ? 1.07 : 1,
        scaleY: selected ? 1.07 : 1,
        duration: 120,
        ease: 'Quad.out',
      });

      // Tint the card bg rect (first child).
      const bg = grp.list[0] as Phaser.GameObjects.Rectangle;
      if (selected && !locked) {
        bg.setStrokeStyle(3, 0xffd700);
      } else {
        const beaten = ProgressionSystem.isBossBeaten(STAGE_SEQUENCE[i]);
        bg.setStrokeStyle(2, locked ? 0x2a2040 : beaten ? 0x33aa55 : 0x6644aa);
      }
    }

    this.updateDetail();
  }

  private updateDetail(): void {
    const stageId = STAGE_SEQUENCE[this.cursor];
    const meta = STAGE_META[stageId];
    const beaten = ProgressionSystem.isBossBeaten(stageId);
    const locked = this.cursor > 0 && !ProgressionSystem.isBossBeaten(STAGE_SEQUENCE[this.cursor - 1]);

    if (locked) {
      this.detailText.setText(`Stage locked — defeat ${STAGE_META[STAGE_SEQUENCE[this.cursor - 1]].boss} first.`);
      this.venueText.setText('');
      return;
    }

    const status = beaten ? '✓ CLEARED' : 'NOT CLEARED';
    this.detailText.setText(`${meta.name}  |  Boss: ${meta.boss}  |  ${status}`);

    // Venue unlock info.
    const venueId = STAGE_UNLOCKS[stageId];
    const venueName = venueId ? (VENUE_NAMES[venueId] ?? venueId) : null;
    const venueUnlocked = venueId ? ProgressionSystem.isVenueUnlocked(venueId) : false;

    // Extra unlocks (success_rooftop / tally strip).
    let extra = '';
    if (stageId === 'social_gaines_exterior' && beaten) extra = ' + Success Rooftop';
    if (stageId === 'tally_exterior' && beaten) extra = ' + Sammy\'s · The Den · Itus · 13Rave';

    if (venueName) {
      const lockStr = venueUnlocked ? '(unlocked)' : '(locked — beat boss)';
      this.venueText.setText(`Unlocks: ${venueName}${extra}  ${lockStr}`);
    } else {
      this.venueText.setText('');
    }
  }

  private move(dir: number): void {
    this.cursor = Phaser.Math.Clamp(this.cursor + dir, 0, STAGE_SEQUENCE.length - 1);
    this.refreshCards();
  }

  private async launch(): Promise<void> {
    const stageId = STAGE_SEQUENCE[this.cursor];
    const locked = this.cursor > 0 && !ProgressionSystem.isBossBeaten(STAGE_SEQUENCE[this.cursor - 1]);
    if (locked) return;

    try {
      const mod = await import(`../data/stages/${stageId}.json`);
      this.scene.start(SCENE.Brawler, { stage: mod.default ?? mod });
    } catch {
      this.scene.start(SCENE.Brawler);
    }
  }
}

import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AnimationSystem } from '../systems/AnimationSystem';
import { BRAWLER_ANIMS, VENUE_ANIMS, VFX_ANIMS, TOPDOWN_CHAR_IDS } from '../data/animMap';
import { PLAYER_ID, ENEMY_IDS, VENUE_NPC_IDS } from '../data/roster';
import { UISystem } from '../systems/UISystem';
import { AudioSystem } from '../systems/AudioSystem';

const TIPS = [
  'BLOCK (Shift) then ATTACK to grab an enemy.',
  'Double-tap a direction to RUN — faster but no block.',
  'Fill your SUPER meter and press Q to unleash a super move.',
  'Pick up dropped weapons — they deal extra damage.',
  'DODGE (Shift + direction) makes you briefly invulnerable.',
  'Clear all waves to unlock the venue entrance.',
  'VIP members get access to the inner lounge — check in at the door.',
];

export class PreloadScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Rectangle;
  private barW = 500;
  private spinnerImg?: Phaser.GameObjects.Image;
  private pct!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE.Preload);
  }

  preload(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.cameras.main.setBackgroundColor(0x080512);

    const hasLd = (key: string) => this.textures.exists(key);

    // ── Skyline background strip ────────────────────────────────────────────
    if (hasLd('ld_skyline_strip')) {
      this.add.image(cx, GAME_HEIGHT - 1, 'ld_skyline_strip')
        .setOrigin(0.5, 1).setDisplaySize(GAME_WIDTH, 180).setAlpha(0.35);
    }

    // ── Logo ────────────────────────────────────────────────────────────────
    if (hasLd('ld_logo_large')) {
      const logo = this.add.image(cx, cy - 130, 'ld_logo_large')
        .setOrigin(0.5).setDisplaySize(340, 178);
      this.tweens.add({
        targets: logo, scaleX: logo.scaleX * 1.04, scaleY: logo.scaleY * 1.04,
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    } else {
      this.add.text(cx, cy - 90, 'HITMANS VIP', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '44px', color: '#ffd700',
      }).setOrigin(0.5);
      this.add.text(cx, cy - 40, 'AFTER SPOT', {
        fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#c100ff',
      }).setOrigin(0.5);
    }

    // ── "NOW LOADING" text art ──────────────────────────────────────────────
    if (hasLd('ld_now_loading')) {
      this.add.image(cx, cy + 28, 'ld_now_loading')
        .setOrigin(0.5).setDisplaySize(220, 28);
    } else {
      this.add.text(cx, cy + 20, 'LOADING...', {
        fontFamily: 'monospace', fontSize: '14px', color: '#888899',
      }).setOrigin(0.5);
    }

    // ── Loading bar ─────────────────────────────────────────────────────────
    const barH = 14;
    const barY = cy + 64;
    this.barW = 500;

    // Dark trough
    this.add.rectangle(cx, barY, this.barW, barH, 0x1a0f2e).setOrigin(0.5);

    // Fill rectangle (grows with progress)
    this.bar = this.add.rectangle(cx - this.barW / 2, barY, 1, barH, 0xffd700).setOrigin(0, 0.5);

    // Gold bar art overlay (stretched across the full trough width)
    if (hasLd('ld_bar_gold')) {
      this.add.image(cx, barY, 'ld_bar_gold')
        .setOrigin(0.5).setDisplaySize(this.barW, barH + 4).setAlpha(0.35);
    }

    // Percentage text
    this.pct = this.add.text(cx, barY + 20, '0%', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aa99cc',
    }).setOrigin(0.5);

    // ── Spinner ─────────────────────────────────────────────────────────────
    if (hasLd('ld_spinner')) {
      this.spinnerImg = this.add.image(cx + this.barW / 2 + 28, barY, 'ld_spinner')
        .setOrigin(0.5).setDisplaySize(22, 22);
    }

    // ── Tip panel ───────────────────────────────────────────────────────────
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    if (hasLd('ld_tip_panel')) {
      this.add.image(cx, GAME_HEIGHT - 24, 'ld_tip_panel')
        .setOrigin(0.5, 1).setDisplaySize(700, 54);
      this.add.text(cx, GAME_HEIGHT - 24, `TIP: ${tip}`, {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffd700',
        wordWrap: { width: 640 },
      }).setOrigin(0.5, 1);
    } else {
      this.add.text(cx, GAME_HEIGHT - 14, `TIP: ${tip}`, {
        fontFamily: 'monospace', fontSize: '12px', color: '#8877aa',
        wordWrap: { width: 640 },
      }).setOrigin(0.5, 1);
    }

    // ── Wire progress ────────────────────────────────────────────────────────
    this.load.on('progress', (p: number) => {
      this.bar.width = Math.max(1, this.barW * p);
      this.pct.setText(`${Math.round(p * 100)}%`);
    });

    // ── Queue everything ─────────────────────────────────────────────────────
    UISystem.queue(this);
    AudioSystem.queue(this);

    // Only preload the most-used characters — other chars are lazy-loaded
    // by each scene when needed. This cuts preload from ~5000 to ~600 requests.
    const priorityIds = [PLAYER_ID, ...ENEMY_IDS, ...VENUE_NPC_IDS];
    const prioritySet = new Set<number>(priorityIds);
    const topdownSet = new Set<number>(TOPDOWN_CHAR_IDS);
    for (const id of prioritySet) {
      AnimationSystem.queue(this, id, BRAWLER_ANIMS);
      AnimationSystem.queue(this, id, VFX_ANIMS);
      if (topdownSet.has(id)) AnimationSystem.queue(this, id, VENUE_ANIMS);
    }
  }

  override update(): void {
    if (this.spinnerImg) {
      this.spinnerImg.angle += 3;
    }
  }

  create(): void {
    const priorityIds = [PLAYER_ID, ...ENEMY_IDS, ...VENUE_NPC_IDS];
    const topdownSet = new Set<number>(TOPDOWN_CHAR_IDS);
    for (const id of priorityIds) {
      AnimationSystem.build(this, id, BRAWLER_ANIMS);
      AnimationSystem.build(this, id, VFX_ANIMS);
      if (topdownSet.has(id)) AnimationSystem.build(this, id, VENUE_ANIMS);
    }

    this.time.delayedCall(400, () => this.scene.start(SCENE.MainMenu));
    AudioSystem.playForScene(this, 'MainMenu');
  }
}

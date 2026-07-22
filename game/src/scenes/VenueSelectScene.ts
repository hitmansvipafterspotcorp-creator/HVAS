import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import { UISystem, UI } from '../systems/UISystem';
import { AudioSystem } from '../systems/AudioSystem';

// All venues with display metadata. Order mirrors the canonical quest flow:
// Cafe8Fifty → HITMANS VIP → Kingdom Come Saloon → Social Gaines →
// Success Rooftop → Outta Pocket → Tally Row (13 Rave, Public Hall, Sammy's,
// Itus, The Den) → Dukes & Dimes → Quick Hit Fuel.
const ALL_VENUES = [
  { id: 'hitmans_vip_inside',       name: "Hitman's VIP After Spot", area: 'Cafe8Fifty',     always: true },
  { id: 'kcs_inside',               name: 'Kingdom Come Saloon',     area: 'KCS',             always: false },
  { id: 'social_gaines_inside',     name: 'Social Gaines',           area: 'Social Gaines',   always: false },
  { id: 'success_inside',           name: 'Success Rooftop Lounge',  area: 'Success',         always: false },
  { id: 'outta_inside',             name: 'Outta Pocket',            area: 'Outta Pocket',    always: false },
  { id: 'tally_13rave_inside',      name: '13Rave',                  area: 'Tally Row',       always: false },
  { id: 'tally_public_hall_inside', name: 'Public Hall',             area: 'Tally Row',       always: false },
  { id: 'tally_sammys_inside',      name: "Sammy's",                 area: 'Tally Row',       always: false },
  { id: 'tally_itus_inside',        name: 'Itus',                    area: 'Tally Row',       always: false },
  { id: 'tally_den_inside',         name: 'The Den',                 area: 'Tally Row',       always: false },
  { id: 'dukes_inside',             name: "Duke's — Inside",         area: "Duke's",          always: false },
  { id: 'qhf_inside',               name: 'Quick Hit Fuel',          area: 'QHF',             always: false },
];

// Venue card art keys — prefer the dedicated unlocked/locked card templates.
// Interior thumbnail keys cycle for unlocked card backgrounds.
const THUMB_KEYS = [UI.vmThumb0, UI.vmThumb1, UI.vmThumb2, UI.vmThumb3];

const ROW_W = 380;
const ROW_H = 42;
const COL1_X = GAME_WIDTH / 2 - 240;
const COL2_X = GAME_WIDTH / 2 + 60;
const ROW_Y0 = 96;
const ROW_GAP = 48;

export class VenueSelectScene extends Phaser.Scene {
  private cursor = 0;
  private rows: Phaser.GameObjects.Container[] = [];
  private rowBgs: Phaser.GameObjects.Image[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private hasArt = false;

  constructor() { super(SCENE.VenueSelect); }

  create(): void {
    AudioSystem.playForScene(this, 'MainMenu');
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.hasArt = UISystem.ready(this);

    // ── District map background ──────────────────────────────────────────
    const mapKey = (this.hasArt && this.textures.exists(UI.vmMapFrame))
      ? UI.vmMapFrame
      : (this.hasArt && this.textures.exists(UI.ssMapFrame) ? UI.ssMapFrame : null);
    if (mapKey) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, mapKey)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH - 20, GAME_HEIGHT - 20)
        .setAlpha(0.15).setDepth(-100);
    }

    // ── Title bar art ────────────────────────────────────────────────────
    if (this.hasArt && this.textures.exists(UI.u1TitleBar1)) {
      this.add.image(GAME_WIDTH / 2, 28, UI.u1TitleBar1)
        .setOrigin(0.5).setDisplaySize(GAME_WIDTH - 40, 46).setDepth(5).setAlpha(0.9);
    }

    // ── Crown motif left/right of title ──────────────────────────────────
    if (this.hasArt && this.textures.exists(UI.u1MotifCrown)) {
      this.add.image(GAME_WIDTH / 2 - 110, 28, UI.u1MotifCrown)
        .setOrigin(0.5).setDisplaySize(28, 28).setDepth(6).setAlpha(0.8);
      this.add.image(GAME_WIDTH / 2 + 110, 28, UI.u1MotifCrown)
        .setOrigin(0.5).setDisplaySize(28, 28).setDepth(6).setAlpha(0.8);
    }

    // ── Title ────────────────────────────────────────────────────────────
    this.add.text(GAME_WIDTH / 2, 28, 'VENUES', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '24px',
      color: '#ffd700',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(7);

    this.add.text(GAME_WIDTH / 2, 58, 'Beat bosses on the streets to unlock more venues', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#554466',
    }).setOrigin(0.5);

    // ── Column headers ───────────────────────────────────────────────────
    this.add.text(COL1_X + ROW_W / 2, ROW_Y0 - 18, 'MAIN STRIP', {
      fontFamily: 'monospace', fontSize: '10px', color: '#887799',
    }).setOrigin(0.5);
    this.add.text(COL2_X + ROW_W / 2, ROW_Y0 - 18, 'TALLY ROW', {
      fontFamily: 'monospace', fontSize: '10px', color: '#887799',
    }).setOrigin(0.5);

    const unlocked = this.getUnlocked();

    let col1Count = 0;
    let col2Count = 0;

    for (let i = 0; i < ALL_VENUES.length; i++) {
      const v = ALL_VENUES[i];
      const isUnlocked = v.always || unlocked.has(v.id);
      const col = i < 7 ? COL1_X : COL2_X;
      const rowIdx = i < 7 ? col1Count++ : col2Count++;
      const y = ROW_Y0 + rowIdx * ROW_GAP;

      const grp = this.add.container(col, y);

      // Art row background — use unlocked/locked card template, with interior thumb overlay.
      let bgImg: Phaser.GameObjects.Image | null = null;
      if (this.hasArt) {
        // Card template (unlocked or locked art)
        const cardKey = isUnlocked ? UI.vmVenueCardOpen : UI.vmVenueCardLocked;
        if (this.textures.exists(cardKey)) {
          bgImg = this.add.image(ROW_W / 2, 0, cardKey)
            .setOrigin(0.5).setDisplaySize(ROW_W, ROW_H)
            .setAlpha(isUnlocked ? 0.60 : 0.28);
          grp.add(bgImg);
          this.rowBgs.push(bgImg);
        } else {
          // Fallback to cycling thumbnails
          const thumbKey = THUMB_KEYS[i % THUMB_KEYS.length];
          if (this.textures.exists(thumbKey)) {
            bgImg = this.add.image(ROW_W / 2, 0, thumbKey)
              .setOrigin(0.5).setDisplaySize(ROW_W, ROW_H)
              .setAlpha(isUnlocked ? 0.50 : 0.15);
            grp.add(bgImg);
            this.rowBgs.push(bgImg);
          }
        }
      }

      // Fallback plain rectangle (always added for interaction + stroke)
      const bg = this.add.rectangle(ROW_W / 2, 0, ROW_W, ROW_H,
        isUnlocked ? 0x1a1030 : 0x0d0b16, bgImg ? 0 : 1,
      ).setStrokeStyle(1, isUnlocked ? 0x6644aa : 0x2a2040).setOrigin(0.5, 0.5);
      grp.add(bg);

      grp.add(this.add.text(10, 0,
        isUnlocked ? v.name : '???',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: isUnlocked ? '#ffffff' : '#332244',
          stroke: isUnlocked ? '#000000' : undefined,
          strokeThickness: isUnlocked ? 2 : 0,
        },
      ).setOrigin(0, 0.5));

      if (isUnlocked) {
        grp.add(this.add.text(ROW_W - 10, 0, v.area, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ccbbee',
          stroke: '#000000',
          strokeThickness: 2,
        }).setOrigin(1, 0.5));
      }

      if (isUnlocked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => { this.cursor = i; this.refresh(); });
        bg.on('pointerdown', () => { this.cursor = i; this.enter(); });
        if (bgImg) {
          bgImg.setInteractive({ useHandCursor: true });
          bgImg.on('pointerover', () => { this.cursor = i; this.refresh(); });
          bgImg.on('pointerdown', () => { this.cursor = i; this.enter(); });
        }
      }

      this.rows.push(grp);
    }

    // ── Hint bar (bottom) ────────────────────────────────────────────────
    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20,
      '↑↓ navigate • Enter / Space enter venue • ESC back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#554466',
      }).setOrigin(0.5);

    // ── Legend panel (bottom-left) ────────────────────────────────────────
    if (this.hasArt && this.textures.exists(UI.ssLegendPanel)) {
      this.add.image(8, GAME_HEIGHT - 8, UI.ssLegendPanel)
        .setOrigin(0, 1).setDisplaySize(200, 60).setAlpha(0.6);
    }

    // Start cursor on first unlocked.
    this.cursor = ALL_VENUES.findIndex(v => v.always || unlocked.has(v.id));
    if (this.cursor < 0) this.cursor = 0;

    const kb = this.input.keyboard!;
    kb.on('keydown-UP',    () => this.move(-1));
    kb.on('keydown-W',     () => this.move(-1));
    kb.on('keydown-DOWN',  () => this.move(1));
    kb.on('keydown-S',     () => this.move(1));
    kb.on('keydown-ENTER', () => this.enter());
    kb.on('keydown-SPACE', () => this.enter());
    kb.on('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));

    this.refresh();
  }

  private getUnlocked(): Set<string> {
    const s = new Set(ProgressionSystem.getUnlockedVenues() as string[]);
    s.add('hitmans_vip_inside');
    return s;
  }

  private move(dir: number): void {
    const unlocked = this.getUnlocked();
    let next = this.cursor + dir;
    while (next >= 0 && next < ALL_VENUES.length) {
      const v = ALL_VENUES[next];
      if (v.always || unlocked.has(v.id)) break;
      next += dir;
    }
    if (next >= 0 && next < ALL_VENUES.length) this.cursor = next;
    this.refresh();
  }

  private refresh(): void {
    const unlocked = this.getUnlocked();

    for (let i = 0; i < this.rows.length; i++) {
      const grp = this.rows[i];
      const v = ALL_VENUES[i];
      const isUnlocked = v.always || unlocked.has(v.id);
      const selected = i === this.cursor && isUnlocked;

      // The bg rect is always the second child (after optional art image)
      const bgIdx = this.rowBgs.length > 0 ? 1 : 0;
      const bg = grp.list[bgIdx] as Phaser.GameObjects.Rectangle;

      // Art image (first child when present)
      if (this.rowBgs.length > 0) {
        const artImg = grp.list[0] as Phaser.GameObjects.Image;
        artImg.setAlpha(selected ? 0.85 : isUnlocked ? 0.55 : 0.18);
      }

      if (selected) {
        bg.setStrokeStyle(2, 0xffd700);
        this.tweens.add({ targets: grp, scaleX: 1.03, scaleY: 1.03, duration: 90, ease: 'Quad.out' });
      } else {
        bg.setStrokeStyle(1, isUnlocked ? 0x6644aa : 0x2a2040);
        this.tweens.add({ targets: grp, scaleX: 1, scaleY: 1, duration: 90, ease: 'Quad.out' });
      }
    }

    const v = ALL_VENUES[this.cursor];
    const unlockStatus = v.always ? 'Starting venue — always open'
      : unlocked.has(v.id)
        ? `Unlocked  ·  ${v.area}`
        : 'Locked — beat the area boss to unlock';
    this.hintText.setText(
      `↑↓ navigate • Enter / Space enter venue • ESC back   |   ${unlockStatus}`,
    );
  }

  private enter(): void {
    const v = ALL_VENUES[this.cursor];
    const unlocked = this.getUnlocked();
    if (!v.always && !unlocked.has(v.id)) return;
    this.scene.start(SCENE.Venue, { venueId: v.id });
  }
}

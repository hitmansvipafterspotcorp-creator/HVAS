import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config';
import { ProgressionSystem } from '../systems/ProgressionSystem';

// All venues with display metadata. Order mirrors the quest flow.
const ALL_VENUES = [
  { id: 'hitmans_vip_inside',       name: "Hitman's VIP After Spot", area: 'Cafe8Fifty',     always: true },
  { id: 'dukes_inside',             name: "Duke's — Inside",         area: "Duke's",          always: false },
  { id: 'kcs_inside',               name: 'Kingdom Come Saloon',     area: 'KCS',             always: false },
  { id: 'outta_inside',             name: 'Outta Pocket',            area: 'Outta Pocket',    always: false },
  { id: 'qhf_inside',               name: 'Quick Hit Fuel',          area: 'QHF',             always: false },
  { id: 'social_gaines_inside',     name: 'Social Gaines',           area: 'Social Gaines',   always: false },
  { id: 'success_inside',           name: 'Success Rooftop Lounge',  area: 'Success',         always: false },
  { id: 'tally_public_hall_inside', name: 'Public Hall',             area: 'Tally Row',       always: false },
  { id: 'tally_sammys_inside',      name: "Sammy's",                 area: 'Tally Row',       always: false },
  { id: 'tally_13rave_inside',      name: '13Rave',                  area: 'Tally Row',       always: false },
  { id: 'tally_den_inside',         name: 'The Den',                 area: 'Tally Row',       always: false },
  { id: 'tally_itus_inside',        name: 'Itus',                    area: 'Tally Row',       always: false },
];

export class VenueSelectScene extends Phaser.Scene {
  private cursor = 0;
  private rows: Phaser.GameObjects.Container[] = [];
  private hintText!: Phaser.GameObjects.Text;

  constructor() { super(SCENE.VenueSelect); }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.add.text(GAME_WIDTH / 2, 28, 'VENUES', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '28px',
      color: '#ffd700',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 58, 'Beat bosses on the streets to unlock more venues', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#554466',
    }).setOrigin(0.5);

    const unlocked = new Set(ProgressionSystem.getUnlockedVenues());
    // hitmans_vip_inside is always accessible (starting venue).
    unlocked.add('hitmans_vip_inside' as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number]);

    const COL1 = GAME_WIDTH / 2 - 240;
    const COL2 = GAME_WIDTH / 2 + 60;
    let col1Count = 0;
    let col2Count = 0;

    for (let i = 0; i < ALL_VENUES.length; i++) {
      const v = ALL_VENUES[i];
      const isUnlocked = v.always || unlocked.has(v.id as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number]);
      const col = i < 7 ? COL1 : COL2;
      const row = i < 7 ? col1Count++ : col2Count++;
      const y = 96 + row * 46;

      const grp = this.add.container(col, y);

      const bgW = 380;
      const bgH = 38;
      const bg = this.add.rectangle(bgW / 2, 0, bgW, bgH,
        isUnlocked ? 0x1a1030 : 0x0d0b16,
      ).setStrokeStyle(1, isUnlocked ? 0x6644aa : 0x2a2040).setOrigin(0, 0.5);
      grp.add(bg);

      grp.add(this.add.text(12, 0,
        isUnlocked ? v.name : '???',
        {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: isUnlocked ? '#ffffff' : '#332244',
        },
      ).setOrigin(0, 0.5));

      if (isUnlocked) {
        grp.add(this.add.text(bgW - 10, 0, v.area, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#887799',
        }).setOrigin(1, 0.5));
      }

      if (isUnlocked) {
        bg.setInteractive({ useHandCursor: true });
        bg.on('pointerover', () => { this.cursor = i; this.refresh(); });
        bg.on('pointerdown', () => { this.cursor = i; this.enter(); });
      }

      this.rows.push(grp);
    }

    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20,
      '↑↓ navigate • Enter / Space enter venue • ESC back', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#554466',
      }).setOrigin(0.5);

    // Start cursor on first unlocked.
    this.cursor = ALL_VENUES.findIndex(v =>
      v.always || unlocked.has(v.id as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number])
    );
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

  private move(dir: number): void {
    const unlocked = new Set(ProgressionSystem.getUnlockedVenues());
    unlocked.add('hitmans_vip_inside' as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number]);
    let next = this.cursor + dir;
    // Skip locked entries.
    while (next >= 0 && next < ALL_VENUES.length) {
      const v = ALL_VENUES[next];
      if (v.always || unlocked.has(v.id as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number])) break;
      next += dir;
    }
    if (next >= 0 && next < ALL_VENUES.length) this.cursor = next;
    this.refresh();
  }

  private refresh(): void {
    const unlocked = new Set(ProgressionSystem.getUnlockedVenues());
    unlocked.add('hitmans_vip_inside' as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number]);

    for (let i = 0; i < this.rows.length; i++) {
      const grp = this.rows[i];
      const bg = grp.list[0] as Phaser.GameObjects.Rectangle;
      const v = ALL_VENUES[i];
      const isUnlocked = v.always || unlocked.has(v.id as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number]);
      const selected = i === this.cursor && isUnlocked;

      if (selected) {
        bg.setFillStyle(0x2a1a4a);
        bg.setStrokeStyle(2, 0xffd700);
      } else {
        bg.setFillStyle(isUnlocked ? 0x1a1030 : 0x0d0b16);
        bg.setStrokeStyle(1, isUnlocked ? 0x6644aa : 0x2a2040);
      }
    }

    const v = ALL_VENUES[this.cursor];
    const unlockStatus = v.always ? 'Starting venue — always open'
      : unlocked.has(v.id as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number])
        ? `Unlocked  ·  ${v.area}`
        : 'Locked — beat the area boss to unlock';
    this.hintText.setText(
      `↑↓ navigate • Enter / Space enter venue • ESC back   |   ${unlockStatus}`,
    );
  }

  private enter(): void {
    const v = ALL_VENUES[this.cursor];
    const unlocked = new Set(ProgressionSystem.getUnlockedVenues());
    unlocked.add('hitmans_vip_inside' as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number]);
    if (!v.always && !unlocked.has(v.id as ReturnType<typeof ProgressionSystem.getUnlockedVenues>[number])) return;
    this.scene.start(SCENE.Venue, { venueId: v.id });
  }
}

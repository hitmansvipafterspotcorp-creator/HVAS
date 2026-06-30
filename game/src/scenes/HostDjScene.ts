import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AudioSystem } from '../systems/AudioSystem';

// Host/DJ mode — manage a night at Hitmans VIP After Spot.
// Three tabs: HOST (crowd energy via shoutouts/moments), DJ (pick tracks &
// BPM), STAFF (hire/assign crew). Each tick the venue earns Vibe Points.
// Hit 1000 VP to throw a legendary night.

type Tab = 'host' | 'dj' | 'staff';

const TRACKS = [
  { name: 'Late Night Flex',   genre: 'Trap',     bpm: 140, energy: 8  },
  { name: 'After Spot Anthem', genre: 'R&B',      bpm: 96,  energy: 5  },
  { name: 'Crowd Control',     genre: 'Hip-Hop',  bpm: 128, energy: 9  },
  { name: 'VIP Slow Jam',      genre: 'Slow R&B', bpm: 72,  energy: 3  },
  { name: 'Hitmans Drop',      genre: 'Club',     bpm: 156, energy: 10 },
];

const HOST_ACTIONS = [
  { label: 'Shoutout the crowd',   vp: 12, cooldown: 6000  },
  { label: 'Bring out a special guest', vp: 35, cooldown: 20000 },
  { label: 'Announce bottle service',   vp: 18, cooldown: 10000 },
  { label: 'Open the VIP section',      vp: 25, cooldown: 15000 },
  { label: 'Toast the night',          vp: 8,  cooldown: 4000  },
];

const STAFF_ROLES = [
  { role: 'Bouncer',    cost: 40, vpPerSec: 0.5 },
  { role: 'Bartender',  cost: 60, vpPerSec: 0.8 },
  { role: 'Promoter',   cost: 80, vpPerSec: 1.2 },
  { role: 'Hype Man',   cost: 120, vpPerSec: 2.0 },
];

const VP_GOAL = 1000;

export class HostDjScene extends Phaser.Scene {
  private tab: Tab = 'host';
  private vp = 0;
  private budget = 300; // in-game cash
  private currentTrackIdx = 0;
  private staffCounts = [0, 0, 0, 0];
  private actionCooldowns = HOST_ACTIONS.map(() => 0);
  private vpPerSec = 1; // base passive generation
  private won = false;

  // UI refs
  private vpBar!: Phaser.GameObjects.Rectangle;
  private vpText!: Phaser.GameObjects.Text;
  private budgetText!: Phaser.GameObjects.Text;
  private feedText!: Phaser.GameObjects.Text;
  private feedLines: string[] = [];
  private tabContents!: Phaser.GameObjects.Container[];
  private tabBgs!: Phaser.GameObjects.Rectangle[];
  private actionBtns: Phaser.GameObjects.Container[] = [];
  private staffBtns: Phaser.GameObjects.Container[] = [];
  private trackBtns: Phaser.GameObjects.Container[] = [];

  constructor() { super(SCENE.HostDj); }

  create(): void {
    this.won = false;
    this.vp = 0;
    this.budget = 300;
    this.staffCounts = [0, 0, 0, 0];
    this.actionCooldowns = HOST_ACTIONS.map(() => 0);
    this.vpPerSec = 1;
    this.feedLines = [];

    AudioSystem.playForScene(this, 'Venue');
    this.cameras.main.setBackgroundColor(0x06040c);

    // Header bar
    this.add.rectangle(GAME_WIDTH / 2, 22, GAME_WIDTH, 44, 0x0f0920);
    this.add.text(20, 22, 'HOST / DJ', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: '#ffd700',
    }).setOrigin(0, 0.5);
    this.add.text(GAME_WIDTH - 20, 22, 'HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#c100ff',
    }).setOrigin(1, 0.5);

    // VP bar
    this.add.text(20, 52, 'VIBE POINTS', {
      fontFamily: 'monospace', fontSize: '11px', color: '#8877aa',
    });
    this.add.rectangle(GAME_WIDTH / 2, 66, GAME_WIDTH - 40, 14, 0x1a1030).setOrigin(0.5);
    this.vpBar = this.add.rectangle(20, 66, 0, 14, 0xffd700).setOrigin(0, 0.5);
    this.vpText = this.add.text(GAME_WIDTH / 2, 66, '0 / 1000 VP', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ffffff',
    }).setOrigin(0.5);

    // Budget + passive rate
    this.budgetText = this.add.text(GAME_WIDTH - 20, 52, `$${this.budget}  |  ${this.vpPerSec.toFixed(1)} VP/s`, {
      fontFamily: 'monospace', fontSize: '11px', color: '#44dd88',
    }).setOrigin(1, 0);

    // Tab bar
    const TABS: Tab[] = ['host', 'dj', 'staff'];
    const TAB_W = 120;
    this.tabBgs = [];
    TABS.forEach((t, i) => {
      const tx = 20 + i * (TAB_W + 8);
      const bg = this.add.rectangle(tx + TAB_W / 2, 100, TAB_W, 34, t === this.tab ? 0x2a1a44 : 0x12091e)
        .setStrokeStyle(1, 0x3a2a55).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.switchTab(t));
      this.tabBgs.push(bg);
      this.add.text(tx + TAB_W / 2, 100, t.toUpperCase(), {
        fontFamily: 'Arial Black, sans-serif', fontSize: '13px',
        color: t === this.tab ? '#ffd700' : '#776688',
      }).setOrigin(0.5).setName(`tab_lbl_${i}`);
    });

    // Content area
    this.tabContents = [
      this.buildHostTab(),
      this.buildDjTab(),
      this.buildStaffTab(),
    ];
    this.showTab(this.tab);

    // Event feed (right column)
    this.add.rectangle(GAME_WIDTH - 170, 300, 310, 340, 0x0a0718).setOrigin(0.5);
    this.add.text(GAME_WIDTH - 310, 140, 'LIVE FEED', {
      fontFamily: 'monospace', fontSize: '11px', color: '#8877aa',
    });
    this.feedText = this.add.text(GAME_WIDTH - 310, 156, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#ccbbee',
      wordWrap: { width: 290 },
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 16, 'ESC — Menu', {
      fontFamily: 'monospace', fontSize: '12px', color: '#554466',
    }).setOrigin(0.5);

    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));

    // Passive VP tick every second
    this.time.addEvent({ delay: 1000, callback: this.passiveTick, callbackScope: this, loop: true });
    this.addFeed('🎵 The night begins. Get the crowd moving!');
  }

  private buildHostTab(): Phaser.GameObjects.Container {
    const grp = this.add.container(0, 0);
    this.actionBtns = [];
    HOST_ACTIONS.forEach((action, i) => {
      const y = 148 + i * 50;
      const btn = this.makeButton(20, y, 480, 40, action.label, `+${action.vp} VP`, 0x1a1030, () => this.doHostAction(i));
      grp.add(btn);
      this.actionBtns.push(btn);
    });
    return grp;
  }

  private buildDjTab(): Phaser.GameObjects.Container {
    const grp = this.add.container(0, 0);
    this.trackBtns = [];
    TRACKS.forEach((track, i) => {
      const y = 148 + i * 50;
      const btn = this.makeButton(20, y, 480, 40,
        `${track.name}  [${track.genre}  ${track.bpm}BPM]`,
        `Energy: ${'█'.repeat(track.energy).padEnd(10,'·')}`,
        i === this.currentTrackIdx ? 0x1a1044 : 0x0d0920,
        () => this.selectTrack(i));
      grp.add(btn);
      this.trackBtns.push(btn);
    });
    return grp;
  }

  private buildStaffTab(): Phaser.GameObjects.Container {
    const grp = this.add.container(0, 0);
    this.staffBtns = [];
    STAFF_ROLES.forEach((staff, i) => {
      const y = 148 + i * 54;
      const btn = this.makeButton(20, y, 480, 46,
        `${staff.role}  (${this.staffCounts[i]} hired)`,
        `$${staff.cost}  |  +${staff.vpPerSec} VP/s`,
        0x0d0920, () => this.hireStaff(i));
      grp.add(btn);
      this.staffBtns.push(btn);
    });
    return grp;
  }

  private makeButton(
    x: number, y: number, w: number, h: number,
    mainLabel: string, subLabel: string,
    color: number, cb: () => void,
  ): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(w / 2, h / 2, w, h, color).setStrokeStyle(1, 0x3a2a55);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerdown', cb);
    bg.on('pointerover', () => bg.setFillStyle(color + 0x100810));
    bg.on('pointerout',  () => bg.setFillStyle(color));
    const lbl = this.add.text(14, h / 2, mainLabel, {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0, 0.5);
    const sub = this.add.text(w - 12, h / 2, subLabel, {
      fontFamily: 'monospace', fontSize: '11px', color: '#8877aa',
    }).setOrigin(1, 0.5);
    return this.add.container(x, y, [bg, lbl, sub]);
  }

  private switchTab(t: Tab): void {
    this.tab = t;
    const TABS: Tab[] = ['host', 'dj', 'staff'];
    TABS.forEach((tab, i) => {
      this.tabBgs[i].setFillStyle(tab === t ? 0x2a1a44 : 0x12091e);
    });
    this.showTab(t);
  }

  private showTab(t: Tab): void {
    const TABS: Tab[] = ['host', 'dj', 'staff'];
    this.tabContents.forEach((c, i) => c.setVisible(TABS[i] === t));
  }

  private doHostAction(i: number): void {
    if (this.actionCooldowns[i] > 0) return;
    const action = HOST_ACTIONS[i];
    this.addVP(action.vp);
    this.actionCooldowns[i] = action.cooldown;
    this.addFeed(`🎤 ${action.label} (+${action.vp} VP)`);
    const btn = this.actionBtns[i];
    const bg = btn.list[0] as Phaser.GameObjects.Rectangle;
    bg.setFillStyle(0x2a1a00);
    this.time.delayedCall(action.cooldown, () => {
      bg.setFillStyle(0x1a1030);
      this.actionCooldowns[i] = 0;
    });
  }

  private selectTrack(i: number): void {
    this.currentTrackIdx = i;
    const track = TRACKS[i];
    this.vpPerSec = 1 + track.energy * 0.3 + this.staffBonus();
    this.addFeed(`🎧 Now playing: ${track.name} (${track.genre})`);
    this.refreshStaffDisplay();
    // Re-render track buttons
    this.tabContents[1].destroy();
    this.tabContents[1] = this.buildDjTab();
    this.showTab(this.tab);
  }

  private hireStaff(i: number): void {
    const staff = STAFF_ROLES[i];
    if (this.budget < staff.cost) {
      this.addFeed(`❌ Not enough cash to hire ${staff.role}`);
      return;
    }
    this.budget -= staff.cost;
    this.staffCounts[i] += 1;
    this.vpPerSec = 1 + TRACKS[this.currentTrackIdx].energy * 0.3 + this.staffBonus();
    this.addFeed(`✅ ${staff.role} hired! VP/s now ${this.vpPerSec.toFixed(1)}`);
    this.refreshStaffDisplay();
    this.tabContents[2].destroy();
    this.tabContents[2] = this.buildStaffTab();
    this.showTab(this.tab);
  }

  private staffBonus(): number {
    return STAFF_ROLES.reduce((sum, s, i) => sum + s.vpPerSec * this.staffCounts[i], 0);
  }

  private refreshStaffDisplay(): void {
    this.budgetText.setText(`$${this.budget}  |  ${this.vpPerSec.toFixed(1)} VP/s`);
  }

  private passiveTick(): void {
    if (this.won) return;
    this.addVP(this.vpPerSec);
    this.budget += Math.floor(this.vpPerSec * 0.5);
    this.refreshStaffDisplay();
  }

  private addVP(amount: number): void {
    this.vp = Math.min(VP_GOAL, this.vp + amount);
    const pct = this.vp / VP_GOAL;
    this.vpBar.width = (GAME_WIDTH - 40) * pct;
    this.vpText.setText(`${Math.floor(this.vp)} / ${VP_GOAL} VP`);
    if (this.vp >= VP_GOAL && !this.won) this.showWin();
  }

  private addFeed(line: string): void {
    this.feedLines.unshift(line);
    if (this.feedLines.length > 12) this.feedLines.pop();
    this.feedText.setText(this.feedLines.join('\n'));
  }

  private showWin(): void {
    this.won = true;
    const overlay = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.75)
      .setDepth(90000);
    this.tweens.add({ targets: overlay, alpha: { from: 0, to: 0.75 }, duration: 400 });
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'LEGENDARY NIGHT!', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '44px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(90001);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 14, '1000 VIBE POINTS  •  HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(90001);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50, 'SPACE — Play Again   ESC — Menu', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(90001);
    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', () => this.scene.restart());
    kb.once('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));
  }
}

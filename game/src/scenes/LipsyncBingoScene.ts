import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT } from '../config';
import { AudioSystem } from '../systems/AudioSystem';

// HVAS-themed call phrases for the bingo card.
const PHRASES = [
  'VIP PASS', 'AFTER SPOT', 'ON THE LIST', 'OPEN BAR', 'DJ SET',
  'CROWD WAVE', 'STAGE RUSH', 'BOUNCER', 'GUEST LIST', 'LATE NIGHT',
  'THROWBACK', 'HOOK DROP', 'VERSE TWO', 'BRIDGE HIT', 'REMIX',
  'HYPE MAN', 'ENCORE', 'CROWD SURF', 'MOSH PIT', 'STROBE',
  'BASS LINE', 'TRAP BEAT', 'TURN UP', 'VIBE CHECK', 'NEON SIGN',
  'BOTTLE POP', 'BIRTHDAY', 'SHOUTOUT', 'PHOTO OP', 'MERCH TABLE',
  'WRISTBAND', 'SIDE STAGE', 'LEAN BACK', 'DROP IT', 'FLEX',
  'SQUAD UP', 'NIGHT CAP', 'LAST CALL', 'SECURITY', 'LIGHT SHOW',
  'FIRE EXIT', 'SOUND CHECK', 'COLLAB', 'FEATURE', 'DUO SET',
  'SLOW JAM', 'FREESTYLE', 'CYPHER', 'PLUG WALK', 'OUTRO',
];

const GRID = 5;
const CELL_W = 110;
const CELL_H = 64;
const GRID_X = (GAME_WIDTH - GRID * CELL_W) / 2;
const GRID_Y = 104;
const AUTO_CALL_MS = 3500;
const HISTORY_LEN = 6;

const STORE_KEY = 'hvas_lsb_bingo_state';

interface BingoState {
  card: string[];
  marked: boolean[];
  called: string[];
  won: boolean;
}

function loadState(): BingoState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as BingoState;
  } catch { /* ignore */ }
  return null;
}

function saveState(s: BingoState): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export class LipsyncBingoScene extends Phaser.Scene {
  private card: string[] = [];       // 25 squares (shuffled subset of PHRASES)
  private marked: boolean[] = [];
  private called: string[] = [];
  private cells: Phaser.GameObjects.Container[] = [];
  private callerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private historyText!: Phaser.GameObjects.Text;
  private callTimer!: Phaser.Time.TimerEvent;
  private won = false;

  constructor() { super(SCENE.LipsyncBingo); }

  create(): void {
    AudioSystem.playForScene(this, 'LipsyncBingo');
    this.cameras.main.setBackgroundColor(0x08040e);

    // Header
    this.add.text(GAME_WIDTH / 2, 18, 'LIPSYNC BINGO', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '26px', color: '#ffd700',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 46, 'HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial, sans-serif', fontSize: '12px', color: '#c100ff',
    }).setOrigin(0.5);

    // Back chip
    const back = this.add.rectangle(56, 24, 92, 26, 0x1a0030, 0.9)
      .setStrokeStyle(1, 0xc100ff).setInteractive({ useHandCursor: true });
    this.add.text(56, 24, 'ESC — HUB', {
      fontFamily: 'monospace', fontSize: '10px', color: '#c100ff',
    }).setOrigin(0.5);
    back.on('pointerdown', () => this.leaveToHub());

    // New card chip
    const fresh = this.add.rectangle(GAME_WIDTH - 66, 24, 116, 26, 0x1a1000, 0.9)
      .setStrokeStyle(1, 0xffd700).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH - 66, 24, '↻ NEW CARD', {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffd700',
    }).setOrigin(0.5);
    fresh.on('pointerdown', () => this.newCard());

    // Caller display
    this.callerText = this.add.text(GAME_WIDTH / 2, GRID_Y + GRID * CELL_H + 24, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffffff',
    }).setOrigin(0.5);

    this.statusText = this.add.text(GAME_WIDTH / 2, GRID_Y + GRID * CELL_H + 54, 'Calling...', {
      fontFamily: 'monospace', fontSize: '13px', color: '#8877aa',
    }).setOrigin(0.5);

    this.historyText = this.add.text(GAME_WIDTH / 2, GRID_Y + GRID * CELL_H + 78, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#554466',
      wordWrap: { width: GAME_WIDTH - 80 }, align: 'center',
    }).setOrigin(0.5, 0);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14,
      'Click squares to mark  •  ESC: hub', {
        fontFamily: 'monospace', fontSize: '11px', color: '#554466',
      }).setOrigin(0.5);

    this.input.keyboard!.on('keydown-ESC', () => this.leaveToHub());

    const saved = loadState();
    if (saved && !saved.won && saved.card.length === 25) {
      this.card = saved.card;
      this.marked = saved.marked;
      this.called = saved.called;
    } else {
      this.dealCard();
    }
    this.buildGrid();
    this.refreshHistory();
    this.scheduleCall();
  }

  private leaveToHub(): void {
    this.callTimer?.destroy();
    this.scene.start(SCENE.AppHub);
  }

  private newCard(): void {
    this.callTimer?.destroy();
    this.dealCard();
    this.scene.restart();
  }

  private persist(): void {
    saveState({ card: this.card, marked: this.marked, called: this.called, won: this.won });
  }

  private dealCard(): void {
    const pool = Phaser.Utils.Array.Shuffle([...PHRASES]).slice(0, 25) as string[];
    this.card = pool;
    this.marked = Array(25).fill(false);
    this.marked[12] = true; // center FREE square
    this.called = [];
    this.won = false;
    this.persist();
  }

  private buildGrid(): void {
    this.cells = [];
    for (let i = 0; i < 25; i++) {
      const col = i % GRID;
      const row = Math.floor(i / GRID);
      const cx = GRID_X + col * CELL_W + CELL_W / 2;
      const cy = GRID_Y + row * CELL_H + CELL_H / 2;

      const bg = this.add.rectangle(0, 0, CELL_W - 4, CELL_H - 4,
        i === 12 ? 0x331a44 : 0x140c20).setStrokeStyle(1, 0x3a2a55);

      const label = i === 12 ? 'FREE' : this.card[i];
      const txt = this.add.text(0, 0, label, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: label.length > 8 ? '8px' : '10px',
        color: i === 12 ? '#ffd700' : '#ccbbee',
        wordWrap: { width: CELL_W - 10 },
        align: 'center',
      }).setOrigin(0.5);

      const grp = this.add.container(cx, cy, [bg, txt])
        .setSize(CELL_W - 4, CELL_H - 4)
        .setInteractive({ useHandCursor: true });

      grp.on('pointerdown', () => this.toggleMark(i));
      grp.on('pointerover', () => (bg as Phaser.GameObjects.Rectangle).setFillStyle(0x1e1230));
      grp.on('pointerout',  () => this.refreshCell(i));

      this.cells.push(grp);
      if (this.marked[i]) this.applyMark(i);
    }
  }

  private refreshHistory(): void {
    const recent = this.called.slice(-HISTORY_LEN - 1, -1).reverse();
    this.historyText.setText(recent.length ? `PREVIOUS: ${recent.join('  ·  ')}` : '');
  }

  private scheduleCall(): void {
    this.callTimer = this.time.addEvent({
      delay: AUTO_CALL_MS,
      callback: this.doCall,
      callbackScope: this,
      loop: true,
    });
    this.doCall();
  }

  private doCall(): void {
    if (this.won) return;
    const uncalled = PHRASES.filter(p => !this.called.includes(p) && p !== 'FREE');
    if (!uncalled.length) {
      this.statusText.setText('All phrases called!');
      this.callTimer.destroy();
      return;
    }
    const phrase = Phaser.Utils.Array.GetRandom(uncalled) as string;
    this.called.push(phrase);
    this.callerText.setText(`"${phrase}"`);
    this.tweens.add({
      targets: this.callerText, scaleX: 1.12, scaleY: 1.12,
      duration: 200, yoyo: true, ease: 'Quad.out',
    });
    this.statusText.setText(`${this.called.length} phrases called`);
    this.refreshHistory();
    AudioSystem.sfx(this, 'select');
    // Auto-mark any matching squares
    this.card.forEach((sq, i) => {
      if (sq === phrase && !this.marked[i]) this.autoMark(i);
    });
    this.persist();
  }

  private autoMark(i: number): void {
    this.marked[i] = true;
    this.applyMark(i);
    AudioSystem.sfx(this, 'confirm');
    this.checkWin();
  }

  private toggleMark(i: number): void {
    if (this.won || i === 12) return;
    this.marked[i] = !this.marked[i];
    this.refreshCell(i);
    AudioSystem.sfx(this, 'select');
    this.persist();
    if (this.marked[i]) this.checkWin();
  }

  private applyMark(i: number): void {
    const grp = this.cells[i];
    const bg = grp.list[0] as Phaser.GameObjects.Rectangle;
    bg.setFillStyle(0x2a1d44).setStrokeStyle(2, 0xffd700);
    const txt = grp.list[1] as Phaser.GameObjects.Text;
    txt.setColor('#ffd700');
  }

  private refreshCell(i: number): void {
    const grp = this.cells[i];
    const bg = grp.list[0] as Phaser.GameObjects.Rectangle;
    const txt = grp.list[1] as Phaser.GameObjects.Text;
    if (this.marked[i]) {
      bg.setFillStyle(0x2a1d44).setStrokeStyle(2, 0xffd700);
      txt.setColor('#ffd700');
    } else {
      bg.setFillStyle(0x140c20).setStrokeStyle(1, 0x3a2a55);
      txt.setColor('#ccbbee');
    }
  }

  private checkWin(): void {
    if (this.won) return;
    const m = this.marked;
    const lines = [
      [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
      [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
      [0,6,12,18,24],[4,8,12,16,20],
    ];
    const won = lines.some(line => line.every(idx => m[idx]));
    if (!won) return;
    this.won = true;
    this.callTimer?.destroy();
    this.persist();
    AudioSystem.sfx(this, 'win');
    this.showWin();
  }

  private showWin(): void {
    const overlay = this.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7)
      .setDepth(80000);
    this.tweens.add({ targets: overlay, alpha: { from: 0, to: 0.7 }, duration: 300 });

    this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2 - 40, 'BINGO!', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '72px', color: '#ffd700',
    }).setOrigin(0.5).setDepth(80001);

    this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2 + 30, 'HITMANS VIP AFTER SPOT  •  WINNER!', {
      fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(80001);

    this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2 + 68, 'SPACE — Play Again   ESC — Hub', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(80001);

    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', () => this.scene.restart());
    kb.once('keydown-ESC',   () => this.leaveToHub());
  }
}

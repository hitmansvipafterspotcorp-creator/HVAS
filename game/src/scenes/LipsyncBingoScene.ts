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
const GRID_Y = 110;
const AUTO_CALL_MS = 3500;

export class LipsyncBingoScene extends Phaser.Scene {
  private card: string[] = [];       // 25 squares (shuffled subset of PHRASES)
  private marked: boolean[] = [];
  private called: string[] = [];
  private cells: Phaser.GameObjects.Container[] = [];
  private callerText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private callTimer!: Phaser.Time.TimerEvent;
  private won = false;

  constructor() { super(SCENE.LipsyncBingo); }

  create(): void {
    this.won = false;
    AudioSystem.playForScene(this, 'MainMenu');
    this.cameras.main.setBackgroundColor(0x08040e);

    // Header
    this.add.text(GAME_WIDTH / 2, 22, 'LIPSYNC BINGO', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '28px', color: '#ffd700',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 52, 'HITMANS VIP AFTER SPOT', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#c100ff',
    }).setOrigin(0.5);

    // Caller display
    this.callerText = this.add.text(GAME_WIDTH / 2, GRID_Y + GRID * CELL_H + 26, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '22px', color: '#ffffff',
    }).setOrigin(0.5);

    this.statusText = this.add.text(GAME_WIDTH / 2, GRID_Y + GRID * CELL_H + 58, 'Calling...', {
      fontFamily: 'monospace', fontSize: '14px', color: '#8877aa',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20,
      'Click squares to mark  •  ESC: menu', {
        fontFamily: 'monospace', fontSize: '12px', color: '#554466',
      }).setOrigin(0.5);

    this.input.keyboard!.on('keydown-ESC', () => {
      this.callTimer?.destroy();
      this.scene.start(SCENE.MainMenu);
    });

    this.dealCard();
    this.buildGrid();
    this.scheduleCall();
  }

  private dealCard(): void {
    const pool = Phaser.Utils.Array.Shuffle([...PHRASES]).slice(0, 25) as string[];
    this.card = pool;
    this.marked = Array(25).fill(false);
    this.marked[12] = true; // center FREE square
    this.called = [];
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
      if (i === 12) this.applyMark(i);
    }
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
    // Auto-mark any matching squares
    this.card.forEach((sq, i) => {
      if (sq === phrase && !this.marked[i]) this.autoMark(i);
    });
  }

  private autoMark(i: number): void {
    this.marked[i] = true;
    this.applyMark(i);
    this.checkWin();
  }

  private toggleMark(i: number): void {
    if (this.won || i === 12) return;
    this.marked[i] = !this.marked[i];
    this.refreshCell(i);
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

    this.add.text(GAME_WIDTH/2, GAME_HEIGHT/2 + 68, 'SPACE — Play Again   ESC — Menu', {
      fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(80001);

    const kb = this.input.keyboard!;
    kb.once('keydown-SPACE', () => this.scene.restart());
    kb.once('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));
  }
}

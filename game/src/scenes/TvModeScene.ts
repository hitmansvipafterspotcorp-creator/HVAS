import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS, FLOOR_TOP, FLOOR_BOTTOM, PLAYER_SPEED, PLAYER_DEPTH_SPEED } from '../config';
import { Fighter } from '../entities/Fighter';
import { CombatSystem } from '../systems/CombatSystem';
import { CHAR_FOLDERS } from '../data/animMap';
import { AudioSystem } from '../systems/AudioSystem';

// HVAS TV — a self-running spectator channel. Two AI fighters battle on a
// random stage backdrop; a scrolling ticker carries venue news at the bottom.
// Press SPACE to reshuffle fighters, ESC to return to menu.

const ALL_CHARS = Object.keys(CHAR_FOLDERS).map(Number);

const TICKER_ITEMS = [
  'HITMANS VIP AFTER SPOT  •  DOORS OPEN 10PM',
  'CAFE8FIFTY OUTSIDE STAGE  —  TONIGHT ONLY',
  'BIG SOULJA HEADLINES THE MAIN EVENT',
  'VIP SECTION NOW OPEN  •  MEMBER CARDS AT DOOR',
  'SOCIAL GAINES ROOFTOP  •  INVITE ONLY THIS WEEKEND',
  'TALLY ROW STRIP  —  5 VENUES  •  1 WRISTBAND',
  'KENDRICK BRINGS THE HEAT TO TALLY EXTERIOR',
  'KINGDOM COME SALOON  •  LIVE SET STARTS MIDNIGHT',
  'QUICK HIT FUEL  •  24HR AFTER-HOURS SPOT',
  'OUTTA POCKET  •  THE UNDERGROUND IS OPEN',
  'DUKE\'S INSIDE  •  PRIVATE BOOTHS AVAILABLE',
  'ARCADE VS MODE  •  19 FIGHTERS  •  4 DIFFICULTIES',
  'QUEST MODE  •  7 STAGES  •  DEFEAT ALL BOSSES',
  'SUCCESS ROOFTOP LOUNGE  •  EXCLUSIVE ACCESS',
  'THE DEN  •  13RAVE  •  SAMMY\'S  •  ITUS  •  PUBLIC HALL',
];

const AI_REACT = 500;
const ARENA_Y = (FLOOR_TOP + FLOOR_BOTTOM) / 2;

export class TvModeScene extends Phaser.Scene {
  private fighter1!: Fighter;
  private fighter2!: Fighter;
  private combat!: CombatSystem;
  private aiTimer1 = 0;
  private aiTimer2 = 0;
  private ticker!: Phaser.GameObjects.Text;
  private tickerX = GAME_WIDTH + 20;
  private roundLabel!: Phaser.GameObjects.Text;
  private commentary!: Phaser.GameObjects.Text;
  private commentTimer = 0;
  private roundNum = 1;

  constructor() { super(SCENE.TvMode); }

  create(): void {
    AudioSystem.playForScene(this, 'ArcadeVs');
    this.cameras.main.setBackgroundColor(0x050308);

    // Channel header
    const header = this.add.rectangle(GAME_WIDTH / 2, 22, GAME_WIDTH, 44, 0x0a0018).setDepth(1000);
    this.add.text(16, 22, '📺 HVAS TV', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '18px', color: '#ffd700',
    }).setOrigin(0, 0.5).setDepth(1001);
    this.add.text(GAME_WIDTH - 16, 22, 'LIVE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '14px', color: '#ff2244',
    }).setOrigin(1, 0.5).setDepth(1001);
    header; // referenced

    // Floor / arena
    const g = this.add.graphics().setDepth(-100);
    g.fillStyle(COLORS.floor, 0.6);
    g.fillRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);
    g.lineStyle(2, COLORS.floorLine, 0.5);
    g.strokeRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);

    // Round label
    this.roundLabel = this.add.text(GAME_WIDTH / 2, FLOOR_TOP - 18, `ROUND ${this.roundNum}`, {
      fontFamily: 'Arial Black, sans-serif', fontSize: '16px', color: '#c100ff',
    }).setOrigin(0.5).setDepth(500);

    // Commentary bar
    this.commentary = this.add.text(GAME_WIDTH / 2, FLOOR_TOP - 38, '', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(500);

    // Bottom ticker
    const tickerBg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 16, GAME_WIDTH, 32, 0x0a0018)
      .setDepth(1000);
    this.ticker = this.add.text(this.tickerX, GAME_HEIGHT - 16, TICKER_ITEMS.join('   ·   '), {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffd700',
    }).setOrigin(0, 0.5).setDepth(1001);
    tickerBg; // referenced

    // Controls hint
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 52, 'SPACE — New Match   ESC — Menu', {
      fontFamily: 'monospace', fontSize: '12px', color: '#554466',
    }).setOrigin(0.5).setDepth(500);

    const kb = this.input.keyboard!;
    kb.on('keydown-ESC',   () => this.scene.start(SCENE.MainMenu));
    kb.on('keydown-SPACE', () => this.spawnFighters());

    this.combat = new CombatSystem(this);
    this.spawnFighters();
  }

  private spawnFighters(): void {
    this.fighter1?.destroy();
    this.fighter2?.destroy();

    const ids = Phaser.Utils.Array.Shuffle([...ALL_CHARS]).slice(0, 2) as number[];
    this.fighter1 = new Fighter(this, 'player', 200, ARENA_Y, 120, ids[0]);
    this.fighter2 = new Fighter(this, 'enemy',  760, ARENA_Y, 120, ids[1]);
    this.fighter1.facing = 1;
    this.fighter2.facing = -1;
    this.aiTimer1 = 0;
    this.aiTimer2 = 0;

    const name1 = this.getCharName(ids[0]);
    const name2 = this.getCharName(ids[1]);
    this.commentary.setText(`${name1}  vs  ${name2}`);
    this.tweens.add({ targets: this.commentary, scaleX: 1.08, scaleY: 1.08, yoyo: true, duration: 300 });
  }

  private getCharName(id: number): string {
    const names: Record<number, string> = {
      1:'Creator',2:'DJ',3:'FAMU',4:'FAMU M',5:'Influencer',6:'Photographer',
      7:'Promoter',8:'Dancer',9:'Vendor',10:'Security',11:'Host',12:'FSU',
      13:'FSU M',14:'Kendrick',20:'KT',21:'Big Soulja',22:'ELD',30:'Pete',31:'Snow',
    };
    return names[id] ?? `Fighter ${id}`;
  }

  override update(_t: number, delta: number): void {
    this.combat.tick(delta);

    if (this.fighter1?.alive && this.fighter2?.alive) {
      this.runAi(this.fighter1, this.fighter2, 'aiTimer1', delta);
      this.runAi(this.fighter2, this.fighter1, 'aiTimer2', delta);
      this.fighter1.syncView();
      this.fighter2.syncView();
    } else if (this.fighter1 && this.fighter2) {
      this.onRoundEnd();
    }

    // Scroll ticker
    this.tickerX -= 1.2;
    if (this.tickerX < -(this.ticker.width + 20)) this.tickerX = GAME_WIDTH + 20;
    this.ticker.setX(this.tickerX);

    // Commentary rotation
    this.commentTimer -= delta;
    if (this.commentTimer <= 0) this.doCommentary();
  }

  private runAi(
    self: Fighter, target: Fighter,
    timerKey: 'aiTimer1' | 'aiTimer2',
    delta: number,
  ): void {
    if (self.state === 'attack' || self.state === 'hit') {
      self.stateTimer -= delta;
      if (self.state === 'attack') {
        self.attackActive = self.stateTimer > 80 && self.stateTimer < 200;
        if (self.attackActive) this.combat.resolve(self, [target], { damage: 8, knockback: 16, meterGain: 6 });
      }
      if (self.stateTimer <= 0) { self.state = 'idle'; self.attackActive = false; }
      return;
    }
    this[timerKey] -= delta;
    if (this[timerKey] > 0) return;
    this[timerKey] = AI_REACT + Math.random() * 300;

    const dx = target.x - self.x;
    const dist = Math.abs(dx);
    self.facing = dx < 0 ? -1 : 1;

    if (dist < 90 && Math.abs(target.feetY - self.feetY) < 30) {
      self.state = 'attack'; self.stateTimer = 280; self.attackActive = false;
      return;
    }
    self.x += Math.sign(dx) * PLAYER_SPEED * 0.6 * (this[timerKey] / AI_REACT);
    const dy = target.feetY - self.feetY;
    self.feetY += Math.sign(dy) * PLAYER_DEPTH_SPEED * 0.5 * (this[timerKey] / AI_REACT);
    self.x = Phaser.Math.Clamp(self.x, 40, GAME_WIDTH - 40);
    self.feetY = Phaser.Math.Clamp(self.feetY, FLOOR_TOP + 10, FLOOR_BOTTOM - 10);
    self.state = 'walk';
  }

  private onRoundEnd(): void {
    const winner = this.fighter1.alive ? this.fighter1 : this.fighter2;
    const name = this.getCharName(winner.charId);
    this.commentary.setText(`${name.toUpperCase()} WINS ROUND ${this.roundNum}!`);
    this.roundNum += 1;
    this.roundLabel.setText(`ROUND ${this.roundNum}`);
    this.time.delayedCall(2200, () => this.spawnFighters());
  }

  private doCommentary(): void {
    const lines = [
      'The crowd is going wild!', 'What a move!', 'Don\'t sleep on the footwork.',
      'The energy in here is crazy.', 'You can\'t teach that instinct.',
      'HVAS TV — the only channel that matters.', 'Big Soulja watching from the back row.',
      'Kendrick called it in the pre-show.', 'Security is earning their keep tonight.',
      'VIP section on their feet!', 'DJ keeping the energy locked in.',
      'This is why you get on the list early.', 'After Spot living up to its name.',
    ];
    if (this.fighter1?.alive && this.fighter2?.alive) {
      this.commentary.setText(Phaser.Utils.Array.GetRandom(lines) as string);
    }
    this.commentTimer = 4000 + Math.random() * 3000;
  }
}

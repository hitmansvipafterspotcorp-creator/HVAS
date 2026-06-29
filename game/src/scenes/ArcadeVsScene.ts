import Phaser from 'phaser';
import { SCENE, GAME_WIDTH, GAME_HEIGHT, COLORS,
         FLOOR_TOP, FLOOR_BOTTOM, PLAYER_SPEED, PLAYER_DEPTH_SPEED, LANE_TOLERANCE } from '../config';
import { Fighter } from '../entities/Fighter';
import { InputSystem } from '../systems/InputSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { AnimationSystem } from '../systems/AnimationSystem';
import { CHAR_NAMES } from '../data/roster';
import { AudioSystem } from '../systems/AudioSystem';

// ── Roster (all 19 characters, all always unlocked in Arcade VS) ─────────────
const ALL_CHARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 20, 21, 22, 30, 31];

const DIFFICULTIES = [
  { label: 'EASY',   color: '#44dd88', aiSpeed: 0.35, aiReact: 900,  aiBravery: 0.25 },
  { label: 'NORMAL', color: '#ffd700', aiSpeed: 0.55, aiReact: 600,  aiBravery: 0.50 },
  { label: 'HARD',   color: '#ff8833', aiSpeed: 0.75, aiReact: 380,  aiBravery: 0.70 },
  { label: 'INSANE', color: '#ff3355', aiSpeed: 1.00, aiReact: 180,  aiBravery: 0.90 },
] as const;

type Difficulty = typeof DIFFICULTIES[number];

// ── Phase types ───────────────────────────────────────────────────────────────
type Phase = 'p1select' | 'p2select' | 'diffselect' | 'fight' | 'result';

const COLS = 5;
const ROWS = Math.ceil(ALL_CHARS.length / COLS);
const CELL = 88; // px per grid cell
const GRID_X = (GAME_WIDTH - COLS * CELL) / 2;
const GRID_Y = 160;

// ── ArcadeVsScene ─────────────────────────────────────────────────────────────
// Three-phase flow: P1 picks char → P2 picks char → pick difficulty → fight.
// Both selections use the same character grid. All 19 chars are always shown
// and selectable — no unlock gating in Arcade.
export class ArcadeVsScene extends Phaser.Scene {
  // ── selection state ──────────────────────────────────────────────────────
  private phase: Phase = 'p1select';
  private p1CharId = ALL_CHARS[0];
  private p2CharId = ALL_CHARS[1];
  private diffIdx = 1; // default NORMAL
  private cursorIdx = 0;

  // ── fight state ──────────────────────────────────────────────────────────
  private p1!: Fighter;
  private p2!: Fighter;
  private controls!: InputSystem;
  private combat!: CombatSystem;
  private difficulty!: Difficulty;
  private aiTimer = 0;
  private roundOver = false;
  private winner = '';

  // ── UI refs ──────────────────────────────────────────────────────────────
  private selectionGroup!: Phaser.GameObjects.Container;
  private fightGroup!: Phaser.GameObjects.Container;
  private phaseLabel!: Phaser.GameObjects.Text;
  private cursorRect!: Phaser.GameObjects.Rectangle;
  private p1Portrait!: Phaser.GameObjects.Sprite;
  private p2Portrait!: Phaser.GameObjects.Sprite;
  private p1NameTxt!: Phaser.GameObjects.Text;
  private p2NameTxt!: Phaser.GameObjects.Text;
  private diffButtons: Phaser.GameObjects.Text[] = [];
  private hudP1hp!: Phaser.GameObjects.Text;
  private hudP2hp!: Phaser.GameObjects.Text;
  private resultBanner!: Phaser.GameObjects.Text;
  private fightBanner!: Phaser.GameObjects.Text;

  constructor() { super(SCENE.ArcadeVs); }

  // ── create ───────────────────────────────────────────────────────────────
  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    AudioSystem.playForScene(this, 'ArcadeVs');
    this.buildSelectionScreen();
    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENE.MainMenu));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SELECTION SCREEN
  // ─────────────────────────────────────────────────────────────────────────
  private buildSelectionScreen(): void {
    if (this.selectionGroup) this.selectionGroup.destroy(true);
    this.fightGroup?.destroy(true);
    this.roundOver = false;

    const grp = this.add.container(0, 0);
    this.selectionGroup = grp;

    // Title bar.
    grp.add(
      this.add.text(GAME_WIDTH / 2, 30, 'ARCADE VS', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '32px',
        color: '#ffd700',
      }).setOrigin(0.5),
    );

    this.phaseLabel = this.add.text(GAME_WIDTH / 2, 72, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);
    grp.add(this.phaseLabel);

    // Character grid.
    for (let i = 0; i < ALL_CHARS.length; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = GRID_X + col * CELL + CELL / 2;
      const cy = GRID_Y + row * CELL + CELL / 2;

      // Cell bg.
      const cell = this.add.rectangle(cx, cy, CELL - 6, CELL - 6, 0x1a1030)
        .setStrokeStyle(1, 0x4a3a6a);
      grp.add(cell);

      // Char portrait sprite (idle facing south if loaded, else colored block).
      const charId = ALL_CHARS[i];
      const idleKey = AnimationSystem.animKey(charId, 'idle');
      let portrait: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
      if (this.anims.exists(idleKey)) {
        portrait = this.add.sprite(cx, cy + 8, '__DEFAULT')
          .setOrigin(0.5, 1)
          .setScale(46 / 181)
          .setDepth(1);
        (portrait as Phaser.GameObjects.Sprite).play(idleKey);
      } else {
        portrait = this.add.rectangle(cx, cy, 34, 54, charId === 1 ? COLORS.player : COLORS.enemy);
      }
      grp.add(portrait as Phaser.GameObjects.GameObject);

      // Name label.
      const name = this.add.text(cx, cy + CELL / 2 - 14, CHAR_NAMES[charId] ?? `#${charId}`, {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ccbbee',
      }).setOrigin(0.5);
      grp.add(name);
    }

    // Cursor highlight.
    this.cursorRect = this.add.rectangle(0, 0, CELL - 4, CELL - 4, 0xffd700, 0)
      .setStrokeStyle(3, 0xffd700);
    grp.add(this.cursorRect);

    // P1 / P2 selected portrait readouts (bottom strip).
    const stripY = GRID_Y + ROWS * CELL + 18;

    grp.add(this.add.text(80, stripY, 'P1', { fontFamily: 'monospace', fontSize: '14px', color: '#44aaff' }).setOrigin(0.5));
    this.p1Portrait = this.add.sprite(80, stripY + 44, '__DEFAULT').setScale(50 / 181).setOrigin(0.5, 1);
    grp.add(this.p1Portrait);
    this.p1NameTxt = this.add.text(80, stripY + 52, '', { fontFamily: 'monospace', fontSize: '12px', color: '#44aaff' }).setOrigin(0.5);
    grp.add(this.p1NameTxt);

    grp.add(this.add.text(GAME_WIDTH - 80, stripY, 'P2', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6644' }).setOrigin(0.5));
    this.p2Portrait = this.add.sprite(GAME_WIDTH - 80, stripY + 44, '__DEFAULT').setScale(50 / 181).setOrigin(0.5, 1);
    grp.add(this.p2Portrait);
    this.p2NameTxt = this.add.text(GAME_WIDTH - 80, stripY + 52, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff6644' }).setOrigin(0.5);
    grp.add(this.p2NameTxt);

    // Difficulty row (shown only in diffselect phase).
    const diffY = stripY + 80;
    this.diffButtons = [];
    for (let d = 0; d < DIFFICULTIES.length; d++) {
      const btn = this.add.text(
        GAME_WIDTH / 2 + (d - 1.5) * 130,
        diffY,
        DIFFICULTIES[d].label,
        { fontFamily: 'Arial Black, sans-serif', fontSize: '20px', color: DIFFICULTIES[d].color },
      ).setOrigin(0.5).setAlpha(0.3).setVisible(false);
      grp.add(btn);
      this.diffButtons.push(btn);
    }

    // Controls hint.
    grp.add(
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14, 'WASD move • SPACE/Enter confirm • ESC back to menu', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#554466',
      }).setOrigin(0.5),
    );

    // Keyboard nav.
    const kb = this.input.keyboard!;
    kb.removeAllListeners('keydown-LEFT');
    kb.removeAllListeners('keydown-RIGHT');
    kb.removeAllListeners('keydown-UP');
    kb.removeAllListeners('keydown-DOWN');
    kb.removeAllListeners('keydown-SPACE');
    kb.removeAllListeners('keydown-ENTER');
    kb.removeAllListeners('keydown-A');
    kb.removeAllListeners('keydown-D');
    kb.removeAllListeners('keydown-W');
    kb.removeAllListeners('keydown-S');

    kb.on('keydown-LEFT',  () => this.moveCursor(-1, 0));
    kb.on('keydown-RIGHT', () => this.moveCursor(1, 0));
    kb.on('keydown-UP',    () => this.moveCursor(0, -1));
    kb.on('keydown-DOWN',  () => this.moveCursor(0, 1));
    kb.on('keydown-A',     () => this.moveCursor(-1, 0));
    kb.on('keydown-D',     () => this.moveCursor(1, 0));
    kb.on('keydown-W',     () => this.moveCursor(0, -1));
    kb.on('keydown-S',     () => this.moveCursor(0, 1));
    kb.on('keydown-SPACE', () => this.confirm());
    kb.on('keydown-ENTER', () => this.confirm());

    this.refreshSelectionUI();
  }

  private moveCursor(dx: number, dy: number): void {
    if (this.phase === 'diffselect') {
      this.diffIdx = Phaser.Math.Clamp(this.diffIdx + dx, 0, DIFFICULTIES.length - 1);
      this.refreshSelectionUI();
      return;
    }
    const col = this.cursorIdx % COLS;
    const row = Math.floor(this.cursorIdx / COLS);
    const newCol = Phaser.Math.Clamp(col + dx, 0, COLS - 1);
    const newRow = Phaser.Math.Clamp(row + dy, 0, ROWS - 1);
    const newIdx = newRow * COLS + newCol;
    if (newIdx < ALL_CHARS.length) this.cursorIdx = newIdx;
    this.refreshSelectionUI();
  }

  private confirm(): void {
    if (this.phase === 'p1select') {
      this.p1CharId = ALL_CHARS[this.cursorIdx];
      this.phase = 'p2select';
      this.cursorIdx = (this.cursorIdx + 1) % ALL_CHARS.length; // start P2 on next char
      this.refreshSelectionUI();
    } else if (this.phase === 'p2select') {
      this.p2CharId = ALL_CHARS[this.cursorIdx];
      this.phase = 'diffselect';
      this.refreshSelectionUI();
    } else if (this.phase === 'diffselect') {
      this.difficulty = DIFFICULTIES[this.diffIdx];
      this.startFight();
    }
  }

  private refreshSelectionUI(): void {
    const phaseText: Record<Phase, string> = {
      p1select: '— PLAYER 1: CHOOSE YOUR FIGHTER —',
      p2select: '— PLAYER 2: CHOOSE YOUR FIGHTER —',
      diffselect: '— SELECT DIFFICULTY —',
      fight: '',
      result: '',
    };
    this.phaseLabel.setText(phaseText[this.phase]);

    // Move cursor.
    const col = this.cursorIdx % COLS;
    const row = Math.floor(this.cursorIdx / COLS);
    this.cursorRect.setPosition(
      GRID_X + col * CELL + CELL / 2,
      GRID_Y + row * CELL + CELL / 2,
    );

    // P1 portrait.
    const p1Key = AnimationSystem.animKey(this.p1CharId, 'idle');
    if (this.anims.exists(p1Key)) {
      this.p1Portrait.play(p1Key, true);
    }
    this.p1NameTxt.setText(CHAR_NAMES[this.p1CharId] ?? `#${this.p1CharId}`);

    // P2 portrait (only set once chosen).
    if (this.phase !== 'p1select') {
      const p2Key = AnimationSystem.animKey(this.p2CharId, 'idle');
      if (this.anims.exists(p2Key)) this.p2Portrait.play(p2Key, true);
      this.p2NameTxt.setText(CHAR_NAMES[this.p2CharId] ?? `#${this.p2CharId}`);
    }

    // Difficulty buttons visibility.
    const showDiff = this.phase === 'diffselect';
    for (let d = 0; d < this.diffButtons.length; d++) {
      this.diffButtons[d].setVisible(showDiff).setAlpha(d === this.diffIdx ? 1 : 0.3);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIGHT
  // ─────────────────────────────────────────────────────────────────────────
  private startFight(): void {
    this.phase = 'fight';
    this.selectionGroup.destroy(true);

    // Remove selection key listeners.
    const kb = this.input.keyboard!;
    ['LEFT','RIGHT','UP','DOWN','A','D','W','S','SPACE','ENTER'].forEach(k => {
      kb.removeAllListeners(`keydown-${k}`);
    });

    // Build fight screen.
    this.fightGroup = this.add.container(0, 0);

    // Floor.
    const g = this.add.graphics().setDepth(-1999);
    g.fillStyle(COLORS.floor, 0.55);
    g.fillRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);
    g.lineStyle(2, COLORS.floorLine, 0.6);
    g.strokeRect(0, FLOOR_TOP, GAME_WIDTH, FLOOR_BOTTOM - FLOOR_TOP);

    // Fighters.
    this.p1 = new Fighter(this, 'player', 220, FLOOR_BOTTOM - 20, 120, this.p1CharId);
    this.p2 = new Fighter(this, 'enemy', GAME_WIDTH - 220, FLOOR_BOTTOM - 20, 120, this.p2CharId);
    this.p2.facing = -1; // face left

    // Systems.
    this.controls = new InputSystem(this);
    this.combat = new CombatSystem(this);
    this.aiTimer = 0;

    // HUD.
    this.hudP1hp = this.add.text(14, 14, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#44aaff',
    }).setScrollFactor(0).setDepth(50000);
    this.hudP2hp = this.add.text(GAME_WIDTH - 14, 14, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ff6644',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50000);

    // VS banner.
    this.fightBanner = this.add.text(GAME_WIDTH / 2, 90, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '34px', color: '#ffd700',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50000);

    this.resultBanner = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20, '', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '42px', color: '#ffd700',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50000).setVisible(false);

    // Diff label.
    this.add.text(GAME_WIDTH / 2, 14, `VS  [${this.difficulty.label}]`, {
      fontFamily: 'monospace', fontSize: '13px', color: this.difficulty.color,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(50000);

    // "FIGHT!" flash.
    this.flashBanner('FIGHT!');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────
  override update(_t: number, delta: number): void {
    if (this.phase !== 'fight' || !this.p1 || !this.p2) return;
    if (!this.combat.tick(delta)) return;
    if (this.roundOver) return;

    this.updateP1(delta);
    this.updateCpuP2(delta);

    this.p1.syncView();
    this.p2.syncView();
    this.combat.decayCombo(this.p1, delta);
    this.combat.decayCombo(this.p2, delta);
    this.drawFightHud();
    this.checkRoundEnd();
  }

  private updateP1(delta: number): void {
    const p = this.p1;
    const b = this.controls.read();
    const dt = delta / 1000;

    if (p.invuln > 0) p.invuln -= delta;

    if (p.state === 'attack' || p.state === 'hit') {
      p.stateTimer -= delta;
      if (p.state === 'attack') {
        p.attackActive = p.stateTimer > 120 && p.stateTimer < 240;
        if (p.attackActive) {
          const hit = this.combat.resolve(p, [this.p2], { damage: 9, knockback: 18, meterGain: 8 });
          if (hit) { AudioSystem.sfx(this, 'hit'); p.attackActive = false; }
        }
      }
      if (p.stateTimer <= 0) { p.state = 'idle'; p.attackActive = false; }
      this.clampFighter(p);
      return;
    }

    if (b.superMove && this.combat.trySuper(p, [this.p2])) {
      p.playOneShot('super1');
      this.flashBanner('SUPER!');
      return;
    }

    if (b.attack) {
      p.attackIndex = (p.attackIndex + 1) % 3;
      p.state = 'attack';
      p.stateTimer = 300;
      p.attackActive = false;
      return;
    }

    let vx = 0, vy = 0;
    if (b.left) vx -= 1;
    if (b.right) vx += 1;
    if (b.up) vy -= 1;
    if (b.down) vy += 1;
    if (vx !== 0) p.facing = vx > 0 ? 1 : -1;
    p.x += vx * PLAYER_SPEED * dt;
    p.feetY += vy * PLAYER_DEPTH_SPEED * dt;
    p.state = (vx !== 0 || vy !== 0) ? 'walk' : 'idle';
    this.clampFighter(p);
  }

  private updateCpuP2(delta: number): void {
    const cpu = this.p2;
    const target = this.p1;
    const diff = this.difficulty;
    const dt = delta / 1000;

    if (cpu.invuln > 0) cpu.invuln -= delta;

    if (cpu.state === 'attack' || cpu.state === 'hit') {
      cpu.stateTimer -= delta;
      if (cpu.state === 'attack') {
        cpu.attackActive = cpu.stateTimer > 120 && cpu.stateTimer < 240;
        if (cpu.attackActive) {
          const hit = this.combat.resolve(cpu, [target], { damage: 9, knockback: 18, meterGain: 8 });
          if (hit) { AudioSystem.sfx(this, 'hit'); cpu.attackActive = false; }
        }
      }
      if (cpu.stateTimer <= 0) { cpu.state = 'idle'; cpu.attackActive = false; }
      this.clampFighter(cpu);
      return;
    }

    // Throttle decisions by reaction time.
    this.aiTimer -= delta;
    if (this.aiTimer > 0) {
      this.clampFighter(cpu);
      return;
    }
    this.aiTimer = diff.aiReact + Math.random() * 200;

    const dx = target.x - cpu.x;
    const dy = target.feetY - cpu.feetY;
    const dist = Math.abs(dx);

    cpu.facing = dx < 0 ? -1 : 1;

    const attackRange = 80;
    if (dist < attackRange && Math.abs(dy) < LANE_TOLERANCE + 10) {
      // In range: attack with bravery probability.
      if (Math.random() < diff.aiBravery) {
        cpu.attackIndex = (cpu.attackIndex + 1) % 3;
        cpu.state = 'attack';
        cpu.stateTimer = 300;
        cpu.attackActive = false;
        return;
      }
    }

    // Move toward target at difficulty-scaled speed.
    const speed = PLAYER_SPEED * diff.aiSpeed;
    if (dist > attackRange * 0.6) cpu.x += Math.sign(dx) * speed * dt;
    if (Math.abs(dy) > 10) cpu.feetY += Math.sign(dy) * PLAYER_DEPTH_SPEED * diff.aiSpeed * dt;
    cpu.state = 'walk';
    this.clampFighter(cpu);
  }

  private clampFighter(f: Fighter): void {
    f.x = Phaser.Math.Clamp(f.x, 20, GAME_WIDTH - 20);
    f.feetY = Phaser.Math.Clamp(f.feetY, FLOOR_TOP + 10, FLOOR_BOTTOM - 5);
  }

  private checkRoundEnd(): void {
    const p1dead = this.p1.hp <= 0;
    const p2dead = this.p2.hp <= 0;
    if (!p1dead && !p2dead) return;

    this.roundOver = true;
    if (p1dead && p2dead) {
      this.winner = 'DRAW!';
    } else if (p2dead) {
      this.winner = `${CHAR_NAMES[this.p1CharId] ?? 'P1'} WINS!`;
    } else {
      this.winner = `${CHAR_NAMES[this.p2CharId] ?? 'CPU'} WINS!`;
    }

    this.time.delayedCall(600, () => {
      this.resultBanner.setText(this.winner).setVisible(true).setAlpha(1);
      this.tweens.add({ targets: this.resultBanner, scaleX: 1.08, scaleY: 1.08, yoyo: true, duration: 300 });

      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'SPACE — Rematch   R — Reselect   ESC — Menu', {
        fontFamily: 'monospace', fontSize: '13px', color: '#aaaaaa',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(50000);

      const kb = this.input.keyboard!;
      kb.once('keydown-SPACE', () => this.startFight());
      kb.once('keydown-R',     () => this.buildSelectionScreen());
    });
  }

  private drawFightHud(): void {
    const bar = (hp: number, max: number, filled: string, empty: string, len = 16) => {
      const n = Math.max(0, Math.round((hp / max) * len));
      return filled.repeat(n).padEnd(len, empty);
    };
    this.hudP1hp.setText(
      `${CHAR_NAMES[this.p1CharId] ?? 'P1'}\n` +
      `HP [${bar(this.p1.hp, this.p1.maxHp, '█', '·')}] ${Math.ceil(this.p1.hp)}`,
    );
    this.hudP2hp.setText(
      `${CHAR_NAMES[this.p2CharId] ?? 'CPU'}  [CPU]\n` +
      `[${bar(this.p2.hp, this.p2.maxHp, '█', '·')}] ${Math.ceil(this.p2.hp)}`,
    );
  }

  private flashBanner(text: string): void {
    this.fightBanner.setText(text).setVisible(true).setAlpha(1).setScale(1);
    this.tweens.add({
      targets: this.fightBanner,
      alpha: 0,
      scale: 1.3,
      duration: 1100,
      ease: 'Cubic.out',
      onComplete: () => this.fightBanner.setVisible(false),
    });
  }
}

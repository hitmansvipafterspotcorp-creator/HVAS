import Phaser from 'phaser';

// InputSystem: keyboard + gamepad wrapper exposing the brawler's logical buttons.
export type Buttons = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  light: boolean;       // edge-triggered
  medium: boolean;      // edge-triggered
  heavy: boolean;       // edge-triggered
  special: boolean;     // edge-triggered
  attack: boolean;      // legacy alias for light
  attackHeld: boolean;  // legacy alias for light held
  block: boolean;       // held — SHIFT / gamepad LB
  dodge: boolean;       // edge: block held + direction just-pressed
  dodgeX: number;       // -1 / 0 / 1  (direction of dodge)
  dodgeY: number;       // -1 / 0 / 1
  running: boolean;     // double-tap direction within window
  superMove: boolean;   // reserved for full-meter supers
  interact: boolean;    // edge-triggered
};

type TouchState = {
  isDown?: (name: string) => boolean;
};

// Gamepad button indices (standard layout)
const GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, SELECT: 8, START: 9 };

const DOUBLE_TAP_MS = 220; // window to count as a double-tap


export class InputSystem {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private scene: Phaser.Scene;

  // Gamepad edge-trigger tracking
  private gpPrev: Record<number, boolean> = {};
  private prevTouch: Record<string, boolean> = {};

  // Double-tap: timestamps of the LAST keydown for each canonical direction.
  private lastTapAt: Record<'left' | 'right' | 'up' | 'down', number> = {
    left: 0, right: 0, up: 0, down: 0,
  };
  // Whether the player is currently in a run triggered by a double-tap.
  private runActive: Record<'left' | 'right' | 'up' | 'down', boolean> = {
    left: false, right: false, up: false, down: false,
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys(
      'LEFT,RIGHT,UP,DOWN,A,D,W,S,J,K,L,I,SPACE,SHIFT,E,ENTER',
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    // Listen to raw keydown for double-tap detection (runs every actual key event,
    // not once per frame, so we catch back-to-back taps at full resolution).
    kb.on('keydown', (ev: KeyboardEvent) => this.onKeyDown(ev.code));
    kb.on('keyup',   (ev: KeyboardEvent) => this.onKeyUp(ev.code));
  }

  private codeToDir(code: string): 'left' | 'right' | 'up' | 'down' | null {
    switch (code) {
      case 'ArrowLeft':  case 'KeyA': return 'left';
      case 'ArrowRight': case 'KeyD': return 'right';
      case 'ArrowUp':    case 'KeyW': return 'up';
      case 'ArrowDown':  case 'KeyS': return 'down';
      default: return null;
    }
  }

  private onKeyDown(code: string): void {
    const dir = this.codeToDir(code);
    if (!dir) return;
    const now = performance.now();
    if (now - this.lastTapAt[dir] < DOUBLE_TAP_MS) {
      this.runActive[dir] = true;
    }
    this.lastTapAt[dir] = now;
  }

  private onKeyUp(code: string): void {
    const dir = this.codeToDir(code);
    if (dir) this.runActive[dir] = false;
  }

  private gpJustDown(pad: Phaser.Input.Gamepad.Gamepad, btn: number): boolean {
    const pressed = pad.buttons[btn]?.pressed ?? false;
    const prev = this.gpPrev[btn] ?? false;
    this.gpPrev[btn] = pressed;
    return pressed && !prev;
  }

  private touchDown(name: string): boolean {
    const mgr = (globalThis as unknown as { InputManager?: TouchState }).InputManager;
    return !!mgr?.isDown?.(name);
  }

  private touchJustDown(name: string): boolean {
    const down = this.touchDown(name);
    const prev = this.prevTouch[name] ?? false;
    this.prevTouch[name] = down;
    return down && !prev;
  }

  read(): Buttons {
    const k = this.keys;
    const pad = this.scene.input.gamepad?.getPad(0) ?? null;

    // Gamepad edge states
    const gpA      = pad ? this.gpJustDown(pad, GP.A)     : false;
    const gpB      = pad ? this.gpJustDown(pad, GP.B)     : false;
    const gpX      = pad ? this.gpJustDown(pad, GP.X)     : false;
    const gpY      = pad ? this.gpJustDown(pad, GP.Y)     : false;
    const gpRB     = pad ? this.gpJustDown(pad, GP.RB)    : false;
    const gpStart  = pad ? this.gpJustDown(pad, GP.START) : false;

    // Gamepad directional (held)
    const gpLeft  = pad ? (pad.leftStick.x < -0.4 || pad.left)  : false;
    const gpRight = pad ? (pad.leftStick.x >  0.4 || pad.right) : false;
    const gpUp    = pad ? (pad.leftStick.y < -0.4 || pad.up)    : false;
    const gpDown  = pad ? (pad.leftStick.y >  0.4 || pad.down)  : false;

    const tLeft = this.touchDown('left');
    const tRight = this.touchDown('right');
    const tUp = this.touchDown('up');
    const tDown = this.touchDown('down');

    const left  = k.LEFT.isDown  || k.A.isDown || gpLeft || tLeft;
    const right = k.RIGHT.isDown || k.D.isDown || gpRight || tRight;
    const up    = k.UP.isDown    || k.W.isDown || gpUp || tUp;
    const down  = k.DOWN.isDown  || k.S.isDown || gpDown || tDown;

    const tBlock = this.touchDown('block') || this.touchDown('dodge');
    const block = k.SHIFT.isDown || (pad?.buttons[GP.LB]?.pressed ?? false) || tBlock;

    // Dodge = block HELD + any direction just-pressed this frame.
    // We detect "just-pressed" by checking JustDown on the direction keys.
    let dodge = false;
    let dodgeX = 0;
    let dodgeY = 0;
    if (block) {
      const jLeft  = Phaser.Input.Keyboard.JustDown(k.LEFT)  || Phaser.Input.Keyboard.JustDown(k.A);
      const jRight = Phaser.Input.Keyboard.JustDown(k.RIGHT) || Phaser.Input.Keyboard.JustDown(k.D);
      const jUp    = Phaser.Input.Keyboard.JustDown(k.UP)    || Phaser.Input.Keyboard.JustDown(k.W);
      const jDown  = Phaser.Input.Keyboard.JustDown(k.DOWN)  || Phaser.Input.Keyboard.JustDown(k.S);
      // Gamepad dodge: LB held + right-stick flick (or d-pad just-pressed in any dir)
      // For simplicity treat gamepad LB + any dir just-held as a dodge edge.
      if (jLeft || jRight || jUp || jDown) {
        dodge = true;
        dodgeX = jLeft ? -1 : jRight ? 1 : 0;
        dodgeY = jUp   ? -1 : jDown  ? 1 : 0;
      }
    }

    // Running: any run-active direction
    const running =
      (this.runActive.left  && left)  ||
      (this.runActive.right && right) ||
      (this.runActive.up    && up)    ||
      (this.runActive.down  && down);

    const tAttack = this.touchJustDown('attack');
    const tHeavy = this.touchJustDown('heavy');
    const tSpecial = this.touchJustDown('special');
    const light = Phaser.Input.Keyboard.JustDown(k.J) || gpX || tAttack;
    const medium = false;
    const heavy = Phaser.Input.Keyboard.JustDown(k.L) || gpB || tHeavy;
    const special =
      Phaser.Input.Keyboard.JustDown(k.K) ||
      Phaser.Input.Keyboard.JustDown(k.I) ||
      gpY ||
      gpRB ||
      tSpecial;

    return {
      left, right, up, down,
      light,
      medium,
      heavy,
      special,
      attack:     light,
      attackHeld: k.J.isDown || (pad?.buttons[GP.X]?.pressed ?? false) || this.touchDown('attack'),
      block,
      dodge,
      dodgeX,
      dodgeY,
      running,
      superMove:  false,
      interact:
        Phaser.Input.Keyboard.JustDown(k.E)     ||
        Phaser.Input.Keyboard.JustDown(k.ENTER) ||
        Phaser.Input.Keyboard.JustDown(k.SPACE) ||
        gpA || gpStart ||
        this.touchJustDown('interact'),
    };
  }
}

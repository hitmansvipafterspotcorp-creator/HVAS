import Phaser from 'phaser';

// InputSystem: keyboard + gamepad wrapper exposing the brawler's logical buttons.
export type Buttons = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  attack: boolean;     // edge-triggered (just pressed this frame)
  attackHeld: boolean;
  dodge: boolean;      // edge-triggered
  superMove: boolean;  // edge-triggered
  interact: boolean;   // edge-triggered (E / Enter / Space / gamepad A)
};

// Gamepad button indices (standard layout)
const GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, SELECT: 8, START: 9 };

export class InputSystem {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private scene: Phaser.Scene;

  // Gamepad edge-trigger tracking (can't use JustDown for gamepad)
  private gpPrev: Record<number, boolean> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys(
      'LEFT,RIGHT,UP,DOWN,A,D,W,S,J,K,L,SPACE,SHIFT,E,ENTER',
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    // Gamepad plugin is enabled via Phaser game config { input: { gamepad: true } }
  }

  private gpJustDown(pad: Phaser.Input.Gamepad.Gamepad, btn: number): boolean {
    const pressed = pad.buttons[btn]?.pressed ?? false;
    const prev = this.gpPrev[btn] ?? false;
    this.gpPrev[btn] = pressed;
    return pressed && !prev;
  }

  read(): Buttons {
    const k = this.keys;
    const pad = this.scene.input.gamepad?.getPad(0) ?? null;

    // Gamepad edge states computed this frame
    const gpA      = pad ? this.gpJustDown(pad, GP.A) : false;
    const gpB      = pad ? this.gpJustDown(pad, GP.B) : false;
    const gpX      = pad ? this.gpJustDown(pad, GP.X) : false;
    const gpY      = pad ? this.gpJustDown(pad, GP.Y) : false;
    const gpRB     = pad ? this.gpJustDown(pad, GP.RB) : false;
    const gpStart  = pad ? this.gpJustDown(pad, GP.START) : false;

    const gpLeft  = pad ? (pad.leftStick.x < -0.4 || pad.left)  : false;
    const gpRight = pad ? (pad.leftStick.x >  0.4 || pad.right) : false;
    const gpUp    = pad ? (pad.leftStick.y < -0.4 || pad.up)    : false;
    const gpDown  = pad ? (pad.leftStick.y >  0.4 || pad.down)  : false;

    return {
      left:       k.LEFT.isDown  || k.A.isDown    || gpLeft,
      right:      k.RIGHT.isDown || k.D.isDown     || gpRight,
      up:         k.UP.isDown    || k.W.isDown     || gpUp,
      down:       k.DOWN.isDown  || k.S.isDown     || gpDown,
      attack:     Phaser.Input.Keyboard.JustDown(k.J) || gpX,
      attackHeld: k.J.isDown || (pad?.buttons[GP.X]?.pressed ?? false),
      dodge:      Phaser.Input.Keyboard.JustDown(k.SHIFT) || gpB,
      superMove:  Phaser.Input.Keyboard.JustDown(k.K)     || gpY || gpRB,
      interact:
        Phaser.Input.Keyboard.JustDown(k.E)     ||
        Phaser.Input.Keyboard.JustDown(k.ENTER) ||
        Phaser.Input.Keyboard.JustDown(k.SPACE) ||
        gpA || gpStart,
    };
  }
}

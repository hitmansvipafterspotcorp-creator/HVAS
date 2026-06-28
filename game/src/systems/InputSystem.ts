import Phaser from 'phaser';

// InputSystem: thin keyboard wrapper exposing the brawler's logical buttons.
// Keeps scene code free of raw key-code checks and gives one place to add
// touch/gamepad later (Android landscape-first).
export type Buttons = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  attack: boolean; // edge-triggered (just pressed this frame)
  attackHeld: boolean;
  dodge: boolean; // edge-triggered
  superMove: boolean; // edge-triggered
  interact: boolean; // edge-triggered (E / Enter / Space)
};

export class InputSystem {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys(
      'LEFT,RIGHT,UP,DOWN,A,D,W,S,J,K,L,SPACE,SHIFT,E,ENTER',
    ) as Record<string, Phaser.Input.Keyboard.Key>;
  }

  read(): Buttons {
    const k = this.keys;
    return {
      left: k.LEFT.isDown || k.A.isDown,
      right: k.RIGHT.isDown || k.D.isDown,
      up: k.UP.isDown || k.W.isDown,
      down: k.DOWN.isDown || k.S.isDown,
      attack: Phaser.Input.Keyboard.JustDown(k.J),
      attackHeld: k.J.isDown,
      dodge: Phaser.Input.Keyboard.JustDown(k.SHIFT),
      superMove: Phaser.Input.Keyboard.JustDown(k.K),
      interact:
        Phaser.Input.Keyboard.JustDown(k.E) ||
        Phaser.Input.Keyboard.JustDown(k.ENTER) ||
        Phaser.Input.Keyboard.JustDown(k.SPACE),
    };
  }
}

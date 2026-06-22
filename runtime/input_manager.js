'use strict';
const InputManager = (() => {
  const state = {
    left: false, right: false, up: false, down: false,
    attack: false, special: false, dodge: false, interact: false,
    confirm: false, back: false, pause: false, start: false, select: false,
    block: false
  };

  const prev = {};
  const callbacks = [];

  const keyMap = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    z: 'attack', Z: 'attack',
    x: 'special', X: 'special',
    c: 'dodge', C: 'dodge',
    v: 'interact', V: 'interact',
    Enter: 'confirm',
    ' ': 'confirm',
    Backspace: 'back',
    Escape: 'pause',
    p: 'pause', P: 'pause',
    Tab: 'select'
  };

  function onKey(e, down) {
    const action = keyMap[e.key];
    if (!action) return;
    if (action === 'dodge' && down && e.shiftKey) { state.block = true; return; }
    if (!e.shiftKey) state.block = false;
    if (state[action] !== down) {
      state[action] = down;
      if (down) callbacks.forEach(cb => cb(action));
    }
    if (['up','down','left','right','confirm','back','attack','special','dodge','interact','pause','select'].includes(action)) {
      e.preventDefault();
    }
  }

  function copyState() { Object.assign(prev, state); }

  function justPressed(action) { return state[action] && !prev[action]; }

  let _inited = false;
  function init() {
    if (_inited) return;
    _inited = true;
    window.addEventListener('keydown', e => onKey(e, true));
    window.addEventListener('keyup', e => onKey(e, false));
    initGamepad();
    setInterval(copyState, 16);
  }

  function setTouch(action, down) {
    state[action] = down;
    if (down) callbacks.forEach(cb => cb(action));
  }

  function onInputCallback(fn) { callbacks.push(fn); }

  // Gamepad support
  let padIdx = null;
  function initGamepad() {
    window.addEventListener('gamepadconnected', e => { padIdx = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { padIdx = null; });
  }

  const gpMap = [
    { idx: 0, action: 'attack' },    // A
    { idx: 1, action: 'special' },   // B / back
    { idx: 2, action: 'dodge' },     // X
    { idx: 3, action: 'interact' },  // Y
    { idx: 8, action: 'select' },    // Select/Back
    { idx: 9, action: 'pause' }      // Start
  ];

  function pollGamepad() {
    if (padIdx === null) return;
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gps[padIdx];
    if (!gp) return;

    gpMap.forEach(({ idx, action }) => {
      const pressed = gp.buttons[idx] && gp.buttons[idx].pressed;
      if (state[action] !== pressed) {
        state[action] = pressed;
        if (pressed) callbacks.forEach(cb => cb(action));
      }
    });

    const threshold = 0.5;
    const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
    state.left  = lx < -threshold || (gp.buttons[14] && gp.buttons[14].pressed);
    state.right = lx >  threshold || (gp.buttons[15] && gp.buttons[15].pressed);
    state.up    = ly < -threshold || (gp.buttons[12] && gp.buttons[12].pressed);
    state.down  = ly >  threshold || (gp.buttons[13] && gp.buttons[13].pressed);
  }

  function update() { pollGamepad(); }

  return { state, init, setTouch, onInputCallback, justPressed, update };
})();

'use strict';
/**
 * VersusEngine — 1v1 versus fighter (Street Fighter / Mortal Kombat style)
 *
 * Best-of-3 rounds, round timer, two health bars, super meters, KO,
 * walk / jump / crouch / block, light + heavy normals, EX special (meter),
 * and a cinematic SUPER (full meter). Player vs CPU.
 *
 * Renders real sprite sheets via SpriteSystem when available; falls back to vector.
 * Controls (mapped from the HITGEAR shell / InputManager.state):
 *   D-pad L/R  walk (hold AWAY from rival = BLOCK)
 *   D-pad Up   jump      D-pad Down  crouch
 *   A          light hit       B  heavy hit
 *   X          EX special (25 meter)     Y  SUPER (100 meter)
 */
const VersusEngine = (() => {

  // ── tuning ────────────────────────────────────────────────────────────────
  const GROUND_FRAC = 0.86;
  const GRAVITY     = 2600;
  const JUMP_VEL    = -900;
  const ROUND_TIME  = 75;       // seconds
  const ROUNDS_TO_WIN = 2;
  const CHIP_MULT   = 0.12;     // block chip damage
  const PUSH_WALL   = 40;       // min gap from screen edges

  // attack definitions (times in seconds, distances in px @ 720-tall canvas)
  const MOVES = {
    light:   { startup:.05, active:.06, recovery:.16, reach:96,  hh:120, dmgK:0.55, hitstun:.28, block:.18, kb:160, meter:8,  knockdown:false, hi:'mid'  },
    heavy:   { startup:.12, active:.08, recovery:.30, reach:112, hh:150, dmgK:1.05, hitstun:.42, block:.26, kb:380, meter:12, knockdown:true,  hi:'mid'  },
    crouch:  { startup:.06, active:.07, recovery:.18, reach:104, hh:70,  dmgK:0.6,  hitstun:.30, block:.18, kb:140, meter:8,  knockdown:false, hi:'low'  },
    air:     { startup:.05, active:.10, recovery:.12, reach:90,  hh:120, dmgK:0.7,  hitstun:.32, block:.18, kb:200, meter:9,  knockdown:false, hi:'over' },
    // ── directional specials (Y + direction) — same easy button, 3 distinct tools ──
    // FORWARD + Y → Special 1: ranged projectile pressure
    special:  { startup:.10, active:.12, recovery:.30, reach:140, hh:140, dmgK:1.3,  hitstun:.50, block:.30, kb:420, meter:0,  cost:25, knockdown:true,  projectile:true, name:'PROJECTILE' },
    // DOWN + Y → Special 2: rising anti-air uppercut (melee, tall hitbox, launches)
    special2: { startup:.06, active:.14, recovery:.34, reach:104, hh:230, dmgK:1.2,  hitstun:.55, block:.28, kb:280, meter:0,  cost:25, knockdown:true,  launch:true,    name:'RISING' },
    // BACK + Y → Special 3: lunging advancing strike (melee, covers ground)
    special3: { startup:.12, active:.10, recovery:.26, reach:180, hh:130, dmgK:1.25, hitstun:.50, block:.30, kb:480, meter:0,  cost:25, knockdown:true,  dash:true,      name:'LUNGE' },
    // UP + Y → FINISHER: cinematic super (full meter)
    super:    { startup:.16, active:.30, recovery:.40, reach:520, hh:300, dmgK:3.2,  hitstun:.70, block:.40, kb:560, meter:0,  cost:100, knockdown:true, projectile:true, cinematic:true, name:'FINISHER' },
  };

  // magic-series tiers — higher tier cancels lower on hit (auto-combo glue)
  const TIER = { light:1, crouch:1, air:1, heavy:2, special:3, special2:3, special3:3, super:4 };

  // ── module state ────────────────────────────────────────────────────────────
  let canvas, ctx, W, H, groundY, rafId = null, running = false;
  let last = 0;
  let p1, p2, stage, onMatchEnd, onQuit, difficulty = 1;
  let projectiles = [];
  let sparks = [];
  let popups = [];      // floating damage / combo text
  let shake = 0;
  let hitstop = 0;
  let flash = 0;        // super-flash white overlay 0..1
  let phase = 'intro';  // intro | fight | roundover | matchover
  let phaseT = 0;
  let bigText = '', bigSub = '', bigT = 0;
  let roundNum = 1;
  let timer = ROUND_TIME;
  let aiThink = 0;
  let startOpts = null;  // remember opts for rematch
  let training = false;  // training mode — passive dummy, infinite meter, no KO

  // ── pause menu ──────────────────────────────────────────────────────────────
  let paused = false, pauseSel = 0;
  let overlay = null;    // null | 'moves' | 'controls'
  function pauseItems() {
    return ['RESUME', 'MOVE LIST', 'CONTROLS',
            'TRAINING: ' + (training ? 'ON' : 'OFF'),
            'REMATCH', 'QUIT TO MENU'];
  }
  let _prevPause = false, _prevUp = false, _prevDown = false, _prevConfirm = false, _prevBack = false;

  // ── helpers ───────────────────────────────────────────────────────────────
  function makeFighter(charId, isPlayer, side) {
    const c = (window.CHARACTERS || []).find(x => x.id === charId) || {};
    const hp = (c.baseHp || 110);
    return {
      char: c, isPlayer, side,
      name: c.shortName || c.name || 'FIGHTER',
      color: c.color || '#ff00aa',
      emoji: c.emoji || '🥊',
      x: side < 0 ? W * 0.30 : W * 0.70,
      y: groundY, vx: 0, vy: 0,
      w: 64, h: 150,
      facing: -side,            // face the other fighter
      maxHp: hp, hp,
      meter: 0, maxMeter: 100,
      baseDmg: c.baseDmg || 16,
      speed: (c.moveSpeed || 4.5) * 46,
      onGround: true, crouching: false, blocking: false,
      state: 'idle', stateT: 0,
      attack: null, atkPhase: '', atkT: 0, atkHit: false,
      hitstun: 0, blockstun: 0, knockdown: 0,
      combo: 0, comboT: 0,
      rounds: 0,
      flashHit: 0,
      anchorY: groundY,
    };
  }

  function resetPositions() {
    p1.x = W * 0.30; p2.x = W * 0.70;
    [p1, p2].forEach(f => {
      f.y = groundY; f.vx = 0; f.vy = 0; f.onGround = true;
      f.state = 'idle'; f.stateT = 0; f.attack = null; f.atkPhase = '';
      f.hitstun = 0; f.blockstun = 0; f.knockdown = 0; f.crouching = false;
      f.blocking = false; f.combo = 0; f.hp = f.maxHp;
    });
    p1.facing = 1; p2.facing = -1;
    projectiles = []; sparks = []; popups = [];
  }

  // swap the shell face-button captions to fighter roles (and restore on exit)
  const _btnDefaults = { 'touch-a':'A', 'touch-b':'B', 'touch-x':'X', 'touch-y':'Y' };
  const _btnFighter  = { 'touch-a':'L', 'touch-b':'H', 'touch-x':'BLK', 'touch-y':'SP' };
  function setButtonLabels(map) {
    if (typeof document === 'undefined') return;
    Object.keys(map).forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = map[id]; el.classList.toggle('fight-label', map === _btnFighter); }
    });
  }

  // ── public start / stop ─────────────────────────────────────────────────────
  function start(cv, opts) {
    setButtonLabels(_btnFighter);
    startOpts = opts;
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    stage = opts.stage || { sky:'#0a0020', ground:'#08000f', accent:'#ff00aa', name:'AFTER SPOT' };
    difficulty = opts.difficulty || 1;
    training = !!opts.training;
    onMatchEnd = opts.onMatchEnd || function(){};
    onQuit = opts.onQuit || function(){};
    paused = false; pauseSel = 0; overlay = null;
    p1 = makeFighter(opts.p1CharId, true,  -1);
    p2 = makeFighter(opts.p2CharId, false,  1);
    if (opts.playerName) p1.name = String(opts.playerName).toUpperCase().slice(0, 12);
    p2.maxHp = Math.round(p2.maxHp * (0.85 + difficulty * 0.12));
    p2.hp = p2.maxHp;
    p1.rounds = 0; p2.rounds = 0;
    roundNum = 1;
    if (typeof InputManager !== 'undefined') InputManager.init();
    // Preload sprite frames for both fighters so they're ready when the fight starts
    if (typeof SpriteSystem !== 'undefined') {
      SpriteSystem.preload(opts.p1CharId);
      SpriteSystem.preload(opts.p2CharId);
    }
    beginRound();
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
  }

  // ── pause controls ────────────────────────────────────────────────────────────
  function togglePause() {
    if (phase === 'matchover') return;
    paused = !paused;
    pauseSel = 0;
    overlay = null;
  }

  function rematch() {
    paused = false;
    p1.rounds = 0; p2.rounds = 0;
    roundNum = 1;
    p1.hp = p1.maxHp; p2.hp = p2.maxHp;
    p1.meter = 0; p2.meter = 0;
    phase = 'intro';
    beginRound();
  }

  function quitMatch() {
    paused = false;
    stop();
    onQuit();
  }

  function handlePauseNav() {
    const s = (typeof InputManager !== 'undefined') ? InputManager.state : {};
    const up = !!s.up, down = !!s.down, confirm = !!(s.confirm || s.attack), back = !!s.back;

    // an overlay (move list / controls) is open — any back/confirm closes it
    if (overlay) {
      if ((back && !_prevBack) || (confirm && !_prevConfirm)) overlay = null;
      _prevUp = up; _prevDown = down; _prevConfirm = confirm; _prevBack = back;
      return;
    }

    const items = pauseItems();
    if (up && !_prevUp)     pauseSel = (pauseSel + items.length - 1) % items.length;
    if (down && !_prevDown) pauseSel = (pauseSel + 1) % items.length;
    if (back && !_prevBack) { _prevBack = back; paused = false; }
    if (confirm && !_prevConfirm) {
      const sel = items[pauseSel];
      if (sel === 'RESUME') paused = false;
      else if (sel === 'MOVE LIST') overlay = 'moves';
      else if (sel === 'CONTROLS') overlay = 'controls';
      else if (sel.indexOf('TRAINING') === 0) { training = !training; if (training) { rematch(); paused = true; } }
      else if (sel === 'REMATCH') rematch();
      else if (sel === 'QUIT TO MENU') quitMatch();
    }
    _prevUp = up; _prevDown = down; _prevConfirm = confirm; _prevBack = back;
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', resize);
    setButtonLabels(_btnDefaults);
  }

  function resize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    W = canvas.width  = (wrap && wrap.clientWidth)  || window.innerWidth;
    H = canvas.height = (wrap && wrap.clientHeight) || window.innerHeight;
    groundY = H * GROUND_FRAC;
    if (p1) p1.anchorY = groundY;
    if (p2) p2.anchorY = groundY;
  }

  function beginRound() {
    resetPositions();
    timer = ROUND_TIME;
    phase = 'intro'; phaseT = 0;
    bigText = 'ROUND ' + roundNum; bigSub = ''; bigT = 1.4;
  }

  // ── input read ──────────────────────────────────────────────────────────────
  function readPlayerInputs() {
    const s = (typeof InputManager !== 'undefined') ? InputManager.state : {};
    // 4-BUTTON LAYOUT — A:LIGHT  B:HEAVY  X:BLOCK  Y:SPECIAL(+direction)
    return {
      left: !!s.left, right: !!s.right, up: !!s.up, down: !!s.down,
      light: !!s.attack,             // A — light auto-combo
      heavy: !!s.special,            // B — heavy auto-combo
      block: !!s.dodge || !!s.block, // X — guard
      sp:    !!s.interact,           // Y — directional special / finisher
    };
  }

  // ── attack start ────────────────────────────────────────────────────────────
  // EASY 4-BUTTON ENGINE: mashing chains automatically (magic series). Any move
  // can be cancelled into a SAME-OR-HIGHER tier move once it has CONNECTED, so
  // light→light→heavy→special→FINISHER all flow from simple taps for every char.
  function tryAttack(f, kind) {
    if (f.hitstun > 0 || f.blockstun > 0 || f.knockdown > 0) return;
    let moveKey = kind;
    if (kind === 'light' && f.crouching) moveKey = 'crouch';
    if (kind === 'light' && !f.onGround) moveKey = 'air';
    const m = MOVES[moveKey];
    if (!m) return;

    // mid-move? only allow a gatling cancel: must have hit, past startup, higher-or-equal tier
    if (f.attack) {
      const cur = TIER[f.attack] || 0, nxt = TIER[moveKey] || 0;
      const canCancel = f.atkHit && f.atkPhase !== 'startup' && nxt >= cur && moveKey !== f.attack
                        || (f.atkHit && f.atkPhase === 'recovery' && nxt >= cur);
      if (!canCancel) return;
    }

    if (m.cost) {
      if (f.meter < m.cost) return;
      f.meter -= m.cost;
      if (m.cinematic) { flash = 1; hitstop = 0.35; shake = 16; }
    }
    f.attack = moveKey;
    f.atkPhase = 'startup';
    f.atkT = m.startup;
    f.atkHit = false;
    f.state = m.cinematic ? 'super' : (m.projectile ? 'special' : kind);
    // special movement flavor: rising launcher hops up, lunge dashes forward
    if (m.launch && f.onGround) { f.vy = -560; f.onGround = false; f.knockdown = 0; }
    if (m.dash) f.vx = f.facing * f.speed * 2.2;
    else f.vx = (!f.onGround) ? f.vx : 0;
  }

  function spawnProjectile(f, m) {
    const cinematic = !!m.cinematic;
    projectiles.push({
      owner: f, x: f.x + f.facing * 50, y: f.y - f.h * 0.55,
      vx: f.facing * (cinematic ? 980 : 720),
      r: cinematic ? 46 : 26,
      dmg: f.baseDmg * m.dmgK, m, cinematic,
      color: f.color, life: cinematic ? 1.6 : 1.1, hit: false,
    });
  }

  // ── damage application ──────────────────────────────────────────────────────
  function hitFighter(att, def, m, srcX) {
    if (def.knockdown > 0 || def.hp <= 0) return;
    // block check: BLOCK BUTTON held, grounded, not mid-attack.
    // Overheads beat crouch-guard; lows beat standing-guard. (easy, readable rules)
    let blocking = def.blocking && def.onGround && def.hitstun <= 0 && !def.attack;
    if (m.hi === 'over' && def.crouching) blocking = false;
    if (m.hi === 'low' && !def.crouching) blocking = false;

    const scale = Math.pow(0.86, Math.max(0, att.combo - 1));
    let dmg = Math.max(1, Math.round(att.baseDmg * m.dmgK * scale * (blocking ? CHIP_MULT : 1)));
    def.hp = Math.max(0, def.hp - dmg);

    const dir = att.facing;
    if (blocking) {
      def.blockstun = m.block;
      def.vx = dir * 120;
      att.meter = Math.min(100, att.meter + (m.meter||6) * 0.5);
      def.meter = Math.min(100, def.meter + 4);
      spark(def.x, def.y - def.h*0.5, '#66ccff', 8);
      popup(def.x, def.y - def.h, 'BLOCK', '#66ccff', 13);
    } else {
      def.hitstun = m.hitstun;
      def.blockstun = 0;
      def.vx = dir * m.kb;
      if (m.knockdown) { def.vy = -380; def.onGround = false; def.knockdown = 0.01; }
      att.combo++; att.comboT = 1.4;
      att.meter = Math.min(100, att.meter + (m.meter || 10));
      def.meter = Math.min(100, def.meter + 6);
      def.flashHit = 0.12;
      hitstop = Math.max(hitstop, m.cinematic ? 0.12 : m.knockdown ? 0.09 : 0.05);
      shake = Math.max(shake, m.cinematic ? 18 : m.knockdown ? 10 : 5);
      spark(def.x, def.y - def.h*0.55, att.color, m.knockdown ? 16 : 10);
      popup(def.x, def.y - def.h, String(dmg), m.cinematic ? '#ffd700' : '#ff5566', m.cinematic ? 26 : 16);
      if (att.combo >= 2) popup(att.x, att.y - att.h - 22, att.combo + ' HIT', '#ffdd00', 15);
    }
  }

  // ── fx ───────────────────────────────────────────────────────────────────────
  function spark(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 260;
      sparks.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp - 60, life: .35, color });
    }
    // CharRenderer VFX overlay
    if (typeof CharRenderer !== 'undefined') {
      const level = n >= 16 ? 4 : n >= 10 ? 3 : n >= 8 ? 2 : 1;
      CharRenderer.spawnHitSpark(x, y, level, color);
    }
  }
  function popup(x, y, text, color, size) { popups.push({ x, y, text, color, size, life: .9, vy: -70 }); }

  // ── per-fighter update ───────────────────────────────────────────────────────
  function updateFighter(f, opp, inputs, dt) {
    // facing toward opponent (unless mid-move / airborne)
    if (f.onGround && !f.attack && f.hitstun <= 0)
      f.facing = (opp.x >= f.x) ? 1 : -1;


    // timers
    if (f.comboT > 0) { f.comboT -= dt; if (f.comboT <= 0) f.combo = 0; }
    if (f.flashHit > 0) f.flashHit -= dt;
    if (f.hitstun > 0) f.hitstun -= dt;
    if (f.blockstun > 0) f.blockstun -= dt;

    const stunned = f.hitstun > 0 || f.blockstun > 0;

    // movement / actions only when free
    const free = !stunned && !f.attack && f.onGround && f.knockdown <= 0;
    f.crouching = false;
    f.blocking = false;

    // edge-detect the SPECIAL trigger so Y fires one directional special per press
    const spEdge = inputs.sp && !f._pSp;
    f._pSp = inputs.sp;

    if (free) {
      const back = f.facing > 0 ? inputs.left : inputs.right;
      const fwd  = f.facing > 0 ? inputs.right : inputs.left;

      // ── BLOCK BUTTON (X) — dedicated, hold to guard (crouch-guard with Down) ──
      if (inputs.block) { f.blocking = true; f.crouching = !!inputs.down; f.vx = 0; }
      else if (inputs.down) { f.crouching = true; f.vx = 0; }
      else if (fwd)  { f.vx = f.facing * f.speed; }
      else if (back) { f.vx = -f.facing * f.speed * 0.7; }
      else f.vx = 0;

      // jump (Up) — but not while guarding or queuing a special
      if (inputs.up && f.onGround && !inputs.block && !inputs.sp) {
        f.vy = JUMP_VEL; f.onGround = false;
        f.vx = (fwd?f.facing:back?-f.facing:0) * f.speed * 0.9;
      }

      // ── SPECIAL (Y) + direction — one easy button, four tools ──
      if (spEdge) {
        if (inputs.up)        tryAttack(f, 'super');     // UP   = FINISHER
        else if (inputs.down) tryAttack(f, 'special2');  // DOWN = rising
        else if (back)        tryAttack(f, 'special3');  // BACK = lunge
        else                  tryAttack(f, 'special');   // FWD/neutral = projectile
      }
      // ── LIGHT (A) / HEAVY (B) — held mashing auto-chains via gatling cancels ──
      else if (inputs.heavy) tryAttack(f, 'heavy');
      else if (inputs.light) tryAttack(f, 'light');
    } else if (!f.onGround && !stunned) {
      // air actions: light/heavy = air normal, Y = air special
      if (spEdge) tryAttack(f, 'special');
      else if (inputs.light || inputs.heavy) tryAttack(f, 'light');
    }

    // keep guarding through blockstun so multi-hit strings stay blockable
    if (f.blockstun > 0 && inputs.block && f.onGround && f.hitstun <= 0) {
      f.blocking = true; f.crouching = !!inputs.down;
    }

    // attack state machine
    if (f.attack) {
      const m = MOVES[f.attack];
      f.atkT -= dt;
      if (f.atkPhase === 'startup' && f.atkT <= 0) {
        f.atkPhase = 'active'; f.atkT = m.active; f.atkHit = false;
        if (m.projectile) { spawnProjectile(f, m); }
      } else if (f.atkPhase === 'active') {
        if (!m.projectile && !f.atkHit) {
          // melee hitbox
          const hb = attackBox(f, m);
          if (overlap(hb, hurtBox(opp))) { hitFighter(f, opp, m, f.x); f.atkHit = true; }
        }
        if (f.atkT <= 0) { f.atkPhase = 'recovery'; f.atkT = m.recovery; }
      } else if (f.atkPhase === 'recovery' && f.atkT <= 0) {
        f.attack = null; f.atkPhase = ''; f.state = 'idle';
      }
    }

    // physics
    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.onGround && f.knockdown <= 0) f.vx *= 0.8;

    if (f.y >= f.anchorY) {
      f.y = f.anchorY; f.vy = 0;
      if (!f.onGround) {
        f.onGround = true;
        if (f.knockdown > 0 || f.state === 'knockdown') { f.hitstun = 0.45; }
        if (f.attack && !MOVES[f.attack].projectile) { f.attack = null; f.atkPhase=''; }
      }
      f.knockdown = 0;
    }

    // clamp to arena
    f.x = Math.max(PUSH_WALL + f.w/2, Math.min(W - PUSH_WALL - f.w/2, f.x));

    // state label for rendering
    if (stunned) f.state = f.hitstun>0 ? 'hurt' : 'block';
    else if (f.attack) f.state = (f.attack==='super')?'super':(f.attack.indexOf('special')===0)?'special':(f.attack);
    else if (!f.onGround) f.state = 'air';
    else if (f.crouching) f.state = 'crouch';
    else if (f.blocking) f.state = 'block';
    else if (Math.abs(f.vx) > 5) f.state = 'walk';
    else f.state = 'idle';
  }

  function attackBox(f, m) {
    const hh = m.hh;
    const top = f.y - (f.crouching ? f.h*0.55 : f.h) + (m.hi==='low'? f.h*0.45:0);
    return f.facing > 0
      ? { x: f.x + f.w*0.2, y: top, w: m.reach, h: hh }
      : { x: f.x - f.w*0.2 - m.reach, y: top, w: m.reach, h: hh };
  }
  function hurtBox(f) {
    const h = f.crouching ? f.h*0.6 : f.h;
    return { x: f.x - f.w*0.4, y: f.y - h, w: f.w*0.8, h };
  }
  function overlap(a, b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }

  // ── CPU AI ───────────────────────────────────────────────────────────────────
  function cpuInputs(dt) {
    const me = p2, foe = p1;
    const out = { left:false, right:false, up:false, down:false, light:false, heavy:false, block:false, sp:false, special:false, super:false };
    if (me.hitstun > 0 || me.knockdown > 0) return out;
    const dist = Math.abs(foe.x - me.x);
    const dir = foe.x > me.x ? 1 : -1;
    // difficulty 1 (easy) → 3 (final boss). Clamp the influence so rung 1 feels fair.
    const d = Math.max(0, Math.min(1, (difficulty - 1) / 2));   // 0..1 normalized
    const aggro = 0.30 + d * 0.45;     // how often it presses forward / attacks
    const blockSkill = 0.25 + d * 0.50; // how reliably it blocks real threats

    aiThink -= dt;
    if (aiThink <= 0) {
      // lower difficulty = slower reactions (longer think gaps = more whiff windows)
      aiThink = (0.34 - d * 0.20) + Math.random() * (0.34 - d * 0.18);
      me._plan = Math.random();
      // easy AI sometimes just idles, giving the player openings
      me._idle = Math.random() > (0.55 + d * 0.40);
    }
    const plan = me._plan || 0;
    if (me._idle) { return out; }

    // block when foe is attacking & close
    const foeThreat = foe.attack && foe.atkPhase !== 'recovery' && dist < 190;
    if (foeThreat && plan < blockSkill) {
      out.block = true;                                          // press BLOCK button
      if (foe.crouching && plan < blockSkill * 0.5) out.down = true; // low guard
      return out;
    }

    if (dist > 360) {
      // approach or zone with special
      if (me.meter >= 25 && plan < 0.18 + d*0.12) out.special = true;
      else { if (dir>0) out.right=true; else out.left=true; }
    } else if (dist > 150) {
      if (me.meter >= 100 && plan < 0.25 + d*0.25) out.super = true;
      else if (me.meter >= 25 && plan < 0.25 + d*0.15) out.special = true;
      else if (plan < aggro) { if (dir>0) out.right=true; else out.left=true; }
      else if (plan > 0.92) out.up = true;
    } else {
      // in range — attack mix scales with difficulty
      if (me.meter >= 100 && plan < 0.18 + d*0.20) out.super = true;
      else if (plan < 0.30 + aggro*0.25) out.light = true;
      else if (plan < 0.55 + d*0.15) out.heavy = true;
      else if (plan < 0.78 && me.meter >= 25) out.special = true;
      else { if (dir>0) out.left=true; else out.right=true; } // back off / block
    }
    // translate intent → 4-button shape: Y(+Up for finisher)
    if (out.super) { out.sp = true; out.up = true; }
    else if (out.special) { out.sp = true; }   // neutral/forward special (projectile)
    return out;
  }

  // training dummy — stands still, no offense (pure practice target)
  function trainingDummy() {
    return { left:false, right:false, up:false, down:false, light:false, heavy:false, block:false, sp:false };
  }

  // ── main loop ────────────────────────────────────────────────────────────────
  function loop(now) {
    if (!running) return;
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    // pause toggle (edge-detected) — START / Esc / P
    const ps = (typeof InputManager !== 'undefined') ? !!InputManager.state.pause : false;
    if (ps && !_prevPause) togglePause();
    _prevPause = ps;
    if (paused) { handlePauseNav(); return; }

    if (bigT > 0) bigT -= dt;
    if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
    if (shake > 0) shake = Math.max(0, shake - dt * 60);

    // fx always tick a little even on hitstop
    updateFx(dt);

    if (hitstop > 0) { hitstop -= dt; return; }

    if (phase === 'intro') {
      phaseT += dt;
      if (phaseT > 1.1 && bigText.startsWith('ROUND')) { bigText = 'FIGHT!'; bigSub=''; bigT = 0.9; }
      if (phaseT > 1.9) { phase = 'fight'; }
      return; // fighters frozen during intro
    }

    if (phase === 'fight') {
      if (!training) timer -= dt;
      const pin = readPlayerInputs();
      // TRAINING: opponent is a passive dummy that only guards occasionally
      const cin = training ? trainingDummy() : cpuInputs(dt);
      updateFighter(p1, p2, pin, dt);
      updateFighter(p2, p1, cin, dt);
      updateProjectiles(dt);

      if (training) {
        // infinite meter to practice specials/finisher; dummy never dies; reset on KO
        p1.meter = 100;
        if (p2.hp <= 0) { p2.hp = p2.maxHp; popup(p2.x, p2.y - p2.h, 'RESET', '#66ff99', 16); }
        if (p1.hp <= 0) p1.hp = p1.maxHp;
        p2.hp = Math.min(p2.maxHp, p2.hp + p2.maxHp * 0.25 * dt); // slow regen so combos read
      } else if (p1.hp <= 0 || p2.hp <= 0 || timer <= 0) endRound();
    }

    if (phase === 'roundover') {
      phaseT += dt;
      if (phaseT > 2.0) {
        if (p1.rounds >= ROUNDS_TO_WIN || p2.rounds >= ROUNDS_TO_WIN) endMatch();
        else { roundNum++; beginRound(); }
      }
    }
  }

  function endRound() {
    phase = 'roundover'; phaseT = 0;
    let winner;
    if (p1.hp <= 0 && p2.hp <= 0) winner = null;
    else if (p1.hp <= 0) winner = p2;
    else if (p2.hp <= 0) winner = p1;
    else winner = (p1.hp >= p2.hp) ? p1 : p2;
    if (winner) winner.rounds++;
    flash = 0.6; shake = 14;
    if (winner === p1) { bigText = 'K.O.'; bigSub = 'ROUND WON'; }
    else if (winner === p2) { bigText = 'K.O.'; bigSub = 'ROUND LOST'; }
    else { bigText = 'DOUBLE K.O.'; bigSub=''; }
    bigT = 2.0;
  }

  function endMatch() {
    phase = 'matchover';
    const playerWon = p1.rounds > p2.rounds;
    stop();
    onMatchEnd(playerWon);
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length-1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt; p.life -= dt;
      const target = (p.owner === p1) ? p2 : p1;
      if (!p.hit && overlap({x:p.x-p.r,y:p.y-p.r,w:p.r*2,h:p.r*2}, hurtBox(target))) {
        hitFighter(p.owner, target, p.m, p.x);
        p.hit = true;
        if (!p.cinematic) { projectiles.splice(i,1); continue; }
      }
      if (p.x < -80 || p.x > W+80 || p.life <= 0) projectiles.splice(i,1);
    }
  }

  function updateFx(dt) {
    for (let i = sparks.length-1; i>=0; i--) {
      const s = sparks[i]; s.x+=s.vx*dt; s.y+=s.vy*dt; s.vy+=900*dt; s.life-=dt;
      if (s.life<=0) sparks.splice(i,1);
    }
    for (let i = popups.length-1; i>=0; i--) {
      const p = popups[i]; p.y+=p.vy*dt; p.vy*=0.92; p.life-=dt;
      if (p.life<=0) popups.splice(i,1);
    }
    if (typeof CharRenderer !== 'undefined') CharRenderer.updateVFX(dt);
  }

  // ── render ───────────────────────────────────────────────────────────────────
  function render() {
    if (!ctx) return;
    ctx.save();
    const sx = shake>0 ? (Math.random()-0.5)*shake : 0;
    const sy = shake>0 ? (Math.random()-0.5)*shake : 0;
    ctx.translate(sx, sy);

    drawStage();
    // draw fighters back-to-front by y
    const order = [p1, p2].sort((a,b)=>a.y-b.y);
    order.forEach(drawFighter);
    projectiles.forEach(drawProjectile);
    // CharRenderer VFX layer (over fighters, under HUD)
    if (typeof CharRenderer !== 'undefined') {
      CharRenderer.drawVFX(ctx, W, H);
    }
    drawSparks();
    drawPopups();
    ctx.restore();

    drawHUD();
    drawControlsLegend();
    drawBigText();

    if (flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, flash)})`;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }

    if (paused) drawPause();
  }

  function drawPause() {
    ctx.save();
    ctx.fillStyle = 'rgba(4,0,12,0.88)';
    ctx.fillRect(0,0,W,H);

    if (overlay === 'moves')    { drawMoveList(); ctx.restore(); return; }
    if (overlay === 'controls') { drawControlsPage(); ctx.restore(); return; }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 22;
    ctx.font = `900 ${Math.max(30,H*0.09)}px Orbitron, monospace`;
    ctx.fillText('PAUSED', W/2, H*0.20);
    ctx.shadowBlur = 0;
    if (training) {
      ctx.font = `700 ${Math.max(12,H*0.026)}px Orbitron, monospace`;
      ctx.fillStyle = '#66ff99';
      ctx.fillText('● TRAINING MODE', W/2, H*0.27);
    }
    const items = pauseItems();
    const itemH = Math.max(34, H*0.072);
    const y0 = H*0.36;
    items.forEach((label, i) => {
      const sel = i === pauseSel;
      const y = y0 + i*itemH;
      ctx.font = `${sel?'900':'700'} ${Math.max(17,H*0.042)}px Orbitron, monospace`;
      ctx.fillStyle = sel ? '#fff' : '#ffffff66';
      ctx.shadowColor = sel ? (stage.accent||'#ff00aa') : 'transparent';
      ctx.shadowBlur = sel ? 18 : 0;
      ctx.fillText((sel?'▶  ':'')+label, W/2, y);
    });
    ctx.shadowBlur = 0;
    ctx.font = `600 ${Math.max(11,H*0.022)}px Orbitron, monospace`;
    ctx.fillStyle = '#ffffff55';
    ctx.fillText('D-PAD move • A/ENTER select • START resume', W/2, H*0.92);
    ctx.restore();
  }

  function _pauseHeader(title) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 18;
    ctx.font = `900 ${Math.max(22,H*0.06)}px Orbitron, monospace`;
    ctx.fillText(title, W/2, H*0.12);
    ctx.shadowBlur = 0;
    ctx.font = `600 ${Math.max(11,H*0.022)}px Orbitron, monospace`;
    ctx.fillStyle = '#ffffff55';
    ctx.fillText('B / BACK to return', W/2, H*0.93);
  }

  function drawControlsPage() {
    _pauseHeader('CONTROLS');
    const rows = [
      ['D-PAD / ◀ ▶', 'Walk forward & back'],
      ['UP', 'Jump'],
      ['DOWN', 'Crouch'],
      ['Ⓐ  LIGHT', 'Fast hit — tap to auto-combo'],
      ['Ⓑ  HEAVY', 'Strong hit — tap to auto-combo'],
      ['Ⓧ  BLOCK', 'Hold to guard (＋DOWN = low guard)'],
      ['Ⓨ  SPECIAL', 'Press with a direction (see MOVE LIST)'],
      ['START', 'Pause / menu'],
    ];
    const fs = Math.max(13, H*0.030), lh = fs*1.9, y0 = H*0.26;
    ctx.textBaseline = 'middle';
    rows.forEach((r,i) => {
      const y = y0 + i*lh;
      ctx.textAlign = 'right'; ctx.font = `900 ${fs}px Orbitron, monospace`;
      ctx.fillStyle = stage.accent || '#ff55cc'; ctx.fillText(r[0], W*0.46, y);
      ctx.textAlign = 'left'; ctx.font = `600 ${fs}px Orbitron, monospace`;
      ctx.fillStyle = '#fff'; ctx.fillText(r[1], W*0.50, y);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function drawMoveList() {
    const cName = (p1.char && (p1.char.name || p1.char.shortName)) || p1.name;
    _pauseHeader('MOVE LIST — ' + cName);
    const rows = [
      ['Ⓐ … Ⓐ … Ⓐ', 'AUTO COMBO', 'Tap Light repeatedly'],
      ['Ⓐ → Ⓑ → Ⓨ', 'MAGIC SERIES', 'Light into Heavy into Special'],
      ['→ ＋ Ⓨ', 'SPECIAL 1 — ' + MOVES.special.name,  'Ranged projectile'],
      ['↓ ＋ Ⓨ', 'SPECIAL 2 — ' + MOVES.special2.name, 'Rising anti-air (launches)'],
      ['← ＋ Ⓨ', 'SPECIAL 3 — ' + MOVES.special3.name, 'Advancing lunge'],
      ['↑ ＋ Ⓨ', MOVES.super.name, 'Cinematic super (full meter)'],
      ['Ⓧ (hold)', 'GUARD', 'Block; ＋DOWN guards low'],
    ];
    const fs = Math.max(12, H*0.026), lh = fs*2.0, y0 = H*0.25;
    ctx.textBaseline = 'middle';
    rows.forEach((r,i) => {
      const y = y0 + i*lh;
      ctx.textAlign = 'right'; ctx.font = `900 ${fs*1.05}px Orbitron, monospace`;
      ctx.fillStyle = '#33ddff'; ctx.shadowColor='#33ddff'; ctx.shadowBlur=6;
      ctx.fillText(r[0], W*0.34, y); ctx.shadowBlur=0;
      ctx.textAlign = 'left'; ctx.font = `900 ${fs}px Orbitron, monospace`;
      ctx.fillStyle = '#ffd700'; ctx.fillText(r[1], W*0.37, y);
      ctx.font = `600 ${fs*0.85}px Orbitron, monospace`;
      ctx.fillStyle = '#ffffffaa'; ctx.fillText(r[2], W*0.37, y + lh*0.42);
    });
    ctx.textBaseline = 'alphabetic';
  }

  function drawStage() {
    // painted backdrop (if uploaded) — fills the frame; floor line still drawn for footing
    const bgImg = (typeof AssetLoader !== 'undefined' && stage.bgImage)
      ? AssetLoader.get(stage.bgImage) : null;
    if (bgImg) {
      AssetLoader.drawCover(ctx, bgImg, 0, 0, W, H);
      // darken lower third so fighters read against the art
      const sh = ctx.createLinearGradient(0, groundY-40, 0, H);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = sh; ctx.fillRect(0, groundY-40, W, H-groundY+40);
      ctx.strokeStyle = (stage.accent||'#ff00aa'); ctx.globalAlpha = 0.5; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    // No bgImage loaded yet — dark cinematic fill
    ctx.fillStyle = '#050008';
    ctx.fillRect(0, 0, W, H);
  }

  // build factor per weight class so each character reads with a distinct silhouette
  function buildOf(f) {
    const w = (f.char && f.char.weight) || 'medium';
    if (w === 'heavy')        return { bw: 1.34, bh: 1.04, hd: 1.18 };
    if (w === 'medium-heavy') return { bw: 1.16, bh: 1.02, hd: 1.08 };
    if (w === 'medium-light') return { bw: 0.92, bh: 1.00, hd: 0.98 };
    if (w === 'light')        return { bw: 0.80, bh: 0.98, hd: 0.92 };
    return { bw: 1.0, bh: 1.0, hd: 1.0 };
  }

  // Build or retrieve sprite entity adapter for SpriteSystem
  function _toSpriteEnt(f) {
    if (!f._se) f._se = { spriteState: {}, vel: { x: 0, y: 0 }, speed: 5 };
    const e = f._se;
    e.vel.x = f.vx || 0;
    e.hp     = f.hp;
    e.knocked    = (f.state === 'knockdown' || (f.hp <= 0 && f.state !== 'idle'));
    e.crouching  = f.crouching;
    e.blocking   = f.blocking && f.state === 'block';
    e.attacking  = false; e.comboStep = 0; e.specialAnim = false; e.superAnim = null; e.finishering = false;
    if (f.attack === 'light')   { e.attacking = true;  e.comboStep = 1; }
    else if (f.attack === 'heavy')   { e.comboStep = 2; }
    else if (f.attack === 'crouch')  { e.comboStep = 3; }
    else if (f.attack === 'special' || f.attack === 'special2' || f.attack === 'special3') { e.specialAnim = true; }
    else if (f.attack === 'super') {
      e.superAnim = 1; e.finishering = (f.char && f.char.isBoss);
    }
    return e;
  }

  // Map fighter state/attack to CharRenderer animation state
  function _vsAnimState(f) {
    if (f.hp <= 0 || f.state === 'knockdown') return 'ko';
    if (f.attack === 'light' || f.attack === 'crouch') return 'light';
    if (f.attack === 'heavy')   return 'heavy';
    if (f.attack === 'special') return 'special1';
    if (f.attack === 'special2') return 'special2';
    if (f.attack === 'special3') return 'special3';
    if (f.attack === 'super')   return 'super';
    if (f.hitstun > 0)          return 'hurt';
    if (f.blocking)             return 'block';
    if (f.crouching)            return 'crouch';
    if (!f.onGround)            return 'jump';
    if (Math.abs(f.vx) > 30)   return 'walk';
    return 'idle';
  }

  function _vsAnimT(f, state) {
    const now = performance.now() / 1000;
    if (state === 'idle') return (now * 2.0) % 1;
    if (state === 'walk') return (now * 4.0) % 1;
    if (state === 'block') return (now * 3.0) % 1;
    // Attack / special: use stateT (counts up from 0)
    const dur = { light:0.35, heavy:0.5, special1:0.55, special2:0.5, special3:0.4, super:0.9, hurt:0.3, ko:1.0, crouch:1.0, jump:1.0 };
    return Math.min(1, (f.stateT || 0) / (dur[state] || 0.5));
  }

  function drawFighter(f) {
    if (typeof CharRenderer === 'undefined') return;
    const CR = CharRenderer;

    // Fighter display height — large and screen-proportional
    const charH = Math.min(H * 0.56, 300);

    const charId = (f.char && f.char.id) || 1;
    const state  = _vsAnimState(f);
    const animT  = _vsAnimT(f, state);

    // ── Try real sprite sheet first ────────────────────────────────────────
    const SS = window.SpriteSystem;
    if (SS && f.char && SS.hasSprites(f.char.id)) {
      const b   = buildOf(f);
      const ww  = charH * 0.55 * b.bw;
      const se  = _toSpriteEnt(f);
      SS.update(f.char.id, se, 1/60, false, null);
      ctx.save();
      if (f.flashHit > 0) { ctx.globalAlpha = 0.7; ctx.filter = 'brightness(4)'; }
      const didDraw = SS.draw(ctx, f.char.id, se, f.x - ww*0.5, groundY - charH, ww, charH, f.facing < 0);
      ctx.restore();
      if (didDraw) return;
    }

    // ── Canvas CharRenderer fallback (always available) ────────────────────
    CR.draw(ctx, charId, state, animT, f.x, groundY, charH, f.facing, {
      flashHit: f.flashHit || 0,
      charged: f.meter >= 100,
    });

    // Boss crown above head
    if (f.char && f.char.isBoss) {
      ctx.font = `${Math.round(charH * 0.12)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👑', f.x, groundY - charH - charH * 0.08);
    }
  }

  function drawProjectile(p) {
    ctx.save();
    const g = ctx.createRadialGradient(p.x,p.y,2,p.x,p.y,p.r);
    g.addColorStop(0,'#fff'); g.addColorStop(0.4,p.color); g.addColorStop(1,'transparent');
    ctx.fillStyle=g; ctx.shadowColor=p.color; ctx.shadowBlur=24;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawSparks() {
    sparks.forEach(s=>{
      ctx.save(); ctx.globalAlpha=Math.max(0,s.life/0.35);
      ctx.fillStyle=s.color; ctx.shadowColor=s.color; ctx.shadowBlur=8;
      ctx.fillRect(s.x-2,s.y-2,4,4); ctx.restore();
    });
  }

  function drawPopups() {
    popups.forEach(p=>{
      ctx.save(); ctx.globalAlpha=Math.max(0,p.life/0.9);
      ctx.font=`900 ${p.size}px Orbitron, monospace`;
      ctx.textAlign='center';
      ctx.fillStyle=p.color; ctx.shadowColor='#000'; ctx.shadowBlur=6;
      ctx.fillText(p.text, p.x, p.y); ctx.restore();
    });
  }

  // ── HUD: health bars, meters, timer, round pips ──────────────────────────────
  function drawHUD() {
    const pad = Math.max(12, W*0.018);
    const bw = W*0.40, bh = Math.max(18, H*0.035);

    // P1 left, P2 right (mirrored)
    drawHealth(pad, pad, bw, bh, p1, false);
    drawHealth(W - pad - bw, pad, bw, bh, p2, true);

    // names
    ctx.font=`700 ${Math.max(12,H*0.026)}px Orbitron, monospace`;
    ctx.fillStyle='#fff'; ctx.shadowColor='#000'; ctx.shadowBlur=4;
    ctx.textAlign='left';  ctx.fillText(p1.name, pad, pad+bh+Math.max(14,H*0.03));
    ctx.textAlign='right'; ctx.fillText(p2.name, W-pad, pad+bh+Math.max(14,H*0.03));
    ctx.shadowBlur=0;

    // round pips
    for (let i=0;i<ROUNDS_TO_WIN;i++){
      drawPip(pad + bw + 14 + i*18, pad+bh*0.5, p1.rounds>i, p1.color);
      drawPip(W - pad - bw - 14 - i*18, pad+bh*0.5, p2.rounds>i, p2.color);
    }

    // timer box (canvas primitives — no raw sheet overlay)
    {
      const tw = Math.max(64, H * 0.12), th = tw * 0.6;
      const tx = W/2 - tw/2, ty = pad;
      ctx.save();
      ctx.fillStyle='rgba(0,0,20,0.75)';
      ctx.strokeStyle = timer<=10 ? '#ff3344' : '#ffffff55';
      ctx.lineWidth = 2;
      _roundRect(ctx, tx, ty, tw, th, 6);
      ctx.fill(); ctx.stroke();
      ctx.font=`900 ${Math.max(18,H*0.042)}px Orbitron, monospace`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle = timer<=10 ? '#ff3344' : '#fff';
      ctx.shadowColor='#000'; ctx.shadowBlur=6;
      ctx.fillText(Math.max(0,Math.ceil(timer)), W/2, ty + th*0.5);
      ctx.shadowBlur=0; ctx.restore();
    }

    // super meters
    const mw=bw, mh=Math.max(8,H*0.018), my=H-pad-mh;
    drawMeter(pad, my, mw, mh, p1.meter, false, p1.color);
    drawMeter(W-pad-mw, my, mw, mh, p2.meter, true, p2.color);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  function drawHealth(x,y,w,h,f,mirror) {
    ctx.save();
    // Dark background with rounded corners
    ctx.fillStyle='rgba(0,0,20,0.80)';
    _roundRect(ctx, x, y, w, h, 3); ctx.fill();
    // Colored fill
    const pct=Math.max(0,f.hp/f.maxHp);
    const col = pct>0.5?'#46e24a':pct>0.22?'#ffd23f':'#ff3344';
    const fw=(w-4)*pct;
    ctx.fillStyle=col;
    ctx.shadowColor=col; ctx.shadowBlur=6;
    if (mirror) ctx.fillRect(x+w-2-fw, y+2, fw, h-4);
    else        ctx.fillRect(x+2, y+2, fw, h-4);
    ctx.shadowBlur=0;
    // Glowing border in character color
    ctx.strokeStyle=f.color; ctx.lineWidth=2;
    ctx.shadowColor=f.color; ctx.shadowBlur=8;
    _roundRect(ctx, x, y, w, h, 3); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.restore();
  }
  function drawMeter(x,y,w,h,val,mirror,color){
    ctx.save();
    ctx.fillStyle='#0a0014'; ctx.strokeStyle='#ffffff33'; ctx.lineWidth=1;
    ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h);
    const pct=val/100, fw=(w-2)*pct;
    const g=ctx.createLinearGradient(x,y,x+w,y);
    g.addColorStop(0,'#0044ff'); g.addColorStop(0.6,'#8b00ff'); g.addColorStop(1,'#ffd700');
    ctx.fillStyle = pct>=1 ? '#ffd700' : g;
    if (mirror) ctx.fillRect(x+w-1-fw,y+1,fw,h-2); else ctx.fillRect(x+1,y+1,fw,h-2);
    if (pct>=1){ ctx.fillStyle='#000'; ctx.font=`900 ${h+2}px Orbitron`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('SUPER', x+w/2, y+h/2); ctx.textBaseline='alphabetic'; }
    ctx.restore();
  }
  function drawPip(x,y,on,color){
    ctx.save(); ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2);
    ctx.fillStyle=on?color:'#ffffff22'; ctx.shadowColor=color; ctx.shadowBlur=on?8:0;
    ctx.fill(); ctx.restore();
  }

  // EASY 4-BUTTON LEGEND — shown during the round intro so any character is learnable
  function drawControlsLegend() {
    if (phase !== 'intro') return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, 1.4 - phaseT));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.max(11, H * 0.026);
    const rows = [
      ['Ⓐ', 'LIGHT — tap to auto-combo', '#33ddff'],
      ['Ⓑ', 'HEAVY — tap to auto-combo', '#ff9933'],
      ['Ⓧ', 'BLOCK — hold to guard',      '#66ff99'],
      ['Ⓨ', 'SPECIAL  →1  ↓2  ←3  ↑FINISHER', '#ff55cc'],
    ];
    const lh = fs * 1.7, y0 = H * 0.66;
    ctx.font = `700 ${fs}px Orbitron, monospace`;
    const boxW = W * 0.6, boxX = W/2 - boxW/2;
    ctx.fillStyle = 'rgba(2,0,8,0.55)';
    ctx.fillRect(boxX, y0 - lh*0.8, boxW, lh*rows.length + lh*0.4);
    rows.forEach((r, i) => {
      const y = y0 + i*lh;
      ctx.fillStyle = r[2]; ctx.shadowColor = r[2]; ctx.shadowBlur = 10;
      ctx.fillText(r[0], boxX + boxW*0.12, y);
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      ctx.fillText(r[1], boxX + boxW*0.58, y);
    });
    ctx.restore();
  }

  function drawBigText() {
    if (bigT<=0 || !bigText) return;
    ctx.save();
    const a=Math.min(1,bigT*1.5);
    ctx.globalAlpha=a;

    // During ROUND intro — draw animated VS character splash
    if (phase === 'intro' && bigText.startsWith('ROUND') && typeof SpriteSystem !== 'undefined') {
      const charH = Math.min(H * 0.65, 340);
      const t = performance.now() / 1000;
      const SS = SpriteSystem;
      // P1 left side — idle facing right
      const p1id = p1.char ? p1.char.id : 1;
      const p2id = p2.char ? p2.char.id : 1;
      if (!SS.drawAnim(ctx, p1id, 'idle', t, W*0.05, H*0.5 - charH*0.85, W*0.38, charH, { facing: 1 })) {
        if (typeof CharRenderer !== 'undefined') CharRenderer.draw(ctx, p1id, 'idle', t, W*0.22, groundY, charH, 1, {});
      }
      // P2 right side — idle facing left
      if (!SS.drawAnim(ctx, p2id, 'idle', t, W*0.57, H*0.5 - charH*0.85, W*0.38, charH, { facing: -1 })) {
        if (typeof CharRenderer !== 'undefined') CharRenderer.draw(ctx, p2id, 'idle', t, W*0.78, groundY, charH, -1, {});
      }
      // VS badge
      ctx.textAlign='center';
      ctx.font=`900 ${Math.max(28,H*0.07)}px Orbitron, monospace`;
      ctx.fillStyle='#ffd700'; ctx.shadowColor='#ffd700'; ctx.shadowBlur=20;
      ctx.fillText('VS', W/2, H*0.5);
      ctx.shadowBlur=0;
      // Player name tags
      ctx.font=`700 ${Math.max(13,H*0.028)}px Orbitron, monospace`;
      ctx.fillStyle='#fff'; ctx.shadowColor='#000'; ctx.shadowBlur=6;
      ctx.textAlign='left';  ctx.fillText(p1.name, W*0.04, H*0.5 + Math.max(20,H*0.06));
      ctx.textAlign='right'; ctx.fillText(p2.name, W*0.96, H*0.5 + Math.max(20,H*0.06));
      ctx.shadowBlur=0;
    } else {
      ctx.textAlign='center';
      ctx.font=`900 ${Math.max(40,H*0.13)}px Orbitron, monospace`;
      ctx.fillStyle = bigText.includes('K.O')?'#ff2244':'#ffd700';
      ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=24;
      ctx.fillText(bigText, W/2, H*0.42);
      if (bigSub){ ctx.font=`700 ${Math.max(16,H*0.04)}px Orbitron, monospace`; ctx.fillStyle='#fff'; ctx.shadowBlur=8; ctx.fillText(bigSub, W/2, H*0.42+Math.max(30,H*0.08)); }
    }
    ctx.restore();
  }

  // ── small utils ──────────────────────────────────────────────────────────────
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function shade(hex, amt){
    hex = (hex||'#ff00aa').replace('#','');
    if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    let r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
    r=Math.max(0,Math.min(255,r+amt*2.55|0));
    g=Math.max(0,Math.min(255,g+amt*2.55|0));
    b=Math.max(0,Math.min(255,b+amt*2.55|0));
    return `rgb(${r},${g},${b})`;
  }

  return { start, stop, resize, togglePause, rematch, isPaused: () => paused };
})();

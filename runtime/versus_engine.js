'use strict';
/**
 * VersusEngine — 1v1 versus fighter (Street Fighter / Mortal Kombat style)
 *
 * Best-of-3 rounds, round timer, two health bars, super meters, KO,
 * walk / jump / crouch / block, light + heavy normals, EX special (meter),
 * and a cinematic SUPER (full meter). Player vs CPU.
 *
 * Renders vector fighters (char color + emoji) so it needs no sprite assets.
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
    special: { startup:.10, active:.12, recovery:.30, reach:140, hh:140, dmgK:1.3,  hitstun:.50, block:.30, kb:420, meter:0,  cost:25, knockdown:true, projectile:true },
    super:   { startup:.16, active:.30, recovery:.40, reach:520, hh:300, dmgK:3.2,  hitstun:.70, block:.40, kb:560, meter:0,  cost:100, knockdown:true, projectile:true, cinematic:true },
  };

  // ── module state ────────────────────────────────────────────────────────────
  let canvas, ctx, W, H, groundY, rafId = null, running = false;
  let last = 0;
  let p1, p2, stage, onMatchEnd, difficulty = 1;
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

  // ── public start / stop ─────────────────────────────────────────────────────
  function start(cv, opts) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    stage = opts.stage || { sky:'#0a0020', ground:'#08000f', accent:'#ff00aa', name:'AFTER SPOT' };
    difficulty = opts.difficulty || 1;
    onMatchEnd = opts.onMatchEnd || function(){};
    p1 = makeFighter(opts.p1CharId, true,  -1);
    p2 = makeFighter(opts.p2CharId, false,  1);
    p2.maxHp = Math.round(p2.maxHp * (0.85 + difficulty * 0.12));
    p2.hp = p2.maxHp;
    p1.rounds = 0; p2.rounds = 0;
    roundNum = 1;
    if (typeof InputManager !== 'undefined') InputManager.init();
    beginRound();
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', resize);
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
    return {
      left: !!s.left, right: !!s.right, up: !!s.up, down: !!s.down,
      light: !!s.attack, heavy: !!s.special, special: !!s.dodge, super: !!s.interact,
    };
  }

  // ── attack start ────────────────────────────────────────────────────────────
  function tryAttack(f, kind) {
    if (f.hitstun > 0 || f.blockstun > 0 || f.knockdown > 0) return;
    if (f.attack) return; // already mid-move
    let moveKey = kind;
    if (kind === 'light' && f.crouching) moveKey = 'crouch';
    if (kind === 'light' && !f.onGround) moveKey = 'air';
    const m = MOVES[moveKey];
    if (!m) return;
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
    f.vx = (!f.onGround) ? f.vx : 0;
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
    // block check: grounded, holding away, not airborne overhead, low must crouch-block
    const away = def.facing > 0 ? def._inLeft : def._inRight; // holding back
    let blocking = away && def.onGround && def.hitstun <= 0 && !def.attack;
    if (m.hi === 'over' && def.crouching) blocking = false;   // overhead beats crouch block
    if (m.hi === 'low' && !def.crouching && blocking) blocking = true;

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
  }
  function popup(x, y, text, color, size) { popups.push({ x, y, text, color, size, life: .9, vy: -70 }); }

  // ── per-fighter update ───────────────────────────────────────────────────────
  function updateFighter(f, opp, inputs, dt) {
    // facing toward opponent (unless mid-move / airborne)
    if (f.onGround && !f.attack && f.hitstun <= 0)
      f.facing = (opp.x >= f.x) ? 1 : -1;

    f._inLeft = inputs.left; f._inRight = inputs.right;

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

    if (free) {
      const back = f.facing > 0 ? inputs.left : inputs.right;
      const fwd  = f.facing > 0 ? inputs.right : inputs.left;
      if (inputs.down) { f.crouching = true; f.vx = 0; }
      else if (back) { f.blocking = true; f.vx = -f.facing * f.speed * 0.7; }
      else if (fwd)  { f.vx = f.facing * f.speed; }
      else f.vx = 0;

      if (inputs.up && f.onGround) { f.vy = JUMP_VEL; f.onGround = false; f.vx = (fwd?f.facing:back?-f.facing:0) * f.speed * 0.9; }

      // attack buttons (edge-ish: rely on natural hold; cooldown via f.attack)
      if (inputs.super) tryAttack(f, 'super');
      else if (inputs.special) tryAttack(f, 'special');
      else if (inputs.heavy) tryAttack(f, 'heavy');
      else if (inputs.light) tryAttack(f, 'light');
    } else if (!f.onGround && !f.attack && !stunned) {
      // air actions
      if (inputs.light || inputs.heavy) tryAttack(f, 'light'); // air normal
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
    else if (f.attack) f.state = (f.attack==='super')?'super':(f.attack==='special')?'special':(f.attack);
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
    const out = { left:false, right:false, up:false, down:false, light:false, heavy:false, special:false, super:false };
    if (me.hitstun > 0 || me.knockdown > 0) return out;
    const dist = Math.abs(foe.x - me.x);
    const dir = foe.x > me.x ? 1 : -1;
    const aggro = 0.4 + difficulty * 0.18;

    aiThink -= dt;
    if (aiThink <= 0) {
      aiThink = 0.12 + Math.random() * 0.25;
      me._plan = Math.random();
    }
    const plan = me._plan || 0;

    // block when foe is attacking & close
    const foeThreat = foe.attack && foe.atkPhase !== 'recovery' && dist < 180;
    if (foeThreat && plan < 0.35 + difficulty*0.12) {
      if (dir > 0) out.left = true; else out.right = true; // hold back to block
      return out;
    }

    if (dist > 360) {
      // approach or zone with special
      if (me.meter >= 25 && plan < 0.25) out.special = true;
      else { if (dir>0) out.right=true; else out.left=true; }
    } else if (dist > 150) {
      if (me.meter >= 100 && plan < 0.4) out.super = true;
      else if (me.meter >= 25 && plan < 0.35) out.special = true;
      else if (plan < aggro) { if (dir>0) out.right=true; else out.left=true; }
      else if (plan > 0.9) out.up = true;
    } else {
      // in range — attack
      if (me.meter >= 100 && plan < 0.25) out.super = true;
      else if (plan < 0.45) out.light = true;
      else if (plan < 0.7) out.heavy = true;
      else if (plan < 0.82 && me.meter >= 25) out.special = true;
      else { if (dir>0) out.left=true; else out.right=true; } // back off / block
    }
    return out;
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
      timer -= dt;
      const pin = readPlayerInputs();
      const cin = cpuInputs(dt);
      updateFighter(p1, p2, pin, dt);
      updateFighter(p2, p1, cin, dt);
      updateProjectiles(dt);

      // win conditions
      if (p1.hp <= 0 || p2.hp <= 0 || timer <= 0) endRound();
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
    drawSparks();
    drawPopups();
    ctx.restore();

    drawHUD();
    drawBigText();

    if (flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, flash)})`;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
  }

  function drawStage() {
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0, stage.sky || '#0a0020');
    g.addColorStop(0.7, shade(stage.sky||'#0a0020', -10));
    g.addColorStop(1, stage.ground || '#08000f');
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // distant neon skyline
    ctx.save();
    ctx.globalAlpha = 0.5;
    const ac = stage.accent || '#ff00aa';
    for (let i=0;i<14;i++){
      const bw = W/14, bx = i*bw, bh = (Math.sin(i*12.9)*0.5+0.5)*H*0.34 + 40;
      ctx.fillStyle = shade(ac, -60);
      ctx.fillRect(bx+4, groundY-bh, bw-8, bh);
      ctx.fillStyle = ac;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(bx+4, groundY-bh, bw-8, 4);
      ctx.globalAlpha = 0.5;
    }
    ctx.restore();

    // floor
    ctx.fillStyle = stage.ground || '#08000f';
    ctx.fillRect(0, groundY, W, H-groundY);
    ctx.strokeStyle = (stage.accent||'#ff00aa');
    ctx.globalAlpha = 0.6; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
    ctx.globalAlpha = 1;
    // floor grid
    ctx.strokeStyle = shade(stage.accent||'#ff00aa', -50);
    ctx.globalAlpha = 0.25; ctx.lineWidth = 1;
    for (let i=-10;i<=10;i++){
      ctx.beginPath();
      ctx.moveTo(W/2 + i*60, groundY);
      ctx.lineTo(W/2 + i*220, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFighter(f) {
    const x = f.x, baseY = f.y;
    const crouch = f.crouching ? 0.62 : 1;
    const h = f.h * crouch;
    const topY = baseY - h;
    // shadow
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, groundY, f.w*0.6, 10, 0,0,Math.PI*2); ctx.fill();
    ctx.restore();

    ctx.save();
    if (f.flashHit > 0) { ctx.globalAlpha = 0.9; }
    // body
    const bodyColor = f.flashHit>0 ? '#ffffff' : f.color;
    roundRect(x - f.w*0.32, topY + h*0.28, f.w*0.64, h*0.5, 12);
    ctx.fillStyle = bodyColor; ctx.shadowColor = f.color; ctx.shadowBlur = 16; ctx.fill();
    ctx.shadowBlur = 0;
    // legs
    ctx.fillStyle = shade(f.color,-40);
    const legSplit = f.state==='walk' ? Math.sin(performance.now()/80)*8 : 4;
    roundRect(x - f.w*0.28, topY+h*0.7, f.w*0.22, h*0.32, 6); ctx.fill();
    roundRect(x + f.w*0.06, topY+h*0.7, f.w*0.22, h*0.32, 6); ctx.fill();
    // arm / attack
    if (f.attack && f.atkPhase==='active' && !MOVES[f.attack].projectile) {
      ctx.fillStyle = f.color; ctx.shadowColor='#fff'; ctx.shadowBlur=14;
      const ar = MOVES[f.attack].reach;
      const ay = topY + h*0.38;
      if (f.facing>0) roundRect(x, ay, ar, 18, 8); else roundRect(x-ar, ay, ar, 18, 8);
      ctx.fill(); ctx.shadowBlur=0;
    }
    // head
    ctx.beginPath();
    ctx.arc(x, topY + h*0.16, f.w*0.34, 0, Math.PI*2);
    ctx.fillStyle = shade(f.color, 30); ctx.shadowColor=f.color; ctx.shadowBlur=14; ctx.fill();
    ctx.shadowBlur=0;
    // emoji face
    ctx.font = `${Math.round(f.w*0.5)}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(f.emoji, x, topY + h*0.16);
    ctx.restore();
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

    // timer
    ctx.font=`900 ${Math.max(22,H*0.06)}px Orbitron, monospace`;
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillStyle = timer<=10 ? '#ff3344' : '#fff';
    ctx.shadowColor='#000'; ctx.shadowBlur=6;
    ctx.fillText(Math.max(0,Math.ceil(timer)), W/2, pad);
    ctx.shadowBlur=0; ctx.textBaseline='alphabetic';

    // super meters
    const mw=bw, mh=Math.max(8,H*0.018), my=H-pad-mh;
    drawMeter(pad, my, mw, mh, p1.meter, false, p1.color);
    drawMeter(W-pad-mw, my, mw, mh, p2.meter, true, p2.color);
  }

  function drawHealth(x,y,w,h,f,mirror) {
    ctx.save();
    ctx.fillStyle='#0a0014'; ctx.strokeStyle=f.color; ctx.lineWidth=2;
    ctx.shadowColor=f.color; ctx.shadowBlur=8;
    ctx.fillRect(x,y,w,h); ctx.strokeRect(x,y,w,h); ctx.shadowBlur=0;
    const pct=Math.max(0,f.hp/f.maxHp);
    const col = pct>0.5?'#46e24a':pct>0.22?'#ffd23f':'#ff3344';
    const fw=(w-4)*pct;
    ctx.fillStyle=col;
    if (mirror) ctx.fillRect(x+w-2-fw, y+2, fw, h-4);
    else        ctx.fillRect(x+2, y+2, fw, h-4);
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

  function drawBigText() {
    if (bigT<=0 || !bigText) return;
    ctx.save();
    const a=Math.min(1,bigT*1.5);
    ctx.globalAlpha=a;
    ctx.textAlign='center';
    ctx.font=`900 ${Math.max(40,H*0.13)}px Orbitron, monospace`;
    ctx.fillStyle = bigText.includes('K.O')?'#ff2244':'#ffd700';
    ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=24;
    ctx.fillText(bigText, W/2, H*0.42);
    if (bigSub){ ctx.font=`700 ${Math.max(16,H*0.04)}px Orbitron, monospace`; ctx.fillStyle='#fff'; ctx.shadowBlur=8; ctx.fillText(bigSub, W/2, H*0.42+Math.max(30,H*0.08)); }
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

  return { start, stop, resize };
})();

'use strict';
/**
 * FighterEngine — Marvel vs Capcom / Streets of Rage combat system
 *
 * SIDESCROLL (brawler):
 *   - Belt-scroll Y-axis movement (SoR style)
 *   - 3-hit combo string with cancel windows
 *   - Special moves via button holds / rapid press
 *   - Super Flash (screen freeze + white flash) for supers
 *   - Hitstop per hit (MvC style freeze)
 *   - Combo counter with damage scaling
 *   - Air launch → juggle → ground bounce
 *   - Dodge has i-frames (invincible frames)
 *   - Block reduces damage by 80%, causes blockstun
 *   - Finisher available at enemy HP < 20%
 *
 * TOPDOWN (venue networking):
 *   - 4/8-directional grid movement with tile collision
 *   - Proximity interaction (NPC dialog, objects, doors)
 *   - Stealth / awareness system (enemy cones of vision)
 *   - Smooth lerp camera
 */
const FighterEngine = (() => {

  // ── Constants ─────────────────────────────────────────────────────────────
  const GRAVITY          = 1800;   // px/s²
  const JUMP_VEL         = -520;   // px/s
  const WALK_SPEED       = 160;    // px/s
  const RUN_SPEED        = 260;    // px/s
  const BELT_SPEED       = 120;    // px/s (Y axis in sidescroll)
  const DASH_VEL         = 440;    // px/s
  const DASH_DURATION    = 0.18;   // s
  const HITSTOP_LIGHT    = 0.05;   // s
  const HITSTOP_HEAVY    = 0.12;   // s
  const HITSTOP_SUPER    = 0.22;   // s
  const SUPER_FLASH_DUR  = 0.55;   // s (screen freeze during super flash)
  const COMBO_TIMEOUT    = 2.0;    // s before combo resets
  const COMBO_DMG_SCALE  = 0.85;   // damage multiplier per extra hit
  const I_FRAMES_DODGE   = 0.22;   // s of invincibility on dodge
  const I_FRAMES_WAKEUP  = 0.50;   // s of invincibility on wakeup
  const BLOCK_DMG_MULT   = 0.20;   // 20% damage through block
  const FINISHER_HP_PCT  = 0.18;   // finisher available below 18% HP
  const LAUNCH_VEL       = -700;   // px/s vertical on launch hit
  const JUGGLE_DECAY     = 0.75;   // each juggle hit knocks up 75% as much
  const WALL_BOUNCE_VEL  = -300;   // px/s horizontal on wall bounce

  // ── tiny image cache (real HUD art) ───────────────────────────────────────
  const _img = {};
  function _elem(path) {
    if (_img[path]) return _img[path];
    const im = new Image(); im._r = false; im._f = false;
    im.onload = () => { im._r = true; }; im.onerror = () => { im._f = true; };
    im.src = path; _img[path] = im; return im;
  }

  // ── Module state ──────────────────────────────────────────────────────────
  let hitstopTimer   = 0;
  let superFlashTimer = 0;
  let superFlashActive = false;
  let comboCount     = 0;
  let comboTimer     = 0;
  let meterValue     = 0;
  const MAX_METER    = 100;
  let shakeTimer     = 0, shakeIntensity = 0;
  let shakeX = 0, shakeY = 0;
  const dmgNumbers   = [];
  const inputBuffer  = [];
  const BUFFER_WINDOW = 20; // frames
  let frameCount     = 0;
  let worldWidth     = 3200;
  let groundY        = 0;  // pixels, set per stage

  // ── Input buffer ──────────────────────────────────────────────────────────
  function pushInput(action) {
    inputBuffer.push({ action, f: frameCount });
    if (inputBuffer.length > 30) inputBuffer.shift();
  }

  function inputRecent(action, windowFrames) {
    const w = windowFrames || BUFFER_WINDOW;
    return inputBuffer.some(i => i.action === action && frameCount - i.f <= w);
  }

  function inputSequence(actions, windowFrames) {
    const w = windowFrames || BUFFER_WINDOW;
    const recent = inputBuffer.filter(i => frameCount - i.f <= w).map(i => i.action);
    let idx = 0;
    for (const a of recent) {
      if (a === actions[idx]) idx++;
      if (idx === actions.length) return true;
    }
    return false;
  }

  // ── Collision helpers ─────────────────────────────────────────────────────
  function aabb(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  }

  function getHitbox(entity) {
    // Hitbox extends forward based on facing, sized by combo step
    const reach  = entity.comboStep === 3 ? 80 : entity.comboStep === 2 ? 68 : 52;
    const height = entity.h * 0.6;
    const yOff   = entity.h * 0.1;
    if (entity.facing >= 0) {
      return { x: entity.x + entity.w, y: entity.y + yOff, w: reach, h: height };
    } else {
      return { x: entity.x - reach,    y: entity.y + yOff, w: reach, h: height };
    }
  }

  function getHurtbox(entity) {
    // Hurtbox is slightly inset from visual rect
    return { x: entity.x+6, y: entity.y+4, w: entity.w-12, h: entity.h-4 };
  }

  function getLaunchBox(entity) {
    const reach = 90;
    if (entity.facing >= 0) return { x: entity.x+entity.w, y: entity.y, w: reach, h: entity.h };
    else                     return { x: entity.x-reach,    y: entity.y, w: reach, h: entity.h };
  }

  // ── Damage / hit application ──────────────────────────────────────────────
  function applyHit(attacker, defender, opts) {
    opts = opts || {};
    if (defender.invincible || defender.hp <= 0) return 0;

    const isBlock = defender.blocking && !opts.unblockable;
    const baseDmg = opts.dmg || (attacker.baseDmg || 15);
    const scaleMult = Math.pow(COMBO_DMG_SCALE, Math.max(0, comboCount - 1));
    let finalDmg = Math.max(1, Math.ceil(baseDmg * scaleMult * (isBlock ? BLOCK_DMG_MULT : 1)));
    if (opts.isCrit) finalDmg = Math.ceil(finalDmg * 1.8);

    defender.hp = Math.max(0, defender.hp - finalDmg);

    if (isBlock) {
      applyBlockstun(defender, opts.blockstun || 12);
      triggerHitstop(HITSTOP_LIGHT * 0.5);
    } else {
      // Hit response
      if (opts.launch) {
        launchEntity(defender, attacker.facing);
      } else if (opts.knockback !== false) {
        const kbDir = attacker.facing >= 0 ? 1 : -1;
        const kbForce = opts.kbForce || (entity => entity.comboStep === 3 ? 320 : 180);
        applyKnockback(defender, kbDir, typeof kbForce === 'function' ? kbForce(attacker) : kbForce);
      }
      applyHitstun(defender, opts.hitstun || 18);
      triggerHitstop(opts.heavy ? HITSTOP_HEAVY : HITSTOP_LIGHT);
      if (opts.heavy) shakeScreen(5, 14);
      incrementCombo();
      gainMeter(attacker, opts.meterGain || 12);
    }

    spawnDmgNumber(defender.x + defender.w/2, defender.y, finalDmg, opts.isCrit ? 'crit' : isBlock ? 'block' : 'hit');

    // Trigger VFX on attacker's character
    if (attacker.charId && typeof SpriteSystem !== 'undefined') {
      const vfxKey = opts.heavy ? 'vfx_hit_h' : 'vfx_hit_l';
      const hitX = defender.x + defender.w/2;
      const hitY = defender.y + defender.h/3;
      SpriteSystem.spawnVFX(attacker.charId, vfxKey, hitX, hitY, opts.heavy ? 80 : 56);
    }

    // Finisher flag
    defender.finisherAvailable = (defender.hp / (defender.maxHp||1)) < FINISHER_HP_PCT;

    return finalDmg;
  }

  function applyKnockback(entity, dir, force) {
    if (!entity.vel) entity.vel = { x:0, y:0 };
    entity.vel.x = dir * force;
    entity.vel.y = -force * 0.3;
  }

  function launchEntity(entity, attackerFacing) {
    if (!entity.vel) entity.vel = { x:0, y:0 };
    entity.vel.y = LAUNCH_VEL;
    entity.vel.x = (attackerFacing >= 0 ? 1 : -1) * 120;
    entity.launched = true;
    entity.airHits = (entity.airHits || 0);
    entity.onGround = false;
  }

  function applyHitstun(entity, frames) { entity.hitstunFrames = frames; }
  function applyBlockstun(entity, frames) { entity.blockstunFrames = frames; }

  // ── Timing systems ────────────────────────────────────────────────────────
  function triggerHitstop(secs) { hitstopTimer = Math.max(hitstopTimer, secs); }

  function triggerSuperFlash() {
    superFlashActive = true;
    superFlashTimer  = SUPER_FLASH_DUR;
    triggerHitstop(SUPER_FLASH_DUR);
    shakeScreen(8, 20);
  }

  function shakeScreen(intensity, durationFrames) {
    shakeIntensity = intensity;
    shakeTimer = durationFrames;
  }

  function getShakeOffset() {
    if (shakeTimer > 0) {
      const t = shakeTimer / 20;
      shakeX = (Math.sin(shakeTimer * 7.3) * shakeIntensity * t);
      shakeY = (Math.cos(shakeTimer * 6.1) * shakeIntensity * t);
      shakeTimer--;
    } else { shakeX = 0; shakeY = 0; }
    return { x: shakeX, y: shakeY };
  }

  function isSuperFlash() { return superFlashActive; }

  // ── Combo / meter ─────────────────────────────────────────────────────────
  function incrementCombo() {
    comboCount++;
    comboTimer = COMBO_TIMEOUT;
  }

  function resetCombo() { comboCount = 0; comboTimer = 0; }
  function getCombo()   { return comboCount; }

  function gainMeter(entity, amount) {
    meterValue = Math.min(MAX_METER, meterValue + amount);
    if (entity) entity.sp = meterValue;
  }

  function spendMeter(amount) {
    if (meterValue < amount) return false;
    meterValue -= amount;
    return true;
  }

  function getMeter()    { return meterValue; }
  function getMeterPct() { return meterValue / MAX_METER; }
  function resetMeter()  { meterValue = 0; }

  // ── Floating damage numbers ───────────────────────────────────────────────
  function spawnDmgNumber(x, y, dmg, type) {
    dmgNumbers.push({ x, y, dmg, type, life:1.2, vy:-90, alpha:1 });
  }

  function updateDmgNumbers(dt) {
    for (let i = dmgNumbers.length-1; i >= 0; i--) {
      const d = dmgNumbers[i];
      d.life  -= dt;
      d.y     += d.vy * dt;
      d.vy    *= 0.92;
      d.alpha  = Math.max(0, d.life / 1.2);
      if (d.life <= 0) dmgNumbers.splice(i, 1);
    }
  }

  function renderDmgNumbers(ctx, cameraX, cameraY) {
    dmgNumbers.forEach(d => {
      ctx.save();
      ctx.globalAlpha = d.alpha;
      const isSuper = d.type === 'crit';
      const isBlock = d.type === 'block';
      ctx.font = isSuper ? 'bold 22px Orbitron,monospace'
               : isBlock ? 'bold 14px Orbitron,monospace'
               :            'bold 16px Orbitron,monospace';
      ctx.fillStyle = isSuper ? '#ffff00' : isBlock ? '#4488ff' : '#ff4444';
      ctx.shadowColor = isSuper ? '#ff8800' : '#000';
      ctx.shadowBlur  = 8;
      ctx.textAlign   = 'center';
      const dx = d.x - (cameraX||0), dy = d.y - (cameraY||0);
      if (!isBlock && typeof DigitFont !== 'undefined' &&
          DigitFont.draw(ctx, d.dmg, dx, dy, isSuper?26:18,
                         { align:'center', alpha:d.alpha, glow:isSuper?'#ff8800':'#000' })) {
        // drawn as digit art
      } else {
        ctx.fillText(isBlock ? 'BLOCK' : (isSuper ? '★' + d.dmg : d.dmg), dx, dy);
      }
      ctx.restore();
    });
  }

  // ── Player physics update (sidescroll) ────────────────────────────────────
  function updatePlayerSidescroll(player, inputs, dt, stageGroundY, stageW) {
    if (hitstopTimer > 0) { hitstopTimer -= dt; return; }
    frameCount++;

    const ch = player.charData || {};
    const walkSpd = (ch.spd || 5) / 5 * WALK_SPEED;
    const runSpd  = walkSpd * 1.6;

    // Belt-scroll depth (Y axis, limited range)
    const beltMin = stageGroundY - 40;
    const beltMax = stageGroundY + 20;

    // Cooldown timers
    if (player.attackTimer    > 0) player.attackTimer    -= dt;
    if (player.dodgeTimer     > 0) { player.dodgeTimer   -= dt; if(player.dodgeTimer<=0) player.dodging=false; }
    if (player.iFrameTimer    > 0) { player.iFrameTimer  -= dt; player.invincible = player.iFrameTimer > 0; }
    if (player.hitstunFrames  > 0) player.hitstunFrames  -= dt * 60;
    if (player.blockstunFrames > 0) player.blockstunFrames -= dt * 60;
    if (player.comboWindowTimer > 0) player.comboWindowTimer -= dt;
    if (player.comboWindowTimer <= 0 && !player.attacking) player.comboStep = 0;

    const inHitstun  = player.hitstunFrames  > 0;
    const inBlockstun = player.blockstunFrames > 0;
    const frozen     = inHitstun || inBlockstun || superFlashActive;

    if (!frozen && !player.attacking) {
      // Horizontal movement
      let vx = 0;
      if (inputs.left)  { vx = -walkSpd; player.facing = -1; }
      if (inputs.right) { vx =  walkSpd; player.facing =  1; }
      if (inputs.left && inputs.right) vx = 0;
      player.vel.x = vx;

      // Run (hold direction twice / sprint button)
      if (inputs.run && vx !== 0) player.vel.x = vx > 0 ? runSpd : -runSpd;

      // Belt-scroll Y movement
      if (inputs.up   && player.y > beltMin) player.vel.y = Math.min(player.vel.y, -BELT_SPEED * dt * 60);
      else if (inputs.down && player.y < beltMax) player.vel.y = Math.max(player.vel.y, BELT_SPEED * dt * 60);
      else if (player.onGround) player.vel.y = 0;

      // Jump
      if (inputs.jump && player.onGround) {
        player.vel.y = JUMP_VEL;
        player.onGround = false;
      }

      // Dodge (invincible frames)
      if (inputs.dodge && player.dodgeTimer <= 0 && player.onGround) {
        player.dodging    = true;
        player.dodgeTimer = 0.35;
        player.iFrameTimer = I_FRAMES_DODGE;
        player.invincible = true;
        player.vel.x = player.facing * DASH_VEL;
      }

      // Block
      player.blocking = !!(inputs.block && player.onGround && !player.attacking);
    }

    // Gravity
    if (!player.onGround) {
      player.vel.y += GRAVITY * dt;
    }

    // Position update
    player.x += player.vel.x * dt;
    player.y += player.vel.y * dt;

    // Ground landing
    if (player.y + player.h >= stageGroundY) {
      player.y       = stageGroundY - player.h;
      player.vel.y   = 0;
      player.onGround = true;
      player.launched = false;
      player.airHits  = 0;
      if (player.knocked) {
        player.knocked    = false;
        player.recovering = true;
        player.iFrameTimer = I_FRAMES_WAKEUP;
        player.invincible  = true;
        setTimeout(() => { player.recovering = false; }, 600);
      }
    }

    // World bounds
    player.x = Math.max(0, Math.min(stageW - player.w, player.x));
    // Belt Y clamp
    player.y = Math.max(beltMin - player.h, Math.min(beltMax, player.y));

    // Velocity damping (horizontal friction)
    if (player.onGround && !inputs.left && !inputs.right) {
      player.vel.x *= 0.72;
    }

    // Combo timeout
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) resetCombo();
    }

    // Super flash timer
    if (superFlashActive) {
      superFlashTimer -= dt;
      if (superFlashTimer <= 0) superFlashActive = false;
    }

    updateDmgNumbers(dt);
    if (typeof SpriteSystem !== 'undefined') SpriteSystem.updateVFX(dt);
  }

  // ── Attack execution (player sidescroll) ──────────────────────────────────
  function executeAttack(player, type) {
    if (player.hitstunFrames > 0 || player.blockstunFrames > 0) return false;

    // Super: costs meter, triggers super flash
    if (type === 'super') {
      const cost = player.superAnim === 3 ? 100 : player.superAnim === 2 ? 66 : 33;
      if (!spendMeter(cost)) return false;
      triggerSuperFlash();
      player.attacking  = true;
      player.attackTimer = 0.8;
      player.specialAnim = false;
      // comboStep stays 0, superAnim is 1/2/3
      return true;
    }

    // Special: costs nothing
    if (type === 'special') {
      if (player.attackTimer > 0.15) return false;
      player.attacking   = true;
      player.specialAnim = true;
      player.comboStep   = 0;
      player.attackTimer = 0.55;
      return true;
    }

    // Finisher
    if (type === 'finisher' && player.finisherTarget && player.finisherTarget.finisherAvailable) {
      triggerSuperFlash();
      player.finishering = true;
      player.attackTimer = 1.2;
      return true;
    }

    // Normal attack — 3-hit chain
    if (player.attackTimer > 0.08) return false;

    // Advance combo step within cancel window
    if (player.comboWindowTimer > 0 && player.comboStep < 3) {
      player.comboStep++;
    } else if (player.comboWindowTimer <= 0) {
      player.comboStep = 1;
    }

    player.attacking        = true;
    player.attackTimer      = 0.22 + player.comboStep * 0.04;
    player.comboWindowTimer = 0.28;
    player.specialAnim      = false;
    player.superAnim        = 0;
    player.finishering      = false;

    return true;
  }

  // ── Enemy AI tick (sidescroll) ────────────────────────────────────────────
  function tickEnemy(enemy, player, dt) {
    if (hitstopTimer > 0 || superFlashActive) return;
    if (enemy.hp <= 0 || enemy.hitstunFrames > 0) {
      if (enemy.hitstunFrames > 0) enemy.hitstunFrames -= dt * 60;
      return;
    }

    const dx = player.x - enemy.x;
    const dist = Math.abs(dx);
    enemy.facing = dx > 0 ? 1 : -1;

    if (enemy.attackCooldown > 0) { enemy.attackCooldown -= dt; }

    const behavior = enemy.behavior || 'patrol';

    if (behavior === 'rush' || dist < 240) {
      // Chase and attack
      if (dist > 60) {
        const spd = (enemy.speed || 100) * dt;
        enemy.x += (dx > 0 ? 1 : -1) * spd;
      } else if (enemy.attackCooldown <= 0) {
        enemy.attacking        = true;
        enemy.attackTimer      = 0.35;
        enemy.attackCooldown   = 1.2 + Math.random() * 0.8;
        enemy.comboStep        = 1 + Math.floor(Math.random() * 2);
        setTimeout(() => { enemy.attacking = false; enemy.comboStep = 0; }, 350);
      }
    } else if (behavior === 'patrol') {
      // Patrol back and forth
      if (!enemy.patrolDir) enemy.patrolDir = 1;
      if (!enemy.patrolTimer) enemy.patrolTimer = 2 + Math.random() * 2;
      enemy.patrolTimer -= dt;
      if (enemy.patrolTimer <= 0) { enemy.patrolDir *= -1; enemy.patrolTimer = 2 + Math.random()*2; }
      enemy.x += enemy.patrolDir * (enemy.speed || 70) * dt;
    }

    // Enemy gravity
    if (!enemy.onGround) {
      enemy.vel = enemy.vel || { x:0, y:0 };
      enemy.vel.y += GRAVITY * dt;
      enemy.y += enemy.vel.y * dt;
    }
  }

  // ── Combat resolution (sidescroll) ───────────────────────────────────────
  function resolveHits(player, enemies, stageGroundY) {
    if (hitstopTimer > 0 || superFlashActive) return;
    if (!player.attacking && !player.specialAnim && !player.superAnim && !player.finishering) return;

    const hitbox = player.superAnim ? getLaunchBox(player) : getHitbox(player);

    enemies.forEach(enemy => {
      if (enemy.hp <= 0 || enemy._hitThisSwing) return;
      const hurtbox = getHurtbox(enemy);
      if (!aabb(hitbox, hurtbox)) return;

      enemy._hitThisSwing = true;

      const isSpecial   = player.specialAnim;
      const isSuper     = !!player.superAnim;
      const isFinisher  = player.finishering;
      const isHeavy     = player.comboStep === 3 || isSpecial || isSuper || isFinisher;

      let dmg = player.charData ? player.charData.baseDmg : 15;
      if (isFinisher)       dmg *= 4;
      // 3 supers escalate with meter cost: super1 2.0x, super2 2.8x, super3 3.6x
      else if (isSuper)     dmg *= player.superAnim === 3 ? 3.6 : player.superAnim === 2 ? 2.8 : 2.0;
      else if (isSpecial)   dmg *= 1.8;
      else if (player.comboStep === 3) dmg *= 1.4;
      else if (player.comboStep === 2) dmg *= 1.1;

      applyHit(player, enemy, {
        dmg,
        heavy:      isHeavy,
        unblockable: isSuper || isFinisher,
        launch:     isSuper && !enemy.launched,
        meterGain:  isHeavy ? 18 : 10,
        kbForce:    isHeavy ? 260 : 160,
        hitstun:    isHeavy ? 28 : 18,
      });

      // VFX
      if (player.charId && typeof SpriteSystem !== 'undefined') {
        const vk = isFinisher ? 'vfx_finisher' : isSuper ? 'vfx_super' : isSpecial ? 'vfx_arc' : isHeavy ? 'vfx_hit_h' : 'vfx_hit_l';
        SpriteSystem.spawnVFX(player.charId, vk, enemy.x+enemy.w/2, enemy.y+enemy.h*0.3, isHeavy?96:64);
      }
    });

    // Clear hit flag after swing ends
    if (player.attackTimer <= 0) {
      enemies.forEach(e => { e._hitThisSwing = false; });
      player.attacking   = false;
      player.specialAnim = false;
      player.superAnim   = 0;
      player.finishering = false;
    }
  }

  // ── Topdown player update ─────────────────────────────────────────────────
  function updatePlayerTopdown(player, inputs, dt, layout) {
    if (hitstopTimer > 0) { hitstopTimer -= dt; return; }

    const spd = (player.charData && player.charData.spd || 5) / 5 * 160 * dt;
    let nx = player.x, ny = player.y;

    // 4-directional priority movement
    if      (inputs.up)    { ny -= spd; player.lastDir = 'n'; }
    else if (inputs.down)  { ny += spd; player.lastDir = 's'; }
    if      (inputs.left)  { nx -= spd; player.lastDir = 'w'; }
    else if (inputs.right) { nx += spd; player.lastDir = 'e'; }

    // Diagonal speed normalization
    if ((inputs.up||inputs.down) && (inputs.left||inputs.right)) {
      nx = player.x + (nx - player.x) * 0.707;
      ny = player.y + (ny - player.y) * 0.707;
    }

    // Tile collision (if layout supplied)
    if (layout && typeof Stage1Scene !== 'undefined') {
      const ts   = layout.tileSize || 64;
      const half = Math.floor(player.w / 2);
      // Check 4 corners
      function blocked(cx, cy) {
        const tc = Math.floor(cx / ts);
        const tr = Math.floor(cy / ts);
        return Stage1Scene.isInsideWall(tc, tr);
      }
      if (blocked(nx + half, ny + half) || blocked(nx + half, ny + player.h - 4) ||
          blocked(nx - half + player.w, ny + half) || blocked(nx - half + player.w, ny + player.h - 4)) {
        nx = player.x;
      }
      if (blocked(nx + half, ny + half) || blocked(nx + player.w - half, ny + half) ||
          blocked(nx + half, ny + player.h - 4) || blocked(nx + player.w - half, ny + player.h - 4)) {
        ny = player.y;
      }
    }

    player.x = nx;
    player.y = ny;
    player.vel = { x: nx - player.x, y: ny - player.y };

    // Interaction prompt
    if (inputs.interact && layout && typeof Stage1Scene !== 'undefined') {
      const ts  = layout.tileSize || 64;
      const col = Math.floor((player.x + player.w/2) / ts);
      const row = Math.floor((player.y + player.h/2) / ts);
      const inter = Stage1Scene.getInsideInteractableAt(col, row);
      if (inter) return inter; // caller handles the interaction
    }

    updateDmgNumbers(dt);
    return null;
  }

  // ── Render: Super Flash overlay ───────────────────────────────────────────
  function renderSuperFlash(ctx, W, H) {
    if (!superFlashActive) return;
    const pct = superFlashTimer / SUPER_FLASH_DUR;
    // White flash that fades: full white briefly, then fades to transparent
    const alpha = pct > 0.7 ? (1 - pct) * 3.33 : pct * 1.5;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, alpha)})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ── Render: Combo counter HUD ─────────────────────────────────────────────
  function renderComboHUD(ctx, x, y) {
    if (comboCount < 2) return;
    ctx.save();
    const scale = Math.min(1, 1 + (COMBO_TIMEOUT - comboTimer) * 0.3);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // live count in gold + the real COMBO badge art beside it
    const numFont = 30 + comboCount;
    let numW;
    if (typeof DigitFont !== 'undefined' &&
        DigitFont.draw(ctx, comboCount, 0, -numFont*0.42, numFont, { align:'left', glow:'#ff8800' })) {
      numW = DigitFont.measure(String(comboCount), numFont, numFont*0.06);
    } else {
      ctx.font = `900 ${numFont}px Orbitron, monospace`;
      ctx.fillStyle = '#ffdd00'; ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 18;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(comboCount), 0, 0);
      ctx.shadowBlur = 0;
      numW = ctx.measureText(String(comboCount)).width;
    }
    const badge = _elem('assets/ui/elements/hud/hud_combo_label.png');
    if (badge && badge._r && !badge._f) {
      const bh = numFont * 1.15, bw = bh * (badge.naturalWidth/badge.naturalHeight);
      ctx.drawImage(badge, numW + 6, -bh*0.82, bw, bh);
    } else {
      ctx.font = `bold ${numFont*0.45}px Rajdhani, sans-serif`;
      ctx.fillStyle = '#ff00aa'; ctx.fillText('COMBO', numW + 8, -numFont*0.2);
    }
    ctx.restore();
  }

  // ── Render: Meter bar ─────────────────────────────────────────────────────
  function renderMeterBar(ctx, x, y, w, h) {
    const pct = getMeterPct();
    // Background
    ctx.fillStyle = '#0a0018';
    ctx.strokeStyle = '#ff00aa44';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // Fill (gradient: blue → purple → gold at full)
    const grad = ctx.createLinearGradient(x, y, x+w, y);
    grad.addColorStop(0,   '#0044ff');
    grad.addColorStop(0.5, '#8b00ff');
    grad.addColorStop(1,   '#ffd700');
    ctx.fillStyle = grad;
    ctx.fillRect(x+1, y+1, (w-2)*pct, h-2);
    // Tick marks at 33% and 66% (super cost thresholds)
    [0.33, 0.66].forEach(t => {
      ctx.strokeStyle = '#ffffff55';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + w*t, y);
      ctx.lineTo(x + w*t, y+h);
      ctx.stroke();
    });
    // Label
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 8px Orbitron, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SP ' + Math.floor(pct*100), x+w-2, y+h-2);
    ctx.textAlign = 'left';
  }

  // ── Render: HP bar (MvC style) ────────────────────────────────────────────
  function renderHPBar(ctx, x, y, w, h, hp, maxHp, label, color) {
    const pct = Math.max(0, hp / maxHp);
    // Outer border
    ctx.fillStyle = '#0a0018';
    ctx.strokeStyle = color || '#ff00aa';
    ctx.lineWidth = 2;
    ctx.shadowColor = color || '#ff00aa';
    ctx.shadowBlur  = 6;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.shadowBlur = 0;
    // HP fill
    const barColor = pct > 0.5 ? '#44ff44' : pct > 0.25 ? '#ffdd00' : '#ff2222';
    ctx.fillStyle = barColor;
    ctx.fillRect(x+2, y+2, (w-4)*pct, h-4);
    // Danger flash overlay
    if (pct < 0.25) {
      ctx.fillStyle = `rgba(255,0,0,${0.15 + 0.15 * Math.sin(Date.now()/120)})`;
      ctx.fillRect(x+2, y+2, (w-4)*pct, h-4);
    }
    // Label
    if (label) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Orbitron, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, x+4, y+h-3);
    }
    // HP value
    ctx.fillStyle = '#ffffff99';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.ceil(hp) + '/' + maxHp, x+w-4, y+h-3);
    ctx.textAlign = 'left';
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function resetForStage() {
    hitstopTimer    = 0;
    superFlashTimer = 0;
    superFlashActive = false;
    comboCount      = 0;
    comboTimer      = 0;
    meterValue      = 0;
    shakeTimer      = 0;
    shakeX = shakeY = 0;
    dmgNumbers.length = 0;
    inputBuffer.length = 0;
    frameCount = 0;
  }

  return {
    // Input
    pushInput, inputRecent, inputSequence,
    // Physics / movement
    updatePlayerSidescroll, updatePlayerTopdown,
    tickEnemy,
    // Combat
    applyHit, applyKnockback, launchEntity,
    applyHitstun, applyBlockstun,
    executeAttack, resolveHits,
    // Timing
    triggerHitstop, triggerSuperFlash, getShakeOffset, isSuperFlash,
    // Meter / combo
    gainMeter, spendMeter, getMeter, getMeterPct, getCombo, resetCombo,
    // Render
    renderSuperFlash, renderComboHUD, renderMeterBar, renderHPBar,
    renderDmgNumbers: (ctx, cx, cy) => { updateDmgNumbers(0); renderDmgNumbers(ctx, cx, cy); },
    // Collision
    aabb, getHitbox, getHurtbox,
    // Misc
    resetForStage, shakeScreen,
    FINISHER_HP_PCT,
  };
})();

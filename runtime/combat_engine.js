'use strict';
const CombatEngine = (() => {
  let hitstopFrames = 0;
  let shakeFrames = 0, shakeIntensity = 0;
  let shakeOffsetX = 0, shakeOffsetY = 0;
  let meterValue = 0;
  const MAX_METER = 100;

  // Input buffer
  const inputBuffer = [];
  const BUFFER_FRAMES = 16;
  let frameCount = 0;

  // Floating damage numbers
  const damageNumbers = [];

  // Combo
  let comboCount = 0;
  let comboTimer = 0;
  const COMBO_TIMEOUT = 120; // frames

  function pushInput(action) {
    inputBuffer.push({ action, frame: frameCount });
    while (inputBuffer.length > 20) inputBuffer.shift();
  }

  function checkCombo(pattern) {
    const recent = inputBuffer.filter(i => frameCount - i.frame <= BUFFER_FRAMES);
    if (recent.length < pattern.length) return false;
    const tail = recent.slice(-pattern.length).map(i => i.action);
    return tail.join(',') === pattern.join(',');
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x &&
           a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function getAttackBox(entity, direction) {
    const reach = 60;
    if (direction >= 0) {
      return { x: entity.x + entity.w, y: entity.y + 8, w: reach, h: entity.h - 16 };
    } else {
      return { x: entity.x - reach, y: entity.y + 8, w: reach, h: entity.h - 16 };
    }
  }

  function getHurtBox(entity) {
    return { x: entity.x + 4, y: entity.y + 4, w: entity.w - 8, h: entity.h - 4 };
  }

  function applyHit(attacker, defender, baseDmg, knockDir) {
    if (defender.invincible || defender.hp <= 0) return 0;
    const isCrit = Math.random() < 0.15;
    const comboMult = 1 + comboCount * 0.05;
    const dmg = Math.ceil(baseDmg * comboMult * (isCrit ? 1.8 : 1));

    defender.hp = Math.max(0, defender.hp - dmg);
    applyKnockback(defender, knockDir, 6 + Math.random() * 3);
    applyHitstun(defender, attacker.frameData ? attacker.frameData.active + 4 : 12);

    triggerHitstop(isCrit ? 8 : 4);
    if (isCrit) shakeScreen(4, 12);
    gainMeter(attacker.meterGain || 15);

    incrementCombo();
    spawnDamageNumber(defender.x + defender.w / 2, defender.y, dmg, isCrit ? 'crit' : 'hit');

    return dmg;
  }

  function applyKnockback(entity, dir, force) {
    if (!entity.vel) entity.vel = { x: 0, y: 0 };
    entity.vel.x = dir * force;
    entity.vel.y = -force * 0.4;
  }

  function applyHitstun(entity, frames) {
    entity.hitstunFrames = frames;
  }

  function applyBlockstun(entity, frames) {
    entity.blockstunFrames = frames;
  }

  function triggerHitstop(frames) {
    hitstopFrames = Math.max(hitstopFrames, frames);
  }

  function shakeScreen(intensity, duration) {
    shakeIntensity = intensity;
    shakeFrames = duration;
  }

  function getShakeOffset() {
    if (shakeFrames > 0) {
      shakeOffsetX = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeOffsetY = (Math.random() - 0.5) * shakeIntensity * 2;
      shakeFrames--;
    } else {
      shakeOffsetX = 0; shakeOffsetY = 0;
    }
    return { x: shakeOffsetX, y: shakeOffsetY };
  }

  function gainMeter(amount) {
    meterValue = Math.min(MAX_METER, meterValue + amount);
    return meterValue;
  }

  function spendMeter(amount) {
    if (meterValue < amount) return false;
    meterValue -= amount;
    return true;
  }

  function getMeter() { return meterValue; }
  function getMeterPct() { return meterValue / MAX_METER; }

  function incrementCombo() {
    comboCount++;
    comboTimer = COMBO_TIMEOUT;
  }

  function resetCombo() {
    comboCount = 0;
    comboTimer = 0;
  }

  function getCombo() { return comboCount; }

  function spawnDamageNumber(x, y, amount, type = 'hit') {
    damageNumbers.push({ x, y, amount, type, life: 50, maxLife: 50 });
  }

  function updateDamageNumbers(dt) {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      damageNumbers[i].life -= dt * 60;
      damageNumbers[i].y -= 1;
      if (damageNumbers[i].life <= 0) damageNumbers.splice(i, 1);
    }
  }

  function renderDamageNumbers(ctx, camX, camY) {
    damageNumbers.forEach(dn => {
      const alpha = dn.life / dn.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${dn.type === 'crit' ? 24 : 18}px Orbitron, monospace`;
      ctx.fillStyle = dn.type === 'crit' ? '#ffd700' : '#ffffff';
      ctx.shadowColor = dn.type === 'crit' ? '#ffd700' : '#ff00aa';
      ctx.shadowBlur = 8;
      ctx.fillText(dn.amount, dn.x - camX, dn.y - camY);
      ctx.restore();
    });
  }

  // Enemy AI update
  function updateEnemyAI(enemy, player, dt, stageWidth) {
    if (enemy.hp <= 0) return;
    if (enemy.hitstunFrames > 0) { enemy.hitstunFrames--; return; }
    if (enemy.blockstunFrames > 0) { enemy.blockstunFrames--; return; }

    const dx = player.x - enemy.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx);

    // Retreat at low health
    if (enemy.hp / enemy.maxHp < (enemy.retreatHp || 0.1)) {
      enemy.x -= dir * enemy.speed * 0.5 * dt * 60;
      enemy.facing = -dir;
      return;
    }

    switch (enemy.behavior) {
      case 'patrol':
        if (!enemy.patrolDir) enemy.patrolDir = 1;
        enemy.x += enemy.patrolDir * enemy.speed * 0.7 * dt * 60;
        if (enemy.x < 50 || enemy.x > stageWidth - 50) enemy.patrolDir *= -1;
        if (dist < 200) enemy.behavior = 'chase';
        break;

      case 'chase':
      case 'aggressive':
        if (dist > 55) {
          enemy.x += dir * enemy.speed * dt * 60;
          enemy.facing = dir;
        } else {
          if (!enemy.attackCooldown || enemy.attackCooldown <= 0) {
            enemy.attacking = true;
            enemy.attackCooldown = 45 + Math.floor(Math.random() * 30);
          }
        }
        break;

      case 'rush':
        enemy.x += dir * enemy.speed * 1.2 * dt * 60;
        enemy.facing = dir;
        if (dist < 55 && (!enemy.attackCooldown || enemy.attackCooldown <= 0)) {
          enemy.attacking = true;
          enemy.attackCooldown = 30;
        }
        break;

      case 'flee_then_attack':
        if (dist < 100) {
          enemy.x -= dir * enemy.speed * dt * 60;
        } else if (dist > 200) {
          enemy.x += dir * enemy.speed * 0.8 * dt * 60;
        } else if (!enemy.attackCooldown || enemy.attackCooldown <= 0) {
          enemy.attacking = true;
          enemy.attackCooldown = 60;
        }
        break;

      case 'block_and_attack':
        if (dist < 80) {
          if (Math.random() < (enemy.blockChance || 0.3)) {
            enemy.blocking = true;
          }
          if (!enemy.attackCooldown || enemy.attackCooldown <= 0) {
            enemy.blocking = false;
            enemy.attacking = true;
            enemy.attackCooldown = 50;
          }
        } else {
          enemy.x += dir * enemy.speed * 0.9 * dt * 60;
          enemy.facing = dir;
          enemy.blocking = false;
        }
        break;

      case 'boss_phase':
        // Phase 1: aggressive with occasional block
        const phase2 = enemy.hp < enemy.maxHp * (enemy.phase2Hp || 0.5);
        const speedMult = phase2 ? 1.4 : 1.0;
        if (dist > 60) {
          enemy.x += dir * enemy.speed * speedMult * dt * 60;
          enemy.facing = dir;
        } else {
          if (!enemy.attackCooldown || enemy.attackCooldown <= 0) {
            enemy.attacking = true;
            enemy.attackCooldown = phase2 ? 20 : 35;
          }
        }
        break;

      default:
        if (dist > 60) {
          enemy.x += dir * enemy.speed * 0.5 * dt * 60;
          enemy.facing = dir;
        }
    }

    if (enemy.attackCooldown > 0) enemy.attackCooldown--;
  }

  function checkFinisherZone(player, venue) {
    if (!venue || !venue.finisherZones) return false;
    return venue.finisherZones.some(z =>
      player.x + player.w > z.x && player.x < z.x + z.w &&
      player.y + player.h > z.y && player.y < z.y + z.h
    );
  }

  function triggerFinisher(player, enemy, venue) {
    if (!enemy || enemy.hp <= 0) return false;
    shakeScreen(8, 20);
    triggerHitstop(12);
    const dmg = player.maxHp;
    enemy.hp = Math.max(0, enemy.hp - dmg);
    spawnDamageNumber(enemy.x + enemy.w / 2, enemy.y - 20, dmg, 'crit');
    gainMeter(30);
    return true;
  }

  function update(dt) {
    frameCount++;
    if (hitstopFrames > 0) { hitstopFrames--; return true; } // return true = frozen
    if (comboTimer > 0) {
      comboTimer--;
      if (comboTimer <= 0) resetCombo();
    }
    updateDamageNumbers(dt);
    return false;
  }

  function isHitstop() { return hitstopFrames > 0; }

  function resetForStage() {
    hitstopFrames = 0; shakeFrames = 0; shakeIntensity = 0;
    meterValue = 0; inputBuffer.length = 0;
    comboCount = 0; comboTimer = 0;
    damageNumbers.length = 0;
  }

  return {
    pushInput, checkCombo, aabb, getAttackBox, getHurtBox,
    applyHit, applyKnockback, applyHitstun, applyBlockstun,
    triggerHitstop, shakeScreen, getShakeOffset,
    gainMeter, spendMeter, getMeter, getMeterPct,
    incrementCombo, resetCombo, getCombo,
    spawnDamageNumber, renderDamageNumbers,
    updateEnemyAI, checkFinisherZone, triggerFinisher,
    update, isHitstop, resetForStage
  };
})();

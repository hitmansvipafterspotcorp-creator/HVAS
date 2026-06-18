'use strict';
const QuestEngine = (() => {
  let canvas, ctx;
  let animFrameId = null;
  let lastTime = 0;

  // Game state
  const gameState = {
    running: false,
    paused: false,
    gameOver: false,
    won: false,
    character: null,
    venue: null,
    player: null,
    hp: 120, maxHp: 120,
    sp: 0, maxSp: 100,
    statusPts: 0, coins: 0, stars: 0,
    combo: 0, level: 1,
    objective: '',
    finisherAvailable: false,
    dialogBox: null,
    currentWaveIdx: 0,
    waveActive: false,
    wavesCleared: 0,
    bossDefeated: false,
    missionComplete: false
  };

  // Active scene entities
  const entities = {
    player: null,
    enemies: [],
    npcs: [],
    props: [],
    walls: [],
    doors: []
  };

  // Attack state
  let attackTimer = 0;
  let attackCooldown = 0;
  let dodgeTimer = 0;
  let iFrames = 0;
  let attackComboStep = 0;
  let comboWindowTimer = 0;

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
    SceneManager.init(c);
    InputManager.init();
    InputManager.onInputCallback(onInput);
  }

  function startQuest(characterId, venueId) {
    const save = SaveSystem.load() || SaveSystem.defaults();
    const ch = window.CHARACTERS.find(c => c.id === characterId) || window.CHARACTERS[0];
    const venue = window.VENUES.find(v => v.id === venueId) || window.VENUES[0];

    gameState.character = ch;
    gameState.venue = venue;
    gameState.hp = ch.baseHp;
    gameState.maxHp = ch.baseHp;
    gameState.statusPts = save.statusPts || 0;
    gameState.coins = save.coins || 0;
    gameState.stars = save.stars || 0;
    gameState.level = save.level || 1;
    gameState.paused = false;
    gameState.gameOver = false;
    gameState.won = false;
    gameState.running = true;
    gameState.currentWaveIdx = 0;
    gameState.waveActive = false;
    gameState.wavesCleared = 0;
    gameState.bossDefeated = false;
    gameState.missionComplete = false;

    CombatEngine.resetForStage();
    SceneManager.resetCamera();

    // Build player entity
    const isTopdown = venue.cameraType === 'topdown';
    const groundY = isTopdown
      ? canvas.height * 0.5
      : canvas.height * (venue.groundY || 0.75) - ch.baseHp * 0.35;
    const playerH = isTopdown ? 30 : 44;
    const playerW = isTopdown ? 30 : 28;

    entities.player = {
      x: 80, y: isTopdown ? canvas.height / 2 - 15 : groundY - playerH,
      w: playerW, h: playerH,
      hp: ch.baseHp, maxHp: ch.baseHp,
      speed: ch.moveSpeed || 4,
      facing: 1,
      attacking: false, attackTimer: 0,
      blocking: false, dodging: false,
      hitstunFrames: 0, invincible: false,
      vel: { x: 0, y: 0 },
      onGround: true,
      meterGain: ch.meterGain || 15,
      frameData: ch.frameData || { startup: 4, active: 3, recovery: 8 }
    };

    // Build scene
    if (isTopdown) {
      entities.walls = NPCEngine.generateVenueWalls(venue, canvas.width, canvas.height);
      entities.doors = NPCEngine.generateVenueDoors(venue, canvas.width, canvas.height, SaveSystem.load());
    } else {
      entities.walls = [];
      entities.doors = [];
    }
    entities.props = NPCEngine.generateVenueProps(venue, canvas.width, canvas.height, isTopdown);
    entities.npcs  = NPCEngine.generateVenueNPCs(venue, canvas.width, canvas.height);
    entities.enemies = [];

    // Load mission
    MissionEngine.loadMission(venue);
    MissionEngine.onVenueEntered();
    gameState.objective = MissionEngine.getObjectiveText();

    // Spawn first non-boss wave
    spawnNextWave();

    updateHUD();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    loop(performance.now());
  }

  function loop(ts) {
    if (!gameState.running) return;
    animFrameId = requestAnimationFrame(loop);
    const dt = Math.min((ts - lastTime) / 1000, 0.05);
    lastTime = ts;

    if (!gameState.paused && !gameState.gameOver && !gameState.won) {
      update(dt);
    }
    render();
  }

  function update(dt) {
    const frozen = CombatEngine.update(dt);
    if (frozen) return;

    InputManager.update();
    const inp = InputManager.state;
    const p = entities.player;
    const venue = gameState.venue;
    const isTopdown = venue.cameraType === 'topdown';

    // Player movement
    if (p.hitstunFrames > 0) {
      p.hitstunFrames--;
    } else if (!p.attacking || attackTimer <= 0) {
      if (!p.dodging) {
        if (!isTopdown) {
          // Side-scroll movement
          if (inp.left)  { p.x -= p.speed * dt * 60; p.facing = -1; }
          if (inp.right) { p.x += p.speed * dt * 60; p.facing =  1; }
          if (inp.up && p.onGround) { p.vel.y = -14; p.onGround = false; }
        } else {
          // Top-down 4-dir
          if (inp.left)  { p.x -= p.speed * dt * 60; p.facing = -1; }
          if (inp.right) { p.x += p.speed * dt * 60; p.facing =  1; }
          if (inp.up)    p.y -= p.speed * dt * 60;
          if (inp.down)  p.y += p.speed * dt * 60;
        }
      }
      p.blocking = inp.block || (inp.dodge && !inp.left && !inp.right && !inp.up && !inp.down);
    }

    // Gravity (sidescroll only)
    if (!isTopdown) {
      p.vel.y += 0.6;
      p.y += p.vel.y;
      const groundY = canvas.height * (venue.groundY || 0.75) - p.h;
      if (p.y >= groundY) { p.y = groundY; p.vel.y = 0; p.onGround = true; }
    }

    // Bounds
    const stageW = venue.stageWidth || canvas.width * 5;
    p.x = Math.max(0, Math.min(p.x, isTopdown ? canvas.width - p.w : stageW - p.w));
    if (isTopdown) p.y = Math.max(50, Math.min(p.y, canvas.height - p.h - 10));

    // Attack timer
    if (attackTimer > 0) { attackTimer--; if (attackTimer === 0) p.attacking = false; }
    if (attackCooldown > 0) attackCooldown--;
    if (dodgeTimer > 0) { dodgeTimer--; if (dodgeTimer === 0) { p.dodging = false; iFrames = 0; } }
    if (iFrames > 0) { iFrames--; p.invincible = iFrames > 0; }
    if (comboWindowTimer > 0) { comboWindowTimer--; if (comboWindowTimer === 0) attackComboStep = 0; }

    // Collision with walls (topdown)
    if (isTopdown) resolveWallCollision(p, entities.walls);

    // Check attack hits
    if (p.attacking && attackTimer > 0 && attackTimer <= gameState.character.frameData.active) {
      const atkBox = CombatEngine.getAttackBox(p, p.facing);
      entities.enemies.forEach(e => {
        if (e.hp <= 0 || e.hitThisAttack) return;
        const hurtBox = CombatEngine.getHurtBox(e);
        if (CombatEngine.aabb(atkBox, hurtBox)) {
          if (!e.blocking) {
            const dmg = CombatEngine.applyHit(p, e, gameState.character.baseDmg, p.facing);
            e.hitThisAttack = true;
            onEnemyHit(e, dmg);
          } else {
            CombatEngine.applyBlockstun(e, 15);
            CombatEngine.triggerHitstop(3);
          }
        }
      });
    }

    // Enemy attacks vs player
    entities.enemies.forEach(e => {
      if (e.hp <= 0) return;
      CombatEngine.updateEnemyAI(e, p, dt, venue.stageWidth || canvas.width * 5);

      // Apply enemy velocity
      if (e.vel) {
        e.x += e.vel.x;
        e.y += e.vel.y;
        e.vel.x *= 0.85;
        if (!isTopdown) {
          e.vel.y += 0.4;
          const gy = canvas.height * (venue.groundY || 0.75) - e.h;
          if (e.y >= gy) { e.y = gy; e.vel.y = 0; }
        }
      }

      // Enemy attack hits player
      if (e.attacking && !p.invincible) {
        const eBox = CombatEngine.getAttackBox(e, e.facing);
        const pHurt = CombatEngine.getHurtBox(p);
        if (CombatEngine.aabb(eBox, pHurt)) {
          if (p.blocking) {
            p.hp = Math.max(0, p.hp - Math.ceil(e.dmg * 0.15));
            CombatEngine.applyBlockstun(p, 12);
            CombatEngine.triggerHitstop(4);
          } else {
            p.hp = Math.max(0, p.hp - e.dmg);
            CombatEngine.applyKnockback(p, -e.facing, 5);
            CombatEngine.applyHitstun(p, 18);
            CombatEngine.shakeScreen(3, 8);
            if (navigator.vibrate) navigator.vibrate(80);
            gameState.hp = p.hp;
          }
          e.attacking = false;
          if (p.hp <= 0) { onGameOver(); return; }
        }
      }
      if (e.attacking) e.attacking = false;
      delete e.hitThisAttack;
    });

    // Apply player knockback
    if (p.vel.x) { p.x += p.vel.x; p.vel.x *= 0.8; if (Math.abs(p.vel.x) < 0.5) p.vel.x = 0; }

    // NPC / prop / door proximity
    NPCEngine.updateNPCProximity(entities.npcs, p, 65);
    NPCEngine.updatePropProximity(entities.props, p, 65);
    if (isTopdown) NPCEngine.updateDoorProximity(entities.doors, p, 55);

    // Finisher zone check
    const finisherProp = entities.props.find(pr => pr.finisherZone && pr.showPrompt);
    const finisherEnemy = entities.enemies.find(e => e.hp > 0 && e.hp < e.maxHp * 0.25);
    gameState.finisherAvailable = !!(finisherProp && finisherEnemy);

    // Check wave cleared
    const aliveEnemies = entities.enemies.filter(e => e.hp > 0);
    if (gameState.waveActive && aliveEnemies.length === 0) {
      gameState.waveActive = false;
      onWaveCleared();
    }

    // Camera
    SceneManager.updateCamera(p, venue.stageWidth || canvas.width, canvas.height, canvas.width, canvas.height);

    // Update HUD state
    gameState.hp = p.hp;
    gameState.objective = MissionEngine.getObjectiveText();
    updateHUD();
  }

  function resolveWallCollision(entity, walls) {
    walls.forEach(w => {
      if (CombatEngine.aabb(entity, w)) {
        const overlapX = Math.min(entity.x + entity.w, w.x + w.w) - Math.max(entity.x, w.x);
        const overlapY = Math.min(entity.y + entity.h, w.y + w.h) - Math.max(entity.y, w.y);
        if (overlapX < overlapY) {
          entity.x += entity.x < w.x ? -overlapX : overlapX;
        } else {
          entity.y += entity.y < w.y ? -overlapY : overlapY;
        }
      }
    });
  }

  function onInput(action) {
    if (gameState.gameOver || gameState.won) return;
    if (gameState.paused) { if (action === 'pause' || action === 'back') togglePause(); return; }

    const p = entities.player;
    const ch = gameState.character;

    switch (action) {
      case 'attack':
        if (attackCooldown > 0) return;
        p.attacking = true;
        attackTimer = (ch.frameData.startup + ch.frameData.active + ch.frameData.recovery);
        attackCooldown = Math.max(8, ch.frameData.recovery);
        comboWindowTimer = 30;
        attackComboStep++;
        CombatEngine.pushInput('attack');
        break;

      case 'special':
        if (!CombatEngine.spendMeter(ch.meterCost || 40)) return;
        p.attacking = true;
        attackTimer = 20;
        attackCooldown = 25;
        CombatEngine.pushInput('special');
        CombatEngine.shakeScreen(5, 10);
        // Special deals 2x damage to all nearby enemies
        entities.enemies.forEach(e => {
          if (e.hp > 0) {
            const dx = Math.abs(e.x - p.x);
            if (dx < 200) {
              CombatEngine.applyHit(p, e, ch.baseDmg * 2.5, p.facing);
              onEnemyHit(e, ch.baseDmg * 2.5);
            }
          }
        });
        break;

      case 'dodge':
        if (dodgeTimer > 0) return;
        p.dodging = true;
        dodgeTimer = ch.iFrames || 10;
        iFrames = ch.iFrames || 10;
        p.invincible = true;
        p.vel.x = p.facing * 8;
        CombatEngine.pushInput('dodge');
        break;

      case 'interact':
        handleInteract();
        break;

      case 'pause':
        togglePause();
        break;

      case 'confirm':
        if (gameState.dialogBox) { advanceDialog(); }
        break;

      case 'back':
        if (gameState.dialogBox) { gameState.dialogBox = null; }
        break;
    }
  }

  function handleInteract() {
    const p = entities.player;

    // Dialog advance
    if (gameState.dialogBox) { advanceDialog(); return; }

    // Talk to NPC
    const nearNPC = entities.npcs.find(n => n.showPrompt && !n.interacted);
    if (nearNPC) {
      startNPCDialog(nearNPC);
      return;
    }

    // Interact with prop
    const nearProp = entities.props.find(pr => pr.showPrompt && pr.interactable);
    if (nearProp) {
      onPropInteract(nearProp);
      return;
    }

    // Finisher
    if (gameState.finisherAvailable) {
      const bossEnemy = entities.enemies.find(e => e.hp > 0 && e.hp < e.maxHp * 0.25);
      if (bossEnemy) {
        CombatEngine.triggerFinisher(p, bossEnemy, gameState.venue);
        onEnemyHit(bossEnemy, 9999);
        gameState.finisherAvailable = false;
      }
      return;
    }

    // Door (topdown)
    const nearDoor = entities.doors.find(d => d.showPrompt);
    if (nearDoor) {
      if (!nearDoor.locked) {
        if (nearDoor.destVenueId) {
          completeAndAdvance(nearDoor.destVenueId);
        }
      } else {
        showNotification('🔒 ' + (nearDoor.lockedText || 'Complete the mission first.'));
      }
    }
  }

  function startNPCDialog(npc) {
    const line = npc.dialog[npc.dialogIdx || 0];
    gameState.dialogBox = { speaker: npc.name, text: line };
    npc._pendingAdvance = true;
  }

  function advanceDialog() {
    if (!gameState.dialogBox) return;
    const npc = entities.npcs.find(n => n._pendingAdvance);
    if (npc) {
      npc.dialogIdx = (npc.dialogIdx || 0) + 1;
      if (npc.dialogIdx >= npc.dialog.length) {
        npc.interacted = true;
        npc._pendingAdvance = false;
        gameState.dialogBox = null;
        MissionEngine.onTalkToNPC();
        gameState.objective = MissionEngine.getObjectiveText();
      } else {
        gameState.dialogBox = { speaker: npc.name, text: npc.dialog[npc.dialogIdx] };
      }
    } else {
      gameState.dialogBox = null;
    }
  }

  function onPropInteract(prop) {
    showNotification(`✨ ${prop.type.replace(/_/g,' ').toUpperCase()} activated!`);
    prop.interactable = false;
    prop.showPrompt = false;
    MissionEngine.onPropInteracted();
    gameState.objective = MissionEngine.getObjectiveText();
    gameState.coins += 15;
    gameState.statusPts += 25;
    CombatEngine.gainMeter(20);
  }

  function onEnemyHit(enemy, dmg) {
    if (enemy.hp <= 0) {
      onEnemyDefeated(enemy);
    }
  }

  function onEnemyDefeated(enemy) {
    const reward = enemy.reward || { pts: 50, coins: 10 };
    gameState.statusPts += reward.pts;
    gameState.coins += reward.coins;
    if (enemy.isBoss) {
      gameState.stars++;
      gameState.bossDefeated = true;
      MissionEngine.onBossDefeated();
      gameState.objective = MissionEngine.getObjectiveText();
      if (MissionEngine.isMissionComplete()) {
        onMissionComplete();
      }
    }
  }

  function spawnNextWave() {
    const venue = gameState.venue;
    const waves = venue.waves || [];
    const isTopdown = venue.cameraType === 'topdown';

    // Find next non-boss wave
    let waveData = null;
    for (let i = gameState.currentWaveIdx; i < waves.length; i++) {
      if (waves[i].wave !== 'boss') { waveData = waves[i]; gameState.currentWaveIdx = i + 1; break; }
    }
    if (!waveData) return; // No more normal waves — wait for boss trigger

    const newEnemies = NPCEngine.generateVenueEnemies(venue, waveData, canvas.width, canvas.height, isTopdown);
    entities.enemies.push(...newEnemies);
    gameState.waveActive = true;
  }

  function spawnBossWave() {
    const venue = gameState.venue;
    const waves = venue.waves || [];
    const bossWave = waves.find(w => w.wave === 'boss');
    if (!bossWave || gameState.bossDefeated) return;

    const isTopdown = venue.cameraType === 'topdown';
    const bossEnemies = NPCEngine.generateVenueEnemies(venue, bossWave, canvas.width, canvas.height, isTopdown);
    entities.enemies.push(...bossEnemies);
    gameState.waveActive = true;
  }

  function onWaveCleared() {
    gameState.wavesCleared++;
    MissionEngine.onWaveCleared(gameState.wavesCleared);
    gameState.objective = MissionEngine.getObjectiveText();
    gameState.statusPts += 100;
    gameState.coins += 20;
    CombatEngine.gainMeter(25);

    // Check if all normal waves done — spawn boss
    const venue = gameState.venue;
    const waves = venue.waves || [];
    const remainingNormal = waves.slice(gameState.currentWaveIdx).filter(w => w.wave !== 'boss');
    if (remainingNormal.length > 0) {
      setTimeout(() => spawnNextWave(), 1500);
    } else if (!gameState.bossDefeated) {
      setTimeout(() => spawnBossWave(), 2000);
    }
  }

  function onMissionComplete() {
    if (gameState.missionComplete) return;
    gameState.missionComplete = true;

    const venue = gameState.venue;
    const reward = venue.reward || {};
    const pts = reward.pts || 500;
    const coins = reward.coins || 100;

    gameState.statusPts += pts;
    gameState.coins += coins;
    gameState.stars++;

    // Save progress
    const save = SaveSystem.load() || SaveSystem.defaults();
    save.statusPts = gameState.statusPts;
    save.coins = gameState.coins;
    save.stars = gameState.stars;
    save.level = SaveSystem.calcLevel(gameState.statusPts);
    SaveSystem.completeMission(venue.id);
    if (reward.unlocks) SaveSystem.unlockVenue(reward.unlocks);
    SaveSystem.save(save);

    gameState.won = true;
    showVictoryScreen();
  }

  function showVictoryScreen() {
    const overlay = document.getElementById('game-overlay');
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="game-overlay-title win">MISSION COMPLETE</div>
      <div class="game-overlay-sub">${gameState.venue.name.toUpperCase()}</div>
      <div style="color:#ffd700;font-family:'Orbitron',sans-serif;font-size:16px;margin:12px 0">
        +${gameState.venue.reward?.pts || 0} STATUS  •  +${gameState.venue.reward?.coins || 0} COINS  •  +1 ⭐
      </div>
      <div class="game-overlay-actions">
        <button class="game-overlay-btn primary" onclick="HitgearOS.returnToMenu()">CONTINUE</button>
        <button class="game-overlay-btn secondary" onclick="HitgearOS.openVenueMap()">VENUE MAP</button>
      </div>`;
    overlay.style.display = 'flex';
  }

  function onGameOver() {
    gameState.gameOver = true;
    gameState.running = false;
    const overlay = document.getElementById('game-overlay');
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="game-overlay-title lose">GAME OVER</div>
      <div class="game-overlay-sub">YOU FELL IN THE AFTER SPOT</div>
      <div class="game-overlay-actions">
        <button class="game-overlay-btn primary" onclick="HitgearOS.retryVenue()">TRY AGAIN</button>
        <button class="game-overlay-btn secondary" onclick="HitgearOS.returnToMenu()">MAIN MENU</button>
      </div>`;
    overlay.style.display = 'flex';
  }

  function togglePause() {
    gameState.paused = !gameState.paused;
    const ps = document.getElementById('pause-screen');
    if (ps) ps.classList.toggle('active', gameState.paused);
  }

  function render() {
    const venue = gameState.venue;
    if (!venue) return;
    if (venue.cameraType === 'topdown') {
      SceneManager.renderTopdown(gameState, entities, venue);
    } else {
      SceneManager.renderSidescroll(gameState, entities, venue);
    }
  }

  function updateHUD() {
    const hpFill = document.getElementById('hud-hp-fill');
    const spFill = document.getElementById('hud-sp-fill');
    const ptsEl = document.getElementById('hud-pts');
    const coinsEl = document.getElementById('hud-coins');
    const starsEl = document.getElementById('hud-stars');

    if (hpFill) hpFill.style.width = (gameState.hp / gameState.maxHp * 100) + '%';
    if (spFill) spFill.style.width = (CombatEngine.getMeterPct() * 100) + '%';
    if (ptsEl) ptsEl.textContent = gameState.statusPts;
    if (coinsEl) coinsEl.textContent = gameState.coins;
    if (starsEl) starsEl.textContent = gameState.stars;
  }

  function showNotification(msg, duration = 2500) {
    let el = document.getElementById('game-notification');
    if (!el) {
      el = document.createElement('div');
      el.id = 'game-notification';
      el.style.cssText = 'position:absolute;top:50px;left:50%;transform:translateX(-50%);background:#0a001088;border:1px solid #ffd700;color:#ffd700;font-family:Orbitron,sans-serif;font-size:13px;padding:8px 20px;border-radius:4px;z-index:50;pointer-events:none;text-align:center;';
      document.getElementById('screen-gameplay')?.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.opacity = '0'; }, duration);
  }

  function completeAndAdvance(nextVenueId) {
    onMissionComplete();
  }

  function stopQuest() {
    gameState.running = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
  }

  return {
    init, startQuest, stopQuest,
    togglePause, onInput, gameState, entities,
    showNotification, updateHUD
  };
})();

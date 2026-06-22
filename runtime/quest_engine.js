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

    FighterEngine.resetForStage();
    if (typeof SpriteSystem !== 'undefined' && SpriteSystem.hasSprites(ch.id)) {
      SpriteSystem.preload(ch.id);
    }
    if (venue.id === 1 && typeof Stage1Scene !== 'undefined') {
      Stage1Scene.preloadOutside();
      Stage1Scene.preloadInside();
    }
    SceneManager.resetCamera();

    // Build player entity
    const isTopdown = venue.cameraType === 'topdown';
    const groundY = isTopdown
      ? canvas.height * 0.5
      : canvas.height * (venue.groundY || 0.75);
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
      frameData: ch.frameData || { startup: 4, active: 3, recovery: 8 },
      charId: ch.id,
      lastDir: { x: 0, y: 1 },
      animState: 'idle'
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
    InputManager.update();
    const inp = InputManager.state;
    const p   = entities.player;
    const venue = gameState.venue;
    const isTopdown = venue.cameraType === 'topdown';
    const stageW = venue.stageWidth || (isTopdown ? canvas.width : canvas.width * 5);
    const stageGroundY = canvas.height * (venue.groundY || 0.75);

    if (isTopdown) {
      // ── Topdown physics via FighterEngine ──
      const layout = (venue.id === 1 && typeof Stage1Scene !== 'undefined')
        ? Stage1Scene.INSIDE : null;
      const inter = FighterEngine.updatePlayerTopdown(p, inp, dt, layout);
      if (inter) handleStage1Interaction(inter);
    } else {
      // ── Sidescroll physics via FighterEngine ──
      FighterEngine.updatePlayerSidescroll(p, inp, dt, stageGroundY, stageW);
      // Enemy AI + ground physics
      entities.enemies.forEach(e => {
        if (e.hp <= 0) return;
        FighterEngine.tickEnemy(e, p, dt);
        if (e.vel) {
          e.x += e.vel.x * dt;
          e.y += e.vel.y * dt;
          e.vel.x *= 0.82;
          e.vel.y += 1800 * dt;
          const gy = stageGroundY - e.h;
          if (e.y >= gy) { e.y = gy; e.vel.y = 0; e.onGround = true; e.launched = false; }
        }
        // Enemy hits player
        if (e.attacking && !p.invincible) {
          const eBox  = FighterEngine.getHitbox(e);
          const pHurt = FighterEngine.getHurtbox(p);
          if (FighterEngine.aabb(eBox, pHurt)) {
            if (p.blocking) {
              p.hp = Math.max(0, p.hp - Math.ceil(e.dmg * 0.15));
              FighterEngine.applyBlockstun(p, 12);
              FighterEngine.triggerHitstop(0.05);
            } else {
              p.hp = Math.max(0, p.hp - e.dmg);
              FighterEngine.applyKnockback(p, -e.facing, 200);
              FighterEngine.applyHitstun(p, 20);
              FighterEngine.shakeScreen(4, 10);
              if (navigator.vibrate) navigator.vibrate(80);
              gameState.hp = p.hp;
            }
            e.attacking = false;
            if (p.hp <= 0) { onGameOver(); return; }
          }
        }
      });
      // Player attack hits enemies
      FighterEngine.resolveHits(p, entities.enemies, stageGroundY);
      entities.enemies.forEach(e => {
        if (e.hp <= 0 && !e._defeatedHandled) {
          e._defeatedHandled = true;
          onEnemyDefeated(e);
        }
      });
    }

    // SpriteSystem animation update
    if (typeof SpriteSystem !== 'undefined' && SpriteSystem.hasSprites(p.charId)) {
      SpriteSystem.update(p.charId, p, dt, isTopdown, p.lastDir || 's');
    }
    entities.enemies.forEach(e => {
      if (typeof SpriteSystem !== 'undefined' && SpriteSystem.hasSprites(e.charId)) {
        SpriteSystem.update(e.charId, e, dt, isTopdown, 's');
      }
    });

    // Collision with walls (topdown legacy)
    if (isTopdown) resolveWallCollision(p, entities.walls);

    // NPC / prop / door proximity
    NPCEngine.updateNPCProximity(entities.npcs, p, 65);
    NPCEngine.updatePropProximity(entities.props, p, 65);
    if (isTopdown) NPCEngine.updateDoorProximity(entities.doors, p, 55);

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
      if (FighterEngine.aabb(entity, w)) {
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
        FighterEngine.pushInput('attack');
        FighterEngine.executeAttack(p, 'normal');
        break;

      case 'special':
        FighterEngine.pushInput('special');
        FighterEngine.executeAttack(p, 'special');
        break;

      case 'super':
        FighterEngine.pushInput('super');
        p.superAnim = 1;
        FighterEngine.executeAttack(p, 'super');
        break;

      case 'dodge':
        FighterEngine.pushInput('dodge');
        FighterEngine.executeAttack(p, 'dodge');
        break;

      case 'finisher':
        FighterEngine.pushInput('finisher');
        p.finisherTarget = entities.enemies.find(e => e.hp > 0 && e.finisherAvailable);
        FighterEngine.executeAttack(p, 'finisher');
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
        FighterEngine.executeAttack(p, 'super');
        FighterEngine.applyHit(p, bossEnemy, { damage: bossEnemy.maxHp, hitstop: 0.22, launch: true, meterGain: 0 });
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
    FighterEngine.gainMeter(null, 20);
  }

  function handleStage1Interaction(inter) {
    if (!inter) return;
    switch (inter.action) {
      case 'dialog_npc': {
        const npc = entities.npcs.find(n => n.id === inter.npcId);
        if (npc) startNPCDialog(npc);
        break;
      }
      case 'check_vip': {
        const save = SaveSystem.load() || SaveSystem.defaults();
        if ((save.statusPts || 0) >= 500) {
          showNotification('VIP ACCESS GRANTED ✓');
        } else {
          showNotification('VIP MEMBERS ONLY — Earn 500 Status Points');
        }
        break;
      }
      case 'dance_minigame':
        showNotification('DANCE FLOOR — HIT THE FLOOR! [coming soon]');
        break;
      case 'exit_back':
        showNotification('BACK EXIT — Returning outside...');
        break;
      case 'enter_venue':
        // Switch camera to topdown
        gameState.venue.cameraType = 'topdown';
        showNotification('ENTERING CAFE 8 FIFTY...');
        break;
    }
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
    FighterEngine.gainMeter(null, 25);

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
    const cameraX = SceneManager.getCameraX ? SceneManager.getCameraX() : 0;
    const cameraY = SceneManager.getCameraY ? SceneManager.getCameraY() : 0;

    if (venue.cameraType === 'topdown') {
      SceneManager.renderTopdown(gameState, entities, venue);
    } else {
      SceneManager.renderSidescroll(gameState, entities, venue);
    }

    // VFX overlay (sprite-based hit sparks, trails)
    if (typeof SpriteSystem !== 'undefined') {
      SpriteSystem.renderVFX(ctx, cameraX, cameraY);
    }

    // Super flash overlay
    FighterEngine.renderSuperFlash(ctx, canvas.width, canvas.height);

    // Combo counter HUD
    if (FighterEngine.getCombo() >= 2) {
      FighterEngine.renderComboHUD(ctx, 16, canvas.height - 80);
    }

    // FighterEngine damage numbers
    FighterEngine.renderDmgNumbers(ctx, cameraX, 0);
  }

  function updateHUD() {
    const hpFill = document.getElementById('hud-hp-fill');
    const spFill = document.getElementById('hud-sp-fill');
    const ptsEl = document.getElementById('hud-pts');
    const coinsEl = document.getElementById('hud-coins');
    const starsEl = document.getElementById('hud-stars');

    if (hpFill) hpFill.style.width = (gameState.hp / gameState.maxHp * 100) + '%';
    if (spFill) spFill.style.width = (FighterEngine.getMeterPct() * 100) + '%';
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

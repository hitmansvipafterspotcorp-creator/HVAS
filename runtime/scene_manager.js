'use strict';
const SceneManager = (() => {
  let canvas, ctx;
  let cameraX = 0, cameraY = 0;
  let devMode = false;

  // Neon sign templates per venue
  const neonSigns = [
    ['VIP ENTRY', 'AFTER SPOT', 'MEMBERS ONLY'],
    ['HIBACHI', 'FOOD TRUCK', 'LATE NIGHT'],
    ['HITMANS VIP', 'AFTER SPOT', 'MEMBERS'],
    ['KINGDOM COME', 'SALOON', 'EST. TALLY'],
    ['SOCIAL GAINES', 'POOL BAR', 'SPORTS'],
    ['SUCCESS POOL', 'VIP ROOFTOP', 'MEMBERS ONLY'],
    ['TALLY ROW', 'NIGHTLIFE', 'AFTER HOURS'],
    ['THE DEN', 'UNDERGROUND', 'PRIVATE'],
    ['THE ITUS', 'PIZZA', 'LATE NIGHT'],
    ['SAMMYS STAGE', 'LIVE MUSIC', 'PERFORM'],
    ['PUBLIC HALL', 'EVENTS', 'COMMUNITY'],
    ['13 RAVE', 'LASER RAVE', 'ALL NIGHT'],
    ['DUKES & DIMES', 'HIGH STAKES', 'HUSTLE'],
    ['QUICK HIT', 'FUEL STOP', '24HRS'],
    ['ROOFTOP PKG', 'PARKING', 'ELEVATED'],
    ['EVO FEST', 'FESTIVAL', 'LEGENDARY']
  ];

  const propColors = {
    velvet_rope: '#aa0055', neon_sign: '#ff00aa', entry_door: '#330033',
    security_post: '#334466', street_light: '#ffd700', sidewalk_barricade: '#cc4400',
    food_truck: '#228800', hibachi_grill: '#ff6600', trash_can: '#445544',
    vendor_table: '#664400', parked_car: '#223344', dj_booth: '#440066',
    vip_rope: '#aa0055', stage_light: '#ffff00', bar_counter: '#663300',
    lounge_booth: '#330033', smoke_machine: '#225555', speaker_stack: '#222222',
    pool_table: '#006622', cue_stick: '#885511', jukebox: '#aa0033',
    bar_stool: '#553311', pool: '#0055aa', cabana: '#ffcc88',
    festival_stage: '#330066', pyro_rig: '#ff4400', crowd_barrier: '#334466',
    light_tower: '#ffdd00', vip_tent: '#440066', gas_pump: '#ccaa00',
    car: '#334466', parking_gate: '#cc4400', booth: '#330033',
    speaker_wall: '#111111', dj_setup: '#220044', strobe_light: '#ffffff',
    pizza_oven: '#cc4400', counter: '#553311', dining_table: '#443322',
    main_stage: '#1a0030', spotlight: '#ffff88', stage_pole: '#888888',
    dice_table: '#223300', card_table: '#004422', cooler: '#0044aa'
  };

  function init(c) {
    canvas = c;
    ctx = canvas.getContext('2d');
  }

  function setDevMode(v) { devMode = v; }

  // ──── SIDE-SCROLL RENDER ────
  function renderSidescroll(gameState, entities, venue) {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const shake = CombatEngine.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Background layers
    const layers = venue.bgLayers || [];
    layers.forEach(layer => {
      if (layer.type === 'sky') {
        ctx.fillStyle = layer.color;
        ctx.fillRect(0, 0, W, H);
      } else if (layer.type === 'cityBg') {
        ctx.fillStyle = layer.color;
        ctx.fillRect(0, H * (layer.y || 0.2), W, H * (layer.h || 0.6));
      } else if (layer.type === 'buildings') {
        drawBuildings(layer.color, cameraX * 0.3, W, H, layer.y, layer.h);
      } else if (layer.type === 'neonSigns') {
        drawNeonSigns(neonSigns[(venue.id - 1)] || [], cameraX * 0.5, W, H, layer.y, layer.color);
      } else if (layer.type === 'ground') {
        ctx.fillStyle = layer.color;
        ctx.fillRect(0, H * (layer.y || 0.75), W, H);
        // Ground line glow
        ctx.strokeStyle = venue.colors.accent || '#ff00aa';
        ctx.shadowColor = venue.colors.accent || '#ff00aa';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, H * (layer.y || 0.75));
        ctx.lineTo(W, H * (layer.y || 0.75));
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    });

    // World entities
    ctx.save();
    ctx.translate(-cameraX, 0);

    // Props
    if (entities.props) entities.props.forEach(p => drawProp(p, H, venue.groundY || 0.75));

    // NPCs
    if (entities.npcs) entities.npcs.forEach(n => drawNPC(n, H, venue.groundY || 0.75));

    // Enemies
    if (entities.enemies) entities.enemies.forEach(e => {
      if (e.hp > 0) drawEnemy(e, H, venue.groundY || 0.75);
    });

    // Player
    if (entities.player) drawPlayer(entities.player, H, venue.groundY || 0.75, gameState);

    // Damage numbers
    CombatEngine.renderDamageNumbers(ctx, cameraX, 0);

    ctx.restore();

    // HUD (no camera offset)
    renderSidescrollHUD(gameState, entities, venue, W, H);

    if (devMode) renderDebugOverlay(entities, W, H);
    ctx.restore();
  }

  function drawBuildings(color, camOff, W, H, yFrac, hFrac) {
    const seed = 42;
    ctx.fillStyle = color;
    const count = 12;
    for (let i = 0; i < count; i++) {
      const bw = 60 + ((i * 37) % 80);
      const bh = 80 + ((i * 53) % 160);
      const bx = ((i * 140) - (camOff % (count * 140))) % (W + 200) - 100;
      const by = H * yFrac - bh;
      ctx.fillRect(bx, by, bw, bh);
      // Windows
      ctx.fillStyle = Math.random() < 0.4 ? '#ffd70044' : '#ff00aa22';
      for (let wy = 0; wy < 5; wy++) {
        for (let wx = 0; wx < 3; wx++) {
          if (Math.random() < 0.6) ctx.fillRect(bx + 6 + wx * 18, by + 10 + wy * 20, 12, 14);
        }
      }
      ctx.fillStyle = color;
    }
  }

  function drawNeonSigns(signs, camOff, W, H, yFrac, accentColor) {
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.shadowBlur = 12;
    signs.forEach((sign, i) => {
      const x = ((i * 220 + 80) - (camOff * 0.5) % (signs.length * 220)) % (W + 300) - 150;
      const y = H * (yFrac + 0.05) + i * 20;
      ctx.fillStyle = accentColor;
      ctx.shadowColor = accentColor;
      ctx.fillText(sign, x, y);
    });
    ctx.shadowBlur = 0;
  }

  function drawPlayer(p, H, groundYFrac, gameState) {
    const ch = gameState.character || window.CHARACTERS[0];
    const groundY = H * groundYFrac;
    const py = p.y;

    ctx.save();
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x + p.w / 2, groundY + 2, p.w / 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body glow
    if (p.attacking) {
      ctx.shadowColor = ch.color || '#ff00aa';
      ctx.shadowBlur = 20;
    }
    if (p.invincible) {
      ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 60) * 0.5;
    }

    // Body rect
    ctx.fillStyle = ch.color || '#ff00aa';
    ctx.fillRect(p.x, py, p.w, p.h);

    // Emoji
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = `${Math.min(p.w, p.h) * 0.65}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch.emoji || '🎤', p.x + p.w / 2, py + p.h / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Attack hitbox flash
    if (p.attacking && p.attackTimer > 0) {
      const atkBox = CombatEngine.getAttackBox(p, p.facing || 1);
      ctx.fillStyle = 'rgba(255,255,100,0.35)';
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 1;
      ctx.fillRect(atkBox.x, atkBox.y, atkBox.w, atkBox.h);
      ctx.strokeRect(atkBox.x, atkBox.y, atkBox.w, atkBox.h);
    }

    // Block shield
    if (p.blocking) {
      ctx.strokeStyle = '#44aaff';
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x - 2, py - 2, p.w + 4, p.h + 4);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawEnemy(e, H, groundYFrac) {
    const ey = e.y;
    ctx.save();
    if (e.attacking) { ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 14; }
    ctx.fillStyle = e.color || '#cc2200';
    ctx.fillRect(e.x, ey, e.w, e.h);

    // Emoji
    ctx.font = `${Math.min(e.w, e.h) * 0.6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.emoji || '👊', e.x + e.w / 2, ey + e.h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.shadowBlur = 0;

    // HP bar above enemy
    const barW = e.w + 10;
    const bx = e.x - 5, by = ey - 12;
    ctx.fillStyle = '#330000';
    ctx.fillRect(bx, by, barW, 5);
    ctx.fillStyle = '#ff2222';
    ctx.fillRect(bx, by, barW * (e.hp / e.maxHp), 5);

    // Boss indicator
    if (e.isBoss) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 8;
      ctx.strokeRect(e.x - 3, ey - 3, e.w + 6, e.h + 6);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawNPC(npc, H, groundYFrac) {
    ctx.save();
    ctx.fillStyle = npc.color || '#4444aa';
    ctx.fillRect(npc.x, npc.y, npc.w || 28, npc.h || 44);
    ctx.font = `${Math.min(28, 44) * 0.55}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(npc.emoji || '🧑', npc.x + (npc.w || 28) / 2, npc.y + (npc.h || 44) / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // Interact prompt
    if (npc.showPrompt) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 10px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Y] TALK', npc.x + (npc.w || 28) / 2, npc.y - 8);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawProp(prop, H, groundYFrac) {
    ctx.save();
    const col = propColors[prop.type] || '#444444';
    ctx.fillStyle = col;
    if (prop.glow) {
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
    }
    ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
    if (prop.emoji) {
      ctx.font = `${Math.min(prop.w, prop.h) * 0.6}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(prop.emoji, prop.x + prop.w / 2, prop.y + prop.h / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    if (prop.interactable && prop.showPrompt) {
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
      ctx.font = 'bold 10px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Y]', prop.x + prop.w / 2, prop.y - 8);
      ctx.textAlign = 'left';
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function renderSidescrollHUD(gameState, entities, venue, W, H) {
    const player = entities.player;
    if (!player) return;

    // Top bar bg
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, 44);

    // HP bar
    const hpPct = player.hp / player.maxHp;
    ctx.fillStyle = '#330000';
    ctx.fillRect(12, 10, 140, 10);
    const hpGrad = ctx.createLinearGradient(12, 0, 152, 0);
    hpGrad.addColorStop(0, '#ff4444');
    hpGrad.addColorStop(1, '#ff8800');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(12, 10, 140 * hpPct, 10);
    ctx.fillStyle = '#ff4444';
    ctx.font = '9px Orbitron, monospace';
    ctx.fillText('HP', 12, 8);

    // SP meter
    const spPct = CombatEngine.getMeterPct();
    ctx.fillStyle = '#1a0030';
    ctx.fillRect(12, 24, 140, 8);
    const spGrad = ctx.createLinearGradient(12, 0, 152, 0);
    spGrad.addColorStop(0, '#8b00ff');
    spGrad.addColorStop(1, '#ff00aa');
    ctx.fillStyle = spGrad;
    ctx.shadowColor = '#ff00aa';
    ctx.shadowBlur = spPct > 0 ? 6 : 0;
    ctx.fillRect(12, 24, 140 * spPct, 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff00aa';
    ctx.font = '9px Orbitron, monospace';
    ctx.fillText('SP', 12, 22);

    // Score right side
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px Orbitron, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`⭐ ${gameState.stars || 0}   🪙 ${gameState.coins || 0}   PTS ${gameState.statusPts || 0}`, W - 12, 22);
    ctx.textAlign = 'left';

    // Combo
    const combo = CombatEngine.getCombo();
    if (combo > 1) {
      ctx.font = 'bold 28px Orbitron, monospace';
      ctx.fillStyle = '#ff00aa';
      ctx.shadowColor = '#ff00aa';
      ctx.shadowBlur = 16;
      ctx.textAlign = 'center';
      ctx.fillText(`${combo}x COMBO`, W / 2, 38);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }

    // Objective
    if (gameState.objective) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H - 30, W, 30);
      ctx.fillStyle = '#ffd700';
      ctx.font = '12px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▶ ' + gameState.objective, W / 2, H - 10);
      ctx.textAlign = 'left';
    }

    // Venue name top-center
    ctx.fillStyle = venue.colors ? (venue.colors.accent || '#ff00aa') : '#ff00aa';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 8;
    ctx.font = 'bold 13px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(venue.shortName || venue.name, W / 2, 12);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';

    // Finisher prompt
    if (gameState.finisherAvailable) {
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12;
      ctx.font = 'bold 14px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('💥 FINISHER — PRESS Y', W / 2, H - 45);
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
    }
  }

  // ──── TOP-DOWN RENDER ────
  function renderTopdown(gameState, entities, venue) {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const shake = CombatEngine.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Floor
    const floorColor = venue.colors ? venue.colors.floor : '#1a0025';
    const wallColor = venue.colors ? venue.colors.wall : '#2a0040';
    const accentColor = venue.colors ? venue.colors.accent : '#ff00aa';

    ctx.fillStyle = floorColor;
    ctx.fillRect(0, 0, W, H);

    // Floor grid subtle
    ctx.strokeStyle = accentColor + '15';
    ctx.lineWidth = 1;
    const tileSize = 50;
    const offX = -(cameraX % tileSize);
    const offY = -(cameraY % tileSize);
    for (let x = offX; x < W; x += tileSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = offY; y < H; y += tileSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Translate for camera
    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    // Walls
    if (entities.walls) entities.walls.forEach(w => {
      ctx.fillStyle = wallColor;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = accentColor + '88';
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    });

    // Props
    if (entities.props) entities.props.forEach(p => drawTopdownProp(p, accentColor));

    // Doors
    if (entities.doors) entities.doors.forEach(d => drawDoor(d, accentColor));

    // NPCs
    if (entities.npcs) entities.npcs.forEach(n => drawTopdownNPC(n));

    // Enemies
    if (entities.enemies) entities.enemies.forEach(e => {
      if (e.hp > 0) drawTopdownEnemy(e);
    });

    // Player
    if (entities.player) drawTopdownPlayer(entities.player, gameState);

    // Damage numbers
    CombatEngine.renderDamageNumbers(ctx, cameraX, cameraY);

    ctx.restore();

    // HUD
    renderTopdownHUD(gameState, entities, venue, W, H);

    if (devMode) renderDebugOverlayTopdown(entities, W, H);
    ctx.restore();
  }

  function drawTopdownPlayer(p, gameState) {
    const ch = gameState.character || window.CHARACTERS[0];
    ctx.save();
    ctx.fillStyle = ch.color || '#ff00aa';
    if (p.attacking) { ctx.shadowColor = ch.color || '#ff00aa'; ctx.shadowBlur = 16; }
    if (p.invincible) ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 60) * 0.5;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.font = `${p.w * 0.7}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch.emoji || '🎤', p.x + p.w / 2, p.y + p.h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawTopdownEnemy(e) {
    ctx.save();
    ctx.fillStyle = e.color || '#cc2200';
    if (e.attacking) { ctx.shadowColor = '#ff4444'; ctx.shadowBlur = 12; }
    ctx.fillRect(e.x, e.y, e.w, e.h);
    ctx.shadowBlur = 0;
    ctx.font = `${e.w * 0.65}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e.emoji || '👊', e.x + e.w / 2, e.y + e.h / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // HP bar
    const bx = e.x, by = e.y - 10, bw = e.w;
    ctx.fillStyle = '#330000'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = '#ff2222'; ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 5);
    if (e.isBoss) {
      ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 8;
      ctx.strokeRect(e.x - 3, e.y - 3, e.w + 6, e.h + 6);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawTopdownNPC(npc) {
    ctx.save();
    ctx.fillStyle = npc.color || '#4444aa';
    ctx.fillRect(npc.x, npc.y, npc.w || 28, npc.h || 28);
    ctx.font = `${(npc.w || 28) * 0.7}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(npc.emoji || '🧑', npc.x + (npc.w || 28) / 2, npc.y + (npc.h || 28) / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (npc.showPrompt) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Y] TALK', npc.x + (npc.w || 28) / 2, npc.y - 8);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawTopdownProp(prop, accentColor) {
    const col = propColors[prop.type] || '#444444';
    ctx.save();
    ctx.fillStyle = col;
    if (prop.glow) { ctx.shadowColor = col; ctx.shadowBlur = 10; }
    ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
    ctx.shadowBlur = 0;
    if (prop.emoji) {
      ctx.font = `${Math.min(prop.w, prop.h) * 0.6}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(prop.emoji, prop.x + prop.w / 2, prop.y + prop.h / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    if (prop.interactable && prop.showPrompt) {
      ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
      ctx.font = 'bold 10px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Y]', prop.x + prop.w / 2, prop.y - 8);
      ctx.textAlign = 'left';
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawDoor(door, accentColor) {
    ctx.save();
    ctx.fillStyle = door.locked ? '#330033' : '#220044';
    ctx.strokeStyle = door.locked ? '#660033' : accentColor;
    ctx.shadowColor = door.locked ? '#660033' : accentColor;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.fillRect(door.x, door.y, door.w, door.h);
    ctx.strokeRect(door.x, door.y, door.w, door.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = door.locked ? '#aa4444' : accentColor;
    ctx.font = '10px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(door.locked ? '🔒' : '🚪', door.x + door.w / 2, door.y + door.h / 2 + 4);
    if (door.showPrompt && !door.locked) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px Orbitron, monospace';
      ctx.fillText('[Y] ENTER', door.x + door.w / 2, door.y - 8);
    }
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function renderTopdownHUD(gameState, entities, venue, W, H) {
    const player = entities.player;
    if (!player) return;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, 44);

    const hpPct = player.hp / player.maxHp;
    ctx.fillStyle = '#330000'; ctx.fillRect(12, 10, 140, 10);
    const hpGrad = ctx.createLinearGradient(12, 0, 152, 0);
    hpGrad.addColorStop(0, '#ff4444'); hpGrad.addColorStop(1, '#ff8800');
    ctx.fillStyle = hpGrad;
    ctx.fillRect(12, 10, 140 * hpPct, 10);

    const spPct = CombatEngine.getMeterPct();
    ctx.fillStyle = '#1a0030'; ctx.fillRect(12, 24, 140, 8);
    const spGrad = ctx.createLinearGradient(12, 0, 152, 0);
    spGrad.addColorStop(0, '#8b00ff'); spGrad.addColorStop(1, '#ff00aa');
    ctx.fillStyle = spGrad;
    ctx.fillRect(12, 24, 140 * spPct, 8);

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 12px Orbitron, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`⭐ ${gameState.stars || 0}  🪙 ${gameState.coins || 0}  PTS ${gameState.statusPts || 0}`, W - 12, 22);
    ctx.textAlign = 'left';

    const accentColor = venue.colors ? venue.colors.accent : '#ff00aa';
    ctx.fillStyle = accentColor;
    ctx.shadowColor = accentColor; ctx.shadowBlur = 8;
    ctx.font = 'bold 12px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(venue.shortName || venue.name, W / 2, 12);
    ctx.shadowBlur = 0; ctx.textAlign = 'left';

    if (gameState.objective) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H - 30, W, 30);
      ctx.fillStyle = '#ffd700';
      ctx.font = '11px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▶ ' + gameState.objective, W / 2, H - 10);
      ctx.textAlign = 'left';
    }

    if (gameState.dialogBox) renderDialogBox(gameState.dialogBox, W, H);
    if (gameState.finisherAvailable) {
      ctx.fillStyle = '#ffd700'; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 12;
      ctx.font = 'bold 14px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('💥 FINISHER — PRESS Y', W / 2, H - 45);
      ctx.shadowBlur = 0; ctx.textAlign = 'left';
    }
  }

  function renderDialogBox(dialog, W, H) {
    const bw = W - 60, bh = 90, bx = 30, by = H - bh - 40;
    ctx.fillStyle = 'rgba(10,0,16,0.92)';
    ctx.strokeStyle = '#ffd700';
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 13px Orbitron, monospace';
    ctx.fillText(dialog.speaker || 'NPC', bx + 12, by + 18);

    ctx.fillStyle = '#e8d5ff';
    ctx.font = '12px Rajdhani, sans-serif';
    const words = (dialog.text || '').split(' ');
    let line = '', y = by + 36;
    words.forEach(word => {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > bw - 24) {
        ctx.fillText(line.trim(), bx + 12, y);
        line = word + ' '; y += 18;
      } else { line = test; }
    });
    ctx.fillText(line.trim(), bx + 12, y);

    ctx.fillStyle = '#ff00aa'; ctx.font = '10px Orbitron, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('[A] CONTINUE', bx + bw - 8, by + bh - 8);
    ctx.textAlign = 'left';
  }

  function renderDebugOverlay(entities, W, H) {
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    if (entities.player) {
      const p = entities.player;
      ctx.strokeRect(p.x - cameraX, p.y, p.w, p.h);
      const atk = CombatEngine.getAttackBox(p, p.facing || 1);
      ctx.strokeStyle = '#ffff00';
      ctx.strokeRect(atk.x - cameraX, atk.y, atk.w, atk.h);
    }
    if (entities.enemies) entities.enemies.forEach(e => {
      ctx.strokeStyle = '#ff0000';
      ctx.strokeRect(e.x - cameraX, e.y, e.w, e.h);
    });
    ctx.globalAlpha = 1;
  }

  function renderDebugOverlayTopdown(entities, W, H) {
    ctx.globalAlpha = 0.4;
    if (entities.walls) {
      ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1;
      entities.walls.forEach(w => ctx.strokeRect(w.x - cameraX, w.y - cameraY, w.w, w.h));
    }
    ctx.globalAlpha = 1;
  }

  function updateCamera(player, stageWidth, stageHeight, W, H) {
    if (!player) return;
    cameraX = Math.max(0, Math.min(player.x - W / 3, (stageWidth || W) - W));
    cameraY = Math.max(0, Math.min(player.y - H / 2, (stageHeight || H) - H));
  }

  function getCameraX() { return cameraX; }
  function getCameraY() { return cameraY; }
  function resetCamera() { cameraX = 0; cameraY = 0; }

  return {
    init, setDevMode, renderSidescroll, renderTopdown,
    updateCamera, getCameraX, getCameraY, resetCamera,
    renderDialogBox, drawDoor
  };
})();

'use strict';
const SceneManager = (() => {
  let canvas, ctx;
  let cameraX = 0, cameraY = 0;
  let devMode = false;

  // Pre-computed building data (deterministic, no Math.random in render)
  let _buildingCache = null;
  const BUILDING_COUNT = 12;

  function _getBuildings() {
    if (_buildingCache) return _buildingCache;
    _buildingCache = [];
    for (let i = 0; i < BUILDING_COUNT; i++) {
      const bw = 60 + ((i * 37) % 80);
      const bh = 80 + ((i * 53) % 160);
      // Pre-compute per-window lit state deterministically
      const windows = [];
      for (let wy = 0; wy < 5; wy++) {
        for (let wx = 0; wx < 3; wx++) {
          const lit = (i * 7 + wy * 3 + wx * 11) % 5 < 3;
          const gold = (i * 13 + wy * 7 + wx * 5) % 3 === 0;
          windows.push({ wy, wx, lit, gold });
        }
      }
      _buildingCache.push({ bw, bh, windows });
    }
    return _buildingCache;
  }

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

  // ──── HELPERS ────

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Draw a stylized humanoid character.
   * options: { glow, alpha, attacking, blocking, isBoss, name, atkBox }
   */
  function drawHumanoid(x, y, w, h, color, emoji, options) {
    options = options || {};
    const cx = x + w / 2;

    // Shadow ellipse on ground
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, y + h + 3, w * 0.45, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glow effect when attacking
    if (options.glow || options.attacking) {
      ctx.shadowColor = color;
      ctx.shadowBlur = options.attacking ? 24 : 12;
    }

    // Body (rounded rectangle)
    const bodyH = h * 0.55;
    const bodyY = y + h * 0.28;
    ctx.fillStyle = color;
    roundRect(ctx, x + w * 0.1, bodyY, w * 0.8, bodyH, 4);
    ctx.fill();

    // Head (circle)
    const headR = w * 0.28;
    const headY = y + headR + 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Emoji in center of body
    ctx.shadowBlur = 0;
    ctx.globalAlpha = options.alpha !== undefined ? options.alpha : 1;
    ctx.font = `${w * 0.45}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, bodyY + bodyH * 0.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // Name tag
    if (options.name) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(cx - 32, y - 18, 64, 14);
      ctx.fillStyle = color;
      ctx.font = 'bold 8px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(options.name.substring(0, 10), cx, y - 7);
      ctx.textAlign = 'left';
    }

    // Boss crown
    if (options.isBoss) {
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 10;
      ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
      ctx.shadowBlur = 0;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('👑', cx, y - 6);
      ctx.textAlign = 'left';
    }

    // Block shield
    if (options.blocking) {
      ctx.strokeStyle = '#44aaff';
      ctx.shadowColor = '#44aaff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
      ctx.shadowBlur = 0;
    }

    // Attack hitbox flash
    if (options.atkBox) {
      ctx.fillStyle = 'rgba(255,255,80,0.3)';
      ctx.strokeStyle = '#ffff44';
      ctx.lineWidth = 1;
      ctx.fillRect(options.atkBox.x, options.atkBox.y, options.atkBox.w, options.atkBox.h);
      ctx.strokeRect(options.atkBox.x, options.atkBox.y, options.atkBox.w, options.atkBox.h);
    }
  }

  // ──── SIDE-SCROLL RENDER ────
  function renderSidescroll(gameState, entities, venue) {
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    const shake = CombatEngine.getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    // Rich background
    const groundYFrac = venue.groundY || 0.75;
    const groundYPx = H * groundYFrac;
    const accentColor = (venue.colors && venue.colors.accent) || '#ff00aa';

    // 0. Real backdrop art (if uploaded) — fills the frame; vector layers below
    //    are skipped so the painted scene shows through.
    const bgImg = (typeof AssetLoader !== 'undefined' && venue.bgImage)
      ? AssetLoader.get(venue.bgImage) : null;

    if (bgImg) {
      AssetLoader.drawCover(ctx, bgImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#050008';
      ctx.fillRect(0, 0, W, H);
    }

    // World entities (with camera offset)
    ctx.save();
    ctx.translate(-cameraX, 0);

    // Props
    if (entities.props) entities.props.forEach(p => drawProp(p, H, groundYFrac));

    // NPCs
    if (entities.npcs) entities.npcs.forEach(n => drawNPC(n, H, groundYFrac));

    // Enemies
    if (entities.enemies) entities.enemies.forEach(e => {
      if (e.hp > 0) drawEnemy(e, H, groundYFrac);
    });

    // Player
    if (entities.player) drawPlayer(entities.player, H, groundYFrac, gameState);

    // Damage numbers
    if (typeof FighterEngine !== 'undefined') FighterEngine.renderDmgNumbers(ctx, cameraX, 0);
    else if (typeof CombatEngine !== 'undefined') CombatEngine.renderDamageNumbers(ctx, cameraX, 0);

    ctx.restore();

    // HUD (no camera offset)
    renderSidescrollHUD(gameState, entities, venue, W, H);

    if (devMode) renderDebugOverlay(entities, W, H);
    ctx.restore();
  }

  function drawBuildings(color, camOff, W, H, yFrac, hFrac) {
    const buildings = _getBuildings();
    const totalW = BUILDING_COUNT * 150;
    const scrolled = (camOff * 0.3) % totalW;

    buildings.forEach((b, i) => {
      const bx = (i * 150 - scrolled + totalW) % totalW - 100;
      const by = H * yFrac - b.bh;

      // Building body
      ctx.fillStyle = color;
      ctx.fillRect(bx, by, b.bw, b.bh);

      // Windows (deterministic lit state)
      b.windows.forEach(win => {
        if (!win.lit) return;
        const wCol = win.gold ? '#ffd70044' : '#ff00aa22';
        ctx.fillStyle = wCol;
        ctx.fillRect(bx + 6 + win.wx * 18, by + 10 + win.wy * 20, 12, 14);
      });
    });
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

  function _smAnimState(ent) {
    if (ent.hp <= 0) return 'ko';
    if (ent.attacking) return 'light';
    if (ent.knocked)   return 'hurt';
    if (ent.blocking)  return 'block';
    if (ent.vel && Math.abs(ent.vel.x || ent.vx || 0) > 20) return 'walk';
    return 'idle';
  }

  function _smAnimT(state) {
    const now = performance.now() / 1000;
    if (state === 'idle') return (now * 2.0) % 1;
    if (state === 'walk') return (now * 4.0) % 1;
    return (now * 3.0) % 1;
  }

  function drawPlayer(p, H, groundYFrac, gameState) {
    const ch = gameState.character || (window.CHARACTERS && window.CHARACTERS[0]) || {};
    const charId = ch.id || 1;
    const groundY = H * groundYFrac;
    const charH   = Math.min(H * 0.52, 260);

    ctx.save();
    const alpha = p.invincible ? 0.5 + Math.sin(Date.now() / 60) * 0.5 : 1;
    ctx.globalAlpha = alpha;

    const flipX = (p.facing || 1) < 0;

    // Try sprite first
    const SS = typeof SpriteSystem !== 'undefined' ? SpriteSystem : null;
    if (SS && SS.hasSprites && SS.hasSprites(charId)) {
      SS.update(charId, p, 1/60, false, null);
    }
    const drawn = SS && SS.hasSprites && SS.hasSprites(charId) &&
      SS.draw(ctx, charId, p, p.x - charH*0.28, groundY - charH, charH*0.56, charH, flipX);

    if (!drawn && typeof CharRenderer !== 'undefined') {
      const state = _smAnimState(p);
      CharRenderer.draw(ctx, charId, state, _smAnimT(state),
        p.x + charH * 0.28 * (flipX ? 1 : 0), groundY, charH, (p.facing || 1), { alpha });
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEnemy(e, H, groundYFrac) {
    const charId  = e.charId || 10;
    const groundY = H * groundYFrac;
    const charH   = Math.min(H * 0.42, 200);
    const facing  = e.facing || 1;

    ctx.save();
    const SS = typeof SpriteSystem !== 'undefined' ? SpriteSystem : null;
    if (SS && SS.hasSprites && SS.hasSprites(charId)) {
      SS.update(charId, e, 1/60, false, null);
    }
    const drawn = SS && SS.hasSprites && SS.hasSprites(charId) &&
      SS.draw(ctx, charId, e, e.x, e.y, e.w, e.h, facing < 0);

    if (!drawn && typeof CharRenderer !== 'undefined') {
      const state = _smAnimState(e);
      CharRenderer.draw(ctx, charId, state, _smAnimT(state),
        e.x + e.w * 0.5, groundY, charH, facing, {});
    }

    // HP bar above enemy
    const barW = Math.max(e.w, 50);
    const bx = e.x + e.w*0.5 - barW*0.5, by = groundY - charH - 14;
    ctx.fillStyle = '#330000'; ctx.fillRect(bx, by, barW, 5);
    ctx.fillStyle = '#ff2222'; ctx.fillRect(bx, by, barW * Math.max(0, e.hp / e.maxHp), 5);

    ctx.restore();
  }

  function drawNPC(npc, H, groundYFrac) {
    const nw = npc.w || 32;
    const nh = npc.h || 56;
    const charId  = npc.charId || 11;
    const groundY = H * groundYFrac;
    const charH   = Math.min(H * 0.38, 180);

    ctx.save();
    const SS = typeof SpriteSystem !== 'undefined' ? SpriteSystem : null;
    if (SS && SS.hasSprites && SS.hasSprites(charId)) {
      SS.update(charId, npc, 1/60, false, null);
    }
    const drawn = SS && SS.hasSprites && SS.hasSprites(charId) &&
      SS.draw(ctx, charId, npc, npc.x, npc.y, nw, nh, false);

    if (!drawn && typeof CharRenderer !== 'undefined') {
      CharRenderer.draw(ctx, charId, 'idle', _smAnimT('idle'),
        npc.x + nw*0.5, groundY, charH, 1, {});
    }

    // Interact prompt
    if (npc.showPrompt) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 11px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
      ctx.fillText('[Y] TALK', npc.x + nw * 0.5, groundY - charH - 8);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  function drawProp(prop, H, groundYFrac) {
    ctx.save();
    const col = propColors[prop.type] || '#444444';
    // Try real prop cutout first via PropRenderer
    const drawnReal = (typeof PropRenderer !== 'undefined') && prop._venue &&
      PropRenderer.drawForVenue(ctx, prop._venue, prop.type || 'prop', prop._slot || 0,
        prop.x, prop.y, prop.w, prop.h,
        prop.glow ? { glow: col, glowBlur: 12 } : {});
    if (!drawnReal) {
      // Fallback: colored rect + emoji
      ctx.fillStyle = col;
      if (prop.glow) { ctx.shadowColor = col; ctx.shadowBlur = 12; }
      ctx.fillRect(prop.x, prop.y, prop.w, prop.h);
      if (prop.emoji) {
        ctx.font = `${Math.min(prop.w, prop.h) * 0.6}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(prop.emoji, prop.x + prop.w / 2, prop.y + prop.h / 2);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }
    if (prop.interactable && prop.showPrompt) {
      ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffd700';
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

    const bgImg = (typeof AssetLoader !== 'undefined' && venue.bgImage)
      ? AssetLoader.get(venue.bgImage) : null;

    if (bgImg) {
      AssetLoader.drawCover(ctx, bgImg, 0, 0, W, H);
    } else {
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
    }

    // Translate for camera
    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    // Stage 1 specific tile rendering (skipped when painted backdrop is shown)
    if (!bgImg && venue && venue.id === 1 && typeof Stage1Scene !== 'undefined') {
      Stage1Scene.renderInside(ctx, cameraX, cameraY, W, H);
    }

    // Walls — collision only. When the real venue art is shown they stay
    // invisible (the painted scene already depicts the walls); we never draw
    // vector rectangles/lines over the uploaded background.
    if (!bgImg && entities.walls) entities.walls.forEach(w => {
      ctx.fillStyle = wallColor;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = accentColor + '88';
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    });

    // Props — when the real venue art is shown it already depicts every prop,
    // so we only surface the [Y] interaction prompt; no vector boxes are drawn.
    if (entities.props) entities.props.forEach(p => drawTopdownProp(p, accentColor, !!bgImg));

    // Doors — same: real art shows the doorway; draw prompt only over real art.
    if (entities.doors) entities.doors.forEach(d => drawDoor(d, accentColor, !!bgImg));

    // NPCs
    if (entities.npcs) entities.npcs.forEach(n => drawTopdownNPC(n));

    // Enemies
    if (entities.enemies) entities.enemies.forEach(e => {
      if (e.hp > 0) drawTopdownEnemy(e);
    });

    // Player
    if (entities.player) drawTopdownPlayer(entities.player, gameState);

    // Damage numbers
    if (typeof FighterEngine !== 'undefined') FighterEngine.renderDmgNumbers(ctx, cameraX, cameraY);
    else if (typeof CombatEngine !== 'undefined') CombatEngine.renderDamageNumbers(ctx, cameraX, cameraY);

    ctx.restore();

    // HUD
    renderTopdownHUD(gameState, entities, venue, W, H);

    if (devMode) renderDebugOverlayTopdown(entities, W, H);
    ctx.restore();
  }

  function drawTopdownPlayer(p, gameState) {
    const ch = gameState.character || window.CHARACTERS[0];
    const color = ch.color || '#ff00aa';
    const emoji = ch.emoji || '🎤';
    const charId = ch.id || 12;

    ctx.save();
    const alpha = p.invincible ? 0.5 + Math.sin(Date.now() / 60) * 0.5 : 1;
    ctx.globalAlpha = alpha;
    const flipX = (p.lastDir && p.lastDir.x < 0);
    if (typeof SpriteSystem !== 'undefined') {
      const lastDir = p.lastDir ? (Math.abs(p.lastDir.x) > Math.abs(p.lastDir.y)
        ? (p.lastDir.x > 0 ? 'e' : 'w') : (p.lastDir.y > 0 ? 's' : 'n')) : 's';
      SpriteSystem.update(charId, p, 1/60, true, lastDir);
      SpriteSystem.draw(ctx, charId, p, p.x, p.y, p.w, p.h, flipX);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawTopdownEnemy(e) {
    const color = e.color || '#cc2200';
    const emoji = e.emoji || '👊';
    const charId = e.charId || null;

    ctx.save();
    if (charId && typeof SpriteSystem !== 'undefined') {
      SpriteSystem.update(charId, e, 1/60, true, 's');
      SpriteSystem.draw(ctx, charId, e, e.x, e.y, e.w, e.h, (e.facing || 1) < 0);
    }

    // HP bar
    const bx = e.x, by = e.y - 10, bw = e.w;
    ctx.fillStyle = '#330000'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = '#ff2222'; ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), 5);

    ctx.restore();
  }

  function drawTopdownNPC(npc) {
    const color = npc.color || '#4444aa';
    const emoji = npc.emoji || '🧑';
    const nw = npc.w || 28;
    const nh = npc.h || 28;
    const charId = npc.charId || null;

    ctx.save();
    if (charId && typeof SpriteSystem !== 'undefined') {
      SpriteSystem.update(charId, npc, 1/60, true, 's');
      SpriteSystem.draw(ctx, charId, npc, npc.x, npc.y, nw, nh, false);
    }

    if (npc.showPrompt) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 10px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('[Y] TALK', npc.x + nw / 2, npc.y - 22);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawTopdownProp(prop, accentColor, hasBg) {
    const col = propColors[prop.type] || '#444444';
    ctx.save();
    // Try real prop cutout; always try even over bg art (they're transparent PNGs)
    const drawnReal = (typeof PropRenderer !== 'undefined') && prop._venue &&
      PropRenderer.drawForVenue(ctx, prop._venue, prop.type || 'prop', prop._slot || 0,
        prop.x, prop.y, prop.w, prop.h,
        prop.glow ? { glow: col, glowBlur: 10 } : {});
    if (!drawnReal && !hasBg) {
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

  function drawDoor(door, accentColor, hasBg) {
    ctx.save();
    // Over real venue art the doorway is painted into the scene — skip the
    // vector box and show only the lock/enter prompt.
    if (!hasBg) {
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
    }
    if (door.showPrompt && !door.locked) {
      ctx.fillStyle = '#ffd700'; ctx.font = 'bold 10px Orbitron, monospace';
      ctx.textAlign = 'center';
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

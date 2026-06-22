'use strict';
/**
 * Stage 1 Scene — HITMANS VIP AFTER SPOT / CAFE 8 FIFTY
 * Defines the full outside (sidescroll) and inside (topdown) layouts.
 * All asset paths reference assets/venues/stage1/outside/ and inside/.
 * Images are lazy-loaded; render functions gracefully fall back to
 * colored rectangles when images are not yet ready.
 */
const Stage1Scene = (() => {
  const OUT = 'assets/venues/stage1/outside/';
  const IN  = 'assets/venues/stage1/inside/';

  // ── OUTSIDE ─────────────────────────────────────────────────────────────
  const OUTSIDE = {
    worldWidth: 3200,
    groundY: 0.72,
    charHeight: 96,

    bgLayers: [
      { key:'sky',     src: OUT+'moon_cloud_sky_panel.png',  parallax:0.05, y:0,    h:0.65 },
      { key:'skyline', src: OUT+'city_skyline_panel.png',    parallax:0.15, y:0.30, h:0.42 },
    ],

    facadeParts: [
      { key:'facade_left',   src: OUT+'facade_left_wing.png',         wx: 660, wyF:0.12, ww:320, whF:0.62 },
      { key:'facade_center', src: OUT+'cafe8fifty_facade_center.png', wx: 960, wyF:0.06, ww:780, whF:0.70 },
      { key:'facade_right',  src: OUT+'facade_right_wing.png',        wx:1720, wyF:0.12, ww:360, whF:0.62 },
    ],

    groundTiles: [
      { key:'asphalt',   src: OUT+'asphalt_tile.png',   x:   0, y:0.77, w:3200, h:0.23, tileW:128 },
      { key:'sidewalk',  src: OUT+'sidewalk_tile.png',  x: 480, y:0.72, w:1700, h:0.06, tileW:128 },
      { key:'curb',      src: OUT+'curb_tile.png',      x: 480, y:0.70, w:1700, h:0.03, tileW: 64 },
      { key:'entry_rug', src: OUT+'entry_rug_850.png',  x:1165, y:0.68, w: 220, h:0.05, tileW:220 },
    ],

    props: [
      // Far-left: street furniture
      { key:'streetlamp_l',        src:OUT+'streetlamp.png',               wx:  55, wyF:0.72, ww: 38, wh:118, colW:14 },
      { key:'tally_row_sign',      src:OUT+'tally_row_street_sign.png',    wx: 115, wyF:0.72, ww: 68, wh: 88 },
      { key:'cafe8fifty_signboard',src:OUT+'cafe8fifty_side_signboard.png',wx: 200, wyF:0.72, ww: 88, wh:128, colW:20 },
      { key:'trashcan_l',          src:OUT+'trashcan.png',                 wx: 340, wyF:0.72, ww: 36, wh: 48, colW:36 },
      { key:'fire_hydrant',        src:OUT+'fire_hydrant.png',             wx: 415, wyF:0.72, ww: 28, wh: 36, colW:28 },
      { key:'parking_litter',      src:OUT+'parking_lot_litter_set.png',  wx: 270, wyF:0.80, ww: 80, wh: 32 },
      // Left fence run
      { key:'fence_l1',  src:OUT+'fence_straight.png', wx: 490, wyF:0.73, ww:120, wh: 52, colW:120, colH:52 },
      { key:'fence_l2',  src:OUT+'fence_straight.png', wx: 610, wyF:0.73, ww:120, wh: 52, colW:120, colH:52 },
      // Entry / facade area
      { key:'neon_eight_sign',     src:OUT+'neon_eight_sign.png',         wx: 760, wyF:0.44, ww:100, wh:130 },
      { key:'hedge_planter_l',     src:OUT+'hedge_planter_straight.png',  wx: 800, wyF:0.72, ww:110, wh: 50, colW:110, colH:50 },
      { key:'stanchion_l1',        src:OUT+'red_rope_stanchion.png',      wx: 890, wyF:0.72, ww: 48, wh: 66, colW:18 },
      { key:'fsu_famu_flyer_a',    src:OUT+'fsu_famu_flyer_a.png',        wx: 975, wyF:0.54, ww: 80, wh:108 },
      { key:'vip_entry_sign',      src:OUT+'vip_entry_sign.png',          wx:1080, wyF:0.60, ww: 78, wh: 78 },
      { key:'stanchion_l2',        src:OUT+'red_rope_stanchion.png',      wx:1140, wyF:0.72, ww: 48, wh: 66, colW:18 },
      { key:'stanchion_r1',        src:OUT+'red_rope_stanchion.png',      wx:1280, wyF:0.72, ww: 48, wh: 66, colW:18 },
      { key:'hitmans_promo_sign',  src:OUT+'hitmans_vip_after_spot_promo_sign.png', wx:1355, wyF:0.53, ww: 88, wh:118 },
      { key:'hedge_planter_r',     src:OUT+'hedge_planter_straight.png',  wx:1420, wyF:0.72, ww:110, wh: 50, colW:110, colH:50 },
      { key:'stanchion_r2',        src:OUT+'red_rope_stanchion.png',      wx:1530, wyF:0.72, ww: 48, wh: 66, colW:18 },
      // Right side: VIP tent + smoker area
      { key:'potted_plant_l',  src:OUT+'potted_plant.png',        wx:1590, wyF:0.72, ww: 44, wh: 62, colW:32 },
      { key:'tent_open',       src:OUT+'tent_frame_open.png',     wx:1630, wyF:0.20, ww:320, wh:290, colW:320, obstacle:true },
      { key:'round_table_1',   src:OUT+'round_cafe_table.png',    wx:1680, wyF:0.72, ww: 50, wh: 58, colW:40 },
      { key:'folding_chair_1', src:OUT+'folding_chair.png',       wx:1750, wyF:0.72, ww: 28, wh: 42, colW:20 },
      { key:'smoker_grill',    src:OUT+'smoker_grill.png',        wx:1820, wyF:0.67, ww: 90, wh: 90, colW:90, hazard:true, hazardDmg:5 },
      { key:'grill_smoke',     src:OUT+'grill_smoke_vfx.png',     wx:1800, wyF:0.50, ww: 80, wh: 80, alpha:0.65 },
      { key:'safety_cone_1',   src:OUT+'safety_cone.png',         wx:1940, wyF:0.72, ww: 28, wh: 36, colW:28 },
      { key:'no_parking_sign', src:OUT+'no_parking_sign.png',     wx:2020, wyF:0.60, ww: 50, wh: 78 },
      { key:'streetlamp_r',    src:OUT+'streetlamp.png',          wx:2140, wyF:0.72, ww: 38, wh:118, colW:14 },
      { key:'poster_lit',      src:OUT+'poster_frame_lit.png',    wx:2200, wyF:0.48, ww: 78, wh:108 },
      { key:'fence_r1',        src:OUT+'fence_straight.png',      wx:2250, wyF:0.73, ww:120, wh: 52, colW:120, colH:52 },
      { key:'fence_corner_r',  src:OUT+'fence_corner.png',        wx:2370, wyF:0.73, ww: 58, wh: 52, colW:58 },
      // Spotlight beam (ambient VFX)
      { key:'spotlight_l',     src:OUT+'spotlight_beam.png',      wx: 980, wyF:0.25, ww:120, wh:280, alpha:0.35 },
      { key:'spotlight_r',     src:OUT+'spotlight_beam.png',      wx:1350, wyF:0.25, ww:120, wh:280, alpha:0.35 },
    ],

    interactables: [
      {
        key:'front_door',
        src: OUT+'front_double_door.png',
        wx:1175, wyF:0.24, ww:190, wh:220,
        colW:190,
        promptText:'ENTER CAFE 8 FIFTY  [Y]',
        action:'enter_venue',
      }
    ],

    enemySpawns: [
      { wx: 640,  wave:0, type:'bouncer',  facing:-1 },
      { wx:1060,  wave:0, type:'enforcer', facing:-1 },
      { wx:1880,  wave:1, type:'bouncer',  facing:-1 },
      { wx:2020,  wave:1, type:'enforcer', facing:-1 },
    ],

    hazardZones: [
      { x:1810, yF:0.58, w:100, hF:0.16, dmgPerSec:10, label:'grill_heat' },
    ],

    walls: [
      { x:0,    w:50  },
      { x:3150, w:50  },
    ],

    playerStart: { wx:150, wyF:0.72 },
  };

  // ── INSIDE ───────────────────────────────────────────────────────────────
  const TILE = 64;
  const COLS = 32;
  const ROWS = 24;

  // 0=open floor  1=wall  2=dance_floor  3=hallway_floor
  const TILE_MAP = [
    '11111111111111111111111111111111',
    '10000000000000000000000000000001',
    '10000000000002222222222220000001',
    '10011100000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000022222222222222200001',
    '10010000000000000000000000000001',
    '10010000000000000000000000000001',
    '10010000000000000000000000000001',
    '13333333333000000000000000000001',
    '10000000000000000000000000000001',
    '11111111111111111111111111111111',
  ];

  const INSIDE = {
    tileSize: TILE,
    cols: COLS,
    rows: ROWS,
    tileMap: TILE_MAP,

    tileSrcs: {
      '0': IN+'hallway_floor_tile.png',
      '2': IN+'dance_floor_tile.png',
      '3': IN+'hallway_floor_tile.png',
    },
    wallSrc:       IN+'black_brick_wall_straight.png',
    wallCornerSrc: IN+'black_brick_wall_corner.png',
    floorEdgeSrc:  IN+'floor_edge_trim.png',

    objects: [
      // Header sign
      { key:'main_neon_sign',  src:IN+'main_neon_sign_hitmans_vip_after_spot.png', col:10, row:0, w:12*TILE, h:2*TILE, zIndex:10 },
      { key:'flatscreen_l',    src:IN+'flatscreen_wall_panel.png',    col:3,  row:1, w:3*TILE, h:2*TILE },
      { key:'flatscreen_r',    src:IN+'flatscreen_corner_set.png',    col:27, row:1, w:3*TILE, h:2*TILE },

      // Bar area
      { key:'wall_counter_l',     src:IN+'long_marble_counter_straight.png', col:4, row:3,  w:5*TILE, h:TILE,   solid:true },
      { key:'wall_counter_corner',src:IN+'long_marble_counter_corner.png',   col:9, row:3,  w:TILE,   h:TILE,   solid:true },
      { key:'wall_counter_end',   src:IN+'long_marble_counter_end.png',      col:9, row:4,  w:TILE,   h:TILE,   solid:true },
      { key:'bar_window_frame',   src:IN+'bar_window_frame.png',             col:4, row:4,  w:5*TILE, h:2*TILE, solid:true },
      { key:'backbar_shelf',      src:IN+'backbar_shelf.png',                col:4, row:6,  w:6*TILE, h:2*TILE, solid:true },
      { key:'bar_bottle_display', src:IN+'bar_bottle_display.png',           col:4, row:8,  w:6*TILE, h:TILE,   solid:true },
      { key:'bar_win_counter',    src:IN+'bar_window_counter_straight.png',  col:4, row:12, w:4*TILE, h:TILE,   solid:true, interactable:true, interactKey:'bar' },
      { key:'bar_win_counter_end',src:IN+'bar_window_counter_end.png',       col:8, row:12, w:TILE,   h:TILE,   solid:true },
      { key:'stool_1',  src:IN+'stool_front.png', col:5,  row:10, w:TILE, h:TILE },
      { key:'stool_2',  src:IN+'stool_front.png', col:6,  row:10, w:TILE, h:TILE },
      { key:'stool_3',  src:IN+'stool_front.png', col:7,  row:10, w:TILE, h:TILE },
      { key:'stool_4',  src:IN+'stool_side.png',  col:8,  row:10, w:TILE, h:TILE },

      // DJ Booth & VIP Lounge (bottom-left)
      { key:'dj_booth',     src:IN+'dj_booth_main.png',    col:4,  row:14, w:4*TILE, h:3*TILE, solid:true },
      { key:'dj_equipment', src:IN+'dj_equipment_set.png', col:5,  row:14, w:3*TILE, h:TILE },
      { key:'speaker_l',    src:IN+'speaker_stack.png',    col:3,  row:14, w:TILE,   h:2*TILE, solid:true },
      { key:'speaker_r',    src:IN+'speaker_stack.png',    col:9,  row:14, w:TILE,   h:2*TILE, solid:true },
      { key:'vip_couch',    src:IN+'vip_lounge_couch.png', col:3,  row:18, w:6*TILE, h:2*TILE, solid:true },

      // VIP Section (right)
      { key:'vip_crown',         src:IN+'vip_crown_panel.png',      col:26, row:1,  w:4*TILE, h:TILE },
      { key:'vip_rope_top',      src:IN+'vip_rope_straight.png',    col:22, row:5,  w:5*TILE, h:TILE },
      { key:'vip_rope_corner_tl',src:IN+'vip_rope_corner.png',      col:27, row:5,  w:TILE,   h:TILE },
      { key:'vip_rope_side_r',   src:IN+'vip_rope_straight.png',    col:27, row:6,  w:TILE,   h:6*TILE },
      { key:'vip_rope_corner_br',src:IN+'vip_rope_corner.png',      col:27, row:12, w:TILE,   h:TILE },
      { key:'vip_rope_bottom',   src:IN+'vip_rope_straight.png',    col:22, row:12, w:5*TILE, h:TILE },
      { key:'stanchion_vip_1',   src:IN+'gold_stanchion.png',       col:22, row:5,  w:TILE,   h:TILE },
      { key:'stanchion_vip_2',   src:IN+'gold_stanchion.png',       col:27, row:5,  w:TILE,   h:TILE },
      { key:'stanchion_vip_3',   src:IN+'gold_stanchion.png',       col:27, row:12, w:TILE,   h:TILE },
      { key:'stanchion_vip_4',   src:IN+'gold_stanchion.png',       col:22, row:12, w:TILE,   h:TILE },
      { key:'vip_table_1',       src:IN+'vip_lounge_table.png',     col:23, row:7,  w:2*TILE, h:2*TILE },
      { key:'vip_table_2',       src:IN+'vip_lounge_table.png',     col:24, row:13, w:2*TILE, h:2*TILE },
      { key:'vip_couch_vip',     src:IN+'vip_lounge_couch.png',     col:23, row:6,  w:3*TILE, h:TILE, solid:true },
      { key:'vip_platform',      src:IN+'vip_l_corner_platform.png',col:28, row:13, w:3*TILE, h:3*TILE },

      // Bathrooms (far left)
      { key:'bathroom_shell', src:IN+'bathroom_room_shell.png',   col:0, row:7,  w:4*TILE, h:6*TILE, solid:true },
      { key:'door_ladies',    src:IN+'bathroom_door_ladies.png',  col:1, row:10, w:TILE,   h:2*TILE, solid:true },
      { key:'door_gents',     src:IN+'bathroom_door_gents.png',   col:2, row:10, w:TILE,   h:2*TILE, solid:true },

      // Entry (bottom-right)
      { key:'entry_door_inner',src:IN+'entry_door_inner.png',     col:27, row:21, w:2*TILE, h:2*TILE, solid:true },

      // Back exit (far right)
      { key:'back_exit_door', src:IN+'back_exit_door.png',        col:30, row:7,  w:2*TILE, h:3*TILE, solid:true },
      { key:'back_exit_sign', src:IN+'wall_poster_frame.png',     col:29, row:5,  w:2*TILE, h:2*TILE },

      // Ambient VFX + lighting
      { key:'purple_smoke_1',  src:IN+'purple_smoke_vfx.png',    col:16, row:3,  w:2*TILE, h:2*TILE, alpha:0.50 },
      { key:'purple_smoke_2',  src:IN+'purple_smoke_vfx.png',    col:10, row:17, w:2*TILE, h:2*TILE, alpha:0.35 },
      { key:'red_light_1',     src:IN+'red_ambient_light.png',   col:11, row:3,  w:TILE,   h:TILE },
      { key:'red_light_2',     src:IN+'red_ambient_light.png',   col:21, row:3,  w:TILE,   h:TILE },
      { key:'gold_spot_1',     src:IN+'gold_spotlight.png',      col:6,  row:3,  w:TILE,   h:TILE },
      { key:'gold_spot_2',     src:IN+'gold_spotlight.png',      col:26, row:3,  w:TILE,   h:TILE },

      // Plants & misc
      { key:'plant_1', src:IN+'potted_plant.png', col:2,  row:5,  w:TILE, h:TILE },
      { key:'plant_2', src:IN+'potted_plant.png', col:11, row:19, w:TILE, h:TILE },
      { key:'plant_3', src:IN+'potted_plant.png', col:21, row:19, w:TILE, h:TILE },
      { key:'plant_4', src:IN+'potted_plant.png', col:29, row:19, w:TILE, h:TILE },
      { key:'room_divider',src:IN+'small_room_divider.png', col:10, row:19, w:2*TILE, h:TILE, solid:true },
    ],

    npcs: [
      { id:'bartender',   col:8,  row:11, name:'Bartender',   emoji:'🍸', color:'#553311', dialog:['VIP members order first.', 'What can I get you?', 'You need your card.'] },
      { id:'dj',          col:6,  row:15, name:'DJ Hitman',   emoji:'🎧', color:'#330066', dialog:['The vibe is everything.', 'Request list is closed.', 'Members get the good tracks.'] },
      { id:'vip_security',col:22, row:8,  name:'VIP Security',emoji:'🔒', color:'#222233', dialog:['VIP access required.', 'Members only past this point.', 'Show your status.'], blocking:true },
      { id:'npc_dancer_1',col:17, row:9,  name:'Partygoer',   emoji:'💃', color:'#550033', patrol:[{col:17,row:9},{col:19,row:9},{col:19,row:11},{col:17,row:11}], dialog:['This place goes hard.','Hitman throws the best events.'] },
      { id:'npc_crowd_2', col:19, row:12, name:'Partygoer',   emoji:'🕺', color:'#003355', patrol:[{col:19,row:12},{col:20,row:14},{col:18,row:14}], dialog:["You here for grad night?","FSU section is that way."] },
    ],

    enemyZones: [
      {
        id:'zone_1_bar',
        label:'BARTENDER / BRAWLER CHALLENGE',
        triggerCol:7, triggerRow:12, triggerW:4, triggerH:3,
        enemies:[
          { type:'bartender_brawler', col:9,  row:11, hp:80,  dmg:12 },
          { type:'enforcer',          col:10, row:13, hp:100, dmg:15 },
        ]
      },
      {
        id:'zone_2_floor',
        label:'DEALER / BODYGUARD CHALLENGE',
        triggerCol:13, triggerRow:14, triggerW:6, triggerH:5,
        enemies:[
          { type:'dealer',    col:15, row:16, hp:70,  dmg:10 },
          { type:'bodyguard', col:17, row:14, hp:120, dmg:18 },
        ]
      },
    ],

    interactables: [
      { key:'bar',         col:4,  row:12, w:5, h:2, promptText:'ORDER DRINK  [Y]',    action:'dialog_npc', npcId:'bartender' },
      { key:'dj_area',     col:3,  row:14, w:7, h:4, promptText:'REQUEST TRACK  [Y]',  action:'dialog_npc', npcId:'dj' },
      { key:'vip_section', col:22, row:5,  w:6, h:8, promptText:'VIP ACCESS  [Y]',     action:'check_vip' },
      { key:'dance_floor', col:12, row:6,  w:12,h:8, promptText:'HIT THE FLOOR  [Y]',  action:'dance_minigame' },
      { key:'back_exit',   col:30, row:7,  w:2, h:3, promptText:'BACK EXIT  [Y]',      action:'exit_back' },
    ],

    playerEntry: { col:27, row:20 },
    backExit:    { col:30, row:8 },
  };

  // ── Image cache ─────────────────────────────────────────────────────────
  const _cache = {};
  function _img(src) {
    if (_cache[src]) return _cache[src];
    const img = new Image();
    img.onload  = () => { img._ready = true; };
    img.onerror = () => { img._failed = true; };
    img.src = src;
    _cache[src] = img;
    return img;
  }

  function preloadOutside() {
    OUTSIDE.bgLayers.forEach(l => _img(l.src));
    OUTSIDE.facadeParts.forEach(p => _img(p.src));
    OUTSIDE.groundTiles.forEach(g => _img(g.src));
    OUTSIDE.props.forEach(p => _img(p.src));
    OUTSIDE.interactables.forEach(i => _img(i.src));
  }

  function preloadInside() {
    Object.values(INSIDE.tileSrcs).forEach(s => _img(s));
    _img(INSIDE.wallSrc);
    INSIDE.objects.forEach(o => _img(o.src));
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  function _drawImageOrFallback(ctx, src, dx, dy, dw, dh, fallbackColor, label, alpha) {
    const img = _img(src);
    if (img._ready && !img._failed) {
      if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = alpha;
      ctx.drawImage(img, dx, dy, dw, dh);
      if (alpha !== undefined && alpha !== 1) ctx.globalAlpha = 1;
    } else if (!img._failed) {
      // Still loading — draw placeholder
      ctx.fillStyle = fallbackColor || '#1e0035';
      ctx.fillRect(dx, dy, dw, dh);
    }
    // _failed: render nothing (transparent gap is fine)
  }

  // ── Render outside (call from inside cameraX-translated context) ─────────
  function renderOutside(ctx, cameraX, canvasW, canvasH) {
    const gY = OUTSIDE.groundY;

    // BG layers (parallax, full canvas width)
    OUTSIDE.bgLayers.forEach(layer => {
      const img = _img(layer.src);
      const px = -(cameraX * layer.parallax);
      const py = layer.y * canvasH;
      const ph = layer.h * canvasH;
      if (img._ready) {
        const iw = img.width || canvasW;
        const numTiles = Math.ceil((canvasW + Math.abs(px)) / iw) + 2;
        const startT   = Math.floor(-Math.abs(px) / iw) - 1;
        for (let t = startT; t <= startT + numTiles; t++) {
          ctx.drawImage(img, px + t * iw, py, iw, ph);
        }
      }
    });

    // Facade parts (parallax 0.5, relative to world)
    OUTSIDE.facadeParts.forEach(part => {
      const drawX = part.wx - cameraX * 0.5;
      const drawY = part.wyF * canvasH;
      const drawH = part.whF * canvasH;
      if (drawX + part.ww < -100 || drawX > canvasW + 100) return;
      _drawImageOrFallback(ctx, part.src, drawX, drawY, part.ww, drawH, '#0d001a');
    });

    // Ground tiles
    OUTSIDE.groundTiles.forEach(g => {
      const img = _img(g.src);
      const drawY = g.y * canvasH;
      const drawH = g.h * canvasH;
      const tileW = g.tileW || 128;
      if (img._ready) {
        const firstT = Math.max(0, Math.floor((cameraX - g.x) / tileW));
        const lastT  = Math.ceil((cameraX + canvasW - g.x) / tileW) + 1;
        for (let t = firstT; t <= lastT; t++) {
          const tx = g.x + t * tileW - cameraX;
          if (tx + tileW < 0 || tx > canvasW) continue;
          if (g.x + t * tileW > g.x + g.w) break;
          ctx.drawImage(img, tx, drawY, tileW, drawH);
        }
      } else {
        ctx.fillStyle = g.key === 'sidewalk' ? '#2a2035' : '#1a1828';
        ctx.fillRect(Math.max(0, g.x - cameraX), drawY, Math.min(canvasW, g.w), drawH);
      }
    });

    // Props (sorted by wyF for depth order)
    const allProps = [...OUTSIDE.props, ...OUTSIDE.interactables]
      .sort((a, b) => (a.wyF || 0.72) - (b.wyF || 0.72));

    allProps.forEach(prop => {
      const drawX = prop.wx - cameraX;
      const drawY = (prop.wyF || 0.72) * canvasH - prop.wh;
      if (drawX + prop.ww < -60 || drawX > canvasW + 60) return;
      _drawImageOrFallback(
        ctx, prop.src, drawX, drawY, prop.ww, prop.wh,
        prop.hazard ? '#5a1800' : prop.obstacle ? '#223344' : '#2a1540',
        prop.key, prop.alpha
      );
    });
  }

  // ── Render inside ────────────────────────────────────────────────────────
  function renderInside(ctx, cameraX, cameraY, canvasW, canvasH) {
    const ts = INSIDE.tileSize;

    // Floor tiles
    for (let r = 0; r < INSIDE.rows; r++) {
      for (let c = 0; c < INSIDE.cols; c++) {
        const tileChar = INSIDE.tileMap[r] ? (INSIDE.tileMap[r][c] || '0') : '0';
        const px = c * ts - cameraX;
        const py = r * ts - cameraY;
        if (px + ts < 0 || px > canvasW || py + ts < 0 || py > canvasH) continue;

        if (tileChar === '1') {
          const wImg = _img(INSIDE.wallSrc);
          if (wImg._ready) {
            ctx.drawImage(wImg, px, py, ts, ts);
          } else {
            ctx.fillStyle = '#0d0018';
            ctx.fillRect(px, py, ts, ts);
            ctx.strokeStyle = '#ffd70033';
            ctx.lineWidth = 1;
            ctx.strokeRect(px, py, ts, ts);
          }
        } else {
          const tileSrc = INSIDE.tileSrcs[tileChar] || INSIDE.tileSrcs['0'];
          const tImg = _img(tileSrc);
          if (tImg._ready) {
            ctx.drawImage(tImg, px, py, ts, ts);
          } else {
            ctx.fillStyle = tileChar === '2' ? '#1a0040' : '#12001e';
            ctx.fillRect(px, py, ts, ts);
            if (tileChar === '2') {
              ctx.strokeStyle = '#ff00aa18';
              ctx.lineWidth = 1;
              ctx.strokeRect(px, py, ts, ts);
            }
          }
        }
      }
    }

    // Objects sorted by row (painter's algorithm)
    INSIDE.objects
      .slice()
      .sort((a, b) => a.row - b.row)
      .forEach(obj => {
        const px = obj.col * ts - cameraX;
        const py = obj.row * ts - cameraY;
        if (px + obj.w < -100 || px > canvasW + 100) return;
        if (py + obj.h < -100 || py > canvasH + 100) return;
        _drawImageOrFallback(ctx, obj.src, px, py, obj.w, obj.h, '#1e0035', obj.key, obj.alpha);
      });
  }

  // ── Query helpers ────────────────────────────────────────────────────────
  function isInsideWall(col, row) {
    if (row < 0 || row >= INSIDE.rows || col < 0 || col >= INSIDE.cols) return true;
    const row_str = INSIDE.tileMap[row];
    return !row_str || row_str[col] === '1';
  }

  function getInsideInteractableAt(col, row) {
    return INSIDE.interactables.find(i =>
      col >= i.col && col < i.col + (i.w || 1) &&
      row >= i.row && row < i.row + (i.h || 1)
    ) || null;
  }

  function getOutsideInteractableAt(worldX) {
    return OUTSIDE.interactables.find(i =>
      worldX >= i.wx && worldX <= i.wx + (i.colW || i.ww)
    ) || null;
  }

  function getOutsideHazardAt(worldX, yFrac) {
    return OUTSIDE.hazardZones.find(h =>
      worldX >= h.x && worldX <= h.x + h.w &&
      yFrac  >= h.yF && yFrac  <= h.yF + h.hF
    ) || null;
  }

  function getInsideEnemyZoneTrigger(col, row) {
    return INSIDE.enemyZones.find(z =>
      col >= z.triggerCol && col < z.triggerCol + z.triggerW &&
      row >= z.triggerRow && row < z.triggerRow + z.triggerH
    ) || null;
  }

  return {
    OUTSIDE, INSIDE,
    preloadOutside, preloadInside,
    renderOutside, renderInside,
    isInsideWall,
    getInsideInteractableAt,
    getOutsideInteractableAt,
    getOutsideHazardAt,
    getInsideEnemyZoneTrigger,
  };
})();

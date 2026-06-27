'use strict';
const SpriteSystem = (() => {
  const FRAMES_PER_ROW = 8;
  const SHEET_ROWS = { loco:6, combat:5, damage:5, supers:4, topdown:8, vfx:8 };

  // Map charId → folder name under assets/characters/frames/
  const CHAR_FOLDERS = {
    1:'creator', 2:'dj', 3:'famu_female', 4:'famu_male',
    5:'influencer', 6:'photographer', 7:'promoter', 8:'dancer',
    9:'vendor', 10:'security', 11:'host',
    12:'fsu_female', 13:'fsu_male',
    20:'kt', 21:'bigsoulja', 22:'eld',
    30:'pete', 31:'snow',
  };
  const FRAMES_BASE = 'assets/characters/frames/';

  // ── Image cache ──────────────────────────────────────────────────────────
  const _cache = {};
  function _img(src) {
    if (_cache[src]) return _cache[src];
    const img = new Image();
    img._ready = false; img._failed = false;
    img.onload  = () => { img._ready  = true; };
    img.onerror = () => { img._failed = true; };
    img.src = src;
    _cache[src] = img;
    return img;
  }

  // Load a pre-sliced BGRA frame (transparent PNG with alpha mask + autocrop).
  // Path: assets/characters/frames/<folder>/<type>/r<RR>_f<CC>.png
  function _frame(charId, type, row, col) {
    const folder = CHAR_FOLDERS[charId];
    if (!folder) return null;
    const r = String(row).padStart(2, '0');
    const c = String(col).padStart(2, '0');
    return _img(`${FRAMES_BASE}${folder}/${type}/r${r}_f${c}.png`);
  }

  // Draw one pre-sliced frame onto ctx, scaled to fit dw×dh.
  // Returns true if the image was ready and drawn.
  function _drawFrame(ctx, charId, type, row, col, dx, dy, dw, dh, flipX) {
    const img = _frame(charId, type, row, col);
    if (!img || !img._ready || img._failed) return false;
    ctx.save();
    if (flipX) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  // Preload a range of frames for a character type.
  function _preloadFrames(charId, type, rows) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < FRAMES_PER_ROW; c++) _frame(charId, type, r, c);
    }
  }

  // ── Character definitions ────────────────────────────────────────────────
  // startup/active/recovery = frame counts for combat moves
  // superFlash = triggers MvC-style screen flash when activated
  const CHAR_DEFS = {
    // ── CREATOR (id:1) ───────────────────────────────────────────────────────
    1: {
      sheets: {
        loco:   'assets/characters/creator_sheet01_loco.png',
        combat: 'assets/characters/creator_sheet02_combat.png',
        damage: 'assets/characters/creator_sheet03_damage.png',
        supers: 'assets/characters/creator_sheet04_supers.png',
        topdown:'assets/characters/creator_sheet05_topdown.png',
        vfx:    'assets/characters/creator_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_soundwave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── DJ (id:2) ─────────────────────────────────────────────────────────────
    2: {
      sheets: {
        loco:   'assets/characters/dj_sheet01_loco.png',
        combat: 'assets/characters/dj_sheet02_combat.png',
        damage: 'assets/characters/dj_sheet03_damage.png',
        supers: 'assets/characters/dj_sheet04_supers.png',
        topdown:'assets/characters/dj_sheet05_topdown.png',
        vfx:    'assets/characters/dj_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:5,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_basswave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },
    13: {
      sheets: {
        loco:'assets/characters/fsu_female_sheet01_loco.png',
        combat:'assets/characters/fsu_female_sheet02_combat.png',
        damage:'assets/characters/fsu_female_sheet03_damage.png',
        supers:'assets/characters/fsu_female_sheet04_supers.png',
        topdown:'assets/characters/fsu_female_sheet05_topdown.png',
        vfx:'assets/characters/fsu_female_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:18,loop:false,startup:4,active:2,recovery:2},
        combo3:{sheet:'combat',row:2,frames:8,fps:16,loop:false,startup:5,active:2,recovery:1},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:6,active:3,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:8,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_arc:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_burst:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },
    12: {
      sheets: {
        loco:'assets/characters/fsu_male_sheet01_loco.png',
        combat:'assets/characters/fsu_male_sheet02_combat.png',
        damage:'assets/characters/fsu_male_sheet03_damage.png',
        supers:'assets/characters/fsu_male_sheet04_supers.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:18,loop:false,startup:4,active:2,recovery:2},
        combo3:{sheet:'combat',row:2,frames:8,fps:16,loop:false,startup:5,active:2,recovery:1},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:6,active:3,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:8,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
      }
    },
    3: {
      sheets: {
        loco:'assets/characters/famu_female_sheet01_loco.png',
        combat:'assets/characters/famu_female_sheet02_combat.png',
        damage:'assets/characters/famu_female_sheet03_damage.png',
        supers:'assets/characters/famu_female_sheet04_supers.png',
        topdown:'assets/characters/famu_female_sheet05_topdown.png',
        vfx:'assets/characters/famu_female_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:2,active:3,recovery:3},
        combo2:{sheet:'combat',row:1,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo3:{sheet:'combat',row:2,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-3},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_arc:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_burst:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },
    // ── KT — CAFE 8FIFTY OWNER BOSS (id:20) ─────────────────────────────────
    20: {
      sheetRows: { loco:6, combat:5, damage:6, supers:4, topdown:8, vfx:6 },
      sheets: {
        loco:   'assets/characters/kt_sheet01_loco.png',
        combat: 'assets/characters/kt_sheet02_combat.png',
        damage: 'assets/characters/kt_sheet03_damage.png',
        supers: 'assets/characters/kt_sheet04_supers.png',
        topdown:'assets/characters/kt_sheet05_topdown.png',
        vfx:    'assets/characters/kt_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:4,active:3,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:5,active:3,recovery:0},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:6,active:3,recovery:-1},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:6,active:4,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:8,active:5,recovery:-5},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        hurt_heavy:{sheet:'damage',row:1,frames:8,fps:14,loop:false},
        launch_hit:{sheet:'damage',row:2,frames:8,fps:12,loop:false},
        knockdown:{sheet:'damage',row:3,frames:8,fps:10,loop:false},
        stun:{sheet:'damage',row:4,frames:8,fps:8,loop:true},
        recover:{sheet:'damage',row:5,frames:8,fps:10,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_jab:{sheet:'vfx',row:0,frames:8,fps:22,loop:false},
        vfx_fire:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_sound:{sheet:'vfx',row:2,frames:8,fps:16,loop:false},
        vfx_dash:{sheet:'vfx',row:3,frames:8,fps:18,loop:false},
        vfx_boss_ring:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_finisher_col:{sheet:'vfx',row:5,frames:8,fps:12,loop:false},
      }
    },

    // ── BIG SOULJA — HITMANS VIP DOOR BOSS (id:21) ──────────────────────────
    21: {
      sheetRows: { loco:6, combat:5, damage:6, supers:4, topdown:8, vfx:6 },
      sheets: {
        loco:   'assets/characters/bigsoulja_sheet01_loco.png',
        combat: 'assets/characters/bigsoulja_sheet02_combat.png',
        damage: 'assets/characters/bigsoulja_sheet03_damage.png',
        supers: 'assets/characters/bigsoulja_sheet04_supers.png',
        topdown:'assets/characters/bigsoulja_sheet05_topdown.png',
        vfx:    'assets/characters/bigsoulja_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:5,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:9,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:13,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:16,loop:false,startup:5,active:4,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:14,loop:false,startup:6,active:4,recovery:0},
        combo3:{sheet:'combat',row:2,frames:8,fps:12,loop:false,startup:7,active:4,recovery:-1},
        special:{sheet:'combat',row:3,frames:8,fps:13,loop:false,startup:7,active:5,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:9,loop:false,startup:10,active:6,recovery:-6},
        hurt:{sheet:'damage',row:0,frames:8,fps:14,loop:false},
        hurt_heavy:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        launch_hit:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        knockdown:{sheet:'damage',row:3,frames:8,fps:9,loop:false},
        stun:{sheet:'damage',row:4,frames:8,fps:7,loop:true},
        recover:{sheet:'damage',row:5,frames:8,fps:9,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:13,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:13,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:9,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:5,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:5,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:5,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:5,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:9,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:9,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:9,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:9,loop:true},
        vfx_jab:{sheet:'vfx',row:0,frames:8,fps:22,loop:false},
        vfx_impact:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_rope_arc:{sheet:'vfx',row:2,frames:8,fps:16,loop:false},
        vfx_dash:{sheet:'vfx',row:3,frames:8,fps:18,loop:false},
        vfx_super_ring:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_finisher_col:{sheet:'vfx',row:5,frames:8,fps:12,loop:false},
      }
    },

    // ── PREDATOR PETE — OUTSIDE OP / BAD GUY (id:30) ────────────────────────
    30: {
      sheetRows: { loco:6, combat:5, damage:6, supers:4, vfx:6 },
      sheets: {
        loco:   'assets/characters/pete_sheet01_loco.png',
        combat: 'assets/characters/pete_sheet02_combat.png',
        damage: 'assets/characters/pete_sheet03_damage.png',
        supers: 'assets/characters/pete_sheet04_supers.png',
        vfx:    'assets/characters/pete_sheet05_vfx.png',
        topdown:'assets/characters/pete_sheet06_topdown.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:13,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:9,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        hurt_heavy:{sheet:'damage',row:1,frames:8,fps:14,loop:false},
        launch_hit:{sheet:'damage',row:2,frames:8,fps:12,loop:false},
        knockdown:{sheet:'damage',row:3,frames:8,fps:10,loop:false},
        stun:{sheet:'damage',row:4,frames:8,fps:8,loop:true},
        recover:{sheet:'damage',row:5,frames:8,fps:10,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:13,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:12,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:9,loop:false,superFlash:true},
        vfx_slap:{sheet:'vfx',row:0,frames:8,fps:22,loop:false},
        vfx_purple_dash:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_chain_arc:{sheet:'vfx',row:2,frames:8,fps:16,loop:false},
        vfx_heart_bait:{sheet:'vfx',row:3,frames:8,fps:14,loop:false},
        vfx_stun_stars:{sheet:'vfx',row:4,frames:8,fps:12,loop:true},
        vfx_banned:{sheet:'vfx',row:5,frames:8,fps:10,loop:false},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
      }
    },

    // ── AGENT SNOW — OUTSIDE OP / SNOW AGENT (id:31) ────────────────────────
    31: {
      sheetRows: { loco:6, combat:5, damage:6, supers:4, vfx:6, topdown:8 },
      sheets: {
        loco:   'assets/characters/snow_sheet01_loco.png',
        combat: 'assets/characters/snow_sheet02_combat.png',
        damage: 'assets/characters/snow_sheet03_damage.png',
        supers: 'assets/characters/snow_sheet04_supers.png',
        vfx:    'assets/characters/snow_sheet05_vfx.png',
        topdown:'assets/characters/snow_sheet06_topdown.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:17,loop:false,startup:4,active:3,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:15,loop:false,startup:5,active:3,recovery:0},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        special:{sheet:'combat',row:3,frames:8,fps:12,loop:false,startup:6,active:4,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:9,loop:false,startup:8,active:5,recovery:-5},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        hurt_heavy:{sheet:'damage',row:1,frames:8,fps:14,loop:false},
        launch_hit:{sheet:'damage',row:2,frames:8,fps:12,loop:false},
        knockdown:{sheet:'damage',row:3,frames:8,fps:10,loop:false},
        stun:{sheet:'damage',row:4,frames:8,fps:8,loop:true},
        recover:{sheet:'damage',row:5,frames:8,fps:10,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:13,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:12,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:9,loop:false,superFlash:true},
        vfx_punch:{sheet:'vfx',row:0,frames:8,fps:22,loop:false},
        vfx_ice_burst:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_radio:{sheet:'vfx',row:2,frames:8,fps:14,loop:false},
        vfx_ice_dash:{sheet:'vfx',row:3,frames:8,fps:18,loop:false},
        vfx_shield_hex:{sheet:'vfx',row:4,frames:8,fps:14,loop:true},
        vfx_case_closed:{sheet:'vfx',row:5,frames:8,fps:10,loop:false},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
      }
    },

    // ── FAMU MALE (id:4) ─────────────────────────────────────────────────────
    4: {
      sheets: {
        loco:'assets/characters/famu_male_sheet01_loco.png',
        combat:'assets/characters/famu_male_sheet02_combat.png',
        damage:'assets/characters/famu_male_sheet03_damage.png',
        supers:'assets/characters/famu_male_sheet04_supers.png',
        topdown:'assets/characters/famu_male_sheet05_topdown.png',
        vfx:'assets/characters/famu_male_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:4,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:18,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:16,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:6,active:4,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:8,active:5,recovery:-5},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_arc:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_burst:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── INFLUENCER (id:5) — loco sheet only ─────────────────────────────────
    5: {
      sheets: {
        loco:   'assets/characters/influencer_sheet01_loco.png',
        combat: 'assets/characters/influencer_sheet02_combat.png',
        damage: 'assets/characters/influencer_sheet03_damage.png',
        supers: 'assets/characters/influencer_sheet04_supers.png',
        topdown:'assets/characters/influencer_sheet05_topdown.png',
        vfx:    'assets/characters/influencer_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_soundwave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── PHOTOGRAPHER (id:6) — loco sheet only ───────────────────────────────
    6: {
      sheets: {
        loco:   'assets/characters/photographer_sheet01_loco.png',
        combat: 'assets/characters/photographer_sheet02_combat.png',
        damage: 'assets/characters/photographer_sheet03_damage.png',
        supers: 'assets/characters/photographer_sheet04_supers.png',
        topdown:'assets/characters/photographer_sheet05_topdown.png',
        vfx:    'assets/characters/photographer_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_soundwave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── PROMOTER (id:7) — loco sheet only ───────────────────────────────────
    7: {
      sheets: {
        loco:   'assets/characters/promoter_sheet01_loco.png',
        combat: 'assets/characters/promoter_sheet02_combat.png',
        damage: 'assets/characters/promoter_sheet03_damage.png',
        supers: 'assets/characters/promoter_sheet04_supers.png',
        topdown:'assets/characters/promoter_sheet05_topdown.png',
        vfx:    'assets/characters/promoter_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_soundwave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── DANCER (id:8) — loco sheet only ─────────────────────────────────────
    8: {
      sheets: {
        loco:   'assets/characters/dancer_sheet01_loco.png',
        combat: 'assets/characters/dancer_sheet02_combat.png',
        damage: 'assets/characters/dancer_sheet03_damage.png',
        supers: 'assets/characters/dancer_sheet04_supers.png',
        topdown:'assets/characters/dancer_sheet05_topdown.png',
        vfx:    'assets/characters/dancer_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_soundwave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── VENDOR (id:9) ────────────────────────────────────────────────────────
    9: {
      sheets: {
        loco:   'assets/characters/vendor_sheet01_loco.png',
        combat: 'assets/characters/vendor_sheet02_combat.png',
        damage: 'assets/characters/vendor_sheet03_damage.png',
        supers: 'assets/characters/vendor_sheet04_supers.png',
        topdown:'assets/characters/vendor_sheet05_topdown.png',
        vfx:    'assets/characters/vendor_sheet06_vfx.png',
      },
      anims: {
        idle:     {sheet:'loco',row:0,frames:8,fps:5, loop:true},
        walk:     {sheet:'loco',row:1,frames:8,fps:8, loop:true},
        run:      {sheet:'loco',row:2,frames:8,fps:11,loop:true},
        dodge:    {sheet:'loco',row:3,frames:8,fps:14,loop:false},
        block:    {sheet:'loco',row:4,frames:8,fps:8, loop:true},
        interact: {sheet:'loco',row:5,frames:8,fps:8, loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        combo3:{sheet:'combat',row:2,frames:8,fps:12,loop:false,startup:6,active:3,recovery:-1},
        special:{sheet:'combat',row:3,frames:8,fps:12,loop:false,startup:6,active:4,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:9,loop:false,startup:8,active:5,recovery:-5},
        hurt:{sheet:'damage',row:0,frames:8,fps:14,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:10,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:8, loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:5, loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:4, loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:12,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:12,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:12,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:9,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:5,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:5,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:5,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:5,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:8,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:8,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:8,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:8,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_arc:{sheet:'vfx',row:2,frames:8,fps:16,loop:false},
        vfx_burst:{sheet:'vfx',row:3,frames:8,fps:14,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:14,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:12,loop:false},
      }
    },

    // ── SECURITY (id:10) ─────────────────────────────────────────────────────
    10: {
      sheets: {
        loco:   'assets/characters/security_sheet01_loco.png',
        combat: 'assets/characters/security_sheet02_combat.png',
        damage: 'assets/characters/security_sheet03_damage.png',
        supers: 'assets/characters/security_sheet04_supers.png',
        topdown:'assets/characters/security_sheet05_topdown.png',
        vfx:    'assets/characters/security_sheet06_vfx.png',
      },
      anims: {
        idle:     {sheet:'loco',row:0,frames:8,fps:4, loop:true},
        walk:     {sheet:'loco',row:1,frames:8,fps:7, loop:true},
        run:      {sheet:'loco',row:2,frames:8,fps:10,loop:true},
        dodge:    {sheet:'loco',row:3,frames:8,fps:12,loop:false},
        block:    {sheet:'loco',row:4,frames:8,fps:6, loop:true},
        interact: {sheet:'loco',row:5,frames:8,fps:6, loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:14,loop:false,startup:5,active:4,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:12,loop:false,startup:6,active:4,recovery:0},
        combo3:{sheet:'combat',row:2,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-1},
        special:{sheet:'combat',row:3,frames:8,fps:10,loop:false,startup:7,active:5,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:8,loop:false,startup:9,active:5,recovery:-6},
        hurt:{sheet:'damage',row:0,frames:8,fps:12,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:8, loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:7, loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:4, loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:3, loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:10,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:10,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:10,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:8,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:4,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:4,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:4,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:4,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:7,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:7,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:7,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:7,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:16,loop:false},
        vfx_arc:{sheet:'vfx',row:2,frames:8,fps:14,loop:false},
        vfx_burst:{sheet:'vfx',row:3,frames:8,fps:14,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:12,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:12,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:10,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:10,loop:false},
      }
    },

    // ── HOST (id:11) — loco sheet only ──────────────────────────────────────
    11: {
      sheets: {
        loco:   'assets/characters/host_sheet01_loco.png',
        combat: 'assets/characters/host_sheet02_combat.png',
        damage: 'assets/characters/host_sheet03_damage.png',
        supers: 'assets/characters/host_sheet04_supers.png',
        topdown:'assets/characters/host_sheet05_topdown.png',
        vfx:    'assets/characters/host_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:3,recovery:2},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:3,recovery:1},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:3,recovery:0},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:4,recovery:-4},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        knockdown:{sheet:'damage',row:1,frames:8,fps:12,loop:false},
        recover:{sheet:'damage',row:2,frames:8,fps:10,loop:false},
        victory:{sheet:'damage',row:3,frames:8,fps:6,loop:true},
        defeated:{sheet:'damage',row:4,frames:8,fps:5,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:14,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:14,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:10,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_hit_l:{sheet:'vfx',row:0,frames:8,fps:20,loop:false},
        vfx_hit_h:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_soundwave:{sheet:'vfx',row:2,frames:8,fps:18,loop:false},
        vfx_blast:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_shield:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_super:{sheet:'vfx',row:5,frames:8,fps:16,loop:false},
        vfx_finisher:{sheet:'vfx',row:6,frames:8,fps:12,loop:false},
        vfx_trail:{sheet:'vfx',row:7,frames:8,fps:14,loop:false},
      }
    },

    // ── ENTRY LINE DISRUPTOR — CAFE8FIFTY VIP BOSS (id:22) ──────────────────
    22: {
      sheetRows: { loco:6, combat:5, damage:6, supers:4, topdown:8, vfx:6 },
      sheets: {
        loco:   'assets/characters/eld_sheet01_loco.png',
        combat: 'assets/characters/eld_sheet02_combat.png',
        damage: 'assets/characters/eld_sheet03_damage.png',
        supers: 'assets/characters/eld_sheet04_supers.png',
        topdown:'assets/characters/eld_sheet05_topdown.png',
        vfx:    'assets/characters/eld_sheet06_vfx.png',
      },
      anims: {
        idle:{sheet:'loco',row:0,frames:8,fps:6,loop:true},
        walk:{sheet:'loco',row:1,frames:8,fps:10,loop:true},
        run:{sheet:'loco',row:2,frames:8,fps:14,loop:true},
        dodge:{sheet:'loco',row:3,frames:8,fps:16,loop:false},
        block:{sheet:'loco',row:4,frames:8,fps:8,loop:true},
        interact:{sheet:'loco',row:5,frames:8,fps:8,loop:false},
        combo1:{sheet:'combat',row:0,frames:8,fps:18,loop:false,startup:3,active:4,recovery:1},
        combo2:{sheet:'combat',row:1,frames:8,fps:16,loop:false,startup:4,active:4,recovery:0},
        combo3:{sheet:'combat',row:2,frames:8,fps:14,loop:false,startup:5,active:4,recovery:-1},
        special:{sheet:'combat',row:3,frames:8,fps:14,loop:false,startup:5,active:5,recovery:-2},
        finisher_c:{sheet:'combat',row:4,frames:8,fps:10,loop:false,startup:7,active:5,recovery:-5},
        hurt:{sheet:'damage',row:0,frames:8,fps:16,loop:false},
        hurt_heavy:{sheet:'damage',row:1,frames:8,fps:14,loop:false},
        launch_hit:{sheet:'damage',row:2,frames:8,fps:12,loop:false},
        knockdown:{sheet:'damage',row:3,frames:8,fps:10,loop:false},
        stun:{sheet:'damage',row:4,frames:8,fps:8,loop:true},
        recover:{sheet:'damage',row:5,frames:8,fps:10,loop:false},
        super1:{sheet:'supers',row:0,frames:8,fps:14,loop:false,superFlash:true},
        super2:{sheet:'supers',row:1,frames:8,fps:13,loop:false,superFlash:true},
        super3:{sheet:'supers',row:2,frames:8,fps:12,loop:false,superFlash:true},
        finisher:{sheet:'supers',row:3,frames:8,fps:9,loop:false,superFlash:true},
        td_idle_s:{sheet:'topdown',row:0,frames:8,fps:6,loop:true},
        td_idle_n:{sheet:'topdown',row:1,frames:8,fps:6,loop:true},
        td_idle_w:{sheet:'topdown',row:2,frames:8,fps:6,loop:true},
        td_idle_e:{sheet:'topdown',row:3,frames:8,fps:6,loop:true},
        td_walk_s:{sheet:'topdown',row:4,frames:8,fps:10,loop:true},
        td_walk_n:{sheet:'topdown',row:5,frames:8,fps:10,loop:true},
        td_walk_w:{sheet:'topdown',row:6,frames:8,fps:10,loop:true},
        td_walk_e:{sheet:'topdown',row:7,frames:8,fps:10,loop:true},
        vfx_jab:{sheet:'vfx',row:0,frames:8,fps:22,loop:false},
        vfx_counter:{sheet:'vfx',row:1,frames:8,fps:18,loop:false},
        vfx_barrier:{sheet:'vfx',row:2,frames:8,fps:16,loop:false},
        vfx_rope:{sheet:'vfx',row:3,frames:8,fps:16,loop:false},
        vfx_super_ring:{sheet:'vfx',row:4,frames:8,fps:14,loop:false},
        vfx_finisher_shockwave:{sheet:'vfx',row:5,frames:8,fps:12,loop:false},
      }
    },
  };

  // ── NPC Sprite Sets ──────────────────────────────────────────────────────
  // Keyed by string (not int) so they don't conflict with playable char IDs.
  // scene_manager references these by key for random NPC drawing.
  const NPC_DEFS = {
    cafe8fifty_a: {
      sheets: { loco:'assets/characters/cafe8fifty_npcs_a.png' },
      rows: 6, framesPerRow: 8,
    },
    cafe8fifty_b: {
      sheets: { loco:'assets/characters/cafe8fifty_npcs_b.png' },
      rows: 6, framesPerRow: 8,
    },
    cafe8fifty_c: {
      sheets: { loco:'assets/characters/cafe8fifty_npcs_c.png' },
      rows: 6, framesPerRow: 8,
    },
    hvas_a: {
      sheets: { loco:'assets/characters/hvas_npcs_a.png' },
      rows: 6, framesPerRow: 8,
    },
    hvas_b: {
      sheets: { loco:'assets/characters/hvas_npcs_b.png' },
      rows: 6, framesPerRow: 8,
    },
    hvas_c: {
      sheets: { loco:'assets/characters/hvas_npcs_c.png' },
      rows: 6, framesPerRow: 8,
    },
    bigsoulja_venue_a: {
      sheets: { loco:'assets/characters/bigsoulja_venue_npcs_a.png' },
      rows: 6, framesPerRow: 8,
    },
    bigsoulja_venue_b: {
      sheets: { loco:'assets/characters/bigsoulja_venue_npcs_b.png' },
      rows: 6, framesPerRow: 8,
    },
    bigsoulja_venue_c: {
      sheets: { loco:'assets/characters/bigsoulja_venue_npcs_c.png' },
      rows: 6, framesPerRow: 8,
    },
  };

  // Draw a single NPC frame: npcKey=string, row=0-5, frame=0-7, dx/dy/dw/dh
  function drawNPCFrame(ctx, npcKey, row, frame, dx, dy, dw, dh, flipX) {
    const def = NPC_DEFS[npcKey];
    if (!def) return false;
    const img = _img(def.sheets.loco);
    if (!img || !img._ready || img._failed) return false;
    const fw = Math.floor(img.naturalWidth / def.framesPerRow);
    const fh = Math.floor(img.naturalHeight / def.rows);
    const sx = frame * fw;
    const sy = row * fh;
    ctx.save();
    if (flipX) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, fw, fh, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, fw, fh, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  function preloadNPCs(keys) {
    (keys || Object.keys(NPC_DEFS)).forEach(k => {
      const d = NPC_DEFS[k]; if (d) _img(d.sheets.loco);
    });
  }

  // ── VFX queue ────────────────────────────────────────────────────────────
  const _vfx = [];

  function preload(charId) {
    const def = CHAR_DEFS[charId];
    if (!def) return;
    // Load pre-sliced transparent frames for every animation type
    Object.entries(def.anims).forEach(([, animDef]) => {
      const rows = SHEET_ROWS[animDef.sheet] || 8;
      _preloadFrames(charId, animDef.sheet, rows);
    });
  }

  // Returns a Promise that resolves when all loco frames for charId are loaded.
  function preloadReady(charId) {
    const def = CHAR_DEFS[charId];
    if (!def) return Promise.resolve();
    preload(charId);
    const locoRows = SHEET_ROWS.loco;
    const imgs = [];
    for (let r = 0; r < locoRows; r++) {
      for (let c = 0; c < FRAMES_PER_ROW; c++) {
        const img = _frame(charId, 'loco', r, c);
        if (img && !img._ready && !img._failed) imgs.push(img);
      }
    }
    if (!imgs.length) return Promise.resolve();
    return new Promise(resolve => {
      let done = 0;
      imgs.forEach(img => {
        const finish = () => { if (++done >= imgs.length) resolve(); };
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
      });
    });
  }

  function hasSprites(charId) { return !!CHAR_DEFS[charId] && !!CHAR_FOLDERS[charId]; }

  // ── Resolve animation key from entity state ──────────────────────────────
  function resolveAnim(charId, entity, isTopdown, lastDir) {
    const def = CHAR_DEFS[charId];
    if (!def) return null;
    const a = def.anims;
    if (isTopdown) {
      const d = lastDir || 's';
      const moving = entity.vel
        ? Math.abs(entity.vel.x) > 0.5 || Math.abs(entity.vel.y) > 0.5 : false;
      const key = (moving ? 'td_walk_' : 'td_idle_') + d;
      return a[key] ? key : null;
    }
    if (entity.superAnim && a['super' + entity.superAnim]) return 'super' + entity.superAnim;
    if (entity.finishering && a.finisher)   return 'finisher';
    if (entity.specialAnim && a.special)    return 'special';
    if (entity.comboStep === 3 && a.combo3) return 'combo3';
    if (entity.comboStep === 2 && a.combo2) return 'combo2';
    if (entity.attacking   && a.combo1)     return 'combo1';
    if (entity.hp <= 0     && a.defeated)   return 'defeated';
    if (entity.knocked     && a.knockdown)  return 'knockdown';
    if (entity.recovering  && a.recover)    return 'recover';
    if (entity.hitstunFrames > 0 && a.hurt) return 'hurt';
    if (entity.victorious  && a.victory)    return 'victory';
    if (entity.dodging     && a.dodge)      return 'dodge';
    if (entity.blocking    && a.block)      return 'block';
    if (entity.interacting && a.interact)   return 'interact';
    const vx = Math.abs(entity.vel ? entity.vel.x : 0);
    const spd = entity.speed || 4;
    if (vx > spd * 0.8 && a.run)  return 'run';
    if (vx > 0.5       && a.walk) return 'walk';
    return a.idle ? 'idle' : null;
  }

  // ── Advance frame counter ────────────────────────────────────────────────
  function update(charId, entity, dt, isTopdown, lastDir) {
    const def = CHAR_DEFS[charId];
    if (!def) return;
    const key = resolveAnim(charId, entity, isTopdown, lastDir);
    if (!key) return;
    const animDef = def.anims[key];
    if (!animDef) return;
    if (!entity.spriteState) entity.spriteState = {};
    const ss = entity.spriteState;
    if (ss.currentAnim !== key) {
      ss.currentAnim = key; ss.frame = 0; ss.frameTimer = 0; ss.done = false;
    }
    if (ss.done) return;
    ss.frameTimer = (ss.frameTimer || 0) + dt;
    const dur = 1 / (animDef.fps || 12);
    if (ss.frameTimer >= dur) {
      ss.frameTimer -= dur;
      const next = ss.frame + 1;
      if (next >= animDef.frames) {
        if (animDef.loop !== false) ss.frame = 0;
        else { ss.frame = animDef.frames - 1; ss.done = true; }
      } else {
        ss.frame = next;
      }
    }
  }

  // ── Draw — uses pre-sliced transparent frame PNGs ───────────────────────
  function draw(ctx, charId, entity, dx, dy, dw, dh, flipX) {
    const def = CHAR_DEFS[charId];
    if (!def || !entity.spriteState) return false;
    const ss = entity.spriteState;
    if (!ss.currentAnim) return false;
    const animDef = def.anims[ss.currentAnim];
    if (!animDef) return false;
    return _drawFrame(ctx, charId, animDef.sheet, animDef.row, ss.frame, dx, dy, dw, dh, flipX);
  }

  // ── VFX overlay ──────────────────────────────────────────────────────────
  function spawnVFX(charId, vfxKey, worldX, worldY, size) {
    const def = CHAR_DEFS[charId];
    if (!def || !def.anims[vfxKey]) return;
    _vfx.push({ charId, vfxKey, x:worldX, y:worldY, size:size||96, frame:0, frameTimer:0 });
  }

  function updateVFX(dt) {
    for (let i = _vfx.length - 1; i >= 0; i--) {
      const v = _vfx[i];
      const def = CHAR_DEFS[v.charId];
      if (!def) { _vfx.splice(i,1); continue; }
      const a = def.anims[v.vfxKey];
      if (!a) { _vfx.splice(i,1); continue; }
      v.frameTimer += dt;
      if (v.frameTimer >= 1/(a.fps||16)) {
        v.frameTimer -= 1/(a.fps||16);
        if (++v.frame >= a.frames) _vfx.splice(i,1);
      }
    }
  }

  function renderVFX(ctx, cameraX, cameraY) {
    _vfx.forEach(v => {
      const def = CHAR_DEFS[v.charId];
      if (!def) return;
      const a = def.anims[v.vfxKey];
      if (!a) return;
      const sx = v.x - (cameraX||0) - v.size/2;
      const sy = v.y - (cameraY||0) - v.size/2;
      _drawFrame(ctx, v.charId, a.sheet, a.row, v.frame, sx, sy, v.size, v.size, false);
    });
  }

  /**
   * Draw a specific animation frame directly — no entity needed.
   * Useful for menus, character select previews, VS splash.
   * animName: key from CHAR_DEFS[charId].anims
   * t: time in seconds (used to advance through frames)
   * Returns true if drawn, false if not ready.
   */
  function drawAnim(ctx, charId, animName, t, dx, dy, dw, dh, opts) {
    const def = CHAR_DEFS[charId];
    if (!def) return false;
    const animDef = def.anims[animName];
    if (!animDef) return false;
    const fps   = animDef.fps || 8;
    const total = animDef.frames || 8;
    const frame = Math.floor(t * fps) % total;
    opts = opts || {};
    const frameImg = _frame(charId, animDef.sheet, animDef.row, frame);
    if (!frameImg || !frameImg._ready || frameImg._failed) return false;
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur || 20; }
    if (opts.facing === -1) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(frameImg, 0, 0, dw, dh);
    } else {
      ctx.drawImage(frameImg, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  // ── Feet-anchored, aspect-correct grounded draw ──────────────────────────
  // Every frame is now a uniform cell with the character's feet at the cell
  // bottom, so we draw the frame at its native aspect ratio with its BOTTOM
  // edge on groundY and centred on footX. This keeps the character planted on
  // the floor and correctly proportioned across all animation frames — no more
  // "portrait jittering in a moving box".
  //
  // If the requested frame isn't loaded yet, we fall back to the idle frame
  // (loco r0 f0, always preloaded first) so a REAL sprite always renders and
  // the procedural fallback never appears.
  function _bestFrame(charId, sheet, row, frame) {
    let img = _frame(charId, sheet, row, frame);
    if (img && img._ready && !img._failed && img.naturalWidth > 1) return img;
    img = _frame(charId, 'loco', 0, 0);            // idle fallback
    if (img && img._ready && !img._failed && img.naturalWidth > 1) return img;
    return null;
  }

  function _blitGrounded(ctx, img, footX, groundY, targetH, flipX, opts) {
    const aspect = (img.naturalWidth / img.naturalHeight) || 0.79;
    const w = targetH * aspect;
    ctx.save();
    if (opts && opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts && opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur || 20; }
    if (flipX) {
      ctx.translate(footX + w / 2, groundY - targetH);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, targetH);
    } else {
      ctx.drawImage(img, footX - w / 2, groundY - targetH, w, targetH);
    }
    ctx.restore();
    return true;
  }

  // Entity-driven (uses spriteState advanced by update()).
  function drawGrounded(ctx, charId, entity, footX, groundY, targetH, flipX, opts) {
    const def = CHAR_DEFS[charId];
    if (!def) return false;
    let sheet = 'loco', row = 0, frame = 0;
    const ss = entity && entity.spriteState;
    if (ss && ss.currentAnim && def.anims[ss.currentAnim]) {
      const a = def.anims[ss.currentAnim];
      sheet = a.sheet; row = a.row; frame = ss.frame || 0;
    }
    const img = _bestFrame(charId, sheet, row, frame);
    if (!img) return false;
    return _blitGrounded(ctx, img, footX, groundY, targetH, flipX, opts);
  }

  // Time-driven (for menus / previews — no entity needed).
  function drawAnimGrounded(ctx, charId, animName, t, footX, groundY, targetH, opts) {
    const def = CHAR_DEFS[charId];
    if (!def) return false;
    const a = def.anims[animName] || def.anims.idle;
    if (!a) return false;
    const fps = a.fps || 8, total = a.frames || 8;
    const frame = Math.floor(t * fps) % total;
    const img = _bestFrame(charId, a.sheet, a.row, frame);
    if (!img) return false;
    return _blitGrounded(ctx, img, footX, groundY, targetH, (opts && opts.facing === -1), opts);
  }

  return { hasSprites, preload, preloadReady, resolveAnim, update, draw, drawAnim, drawGrounded, drawAnimGrounded, spawnVFX, updateVFX, renderVFX, drawNPCFrame, preloadNPCs, CHAR_DEFS, NPC_DEFS, SHEET_ROWS };
})();

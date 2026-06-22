'use strict';
/**
 * SpriteSystem — Auto-slicing sprite engine
 * Frame dimensions computed from actual PNG naturalWidth/naturalHeight at runtime.
 * frameW = naturalWidth / FRAMES_PER_ROW (always 8)
 * frameH = naturalHeight / SHEET_ROWS[sheetKey]
 * Never uses hardcoded pixel sizes.
 */
const SpriteSystem = (() => {
  const FRAMES_PER_ROW = 8;
  const SHEET_ROWS = { loco:6, combat:5, damage:5, supers:4, topdown:8, vfx:8 };

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

  // Compute frame size from loaded image + sheet type
  function _dims(img, sheetKey) {
    if (!img._ready) return { w:128, h:160 };
    const rows = SHEET_ROWS[sheetKey] || 4;
    return { w: Math.floor(img.naturalWidth / FRAMES_PER_ROW), h: Math.floor(img.naturalHeight / rows) };
  }

  // ── Character definitions ────────────────────────────────────────────────
  // startup/active/recovery = frame counts for combat moves
  // superFlash = triggers MvC-style screen flash when activated
  const CHAR_DEFS = {
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
  };

  // ── VFX queue ────────────────────────────────────────────────────────────
  const _vfx = [];

  function preload(charId) {
    const def = CHAR_DEFS[charId];
    if (!def) return;
    Object.values(def.sheets).forEach(s => _img(s));
  }

  function hasSprites(charId) { return !!CHAR_DEFS[charId]; }

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

  // ── Draw — auto-slices using actual PNG dimensions ───────────────────────
  function draw(ctx, charId, entity, dx, dy, dw, dh, flipX) {
    const def = CHAR_DEFS[charId];
    if (!def || !entity.spriteState) return false;
    const ss = entity.spriteState;
    if (!ss.currentAnim) return false;
    const animDef = def.anims[ss.currentAnim];
    if (!animDef) return false;
    const img = _img(def.sheets[animDef.sheet]);
    if (!img || !img._ready || img._failed) return false;

    const d = _dims(img, animDef.sheet);
    const sx = ss.frame * d.w;
    const sy = animDef.row * d.h;

    ctx.save();
    if (flipX) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, d.w, d.h, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, d.w, d.h, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
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
      const img = _img(def.sheets[a.sheet]);
      if (!img || !img._ready || img._failed) return;
      const d = _dims(img, a.sheet);
      ctx.drawImage(img, v.frame*d.w, a.row*d.h, d.w, d.h,
        v.x-(cameraX||0)-v.size/2, v.y-(cameraY||0)-v.size/2, v.size, v.size);
    });
  }

  return { hasSprites, preload, resolveAnim, update, draw, spawnVFX, updateVFX, renderVFX, CHAR_DEFS, SHEET_ROWS };
})();

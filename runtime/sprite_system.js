'use strict';
const SpriteSystem = (() => {
  // ── Image cache ─────────────────────────────────────────────────────────────
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

  // ── Character sprite definitions ─────────────────────────────────────────────
  // frameW/frameH: dimensions of ONE frame on the sheet (in px at source resolution)
  // The system scales to the entity's draw size at render time.
  // sheets: map of sheetKey → filename under assets/characters/
  // anims: map of animKey → { sheet, row, frames, fps, loop }
  //   loop defaults to true; loop:false plays once then holds last frame

  const CHAR_DEFS = {
    // ── FSU Student Female (id 13) ──────────────────────────────────────────
    13: {
      frameW: 128, frameH: 160,
      tdFrameW: 96, tdFrameH: 96,
      vfxFrameW: 160, vfxFrameH: 160,
      sheets: {
        loco:    'assets/characters/fsu_female_sheet01_loco.png',
        combat:  'assets/characters/fsu_female_sheet02_combat.png',
        damage:  'assets/characters/fsu_female_sheet03_damage.png',
        supers:  'assets/characters/fsu_female_sheet04_supers.png',
        topdown: 'assets/characters/fsu_female_sheet05_topdown.png',
        vfx:     'assets/characters/fsu_female_sheet06_vfx.png',
      },
      anims: {
        idle:          { sheet:'loco',    row:0, frames:8, fps:6 },
        walk:          { sheet:'loco',    row:1, frames:8, fps:10 },
        run:           { sheet:'loco',    row:2, frames:8, fps:12 },
        dodge:         { sheet:'loco',    row:3, frames:8, fps:14, loop:false },
        block:         { sheet:'loco',    row:4, frames:8, fps:8 },
        interact:      { sheet:'loco',    row:5, frames:8, fps:8, loop:false },
        combo1:        { sheet:'combat',  row:0, frames:8, fps:16, loop:false },
        combo2:        { sheet:'combat',  row:1, frames:8, fps:16, loop:false },
        combo3:        { sheet:'combat',  row:2, frames:8, fps:16, loop:false },
        special:       { sheet:'combat',  row:3, frames:8, fps:14, loop:false },
        finisher_c:    { sheet:'combat',  row:4, frames:8, fps:10, loop:false },
        hurt:          { sheet:'damage',  row:0, frames:8, fps:14, loop:false },
        knockdown:     { sheet:'damage',  row:1, frames:8, fps:12, loop:false },
        recover:       { sheet:'damage',  row:2, frames:8, fps:10, loop:false },
        victory:       { sheet:'damage',  row:3, frames:8, fps:8 },
        defeated:      { sheet:'damage',  row:4, frames:8, fps:6, loop:false },
        super1:        { sheet:'supers',  row:0, frames:8, fps:14, loop:false },
        super2:        { sheet:'supers',  row:1, frames:8, fps:14, loop:false },
        super3:        { sheet:'supers',  row:2, frames:8, fps:14, loop:false },
        finisher:      { sheet:'supers',  row:3, frames:8, fps:10, loop:false },
        td_idle_down:  { sheet:'topdown', row:0, frames:8, fps:6 },
        td_idle_up:    { sheet:'topdown', row:1, frames:8, fps:6 },
        td_idle_left:  { sheet:'topdown', row:2, frames:8, fps:6 },
        td_idle_right: { sheet:'topdown', row:3, frames:8, fps:6 },
        td_walk_down:  { sheet:'topdown', row:4, frames:8, fps:10 },
        td_walk_up:    { sheet:'topdown', row:5, frames:8, fps:10 },
        td_walk_left:  { sheet:'topdown', row:6, frames:8, fps:10 },
        td_walk_right: { sheet:'topdown', row:7, frames:8, fps:10 },
        vfx_hit_light: { sheet:'vfx',    row:0, frames:8, fps:18, loop:false },
        vfx_hit_heavy: { sheet:'vfx',    row:1, frames:8, fps:16, loop:false },
        vfx_arc:       { sheet:'vfx',    row:2, frames:8, fps:16, loop:false },
        vfx_burst:     { sheet:'vfx',    row:3, frames:8, fps:14, loop:false },
        vfx_shield:    { sheet:'vfx',    row:4, frames:8, fps:12, loop:false },
        vfx_super:     { sheet:'vfx',    row:5, frames:8, fps:14, loop:false },
        vfx_finisher:  { sheet:'vfx',    row:6, frames:8, fps:10, loop:false },
        vfx_trail:     { sheet:'vfx',    row:7, frames:8, fps:12, loop:false },
      }
    },

    // ── FSU Student Male (id 12) ─────────────────────────────────────────────
    12: {
      frameW: 128, frameH: 160,
      tdFrameW: 96, tdFrameH: 96,
      vfxFrameW: 160, vfxFrameH: 160,
      sheets: {
        loco:   'assets/characters/fsu_male_sheet01_loco.png',
        combat: 'assets/characters/fsu_male_sheet02_combat.png',
        damage: 'assets/characters/fsu_male_sheet03_damage.png',
        supers: 'assets/characters/fsu_male_sheet04_supers.png',
      },
      anims: {
        idle:      { sheet:'loco',   row:0, frames:8, fps:6 },
        walk:      { sheet:'loco',   row:1, frames:8, fps:10 },
        run:       { sheet:'loco',   row:2, frames:8, fps:12 },
        dodge:     { sheet:'loco',   row:3, frames:8, fps:14, loop:false },
        block:     { sheet:'loco',   row:4, frames:8, fps:8 },
        interact:  { sheet:'loco',   row:5, frames:8, fps:8, loop:false },
        combo1:    { sheet:'combat', row:0, frames:8, fps:16, loop:false },
        combo2:    { sheet:'combat', row:1, frames:8, fps:16, loop:false },
        combo3:    { sheet:'combat', row:2, frames:8, fps:16, loop:false },
        special:   { sheet:'combat', row:3, frames:8, fps:14, loop:false },
        finisher_c:{ sheet:'combat', row:4, frames:8, fps:10, loop:false },
        hurt:      { sheet:'damage', row:0, frames:8, fps:14, loop:false },
        knockdown: { sheet:'damage', row:1, frames:8, fps:12, loop:false },
        recover:   { sheet:'damage', row:2, frames:8, fps:10, loop:false },
        victory:   { sheet:'damage', row:3, frames:8, fps:8 },
        defeated:  { sheet:'damage', row:4, frames:8, fps:6, loop:false },
        super1:    { sheet:'supers', row:0, frames:8, fps:14, loop:false },
        super2:    { sheet:'supers', row:1, frames:8, fps:14, loop:false },
        super3:    { sheet:'supers', row:2, frames:8, fps:14, loop:false },
        finisher:  { sheet:'supers', row:3, frames:8, fps:10, loop:false },
      }
    },

    // ── FAMU Student Female (id 3) ───────────────────────────────────────────
    3: {
      frameW: 128, frameH: 160,
      tdFrameW: 96, tdFrameH: 96,
      vfxFrameW: 160, vfxFrameH: 160,
      sheets: {
        loco:    'assets/characters/famu_female_sheet01_loco.png',
        combat:  'assets/characters/famu_female_sheet02_combat.png',
        damage:  'assets/characters/famu_female_sheet03_damage.png',
        supers:  'assets/characters/famu_female_sheet04_supers.png',
        topdown: 'assets/characters/famu_female_sheet05_topdown.png',
        vfx:     'assets/characters/famu_female_sheet06_vfx.png',
      },
      anims: {
        idle:          { sheet:'loco',    row:0, frames:8, fps:6 },
        walk:          { sheet:'loco',    row:1, frames:8, fps:10 },
        run:           { sheet:'loco',    row:2, frames:8, fps:12 },
        dodge:         { sheet:'loco',    row:3, frames:8, fps:14, loop:false },
        block:         { sheet:'loco',    row:4, frames:8, fps:8 },
        interact:      { sheet:'loco',    row:5, frames:8, fps:8, loop:false },
        combo1:        { sheet:'combat',  row:0, frames:8, fps:16, loop:false },
        combo2:        { sheet:'combat',  row:1, frames:8, fps:16, loop:false },
        combo3:        { sheet:'combat',  row:2, frames:8, fps:16, loop:false },
        special:       { sheet:'combat',  row:3, frames:8, fps:14, loop:false },
        hurt:          { sheet:'damage',  row:0, frames:8, fps:14, loop:false },
        knockdown:     { sheet:'damage',  row:1, frames:8, fps:12, loop:false },
        recover:       { sheet:'damage',  row:2, frames:8, fps:10, loop:false },
        victory:       { sheet:'damage',  row:3, frames:8, fps:8 },
        defeated:      { sheet:'damage',  row:4, frames:8, fps:6, loop:false },
        super1:        { sheet:'supers',  row:0, frames:8, fps:14, loop:false },
        super2:        { sheet:'supers',  row:1, frames:8, fps:14, loop:false },
        super3:        { sheet:'supers',  row:2, frames:8, fps:14, loop:false },
        finisher:      { sheet:'supers',  row:3, frames:8, fps:10, loop:false },
        td_idle_down:  { sheet:'topdown', row:0, frames:8, fps:6 },
        td_idle_up:    { sheet:'topdown', row:1, frames:8, fps:6 },
        td_idle_left:  { sheet:'topdown', row:2, frames:8, fps:6 },
        td_idle_right: { sheet:'topdown', row:3, frames:8, fps:6 },
        td_walk_down:  { sheet:'topdown', row:4, frames:8, fps:10 },
        td_walk_up:    { sheet:'topdown', row:5, frames:8, fps:10 },
        td_walk_left:  { sheet:'topdown', row:6, frames:8, fps:10 },
        td_walk_right: { sheet:'topdown', row:7, frames:8, fps:10 },
        vfx_hit_light: { sheet:'vfx', row:0, frames:8, fps:18, loop:false },
        vfx_hit_heavy: { sheet:'vfx', row:1, frames:8, fps:16, loop:false },
        vfx_arc:       { sheet:'vfx', row:2, frames:8, fps:16, loop:false },
        vfx_burst:     { sheet:'vfx', row:3, frames:8, fps:14, loop:false },
        vfx_shield:    { sheet:'vfx', row:4, frames:8, fps:12, loop:false },
        vfx_super:     { sheet:'vfx', row:5, frames:8, fps:14, loop:false },
        vfx_finisher:  { sheet:'vfx', row:6, frames:8, fps:10, loop:false },
        vfx_trail:     { sheet:'vfx', row:7, frames:8, fps:12, loop:false },
      }
    },

    // ── FAMU Student Male (id 4) ─────────────────────────────────────────────
    4: {
      frameW: 128, frameH: 160,
      tdFrameW: 96, tdFrameH: 96,
      vfxFrameW: 160, vfxFrameH: 160,
      sheets: {
        loco:    'assets/characters/famu_male_sheet01_loco.png',
        combat:  'assets/characters/famu_male_sheet02_combat.png',
        damage:  'assets/characters/famu_male_sheet03_damage.png',
        supers:  'assets/characters/famu_male_sheet04_supers.png',
        topdown: 'assets/characters/famu_male_sheet05_topdown.png',
        vfx:     'assets/characters/famu_male_sheet06_vfx.png',
      },
      anims: {
        idle:          { sheet:'loco',    row:0, frames:8, fps:6 },
        walk:          { sheet:'loco',    row:1, frames:8, fps:10 },
        run:           { sheet:'loco',    row:2, frames:8, fps:12 },
        dodge:         { sheet:'loco',    row:3, frames:8, fps:14, loop:false },
        block:         { sheet:'loco',    row:4, frames:8, fps:8 },
        interact:      { sheet:'loco',    row:5, frames:8, fps:8,  loop:false },
        combo1:        { sheet:'combat',  row:0, frames:8, fps:16, loop:false },
        combo2:        { sheet:'combat',  row:1, frames:8, fps:16, loop:false },
        combo3:        { sheet:'combat',  row:2, frames:8, fps:16, loop:false },
        special:       { sheet:'combat',  row:3, frames:8, fps:14, loop:false },
        finisher_c:    { sheet:'combat',  row:4, frames:8, fps:10, loop:false },
        hurt:          { sheet:'damage',  row:0, frames:8, fps:14, loop:false },
        knockdown:     { sheet:'damage',  row:1, frames:8, fps:12, loop:false },
        recover:       { sheet:'damage',  row:2, frames:8, fps:10, loop:false },
        victory:       { sheet:'damage',  row:3, frames:8, fps:8 },
        defeated:      { sheet:'damage',  row:4, frames:8, fps:6,  loop:false },
        super1:        { sheet:'supers',  row:0, frames:8, fps:14, loop:false },
        super2:        { sheet:'supers',  row:1, frames:8, fps:14, loop:false },
        super3:        { sheet:'supers',  row:2, frames:8, fps:14, loop:false },
        finisher:      { sheet:'supers',  row:3, frames:8, fps:10, loop:false },
        td_idle_down:  { sheet:'topdown', row:0, frames:8, fps:6 },
        td_idle_up:    { sheet:'topdown', row:1, frames:8, fps:6 },
        td_idle_left:  { sheet:'topdown', row:2, frames:8, fps:6 },
        td_idle_right: { sheet:'topdown', row:3, frames:8, fps:6 },
        td_walk_down:  { sheet:'topdown', row:4, frames:8, fps:10 },
        td_walk_up:    { sheet:'topdown', row:5, frames:8, fps:10 },
        td_walk_left:  { sheet:'topdown', row:6, frames:8, fps:10 },
        td_walk_right: { sheet:'topdown', row:7, frames:8, fps:10 },
        vfx_hit_light: { sheet:'vfx', row:0, frames:8, fps:18, loop:false },
        vfx_hit_heavy: { sheet:'vfx', row:1, frames:8, fps:16, loop:false },
        vfx_arc:       { sheet:'vfx', row:2, frames:8, fps:16, loop:false },
        vfx_burst:     { sheet:'vfx', row:3, frames:8, fps:14, loop:false },
        vfx_shield:    { sheet:'vfx', row:4, frames:8, fps:12, loop:false },
        vfx_super:     { sheet:'vfx', row:5, frames:8, fps:14, loop:false },
        vfx_finisher:  { sheet:'vfx', row:6, frames:8, fps:10, loop:false },
        vfx_trail:     { sheet:'vfx', row:7, frames:8, fps:12, loop:false },
      }
    }
  };

  // ── Active VFX overlay queue ──────────────────────────────────────────────
  // Each entry: { charId, animKey, x, y, size, frame, timer, def }
  const _vfxQueue = [];

  // ── Pre-warm: kick off image loads for a character ─────────────────────────
  function preload(charId) {
    const def = CHAR_DEFS[charId];
    if (!def) return;
    Object.values(def.sheets).forEach(src => _img(src));
  }

  // ── Check if character has a sprite sheet ─────────────────────────────────
  function hasSprites(charId) { return !!CHAR_DEFS[charId]; }

  // ── Resolve which animation key to play given entity state ─────────────────
  function resolveAnim(charId, entity, isTopdown, lastDir) {
    const def = CHAR_DEFS[charId];
    if (!def) return null;
    const anims = def.anims;

    if (isTopdown) {
      const dir = lastDir || 'down';
      if (entity.dodging)   return anims['td_walk_' + dir] ? 'td_walk_' + dir : null;
      const moving = entity.vel
        ? (Math.abs(entity.vel.x) > 0.3 || Math.abs(entity.vel.y) > 0.3)
        : false;
      if (moving) return anims['td_walk_' + dir] ? 'td_walk_' + dir : null;
      return anims['td_idle_' + dir] ? 'td_idle_' + dir : null;
    }

    // Sidescroll priority: finisher > special > combo > hurt > dodge > block > run > walk > idle
    if (entity.finishering)             return anims.finisher    ? 'finisher'   : null;
    if (entity.superAnim === 1)         return anims.super1      ? 'super1'     : null;
    if (entity.superAnim === 2)         return anims.super2      ? 'super2'     : null;
    if (entity.superAnim === 3)         return anims.super3      ? 'super3'     : null;
    if (entity.specialAnim)             return anims.special     ? 'special'    : null;
    if (entity.comboStep === 3)         return anims.combo3      ? 'combo3'     : null;
    if (entity.comboStep === 2)         return anims.combo2      ? 'combo2'     : null;
    if (entity.attacking)               return anims.combo1      ? 'combo1'     : null;
    if (entity.hitstunFrames > 10)      return anims.hurt        ? 'hurt'       : null;
    if (entity.knocked)                 return anims.knockdown   ? 'knockdown'  : null;
    if (entity.hp <= 0)                 return anims.defeated    ? 'defeated'   : null;
    if (entity.dodging)                 return anims.dodge       ? 'dodge'      : null;
    if (entity.blocking)                return anims.block       ? 'block'      : null;
    const spd = entity.speed || 4;
    const moving = Math.abs(entity.vel ? entity.vel.x : 0) > spd * 0.5;
    if (entity.onGround === false)      return anims.run         ? 'run'        : null;
    if (moving)                         return anims.walk        ? 'walk'       : null;
    return anims.idle ? 'idle' : null;
  }

  // ── Update animation frame counter on an entity ───────────────────────────
  // Call once per game update tick. entity.spriteState is created/mutated here.
  function update(charId, entity, dt, isTopdown, lastDir) {
    const def = CHAR_DEFS[charId];
    if (!def) return;

    const animKey = resolveAnim(charId, entity, isTopdown, lastDir);
    if (!animKey) return;

    const animDef = def.anims[animKey];
    if (!animDef) return;

    if (!entity.spriteState) entity.spriteState = {};
    const ss = entity.spriteState;

    // Reset frame if animation changed
    if (ss.currentAnim !== animKey) {
      ss.currentAnim = animKey;
      ss.frame = 0;
      ss.frameTimer = 0;
    }

    ss.frameTimer = (ss.frameTimer || 0) + dt;
    const frameDur = 1 / (animDef.fps || 10);
    if (ss.frameTimer >= frameDur) {
      ss.frameTimer -= frameDur;
      const loop = animDef.loop !== false;
      if (loop) {
        ss.frame = (ss.frame + 1) % animDef.frames;
      } else {
        if (ss.frame < animDef.frames - 1) ss.frame++;
      }
    }
  }

  // ── Draw a character's current animation frame ────────────────────────────
  // Returns true if drawn from sprite sheet, false if no sheet available (use fallback).
  function draw(ctx, charId, entity, dx, dy, dw, dh, flipX) {
    const def = CHAR_DEFS[charId];
    if (!def || !entity.spriteState) return false;

    const ss = entity.spriteState;
    const animKey = ss.currentAnim;
    if (!animKey) return false;

    const animDef = def.anims[animKey];
    if (!animDef) return false;

    const sheetSrc = def.sheets[animDef.sheet];
    if (!sheetSrc) return false;

    const img = _img(sheetSrc);
    if (!img._ready) return false;

    const isVfx = animDef.sheet === 'vfx';
    const isTopdown = animDef.sheet === 'topdown';
    const srcW = isVfx ? def.vfxFrameW : (isTopdown ? def.tdFrameW : def.frameW);
    const srcH = isVfx ? def.vfxFrameH : (isTopdown ? def.tdFrameH : def.frameH);

    const sx = ss.frame * srcW;
    const sy = animDef.row * srcH;

    ctx.save();
    if (flipX) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, srcW, srcH, dx, dy, dw, dh);
    }
    ctx.restore();
    return true;
  }

  // ── VFX overlay system ────────────────────────────────────────────────────
  // Spawn a VFX animation at world coordinates
  function spawnVFX(charId, vfxKey, worldX, worldY, size) {
    const def = CHAR_DEFS[charId];
    if (!def) return;
    const animDef = def.anims[vfxKey];
    if (!animDef) return;
    _vfxQueue.push({
      charId, vfxKey, x: worldX, y: worldY,
      size: size || 80,
      frame: 0, frameTimer: 0, done: false,
      animDef
    });
  }

  function updateVFX(dt) {
    for (let i = _vfxQueue.length - 1; i >= 0; i--) {
      const v = _vfxQueue[i];
      v.frameTimer += dt;
      const dur = 1 / (v.animDef.fps || 14);
      if (v.frameTimer >= dur) {
        v.frameTimer -= dur;
        v.frame++;
        if (v.frame >= v.animDef.frames) {
          _vfxQueue.splice(i, 1);
        }
      }
    }
  }

  function renderVFX(ctx, cameraX, cameraY) {
    _vfxQueue.forEach(v => {
      const def = CHAR_DEFS[v.charId];
      if (!def) return;
      const sheetSrc = def.sheets[v.animDef.sheet];
      if (!sheetSrc) return;
      const img = _img(sheetSrc);
      if (!img._ready) return;

      const srcW = def.vfxFrameW || 160;
      const srcH = def.vfxFrameH || 160;
      const sx = v.frame * srcW;
      const sy = v.animDef.row * srcH;
      const drawX = v.x - cameraX - v.size / 2;
      const drawY = v.y - cameraY - v.size / 2;
      ctx.drawImage(img, sx, sy, srcW, srcH, drawX, drawY, v.size, v.size);
    });
  }

  // ── Frame size override (call if your sheets have non-default dimensions) ──
  function setFrameSize(charId, sheetKey, w, h) {
    const def = CHAR_DEFS[charId];
    if (!def) return;
    if (sheetKey === 'vfx')     { def.vfxFrameW = w; def.vfxFrameH = h; }
    else if (sheetKey === 'topdown') { def.tdFrameW = w; def.tdFrameH = h; }
    else                        { def.frameW = w; def.frameH = h; }
  }

  return {
    hasSprites, preload, update, draw,
    spawnVFX, updateVFX, renderVFX,
    setFrameSize, CHAR_DEFS
  };
})();

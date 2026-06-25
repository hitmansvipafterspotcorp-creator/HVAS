'use strict';
/**
 * UIElements — registry for all UI sprite sheet frames.
 * Source: assets/ui/frames/<sheet_name>/r<RR>_f<CC>.png
 * Each sheet is 8 cols x 4 rows = 32 transparent BGRA frame PNGs.
 *
 * Sheet names (match folder names):
 *   title_main_menu, frames_emblems, pause_menu, character_select,
 *   hud, venue_map_stage_select, dialogue_mission_reward,
 *   options_settings, build_summary
 *
 * Usage:
 *   UIElements.preload('hud', 'title_main_menu');
 *   UIElements.draw(ctx, 'hud', row, col, x, y, w, h);
 *   UIElements.drawIdx(ctx, 'frames_emblems', 3, x, y, w, h);  // linear index
 */
const UIElements = (() => {
  const SHEETS = [
    'title_main_menu',
    'frames_emblems',
    'pause_menu',
    'character_select',
    'hud',
    'venue_map_stage_select',
    'dialogue_mission_reward',
    'options_settings',
    'build_summary',
  ];
  const ROWS = 4;
  const COLS = 8;
  const BASE = 'assets/ui/frames/';
  const _cache = {};

  function _key(sheet, row, col) {
    return `${sheet}/r${String(row).padStart(2,'0')}_f${String(col).padStart(2,'0')}`;
  }

  function _load(sheet, row, col) {
    const k = _key(sheet, row, col);
    if (_cache[k]) return _cache[k];
    const img = new Image();
    img._ready = false; img._failed = false;
    img.onload  = () => { img._ready  = true; };
    img.onerror = () => { img._failed = true; };
    img.src = `${BASE}${sheet}/r${String(row).padStart(2,'0')}_f${String(col).padStart(2,'0')}.png`;
    _cache[k] = img;
    return img;
  }

  /** Get image by sheet + row + col, or null if not ready. */
  function get(sheet, row, col) {
    const img = _load(sheet, row, col);
    return (img && img._ready) ? img : null;
  }

  /** Get by linear index (0–31). row = floor(idx/8), col = idx%8 */
  function getIdx(sheet, idx) {
    return get(sheet, Math.floor(idx / COLS), idx % COLS);
  }

  /** Kick off all 32 frame loads for each named sheet. */
  function preload(...sheets) {
    sheets.forEach(sheet => {
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) _load(sheet, r, c);
    });
  }

  /**
   * Draw one UI frame (contain-fit) into a rect.
   * Falls back silently if not loaded.
   */
  function draw(ctx, sheet, row, col, x, y, w, h, opts) {
    const img = get(sheet, row, col);
    if (!img) return false;
    opts = opts || {};
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.shadow) { ctx.shadowColor = opts.shadow; ctx.shadowBlur = opts.shadowBlur || 16; }
    const ir = img.naturalWidth / img.naturalHeight;
    const rr = w / h;
    let dw, dh, dx, dy;
    if (ir > rr) { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
    else         { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  /** Draw by linear index. */
  function drawIdx(ctx, sheet, idx, x, y, w, h, opts) {
    return draw(ctx, sheet, Math.floor(idx / COLS), idx % COLS, x, y, w, h, opts);
  }

  /**
   * Draw decorative corner frames using frames_emblems sheet.
   */
  function drawCornerFrames(ctx, x, y, w, h, cornerSize) {
    const s = cornerSize || Math.min(w, h) * 0.12;
    draw(ctx, 'frames_emblems', 0, 0, x,         y,         s, s);
    draw(ctx, 'frames_emblems', 0, 1, x + w - s, y,         s, s);
    draw(ctx, 'frames_emblems', 0, 2, x,         y + h - s, s, s);
    draw(ctx, 'frames_emblems', 0, 3, x + w - s, y + h - s, s, s);
  }

  /**
   * Draw a character sprite preview using SpriteSystem.
   */
  function drawCharSprite(ctx, charId, x, y, w, h, opts) {
    if (typeof SpriteSystem === 'undefined') return false;
    opts = opts || {};
    const anim = opts.anim || 'idle';
    const t = opts.t || (Date.now() / 1000);
    return SpriteSystem.drawAnim(ctx, charId, anim, t, x, y, w, h, { facing: opts.facing || 1 });
  }

  // Preload the most-used sheets immediately
  preload('hud', 'frames_emblems', 'title_main_menu', 'character_select');

  return { get, getIdx, draw, drawIdx, drawCornerFrames, drawCharSprite, preload, SHEETS, ROWS, COLS };
})();
window.UIElements = UIElements;

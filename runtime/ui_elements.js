'use strict';
/**
 * UIElements — lazy image registry for all assets/ui/elements/ cutouts.
 *
 * Categories match the folder names produced by slice_ui_elements.py:
 *   title_menu, frames_emblems, pause_menu, character_select,
 *   hud, venue_map, dialogue_mission, options_settings
 *
 * Usage:
 *   UIElements.preload('hud', 'title_menu');
 *   const img = UIElements.get('hud', 0);   // null until loaded
 *   UIElements.draw(ctx, 'frames_emblems', 2, x, y, w, h);
 */
const UIElements = (() => {
  // Max elements per category (counts from slice run)
  const COUNTS = {
    title_menu:       57,
    frames_emblems:   28,
    pause_menu:       35,
    character_select: 44,
    hud:              30,
    venue_map:        36,
    dialogue_mission: 16,
    options_settings: 33,
  };

  const BASE = 'assets/ui/elements/';
  const _cache = {};   // "cat/NNN" → HTMLImageElement

  function _key(cat, idx) { return cat + '/' + String(idx).padStart(3, '0'); }

  function _load(cat, idx) {
    const k = _key(cat, idx);
    if (_cache[k]) return _cache[k];
    const img = new Image();
    img._ready = false; img._failed = false;
    img.onload  = () => { img._ready = true; };
    img.onerror = () => { img._failed = true; };
    img.src = `${BASE}${cat}/${cat}_${String(idx).padStart(3, '0')}.png`;
    _cache[k] = img;
    return img;
  }

  /** Get a loaded image or null if not yet ready / missing. */
  function get(cat, idx) {
    const img = _load(cat, idx);
    return (img && img._ready) ? img : null;
  }

  /** Returns how many elements the category has. */
  function count(cat) { return COUNTS[cat] || 0; }

  /** Kick off loads for every element in each named category. */
  function preload(...cats) {
    cats.forEach(cat => {
      const n = COUNTS[cat] || 0;
      for (let i = 0; i < n; i++) _load(cat, i);
    });
  }

  /**
   * Draw one element (contain-fit) into a rect.
   * Falls back silently if not loaded.
   */
  function draw(ctx, cat, idx, x, y, w, h, opts) {
    const img = get(cat, idx);
    if (!img) return false;
    opts = opts || {};
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.shadow) { ctx.shadowColor = opts.shadow; ctx.shadowBlur = opts.shadowBlur || 16; }
    // contain-fit
    const ir = img.naturalWidth / img.naturalHeight;
    const rr = w / h;
    let dw, dh, dx, dy;
    if (ir > rr) { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
    else         { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
    return true;
  }

  /**
   * Draw a decorative row of N elements from a category,
   * spaced evenly across [x, x+totalW].
   */
  function drawRow(ctx, cat, count, x, y, totalW, h, opts) {
    const n = COUNTS[cat] || 0;
    const step = totalW / Math.max(count - 1, 1);
    for (let i = 0; i < count; i++) {
      const idx = i % n;
      draw(ctx, cat, idx, x + i * step - h / 2, y, h, h, opts);
    }
  }

  /**
   * Draw four corner elements from frames_emblems category to frame a rect.
   * Great for menus, character select panels, etc.
   */
  function drawCornerFrames(ctx, x, y, w, h, cornerSize) {
    const n = COUNTS['frames_emblems'] || 0;
    if (!n) return;
    // pick 4 sequential elements that look like corners
    const picks = [0, 1, 2, 3].map(i => i % n);
    const s = cornerSize || Math.min(w, h) * 0.12;
    draw(ctx, 'frames_emblems', picks[0], x,         y,         s, s);
    draw(ctx, 'frames_emblems', picks[1], x + w - s, y,         s, s);
    draw(ctx, 'frames_emblems', picks[2], x,         y + h - s, s, s);
    draw(ctx, 'frames_emblems', picks[3], x + w - s, y + h - s, s, s);
  }

  /**
   * Draw a sprite preview for a character id using SpriteSystem.
   * Renders the idle frame of the loco sheet to an off-screen canvas,
   * then blits it to the target position.
   * Returns true if drawn.
   */
  function drawCharSprite(ctx, charId, x, y, w, h, opts) {
    if (typeof SpriteSystem === 'undefined') return false;
    opts = opts || {};
    const anim = opts.anim || (opts.topdown ? 'td_idle_s' : 'idle');
    return SpriteSystem.drawFrame(ctx, charId, anim, 0, x, y, w, h, { facing: opts.facing || 1 });
  }

  // Preload the most critical categories immediately (small sets used in menus)
  preload('hud', 'frames_emblems', 'title_menu');

  return { get, count, draw, drawRow, drawCornerFrames, drawCharSprite, preload };
})();
window.UIElements = UIElements;

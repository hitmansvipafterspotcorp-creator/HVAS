'use strict';
/**
 * PropRenderer — serves real prop cutout PNGs from assets/venues/props/.
 *
 * File naming (from slice_venue_props.py):
 *   assets/venues/props/<venue>/<mode>/<venue>_<mode>_NN.png
 *
 * Usage:
 *   PropRenderer.preload('kcs', 'outside');
 *   PropRenderer.draw(ctx, 'kcs', 'outside', propIndex, x, y, w, h);
 *
 * Venue map (HVAS venue id → prop folder name + mode):
 *   We map prop type names to slot indices, cycling through available cutouts.
 */
const PropRenderer = (() => {
  const BASE = 'assets/venues/props/';

  // How many prop files exist per venue/mode (from the slice run)
  const COUNTS = {
    'kcs/outside':             52,
    'kcs/inside':              32,
    'outta/outside':           60,
    'outta/inside':            50,
    'dukes/outside':           18,
    'dukes/inside':            23,
    'qhf/outside':             56,
    'qhf/inside':              37,
    'tally/outside':           63,
    'tally_den/inside':       121,
    'tally_itus/inside':      118,
    'tally_sammys/inside':     18,
    'tally_public_hall/inside':60,
    'tally_13rave/inside':     67,
  };

  // Map HVAS venue shortNames / ids to prop folder names
  const VENUE_FOLDER = {
    'CAFE 8FIFTY':   { folder:'kcs',    mode:'outside' },
    'HIBACHI STREET':{ folder:'outta',  mode:'outside' },
    'HVAS INTERIOR': { folder:'kcs',    mode:'inside'  },
    'KINGDOM COME':  { folder:'kcs',    mode:'inside'  },
    'SOCIAL GAINES': { folder:'outta',  mode:'inside'  },
    'SUCCESS POOL':  { folder:'outta',  mode:'inside'  },
    'TALLY ROW':     { folder:'tally',  mode:'outside' },
    'THE DEN':       { folder:'tally_den',        mode:'inside' },
    'THE ITUS':      { folder:'tally_itus',        mode:'inside' },
    'SAMMYS STAGE':  { folder:'tally_sammys',      mode:'inside' },
    'PUBLIC HALL':   { folder:'tally_public_hall', mode:'inside' },
    '13 RAVE':       { folder:'tally_13rave',      mode:'inside' },
    'DUKES & DIMES': { folder:'dukes',  mode:'inside'  },
    'QUICK HIT':     { folder:'qhf',    mode:'outside' },
    'ROOFTOP PKG':   { folder:'qhf',    mode:'outside' },
    'EVO FEST':      { folder:'tally',  mode:'outside' },
  };

  const _cache = {};  // "folder/mode/NNN" → HTMLImageElement

  function _fmtIdx(i) { return String(i).padStart(2, '0'); }

  function _load(folder, mode, idx) {
    const k = `${folder}/${mode}/${idx}`;
    if (_cache[k]) return _cache[k];
    const img = new Image();
    img._ready = false; img._failed = false;
    img.onload  = () => { img._ready = true; };
    img.onerror = () => { img._failed = true; };
    img.src = `${BASE}${folder}/${mode}/${folder}_${mode}_${_fmtIdx(idx)}.png`;
    _cache[k] = img;
    return img;
  }

  /** Kick off loads for first N props in a venue/mode. */
  function preload(folder, mode, n) {
    const max = COUNTS[`${folder}/${mode}`] || 0;
    const lim = Math.min(n || max, max);
    for (let i = 0; i < lim; i++) _load(folder, mode, i);
  }

  /** Resolve folder+mode from venue shortName. */
  function _resolve(shortName) {
    if (!shortName) return null;
    return VENUE_FOLDER[shortName] || null;
  }

  /**
   * Get image for a given folder/mode/index. Returns null until loaded.
   */
  function getImage(folder, mode, idx) {
    const img = _load(folder, mode, idx);
    return (img && img._ready) ? img : null;
  }

  /**
   * Draw a prop cutout image (contain-fit) at (x,y,w,h).
   * propSlot is an integer 0..N cycling through available images.
   * Returns true if drawn, false if image not yet ready (caller can draw fallback).
   */
  function draw(ctx, folder, mode, propSlot, x, y, w, h, opts) {
    const key = `${folder}/${mode}`;
    const total = COUNTS[key] || 0;
    if (!total) return false;
    const idx = propSlot % total;
    const img = getImage(folder, mode, idx);
    if (!img) return false;
    opts = opts || {};
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur  = opts.glowBlur || 14;
    }
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
   * High-level draw: given a venue shortName + propType name + slot offset,
   * resolve folder/mode automatically and draw.
   */
  function drawForVenue(ctx, shortName, propType, slotOffset, x, y, w, h, opts) {
    const res = _resolve(shortName);
    if (!res) return false;
    // Use propType string hash + slotOffset for consistent-but-varied assignment
    let hash = 0;
    for (let i = 0; i < propType.length; i++) hash = (hash * 31 + propType.charCodeAt(i)) & 0xffff;
    const slot = (hash + slotOffset) % Math.max(COUNTS[`${res.folder}/${res.mode}`] || 1, 1);
    return draw(ctx, res.folder, res.mode, slot, x, y, w, h, opts);
  }

  /** Preload props for a venue by shortName. */
  function preloadForVenue(shortName, n) {
    const res = _resolve(shortName);
    if (res) preload(res.folder, res.mode, n || 12);
  }

  return { getImage, draw, drawForVenue, preload, preloadForVenue, COUNTS, VENUE_FOLDER };
})();
window.PropRenderer = PropRenderer;

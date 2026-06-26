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
    'social_gaines/outside':   24,
    'social_gaines/inside':    11,
    'success/inside':          32,
  };

  // Map HVAS venue shortNames / ids to prop folder names
  // UNMIXED: each venue draws ONLY from its own art pack. mode follows the
  // venue's primary cameraType (sidescroll street = outside, topdown interior =
  // inside). Keys match venues.json shortNames exactly.
  // Cafe8Fifty + HVAS have no venue pack yet (only NPC sheets) — they point at
  // their own (not-yet-sliced) folders so they fall back cleanly instead of
  // borrowing another venue's props.
  const VENUE_FOLDER = {
    'CAFE8FIFTY':    { folder:'cafe8fifty',        mode:'outside' }, // pack pending
    'HVAS INTERIOR': { folder:'hvas',              mode:'inside'  }, // pack pending
    'KINGDOM COME':  { folder:'kcs',               mode:'inside'  },
    'SOCIAL GAINES': { folder:'social_gaines',     mode:'inside'  },
    'SUCCESS':       { folder:'success',           mode:'inside'  },
    'TALLY ROW':     { folder:'tally',             mode:'outside' },
    'THE DEN':       { folder:'tally_den',         mode:'inside'  },
    'THE ITUS':      { folder:'tally_itus',        mode:'inside'  },
    'SAMMYS STAGE':  { folder:'tally_sammys',      mode:'inside'  },
    'PUBLIC HALL':   { folder:'tally_public_hall', mode:'inside'  },
    '13 RAVE':       { folder:'tally_13rave',      mode:'inside'  },
    'DUKES & DIMES': { folder:'dukes',             mode:'inside'  },
    'QUICK HIT':     { folder:'qhf',               mode:'outside' },
  };

  const _cache = {};  // "folder/mode/key" → HTMLImageElement
  // Named-prop manifests (precise label-cut venues). folder/mode → [slug,...]
  // null = not loaded yet, false = no manifest (indexed venue), array = loaded.
  const _manifest = {};

  function _fmtIdx(i) { return String(i).padStart(2, '0'); }

  /** Load by explicit file key (index "07" or slug "dj_booth_main"). */
  function _loadKey(folder, mode, key) {
    const k = `${folder}/${mode}/${key}`;
    if (_cache[k]) return _cache[k];
    const img = new Image();
    img._ready = false; img._failed = false;
    img.onload  = () => { img._ready = true; };
    img.onerror = () => { img._failed = true; };
    img.src = `${BASE}${folder}/${mode}/${folder}_${mode}_${key}.png`;
    _cache[k] = img;
    return img;
  }

  function _load(folder, mode, idx) { return _loadKey(folder, mode, _fmtIdx(idx)); }

  /** Fetch a folder's named-prop manifest once (async). */
  function _loadManifest(folder, mode) {
    const key = `${folder}/${mode}`;
    if (_manifest[key] !== undefined) return;       // already fetched / fetching
    _manifest[key] = null;
    fetch(`${BASE}${folder}/${mode}/_manifest.json`)
      .then(r => r.ok ? r.json() : null)
      .then(j => { _manifest[key] = j ? Object.keys(j) : false; })
      .catch(() => { _manifest[key] = false; });
  }

  /** Kick off loads for first N props in a venue/mode. */
  function preload(folder, mode, n) {
    _loadManifest(folder, mode);
    const key = `${folder}/${mode}`;
    const slugs = _manifest[key];
    if (Array.isArray(slugs) && slugs.length) {
      const lim = Math.min(n || slugs.length, slugs.length);
      for (let i = 0; i < lim; i++) _loadKey(folder, mode, slugs[i]);
      return;
    }
    const max = COUNTS[key] || 0;
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
    return _blit(ctx, img, x, y, w, h, opts);
  }

  /** Contain-fit blit of a ready image into (x,y,w,h) with optional glow/alpha. */
  function _blit(ctx, img, x, y, w, h, opts) {
    opts = opts || {};
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur  = opts.glowBlur || 14;
    }
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
    _loadManifest(res.folder, res.mode);
    const mkey = `${res.folder}/${res.mode}`;
    const slugs = _manifest[mkey];
    // Named (precise) venue: match propType to the closest labelled prop.
    if (Array.isArray(slugs) && slugs.length) {
      const want = String(propType || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      let pick = slugs.indexOf(want);
      if (pick < 0) pick = slugs.findIndex(s => s.includes(want) || want.includes(s));
      if (pick < 0) {  // no semantic match → stable hash spread
        let hash = 0;
        for (let i = 0; i < want.length; i++) hash = (hash * 31 + want.charCodeAt(i)) & 0xffff;
        pick = (hash + slotOffset) % slugs.length;
      }
      const img = _loadKey(res.folder, res.mode, slugs[pick]);
      return (img && img._ready) ? _blit(ctx, img, x, y, w, h, opts) : false;
    }
    // Indexed (legacy) venue: hash propType + slotOffset across COUNTS.
    let hash = 0;
    for (let i = 0; i < propType.length; i++) hash = (hash * 31 + propType.charCodeAt(i)) & 0xffff;
    const slot = (hash + slotOffset) % Math.max(COUNTS[mkey] || 1, 1);
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

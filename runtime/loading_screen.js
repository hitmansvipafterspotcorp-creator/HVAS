'use strict';

// ── LOADING SCREEN ENGINE ──────────────────────────────────────────────────────
// Canvas-rendered transitions with per-venue color themes and rotating tips.
const LoadingScreen = (() => {
  const TIPS = [
    // Combat tips
    { tag: 'COMBAT',    text: 'Press Y + → to launch a PROJECTILE. Chip away from range.' },
    { tag: 'COMBAT',    text: 'Y + ↓ sends you RISING — use it to anti-air a jumping foe.' },
    { tag: 'COMBAT',    text: 'Y + ← dashes you FORWARD into the opponent\'s face.' },
    { tag: 'COMBAT',    text: 'Save your full meter for Y + ↑ — the FINISHER wins rounds.' },
    { tag: 'COMBAT',    text: 'Hit L, then cancel into H mid-combo for max damage.' },
    { tag: 'COMBAT',    text: 'Tap BLK the instant you\'re hit to break pressure strings.' },
    { tag: 'COMBAT',    text: 'Gatling system: L → H → SP. Dial them in fast.' },
    { tag: 'COMBAT',    text: 'Block in the air too — aerial pressure is real.' },
    // Story / lore
    { tag: 'LORE',      text: 'Kingdom Come Saloon opened as Tallahassee\'s first VIP lounge.' },
    { tag: 'LORE',      text: 'HITMANS VIP After Spot: where the real night begins after midnight.' },
    { tag: 'LORE',      text: 'Outta Pocket is the underground circuit. No cameras. No mercy.' },
    { tag: 'LORE',      text: 'Social Gaines is old money mixed with new hustle.' },
    { tag: 'LORE',      text: 'Success Pool Bar sits on the roof — sky is the floor here.' },
    { tag: 'LORE',      text: 'Hibachi Street Food Trucks run 24 hrs. Fuel before you fight.' },
    // VIP / status
    { tag: 'STATUS',    text: 'Earn VIP Points by clearing missions and bingo tiles.' },
    { tag: 'STATUS',    text: 'Lip Sync Bingo calls change every night. Stay sharp.' },
    { tag: 'STATUS',    text: 'Higher status unlocks new venues on the map.' },
    { tag: 'STATUS',    text: 'Complete the story ladder to unlock AFTERSPOT mode.' },
    // Training
    { tag: 'TRAINING',  text: 'Use Training mode (pause → TRAINING) to master your combos.' },
    { tag: 'TRAINING',  text: 'In Training mode the dummy never dies. Practice infinitely.' },
    { tag: 'TRAINING',  text: 'Open MOVE LIST mid-fight (pause) to refresh your memory.' },
  ];

  // Per-venue color themes (keyed by venue accent color from data/venues.json)
  const THEMES = {
    '#ff00aa': { bg: '#0a0010', accent: '#ff00aa', glow: '#ff44cc', label: 'CAFE8FIFTY' },
    '#ff6600': { bg: '#0f0008', accent: '#ff6600', glow: '#ff884d', label: 'HIBACHI STREET' },
    '#ffd700': { bg: '#1a0025', accent: '#ffd700', glow: '#ffe966', label: 'HVAS' },
    '#ffaa00': { bg: '#1a1000', accent: '#ffaa00', glow: '#ffcc44', label: 'KINGDOM COME' },
    '#44aaff': { bg: '#001520', accent: '#44aaff', glow: '#88ccff', label: 'SOCIAL GAINES' },
    '#00ccff': { bg: '#001a30', accent: '#00ccff', glow: '#66eeff', label: 'SUCCESS POOL' },
    '#cc44ff': { bg: '#060018', accent: '#cc44ff', glow: '#ee88ff', label: 'TALLY ROW' },
    '#ff2244': { bg: '#150005', accent: '#ff2244', glow: '#ff6680', label: 'RIVALS ARENA' },
    '#00ff88': { bg: '#001a10', accent: '#00ff88', glow: '#66ffbb', label: 'QUICK HIT FUEL' },
    '#ffffff': { bg: '#080010', accent: '#ff00aa', glow: '#ff44cc', label: '' },
  };

  const DEFAULT_THEME = { bg: '#050008', accent: '#ff00aa', glow: '#ff44cc', label: '' };

  let _canvas = null, _ctx = null;
  let _raf = null;
  let _startTime = 0;
  let _theme = DEFAULT_THEME;
  let _tip = TIPS[0];
  let _tipIdx = 0;
  let _onDone = null;
  let _duration = 1600; // ms total before callback fires
  let _progress = 0; // 0..1 driven externally via setProgress()
  let _phase = 'idle'; // idle | in | hold | out

  function _getCanvas() {
    if (_canvas) return _canvas;
    _canvas = document.createElement('canvas');
    _canvas.id = 'loading-screen-canvas';
    Object.assign(_canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%',
      zIndex: '9999', display: 'none', pointerEvents: 'none',
    });
    document.body.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    return _canvas;
  }

  function _resize() {
    _canvas.width  = window.innerWidth  || 1280;
    _canvas.height = window.innerHeight || 720;
  }

  // Pick a random tip
  function _nextTip() {
    _tipIdx = Math.floor(Math.random() * TIPS.length);
    _tip = TIPS[_tipIdx];
  }

  // Resolve theme from venue accent color or venue object
  function _resolveTheme(venueOrColor) {
    if (!venueOrColor) return DEFAULT_THEME;
    const color = typeof venueOrColor === 'string'
      ? venueOrColor
      : (venueOrColor.colors && (venueOrColor.colors.accent || venueOrColor.colors.neon));
    return THEMES[color] || DEFAULT_THEME;
  }

  // ── DRAW ──────────────────────────────────────────────────────────────────────
  function _draw(alpha) {
    const c = _ctx;
    const W = _canvas.width, H = _canvas.height;
    const t = _theme;
    const now = (performance.now() - _startTime) / 1000;

    // Background
    c.globalAlpha = alpha;
    c.fillStyle = t.bg;
    c.fillRect(0, 0, W, H);

    // Scanline overlay
    c.globalAlpha = alpha * 0.07;
    for (let y = 0; y < H; y += 4) {
      c.fillStyle = '#000';
      c.fillRect(0, y, W, 2);
    }
    c.globalAlpha = alpha;

    // Animated radial glow (venue-colored corona behind logo)
    const cx = W / 2, cy = H * 0.38;
    const pulse = 0.85 + 0.15 * Math.sin(now * 3.1);
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, W * 0.38 * pulse);
    grad.addColorStop(0,   _hexAlpha(t.glow, 0.28 * alpha));
    grad.addColorStop(0.5, _hexAlpha(t.accent, 0.10 * alpha));
    grad.addColorStop(1,   _hexAlpha(t.bg, 0));
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);

    // Crown / logo mark  (use the img if loaded, else glyphs)
    _drawLogo(c, cx, cy, alpha, t, now);

    // Venue name label (slides in from bottom)
    if (t.label) {
      const slide = Math.min(1, now * 2.5);
      c.globalAlpha = alpha * slide;
      c.font = `bold ${Math.round(H * 0.04)}px 'Rajdhani', monospace`;
      c.fillStyle = t.accent;
      c.shadowColor = t.glow;
      c.shadowBlur = 18;
      c.textAlign = 'center';
      c.fillText('NOW ENTERING  ·  ' + t.label, cx, cy + H * 0.19 + (1 - slide) * 30);
      c.shadowBlur = 0;
      c.globalAlpha = alpha;
    }

    // Progress bar
    _drawBar(c, W, H, alpha, t, now);

    // Tip row at bottom
    _drawTip(c, W, H, alpha, t, now);
  }

  function _drawLogo(c, cx, cy, alpha, t, now) {
    // If real icon already loaded (cached by AssetLoader or preloaded), draw it.
    const img = (typeof AssetLoader !== 'undefined') ? AssetLoader.get('icons/icon-512.png') : null;
    const size = Math.min(cy * 0.9, 160);

    if (img && img.complete && img.naturalWidth) {
      const s = size * (0.9 + 0.05 * Math.sin(now * 2.2));
      c.save();
      c.globalAlpha = alpha;
      // Glow ring
      c.shadowColor = t.glow;
      c.shadowBlur  = 28 + 10 * Math.sin(now * 2.2);
      c.drawImage(img, cx - s / 2, cy - s / 2, s, s);
      c.restore();
    } else {
      // Fallback: ♛ crown glyph
      const fontSize = Math.round(size * 0.9);
      c.save();
      c.globalAlpha = alpha;
      c.font = `${fontSize}px serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.shadowColor  = t.glow;
      c.shadowBlur   = 24 + 8 * Math.sin(now * 2.2);
      c.fillStyle    = t.accent;
      c.fillText('♛', cx, cy);
      c.restore();
    }
  }

  function _drawBar(c, W, H, alpha, t, now) {
    const barW = W * 0.55, barH = 5;
    const bx = (W - barW) / 2, by = H * 0.67;

    // Track
    c.globalAlpha = alpha * 0.25;
    c.fillStyle = t.accent;
    c.fillRect(bx, by, barW, barH);

    // Fill — animated shimmer
    const fill = _progress * barW;
    const shimmer = c.createLinearGradient(bx, by, bx + fill, by);
    shimmer.addColorStop(0,    t.accent);
    shimmer.addColorStop(0.8,  t.glow);
    shimmer.addColorStop(1,    '#fff');
    c.globalAlpha = alpha;
    c.fillStyle = shimmer;
    c.fillRect(bx, by, fill, barH);

    // Glow cap
    if (fill > 0) {
      c.shadowColor = t.glow;
      c.shadowBlur  = 10;
      c.fillStyle   = '#fff';
      c.fillRect(bx + fill - 3, by - 2, 4, barH + 4);
      c.shadowBlur  = 0;
    }

    // "LOADING…" label
    c.globalAlpha = alpha * (0.6 + 0.4 * Math.sin(now * 4));
    c.font = `${Math.round(H * 0.022)}px 'Rajdhani', monospace`;
    c.fillStyle = t.accent;
    c.textAlign = 'center';
    c.fillText('LOADING…', W / 2, by - 14);
    c.globalAlpha = alpha;
  }

  function _drawTip(c, W, H, alpha, t, now) {
    const fade = Math.min(1, now * 1.8);
    c.globalAlpha = alpha * fade * 0.92;

    const bH = H * 0.11;
    const by = H - bH;

    // Tip bar background
    const barGrad = c.createLinearGradient(0, by, 0, H);
    barGrad.addColorStop(0, _hexAlpha(t.bg, 0));
    barGrad.addColorStop(0.3, _hexAlpha(t.bg, 0.88));
    barGrad.addColorStop(1, _hexAlpha(t.bg, 0.95));
    c.fillStyle = barGrad;
    c.fillRect(0, by, W, bH);

    // Tag chip
    const tagFont = Math.round(H * 0.02);
    c.font = `bold ${tagFont}px 'Rajdhani', monospace`;
    c.fillStyle = t.accent;
    c.textAlign = 'left';
    const tag = '  ▶  ' + _tip.tag;
    c.fillText(tag, W * 0.06, H - bH * 0.55);

    // Tip text
    c.font = `${Math.round(H * 0.026)}px 'Rajdhani', monospace`;
    c.fillStyle = '#e8d5ff';
    c.fillText(_tip.text, W * 0.06, H - bH * 0.2);

    c.globalAlpha = alpha;
  }

  // ── ANIMATION LOOP ────────────────────────────────────────────────────────────
  function _loop(ts) {
    const elapsed = ts - _startTime;
    const fadeDur = 260; // ms for fade in / out

    let alpha = 1;
    if (_phase === 'in')  alpha = Math.min(1, elapsed / fadeDur);
    if (_phase === 'out') alpha = Math.max(0, 1 - elapsed / fadeDur);

    _draw(alpha);

    if (_phase === 'out' && alpha <= 0) {
      _canvas.style.display = 'none';
      _phase = 'idle';
      if (_onDone) { const cb = _onDone; _onDone = null; cb(); }
      return;
    }

    _raf = requestAnimationFrame(_loop);
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────────────

  /**
   * Show the loading screen with a given venue (or accent color string).
   * @param {object|string|null} venueOrAccent
   * @param {function} onDone  called after the screen fades out
   * @param {number}   [holdMs=1400]  how long to hold at full opacity before fading out
   */
  function show(venueOrAccent, onDone, holdMs = 1400) {
    _getCanvas();
    _resize();
    _theme = _resolveTheme(venueOrAccent);
    _nextTip();
    _progress = 0;
    _phase = 'in';
    _startTime = performance.now();
    _onDone = null; // clear; onDone fires after fade-out
    _canvas.style.display = 'block';

    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_loop);

    // After holdMs, start fade-out
    setTimeout(() => {
      _phase = 'out';
      _startTime = performance.now();
      _onDone = onDone || null;
    }, holdMs);
  }

  /**
   * Update the progress bar (0..1). Call while assets are loading.
   */
  function setProgress(v) {
    _progress = Math.max(0, Math.min(1, v));
  }

  /**
   * Instantly hide (no fade). Use only for emergency cleanup.
   */
  function hide() {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    if (_canvas) _canvas.style.display = 'none';
    _phase = 'idle';
    if (_onDone) { const cb = _onDone; _onDone = null; cb(); }
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  function _hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  window.addEventListener('resize', () => { if (_canvas) _resize(); });

  return { show, setProgress, hide };
})();

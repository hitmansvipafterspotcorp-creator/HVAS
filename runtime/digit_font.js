'use strict';
/**
 * DigitFont — renders live numbers using the real gold/purple digit art
 * (assets/ui/elements/hud/digit_0..9.png). Replaces ctx.fillText for HUD
 * numbers (damage, timer, combo, score) so they're sprite art, not a font.
 *
 *   DigitFont.draw(ctx, 1234, x, y, h, { align:'left'|'center'|'right', gap });
 *
 * Falls back to ctx.fillText automatically until the glyphs have loaded, so it
 * never renders blank.
 */
const DigitFont = (() => {
  const BASE = 'assets/ui/elements/hud/';
  const _img = {};
  function _glyph(d) {
    if (_img[d]) return _img[d];
    const im = new Image(); im._r = false;
    im.onload = () => { im._r = true; };
    im.src = `${BASE}digit_${d}.png`;
    _img[d] = im; return im;
  }
  function preload() { for (let d = 0; d < 10; d++) _glyph(d); }

  // measure total width of `str` rendered at glyph-height h
  function _measure(str, h, gap) {
    let w = 0;
    for (const c of str) {
      if (c >= '0' && c <= '9') {
        const g = _glyph(+c);
        if (g._r) w += h * (g.naturalWidth / g.naturalHeight) + gap;
        else w += h * 0.6 + gap;
      } else {
        w += h * 0.4 + gap;        // separators (",", ".", "-")
      }
    }
    return Math.max(0, w - gap);
  }

  /**
   * Draw a number/string. Returns true if drawn with art (all glyphs ready),
   * false if it used the text fallback (caller may ignore).
   */
  function draw(ctx, value, x, y, h, opts) {
    opts = opts || {};
    const gap = opts.gap != null ? opts.gap : h * 0.06;
    const str = String(value);
    const align = opts.align || 'left';
    const allReady = [...str].every(c => c < '0' || c > '9' || _glyph(+c)._r);
    if (!allReady) {
      // text fallback so numbers never disappear while art loads
      ctx.save();
      ctx.font = `900 ${h}px Orbitron, monospace`;
      ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      if (opts.color) ctx.fillStyle = opts.color; else ctx.fillStyle = '#ffd700';
      if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = 8; }
      ctx.fillText(str, x, y);
      ctx.restore();
      return false;
    }
    const total = _measure(str, h, gap);
    let cx = align === 'center' ? x - total/2 : align === 'right' ? x - total : x;
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = opts.glowBlur || 10; }
    for (const c of str) {
      if (c >= '0' && c <= '9') {
        const g = _glyph(+c);
        const gw = h * (g.naturalWidth / g.naturalHeight);
        ctx.drawImage(g, cx, y - h/2, gw, h);
        cx += gw + gap;
      } else {
        cx += h * 0.4 + gap;       // gap for separators (kept subtle)
      }
    }
    ctx.restore();
    return true;
  }

  return { draw, measure: _measure, preload };
})();
if (typeof window !== 'undefined') window.DigitFont = DigitFont;

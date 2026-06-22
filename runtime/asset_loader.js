'use strict';
/**
 * AssetLoader — lazy image registry for venue backdrops & character art.
 *
 * The game ships with vector/emoji fallbacks, so every draw path must work
 * whether or not a PNG exists. Call AssetLoader.get(path): it kicks off a
 * load the first time, returns the HTMLImageElement once decoded, or null
 * until then (and forever, if the file is missing). Callers draw the image
 * when non-null and fall back otherwise.
 */
const AssetLoader = (() => {
  const cache = {};   // path -> { img, ready, failed }

  function get(path) {
    if (!path) return null;
    let e = cache[path];
    if (!e) {
      e = cache[path] = { img: new Image(), ready: false, failed: false };
      e.img.onload  = () => { e.ready = true; };
      e.img.onerror = () => { e.failed = true; };
      e.img.src = path;
    }
    return e.ready ? e.img : null;
  }

  // draw an image to COVER a rect (fill, crop overflow) — like CSS object-fit:cover
  function drawCover(ctx, img, x, y, w, h) {
    if (!img || !img.width) return false;
    const ir = img.width / img.height, rr = w / h;
    let dw, dh, dx, dy;
    if (ir > rr) { dh = h; dw = h * ir; dx = x - (dw - w) / 2; dy = y; }
    else         { dw = w; dh = w / ir; dx = x; dy = y - (dh - h) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
    return true;
  }

  // draw an image to CONTAIN inside a rect (fit, letterbox) — preserves whole image
  function drawContain(ctx, img, x, y, w, h) {
    if (!img || !img.width) return false;
    const ir = img.width / img.height, rr = w / h;
    let dw, dh, dx, dy;
    if (ir > rr) { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2; }
    else         { dh = h; dw = h * ir; dx = x + (w - dw) / 2; dy = y; }
    ctx.drawImage(img, dx, dy, dw, dh);
    return true;
  }

  function preload(paths) { (paths || []).forEach(get); }

  return { get, drawCover, drawContain, preload };
})();
window.AssetLoader = AssetLoader;

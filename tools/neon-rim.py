#!/usr/bin/env python3
"""Turn the white keyline on the pink UI sprites into a neon rim.

THE PROBLEM. The sliced UI kit draws a light, desaturated stroke around the
outside of its buttons and plates. On the light sheet it was cut from that is a
crisp edge. On this app's near-black background it reads as a WHITE BORDER
around everything pink, which is the thing that looks cheap.

WHAT THIS DOES NOT DO. It does not delete the stroke — it is doing real work
separating the shape from the background, and a flat de-fringe leaves the art
looking soft. It does not touch highlights INSIDE the art, only the outer ring,
because a specular on a gold numeral is not a border. And it does not force one
brand colour: each sprite is measured for the hue of its OWN rim, so a violet
button glows violet.

WHAT IT DOES. Repaints the ring in that hue at the ring's own brightness (so the
bevel survives), then lays a soft bloom of the same hue underneath, which is the
actual difference between an outline and a glow.

  python3 tools/neon-rim.py            report only, writes nothing
  python3 tools/neon-rim.py --preview  write before/after strips to /tmp/rimshots
  python3 tools/neon-rim.py --apply    rewrite the assets in place
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', 'hitmans_vip_membership_app', 'public')
APPLY = '--apply' in sys.argv
PREVIEW = '--preview' in sys.argv
SHOTS = '/tmp/rimshots'

def ring_mask(a):
    """The OUTER ring only: opaque, and within 2px of transparency.

    Inside highlights are excluded by construction. That distinction is the
    whole reason this is safe to run over a hundred sprites."""
    shrunk = np.asarray(Image.fromarray(a).filter(ImageFilter.MinFilter(5)), dtype=np.uint8)
    return (a > 120) & (shrunk < 40)

def analyse(path):
    im = Image.open(path).convert('RGBA')
    arr = np.asarray(im).astype(np.float32)
    rgb, a = arr[..., :3], arr[..., 3].astype(np.uint8)
    ring = ring_mask(a)
    if ring.sum() < 60: return None

    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    lum = rgb.mean(2)

    white = ring & (lum > 190) & (sat < 0.22)
    # The rim's OWN colour, sampled from the coloured part of the same ring.
    col = ring & (sat > 0.40) & (mx > 70)
    if white.sum() < 40 or col.sum() < 60: return None

    px = rgb[col]
    norm = px / np.maximum(px.max(1, keepdims=True), 1)
    hue = norm.mean(0); hue = hue / max(hue.max(), 1e-6)
    # EVERY hue, not just the pink ones. An earlier pass restricted this to the
    # violet family, on the reading that "the pink UI" named a subset of the
    # art. It does not — it names how the app looks. The tier cards are green,
    # blue, violet and magenta, and the grey keyline is equally wrong on all
    # four; skipping three of them left the exact thing that was complained
    # about still on screen. Each sprite still glows in ITS OWN colour, which is
    # what stops this becoming a recolour.
    return im, arr, a, white, hue, int(white.sum()), float(white.sum()) / float(ring.sum())

def neonise(arr, a, white, hue):
    rgb = arr[..., :3]
    lum = rgb.mean(2)
    out = rgb.copy()
    tint = hue[None, :] * 255.0
    inten = np.clip((lum[white] - 175) / 80.0, 0, 1)[:, None]
    # Brightness survives as intensity; a little white stays at the very top end
    # so a corner specular still reads as one.
    out[white] = tint * (0.60 + 0.40 * inten) + 255.0 * (inten ** 3) * 0.30
    out = np.clip(out, 0, 255)

    blur = np.asarray(Image.fromarray(a).filter(ImageFilter.GaussianBlur(radius=3.0)), dtype=np.float32)
    halo = np.clip(blur * 0.40 - a.astype(np.float32) * 0.40, 0, 255)
    ga, ta = halo[..., None] / 255.0, a.astype(np.float32)[..., None] / 255.0
    oa = ta + ga * (1 - ta)
    orgb = np.where(oa > 0, (out * ta + tint * ga * (1 - ta)) / np.maximum(oa, 1e-6), 0)
    return Image.fromarray(np.dstack([orgb, oa * 255.0]).clip(0, 255).astype(np.uint8), 'RGBA')

def onblack(im, pad=8):
    bg = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (10, 9, 18, 255))
    bg.alpha_composite(im, (pad, pad)); return bg

# The logos are finished art and are not to be touched. They are also the one
# place a "rim" is a deliberate neon outline rather than a leftover keyline.
SKIP = ('hvas_logo', 'logo_badge', 'mm_logo', 'HITKOIN_LOGO', 'logo_lipsync')

used = [l.strip().lstrip('/') for l in open('/tmp/used.txt') if l.strip()]
used = [u for u in used if not any(k.lower() in u.lower() for k in SKIP)]
if PREVIEW: os.makedirs(SHOTS, exist_ok=True)
rows = []
for rel in used:
    p = os.path.normpath(os.path.join(ROOT, rel))
    if not os.path.exists(p): continue
    r = analyse(p)
    if not r: continue
    im, arr, a, white, hue, n, frac = r
    fixed = neonise(arr, a, white, hue)
    tint = '#%02x%02x%02x' % tuple(int(c * 255) for c in hue)
    rows.append((frac, n, tint, rel))
    if PREVIEW:
        b, f = onblack(im), onblack(fixed)
        strip = Image.new('RGBA', (b.width + f.width + 10, max(b.height, f.height)), (10, 9, 18, 255))
        strip.alpha_composite(b, (0, 0)); strip.alpha_composite(f, (b.width + 10, 0))
        strip.save(os.path.join(SHOTS, os.path.basename(rel)))
    if APPLY: fixed.save(p)

rows.sort(reverse=True)
print(f"{'white':>6} {'px':>5}  {'hue':<9} asset")
for frac, n, tint, rel in rows:
    print(f"{frac*100:>5.1f}% {n:>5}  {tint:<9} {os.path.basename(rel)}")
print(f"\n{len(rows)} pink assets carry a white rim"
      f"{' — REWRITTEN' if APPLY else (' — previews in ' + SHOTS if PREVIEW else ' (nothing written)')}")

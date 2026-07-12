#!/usr/bin/env python3
"""Compose the real membership price onto each full tier card using the
gold digit-glyph assets (source_16). Masks the baked '88.88', keeps the card's
'$', drops in the real whole-dollar price. Outputs full cards to the app.
"""
import os, numpy as np
from PIL import Image

ROOT = '/home/user/HVAS'
SRC = f'{ROOT}/assets/ui/complete_ui_set/sliced_clean/by_type/cards'
DST = f'{ROOT}/hitmans_vip_membership_app/public/assets/ui/complete_ui_set/sliced_clean/by_type/cards'

# digit char -> source_16 glyph file
GLYPH = {'0':'source_16_001_198x257','1':'source_16_002_131x262','2':'source_16_003_181x259',
         '3':'source_16_004_184x258','4':'source_16_005_210x257','5':'source_16_006_185x258',
         '6':'source_16_010_195x257','7':'source_16_007_189x256','8':'source_16_008_194x261',
         '9':'source_16_009_192x258'}
_glyph_cache = {}
def glyph(ch):
    if ch not in _glyph_cache:
        im = Image.open(f'{SRC}/{GLYPH[ch]}.png').convert('RGBA')
        a = np.array(im); ys, xs = np.where(a[:, :, 3] > 40)
        _glyph_cache[ch] = im.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))
    return _glyph_cache[ch]

# tier card -> price. Slot digit region (inside the $ ... boxes) is consistent.
CARDS = {
    'source_01_025_183x338': 20, 'source_01_026_183x338': 100, 'source_01_027_181x337': 300,
    'source_01_028_181x337': 1850, 'source_01_029_179x337': 5000,
}
# mask the WHOLE slot interior (all boxes + baked $88.88 + glow), then place the
# real price centered and large. RX = compose region, MX = mask region.
RX0, RX1, RY0, RY1 = 54, 168, 247, 291
MX0, MY0, MX1, MY1 = 47, 240, 174, 296

def slot_bg(arr, x0, x1, y0, y1):
    reg = arr[y0:y1, x0:x1, :3].reshape(-1, 3)
    bright = reg.sum(axis=1)
    dark = reg[bright < np.percentile(bright, 40)]
    return tuple(int(v) for v in np.median(dark, axis=0)) if len(dark) else (10, 6, 18)

for name, price in CARDS.items():
    card = Image.open(f'{SRC}/{name}.png').convert('RGBA')
    arr = np.array(card)
    bg = slot_bg(arr, MX0, MX1, MY0, MY1)
    # mask the baked digits + their glow halo
    d = Image.new('RGBA', card.size, (0, 0, 0, 0))
    from PIL import ImageDraw
    ImageDraw.Draw(d).rectangle([MX0, MY0, MX1, MY1], fill=bg + (255,))
    card.alpha_composite(d)
    # compose real digits
    s = str(price)
    crops = [glyph(c) for c in s]
    gap = 3; region_w = RX1 - RX0; region_h = RY1 - RY0
    th = region_h - 4
    def total_w(h):
        return sum(int(c.width * (h / c.height)) for c in crops) + gap * (len(crops) - 1)
    if total_w(th) > region_w:
        th = int(th * region_w / total_w(th))
    widths = [int(c.width * (th / c.height)) for c in crops]
    tw = sum(widths) + gap * (len(crops) - 1)
    x = RX0 + (region_w - tw) // 2
    y = RY0 + (region_h - th) // 2
    for c, w in zip(crops, widths):
        g = c.resize((max(1, w), th))
        card.alpha_composite(g, (x, y))
        x += w + gap
    card.save(f'{DST}/{name}.png')
    print(f'{name}: ${price}  bg={bg}')

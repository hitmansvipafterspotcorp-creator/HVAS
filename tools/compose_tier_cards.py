#!/usr/bin/env python3
"""Compose a clean, professional price onto each full tier card using the gold
digit-glyph assets (source_16) plus a matching gold '$'. Masks the baked
'88.88' odometer, then lays out '$' + real whole-dollar price with consistent
height and even spacing, vertically centered in the slot.
"""
import os, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = '/home/user/HVAS'
SRC = f'{ROOT}/assets/ui/complete_ui_set/sliced_clean/by_type/cards'
DST = f'{ROOT}/hitmans_vip_membership_app/public/assets/ui/complete_ui_set/sliced_clean/by_type/cards'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

GLYPH = {'0':'source_16_001_198x257','1':'source_16_002_131x262','2':'source_16_003_181x259',
         '3':'source_16_004_184x258','4':'source_16_005_210x257','5':'source_16_006_185x258',
         '6':'source_16_010_195x257','7':'source_16_007_189x256','8':'source_16_008_194x261',
         '9':'source_16_009_192x258'}

def _tight(im):
    a = np.array(im); ys, xs = np.where(a[:, :, 3] > 30)
    return im.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

_cache = {}
def glyph(ch):
    if ch not in _cache:
        _cache[ch] = _tight(Image.open(f'{SRC}/{GLYPH[ch]}.png').convert('RGBA'))
    return _cache[ch]

def dollar():
    """A gold '$' with a purple neon glow to match the digit glyphs."""
    if '$' in _cache:
        return _cache['$']
    h = 240
    font = ImageFont.truetype(FONT, h)
    W, H = h, int(h * 1.5)
    core = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(core).text((W//2, H//2), '$', font=font, anchor='mm',
                              fill=(255, 206, 74, 255), stroke_width=max(4, h//22), stroke_fill=(74, 26, 104, 255))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text((W//2, H//2), '$', font=font, anchor='mm',
                              fill=(178, 96, 255, 255), stroke_width=max(8, h//10), stroke_fill=(178, 96, 255, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(h//16))
    _cache['$'] = _tight(Image.alpha_composite(glow, core))
    return _cache['$']

CARDS = {
    'source_01_025_183x338': 20, 'source_01_026_183x338': 100, 'source_01_027_181x337': 300,
    'source_01_028_181x337': 1850, 'source_01_029_179x337': 5000,
}
# keep the card's own baked purple '$' (x~28-46); mask + fill only the digit
# boxes to its right, then lay the real digits just after the '$'.
MX0, MY0, MX1, MY1 = 49, 240, 174, 296
RX0, RX1, RY0, RY1 = 55, 170, 246, 292
GAP = 5
MAXH = 40

def slot_bg(arr):
    reg = arr[MY0:MY1, MX0:MX1, :3].reshape(-1, 3)
    b = reg.sum(axis=1); dark = reg[b < np.percentile(b, 40)]
    return tuple(int(v) for v in np.median(dark, axis=0)) if len(dark) else (8, 4, 16)

for name, price in CARDS.items():
    card = Image.open(f'{SRC}/{name}.png').convert('RGBA')
    bg = slot_bg(np.array(card))
    d = Image.new('RGBA', card.size, (0, 0, 0, 0))
    ImageDraw.Draw(d).rectangle([MX0, MY0, MX1, MY1], fill=bg + (255,))
    card.alpha_composite(d)

    region_w, region_h = RX1 - RX0, RY1 - RY0
    digits = [glyph(c) for c in str(price)]
    def total_w(hh):
        return sum(int(g.width * (hh / g.height)) for g in digits) + GAP * (len(digits) - 1)
    h = min(MAXH, region_h - 4)
    if total_w(h) > region_w:
        h = int(h * region_w / total_w(h))
    items = [g.resize((max(1, int(g.width * h / g.height)), h)) for g in digits]
    tw = sum(im.width for im in items) + GAP * (len(items) - 1)
    x = RX0 + max(0, (region_w - tw) // 2)   # centered in the digit region
    baseline = RY0 + (region_h + h) // 2
    for im in items:
        card.alpha_composite(im, (x, baseline - im.height))
        x += im.width + GAP
    card.save(f'{DST}/{name}.png')
    print(f'{name}: ${price}  h={h}')

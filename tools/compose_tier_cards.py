#!/usr/bin/env python3
"""Compose the real membership price into each tier card's odometer slot using
the BOXED price-digit assets (source_02 'boxed/stacked version'), which match
the card's slot boxes. Keeps the card's own '$', masks the placeholder '88.88',
and centers the real whole-dollar price. Per the 'MEMBERSHIP TIERS / PRICING'
design sheet.
"""
import os, glob, numpy as np
from PIL import Image, ImageDraw

ROOT = '/home/user/HVAS'
SRC = f'{ROOT}/assets/ui/complete_ui_set/sliced_clean/by_type/cards'
DST = f'{ROOT}/hitmans_vip_membership_app/public/assets/ui/complete_ui_set/sliced_clean/by_type/cards'

# boxed digit assets (source_02 063..072 = 0..9)
BOX = {'0':'063','1':'064','2':'065','3':'066','4':'067','5':'068','6':'069','7':'070','8':'071','9':'072'}

def _tight(im):
    a = np.array(im); ys, xs = np.where(a[:, :, 3] > 30)
    return im.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

_cache = {}
def boxed(ch):
    if ch not in _cache:
        f = glob.glob(f'{SRC}/source_02_{BOX[ch]}_*.png')[0]
        _cache[ch] = _tight(Image.open(f).convert('RGBA'))
    return _cache[ch]

CARDS = {
    'source_01_025_183x338': 20, 'source_01_026_183x338': 100, 'source_01_027_181x337': 300,
    'source_01_028_181x337': 1850, 'source_01_029_179x337': 5000,
}
MX0, MY0, MX1, MY1 = 49, 240, 174, 296   # mask (keeps the card's '$' at ~x28-46)
RX0, RX1, RY0, RY1 = 53, 171, 243, 295   # region for the boxed digits
GAP = 2

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
    digits = [boxed(c) for c in str(price)]
    def total_w(hh):
        return sum(int(g.width * hh / g.height) for g in digits) + GAP * (len(digits) - 1)
    h = region_h
    if total_w(h) > region_w:
        h = int(h * region_w / total_w(h))
    items = [g.resize((max(1, int(g.width * h / g.height)), h)) for g in digits]
    tw = sum(im.width for im in items) + GAP * (len(items) - 1)
    x = RX0 + (region_w - tw) // 2
    y = RY0 + (region_h - h) // 2
    for im in items:
        card.alpha_composite(im, (x, y))
        x += im.width + GAP
    card.save(f'{DST}/{name}.png')
    print(f'{name}: ${price}  boxh={h}')

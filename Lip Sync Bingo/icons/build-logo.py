#!/usr/bin/env python3
"""Lip Sync Bingo logo v2: Korey's exact crest (untouched) + measured LIP SYNC BINGO wordmark.
Near-black canvas matches the crest JPEG's own black corners so it blends seamlessly.
All text auto-fit and stacked by measured heights — nothing clips.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import shutil, os

SRC = os.path.expanduser('~/workspace/user/files/322_4_085z.png')
OUT = os.path.expanduser('~/workspace/lipsync-bingo-app/icons')
SERIF = '/usr/share/fonts/truetype/noto/NotoSerifDisplay-Black.ttf'

def F(size):
    return ImageFont.truetype(SERIF, size)

def spaced_width(draw, text, fnt, spacing):
    return sum(draw.textlength(ch, font=fnt) + spacing for ch in text) - (spacing if text else 0)

def fit_font(text, max_w, start, spacing_ratio=0.12):
    probe = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
    size = start
    while size > 20:
        f = F(size)
        if spaced_width(probe, text, f, int(size * spacing_ratio)) <= max_w:
            return f, int(size * spacing_ratio)
        size -= 6
    f = F(20)
    return f, 2

def render_text(text, fnt, spacing):
    """White spaced text on transparent layer, tightly cropped. Returns (layer, width, height)."""
    probe = ImageDraw.Draw(Image.new('RGBA', (10, 10)))
    w = int(spaced_width(probe, text, fnt, spacing)) + 8
    h = fnt.size * 2
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = 4
    for ch in text:
        d.text((x, 0), ch, font=fnt, fill=(255, 255, 255, 255))
        x += d.textlength(ch, font=fnt) + spacing
    bbox = layer.getbbox()
    return layer.crop(bbox) if bbox else layer

def gradient(size, top, bottom):
    g = Image.new('RGB', (max(1, size[0]), max(1, size[1])))
    px = g.load()
    h = g.size[1]
    for yy in range(h):
        t = yy / max(1, h - 1)
        col = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for xx in range(g.size[0]):
            px[xx, yy] = col
    return g

def gold_text(base, text, cx, y, max_w, start):
    f, sp = fit_font(text, max_w, start)
    m = render_text(text, f, sp)
    alpha = m.split()[3]
    # dark outline
    padded = Image.new('L', (m.size[0] + 10, m.size[1] + 10), 0)
    padded.paste(alpha, (5, 5))
    om = padded.filter(ImageFilter.MaxFilter(11))
    solid = Image.new('RGBA', om.size, (64, 40, 0, 255)); solid.putalpha(om)
    base.alpha_composite(solid, (cx - m.size[0] // 2 - 5, y - 5))
    grad = gradient(m.size, (255, 240, 165), (199, 133, 18))
    out = Image.new('RGBA', m.size, (0, 0, 0, 0)); out.paste(grad, (0, 0)); out.putalpha(alpha)
    base.alpha_composite(out, (cx - m.size[0] // 2, y))
    return m.size[1]

def neon_text(base, text, cx, y, max_w, start):
    f, sp = fit_font(text, max_w, start, spacing_ratio=0.10)
    m = render_text(text, f, sp)
    alpha = m.split()[3]
    x0 = cx - m.size[0] // 2
    PAD = 90
    for radius, sc in ((30, 200), (13, 230)):
        big = Image.new('L', (m.size[0] + PAD * 2, m.size[1] + PAD * 2), 0)
        big.paste(alpha.point(lambda a: int(a * sc / 255)), (PAD, PAD))
        glow = Image.new('RGBA', big.size, (178, 0, 255, 255))
        glow.putalpha(big.filter(ImageFilter.GaussianBlur(radius)))
        base.alpha_composite(glow, (x0 - PAD, y - PAD)); base.alpha_composite(glow, (x0 - PAD, y - PAD))
    grad = gradient(m.size, (255, 216, 255), (206, 34, 255))
    core = Image.new('RGBA', m.size, (0, 0, 0, 0)); core.paste(grad, (0, 0)); core.putalpha(alpha)
    base.alpha_composite(core, (x0, y))
    inner = alpha.point(lambda a: 255 if a > 205 else 0).filter(ImageFilter.GaussianBlur(1))
    hot = Image.new('RGBA', m.size, (255, 242, 255, 0)); hot.putalpha(inner.point(lambda a: int(a * 0.5)))
    base.alpha_composite(hot, (x0, y))
    return m.size[1]

def bg_canvas(W, H):
    img = Image.new('RGBA', (W, H), (4, 2, 10, 255))
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-W * 0.2, -H * 0.3, W * 1.2, H * 0.75], fill=(80, 0, 140, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(110))
    img.alpha_composite(glow)
    d = ImageDraw.Draw(img)
    for inset, col, wd in ((12, (158, 0, 240, 255), 5), (26, (96, 0, 148, 210), 2)):
        d.rounded_rectangle([inset, inset, W - inset, H - inset], radius=58, outline=col, width=wd)
    return img

def gold_rule(img, y, cx, half=280):
    d = ImageDraw.Draw(img)
    gold = (232, 184, 75, 255)
    d.line([cx - half, y, cx - 24, y], fill=gold, width=4)
    d.line([cx + 24, y, cx + half, y], fill=gold, width=4)
    s = 12
    d.polygon([(cx, y - s), (cx + s, y), (cx, y + s), (cx - s, y)], fill=(206, 110, 255, 255), outline=gold)

def build_master():
    W = H = 1024
    img = bg_canvas(W, H)
    crest = Image.open(SRC).convert('RGB')
    cs = 560
    crest_r = crest.resize((cs, cs), Image.LANCZOS).convert('RGBA')
    # feather the crest's outer edges so its black square melts into the canvas
    emask = Image.new('L', (cs, cs), 255)
    ed = ImageDraw.Draw(emask)
    ed.rounded_rectangle([0, 0, cs, cs], radius=90, outline=0, width=26)
    emask = emask.filter(ImageFilter.GaussianBlur(9))
    crest_r.putalpha(emask)
    img.alpha_composite(crest_r, ((W - cs) // 2, 26))
    y = 26 + cs + 26
    gold_rule(img, y + 6, W // 2)
    y += 30
    y += gold_text(img, 'LIP SYNC', W // 2, y, W - 170, 108) + 14
    neon_text(img, 'BINGO', W // 2, y, W - 150, 218)
    return img

def build_header():
    W, H = 1320, 380
    img = bg_canvas(W, H)
    crest = Image.open(SRC).convert('RGB').resize((332, 332), Image.LANCZOS)
    img.alpha_composite(crest.convert('RGBA'), (24, 24))
    gold_text(img, 'LIP SYNC', 838, 52, 820, 110)
    neon_text(img, 'BINGO', 838, 178, 820, 168)
    return img

os.makedirs(OUT, exist_ok=True)
master = build_master()
master.convert('RGB').save(f'{OUT}/logo-full.png')
master.resize((512, 512), Image.LANCZOS).convert('RGB').save(f'{OUT}/icon-512.png')
master.resize((192, 192), Image.LANCZOS).convert('RGB').save(f'{OUT}/icon-192.png')
build_header().convert('RGB').save(f'{OUT}/logo-header.png')
shutil.copy(SRC, f'{OUT}/crest-original.jpg')
print('built v2: logo-full.png, icon-512.png, icon-192.png, logo-header.png')

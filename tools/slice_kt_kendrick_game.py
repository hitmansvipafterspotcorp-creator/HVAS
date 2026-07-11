#!/usr/bin/env python3
"""Slice KT & Kendrick game frames from the clean transparent tsheet variants.

The tsheets are already background-keyed (unlike the opaque *_sheet0N),
width 1048 = 8*131, so columns are a fixed 131px grid. Rows aren't a clean
multiple, so detect row bands from the alpha row-projection, then per frame
keep the largest connected blob (+attached) and tight-crop -> matches the
other fighters' game frames.
"""
import os, cv2, numpy as np
from PIL import Image

OUT = os.environ.get('OUT', '/tmp/claude-0/-home-user-HVAS/5f454a96-0099-565b-ac0e-0b95c74bf45e/scratchpad/game_kt_kend')
COLS = 8

def row_bands(alpha, min_gap=6, min_band=40):
    rowsum = (alpha > 30).sum(axis=1)
    active = rowsum > (alpha.shape[1] * 0.01)  # a row of pixels with some content
    bands, start = [], None
    for y, on in enumerate(active):
        if on and start is None:
            start = y
        elif not on and start is not None:
            if y - start >= min_band:
                bands.append((start, y))
            start = None
    if start is not None and len(active) - start >= min_band:
        bands.append((start, len(active)))
    # merge bands separated by a tiny gap (< min_gap)
    merged = []
    for b in bands:
        if merged and b[0] - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(list(b))
    return [tuple(b) for b in merged]

def clean_cell(cell):
    a = cell[:, :, 3]
    mask = (a > 30).astype(np.uint8)
    n, lbl, st, ct = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return None
    areas = st[1:, cv2.CC_STAT_AREA]
    order = np.argsort(areas)[::-1] + 1
    main = order[0]
    if st[main, cv2.CC_STAT_AREA] < 200:
        return None
    mx, my, mw, mh, _ = st[main]
    ex = 6
    mb = (mx - ex, my - ex, mx + mw + ex, my + mh + ex)
    keep = {main}
    for cid in order[1:]:
        x, y, w, h, ar = st[cid]
        if ar < 25:
            continue
        if not (x > mb[2] or x + w < mb[0] or y > mb[3] or y + h < mb[1]):
            keep.add(cid)
    km = np.isin(lbl, list(keep))
    out = cell.copy(); out[~km] = 0
    ys, xs = np.where(km)
    return Image.fromarray(out[ys.min():ys.max()+1, xs.min():xs.max()+1], 'RGBA')

def slice_rows(path, want_rows, nrows):
    """want_rows: dict row_index -> anim_name. Fixed geometry: nrows evenly
    tall, 8 cols of 131px. Tight-crop each cell."""
    im = Image.open(path).convert('RGBA')
    arr = np.array(im)
    H, W = arr.shape[0], arr.shape[1]
    rh = H // nrows; cw = W // COLS
    result = {}
    for ri, anim in want_rows.items():
        y0, y1 = ri * rh, (ri + 1) * rh
        frames = [clean_cell(arr[y0:y1, c*cw:(c+1)*cw]) for c in range(COLS)]
        result[anim] = frames
    return result, nrows

# (path, want_rows, nrows): loco = 6 rows, combat = 4 rows
JOBS = {
    'kt': [
        ('assets/characters/kt_tsheet01_loco.png', {0: 'idle', 1: 'walk'}, 6),
        ('assets/characters/kt_tsheet02_combat.png', {0: 'atk'}, 4),
    ],
    'kendrick': [
        ('assets/characters/kendrick_tsheet01_loco.png', {0: 'idle', 1: 'walk'}, 6),
        ('assets/characters/kendrick_tsheet02_combat.png', {0: 'atk'}, 4),
    ],
}

def repair(frames, tag):
    """Replace source-glitch frames (thin slivers / full-row-height bleed)
    with the nearest good neighbor so the loop stays smooth."""
    ws = [f.width for f in frames]; hs = [f.height for f in frames]
    mw = sorted(ws)[len(ws)//2]; mh = sorted(hs)[len(hs)//2]
    good = [i for i, f in enumerate(frames)
            if f.width >= 0.5 * mw and f.height <= 1.3 * mh]
    for i, f in enumerate(frames):
        if i in good:
            continue
        # nearest good index
        near = min(good, key=lambda g: abs(g - i))
        print(f'  repair {tag}_{i} ({f.width}x{f.height}) <- {tag}_{near}')
        frames[i] = frames[near].copy()
    return frames

for fighter, sheets in JOBS.items():
    od = os.path.join(OUT, fighter); os.makedirs(od, exist_ok=True)
    for path, want, nrows in sheets:
        res, nb = slice_rows(path, want, nrows)
        print(f'{path}: {nb} rows')
        for anim, frames in res.items():
            if any(f is None for f in frames):
                frames = [f if f is not None else next(x for x in frames if x is not None) for f in frames]
            frames = repair(frames, f'{fighter}/{anim}')
            for i, fr in enumerate(frames):
                fr.save(f'{od}/{anim}_{i}.png')
    print('done', fighter)

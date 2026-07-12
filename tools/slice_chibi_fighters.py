#!/usr/bin/env python3
"""Slice the chibi KT & Kendrick sprite sheets into the fighter frames the game
loads (idle_0..7, walk_0..7, atk_0..7).

Content-adaptive, no hand-typed rectangles: the left banner/label column is
found from the foreground column profile, row bands from the row profile, and
each row is segmented into 8 sprites with cv2 connected components. Backgrounds
are keyed by border-connected flood fill so interior light areas (KT's white
cap) are preserved.

Source sheets live on the gracious-rubin branch; extract them to a temp dir and
point SHEETS at them. Output goes straight into the app's public fighter dirs.
"""
import numpy as np, cv2, os
from PIL import Image

OUT = '/home/user/HVAS/hitmans_vip_membership_app/public/assets/game/fighters'

# sheet path, bg mode, and which sprite rows map to which anim
SHEETS = {
    'kendrick': {
        'loco':  ('chibi/img_0.png', 'white'),
        'combat':('chibi/img_1.png', 'white'),
    },
    'kt': {
        'loco':  ('chibi/img_11.png', 'kt'),
        'combat':('chibi/img_10.png', 'kt'),
    },
}
SCRATCH = '/tmp/claude-0/-home-user-HVAS/5f454a96-0099-565b-ac0e-0b95c74bf45e/scratchpad'


def _bgcand(a, mode):
    mx = a.max(2); mn = a.min(2); sat = mx - mn; val = mx
    if mode == 'white':
        return (mn > 192)                       # white / light checker
    return (val > 150) & (sat < 42)             # kt: light checker / white ONLY (never black)


def coarse_fg(rgb, mode):
    """Loose character mask for locating the grid/rows (profiles only)."""
    a = np.array(rgb).astype(int)
    mx = a.max(2); mn = a.min(2); sat = mx - mn; val = mx
    if mode == 'white':
        fg = (mn <= 192)
    else:  # exclude light checker and the near-black outer frame
        fg = (sat > 30) | ((val > 45) & (val < 148))
    return fg.astype('uint8')


def key_region(rgb_region, mode):
    """Border-connected background key within a cropped region: the light
    background touches the crop edge and is removed; interior light (KT's white
    cap) is an island and is preserved; dark clothing is always foreground."""
    a = np.array(rgb_region).astype(int)
    bgcand = _bgcand(a, mode).astype('uint8')
    n, lab = cv2.connectedComponents(bgcand, 8)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    bg = np.isin(lab, list(border))
    fg = (~bg).astype('uint8')
    # de-speckle only: remove isolated single pixels without eroding thin legs
    fg = cv2.medianBlur(fg, 3)
    return fg


def grid_left(fg):
    """First x where a clean vertical gap is followed by sustained sprite area."""
    prof = fg.mean(0)
    W = len(prof)
    for x in range(150, W // 2):
        if prof[x - 5:x + 1].mean() < 0.04 and prof[x + 4:x + 44].mean() > 0.15:
            return x + 2
    return 316


def row_bands(fg, empty_thresh=0.03):
    """Sprite-row bands from an accurate fg mask: split only at true gaps (runs
    of near-empty rows) so thin legs/feet stay inside the band; drop short bands
    (frame-number labels, title bars). `empty_thresh` is the row fill fraction
    below which a row counts as background — higher for noisy checker sheets
    (KT) whose inter-row gaps carry label/text specks, lower for clean white."""
    prof = fg.mean(1)
    empty = prof < empty_thresh
    bands = []; s = None; gap = 0
    for y in range(len(prof)):
        if empty[y]:
            gap += 1
            if s is not None and gap >= 6:
                bands.append((s, y - gap + 1)); s = None
        else:
            gap = 0
            if s is None:
                s = y
    if s is not None:
        bands.append((s, len(prof)))
    return [(a, b) for a, b in bands if b - a > 60]


def segment_band(grgb, gfg, y0, y1, want=8):
    """Split one sprite row into frames by empty-column gaps (robust to thin
    horizontal baselines that would merge connected components). The leftmost
    block is any row-label pill, so keep the rightmost `want` runs."""
    band = gfg[y0:y1]
    colprof = band.mean(0)
    on = colprof > 0.06
    runs = []; s = None
    for x in range(len(on)):
        if on[x] and s is None:
            s = x
        elif not on[x] and s is not None:
            runs.append((s, x)); s = None
    if s is not None:
        runs.append((s, len(on)))
    if runs:
        med = np.median([b - a for a, b in runs])
        runs = [(a, b) for a, b in runs if (b - a) > 0.45 * med]   # drop specks
        # split any run much wider than one sprite (two merged)
        out = []
        for a, b in runs:
            k = max(1, round((b - a) / (med * 1.25)))
            if k == 1:
                out.append((a, b))
            else:
                step = (b - a) // k
                for j in range(k):
                    out.append((a + j * step, a + (j + 1) * step if j < k - 1 else b))
        # drop short runs (row-label pills like ORDER_UP_JAB) by fg height
        def run_h(a, b):
            ys = np.where(band[:, a:b].any(1))[0]
            return ys.max() - ys.min() + 1 if len(ys) else 0
        hs = [run_h(a, b) for a, b in out]
        if hs:
            medh = np.median(hs)
            out = [rb for rb, h in zip(out, hs) if h > 0.55 * medh]
        runs = out[-want:]                       # sprites are right of any label pill
    arr = np.array(grgb); frames = []
    for (x0, x1) in runs:
        m = gfg[y0:y1, x0:x1].copy()
        # keep the sprite body; drop the detached frame-number label / specks below
        n, lab, stats = cv2.connectedComponentsWithStats(m, 8)[:3]
        if n > 1:
            big = max(range(1, n), key=lambda i: stats[i][4])
            keep = [i for i in range(1, n) if stats[i][4] >= 0.10 * stats[big][4]]
            m = np.isin(lab, keep).astype('uint8')
        sub = arr[y0:y1, x0:x1]
        ys, xs = np.where(m)
        if len(xs) == 0:
            continue
        rgba = np.dstack([sub, m * 255]).astype('uint8')
        frames.append(Image.fromarray(rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1], 'RGBA'))
    return frames


def load(path):
    return Image.open(os.path.join(SCRATCH, path)).convert('RGB')


def process(char):
    cfg = SHEETS[char]
    out_dir = os.path.join(OUT, char)
    os.makedirs(out_dir, exist_ok=True)
    result = {}

    def grid_of(path, mode):
        im = load(path)
        gl = grid_left(coarse_fg(im, mode)); gr = im.width - 40
        grgb = im.crop((gl, 0, gr, im.height))      # sprite-grid columns, full height
        gfg = key_region(grgb, mode)                # one accurate keyed mask
        et = 0.03 if mode == 'white' else 0.22      # noisy checker needs a higher gap floor
        return grgb, gfg, et

    # LOCO: band 0 -> idle, band 1 -> walk
    grgb, gfg, et = grid_of(*cfg['loco'])
    bands = row_bands(gfg, et)
    result['idle'] = segment_band(grgb, gfg, *bands[0])
    result['walk'] = segment_band(grgb, gfg, *bands[1])
    # COMBAT: band 0 -> atk
    grgb, gfg, et = grid_of(*cfg['combat'])
    bands = row_bands(gfg, et)
    result['atk'] = segment_band(grgb, gfg, *bands[0])
    # write, padding each anim's frames to a common (max) canvas, feet-anchored
    for anim, frames in result.items():
        frames = frames[:8]
        while len(frames) < 8:            # guard: repeat last if a sprite was missed
            frames.append(frames[-1].copy())
        maxh = max(f.height for f in frames)
        maxw = max(f.width for f in frames)
        for i, f in enumerate(frames):
            canvas = Image.new('RGBA', (maxw, maxh), (0, 0, 0, 0))
            canvas.alpha_composite(f, ((maxw - f.width) // 2, maxh - f.height))  # bottom-center
            canvas.save(os.path.join(out_dir, f'{anim}_{i}.png'))
        print(f'{char}/{anim}: {len(frames)} frames  canvas={maxw}x{maxh}')


if __name__ == '__main__':
    for c in ('kendrick', 'kt'):
        process(c)

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
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    return fg


def grid_left(fg):
    """First x where a clean vertical gap is followed by sustained sprite area."""
    prof = fg.mean(0)
    W = len(prof)
    for x in range(150, W // 2):
        if prof[x - 5:x + 1].mean() < 0.04 and prof[x + 4:x + 44].mean() > 0.15:
            return x + 2
    return 316


def row_bands(fg, x0, x1):
    """Contiguous horizontal bands of sprite content within the grid columns."""
    prof = fg[:, x0:x1].mean(1)
    on = prof > 0.06
    bands = []; s = None
    for y, v in enumerate(on):
        if v and s is None:
            s = y
        elif not v and s is not None:
            if y - s > 40:
                bands.append((s, y))
            s = None
    if s is not None and len(on) - s > 40:
        bands.append((s, len(on)))
    return bands


def segment_row(rgb, mode, y0, y1, x0, x1, want=8):
    band_rgb = rgb.crop((x0, y0, x1, y1))
    fg = key_region(band_rgb, mode)              # clean alpha within the band
    band = cv2.morphologyEx(fg.copy(), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(band, 8)
    H = y1 - y0
    comps = [(s[0], s[1], s[2], s[3], cent[i][0]) for i, s in enumerate(stats)
             if i > 0 and s[4] >= 500 and s[3] >= 0.4 * H]
    comps.sort(key=lambda c: c[4])
    if comps:
        med = np.median([c[2] for c in comps]); out = []
        for x, y, w, h, cx in comps:
            k = max(1, round(w / (med * 1.25)))
            if k == 1:
                out.append((x, y, w, h))
            else:
                for j in range(k):
                    out.append((x + j * w // k, y, w // k, h))
        # sprites occupy the right of the row; any extra blobs are the left-hand
        # row-label pill/icon (KT), so keep the rightmost `want` after ordering.
        out.sort(key=lambda c: c[0])
        comps = out[-want:]
    arr = np.array(band_rgb); frames = []
    for (x, y, w, h) in comps:
        sub = arr[y:y + h, x:x + w]; m = fg[y:y + h, x:x + w]
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
    # LOCO: band 0 -> idle, band 1 -> walk
    loco_path, mode = cfg['loco']
    im = load(loco_path); cfg_fg = coarse_fg(im, mode)
    gl = grid_left(cfg_fg); gr = im.width - 40
    bands = row_bands(cfg_fg, gl, gr)
    result['idle'] = segment_row(im, mode, *bands[0], gl, gr)
    result['walk'] = segment_row(im, mode, *bands[1], gl, gr)
    # COMBAT: band 0 -> atk
    cb_path, mode = cfg['combat']
    im = load(cb_path); cfg_fg = coarse_fg(im, mode)
    gl = grid_left(cfg_fg); gr = im.width - 40
    bands = row_bands(cfg_fg, gl, gr)
    result['atk'] = segment_row(im, mode, *bands[0], gl, gr)
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

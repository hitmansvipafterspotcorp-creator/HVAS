#!/usr/bin/env python3
"""
Slice every character sprite sheet into individual frame PNGs.

Input:  assets/characters/<char>_sheet<N>_<type>.png
Output: assets/characters/frames/<char>/<type>/r<row>_f<frame>.png

All sheets are 1448x1086. Left annotation panel is 297px wide (= X_OFFSET).
Actual frame grid starts at x=297: 8 columns × ROWS rows per sheet type.
  Frame width  = (1448 - 297) // 8 = 143 px
  Frame height = 1086 // rows

Reads with IMREAD_UNCHANGED so pre-transparent sprites keep their alpha.
For solid-background sheets, applies color-based make_alpha_mask.
"""
import os, cv2, numpy as np, glob, re

SRC     = 'assets/characters'
OUT     = 'assets/characters/frames'
COLS    = 8
# Measured from the numbered column headers (1..8) on the source sheets: the
# 8-frame grid starts at x=346 with a 131px stride. There is a ~56px right
# margin, so frame width is NOT (W - X_OFFSET)//COLS — deriving it from the
# full width made every column drift right, capturing ~1.5 characters by the
# last cell, and left the per-row label badges bleeding into column 0.
GRID_X0  = 346   # left edge of frame column 0 (px)
FRAME_W  = 131   # per-column stride / cell width (px)
X_OFFSET = GRID_X0   # kept for legacy logging


def clear_left_annotation(alpha):
    """Column 0 only: drop a leftmost annotation badge (row label like WALK /
    'x Jab' / class icon) that is separated from the character by an empty
    vertical band. Finds the rightmost near-empty column inside the left 45%
    that still has content to its left, and clears everything left of it."""
    h, w = alpha.shape
    colhas = (alpha > 16).sum(axis=0)
    limit = int(w * 0.45)
    cut = 0
    for x in range(limit, 0, -1):
        if colhas[x] <= max(1, int(h * 0.01)) and colhas[:x].max() > h * 0.03:
            cut = x
            break
    if cut:
        alpha[:, :cut] = 0
    return alpha


def clear_top_banner(alpha):
    """Row 0 only: drop a top title banner / numbered column header separated
    from the character by an empty horizontal band (top 30% of the cell)."""
    h, w = alpha.shape
    rowhas = (alpha > 16).sum(axis=1)
    limit = int(h * 0.30)
    cut = 0
    for y in range(limit, 0, -1):
        if rowhas[y] <= max(1, int(w * 0.01)) and rowhas[:y].max() > w * 0.03:
            cut = y
            break
    if cut:
        alpha[:cut, :] = 0
    return alpha

# ── ML background removal (rembg / U^2-Net) — professional-grade matting ─────
# Far cleaner than colour heuristics on flat illustrations with painted
# floors/shadows. Falls back to the flood-fill heuristic if rembg is missing.
_REMBG = None
def _get_rembg():
    global _REMBG
    if _REMBG is None:
        try:
            from rembg import new_session, remove
            _REMBG = (new_session('u2net'), remove)
        except Exception as e:
            print(f'  rembg unavailable ({e}); using heuristic mask')
            _REMBG = False
    return _REMBG

def rembg_alpha(crop_bgr):
    """Return an alpha channel (HxW uint8) via rembg, or None if unavailable."""
    r = _get_rembg()
    if not r:
        return None
    sess, remove = r
    rgb = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2RGB)
    out = remove(rgb, session=sess, post_process_mask=True)
    arr = np.array(out)
    if arr.ndim == 3 and arr.shape[2] == 4:
        return arr[:, :, 3]
    return None

# Known row counts per sheet type
TYPE_ROWS = {
    'loco':    6,
    'combat':  5,
    'damage':  5,
    'supers':  4,
    'topdown': 8,
    'vfx':     8,
}

# Sheet filename pattern: <char>_sheet<N>_<type>.png
PATTERN = re.compile(r'^(.+)_sheet\d+_(\w+)\.png$')

def autocrop_alpha(img_bgra):
    """Tight-crop a BGRA image to its non-transparent bounding box + 4px pad."""
    alpha = img_bgra[:, :, 3]
    rows = np.any(alpha > 8, axis=1)
    cols = np.any(alpha > 8, axis=0)
    if not rows.any():
        return img_bgra
    r0, r1 = np.where(rows)[0][[0, -1]]
    c0, c1 = np.where(cols)[0][[0, -1]]
    pad = 4
    h, w = img_bgra.shape[:2]
    r0 = max(0, r0 - pad); r1 = min(h - 1, r1 + pad)
    c0 = max(0, c0 - pad); c1 = min(w - 1, c1 + pad)
    return img_bgra[r0:r1+1, c0:c1+1]

def is_checkerboard(img_bgr, sample_size=60):
    """Return True if the image background is a near-black/near-white checkerboard."""
    H, W = img_bgr.shape[:2]
    # Sample corners where background is guaranteed to exist
    corners = [
        img_bgr[0:sample_size, 0:sample_size],
        img_bgr[0:sample_size, W-sample_size:W],
    ]
    matched = 0
    total = 0
    for region in corners:
        rh, rw = region.shape[:2]
        for y in range(rh):
            for x in range(rw):
                px = region[y, x].astype(np.int32)
                lum = int(px.mean())
                expected_dark = (x + y) % 2 == 0
                if expected_dark:
                    if lum < 60:
                        matched += 1
                else:
                    if lum > 180:
                        matched += 1
                total += 1
    return (matched / max(1, total)) > 0.65


def make_alpha_mask_checkerboard(img_bgr):
    """Remove checkerboard (Photoshop-style transparency indicator) background.
    Uses coordinate-parity to identify background pixels, then keeps saturated
    or non-neutral pixels as foreground character content."""
    H, W = img_bgr.shape[:2]
    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    sat = img_hsv[:, :, 1]   # 0-255
    val = img_hsv[:, :, 2]   # 0-255

    # Checkerboard pixel: expected dark at (x+y)%2==0, light at (x+y)%2==1
    ys, xs = np.mgrid[0:H, 0:W]
    parity = (xs + ys) % 2  # 0 = expected dark, 1 = expected light
    lum = img_bgr.astype(np.float32).mean(axis=2)

    dark_match  = (parity == 0) & (lum < 55)
    light_match = (parity == 1) & (lum > 185)
    is_checker  = dark_match | light_match

    # Foreground: high saturation OR not checkerboard-colored
    fg = (sat > 28) | (~is_checker & (lum > 40) & (lum < 220))
    mask = fg.astype(np.uint8)

    # Clean up noise
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k2)
    # Fill interior holes
    h, w = mask.shape
    ff = mask.copy()
    mm = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mm, (0, 0), 1)
    mask = (mask | (1 - ff)).astype(np.uint8)
    alpha = cv2.GaussianBlur((mask * 255).astype(np.uint8), (3, 3), 0)
    return alpha


def make_alpha_mask(img_bgr):
    """Build alpha mask — auto-detects checkerboard vs solid background.

    Professional flat-illustration cutout: BORDER FLOOD-FILL. The character is an
    interior island; the background (including painted floor/shadow/wall, which
    may be several different colours) is whatever is connected to the frame edge.
    We flood-fill inward from every border pixel with a colour tolerance, so all
    border-connected background is removed while the character is preserved. This
    fixes the opaque 'floor slab' the old single-colour distance mask left under
    the character's feet.
    """
    if is_checkerboard(img_bgr):
        return make_alpha_mask_checkerboard(img_bgr)
    H, W = img_bgr.shape[:2]
    img = img_bgr.astype(np.uint8)

    # floodFill fills pixels connected to a seed whose colour is within
    # loDiff/upDiff of the SEED. Run it from a ring of border seeds so multi-tone
    # backgrounds (gradient sky, floor, shadow) all get caught.
    filled = np.zeros((H, W), np.uint8)           # 1 = background
    tol = (32, 32, 32)
    seeds = []
    step = max(4, W // 16)
    for x in range(0, W, step):
        seeds.append((x, 0)); seeds.append((x, H - 1))
    step = max(4, H // 16)
    for y in range(0, H, step):
        seeds.append((0, y)); seeds.append((W - 1, y))
    for (sx, sy) in seeds:
        if filled[sy, sx]:
            continue
        ffmask = np.zeros((H + 2, W + 2), np.uint8)
        # only fill where not already background
        ffmask[1:-1, 1:-1] = filled
        cv2.floodFill(img.copy(), ffmask, (sx, sy), 0,
                      loDiff=tol, upDiff=tol,
                      flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
        filled |= (ffmask[1:-1, 1:-1] > 0).astype(np.uint8)

    fg = (filled == 0).astype(np.uint8)           # character = NOT background

    # Clean up: drop tiny speckles, keep the largest connected component(s)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k2)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE,
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # Fill interior holes inside the character
    h, w = fg.shape
    ff = fg.copy()
    mm = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mm, (0, 0), 1)
    fg = (fg | (1 - ff)).astype(np.uint8)

    # Keep only the largest component (the character) to drop stray bg islands
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 1:
        biggest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        fg = (lab == biggest).astype(np.uint8)

    alpha = cv2.GaussianBlur((fg * 255).astype(np.uint8), (3, 3), 0)
    return alpha

total_frames = 0
total_sheets = 0
skipped = 0

for path in sorted(glob.glob(f'{SRC}/*.png')):
    fname = os.path.basename(path)
    m = PATTERN.match(fname)
    if not m:
        skipped += 1
        continue

    char_name = m.group(1)
    sheet_type = m.group(2)
    rows = TYPE_ROWS.get(sheet_type)
    if rows is None:
        img_test = cv2.imread(path)
        if img_test is None: continue
        h = img_test.shape[0]
        rows = 8 if h <= 1100 and h // 8 >= 100 else 6
        print(f'  INFERRED rows={rows} for {sheet_type}')

    # Load with alpha so pre-transparent sheets keep their channel
    img_full = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img_full is None:
        print(f'  FAILED to read {fname}')
        continue

    H, W = img_full.shape[:2]
    has_alpha = img_full.ndim == 4 and img_full.shape[2] == 4

    frame_w = FRAME_W
    frame_h = H // rows

    dest = f'{OUT}/{char_name}/{sheet_type}'
    os.makedirs(dest, exist_ok=True)

    sheet_frames = 0
    for row in range(rows):
        for col in range(COLS):
            x0 = GRID_X0 + col * frame_w
            y0 = row * frame_h
            crop = img_full[y0:y0 + frame_h, x0:x0 + frame_w]

            if has_alpha:
                # Use the original alpha channel directly
                bgra = crop.copy()
                alpha_ch = bgra[:, :, 3]
            else:
                crop_bgr = crop[:, :, :3] if crop.ndim == 4 else crop
                # Primary: ML matting (rembg). Fallback: flood-fill heuristic.
                alpha_ch = rembg_alpha(crop_bgr)
                if alpha_ch is None:
                    alpha_ch = make_alpha_mask(crop_bgr)
                bgra = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2BGRA)
                bgra[:, :, 3] = alpha_ch

            # Strip annotation bleed: row-label badges live in column 0, title
            # banners / numbered headers live across the top of row 0.
            if col == 0:
                alpha_ch = clear_left_annotation(alpha_ch)
            if row == 0:
                alpha_ch = clear_top_banner(alpha_ch)
            bgra[:, :, 3] = alpha_ch

            # Professional sprite pipeline: every frame is a UNIFORM cell
            # (frame_w x frame_h) with the character's feet anchored at the
            # cell bottom. We do NOT tight-crop per frame — that destroys the
            # anchor and makes the character jitter/scale between frames.
            # Blank frames are written as a full-size transparent cell so the
            # animation keeps a constant frame size.
            if alpha_ch.mean() < 4:
                blank = np.zeros((frame_h, frame_w, 4), np.uint8)
                cv2.imwrite(f'{dest}/r{row:02d}_f{col:02d}.png', blank)
                sheet_frames += 1
                continue

            # Guarantee exact uniform cell dimensions
            if bgra.shape[0] != frame_h or bgra.shape[1] != frame_w:
                fixed = np.zeros((frame_h, frame_w, 4), np.uint8)
                hh = min(bgra.shape[0], frame_h); ww = min(bgra.shape[1], frame_w)
                fixed[:hh, :ww] = bgra[:hh, :ww]
                bgra = fixed
            out_path = f'{dest}/r{row:02d}_f{col:02d}.png'
            cv2.imwrite(out_path, bgra)
            sheet_frames += 1

    total_frames += sheet_frames
    total_sheets += 1
    print(f'{char_name:30s} / {sheet_type:8s}  → {sheet_frames} frames  ({frame_w}x{frame_h} src, x_off={X_OFFSET})')

print(f'\nDONE: {total_sheets} sheets → {total_frames} frame PNGs  ({skipped} skipped non-sheet files)')

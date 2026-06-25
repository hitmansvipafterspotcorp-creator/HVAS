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
X_OFFSET = 297   # annotation panel width (pixels)

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
    """Build alpha mask — auto-detects checkerboard vs solid background."""
    if is_checkerboard(img_bgr):
        return make_alpha_mask_checkerboard(img_bgr)
    H, W = img_bgr.shape[:2]
    # Sample frame CORNERS to detect background — not the full frame, which can be
    # dominated by a photorealistic character's own colors (e.g. KT skin tones).
    pad = max(8, min(20, H // 8, W // 8))
    corner_samples = np.concatenate([
        img_bgr[0:pad, 0:pad].reshape(-1, 3),
        img_bgr[0:pad, W-pad:W].reshape(-1, 3),
        img_bgr[H-pad:H, 0:pad].reshape(-1, 3),
        img_bgr[H-pad:H, W-pad:W].reshape(-1, 3),
    ], axis=0)
    vals, counts = np.unique(corner_samples // 8, axis=0, return_counts=True)
    bg = vals[counts.argmax()].astype(np.float32) * 8 + 4
    dist = np.linalg.norm(img_bgr.astype(np.int16) - bg, axis=2)
    mask = (dist > 30).astype(np.uint8)
    # Close small holes
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k2)
    # Fill interior holes via flood fill
    h, w = mask.shape
    ff = mask.copy()
    mm = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mm, (0, 0), 1)
    mask = (mask | (1 - ff)).astype(np.uint8)
    alpha = cv2.GaussianBlur((mask * 255).astype(np.uint8), (3, 3), 0)
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

    frame_w = (W - X_OFFSET) // COLS
    frame_h = H // rows

    dest = f'{OUT}/{char_name}/{sheet_type}'
    os.makedirs(dest, exist_ok=True)

    sheet_frames = 0
    for row in range(rows):
        for col in range(COLS):
            x0 = X_OFFSET + col * frame_w
            y0 = row * frame_h
            crop = img_full[y0:y0 + frame_h, x0:x0 + frame_w]

            if has_alpha:
                # Use the original alpha channel directly
                bgra = crop.copy()
                alpha_ch = bgra[:, :, 3]
            else:
                # Detect background and build alpha mask
                alpha_ch = make_alpha_mask(crop[:, :, :3] if crop.ndim == 4 else crop)
                bgra = cv2.cvtColor(crop[:, :, :3] if crop.ndim == 4 else crop,
                                    cv2.COLOR_BGR2BGRA)
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

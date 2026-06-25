#!/usr/bin/env python3
"""
Slice every character sprite sheet into individual frame PNGs.

Input:  assets/characters/<char>_sheet<N>_<type>.png
Output: assets/characters/frames/<char>/<type>/r<row>_f<frame>.png

All sheets are 1448x1086, NO annotation panel.
Frame grid: 8 columns x ROWS rows (varies by sheet type).
"""
import os, cv2, numpy as np, glob, re

SRC  = 'assets/characters'
OUT  = 'assets/characters/frames'
COLS = 8

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

def make_alpha_mask(img_bgr):
    """Build alpha mask from color + edge (same technique as prop slicer)."""
    H, W = img_bgr.shape[:2]
    small = cv2.resize(img_bgr, (W // 6, H // 6)).reshape(-1, 3)
    vals, counts = np.unique(small // 8, axis=0, return_counts=True)
    bg = vals[counts.argmax()].astype(np.float32) * 8 + 4
    dist = np.linalg.norm(img_bgr.astype(np.int16) - bg, axis=2)
    mask = (dist > 30).astype(np.uint8)
    # Close small holes
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
    # Feather
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
        # Try to infer from height
        img_test = cv2.imread(path)
        if img_test is None: continue
        h = img_test.shape[0]
        rows = 8 if h <= 1100 and h // 8 >= 100 else 6
        print(f'  INFERRED rows={rows} for {sheet_type}')

    img = cv2.imread(path)
    if img is None:
        print(f'  FAILED to read {fname}')
        continue

    H, W = img.shape[:2]
    frame_w = W // COLS
    frame_h = H // rows

    dest = f'{OUT}/{char_name}/{sheet_type}'
    os.makedirs(dest, exist_ok=True)

    sheet_frames = 0
    for row in range(rows):
        for col in range(COLS):
            x0 = col * frame_w
            y0 = row * frame_h
            crop = img[y0:y0 + frame_h, x0:x0 + frame_w]

            # Build BGRA with alpha mask
            alpha = make_alpha_mask(crop)
            bgra = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
            bgra[:, :, 3] = alpha

            # Skip frames that are essentially blank
            if alpha.mean() < 4:
                # Write a 1x1 transparent placeholder so indices stay consistent
                blank = np.zeros((1, 1, 4), np.uint8)
                cv2.imwrite(f'{dest}/r{row:02d}_f{col:02d}.png', blank)
                continue

            # Autocrop to content
            cropped = autocrop_alpha(bgra)
            out_path = f'{dest}/r{row:02d}_f{col:02d}.png'
            cv2.imwrite(out_path, cropped)
            sheet_frames += 1

    total_frames += sheet_frames
    total_sheets += 1
    print(f'{char_name:30s} / {sheet_type:8s}  → {sheet_frames} frames  ({frame_w}x{frame_h} src)')

print(f'\nDONE: {total_sheets} sheets → {total_frames} frame PNGs  ({skipped} skipped non-sheet files)')

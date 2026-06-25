#!/usr/bin/env python3
"""
Slice every UI sprite sheet into individual frame PNGs.

Input:  assets/ui/ui_sheet_<N>_<name>.png
Output: assets/ui/frames/<sheet_name>/r<row>_f<frame>.png

All sheets are 1448x1086, 8 columns x 4 rows = 32 frames each.
Applies alpha masking (background removal) + autocrop + 4px pad.
"""
import os, cv2, numpy as np, glob, re

SRC  = 'assets/ui'
OUT  = 'assets/ui/frames'
COLS = 8
ROWS = 4

PATTERN = re.compile(r'^ui_sheet_\d+_(.+)\.png$')

def autocrop_alpha(img_bgra):
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
    H, W = img_bgr.shape[:2]
    small = cv2.resize(img_bgr, (W // 6, H // 6)).reshape(-1, 3)
    vals, counts = np.unique(small // 8, axis=0, return_counts=True)
    bg = vals[counts.argmax()].astype(np.float32) * 8 + 4
    dist = np.linalg.norm(img_bgr.astype(np.int16) - bg, axis=2)
    mask = (dist > 22).astype(np.uint8)  # lower threshold for UI elements
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    k2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k2)
    h, w = mask.shape
    ff = mask.copy()
    mm = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mm, (0, 0), 1)
    mask = (mask | (1 - ff)).astype(np.uint8)
    alpha = cv2.GaussianBlur((mask * 255).astype(np.uint8), (3, 3), 0)
    return alpha

total_frames = 0
total_sheets = 0

for path in sorted(glob.glob(f'{SRC}/ui_sheet_*.png')):
    fname = os.path.basename(path)
    m = PATTERN.match(fname)
    if not m:
        continue

    sheet_name = m.group(1)
    img = cv2.imread(path)
    if img is None:
        print(f'  FAILED to read {fname}')
        continue

    H, W = img.shape[:2]
    frame_w = W // COLS
    frame_h = H // ROWS

    dest = f'{OUT}/{sheet_name}'
    os.makedirs(dest, exist_ok=True)

    sheet_frames = 0
    for row in range(ROWS):
        for col in range(COLS):
            x0 = col * frame_w
            y0 = row * frame_h
            crop = img[y0:y0 + frame_h, x0:x0 + frame_w]

            alpha = make_alpha_mask(crop)
            bgra = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
            bgra[:, :, 3] = alpha

            if alpha.mean() < 4:
                blank = np.zeros((1, 1, 4), np.uint8)
                cv2.imwrite(f'{dest}/r{row:02d}_f{col:02d}.png', blank)
                continue

            cropped = autocrop_alpha(bgra)
            cv2.imwrite(f'{dest}/r{row:02d}_f{col:02d}.png', cropped)
            sheet_frames += 1

    total_frames += sheet_frames
    total_sheets += 1
    print(f'{sheet_name:40s} → {sheet_frames} frames  ({frame_w}x{frame_h} src)')

print(f'\nDONE: {total_sheets} UI sheets → {total_frames} frame PNGs')

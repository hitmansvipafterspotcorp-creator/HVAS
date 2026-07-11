#!/usr/bin/env python3
"""Clean the 19 venue backgrounds for gameplay:
 - flatten any transparency onto the dark game backdrop (kills checkerboard edges)
 - trim near-white production margins from the borders (kills the white bands/labels)
Operates in place on the app's public venue pngs.
"""
import os, glob, numpy as np
from PIL import Image

DST = '/home/user/HVAS/hitmans_vip_membership_app/public/assets/game/venues'
DARK = (8, 4, 14)

def near_white(line):  # line: (N,3) uint8
    return (line > 236).all(axis=1).mean() > 0.90

def _last_white(lines, limit):
    """Index just past the last near-white line within the leading `limit`."""
    last = -1
    for i in range(min(limit, len(lines))):
        if near_white(lines[i]):
            last = i
    return last + 1

def trim_white_borders(arr):
    H, W, _ = arr.shape
    # scan up to 25% in from each edge; crop past any white production band,
    # even when a thin dark label edge precedes it.
    top = _last_white([arr[y] for y in range(int(H * 0.25))], int(H * 0.25))
    bot = H - _last_white([arr[H - 1 - y] for y in range(int(H * 0.25))], int(H * 0.25))
    left = _last_white([arr[:, x] for x in range(int(W * 0.25))], int(W * 0.25))
    right = W - _last_white([arr[:, W - 1 - x] for x in range(int(W * 0.25))], int(W * 0.25))
    return arr[top:bot, left:right]

for p in sorted(glob.glob(f'{DST}/*.png')):
    im = Image.open(p).convert('RGBA')
    a = np.array(im)
    # flatten onto dark
    rgb = a[:, :, :3].astype(float)
    al = (a[:, :, 3:4].astype(float)) / 255.0
    flat = (rgb * al + np.array(DARK) * (1 - al)).astype(np.uint8)
    flat = trim_white_borders(flat)
    out = Image.fromarray(flat, 'RGB')
    before = im.size
    out.save(p)
    if before != out.size:
        print(f'{os.path.basename(p)}: {before} -> {out.size} (trimmed)')
    else:
        print(f'{os.path.basename(p)}: flattened {out.size}')

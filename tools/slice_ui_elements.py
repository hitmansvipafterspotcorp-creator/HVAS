#!/usr/bin/env python3
"""Slice HITMANS VIP AFTER SPOT UI kit sheets into per-category BGRA cutouts.

Input:  assets/ui/ui_sheet_0N_*.png
Output: assets/ui/elements/<category>/<name>_NN.png

Excluded: ui_sheet_10_build_summary.png (reference doc only)
"""
import os, cv2, numpy as np, glob

SRC = 'assets/ui'
OUT = 'assets/ui/elements'

# sheet -> output category folder
SHEETS = [
    ('ui_sheet_01_title_main_menu',    'title_menu'),
    ('ui_sheet_02_frames_emblems',     'frames_emblems'),
    ('ui_sheet_03_pause_menu',         'pause_menu'),
    ('ui_sheet_04_character_select',   'character_select'),
    ('ui_sheet_05_hud',                'hud'),
    ('ui_sheet_06_venue_map_stage_select', 'venue_map'),
    ('ui_sheet_07_dialogue_mission_reward','dialogue_mission'),
    ('ui_sheet_09_options_settings',   'options_settings'),
]

def mask_color(img):
    H,W = img.shape[:2]
    small = cv2.resize(img,(W//6,H//6)).reshape(-1,3)
    vals,counts = np.unique(small//8,axis=0,return_counts=True)
    bg = vals[counts.argmax()].astype(np.float32)*8+4
    dist = np.linalg.norm(img.astype(np.int16)-bg, axis=2)
    d = (dist>40).astype(np.uint8)
    return cv2.morphologyEx(d,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(3,3)))

def mask_edge(gray):
    e = cv2.dilate(cv2.Canny(gray,40,120),cv2.getStructuringElement(cv2.MORPH_RECT,(3,3)))
    return (e>0).astype(np.uint8)

def fill_holes(m):
    h,w=m.shape; ff=m.copy(); mm=np.zeros((h+2,w+2),np.uint8)
    cv2.floodFill(ff,mm,(0,0),1)
    return (m|(1-ff)).astype(np.uint8)

def segment_scene(M, W, H, y_lo, y_hi):
    sub = M[y_lo:y_hi].copy()
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(5,5))
    sub = cv2.morphologyEx(sub,cv2.MORPH_CLOSE,k)
    n,lbl,stats,_ = cv2.connectedComponentsWithStats(sub,8)
    boxes = []
    for i in range(1,n):
        x,y,w,h,area = stats[i]
        if area < 300: continue
        if area > W*(y_hi-y_lo)*0.30: continue
        if w > 0.85*W: continue
        boxes.append((x, y+y_lo, x+w, y+y_lo+h))
    return boxes

def emit(img, M, boxes, dest, prefix):
    H,W = img.shape[:2]
    os.makedirs(dest, exist_ok=True)
    idx = 0
    for (x0,y0,x1,y1) in boxes:
        w,h = x1-x0, y1-y0
        ar = h/w if w>0 else 99
        if w < 18 or h < 18: continue
        if ar > 4.0 or ar < 0.10: continue
        pad = 4
        ax0,ay0 = max(0,x0-pad),max(0,y0-pad)
        ax1,ay1 = min(W,x1+pad),min(H,y1+pad)
        crop = img[ay0:ay1,ax0:ax1]
        cm = M[ay0:ay1,ax0:ax1]
        if cm.mean() < 0.05: continue
        cmf = cv2.morphologyEx(cm,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
        cmf = fill_holes(cmf)
        cmf = cv2.morphologyEx(cmf,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
        bgra = cv2.cvtColor(crop,cv2.COLOR_BGR2BGRA)
        bgra[:,:,3] = cmf*255
        # feather edges
        af = cv2.GaussianBlur((cmf*255).astype(np.uint8),(3,3),0)
        bgra[:,:,3] = np.minimum(bgra[:,:,3], af)
        cv2.imwrite(f'{dest}/{prefix}_{idx:03d}.png', bgra)
        idx += 1
    return idx

counts = {}
for sheet, cat in SHEETS:
    p = f'{SRC}/{sheet}.png'
    if not os.path.exists(p):
        print(f'  MISSING {sheet}'); continue
    img = cv2.imread(p); H,W = img.shape[:2]
    gray = cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    Mc = mask_color(img)
    Me = mask_edge(gray)
    # skip top header strip
    yl, yh = int(H*0.06), int(H*0.96)
    boxes = segment_scene(Mc, W, H, yl, yh)
    # if too few, try edge mask blobs
    if len(boxes) < 4:
        boxes2 = segment_scene(Me, W, H, yl, yh)
        if len(boxes2) > len(boxes):
            boxes = boxes2; M = Me
        else:
            M = Mc
    else:
        M = Mc
    dest = f'{OUT}/{cat}'
    n = emit(img, M, boxes, dest, cat)
    counts[cat] = n
    print(f'{cat:30s} {n}')

print(f'TOTAL {sum(counts.values())}')

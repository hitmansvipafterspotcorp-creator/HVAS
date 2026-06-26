#!/usr/bin/env python3
"""Label-anchored prop cutter (precise replacement for blob slicing).

Every venue pack sheet is a labeled catalog: each prop has its name printed in
snake_case directly *beneath* it (FACADE_LEFT_WING, DJ_BOOTH_MAIN, ...), laid
out in a near-grid on a transparent checkerboard background. Section titles
(BACKDROPS, DOORS, SIGNAGE, ...) sit on dark/coloured banner bars.

Pipeline per sheet:
  1. OCR (pytesseract) -> caption tokens with bounding boxes.
  2. Keep captions that sit on the light checker bg (props); drop banner
     headers (dark/coloured bg behind the text) and the top title strip.
  3. Cluster captions into rows; per caption derive the cell ABOVE it,
     bounded horizontally by neighbour captions and vertically by the row above.
  4. Tight-mask the prop inside the cell (remove checker -> alpha), crop to
     content, save as <venue>_<mode>_<slug>.png  (named, not indexed).

Output: assets/venues/props/<venue>/<mode>/<venue>_<mode>_<slug>.png
plus a per-folder _manifest.json  ({slug: caption}) for the renderer.

Usage:
  python3 tools/cut_props_labeled.py <sheet_stem> <venue> <mode> [--debug]
  python3 tools/cut_props_labeled.py --all     # every sheet in SHEETS below
"""
import os, sys, re, json, cv2, numpy as np
import pytesseract
from pytesseract import Output

SRC = 'assets/venues'
OUT = 'assets/venues/props'

# (sheet_stem, venue, mode) — prop-source sheets only (no finished/route/map).
SHEETS = [
 ('cafe8fifty_pack_01_outside_core','cafe8fifty','outside'),
 ('cafe8fifty_pack_02_outside_access','cafe8fifty','outside'),
 ('cafe8fifty_pack_03_outside_signage','cafe8fifty','outside'),
 ('cafe8fifty_pack_04_outside_components','cafe8fifty','outside'),
 ('hvas_pack_05_inside_core','hvas','inside'),
 ('hvas_pack_06_inside_specialty','hvas','inside'),
]

# ── caption helpers ────────────────────────────────────────────────────────
def slug(s):
    s = s.strip().lower().lstrip("'`‘’")
    s = re.sub(r'[^a-z0-9]+', '_', s).strip('_')
    return s

def is_prop_caption(text):
    """Real prop names are snake_case (have an underscore) or a single lowercase
    word token; banner headers are spaced ALL-CAPS words."""
    t = text.strip()
    if '_' in t:
        return True
    # single-word prop labels (STREETLAMP) — allow if one token, not a known header word
    HEADERS = {'backdrops','doors','signage','windows','greenery','planters',
               'trim','architectural','core','facade','structure','tiles','ground',
               'street','objects','lot','setup','access','props','signs','vfx',
               'modules','layout','interior','exterior','bar','dj','seating',
               'lighting','specialty','event'}
    if ' ' in t:
        return False
    return slug(t) not in HEADERS

# ── background / masking ───────────────────────────────────────────────────
def banner_bands(bgr):
    """Return y-ranges of the dark section-title banner bars (e.g. 'DOORS').
    A banner row has a wide run of dark pixels (the bar) across the middle."""
    H, W = bgr.shape[:2]
    v = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[:,:,2]
    darkfrac = (v < 110).mean(axis=1)        # fraction of row that is dark
    on = darkfrac > 0.33
    bands, i = [], 0
    while i < H:
        if on[i]:
            j = i
            while j < H and on[j]: j += 1
            if 6 <= j-i <= 40:               # banner bars are short, wide
                bands.append((i, j))
            i = j
        else:
            i += 1
    return bands

def checker_mask(bgr):
    """True where pixel is the transparent-checker background (light, low-sat)."""
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    s = hsv[:,:,1].astype(np.int16)
    v = hsv[:,:,2].astype(np.int16)
    # checker is light grey: low saturation, high-ish value, two grey tones
    return (s < 28) & (v > 150)

def banner_behind(bgr, x, y, w, h):
    """Sample bg just left/right of a caption; True if dark/coloured banner."""
    H, W = bgr.shape[:2]
    pad = 6
    samples = []
    for sx in (max(0,x-pad-10), min(W-1,x+w+pad)):
        sy0, sy1 = max(0,y), min(H, y+h)
        samples.append(bgr[sy0:sy1, max(0,sx-4):sx+4])
    samples = [s for s in samples if s.size]
    if not samples: return False
    cat = np.concatenate([s.reshape(-1,3) for s in samples],0)
    hsv = cv2.cvtColor(cat.reshape(-1,1,3), cv2.COLOR_BGR2HSV).reshape(-1,3)
    dark = (hsv[:,2] < 130).mean()
    sat  = (hsv[:,1] > 60).mean()
    return (dark > 0.5) or (sat > 0.5)

# ── main per-sheet routine ─────────────────────────────────────────────────
def cut_sheet(stem, venue, mode, debug=False):
    p = f'{SRC}/{stem}.png'
    img = cv2.imread(p)
    if img is None:
        print('  MISSING', stem); return {}
    H, W = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    d = pytesseract.image_to_data(rgb, output_type=Output.DICT)

    # group tokens into lines via (block,par,line), then SPLIT each line into
    # separate captions wherever there is a big horizontal gap (prop names are
    # underscore-joined single tokens; big gaps = different props).
    lines = {}
    for i in range(len(d['text'])):
        t = d['text'][i].strip()
        if not t: continue
        if int(float(d['conf'][i])) < 35: continue
        key = (d['block_num'][i], d['par_num'][i], d['line_num'][i])
        lines.setdefault(key, []).append(i)

    groups = []  # each = list of token idxs forming one caption
    for key, idxs in lines.items():
        idxs.sort(key=lambda i: d['left'][i])
        cur = [idxs[0]]
        for i in idxs[1:]:
            prev = cur[-1]
            gap = d['left'][i] - (d['left'][prev] + d['width'][prev])
            if gap > 22:                 # big gap -> new caption
                groups.append(cur); cur = [i]
            else:
                cur.append(i)            # tight tokens (rare 2-word labels, '&')
        groups.append(cur)

    caps = []   # (cx, top, x0, x1, slug)
    for idxs in groups:
        text = ' '.join(d['text'][i].strip() for i in idxs)
        x0 = min(d['left'][i] for i in idxs)
        x1 = max(d['left'][i]+d['width'][i] for i in idxs)
        top = min(d['top'][i] for i in idxs)
        bot = max(d['top'][i]+d['height'][i] for i in idxs)
        if top < H*0.085: continue           # title strip
        if not is_prop_caption(text): continue
        s = slug(text)
        if len(s) < 3: continue              # OCR garbage ('ie')
        if banner_behind(img, x0, top, x1-x0, bot-top): continue
        caps.append([ (x0+x1)//2, top, x0, x1, s ])

    if not caps:
        print(f'  {stem}: no captions'); return {}

    # cluster into rows by caption top (rows ~ within 24px)
    caps.sort(key=lambda c: c[1])
    rows, cur = [], [caps[0]]
    for c in caps[1:]:
        if c[1] - cur[-1][1] <= 26:
            cur.append(c)
        else:
            rows.append(cur); cur = [c]
    rows.append(cur)
    for r in rows: r.sort(key=lambda c: c[0])

    bands = banner_bands(img)

    dest = f'{OUT}/{venue}/{mode}'
    os.makedirs(dest, exist_ok=True)
    # accumulate across multiple sheets writing into the same folder
    mpath = f'{dest}/_manifest.json'
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    dbg = img.copy() if debug else None
    prev_row_bottom = int(H*0.085)

    for ri, row in enumerate(rows):
        row_top = min(c[1] for c in row)
        for ci, c in enumerate(row):
            cx, top, x0, x1, name = c
            # horizontal cell bounds = midpoints to neighbours
            left  = (row[ci-1][0] + cx)//2 if ci>0 else max(0, x0 - (x1-x0))
            right = (row[ci+1][0] + cx)//2 if ci<len(row)-1 else min(W, x1 + (x1-x0))
            # vertical: prop sits between previous row bottom and this caption top
            cy_top = prev_row_bottom + 4
            cy_bot = top - 3
            # clip top to just below the nearest banner bar above the caption
            above = [b1 for (b0,b1) in bands if b1 <= top and b1 > cy_top]
            if above:
                cy_top = max(above) + 4
            if cy_bot - cy_top < 24:  # too thin, give it room
                cy_top = max(prev_row_bottom, top - 230)
            cell = img[cy_top:cy_bot, left:right]
            if cell.size == 0: continue
            # mask: keep non-checker content
            bg = checker_mask(cell)
            fg = (~bg).astype(np.uint8)
            fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN,
                                  cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
            fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE,
                                  cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(9,9)))
            # keep only the prop: largest connected component + parts in its band
            # (drops the section banner blob sitting at the top of the cell and
            #  any neighbour bleed / caption remnants)
            nc, lbl, st, _ = cv2.connectedComponentsWithStats(fg, 8)
            if nc <= 1: continue
            areas = st[1:, cv2.CC_STAT_AREA]
            big = 1 + int(np.argmax(areas))
            bt = st[big, cv2.CC_STAT_TOP]; bb = bt + st[big, cv2.CC_STAT_HEIGHT]
            keep = np.zeros(fg.shape, np.uint8)
            for ci in range(1, nc):
                a = st[ci, cv2.CC_STAT_AREA]
                if a < 60: continue
                ct = st[ci, cv2.CC_STAT_TOP]; ch = st[ci, cv2.CC_STAT_HEIGHT]
                cc = ct + ch//2
                # same vertical band as the main prop component
                if cc >= bt-12 and cc <= bb+12:
                    keep[lbl==ci] = 1
            fg = keep
            ys, xs = np.where(fg>0)
            if len(xs) < 80: continue
            bx0,bx1,by0,by1 = xs.min(),xs.max(),ys.min(),ys.max()
            if bx1-bx0 < 16 or by1-by0 < 16: continue
            crop = cell[by0:by1+1, bx0:bx1+1]
            cm   = fg[by0:by1+1, bx0:bx1+1]
            cm = cv2.morphologyEx(cm, cv2.MORPH_CLOSE,
                                  cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7)))
            bgra = cv2.cvtColor(crop, cv2.COLOR_BGR2BGRA)
            bgra[:,:,3] = cm*255
            # de-dup name collisions
            fn = name; k = 2
            while fn in manifest:
                fn = f'{name}_{k}'; k += 1
            cv2.imwrite(f'{dest}/{venue}_{mode}_{fn}.png', bgra)
            manifest[fn] = name
            if debug:
                cv2.rectangle(dbg,(left,cy_top),(right,cy_bot),(0,255,0),2)
                cv2.putText(dbg,fn,(left+2,cy_bot-4),cv2.FONT_HERSHEY_PLAIN,1,(0,0,255),1)
        prev_row_bottom = max(c[1] for c in row) + 14

    json.dump(manifest, open(mpath,'w'), indent=1)
    if debug:
        cv2.imwrite(f'/tmp/dbg_{stem}.png', dbg)
    print(f'  {stem:38s} -> {venue}/{mode}: {len(manifest)} named props (cumulative)')
    return manifest

if __name__ == '__main__':
    if '--all' in sys.argv:
        for stem,v,m in SHEETS:
            cut_sheet(stem, v, m, debug='--debug' in sys.argv)
    elif len(sys.argv) >= 4:
        cut_sheet(sys.argv[1], sys.argv[2], sys.argv[3], debug='--debug' in sys.argv)
    else:
        print(__doc__)

#!/usr/bin/env python3
"""Slice venue props from the authoritative PROP PAGES only, classified by each
sheet's actual header (not its filename), into per-venue outside/inside folders.

Excluded on purpose (per the design rules):
  - "FINISHED DESIGN" interior/exterior sheets  -> examples of how to build, not props
  - "ROUTE TEST / GAMEPLAY FIT" sheets          -> examples
  - "NAVIGATION / CONNECTION OVERVIEW" sheets    -> maps
  - "_bg / backdrop / final layout" sheets       -> backgrounds
Junk inside a prop page is dropped too: VFX/backdrop/scale-reference/notes bands
at the bottom, wide text/section panels, flat colour swatches, and the
scale-reference human figures.
"""
import os, cv2, numpy as np

SRC='assets/venues'; OUT='assets/venues/props'

# sheet, venue, mode. mode: 'outside' | 'inside' | 'combined'
#   combined = core asset sheet: outside in the top band, inside in the middle band
CONFIG=[
 ('kcs_pack_01_assets','kcs','outside'),       # OUTSIDE CORE STRUCTURE
 ('kcs_pack_02_patio_assets','kcs','outside'), # OUTSIDE PATIO SETUP & ACCESS
 ('kcs_pack_03_exterior_components','kcs','outside'), # OUTSIDE SIGNAGE/PARKING/VFX
 ('kcs_pack_04_interior_bar','kcs','outside'), # header: OUTSIDE SUPPORT MODULES
 ('kcs_pack_05_interior_stage','kcs','inside'),# INSIDE CORE LAYOUT MODULES
 ('kcs_pack_06_props_signs','kcs','inside'),   # INSIDE SPECIALTY/BAR/GAMES
 ('outta_pack_01_assets','outta','combined'),  # CORE ASSET SHEET (mixed)
 ('dukes_pack_01_assets','dukes','combined'),  # CORE ASSET SHEET (mixed)
 ('outta_pack_04_bar_pool','outta','outside'),  # EXTERIOR STRUCTURE & PARKING MODULES
 ('outta_pack_05_components_a','outta','inside'),# INTERIOR MODULAR GAMEPLAY ASSETS
 ('dukes_pack_04_components_a','dukes','outside'),# EXTERIOR MODULAR STRUCTURE & PARKING MODULES
 ('dukes_pack_05_components_b','dukes','inside'), # INTERIOR MODULAR GAMEPLAY ASSETS
 ('qhf_pack_01_assets','qhf','outside'),       # EXTERIOR CORE ASSET CATALOG
 ('qhf_pack_03_store_interior','qhf','outside'),# EXTERIOR MODULAR STRUCTURE
 ('qhf_pack_05_components_a','qhf','inside'),  # INTERIOR CORE ASSET CATALOG
 ('tally_pack_01_assets','tally','outside'),   # EXTERIOR CORE STRUCTURE & ENTRY
 # Tally sub-venue interiors (each sheet = that venue's interior prop source)
 ('tally_pack_07_itus','tally_den','inside'),       # THE DEN interior
 ('tally_pack_06_den','tally_itus','inside'),       # THE ITUS PIZZA interior
 ('tally_pack_05_13rave','tally_sammys','inside'),  # SAMMYS STAGE interior
 ('tally_pack_04_sammys','tally_public_hall','inside'),# PUBLIC HALL interior
 ('tally_pack_03_public_hall','tally_13rave','inside'),# 13 RAVE CLUB interior
 # New dedicated interior asset atlases (Jun 23-24 upload)
 ('tally_sammys_pack_02_interior_a','tally_sammys','inside'),       # SAMMYS INTERIOR ASSET ATLAS A
 ('tally_13rave_pack_02_interior_a','tally_13rave','inside'),       # 13 RAVE INTERIOR ASSET ATLAS A
 ('tally_13rave_pack_03_interior_b','tally_13rave','inside'),       # 13 RAVE INTERIOR ASSET ATLAS B
 ('tally_public_hall_pack_02_interior_a','tally_public_hall','inside'),# PUBLIC HALL INTERIOR ASSET ATLAS A
 ('tally_public_hall_pack_03_interior_b','tally_public_hall','inside'),# PUBLIC HALL INTERIOR ASSET ATLAS B
 ('tally_itus_pack_02_interior_a','tally_itus','inside'),           # THE ITUS INTERIOR ASSET ATLAS A
 ('tally_itus_pack_03_interior_b','tally_itus','inside'),           # THE ITUS INTERIOR ASSET ATLAS B
]
# combined-sheet vertical bands (fraction of H)
OUT_TOP, OUT_BOT = 0.045, 0.47    # outside section band
IN_TOP,  IN_BOT  = 0.47, 0.82     # inside section band (below = VFX/backdrop/scale junk)
SINGLE_BOT = 0.88                 # single-role sheets: drop bottom junk strip

def runs(p,t,g,l):
    on=p>t; segs=[]; i=0; N=len(on)
    while i<N:
        if on[i]:
            j=i
            while j<N and on[j]: j+=1
            segs.append([i,j]); i=j
        else: i+=1
    m=[]
    for s in segs:
        if m and s[0]-m[-1][1]<g: m[-1][1]=s[1]
        else: m.append(s)
    return [s for s in m if s[1]-s[0]>=l]

def mask_edge(gray):
    e=cv2.dilate(cv2.Canny(gray,40,120),cv2.getStructuringElement(cv2.MORPH_RECT,(3,3)))
    return (e>0).astype(np.uint8)

def mask_color(img):
    H,W=img.shape[:2]
    small=cv2.resize(img,(W//6,H//6)).reshape(-1,3)
    vals,counts=np.unique(small//8,axis=0,return_counts=True)
    bg=vals[counts.argmax()].astype(np.float32)*8+4
    dist=np.linalg.norm(img.astype(np.int16)-bg,axis=2)
    d=(dist>45).astype(np.uint8)
    return cv2.morphologyEx(d,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(3,3)))

def fill_holes(m):
    h,w=m.shape; ff=m.copy(); mm=np.zeros((h+2,w+2),np.uint8)
    cv2.floodFill(ff,mm,(0,0),1)
    return (m|(1-ff)).astype(np.uint8)

def is_human(crop):
    # scale-reference figures are skin-toned silhouettes; drop if much skin
    b,g,r=crop[:,:,0].astype(int),crop[:,:,1].astype(int),crop[:,:,2].astype(int)
    skin=((r>110)&(r<235)&(g>60)&(g<190)&(b>40)&(b<160)&(r>g)&(g>=b)&((r-b)>18))
    return skin.mean()>0.10

def segment(M,W,y_lo,y_hi):
    out=[]
    sub=M[y_lo:y_hi]
    for (by0,by1) in runs(sub.sum(axis=1)/W,0.03,14,30):
        y0,y1=by0+y_lo,by1+y_lo
        cells=runs(M[y0:y1].sum(axis=0)/(y1-y0),0.04,10,26)
        if len(cells)==1 and cells[0][1]-cells[0][0]>0.7*W and (y1-y0)<70: continue
        for (x0,x1) in cells:
            if x1-x0<26: continue
            col=M[y0:y1,x0:x1]; ss=runs(col.sum(axis=1)/(x1-x0),0.04,6,12)
            if not ss: continue
            ty0,ty1=max(ss,key=lambda s:s[1]-s[0]); py0,py1=y0+ty0,y0+ty1
            if py1-py0<26: continue
            items=runs(M[py0:py1,x0:x1].sum(axis=0)/(py1-py0),0.06,5,16) or [[0,x1-x0]]
            for (ix0,ix1) in items:
                if ix1-ix0<22: continue
                out.append((x0+ix0,py0,x0+ix1,py1))
    return out

def emit(img,M,boxes,dest,prefix):
    H,W=img.shape[:2]; os.makedirs(dest,exist_ok=True); idx=0
    for (x0,y0,x1,y1) in boxes:
        w,h=x1-x0,y1-y0; ar=h/w
        if w>440: continue            # text / section panels / backdrop strips
        if ar>2.3 or ar<0.30: continue
        pad=3
        ax0,ay0=max(0,x0-pad),max(0,y0-pad); ax1,ay1=min(W,x1+pad),min(H,y1+pad)
        crop=img[ay0:ay1,ax0:ax1]
        cm=M[ay0:ay1,ax0:ax1]
        if cm.mean()<0.06: continue   # flat colour swatch
        if is_human(crop): continue   # scale-reference figure
        cmf=cv2.morphologyEx(cm,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(11,11)))
        cmf=fill_holes(cmf)
        cmf=cv2.morphologyEx(cmf,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
        bgra=cv2.cvtColor(crop,cv2.COLOR_BGR2BGRA); bgra[:,:,3]=cmf*255
        cv2.imwrite(f'{dest}/{prefix}_{idx:02d}.png',bgra); idx+=1
    return idx

def segment_scene(M, img, W, y_lo, y_hi):
    """For dense interior scene sheets: connected-components per object."""
    sub = M[y_lo:y_hi].copy()
    # close small gaps so each object is one blob
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(7,7))
    sub = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, k)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(sub, 8)
    boxes = []
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < 400: continue          # tiny noise
        if area > W*(y_hi-y_lo)*0.25: continue  # skip near-full-image blobs
        if w > 0.7*W: continue           # skip full-width labels/headers
        boxes.append((x, y+y_lo, x+w, y+y_lo+h))
    return boxes

counts={}
for sheet,venue,mode in CONFIG:
    p=f'{SRC}/{sheet}.png'
    if not os.path.exists(p): print('  MISSING',sheet); continue
    img=cv2.imread(p); H,W=img.shape[:2]
    gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    Me,Mc=mask_edge(gray),mask_color(img)
    if mode=='combined':
        for band,(lo,hi) in (('outside',(OUT_TOP,OUT_BOT)),('inside',(IN_TOP,IN_BOT))):
            yl,yh=int(H*lo),int(H*hi)
            be,bc=segment(Me,W,yl,yh),segment(Mc,W,yl,yh)
            boxes,M=(bc,Mc) if len(bc)>len(be) else (be,Me)
            n=emit(img,M,boxes,f'{OUT}/{venue}/{band}',f'{venue}_{band}')
            counts[(venue,band)]=counts.get((venue,band),0)+n
    else:
        yl,yh=int(H*0.045),int(H*SINGLE_BOT)
        be,bc=segment(Me,W,yl,yh),segment(Mc,W,yl,yh)
        best=max(len(be),len(bc))
        if best<5:
            boxes=segment_scene(Mc,img,W,yl,yh); M=Mc
        else:
            boxes,M=(bc,Mc) if len(bc)>len(be) else (be,Me)
        n=emit(img,M,boxes,f'{OUT}/{venue}/{mode}',f'{venue}_{mode}')
        # if projection-profile gave nothing, retry with scene/contour segmenter
        if n==0 and best>=5:
            boxes=segment_scene(Mc,img,W,yl,yh); M=Mc
            n=emit(img,M,boxes,f'{OUT}/{venue}/{mode}',f'{venue}_{mode}')
        counts[(venue,mode)]=counts.get((venue,mode),0)+n

for k in sorted(counts): print(f'{k[0]:7s} {k[1]:8s} {counts[k]}')
print('TOTAL', sum(counts.values()))

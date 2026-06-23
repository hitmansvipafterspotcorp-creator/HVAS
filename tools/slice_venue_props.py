#!/usr/bin/env python3
"""Projection-profile slicer for venue catalog sheets.

Per sheet we try two foreground masks (edge-based for light/checker sheets,
bg-colour-distance for dark-panel sheets) and keep whichever segments into more
individual props. Layout = horizontal bands -> vertical cells -> drop label
sub-band -> second-level item split -> transparent cutout.
"""
import os, cv2, numpy as np

SRC='assets/venues'; OUT='assets/venues/props'
PREV='/tmp/claude-0/-home-user-HVAS/43739381-4647-52c1-8101-2a0512078e88/scratchpad/previews'
os.makedirs(OUT,exist_ok=True); os.makedirs(PREV,exist_ok=True)

SHEETS={
 'kcs':['kcs_pack_01_assets','kcs_pack_02_patio_assets','kcs_pack_03_exterior_components',
        'kcs_pack_04_interior_bar','kcs_pack_05_interior_stage','kcs_pack_06_props_signs',
        'kcs_pack_09_lighting_vfx'],
 'outta':['outta_pack_01_assets','outta_pack_04_bar_pool','outta_pack_05_components_a',
          'outta_pack_06_components_b'],
 'tally':['tally_pack_01_assets'],
 'dukes':['dukes_pack_01_assets','dukes_pack_04_components_a','dukes_pack_05_components_b',
          'dukes_pack_06_components_c'],
 'qhf':['qhf_pack_01_assets','qhf_pack_04_pumps_canopy','qhf_pack_05_components_a',
        'qhf_pack_06_components_b'],
}

def runs(profile,thresh,min_gap,min_len):
    on=profile>thresh; segs=[]; i=0; N=len(on)
    while i<N:
        if on[i]:
            j=i
            while j<N and on[j]: j+=1
            segs.append([i,j]); i=j
        else: i+=1
    merged=[]
    for s in segs:
        if merged and s[0]-merged[-1][1]<min_gap: merged[-1][1]=s[1]
        else: merged.append(s)
    return [s for s in merged if s[1]-s[0]>=min_len]

def mask_edge(img,gray):
    e=cv2.Canny(gray,40,120)
    e=cv2.dilate(e,cv2.getStructuringElement(cv2.MORPH_RECT,(3,3)))
    return (e>0).astype(np.uint8)

def mask_color(img,gray):
    H,W=gray.shape
    # estimate working-area bg as the global modal colour (downsampled)
    small=cv2.resize(img,(W//6,H//6)).reshape(-1,3)
    vals,counts=np.unique(small//8,axis=0,return_counts=True)
    bg=vals[counts.argmax()].astype(np.float32)*8+4
    dist=np.linalg.norm(img.astype(np.int16)-bg,axis=2)
    d=(dist>45).astype(np.uint8)
    d=cv2.morphologyEx(d,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_RECT,(3,3)))
    return d

def fill_holes(m):
    h,w=m.shape; ff=m.copy(); mm=np.zeros((h+2,w+2),np.uint8)
    cv2.floodFill(ff,mm,(0,0),1)
    return (m|(1-ff)).astype(np.uint8)

def segment(M,W,H):
    """Return list of (x0,y0,x1,y1) prop boxes from a foreground mask."""
    out=[]
    bands=runs(M.sum(axis=1)/W,0.03,14,40)
    for (y0,y1) in bands:
        if y0<60 and (y1-y0)<70: continue
        cells=runs(M[y0:y1].sum(axis=0)/(y1-y0),0.04,10,30)
        if len(cells)==1 and cells[0][1]-cells[0][0]>0.7*W and (y1-y0)<70: continue
        for (x0,x1) in cells:
            if x1-x0<30: continue
            sub=M[y0:y1,x0:x1]; subsegs=runs(sub.sum(axis=1)/(x1-x0),0.04,6,12)
            if not subsegs: continue
            ty0,ty1=max(subsegs,key=lambda s:s[1]-s[0]); py0,py1=y0+ty0,y0+ty1
            if py1-py0<30: continue
            gcol=M[py0:py1,x0:x1].sum(axis=0)/(py1-py0)
            items=runs(gcol,0.06,5,18) or [[0,x1-x0]]
            for (ix0,ix1) in items:
                if ix1-ix0<22: continue
                out.append((x0+ix0,py0,x0+ix1,py1))
    return out

total=0
for pack,sheets in SHEETS.items():
    for name in sheets:
        p=f'{SRC}/{name}.png'
        if not os.path.exists(p): print('  MISSING',name); continue
        img=cv2.imread(p); H,W=img.shape[:2]
        gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
        Me=mask_edge(img,gray); Mc=mask_color(img,gray)
        be=segment(Me,W,H); bc=segment(Mc,W,H)
        if len(bc)>len(be): boxes,M=bc,Mc
        else: boxes,M=be,Me
        ann=img.copy(); idx=0; os.makedirs(f'{OUT}/{pack}',exist_ok=True)
        for (x0,y0,x1,y1) in boxes:
            pad=3
            ax0,ay0=max(0,x0-pad),max(0,y0-pad); ax1,ay1=min(W,x1+pad),min(H,y1+pad)
            if ay1-ay0<28 or ax1-ax0<22: continue
            crop=img[ay0:ay1,ax0:ax1]
            cm=M[ay0:ay1,ax0:ax1].copy()
            cm=cv2.morphologyEx(cm,cv2.MORPH_CLOSE,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(11,11)))
            cm=fill_holes(cm)
            cm=cv2.morphologyEx(cm,cv2.MORPH_OPEN,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)))
            bgra=cv2.cvtColor(crop,cv2.COLOR_BGR2BGRA); bgra[:,:,3]=cm*255
            cv2.imwrite(f'{OUT}/{pack}/{name}_{idx:02d}.png',bgra)
            cv2.rectangle(ann,(ax0,ay0),(ax1,ay1),(0,255,255),1)
            cv2.putText(ann,str(idx),(ax0+2,ay0+16),cv2.FONT_HERSHEY_SIMPLEX,0.5,(0,255,255),1)
            idx+=1; total+=1
        cv2.imwrite(f'{PREV}/{name}_annot.png',ann)
        print(f'  {name}: {idx} props')
print('TOTAL:',total)

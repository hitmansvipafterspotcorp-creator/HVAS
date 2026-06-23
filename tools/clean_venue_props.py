#!/usr/bin/env python3
"""Clean up the sliced venue prop cutouts.

For every assets/venues/props/**/*.png:
  - defringe the white/light halo ring left by the slice (erode alpha 2px and
    drop bright near-background pixels on the alpha boundary)
  - autocrop to the alpha bounding box (trim transparent padding)
  - delete junk: near-empty crops, slivers, or tiny label-only fragments
"""
import os, glob, cv2, numpy as np

ROOT='assets/venues/props'
kept=removed=0
for f in sorted(glob.glob(f'{ROOT}/**/*.png', recursive=True)):
    im=cv2.imread(f, cv2.IMREAD_UNCHANGED)
    if im is None or im.ndim!=3 or im.shape[2]!=4:
        os.remove(f); removed+=1; continue
    bgr=im[:,:,:3]; a=im[:,:,3]
    mask=(a>128).astype(np.uint8)
    # erode 2px to kill the halo ring, then keep largest blob only
    mask=cv2.erode(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(3,3)), iterations=2)
    n,lbl,stats,_=cv2.connectedComponentsWithStats(mask,8)
    if n<=1:
        os.remove(f); removed+=1; continue
    big=1+np.argmax(stats[1:,4])
    mask=(lbl==big).astype(np.uint8)
    # drop bright background bleed still tagged opaque (near-white pixels)
    bright=(bgr.min(axis=2)>205)
    mask[bright]=0
    ys,xs=np.where(mask>0)
    if len(xs)==0:
        os.remove(f); removed+=1; continue
    x0,x1,y0,y1=xs.min(),xs.max()+1,ys.min(),ys.max()+1
    w,h=x1-x0,y1-y0
    cov=mask[y0:y1,x0:x1].mean()
    # junk filters: too small, too sliver, or too sparse to be a real prop
    if w<20 or h<20 or cov<0.10 or (w*h)<700:
        os.remove(f); removed+=1; continue
    out=im[y0:y1,x0:x1].copy()
    # feather: smooth alpha and reapply cleaned mask so edges aren't hard/haloed
    m=mask[y0:y1,x0:x1]
    af=cv2.GaussianBlur((m*255).astype(np.uint8),(3,3),0)
    out[:,:,3]=np.minimum(out[:,:,3], af)
    cv2.imwrite(f,out); kept+=1
print(f'kept {kept}, removed {removed}')

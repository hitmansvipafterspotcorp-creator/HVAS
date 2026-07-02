#!/usr/bin/env python3
"""Scan sliced game-art PNGs for baked-in dev-guide text ("label leaks").

The recurring corruption bug across this repo's uploaded asset sheets is dev
annotations (sheet headers, frame-index numbers, placeholder captions like
"CHARACTER NAME") baked directly into the pixels by whatever tool exported
the source sheet, then carried through into individual slices. This scanner
OCRs each image and flags tokens/patterns that only ever show up in dev-guide
exports, never in finished game art.

Usage:
    python3 tools/scan_label_leaks.py <file_or_dir> [<file_or_dir> ...]
    python3 tools/scan_label_leaks.py --json out.json assets/ui/elements
    python3 tools/scan_label_leaks.py --fast assets/venues/props   # skip OCR, edge-density heuristic only

Exit code is 1 if any flagged image is found (so it can gate CI/commits),
0 if the whole scan is clean.
"""
import argparse
import glob
import json
import os
import re
import sys

import cv2
import numpy as np

try:
    import pytesseract
    HAVE_TESSERACT = True
except ImportError:
    HAVE_TESSERACT = False

# Single-word vocabulary that only appears in design-guide / dev-reference
# exports, never in finished game art. OCR reliably garbles longer/unusual
# words in stylized game fonts (e.g. "PORTRAIT" -> "PORURAIT") but short,
# common dev-jargon words tend to survive intact, so we match per-word
# rather than requiring an exact multi-word phrase.
LEAK_WORDS = {
    'sheet', 'frame', 'frames', 'gameplay', 'legend', 'reference', 'template',
    'placeholder', 'navigation', 'alias', 'todo', 'wip', 'draft', 'finished',
    'asset', 'guide', 'annotation', 'callout',
}
# Multi-word phrases worth checking on the joined line too (belt-and-braces
# for cases where the individual words above aren't distinctive enough).
LEAK_LINE_RE = re.compile(
    r'description goes here|scale reference|route test|character name|'
    r'title\s*/\s*alias|per\s*row|finished design',
    re.IGNORECASE,
)

# Underscore/caps dev-identifier fragments, e.g. "PM_BTN_RESTART_DEFAULT",
# "MBO_A_1" (a cropped "COMBO_A_1").
IDENTIFIER_RE = re.compile(r'^[A-Z]{2,}(_[A-Z0-9]+){1,}$')

# "04." / "05." style numbered-caption prefixes seen on design-guide sheets.
NUMBERED_CAPTION_RE = re.compile(r'^\d{1,2}\.$')


def classify_token(tok: str):
    t = tok.strip()
    if not t:
        return None
    bare = re.sub(r'[^A-Za-z]', '', t).lower()
    if bare in LEAK_WORDS:
        return 'leak_word'
    if IDENTIFIER_RE.match(t):
        return 'dev_identifier'
    if NUMBERED_CAPTION_RE.match(t):
        return 'numbered_caption'
    return None


def alpha_composite(img, bg_value):
    """Composite a BGRA image onto a solid bg_value (0=black, 255=white)
    background, returning a grayscale image. Baked-in dev labels can be
    either light-on-dark or dark-on-light, so callers should try both and
    union the findings."""
    if img.ndim == 3 and img.shape[2] == 4:
        b, g, r, a = cv2.split(img)
        alpha = a.astype(np.float32) / 255.0
        bg = np.full_like(b, bg_value, dtype=np.float32)
        comp = np.zeros((img.shape[0], img.shape[1], 3), dtype=np.uint8)
        for i, ch in enumerate([b, g, r]):
            comp[:, :, i] = (ch.astype(np.float32) * alpha + bg * (1 - alpha)).astype(np.uint8)
        return cv2.cvtColor(comp, cv2.COLOR_BGR2GRAY)
    if img.ndim == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img


def frame_number_row(data, img_h):
    """Detect a row of small standalone digit tokens near the top of the
    image — the classic '1  2  3  4  5  6  7  8' frame-index strip baked
    above each animation strip."""
    digit_tops = []
    n = len(data.get('text', []))
    for i in range(n):
        txt = data['text'][i].strip()
        conf = int(data['conf'][i]) if str(data['conf'][i]).lstrip('-').isdigit() else -1
        if conf < 30:
            continue
        if re.fullmatch(r'\d{1,2}', txt):
            top = data['top'][i]
            if top < img_h * 0.35:
                digit_tops.append(top)
    return len(digit_tops) >= 3


def _ocr_pass(gray, h, w, seen_keys):
    """Run OCR on one grayscale rendering, returning new findings not
    already present in seen_keys (dedupes across the black/white passes)."""
    data = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT)
    findings = []
    n = len(data.get('text', []))
    for i in range(n):
        txt = data['text'][i].strip()
        if not txt:
            continue
        conf = int(data['conf'][i]) if str(data['conf'][i]).lstrip('-').isdigit() else -1
        if conf < 30:
            continue
        top = data['top'][i]
        kind = classify_token(txt)
        # Structural signal: text flush against the crop's top edge is
        # almost always a leftover sheet header/caption, regardless of
        # what it says (OCR content can be garbled by stylized fonts).
        if top <= max(2, int(h * 0.04)) and len(txt) >= 3:
            kind = kind or 'top_edge_text'
        if kind:
            key = (kind, txt.lower())
            if key in seen_keys:
                continue
            seen_keys.add(key)
            findings.append({
                'kind': kind, 'text': txt, 'conf': conf,
                'bbox': [data['left'][i], top, data['width'][i], data['height'][i]],
            })
    # multi-word lines (phrases like "FINISHED DESIGN" split across tokens)
    lines = {}
    for i in range(n):
        txt = data['text'][i].strip()
        if not txt:
            continue
        key = (data['block_num'][i], data['par_num'][i], data['line_num'][i])
        lines.setdefault(key, []).append(txt)
    for key, words in lines.items():
        line = ' '.join(words)
        if LEAK_LINE_RE.search(line):
            dedupe_key = ('leak_phrase_line', line.lower())
            if dedupe_key not in seen_keys:
                seen_keys.add(dedupe_key)
                findings.append({'kind': 'leak_phrase_line', 'text': line, 'conf': None, 'bbox': None})
    if frame_number_row(data, h):
        dedupe_key = ('frame_number_row', '')
        if dedupe_key not in seen_keys:
            seen_keys.add(dedupe_key)
            findings.append({'kind': 'frame_number_row', 'text': '(digit strip near top)', 'conf': None, 'bbox': None})
    return findings


def ocr_scan(path):
    img = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return {'error': 'unreadable'}
    h, w = img.shape[:2]
    seen_keys = set()
    findings = []
    # Try both a black and a white composite so light-on-dark and
    # dark-on-light baked labels both surface (transparent-background
    # crops especially can go either way).
    for bg in (0, 255):
        gray = alpha_composite(img, bg)
        findings.extend(_ocr_pass(gray, h, w, seen_keys))
    return {'width': w, 'height': h, 'findings': findings}


def fast_scan(path):
    """No-OCR fallback: flag images with unusually dense edges in the top
    15% of the frame, where baked-in headers/frame-numbers consistently
    sit. Much faster, higher false-positive rate — use for triage only."""
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return {'error': 'unreadable'}
    h, w = img.shape[:2]
    band = img[: max(1, int(h * 0.15)), :]
    edges = cv2.Canny(band, 40, 120)
    density = float(edges.mean()) / 255.0
    flagged = density > 0.06
    findings = [{'kind': 'top_band_edge_density', 'text': f'{density:.4f}', 'conf': None, 'bbox': None}] if flagged else []
    return {'width': w, 'height': h, 'findings': findings}


def collect_files(paths):
    files = []
    for p in paths:
        if os.path.isdir(p):
            files += glob.glob(os.path.join(p, '**', '*.png'), recursive=True)
            files += glob.glob(os.path.join(p, '**', '*.webp'), recursive=True)
        elif os.path.isfile(p):
            files.append(p)
    return sorted(set(files))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='+', help='files or directories to scan')
    ap.add_argument('--json', help='write full JSON report to this path')
    ap.add_argument('--fast', action='store_true', help='skip OCR, use edge-density heuristic only (faster, noisier)')
    ap.add_argument('--quiet', action='store_true', help='only print flagged files, suppress clean-file lines')
    args = ap.parse_args()

    if not args.fast and not HAVE_TESSERACT:
        print('pytesseract not installed; falling back to --fast mode', file=sys.stderr)
        args.fast = True

    files = collect_files(args.paths)
    if not files:
        print('No .png/.webp files found under given paths', file=sys.stderr)
        sys.exit(2)

    report = {}
    flagged_count = 0
    for f in files:
        result = fast_scan(f) if args.fast else ocr_scan(f)
        report[f] = result
        findings = result.get('findings', [])
        if findings:
            flagged_count += 1
            print(f'FLAG  {f}')
            for finding in findings:
                print(f'        [{finding["kind"]}] {finding["text"]!r}' + (f' conf={finding["conf"]}' if finding.get('conf') is not None else ''))
        elif not args.quiet:
            print(f'clean {f}')

    print(f'\n{flagged_count}/{len(files)} files flagged' + (' (fast/heuristic mode — verify manually)' if args.fast else ' (OCR mode)'))

    if args.json:
        with open(args.json, 'w') as fh:
            json.dump(report, fh, indent=2)
        print(f'Full report written to {args.json}')

    sys.exit(1 if flagged_count else 0)


if __name__ == '__main__':
    main()

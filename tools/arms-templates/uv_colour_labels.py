import os
import json, sys, colorsys
from PIL import Image, ImageDraw, ImageFont
S, OUT = sys.argv[1], sys.argv[2]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uv_colours.py')).read().split('for atlas, (W, H)')[0].split('S, OUT = sys.argv[1], sys.argv[2]')[1])
HINT = {
  'upper sleeve': 'shoulder <- -> elbow', 'elbow': 'elbow joint', 'loose sleeve (inside too)': 'elbow <- -> open end', 'shirt sleeve': 'elbow <- -> wrist',
  'glove cuff (inside too)': 'open end <- -> wrist', 'hand (palm and fingers)': 'wrist <- -> fingertips', 'thumb': 'base <- -> tip',
  'grip': 'pommel <- -> guard', 'crossbar': 'end <- -> end', 'knuckle-bow': 'guard <- -> pommel', 'blade, guard half': 'guard <- -> middle', 'blade, point half': 'middle <- -> point',
}
for atlas, (W, H) in SIZE.items():
    base = Image.open(f'{S}/uvcol/{atlas}.png').convert('RGB')
    base.save(f'{OUT}/{atlas}-uv-colours.png')
    im = base.copy(); d = ImageDraw.Draw(im)
    boxes = {}
    for t in L['bind'][atlas]:
        xs = [u * W for u, v in t['uv']]; ys = [(1 - v) * H for u, v in t['uv']]
        b = boxes.get(t['part'], [1e9, 1e9, -1e9, -1e9])
        boxes[t['part']] = [min(b[0], *xs), min(b[1], *ys), max(b[2], *xs), max(b[3], *ys)]
    for part, b in boxes.items():
        txt = part.upper() + ('\n' + HINT[part] if HINT.get(part) else '')
        fs = 16 if b[2] - b[0] > 220 else 11
        bb = d.multiline_textbbox((b[0] + 5, b[1] + 4), txt, font=FB(fs))
        d.rectangle([bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2], fill=(0, 0, 0))
        d.multiline_text((b[0] + 5, b[1] + 4), txt, font=FB(fs), fill=col(part, True))
    im.save(f'{OUT}/{atlas}-uv-colours-labelled.png')
print('ok')

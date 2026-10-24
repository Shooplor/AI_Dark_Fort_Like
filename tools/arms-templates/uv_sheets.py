import os
import json, sys, colorsys
if len(sys.argv) > 3: sys.path.insert(0, sys.argv[3])
from PIL import Image, ImageDraw, ImageFont
S, OUT = sys.argv[1], sys.argv[2]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uv_colours.py')).read().split('for atlas, (W, H)')[0].split('S, OUT = sys.argv[1], sys.argv[2]')[1])  # HUE, col, SIZE, L, FB
F = lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', n)
HINT = {
  'upper sleeve': 'shoulder  <-  ->  elbow', 'elbow': 'the elbow joint', 'loose sleeve (inside too)': 'elbow  <-  ->  open end', 'shirt sleeve': 'elbow  <-  ->  wrist',
  'glove cuff (inside too)': 'open end  <-  ->  wrist', 'hand (palm and fingers)': 'wrist  <-  ->  fingertips', 'thumb': 'base <- -> tip',
  'grip': 'pommel <- -> guard', 'pommel': '', 'crossbar': 'end <- -> end', 'knuckle-bow': 'guard <- -> pommel', 'side ring': '', 'blade, guard half': 'guard  <-  ->  middle', 'blade, point half': 'middle  <-  ->  point',
}
VIEWS = {'coat': ['coat-side', 'coat-under', 'coat-over'], 'glove': ['glove-side', 'glove-top', 'glove-front'], 'sword': ['sword-side', 'sword-hilt', 'sword-hilt2']}
CAPT = {'coat-side': 'as seen in the game', 'coat-under': 'from below', 'coat-over': 'from above', 'glove-side': 'as seen in the game', 'glove-top': 'from above',
        'glove-front': 'from the front (the knuckles)', 'sword-side': 'as seen in the game', 'sword-hilt': 'the hilt, turned', 'sword-hilt2': 'the hilt, from below'}
TITLE = {'coat': 'COAT  (paint two: your purple one and the enemy\'s red one)  -  1024 x 1024', 'glove': 'GLOVE  -  1024 x 512', 'sword': 'SWORD  -  1024 x 512'}
for atlas, (W, H) in SIZE.items():
    uvimg = Image.open(f'{S}/uvcol/{atlas}.png').convert('RGB')
    d0 = ImageDraw.Draw(uvimg)
    tris = L['bind'][atlas]
    boxes = {}
    for t in tris:
        xs = [u * W for u, v in t['uv']]; ys = [(1 - v) * H for u, v in t['uv']]
        b = boxes.get(t['part'], [1e9, 1e9, -1e9, -1e9])
        boxes[t['part']] = [min(b[0], *xs), min(b[1], *ys), max(b[2], *xs), max(b[3], *ys)]
    for part, b in boxes.items():
        txt = part.upper() + ('\n' + HINT[part] if HINT.get(part) else '')
        fs = 16 if b[2] - b[0] > 220 else 11
        bb = d0.multiline_textbbox((b[0] + 5, b[1] + 4), txt, font=FB(fs))
        d0.rectangle([bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2], fill=(0, 0, 0))
        d0.multiline_text((b[0] + 5, b[1] + 4), txt, font=FB(fs), fill=col(part, True))
    # the sheet: views on the left, the map on the right
    VW = 560
    sheet = Image.new('RGB', (VW + W + 60, max(H, 3 * 330) + 130), (52, 50, 54))
    d = ImageDraw.Draw(sheet)
    d.text((20, 18), TITLE[atlas], font=FB(26), fill=(255, 230, 160))
    d.text((20, 56), 'Each colour on the model is the same colour on the map. Bright = seen in the game, dark = hidden. Lines = the faces.', font=F(17), fill=(220, 214, 200))
    y = 100
    for v in VIEWS[atlas]:
        im = Image.open(f'{S}/uvcol/view-{v}.png'); bb = im.getbbox(); im = im.crop(bb); im.thumbnail((VW - 20, 290))
        sheet.paste(im, (20 + (VW - 20 - im.width) // 2, y), im)
        d.text((24, y + im.height + 4), CAPT[v], font=F(15), fill=(200, 194, 180))
        y += im.height + 34
    sheet.paste(uvimg, (VW + 40, 100))
    d.rectangle([VW + 39, 99, VW + 40 + W, 100 + H], outline=(150, 145, 150))
    d.text((VW + 40, 100 + H + 8), 'the map (texture) - paint over the plain template of the same size', font=F(16), fill=(200, 194, 180))
    sheet.save(f'{OUT}/{atlas}-uv-map.png')
print('ok')

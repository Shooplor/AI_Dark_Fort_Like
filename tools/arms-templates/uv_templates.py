import json, sys
from PIL import Image, ImageDraw, ImageFont
S, OUT = sys.argv[1], sys.argv[2]
L = json.load(open(S + '/uv_layout.json'))
FB = lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', n)
SIZE = {'coat': (1024, 1024), 'glove': (1024, 512), 'sword': (1024, 512)}
HINT = {
  'upper sleeve': 'shoulder <- -> elbow', 'elbow': 'elbow joint', 'loose sleeve (inside too)': 'elbow <- -> open end', 'shirt sleeve': 'elbow <- -> wrist',
  'glove cuff (inside too)': 'open end <- -> wrist', 'hand (palm and fingers)': 'wrist <- -> fingertips', 'thumb': 'base <- -> tip',
  'grip': 'pommel <- -> guard', 'pommel': '', 'crossbar': 'one end <- -> other end', 'knuckle-bow': 'guard <- -> pommel', 'side ring': '', 'blade': 'guard <- -> point',
}
for atlas, (W, H) in SIZE.items():
    tris = L['bind'][atlas]
    front = [any(L[p][atlas][i]['front'] for p in L) for i in range(len(tris))]
    px = lambda u, v: (u * W, (1 - v) * H)
    boxes = {}
    for t in tris:
        xs = [u * W for u, v in t['uv']]; ys = [(1 - v) * H for u, v in t['uv']]
        b = boxes.get(t['part'], [1e9, 1e9, -1e9, -1e9])
        boxes[t['part']] = [min(b[0], *xs), min(b[1], *ys), max(b[2], *xs), max(b[3], *ys)]
    for notes in (False, True):
        im = Image.new('RGB', (W, H), (40, 38, 40)); d = ImageDraw.Draw(im)
        for part, b in boxes.items():
            d.rectangle([b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3], fill=(58, 55, 58))
        for t, f in zip(tris, front):
            d.polygon([px(u, v) for u, v in t['uv']], fill=(222, 214, 198) if f else (112, 108, 112))
        for t in tris:
            pts = [px(u, v) for u, v in t['uv']]
            d.line(pts + [pts[0]], fill=(25, 22, 25), width=1)
        if notes:
            for part, b in boxes.items():
                txt = part.upper() + (('\n' + HINT.get(part, '')) if HINT.get(part) else '')
                fs = 15 if (b[2] - b[0]) > 200 else 11
                bb = d.multiline_textbbox((b[0] + 4, b[1] + 3), txt, font=FB(fs))
                d.rectangle([bb[0] - 3, bb[1] - 2, bb[2] + 3, bb[3] + 2], fill=(0, 0, 0))
                d.multiline_text((b[0] + 4, b[1] + 3), txt, font=FB(fs), fill=(255, 220, 120))
        im.save(f"{OUT}/{atlas}-uv-template{'-with-notes' if notes else ''}.png")
    # a checker test texture: even squares everywhere means no stretching
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(0, H, 16):
        for x in range(0, W, 16):
            d.rectangle([x, y, x + 15, y + 15], fill=(230, 120, 90) if (x // 16 + y // 16) % 2 else (240, 230, 210))
    im.save(f"{S}/uvcol/test-{atlas}.png")
print('ok')

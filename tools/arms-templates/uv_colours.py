import json, sys, colorsys
from PIL import Image, ImageDraw, ImageFont
S, OUT = sys.argv[1], sys.argv[2]
L = json.load(open(S + '/uv_layout.json'))
FB = lambda n: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', n)
SIZE = {'coat': (1024, 1024), 'glove': (1024, 512), 'sword': (1024, 512)}
HUE = {  # one colour per part, the same on the model and on its patch, all different
  'upper sleeve': (0.60, 0.60), 'elbow': (0.75, 0.55), 'loose sleeve (inside too)': (0.08, 0.70), 'shirt sleeve': (0.16, 0.25),
  'glove cuff (inside too)': (0.98, 0.65), 'hand (palm and fingers)': (0.33, 0.60), 'thumb': (0.90, 0.45),
  'blade, guard half': (0.62, 0.15), 'blade, point half': (0.62, 0.35), 'grip': (0.47, 0.70), 'pommel': (0.14, 0.85), 'crossbar': (0.23, 0.80), 'knuckle-bow': (0.53, 0.85), 'side ring': (0.83, 0.75), 'blade': (0.62, 0.15),
}
def col(part, front):
    h, sat = HUE.get(part, (0, 0))
    r, g, b = colorsys.hsv_to_rgb(h, sat, 0.92 if front else 0.5)
    return (int(r * 255), int(g * 255), int(b * 255))
for atlas, (W, H) in SIZE.items():
    tris = L['bind'][atlas]
    front = [any(L[p][atlas][i]['front'] for p in L) for i in range(len(tris))]
    px = lambda u, v: (u * W, (1 - v) * H)
    im = Image.new('RGB', (W, H), (34, 32, 34)); d = ImageDraw.Draw(im)
    for t, f in zip(tris, front):
        d.polygon([px(u, v) for u, v in t['uv']], fill=col(t['part'], f))
    # the wireframe: the edges of the faces (not the diagonals that split each face in two)
    for t in tris:
        pts = [px(u, v) for u, v in t['uv']]
        for i in range(3):
            a, b = pts[i], pts[(i + 1) % 3]
            if abs(a[0] - b[0]) < 0.6 or abs(a[1] - b[1]) < 0.6:
                d.line([a, b], fill=(20, 18, 20), width=2)
    im.save(f'{OUT}/{atlas}.png')
print('ok')

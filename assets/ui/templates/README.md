# Die texture template

The fate die is a 3D pyramid (js/die3d.js). Its look is one flat picture wrapped around it: the pyramid unfolded into
one big triangle made of four faces.

- `die-uv-template.png`: paint over this (1088 x 951, keep that size exactly).
- `die-uv-template-with-notes.png`: the same with notes.
- Save the painted result as `assets/ui/die-texture.png` (replacing the placeholder).
- Paint the whole big triangle and a little past its outline. Edges marked with the same letter (A, B, C) meet when
  folded, so a pattern that crosses one should continue on its partner. The inner lines are folds too.
- The circles are where the game writes the rolled number, the way up shown. Face 1 (the middle) is shown turned round
  when it is rolled, so paint its part upside down, like its number in the template. To paint the numbers yourself instead,
  set `NUMBERS_IN_TEXTURE` to true at the top of js/die3d.js.

## route-background-template.png (the travel map's background)

1432x1812, the same canvas as the gate door art. The light shape is what shows through the carved frame; the
dark corners are hidden behind the wood, so paint a little past the edge of the light shape (or fill the whole
canvas) and nothing will show a hard edge. The map's points and lines sit in the middle, about 1000x1672 of it,
so keep the texture quiet there. Saved as `assets/ui/route-background.png` (in the game now).

## enemy-guide.png (1000x1770)
The canvas for an enemy character (`assets/ui/enemy-duellist.png`): your character flipped to face left, faded, so the
enemy matches its size, height and how it is cut off at the bottom. Draw on top, then hide the guide.

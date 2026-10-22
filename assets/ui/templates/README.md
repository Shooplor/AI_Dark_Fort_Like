# Die texture template

The fate die is a 3D pyramid (js/die3d.js). Its look is one flat picture wrapped around it: the pyramid unfolded into
one big triangle made of four faces.

- `die-uv-template.png`: paint over this (1088 x 951, keep that size exactly).
- `die-uv-template-with-notes.png`: the same with notes.
- Save the painted result as `assets/ui/die-texture.png` (replacing the placeholder).
- Paint the whole big triangle and a little past its outline. Edges marked with the same letter (A, B, C) meet when
  folded, so a pattern that crosses one should continue on its partner. The inner lines are folds too.
- The circles are where the game writes the rolled number (upright as shown). To paint the numbers yourself instead,
  set `NUMBERS_IN_TEXTURE` to true at the top of js/die3d.js.
- Face 1 (the middle) is the face it stands on; when 1 is rolled it is shown point-down, as it sits in the picture.

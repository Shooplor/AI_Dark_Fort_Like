# Room templates

Guides to draw the five room tiles over (not used by the game itself).

- `*-160.png`: the exact final size (160x160, shown at 80x80 in the game).
- `*-640-with-notes.png`: the same guides 4x larger, with notes. Draw at 640 if that is easier; it is scaled down.
- Each is in the orientation the game expects; it turns the rooms clockwise as needed.
- Grey band = wall (about 14px of 160), red marks = doorway (pixels 56 to 104 along that edge), keep it open.
- Seen from straight above, no writing, no strong light from one side (the rooms get rotated).
- Save your finished rooms as `dead_end.png`, `straight.png`, `bend.png`, `tee.png`, `cross.png`.
- `great_doors-*`: optional piece for the entrance foyer's bottom wall (80x24 at final size).

# Locked doors

A locked door is your ordinary door (drawn twice, back to back, as now) with a **lock** on top of it, centred on the wall
between the two rooms. Only the lock needs drawing, once per key colour.

- `lock-128.png`: the exact size (128 x 128, shown at 16 x 16, the same scale as the door). `lock-512.png`: the same, 4x
  larger to draw on; it is scaled down.
- Keep the lock inside the red circle, centred on the cross. Transparent background.
- The lock stays upright on every wall (the door turns, the lock does not). `lock-placement-guide.png` shows how it sits.
- Six files, named by key: `lock-brass.png`, `lock-silver.png`, `lock-crimson.png`, `lock-violet.png`, `lock-emerald.png`,
  `lock-ivory.png`. Match each to your key drawing's colour.

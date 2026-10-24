# Art still to make

What is still drawn by code (placeholder) and could be replaced by your own art. Sizes are for the artwork at **2x**
(the game canvas is 1600x900, so something shown at 64px on screen is a 128px file) unless it says "normal size".
Transparent PNGs. Send a file and I will wire it in; for anything that stretches (cards, buttons) tell me which
parts are the corners so I can stretch only the middle.

## Already done (real art in the game)

Tapestry background, pillar frame, right-panel frame, all 15 item icons, all five room tiles, the hidden (rubble) room, the boarded-up room, the crowbar, all six door locks, the open door, character (idle, walk x3, hit x5, heal x4), heart and eye
counters, inventory slot, unexplored-room field, current-room highlight, player pendant, the great gate doors, the road's point icons, the map background, the 3D fate die's texture, mouse cursor.

## 1. The map

All done: rooms, hidden and boarded-up rooms, doors, all six locks.

## 2. The road (travel map)

Drawn by code now as simple line icons in the centre area (about 500x836 on screen). Sizes are file sizes
(already at 2x), transparent PNGs.

| Piece | Size | Notes |
| --- | --- | --- |
| Masked house point (done) | file 100x100 (50x50 on screen) | The playable point. |
| Campfire point (done) | file 100x100 | |
| Hooded stranger point (done) | file 100x100 | |
| Game of chance point (done) | file 100x100 | |
| House of the Rite (final point) (done) | file 100x100 now (68x68 on screen); 136x136 would be sharper | The mask coin. |
| Start of the road | file 40x40 | The small spot at the bottom centre where you stand before the first step. |
| Point states | | Now done by code: a gold pulsing ring for "you can go here", dimmed for visited. Own art optional. |
| Map background (done) | file 1432x1812 | A quiet texture behind the points, filling the opening of the carved frame. Template: `assets/ui/templates/route-background-template.png` (same canvas as the doors). |
| Road lines | | Drawn by code: a dark band with a lighter edge; gold dashes inside it for the paths you can take, solid gold for the path walked. A texture is optional. |
| Embark button | about 200x50 | At the seam of the doors. Normal and hover. |

### Door dust (particles)

Puffs of dust drift up and down from the seam as the doors part, and bits of grit fall. Now they are soft code
circles. A few variants of each size let the burst look less repeated; the code picks at random, turns and fades
them, and scales the puffs up as they drift (to about 2.5x), so draw them at the start size. Soft edges that
fade to transparent work best. Sizes are the file sizes (already at 2x).

| Piece | File size | How many | Notes |
| --- | --- | --- | --- |
| Dust puff, small | 48x48 | 2-3 variants | Wispy, mostly transparent, a dusty grey-brown. |
| Dust puff, medium | 80x80 | 2-3 variants | |
| Dust puff, large | 128x128 | 1-2 variants | Used sparingly, for the big first burst. |
| Grit / stone chip | 8x8, 12x12, 16x16 | one of each | Hard-edged little crumbs of stone that fall with a spin. |

## 3. Fencing (fights)

Placeholders drawn by code or quickly painted now. Sizes are file sizes (2x), transparent PNGs.

| Piece | File size | Notes |
| --- | --- | --- |
| Enemy: the Masked Duellist | 1000x1770 | Same canvas as your character, facing left (towards the centre), cut off at the bottom the same way. Replaces `assets/ui/enemy-duellist.png`. Optional extra frames later: hit, falling. |
| Combat readiness icon (done) | 97x97 | `assets/ui/readiness-counter.png` |
| Enemy heart | (none) | Your heart, mirrored and desaturated by code. Draw its own if you like, 97x97. |
| Card front: High, Middle, Low | 200x276 | Shown at 100x138. The name and "Attack/Guard" are live text now; draw empty fronts with the line's picture, or tell me where text should go. The enemy's cards use a red-tinted version (optional separate art). |
| Card back | 200x276 | Used for the enemy's face-down card and the deck pile. |
| Card slot (done, in the fight background) | 140x206 in the art | Played cards shrink to 70% to sit in them. The bound line will be shown by the drawn arms. |
| Line symbols (done, in the fight background) | | The arrow diamonds; the bound line's diamond glows (code). |
| Bind clash | about 200x200 | Optional: a spark/flash sprite where blades meet (a strip of frames works too). |
| Fencing arms (3D test) | | Low-poly arms and swords in 3D (js/arms3d.js) playing every exchange (guard, wind-up, thrust, bind), built from simple shapes in flat colours for now; to be modelled from your 2D references (with elbows, proper blades). If we keep 3D: textures painted on UV templates, or models made in Blender. |
| "AMBUSH!" / "En garde" lettering | about 1000x200 each | Optional; the display font is used now. |
| Fight background (done) | 1432x1812 | `assets/ui/fight-background.png`. If the panels move, tell me and I re-measure the slots. |

## 4. Pop-ups (shapes)

| Piece | Now | Notes |
| --- | --- | --- |
| Item tooltip (click an item in the inventory) | 410 wide, about 160 tall, taller for long text; sits above the inventory | Name, a description and Use / Drop buttons are live text. Needs a frame that can grow taller. A green-edged variant for evidence is optional. |
| Pause card (Esc) | 620x457 on a dimmed screen | Title, text, sound and voice sliders and two buttons sit inside. |
| End-of-run card | 620x357 | One card for "victory", "you have fallen", "discovered" and "nowhere left to go". A separate victory version is optional (it has a green edge now). |
| Chronicle drawer | the right panel's inner area, plain dark box | Optional: its own backing. |

## 5. Buttons and small interface pieces (all drawn by code now)

| Piece | Size now | Notes |
| --- | --- | --- |
| Standard button (Chronicle, New game, Close, Take, Use, Drop, Begin anew, Look at the map, Return to game) | 88-193 x 26-43 | Normal, hover, disabled. If you want text-free art, draw empty buttons in 2-3 widths. |
| Choice button in the room text | about 348x46 | Normal and hover. Has a small round number badge (1, 2, 3) at its left. |
| Event text box (the lines such as "There is nothing here for you") | text width, left bar | Variants by kind: normal, trap (red), evidence (green), healing, quiet. Optional. |
| Divider under the room description | thin line with a small diamond | Optional. |
| "On the floor" row | icon + name + Take button | Optional. |
| Red error message ("The door will not open") | text only | Optional. |
| Sliders and dropdown on the pause card | small | Optional. |

## 6. Optional extras

| Piece | Notes |
| --- | --- |
| Pointer cursor for clickable things | the arrow is used everywhere now |
| Glow shown around a room you can walk to | drawn by code |
| Green glow around evidence | drawn by code; own art optional |
| Floating "-2" / "+3" numbers | live text in the display font, can become hand-lettered |
| Screen flashes (red when hurt, green when healed) | code |

## Not drawings, but still stand-ins

- All sound effects are synthesised (list in `assets/audio/README.md`); the music is your recording.
- The voice reading the text is the browser's built-in speech.

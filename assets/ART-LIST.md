# Art still to make

What is still drawn by code (placeholder) and could be replaced by your own art. Sizes are for the artwork at **2x**
(the game canvas is 1600x900, so something shown at 64px on screen is a 128px file) unless it says "normal size".
Transparent PNGs. Send a file and I will wire it in; for anything that stretches (cards, buttons) tell me which
parts are the corners so I can stretch only the middle.

## Already done (real art in the game)

Tapestry background, pillar frame, right-panel frame, character (idle, walk x3, hit x5, heal x4), heart and eye
counters, inventory slot, unexplored-room field, current-room highlight, player pendant, fate die, mouse cursor.

## 1. Item icons (15), in `assets/items/`

Shown about 64x64 in a slot and 34x34 in the "on the floor" list. Draw at **128x128**, centred, a little margin.

| Item | File |
| --- | --- |
| Healing Draught | `potion.png` |
| Brass / Silver / Crimson / Violet / Emerald / Ivory Key | `key-brass.png`, `key-silver.png`, `key-crimson.png`, `key-violet.png`, `key-emerald.png`, `key-ivory.png` |
| Porcelain Mask | `porcelain_mask.png` |
| Wax-Sealed Letter | `wax_letter.png` |
| Silver Bell | `silver_bell.png` |
| Withered Rose | `withered_rose.png` |
| Opera Glasses | `opera_glasses.png` |
| Silver Flute (evidence) | `flute.png` |
| Ritual Scroll (evidence) | `scroll.png` |
| Press Camera (evidence) | `camera.png` |

The six keys differ only in colour (the lock on the door uses the same colour). Evidence gets a green glow from the
code, so the icons need none.

## 2. The map

| Piece | Shown at | File size | Notes |
| --- | --- | --- | --- |
| Room tiles, 5 shapes: dead end, straight, bend, three-way, crossroads | 80x80 | 160x160 (or 240x240) | Draw one orientation, the game rotates it. Doorways are 30% of each edge, centred. Optional: a special entrance foyer (with the great doors). |
| Doors: open, blocked (rubble), locked | 40x24 on the edge between rooms | 80x48 | Drawn horizontal, the game rotates. Locked needs 6 colours (brass, silver, crimson, violet, emerald, ivory), or one lock plus a colour I tint. |

## 3. Pop-ups (shapes)

| Piece | Now | Notes |
| --- | --- | --- |
| Item tooltip (click an item in the inventory) | 410 wide, about 160 tall, taller for long text; sits above the inventory | Name, a description and Use / Drop buttons are live text. Needs a frame that can grow taller. A green-edged variant for evidence is optional. |
| Pause card (Esc) | 620x457 on a dimmed screen | Title, text, sound and voice sliders and two buttons sit inside. |
| End-of-run card | 620x357 | One card for "victory", "you have fallen", "discovered" and "nowhere left to go". A separate victory version is optional (it has a green edge now). |
| Chronicle drawer | the right panel's inner area, plain dark box | Optional: its own backing. |

## 4. Buttons and small interface pieces (all drawn by code now)

| Piece | Size now | Notes |
| --- | --- | --- |
| Standard button (Chronicle, New game, Close, Take, Use, Drop, Begin anew, Look at the map, Return to game) | 88-193 x 26-43 | Normal, hover, disabled. If you want text-free art, draw empty buttons in 2-3 widths. |
| Choice button in the room text | about 348x46 | Normal and hover. Has a small round number badge (1, 2, 3) at its left. |
| Event text box (the lines such as "There is nothing here for you") | text width, left bar | Variants by kind: normal, trap (red), evidence (green), healing, quiet. Optional. |
| Divider under the room description | thin line with a small diamond | Optional. |
| "On the floor" row | icon + name + Take button | Optional. |
| Red error message ("The door will not open") | text only | Optional. |
| Sliders and dropdown on the pause card | small | Optional. |

## 5. Optional extras

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

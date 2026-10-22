# Art still to make

What is still drawn by code (placeholder) and could be replaced by your own art. Sizes are for the artwork at **2x**
(the game canvas is 1600x900, so something shown at 64px on screen is a 128px file) unless it says "normal size".
Transparent PNGs. Send a file and I will wire it in; for anything that stretches (cards, buttons) tell me which
parts are the corners so I can stretch only the middle.

## Already done (real art in the game)

Tapestry background, pillar frame, right-panel frame, all 15 item icons, all five room tiles, the hidden (rubble) room, the crowbar, the open door, character (idle, walk x3, hit x5, heal x4), heart and eye
counters, inventory slot, unexplored-room field, current-room highlight, player pendant, fate die (flat picture and the 3D die's texture), mouse cursor.

## 1. The map

| Piece | Shown at | File size | Notes |
| --- | --- | --- | --- |
| Doors: blocked (rubble), locked (open door is done) | about 26x14 on the wall between two rooms | same as the open door: 210x116, drawn at the rooms' 640 scale | Drawn horizontal, the game rotates. Locked needs 6 colours (brass, silver, crimson, violet, emerald, ivory), or one lock plus a colour I tint. |

## 2. Pop-ups (shapes)

| Piece | Now | Notes |
| --- | --- | --- |
| Item tooltip (click an item in the inventory) | 410 wide, about 160 tall, taller for long text; sits above the inventory | Name, a description and Use / Drop buttons are live text. Needs a frame that can grow taller. A green-edged variant for evidence is optional. |
| Pause card (Esc) | 620x457 on a dimmed screen | Title, text, sound and voice sliders and two buttons sit inside. |
| End-of-run card | 620x357 | One card for "victory", "you have fallen", "discovered" and "nowhere left to go". A separate victory version is optional (it has a green edge now). |
| Chronicle drawer | the right panel's inner area, plain dark box | Optional: its own backing. |

## 3. Buttons and small interface pieces (all drawn by code now)

| Piece | Size now | Notes |
| --- | --- | --- |
| Standard button (Chronicle, New game, Close, Take, Use, Drop, Begin anew, Look at the map, Return to game) | 88-193 x 26-43 | Normal, hover, disabled. If you want text-free art, draw empty buttons in 2-3 widths. |
| Choice button in the room text | about 348x46 | Normal and hover. Has a small round number badge (1, 2, 3) at its left. |
| Event text box (the lines such as "There is nothing here for you") | text width, left bar | Variants by kind: normal, trap (red), evidence (green), healing, quiet. Optional. |
| Divider under the room description | thin line with a small diamond | Optional. |
| "On the floor" row | icon + name + Take button | Optional. |
| Red error message ("The door will not open") | text only | Optional. |
| Sliders and dropdown on the pause card | small | Optional. |

## 4. Optional extras

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

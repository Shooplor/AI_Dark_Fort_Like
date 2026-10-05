# UI artwork

All files are authored at **2x** of the 1600x900 game canvas (a 160px image is shown at 80px), and are
placed at the exact positions measured from the art mockup. To replace one, send a new file with the same
name and the same pixel size.

| File | Shown at (on the 1600x900 canvas) | Used for |
| --- | --- | --- |
| `background.png` | 1600x900, behind everything | tapestry |
| `center-pillars.png` | 716x906 at x=442, y=-6 | carved frame around the map |
| `character.png` | 500x885 at x=-45, y=69 | the masked figure (its hem and left edge sit just off the screen edges, so the walk animation never shows a cut) |
| `hurt-1.png` ... `hurt-5.png` | 439x824 at (-5, 99), **normal size (not 2x)** | the hit animation, played in order at 11 frames a second whenever health is lost (frame 1 matches `character.png` exactly) |
| `walk-1.png` ... `walk-3.png` | 439x824 at (-5, 99), **normal size (not 2x)** | the walking animation, looped at 8 frames a second while the figure walks between rooms |
| `die.png` | 250x250, shown at 72px (not 2x) in the die slot top of the right panel | the d4 fate die; the rolled number is live text drawn over it |
| `hp-counter.png` | 48.5px at (24, 37) | heart icon |
| `eye-counter.png` | 86x46.5 at (192, 38) | eye icon (turns before discovery) |
| `inventory-slot.png` | 127px, six times (see `SLOT_POS` in `js/ui.js`) | inventory slots |
| `room-field.png` | 80x80 per room | an unexplored room |
| `highlighted-field.png` | 80x80 | the room you are standing in |
| `player-symbol.png` | 100x100, centred on your room | the golden pendant marking you |

The counter numbers are live text (Cinzel), not part of the images. Their colours are in `css/style.css`
(`.nums`).

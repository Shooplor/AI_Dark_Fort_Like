# Art still to make

Sizes are for the artwork at 2x (the game canvas is 1600x900, so a 64px picture on screen is a 128px file).
Transparent PNGs unless it says otherwise. Send a file with the name given and I will wire it in.

## Item icons (15)

Shown about 64x64 in an inventory slot and 34x34 in the "on the floor" list. Draw at **128x128**, centred, with
a little empty margin. File name = the id in the second column, in `assets/items/`.

| Item | File | What it is |
| --- | --- | --- |
| Healing Draught | `potion.png` | restores 4 health when drunk |
| Brass Key | `key-brass.png` | opens a door with a brass lock (used up) |
| Silver Key | `key-silver.png` | ...silver lock |
| Crimson Key | `key-crimson.png` | ...crimson lock |
| Violet Key | `key-violet.png` | ...violet lock |
| Emerald Key | `key-emerald.png` | ...emerald lock |
| Ivory Key | `key-ivory.png` | ...ivory lock |
| Porcelain Mask | `porcelain_mask.png` | curio, no effect |
| Wax-Sealed Letter | `wax_letter.png` | curio, no effect |
| Silver Bell | `silver_bell.png` | curio, no effect |
| Withered Rose | `withered_rose.png` | curio, no effect |
| Opera Glasses | `opera_glasses.png` | curio, no effect |
| Silver Flute | `flute.png` | **evidence** (quest item) |
| Ritual Scroll | `scroll.png` | **evidence** (quest item) |
| Press Camera | `camera.png` | **evidence** (quest item) |

The six keys differ only in colour (the lock on the door is drawn in the same colour). Evidence gets a green
outline around its inventory slot in the game, so the icon itself needs no green.

## Other pieces

| Piece | Where / how big on screen | Suggested file size (2x) | Notes |
| --- | --- | --- | --- |
| Fate die (d4) | top-left of the right panel, now 54x54 | your choice, e.g. 240x240 | One picture without a number (the game writes 1-4 on it), or four pictures `die-1..4.png`. Tell me the size you want it shown at. |
| Right-panel background | now a plate at x=1180, y=26, 392x848 | 784x1696 | Can be larger if you want it to reach the frame; the text sits inside it. |
| Pop-up shape | now a card about 620x340 in the middle | 1240x700 | One frame used for Paused, win, lost ("fallen"), "discovered" and "nowhere left to go". The title and text are live text inside it. |
| Room tiles | 80x80 per room | 160x160 (or 240x240) | Five shapes: dead end, straight, bend, three-way, crossroads. Draw one orientation; the game rotates it. Doorways are 30% of each edge, centred. A different start-room (foyer) is optional. |
| Doors | 40x24 on the edge between two rooms | 80x48 | Open, blocked, and locked (six lock colours as above). Drawn horizontal; the game rotates it. |
| Choice buttons | the buttons in the room text | optional | Currently styled with code. |
| Character frames | the figure on the left | later | Idle and walk, same canvas size, numbered (`idle_01`...). |

# The Masked House

A browser dungeon crawler in the spirit of the tabletop game *Dark Fort*, set in a baroque, candle-lit
masquerade house. You are a masked, cloaked figure exploring room by room; every playthrough builds a
different house.

This is a playable prototype. The screen uses the real artwork in `assets/ui/`; room tiles, doors, the fate die
and item icons are still placeholder SVG until they are drawn.

## Play

No build step and no dependencies: open `index.html` in a browser. Fonts are bundled in `assets/fonts/`, so
it also works offline.

| Action | Control |
| --- | --- |
| Move one room (no diagonals) | Arrow keys / WASD, or click an adjacent room |
| Inspect, use or drop an item | Click it in the inventory strip on the left |
| Pick an item up from the floor | "Take" button in the right-hand panel |

Add `?seed=1234` to the URL to replay a specific house. The seed is shown under the map.

## The rules so far

- **The map** is 56 unexplored rooms in an oval (6 columns by 10 rows, with the four corners cut off by the
  frame). You start in the entrance foyer, the second room of the bottom row.
- **Discovery:** you have 20 turns (the eye counter, top left) before you are discovered and the run ends.
- **Moving** costs a turn. You can only pass through a door that exists on that wall.
- **Entering a new room casts the fate die (d4)**: the roll is the number of doors the room has, counting
  the one you came through. 1 = dead end, 2 = passage (straight or bending), 3 = junction, 4 = crossroads.
  Rooms always agree with their neighbours: a door never opens onto a wall.
- **Doors** can be open, **locked** (coloured lock, needs the matching key) or **blocked** (rubble; a
  permanent wall for now). Keys are found in other rooms, and are used up when they turn, so backtracking
  is part of the game.
- **Room events** are rolled for each new room: nothing, a healing draught, a curio, a trap (-1 to -3
  health), or a restorative fountain.
- **Health** starts at 10. Reaching 0 ends the run. **Inventory** has 6 slots; a full satchel leaves
  finds on the floor.
- The generator works to keep a way forward open: it adds doors when you would be boxed in, rubble can
  give way, and a key you need is dropped where you can reach it. Even so, a run can end with
  "Nowhere left to go" once every remaining door is sealed.

There is no win condition yet (quest items are planned).

## Project layout

```
index.html        page shell (left / centre / right panels on a fixed 1600x900 canvas, scaled to fit)
css/style.css     pixel-exact layout (from the art mockup), theme, figure idle / walking animation
assets/ui/        the real artwork (see assets/ui/README.md)
assets/fonts/     bundled fonts (Cinzel, Cormorant Garamond; SIL Open Font License)
js/rng.js         seeded random numbers
js/data.js        tuning numbers, room names and text, items, events    <- add content here
js/dungeon.js     the grid, doors, room generation, reachability        (pure logic, no DOM)
js/game.js        turns, health, inventory, events                      (pure logic, no DOM)
js/art.js         where every picture is produced: real art + remaining placeholders
js/ui.js          rendering and turn animation (walk -> die -> reveal -> text)
js/main.js        boot, window scaling, ?seed=
tests/simulate.js headless bot that plays thousands of games and checks the generator
```

### Swapping in real art

Every image in the game is a function in `js/art.js` returning an HTML string. The pieces that are already
drawn load from `assets/ui/` (replace a file with a new one of the same name and it shows up). Still
placeholders: `Art.roomTile` (receives the room's `shape`, `rot` and `exits`), `Art.doorGlyph`, `Art.die` and
`Art.icon` (item icons). The figure is a single image for now; its idle and walking motion is in
`css/style.css` (`.figure-img`), and animation frames can replace it later.

### Tests

```
node tests/simulate.js 2000
```

Plays 2000 seeded games with a bot and fails if any invariant breaks: doors disagreeing between rooms,
a locked door without exactly one key in the world, orphaned keys, or the game declaring itself stuck
while an unexplored room is still reachable.

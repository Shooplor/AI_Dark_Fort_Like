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
| Move one room (no diagonals) | Arrow keys / WASD (any keyboard layout), or click an adjacent room |
| Make a choice in a room | Click one of the buttons in the right-hand panel, or press 1 / 2 / 3 |
| Pause / resume | Esc (also closes an open item popover or the chronicle first) |
| Open / close the chronicle | The Chronicle button under the room text, or the C key |
| Mute / unmute all sound | M (volume sliders and a Sound button are on the pause screen) |
| Voice reading the text on / off | V (the pause screen also has a voice picker, volume, pace and pitch) |
| Inspect, use or drop an item | Click it in the inventory strip on the left |
| Pick an item up from the floor | "Take" button in the right-hand panel |

### Sharing the game with friends

`dist/TheMaskedHouse.html` is the whole game in **one file** (pictures and fonts packed inside, 4.5 MB). Send that
single file; friends double-click it and it opens in their browser, with no folder, install or internet needed.
It is rebuilt with `node tools/build.js` after every change (the file in the repo is always the current build).

**Quick testing link:** the game is also published as a private page (see the link Claude gives in chat). `node tools/make-artifact.js <folder>` prepares the files for it; Claude republishes after each change.

Add `?seed=1234` to the URL to replay a specific house. The seed is shown under the map.

## The rules so far

- **The map** is 56 unexplored rooms in an oval (6 columns by 10 rows, with the four corners cut off by the
  frame). You start in the entrance foyer, the second room of the bottom row (it does not cost a point).
- **Discovery:** the eye counter (top left) starts at 0/20 and goes up by one each time you explore a **new** room.
  Reach 20/20 and you are discovered, and the run ends. Walking back through rooms you have already explored is
  free.
- **Moving** is one room at a time, and only through a door that exists on that wall.
- **Entering a new room casts the fate die (d4)**: the roll is the number of doors the room has, counting
  the one you came through. 1 = dead end, 2 = passage (straight or bending), 3 = junction, 4 = crossroads.
  Rooms always agree with their neighbours: a door never opens onto a wall.
- **Doors** can be open, **locked** (coloured lock, needs the matching key) or **blocked** (rubble; a
  permanent wall for now). Keys are found in other rooms, and are used up when they turn, so backtracking
  is part of the game (and free, see above).
- **Room events** are rolled for each new room: nothing, a healing draught, a curio, a trap (-1 to -3
  health), a restorative fountain, or (about 3 rooms in 10) **a choice**.
- **Choices:** the room describes something (a cupboard and a chest, a mirror, a bell-rope...) and offers two or
  three buttons. Each button rolls a good, neutral or bad outcome (an item, nothing, or damage), so nothing is
  a sure thing. Choosing is free (it costs no turn), but you cannot leave the room until you have chosen.
- **Health** starts at 10. A hit of 3 or more also sounds heavier (`hurtBig`). Losing health plays the five-frame hit animation (11 frames a second), shows a red "-2" floating up from the figure's head and makes the heart icon shrink and bounce back; healing shows a green "+3" and makes the heart swell. Reaching 0 ends the run. **Inventory** has 6 slots; a full satchel leaves
  finds on the floor.
- The generator works to keep a way forward open: it adds doors when you would be boxed in, rubble can
  give way, and a key you need is dropped where you can reach it. Even so, a run can end with
  "Nowhere left to go" once every remaining door is sealed.

- **Winning:** three pieces of evidence (a flute, a scroll and a camera, for now) are hidden in rooms, marked in the
  inventory by a green outline. Holding all three ends the game with a victory popup. Evidence cannot be dropped;
  if the satchel is full when a piece turns up, something less important is left behind to make room.
  `CONFIG.quest` in `js/data.js` decides how they are spread. Now `extraRooms: 4`: the pieces hide among your first
  24 new rooms, so some may lie in rooms 21-24, out of reach, and winning is not certain (the test bot wins about
  half the time; see `tests/balance.js`). With `extraRooms: 0` every piece is certain to turn up within your 20 rooms.

## Project layout

```
index.html        page shell (left / centre / right panels on a fixed 1600x900 canvas, scaled to fit)
css/style.css     pixel-exact layout (from the art mockup), theme, figure idle / walking animation
assets/ui/        the real artwork (see assets/ui/README.md)
assets/fonts/     bundled fonts (Cinzel, Cormorant Garamond; SIL Open Font License)
assets/audio/     real sound files, if you add any (see assets/audio/README.md)
js/rng.js         seeded random numbers
js/data.js        tuning numbers, room names and text, items, events,
                  choice events (CHOICE_EVENTS)                         <- add content here
js/dungeon.js     the grid, doors, room generation, reachability        (pure logic, no DOM)
js/game.js        turns, health, inventory, events                      (pure logic, no DOM)
js/art.js         where every picture is produced: real art + remaining placeholders
js/sound.js       sound effects and music, synthesised live (real files can replace any of it)
js/voice.js       reads the on-screen text aloud with the browser's built-in voice (a stand-in for a voice actor)
js/ui.js          rendering and turn animation (walk -> die -> reveal -> text)
js/main.js        boot, window scaling, ?seed=
tools/build.js    packs the game into the single file dist/TheMaskedHouse.html
tools/make-artifact.js  prepares the game's files for the private hosted test page
dist/             the packed, shareable game
tests/simulate.js headless bot that plays thousands of games and checks the generator
tests/rules.js    quick checks of the exploration counter, backtracking, choices and evidence
tests/balance.js  how often a bot wins under the real rules (use it to tune the difficulty)
```

### Sound

The **background music** is a real recording, `assets/audio/music.ogg` (your "Ritual Edit", about 3.5 minutes, looping).
It starts after the first key press or click, dips while the voice speaks or the game is paused, fades out when a run
ends and comes back in a new game. The **sound effects** are still **synthesised in the browser** (steps, the die, locks,
pickups, damage, healing and the endings). Volumes are on the pause screen (Esc), M mutes, and the settings are
remembered. The synthesised heartbeat that crept in near 20/20 only exists with the synthesised music.

To change the music, replace `assets/audio/music.ogg` (same name). To go back to the synthesised music, delete the `music`
line in `FILES` at the top of `js/sound.js`. Real recordings can replace any effect too: list them in `FILES` (see
`assets/audio/README.md` for the names). Anything not listed stays synthesised.

### Voice

The game reads its text aloud using the **browser's built-in speech** (a stand-in for a voice actor; the voice depends on
the player's computer and is often robotic). Each new room is read: its name, its description, then what happens (or the
choice and its options); choice outcomes, refused moves (the first time only), unlocking and the endings are read too.
A new action interrupts the reading, and the music dips while the voice speaks.

**V** turns the voice off and on at any time. On the pause screen (Esc) you can also pick another voice from the ones
installed on the computer, and change volume, pace and pitch ("Hear it" plays a sample). The settings are remembered.
Nothing is recorded or sent anywhere. Without speech support in the browser the controls are greyed out.

### Swapping in real art

Every image in the game is a function in `js/art.js` returning an HTML string. The pieces that are already
drawn load from `assets/ui/` (replace a file with a new one of the same name and it shows up). Item pictures go in `assets/items/` (see `assets/ART-LIST.md`). Still
placeholders: `Art.roomTile` (receives the room's `shape`, `rot` and `exits`), `Art.doorGlyph`, `Art.die` and
`Art.icon` (item icons). The figure is one idle image (slow breathing, `.figure-img` in `css/style.css`), a three-frame walk loop at 8 a second
(`assets/ui/walk-1..3.png`) and a five-frame hit animation at 11 a second (`assets/ui/hurt-1..5.png`).

### Tests

```
node tests/rules.js          # exploration counter, free backtracking, choices, evidence
node tests/simulate.js 2000  # the dungeon generator
node tests/balance.js 2000   # win rate under the real rules (add --extra=4 to try a harder setting)
```

`simulate.js` plays 2000 seeded games with a bot (making choices as it goes) and fails if any invariant breaks:
doors disagreeing between rooms, a locked door without exactly one key in the world, orphaned keys, or the game
declaring itself stuck while an unexplored room is still reachable.

# The Masked House: notes for Claude

A browser dungeon crawler. The owner is an artist, not a programmer: they design the game and draw the art, Claude
writes all the code, tests it and keeps the builds up to date. Explain things in plain words, without jargon.

## Working agreements

- **Show, don't film.** Show changes as screenshots. Never make videos.
- **Art and model iterations are not committed until approved.** While shaping something visual together (the 3D arms,
  textures, layouts the owner is judging by eye), change it and show a screenshot, but do not commit or push. Commit
  and push only when the owner says so ("ok you can now commit and push"). Automatic reminders to commit do not override
  this.
- Other work (features asked for, fixes, tests, tools) is committed and pushed when done and tested, on the branch the
  session names.
- Everything must work both in the normal page (`index.html`) and in the single file (`dist/TheMaskedHouse.html`).
- Keep the `.md` notes up to date: `README.md` (rules, layout, testing keys), `assets/ART-LIST.md` (every picture, its
  size and where it is used), `assets/audio/README.md`, `assets/arms/templates/README.md`.
- When the owner sends art, put it in place, show it, and give exact sizes and templates for anything they still need
  to draw.
- Ask before big rule or design changes; the owner likes to talk ideas through first.

## The test link

A private page the owner plays on: https://claude.ai/artifact/L9h97ksykM7BVB1Kz9akaV

After any change to the game, republish it:

```sh
node tools/build.js                 # makes dist/TheMaskedHouse.html (one file, everything inside)
node tools/make-artifact.js <dir>   # stages index.html + js/css/assets in <dir> (skips templates/ and source/ folders)
```

then publish with the Artifact tool: `file_path` `<dir>/index.html`, `url` the link above, `root` `<dir>`, and `files`
listing every staged file (the script prints them). The single file is also sent to the owner when asked.

## How the code is laid out

- Plain JavaScript, no build step for the page itself; a fixed 1600x900 stage scaled to the window. Everything hangs on
  `globalThis.DF`.
- Game logic with no browser in it, testable in Node: `js/rng.js`, `data.js`, `dungeon.js`, `combat.js` (the fencing
  rules), `game.js`, `route.js`.
- Screens: `js/ui.js` (the house), `road-ui.js` (gate and travel map, `setMode`), `fight-ui.js` (the duel),
  `arms3d.js` (the 3D fencing arms, three.js r149 in `js/vendor/`), plus `art.js`, `die3d.js`, `sound.js`, `voice.js`.
- `tools/build.js` packs every `asset('assets/...')` path written literally in the code, and every script in
  `index.html`, into the single file. Write asset paths literally so the build finds them.

## The 3D arms and their paintings

- The paintings (`assets/arms/*.png`) are drawn on fixed layouts (templates in `assets/arms/templates/`). When the
  shape of the arms changes, keep each piece's texture layout the same (change the positions, keep the UVs) so the
  owner's paintings still fit. Check with `tools/arms-templates/uv_dump.js` that the layout did not move.
- `tools/arms-templates/make.sh` remakes the templates if a layout ever has to change (tell the owner first: their
  paintings would need redoing).
- WebGL cannot load images from `file://`, so opened as a local file the arms show plain colours; the single file and
  the test link show the paintings.

## Testing

```sh
node tests/rules.js && node tests/combat.js && node tests/simulate.js && node tests/balance.js
node tools/build.js && tests/browser/run.sh          # every browser check; must end with TOTAL_FAILS=0
tests/browser/run.sh fight_ui arms_check             # just some
```

- Screenshots from the checks land in `tests/browser/out/`.
- **Keep pushes quick** (the full browser suite takes about 20 minutes): for a change, run the Node tests and only the
  browser checks that touch what changed (pick them by name), then commit, push and republish. Run the full suite in
  the background after pushing (or before bigger milestones) and fix anything it finds in the next push.
- Some checks measure timings and positions; on a busy machine they can miss by a hair. Run the suite on its own
  (not alongside other heavy work), re-run a failing check alone, and find the real cause before changing any wait.
- The browser checks use the pre-installed Playwright (`/opt/node-tools/node_modules/playwright`) and Chromium
  (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). WebGL needs `--enable-unsafe-swiftshader
  --use-angle=swiftshader`; textures from files also need `--allow-file-access-from-files`.
- Pillow (for the template tools and image work) is not installed by default: `pip install --target <dir> pillow`,
  then `PYTHONPATH=<dir>`.
- Useful URL options: `?house=1` skips the gate and road, `&fights=0` switches fights off, `&duel=N` starts a duel at
  once, `&seed=N` picks the house.
- Testing keys (remove before sharing the game): Shift+F starts a fight in the house, Shift+B makes the next exchange
  a bind.

## Commits

Clear messages saying what changed for the player. End every commit message with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YWJj1wmoXTWpr8za72f5Ah
```

## Roadmap (the owner's plan, to talk through before building each part)

The basis is in place (house, road, fencing with cards and adrenaline, 3D arms). Next, roughly in order:

1. **Experience:** every run rewards the player by how far they got on the travel map; levelling up unlocks new cards.
2. **Deck-building:** choosing which unlocked cards go into the deck (the rules already take any deck and card costs).
3. **Enemy variety and a boss battle.**
4. **The road's points doing things:** the campfire, the hooded stranger, the game of chance.
5. **Content variety:** more kinds of room situations, special cards (with adrenaline costs), enemies, swords.

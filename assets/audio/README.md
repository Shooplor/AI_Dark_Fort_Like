# Sound files (optional)

The game makes all its sound itself (see `js/sound.js`). If you would rather use real recordings, put them in this
folder (mp3, ogg or wav), then add them to the `FILES` list at the top of `js/sound.js` (send them to me and I will do
that). Anything you do not replace stays synthesised, so you can swap sounds one at a time.

Short effects should be trimmed tight (no silence at the start). Music should loop cleanly.

| Name | Plays when | Length |
| --- | --- | --- |
| `music` | the looping background music (starts on the first key press, fades out at the end of a run) | 1-3 min, loops |
| `step` | each footstep (two per move) | ~0.15 s |
| `bump` | walking into a wall or rubble | ~0.2 s |
| `locked` | trying a locked door without its key | ~0.3 s |
| `unlock` | a key opens a door | ~0.4 s |
| `diceRattle` | the fate die tumbling | ~0.85 s |
| `dieLand` | the die coming to rest | ~0.2 s |
| `reveal` | a new room appears on the map | ~1 s |
| `tick` | the eye counter goes up | ~0.6 s |
| `pickup` | an item goes into the satchel | ~0.7 s |
| `evidence` | a piece of evidence (quest item) is found | ~2 s |
| `hurt` | losing health | ~0.5 s |
| `heal` | regaining health | ~1.5 s |
| `click` | a button, a choice, opening an item | ~0.05 s |
| `drop` | dropping an item | ~0.15 s |
| `pause` / `resume` | opening / closing the pause screen | ~0.4 s |
| `win` | the victory popup | ~3 s |
| `lose` | "You have fallen" | ~3 s |
| `caught` | "You have been discovered" | ~3 s |
| `stuck` | "Nowhere left to go" | ~2 s |

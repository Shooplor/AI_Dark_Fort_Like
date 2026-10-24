# Texture templates for the 3D fencing arms

The arms (js/arms3d.js) wear three textures per side, painted over these templates:

| Texture | Size | Files here |
| --- | --- | --- |
| Coat (sleeves, elbow, shirt) | 1024 x 1024 | `coat-uv-template.png` (plain), `coat-uv-colours.png` (colour-coded), `coat-uv-colours-labelled.png`, `coat-uv-map.png` (the model and the map side by side) |
| Glove (cuff, hand, thumb) | 1024 x 512 | the same four, `glove-...` |
| Sword (blade in two halves, grip, pommel, crossbar, knuckle-bow, ring) | 1024 x 512 | the same four, `sword-...` |

On the maps each part has one colour, the same as on the model in the `-uv-map.png` sheets; bright bands are seen in
the game, dark bands are hidden. Long parts lie lengthwise, the end nearer the shoulder (or the pommel) on the left.
The paintings go in `assets/arms/`: `coat-player.png`, `coat-enemy.png`, `glove-player.png`, `glove-enemy.png`,
`sword-player.png`, `sword-enemy.png`.

The layouts are fixed: if a part is reshaped, the code keeps its texture layout so the paintings do not move.

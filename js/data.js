/* Static game data: tuning numbers, room names, flavour text, items and events.
 * Add new rooms / events / items here — nothing else needs to change for plain text content.
 *
 * Text conventions: [[double brackets]] mark a highlighted item name in the log. */
(function () {
  const DF = (globalThis.DF = globalThis.DF || {});

  /* ---------- Tuning ---------- */
  DF.CONFIG = {
    // The map. '#' is a room, '.' is no room (the corners cut off by the oval frame): 56 rooms in all.
    layout: [
      '.####.',
      '######',
      '######',
      '######',
      '######',
      '######',
      '######',
      '######',
      '######',
      '.####.',
    ],
    start: { x: 2, y: 9 }, // the entrance foyer: bottom row, second room from the left
    maxTurns: 20, // moves before the player is discovered
    maxHp: 10,
    slots: 6,
    potionHeal: 4,
    doorOdds: { locked: 0.14, blocked: 0.1 }, // everything else is an open door
    keyDropChance: 0.3, // per newly explored room, while a key is still "owed"
  };

  DF.CONFIG.rows = DF.CONFIG.layout.length;
  DF.CONFIG.cols = DF.CONFIG.layout[0].length;

  /* ---------- Geometry ---------- */
  // Sides are indexed clockwise from the top: 0 north, 1 east, 2 south, 3 west.
  DF.SIDE_NAMES = ['north', 'east', 'south', 'west'];
  DF.DIRS = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
  ];
  DF.opposite = (side) => (side + 2) % 4;

  /* ---------- Room shapes ---------- */
  // The 4-sided die decides how many doors a new room has (counting the one you came in by).
  DF.SHAPES = {
    dead_end: { label: 'Dead end', blurb: 'a hallway with a single door' },
    straight: { label: 'Passage', blurb: 'a passage with two doors' },
    bend: { label: 'Passage', blurb: 'a passage with two doors' },
    tee: { label: 'Junction', blurb: 'a junction with three doors' },
    cross: { label: 'Crossroads', blurb: 'a crossroads with four doors' },
  };

  // Room names by number of doors.
  DF.ROOM_NAMES = {
    1: [
      'The Cloakroom',
      'Confessional Alcove',
      'The Curtained Booth',
      'The Wine Closet',
      'The Mask Atelier',
      'The Candle Vault',
      'A Dressing Chamber',
      "The Servants' Niche",
    ],
    2: [
      'The Velvet Passage',
      'The Portrait Gallery',
      'The Mirrored Corridor',
      'A Candlelit Hallway',
      'The Long Gallery',
      'The Marble Colonnade',
      'The Gilt Arcade',
      'The Whispering Passage',
    ],
    3: [
      'The Card Room',
      'The Music Room',
      'The Smoking Salon',
      'The Salon of Sighs',
      'The Orangery',
      'The Library of Whispers',
      'The Chapel of Masks',
      'The Billiard Room',
    ],
    4: [
      'The Grand Ballroom',
      'The Hall of Mirrors',
      'The Marble Rotunda',
      'The Atrium of Masks',
      'The Court of Chandeliers',
      'The Banquet Hall',
    ],
  };

  DF.ROOM_DETAILS = [
    'Gilded cherubs leer from the ceiling, their paint flaking like old skin.',
    'A chandelier hangs low, half its candles guttering.',
    'Heavy crimson drapes swallow the windows.',
    'Cracked mirrors multiply your masked reflection.',
    'The air smells of wax, wine and something older.',
    'A harpsichord plays a single note, over and over, though no one sits at it.',
    'Faded portraits of masked nobles follow you with painted eyes.',
    'Rose petals carpet the marble, still fresh.',
    'Plaster cupids hold unlit torches in their little fists.',
    'Black-and-white tiles stretch away like a chessboard waiting for its game.',
    'Gold leaf peels from the wall panels in long curls.',
    'A fire burns in the grate, though the chimney is bricked shut.',
    'Candle smoke hangs in the air, motionless, as if time paused here.',
    'The wallpaper is a damask of tiny, repeating faces.',
    'Velvet chairs face the wall, each one still warm to the touch.',
    'A marble statue of a veiled woman weeps a thin line of wine.',
  ];

  DF.ROOM_ODDITIES = [
    'A masked figure stands motionless in the corner. When you blink, it is gone.',
    'A long table is laid for forty; every plate is empty and warm.',
    'Whispered chanting seeps through the walls, then stops the moment you listen.',
    'Somewhere above you, a ballroom full of feet begins to waltz.',
    'A single white mask lies on the floor, face down, as though it fell from someone mid-sentence.',
    'The clocks on the mantel all strike a different hour.',
    'You catch the scent of perfume, and with it the feeling of being watched.',
    'A door you did not see before is painted onto the far wall.',
  ];

  /* ---------- Items ---------- */
  DF.KEY_TYPES = [
    { id: 'brass', name: 'Brass Key', lock: 'brass', color: '#d4a63a' },
    { id: 'silver', name: 'Silver Key', lock: 'silver', color: '#c4cad4' },
    { id: 'crimson', name: 'Crimson Key', lock: 'crimson', color: '#c42b46' },
    { id: 'violet', name: 'Violet Key', lock: 'violet', color: '#9a63d6' },
    { id: 'emerald', name: 'Emerald Key', lock: 'emerald', color: '#33ad78' },
    { id: 'ivory', name: 'Ivory Key', lock: 'ivory', color: '#efe6cf' },
  ];
  DF.keyType = (id) => DF.KEY_TYPES.find((k) => k.id === id);

  DF.ITEM_DEFS = {
    potion: {
      id: 'potion',
      name: 'Healing Draught',
      icon: 'potion',
      usable: true,
      desc: 'A ruby tincture that smells of cloves and old churches. Restores health when drunk.',
    },
  };

  DF.keyItemDef = function (typeId) {
    const k = DF.keyType(typeId);
    return {
      id: 'key:' + typeId,
      name: k.name,
      icon: 'key',
      color: k.color,
      keyType: typeId,
      desc: `Fits a ${k.lock} lock somewhere in this house. It is used up when it turns.`,
    };
  };

  DF.CURIOS = [
    { id: 'porcelain_mask', name: 'Porcelain Mask', icon: 'mask', desc: 'Blank, white and eyeless. It is cold, as though it had been breathing a moment ago.' },
    { id: 'wax_letter', name: 'Wax-Sealed Letter', icon: 'letter', desc: 'The seal shows a peacock. The envelope is addressed to you, in your own handwriting.' },
    { id: 'silver_bell', name: 'Silver Bell', icon: 'bell', desc: 'It rings without a sound. Somewhere far off, something answers.' },
    { id: 'withered_rose', name: 'Withered Rose', icon: 'rose', desc: 'Black with age, yet its thorns are sharp and its scent is sweet.' },
    { id: 'opera_glasses', name: 'Opera Glasses', icon: 'glasses', desc: 'Through them, the walls look thin and the rooms beyond them occupied.' },
  ];

  /* ---------- Events ---------- */
  // Rolled whenever a *new* room is explored. Weighted; "nothing" simply shows the description.
  DF.EVENTS = [
    { id: 'nothing', weight: 36 },
    { id: 'potion', weight: 14 },
    { id: 'curio', weight: 14 },
    { id: 'trap', weight: 10 },
    { id: 'blessing', weight: 8 },
  ];

  DF.EVENT_TEXT = {
    nothing: [
      'You search the shadows and find only dust and old perfume.',
      'There is nothing here for you. Only the feeling that the room is waiting for you to leave.',
      'You listen. Nothing stirs. The house holds its breath.',
      'Nothing of value remains here; others have been through before you.',
    ],
    potion: [
      'Behind a velvet curtain you find a stoppered flask of ruby liquid: a [[Healing Draught]].',
      'A [[Healing Draught]] sits on a silver tray, as though left out for you.',
    ],
    curio: [
      'Half-hidden beneath a cushion you find a [[{item}]].',
      'On a side table, set apart from the dust, lies a [[{item}]].',
      'Something glints in the shadows: a [[{item}]].',
    ],
    key: [
      'A [[{item}]] hangs from a hook beneath a painted saint.',
      'You find a [[{item}]] tucked inside a hollow candlestick.',
      'A [[{item}]] lies in a dish of wilted rose petals.',
    ],
    trap: [
      'A blade slides from the wall as you cross the floor. You lose {n} health.',
      'The gilded chalice you reach for is rimmed with needles. You lose {n} health.',
      'A chandelier chain snaps, and crystals rain down on you. You lose {n} health.',
    ],
    blessing: [
      'A silver fountain murmurs in the corner. You drink, and strength returns. You regain {n} health.',
      'A goblet of dark wine stands on the altar. It tastes of cherries and iron. You regain {n} health.',
    ],
    blessingFull: [
      'A silver fountain murmurs in the corner. You drink, but you are unhurt and it tastes of nothing.',
    ],
    packFull: ' Your satchel is full, so it stays on the floor.',
  };

  DF.MOVE_TEXT = {
    wall: [
      'A solid wall of damask and plaster. There is no door that way.',
      'Only wall. The painted cherubs seem to find your mistake amusing.',
    ],
    entrance: 'The great doors have shut behind you and will not open. There is no leaving now.',
    blocked: [
      'Rubble and splintered furniture choke the doorway. It will not budge.',
      'A toppled armoire fills the doorway. There is no way through.',
      'The door has been bricked up, recently, and badly.',
    ],
    locked: 'The door is locked, with a {lock} lock. You need the {key}.',
    unlocked: 'The {key} turns. The lock gives way, and the key crumbles to dust.',
  };
})();

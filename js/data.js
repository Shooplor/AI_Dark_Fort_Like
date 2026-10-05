/* Static game data: tuning numbers, room names, flavour text, items and events.
 * Add new rooms / events / items / choice events here — nothing else needs to change for plain text content.
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
    maxExplorations: 20, // new rooms the player may explore before being discovered (walking back is free)
    // The evidence (quest items) is hidden at random among the rooms you explore, in the order you explore them:
    // from your `from`-th new room up to your (maxExplorations + extraRooms)-th.
    //   extraRooms 0: every piece is hidden somewhere within your 20 rooms, so exploring all 20 always shows you everything.
    //   extraRooms 4: the hiding places run to room 24, so some pieces land in rooms 21-24, which you can never reach.
    // More extra rooms = harder to win. (tests/balance.js --extra=N shows the win rate.) See Game.maybePlaceQuestItem.
    quest: { from: 4, extraRooms: 4 },
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

  /* Quest items: the evidence. Holding all of them wins the game. They cannot be dropped. */
  DF.QUEST_ITEMS = [
    {
      id: 'flute',
      name: 'Silver Flute',
      icon: 'flute',
      quest: true,
      desc: 'A slender silver flute engraved with the cult\'s sigil. Its notes opened every rite. Evidence.',
      found: 'On a velvet-lined stand, among the sheet music, lies a slender silver flute engraved with a sigil you have seen before: [[Silver Flute]].',
    },
    {
      id: 'scroll',
      name: 'Ritual Scroll',
      icon: 'scroll',
      quest: true,
      desc: 'A scroll sealed with black wax: the order of the ceremony, and the names of those who attend. Evidence.',
      found: 'Beneath a loose floorboard lies a scroll sealed with black wax, the order of the ceremony in a careful hand: [[Ritual Scroll]].',
    },
    {
      id: 'camera',
      name: 'Press Camera',
      icon: 'camera',
      quest: true,
      desc: 'A heavy press camera with the film still wound. Whatever it saw, the pictures will speak for themselves. Evidence.',
      found: 'Forgotten on a windowsill, a heavy press camera with the film still wound: [[Press Camera]]. Whoever left it left in a hurry.',
    },
  ];

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
    { id: 'choice', weight: 34 }, // a decision with buttons (see CHOICE_EVENTS below): roughly 3 rooms in 10
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

  /* ---------- Choice events ---------- */
  // A room with a decision: the player reads `intro`, then picks one of the `choices` (buttons in the right-hand
  // panel). Each choice rolls one of its `outcomes` by weight, so no choice is a sure thing. Choosing is free
  // (it costs no turn), and the player may also just walk away and come back later.
  //
  // An outcome is { weight, text } plus at most one effect:
  //   item: 'potion' | 'curio' (random curio) | a curio id   -> the item is found (or left on the floor if the pack is full)
  //   damage: n | [min, max]                                  -> lose health
  //   heal: n                                                 -> regain health (`fullText` is shown if already at full health)
  // Text may use {n} (health amount) and [[{item}]] (the item's name, highlighted).
  DF.CHOICE_EVENTS = [
    {
      id: 'cupboard_chest',
      intro: 'A tall walnut cupboard stands against the wall, one door hanging ajar. Beside it squats an iron-bound chest, the wood around its lock scratched bright.',
      choices: [
        { label: 'Open the cupboard', outcomes: [
          { weight: 4, item: 'potion', text: 'Behind folded linens you find a stoppered flask of ruby liquid: a [[Healing Draught]].' },
          { weight: 3, text: 'Moth-eaten linens and the smell of cedar. Nothing else.' },
          { weight: 1, damage: [1, 2], text: 'A spring-loaded blade snaps across your hand as you reach in. You lose {n} health.' },
        ] },
        { label: 'Pry open the chest', outcomes: [
          { weight: 2, item: 'curio', text: 'Beneath a layer of straw lies a [[{item}]].' },
          { weight: 2, text: 'The chest is empty, except for a card that reads: "Too late."' },
          { weight: 3, damage: [1, 3], text: 'The lock is trapped. A needle jabs deep into your thumb. You lose {n} health.' },
        ] },
      ],
    },
    {
      id: 'mask_table',
      intro: 'A long table holds three masks on velvet cushions: one of white porcelain, one of black lacquer, one of gold. Only the gold one looks undisturbed.',
      choices: [
        { label: 'Lift the white mask', outcomes: [
          { weight: 3, item: 'porcelain_mask', text: 'The porcelain is cold as a hand in winter. You take the [[Porcelain Mask]].' },
          { weight: 2, text: 'It crumbles to white dust between your fingers.' },
          { weight: 1, damage: 1, text: 'It is sharp at the edges and bites your palm. You lose {n} health.' },
        ] },
        { label: 'Try on the black mask', outcomes: [
          { weight: 2, heal: 2, text: 'It fits like a second face, and fear drains out of you. You regain {n} health.', fullText: 'It fits like a second face, and your fear drains away. You were not hurt, but it is good to feel.' },
          { weight: 3, damage: [1, 2], text: 'It tightens around your skull until you tear it off. You lose {n} health.' },
          { weight: 2, text: 'You see the room through it for a moment. It was fuller than you thought.' },
        ] },
        { label: 'Leave the gold mask alone', outcomes: [
          { weight: 4, text: 'You step back. The gold mask seems to sigh, softly, in relief.' },
          { weight: 1, item: 'curio', text: 'As you turn away, you notice a [[{item}]] tucked beneath its cushion.' },
        ] },
      ],
    },
    {
      id: 'decanters',
      intro: 'Two crystal decanters sit on a silver tray: one of dark ruby wine, the other of something clear that does not ripple when the tray is touched.',
      choices: [
        { label: 'Drink the ruby wine', outcomes: [
          { weight: 3, heal: 2, text: 'It tastes of cherries and iron. You regain {n} health.', fullText: 'It tastes of cherries and iron. You were unhurt, but it was very good wine.' },
          { weight: 2, damage: [1, 2], text: 'The wine is bitter and wrong. Your stomach knots. You lose {n} health.' },
          { weight: 1, text: 'Only wine, and rather old.' },
        ] },
        { label: 'Sniff the clear decanter', outcomes: [
          { weight: 3, text: 'It smells of nothing at all, which is somehow worse.' },
          { weight: 1, item: 'potion', text: 'Not water: a clear tincture that smells of cloves. A [[Healing Draught]].' },
          { weight: 2, damage: [1, 3], text: 'The fumes burn your eyes and throat. You lose {n} health.' },
        ] },
      ],
    },
    {
      id: 'portrait',
      intro: 'A portrait of a masked noble hangs crooked on the wall. The eyes have been cut out of the canvas, and something small glints behind them.',
      choices: [
        { label: 'Reach behind the portrait', outcomes: [
          { weight: 3, item: 'curio', text: 'Your fingers find a [[{item}]] in the dust behind the canvas.' },
          { weight: 3, damage: [1, 2], text: 'Something behind the canvas bites down on your fingers. You lose {n} health.' },
        ] },
        { label: 'Straighten the frame', outcomes: [
          { weight: 2, item: 'potion', text: 'A hidden panel clicks open beneath the frame. Inside: a [[Healing Draught]].' },
          { weight: 4, text: 'The portrait settles. Its missing eyes seem to follow you regardless.' },
        ] },
      ],
    },
    {
      id: 'piano',
      intro: 'A grand piano stands open, one key held down as though by a finger. A drawer beneath the keyboard is slightly ajar.',
      choices: [
        { label: 'Release the held key', outcomes: [
          { weight: 2, text: 'The key rises. Somewhere inside the walls, a bell stops ringing.' },
          { weight: 2, damage: [1, 2], text: 'The lid slams down on your fingers, hard. You lose {n} health.' },
          { weight: 2, item: 'curio', text: 'A hidden compartment springs open in the lid. Inside lies a [[{item}]].' },
        ] },
        { label: 'Search the drawer', outcomes: [
          { weight: 2, item: 'curio', text: 'Under yellowed sheet music you find a [[{item}]].' },
          { weight: 2, text: 'Sheet music, every page the same waltz, every page stained with wine.' },
          { weight: 1, damage: 1, text: 'A mousetrap, and a very large one. You lose {n} health.' },
        ] },
      ],
    },
    {
      id: 'confessional',
      intro: 'A confessional booth stands in the corner, its curtain drawn. From inside, a soft voice says your name, and then waits.',
      choices: [
        { label: 'Step inside and listen', outcomes: [
          { weight: 2, heal: 2, text: 'The voice forgives you, in a language you do not know. Something in you eases. You regain {n} health.', fullText: 'The voice forgives you, in a language you do not know. Something in you eases.' },
          { weight: 3, text: 'The voice says nothing more. You wait until it feels foolish to.' },
          { weight: 1, damage: 1, text: 'The voice laughs, long and ragged, and the booth shudders around you. You stumble out bruised. You lose {n} health.' },
        ] },
        { label: 'Tear the curtain aside', outcomes: [
          { weight: 3, damage: [1, 2], text: 'Nobody is there, but something shoves you hard across the room. You lose {n} health.' },
          { weight: 2, item: 'curio', text: 'The booth is empty, but for a [[{item}]] on the kneeler.' },
        ] },
      ],
    },
    {
      id: 'fireplace',
      intro: 'A fire burns in the grate, though the chimney is bricked shut. Something metal glints among the coals.',
      choices: [
        { label: 'Reach into the fire', outcomes: [
          { weight: 3, item: 'curio', text: 'Your fingers close on a [[{item}]], and it is, impossibly, cool.' },
          { weight: 3, damage: [2, 3], text: 'The coals are quite real. You lose {n} health.' },
        ] },
        { label: 'Rake the ashes with the poker', outcomes: [
          { weight: 1, item: 'curio', text: 'The poker turns up a [[{item}]] in the ash.' },
          { weight: 4, text: 'Ash, bone-white and fine as flour. Nothing more.' },
        ] },
      ],
    },
    {
      id: 'mirror',
      intro: 'A tall mirror shows the room perfectly, except that you are not in it. A faint handprint marks the glass at shoulder height.',
      choices: [
        { label: 'Press your hand to the print', outcomes: [
          { weight: 3, damage: [1, 2], text: 'The glass is ice-cold, and takes something from you. You lose {n} health.' },
          { weight: 2, item: 'potion', text: 'The mirror swings inward on a hidden hinge. Behind it: a [[Healing Draught]].' },
        ] },
        { label: 'Turn the mirror to the wall', outcomes: [
          { weight: 4, text: 'It is heavier than it looks, and the wall behind it is bare.' },
          { weight: 1, item: 'curio', text: 'Taped to the back of the frame is a [[{item}]].' },
        ] },
      ],
    },
    {
      id: 'bell_rope',
      intro: 'A bell-rope hangs by the door, its tassel threaded with gold. A small brass plaque beneath it reads: PLEASE RING.',
      choices: [
        { label: 'Ring for service', outcomes: [
          { weight: 2, item: 'potion', text: 'A silent figure in livery sets a tray at your feet and is gone. On it: a [[Healing Draught]].' },
          { weight: 2, damage: 1, text: 'The bell is enormous, and very close. Your ears ring for an hour. You lose {n} health.' },
          { weight: 2, text: 'You wait. No one comes. It feels, somehow, like a refusal.' },
        ] },
        { label: 'Cut the rope', outcomes: [
          { weight: 2, item: 'curio', text: 'A weight falls from the rope\'s end: a [[{item}]].' },
          { weight: 2, damage: [1, 2], text: 'Somewhere above you, something heavy gives way. You lose {n} health.' },
          { weight: 1, text: 'The rope falls limp. Far away, a bell rings once, in alarm.' },
        ] },
      ],
    },
  ];

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

// js/games/tbb/tbb_floors.js
// Floor narrative data: description, action button, effect, repeat text

export const FLOOR_DATA = [
    // Floor 0
    { title: 'The Training Grounds', description: 'A grassy courtyard near the dungeon entrance. Wooden dummies line the walls and a friendly blacksmith tends a small forge. New adventurers sharpen their skills here before descending.', action: '🔨 Ask the Blacksmith for Advice', effectKey: 'heal_small', repeatText: 'The blacksmith grins. "You\'re getting the hang of it. Keep at it!"' },
    // Floor 1
    { title: 'The Mossy Entrance Hall', description: 'Damp stone walls thick with moss. Weak afternoon light filters through a cracked ceiling. A small stream trickles along one wall, pooling into a clear basin.', action: '💧 Drink from the Basin', effectKey: 'heal_small', repeatText: 'The basin is dry now. You\'ve already taken what it offered.' },
    // Floor 2
    { title: 'The Root Cellar', description: 'Massive tree roots have broken through the ceiling. Between them hang old oil lanterns, still flickering. A forgotten sack slumps against one root — something inside clanks softly.', action: '🎒 Rummage Through the Sack', effectKey: 'gain_exp_small', repeatText: 'You already emptied the sack. Nothing remains but dust.' },
    // Floor 3
    { title: 'The Glowshroom Grotto', description: 'Thousands of bioluminescent mushrooms fill this cavern with soft blue light. The air smells faintly sweet. A cluster of especially large fungi pulses like a heartbeat.', action: '🍄 Eat a Glowshroom', effectKey: 'heal_medium', repeatText: 'You ate one last time and felt dizzy — best not push it.' },
    // Floor 4
    { title: 'The Forgotten Campsite', description: 'The remnants of a traveller\'s camp: a cold fire pit, a torn bedroll, and a half-eaten loaf gone hard as stone. Scratched into the wall: "Don\'t trust the east passage."', action: '🔥 Relight the Fire and Rest', effectKey: 'heal_medium', repeatText: 'The fire has burned down to embers. You already rested here.' },
    // Floor 5
    { title: 'The Shepherd\'s Pond', description: 'Sunlight — somehow — pours through a gap overhead, illuminating a still green pond. Lily pads drift lazily. Reeds sway. A wooden fishing rod leans against a boulder, left for anyone who passes.', action: '🎣 Go Fishing', effectKey: 'fishing', repeatText: 'You already fished here. The pond is quiet and undisturbed.' },
    // Floor 6
    { title: 'The Crumbling Library', description: 'Rows of rotting shelves hold waterlogged tomes. One shelf near the back holds newer, drier volumes. A reading desk still stands, its candle burned to nothing.', action: '📖 Study the Fresh Volumes', effectKey: 'gain_exp_medium', repeatText: 'You already read everything of value here.' },
    // Floor 7
    { title: 'The Amber Corridor', description: 'Walls embedded with golden veins of amber, each containing tiny preserved insects. A merchant\'s display cabinet has been left behind, glass cracked but contents intact.', action: '🪙 Trade with the Ghost Merchant', effectKey: 'gain_exp_medium', repeatText: 'The ghost merchant has moved on. Their cabinet is empty.' },
    // Floor 8
    { title: 'The Altar of the Traveller', description: 'A low stone altar bears the carved image of boots and a walking staff. Pilgrims once left offerings here. A small bowl still holds dried flowers.', action: '🙏 Leave an Offering', effectKey: 'heal_full', repeatText: 'You have nothing more to offer. The altar is silent.' },
    // Floor 9
    { title: 'The Guardian\'s Antechamber', description: 'A massive ornate door dominates the far wall, symbols pulsing with amber light. Weapons of fallen adventurers are mounted on racks along both sides.', action: '⚔️ Study the Fallen Weapons', effectKey: 'unlock_sharpened_edge', repeatText: 'You already studied the weapons thoroughly. The racks are stripped.' },
    // Floor 10
    { title: 'The Bone Orchard', description: 'Bleached skulls have been stacked into cairns alongside the path. A small chest sits at the base of the tallest cairn, its lock already rusted away.', action: '💀 Open the Cairn Chest', effectKey: 'gain_statpoint', repeatText: 'The chest is open and empty. You already claimed its contents.' },
    // Floor 11
    { title: 'The Sulfur Springs', description: 'Foul-smelling yellow vents hiss steam from the floor. Despite the stench, the heat is oddly comforting. A hermit once lived here — their clay pots still line the walls.', action: '♨️ Soak in the Hot Spring', effectKey: 'heal_full', repeatText: 'The spring has cooled. You\'ve already soaked here.' },
    // Floor 12
    { title: 'The Mural Chamber', description: 'The entire wall is covered in a detailed painted mural of the dungeon\'s history. A historian\'s partially translated notes are pinned beneath it.', action: '🖼️ Study the Historian\'s Notes', effectKey: 'gain_exp_large', repeatText: 'You\'ve already memorised everything worth knowing here.' },
    // Floor 13
    { title: 'The Dripping Icicle Hall', description: 'Enormous icicles hang from the ceiling, each containing something frozen inside. One enormous icicle at the far end glows deep red at its core.', action: '🧊 Chip Out the Glowing Core', effectKey: 'unlock_ice_focus', repeatText: 'You already extracted the core. The icicle is now just ice.' },
    // Floor 14
    { title: 'The Windswept Bridge', description: 'A narrow stone bridge arches over a bottomless chasm. Wind howls in constant gusts. Halfway across, a locked strongbox is chained to the railing.', action: '🔑 Force Open the Strongbox', effectKey: 'gain_exp_large', repeatText: 'The strongbox hangs open and empty, rattling in the wind.' },
    // Floor 15
    { title: 'The Herbalist\'s Garden', description: 'Impossibly, a full garden grows here: medicinal herbs, trellised vines, a bubbling cauldron. A sign reads: "Help yourself. Leave something behind."', action: '🌿 Brew a Healing Potion', effectKey: 'heal_full', repeatText: 'The cauldron is empty and cold. You\'ve already brewed what you could.' },
    // Floor 16
    { title: 'The Collapsed Vault', description: 'A former treasure vault has caved in, spilling old coins and shattered pottery. Most goods are buried, but a small leather journal lies open on a stone.', action: '📓 Read the Vault Keeper\'s Journal', effectKey: 'gain_exp_large', repeatText: 'You\'ve already read every page. The journal holds no more secrets.' },
    // Floor 17
    { title: 'The Wishing Well', description: 'A perfectly preserved stone well stands in the centre. Looking down, you see a faint shimmer far below — coins catching phantom light.', action: '🪙 Toss a Coin and Make a Wish', effectKey: 'random_boon', repeatText: 'The well is silent. Your wish has already been heard.' },
    // Floor 18
    { title: 'The Cartographer\'s Table', description: 'A vast stone table holds a detailed map of the dungeon, showing floors you have not yet visited, marked with question marks and danger symbols.', action: '🗺️ Study the Map', effectKey: 'unlock_floor_jump', repeatText: 'The map holds no new information. You\'ve already memorised its details.' },
    // Floor 19
    { title: 'The Chasm of Echoes', description: 'A vast crack splits the dungeon floor. A rickety bridge sways in the dark. Every sound you make returns distorted, as if the chasm has its own voice.', action: '🌉 Cross the Bridge Carefully', effectKey: 'gain_statpoint', repeatText: 'You\'ve already crossed. The bridge creaks behind you.' },
    // Floor 20
    { title: 'The Pilgrim\'s Rest', description: 'A roadside shrine turned impromptu inn: bedrolls, a crackling fire, and a large pot of stew. The shrine still stands in the corner, watched by a stone figure.', action: '🍲 Eat the Stew and Rest', effectKey: 'heal_full', repeatText: 'The pot is empty and the fire has died. You\'ve already rested here.' },
    // Floor 21
    { title: 'The Rusted Armory', description: 'Racks of corroded weapons and crumbling armour fill this wide room. Most are useless, but a single locked case in the back holds equipment in good condition.', action: '🛡️ Salvage the Good Equipment', effectKey: 'gain_statpoint', repeatText: 'You already stripped the case. Everything useful is gone.' },
    // Floor 22
    { title: 'The Lava Shelf', description: 'A narrow shelf overlooks a slow-moving lava flow twenty metres below. Strange black crystals grow along the edge, warm to the touch and unusually dense.', action: '💎 Collect the Lava Crystals', effectKey: 'unlock_lava_core', repeatText: 'You already collected the crystals. The shelf is bare.' },
    // Floor 23
    { title: 'The Forgotten Bathhouse', description: 'Cracked tiles and dry stone tubs. Miraculously, one tub still has a flow of warm spring water. Soap and a faded towel hang nearby.', action: '🛁 Take a Restorative Bath', effectKey: 'heal_full', repeatText: 'The water has run cold. You already bathed here.' },
    // Floor 24
    { title: 'The Storm Atrium', description: 'An enormous open dome exposes this chamber to something that feels like sky. Lightning crackles between the walls in dazzling arcs.', action: '⚡ Channel the Lightning', effectKey: 'gain_exp_large', repeatText: 'The storm has passed. Only residual sparks remain.' },
    // Floor 25
    { title: 'The Sage\'s Retreat', description: 'A cosy nook carved into rock: bookshelves, a writing desk, and a small table set for tea. The sage who lived here is long gone, but their research notes are meticulously organised.', action: '📚 Study the Research Notes', effectKey: 'gain_exp_large', repeatText: 'You\'ve already absorbed everything the sage wrote.' },
    // Floor 26
    { title: 'The Echo Garden', description: 'Stone flowers — minerals formed into petal shapes over centuries — fill this cavern. Hollow tubes catch air currents and produce haunting music. A tiny creature of light drifts among the "flowers".', action: '🌸 Follow the Light Creature', effectKey: 'random_boon', repeatText: 'The light creature has gone. The garden is still and quiet.' },
    // Floor 27
    { title: 'The Whispering Lake', description: 'A mist-covered lake lies perfectly still in a vast cavern. The stalagmites around it are unnaturally quiet. A fishing rod rests against a boulder at the water\'s edge.', action: '🎣 Fish the Whispering Lake', effectKey: 'fishing', repeatText: 'Nothing remains to catch. The lake is undisturbed glass.' },
    // Floor 28
    { title: 'The Trophy Hall', description: 'Monster heads, weapons, and crests of fallen guilds line the walls. A large book on a pedestal records the names of every adventurer who made it this far.', action: '✍️ Sign the Book', effectKey: 'gain_exp_medium', repeatText: 'Your name is already there in ink. The page is full.' },
    // Floor 29
    { title: 'The Drowned Forge', description: 'A massive forge half-sunk into groundwater. The anvil is still above water. Floating on the surface is a leather-wrapped bundle — a master smith\'s tools, still oiled.', action: '🔨 Use the Smith\'s Tools', effectKey: 'unlock_forged_steel', repeatText: 'The tools were good, but you\'ve already used what you could from them.' },
    // Floor 30
    { title: 'The Sunken Plaza', description: 'A broad paved plaza, half-flooded, with abandoned market stalls in rows. One stall still has a sign: "Elixirs — Freshness Guaranteed." The bottles are still sealed.', action: '⚗️ Take an Elixir', effectKey: 'heal_full', repeatText: 'All the elixirs are gone. You already took the last one.' },
    // Floor 31
    { title: 'The River Crossing', description: 'A wide underground river cuts across the path. Flat stones make a treacherous ford. Fields of cave-grass line both banks, and the current carries a faint blue luminescence downstream.', action: '🎣 Fish from the Stepping Stones', effectKey: 'fishing', repeatText: 'The fish have moved deeper. You already fished here.' },
    // Floor 32
    { title: 'The Wanderer\'s Shrine', description: 'A small roadside shrine decorated with trinkets left by passing adventurers: coins, ribbon, a child\'s drawing. Incense still smoulders in a cracked bowl.', action: '🕯️ Meditate at the Shrine', effectKey: 'gain_exp_medium', repeatText: 'The incense has burned out. The shrine is still.' },
    // Floor 33
    { title: 'The Meadow Rift', description: 'An inexplicable patch of open sky and rolling grass grows here, fed by a crack in the roof. Bees drone among wildflowers. The air smells of summer rain.', action: '🌾 Forage the Meadow', effectKey: 'forage', repeatText: 'The meadow has been picked over. Nothing useful remains.' },
    // Floor 34
    { title: 'The Crystal Vein', description: 'A thick vein of semi-precious crystals runs through the wall, glittering in every colour. A miner\'s pick is embedded nearby, its handle worn smooth with use.', action: '⛏️ Mine the Crystals', effectKey: 'gain_exp_large', repeatText: 'The vein is chipped out. You already mined everything of value.' },
    // Floor 35
    { title: 'The Moonpool', description: 'A perfectly circular pool reflects light from a single crack overhead, creating the illusion of a full moon on its surface. The water is ice-cold and crystal clear.', action: '🌕 Bathe in the Moonpool', effectKey: 'heal_full', repeatText: 'You\'ve already bathed here. The pool shimmers undisturbed.' },
    // Floor 36
    { title: 'The Reed Marsh', description: 'A shallow underground marsh, knee-deep in cool black water, thick with tall reeds. Firefly-like creatures bob in the dark. Someone has left a fishing line tied to a post.', action: '🎣 Fish the Marsh', effectKey: 'fishing', repeatText: 'The marsh is quiet. You\'ve already fished it dry.' },
    // Floor 37
    { title: 'The Bone Inscription', description: 'Sentences are carved into every surface in a cramped, urgent hand. Most of it is a single phrase repeated endlessly: "Knowledge is the only armour."', action: '📜 Read the Inscriptions', effectKey: 'gain_exp_large', repeatText: 'You\'ve already read the inscriptions. The message is burned into your memory.' },
    // Floor 38
    { title: 'The Ember Vault', description: 'Smouldering coals in a low stone bowl cast orange warmth across the room. The walls are carved with murals of fire elementals dancing. A ritual is etched nearby.', action: '🔥 Perform the Ember Ritual', effectKey: 'random_boon', repeatText: 'The embers are cold. The ritual cannot be repeated.' },
    // Floor 39
    { title: 'The Overgrown Courtyard', description: 'A courtyard reclaimed by nature: vines thick as rope, flowers blooming from cracks, and a tree growing through the centre. Fruit hangs heavy on low branches.', action: '🌿 Forage the Courtyard', effectKey: 'forage', repeatText: 'You already gathered what you could. The branches are stripped bare.' },
    // Floor 40
    { title: 'The Blind Fisherman\'s Dock', description: 'A short wooden dock juts over an underground lake. An old man sits at the end, staring into the black water despite having no eyes. He offers you his spare rod without a word.', action: '🎣 Fish Beside the Old Man', effectKey: 'fishing', repeatText: 'The old man is gone. Only his rod remains, tangled in the reeds.' },
    // Floor 41
    { title: 'The Perfumer\'s Workshop', description: 'Dozens of small glass bottles line the shelves, filled with glowing liquids in every shade. One unlabelled bottle is still warm, as if recently mixed.', action: '⚗️ Drink the Unlabelled Potion', effectKey: 'random_boon', repeatText: 'You drank the only unlabelled bottle. The rest are labelled "Danger — Do Not Consume."' },
    // Floor 42
    { title: 'The Verdant Side Path', description: 'A narrow path veers away from the main corridor into a small grotto carpeted in soft moss. Wild herbs, dark berries, and pale mushrooms grow in abundance.', action: '🍄 Forage the Side Path', effectKey: 'forage', repeatText: 'The grotto has been picked clean. You already foraged here.' },
    // Floor 43
    { title: 'The Astronomer\'s Tower', description: 'A spiralling room with a hole in the ceiling revealing a sliver of night sky. Telescopes, astrolabes, and charts cover every surface. One calculation is unfinished.', action: '🔭 Complete the Calculation', effectKey: 'gain_exp_large', repeatText: 'You already finished the calculation. The mystery is solved.' },
    // Floor 44
    { title: 'The Riverbank Camp', description: 'Fields of pale cave-grass lead to a slow underground river. A camp has been set up here — pots, a bedroll, and two fishing rods propped in the ground. Whoever lived here left in a hurry.', action: '🎣 Go Fishing at the Camp', effectKey: 'fishing', repeatText: 'The river is fished out. You already took what it offered.' },
    // Floor 45
    { title: 'The Seed Vault', description: 'Hundreds of tiny sealed packets line the walls: seeds of plants from the surface world, lovingly preserved. One drawer is labelled "For Emergencies — Restorative Seeds."', action: '🌱 Plant the Restorative Seeds', effectKey: 'heal_full', repeatText: 'The emergency drawer is empty. You already planted everything.' },
    // Floor 46
    { title: 'The Collapsed Chapel', description: 'A chapel crushed by the weight of the dungeon above. Stained glass shards catch the light beautifully on the floor. A single pew survives intact, with an open prayer book resting on it.', action: '📖 Read the Prayer Book', effectKey: 'gain_exp_medium', repeatText: 'You\'ve already read every prayer. The words still echo in your mind.' },
    // Floor 47
    { title: 'The Mirror Lake', description: 'An absolutely still lake whose surface reflects the cavern so perfectly it is impossible to tell where the water begins. Dragonfly-like creatures with glass wings skim its surface.', action: '🎣 Fish the Mirror Lake', effectKey: 'fishing', repeatText: 'The Mirror Lake is still. You already fished it into silence.' },
    // Floor 48
    { title: 'The Living Jungle', description: 'Improbably dense jungle growth fills this cavern from floor to ceiling. Vines, flowers, and exotic undergrowth tangle in every direction. Strange bird-sounds echo from somewhere within.', action: '🌿 Forage the Jungle', effectKey: 'forage', repeatText: 'You already gathered what the jungle offered. The undergrowth is disturbed but bare.' },
    // Floor 49
    { title: 'The Hall of Lost Scribes', description: 'A circular chamber lined with crumbling stone tablets, densely inscribed. Subjects range from monster anatomy to philosophy. Partial translations are scattered on a low table.', action: '🔍 Decipher the Key Tablets', effectKey: 'unlock_scribe_wisdom', repeatText: 'You\'ve already deciphered the key tablets. You can read them fluently now.' },
    // Floor 50
    { title: 'The Obsidian Terrace', description: 'Smooth black volcanic rock forms a wide terrace overlooking a deep cavern. The silence here is so complete you can hear your own heartbeat. A hermit left a meditation cushion — faded but intact.', action: '🧘 Meditate on the Terrace', effectKey: 'heal_medium', repeatText: 'The cushion is worn flat. You\'ve already meditated here.' },
    // Floor 51
    { title: 'The Deep Fishing Hole', description: 'A perfectly circular hole in the floor drops down ten metres into a luminous blue pool. A rope ladder leads down. At the bottom: a campfire, a pot, and several well-worn fishing rods.', action: '🎣 Climb Down and Fish', effectKey: 'fishing', repeatText: 'The deep hole is quiet. You already fished it out.' },
    // Floor 52
    { title: 'The Ghost Library', description: 'Ghostly bookshelves fade in and out of visibility. Books float and shuffle pages on their own. One solid book sits on a real shelf: a master index of all the ghost texts.', action: '👻 Read the Master Index', effectKey: 'gain_exp_large', repeatText: 'The ghost library has faded. You\'ve already gleaned its knowledge.' },
    // Floor 53
    { title: 'The Wild Terrace Garden', description: 'A terraced garden carved into the dungeon wall, long since gone wild. Enormous root vegetables, sprawling herbs, and flowering vines have overtaken the original order.', action: '🌿 Forage the Terrace Garden', effectKey: 'forage', repeatText: 'The garden\'s been picked over. Nothing useful remains.' },
    // Floor 54
    { title: 'The Leviathan Spring', description: 'An enormous underground spring glows faintly green. A stone tablet warns: "One drink restores. Two drinks doom." The cup provided holds exactly one measure.', action: '🫗 Drink from the Spring', effectKey: 'heal_full', repeatText: 'The cup is empty and cracked. You already drank your one measure.' },
    // Floor 55
    { title: 'The Arena Remains', description: 'A small gladiatorial pit still has a fighting dummy at its centre, its padding worn to nothing. A champion\'s trophy gathers dust in a corner. The smell of old sweat lingers.', action: '🥊 Train Against the Dummy', effectKey: 'gain_statpoint', repeatText: 'The dummy has collapsed. You trained it to pieces.' },
    // Floor 56
    { title: 'The Tidal Cave', description: 'Underground tides have carved this cavern into smooth curves. Twice a day the water fills knee-high and retreats, leaving behind pools teeming with strange cave fish. The tide is out now.', action: '🎣 Fish the Tidal Pools', effectKey: 'fishing', repeatText: 'The tidal pools have emptied. You already fished them at low tide.' },
    // Floor 57
    { title: 'The Philosopher\'s Den', description: 'A grand study: leather chairs, a roaring fireplace, walls covered in philosophical diagrams. A chalkboard shows a half-completed equation. Blue flames that do not consume.', action: '🧮 Complete the Equation', effectKey: 'gain_exp_large', repeatText: 'The equation is solved and the chalkboard wiped clean.' },
    // Floor 58
    { title: 'The Boon Altar', description: 'A glowing altar carved from a single translucent crystal pulses softly. The inscription reads: "For the worthy, something wondrous." A warmth radiates from it even at this distance.', action: '✨ Touch the Altar', effectKey: 'random_boon', repeatText: 'The altar\'s glow has faded. It has given what it had.' },
    // Floor 59
    { title: 'The Beekeeper\'s Chamber', description: 'Enormous honeycomb structures fill this chamber. The bees that made them are gone, but jars of dense golden honey sit in neat rows on a wooden shelf.', action: '🍯 Eat the Healing Honey', effectKey: 'heal_medium', repeatText: 'The honey jars are all empty. You already ate here.' },
    // Floor 60
    { title: 'The Cave of Falling Stars', description: 'Tiny fragments of what appear to be stars drift down from a dark ceiling, vanishing just before they touch the ground. A stone circle in the centre pulses as each fragment passes through it.', action: '⭐ Stand in the Star Fall', effectKey: 'random_boon', repeatText: 'The stars have gone dark. The circle is silent.' },
    // Floor 61
    { title: 'The Kelp Forest Lake', description: 'A vast underground lake filled with enormous kelp-like plants that glow soft green. Bioluminescent creatures drift between them. A raft with a fishing line is moored at the shore.', action: '🎣 Fish from the Raft', effectKey: 'fishing', repeatText: 'The kelp forest is still. You already fished it out.' },
    // Floor 62
    { title: 'The Moss Garden', description: 'Every surface is carpeted in thick, soft moss of extraordinary colours — violet, orange, deep blue. Among the moss grow rare healing herbs and edible fungi.', action: '🌿 Carefully Harvest the Herbs', effectKey: 'forage', repeatText: 'The herbs are gone. You already harvested what was here.' },
    // Floor 63
    { title: 'The Runebound Archive', description: 'Thousands of glowing rune-inscribed stones float in neat rows. Touching one sends a flash of knowledge into your mind. A single warm stone drifts slowly toward you.', action: '🔮 Absorb the Rune Stone', effectKey: 'gain_exp_large', repeatText: 'All the rune stones have gone dark. Their knowledge is already within you.' },
    // Floor 64
    { title: 'The Ancient Bathhouse', description: 'A massive bathhouse, tiled in gold and ivory, fed by a perfectly preserved hot spring. A stack of clean towels sits by the entrance, as if the attendants just stepped out.', action: '🛁 Soak in the Ancient Baths', effectKey: 'heal_full', repeatText: 'The baths have been drained. You already soaked here.' },
    // Floor 65
    { title: 'The Abyssal Shore', description: 'An underground sea stretches to invisibility. Black waves lap at a shingle beach of obsidian pebbles. A lantern hung on a post casts warm yellow light on the dark water.', action: '🎣 Cast a Line in the Abyss', effectKey: 'fishing', repeatText: 'The tide has receded. You already found what the sea offered.' },
    // Floor 66
    { title: 'The Void Library', description: 'Bookshelves stretch upward beyond sight. There is no floor, no ceiling — only books and floating platforms. One glowing tome floats at eye level, as if waiting for you.', action: '📖 Read the Glowing Tome', effectKey: 'gain_exp_large', repeatText: 'The tome has sealed itself. Its knowledge is already within you.' },
    // Floor 67
    { title: 'The Spore Fields', description: 'Fields of enormous mushrooms stretch as far as you can see. The air here is thick with golden spores that drift like snow. The mushrooms range in size from a hand to a house.', action: '🍄 Forage the Spore Fields', effectKey: 'forage', repeatText: 'The spore fields are picked bare. You already foraged here.' },
    // Floor 68
    { title: 'The Titan\'s Forge', description: 'A forge built for something far larger than a human blazes with white-hot fire. The anvil is the size of a cart. Half-finished pieces of impossibly large armour surround it.', action: '⚒️ Work the Titan\'s Forge', effectKey: 'gain_statpoint', repeatText: 'The forge has cooled. You already shaped what you could.' },
    // Floor 69
    { title: 'The Starfall Chamber', description: 'Tiny lights drift downward from a dark ceiling like slow-falling stars. A circle of standing stones in the centre pulses as each light touches it.', action: '⭐ Stand in the Stone Circle', effectKey: 'random_boon', repeatText: 'The lights have gone dark. The circle is silent.' },
    // Floor 70
    { title: 'The River of Glass', description: 'A slow-flowing river of perfectly transparent water cuts through the floor here, its bed visible fifteen metres below, glittering with ancient coins. A fishing chair sits at the bank.', action: '🎣 Fish the River of Glass', effectKey: 'fishing', repeatText: 'The glass river flows on undisturbed. You already fished it out.' },
    // Floor 71
    { title: 'The Sunlit Pocket', description: 'A hole in the roof the size of a house lets actual sunlight pour in. A patch of surface-world wildflowers has taken hold on the dungeon floor, blooming improbably in the deep dark.', action: '🌸 Forage the Wildflowers', effectKey: 'forage', repeatText: 'The flowers are bare. You already gathered everything worth taking.' },
    // Floor 72
    { title: 'The Temple of Seasons', description: 'Four chambers radiate from a central hall, each maintained at a different season\'s climate. Spring blooms in one; an autumn harvest in another; summer fruit in the third. The winter chamber is locked.', action: '🍎 Harvest from the Autumn Chamber', effectKey: 'heal_full', repeatText: 'The autumn chamber is bare. You already harvested everything.' },
    // Floor 73
    { title: 'The Pilgrim\'s Archives', description: 'Every traveller who passed through left a page of their story. Thousands of pages fill the room. The most recent page is from someone who left three weeks ago — the ink is barely dry.', action: '📜 Read the Recent Accounts', effectKey: 'gain_exp_large', repeatText: 'You\'ve already read the recent accounts. The pages hold no new secrets.' },
    // Floor 74
    { title: 'The Shifting Maze', description: 'The walls here move and rearrange on their own. At the maze\'s heart stands a motionless statue with a key around its neck. The key glows with an unusual energy.', action: '🗝️ Take the Key from the Statue', effectKey: 'unlock_maze_key', repeatText: 'You already have the key\'s knowledge. The statue is empty-handed.' },
    // Floor 75
    { title: 'The Deep Sea Grotto', description: 'A salt-water grotto where bioluminescent fish drift lazily through clear blue water. The ceiling is low and dripping. A hand-painted sign reads: "Best fishing in the deep." A rod leans beneath it.', action: '🎣 Fish the Grotto', effectKey: 'fishing', repeatText: 'The grotto is fished out. You already caught what was here.' },
    // Floor 76
    { title: 'The Dream Meadow', description: 'This floor does not feel real. The grass is too green, the air too warm, the sky above a colour that does not have a name. Yet the berries here are very real.', action: '🌿 Forage the Dream Meadow', effectKey: 'forage', repeatText: 'The dream meadow has faded slightly. You already foraged here.' },
    // Floor 77
    { title: 'The Oracle\'s Pool', description: 'A perfectly circular pool of black water in which visions occasionally surface — brief, cryptic, and disturbing. A wooden box nearby contains offerings from previous visitors.', action: '🔮 Consult the Oracle', effectKey: 'random_boon', repeatText: 'The oracle\'s pool has gone dark. It has nothing more to show you.' },
    // Floor 78
    { title: 'The Bone Cathedral', description: 'A vast cathedral built entirely from the bones of monsters. The architecture is strangely beautiful — arched ribs for vaulting, tusks for columns. Candles burn in hollowed skulls.', action: '🕯️ Light a Candle and Pray', effectKey: 'gain_exp_large', repeatText: 'Your candle has burned to nothing. You already prayed here.' },
    // Floor 79
    { title: 'The Twilight River', description: 'A wide slow river runs through a cavern where the walls glow a deep violet. The water is warm and clear. A small boat with a fishing net is tied to a post at the bank.', action: '🎣 Fish from the Boat', effectKey: 'fishing', repeatText: 'The twilight river is fished out. You already cast your net here.' },
    // Floor 80
    { title: 'The Alchemist\'s Ruin', description: 'A laboratory destroyed by its own experiments. Fused equipment, crystallised spills, and scorch marks on every surface. One untouched cabinet is sealed with a wax stamp: "Complete Formulae."', action: '⚗️ Study the Formulae', effectKey: 'gain_exp_large', repeatText: 'You\'ve already studied the formulae. Their secrets are yours.' },
    // Floor 81
    { title: 'The Hanging Gardens', description: 'Enormous chains descend from the ceiling, each supporting a basket of flourishing plants: herbs, vines, small trees. One basket holds ripe fruit, swaying gently overhead.', action: '🌿 Forage the Hanging Baskets', effectKey: 'forage', repeatText: 'The baskets are empty. You already foraged the hanging gardens.' },
    // Floor 82
    { title: 'The Stormwater Cistern', description: 'A vast underground cistern fed by a waterfall from the dungeon\'s ceiling. The water is cold and deep. Massive slow fish can be seen moving through its depths.', action: '🎣 Fish the Cistern', effectKey: 'fishing', repeatText: 'The cistern is still. You already fished it out.' },
    // Floor 83
    { title: 'The Star Map Room', description: 'The entire ceiling of this chamber is a perfect star map, the constellation lines inlaid in gold. An astronomer\'s chair faces upward, angled perfectly. A notebook lies open at the chair\'s side.', action: '🌌 Study the Star Map', effectKey: 'gain_exp_large', repeatText: 'You\'ve already memorised the star map. You could navigate by it anywhere.' },
    // Floor 84
    { title: 'The Abyssal Garden', description: 'Dark flowers that generate their own faint light grow here in wild profusion. Their petals are edible and possess restorative properties, though the taste is deeply strange.', action: '🌸 Forage the Abyssal Garden', effectKey: 'forage', repeatText: 'The abyssal garden has been stripped. You already foraged here.' },
    // Floor 85
    { title: 'The Echo Lake', description: 'A lake so large that its far shore is invisible. Every sound here returns twice, in a lower pitch. A lighthouse-like structure pulses at the edge of visibility. The fishing here is legendary.', action: '🎣 Fish the Echo Lake', effectKey: 'fishing', repeatText: 'The echo lake is silent. You already fished it dry.' },
    // Floor 86
    { title: 'The Warrior\'s Rest', description: 'A chamber built by warriors for warriors: weapon racks, a sparring circle, and a long table set with food and drink that somehow has not spoiled. Rest is both offered and advised.', action: '🍖 Eat and Rest', effectKey: 'heal_full', repeatText: 'The table is empty. You already ate and rested here.' },
    // Floor 87
    { title: 'The Fungal Canopy', description: 'Enormous mushrooms form a complete canopy above, their gills releasing a golden spore-light. Rare fungi grow at their bases. An experienced forager would know exactly what to pick.', action: '🍄 Forage the Fungal Canopy', effectKey: 'forage', repeatText: 'The fungal canopy has been stripped. You already foraged here.' },
    // Floor 88
    { title: 'The Infinite Spring', description: 'A spring that flows upward: water fountains from the ground, pools around it, and somehow drains back in to repeat the cycle. A cup is attached to the stone basin by a chain.', action: '💧 Drink from the Infinite Spring', effectKey: 'heal_full', repeatText: 'The spring still flows, but you\'ve already drunk your fill.' },
    // Floor 89
    { title: 'The Abyss Fisherman\'s Dock', description: 'A long wooden dock extending into absolute darkness. The water below is invisible. Occasionally something large brushes the dock from below. A rack of heavy-duty rods lines the entrance.', action: '🎣 Fish the Abyss', effectKey: 'fishing', repeatText: 'The abyss is quiet. You already fished its depths.' },
    // Floor 90
    { title: 'The Celestial Archive', description: 'A library that contains not books but memory crystals — each one a complete account of a different life. The sheer weight of collected experience is almost physical.', action: '💎 Absorb a Memory Crystal', effectKey: 'gain_exp_large', repeatText: 'All the memory crystals have gone dark. Their knowledge already lives within you.' },
    // Floor 91
    { title: 'The Primal Forest', description: 'Ancient trees, each wider than a house, fill this vast cavern. Their roots have cracked the dungeon floor entirely. Moss, mushrooms, and wild herbs carpet every surface.', action: '🌿 Forage the Primal Forest', effectKey: 'forage', repeatText: 'The primal forest floor is bare. You already foraged here.' },
    // Floor 92
    { title: 'The Void River', description: 'A river of pitch-black water that makes no sound. Nothing reflects in it. A skeletal fishing dock extends over its surface. The rod left there is still baited.', action: '🎣 Fish the Void River', effectKey: 'fishing', repeatText: 'The void river flows on in silence. You already fished its dark waters.' },
    // Floor 93
    { title: 'The Final Garden', description: 'A garden of impossible beauty: flowers that glow, fruit that hangs heavy, water that runs upward through channels in the stone. The last garden before the dungeon\'s end.', action: '🌿 Forage the Final Garden', effectKey: 'forage', repeatText: 'The final garden is picked bare. You already gathered everything it offered.' },
    // Floor 94
    { title: 'The Chronicle Wall', description: 'Every battle ever fought in this dungeon is recorded in small carved script on every wall, floor, and ceiling. A scholar\'s magnifying glass hangs nearby on a chain.', action: '🔍 Read the Chronicle Wall', effectKey: 'gain_exp_large', repeatText: 'You\'ve already read the chronicle. Every battle is etched in your memory.' },
    // Floor 95
    { title: 'The Dragon\'s Lake', description: 'A vast underground lake where something enormous moves just below the surface. Whether it is friendly is unclear. A dock with stout fishing equipment suggests someone was brave enough to find out.', action: '🎣 Fish the Dragon\'s Lake', effectKey: 'fishing', repeatText: 'The dragon\'s lake is still. You already fished these waters.' },
    // Floor 96
    { title: 'The Last Shrine', description: 'The final shrine before the dungeon\'s core. It is tended by a figure made entirely of golden light who offers no words but gestures toward a bowl of healing water.', action: '✨ Drink the Sacred Water', effectKey: 'heal_full', repeatText: 'The golden figure has gone. The bowl is dry. You already drank here.' },
    // Floor 97
    { title: 'The Memory Pool', description: 'A pool that replays the past — you can see the reflections of every adventurer who came before you, moving in their final hours. Watching teaches you things no book could.', action: '👁️ Watch the Memory Pool', effectKey: 'gain_exp_large', repeatText: 'The memory pool has gone still. You\'ve already learned everything it had to show.' },
    // Floor 98
    { title: 'The Eternal Forge', description: 'A forge that has burned since the dungeon was built. It never runs out of fuel. It never cools. Weapons of extraordinary power were made here. The tools to make more are still in their rack.', action: '⚒️ Work the Eternal Forge', effectKey: 'gain_statpoint', repeatText: 'You already forged what you could here. The eternal fire burns on regardless.' },
    // Floor 99
    { title: 'The Dungeon\'s Core', description: 'You\'ve reached the deepest chamber. A palpable aura of immense power emanates from the walls. The floor is covered in the carved names of every adventurer who reached this place. Very few names are here.', action: '🏆 Carve Your Name', effectKey: 'unlock_core_power', repeatText: 'Your name is already carved here in deep letters. You stand at the pinnacle.' },
];

export function getFloorData(floor) {
    const f = Math.min(Math.max(0, floor), 99);
    return FLOOR_DATA[f];
}
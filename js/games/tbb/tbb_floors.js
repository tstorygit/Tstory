// js/games/tbb/tbb_floors.js
// Floor narrative data: description, action button, effect, repeat text

/**
 * Floor entry shape:
 *   title       — overlay heading
 *   description — flavour text setting the scene
 *   action      — button label for the action
 *   effectKey   — string consumed by tbb.js to run the matching effect function
 *   repeatText  — shown when action already performed (unlock granted, or done this session)
 */

export const FLOOR_DATA = [
    // Floor 0
    { title: 'The Training Grounds', description: 'A grassy courtyard near the dungeon entrance. Wooden dummies line the walls and a friendly blacksmith tends a small forge. New adventurers sharpen their skills here before descending.', action: '🔨 Ask the Blacksmith for Advice', effectKey: 'heal_small', repeatText: 'The blacksmith grins. "You\'re getting the hang of it. Keep at it!"' },
    // Floor 1
    { title: 'The Mossy Entrance Hall', description: 'Damp stone walls thick with moss. Weak afternoon light filters through a cracked ceiling. A small stream trickles along one wall, pooling into a clear basin.', action: '💧 Drink from the Basin', effectKey: 'heal_small', repeatText: 'The basin is dry now. You\'ve already taken what it offered.' },
    // Floor 2
    { title: 'The Root Cellar', description: 'Massive tree roots have broken through the ceiling. Between them hang old oil lanterns, still flickering. A forgotten sack slumps against one root.', action: '🎒 Rummage Through the Sack', effectKey: 'gain_exp_small', repeatText: 'You already emptied the sack. Nothing remains but dust.' },
    // Floor 3
    { title: 'The Glowshroom Grotto', description: 'Thousands of bioluminescent mushrooms fill this cavern with soft blue light. The air smells faintly sweet. A cluster of especially large fungi pulses like a heartbeat.', action: '🍄 Eat a Glowshroom', effectKey: 'heal_medium', repeatText: 'You ate one last time and felt dizzy — best not push it.' },
    // Floor 4
    { title: 'The Forgotten Campsite', description: 'The remnants of a traveller\'s camp: a cold fire pit, a torn bedroll, and a half-eaten loaf gone hard as stone. Scratched into the wall: "Don\'t trust the east passage."', action: '🔥 Relight the Fire and Rest', effectKey: 'heal_medium', repeatText: 'The fire has burned down to embers. You already rested here.' },
    // Floor 5
    { title: 'The Shepherd\'s Pond', description: 'Sunlight — somehow — pours through a gap overhead, illuminating a still green pond. Lily pads drift lazily. Reeds sway. A wooden fishing rod leans against a boulder as if left for anyone who passes.', action: '🎣 Go Fishing', effectKey: 'heal_full', repeatText: 'You already fished the pond clean. The water is still and empty.' },
    // Floor 6
    { title: 'The Crumbling Library', description: 'Rows of rotting shelves hold waterlogged tomes. One shelf near the back holds newer, drier volumes. A reading desk still stands, its candle burned to nothing.', action: '📖 Study the Fresh Volumes', effectKey: 'gain_exp_medium', repeatText: 'You already read everything of value here.' },
    // Floor 7
    { title: 'The Amber Corridor', description: 'Walls embedded with golden veins of amber, each containing tiny preserved insects. A merchant\'s display cabinet has been left behind, glass cracked but contents intact.', action: '🪙 Trade with the Ghost Merchant', effectKey: 'gain_exp_medium', repeatText: 'The ghost merchant has moved on. Their cabinet is empty.' },
    // Floor 8
    { title: 'The Altar of the Traveller', description: 'A low stone altar bears the carved image of boots and a walking staff. Pilgrims once left offerings here. A small bowl still holds dried flowers.', action: '🙏 Leave an Offering', effectKey: 'heal_full', repeatText: 'You have nothing more to offer. The altar is silent.' },
    // Floor 9
    { title: 'The Guardian\'s Antechamber', description: 'A massive ornate door dominates the far wall, symbols pulsing with amber light. Weapons of fallen adventurers are mounted on racks along both sides.', action: '⚔️ Study the Fallen Weapons', effectKey: 'unlock_sharpened_edge', repeatText: 'You already studied the weapons thoroughly. The racks are stripped.' },
    // Floor 10
    { title: 'The Bone Orchard', description: 'Bleached skulls have been stacked into cairns alongside the path. A small chest sits at the base of the tallest cairn.', action: '💀 Open the Cairn Chest', effectKey: 'gain_statpoint', repeatText: 'The chest is open and empty. You already claimed its contents.' },
    // Floor 11
    { title: 'The Sulfur Springs', description: 'Foul-smelling yellow vents hiss steam from the floor. Despite the stench, the heat is oddly comforting. A hermit once lived here — their clay pots still line the walls.', action: '♨️ Soak in the Hot Spring', effectKey: 'heal_full', repeatText: 'The spring has cooled. You\'ve already soaked here.' },
    // Floor 12
    { title: 'The Mural Chamber', description: 'The entire wall is covered in a detailed painted mural of the dungeon\'s history. A historian\'s partially translated notes are pinned beneath the mural.', action: '🖼️ Study the Historian\'s Notes', effectKey: 'gain_exp_large', repeatText: 'You\'ve already memorised everything worth knowing here.' },
    // Floor 13
    { title: 'The Dripping Icicle Hall', description: 'Enormous icicles hang from the ceiling, each containing something frozen inside. One enormous icicle at the far end glows deep red at its core.', action: '🧊 Chip Out the Glowing Core', effectKey: 'unlock_ice_focus', repeatText: 'You already extracted the core. The icicle is now just ice.' },
    // Floor 14
    { title: 'The Windswept Bridge', description: 'A narrow stone bridge arches over a bottomless chasm. Wind howls in constant gusts. Halfway across, a locked strongbox is chained to the railing.', action: '🔑 Force Open the Strongbox', effectKey: 'gain_exp_large', repeatText: 'The strongbox hangs open and empty, rattling in the wind.' },
    // Floor 15
    { title: 'The Herbalist\'s Garden', description: 'Impossibly, a full garden grows here: medicinal herbs, trellised vines, a bubbling cauldron over a low flame. A sign reads: "Help yourself. Leave something behind."', action: '🌿 Brew a Healing Potion', effectKey: 'heal_full', repeatText: 'The cauldron is empty and cold. You\'ve already brewed what you could.' },
    // Floor 16
    { title: 'The Collapsed Vault', description: 'A former treasure vault has caved in, spilling old coins and shattered pottery. Most goods are buried under rubble, but a small leather journal lies open on a stone.', action: '📓 Read the Vault Keeper\'s Journal', effectKey: 'gain_exp_large', repeatText: 'You\'ve already read every page. The journal holds no more secrets.' },
    // Floor 17
    { title: 'The Wishing Well', description: 'A perfectly preserved stone well stands in the center. Looking down, you see a faint shimmer far below — coins catching phantom light.', action: '🪙 Toss a Coin and Make a Wish', effectKey: 'random_boon', repeatText: 'The well is silent. Your wish has already been heard.' },
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
    { title: 'The Echo Garden', description: 'Stone flowers — minerals formed into petal shapes over centuries — fill this cavern. Hollow tubes catch air currents and produce haunting music. A bee-sized creature of light drifts among the "flowers".', action: '🌸 Follow the Light Creature', effectKey: 'random_boon', repeatText: 'The light creature has gone. The garden is still and quiet.' },
    // Floor 27
    { title: 'The Whispering Lake', description: 'A mist-covered lake lies perfectly still in a vast cavern. The forest of stalagmites around it is unnaturally quiet. A fishing rod rests against a boulder at the water\'s edge.', action: '🎣 Fish in the Whispering Lake', effectKey: 'heal_full', repeatText: 'Nothing remains to catch. The lake is undisturbed glass.' },
    // Floor 28
    { title: 'The Trophy Hall', description: 'Monster heads, weapons, and crests of fallen guilds line the walls. A large book on a pedestal records the names of every adventurer who made it this far. Your name is not yet in it.', action: '✍️ Sign the Book', effectKey: 'gain_exp_medium', repeatText: 'Your name is already there in ink. The page is full.' },
    // Floor 29
    { title: 'The Drowned Forge', description: 'A massive forge half-sunk into groundwater. The anvil is still above water. Floating on the surface is a leather-wrapped bundle — a master smith\'s tools, still oiled and wrapped.', action: '🔨 Use the Smith\'s Tools', effectKey: 'unlock_forged_steel', repeatText: 'The tools were good, but you\'ve already used what you could from them.' },
    // Floor 30
    { title: 'The Sunken Plaza', description: 'A broad paved plaza, half-flooded, with abandoned market stalls in rows. One stall still has a sign: "Elixirs — Freshness Guaranteed." The bottles are still sealed.', action: '⚗️ Take an Elixir', effectKey: 'heal_full', repeatText: 'All the elixirs are gone. You already took the last one.' },
    // Floors 31–48: 6-pattern rotation
    ...Array.from({ length: 18 }, (_, k) => {
        const i = k + 31;
        const patterns = [
            { title: `The Deep Meadow (F${i})`, description: 'An inexplicable patch of open sky and rolling grass grows here, fed by a crack in the roof. Bees drone among wildflowers. A shepherd\'s crook leans against a mossy fence post.', action: '🌾 Rest in the Meadow', effectKey: 'heal_medium', repeatText: 'The meadow has quieted. You already rested here.' },
            { title: `The Wanderer's Shrine (F${i})`, description: 'A small roadside shrine decorated with trinkets left by passing adventurers: coins, ribbon, a child\'s drawing. Incense still smoulders.', action: '🕯️ Meditate at the Shrine', effectKey: 'gain_exp_medium', repeatText: 'The incense has burned out. The shrine is still.' },
            { title: `The Crystal Vein (F${i})`, description: 'A thick vein of semi-precious crystals runs through the wall, glittering in every colour. A miner\'s pick is embedded nearby, its handle worn smooth.', action: '⛏️ Mine the Crystals', effectKey: 'gain_exp_large', repeatText: 'The vein is chipped out. You already mined everything of value.' },
            { title: `The Moonpool (F${i})`, description: 'A perfectly circular pool reflects light from a single crack overhead, creating the illusion of a full moon on its surface. The water is ice-cold and crystal clear.', action: '🌕 Bathe in the Moonpool', effectKey: 'heal_full', repeatText: 'You\'ve already bathed here. The pool shimmers undisturbed.' },
            { title: `The Bone Inscription (F${i})`, description: 'Sentences are carved into every surface here in a cramped, urgent hand. Most of it is a single phrase repeated endlessly: "Knowledge is the only armour."', action: '📜 Read the Inscriptions', effectKey: 'gain_exp_large', repeatText: 'You\'ve already read the inscriptions. The message is burned into your memory.' },
            { title: `The Ember Vault (F${i})`, description: 'Smouldering coals in a low stone bowl cast orange warmth across the room. The walls are carved with murals of fire elementals dancing. Instructions for a simple ritual are etched nearby.', action: '🔥 Perform the Ember Ritual', effectKey: 'random_boon', repeatText: 'The embers are cold. The ritual cannot be repeated.' },
        ];
        return patterns[k % 6];
    }),
    // Floor 49
    { title: 'The Hall of Lost Scribes', description: 'A circular chamber lined with crumbling stone tablets, densely inscribed. Subjects range from monster anatomy to philosophy. Partial translations are scattered on a low table.', action: '🔍 Decipher the Key Tablets', effectKey: 'unlock_scribe_wisdom', repeatText: 'You\'ve already deciphered the key tablets. You can read them fluently now.' },
    // Floors 50–73: 6-pattern rotation
    ...Array.from({ length: 24 }, (_, k) => {
        const i = k + 50;
        const patterns = [
            { title: `The Obsidian Terrace (F${i})`, description: 'Smooth black volcanic rock forms a wide terrace overlooking a deep cavern. A hermit left a meditation cushion here — faded but intact.', action: '🧘 Meditate on the Terrace', effectKey: 'heal_medium', repeatText: 'The cushion is worn flat. You\'ve already meditated here.' },
            { title: `The Ghost Library (F${i})`, description: 'Ghostly bookshelves fade in and out of visibility. Books float and shuffle pages. One solid book sits on a real shelf: a master index of all the ghost texts.', action: '👻 Read the Master Index', effectKey: 'gain_exp_large', repeatText: 'The ghost library has faded. You\'ve already gleaned its knowledge.' },
            { title: `The Leviathan Spring (F${i})`, description: 'An enormous underground spring glows faintly green. A stone tablet warns: "One drink restores. Two drinks doom." The cup provided holds exactly one measure.', action: '🫗 Drink from the Spring', effectKey: 'heal_full', repeatText: 'The cup is empty and cracked. You already drank your one measure.' },
            { title: `The Arena Remains (F${i})`, description: 'A small gladiatorial pit still has a fighting dummy at its centre, its padding worn to nothing. A champion\'s trophy gathers dust in a corner.', action: '🥊 Train Against the Dummy', effectKey: 'gain_statpoint', repeatText: 'The dummy has collapsed. You trained it to pieces.' },
            { title: `The Philosopher's Den (F${i})`, description: 'A grand study: leather chairs, a roaring fireplace, walls covered in philosophical diagrams. A chalkboard shows a half-completed equation. Blue flames that do not consume.', action: '🧮 Complete the Equation', effectKey: 'gain_exp_large', repeatText: 'The equation is solved and the chalkboard wiped clean.' },
            { title: `The Boon Altar (F${i})`, description: 'A glowing altar carved from a single translucent crystal pulses softly. The inscription reads: "For the worthy, something wondrous."', action: '✨ Touch the Altar', effectKey: 'random_boon', repeatText: 'The altar\'s glow has faded. It has given what it had.' },
        ];
        return patterns[k % 6];
    }),
    // Floor 74
    { title: 'The Shifting Maze', description: 'The walls here move and rearrange on their own. At the maze\'s heart stands a motionless statue with a key around its neck. The key glows with an unusual energy.', action: '🗝️ Take the Key from the Statue', effectKey: 'unlock_maze_key', repeatText: 'You already have the key\'s knowledge. The statue is empty-handed.' },
    // Floors 75–98: 4-pattern rotation
    ...Array.from({ length: 24 }, (_, k) => {
        const i = k + 75;
        const patterns = [
            { title: `The Abyssal Shore (F${i})`, description: 'An underground sea stretches to invisibility. Black waves lap at a shingle beach of obsidian pebbles. A lantern hung on a post casts warm yellow light on the dark water.', action: '🌊 Wade in the Shallows', effectKey: 'heal_full', repeatText: 'The tide has receded. You already found what the sea offered.' },
            { title: `The Void Library (F${i})`, description: 'Bookshelves stretch upward beyond sight. There is no floor, no ceiling — only books and floating platforms. One glowing tome floats at eye level, as if waiting.', action: '📖 Read the Glowing Tome', effectKey: 'gain_exp_large', repeatText: 'The tome has sealed itself. Its knowledge is already within you.' },
            { title: `The Titan's Forge (F${i})`, description: 'A forge built for something far larger than a human blazes with white-hot fire. The anvil is the size of a cart. Half-finished pieces of impossibly large armour surround it.', action: '⚒️ Work the Titan\'s Forge', effectKey: 'gain_statpoint', repeatText: 'The forge has cooled. You already shaped what you could.' },
            { title: `The Starfall Chamber (F${i})`, description: 'Tiny lights drift downward from a dark ceiling like slow-falling stars. A circle of standing stones in the centre pulses as each light touches it.', action: '⭐ Stand in the Stone Circle', effectKey: 'random_boon', repeatText: 'The lights have gone dark. The circle is silent.' },
        ];
        return patterns[k % 4];
    }),
    // Floor 99
    { title: 'The Dungeon\'s Core', description: 'You\'ve reached the deepest chamber. A palpable aura of immense power emanates from the walls. The floor is covered in the carved names of every adventurer who reached this place. Very few names are here.', action: '🏆 Carve Your Name', effectKey: 'unlock_core_power', repeatText: 'Your name is already carved here in deep letters. You stand at the pinnacle.' },
];

export function getFloorData(floor) {
    const f = Math.min(Math.max(0, floor), 99);
    return FLOOR_DATA[f];
}
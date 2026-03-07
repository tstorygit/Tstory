// js/games/tbb/tbb_floors.js
// Floor narrative data — direct port of tbb_floor_actions.dart

const _whispers = [
    "a faint melody carried on the wind", "rustling in the unseen depths",
    "an ancient, indecipherable script", "a cold draft from an unseen passage",
    "the scent of unknown blossoms", "a shimmering light in the distance",
    "the echo of distant footsteps", "a peculiar silence that deafens",
    "a forgotten shrine, moss-covered", "runes glowing faintly on a nearby stone"
];
const _curiosity = [
    "Your curiosity is piqued.", "A sense of unease washes over you.",
    "You feel a strange pull towards it.", "An adventurer's instinct tells you to investigate.",
    "What could this mean?", "The air crackles with unseen energy.",
    "This place feels... different.", "You pause, considering your next move.",
    "Perhaps a secret lies hidden here.", "The path ahead seems to shift."
];
const _enviro = [
    "The trees here grow in unnatural spirals.", "The ground is littered with strange, iridescent pebbles.",
    "A thick, sweet-smelling fog hangs in the air.", "Bioluminescent fungi illuminate the path.",
    "The silence is broken by the drip of water in a vast cavern.", "Ancient statues, half-buried, watch your passage.",
    "Crystalline structures jut from the earth.", "The wind howls through narrow rock formations.",
    "A chasm splits the earth, bridged by a rickety rope structure.", "The air is heavy with the smell of ozone and something metallic."
];

function _pick(arr, seed) { return arr[Math.abs(seed) % arr.length]; }

const _FLOOR_DATA = Array.from({ length: 100 }, (_, i) => {
    if (i === 0)  return { btn: 'Look Around',    title: 'Floor 0: The Threshold',          text: 'You stand at the entrance of a sprawling dungeon, its depths unknown. The air is still, and an ancient path stretches before you. This is where your journey begins.' };
    if (i === 9)  return { btn: 'Enter Chamber',  title: 'Floor 9: Guardian\'s Antechamber', text: 'A massive, ornate door blocks your path. Strange symbols pulse with a dim light. You feel a powerful presence beyond. This is likely the lair of a strong guardian.' };
    if (i === 19) return { btn: 'Cross Bridge',   title: 'Floor 19: Chasm of Echoes',        text: `A vast chasm splits the dungeon floor. A rickety wooden bridge sways precariously. Far below, you hear ${_pick(_whispers, i*2)}. You must cross to proceed.` };
    if (i === 27) return { btn: 'Inspect Anomaly',title: 'Floor 27: Whispering Lake',        text: 'You arrive at the shore of a serene, mist-covered lake. The forest around it is unnaturally quiet. After a while, you feel a strange, powerful tug on your line...' };
    if (i === 49) return { btn: 'Decipher Runes', title: 'Floor 49: Hall of Lost Scribes',   text: `This circular chamber is lined with crumbling stone tablets. ${_pick(_whispers, i*3)} covers their surfaces. Perhaps a clue to the dungeon\'s secrets lies here.` };
    if (i === 74) return { btn: 'Traverse Labyrinth', title: 'Floor 74: The Shifting Maze',  text: `The walls here seem to move and rearrange themselves. ${_pick(_enviro, i+1)} Every turn feels like a gamble.` };
    if (i === 99) return { btn: 'Face the End',   title: 'Floor 99: The Dungeon\'s Core',    text: 'You\'ve reached the deepest part of the dungeon. A palpable aura of immense power emanates from the chamber ahead. Whatever lies within is the ultimate test.' };

    const p = i % 7;
    switch (p) {
        case 0: return { btn: 'Proceed',      title: `Floor ${i}: Winding Path`,     text: `The path continues its descent. ${_pick(_enviro, i)}. You remain vigilant for any signs of danger or treasure.` };
        case 1: return { btn: 'Investigate',  title: `Floor ${i}: Shadowed Nook`,    text: `This area is darker than usual. You hear ${_pick(_whispers, i)}. ${_pick(_curiosity, i+1)}.` };
        case 2: return { btn: 'Examine',      title: `Floor ${i}: Forgotten Alcove`, text: `A small alcove is tucked away here, containing ${_pick(_enviro, i+2)}. It seems undisturbed for ages.` };
        case 3: return { btn: 'Venture Forth',title: `Floor ${i}: Crystal Cave`,     text: `${_pick(_enviro, i+3)}. The light refracts in dazzling patterns. Beautiful, but could also hide threats.` };
        case 4: return { btn: 'Press On',     title: `Floor ${i}: Ominous Corridor`, text: `A long corridor stretches before you. ${_pick(_whispers, i+4)}. ${_pick(_curiosity, i+5)}.` };
        case 5: return { btn: 'Rest Briefly', title: `Floor ${i}: Quiet Clearing`,   text: `You find a small, surprisingly peaceful clearing. ${_pick(_enviro, i+6)}. A moment of respite, perhaps?` };
        case 6: return { btn: 'Search Ruins', title: `Floor ${i}: Crumbling Ruins`,  text: `Remnants of ancient structures litter this area. ${_pick(_whispers, i+7)}. ${_pick(_curiosity, i+8)}.` };
    }
});

export function getFloorAction(floor) {
    const f = Math.min(Math.max(0, floor), 99);
    return _FLOOR_DATA[f];
}

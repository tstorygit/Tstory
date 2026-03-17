export const CHARACTERS = {
    // ── Starter ────────────────────────────────────────────────────────────
    ronin: {
        id: 'ronin', name: 'The Ronin', icon: '🥷', cost: 0,
        startWeapon: 'katana',
        desc: 'Starts with Katana. +10% Move Speed.',
        flavour: 'A masterless swordsman, drifting between battles.',
        stats: { moveSpeedMult: 0.1 }
    },

    // ── 500 souls ──────────────────────────────────────────────────────────
    miko: {
        id: 'miko', name: 'The Miko', icon: '⛩️', cost: 500,
        startWeapon: 'ofuda',
        desc: 'Starts with Ofuda. +20% Soul drop rate.',
        flavour: 'A shrine maiden who commands sacred paper talismans.',
        stats: { soulMult: 0.2 }
    },

    // ── 1 000 souls ────────────────────────────────────────────────────────
    monk: {
        id: 'monk', name: 'The Monk', icon: '📿', cost: 1000,
        startWeapon: 'beads',
        desc: 'Starts with Prayer Beads. +5 Armor.',
        flavour: 'A wandering ascetic who turns suffering into defence.',
        stats: { armor: 5 }
    },

    // ── 1 500 souls ────────────────────────────────────────────────────────
    kitsune: {
        id: 'kitsune', name: 'The Kitsune', icon: '🦊', cost: 1500,
        startWeapon: 'fireball',
        desc: 'Starts with Kitsune Fire. +25% Pickup Radius, +10% Souls.',
        flavour: 'A fox spirit whose illusions pull fortune close.',
        stats: { magnetMult: 0.25, soulMult: 0.1 }
    },

    // ── 2 000 souls ────────────────────────────────────────────────────────
    shinobi: {
        id: 'shinobi', name: 'The Shinobi', icon: '🌙', cost: 2000,
        startWeapon: 'shuriken',
        desc: 'Starts with Shuriken. -20% Weapon Cooldowns.',
        flavour: 'A shadow-walker whose blades arrive before you hear them.',
        stats: { cooldownMult: -0.20 }
    },

    // ── 3 000 souls ────────────────────────────────────────────────────────
    oni: {
        id: 'oni', name: 'The Oni', icon: '👿', cost: 3000,
        startWeapon: 'beads',
        desc: 'Starts with Prayer Beads. +40% Max HP, +6 Armor, -15% Speed.',
        flavour: 'A demon of immense bulk who absorbs punishment for fun.',
        stats: { hpMult: 0.40, armor: 6, moveSpeedMult: -0.15 }
    },

    // ── 4 000 souls ────────────────────────────────────────────────────────
    tengu: {
        id: 'tengu', name: 'The Tengu', icon: '🦅', cost: 4000,
        startWeapon: 'katana',
        desc: 'Starts with Katana. +20% Damage, -20% Max HP.',
        flavour: 'A winged war-demon — devastating but reckless.',
        stats: { damageMult: 0.20, hpMult: -0.20 }
    },
};

export const WEAPONS = {
    katana: {
        id: 'katana', name: 'Katana', icon: '🗡️', type: 'directional',
        levels: [
            { damage: 15, cooldown: 1.5, count: 1, area: 1.0, desc: "Slashes in front." },
            { damage: 20, cooldown: 1.5, count: 1, area: 1.2, desc: "+5 Damage, +20% Area." },
            { damage: 20, cooldown: 1.5, count: 2, area: 1.2, desc: "Fires an additional slash backwards." },
            { damage: 30, cooldown: 1.3, count: 2, area: 1.2, desc: "+10 Damage, Cooldown reduced." },
            { damage: 30, cooldown: 1.3, count: 3, area: 1.2, desc: "Fires a 3rd slash." },
            { damage: 45, cooldown: 1.0, count: 3, area: 1.5, desc: "+15 Damage, Cooldown reduced, +30% Area." },
        ]
    },
    ofuda: {
        id: 'ofuda', name: 'Purifying Ofuda', icon: '📜', type: 'orbital',
        levels: [
            { damage: 10, cooldown: 0, count: 1, speed: 2,   desc: "An Ofuda circles you." },
            { damage: 12, cooldown: 0, count: 2, speed: 2,   desc: "Two Ofuda circle you." },
            { damage: 15, cooldown: 0, count: 3, speed: 2.5, desc: "Three Ofuda. Speed increased." },
            { damage: 20, cooldown: 0, count: 3, speed: 2.5, desc: "+5 Damage." },
            { damage: 20, cooldown: 0, count: 4, speed: 3,   desc: "Four Ofuda. Speed increased." },
            { damage: 35, cooldown: 0, count: 5, speed: 3.5, desc: "Five Ofuda. Massive damage increase." },
        ]
    },
    shuriken: {
        id: 'shuriken', name: 'Shuriken', icon: '🪃', type: 'projectile',
        levels: [
            { damage: 8,  cooldown: 1.0, count: 1, speed: 300, desc: "Throws a shuriken at nearest enemy." },
            { damage: 12, cooldown: 0.9, count: 1, speed: 300, desc: "+4 Damage, Cooldown reduced." },
            { damage: 12, cooldown: 0.9, count: 2, speed: 350, desc: "Throws 2 shurikens." },
            { damage: 18, cooldown: 0.8, count: 2, speed: 350, desc: "+6 Damage, Cooldown reduced." },
            { damage: 18, cooldown: 0.8, count: 3, speed: 400, desc: "Throws 3 shurikens." },
            { damage: 30, cooldown: 0.6, count: 4, speed: 500, desc: "Throws 4 shurikens very rapidly." },
        ]
    },
    beads: {
        id: 'beads', name: 'Prayer Beads', icon: '📿', type: 'aura',
        levels: [
            { damage: 5,  cooldown: 1.0, area: 1.0, desc: "Radiates damaging aura around you." },
            { damage: 8,  cooldown: 0.9, area: 1.2, desc: "+3 Damage, +20% Area." },
            { damage: 12, cooldown: 0.8, area: 1.2, desc: "+4 Damage, Cooldown reduced." },
            { damage: 15, cooldown: 0.7, area: 1.5, desc: "+3 Damage, +30% Area." },
            { damage: 20, cooldown: 0.6, area: 1.5, desc: "+5 Damage, Cooldown reduced." },
            { damage: 35, cooldown: 0.5, area: 2.0, desc: "Massive damage and area." },
        ]
    },
    fireball: {
        id: 'fireball', name: 'Kitsune Fire', icon: '🔥', type: 'random_aoe',
        levels: [
            { damage: 20, cooldown: 2.0, count: 1, area: 1.0, desc: "Drops fire on a random enemy." },
            { damage: 30, cooldown: 1.8, count: 1, area: 1.2, desc: "+10 Damage, larger explosion." },
            { damage: 30, cooldown: 1.8, count: 2, area: 1.2, desc: "Drops 2 fireballs." },
            { damage: 45, cooldown: 1.5, count: 2, area: 1.5, desc: "+15 Damage, Cooldown reduced." },
            { damage: 45, cooldown: 1.5, count: 3, area: 1.5, desc: "Drops 3 fireballs." },
            { damage: 70, cooldown: 1.0, count: 4, area: 2.0, desc: "Rain of fire." },
        ]
    }
};

export const PASSIVES = {
    spinach: { id: 'spinach', name: 'Demon Mask',     icon: '👺', maxLevel: 5, desc: '+10% Base Damage per level.',    stat: 'damageMult',    value:  0.1  },
    boots:   { id: 'boots',   name: 'Tabi Boots',     icon: '🩴', maxLevel: 5, desc: '+10% Move Speed per level.',    stat: 'moveSpeedMult', value:  0.1  },
    armor:   { id: 'armor',   name: 'Samurai Armor',  icon: '👘', maxLevel: 5, desc: '+2 Armor per level.',           stat: 'armor',         value:  2    },
    magnet:  { id: 'magnet',  name: 'Kitsune Tail',   icon: '🦊', maxLevel: 5, desc: '+25% Pickup Radius per level.', stat: 'magnetMult',    value:  0.25 },
    tome:    { id: 'tome',    name: 'Ancient Scroll',  icon: '📜', maxLevel: 5, desc: '-5% Cooldown per level.',       stat: 'cooldownMult',  value: -0.05 },
    health:  { id: 'health',  name: 'Rice Ball',       icon: '🍙', maxLevel: 5, desc: '+20% Max HP per level.',        stat: 'hpMult',        value:  0.2  },
};

export const ENEMIES = {
    grunt:  { id: 'grunt',  emoji: '👻', hp: 10,   speed: 60,  damage: 5,  xp: 1   },
    dasher: { id: 'dasher', emoji: '💨', hp: 8,    speed: 110, damage: 3,  xp: 2   },
    tank:   { id: 'tank',   emoji: '👹', hp: 45,   speed: 40,  damage: 15, xp: 5   },
    boss:   { id: 'boss',   emoji: '👺', hp: 1500, speed: 50,  damage: 30, xp: 100, isBoss: true }
};
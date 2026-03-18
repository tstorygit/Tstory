export const CHARACTERS = {
    // ── Starter ────────────────────────────────────────────────────────────
    gamewizard: {
        id: 'gamewizard', name: 'The GameWizard', icon: '🧙', cost: 0,
        startWeapon: 'stormgust',
        desc: 'Starts with Storm Gust. +15% Damage, +25% Pickup Radius.',
        flavour: 'A wandering mage who bends the winds of fate to swallow whole battlefields.',
        stats: { damageMult: 0.15, magnetMult: 0.25 }
    },

    // ── 500 souls ──────────────────────────────────────────────────────────
    ronin: {
        id: 'ronin', name: 'The Ronin', icon: '🥷', cost: 500,
        startWeapon: 'katana',
        desc: 'Starts with Katana. +10% Move Speed.',
        flavour: 'A masterless swordsman, drifting between battles.',
        stats: { moveSpeedMult: 0.1 }
    },

    miko: {
        id: 'miko', name: 'The Miko', icon: '⛩️', cost: 500,
        startWeapon: 'ofuda',
        desc: 'Starts with Ofuda. +20% Soul drop rate.',
        flavour: 'A shrine maiden who commands sacred paper talismans.',
        stats: { soulMult: 0.2 }
    },

    // ── 1 000 souls ────────────────────────────────────────────────────────
    chi: {
        id: 'chi', name: 'Chi', icon: '🐱', cost: 0,
        startWeapon: 'catspaw',
        desc: "Starts with Cat's Paw. +15% Move Speed, +10% Pickup Radius.",
        flavour: 'A white-brown tabby who wanders the spirit forest, paws glowing with ancient energy.',
        stats: { moveSpeedMult: 0.15, magnetMult: 0.10 }
    },

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
    // ── Chi's attack ─────────────────────────────────────────────────────────

    // Cat's Paw — spinning multi-directional swipe AOE bursts around the player
    catspaw: {
        id: 'catspaw', name: "Cat's Paw", icon: '🐾', type: 'catspaw', rare: true,
        levels: [
            { damage: 20, cooldown: 1.8, count: 3, radius: 90,  desc: "3 paw swipes burst outward in all directions." },
            { damage: 28, cooldown: 1.7, count: 3, radius: 100, desc: "+8 Damage, wider reach." },
            { damage: 28, cooldown: 1.6, count: 4, radius: 105, desc: "4 swipes per burst." },
            { damage: 38, cooldown: 1.4, count: 4, radius: 115, desc: "+10 Damage, Cooldown reduced." },
            { damage: 38, cooldown: 1.3, count: 5, radius: 125, desc: "5 swipes — full 360° coverage." },
            { damage: 58, cooldown: 1.0, count: 6, radius: 145, desc: "6 swipes, massive damage. Unstoppable frenzy." },
        ]
    }
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
    stormgust: {
        id: 'stormgust', name: 'Storm Gust', rare: true, icon: '🌀', type: 'storm_gust',
        levels: [
            { damage: 18, cooldown: 2.2, radiusX: 130, radiusY: 90,  offsetForward: 60, desc: "Calls a storm in front. Wide AOE; you are inside it." },
            { damage: 25, cooldown: 2.0, radiusX: 145, radiusY: 100, offsetForward: 60, desc: "+7 Damage, slightly larger storm." },
            { damage: 25, cooldown: 2.0, radiusX: 165, radiusY: 115, offsetForward: 65, desc: "Storm grows significantly." },
            { damage: 38, cooldown: 1.8, radiusX: 165, radiusY: 115, offsetForward: 65, desc: "+13 Damage, Cooldown reduced." },
            { damage: 38, cooldown: 1.8, radiusX: 190, radiusY: 135, offsetForward: 70, desc: "Massive storm expansion." },
            { damage: 60, cooldown: 1.4, radiusX: 220, radiusY: 160, offsetForward: 70, desc: "Legendary storm. Fills the screen." },
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
    },

    // ── Ragnarök Online spells ──────────────────────────────────────────────

    // Meteor Storm — delayed AOE impacts scattered around nearby enemies
    meteorstorm: {
        id: 'meteorstorm', name: 'Meteor Storm', rare: true, icon: '☄️', type: 'meteor_storm',
        levels: [
            { damage: 35, cooldown: 4.0, count: 3, area: 1.0, delay: 0.6, desc: "3 meteors rain from the sky near enemies." },
            { damage: 45, cooldown: 3.8, count: 4, area: 1.1, delay: 0.5, desc: "4 meteors. Impact radius grows." },
            { damage: 45, cooldown: 3.5, count: 5, area: 1.2, delay: 0.5, desc: "5 meteors." },
            { damage: 60, cooldown: 3.2, count: 6, area: 1.3, delay: 0.4, desc: "+15 Damage, 6 meteors." },
            { damage: 60, cooldown: 3.0, count: 8, area: 1.4, delay: 0.35, desc: "8 meteors rain rapidly." },
            { damage: 90, cooldown: 2.5, count: 10, area: 1.6, delay: 0.25, desc: "Apocalyptic rain of fire." },
        ]
    },

    // Lord of Vermillion — full-screen lightning barrage, rapid random bolts
    lordofvermillion: {
        id: 'lordofvermillion', name: 'Lord of Vermillion', rare: true, icon: '⚡', type: 'lov',
        levels: [
            { damage: 12, cooldown: 5.0, boltCount: 8,  boltInterval: 0.12, area: 1.0, desc: "8 lightning bolts rain across the screen." },
            { damage: 16, cooldown: 4.8, boltCount: 10, boltInterval: 0.10, area: 1.1, desc: "10 bolts, wider spread." },
            { damage: 16, cooldown: 4.5, boltCount: 12, boltInterval: 0.09, area: 1.2, desc: "12 bolts." },
            { damage: 22, cooldown: 4.2, boltCount: 14, boltInterval: 0.08, area: 1.3, desc: "+6 Damage, 14 bolts." },
            { damage: 22, cooldown: 4.0, boltCount: 18, boltInterval: 0.07, area: 1.4, desc: "18 bolts — the sky screams." },
            { damage: 35, cooldown: 3.5, boltCount: 24, boltInterval: 0.05, area: 1.6, desc: "24 bolts, catastrophic." },
        ]
    },

    // Heaven's Drive — line of earth pillars erupting forward along facing direction
    heavensdrive: {
        id: 'heavensdrive', name: "Heaven's Drive", rare: true, icon: '🪨', type: 'heavens_drive',
        levels: [
            { damage: 22, cooldown: 2.0, count: 4, spacing: 60, area: 1.0, desc: "4 earth pillars erupt in a line ahead." },
            { damage: 30, cooldown: 1.9, count: 5, spacing: 65, area: 1.1, desc: "5 pillars. Impact area grows." },
            { damage: 30, cooldown: 1.8, count: 6, spacing: 65, area: 1.2, desc: "6 pillars." },
            { damage: 42, cooldown: 1.6, count: 6, spacing: 70, area: 1.3, desc: "+12 Damage. Wider pillars." },
            { damage: 42, cooldown: 1.5, count: 8, spacing: 70, area: 1.4, desc: "8 pillars extend further." },
            { damage: 65, cooldown: 1.2, count: 10, spacing: 75, area: 1.6, desc: "10 pillars, massive range." },
        ]
    },

    // Soul Strike — fast homing bolts, single target, high pierce at top levels
    soulstrike: {
        id: 'soulstrike', name: 'Soul Strike', icon: '💠', type: 'soul_strike',
        levels: [
            { damage: 14, cooldown: 1.2, count: 1, speed: 420, desc: "Fires a seeking soul bolt at the nearest enemy." },
            { damage: 20, cooldown: 1.1, count: 1, speed: 460, desc: "+6 Damage. Faster." },
            { damage: 20, cooldown: 1.0, count: 2, speed: 480, desc: "Fires 2 soul bolts." },
            { damage: 28, cooldown: 0.9, count: 2, speed: 500, desc: "+8 Damage. Even faster." },
            { damage: 28, cooldown: 0.8, count: 3, speed: 520, desc: "3 bolts seek 3 targets." },
            { damage: 42, cooldown: 0.6, count: 4, speed: 580, desc: "4 bolts, near-instant cast." },
        ]
    },

    // Jupitel Thunder — single powerful bolt, knocks enemy back
    jupitelthunder: {
        id: 'jupitelthunder', name: 'Jupitel Thunder', icon: '🌩️', type: 'jupitel',
        levels: [
            { damage: 28, cooldown: 1.4, speed: 500, knockback: 180, desc: "Blasts the nearest enemy and knocks it back." },
            { damage: 38, cooldown: 1.3, speed: 520, knockback: 200, desc: "+10 Damage, stronger knockback." },
            { damage: 38, cooldown: 1.2, speed: 540, knockback: 220, desc: "Cooldown reduced." },
            { damage: 52, cooldown: 1.0, speed: 560, knockback: 260, desc: "+14 Damage, greater knockback." },
            { damage: 52, cooldown: 0.85,speed: 580, knockback: 300, desc: "Even faster. Enemies fly." },
            { damage: 78, cooldown: 0.65,speed: 650, knockback: 380, desc: "Devastating bolt. Maximum knockback." },
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
// js/games/legend/leg_entities.js
import { TILE } from './leg_map.js';

export const WEAPONS = {
    sword: { id: 'sword', name: 'Broadsword',   icon: '🗡️', type: 'arc',        range: 60, arc: Math.PI/2, damage: 1.0, clear: null },
    axe:   { id: 'axe',   name: 'Battle Axe',   icon: '🪓', type: 'arc',        range: 50, arc: Math.PI/3, damage: 1.6, clear: TILE.TREE },
    sickle:{ id: 'sickle',name: 'Sickle',       icon: '🌙', type: 'radial',     range: 70, arc: Math.PI*2, damage: 0.8, clear: TILE.GRASS },
    spear: { id: 'spear', name: 'Lance',        icon: '🔱', type: 'linear',     range: 110,arc: 0,         damage: 1.2, clear: null },
    chain: { id: 'chain', name: 'Grapple Whip', icon: '⛓️', type: 'projectile', range: 180,arc: 0,         damage: 0.7, clear: null, grapple: TILE.POST },
    star:  { id: 'star',  name: 'Morning Star', icon: '☄️', type: 'arc',        range: 65, arc: Math.PI/2, damage: 2.0, clear: TILE.ROCK }
};

export const ENEMIES = [
    { id: 'slime', emoji: '💧', hpMult: 1.0, speed: 50,  atkMult: 1.0, xp: 15, ai: 'chase' },
    { id: 'bat',   emoji: '🦇', hpMult: 0.5, speed: 100, atkMult: 0.8, xp: 10, ai: 'wander' },
    { id: 'orc',   emoji: '👹', hpMult: 2.0, speed: 35,  atkMult: 1.5, xp: 25, ai: 'chase' },
    { id: 'ghost', emoji: '👻', hpMult: 0.8, speed: 70,  atkMult: 1.2, xp: 20, ai: 'chase_fly' } 
];

export const BOSSES = [
    { id: 'dragon', emoji: '🐉', hpMult: 6, speed: 50, atkMult: 2.0, xp: 300, ai: 'chase' }
];

export const PERKS = {
    hp:    { name: 'Titan Blood',   desc: '+50 Base HP', cost: 1 },
    mp:    { name: 'Mystic Mind',   desc: '+20 Base MP', cost: 1 },
    exp:   { name: 'Scholar',       desc: '+10% EXP Gain', cost: 2 },
    dodge: { name: 'Reflexes',      desc: '-0.5s Dodge Cooldown', cost: 2 }
};
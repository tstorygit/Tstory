// js/games/chao/chao_trophy_ui.js
//
// The 🏆 Trophy Shelf — a read-only display of competition results and
// milestone badges, rendered into the Compete tab's minigame container.
// Medal / win counts come from existing lifetime stats in chao_state.js;
// badges are either derived on the fly or read from the (defaulted) polish
// counters added alongside this feature.

import { getChiTrueStat } from './chao_state.js';

// Milestone badges. `unlocked(data)` derives from state; `progress(data)`
// (optional) returns "current / target" text shown while locked.
const BADGES = [
    {
        icon: '🌱', name: 'First Steps',
        req: 'Answer your first Study Hall question',
        unlocked: (d) => (d.stats.totalStudyAnswers || 0) >= 1,
    },
    {
        icon: '📚', name: 'Hundred Scholar',
        req: 'Answer 100 Study Hall questions',
        unlocked: (d) => (d.stats.totalStudyAnswers || 0) >= 100,
        progress: (d) => `${Math.min(100, d.stats.totalStudyAnswers || 0)} / 100`,
    },
    {
        icon: '🔥', name: 'On Fire',
        req: 'Reach a 20-answer study streak',
        unlocked: (d) => (d.stats.bestStudyStreak || 0) >= 20,
        progress: (d) => `best ${d.stats.bestStudyStreak || 0} / 20`,
    },
    {
        icon: '🌸', name: 'Seishin Tycoon',
        req: 'Earn 1,000 lifetime Seishin',
        unlocked: (d) => (d.stats.totalSeishinEarned || 0) >= 1000,
        progress: (d) => `${Math.min(1000, d.stats.totalSeishinEarned || 0)} / 1000`,
    },
    {
        icon: '⭐', name: 'Rising Star',
        req: 'Raise any Chi stat to Lv 10',
        unlocked: (d) => d.chis.some(c =>
            ['stamina', 'strength', 'agility', 'wisdom', 'swim', 'fly']
                .some(s => getChiTrueStat(c, s) >= 1000)),
    },
    {
        icon: '🧺', name: 'Full Fruit Basket',
        req: 'Hold every kind of fruit at once',
        unlocked: (d) => Object.values(d.fruits).every(n => n > 0),
    },
    {
        icon: '🥚', name: 'Growing Family',
        req: 'Raise 3 Chis in your garden',
        unlocked: (d) => d.chis.length >= 3,
        progress: (d) => `${Math.min(3, d.chis.length)} / 3`,
    },
    {
        icon: '👊', name: 'Triple Threat',
        req: 'Win a race, a karate match, and a flawless pageant',
        unlocked: (d) => (d.stats.totalRacesWon || 0) >= 1
            && (d.stats.totalKarateWins || 0) >= 1
            && (d.stats.totalPageantsWon || 0) >= 1,
    },
];

export function renderTrophyShelf(container, stateManager) {
    const d = stateManager.data;
    const s = d.stats;

    const medal = (icon, count, label) => `
        <div class="chao-trophy-medal">
            <div class="chao-trophy-medal-icon">${icon}</div>
            <b>${count || 0}</b>
            <span>${label}</span>
        </div>`;

    const badgeCard = (b) => {
        const won = b.unlocked(d);
        return `
            <div class="chao-badge ${won ? '' : 'locked'}">
                <div class="chao-badge-icon">${won ? b.icon : '🔒'}</div>
                <div class="chao-badge-name">${b.name}</div>
                <div class="chao-badge-req">${won ? 'Unlocked!' : b.req}</div>
                ${!won && b.progress ? `<div class="chao-badge-progress">${b.progress(d)}</div>` : ''}
            </div>`;
    };

    const unlockedCount = BADGES.filter(b => b.unlocked(d)).length;

    container.innerHTML = `
        <div class="chao-trophy-shelf">
            <h3 style="margin:0 0 4px 0;">🏆 Trophy Shelf</h3>
            <p style="margin:0 0 10px 0; color:#bbb; font-size:13px;">
                Your Chis' lifetime achievements across the garden.
            </p>

            <h4 style="margin:8px 0 4px 0; color:#f1fa8c;">🏁 Race Medals</h4>
            <div class="chao-trophy-medals">
                ${medal('🥇', s.totalRacesWon, 'gold')}
                ${medal('🥈', s.raceSilver, 'silver')}
                ${medal('🥉', s.raceBronze, 'bronze')}
            </div>

            <h4 style="margin:14px 0 4px 0; color:#ff5555;">🥋 Karate</h4>
            <div class="chao-trophy-medals">
                ${medal('🥋', s.totalKarateWins, 'matches won')}
            </div>

            <h4 style="margin:14px 0 4px 0; color:#ff79c6;">🎭 Pageant</h4>
            <div class="chao-trophy-medals">
                ${medal('🏆', s.totalPageantsWon, 'flawless (80%+)')}
                ${medal('🏅', s.pageantSolidWins, 'solid (50%+)')}
            </div>

            <h4 style="margin:14px 0 4px 0; color:#bd93f9;">🎖 Badges (${unlockedCount}/${BADGES.length})</h4>
            <div class="chao-badge-grid">
                ${BADGES.map(badgeCard).join('')}
            </div>
        </div>
    `;
}

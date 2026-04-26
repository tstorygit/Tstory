// js/games/chao/chao_economy.js

import { getAllTimeStats } from '../../srs_stats.js';

export function syncEconomy(stateManager) {
    const stats = getAllTimeStats();
    const currentTotal = stats.srsReviews || 0;
    const lastTotal = stateManager.data.lastSrsReviewCount || 0;
    
    if (currentTotal > lastTotal) {
        const delta = currentTotal - lastTotal;
        
        // 1 Correct SRS Review = 1 Seishin
        let earnedSeishin = delta;

        // Streak Bonus: +20% extra currency if they have a streak > 5
        if (stats.streak && stats.streak.current > 5) {
            earnedSeishin += Math.floor(delta * 0.2);
        }

        stateManager.data.seishin += earnedSeishin;
        stateManager.data.lastSrsReviewCount = currentTotal;
        stateManager.save();
        
        return earnedSeishin;
    }
    return 0;
}
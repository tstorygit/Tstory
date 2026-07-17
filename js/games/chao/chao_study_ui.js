// js/games/chao/chao_study_ui.js
//
// The "Study" tab — the heart of the Chi Garden economy loop.
// SRS reviews run through GameVocabManager (globalSrs mode, so answers update
// the player's real flashcard schedule) using the standard continuous quiz
// component. Correct answers pay a live Seishin bonus; the regular per-review
// payout (see chao_economy.js) is collected when the session ends.

import { showGameQuiz, renderVocabSettings, setGvmTheme } from '../../game_vocab_mgr_ui.js';
import { syncEconomy } from './chao_economy.js';

const BONUS_SCHEDULED = 2;   // 🌸 per correct scheduled review
const BONUS_UNSCHEDULED = 1; // 🌸 per correct unscheduled (🌈) review

let _visitEarned = 0; // Seishin earned via study sessions since the app loaded

/**
 * @param {HTMLElement} container      the tab screen element
 * @param {ChaoStateManager} stateManager
 * @param {GameVocabManager} vocabMgr  pool already set by chao.js (globalSrs)
 * @param {object} opts
 * @param {HTMLElement} opts.overlayHost     element the quiz overlay is appended to
 * @param {Function}    opts.showToast       (msg) => void
 * @param {Function}    opts.onSeishinChanged () => void — refresh header counter
 */
export function renderStudyTab(container, stateManager, vocabMgr, opts) {
    const stats = vocabMgr.getStats();
    const hasPool = stats.totalPoolSize > 0;

    container.innerHTML = `
        <h3 style="margin-top:0;">🎓 Study Hall</h3>
        <p style="margin:0 0 12px 0; color:#bbb; font-size:13px;">
            Review your real SRS vocabulary to earn <b style="color:#f1fa8c;">🌸 Seishin</b> for
            fruits, hats, and eggs. Answers update your actual flashcard schedule.
        </p>

        <div class="chao-study-chips">
            <div class="chao-study-chip">📚 <b>${stats.totalPoolSize}</b><span>words</span></div>
            <div class="chao-study-chip">📬 <b>${stats.dueCount}</b><span>due now</span></div>
            <div class="chao-study-chip">🌸 <b>${_visitEarned}</b><span>earned this visit</span></div>
        </div>

        <button id="chao-study-start" class="chao-action-btn" style="width:100%; margin:12px 0; padding:16px; font-size:16px; background:#50fa7b; color:#282a36;" ${hasPool ? '' : 'disabled'}>
            ▶ Start Studying
        </button>
        ${hasPool ? '' : `
            <p style="color:#ffb86c; font-size:13px; text-align:center; margin:0 0 12px 0;">
                Your SRS library is empty — learn some words in the Story Reader,
                SRS tab, or Word Trainer first!
            </p>`}

        <div style="background:#282a36; border:1px solid #444; border-radius:8px; padding:10px 12px; font-size:12px; color:#aaa; line-height:1.7;">
            <b style="color:#eee;">How you earn:</b><br>
            🟢 Correct scheduled review: <b style="color:#50fa7b;">+${BONUS_SCHEDULED} 🌸</b> bonus<br>
            🌈 Correct unscheduled review: <b style="color:#f1fa8c;">+${BONUS_UNSCHEDULED} 🌸</b> bonus (doesn't change your SRS interval)<br>
            ➕ Every review also counts toward your regular study payout, collected when the session ends.
        </div>

        <details style="margin-top:14px;">
            <summary style="cursor:pointer; color:#8be9fd; font-weight:bold; padding:6px 0;">⚙️ Vocab Settings</summary>
            <div id="chao-vocab-settings" style="margin-top:8px;"></div>
        </details>
    `;

    const settingsHost = container.querySelector('#chao-vocab-settings');
    renderVocabSettings(vocabMgr, settingsHost, (updatedConfig) => {
        stateManager.data.vocabConfig = updatedConfig;
        stateManager.save();
        opts.showToast('Vocab settings saved!');
    }, 'srs');

    const startBtn = container.querySelector('#chao-study-start');
    if (!hasPool) return;

    startBtn.addEventListener('click', () => {
        setGvmTheme('dark');

        let sessionBonus = 0;
        let sessionCount = 0;
        let sessionCorrect = 0;
        let ended = false;

        const endSession = () => {
            if (ended) return;
            ended = true;
            vocabMgr.resume();
            const base = syncEconomy(stateManager); // regular per-review payout
            const total = sessionBonus + base;
            _visitEarned += total;
            if (total > 0) {
                stateManager.data.stats.totalSeishinEarned =
                    (stateManager.data.stats.totalSeishinEarned || 0) + base;
                stateManager.save();
            }
            opts.onSeishinChanged();
            if (sessionCount > 0) {
                opts.showToast(`🎓 Session done! ${sessionCorrect}/${sessionCount} correct · +${total} 🌸`);
            }
            renderStudyTab(container, stateManager, vocabMgr, opts);
        };

        vocabMgr.pause();
        showGameQuiz(vocabMgr, {
            container: opts.overlayHost,
            continuous: true,
            showFurigana: true,
            optionCount: 4,
            title: (isFree) => isFree ? '🌈 Bonus Practice' : '🎓 Study Time!',
            titleColor: (isFree) => isFree ? '#bbb' : '#50fa7b',
            onAnswer: (isCorrect, wordObj, result) => {
                sessionCount++;
                if (isCorrect) {
                    sessionCorrect++;
                    const bonus = (result && result.isUnscheduled) ? BONUS_UNSCHEDULED : BONUS_SCHEDULED;
                    sessionBonus += bonus;
                    stateManager.data.seishin += bonus;
                    stateManager.data.stats.totalSeishinEarned =
                        (stateManager.data.stats.totalSeishinEarned || 0) + bonus;
                    stateManager.save();
                    opts.onSeishinChanged();
                }
            },
            onClose: endSession,
            onEmpty: () => {
                opts.showToast('No more words available right now!');
                endSession();
            }
        });
    });
}

// EasyRevise — Result page entry point.
// Orchestrates: state loading, summary render, review list, AI grade polling, "why wrong" delegation.

import { ResultState } from './state.js';
import { renderSummary } from './summary.js';
import { renderReviewList } from './review-list.js';
import { GradePoller } from './polling.js';
import { askWhyWrong } from './explain.js';

async function bootstrap() {
    const state = new ResultState();
    if (!state.loadSavedResult()) {
        window.location.href = '/';
        return;
    }

    try {
        await state.fetchExamAndFlatten();

        renderSummary(state);

        const container = document.getElementById('reviewContainer');
        renderReviewList({
            state,
            container,
            onAskWhyWrong: (qid, btn) => askWhyWrong({ state, questionId: qid, btnEl: btn })
        });

        // Initial grade load + start polling if pending.
        const poller = new GradePoller();
        const initial = await poller.loadInitial(state);
        if (initial.grades && initial.grades.length > 0) {
            const { updateGradeCards } = await import('./polling.js');
            updateGradeCards(initial.grades);
        }
        if (initial.pending && state.hasGradeable()) {
            const ctx = initial.pollCtx || {
                examId: state.results.examId,
                code: initial.code || state.accessCode,
                userId: initial.userId || state.userId
            };
            poller.start(ctx);
        }

        // KaTeX render
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(container, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
    } catch (e) {
        console.error('Result page error:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}

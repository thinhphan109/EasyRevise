// EasyRevise — Global keyboard shortcuts (with IME guard for Vietnamese input).
// Fixes UI-3 bug: navigation no longer triggered while typing diacritic chars.

/**
 * Attach global keydown handler with proper guards.
 * @param {Object} state - { questionsList, currentQuestionIndex, userAnswers }
 * @param {Object} handlers - { onPrev, onNext, onRender, onSaveProgress }
 * @returns {Function} cleanup function to detach handler
 */
export function attachKeyboardShortcuts(state, handlers) {
    const onKeyDown = (e) => {
        // IME composition guard (Vietnamese, Chinese, etc.)
        if (e.isComposing || e.keyCode === 229) return;
        // Modifier keys (Ctrl+R, Cmd+S, ...) — let browser handle
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Don't hijack typing inside any input/select/contentEditable
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

        if (e.key === 'ArrowLeft' && handlers.onPrev) handlers.onPrev();
        if (e.key === 'ArrowRight' && handlers.onNext) handlers.onNext();

        // A/B/C/D shortcuts — only for multiple-choice / reading questions
        if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
            const idx = e.key.toLowerCase().charCodeAt(0) - 97;
            const q = state.questionsList[state.currentQuestionIndex];
            if (q && !q.isEssay && !q.isFillBlank && !q.isFreeForm
                && q.options && idx < q.options.length) {
                state.userAnswers[q.id] = idx;
                if (handlers.onSaveProgress) handlers.onSaveProgress();
                if (handlers.onRender) handlers.onRender();
                setTimeout(() => { if (handlers.onNext) handlers.onNext(); }, 250);
            }
        }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
}

/**
 * Toggle flag for current question (called by global flag button).
 */
export function toggleFlag(state, onUpdate) {
    const idx = state.currentQuestionIndex;
    if (state.flaggedQuestions.has(idx)) {
        state.flaggedQuestions.delete(idx);
    } else {
        state.flaggedQuestions.add(idx);
    }
    localStorage.setItem(`easyrevise_flags_${state.examId}`, JSON.stringify([...state.flaggedQuestions]));
    if (typeof onUpdate === 'function') onUpdate();
}

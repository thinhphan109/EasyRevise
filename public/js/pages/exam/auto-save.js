// EasyRevise — Auto-save module: persists exam progress to localStorage.

/**
 * Persist current answers to localStorage AND update in-progress index.
 */
export function saveProgress(state) {
    localStorage.setItem(`easyrevise_progress_${state.examId}`, JSON.stringify(state.userAnswers));
    saveInProgress(state);
}

/**
 * Update the cross-exam in-progress index used by home page.
 */
export function saveInProgress(state) {
    const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
    inProgress[state.examId] = {
        examTitle: state.examData?.title || '',
        answeredCount: Object.keys(state.userAnswers).length,
        totalQuestions: state.totalQuestions,
        lastAccessed: Date.now(),
        currentQuestion: state.currentQuestionIndex
    };
    localStorage.setItem('easyrevise_in_progress', JSON.stringify(inProgress));
}

/**
 * Create a debounced save handler that also refreshes question grid.
 * Returns a function with same signature as saveProgress (call repeatedly).
 */
export function createDebouncedSave(state, onAfterSave, delay = 350) {
    let timer = null;
    return function debouncedSave(customDelay = delay) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            saveProgress(state);
            if (typeof onAfterSave === 'function') onAfterSave();
            timer = null;
        }, customDelay);
    };
}

/**
 * Load saved answers + visited/flagged sets from localStorage.
 * Mutates state.userAnswers, state.flaggedQuestions, state.visitedQuestions.
 */
export function loadSavedProgress(state) {
    const savedAnswers = localStorage.getItem(`easyrevise_progress_${state.examId}`);
    if (savedAnswers) {
        try { state.userAnswers = JSON.parse(savedAnswers) || {}; }
        catch (e) { state.userAnswers = {}; }
    }

    const savedFlags = localStorage.getItem(`easyrevise_flags_${state.examId}`);
    if (savedFlags) {
        try {
            const flagArr = JSON.parse(savedFlags);
            state.flaggedQuestions = new Set(flagArr);
        } catch (e) { state.flaggedQuestions = new Set(); }
    }
}

/**
 * Clear all auto-saved state for an exam.
 */
export function clearProgress(examId) {
    localStorage.removeItem(`easyrevise_progress_${examId}`);
    localStorage.removeItem(`easyrevise_flags_${examId}`);
    localStorage.removeItem(`easyrevise_startTime_${examId}`);
    const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
    delete inProgress[examId];
    localStorage.setItem('easyrevise_in_progress', JSON.stringify(inProgress));
}

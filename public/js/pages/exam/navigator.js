// EasyRevise — Question navigator (grid + arrow navigation).
// Pure DOM helpers using state object passed by reference.

/**
 * Build the question grid (called once on init).
 * @param {Object} state - { totalQuestions, currentQuestionIndex, visitedQuestions:Set }
 * @param {Function} onJump - callback(idx) when user clicks a cell
 */
export function buildQuestionGrid(state, onJump) {
    const grids = [document.getElementById('qGrid'), document.getElementById('qGridM')];
    grids.forEach(grid => {
        if (!grid) return;
        grid.innerHTML = '';
        for (let i = 0; i < state.totalQuestions; i++) {
            const cell = document.createElement('button');
            cell.className = 'q-cell';
            cell.textContent = i + 1;
            cell.setAttribute('data-index', i);
            cell.addEventListener('click', () => onJump(i));
            grid.appendChild(cell);
        }
    });
}

/**
 * Update grid cell classes based on current answer state.
 * @param {Object} state - { questionsList, userAnswers, visitedQuestions, flaggedQuestions, currentQuestionIndex, totalQuestions }
 */
export function updateQuestionGrid(state) {
    const grids = [document.getElementById('qGrid'), document.getElementById('qGridM')];
    grids.forEach(grid => {
        if (!grid) return;
        const cells = grid.querySelectorAll('.q-cell');
        cells.forEach((cell, i) => {
            const q = state.questionsList[i];
            cell.className = 'q-cell';
            if (state.userAnswers[q.id] !== undefined) cell.classList.add('answered');
            else if (state.visitedQuestions.has(i)) cell.classList.add('visited');
            if (state.flaggedQuestions.has(i)) cell.classList.add('flagged');
            if (i === state.currentQuestionIndex) cell.classList.add('active');
        });
    });

    const summary = document.getElementById('answeredSummary');
    if (summary) {
        const answered = Object.keys(state.userAnswers).length;
        summary.textContent = `${answered}/${state.totalQuestions} đã trả lời`;
    }
}

/**
 * Move to a question by relative direction (-1 prev, +1 next).
 * Mutates state.currentQuestionIndex + visitedQuestions, then calls onRender().
 */
export function navigate(state, direction, onRender) {
    const nextIndex = state.currentQuestionIndex + direction;
    if (nextIndex >= 0 && nextIndex < state.totalQuestions) {
        state.currentQuestionIndex = nextIndex;
        state.visitedQuestions.add(nextIndex);
        if (typeof onRender === 'function') onRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

/**
 * Jump to specific index. Used by grid clicks and global toggleFlag.
 */
export function jumpTo(state, index, onRender) {
    if (index >= 0 && index < state.totalQuestions) {
        state.currentQuestionIndex = index;
        state.visitedQuestions.add(index);
        if (typeof onRender === 'function') onRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

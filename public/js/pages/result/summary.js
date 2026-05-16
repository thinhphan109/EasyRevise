// EasyRevise — Score summary renderer.
// Renders score, correct/incorrect/skip counts, time spent, retake button.

export function renderSummary(state) {
    const { results, examData } = state;

    const scoreEl = document.getElementById('scoreValue');
    const correctEl = document.getElementById('correctCount');
    const incorrectEl = document.getElementById('incorrectCount');
    const skipEl = document.getElementById('skipCount');
    const examDateEl = document.getElementById('examDate');
    const timeEl = document.getElementById('timeSpent');

    if (scoreEl) scoreEl.textContent = results.score;
    if (correctEl) correctEl.textContent = results.correct;
    if (incorrectEl) incorrectEl.textContent = results.incorrect;
    if (skipEl) skipEl.textContent = results.skipped;
    if (examDateEl) examDateEl.textContent = `Hoàn thành vào: ${results.timestamp}`;

    if (timeEl && results.timeSpent) {
        const min = Math.floor(results.timeSpent / 60);
        const sec = results.timeSpent % 60;
        timeEl.textContent = `${min} phút ${sec} giây`;
    }

    // Score color via class (CSS handles light/dark theme + contrast)
    if (scoreEl) {
        const s = parseFloat(results.score);
        scoreEl.classList.remove('score-high', 'score-mid', 'score-low');
        if (s >= 8) scoreEl.classList.add('score-high');
        else if (s >= 5) scoreEl.classList.add('score-mid');
        else scoreEl.classList.add('score-low');
    }

    // Retake button
    const retakeBtn = document.getElementById('retakeBtn');
    if (retakeBtn) {
        if (examData.requireCode) {
            retakeBtn.textContent = '🔑 Nhập mã để làm lại';
            retakeBtn.href = '#';
            retakeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                // Clear unlock so user must re-enter code.
                const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
                delete unlocked[results.examId];
                localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked));
                window.location.href = '/';
            });
        } else {
            retakeBtn.href = `exam.html?id=${results.examId}`;
        }
    }
}

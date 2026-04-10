/* ========================================
   EasyRevise — Home / Exam List
   Load & render exams, in-progress
   ======================================== */

/**
 * Load and render exam list from server
 */
async function loadExams() {
    try {
        const res = await fetch('/api/exams');
        const exams = await res.json();
        const container = document.getElementById('examList');

        if (!exams.length) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <div class="emoji">📝</div>
                    <p>Chưa có đề thi nào. Vui lòng liên hệ giáo viên để thêm đề!</p>
                </div>`;
            return;
        }

        container.innerHTML = exams.map(exam => {
            const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
            const isLocked = exam.requireCode && !unlocked[exam.id];
            const clickAction = isLocked
                ? `openCodeModal('${exam.id}', '${exam.title.replace(/'/g, "\\'")}')`
                : `window.location.href='exam.html?id=${exam.id}'`;
            return `
                <div class="card card-hover exam-card" onclick="${clickAction}">
                    <h3>${isLocked ? '🔒 ' : ''}${exam.title}</h3>
                    <div class="meta">
                        <span>📝 ${exam.totalQuestions} câu</span>
                        <span>📂 ${exam.sectionCount} phần</span>
                        ${exam.totalEssays > 0 ? `<span>✍️ ${exam.totalEssays} bài luận</span>` : ''}
                    </div>
                    <p class="text-muted text-sm mb-6">
                        ${exam.subject} — ${exam.year}
                    </p>
                    <span class="btn btn-primary" style="pointer-events: none;">${isLocked ? '🔑 Nhập mã để mở' : 'Bắt đầu ôn tập →'}</span>
                </div>`;
        }).join('');
    } catch (err) {
        console.error('loadExams error:', err);
    }
}

/**
 * Load and render in-progress exams
 */
function loadInProgress() {
    const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
    const section = document.getElementById('inProgressSection');
    const container = document.getElementById('inProgressList');
    const entries = Object.entries(inProgress).filter(([id, data]) => data.answeredCount < data.totalQuestions);

    if (!entries.length) { section.style.display = 'none'; return; }

    section.style.display = 'block';
    container.innerHTML = entries.map(([id, data]) => {
        const percent = Math.round((data.answeredCount / data.totalQuestions) * 100);
        const timeAgo = getTimeAgo(data.lastAccessed);
        return `
            <div class="inprogress-card" onclick="window.location.href='exam.html?id=${id}'">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="inprogress-badge">Đang làm</span>
                        <span class="font-semibold">${data.examTitle}</span>
                    </div>
                    <div class="text-sm text-muted">
                        ${data.answeredCount}/${data.totalQuestions} câu · ${percent}% · ${timeAgo}
                    </div>
                </div>
                <span class="btn btn-primary btn-sm" style="pointer-events: none;">Tiếp tục →</span>
            </div>`;
    }).join('');
}

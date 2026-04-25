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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="1.5" style="margin:0 auto 1rem;opacity:0.4;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    <p>Chưa có đề thi nào. Vui lòng liên hệ giáo viên!</p>
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
                  <div style="padding:var(--space-6) var(--space-6) var(--space-5);">
                    <h3>${isLocked ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;opacity:0.5;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' : ''}${exam.title}</h3>
                    <div class="meta">
                        <span class="badge-pill">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            ${exam.totalQuestions} câu
                        </span>
                        <span class="badge-pill">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            ${exam.sectionCount} phần
                        </span>
                        ${exam.totalEssays > 0 ? `<span class="badge-pill"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> ${exam.totalEssays} luận</span>` : ''}
                    </div>
                    <p class="text-muted text-sm" style="margin-bottom:var(--space-4);">
                        ${exam.subject} · ${exam.year}${exam.timeLimit ? ' · ' + exam.timeLimit + ' phút' : ''}
                    </p>
                    <span class="card-cta">${isLocked ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> Nhập mã' : 'Bắt đầu ôn tập →'}</span>
                  </div>
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

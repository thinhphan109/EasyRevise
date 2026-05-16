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
            const lockSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px;opacity:0.6;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
            return `
                <article class="card card-raised card-interactive home-exam-card" onclick="${clickAction}" tabindex="0" aria-label="${exam.title}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
                    <div class="home-exam-card-top">
                        <h3 class="home-exam-card-title">${isLocked ? lockSvg : ''}${exam.title}</h3>
                    </div>
                    <div class="home-exam-card-meta">
                        <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${exam.totalQuestions} câu</span>
                        <span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> ${exam.sectionCount} phần</span>
                        ${exam.totalEssays > 0 ? `<span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg> ${exam.totalEssays} luận</span>` : ''}
                        ${exam.timeLimit ? `<span>⏱ ${exam.timeLimit} phút</span>` : ''}
                    </div>
                    <p class="text-muted text-sm" style="margin:0;">${exam.subject} · ${exam.year}</p>
                    <div class="home-exam-card-footer">
                        <span class="text-sm text-muted">${isLocked ? 'Yêu cầu mã' : 'Sẵn sàng'}</span>
                        <span class="btn btn-primary btn-sm" style="pointer-events:none;">${isLocked ? 'Nhập mã' : 'Bắt đầu →'}</span>
                    </div>
                </article>`;
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

    section.hidden = false;
    section.style.display = '';
    container.innerHTML = entries.map(([id, data]) => {
        const percent = Math.round((data.answeredCount / data.totalQuestions) * 100);
        const timeAgo = getTimeAgo(data.lastAccessed);
        return `
            <a class="home-inprogress-item" href="exam.html?id=${id}" aria-label="Tiếp tục: ${data.examTitle}">
                <div style="flex:1;min-width:0;">
                    <div class="font-semibold" style="color:var(--text);margin-bottom:2px;">${data.examTitle}</div>
                    <div class="text-sm" style="color:var(--text-2);">
                        ${data.answeredCount}/${data.totalQuestions} câu · ${percent}% · ${timeAgo}
                    </div>
                </div>
                <span class="btn btn-primary btn-sm" style="pointer-events:none;">Tiếp tục →</span>
            </a>`;
    }).join('');
}

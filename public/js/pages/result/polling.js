// EasyRevise — AI grading polling and grade card updates.
// Polls /my-grades every 4s, max 3min, updates DOM slots `grade-slot-{questionId}`.

import { renderMarkdown } from '../shared/markdown.js';
import { escapeHtml } from '../shared/escape.js';

export class GradePoller {
    constructor() {
        this._pollTimer = null;
        this._timerTick = null;
    }

    /**
     * Initial load of any existing grades. Returns { grades, pending, hasGradeable }.
     */
    async loadInitial(state) {
        const pollCtxRaw = sessionStorage.getItem('easyrevise_grade_poll');
        let pollCtx = null;
        try { pollCtx = pollCtxRaw ? JSON.parse(pollCtxRaw) : null; } catch (e) { pollCtx = null; }
        const code = state.accessCode || pollCtx?.code || null;
        const userId = pollCtx?.userId || state.userId || null;

        if (!state.hasGradeable()) return { grades: [], pending: false, pollCtx };

        try {
            const params = new URLSearchParams();
            if (code) params.set('code', code);
            if (userId) params.set('userId', userId);
            const gr = await fetch(`/api/exams/${state.results.examId}/my-grades?${params}`);
            if (!gr.ok) return { grades: [], pending: false, pollCtx };
            const data = await gr.json();
            return { grades: data.grades || [], pending: !!data.pending, pollCtx, code, userId };
        } catch (e) {
            return { grades: [], pending: false, pollCtx, code, userId };
        }
    }

    /**
     * Start polling loop. Call after loadInitial reports pending=true.
     */
    start({ examId, code, userId }) {
        const banner = document.getElementById('aiGradingBanner');
        const timerEl = document.getElementById('aiGradingTimer');
        const subtextEl = document.getElementById('aiGradingSubtext');
        if (banner) banner.style.display = 'block';

        const startedAt = Date.now();
        const MAX_WAIT_MS = 3 * 60 * 1000;
        const POLL_INTERVAL = 4000;

        const updateTimer = () => {
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            if (timerEl) timerEl.textContent = `${elapsed}s`;
        };

        const finish = (state) => {
            clearInterval(this._pollTimer);
            clearInterval(this._timerTick);
            sessionStorage.removeItem('easyrevise_grade_poll');
            if (!banner) return;
            if (state === 'graded') {
                banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.5rem;
                        background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:16px;" class="ai-grade-done-banner">
                        <span style="font-size:1.3rem;">✅</span>
                        <div style="font-weight:700;color:#16a34a;">Chấm xong! Điểm đã được cập nhật bên dưới.</div>
                    </div>`;
                setTimeout(() => { banner.style.opacity = '0'; banner.style.transition = 'opacity 0.6s'; setTimeout(() => banner.remove(), 700); }, 4000);
            } else if (state === 'resolved') {
                banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.5rem;
                        background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:16px;">
                        <span style="font-size:1.3rem;">ℹ️</span>
                        <div style="font-weight:700;color:#2563eb;">Đã cập nhật trạng thái chấm bài bên dưới.</div>
                    </div>`;
                setTimeout(() => { banner.style.opacity = '0'; banner.style.transition = 'opacity 0.6s'; setTimeout(() => banner.remove(), 700); }, 4000);
            } else {
                if (subtextEl) subtextEl.innerHTML = 'Đang chậm hơn thường lệ. Điểm sẽ được cập nhật sau khi giáo viên xem xét.';
                if (timerEl) timerEl.textContent = '';
                const spinner = document.getElementById('aiGradingSpinner');
                if (spinner) spinner.style.animationPlayState = 'paused';
            }
        };

        const poll = async () => {
            updateTimer();
            try {
                const params = new URLSearchParams();
                if (code) params.set('code', code);
                if (userId) params.set('userId', userId);
                const res = await fetch(`/api/exams/${examId}/my-grades?${params}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.grades && data.grades.length > 0) {
                    updateGradeCards(data.grades);
                }

                if (!data.pending) {
                    const hasGraded = (data.grades || []).some(g =>
                        g.status === 'graded' ||
                        (g.aiScore !== null && g.aiScore !== undefined) ||
                        (g.teacherScore !== null && g.teacherScore !== undefined));
                    finish(hasGraded ? 'graded' : 'resolved');
                } else if (Date.now() - startedAt > MAX_WAIT_MS) {
                    finish('timeout');
                }
            } catch (e) { /* network hiccup, keep trying */ }
        };

        this._timerTick = setInterval(updateTimer, 1000);
        this._pollTimer = setInterval(poll, POLL_INTERVAL);
        setTimeout(poll, 2000);
    }
}

/**
 * Update grade card slots with results from /my-grades. Pure function on grade list.
 */
export function updateGradeCards(grades) {
    for (const grade of grades) {
        const slot = document.getElementById(`grade-slot-${grade.questionId}`);
        if (!slot) continue;
        const status = grade.status || ((grade.aiScore !== null && grade.aiScore !== undefined) ? 'graded' : 'pending');

        if (status === 'skipped' || status === 'error' || status === 'pending') {
            const palette = status === 'error'
                ? { icon: '⚠️', title: 'AI chấm bài bị lỗi', color: '#dc2626', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: grade.aiError || 'Có lỗi khi gọi AI chấm bài.' }
                : status === 'skipped'
                    ? { icon: 'ℹ️', title: 'Chưa chấm bằng AI', color: '#d97706', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', text: grade.aiError === 'NO_API_KEY' ? 'Server chưa cấu hình API key chấm AI. Bài đã được lưu để giáo viên xem/chấm sau.' : (grade.aiError || 'AI grading đã được bỏ qua.') }
                    : { icon: '⏳', title: 'Đang chờ chấm AI', color: '#6366f1', bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.22)', text: 'Bài tự luận đã được lưu. Điểm sẽ cập nhật khi AI hoặc giáo viên chấm xong.' };
            slot.innerHTML = `
                <div style="margin-top:1rem;padding:0.9rem 1.1rem;border-radius:14px;border:1px solid ${palette.border};background:${palette.bg};">
                    <div style="display:flex;align-items:center;gap:0.55rem;font-weight:800;color:${palette.color};font-size:0.9rem;">
                        <span>${palette.icon}</span><span>${palette.title}</span>
                    </div>
                    <div style="margin-top:0.45rem;color:var(--text-secondary,#64748b);font-size:0.84rem;line-height:1.55;">${escapeHtml(palette.text)}</div>
                </div>`;
            continue;
        }
        if (grade.aiScore === null || grade.aiScore === undefined) continue;

        const maxScore = grade.aiMaxScore || 10;
        const displayScore = grade.teacherScore !== null && grade.teacherScore !== undefined
            ? grade.teacherScore
            : grade.aiScore;
        const pct = Math.round((displayScore / maxScore) * 100);
        const scoreColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
        const isTeacherOverride = grade.teacherScore !== null && grade.teacherScore !== undefined;

        slot.innerHTML = `
            <div style="margin-top:1rem;border-radius:14px;overflow:hidden;
                border:1px solid ${isTeacherOverride ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.2)'};
                background:var(--bg-card,#18181b);">

                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.25rem;
                    background:${isTeacherOverride ? 'rgba(34,197,94,0.07)' : 'rgba(99,102,241,0.07)'};
                    border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                        <span style="font-size:1rem;">${isTeacherOverride ? '👩‍🏫' : '🤖'}</span>
                        <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
                            ${isTeacherOverride ? 'Giáo viên chấm điểm' : 'Kết quả chấm'}
                        </span>
                    </div>
                    <div style="display:flex;align-items:baseline;gap:0.3rem;">
                        <span style="font-size:1.6rem;font-weight:900;color:${scoreColor};">${displayScore}</span>
                        <span style="font-size:0.85rem;color:var(--text-muted);">/&thinsp;${maxScore}</span>
                        ${isTeacherOverride && grade.aiScore !== null ? `
                        <span style="margin-left:0.4rem;font-size:0.72rem;color:var(--text-muted);
                            text-decoration:line-through;opacity:0.6;">(AI: ${grade.aiScore})</span>` : ''}
                    </div>
                </div>

                ${(grade.aiFeedback || grade.aiBreakdown) ? `
                <div style="padding:0.9rem 1.25rem;border-bottom:${grade.teacherFeedback ? '1px solid rgba(255,255,255,0.06)' : 'none'};">
                    <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);
                        text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">🤖 Nhận xét</div>
                    ${grade.aiFeedback ? `
                    <div style="font-size:0.88rem;color:var(--text-secondary,#cbd5e1);line-height:1.6;">${renderMarkdown(grade.aiFeedback)}</div>` : ''}
                    ${grade.aiBreakdown ? `
                    <div style="margin-top:0.5rem;padding:0.6rem 0.8rem;background:rgba(255,255,255,0.03);
                        border-radius:8px;font-size:0.8rem;color:var(--text-muted);
                        font-family:inherit;line-height:1.55;">${renderMarkdown(grade.aiBreakdown)}</div>` : ''}
                </div>` : ''}

                ${grade.teacherFeedback ? `
                <div style="padding:0.9rem 1.25rem;">
                    <div style="font-size:0.72rem;font-weight:700;color:#16a34a;
                        text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">👩‍🏫 Nhận xét của giáo viên</div>
                    <div style="font-size:0.88rem;color:var(--text-main);line-height:1.6;">${renderMarkdown(grade.teacherFeedback)}</div>
                </div>` : ''}
            </div>`;
    }
}

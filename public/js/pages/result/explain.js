// EasyRevise — "Tại sao tôi sai?" AI explain handler.
// Sends user's wrong answer + correct answer to AI to explain why; renders inline.

import { renderMarkdown } from './markdown.js';

export async function askWhyWrong({ state, questionId, btnEl }) {
    const slot = document.getElementById(`explain-slot-${questionId}`);
    if (!slot) return;

    // Resolve access code: prefer sessionStorage result_code, fallback unlocked LS.
    let code = state.accessCode;
    if (!code) {
        const resultCodeRaw = sessionStorage.getItem('easyrevise_result_code');
        if (resultCodeRaw) {
            try {
                const rc = JSON.parse(resultCodeRaw);
                if (rc.examId === state.results.examId) code = rc.code;
            } catch (e) { /* ignore */ }
        }
    }
    if (!code) {
        const unlockedLS = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        code = unlockedLS[state.results.examId] || null;
    }
    if (!code) {
        slot.innerHTML = '<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;">⚠️ Không tìm thấy mã kích hoạt để dùng tính năng này.</p>';
        return;
    }

    const q = state.questionsList.find(x => String(x.id) === String(questionId));
    const resultEntry = state.results.results.find(r => String(r.id) === String(questionId));
    if (!q || !resultEntry) return;

    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '⏳ Đang hỏi AI...';
        btnEl.style.opacity = '0.7';
    }

    const userId = state.userId;
    const completedAt = state.results.completedAt || state.results.savedAt || null;

    try {
        const res = await fetch(`/api/exams/${state.results.examId}/explain-wrong`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                questionId: String(questionId),
                userAnswer: resultEntry.userAnswer,
                correctAnswer: q.correctAnswer,
                questionText: q.question || '',
                options: q.options || [],
                explanation: q.explanation || '',
                userId,
                completedAt
            })
        });
        const data = await res.json();
        if (!res.ok) {
            slot.innerHTML = `<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;background:#fef2f2;padding:0.5rem 0.75rem;border-radius:8px;">⚠️ ${data.error || 'Lỗi không rõ'}</p>`;
            return;
        }
        const limitInfo = data.limit === -1 ? '' : ` (còn ${data.remaining >= 0 ? data.remaining : '∞'} lần)`;
        slot.innerHTML = `
            <div style="margin-top:0.75rem;border-radius:14px;overflow:hidden;border:1px solid rgba(99,102,241,0.25);">
                <div style="padding:0.65rem 1rem;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.07));border-bottom:1px solid rgba(99,102,241,0.12);display:flex;align-items:center;gap:0.5rem;">
                    <span>🤖</span>
                    <span style="font-size:0.75rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;">AI Giải Thích${limitInfo}</span>
                </div>
                <div style="padding:0.9rem 1rem;font-size:0.88rem;color:var(--text-main);line-height:1.65;">${renderMarkdown(data.explanation)}</div>
            </div>`;
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(slot, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        }
    } catch (err) {
        slot.innerHTML = `<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;">❌ ${err.message}</p>`;
    }
}

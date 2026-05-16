// EasyRevise — Status badge HTML for review items.

import { checkBlankMatch } from './blank-checker.js';

export function buildStatusBadge(q, resultEntry) {
    const userAnsId = resultEntry ? resultEntry.userAnswer : undefined;

    if (q.isEssay) {
        return '<span class="status-badge" style="background: rgba(99,102,241,0.2); color: #818cf8;">✍️ Phần Viết</span>';
    }
    if (q.isFreeForm) {
        return '<span class="status-badge" style="background: rgba(168,85,247,0.15); color: #a855f7;">✏️ Tự Luận</span>';
    }
    if (q.isFillBlank) {
        const blanks = q.blanks || [];
        const ansMap = resultEntry?.userAnswer || {};
        const fillAllCorrect = blanks.length > 0 && blanks.every((b, i) => {
            const uv = ((ansMap[i] !== undefined ? ansMap[i] : '') + '').trim();
            return checkBlankMatch(uv, String(b.answer || '').trim(), b.type, b);
        });
        const fillAnyAnswered = blanks.some((_, i) => (ansMap[i] + '').trim() !== '');
        if (!fillAnyAnswered) return '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">⚠️ Bỏ Qua</span>';
        if (fillAllCorrect) return '<span class="status-badge badge-correct">✅ Chính Xác</span>';
        return '<span class="status-badge badge-incorrect">❌ Chưa Đúng</span>';
    }
    if (userAnsId === undefined) {
        return '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">⚠️ Bỏ Qua</span>';
    }
    if (userAnsId === q.correctAnswer) {
        return '<span class="status-badge badge-correct">✅ Chính Xác</span>';
    }
    return '<span class="status-badge badge-incorrect">❌ Chưa Đúng</span>';
}

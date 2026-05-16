// EasyRevise — Review item renderer (per-question card).
// Renders 4 question types: multiple-choice, fill-in-blank, free-form, essay.

import { renderMarkdown } from '../shared/markdown.js';
import { escapeHtml } from '../shared/escape.js';
import { checkBlankMatch } from './blank-checker.js';
import { buildMediaHtml, buildVideoHtml } from './media.js';
import { buildStatusBadge } from './status-badge.js';

// Render free-form (sub-parts) response row.
function renderFreeFormResponse(q, resultEntry) {
    const subParts = q.subParts || [];
    const userAnswerText = resultEntry?.userAnswer || '';
    const attachments = resultEntry?.attachments || [];
    const partLines = userAnswerText ? userAnswerText.split('\n') : [];

    const buildPartExplHtml = (p) => {
        let h = '';
        if (p.explanation) {
            h += `<div style="margin-top:0.6rem;padding:0.6rem 0.85rem;background:rgba(99,102,241,0.05);border-left:3px solid rgba(99,102,241,0.35);border-radius:0 8px 8px 0;font-size:0.88rem;color:var(--text-main);" class="katex-render">${renderMarkdown(p.explanation)}</div>`;
        }
        const imgs = [];
        if (p.explanationImages && p.explanationImages.length > 0) imgs.push(...p.explanationImages);
        else if (p.explanationImage) imgs.push(p.explanationImage);
        if (imgs.length === 1) {
            h += `<div style="margin:0.4rem 0;"><img src="${imgs[0]}" alt="" style="max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain;" onclick="window.open('${imgs[0]}','_blank')"></div>`;
        } else if (imgs.length > 1) {
            h += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.4rem 0;">`;
            imgs.forEach((src, i) => {
                h += `<img src="${src}" alt="Ảnh ${i + 1}" style="max-width:180px;max-height:140px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
            });
            h += `</div>`;
        }
        if (p.explanationVideo) h += buildVideoHtml(p.explanationVideo);
        return h;
    };

    const partsHtml = subParts.length > 0
        ? subParts.map((p, i) => {
            const label = p.label ? `(${p.label})` : `Câu ${i + 1}`;
            const ans = partLines[i] ? partLines[i].replace(/^[^:]+:\s*/, '') : '(chưa điền)';
            const partExplHtml = buildPartExplHtml(p);
            const partSampleHtml = p.sampleAnswer
                ? `<div style="margin-top:0.4rem;padding:0.4rem 0.6rem;background:rgba(34,197,94,0.06);border-left:3px solid rgba(34,197,94,0.5);border-radius:0 6px 6px 0;font-size:0.82rem;color:var(--text-main);" class="katex-render">📝 ${renderMarkdown(p.sampleAnswer)}</div>`
                : '';
            const partQuestion = p.question
                ? `<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:0.35rem;line-height:1.5;" class="katex-render">${renderMarkdown(p.question)}</div>`
                : '';
            return `<div style="padding:0.75rem 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:0.78rem;font-weight:700;color:var(--primary);margin-bottom:0.25rem;">${label}</div>
                ${partQuestion}
                <div style="display:flex;gap:0.5rem;align-items:center;margin:0.25rem 0;">
                    <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">Bài làm:</span>
                    <span style="color:var(--text-main);font-size:0.92rem;font-weight:600;">${ans}</span>
                </div>
                ${partSampleHtml}
                ${partExplHtml}
            </div>`;
        }).join('')
        : `<div style="color:var(--text-muted);font-size:0.9rem;white-space:pre-line;">${escapeHtml(userAnswerText || '(chưa làm bài)')}</div>`;

    const attachmentsHtml = attachments.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;">${attachments.map(url =>
        url.endsWith('.pdf')
            ? `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">📄 PDF bài làm</a>`
            : `<img src="${url}" style="max-width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">`
    ).join('')}</div>` : '';

    return `
        <div style="margin-bottom:1rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-radius:12px;">
            <div style="font-weight:600;color:var(--text-main);font-size:0.88rem;margin-bottom:0.5rem;">Bài làm của bạn:</div>
            ${partsHtml}
            ${attachmentsHtml}
        </div>
        ${q.sampleAnswer ? `<div style="padding:1rem 1.25rem;background:rgba(34,197,94,0.05);border:1px dashed rgba(34,197,94,0.3);border-radius:12px;margin-bottom:1rem;">
            <strong style="color:var(--success);display:block;margin-bottom:0.5rem;">📝 Hướng dẫn / Đáp án mẫu:</strong>
            <div style="color:var(--text-main);font-size:0.92rem;white-space:pre-line;">${escapeHtml(q.sampleAnswer)}</div>
        </div>` : ''}
        ${q.explanationVideo ? `<div style="margin-top:0.75rem;"><div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">🎬 Video giải đáp</div>${buildVideoHtml(q.explanationVideo)}</div>` : ''}
        <div id="grade-slot-${q.id}" class="grade-slot"></div>`;
}

// Render fill-blank response row.
function renderFillBlankResponse(q, resultEntry) {
    const blanks = q.blanks || [];
    const userAnswerMap = resultEntry?.userAnswer || {};
    const rawQ = q.question || '';
    let parts;
    if (rawQ.includes('___')) parts = rawQ.split('___');
    else if (rawQ.includes('__')) parts = rawQ.split('__');
    else {
        parts = rawQ.split(/(?<!\S)_(?!\S)/);
        if (parts.length === 1) parts = rawQ.split('_');
    }

    let filledHtml = '<div style="font-size:1rem;line-height:2;color:var(--text-main);">';
    parts.forEach((part, i) => {
        filledHtml += `<span>${part.replace(/\n/g, '<br>')}</span>`;
        if (i < parts.length - 1) {
            const blank = blanks[i];
            const userVal = ((userAnswerMap[i] !== undefined ? userAnswerMap[i] : '') + '').trim();
            const expected = String(blank?.answer || '').trim();
            const isOk = blank ? checkBlankMatch(userVal, expected, blank.type, blank) : false;
            filledHtml += `<span style="
                display:inline-block;padding:0.15rem 0.6rem;margin:0 0.2rem;
                border-radius:8px;font-weight:700;font-size:0.92rem;
                background:${isOk ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};
                color:${isOk ? '#16a34a' : '#dc2626'};
                border:1px solid ${isOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};
                ">${userVal || '<em style="opacity:0.6">(trống)</em>'} ${isOk ? '✓' : `✗ <span style="font-size:0.78rem;opacity:0.75;">→ ${expected}</span>`}</span>`;
        }
    });
    filledHtml += '</div>';

    const allCorrect = blanks.length > 0 && blanks.every((b, i) => {
        const uv = ((userAnswerMap[i] !== undefined ? userAnswerMap[i] : '') + '').trim();
        return checkBlankMatch(uv, String(b.answer || '').trim(), b.type, b);
    });
    const wrongCount = blanks.filter((b, i) => !checkBlankMatch(((userAnswerMap[i] !== undefined ? userAnswerMap[i] : '') + '').trim(), String(b.answer || '').trim(), b.type, b)).length;

    return `
        <div style="margin-bottom:1.25rem;">
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">Câu trả lời của bạn</div>
            ${filledHtml}
            <div style="margin-top:0.5rem;font-size:0.82rem;color:${allCorrect ? '#16a34a' : '#dc2626'};font-weight:600;">
                ${allCorrect ? `✅ Tất cả ${blanks.length} ô đúng` : `❌ Sai ${wrongCount}/${blanks.length} ô`}
            </div>
            <div id="grade-slot-${q.id}" class="grade-slot"></div>
        </div>`;
}

// Render multiple-choice response row.
function renderMultipleChoiceResponse(q, resultEntry) {
    const userAnsId = resultEntry ? resultEntry.userAnswer : undefined;
    const letter = (idx) => ['A', 'B', 'C', 'D'][Number(idx)] || '?';
    const optionText = (idx) => (q.options && q.options[Number(idx)] !== undefined) ? q.options[Number(idx)] : '';
    const formatChoice = (idx) => {
        if (idx === undefined || idx === null || idx === '') return '<span style="color:var(--text-muted);">Chưa chọn</span>';
        return `<strong>${letter(idx)}.</strong> ${escapeHtml(optionText(idx) || '(không có nội dung)')}`;
    };
    const isCorrectChoice = userAnsId !== undefined && Number(userAnsId) === Number(q.correctAnswer);

    return `
        <div style="margin-bottom:1.25rem;display:grid;gap:0.65rem;">
            <div style="padding:0.8rem 1rem;background:${isCorrectChoice ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'};border:1px solid ${isCorrectChoice ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'};border-radius:12px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">Bạn đã chọn</div>
                <div style="color:var(--text-main);font-size:0.95rem;">${formatChoice(userAnsId)}</div>
            </div>
            ${!isCorrectChoice ? `<div style="padding:0.8rem 1rem;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.28);border-radius:12px;">
                <div style="font-size:0.78rem;font-weight:700;color:var(--success);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.25rem;">Đáp án đúng</div>
                <div style="color:var(--text-main);font-size:0.95rem;">${formatChoice(q.correctAnswer)}</div>
            </div>` : ''}
        </div>`;
}

// Render essay response row.
function renderEssayResponse(q, resultEntry) {
    const userAnswer = resultEntry?.userAnswer;
    const attachments = resultEntry?.attachments || [];
    const attachmentsHtml = attachments.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">${attachments.map(url =>
        `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">${url.endsWith('.pdf') ? '📄 PDF bài làm' : `<img src="${url}" style="max-width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`}</a>`
    ).join('')}</div>` : '';

    return `
        <div style="margin-bottom: 1rem;">
            <strong style="color: var(--text-main); font-size: 0.9rem;">Bài làm của bạn:</strong>
            <div style="margin-top: 0.5rem; padding: 1rem; background:rgba(255,255,255,0.03); border-radius: 12px; color: var(--text-muted); font-size: 0.9rem; white-space: pre-line;">${escapeHtml(userAnswer) || 'Không có bài làm.'}</div>
            ${attachmentsHtml}
        </div>
        ${q.sampleAnswer ? `<div style="padding: 1.25rem; background: rgba(34,197,94,0.05); border: 1px dashed rgba(34,197,94,0.3); border-radius: 12px; margin-bottom: 1rem;">
            <strong style="color: var(--success); display: block; margin-bottom: 0.75rem;">📝 Mẫu đáp án:</strong>
            <div style="color: var(--text-main); font-size: 0.95rem; white-space: pre-line;">${escapeHtml(q.sampleAnswer)}</div>
        </div>` : ''}
        <div id="grade-slot-${q.id}" class="grade-slot"></div>`;
}

// Build response row by question type.
function buildResponseRow(q, resultEntry) {
    if (q.isFreeForm) return renderFreeFormResponse(q, resultEntry);
    if (q.isFillBlank) return renderFillBlankResponse(q, resultEntry);
    if (q.isEssay) return renderEssayResponse(q, resultEntry);
    return renderMultipleChoiceResponse(q, resultEntry);
}

/**
 * Render the entire review list. Caller passes state + onAskWhyWrong callback.
 * The "Tại sao tôi sai?" button uses data-action attribute (no inline onclick) to comply with CSP.
 */
export function renderReviewList({ state, container, onAskWhyWrong }) {
    container.innerHTML = '';

    state.questionsList.forEach((q, index) => {
        const resultEntry = state.results.results.find(r => String(r.id) === String(q.id));

        const reviewItem = document.createElement('div');
        reviewItem.className = 'glass-panel review-item';

        const statusBadge = buildStatusBadge(q, resultEntry);
        const responseRow = buildResponseRow(q, resultEntry);
        const questionMediaHtml = buildMediaHtml(q, { explanation: false });
        const explMediaHtml = buildMediaHtml(q, { explanation: true });

        const titleHtml = renderMarkdown(
            q.isEssay ? (q.prompt || '')
                : q.isFreeForm ? (q.question || q.prompt || q.sectionPrompt || q.instruction || '')
                    : (q.question || '')
        );
        const sectionLabel = (q.isFreeForm || q.isEssay)
            ? q.sectionTitle
            : `${q.sectionTitle} — Câu ${index + 1}`;

        const showExplain = !q.isEssay && !q.isFreeForm && !q.isFillBlank && resultEntry && resultEntry.isCorrect === false;

        reviewItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">
                    ${sectionLabel}
                </div>
                ${statusBadge}
            </div>
            <div style="font-size: 1.05rem; font-weight: 600; margin-bottom: 1.25rem; color: var(--text-main); line-height: 1.5;" class="katex-render">
                ${titleHtml}
            </div>
            ${questionMediaHtml}
            ${responseRow}
            ${q.explanation && q.showExplanation !== false ? `
            <div class="explanation-box">
                <div class="explanation-title">📝 Giải đáp & Phân tích</div>
                <div style="color: var(--text-main); font-size: 0.95rem; line-height: 1.6;" class="katex-render">${renderMarkdown(q.explanation)}</div>
                ${explMediaHtml}
            </div>` : (explMediaHtml && q.showExplanation !== false ? `<div class="explanation-box"><div class="explanation-title">📝 Media giải đáp</div>${explMediaHtml}</div>` : '')}
            ${q.expansion && q.showExpansion !== false ? `
            <div class="expansion-box">
                <div class="expansion-title">💡 Mở rộng kiến thức</div>
                <div style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;" class="katex-render">${renderMarkdown(q.expansion)}</div>
            </div>` : ''}
            ${showExplain ? `
            <div id="explain-slot-${q.id}">
                <button class="btn btn-sm" data-action="ask-why-wrong" data-question-id="${q.id}" style="margin-top:0.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;font-size:0.8rem;padding:0.4rem 0.9rem;border-radius:10px;cursor:pointer;transition:opacity 0.2s;" title="AI giải thích tại sao bạn sai">
                    🤖 Tại sao tôi sai?
                </button>
            </div>` : ''}`;

        container.appendChild(reviewItem);
    });

    // Wire data-action="ask-why-wrong" via single delegated listener.
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="ask-why-wrong"]');
        if (!btn) return;
        const qid = btn.dataset.questionId;
        if (qid && typeof onAskWhyWrong === 'function') {
            onAskWhyWrong(qid, btn);
        }
    });
}

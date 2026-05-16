// EasyRevise — Free-form question renderer with sub-parts and per-part media.

import { renderMarkdown } from '../shared/markdown.js';
import { buildVideoHtml } from './media.js';

/**
 * Save the entire free-form answer as a single text (no sub-parts case).
 */
export function saveFreeFormText(state, questionId, value, debouncedSave) {
    if (!state.userAnswers[questionId] || typeof state.userAnswers[questionId] !== 'object') {
        state.userAnswers[questionId] = { parts: {}, attachments: [] };
    }
    state.userAnswers[questionId].text = value;
    state.userAnswers[questionId].parts = { 0: value };
    if (debouncedSave) debouncedSave();
}

/**
 * Save a single sub-part value of a free-form question.
 */
export function saveFreeFormPart(state, questionId, partIndex, value, debouncedSave) {
    const current = state.userAnswers[questionId] || { parts: {}, attachments: [] };
    if (!current.parts) current.parts = {};
    current.parts[partIndex] = value;
    state.userAnswers[questionId] = current;
    if (debouncedSave) debouncedSave();
}

/**
 * Build per-sub-part media HTML (images + video). Optionally hidden behind a hint button.
 */
function buildPartMediaHtml(part) {
    const partImgs = [];
    if (part.images && part.images.length > 0) partImgs.push(...part.images);
    else if (part.image) partImgs.push(part.image);
    if (part.imageUrl && !partImgs.includes(part.imageUrl)) partImgs.push(part.imageUrl);

    const ZOOM_HANDLER = `this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.maxWidth='none';}`;

    let html = '';
    if (partImgs.length === 1) {
        html += `<div style="margin:0.5rem 0;"><img src="${partImgs[0]}" alt="" style="max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain;" onclick="${ZOOM_HANDLER}else{this.style='max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain';}"></div>`;
    } else if (partImgs.length > 1) {
        html += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.5rem 0;">`;
        partImgs.forEach((src, idx) => {
            html += `<img src="${src}" alt="Hình ${idx + 1}" style="max-width:180px;max-height:150px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="${ZOOM_HANDLER}else{this.style='max-width:180px;max-height:150px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0';}">`;
        });
        html += `</div>`;
    }
    if (part.video) html += buildVideoHtml(part.video);

    if (html && part.mediaAsHint) {
        html = `<div style="margin:0.5rem 0;" data-hint-wrap>
            <button class="hint-reveal-btn" data-action="reveal-part-hint"
                style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:0.3rem 0.8rem;border-radius:8px;cursor:pointer;font-size:0.82rem;">
                💡 Xem gợi ý
            </button>
            <div data-hint-content style="display:none;margin-top:0.4rem;">${html}</div>
        </div>`;
    } else if (html) {
        html = `<div style="margin:0.5rem 0;">${html}</div>`;
    }
    return html;
}

/**
 * Wire up "reveal hint" buttons inside a container (delegated, CSP-safe).
 */
function wireHintReveals(container) {
    container.querySelectorAll('[data-action="reveal-part-hint"]').forEach(btn => {
        if (btn._wired) return;
        btn._wired = true;
        btn.addEventListener('click', () => {
            const wrap = btn.closest('[data-hint-wrap]');
            const content = wrap?.querySelector('[data-hint-content]');
            if (content) {
                content.style.display = 'block';
                btn.style.display = 'none';
            }
        });
    });
}

/**
 * Render a free-form question (with optional sub-parts).
 */
export function renderFreeForm(question, elements, ctx) {
    const { instruction, questionText, optionGrid, essayArea, questionWrapper } = elements;
    const { state, handlers } = ctx;

    if (question.showInstruction !== false && question.instruction) {
        instruction.innerHTML = renderMarkdown(question.instruction);
        instruction.style.display = '';
    } else {
        instruction.innerHTML = '';
        instruction.style.display = 'none';
    }
    questionText.style.display = 'none';
    optionGrid.style.display = 'none';
    essayArea.style.display = 'none';
    if (handlers.renderMedia) handlers.renderMedia(question);

    const savedAns = state.userAnswers[question.id] || {};
    const parts = question.subParts || [];
    const attachments = savedAns.attachments || [];

    let container = document.getElementById('freeFormContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'freeFormContainer';
        questionWrapper.appendChild(container);
    }
    container.style.display = 'block';

    const mainPrompt = question.question || question.prompt || question.sectionPrompt || '';
    container.innerHTML = mainPrompt
        ? `<div style="font-size:1.05rem;font-weight:600;color:var(--text-main);margin-bottom:1.25rem;line-height:1.6;" class="katex-render">${renderMarkdown(mainPrompt)}</div>`
        : '';

    if (!parts.length) {
        const savedText = savedAns.text || savedAns[0] || '';
        const singleDiv = document.createElement('div');
        singleDiv.style.cssText = 'margin-bottom:1.25rem;padding:1rem;background:var(--bg-input);border-radius:12px;border:1px solid var(--border);';
        const ta = document.createElement('textarea');
        ta.className = 'freeform-part-input';
        ta.rows = 4;
        ta.placeholder = 'Nhập câu trả lời...';
        ta.dataset.partIndex = 0;
        ta.value = savedText;
        ta.style.cssText = 'width:100%;padding:0.75rem 0.9rem;border:1.5px solid var(--border);border-radius:8px;background:white;font-size:0.95rem;font-family:inherit;color:var(--text-main);transition:border-color 0.15s;outline:none;resize:vertical;';
        ta.addEventListener('input', () => saveFreeFormText(state, question.id, ta.value, handlers.debouncedSave));
        ta.addEventListener('focus', () => ta.style.borderColor = 'var(--primary)');
        ta.addEventListener('blur', () => ta.style.borderColor = 'var(--border)');
        singleDiv.appendChild(ta);
        container.appendChild(singleDiv);
    }

    parts.forEach((part, i) => {
        const savedVal = (savedAns.parts && savedAns.parts[i] !== undefined) ? savedAns.parts[i] : '';
        const partDiv = document.createElement('div');
        partDiv.style.cssText = 'margin-bottom:1.25rem;padding:1rem;background:var(--bg-input);border-radius:12px;border:1px solid var(--border);';

        const partMediaHtml = buildPartMediaHtml(part);

        partDiv.innerHTML = `
            <div style="font-size:0.88rem;font-weight:700;color:var(--primary);margin-bottom:0.5rem;" class="katex-render">
                ${part.label ? `(${part.label})` : `Câu ${i + 1}`}
                ${part.question ? `<div style="font-weight:500;color:var(--text-main);margin-top:0.3rem;line-height:1.6;">${renderMarkdown(part.question)}</div>` : ''}
            </div>
            ${partMediaHtml}
            <input type="text" class="freeform-part-input" placeholder="Nhập đáp số hoặc câu trả lời..."
                value="${String(savedVal).replace(/"/g, '&quot;')}" data-part-index="${i}"
                style="width:100%;padding:0.55rem 0.8rem;border:1.5px solid var(--border);border-radius:8px;background:white;font-size:0.95rem;font-family:inherit;color:var(--text-main);transition:border-color 0.15s;outline:none;">`;
        container.appendChild(partDiv);

        // Wire input event (no inline oninput)
        const input = partDiv.querySelector(`input[data-part-index="${i}"]`);
        input.addEventListener('input', () => saveFreeFormPart(state, question.id, i, input.value, handlers.debouncedSave));
        input.addEventListener('focus', () => input.style.borderColor = 'var(--primary)');
        input.addEventListener('blur', () => input.style.borderColor = 'var(--border)');
    });

    wireHintReveals(container);

    // Upload zone (reuses essay upload zone CSS)
    let uploadZone = document.getElementById('freeFormUploadZone');
    if (!uploadZone) {
        uploadZone = document.createElement('div');
        uploadZone.id = 'freeFormUploadZone';
        container.appendChild(uploadZone);
    } else {
        container.appendChild(uploadZone);
    }
    renderFreeFormUpload(question.id, attachments, ctx);
}

/**
 * Render the upload zone for a free-form question.
 */
export function renderFreeFormUpload(questionId, attachments, ctx) {
    const zone = document.getElementById('freeFormUploadZone');
    if (!zone) return;

    zone.innerHTML = '';
    const area = document.createElement('div');
    area.className = 'essay-upload-area';
    area.style.marginTop = '0.75rem';

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem;font-weight:600;';
    hint.textContent = '📎 Đính kèm bài làm (tuỳ chọn) — có thể Ctrl+V ảnh trực tiếp';
    area.appendChild(hint);

    const list = document.createElement('div');
    list.className = 'essay-attach-list';
    attachments.forEach((url, i) => {
        const item = document.createElement('div');
        item.className = 'essay-attach-item';
        const isPdf = url.endsWith('.pdf');
        if (isPdf) {
            item.innerHTML = `<div class="essay-attach-pdf">📄 <a href="${url}" target="_blank" style="color:var(--primary);font-size:0.8rem;">PDF</a></div>`;
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'essay-attach-thumb';
            img.alt = `Ảnh ${i + 1}`;
            img.addEventListener('click', () => img.classList.toggle('zoomed'));
            item.appendChild(img);
        }
        const removeBtn = document.createElement('button');
        removeBtn.className = 'essay-attach-remove';
        removeBtn.title = 'Xóa';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => removeFreeFormAttachment(questionId, i, ctx));
        item.appendChild(removeBtn);
        list.appendChild(item);
    });
    area.appendChild(list);

    const label = document.createElement('label');
    label.className = 'essay-upload-btn';
    label.title = 'Tối đa 10MB - JPG/PNG/WebP/PDF';
    label.textContent = '📷 Thêm ảnh/PDF ';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await uploadFreeFormFile(questionId, file, ctx);
        e.target.value = '';
    });
    label.appendChild(fileInput);
    area.appendChild(label);

    if (attachments.length > 0) {
        const counter = document.createElement('span');
        counter.style.cssText = 'font-size:0.75rem;color:var(--text-muted);';
        counter.textContent = `${attachments.length} file`;
        area.appendChild(counter);
    }

    zone.appendChild(area);
}

/**
 * Upload a file for a free-form question.
 */
export async function uploadFreeFormFile(questionId, file, ctx) {
    const { state } = ctx;
    const zone = document.getElementById('freeFormUploadZone');
    if (zone) {
        zone.dataset.prevHtml = zone.innerHTML;
        zone.innerHTML = '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">⏳ Đang tải lên...</div>';
    }
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('examId', state.examId);
        const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        const code = unlocked[state.examId] || '';
        if (code) formData.append('code', code);

        const headers = {};
        const token = localStorage.getItem('easyrevise_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (code) headers['x-access-code'] = code;

        const res = await fetch('/api/upload-submission', { method: 'POST', headers, body: formData });
        if (!res.ok) {
            const e = await res.json();
            throw new Error(e.error || 'Upload thất bại');
        }
        const { url } = await res.json();

        const current = state.userAnswers[questionId] || { parts: {}, attachments: [] };
        if (!current.attachments) current.attachments = [];
        current.attachments.push(url);
        state.userAnswers[questionId] = current;
        if (ctx.handlers.saveProgress) ctx.handlers.saveProgress();
        renderFreeFormUpload(questionId, current.attachments, ctx);
    } catch (err) {
        (window.notify?.error || alert)('❌ ' + err.message);
        if (zone && zone.dataset.prevHtml) zone.innerHTML = zone.dataset.prevHtml;
    }
}

/**
 * Remove an attachment from a free-form question's saved answer.
 */
export function removeFreeFormAttachment(questionId, idx, ctx) {
    const { state } = ctx;
    const current = state.userAnswers[questionId];
    if (!current) return;
    current.attachments = (current.attachments || []).filter((_, i) => i !== idx);
    state.userAnswers[questionId] = current;
    if (ctx.handlers.saveProgress) ctx.handlers.saveProgress();
    renderFreeFormUpload(questionId, current.attachments, ctx);
}

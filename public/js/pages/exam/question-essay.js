// EasyRevise — Essay (writing-essay) question renderer + file upload helpers.

import { renderMarkdown } from '../shared/markdown.js';

/**
 * Render an essay question with cues + textarea + upload zone.
 */
export function renderEssay(question, elements, ctx) {
    const { instruction, questionText, essayArea, cuesList, essayInput } = elements;
    const { state, handlers } = ctx;

    const instr = question.instruction || '';
    instruction.innerHTML = instr ? renderMarkdown(instr) : '';
    instruction.style.display = instr ? '' : 'none';
    questionText.innerHTML = renderMarkdown(question.prompt || '');

    if (handlers.renderMedia) handlers.renderMedia(question);

    essayArea.style.display = 'block';
    const savedAns = state.userAnswers[question.id];
    essayInput.value = (typeof savedAns === 'object' && savedAns !== null) ? (savedAns.text || '') : (savedAns || '');

    cuesList.innerHTML = '';
    const cues = question.cues || [];
    cues.forEach(cue => {
        const li = document.createElement('li');
        li.textContent = cue;
        cuesList.appendChild(li);
    });
    const cuesWrapper = cuesList.parentElement;
    if (cuesWrapper) cuesWrapper.style.display = cues.length ? '' : 'none';

    let uploadZone = document.getElementById('essayUploadZone');
    if (!uploadZone) {
        uploadZone = document.createElement('div');
        uploadZone.id = 'essayUploadZone';
        essayArea.appendChild(uploadZone);
    }
    const attachments = (typeof savedAns === 'object' && savedAns?.attachments) ? savedAns.attachments : [];
    renderEssayUploadZone(question.id, attachments, ctx);
}

/**
 * Render the file upload zone for an essay question.
 */
export function renderEssayUploadZone(questionId, attachments, ctx) {
    const zone = document.getElementById('essayUploadZone');
    if (!zone) return;

    zone.innerHTML = '';
    const area = document.createElement('div');
    area.className = 'essay-upload-area';

    const list = document.createElement('div');
    list.className = 'essay-attach-list';
    attachments.forEach((url, i) => {
        const item = document.createElement('div');
        item.className = 'essay-attach-item';
        const isPdf = url.endsWith('.pdf');
        if (isPdf) {
            item.innerHTML = `<div class="essay-attach-pdf">📄 <a href="${url}" target="_blank" style="color:var(--primary);font-size:0.8rem;">PDF bài làm</a></div>`;
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'essay-attach-thumb';
            img.alt = `Ảnh bài làm ${i + 1}`;
            img.addEventListener('click', () => img.classList.toggle('zoomed'));
            item.appendChild(img);
        }
        const removeBtn = document.createElement('button');
        removeBtn.className = 'essay-attach-remove';
        removeBtn.title = 'Xóa';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => removeEssayAttachment(questionId, i, ctx));
        item.appendChild(removeBtn);
        list.appendChild(item);
    });
    area.appendChild(list);

    const label = document.createElement('label');
    label.className = 'essay-upload-btn';
    label.title = 'Tối đa 10MB - JPG/PNG/WebP/PDF';
    label.textContent = '📷 Thêm ảnh/PDF bài làm ';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,application/pdf';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await uploadSubmissionFile(questionId, file, ctx);
        e.target.value = '';
    });
    label.appendChild(fileInput);
    area.appendChild(label);

    if (attachments.length > 0) {
        const counter = document.createElement('span');
        counter.style.cssText = 'font-size:0.75rem;color:var(--text-muted);';
        counter.textContent = `${attachments.length} file đính kèm`;
        area.appendChild(counter);
    }

    zone.appendChild(area);
}

/**
 * Handle paste event on essay input — uploads pasted image.
 */
export async function handleEssayPaste(event, ctx) {
    if (event._easyrevisePasteHandled) return;
    const { state, handlers } = ctx;
    const q = state.questionsList[state.currentQuestionIndex];
    if (!q || (!q.isEssay && !q.isFreeForm)) return;

    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;

    event._easyrevisePasteHandled = true;
    event.preventDefault();
    const namedFile = new File([file], `pasted-${Date.now()}.${(file.type.split('/')[1] || 'png')}`, { type: file.type });

    if (q.isFreeForm && handlers.uploadFreeFormFile) {
        await handlers.uploadFreeFormFile(q.id, namedFile);
    } else {
        await uploadSubmissionFile(q.id, namedFile, ctx);
    }
}

/**
 * Upload a file for an essay question to the server.
 */
export async function uploadSubmissionFile(questionId, file, ctx) {
    const { state } = ctx;
    const zone = document.getElementById('essayUploadZone');
    if (zone) {
        zone.dataset.prevHtml = zone.innerHTML;
        zone.innerHTML = '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">⏳ Đang tải lên...</div>';
    }
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('examId', state.examId);
        formData.append('questionId', questionId);
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

        const current = state.userAnswers[questionId];
        let entry = (typeof current === 'object' && current !== null)
            ? current
            : { text: (typeof current === 'string' ? current : ''), attachments: [] };
        if (!entry.attachments) entry.attachments = [];
        entry.attachments.push(url);
        state.userAnswers[questionId] = entry;
        if (ctx.handlers.saveProgress) ctx.handlers.saveProgress();
        renderEssayUploadZone(questionId, entry.attachments, ctx);
    } catch (err) {
        alert('❌ ' + err.message);
        if (zone && zone.dataset.prevHtml) zone.innerHTML = zone.dataset.prevHtml;
    }
}

/**
 * Remove an attachment from an essay question's saved answer.
 */
export function removeEssayAttachment(questionId, idx, ctx) {
    const { state } = ctx;
    const current = state.userAnswers[questionId];
    if (!current || typeof current !== 'object') return;
    current.attachments = current.attachments.filter((_, i) => i !== idx);
    state.userAnswers[questionId] = current;
    if (ctx.handlers.saveProgress) ctx.handlers.saveProgress();
    renderEssayUploadZone(questionId, current.attachments, ctx);
}

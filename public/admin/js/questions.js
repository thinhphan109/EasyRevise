// ========================
// questions.js — Question modal, images, OCR, paste, save, delete, bulk
// ========================

function showAddQuestionModal() {
    editingQuestionId = null; questionImageUrl = null; explanationImageUrl = null; fillBlanks = [];
    questionImages = []; optionImages = [null, null, null, null]; explanationImages = [];
    freeformSubParts = [];
    document.getElementById('modalQuestionTitle').textContent = 'Thêm câu hỏi';
    ['inputQuestionText', 'inputOptA', 'inputOptB', 'inputOptC', 'inputOptD', 'inputExplanation', 'inputExpansion', 'inputFreeformAnswer', 'inputQuestionVideo', 'inputExplanationVideo', 'inputQuestionAttachment'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.querySelector('input[name="correctOpt"][value="0"]').checked = true;
    document.getElementById('questionImageContainer').style.display = 'none'; document.getElementById('questionImagePreview').textContent = '';
    document.getElementById('explanationImageContainer').style.display = 'none'; document.getElementById('explanationImagePreview').textContent = '';
    document.getElementById('toggleMediaAsHint').checked = false;
    document.getElementById('toggleShowExplanation').checked = true;
    document.getElementById('toggleShowExpansion').checked = true;
    document.getElementById('ocrPreviewImg').style.display = 'none';
    renderMultiImagePreviews();
    renderOptionImagePreviews();
    renderExplanationImagePreviews();
    const isFreeform = currentSectionType === 'free-form';
    const isFillBlank = currentSectionType === 'fill-in-blank';
    document.getElementById('mcOptionsGroup').style.display = (!isFreeform && !isFillBlank) ? 'block' : 'none';
    document.getElementById('freeformAnswerGroup').style.display = isFreeform ? 'block' : 'none';
    document.getElementById('fillBlankGroup').style.display = isFillBlank ? 'block' : 'none';
    if (isFillBlank) renderBlankAnswers();
    if (isFreeform) renderFreeformSubParts();
    openModal('modalQuestion');
}

function editQuestion(qId) {
    editingQuestionId = qId;
    const section = currentExamData.sections.find(s => s.id === currentSectionId);
    const q = section.questions.find(q => String(q.id) === String(qId));
    if (!q) return;
    document.getElementById('modalQuestionTitle').textContent = 'Sửa câu hỏi';
    document.getElementById('inputQuestionText').value = q.question;
    const isFreeform = currentSectionType === 'free-form';
    const isFillBlank = currentSectionType === 'fill-in-blank';
    document.getElementById('mcOptionsGroup').style.display = (!isFreeform && !isFillBlank) ? 'block' : 'none';
    document.getElementById('freeformAnswerGroup').style.display = isFreeform ? 'block' : 'none';
    document.getElementById('fillBlankGroup').style.display = isFillBlank ? 'block' : 'none';
    if (isFillBlank) { fillBlanks = q.blanks ? JSON.parse(JSON.stringify(q.blanks)) : []; renderBlankAnswers(); }
    else if (isFreeform) {
        document.getElementById('inputFreeformAnswer').value = q.sampleAnswer || q.answer || '';
        freeformSubParts = Array.isArray(q.subParts) ? JSON.parse(JSON.stringify(q.subParts)) : [];
        renderFreeformSubParts();
        fillBlanks = [];
    }
    else {
        fillBlanks = [];
        document.getElementById('inputOptA').value = (q.options || [])[0] || '';
        document.getElementById('inputOptB').value = (q.options || [])[1] || '';
        document.getElementById('inputOptC').value = (q.options || [])[2] || '';
        document.getElementById('inputOptD').value = (q.options || [])[3] || '';
        const r = document.querySelector(`input[name="correctOpt"][value="${q.correctAnswer}"]`);
        if (r) r.checked = true;
    }
    document.getElementById('inputExplanation').value = q.explanation || '';
    document.getElementById('inputExpansion').value = q.expansion || '';
    questionImageUrl = q.image || null;
    if (questionImageUrl) { document.getElementById('questionImageImg').src = questionImageUrl; document.getElementById('questionImageContainer').style.display = 'inline-block'; } else { document.getElementById('questionImageContainer').style.display = 'none'; }
    document.getElementById('inputQuestionVideo').value = q.video || '';
    document.getElementById('toggleMediaAsHint').checked = !!q.mediaAsHint;
    document.getElementById('toggleShowExplanation').checked = q.showExplanation !== false;
    document.getElementById('toggleShowExpansion').checked = q.showExpansion !== false;
    explanationImageUrl = q.explanationImage || null;
    if (explanationImageUrl) { document.getElementById('explanationImageImg').src = explanationImageUrl; document.getElementById('explanationImageContainer').style.display = 'inline-block'; } else { document.getElementById('explanationImageContainer').style.display = 'none'; }
    document.getElementById('inputExplanationVideo').value = q.explanationVideo || '';
    const attachEl = document.getElementById('inputQuestionAttachment');
    if (attachEl) attachEl.value = q.attachment || '';
    document.getElementById('ocrPreviewImg').style.display = 'none';
    questionImages = Array.isArray(q.images) ? [...q.images] : [];
    optionImages = Array.isArray(q.optionImages) ? [...q.optionImages] : [null, null, null, null];
    while (optionImages.length < 4) optionImages.push(null);
    explanationImages = Array.isArray(q.explanationImages) ? [...q.explanationImages] : [];
    renderMultiImagePreviews();
    renderOptionImagePreviews();
    renderExplanationImagePreviews();
    openModal('modalQuestion');
}

function renderBlankAnswers() {
    const c = document.getElementById('blankAnswerList');
    if (!c) return;
    if (!fillBlanks.length) { c.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">Chưa có ô trống. Nhấn "+ Thêm ô".</p>'; return; }
    c.innerHTML = fillBlanks.map((b, i) => {
        const isDropdown = b.type === 'dropdown';
        const isNumeric = b.type === 'float' || b.type === 'fraction';
        const alts = (b.alternatives || []).join('\n');
        const opts = (b.dropdownOptions || []).join('\n');
        return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:0.6rem 0.75rem;margin-bottom:0.6rem;background:var(--bg-input);">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;">
                <span style="font-weight:700;font-size:0.82rem;color:var(--primary);min-width:20px;">_${i + 1}</span>
                <input class="form-input" value="${b.answer || ''}" placeholder="Đáp án đúng" oninput="fillBlanks[${i}].answer=this.value" style="flex:1;">
                <select class="form-select" onchange="fillBlanks[${i}].type=this.value;renderBlankAnswers()" style="max-width:100px;padding:0.4rem 0.5rem;">
                    <option value="text" ${b.type === 'text' ? 'selected' : ''}>Text</option>
                    <option value="int" ${b.type === 'int' ? 'selected' : ''}>Số ng.</option>
                    <option value="float" ${b.type === 'float' ? 'selected' : ''}>Số th.</option>
                    <option value="fraction" ${b.type === 'fraction' ? 'selected' : ''}>Phân số</option>
                    <option value="dropdown" ${b.type === 'dropdown' ? 'selected' : ''}>Dropdown</option>
                </select>
                <label style="display:flex;align-items:center;gap:0.25rem;font-size:0.72rem;color:var(--text-muted);white-space:nowrap;" title="Phân biệt hoa/thường">
                    <input type="checkbox" ${b.caseSensitive ? 'checked' : ''} onchange="fillBlanks[${i}].caseSensitive=this.checked" style="width:14px;height:14px;">Aa
                </label>
                <button class="btn btn-sm btn-danger" onclick="removeBlankAnswer(${i})" style="padding:0.25rem 0.5rem;">✕</button>
            </div>
            ${isDropdown ? `<div style="margin-top:0.35rem;">
                <label style="font-size:0.72rem;font-weight:600;color:var(--text-muted);">Các lựa chọn (mỗi dòng 1):</label>
                <textarea class="form-input" rows="3" placeholder="go\ngoes\nwent\ngoing" oninput="fillBlanks[${i}].dropdownOptions=this.value.split('\\n').filter(x=>x.trim())"
                    style="font-size:0.85rem;margin-top:0.25rem;">${opts}</textarea>
            </div>` : ''}
            ${(b.type === 'text' || isDropdown) ? `<div style="margin-top:0.35rem;">
                <label style="font-size:0.72rem;font-weight:600;color:var(--text-muted);">Đáp án thay thế (mỗi dòng 1, tùy chọn):</label>
                <input class="form-input" value="${alts}" placeholder="VD: walks" oninput="fillBlanks[${i}].alternatives=this.value.split('\\n').map(x=>x.trim()).filter(x=>x)"
                    style="font-size:0.85rem;margin-top:0.25rem;">
            </div>` : ''}
            ${isNumeric ? `<div style="margin-top:0.35rem;display:flex;align-items:center;gap:0.5rem;">
                <label style="font-size:0.72rem;font-weight:600;color:var(--text-muted);white-space:nowrap;">Sai số chấp nhận:</label>
                <input class="form-input" type="number" step="0.001" min="0" value="${b.tolerance || (b.type === 'fraction' ? 0.001 : 0.01)}" placeholder="0.01"
                    oninput="fillBlanks[${i}].tolerance=parseFloat(this.value)||0.01" style="max-width:100px;font-size:0.85rem;">
            </div>` : ''}
        </div>`;
    }).join('');
}

function addBlankAnswer() {
    fillBlanks.push({ index: fillBlanks.length, answer: '', type: 'text' });
    renderBlankAnswers();
}

function removeBlankAnswer(i) {
    fillBlanks.splice(i, 1);
    fillBlanks.forEach((b, idx) => b.index = idx);
    renderBlankAnswers();
}

function renderFreeformSubParts() {
    const c = document.getElementById('freeformSubPartList');
    if (!c) return;
    if (!freeformSubParts.length) {
        c.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">Chưa có ý nhỏ. Câu sẽ hiển thị một ô trả lời chung.</p>';
        return;
    }
    c.innerHTML = freeformSubParts.map((part, i) => `
        <div style="border:1px solid var(--border);border-radius:12px;padding:0.75rem;margin-bottom:0.7rem;background:var(--bg-input);">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                <span style="font-weight:800;color:var(--primary);font-size:0.82rem;min-width:36px;">Ý ${i + 1}</span>
                <input class="form-input" value="${escapeHtml(part.label || '')}" placeholder="Nhãn: a), b), Câu 1..."
                    oninput="freeformSubParts[${i}].label=this.value" style="max-width:150px;font-size:0.85rem;">
                <input class="form-input" type="number" min="1" max="20" step="0.5" value="${part.maxScore || ''}" placeholder="Điểm"
                    oninput="freeformSubParts[${i}].maxScore=parseFloat(this.value)||undefined" style="max-width:86px;font-size:0.85rem;">
                <button type="button" class="btn btn-sm btn-danger" onclick="removeFreeformSubPart(${i})" style="padding:0.25rem 0.55rem;">✕</button>
            </div>
            <textarea class="form-textarea" rows="2" placeholder="Nội dung yêu cầu của ý này..."
                oninput="freeformSubParts[${i}].prompt=this.value" style="font-size:0.86rem;min-height:70px;">${escapeHtml(part.prompt || part.question || '')}</textarea>
            <textarea class="form-textarea" rows="2" placeholder="Đáp án mẫu / tiêu chí riêng cho ý này (tuỳ chọn)"
                oninput="freeformSubParts[${i}].sampleAnswer=this.value" style="font-size:0.82rem;min-height:64px;margin-top:0.45rem;">${escapeHtml(part.sampleAnswer || '')}</textarea>
        </div>`).join('');
}

function addFreeformSubPart() {
    freeformSubParts.push({ label: '', prompt: '', sampleAnswer: '', maxScore: undefined });
    renderFreeformSubParts();
}

function removeFreeformSubPart(i) {
    freeformSubParts.splice(i, 1);
    renderFreeformSubParts();
}

// Image helpers
async function uploadImageFile(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    if (data.url) { questionImageUrl = data.url; document.getElementById('questionImageImg').src = data.url; document.getElementById('questionImageContainer').style.display = 'inline-block'; document.getElementById('questionImagePreview').textContent = '✅ Đã tải ảnh'; }
}

function removeMainQuestionImage() {
    questionImageUrl = null;
    document.getElementById('questionImageContainer').style.display = 'none';
    document.getElementById('questionImagePreview').textContent = '';
    document.getElementById('questionImageInput').value = '';
}

function removeMainExplanationImage() {
    explanationImageUrl = null;
    document.getElementById('explanationImageContainer').style.display = 'none';
    document.getElementById('explanationImagePreview').textContent = '';
}

async function uploadSingleImage(file) {
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    return data.url || null;
}

async function addQuestionImage(file) {
    if (!file) return;
    const url = await uploadSingleImage(file);
    if (url) { questionImages.push(url); renderMultiImagePreviews(); }
}

function removeQuestionImage(idx) { questionImages.splice(idx, 1); renderMultiImagePreviews(); }

function renderMultiImagePreviews() {
    const c = document.getElementById('multiImageList');
    if (!c) return;
    if (!questionImages.length) { c.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Chưa có ảnh</span>'; return; }
    c.innerHTML = questionImages.map((url, i) => `
        <div style="position:relative;display:inline-block;margin:0.25rem;padding:3px;">
            <img src="${url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">
            <button type="button" onclick="event.stopPropagation();removeQuestionImage(${i})" style="position:absolute;top:0;right:0;background:#dc2626;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:0.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:2;line-height:1;" title="Xóa ảnh">×</button>
        </div>`).join('');
}

async function uploadOptionImage(idx, file) {
    if (!file) return;
    const url = await uploadSingleImage(file);
    if (url) { optionImages[idx] = url; renderOptionImagePreviews(); }
}

function removeOptionImage(idx) { optionImages[idx] = null; renderOptionImagePreviews(); }

function renderOptionImagePreviews() {
    ['A', 'B', 'C', 'D'].forEach((label, i) => {
        const c = document.getElementById(`optionImgPreview${label}`);
        if (!c) return;
        if (optionImages[i]) {
            c.innerHTML = `<div style="position:relative;display:inline-block;padding:2px;">
                <img src="${optionImages[i]}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">
                <button type="button" onclick="event.stopPropagation();removeOptionImage(${i})" style="position:absolute;top:0;right:0;background:#dc2626;color:white;border:none;border-radius:50%;width:18px;height:18px;font-size:0.6rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:2;" title="Xóa ảnh">×</button>
            </div>`;
        } else { c.innerHTML = ''; }
    });
}

async function addExplanationImage(file) {
    if (!file) return;
    const url = await uploadSingleImage(file);
    if (url) { explanationImages.push(url); renderExplanationImagePreviews(); }
}

function removeExplanationImage(idx) { explanationImages.splice(idx, 1); renderExplanationImagePreviews(); }

function renderExplanationImagePreviews() {
    const c = document.getElementById('explanationMultiImageList');
    if (!c) return;
    if (!explanationImages.length) { c.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Chưa có ảnh</span>'; return; }
    c.innerHTML = explanationImages.map((url, i) => `
        <div style="position:relative;display:inline-block;margin:0.25rem;padding:3px;">
            <img src="${url}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">
            <button type="button" onclick="event.stopPropagation();removeExplanationImage(${i})" style="position:absolute;top:0;right:0;background:#dc2626;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:0.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:2;line-height:1;" title="Xóa ảnh">×</button>
        </div>`).join('');
}

async function uploadQuestionImage(event) {
    const file = event.target.files[0]; if (!file) return;
    await uploadImageFile(file);
}

// Insert image markdown at cursor
function insertInlineImage(ta, url) {
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const imgMd = `\n![](${url})\n`;
    ta.value = ta.value.substring(0, start) + imgMd + ta.value.substring(end);
    ta.setSelectionRange(start + imgMd.length, start + imgMd.length);
    ta.focus();
}

async function uploadExplanationImage(event) {
    const file = event.target.files[0]; if (!file) return;
    const formData = new FormData(); formData.append('image', file);
    const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
    const data = await res.json();
    if (data.url) { explanationImageUrl = data.url; document.getElementById('explanationImageImg').src = data.url; document.getElementById('explanationImageContainer').style.display = 'inline-block'; document.getElementById('explanationImagePreview').textContent = '✅ Đã tải ảnh'; }
}

async function pasteImageForOCR(file) {
    if (!file) return;
    const status = document.getElementById('ocrStatus');
    const previewImg = document.getElementById('ocrPreviewImg');
    const dropZone = document.getElementById('ocrDropZone');
    const objectUrl = URL.createObjectURL(file);
    previewImg.src = objectUrl;
    previewImg.style.display = 'block';
    if (dropZone) dropZone.textContent = '⏳ AI đang đọc ảnh...';
    if (status) status.textContent = '⏳ Đang xử lý...';
    try {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/api/admin/ocr', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: formData });
        const data = await res.json();
        URL.revokeObjectURL(objectUrl);
        if (data.error) {
            if (status) status.textContent = '❌ ' + data.error;
            if (dropZone) dropZone.textContent = '📋 Kéo thả hoặc click để chọn ảnh (hỗ trợ Ctrl+V)';
            return;
        }
        const targetId = document.getElementById('ocrTargetField')?.value || 'inputQuestionText';
        const targetEl = document.getElementById(targetId);
        if (targetEl) { targetEl.value = (targetEl.value ? targetEl.value + '\n' : '') + data.text; targetEl.focus(); }
        if (status) status.textContent = '✅ Đã điền!';
        setTimeout(() => { if (status) status.textContent = ''; }, 3000);
        if (dropZone) dropZone.textContent = '📋 Kéo thả hoặc click để chọn ảnh (hỗ trợ Ctrl+V)';
    } catch (err) {
        URL.revokeObjectURL(objectUrl);
        if (status) status.textContent = '❌ Lỗi kết nối';
        if (dropZone) dropZone.textContent = '📋 Kéo thả hoặc click để chọn ảnh (hỗ trợ Ctrl+V)';
    }
}

async function saveQuestion() {
    const body = {
        question: document.getElementById('inputQuestionText').value,
        explanation: document.getElementById('inputExplanation').value,
        expansion: document.getElementById('inputExpansion').value,
        image: questionImageUrl,
        images: [...questionImages],
        optionImages: [...optionImages],
        explanationImages: [...explanationImages],
        video: document.getElementById('inputQuestionVideo').value.trim() || null,
        mediaAsHint: document.getElementById('toggleMediaAsHint').checked,
        showExplanation: document.getElementById('toggleShowExplanation').checked,
        showExpansion: document.getElementById('toggleShowExpansion').checked,
        explanationImage: explanationImageUrl,
        explanationVideo: document.getElementById('inputExplanationVideo').value.trim() || null,
        attachment: document.getElementById('inputQuestionAttachment')?.value?.trim() || null
    };
    if (currentSectionType === 'fill-in-blank') {
        body.type = 'fill-in-blank';
        body.blanks = fillBlanks.map((b, i) => ({
            index: i, answer: b.answer, type: b.type || 'text',
            dropdownOptions: b.dropdownOptions || [],
            alternatives: b.alternatives || [],
            caseSensitive: !!b.caseSensitive,
            tolerance: b.tolerance || undefined
        }));
    } else if (currentSectionType === 'free-form') {
        body.answer = document.getElementById('inputFreeformAnswer').value;
        body.sampleAnswer = body.answer;
        body.subParts = freeformSubParts
            .map((p, i) => ({
                id: p.id || `part_${i + 1}`,
                label: (p.label || '').trim(),
                prompt: (p.prompt || p.question || '').trim(),
                sampleAnswer: (p.sampleAnswer || '').trim(),
                maxScore: p.maxScore || undefined
            }))
            .filter(p => p.label || p.prompt || p.sampleAnswer);
    } else {
        body.correctAnswer = parseInt(document.querySelector('input[name="correctOpt"]:checked').value);
        body.options = [document.getElementById('inputOptA').value, document.getElementById('inputOptB').value, document.getElementById('inputOptC').value, document.getElementById('inputOptD').value];
    }
    try {
        let result;
        if (editingQuestionId) result = await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${editingQuestionId}`, 'PUT', body);
        else result = await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions`, 'POST', body);
        if (result.error) { showToast('Lỗi lưu câu hỏi: ' + result.error, 'error'); return; }
        closeModal('modalQuestion'); currentExamData = await api(`/api/exams/${currentExamId}`); openSectionEditor(currentSectionId);
    } catch (err) { showToast('Lỗi kết nối: ' + err.message, 'error'); }
}

async function deleteQuestion(qId) { if (!(await customConfirm('⚠️ Xóa câu hỏi?', 'Câu hỏi này sẽ bị xóa vĩnh viễn.', 'Xóa câu', true))) return; await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${qId}`, 'DELETE'); currentExamData = await api(`/api/exams/${currentExamId}`); openSectionEditor(currentSectionId); }

// Bulk actions
function updateBulkToolbar() {
    const checked = document.querySelectorAll('.bulk-q-check:checked');
    const toolbar = document.getElementById('bulkToolbar');
    const count = document.getElementById('bulkCount');
    if (checked.length > 0) { toolbar.style.display = 'flex'; count.textContent = `Đã chọn ${checked.length} câu:`; }
    else { toolbar.style.display = 'none'; }
}

async function bulkDeleteQuestions() {
    const checked = [...document.querySelectorAll('.bulk-q-check:checked')];
    if (!checked.length) return;
    const ok = await customConfirm('⚠️ Xóa hàng loạt?', `Bạn sắp xóa <strong>${checked.length} câu hỏi</strong>. Không thể hoàn tác!`, 'Xóa tất cả', true);
    if (!ok) return;
    for (const cb of checked) { await api(`/api/exams/${currentExamId}/sections/${currentSectionId}/questions/${cb.value}`, 'DELETE'); }
    currentExamData = await api(`/api/exams/${currentExamId}`);
    openSectionEditor(currentSectionId);
}

// Ctrl+V paste image support
document.addEventListener('paste', async (e) => {
    if (!document.getElementById('modalQuestion').classList.contains('active')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) break;
            const focusedId = document.activeElement?.id || '';
            if (focusedId === 'inputExplanation' || focusedId === 'inputExpansion') {
                const url = await uploadSingleImage(file);
                if (url) insertInlineImage(document.getElementById(focusedId), url);
            } else if (focusedId === 'inputQuestion' || focusedId === 'inputQuestionText') {
                const url = await uploadSingleImage(file);
                if (url) { questionImages.push(url); renderMultiImagePreviews(); }
            } else {
                await pasteImageForOCR(file);
            }
            break;
        }
    }
});

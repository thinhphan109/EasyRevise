// ========================
// submissions.js — Submissions list, CSV export, AI grade, review, bulk select
// ========================

// Bulk-select state — keys are `${examId}::${userId}::${completedAt}`
const _bulkSelected = new Set();
let _lastSubmissions = [];
function _bulkKey(s) { return `${s.examId}::${s.userId}::${s.completedAt || ''}`; }
function _bulkClear() { _bulkSelected.clear(); _bulkRenderToolbar(); }

async function loadSubmissions() {
    const examId = document.getElementById('submissionsExamFilter')?.value || '';
    const c = document.getElementById('submissionsContainer');
    c.innerHTML = renderSkeletonRows(4, 'table');

    const filterEl = document.getElementById('submissionsExamFilter');
    if (filterEl && filterEl.options.length <= 1) {
        try {
            const exams = await api('/api/exams');
            exams.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.id;
                opt.textContent = e.title;
                filterEl.appendChild(opt);
            });
        } catch (e) { /* ignore */ }
    }

    const url = examId ? `/api/admin/submissions?examId=${examId}` : '/api/admin/submissions';
    const submissions = await api(url);
    _lastSubmissions = submissions || [];
    const countEl = document.getElementById('submissionsCount');
    if (!submissions || !submissions.length) {
        c.innerHTML = renderEmptyState('inbox', 'Chưa có bài nộp tự luận', 'Bài nộp sẽ xuất hiện khi học sinh hoàn thành');
        if (countEl) countEl.textContent = '0 bài nộp';
        _bulkClear();
        return;
    }
    if (countEl) countEl.textContent = `${submissions.length} bài nộp`;

    // Drop stale selections that are no longer in the current dataset
    const currentKeys = new Set(submissions.map(_bulkKey));
    [..._bulkSelected].forEach(k => { if (!currentKeys.has(k)) _bulkSelected.delete(k); });

    c.innerHTML = `
        <div class="submission-bulk-toolbar" id="submissionBulkBar"></div>
        <div class="submission-csv-bar">
            <button class="btn btn-sm btn-success" onclick="exportSubmissionsCSV('${examId}')" style="gap:0.4rem;">📥 Tải CSV bảng điểm</button>
            <button class="btn btn-sm btn-ghost" onclick="submissionBulkSelectAll()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="20 6 9 17 4 12"/></svg>Chọn tất cả
            </button>
        </div>
        <div id="submissionsList">${renderSubmissions(submissions)}</div>`;
    _bulkRenderToolbar();
}

function exportSubmissionsCSV(examId) {
    const token = adminToken;
    const params = examId ? `examId=${examId}` : '';
    fetch(`/api/admin/submissions/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
    }).then(res => res.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ket_qua_${examId || 'all'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }).catch(err => showToast('Lỗi tải CSV: ' + err.message, 'error'));
}

function renderSubmissions(submissions) {
    return submissions.map((sub, si) => {
        const time = sub.completedAt ? new Date(sub.completedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
        const essayBlocks = sub.essays.map((essay, ei) => {
            const key = `${si}_${ei}`;
            const aiScore = essay.aiScore !== null && essay.aiScore !== undefined;
            const teacherScore = essay.teacherScore !== null && essay.teacherScore !== undefined;
            const aiStatus = essay.status || (aiScore ? 'graded' : 'pending');
            const statusMeta = aiStatus === 'graded'
                ? { cls: 'grade-ai', text: `🤖 AI: ${essay.aiScore}/${essay.aiMaxScore || 10}` }
                : aiStatus === 'error'
                    ? { cls: 'grade-pending', text: `⚠️ AI lỗi` }
                    : aiStatus === 'skipped'
                        ? { cls: 'grade-pending', text: `ℹ️ AI bỏ qua` }
                        : { cls: 'grade-pending', text: `⏳ Chờ AI chấm` };
            const attachImgs = (essay.attachments || []).map(url =>
                url.endsWith('.pdf')
                    ? `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">📄 PDF bài làm</a>`
                    : `<img src="${url}" onclick="window.open('${url}','_blank')" title="Xem ảnh lớn" alt="Ảnh bài làm">`
            ).join('');

            const typeMeta = essay.gradingType === 'fill-in-blank'
                ? { icon: '🔤', label: 'Điền chỗ trống', canAiGrade: false }
                : essay.gradingType === 'free-form'
                    ? { icon: '🧩', label: 'Bài tự luận theo ý', canAiGrade: true }
                    : { icon: '📝', label: 'Tự luận', canAiGrade: true };

            return `<div class="essay-review-box">
                <h4>${typeMeta.icon} ${escapeHtml(essay.sectionTitle) || typeMeta.label} <span style="font-size:.72rem;font-weight:800;color:var(--text-muted);background:rgba(148,163,184,.13);border-radius:999px;padding:.14rem .48rem;margin-left:.35rem;">${typeMeta.label}</span></h4>
                ${essay.prompt ? `<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">📌 ${escapeHtml(essay.prompt)}</p>` : ''}
                <div class="essay-student-text">${escapeHtml(essay.studentAnswer) || '<em style="color:var(--text-muted);">Không có nội dung gõ</em>'}</div>
                ${attachImgs ? `<div class="essay-attach-grid">${attachImgs}</div>` : ''}
                ${essay.sampleAnswer ? `<details style="margin-top:0.5rem;"><summary style="font-size:0.82rem;color:var(--text-muted);cursor:pointer;">📖 Xem đáp án mẫu</summary><div style="font-size:0.85rem;padding:0.75rem;background:#f0fdf4;border-radius:8px;margin-top:0.4rem;">${escapeHtml(essay.sampleAnswer)}</div></details>` : ''}

                <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
                    <span class="grade-badge ${statusMeta.cls}">${statusMeta.text}</span>
                    ${teacherScore ? `<span class="grade-badge grade-teacher">✅ GV: ${essay.teacherScore}/10</span>` : ''}
                </div>
                ${essay.aiError ? `<div style="margin-top:0.5rem;padding:0.65rem 0.75rem;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:0.82rem;color:#9a3412;"><strong>Trạng thái AI:</strong> ${escapeHtml(essay.aiError === 'NO_API_KEY' ? 'Chưa cấu hình API key chấm AI' : essay.aiError)}</div>` : ''}
                ${aiScore && essay.aiFeedback ? `<div style="margin-top:0.5rem;padding:0.75rem;background:#eef2ff;border-radius:8px;font-size:0.85rem;line-height:1.5;"><strong>AI nhận xét:</strong> ${renderMarkdown(escapeHtml(essay.aiFeedback))}${essay.aiBreakdown ? `<div style="margin-top:0.5rem;color:var(--text-muted);">${renderMarkdown(escapeHtml(essay.aiBreakdown))}</div>` : ''}</div>` : ''}
                ${essay.teacherFeedback ? `<div style="margin-top:0.5rem;padding:0.75rem;background:#f0fdf4;border-radius:8px;font-size:0.85rem;line-height:1.5;"><strong>GV nhận xét:</strong> ${renderMarkdown(escapeHtml(essay.teacherFeedback))}</div>` : ''}

                <div class="review-actions">
                    ${typeMeta.canAiGrade ? `<button class="btn btn-sm btn-info" id="aiGradeBtn_${key}"
                        onclick="aiGradeEssay('${sub.examId}','${sub.code || ''}','${sub.userId}','${essay.questionId}',${si},${ei},'${sub.completedAt || ''}')">
                        🤖 ${aiScore ? 'Chấm lại AI' : (aiStatus === 'error' || aiStatus === 'skipped' ? 'Thử lại AI' : 'AI chấm điểm')}
                    </button>` : `<span class="grade-badge grade-ai" title="Loại này đã được chấm tự động theo đáp án">⚙️ Tự chấm theo đáp án</span>`}
                    <input type="number" id="tscore_${key}" min="0" max="10" step="0.5"
                        placeholder="Điểm GV (0-10)"
                        value="${essay.teacherScore !== null && essay.teacherScore !== undefined ? essay.teacherScore : ''}"
                        style="width:120px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                    <input type="text" id="tfb_${key}" placeholder="Nhận xét của GV (tuỳ chọn)"
                        value="${escapeHtml(essay.teacherFeedback || '')}"
                        style="flex:1;min-width:160px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                    <button class="btn btn-sm btn-success"
                        onclick="reviewSubmission('${sub.examId}','${sub.code || ''}','${sub.userId}','${essay.questionId}','${key}','${sub.completedAt || ''}')">
                        💾 Lưu điểm GV
                    </button>
                </div>
                <div id="reviewStatus_${key}" style="font-size:0.8rem;color:var(--success);display:none;margin-top:0.3rem;"></div>
            </div>`;
        }).join('');

        const cardId = `subCard_${si}`;
        const codeArg = sub.code ? `'${sub.code}'` : 'null';
        const bulkKey = _bulkKey(sub);
        const isChecked = _bulkSelected.has(bulkKey);
        return `<div class="submission-card${isChecked ? ' is-bulk-selected' : ''}" data-bulk-key="${bulkKey}" style="overflow:hidden;">
            <div class="submission-card-header">
                <label class="submission-checkbox" onclick="event.stopPropagation()" title="Chọn bài nộp này">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="submissionBulkToggle('${bulkKey}', this.checked)" aria-label="Chọn bài nộp">
                    <span class="submission-checkbox-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
                </label>
                <div class="submission-card-clickable" onclick="(function(h){const b=document.getElementById('${cardId}');const open=b.style.display!=='none';b.style.display=open?'none':'block';h.querySelector('.sub-chevron').textContent=open?'▶':'▼';})(this.parentElement)">
                    <span class="sub-chevron" style="margin-top:0.2rem;font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">▶</span>
                    <div style="flex:1;min-width:0;">
                        <div class="submission-name"><span class="facehash-inline" data-name="${encodeURIComponent(sub.userId)}" data-size="24"></span> ${escapeHtml(sub.displayName || sub.userId)}</div>
                        <div class="submission-meta">🎫 ${sub.code ? `Mã: <strong>${escapeHtml(sub.code)}</strong>` : '<span style="color:var(--success);">🔓 Đề mở (không cần mã)</span>'} &nbsp;|&nbsp; 📝 ${escapeHtml(sub.examTitle)}</div>
                        <div class="submission-meta">⏰ Nộp: ${time} &nbsp;|&nbsp; 📊 MC: ${sub.mcScore !== null ? sub.mcScore + '/10' : '—'}</div>
                    </div>
                </div>
                <div class="submission-card-actions" onclick="event.stopPropagation()">
                    <span class="submission-meta-count">${sub.essays.length} mục</span>
                    <button class="btn-icon-danger" title="Xóa bài nộp (cả lịch sử user)" aria-label="Xóa bài nộp"
                        onclick="deleteAdminSubmission('${sub.examId}', '${sub.userId}', '${sub.completedAt}', ${codeArg}, '${escapeHtml(sub.displayName || sub.userId)}')">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                </div>
            </div>
            <div id="${cardId}" style="display:none;border-top:1px solid var(--border);margin-top:0.75rem;padding-top:0.75rem;">
                ${essayBlocks}
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// Bulk-select helpers
// ============================================================
window.submissionBulkToggle = function (key, checked) {
    if (checked) _bulkSelected.add(key);
    else _bulkSelected.delete(key);
    document.querySelector(`.submission-card[data-bulk-key="${key}"]`)?.classList.toggle('is-bulk-selected', checked);
    _bulkRenderToolbar();
};

window.submissionBulkSelectAll = function () {
    const allKeys = _lastSubmissions.map(_bulkKey);
    const allSelected = allKeys.every(k => _bulkSelected.has(k));
    if (allSelected) _bulkSelected.clear();
    else allKeys.forEach(k => _bulkSelected.add(k));
    document.querySelectorAll('.submission-card').forEach(card => {
        const k = card.getAttribute('data-bulk-key');
        const isOn = _bulkSelected.has(k);
        card.classList.toggle('is-bulk-selected', isOn);
        const cb = card.querySelector('.submission-checkbox input');
        if (cb) cb.checked = isOn;
    });
    _bulkRenderToolbar();
};

function _bulkRenderToolbar() {
    const bar = document.getElementById('submissionBulkBar');
    if (!bar) return;
    const n = _bulkSelected.size;
    if (n === 0) {
        bar.classList.remove('is-active');
        bar.innerHTML = '';
        _bulkUpdateFloating(false);
        return;
    }
    bar.classList.add('is-active');
    bar.innerHTML = `
        <div class="bulk-info">
            <span class="bulk-count">${n}</span>
            <span>bài nộp đã chọn</span>
        </div>
        <div class="bulk-actions">
            <button class="btn btn-sm btn-info" onclick="submissionBulkAiGrade()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>AI chấm
            </button>
            <button class="btn btn-sm btn-danger" onclick="submissionBulkDelete()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg>Xóa
            </button>
            <button class="btn btn-sm btn-ghost" onclick="submissionBulkClear()">Bỏ chọn</button>
        </div>`;
    _bulkUpdateFloating(true);
}

// ── Floating pinned bar — shows when sticky toolbar is off-screen ──
function _bulkEnsureFloating() {
    let bar = document.getElementById('submissionFloatingBar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'submissionFloatingBar';
        bar.className = 'submission-floating-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Thao tác nhanh trên bài nộp đã chọn');
        document.body.appendChild(bar);
    }
    return bar;
}

function _bulkUpdateFloating(hasSelection) {
    const fbar = _bulkEnsureFloating();
    if (!hasSelection) {
        fbar.classList.remove('is-visible');
        return;
    }
    const n = _bulkSelected.size;
    fbar.innerHTML = `
        <span class="float-count">${n}</span>
        <span class="float-label">đã chọn</span>
        <button type="button" class="float-btn-ai" title="AI chấm các bài đã chọn" aria-label="AI chấm" onclick="submissionBulkAiGrade()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>
        </button>
        <button type="button" class="float-btn-delete" title="Xóa các bài đã chọn" aria-label="Xóa" onclick="submissionBulkDelete()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
        <button type="button" class="float-btn-clear" title="Bỏ chọn" aria-label="Bỏ chọn" onclick="submissionBulkClear()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
    _bulkAttachStickyObserver(fbar);
}

let _bulkObserver = null;
function _bulkAttachStickyObserver(fbar) {
    const sticky = document.getElementById('submissionBulkBar');
    if (!sticky || !('IntersectionObserver' in window)) {
        // Fallback — always show when there's a selection
        fbar.classList.add('is-visible');
        return;
    }
    if (_bulkObserver) _bulkObserver.disconnect();
    _bulkObserver = new IntersectionObserver(entries => {
        const entry = entries[0];
        // Show floating bar when sticky toolbar is no longer fully visible
        const showFloat = !entry.isIntersecting;
        fbar.classList.toggle('is-visible', showFloat && _bulkSelected.size > 0);
    }, { threshold: [0, 1], rootMargin: '-12px 0px 0px 0px' });
    _bulkObserver.observe(sticky);
}

window.submissionBulkClear = function () {
    _bulkClear();
    document.querySelectorAll('.submission-card.is-bulk-selected').forEach(c => c.classList.remove('is-bulk-selected'));
    document.querySelectorAll('.submission-checkbox input:checked').forEach(cb => { cb.checked = false; });
};

window.submissionBulkDelete = async function () {
    const items = _lastSubmissions.filter(s => _bulkSelected.has(_bulkKey(s)));
    if (!items.length) return;
    const confirmFn = window.confirmPopup || ((opts) => Promise.resolve(confirm(opts.title)));
    const ok = await confirmFn({
        title: `Xóa ${items.length} bài nộp?`,
        message: `<strong>${items.length} bài nộp</strong> sẽ bị xóa khỏi danh sách admin và lịch sử học sinh. Không thể hoàn tác.`,
        allowHtml: true,
        confirmText: 'Xóa tất cả',
        cancelText: 'Hủy',
        danger: true
    });
    if (!ok) return;
    let done = 0, fail = 0, removed = 0, hist = 0;
    for (const s of items) {
        try {
            const r = await api('/api/admin/submissions', 'DELETE', { examId: s.examId, userId: s.userId, completedAt: s.completedAt, code: s.code || null });
            removed += r.removed || 0;
            hist += r.userHistoryRemoved || 0;
            done++;
        } catch (e) {
            fail++;
            console.warn('[bulk-delete]', e);
        }
    }
    showToast(`Đã xóa ${done} bài (${removed} submissions, ${hist} lịch sử)${fail ? ` · ${fail} lỗi` : ''}`, fail ? 'warning' : 'success');
    _bulkClear();
    await loadSubmissions();
    if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
};

window.submissionBulkAiGrade = async function () {
    const items = _lastSubmissions.filter(s => _bulkSelected.has(_bulkKey(s)));
    if (!items.length) return;
    const jobs = [];
    for (const sub of items) {
        for (const essay of (sub.essays || [])) {
            if (essay.gradingType === 'fill-in-blank') continue;
            jobs.push({ sub, essay });
        }
    }
    if (!jobs.length) { showToast('Không có bài tự luận nào trong các bài nộp đã chọn', 'warning'); return; }
    const confirmFn = window.confirmPopup || ((opts) => Promise.resolve(confirm(opts.title)));
    const ok = await confirmFn({
        title: `AI chấm ${jobs.length} bài?`,
        message: `Sẽ chấm lần lượt <strong>${jobs.length}</strong> bài tự luận từ <strong>${items.length}</strong> bài nộp đã chọn. Có thể mất vài phút.`,
        allowHtml: true,
        confirmText: 'Bắt đầu',
        cancelText: 'Hủy',
        type: 'info'
    });
    if (!ok) return;
    let done = 0, errors = 0;
    const bar = document.getElementById('submissionBulkBar');
    for (const { sub, essay } of jobs) {
        done++;
        if (bar) {
            const cnt = bar.querySelector('.bulk-count');
            if (cnt) cnt.textContent = `${done}/${jobs.length}`;
        }
        try {
            await api('/api/admin/ai-grade-essay', 'POST', {
                examId: sub.examId, code: sub.code, userId: sub.userId,
                questionId: essay.questionId,
                studentAnswer: essay.studentAnswer,
                attachments: essay.attachments || [],
                sampleAnswer: essay.sampleAnswer,
                prompt: essay.prompt,
                completedAt: sub.completedAt
            });
        } catch (e) { errors++; console.warn('[bulk-ai]', e); }
    }
    showToast(`AI chấm xong! ${done - errors}/${jobs.length} bài đã chấm${errors ? ` · ${errors} lỗi` : ''}`, errors ? 'warning' : 'success');
    await loadSubmissions();
};

// Admin delete: cascade removes from exam.openSubmissions / accessCodes.usedBy AND user's history
async function deleteAdminSubmission(examId, userId, completedAt, code, displayName) {
    const ok = await customConfirm(
        'Xóa bài nộp',
        `Bạn sắp xóa bài nộp của <strong>${displayName}</strong>.<br><br>Hành động này sẽ:<br>• Xóa khỏi danh sách bài nộp (admin)<br>• Xóa khỏi lịch sử làm bài của học sinh<br><br><strong style="color:var(--error);">Không thể hoàn tác.</strong>`,
        'Xóa vĩnh viễn'
    );
    if (!ok) return;
    try {
        const result = await api('/api/admin/submissions', 'DELETE', {
            examId, userId, completedAt, code: code || null
        });
        showToast(`Đã xóa (${result.removed} bài nộp, ${result.userHistoryRemoved} lịch sử user)`, 'success');
        await loadSubmissions();
        if (typeof loadAdminDashboard === 'function') loadAdminDashboard();
    } catch (err) {
        showToast('Lỗi xóa: ' + (err.message || err), 'error');
    }
}

async function aiGradeEssay(examId, code, userId, questionId, si, ei, completedAt = '') {
    const key = `${si}_${ei}`;
    const btn = document.getElementById(`aiGradeBtn_${key}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI đang chấm...'; }
    try {
        const subs = await api(`/api/admin/submissions?examId=${examId}`);
        const sub = subs.find(s => (s.code || '') === (code || '') && s.userId === userId && (!completedAt || s.completedAt === completedAt));
        const essay = sub ? sub.essays.find(e => e.questionId === questionId) : null;
        if (!essay) throw new Error('Không tìm thấy bài nộp');
        const result = await api('/api/admin/ai-grade-essay', 'POST', {
            examId, code, userId, questionId,
            studentAnswer: essay.studentAnswer,
            attachments: essay.attachments || [],
            sampleAnswer: essay.sampleAnswer,
            prompt: essay.prompt,
            completedAt
        });
        await loadSubmissions();
        const statusEl = document.getElementById(`reviewStatus_${key}`);
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = `✅ AI chấm: ${result.score}/${result.maxScore || 10}`; }
    } catch (err) {
        showToast('Lỗi AI chấm: ' + (err.message || err), 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🤖 AI chấm điểm'; }
    }
}

async function reviewSubmission(examId, code, userId, questionId, key, completedAt = '') {
    const scoreEl = document.getElementById(`tscore_${key}`);
    const fbEl = document.getElementById(`tfb_${key}`);
    const statusEl = document.getElementById(`reviewStatus_${key}`);
    const teacherScore = scoreEl ? scoreEl.value : null;
    const teacherFeedback = fbEl ? fbEl.value : '';
    try {
        await api('/api/admin/submissions/review', 'POST', {
            examId, code, userId, questionId,
            teacherScore: teacherScore !== '' ? parseFloat(teacherScore) : null,
            teacherFeedback,
            completedAt
        });
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = '✅ Đã lưu điểm giáo viên!'; }
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
    } catch (err) {
        showToast('Lỗi lưu điểm: ' + (err.message || err), 'error');
    }
}

// #11: Batch AI grade all ungraded essays
async function batchAiGradeAll() {
    const examId = document.getElementById('submissionsExamFilter')?.value || '';
    const url = examId ? `/api/admin/submissions?examId=${examId}` : '/api/admin/submissions';
    const btn = document.getElementById('batchAiGradeBtn');

    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Đang tải bài nộp...'; }

    try {
        const submissions = await api(url);
        if (!submissions || !submissions.length) {
            showToast('Không có bài nộp nào!', 'warning');
            if (btn) { btn.disabled = false; btn.innerHTML = 'AI Chấm tất cả'; }
            return;
        }

        // Collect ungraded essays
        const jobs = [];
        for (const sub of submissions) {
            for (const essay of (sub.essays || [])) {
                if (essay.gradingType === 'fill-in-blank') continue;
                if (essay.aiScore === null || essay.aiScore === undefined || essay.status === 'error' || essay.status === 'skipped') {
                    jobs.push({ sub, essay });
                }
            }
        }

        if (!jobs.length) {
            showToast('Tất cả bài đã được AI chấm rồi!', 'success');
            if (btn) { btn.disabled = false; btn.innerHTML = 'AI Chấm tất cả'; }
            return;
        }

        const ok = await customConfirm(
            'AI Chấm tất cả',
            `Tìm thấy <strong>${jobs.length}</strong> bài tự luận chưa chấm. AI sẽ chấm lần lượt (có thể mất vài phút).`,
            'Bắt đầu chấm'
        );
        if (!ok) { if (btn) { btn.disabled = false; btn.innerHTML = 'AI Chấm tất cả'; } return; }

        let done = 0, errors = 0;
        for (const { sub, essay } of jobs) {
            done++;
            if (btn) btn.innerHTML = `⏳ ${done}/${jobs.length}...`;

            try {
                await api('/api/admin/ai-grade-essay', 'POST', {
                    examId: sub.examId,
                    code: sub.code,
                    userId: sub.userId,
                    questionId: essay.questionId,
                    studentAnswer: essay.studentAnswer,
                    attachments: essay.attachments || [],
                    sampleAnswer: essay.sampleAnswer,
                    prompt: essay.prompt,
                    completedAt: sub.completedAt
                });
            } catch (e) {
                errors++;
                console.warn(`Batch grade error (${sub.userId}/${essay.questionId}):`, e);
            }
        }

        showToast(`Hoàn tất! ${done - errors}/${jobs.length} bài đã chấm.${errors ? ` (${errors} lỗi)` : ''}`, errors ? 'warning' : 'success');
        loadSubmissions();
    } catch (err) {
        showToast('Lỗi: ' + (err.message || err), 'error');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = 'AI Chấm tất cả'; }
}

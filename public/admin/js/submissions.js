// ========================
// submissions.js — Submissions list, CSV export, AI grade, review
// ========================

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
    const countEl = document.getElementById('submissionsCount');
    if (!submissions || !submissions.length) {
        c.innerHTML = renderEmptyState('inbox', 'Chưa có bài nộp tự luận', 'Bài nộp sẽ xuất hiện khi học sinh hoàn thành');
        if (countEl) countEl.textContent = '0 bài nộp';
        return;
    }
    if (countEl) countEl.textContent = `${submissions.length} bài nộp`;

    const csvBtn = document.createElement('div');
    csvBtn.style.cssText = 'margin-bottom:1rem;';
    csvBtn.innerHTML = `<button class="btn btn-sm btn-success" onclick="exportSubmissionsCSV('${examId}')" style="gap:0.4rem;">📥 Tải CSV bảng điểm</button>`;
    c.innerHTML = '';
    c.appendChild(csvBtn);
    const submissionsDiv = document.createElement('div');
    submissionsDiv.innerHTML = renderSubmissions(submissions);
    c.appendChild(submissionsDiv);
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
            const attachImgs = (essay.attachments || []).map(url =>
                url.endsWith('.pdf')
                    ? `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">📄 PDF bài làm</a>`
                    : `<img src="${url}" onclick="window.open('${url}','_blank')" title="Xem ảnh lớn" alt="Ảnh bài làm">`
            ).join('');

            return `<div class="essay-review-box">
                <h4>📝 ${escapeHtml(essay.sectionTitle) || 'Bài tự luận'}</h4>
                ${essay.prompt ? `<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem;">📌 ${escapeHtml(essay.prompt)}</p>` : ''}
                <div class="essay-student-text">${escapeHtml(essay.studentAnswer) || '<em style="color:var(--text-muted);">Không có nội dung gõ</em>'}</div>
                ${attachImgs ? `<div class="essay-attach-grid">${attachImgs}</div>` : ''}
                ${essay.sampleAnswer ? `<details style="margin-top:0.5rem;"><summary style="font-size:0.82rem;color:var(--text-muted);cursor:pointer;">📖 Xem đáp án mẫu</summary><div style="font-size:0.85rem;padding:0.75rem;background:#f0fdf4;border-radius:8px;margin-top:0.4rem;">${escapeHtml(essay.sampleAnswer)}</div></details>` : ''}

                <div style="margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
                    ${aiScore ? `<span class="grade-badge grade-ai">🤖 AI: ${essay.aiScore}/${essay.aiMaxScore || 10}</span>` : '<span class="grade-badge grade-pending">⏳ Chưa AI chấm</span>'}
                    ${teacherScore ? `<span class="grade-badge grade-teacher">✅ GV: ${essay.teacherScore}/10</span>` : ''}
                </div>
                ${aiScore && essay.aiFeedback ? `<div style="margin-top:0.5rem;padding:0.75rem;background:#eef2ff;border-radius:8px;font-size:0.85rem;line-height:1.5;"><strong>AI nhận xét:</strong> ${renderMarkdown(essay.aiFeedback)}</div>` : ''}
                ${essay.teacherFeedback ? `<div style="margin-top:0.5rem;padding:0.75rem;background:#f0fdf4;border-radius:8px;font-size:0.85rem;line-height:1.5;"><strong>GV nhận xét:</strong> ${renderMarkdown(essay.teacherFeedback)}</div>` : ''}

                <div class="review-actions">
                    <button class="btn btn-sm btn-info" id="aiGradeBtn_${key}"
                        onclick="aiGradeEssay('${sub.examId}','${sub.code}','${sub.userId}','${essay.questionId}',${si},${ei})">
                        🤖 ${aiScore ? 'Chấm lại AI' : 'AI chấm điểm'}
                    </button>
                    <input type="number" id="tscore_${key}" min="0" max="10" step="0.5"
                        placeholder="Điểm GV (0-10)"
                        value="${essay.teacherScore !== null && essay.teacherScore !== undefined ? essay.teacherScore : ''}"
                        style="width:120px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                    <input type="text" id="tfb_${key}" placeholder="Nhận xét của GV (tuỳ chọn)"
                        value="${essay.teacherFeedback || ''}"
                        style="flex:1;min-width:160px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:8px;font-size:0.85rem;">
                    <button class="btn btn-sm btn-success"
                        onclick="reviewSubmission('${sub.examId}','${sub.code}','${sub.userId}','${essay.questionId}','${key}')">
                        💾 Lưu điểm GV
                    </button>
                </div>
                <div id="reviewStatus_${key}" style="font-size:0.8rem;color:var(--success);display:none;margin-top:0.3rem;"></div>
            </div>`;
        }).join('');

        const cardId = `subCard_${si}`;
        return `<div class="submission-card" style="overflow:hidden;">
            <div onclick="(function(h){const b=document.getElementById('${cardId}');const open=b.style.display!=='none';b.style.display=open?'none':'block';h.querySelector('.sub-chevron').textContent=open?'▶':'▼';})(this)"
                 style="display:flex;align-items:flex-start;gap:0.75rem;cursor:pointer;user-select:none;">
                <span class="sub-chevron" style="margin-top:0.2rem;font-size:0.72rem;color:var(--text-muted);flex-shrink:0;">▶</span>
                <div style="flex:1;min-width:0;">
                    <div class="submission-name"><span class="facehash-inline" data-name="${encodeURIComponent(sub.userId)}" data-size="24"></span> ${escapeHtml(sub.displayName || sub.userId)}</div>
                    <div class="submission-meta">🎫 ${sub.code ? `Mã: <strong>${escapeHtml(sub.code)}</strong>` : '<span style="color:var(--success);">🔓 Đề mở (không cần mã)</span>'} &nbsp;|&nbsp; 📝 ${escapeHtml(sub.examTitle)}</div>
                    <div class="submission-meta">⏰ Nộp: ${time} &nbsp;|&nbsp; 📊 MC: ${sub.mcScore !== null ? sub.mcScore + '/10' : '—'}</div>
                </div>
                <span style="font-size:0.75rem;color:var(--text-muted);flex-shrink:0;margin-top:0.2rem;">${sub.essays.length} câu tự luận</span>
            </div>
            <div id="${cardId}" style="display:none;border-top:1px solid var(--border);margin-top:0.75rem;padding-top:0.75rem;">
                ${essayBlocks}
            </div>
        </div>`;
    }).join('');
}

async function aiGradeEssay(examId, code, userId, questionId, si, ei) {
    const key = `${si}_${ei}`;
    const btn = document.getElementById(`aiGradeBtn_${key}`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ AI đang chấm...'; }
    try {
        const subs = await api(`/api/admin/submissions?examId=${examId}`);
        const sub = subs.find(s => s.code === code && s.userId === userId);
        const essay = sub ? sub.essays.find(e => e.questionId === questionId) : null;
        if (!essay) throw new Error('Không tìm thấy bài nộp');
        const result = await api('/api/admin/ai-grade-essay', 'POST', {
            examId, code, userId, questionId,
            studentAnswer: essay.studentAnswer,
            attachments: essay.attachments || [],
            sampleAnswer: essay.sampleAnswer,
            prompt: essay.prompt
        });
        await loadSubmissions();
        const statusEl = document.getElementById(`reviewStatus_${key}`);
        if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = `✅ AI chấm: ${result.score}/${result.maxScore || 10}`; }
    } catch (err) {
        showToast('Lỗi AI chấm: ' + (err.message || err), 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🤖 AI chấm điểm'; }
    }
}

async function reviewSubmission(examId, code, userId, questionId, key) {
    const scoreEl = document.getElementById(`tscore_${key}`);
    const fbEl = document.getElementById(`tfb_${key}`);
    const statusEl = document.getElementById(`reviewStatus_${key}`);
    const teacherScore = scoreEl ? scoreEl.value : null;
    const teacherFeedback = fbEl ? fbEl.value : '';
    try {
        await api('/api/admin/submissions/review', 'POST', {
            examId, code, userId, questionId,
            teacherScore: teacherScore !== '' ? parseFloat(teacherScore) : null,
            teacherFeedback
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
                if (essay.aiScore === null || essay.aiScore === undefined) {
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
                    prompt: essay.prompt
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

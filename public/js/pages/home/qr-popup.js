/* ========================================
   EasyRevise — Home / QR Entry Popup
   Show exam info after QR scan / deep link
   ======================================== */

/**
 * Show QR entry popup with exam info and CTA
 * @param {string} code - Access code
 * @param {string} examId
 */
async function showQREntryPopup(code, examId) {
    // Remove existing if any
    document.getElementById('qrEntryPopup')?.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'qrEntryPopup';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = `
        <div class="modal-box qr-popup-card" style="max-width:480px;border-radius:24px;overflow:hidden;">
            <div class="qr-popup-header">
                <div class="qr-popup-eyebrow">✎ QR Kích Hoạt</div>
                <div id="qrPopupTitle" class="qr-popup-title">Đang tải...</div>
                <div id="qrPopupMeta" class="qr-popup-meta"></div>
                <div class="qr-popup-code">${code}</div>
            </div>
            <div id="qrPopupBody" class="qr-popup-body">
                <div class="text-center text-muted p-6">⏳ Đang tải thông tin...</div>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Fetch preview
    let data;
    try {
        const res = await fetch(`/api/exams/${examId}/preview-code`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi không rõ');
    } catch (err) {
        document.getElementById('qrPopupBody').innerHTML = `
            <div class="text-center p-4">
                <div style="font-size:2rem;margin-bottom:0.5rem;">⚠️</div>
                <div class="font-bold text-error mb-2">Mã không hợp lệ</div>
                <div class="text-sm text-muted">${err.message}</div>
                <button onclick="document.getElementById('qrEntryPopup').remove()" class="btn btn-ghost mt-4">Đóng</button>
            </div>`;
        return;
    }

    // Update header
    document.getElementById('qrPopupTitle').textContent = data.exam.title;
    const timeTxt = data.exam.timeLimit > 0 ? ` · ⏱ ${data.exam.timeLimit} phút` : '';
    document.getElementById('qrPopupMeta').textContent = `${data.exam.subject} — ${data.exam.year} · ${data.exam.totalQuestions} câu${timeTxt}`;

    // Build body
    const alreadyUnlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}')[examId];
    const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}')[examId];
    const hasHistory = data.history && data.history.length > 0;
    const hasInProgress = data.inProgress && data.inProgress.length > 0;

    let historyHtml = '';
    if (hasHistory) {
        historyHtml = `<div class="mb-4">
            <div class="text-xs font-bold text-muted mb-2" style="text-transform:uppercase;letter-spacing:0.5px;">📋 Lịch sử làm bài</div>
            ${data.history.slice(0, 3).map(h => {
            const score = h.score !== null && h.score !== undefined ? parseFloat(h.score) : null;
            const scoreCls = score === null ? 'is-muted' : score >= 8 ? 'is-success' : score >= 5 ? 'is-warning' : 'is-error';
            const scoreTxt = score !== null ? score + '/10' : '—';
            const time = h.completedAt ? new Date(h.completedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '';
            const mins = h.result ? Math.floor((h.result.timeSpent || 0) / 60) + ' phút' : '';
            const isOwn = currentUser && (h.userId === currentUser.id || h.displayName === currentUser.displayName);
            const delBtn = isOwn && h.completedAt ? `<button class="qr-history-delete" onclick="event.stopPropagation();window._qrDeleteHistory('${examId}','${encodeURIComponent(h.completedAt)}')" title="Xóa lịch sử này" aria-label="Xóa"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>` : '';
            return `<div class="history-item qr-history-item">
                    <div>
                        <div class="font-semibold text-sm">${h.displayName}</div>
                        <div class="text-xs text-muted">${time}${mins ? ' · ' + mins : ''}</div>
                    </div>
                    <div class="qr-history-right">
                        <span class="qr-history-score ${scoreCls}">${scoreTxt}</span>
                        ${delBtn}
                    </div>
                </div>`;
        }).join('')}
            ${data.history.length > 3 ? `<div class="text-xs text-muted" style="text-align:right;">+${data.history.length - 3} lần nữa</div>` : ''}
        </div>`;
    }

    let inProgressHtml = '';
    if (hasInProgress) {
        inProgressHtml = `<div class="mb-4 qr-pill qr-pill-warning">
            <div class="qr-pill-eyebrow">⏳ Đang làm bài</div>
            ${data.inProgress.slice(0, 2).map(u => `<div class="text-sm font-semibold">${u.displayName}</div>`).join('')}
        </div>`;
    }

    // Local in-progress for this user
    let localProgressHtml = '';
    if (inProgress && alreadyUnlocked) {
        const pct = Math.round((inProgress.answeredCount / inProgress.totalQuestions) * 100);
        localProgressHtml = `<div class="mb-4 qr-pill qr-pill-info">
            <div class="qr-pill-eyebrow">📌 Bài đang làm dở của bạn</div>
            <div class="text-sm">${inProgress.answeredCount}/${inProgress.totalQuestions} câu · ${pct}%</div>
        </div>`;
    }

    // CTA button
    let ctaBtn;
    if (data.isFull && !alreadyUnlocked) {
        ctaBtn = `<button disabled class="btn btn-block qr-cta-disabled">🚫 Mã đã hết lượt sử dụng</button>`;
    } else if (alreadyUnlocked && inProgress) {
        ctaBtn = `<button onclick="window._qrStartExam('${examId}')" class="btn btn-warning btn-block btn-lg">▶️ Tiếp tục làm bài</button>`;
    } else {
        ctaBtn = `<button onclick="window._qrStartExam('${examId}','${code}')" class="btn btn-primary btn-block btn-lg">🚀 Bắt đầu làm bài</button>`;
    }

    const usageTag = `<div class="text-xs text-muted text-center mb-3">Đã dùng ${data.usedCount}/${data.maxUses < 500 ? data.maxUses : '∞'} lượt</div>`;

    document.getElementById('qrPopupBody').innerHTML = `
        ${localProgressHtml}${inProgressHtml}${historyHtml}${usageTag}${ctaBtn}
        <button onclick="document.getElementById('qrEntryPopup').remove()" class="btn btn-ghost btn-block mt-2 text-muted">Đóng</button>`;
}

/**
 * Delete one history entry from current user — refresh popup after.
 */
window._qrDeleteHistory = async function (examId, completedAtEnc) {
    const ok = await (window.confirmPopup ? window.confirmPopup({
        title: 'Xóa lịch sử làm bài',
        message: 'Bài này sẽ bị xóa khỏi lịch sử. Không thể hoàn tác.',
        confirmText: 'Xóa',
        cancelText: 'Hủy',
        danger: true
    }) : Promise.resolve(confirm('Xóa lịch sử làm bài này?')));
    if (!ok) return;
    const completedAt = decodeURIComponent(completedAtEnc);
    const token = localStorage.getItem('easyrevise_token');
    if (!token) return alert('Bạn cần đăng nhập');
    try {
        const res = await fetch(`/api/history/${encodeURIComponent(examId)}?completedAt=${encodeURIComponent(completedAt)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Lỗi xóa');
        // Refresh popup
        const overlay = document.getElementById('qrEntryPopup');
        if (overlay) {
            const code = overlay.querySelector('.qr-popup-code')?.textContent?.trim();
            overlay.remove();
            if (code) showQREntryPopup(code, examId);
        }
    } catch (err) {
        (window.notify?.error || alert)('❌ ' + err.message);
    }
};

/**
 * Start exam from QR popup — verify code then navigate
 */
window._qrStartExam = async function (examId, code) {
    const btn = document.querySelector('#qrEntryPopup button');
    if (btn) { btn.textContent = '⏳ Đang mở khóa...'; btn.disabled = true; }

    // If already unlocked (continuing), just go
    const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
    if (unlocked[examId]) {
        document.getElementById('qrEntryPopup')?.remove();
        window.location.href = `exam.html?id=${examId}`;
        return;
    }

    try {
        const userId = currentUser?.id || 'anonymous';
        const displayName = currentUser?.displayName || 'Ẩn danh';
        const res = await fetch(`/api/exams/${examId}/verify-code`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, userId, displayName })
        });
        const data = await res.json();
        if (data.error) {
            (window.notify?.error || alert)('❌ ' + data.error);
            if (btn) { btn.textContent = '🚀 Bắt đầu làm bài'; btn.disabled = false; }
            return;
        }
        const unlocked2 = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        unlocked2[examId] = data.code;
        localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked2));
        document.getElementById('qrEntryPopup')?.remove();
        window.location.href = `exam.html?id=${examId}`;
    } catch (err) {
        (window.notify?.error || alert)('❌ Lỗi kết nối: ' + err.message);
        if (btn) { btn.textContent = '🚀 Bắt đầu làm bài'; btn.disabled = false; }
    }
};

/**
 * Handle QR deep-link from URL params (?code=XXX&examId=YYY)
 */
(async function handleQRDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const qrCode = params.get('code');
    const qrExamId = params.get('examId');
    if (!qrCode || !qrExamId) return;

    // Clean URL immediately
    history.replaceState({}, '', '/');
    showQREntryPopup(qrCode.toUpperCase().trim(), qrExamId);
})();

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
        <div class="modal-box" style="max-width:480px;border-radius:24px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:1.5rem 1.75rem;color:#fff;">
                <div class="text-xs font-bold" style="text-transform:uppercase;letter-spacing:1px;opacity:0.8;margin-bottom:0.35rem;">📱 QR Kích Hoạt</div>
                <div id="qrPopupTitle" style="font-size:1.4rem;font-weight:800;line-height:1.3;">Đang tải...</div>
                <div id="qrPopupMeta" class="text-sm" style="opacity:0.85;margin-top:0.35rem;"></div>
                <div style="margin-top:0.75rem;display:inline-block;background:rgba(255,255,255,0.2);border-radius:8px;padding:0.25rem 0.75rem;font-family:monospace;font-size:1rem;font-weight:900;letter-spacing:3px;">${code}</div>
            </div>
            <div id="qrPopupBody" style="padding:1.5rem 1.75rem;">
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
            const scoreColor = score === null ? '#94a3b8' : score >= 8 ? '#16a34a' : score >= 5 ? '#d97706' : '#dc2626';
            const scoreTxt = score !== null ? score + '/10' : '—';
            const time = h.completedAt ? new Date(h.completedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '';
            const mins = h.result ? Math.floor((h.result.timeSpent || 0) / 60) + ' phút' : '';
            return `<div class="history-item" style="margin-bottom:0.35rem;padding:0.6rem 0.85rem;">
                    <div>
                        <div class="font-semibold text-sm">${h.displayName}</div>
                        <div class="text-xs text-muted">${time}${mins ? ' · ' + mins : ''}</div>
                    </div>
                    <div style="font-weight:800;font-size:1.05rem;color:${scoreColor};">${scoreTxt}</div>
                </div>`;
        }).join('')}
            ${data.history.length > 3 ? `<div class="text-xs text-muted" style="text-align:right;">+${data.history.length - 3} lần nữa</div>` : ''}
        </div>`;
    }

    let inProgressHtml = '';
    if (hasInProgress) {
        inProgressHtml = `<div class="mb-4" style="padding:0.75rem 1rem;background:var(--color-warning-bg);border-radius:12px;border:1px solid #fde68a;">
            <div class="text-xs font-bold mb-1" style="text-transform:uppercase;letter-spacing:0.5px;color:#92400e;">⏳ Đang làm bài</div>
            ${data.inProgress.slice(0, 2).map(u => `<div class="text-sm font-semibold" style="color:#78350f;">${u.displayName}</div>`).join('')}
        </div>`;
    }

    // Local in-progress for this user
    let localProgressHtml = '';
    if (inProgress && alreadyUnlocked) {
        const pct = Math.round((inProgress.answeredCount / inProgress.totalQuestions) * 100);
        localProgressHtml = `<div class="mb-4" style="padding:0.75rem 1rem;background:var(--color-info-bg);border-radius:12px;border:1px solid #bfdbfe;">
            <div class="text-xs font-bold mb-1" style="text-transform:uppercase;color:#1e40af;">📌 Bài đang làm dở của bạn</div>
            <div class="text-sm" style="color:#1e40af;">${inProgress.answeredCount}/${inProgress.totalQuestions} câu · ${pct}%</div>
        </div>`;
    }

    // CTA button
    let ctaBtn;
    if (data.isFull && !alreadyUnlocked) {
        ctaBtn = `<button disabled class="btn btn-block" style="background:#e2e8f0;color:#94a3b8;cursor:not-allowed;">🚫 Mã đã hết lượt sử dụng</button>`;
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
            alert('❌ ' + data.error);
            if (btn) { btn.textContent = '🚀 Bắt đầu làm bài'; btn.disabled = false; }
            return;
        }
        const unlocked2 = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        unlocked2[examId] = data.code;
        localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked2));
        document.getElementById('qrEntryPopup')?.remove();
        window.location.href = `exam.html?id=${examId}`;
    } catch (err) {
        alert('❌ Lỗi kết nối: ' + err.message);
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

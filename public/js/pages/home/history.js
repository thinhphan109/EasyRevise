/* ========================================
   EasyRevise — Home / History
   Load history, review past results
   ======================================== */

let _serverHistory = [];

/**
 * Load user's exam history from server (or fallback to local)
 */
async function loadHistory() {
    const token = localStorage.getItem('easyrevise_token');
    if (!token) return;

    try {
        const res = await fetch('/api/history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const history = await res.json();

        const section = document.getElementById('historySection');
        const container = document.getElementById('historyList');

        // Also check local history
        const localHistory = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
        const allHistory = history.length > 0 ? history : localHistory;
        _serverHistory = allHistory;

        if (!allHistory.length) {
            section.hidden = true;
            return;
        }

        section.hidden = false;
        container.innerHTML = _renderHistoryItems(allHistory, 'server');
        _wireHomeHistoryDelete(container);
        if (typeof updateSectionCount === 'function') {
            updateSectionCount('historyCount', allHistory.length, 'bài');
        }
        if (typeof checkListOverflow === 'function') {
            checkListOverflow('historyReveal', 'historyFooter', 'historyToggleCount', allHistory.length);
        }
    } catch (err) {
        // Fallback to local
        _loadLocalHistory();
    }
}

/**
 * Show local history (for non-logged-in users)
 */
function loadLocalHistory() {
    const localHistory = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
    if (localHistory.length) {
        document.getElementById('historySection').hidden = false;
        document.getElementById('historyList').innerHTML = _renderHistoryItems(localHistory, 'local');
        if (typeof updateSectionCount === 'function') {
            updateSectionCount('historyCount', localHistory.length, 'bài');
        }
        if (typeof checkListOverflow === 'function') {
            checkListOverflow('historyReveal', 'historyFooter', 'historyToggleCount', localHistory.length);
        }
    }
}

/** @private */
function _loadLocalHistory() {
    const localHistory = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
    if (localHistory.length) {
        document.getElementById('historySection').hidden = false;
        document.getElementById('historyList').innerHTML = _renderHistoryItems(localHistory, 'local');
        if (typeof updateSectionCount === 'function') {
            updateSectionCount('historyCount', localHistory.length, 'bài');
        }
        if (typeof checkListOverflow === 'function') {
            checkListOverflow('historyReveal', 'historyFooter', 'historyToggleCount', localHistory.length);
        }
    }
}

/**
 * Render history items HTML
 * @param {Array} items
 * @param {string} source - 'server' or 'local'
 * @returns {string}
 */
function _renderHistoryItems(items, source) {
    return items.map((h, i) => {
        const score = parseFloat(h.score);
        const scoreClass = score >= 8 ? 'history-score--high' : score >= 5 ? 'history-score--mid' : 'history-score--low';
        const label = score >= 8
            ? '<span class="badge badge-success">Xuất sắc</span>'
            : score >= 5
                ? '<span class="badge badge-warning">Khá</span>'
                : '<span class="badge badge-error">Cần cố gắng</span>';
        const timeMin = Math.floor((h.timeSpent || 0) / 60);
        const autoTag = h.autoSubmitted ? ' · <span class="text-warning text-xs">⏰ Hết giờ</span>' : '';
        const timeDisplay = h.timestamp ? (typeof getTimeAgo === 'function' ? getTimeAgo(new Date(h.timestamp).getTime()) : h.timestamp) : '';
        const completedAtAttr = h.completedAt ? encodeURIComponent(h.completedAt) : '';
        const examIdAttr = h.examId ? encodeURIComponent(h.examId) : '';
        const delBtn = (source === 'server' && h.examId && h.completedAt)
            ? `<button class="home-history-delete" data-examid="${examIdAttr}" data-completedat="${completedAtAttr}" title="Xóa lịch sử" aria-label="Xóa lịch sử"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>`
            : '';
        return `
            <div class="home-history-item" data-history-idx="${i}" data-source="${source}">
                <div onclick="reviewResult(${i}, '${source}')" style="flex:1;cursor:pointer;">
                    <div class="font-semibold">${h.examTitle || 'Đề thi'}</div>
                    <div class="text-sm text-muted">
                        ${timeDisplay} · ${h.correct}/${h.total} đúng · ${timeMin} phút${autoTag}
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-center">
                        <div class="history-score ${scoreClass}">${h.score}</div>
                        ${label}
                    </div>
                    ${delBtn}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="opacity:0.6;"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>`;
    }).join('');
}

// Wire delete buttons after history is rendered (called by render function)
function _wireHomeHistoryDelete(rootEl) {
    if (!rootEl) return;
    rootEl.querySelectorAll('.home-history-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ok = await (window.confirmPopup ? window.confirmPopup({
                title: 'Xóa lịch sử làm bài',
                message: 'Bài này sẽ bị xóa khỏi danh sách lịch sử của bạn.',
                confirmText: 'Xóa',
                cancelText: 'Hủy',
                danger: true
            }) : Promise.resolve(confirm('Xóa lịch sử làm bài này?')));
            if (!ok) return;
            const examId = decodeURIComponent(btn.dataset.examid || '');
            const completedAt = decodeURIComponent(btn.dataset.completedat || '');
            const token = localStorage.getItem('easyrevise_token');
            if (!token) return alert('Bạn cần đăng nhập');
            try {
                const url = `/api/history/${encodeURIComponent(examId)}${completedAt ? '?completedAt=' + encodeURIComponent(completedAt) : ''}`;
                const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error || 'Lỗi xóa');
                btn.closest('.home-history-item')?.remove();
                if (typeof loadHistory === 'function') setTimeout(loadHistory, 300);
            } catch (err) {
                alert('❌ ' + err.message);
            }
        });
    });
}

/**
 * Navigate to review a past result
 * @param {number} index
 * @param {string} source - 'server' or 'local'
 */
function reviewResult(index, source) {
    let history;
    if (source === 'server') {
        history = _serverHistory;
    } else {
        history = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
    }
    const item = history[index];
    if (!item) return;
    sessionStorage.setItem('easyrevise_final_result', JSON.stringify(item));
    window.location.href = 'result.html';
}

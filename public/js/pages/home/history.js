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
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = _renderHistoryItems(allHistory, 'server');
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
        document.getElementById('historySection').style.display = 'block';
        document.getElementById('historyList').innerHTML = _renderHistoryItems(localHistory, 'local');
    }
}

/** @private */
function _loadLocalHistory() {
    const localHistory = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
    if (localHistory.length) {
        document.getElementById('historySection').style.display = 'block';
        document.getElementById('historyList').innerHTML = _renderHistoryItems(localHistory, 'local');
    }
}

/**
 * Render history items HTML
 * @param {Array} items
 * @param {string} source - 'server' or 'local'
 * @returns {string}
 */
function _renderHistoryItems(items, source) {
    return items.slice(0, 10).map((h, i) => {
        const score = parseFloat(h.score);
        const color = score >= 8 ? 'var(--color-success)' : score >= 5 ? 'var(--color-warning)' : 'var(--color-error)';
        const label = score >= 8
            ? '<span class="badge badge-success">Xuất sắc</span>'
            : score >= 5
                ? '<span class="badge badge-warning">Khá</span>'
                : '<span class="badge badge-error">Cần cố gắng</span>';
        const timeMin = Math.floor((h.timeSpent || 0) / 60);
        const autoTag = h.autoSubmitted ? ' · <span class="text-warning text-xs">⏰ Hết giờ</span>' : '';
        return `
            <div class="history-item" onclick="reviewResult(${i}, '${source}')">
                <div>
                    <div class="font-semibold">${h.examTitle || 'Đề thi'}</div>
                    <div class="text-sm text-muted">
                        ${h.timestamp || ''} · ${h.correct}/${h.total} đúng · ${timeMin} phút${autoTag}
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-center">
                        <div class="history-score" style="color: ${color};">${h.score}</div>
                        ${label}
                    </div>
                    <span class="text-sm text-primary">Xem lại →</span>
                </div>
            </div>`;
    }).join('');
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

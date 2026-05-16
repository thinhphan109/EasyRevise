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
        return `
            <div class="home-history-item" onclick="reviewResult(${i}, '${source}')">
                <div>
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" style="opacity:0.6;"><polyline points="9 18 15 12 9 6"/></svg>
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

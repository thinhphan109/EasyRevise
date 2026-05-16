/* ========================================
   EasyRevise — Dashboard / Index
   Load data, render all sections
   ======================================== */

document.addEventListener('DOMContentLoaded', async () => {
    // Check auth
    const token = localStorage.getItem('easyrevise_token');
    if (!token) {
        document.getElementById('dashboardLoading').hidden = true;
        document.getElementById('dashboardLoginRequired').hidden = false;
        return;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch('/api/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        }).finally(() => clearTimeout(timeoutId));

        if (res.status === 401 || res.status === 403) {
            document.getElementById('dashboardLoading').hidden = true;
            document.getElementById('dashboardLoginRequired').hidden = false;
            return;
        }

        if (!res.ok) throw new Error('Load failed');

        const data = await res.json();

        // Hide loading, show content
        document.getElementById('dashboardLoading').hidden = true;
        document.getElementById('dashboardContent').hidden = false;

        renderProfile(data.user, data.stats);
        renderStats(data.stats);
        renderSubjects(data.subjectBreakdown, data.stats.totalAttempts);
        renderHistory(data.recentHistory);

    } catch (err) {
        const isTimeout = err.name === 'AbortError';
        console.error('Dashboard load error:', err);
        document.getElementById('dashboardLoading').innerHTML = `
            <div class="dash-section" style="text-align:center;padding:var(--space-10) 0;">
                <div style="font-size:48px;margin-bottom:var(--space-3);">${isTimeout ? '⏱️' : '⚠️'}</div>
                <p style="color:var(--text-2);margin-bottom:var(--space-4);">
                    ${isTimeout ? 'Yêu cầu mất quá lâu. Máy chủ có thể đang bận.' : 'Không thể tải dữ liệu. Vui lòng thử lại.'}
                </p>
                <button class="btn btn-primary" onclick="location.reload()">Tải lại</button>
                <a href="/" class="btn btn-ghost" style="margin-left:var(--space-2);">Về trang chủ</a>
            </div>`;
    }
});

/**
 * Render profile card
 */
function renderProfile(user, stats) {
    // Set FaceHash avatar
    const avatarEl = document.getElementById('profileAvatar');
    const avatarName = user.username || user.displayName || 'anonymous';
    avatarEl.src = `/api/avatar?name=${encodeURIComponent(avatarName)}&size=64`;
    avatarEl.alt = user.displayName || 'Avatar';

    document.getElementById('profileName').textContent = user.displayName;

    const joinDate = user.joinedAt
        ? new Date(user.joinedAt).toLocaleDateString('vi-VN')
        : '';
    document.getElementById('profileMeta').textContent =
        joinDate ? `Thành viên từ ${joinDate}` : 'Học viên';

    if (stats.streakDays > 0) {
        document.getElementById('streakBadge').hidden = false;
        document.getElementById('streakCount').textContent = stats.streakDays;
    }
}

/**
 * Render stat cards with count-up animation
 */
function renderStats(stats) {
    const cards = [
        {
            icon: '📝', label: 'Đề đã làm', value: stats.totalExams,
            suffix: '', color: 'primary', iconClass: 'stat-icon--primary'
        },
        {
            icon: '⭐', label: 'Điểm TB', value: stats.avgScore,
            suffix: '', color: 'success', iconClass: 'stat-icon--success',
            decimal: true
        },
        {
            icon: '🎯', label: 'Chính xác', value: stats.accuracy,
            suffix: '%', color: 'warning', iconClass: 'stat-icon--warning'
        },
        {
            icon: '⏱️', label: 'Thời gian', value: stats.timeSpentMinutes,
            suffix: 'p', color: 'accent', iconClass: 'stat-icon--accent',
            format: formatTimeCard
        }
    ];

    const grid = document.getElementById('statGrid');
    grid.innerHTML = cards.map((c, i) => {
        const valClass = c.color !== 'primary' ? ` stat-value--${c.color}` : '';
        const displayVal = c.format ? c.format(c.value) : c.value;
        return `
            <div class="stat-card" style="animation-delay: ${i * 60}ms;">
                <div class="stat-icon ${c.iconClass}">${c.icon}</div>
                <div class="stat-value${valClass}" data-target="${c.value}" data-suffix="${c.suffix}" data-decimal="${c.decimal || false}">
                    ${displayVal}${c.suffix}
                </div>
                <div class="stat-label">${c.label}</div>
            </div>`;
    }).join('');

    // Animate count-up
    grid.querySelectorAll('.stat-value[data-target]').forEach(el => {
        const target = parseFloat(el.dataset.target);
        const suffix = el.dataset.suffix || '';
        const isDecimal = el.dataset.decimal === 'true';
        if (target === 0) return;
        animateValue(el, target, suffix, isDecimal);
    });
}

/**
 * Count-up animation
 */
function animateValue(el, target, suffix, decimal) {
    const duration = 1200;
    const start = performance.now();
    const format = decimal ? 1 : 0;

    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const current = target * eased;
        el.textContent = current.toFixed(format) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

/**
 * Format time for stat card
 */
function formatTimeCard(minutes) {
    if (minutes < 60) return minutes;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m > 0 ? m : ''}`;
}

/**
 * Render subject breakdown bars
 */
function renderSubjects(subjects, totalAttempts) {
    if (!subjects || subjects.length === 0) return;

    const section = document.getElementById('subjectSection');
    section.hidden = false;

    const colors = ['', '--accent', '--success', '--warning', '--info'];
    const maxAttempts = Math.max(...subjects.map(s => s.attempts));

    const list = document.getElementById('subjectList');
    list.innerHTML = subjects.map((s, i) => {
        const fillPct = Math.round((s.attempts / maxAttempts) * 100);
        const colorClass = colors[i % colors.length];
        return `
            <div class="subject-bar">
                <div class="subject-name">${escapeHtml(s.subject)}</div>
                <div class="subject-bar-track">
                    <div class="subject-bar-fill${colorClass ? ' subject-bar-fill' + colorClass : ''}"
                         style="width: 0%;" data-fill="${fillPct}"></div>
                </div>
                <div class="subject-stats">${s.attempts} bài · ${s.avgScore}</div>
            </div>`;
    }).join('');

    // Animate bars after render
    requestAnimationFrame(() => {
        list.querySelectorAll('.subject-bar-fill').forEach(bar => {
            const fill = bar.dataset.fill;
            setTimeout(() => { bar.style.width = fill + '%'; }, 100);
        });
    });
}

/**
 * Render recent history
 */
function renderHistory(history) {
    if (!history || history.length === 0) {
        document.getElementById('emptyState').hidden = false;
        return;
    }

    const section = document.getElementById('historySection');
    section.hidden = false;

    const list = document.getElementById('historyList');
    list.innerHTML = history.map(h => {
        const score = parseFloat(h.score) || 0;
        const scoreClass = score >= 8 ? 'high' : (score >= 5 ? 'mid' : 'low');
        const timeAgo = formatTimeAgo(h.completedAt);
        const timeStr = formatDuration(h.timeSpent);

        return `
            <a class="history-item" href="result.html?examId=${h.examId}">
                <div class="history-item-info">
                    <div class="history-item-title">${escapeHtml(h.examTitle)}</div>
                    <div class="history-item-meta">
                        ${h.subject ? escapeHtml(h.subject) + ' · ' : ''}${h.correct}/${h.total} câu đúng · ${timeStr}
                    </div>
                </div>
                <div class="history-score history-score--${scoreClass}">${score.toFixed(1)}/10</div>
                <div class="history-time">${timeAgo}</div>
            </a>`;
    }).join('');
}

/**
 * Escape HTML utility
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Format time ago
 */
function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngày trước`;
    return new Date(dateStr).toLocaleDateString('vi-VN');
}

/**
 * Format duration in seconds → display
 */
function formatDuration(seconds) {
    if (!seconds) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}:${String(s).padStart(2, '0')}`;
    const h = Math.floor(m / 60);
    return `${h}h${m % 60}p`;
}

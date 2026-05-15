/* ===========================================================
   Admin / Dashboard tab — Bento overview
   Stats · 7-day chart · Activity feed · Recent submissions
   Calls existing endpoints; no new server route.
   =========================================================== */

(function () {
    let _loading = false;

    async function loadAdminDashboard() {
        if (_loading) return;
        _loading = true;
        try {
            // Parallel fetches — graceful fallback on individual failure
            const [exams, subs, users, codes] = await Promise.all([
                api('/api/exams').catch(() => []),
                api('/api/admin/submissions').catch(() => []),
                api('/api/admin/users').catch(() => []),
                api('/api/admin/activation').catch(() => [])
            ]);

            renderStats({ exams, subs, users, codes });
            render7DayChart(subs);
            renderActivityFeed(subs);
            renderRecentSubmissions(subs);
        } catch (err) {
            console.error('[admin dashboard] load failed', err);
        } finally {
            _loading = false;
        }
    }

    function animateCount(el, target) {
        if (!el || isNaN(target)) return;
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { el.textContent = String(target); return; }
        const start = performance.now();
        const duration = 800;
        function tick(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const cur = Math.round(target * eased);
            el.textContent = String(cur);
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = String(target);
        }
        requestAnimationFrame(tick);
    }

    function renderStats({ exams, subs, users, codes }) {
        const examCount = Array.isArray(exams) ? exams.length : 0;
        const subCount = Array.isArray(subs) ? subs.length : 0;
        const userCount = Array.isArray(users)
            ? users.filter(u => u.role !== 'admin').length
            : 0;
        const codeCount = Array.isArray(codes) ? codes.length : 0;

        animateCount(document.getElementById('adminDashExamCount'), examCount);
        animateCount(document.getElementById('adminDashUserCount'), userCount);
        animateCount(document.getElementById('adminDashSubCount'), subCount);
        animateCount(document.getElementById('adminDashCodeCount'), codeCount);
    }

    function render7DayChart(subs) {
        const chart = document.getElementById('adminDashChart');
        if (!chart) return;

        // Group by day for last 7 days
        const days = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            days.push({ date: d, count: 0 });
        }

        if (Array.isArray(subs)) {
            subs.forEach(s => {
                const ts = s.completedAt || s.timestamp || s.createdAt;
                if (!ts) return;
                const d = new Date(ts);
                d.setHours(0, 0, 0, 0);
                const idx = days.findIndex(b => b.date.getTime() === d.getTime());
                if (idx !== -1) days[idx].count++;
            });
        }

        const max = Math.max(1, ...days.map(d => d.count));
        const dayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        chart.innerHTML = days.map((d, i) => {
            const heightPct = (d.count / max) * 100;
            const isToday = i === days.length - 1;
            const label = dayLabels[d.date.getDay()];
            const dateStr = `${d.date.getDate()}/${d.date.getMonth() + 1}`;
            return `
                <div class="admin-dash-bar" title="${dateStr}: ${d.count} bài">
                    <div class="admin-dash-bar-track">
                        <div class="admin-dash-bar-fill ${isToday ? 'is-today' : ''}"
                             style="height: ${heightPct}%; transition-delay: ${i * 50}ms;">
                            ${d.count > 0 ? `<span class="admin-dash-bar-value">${d.count}</span>` : ''}
                        </div>
                    </div>
                    <div class="admin-dash-bar-label ${isToday ? 'is-today' : ''}">${label}</div>
                </div>`;
        }).join('');
    }

    function renderActivityFeed(subs) {
        const feed = document.getElementById('adminDashActivity');
        if (!feed) return;
        if (!Array.isArray(subs) || subs.length === 0) {
            feed.innerHTML = '<li class="admin-dash-activity-empty">Chưa có hoạt động</li>';
            return;
        }
        const sorted = [...subs]
            .sort((a, b) => new Date(b.completedAt || b.timestamp || 0) - new Date(a.completedAt || a.timestamp || 0))
            .slice(0, 6);

        feed.innerHTML = sorted.map(s => {
            const name = escapeHtml(s.displayName || s.userName || 'Học sinh');
            const exam = escapeHtml(s.examTitle || 'Đề thi');
            const score = s.score !== null && s.score !== undefined ? s.score : null;
            const ts = formatTimeAgo(s.completedAt || s.timestamp);
            const scoreColor = score !== null
                ? (score >= 8 ? 'success' : score >= 5 ? 'warning' : 'error')
                : 'muted';
            return `
                <li class="admin-dash-activity-item">
                    <div class="admin-dash-activity-dot admin-dash-activity-dot--${scoreColor}"></div>
                    <div class="admin-dash-activity-text">
                        <strong>${name}</strong> nộp <em>${exam}</em>
                        ${score !== null ? `<span class="admin-dash-activity-score admin-dash-activity-score--${scoreColor}">${score}</span>` : ''}
                    </div>
                    <div class="admin-dash-activity-time">${ts}</div>
                </li>`;
        }).join('');
    }

    function renderRecentSubmissions(subs) {
        const container = document.getElementById('adminDashRecent');
        if (!container) return;
        if (!Array.isArray(subs) || subs.length === 0) {
            container.innerHTML = '<div class="admin-dash-activity-empty">Chưa có bài nộp</div>';
            return;
        }
        const sorted = [...subs]
            .sort((a, b) => new Date(b.completedAt || b.timestamp || 0) - new Date(a.completedAt || a.timestamp || 0))
            .slice(0, 8);

        container.innerHTML = `
            <table class="admin-dash-recent-table">
                <thead>
                    <tr>
                        <th>Học sinh</th>
                        <th>Đề</th>
                        <th>Điểm</th>
                        <th>Thời gian</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(s => {
                        const name = escapeHtml(s.displayName || s.userName || 'Học sinh');
                        const exam = escapeHtml(s.examTitle || 'Đề thi');
                        const score = s.score !== null && s.score !== undefined ? s.score : '-';
                        const scoreColor = (typeof score === 'number')
                            ? (score >= 8 ? 'high' : score >= 5 ? 'mid' : 'low')
                            : 'mid';
                        const ts = formatTimeAgo(s.completedAt || s.timestamp);
                        return `
                            <tr>
                                <td>${name}</td>
                                <td class="admin-dash-recent-exam">${exam}</td>
                                <td><span class="score-pill score-pill-${scoreColor}">${score}</span></td>
                                <td class="admin-dash-recent-time">${ts}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Vừa xong';
        if (mins < 60) return `${mins} phút trước`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} giờ trước`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days} ngày trước`;
        return new Date(dateStr).toLocaleDateString('vi-VN');
    }

    // Expose globally for switchTab + reload button
    window.loadAdminDashboard = loadAdminDashboard;
})();

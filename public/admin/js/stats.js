// ========================
// stats.js — Code logs, exam stats
// ========================
async function loadCodeLogs() {
    const c = document.getElementById('codeLogsContainer');
    c.innerHTML = renderSkeletonRows(5, 'table');
    const logs = await api('/api/code-logs');
    if (!logs.length) { c.innerHTML = renderEmptyState('chart', 'Chưa có mã nào được sử dụng', 'Khi học sinh sử dụng mã kích hoạt, lịch sử sẽ hiển thị ở đây'); return; }

    const grouped = {};
    logs.forEach(l => {
        const key = l.code;
        if (!grouped[key]) grouped[key] = { code: l.code, examTitle: l.examTitle, maxUses: l.maxUses || 1, entries: [] };
        grouped[key].entries.push(l);
    });

    const cards = Object.values(grouped).map(group => {
        const usedCount = group.entries.filter(e => e.completed).length;
        const total = group.entries.length;
        const full = usedCount >= group.maxUses;

        const rows = group.entries.map(l => {
            const status = l.completed ? '✅ Hoàn thành' : '⏳ Đang làm';
            const statusColor = l.completed ? '#16a34a' : '#f59e0b';
            const time = l.usedAt ? new Date(l.usedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '-';
            const user = l.displayName || l.userId || 'Ẩn danh';
            const score = (l.score !== null && l.score !== undefined && !isNaN(l.score)) ? l.score + '/10' : '-';
            return `<div class="code-log-row">
                <span class="code-log-user">${escapeHtml(user)}</span>
                <span class="code-log-time">${time}</span>
                <span class="code-log-status" style="color:${statusColor}">${status}</span>
                <span class="code-log-score">${score}</span>
            </div>`;
        }).join('');

        return `<div class="code-log-card">
            <div class="code-log-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.code-log-chevron').classList.toggle('open')">
                <span class="code-log-chevron open">▶</span>
                <span class="code-log-code" onclick="event.stopPropagation();navigator.clipboard.writeText('${group.code}');showToast('Đã copy: ${group.code}','success')" title="Click để copy">${group.code}</span>
                <span class="code-log-title">${escapeHtml(group.examTitle)}</span>
                <span class="code-log-badge ${full ? 'code-log-badge--full' : 'code-log-badge--ok'}">${usedCount}/${group.maxUses} lần</span>
                <span style="font-size:0.8rem;color:var(--text-muted);">${total} lượt</span>
            </div>
            <div style="display:block;">${rows}</div>
        </div>`;
    }).join('');

    c.innerHTML = cards;
}

// Exam Stats
async function loadExamStats(examId, examTitle) {
    let modal = document.getElementById('statsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'statsModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2000;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="glass-panel" style="max-width:700px;width:90%;max-height:85vh;overflow-y:auto;padding:2rem;border-radius:20px;"><div style="text-align:center;padding:2rem;"><div style="font-size:2rem;">⏳</div><p>Đang tải thống kê...</p></div></div>`;
    modal.style.display = 'flex';
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };

    try {
        const stats = await api(`/api/admin/exams/${examId}/stats`);
        modal.innerHTML = `<div class="glass-panel" style="max-width:700px;width:90%;max-height:85vh;overflow-y:auto;padding:2rem;border-radius:20px;">${renderExamStats(stats, examTitle)}</div>`;
        modal.style.display = 'flex';
        modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    } catch (e) {
        modal.innerHTML = `<div class="glass-panel" style="max-width:500px;width:90%;padding:2rem;border-radius:20px;"><p style="color:var(--error);">❌ Lỗi tải thống kê</p><button class="btn" onclick="document.getElementById('statsModal').style.display='none'">Đóng</button></div>`;
    }
}

function renderExamStats(stats, examTitle) {
    const avgColor = stats.avgScore >= 8 ? '#16a34a' : stats.avgScore >= 5 ? '#d97706' : '#dc2626';
    const topWrong = (stats.questionStats || []).slice(0, 5);
    const topEasy = [...(stats.questionStats || [])].sort((a, b) => a.wrongRate - b.wrongRate).slice(0, 3);

    const wrongRows = topWrong.map((q, i) =>
        `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 0;border-bottom:1px solid var(--border);">
            <span style="font-weight:700;color:var(--error);min-width:24px;">${i + 1}.</span>
            <span style="flex:1;font-size:0.88rem;color:var(--text-main);">${escapeHtml(q.question.substring(0, 60))}${q.question.length > 60 ? '…' : ''}</span>
            <div style="text-align:right;">
                <div style="font-weight:700;color:var(--error);">${q.wrongRate}% sai</div>
                <div style="font-size:0.72rem;color:var(--text-muted);">${q.wrongCount}/${q.totalAnswered} HS</div>
            </div>
        </div>`
    ).join('');

    const easyRows = topEasy.map(q =>
        `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);">
            <span style="flex:1;font-size:0.85rem;color:var(--text-main);">${escapeHtml(q.question.substring(0, 60))}${q.question.length > 60 ? '…' : ''}</span>
            <span style="font-weight:700;color:#16a34a;">${q.wrongRate}% sai</span>
        </div>`
    ).join('');

    return `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.5rem;">
            <div>
                <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:0.25rem;">📊 Thống kê đề thi</h3>
                <p style="font-size:0.85rem;color:var(--text-muted);">${escapeHtml(examTitle || '')}</p>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('statsModal').style.display='none'">✕ Đóng</button>
        </div>

        <div class="stats-grid">
            <div class="stats-metric">
                <div class="stats-metric-value" style="color:var(--primary);">${stats.totalAttempts}</div>
                <div class="stats-metric-label">Lần làm bài</div>
            </div>
            <div class="stats-metric">
                <div class="stats-metric-value" style="color:${avgColor};">${stats.avgScore ?? '—'}</div>
                <div class="stats-metric-label">Điểm TB</div>
            </div>
            <div class="stats-metric">
                <div class="stats-metric-value" style="color:#16a34a;">${stats.maxScore ?? '—'}</div>
                <div class="stats-metric-label">Cao nhất</div>
            </div>
            <div class="stats-metric">
                <div class="stats-metric-value" style="color:#dc2626;">${stats.minScore ?? '—'}</div>
                <div class="stats-metric-label">Thấp nhất</div>
            </div>
        </div>

        ${topWrong.length > 0 ? `
        <div style="margin-bottom:1.5rem;">
            <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem;color:var(--error);">🔴 Câu hỏi khó nhất (sai nhiều nhất)</h4>
            ${wrongRows}
        </div>` : ''}

        ${topEasy.length > 0 ? `
        <div>
            <h4 style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem;color:#16a34a;">🟢 Câu dễ nhất</h4>
            ${easyRows}
        </div>` : ''}

        ${stats.totalAttempts === 0 ? '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Chưa có học sinh nào làm bài</div>' : ''}
    `;
}

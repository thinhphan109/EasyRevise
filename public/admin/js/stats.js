// ========================
// stats.js — Code logs, exam stats
// ========================

async function loadCodeLogs() {
    const logs = await api('/api/code-logs');
    const c = document.getElementById('codeLogsContainer');
    if (!logs.length) { c.innerHTML = '<div class="empty-state"><div class="emoji">📊</div><p>Chưa có mã nào được sử dụng</p></div>'; return; }

    const grouped = {};
    logs.forEach(l => {
        const key = l.code;
        if (!grouped[key]) grouped[key] = { code: l.code, examTitle: l.examTitle, maxUses: l.maxUses || 1, entries: [] };
        grouped[key].entries.push(l);
    });

    const cards = Object.values(grouped).map((group, gi) => {
        const usedCount = group.entries.filter(e => e.completed).length;
        const total = group.entries.length;
        const full = usedCount >= group.maxUses;

        const rows = group.entries.map(l => {
            const status = l.completed ? '✅ Hoàn thành' : '⏳ Đang làm';
            const statusColor = l.completed ? '#16a34a' : '#f59e0b';
            const time = l.usedAt ? new Date(l.usedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '-';
            const user = l.displayName || l.userId || 'Ẩn danh';
            const score = (l.score !== null && l.score !== undefined && !isNaN(l.score)) ? l.score + '/10' : '-';
            return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 1rem;border-bottom:1px solid var(--border);">
                <span style="flex:1;font-weight:500;">${escapeHtml(user)}</span>
                <span style="font-size:0.8rem;color:var(--text-muted);min-width:130px;">${time}</span>
                <span style="color:${statusColor};font-weight:600;font-size:0.82rem;min-width:100px;">${status}</span>
                <span style="font-weight:700;min-width:50px;text-align:right;">${score}</span>
            </div>`;
        }).join('');

        return `<div style="border:1px solid var(--border);border-radius:12px;margin-bottom:0.75rem;overflow:hidden;">
            <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none';this.querySelector('.chevron').textContent=this.nextElementSibling.style.display==='none'?'▶':'▼'" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 1rem;background:var(--bg-card);cursor:pointer;user-select:none;">
                <span class="chevron" style="font-size:0.7rem;color:var(--text-muted);">▼</span>
                <span style="font-family:monospace;font-weight:700;font-size:1rem;color:var(--primary);cursor:pointer;" onclick="event.stopPropagation();navigator.clipboard.writeText('${group.code}');this.style.color='#16a34a';this.textContent='\u2705 Copied!';setTimeout(()=>{this.textContent='${group.code}';this.style.color='var(--primary)';},1000)" title="Click để copy">${group.code}</span>
                <span style="font-size:0.85rem;color:var(--text-muted);flex:1;">${escapeHtml(group.examTitle)}</span>
                <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;${full ? 'background:#fee2e2;color:#dc2626;' : 'background:#f0fdf4;color:#16a34a;'}">${usedCount}/${group.maxUses} lần</span>
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

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:var(--primary);">${stats.totalAttempts}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Lần làm bài</div>
            </div>
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:${avgColor};">${stats.avgScore ?? '—'}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Điểm TB</div>
            </div>
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:#16a34a;">${stats.maxScore ?? '—'}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Cao nhất</div>
            </div>
            <div style="text-align:center;padding:1rem;background:var(--bg-input);border-radius:12px;">
                <div style="font-size:1.8rem;font-weight:900;color:#dc2626;">${stats.minScore ?? '—'}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem;">Thấp nhất</div>
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

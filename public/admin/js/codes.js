// ========================
// codes.js — Access codes management, QR code
// ========================

async function showCodeManager() {
    const exam = currentExamData;
    const codes = exam.accessCodes || [];

    const codeRows = codes.map(c => {
        const used = (c.usedBy || []).filter(u => u.completed).length;
        const inProgress = (c.usedBy || []).filter(u => !u.completed).length;
        const max = c.maxUses || (c.type === 'single-use' ? 1 : 999);
        const maxAtt = c.maxAttempts || 0;
        const users = (c.usedBy || []).map(u => escapeHtml(u.displayName || u.userId || '?'));
        const full = used >= max;
        const stuck = inProgress > 0;
        return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem 1rem;border-bottom:1px solid var(--border);${full ? 'background:#fef2f2;' : ''}">
            <span style="font-family:monospace;font-weight:700;font-size:1rem;min-width:75px;color:var(--primary);cursor:pointer;" onclick="navigator.clipboard.writeText('${c.code}');this.style.color='#16a34a';this.textContent='✅ Copied!';setTimeout(()=>{this.textContent='${c.code}';this.style.color='var(--primary)';},1000)" title="Click để copy">${c.code}</span>
            <span style="font-size:0.75rem;padding:0.15rem 0.5rem;border-radius:6px;font-weight:600;min-width:40px;text-align:center;${full ? 'background:#fee2e2;color:#dc2626;' : 'background:#f0fdf4;color:#16a34a;'}">${used}/${max}</span>
            ${maxAtt > 0 ? `<span style="font-size:0.7rem;padding:0.12rem 0.45rem;border-radius:5px;background:#eef2ff;color:#4f46e5;white-space:nowrap;">\uD83D\uDD01 ${maxAtt} l\u1ea7n/HS</span>` : ''}
            ${stuck ? `<span style="font-size:0.7rem;padding:0.12rem 0.45rem;border-radius:5px;background:#fef3c7;color:#92400e;white-space:nowrap;">\u23f3 ${inProgress} \u0111ang l\u00e0m</span>` : ''}
            <span style="flex:1;font-size:0.78rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${users.length ? users.join(', ') : '<i>ch\u01b0a ai d\u00f9ng</i>'}</span>
            <div style="display:flex;gap:0.3rem;flex-shrink:0;">
                ${stuck ? `<button class="btn btn-sm" onclick="releaseCode('${c.code}')" style="padding:0.2rem 0.55rem;font-size:0.72rem;background:#fef3c7;color:#92400e;border:1px solid #fde68a;" title="Gi\u1ea3i ph\u00f3ng l\u01b0\u1ee3t \u0111ang l\u00e0m">\uD83D\uDD13 Gi\u1ea3i ph\u00f3ng</button>` : ''}
                <button class="btn btn-sm btn-ghost" onclick="showQRCode('${exam.id}','${c.code}')" style="padding:0.2rem 0.5rem;font-size:0.72rem;" title="QR Code">📱</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCode('${c.code}')" style="padding:0.2rem 0.5rem;font-size:0.72rem;">\u2715</button>
            </div>
        </div>`;
    }).join('');

    const html = `<div class="glass-panel" style="padding:2rem;margin-bottom:2rem;">
        <h3 style="margin-bottom:1rem;">🔑 Mã kích hoạt — ${escapeHtml(exam.title)}</h3>
        <div class="toggle-row"><span style="font-weight:600;">Yêu cầu mã để làm bài</span>
            <label class="toggle-switch"><input type="checkbox" id="toggleRequireCode" ${exam.requireCode ? 'checked' : ''} onchange="toggleRequireCode(this.checked)"><span class="toggle-slider"></span></label></div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin:1rem 0;flex-wrap:wrap;">
            <input id="codeCount" class="form-input" type="number" value="5" min="1" max="500" placeholder="SL" style="max-width:70px;">
            <span style="font-size:0.8rem;color:var(--text-muted);">×</span>
            <input id="codeMaxUses" class="form-input" type="number" value="1" min="1" max="999" style="max-width:60px;">
            <span style="font-size:0.75rem;color:var(--text-muted);">lần/mã</span>
            <span style="font-size:0.75rem;color:var(--text-muted);margin-left:0.25rem;">|</span>
            <input id="codeMaxAttempts" class="form-input" type="number" value="0" min="0" max="99" style="max-width:65px;" title="Số lần làm tối đa mỗi học sinh (0 = không giới hạn)">
            <span style="font-size:0.75rem;color:var(--text-muted);">lần/HS (0=∞)</span>
            <button class="btn btn-primary btn-sm" onclick="generateCodes()">Tạo mã</button>
            <span style="font-size:0.8rem;color:var(--text-muted);margin-left:auto;">${codes.length} mã</span>
        </div>
        <div style="max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:12px;">
            ${codes.length ? codeRows : '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:1.5rem;">Chưa có mã nào</p>'}
        </div>
    </div>`;
    document.getElementById('sectionListContainer').innerHTML = html + renderSections(exam);
}

async function toggleRequireCode(checked) { await api(`/api/exams/${currentExamId}`, 'PUT', { requireCode: checked }); currentExamData.requireCode = checked; }

async function generateCodes() {
    const count = parseInt(document.getElementById('codeCount').value) || 5;
    const maxUses = parseInt(document.getElementById('codeMaxUses').value) || 1;
    const maxAttempts = parseInt(document.getElementById('codeMaxAttempts')?.value) || 0;
    await api(`/api/exams/${currentExamId}/codes`, 'POST', { count, maxUses, maxAttempts });
    currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager();
}

async function deleteCode(code) { await api(`/api/exams/${currentExamId}/codes/${code}`, 'DELETE'); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }
async function releaseCode(code) { if (!confirm('Giải phóng các lượt dùng chưa hoàn thành của mã ' + code + '?')) return; await api(`/api/exams/${currentExamId}/release-code`, 'POST', { code }); currentExamData = await api(`/api/exams/${currentExamId}`); showCodeManager(); }

// QR Code
function showQRCode(examId, code) {
    const origin = window.location.origin;
    const url = `${origin}/?code=${encodeURIComponent(code)}&examId=${encodeURIComponent(examId)}`;
    document.getElementById('qrCodeModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'qrCodeModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;';
    modal.innerHTML = `<div class="glass-panel modal-content" style="max-width:400px;text-align:center;">
        <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:0.5rem;">📱 QR Code Mã Kích Hoạt</h3>
        <p id="qrCodeLabel" style="font-family:monospace;font-size:1.4rem;font-weight:900;color:var(--primary);margin-bottom:1rem;letter-spacing:4px;">${code}</p>
        <canvas id="qrCanvas" style="border-radius:12px;max-width:240px;max-height:240px;margin:0 auto;display:block;"></canvas>
        <p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.75rem;word-break:break-all;" id="qrUrlText">${url}</p>
        <div style="display:flex;gap:0.75rem;justify-content:center;margin-top:1.5rem;">
            <button id="qrDownloadBtn" class="btn btn-primary btn-sm">⬇️ Tải PNG</button>
            <button id="qrCloseBtn" class="btn btn-ghost btn-sm">Đóng</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    document.getElementById('qrCloseBtn').addEventListener('click', () => modal.remove());
    document.getElementById('qrDownloadBtn').addEventListener('click', () => downloadQRCode(code));
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const canvas = document.getElementById('qrCanvas');
    if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(canvas, url, { width: 240, margin: 2, color: { dark: '#1e1b4b', light: '#ffffff' } }, err => { if (err) console.error('QR error:', err); });
    } else {
        canvas.style.display = 'none';
        document.getElementById('qrUrlText').textContent = 'QRCode library chưa tải. Link: ' + url;
    }
}

function downloadQRCode(code) {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `qr_${code}.png`;
    a.click();
}

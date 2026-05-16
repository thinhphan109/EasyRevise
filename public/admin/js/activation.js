// ========================
// activation.js — Activation Code management tab
// ========================

async function loadActivationCodes() {
    const codes = await api('/api/admin/activation');
    const container = document.getElementById('activationContainer');
    if (!container) return;

    // Group by batch
    const batches = {};
    for (const c of codes) {
        const key = c.batchName || 'Không tên';
        if (!batches[key]) batches[key] = [];
        batches[key].push(c);
    }

    if (!codes.length) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">🔑</div><p>Chưa có mã kích hoạt. Nhấn <strong>"Tạo mã"</strong> để bắt đầu.</p></div>`;
        return;
    }

    let html = '';
    for (const [batch, items] of Object.entries(batches)) {
        const used = items.filter(c => c.usedAt).length;
        const expired = items.filter(c => c.expiresAt && new Date(c.expiresAt) < new Date()).length;
        html += `<div class="glass-panel" style="padding:1.25rem;margin-bottom:1.25rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                <div>
                    <h4 style="font-size:1rem;font-weight:700;margin-bottom:0.25rem;">${escapeHtml(batch)}</h4>
                    <div style="font-size:0.8rem;color:var(--text-muted);">
                        ${items.length} mã · ${used} đã dùng · ${expired} hết hạn
                    </div>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button class="btn btn-sm btn-info" onclick="printBatchQR('${escapeHtml(batch)}')">🖨️ In QR</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBatch('${escapeHtml(batch)}')">🗑</button>
                </div>
            </div>
            <table class="exam-table" style="font-size:0.82rem;">
                <thead><tr><th>Mã</th><th>Trạng thái</th><th>Người dùng</th><th>Ngày dùng</th><th></th></tr></thead>
                <tbody>
                    ${items.map(c => {
                        let status, statusClass;
                        if (c.usedAt) { status = '✅ Đã dùng'; statusClass = 'color:#16a34a;'; }
                        else if (c.expiresAt && new Date(c.expiresAt) < new Date()) { status = '⏰ Hết hạn'; statusClass = 'color:#dc2626;'; }
                        else { status = '🟢 Sẵn sàng'; statusClass = 'color:var(--primary);'; }
                        return `<tr>
                            <td><code style="font-family:monospace;font-weight:600;font-size:0.85rem;">${escapeHtml(c.code)}</code></td>
                            <td><span style="${statusClass}font-size:0.78rem;font-weight:600;">${status}</span></td>
                            <td style="font-size:0.8rem;color:var(--text-muted);">${c.studentName || '—'}</td>
                            <td style="font-size:0.78rem;color:var(--text-muted);">${c.usedAt ? new Date(c.usedAt).toLocaleDateString('vi') : '—'}</td>
                            <td><button class="btn btn-sm btn-ghost" onclick="deleteActivationCode('${c.id}')" title="Xóa">🗑</button></td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }
    container.innerHTML = html;
}

function showGenerateCodesModal() {
    openModal('modalGenerateCodes');
    document.getElementById('genCodePrefix').value = '';
    document.getElementById('genCodeCount').value = '10';
    document.getElementById('genCodeBatch').value = '';
    document.getElementById('genCodeExpiry').value = '';
}

async function generateActivationCodes() {
    const prefix = document.getElementById('genCodePrefix').value.trim() || 'CODE';
    const count = parseInt(document.getElementById('genCodeCount').value) || 10;
    const batchName = document.getElementById('genCodeBatch').value.trim();
    const expiresAt = document.getElementById('genCodeExpiry').value || null;

    try {
        const res = await api('/api/admin/activation/generate', 'POST', { prefix, count, batchName, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
        if (res.error) { showToast('Lỗi: ' + res.error, 'error'); return; }
        showToast(`Đã tạo ${res.count} mã kích hoạt!`, 'success');
        closeModal('modalGenerateCodes');
        loadActivationCodes();
    } catch (err) { showToast('Lỗi kết nối: ' + err.message, 'error'); }
}

async function deleteActivationCode(id) {
    if (!(await customConfirm('Xóa mã', 'Xóa mã kích hoạt này?', 'Xóa', true))) return;
    await api(`/api/admin/activation/${id}`, 'DELETE');
    loadActivationCodes();
}

async function deleteBatch(batchName) {
    if (!(await customConfirm('Xóa batch', `Xóa tất cả mã trong batch "${batchName}"?`, 'Xóa batch', true))) return;
    await api(`/api/admin/activation/batch/${encodeURIComponent(batchName)}`, 'DELETE');
    loadActivationCodes();
}

async function printBatchQR(batchName) {
    const codes = await api('/api/admin/activation');
    const batchCodes = codes.filter(c => c.batchName === batchName);
    if (!batchCodes.length) { showToast('Không có mã nào!', 'warning'); return; }

    // Open print window
    const printWin = window.open('', '_blank', 'width=800,height=600');
    const baseUrl = window.location.origin;
    printWin.document.write(`<!DOCTYPE html>
<html><head><title>QR Codes - ${escapeHtml(batchName)}</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4; margin: 10mm; }
    body { font-family: 'Inter', Arial, sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 5mm; }
    .card { border: 1px dashed #ccc; border-radius: 8px; padding: 10px; text-align: center; page-break-inside: avoid; }
    .card img { width: 120px; height: 120px; margin: 4px auto; }
    .code { font-family: monospace; font-size: 14px; font-weight: 700; letter-spacing: 1px; margin: 4px 0; }
    .batch { font-size: 10px; color: #666; }
    .url { font-size: 8px; color: #999; word-break: break-all; }
    @media print { .no-print { display: none; } }
</style>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
</head><body>
<div class="no-print" style="padding:10px;text-align:center;background:#f0f0f0;">
    <h3>🖨️ ${escapeHtml(batchName)} — ${batchCodes.length} mã</h3>
    <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;margin:8px;">🖨️ In trang này</button>
</div>
<div class="grid" id="qrGrid"></div>
<script>
    const codes = ${JSON.stringify(batchCodes.map(c => ({ code: c.code, batch: c.batchName })))};
    const grid = document.getElementById('qrGrid');
    const baseUrl = '${baseUrl}';
    codes.forEach(c => {
        const div = document.createElement('div');
        div.className = 'card';
        const canvas = document.createElement('canvas');
        div.appendChild(canvas);
        div.innerHTML += '<div class="code">' + c.code + '</div>';
        div.innerHTML += '<div class="batch">' + c.batch + '</div>';
        div.innerHTML += '<div class="url">' + baseUrl + '</div>';
        grid.appendChild(div);
        QRCode.toCanvas(canvas, baseUrl + '/?activate=' + c.code, { width: 120, margin: 1 });
    });
</script></body></html>`);
}

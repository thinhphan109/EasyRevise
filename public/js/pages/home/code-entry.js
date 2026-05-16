/* ========================================
   EasyRevise — Home / Code Entry Modal
   Open code modal, submit access code
   ======================================== */

let _pendingCodeExamId = null;

/**
 * Open the code entry modal for a locked exam
 * @param {string} examId
 * @param {string} title
 */
function openCodeModal(examId, title) {
    _pendingCodeExamId = examId;
    document.getElementById('codeExamTitle').textContent = title;
    document.getElementById('codeInput').value = '';
    document.getElementById('codeError').style.display = 'none';
    document.getElementById('codeModal').classList.add('active');
    setTimeout(() => document.getElementById('codeInput').focus(), 100);
}

/**
 * Submit access code to unlock exam
 */
async function submitCode() {
    const code = document.getElementById('codeInput').value.trim();
    if (!code) return;
    try {
        const userId = currentUser?.id || 'anonymous';
        const displayName = currentUser?.displayName || 'Ẩn danh';
        const res = await fetch(`/api/exams/${_pendingCodeExamId}/verify-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, userId, displayName })
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('codeError').textContent = data.error;
            document.getElementById('codeError').style.display = 'block';
            return;
        }
        // Save unlocked state
        const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        unlocked[_pendingCodeExamId] = data.code;
        localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked));
        document.getElementById('codeModal').classList.remove('active');
        window.location.href = `exam.html?id=${_pendingCodeExamId}`;
    } catch {
        document.getElementById('codeError').textContent = 'Lỗi kết nối';
        document.getElementById('codeError').style.display = 'block';
    }
}

/**
 * Submit access code from the home hero command bar.
 * Looks up which exam owns the code, then opens the standard unlock flow.
 */
async function submitHeroCode() {
    const input = document.getElementById('heroCodeInput');
    const code = (input?.value || '').trim().toUpperCase();
    if (!code || code.length < 4) {
        if (typeof showToast === 'function') showToast('Vui lòng nhập mã hợp lệ', 'warning');
        input?.focus();
        return;
    }
    try {
        const res = await fetch('/api/exams/lookup-by-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (!res.ok) {
            if (typeof showToast === 'function') showToast(data.error || 'Mã không hợp lệ', 'error');
            input?.focus();
            input?.select?.();
            return;
        }
        // Pre-populate the standard code modal then auto-submit
        _pendingCodeExamId = data.examId;
        document.getElementById('codeExamTitle').textContent = data.examTitle || '';
        document.getElementById('codeInput').value = code;
        document.getElementById('codeError').style.display = 'none';
        await submitCode();
    } catch {
        if (typeof showToast === 'function') showToast('Lỗi kết nối', 'error');
    }
}

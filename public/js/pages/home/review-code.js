/* ========================================
   EasyRevise — Home / Review by Code
   Look up past results by access code
   ======================================== */

/**
 * Open the review-by-code modal
 */
function openReviewByCodeModal() {
    document.getElementById('reviewCodeModal').classList.add('active');
    document.getElementById('reviewCodeInput').value = '';
    document.getElementById('reviewCodeError').style.display = 'none';
    document.getElementById('reviewResultsList').style.display = 'none';
    document.getElementById('reviewResultsList').innerHTML = '';
    setTimeout(() => document.getElementById('reviewCodeInput').focus(), 100);
}

/**
 * Submit review code to look up past results
 */
async function submitReviewCode() {
    const code = document.getElementById('reviewCodeInput').value.trim();
    if (!code) return;
    try {
        const res = await fetch('/api/review-by-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('reviewCodeError').textContent = data.error;
            document.getElementById('reviewCodeError').style.display = 'block';
            return;
        }

        if (data.count === 1) {
            // Single result - go directly
            const picked = data.results[0];
            picked.result.examId = picked.result.examId || data.examId;
            sessionStorage.setItem('easyrevise_final_result', JSON.stringify(picked.result));
            sessionStorage.setItem('easyrevise_result_code', JSON.stringify({ examId: data.examId, code: data.code }));
            document.getElementById('reviewCodeModal').classList.remove('active');
            window.location.href = 'result.html';
        } else {
            // Multiple results - show picker list
            const list = document.getElementById('reviewResultsList');
            list.style.display = 'block';
            list.innerHTML = `<p class="text-sm text-muted mb-3" style="text-align:left;">📋 ${data.count} lần làm bài — ${data.examTitle}</p>` +
                data.results.map((r, i) => {
                    const time = r.completedAt ? new Date(r.completedAt).toLocaleString('vi-VN') : 'N/A';
                    const score = r.score !== null && r.score !== undefined && !isNaN(r.score) ? r.score + '/10' : '-';
                    return `<div onclick="pickReviewResult(${i})" class="history-item" style="margin-bottom:0.35rem;">
                        <div style="text-align:left;">
                            <div class="font-semibold text-sm">${r.displayName}</div>
                            <div class="text-xs text-muted">${time}</div>
                        </div>
                        <div class="font-bold text-primary">${score}</div>
                    </div>`;
                }).join('');
            window._reviewResults = data.results;
            window._reviewMeta = { examId: data.examId, code: data.code };
        }
    } catch {
        document.getElementById('reviewCodeError').textContent = 'Lỗi kết nối';
        document.getElementById('reviewCodeError').style.display = 'block';
    }
}

/**
 * Pick a specific result from the multi-result list
 * @param {number} index
 */
function pickReviewResult(index) {
    const r = window._reviewResults[index];
    if (!r) return;
    const meta = window._reviewMeta || {};
    r.result.examId = r.result.examId || meta.examId;
    sessionStorage.setItem('easyrevise_final_result', JSON.stringify(r.result));
    if (meta.examId && meta.code) sessionStorage.setItem('easyrevise_result_code', JSON.stringify({ examId: meta.examId, code: meta.code }));
    document.getElementById('reviewCodeModal').classList.remove('active');
    window.location.href = 'result.html';
}

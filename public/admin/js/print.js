// ========================
// print.js — Print exam, Preview exam
// ========================

function printExam() {
    const exam = currentExamData;
    if (!exam) return;
    document.getElementById('printConfigModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'printConfigModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;';
    modal.innerHTML = `<div class="glass-panel modal-content" style="max-width:460px;">
        <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:1rem;">🖨️ Cấu hình in đề</h3>
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
            <label style="font-size:0.85rem;font-weight:600;">Tên trường/tổ chức:</label>
            <input id="printSchoolName" class="form-input" value="${localStorage.getItem('easyrevise_print_school') || ''}" placeholder="VD: Trường THPT ABC">
            <label style="font-size:0.85rem;font-weight:600;">Ghi chú (dưới tên đề):</label>
            <input id="printNote" class="form-input" value="" placeholder="VD: Năm học 2025-2026, Học kì 2">
            <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;"><input type="checkbox" id="printAnswerKey" checked> In đáp án (trang riêng)</label>
                <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.85rem;"><input type="checkbox" id="printExplanation"> In giải thích</label>
            </div>
        </div>
        <div style="display:flex;gap:0.75rem;margin-top:1.25rem;justify-content:flex-end;">
            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('printConfigModal').remove()">Hủy</button>
            <button class="btn btn-primary btn-sm" onclick="doPrintExam()">🖨️ In ngay</button>
        </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function doPrintExam() {
    const exam = currentExamData;
    const schoolName = document.getElementById('printSchoolName').value.trim();
    const note = document.getElementById('printNote').value.trim();
    const showAnswerKey = document.getElementById('printAnswerKey').checked;
    const showExpl = document.getElementById('printExplanation').checked;
    if (schoolName) localStorage.setItem('easyrevise_print_school', schoolName);
    document.getElementById('printConfigModal')?.remove();

    let qNum = 0;
    let answerKeyRows = [];
    let sectionsHtml = exam.sections.map((s, si) => {
        const sLabel = `Câu ${si + 1}`;
        let sectionContent = `<div class="print-section"><h3 class="print-section-title">${sLabel}: ${s.title || ''} <span class="print-type-badge">${getTypeBadge(s.type).replace(/<[^>]+>/g, '')}</span></h3>`;
        if (s.instruction) sectionContent += `<p class="print-instruction">${s.instruction}</p>`;
        if (s.passage) sectionContent += `<div class="print-passage">${s.passage}</div>`;
        if (s.type === 'writing-essay') {
            sectionContent += `<p class="print-prompt">${s.prompt || ''}</p>`;
            if (s.cues && s.cues.length) sectionContent += `<ul class="print-cues">${s.cues.map(c => `<li>${c}</li>`).join('')}</ul>`;
            sectionContent += `<div class="print-essay-lines">${'<div class="print-line"></div>'.repeat(12)}</div>`;
            answerKeyRows.push({ section: sLabel, type: 'essay', answer: s.sampleAnswer || '(Xem đáp án mẫu)' });
        } else if (s.type === 'free-form') {
            sectionContent += `<p class="print-prompt">${s.prompt || s.instruction || ''}</p>`;
            (s.questions || []).forEach((q, qi) => {
                const parts = q.subParts || q.questions || [];
                parts.forEach((p, pi) => {
                    sectionContent += `<p class="print-subpart"><strong>(${p.label || String.fromCharCode(97 + pi)})</strong> ${p.question || ''}</p>`;
                    sectionContent += `<div class="print-answer-space"></div>`;
                });
            });
        } else {
            (s.questions || []).forEach((q, qi) => {
                qNum++;
                if (s.type === 'fill-in-blank') {
                    sectionContent += `<p class="print-question"><strong>${qNum}.</strong> ${q.question || ''}</p>`;
                    const blanks = q.blanks || [];
                    const ansStr = blanks.map((b, i) => `(${i + 1}) ${b.answer}`).join(', ');
                    answerKeyRows.push({ section: sLabel, num: qNum, type: 'fill', answer: ansStr });
                } else {
                    sectionContent += `<p class="print-question"><strong>${qNum}.</strong> ${q.question || ''}</p>`;
                    if (q.options && q.options.length) {
                        sectionContent += `<div class="print-options">${q.options.map((o, oi) => `<span class="print-opt"><strong>${String.fromCharCode(65 + oi)}.</strong> ${o}</span>`).join('')}</div>`;
                    }
                    const correctLetter = String.fromCharCode(65 + (q.correctAnswer || 0));
                    answerKeyRows.push({ section: sLabel, num: qNum, type: 'mc', answer: correctLetter, explanation: q.explanation });
                }
            });
        }
        sectionContent += '</div>';
        return sectionContent;
    }).join('');

    let answerKeyHtml = '';
    if (showAnswerKey) {
        answerKeyHtml = `<div class="print-page-break"></div>
        <div class="print-header"><h2>ĐÁP ÁN — ${exam.title}</h2></div>
        <table class="print-answer-table"><thead><tr><th>Câu</th><th>Phần</th><th>Đáp án</th>${showExpl ? '<th>Giải thích</th>' : ''}</tr></thead><tbody>
        ${answerKeyRows.map(r => {
            if (r.type === 'essay') return `<tr><td>—</td><td>${r.section}</td><td><em>${r.answer.substring(0, 120)}${r.answer.length > 120 ? '...' : ''}</em></td>${showExpl ? '<td></td>' : ''}</tr>`;
            return `<tr><td><strong>${r.num}</strong></td><td>${r.section}</td><td><strong>${r.answer}</strong></td>${showExpl ? `<td style="font-size:0.78rem;">${r.explanation || ''}</td>` : ''}</tr>`;
        }).join('')}
        </tbody></table>`;
    }

    const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>In đề — ${exam.title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"><\/script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}],throwOnError:false})"><\/script>
    <style>
        * { margin:0;padding:0;box-sizing:border-box; }
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #000; padding: 15mm 20mm; }
        .print-header { text-align:center; margin-bottom:1.5em; border-bottom:2px solid #000; padding-bottom:0.75em; }
        .print-header h1 { font-size:16pt; margin-bottom:0.3em; text-transform:uppercase; }
        .print-header h2 { font-size:14pt; margin-bottom:0.3em; }
        .print-header .school { font-size:13pt; font-weight:700; margin-bottom:0.2em; }
        .print-header .meta { font-size:11pt; color:#333; }
        .print-header .note { font-size:11pt; font-style:italic; color:#444; }
        .print-student-info { display:flex; gap:2em; margin:1em 0; font-size:12pt; }
        .print-student-info span { border-bottom:1px dotted #000; min-width:150px; display:inline-block; }
        .print-section { margin-bottom:1.5em; }
        .print-section-title { font-size:13pt; font-weight:700; margin-bottom:0.5em; border-bottom:1px solid #ccc; padding-bottom:0.3em; }
        .print-type-badge { font-size:9pt; font-weight:400; color:#666; font-style:italic; }
        .print-instruction { font-style:italic; margin-bottom:0.5em; color:#333; }
        .print-passage { background:#f9f9f9; padding:0.5em 0.75em; border-left:3px solid #999; margin-bottom:0.75em; font-size:11pt; }
        .print-prompt { margin-bottom:0.5em; }
        .print-cues { margin:0.5em 0 0.5em 1.5em; }
        .print-question { margin-bottom:0.3em; }
        .print-options { display:flex; flex-wrap:wrap; gap:0; margin-bottom:0.6em; margin-left:1.5em; }
        .print-opt { min-width:48%; font-size:11.5pt; margin-bottom:0.15em; }
        .print-subpart { margin:0.4em 0 0.2em 1em; }
        .print-answer-space { border-bottom:1px dotted #999; height:2em; margin:0 0 0.5em 2em; }
        .print-essay-lines .print-line { border-bottom:1px dotted #aaa; height:2em; }
        .print-page-break { page-break-before:always; }
        .print-answer-table { width:100%; border-collapse:collapse; font-size:11pt; margin-top:1em; }
        .print-answer-table th, .print-answer-table td { border:1px solid #999; padding:0.3em 0.5em; text-align:left; }
        .print-answer-table th { background:#eee; font-weight:700; }
        @media print { body { padding:0; } .no-print { display:none !important; } img { max-width:100% !important; height:auto !important; page-break-inside:avoid; } }
        .no-print { position:fixed; top:10px; right:20px; z-index:999; }
        .no-print button { padding:8px 20px; font-size:14px; cursor:pointer; background:#4f46e5; color:white; border:none; border-radius:8px; font-weight:600; }
    </style>
    </head><body>
    <div class="no-print"><button onclick="window.print()">🖨️ In</button> <button onclick="window.close()" style="background:#666;">Đóng</button></div>
    <div class="print-header">
        ${schoolName ? `<div class="school">${schoolName}</div>` : ''}
        <h1>ĐỀ KIỂM TRA</h1>
        <h2>${exam.title}</h2>
        <div class="meta">Môn: ${exam.subject} — ${exam.timeLimit ? `Thời gian: ${exam.timeLimit} phút — ` : ''}Năm: ${exam.year}</div>
        ${note ? `<div class="note">${note}</div>` : ''}
    </div>
    <div class="print-student-info">
        <div>Họ và tên: <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
        <div>Lớp: <span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span></div>
    </div>
    ${sectionsHtml}
    ${answerKeyHtml}
    </body></html>`;

    const printWin = window.open('', '_blank');
    printWin.document.write(printHtml);
    printWin.document.close();
}

function previewExam() {
    if (!currentExamId) return;
    window.open(`/exam.html?examId=${currentExamId}&preview=true`, '_blank');
}

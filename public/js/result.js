// EasyRevise - Results Engine (API-based)

// ========================
// Markdown Renderer — full support: table, bold, italic, inline image, heading, paragraph
// ========================
function renderMarkdown(text) {
    if (!text) return '';

    // Inline formatting helper
    function inlineFmt(str) {
        return str
            // Inline images ![alt](url) or ![](url)
            .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
                `<img src="${url}" alt="${alt}" style="max-width:100%;max-height:380px;border-radius:10px;display:block;margin:0.5rem auto;cursor:zoom-in;object-fit:contain;" onclick="window.open('${url}','_blank')">`)
            .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.1);padding:0.1rem 0.3rem;border-radius:4px;font-size:0.85em;">$1</code>');
    }

    const lines = text.split('\n');
    let html = '';
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Markdown table: line starts with | AND next line is separator |---|...
        if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())) {
            const headers = trimmed.split('|').slice(1, -1).map(c => c.trim());
            let t = `<div style="overflow-x:auto;margin:0.65rem 0;"><table style="border-collapse:collapse;width:100%;font-size:0.88rem;">`;
            t += `<thead><tr>` + headers.map(c =>
                `<th style="border:1px solid var(--border,#cbd5e1);padding:0.35rem 0.75rem;background:rgba(99,102,241,0.09);font-weight:700;text-align:center;">${inlineFmt(c)}</th>`
            ).join('') + `</tr></thead><tbody>`;
            i += 2; // skip header + separator row
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                const cells = lines[i].trim().split('|').slice(1, -1).map(c => c.trim());
                t += `<tr>` + cells.map(c =>
                    `<td style="border:1px solid var(--border,#cbd5e1);padding:0.35rem 0.75rem;text-align:center;">${inlineFmt(c)}</td>`
                ).join('') + `</tr>`;
                i++;
            }
            t += `</tbody></table></div>`;
            html += t;
            continue;
        }

        // Headings
        if (trimmed.startsWith('### ')) {
            html += `<div style="font-weight:700;font-size:0.97rem;margin:0.6rem 0 0.2rem;">${inlineFmt(trimmed.slice(4))}</div>`;
        } else if (trimmed.startsWith('## ')) {
            html += `<div style="font-weight:800;font-size:1.05rem;margin:0.75rem 0 0.25rem;">${inlineFmt(trimmed.slice(3))}</div>`;
        } else if (trimmed === '') {
            // Empty line = paragraph spacer
            html += '<div style="height:0.45rem;"></div>';
        } else {
            // Normal line with inline formatting
            html += `<div style="line-height:1.8;">${inlineFmt(trimmed)}</div>`;
        }
        i++;
    }
    return html;
}

// ========================
// Fill-blank match helper (mirrors server logic)
// ========================
function checkBlankMatch(given, expected, type) {
    given = (given || '').trim();
    expected = (expected || '').trim();
    if (!given) return false;
    if (type === 'int') return parseInt(given) === parseInt(expected);
    if (type === 'float') return Math.abs(parseFloat(given) - parseFloat(expected)) <= 0.01;
    return given.toLowerCase() === expected.toLowerCase();
}

class ResultApp {
    constructor() {
        this.results = null;
        this.examData = null;
        this.questionsList = [];

        this.scoreValue = document.getElementById('scoreValue');
        this.correctCount = document.getElementById('correctCount');
        this.incorrectCount = document.getElementById('incorrectCount');
        this.skipCount = document.getElementById('skipCount');
        this.examDate = document.getElementById('examDate');
        this.reviewContainer = document.getElementById('reviewContainer');

        this.init();
    }

    async init() {
        const savedResult = sessionStorage.getItem('easyrevise_final_result');
        if (!savedResult) {
            window.location.href = '/';
            return;
        }

        try {
            this.results = JSON.parse(savedResult);

            // Resolve the access code: prefer sessionStorage (set by app.js after submit),
            // fallback to localStorage (for review-by-code or direct revisit)
            let accessCode = null;
            const resultCodeRaw = sessionStorage.getItem('easyrevise_result_code');
            if (resultCodeRaw) {
                try {
                    const rc = JSON.parse(resultCodeRaw);
                    if (rc.examId === this.results.examId) accessCode = rc.code;
                } catch (e) { /* ignore */ }
            }
            if (!accessCode) {
                const unlockedLS = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
                accessCode = unlockedLS[this.results.examId] || null;
            }

            // Fetch full exam data from API
            const headers = {};
            if (accessCode) headers['x-access-code'] = accessCode;
            const token = localStorage.getItem('easyrevise_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`/api/exams/${this.results.examId}`, { headers });
            if (!res.ok) throw new Error('Exam not found');
            this.examData = await res.json();

            // Flatten
            this.examData.sections.forEach(section => {
                if (section.type === 'writing-essay') {
                    this.questionsList.push({ ...section, isEssay: true, sectionTitle: section.title });
                } else if (section.type === 'free-form') {
                    this.questionsList.push({ ...section, isFreeForm: true, sectionTitle: section.title });
                } else if (section.type === 'fill-in-blank') {
                    (section.questions || []).forEach(q => {
                        this.questionsList.push({
                            ...q,
                            isFillBlank: true,
                            isEssay: false,
                            isFreeForm: false,
                            sectionTitle: section.title
                        });
                    });
                } else {
                    (section.questions || []).forEach(q => {
                        this.questionsList.push({ ...q, isEssay: false, sectionTitle: section.title });
                    });
                }
            });

            this.renderSummary();
            this.renderReviewItems();

            // Always try to load existing grades immediately (works even after page refresh)
            const code = accessCode; // reuse resolved code
            if (code) {
                const hasGradeable = this.questionsList.some(q => q.isEssay || q.isFreeForm);
                if (hasGradeable) {
                    // Immediate fetch — show grades if already done
                    try {
                        const userId = JSON.parse(localStorage.getItem('easyrevise_user') || '{}').id;
                        const params = new URLSearchParams({ code });
                        if (userId) params.set('userId', userId);
                        const gr = await fetch(`/api/exams/${this.results.examId}/my-grades?${params}`);
                        if (gr.ok) {
                            const grData = await gr.json();
                            if (grData.grades && grData.grades.length > 0) {
                                this.updateEssayGradeCards(grData.grades);
                            }
                            // If still pending, start polling loop
                            if (grData.pending) {
                                const pollCtx = sessionStorage.getItem('easyrevise_grade_poll');
                                const ctx = pollCtx ? JSON.parse(pollCtx) : { examId: this.results.examId, code, userId: userId || null };
                                this.startGradePolling(ctx);
                            }
                        }
                    } catch (e) { /* silent */ }
                }
            }


            // Render math formulas with KaTeX
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(document.getElementById('reviewContainer'), {
                    delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false },
                        { left: '\\(', right: '\\)', display: false },
                        { left: '\\[', right: '\\]', display: true }
                    ],
                    throwOnError: false
                });
            }
        } catch (e) {
            console.error('Error:', e);
        }
    }

    renderSummary() {
        this.scoreValue.textContent = this.results.score;
        this.correctCount.textContent = this.results.correct;
        this.incorrectCount.textContent = this.results.incorrect;
        this.skipCount.textContent = this.results.skipped;
        this.examDate.textContent = `Hoàn thành vào: ${this.results.timestamp}`;

        // Time spent
        if (this.results.timeSpent) {
            const min = Math.floor(this.results.timeSpent / 60);
            const sec = this.results.timeSpent % 60;
            document.getElementById('timeSpent').textContent = `${min} phút ${sec} giây`;
        }

        // Color
        const s = parseFloat(this.results.score);
        if (s >= 8) this.scoreValue.style.color = '#22c55e';
        else if (s >= 5) this.scoreValue.style.color = '#f59e0b';
        else this.scoreValue.style.color = '#ef4444';

        // Update retake link
        const retakeBtn = document.getElementById('retakeBtn');
        if (retakeBtn) {
            if (this.examData.requireCode) {
                retakeBtn.textContent = '🔑 Nhập mã để làm lại';
                retakeBtn.href = '#';
                retakeBtn.onclick = (e) => {
                    e.preventDefault();
                    // Clear old unlock so they must re-enter code
                    const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
                    delete unlocked[this.results.examId];
                    localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked));
                    window.location.href = '/';
                };
            } else {
                retakeBtn.href = `exam.html?id=${this.results.examId}`;
            }
        }
    }

    renderReviewItems() {
        this.reviewContainer.innerHTML = '';

        this.questionsList.forEach((q, index) => {
            const resultEntry = this.results.results.find(r => String(r.id) === String(q.id));
            const userAnsId = resultEntry ? resultEntry.userAnswer : undefined;

            const reviewItem = document.createElement('div');
            reviewItem.className = 'glass-panel review-item';

            let statusBadge = '';
            if (q.isEssay) {
                statusBadge = '<span class="status-badge" style="background: rgba(99,102,241,0.2); color: #818cf8;">✍️ Phần Viết</span>';
            } else if (q.isFreeForm) {
                statusBadge = '<span class="status-badge" style="background: rgba(168,85,247,0.15); color: #a855f7;">✏️ Tự Luận</span>';
            } else if (q.isFillBlank) {
                // BUG-1 FIX: Fill-blank badge uses per-blank correctness, not correctAnswer comparison
                const blanksForBadge = q.blanks || [];
                const ansMapForBadge = resultEntry?.userAnswer || {};
                const fillAllCorrect = blanksForBadge.length > 0 && blanksForBadge.every((b, i) => {
                    const uv = ((ansMapForBadge[i] !== undefined ? ansMapForBadge[i] : '') + '').trim();
                    return checkBlankMatch(uv, String(b.answer || '').trim(), b.type);
                });
                const fillAnyAnswered = blanksForBadge.some((_, i) => (ansMapForBadge[i] + '').trim() !== '');
                if (!fillAnyAnswered) {
                    statusBadge = '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">⚠️ Bỏ Qua</span>';
                } else if (fillAllCorrect) {
                    statusBadge = '<span class="status-badge badge-correct">✅ Chính Xác</span>';
                } else {
                    statusBadge = '<span class="status-badge badge-incorrect">❌ Chưa Đúng</span>';
                }
            } else if (userAnsId === undefined) {
                statusBadge = '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">⚠️ Bỏ Qua</span>';
            } else if (userAnsId === q.correctAnswer) {
                statusBadge = '<span class="status-badge badge-correct">✅ Chính Xác</span>';
            } else {
                statusBadge = '<span class="status-badge badge-incorrect">❌ Chưa Đúng</span>';
            }

            let responseRow = '';
            if (q.isFreeForm) {
                // Render each sub-part answer
                const subParts = q.subParts || q.questions || [];
                const userAnswerText = resultEntry?.userAnswer || '';
                const attachments = resultEntry?.attachments || [];
                // Parse the serialized parts text back into lines for display
                const partLines = userAnswerText ? userAnswerText.split('\n') : [];

                // Helper: build explanation media HTML for a sub-part
                const buildPartExplHtml = (p) => {
                    let h = '';
                    // Render explanation TEXT using full markdown (supports table, bold, inline image)
                    if (p.explanation) {
                        h += `<div style="margin-top:0.6rem;padding:0.6rem 0.85rem;background:rgba(99,102,241,0.05);border-left:3px solid rgba(99,102,241,0.35);border-radius:0 8px 8px 0;font-size:0.88rem;color:var(--text-main);" class="katex-render">${renderMarkdown(p.explanation)}</div>`;
                    }
                    const imgs = [];
                    if (p.explanationImages && p.explanationImages.length > 0) imgs.push(...p.explanationImages);
                    else if (p.explanationImage) imgs.push(p.explanationImage);
                    if (imgs.length === 1) {
                        h += `<div style="margin:0.4rem 0;"><img src="${imgs[0]}" alt="" style="max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain;" onclick="window.open('${imgs[0]}','_blank')"></div>`;
                    } else if (imgs.length > 1) {
                        h += `<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin:0.4rem 0;">`;
                        imgs.forEach((src, i) => { h += `<img src="${src}" alt="Ảnh ${i + 1}" style="max-width:180px;max-height:140px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`; });
                        h += `</div>`;
                    }
                    if (p.explanationVideo) h += this.buildVideoHtml(p.explanationVideo);
                    return h;
                };

                const partsHtml = subParts.length > 0
                    ? subParts.map((p, i) => {
                        const label = p.label ? `(${p.label})` : `Câu ${i + 1}`;
                        const ans = partLines[i] ? partLines[i].replace(/^[^:]+:\s*/, '') : '(chưa điền)';
                        const partExplHtml = buildPartExplHtml(p);
                        const partSampleHtml = p.sampleAnswer
                            ? `<div style="margin-top:0.4rem;padding:0.4rem 0.6rem;background:rgba(34,197,94,0.06);border-left:3px solid rgba(34,197,94,0.5);border-radius:0 6px 6px 0;font-size:0.82rem;color:var(--text-main);">📝 ${p.sampleAnswer}</div>`
                            : '';
                        // Sub-part question text (problem statement for this sub-part)
                        const partQuestion = p.question
                            ? `<div style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:0.35rem;line-height:1.5;">${p.question}</div>`
                            : '';
                        return `<div style="padding:0.75rem 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                            <div style="font-size:0.78rem;font-weight:700;color:var(--primary);margin-bottom:0.25rem;">${label}</div>
                            ${partQuestion}
                            <div style="display:flex;gap:0.5rem;align-items:center;margin:0.25rem 0;">
                                <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">Bài làm:</span>
                                <span style="color:var(--text-main);font-size:0.92rem;font-weight:600;">${ans}</span>
                            </div>
                            ${partSampleHtml}
                            ${partExplHtml}
                        </div>`;
                    }).join('')
                    : `<div style="color:var(--text-muted);font-size:0.9rem;">${userAnswerText || '(chưa làm bài)'}</div>`;

                responseRow = `
                    <div style="margin-bottom:1rem;padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-radius:12px;">
                        <div style="font-weight:600;color:var(--text-main);font-size:0.88rem;margin-bottom:0.5rem;">Bài làm của bạn:</div>
                        ${partsHtml}
                        ${attachments.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.75rem;">${attachments.map(url =>
                    url.endsWith('.pdf')
                        ? `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">📄 PDF bài làm</a>`
                        : `<img src="${url}" style="max-width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:zoom-in;" onclick="window.open('${url}','_blank')">`
                ).join('')}</div>` : ''}
                    </div>
                    ${q.sampleAnswer ? `<div style="padding:1rem 1.25rem;background:rgba(34,197,94,0.05);border:1px dashed rgba(34,197,94,0.3);border-radius:12px;margin-bottom:1rem;">
                        <strong style="color:var(--success);display:block;margin-bottom:0.5rem;">📝 Hướng dẫn / Đáp án mẫu:</strong>
                        <div style="color:var(--text-main);font-size:0.92rem;white-space:pre-line;">${q.sampleAnswer}</div>
                    </div>` : ''}
                    ${q.explanationVideo ? `<div style="margin-top:0.75rem;"><div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.4rem;">🎬 Video giải đáp</div>${this.buildVideoHtml(q.explanationVideo)}</div>` : ''}
                    <div id="grade-slot-${q.id}" class="grade-slot"></div>`;
            } else if (q.isFillBlank) {
                // Per-blank detail display
                const blanks = q.blanks || [];
                const userAnswerMap = resultEntry?.userAnswer || {};
                const rawQ = q.question || '';
                let partsInQuestion;
                if (rawQ.includes('___')) {
                    partsInQuestion = rawQ.split('___');
                } else if (rawQ.includes('__')) {
                    partsInQuestion = rawQ.split('__');
                } else {
                    partsInQuestion = rawQ.split(/(?<!\S)_(?!\S)/);
                    if (partsInQuestion.length === 1) partsInQuestion = rawQ.split('_');
                }
                let filledHtml = '<div style="font-size:1rem;line-height:2;color:var(--text-main);">';
                partsInQuestion.forEach((part, i) => {
                    filledHtml += `<span>${part.replace(/\n/g, '<br>')}</span>`;
                    if (i < partsInQuestion.length - 1) {
                        const blank = blanks[i];
                        const userVal = ((userAnswerMap[i] !== undefined ? userAnswerMap[i] : '') + '').trim();
                        const expected = String(blank?.answer || '').trim();
                        const isOk = blank ? checkBlankMatch(userVal, expected, blank.type) : false;
                        filledHtml += `<span style="
                            display:inline-block;padding:0.15rem 0.6rem;margin:0 0.2rem;
                            border-radius:8px;font-weight:700;font-size:0.92rem;
                            background:${isOk ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};
                            color:${isOk ? '#16a34a' : '#dc2626'};
                            border:1px solid ${isOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};
                            ">${userVal || '<em style="opacity:0.6">(trống)</em>'} ${isOk ? '✓' : `✗ <span style="font-size:0.78rem;opacity:0.75;">→ ${expected}</span>`}</span>`;
                    }
                });
                filledHtml += '</div>';

                const allCorrect = blanks.length > 0 && blanks.every((b, i) => {
                    const uv = ((userAnswerMap[i] !== undefined ? userAnswerMap[i] : '') + '').trim();
                    return checkBlankMatch(uv, String(b.answer || '').trim(), b.type);
                });
                const wrongCount = blanks.filter((b, i) => !checkBlankMatch(((userAnswerMap[i] !== undefined ? userAnswerMap[i] : '') + '').trim(), String(b.answer || '').trim(), b.type)).length;

                responseRow = `
                    <div style="margin-bottom:1.25rem;">
                        <div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">Câu trả lời của bạn</div>
                        ${filledHtml}
                        <div style="margin-top:0.5rem;font-size:0.82rem;color:${allCorrect ? '#16a34a' : '#dc2626'};font-weight:600;">
                            ${allCorrect ? `✅ Tất cả ${blanks.length} ô đúng` : `❌ Sai ${wrongCount}/${blanks.length} ô`}
                        </div>
                    </div>`;
            } else {
                // essay
                responseRow = `
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: var(--text-main); font-size: 0.9rem;">Bài làm của bạn:</strong>
                        <div style="margin-top: 0.5rem; padding: 1rem; background:rgba(255,255,255,0.03); border-radius: 12px; color: var(--text-muted); font-size: 0.9rem; white-space: pre-line;">${resultEntry?.userAnswer || 'Không có bài làm.'}</div>
                        ${(resultEntry?.attachments || []).length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">${(resultEntry.attachments).map(url => `<a href="${url}" target="_blank" style="font-size:0.82rem;color:var(--primary);">${url.endsWith('.pdf') ? '📄 PDF bài làm' : `<img src="${url}" style="max-width:90px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`}</a>`).join('')}</div>` : ''}
                    </div>
                    ${q.sampleAnswer ? `<div style="padding: 1.25rem; background: rgba(34,197,94,0.05); border: 1px dashed rgba(34,197,94,0.3); border-radius: 12px; margin-bottom: 1rem;">
                        <strong style="color: var(--success); display: block; margin-bottom: 0.75rem;">📝 Mẫu đáp án:</strong>
                        <div style="color: var(--text-main); font-size: 0.95rem; white-space: pre-line;">${q.sampleAnswer}</div>
                    </div>` : ''}
                    <div id="grade-slot-${q.id}" class="grade-slot"></div>`;
            }

            // Build media HTML for question
            let questionMediaHtml = '';
            // Collect images: images[] has priority over legacy image
            const qImgs = [];
            if (q.images && q.images.length > 0) qImgs.push(...q.images);
            else if (q.image) qImgs.push(q.image);
            if (q.imageUrl && !qImgs.includes(q.imageUrl)) qImgs.push(q.imageUrl);

            if (qImgs.length === 1) {
                questionMediaHtml += `<div style="margin:0.75rem 0;"><img src="${qImgs[0]}" alt="" style="max-width:100%;max-height:350px;border-radius:12px;cursor:zoom-in;object-fit:contain;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:100%;max-height:350px;border-radius:12px;cursor:zoom-in;object-fit:contain';}"></div>`;
            } else if (qImgs.length > 1) {
                questionMediaHtml += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0;">`;
                qImgs.forEach((src, i) => {
                    questionMediaHtml += `<img src="${src}" alt="Hình ${i + 1}" style="max-width:200px;max-height:160px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
                });
                questionMediaHtml += `</div>`;
            }
            if (q.video) {
                questionMediaHtml += this.buildVideoHtml(q.video);
            }

            // Build media HTML for explanation
            let explMediaHtml = '';
            // Collect explanation images: explanationImages[] > legacy explanationImage
            const explImgs = [];
            if (q.explanationImages && q.explanationImages.length > 0) explImgs.push(...q.explanationImages);
            else if (q.explanationImage) explImgs.push(q.explanationImage);

            if (explImgs.length === 1) {
                explMediaHtml += `<div style="margin:0.75rem 0;"><img src="${explImgs[0]}" alt="" style="max-width:100%;max-height:400px;border-radius:12px;cursor:zoom-in;object-fit:contain;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:100%;max-height:400px;border-radius:12px;cursor:zoom-in;object-fit:contain';}"></div>`;
            } else if (explImgs.length > 1) {
                explMediaHtml += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0;">`;
                explImgs.forEach((src, i) => {
                    explMediaHtml += `<img src="${src}" alt="Ảnh giải đáp ${i + 1}" style="max-width:220px;max-height:180px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
                });
                explMediaHtml += `</div>`;
            }
            if (q.explanationVideo) {
                explMediaHtml += this.buildVideoHtml(q.explanationVideo);
            }


            reviewItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">
                        ${(q.isFreeForm || q.isEssay) ? q.sectionTitle : `${q.sectionTitle} — Câu ${index + 1}`}
                    </div>
                    ${statusBadge}
                </div>
                <div style="font-size: 1.05rem; font-weight: 600; margin-bottom: 1.25rem; color: var(--text-main); line-height: 1.5;" class="katex-render">
                    ${renderMarkdown(q.isEssay ? (q.prompt || '') : (q.isFreeForm ? (q.instruction || '') : (q.question || '')))}
                </div>
                ${questionMediaHtml}
                ${responseRow}
                ${q.explanation && q.showExplanation !== false ? `
                <div class="explanation-box">
                    <div class="explanation-title">📝 Giải đáp & Phân tích</div>
                    <div style="color: var(--text-main); font-size: 0.95rem; line-height: 1.6;" class="katex-render">${renderMarkdown(q.explanation)}</div>
                    ${explMediaHtml}
                </div>` : (explMediaHtml && q.showExplanation !== false ? `<div class="explanation-box"><div class="explanation-title">📝 Media giải đáp</div>${explMediaHtml}</div>` : '')}
                ${q.expansion && q.showExpansion !== false ? `
                <div class="expansion-box">
                    <div class="expansion-title">💡 Mở rộng kiến thức</div>
                    <div style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;" class="katex-render">${renderMarkdown(q.expansion)}</div>
                </div>` : ''}
                ${(!q.isEssay && !q.isFreeForm && !q.isFillBlank && resultEntry && resultEntry.isCorrect === false) ? `
                <div id="explain-slot-${q.id}">
                    <button class="btn btn-sm" onclick="window._resultApp.askWhyWrong('${q.id}', this)" style="margin-top:0.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border:none;font-size:0.8rem;padding:0.4rem 0.9rem;border-radius:10px;cursor:pointer;transition:opacity 0.2s;" title="AI giải thích tại sao bạn sai">
                        🤖 Tại sao tôi sai?
                    </button>
                </div>` : ''}`;

            this.reviewContainer.appendChild(reviewItem);
        });
    }


    startGradePolling({ examId, code, userId }) {
        const banner = document.getElementById('aiGradingBanner');
        const timerEl = document.getElementById('aiGradingTimer');
        const subtextEl = document.getElementById('aiGradingSubtext');
        if (banner) banner.style.display = 'block';

        const startedAt = Date.now();
        const MAX_WAIT_MS = 3 * 60 * 1000; // 3 minutes max
        const POLL_INTERVAL = 4000;
        let pollCount = 0;

        const updateTimer = () => {
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            if (timerEl) timerEl.textContent = `${elapsed}s`;
        };

        const finish = (success) => {
            clearInterval(this._pollTimer);
            clearInterval(this._timerTick);
            sessionStorage.removeItem('easyrevise_grade_poll');
            if (!banner) return;
            if (success) {
                banner.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1.5rem;
                        background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:16px;" class="ai-grade-done-banner">
                        <span style="font-size:1.3rem;">✅</span>
                        <div style="font-weight:700;color:#16a34a;">Chấm xong! Điểm đã được cập nhật bên dưới.</div>
                    </div>`;
                setTimeout(() => { banner.style.opacity = '0'; banner.style.transition = 'opacity 0.6s'; setTimeout(() => banner.remove(), 700); }, 4000);
            } else {
                if (subtextEl) subtextEl.innerHTML = 'Đang chậm hơn thường lệ. Điểm sẽ được cập nhật sau khi giáo viên xem xét.';
                if (timerEl) timerEl.textContent = '';
                const spinner = document.getElementById('aiGradingSpinner');
                if (spinner) spinner.style.animationPlayState = 'paused';
            }
        };

        const poll = async () => {
            pollCount++;
            updateTimer();
            try {
                const params = new URLSearchParams({ code });
                if (userId) params.set('userId', userId);
                const res = await fetch(`/api/exams/${examId}/my-grades?${params}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.grades && data.grades.length > 0) {
                    this.updateEssayGradeCards(data.grades);
                }

                if (!data.pending) {
                    // All graded (or no essays)
                    finish(true);
                } else if (Date.now() - startedAt > MAX_WAIT_MS) {
                    finish(false);
                }
            } catch (e) { /* network hiccup, keep trying */ }
        };

        this._timerTick = setInterval(updateTimer, 1000);
        this._pollTimer = setInterval(poll, POLL_INTERVAL);
        // First poll after a short delay
        setTimeout(poll, 2000);
    }

    updateEssayGradeCards(grades) {
        for (const grade of grades) {
            const slot = document.getElementById(`grade-slot-${grade.questionId}`);
            if (!slot) continue;
            if (grade.aiScore === null || grade.aiScore === undefined) continue;

            const maxScore = grade.aiMaxScore || 10;
            const displayScore = grade.teacherScore !== null && grade.teacherScore !== undefined
                ? grade.teacherScore
                : grade.aiScore;
            const pct = Math.round((displayScore / maxScore) * 100);
            const scoreColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
            const scoreBg = pct >= 80 ? 'rgba(34,197,94,0.08)' : pct >= 50 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)';
            const isTeacherOverride = grade.teacherScore !== null && grade.teacherScore !== undefined;

            slot.innerHTML = `
                <div style="margin-top:1rem;border-radius:14px;overflow:hidden;
                    border:1px solid ${isTeacherOverride ? 'rgba(34,197,94,0.3)' : 'rgba(99,102,241,0.2)'};
                    background:var(--bg-card,#18181b);">

                    <!-- Score header -->
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.85rem 1.25rem;
                        background:${isTeacherOverride ? 'rgba(34,197,94,0.07)' : 'rgba(99,102,241,0.07)'};
                        border-bottom:1px solid rgba(255,255,255,0.06);">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                            <span style="font-size:1rem;">${isTeacherOverride ? '👩‍🏫' : '🤖'}</span>
                            <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">
                                ${isTeacherOverride ? 'Giáo viên chấm điểm' : 'Kết quả chấm'}
                            </span>
                        </div>
                        <div style="display:flex;align-items:baseline;gap:0.3rem;">
                            <span style="font-size:1.6rem;font-weight:900;color:${scoreColor};">${displayScore}</span>
                            <span style="font-size:0.85rem;color:var(--text-muted);">/&thinsp;${maxScore}</span>
                            ${isTeacherOverride && grade.aiScore !== null ? `
                            <span style="margin-left:0.4rem;font-size:0.72rem;color:var(--text-muted);
                                text-decoration:line-through;opacity:0.6;">(AI: ${grade.aiScore})</span>` : ''}
                        </div>
                    </div>

                    <!-- AI Feedback -->
                    ${(grade.aiFeedback || grade.aiBreakdown) ? `
                    <div style="padding:0.9rem 1.25rem;border-bottom:${grade.teacherFeedback ? '1px solid rgba(255,255,255,0.06)' : 'none'};">
                        <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);
                            text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">🤖 Nhận xét</div>
                        ${grade.aiFeedback ? `
                        <div style="font-size:0.88rem;color:var(--text-secondary,#cbd5e1);line-height:1.6;">${renderMarkdown(grade.aiFeedback)}</div>` : ''}
                        ${grade.aiBreakdown ? `
                        <div style="margin-top:0.5rem;padding:0.6rem 0.8rem;background:rgba(255,255,255,0.03);
                            border-radius:8px;font-size:0.8rem;color:var(--text-muted);
                            font-family:inherit;line-height:1.55;">${renderMarkdown(grade.aiBreakdown)}</div>` : ''}
                    </div>` : ''}

                    <!-- Teacher feedback (override) -->
                    ${grade.teacherFeedback ? `
                    <div style="padding:0.9rem 1.25rem;">
                        <div style="font-size:0.72rem;font-weight:700;color:#16a34a;
                            text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">👩‍🏫 Nhận xét của giáo viên</div>
                        <div style="font-size:0.88rem;color:var(--text-main);line-height:1.6;">${renderMarkdown(grade.teacherFeedback)}</div>
                    </div>` : ''}
                </div>`;
        }
    }

    buildVideoHtml(url) {

        if (!url) return '';
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
            return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-top:0.5rem;">
                <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
            </div>`;
        }
        const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
            return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-top:0.5rem;">
                <iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
            </div>`;
        }
        return `<video controls style="max-width:100%;border-radius:12px;margin-top:0.5rem;" preload="metadata"><source src="${url}"></video>`;
    }

    // ========================
    // TN5: AI "Why Wrong?" Explain
    // ========================
    async askWhyWrong(questionId, btnEl) {
        const slot = document.getElementById(`explain-slot-${questionId}`);
        if (!slot) return;

        // Get result code from sessionStorage
        const resultCodeRaw = sessionStorage.getItem('easyrevise_result_code');
        let code = null;
        if (resultCodeRaw) {
            try { const rc = JSON.parse(resultCodeRaw); if (rc.examId === this.results.examId) code = rc.code; } catch (e) { }
        }
        if (!code) {
            const unlockedLS = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
            code = unlockedLS[this.results.examId] || null;
        }
        if (!code) { slot.innerHTML = '<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;">⚠️ Không tìm thấy mã kích hoạt để dùng tính năng này.</p>'; return; }

        // Find question data
        const q = this.questionsList.find(q => String(q.id) === String(questionId));
        const resultEntry = this.results.results.find(r => String(r.id) === String(questionId));
        if (!q || !resultEntry) return;

        // Show loading
        btnEl.disabled = true;
        btnEl.textContent = '⏳ Đang hỏi AI...';
        btnEl.style.opacity = '0.7';

        // FIX-5: lấy userId và completedAt để server tìm đúng bài nộp
        const userId = JSON.parse(localStorage.getItem('easyrevise_user') || '{}').id || null;
        const completedAt = this.results.completedAt || this.results.savedAt || null;

        try {
            const res = await fetch(`/api/exams/${this.results.examId}/explain-wrong`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    questionId: String(questionId),
                    userAnswer: resultEntry.userAnswer,
                    correctAnswer: q.correctAnswer,
                    questionText: q.question || '',
                    options: q.options || [],
                    explanation: q.explanation || '',
                    userId,
                    completedAt
                })
            });
            const data = await res.json();
            if (!res.ok) {
                slot.innerHTML = `<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;background:#fef2f2;padding:0.5rem 0.75rem;border-radius:8px;">⚠️ ${data.error || 'Lỗi không rõ'}</p>`;
                return;
            }
            const limitInfo = data.limit === -1 ? '' : ` (còn ${data.remaining >= 0 ? data.remaining : '∞'} lần)`;
            slot.innerHTML = `
                <div style="margin-top:0.75rem;border-radius:14px;overflow:hidden;border:1px solid rgba(99,102,241,0.25);">
                    <div style="padding:0.65rem 1rem;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.07));border-bottom:1px solid rgba(99,102,241,0.12);display:flex;align-items:center;gap:0.5rem;">
                        <span>🤖</span>
                        <span style="font-size:0.75rem;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;">AI Giải Thích${limitInfo}</span>
                    </div>
                    <div style="padding:0.9rem 1rem;font-size:0.88rem;color:var(--text-main);line-height:1.65;">${renderMarkdown(data.explanation)}</div>
                </div>`;
            // Re-render KaTeX if available
            if (typeof renderMathInElement === 'function') {
                renderMathInElement(slot, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false });
            }
        } catch (err) {
            slot.innerHTML = `<p style="font-size:0.82rem;color:#dc2626;margin-top:0.5rem;">❌ ${err.message}</p>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window._resultApp = new ResultApp(); });

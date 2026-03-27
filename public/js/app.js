// EasyRevise - Exam Engine with Navigator + Auth + History

class ExamApp {
    constructor() {
        this.examData = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.totalQuestions = 0;
        this.questionsList = [];
        this.examId = null;
        this.startTime = parseInt(localStorage.getItem(`easyrevise_startTime_${new URLSearchParams(window.location.search).get('id')}`)) || Date.now();
        this.visitedQuestions = new Set();
        this.flaggedQuestions = new Set();
        this.isMobile = window.innerWidth <= 768;

        // DOM
        this.examTitle = document.getElementById('examTitle');
        this.sectionTitle = document.getElementById('sectionTitle');
        this.progressBar = document.getElementById('progressBar');
        this.questionCount = document.getElementById('questionCount');
        this.completionPercent = document.getElementById('completionPercent');
        this.instruction = document.getElementById('instruction');
        this.passageContainer = document.getElementById('passageContainer');
        this.questionText = document.getElementById('questionText');
        this.optionGrid = document.getElementById('optionGrid');
        this.essayArea = document.getElementById('essayArea');
        this.cuesList = document.getElementById('cuesList');
        this.essayInput = document.getElementById('essayInput');
        this.countdown = document.getElementById('countdown');
        this.flagBtn = document.getElementById('flagBtn');

        // Nav buttons (desktop + mobile)
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.submitBtn = document.getElementById('submitBtn');
        this.prevBtnM = document.getElementById('prevBtnM');
        this.nextBtnM = document.getElementById('nextBtnM');
        this.submitBtnM = document.getElementById('submitBtnM');

        this.init();
    }

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        this.examId = urlParams.get('id');

        if (!this.examId) {
            window.location.href = '/';
            return;
        }

        try {
            const headers = {};
            const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
            if (unlocked[this.examId]) headers['x-access-code'] = unlocked[this.examId];
            const token = localStorage.getItem('easyrevise_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`/api/exams/${this.examId}`, { headers });
            if (!res.ok) throw new Error('Exam not found');
            this.examData = await res.json();
        } catch (err) {
            alert('Không tìm thấy đề thi!');
            window.location.href = '/';
            return;
        }

        // If exam returned no sections (code issue), redirect
        if (!this.examData.sections || this.examData.sections.length === 0) {
            if (this.examData.requireCode) {
                // Clear stale unlock data
                const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
                delete unlocked[this.examId];
                localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked));
                alert('Mã kích hoạt không hợp lệ hoặc đã hết hạn. Vui lòng nhập lại.');
            } else {
                alert('Đề thi chưa có câu hỏi!');
            }
            window.location.href = '/';
            return;
        }

        // Flatten
        this.examData.sections.forEach(section => {
            if (section.type === 'writing-essay') {
                this.questionsList.push({ ...section, isEssay: true, sectionTitle: section.title });
            } else if (section.type === 'free-form') {
                // free-form: the whole section is one "question" with subParts
                this.questionsList.push({
                    ...section,
                    id: section.id,
                    isEssay: false,
                    isFreeForm: true,
                    sectionTitle: section.title,
                    instruction: section.instruction || ''
                });
            } else {
                (section.questions || []).forEach(q => {
                    this.questionsList.push({
                        ...q, isEssay: false, sectionTitle: section.title,
                        instruction: section.instruction, passage: section.passage || null,
                        isFillBlank: section.type === 'fill-in-blank'
                    });
                });
            }
        });

        this.totalQuestions = this.questionsList.length;

        // Load saved progress
        const saved = localStorage.getItem(`easyrevise_progress_${this.examId}`);
        if (saved) { try { this.userAnswers = JSON.parse(saved); } catch (e) { } }

        // Load flags
        const savedFlags = localStorage.getItem(`easyrevise_flags_${this.examId}`);
        if (savedFlags) { try { this.flaggedQuestions = new Set(JSON.parse(savedFlags)); } catch (e) { } }

        // Save as in-progress
        this.saveInProgress();

        // Save startTime
        localStorage.setItem(`easyrevise_startTime_${this.examId}`, this.startTime);

        this.buildQuestionGrid();
        this.attachEventListeners();
        this.startTimer();
        this.visitedQuestions.add(0);
        this.renderQuestion();
    }

    buildQuestionGrid() {
        const grids = [document.getElementById('qGrid'), document.getElementById('qGridM')];
        grids.forEach(grid => {
            if (!grid) return;
            grid.innerHTML = '';
            for (let i = 0; i < this.totalQuestions; i++) {
                const cell = document.createElement('button');
                cell.className = 'q-cell';
                cell.textContent = i + 1;
                cell.setAttribute('data-index', i);
                cell.onclick = () => {
                    this.currentQuestionIndex = i;
                    this.visitedQuestions.add(i);
                    this.renderQuestion();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                };
                grid.appendChild(cell);
            }
        });
    }

    updateQuestionGrid() {
        const grids = [document.getElementById('qGrid'), document.getElementById('qGridM')];
        grids.forEach(grid => {
            if (!grid) return;
            const cells = grid.querySelectorAll('.q-cell');
            cells.forEach((cell, i) => {
                const q = this.questionsList[i];
                cell.className = 'q-cell';
                if (this.userAnswers[q.id] !== undefined) cell.classList.add('answered');
                else if (this.visitedQuestions.has(i)) cell.classList.add('visited');
                if (this.flaggedQuestions.has(i)) cell.classList.add('flagged');
                if (i === this.currentQuestionIndex) cell.classList.add('active');
            });
        });

        // Update summary
        const summary = document.getElementById('answeredSummary');
        if (summary) {
            const answered = Object.keys(this.userAnswers).length;
            summary.textContent = `${answered}/${this.totalQuestions} đã trả lời`;
        }
    }

    startTimer() {
        this.timeLimit = this.examData.timeLimit ? this.examData.timeLimit * 60 : 0; // seconds
        this._essayWarnShown = false; // Phase 5: essay upload warning flag
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            if (this.timeLimit > 0) {
                const remaining = Math.max(0, this.timeLimit - elapsed);
                const min = String(Math.floor(remaining / 60)).padStart(2, '0');
                const sec = String(remaining % 60).padStart(2, '0');
                this.countdown.textContent = `${min}:${sec}`;
                // Warning colors & animations
                if (remaining <= 60) {
                    this.countdown.style.background = '#dc2626';
                    this.countdown.classList.remove('timer-warning');
                    this.countdown.classList.add('timer-danger');
                } else if (remaining <= 300) {
                    this.countdown.style.background = '#f59e0b';
                    this.countdown.classList.add('timer-warning');
                    this.countdown.classList.remove('timer-danger');
                } else {
                    this.countdown.classList.remove('timer-warning', 'timer-danger');
                }
                // Phase 5: Essay upload warning at 5 minutes
                if (remaining <= 300 && !this._essayWarnShown) {
                    const hasEssay = (this.examData.sections || []).some(s =>
                        s.type === 'writing-essay' || s.type === 'free-form'
                    );
                    if (hasEssay) {
                        this._essayWarnShown = true;
                        this._showEssayUploadWarning();
                    }
                }
                // Auto-submit
                if (remaining <= 0) {
                    clearInterval(this.timerInterval);
                    alert('⏰ Hết giờ! Bài sẽ được tự động nộp.');
                    this.submitExam(true);
                }
            } else {
                const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const sec = String(elapsed % 60).padStart(2, '0');
                this.countdown.textContent = `${min}:${sec}`;
            }
        }, 1000);
    }

    _showEssayUploadWarning() {
        // Remove existing banner if any
        const existing = document.getElementById('essayUploadWarningBanner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'essayUploadWarningBanner';
        banner.style.cssText = `
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            z-index: 9999; max-width: 480px; width: 90%;
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: white; border-radius: 16px;
            padding: 1rem 1.25rem; box-shadow: 0 8px 32px rgba(245,158,11,0.4);
            display: flex; align-items: flex-start; gap: 0.75rem;
            animation: slideDown 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        `;
        banner.innerHTML = `
            <div style="font-size:1.5rem;flex-shrink:0;">📎</div>
            <div style="flex:1;">
                <div style="font-weight:700;font-size:0.95rem;margin-bottom:0.2rem;">
                    ⚠️ Còn 5 phút — Đừng quên nộp bài tự luận!
                </div>
                <div style="font-size:0.82rem;opacity:0.92;line-height:1.5;">
                    Nếu bạn có bài viết tay hoặc file cần nộp, hãy tải ảnh/file lên ngay bây giờ trước khi hết giờ.
                </div>
            </div>
            <button onclick="document.getElementById('essayUploadWarningBanner').remove()"
                style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:8px;
                       padding:0.25rem 0.5rem;cursor:pointer;font-size:0.85rem;flex-shrink:0;">✕</button>
        `;

        // Add animation keyframes if not present
        if (!document.getElementById('essayWarnStyle')) {
            const style = document.createElement('style');
            style.id = 'essayWarnStyle';
            style.textContent = `
                @keyframes slideDown {
                    from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(banner);
        // Auto-dismiss after 12 seconds
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 12000);
    }

    attachEventListeners() {
        // Desktop nav
        if (this.prevBtn) this.prevBtn.onclick = () => this.navigate(-1);
        if (this.nextBtn) this.nextBtn.onclick = () => this.navigate(1);
        if (this.submitBtn) this.submitBtn.onclick = () => this.submitExam();

        // Mobile nav
        if (this.prevBtnM) this.prevBtnM.onclick = () => this.navigate(-1);
        if (this.nextBtnM) this.nextBtnM.onclick = () => this.navigate(1);
        if (this.submitBtnM) this.submitBtnM.onclick = () => this.submitExam();

        if (this.essayInput) {
            this.essayInput.oninput = (e) => {
                const currentQ = this.questionsList[this.currentQuestionIndex];
                const current = this.userAnswers[currentQ.id];
                if (typeof current === 'object' && current !== null) {
                    current.text = e.target.value;
                    this.userAnswers[currentQ.id] = current;
                } else {
                    this.userAnswers[currentQ.id] = e.target.value;
                }
                this.saveProgress();
                this.updateQuestionGrid();
            };
        }

        document.onkeydown = (e) => {
            if (e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft') this.navigate(-1);
            if (e.key === 'ArrowRight') this.navigate(1);
            if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
                const idx = e.key.toLowerCase().charCodeAt(0) - 97;
                const q = this.questionsList[this.currentQuestionIndex];
                if (!q.isEssay && q.options && idx < q.options.length) {
                    this.userAnswers[q.id] = idx;
                    this.saveProgress();
                    this.renderQuestion();
                    setTimeout(() => this.navigate(1), 250);
                }
            }
        };

        // Save progress on tab close / refresh (NOT on intentional exit/submit)
        this.intentionalExit = false;
        window.addEventListener('beforeunload', (e) => {
            if (!this.intentionalExit) {
                // Unintentional: save progress so they can resume later
                this.saveProgress();
                this.saveInProgress();
                e.preventDefault();
                e.returnValue = '';
            }
            // Intentional exit (submit / discard): do NOT re-save, localStorage was already cleaned up
        });
    }

    renderQuestion() {
        const question = this.questionsList[this.currentQuestionIndex];

        this.examTitle.textContent = this.examData.title;
        this.sectionTitle.textContent = question.sectionTitle;

        const answeredCount = Object.keys(this.userAnswers).length;
        const percent = Math.round((answeredCount / this.totalQuestions) * 100);
        this.progressBar.style.width = `${percent}%`;
        this.questionCount.textContent = `Câu ${this.currentQuestionIndex + 1}/${this.totalQuestions}`;
        this.completionPercent.textContent = `${percent}% Hoàn thành`;

        const qNumEl = document.getElementById('questionNumber');
        if (qNumEl) qNumEl.textContent = `Câu ${this.currentQuestionIndex + 1} / ${this.totalQuestions}`;

        // Flag button
        if (this.flagBtn) {
            if (this.flaggedQuestions.has(this.currentQuestionIndex)) {
                this.flagBtn.classList.add('flagged');
                this.flagBtn.innerHTML = '⚑ Bỏ đánh dấu';
            } else {
                this.flagBtn.classList.remove('flagged');
                this.flagBtn.innerHTML = '⚑ Đánh dấu';
            }
        }

        this.passageContainer.style.display = 'none';
        this.optionGrid.style.display = 'none';
        this.essayArea.style.display = 'none';
        this.questionText.style.display = 'block';

        // ✅ Hide free-form container when switching to any other question type
        const ffc = document.getElementById('freeFormContainer');
        if (ffc) ffc.style.display = 'none';
        const ffuz = document.getElementById('freeFormUploadZone');
        if (ffuz) ffuz.style.display = 'none';

        if (question.isEssay) this.renderEssay(question);
        else if (question.isFillBlank) this.renderFillInBlank(question);
        else if (question.isFreeForm) this.renderFreeForm(question);
        else this.renderMultipleChoice(question);

        // Nav visibility
        const isFirst = this.currentQuestionIndex === 0;
        const isLast = this.currentQuestionIndex === this.totalQuestions - 1;

        [this.prevBtn, this.prevBtnM].forEach(btn => { if (btn) btn.style.visibility = isFirst ? 'hidden' : 'visible'; });

        [this.nextBtn, this.nextBtnM].forEach(btn => { if (btn) btn.style.display = isLast ? 'none' : 'inline-flex'; });
        [this.submitBtn, this.submitBtnM].forEach(btn => { if (btn) btn.style.display = isLast ? 'inline-flex' : 'none'; });

        this.updateQuestionGrid();

        // Animation
        const wrapper = document.getElementById('questionWrapper');
        wrapper.style.animation = 'none';
        wrapper.offsetHeight;
        wrapper.style.animation = 'fadeIn 0.3s ease';

        // Render math formulas with KaTeX
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(wrapper, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
    }

    renderMultipleChoice(question) {
        const instr = question.instruction || '';
        this.instruction.textContent = instr;
        this.instruction.style.display = instr ? '' : 'none';
        if (question.passage) {
            this.passageContainer.style.display = 'block';
            this.passageContainer.innerHTML = question.passage.replace(/\n/g, '<br>');
        }
        this.questionText.textContent = question.question;

        // Render question media (image/video, with optional hint mode)
        this.renderQuestionMedia(question);

        this.optionGrid.style.display = 'flex';
        this.optionGrid.innerHTML = '';

        const optImgs = question.optionImages || [];

        question.options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            if (this.userAnswers[question.id] === index) btn.classList.add('selected');
            const labelKey = String.fromCharCode(65 + index);
            const imgHtml = optImgs[index] ? `<div style="margin-top:0.4rem;"><img src="${optImgs[index]}" alt="" style="max-width:160px;max-height:120px;border-radius:8px;object-fit:cover;pointer-events:none;"></div>` : '';
            btn.innerHTML = `<div class="option-label">${labelKey}</div><div class="option-text">${option}${imgHtml}</div>`;
            btn.onclick = () => {
                this.userAnswers[question.id] = index;
                this.saveProgress();
                document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.updateQuestionGrid();
                setTimeout(() => this.navigate(1), 300);
            };
            this.optionGrid.appendChild(btn);
        });
    }

    renderEssay(question) {
        const instr = question.instruction || '';
        this.instruction.textContent = instr;
        this.instruction.style.display = instr ? '' : 'none';
        this.questionText.textContent = question.prompt || '';

        // Render question media
        this.renderQuestionMedia(question);

        this.essayArea.style.display = 'block';
        const savedAns = this.userAnswers[question.id];
        this.essayInput.value = (typeof savedAns === 'object' && savedAns !== null) ? (savedAns.text || '') : (savedAns || '');
        this.cuesList.innerHTML = '';
        const cues = question.cues || [];
        cues.forEach(cue => {
            const li = document.createElement('li');
            li.textContent = cue;
            this.cuesList.appendChild(li);
        });
        // Hide cues wrapper if empty
        const cuesWrapper = this.cuesList.parentElement;
        if (cuesWrapper) cuesWrapper.style.display = cues.length ? '' : 'none';

        // Upload zone
        let uploadZone = document.getElementById('essayUploadZone');
        if (!uploadZone) {
            uploadZone = document.createElement('div');
            uploadZone.id = 'essayUploadZone';
            this.essayArea.appendChild(uploadZone);
        }
        const attachments = (typeof savedAns === 'object' && savedAns?.attachments) ? savedAns.attachments : [];
        this.renderEssayUploadZone(question.id, attachments);
    }

    renderEssayUploadZone(questionId, attachments = []) {
        const zone = document.getElementById('essayUploadZone');
        if (!zone) return;
        const attachList = attachments.map((url, i) => {
            const isPdf = url.endsWith('.pdf');
            return `<div class="essay-attach-item">
                ${isPdf
                    ? `<div class="essay-attach-pdf">📄 <a href="${url}" target="_blank" style="color:var(--primary);font-size:0.8rem;">PDF bài làm</a></div>`
                    : `<img src="${url}" class="essay-attach-thumb" onclick="this.classList.toggle('zoomed')" alt="Ảnh bài làm ${i + 1}">`}
                <button class="essay-attach-remove" onclick="window._examApp.removeEssayAttachment('${questionId}', ${i})" title="Xóa">✕</button>
            </div>`;
        }).join('');

        zone.innerHTML = `
            <div class="essay-upload-area">
                <div class="essay-attach-list">${attachList}</div>
                <label class="essay-upload-btn" title="Tối đa 10MB - JPG/PNG/WebP/PDF">
                    📷 Thêm ảnh/PDF bài làm
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:none"
                        onchange="window._examApp.handleEssayFileInput(event, '${questionId}')">
                </label>
                ${attachments.length > 0 ? `<span style="font-size:0.75rem;color:var(--text-muted);">${attachments.length} file đính kèm</span>` : ''}
            </div>`;
    }

    async handleEssayFileInput(event, questionId) {
        const file = event.target.files[0];
        if (!file) return;
        await this.uploadSubmissionFile(questionId, file);
        event.target.value = '';
    }

    async uploadSubmissionFile(questionId, file) {
        const zone = document.getElementById('essayUploadZone');
        if (zone) { zone.dataset.prevHtml = zone.innerHTML; zone.innerHTML = '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">⏳ Đang tải lên...</div>'; }
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('examId', this.examId);
            formData.append('questionId', questionId);
            const unlocked2b = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');  // TASK 2b
            const codeVal2b = unlocked2b[this.examId] || '';                                      // TASK 2b
            if (codeVal2b) formData.append('code', codeVal2b);                                    // TASK 2b

            const headers = {};
            const token = localStorage.getItem('easyrevise_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (codeVal2b) headers['x-access-code'] = codeVal2b;

            const res = await fetch('/api/upload-submission', { method: 'POST', headers, body: formData });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload thất bại'); }
            const { url } = await res.json();

            // Save to userAnswers
            const current = this.userAnswers[questionId];
            let entry = (typeof current === 'object' && current !== null) ? current : { text: (typeof current === 'string' ? current : ''), attachments: [] };
            if (!entry.attachments) entry.attachments = [];
            entry.attachments.push(url);
            this.userAnswers[questionId] = entry;
            this.saveProgress();
            this.renderEssayUploadZone(questionId, entry.attachments);
        } catch (err) {
            alert('❌ ' + err.message);
            if (zone && zone.dataset.prevHtml) zone.innerHTML = zone.dataset.prevHtml;
        }
    }

    removeEssayAttachment(questionId, idx) {
        const current = this.userAnswers[questionId];
        if (!current || typeof current !== 'object') return;
        current.attachments = current.attachments.filter((_, i) => i !== idx);
        this.userAnswers[questionId] = current;
        this.saveProgress();
        this.renderEssayUploadZone(questionId, current.attachments);
    }

    renderFillInBlank(question) {
        const instr = question.instruction || '';
        this.instruction.textContent = instr;
        this.instruction.style.display = instr ? '' : 'none';

        const blanks = question.blanks || [];
        let blankIndex = 0;

        // ✅ Flexible blank marker: support ___, __, and space-padded _
        const rawQ = question.question || '';
        let parts;
        if (rawQ.includes('___')) {
            parts = rawQ.split('___');
        } else if (rawQ.includes('__')) {
            parts = rawQ.split('__');
        } else {
            // Single _ : split on any standalone underscore (may be surrounded by spaces)
            parts = rawQ.split(/(?<!\S)_(?!\S)/);      // negative lookbehind/ahead
            if (parts.length === 1) {
                // Fallback: just split on _ regardless
                parts = rawQ.split('_');
            }
        }

        let html = '';
        parts.forEach((part, i) => {
            html += `<span>${part.replace(/\n/g, '<br>')}</span>`;
            if (i < parts.length - 1) {
                const blank = blanks[blankIndex] || { index: blankIndex, answer: '', type: 'text' };
                const savedAns = this.userAnswers[question.id];
                const savedVal = (savedAns && savedAns[blankIndex] !== undefined) ? savedAns[blankIndex] : '';
                html += `<input type="text" class="fill-blank-input" data-blank-index="${blankIndex}" value="${savedVal}" placeholder="..."
                    style="display:inline-block;min-width:80px;max-width:180px;border:none;border-bottom:2px solid var(--primary,#6366f1);padding:0.1rem 0.4rem;background:transparent;font-size:inherit;font-family:inherit;color:inherit;outline:none;margin:0 0.2rem;text-align:center;"
                    oninput="window._examApp.saveFillBlank('${question.id}', ${blankIndex}, this.value)">`;
                blankIndex++;
            }
        });
        this.questionText.innerHTML = html;
        this.optionGrid.style.display = 'none';
        this.renderQuestionMedia(question);
    }

    saveFillBlank(questionId, blankIndex, value) {
        if (!this.userAnswers[questionId]) this.userAnswers[questionId] = {};
        this.userAnswers[questionId][blankIndex] = value;
        this.saveProgress();
        this.updateQuestionGrid();
    }

    renderFreeForm(question) {
        // Respect showInstruction toggle (admin can hide it)
        if (question.showInstruction !== false && question.instruction) {
            this.instruction.textContent = question.instruction;
            this.instruction.style.display = '';  // use default (inline block per CSS)
        } else {
            this.instruction.textContent = '';
            this.instruction.style.display = 'none';
        }
        this.questionText.style.display = 'none';
        this.optionGrid.style.display = 'none';
        this.essayArea.style.display = 'none';
        this.renderQuestionMedia(question);

        const savedAns = this.userAnswers[question.id] || {}; // { parts: {0:'', 1:''}, attachments: [] }
        const parts = question.subParts || question.questions || [];
        const attachments = savedAns.attachments || [];

        // Reuse / create a free-form container
        let container = document.getElementById('freeFormContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'freeFormContainer';
            document.getElementById('questionWrapper').appendChild(container);
        }
        container.style.display = 'block';

        if (question.prompt) {
            container.innerHTML = `<div style="font-size:1.05rem;font-weight:600;color:var(--text-main);margin-bottom:1.25rem;line-height:1.6;">${question.prompt}</div>`;
        } else {
            container.innerHTML = '';
        }

        parts.forEach((part, i) => {
            const savedVal = (savedAns.parts && savedAns.parts[i] !== undefined) ? savedAns.parts[i] : '';
            const partDiv = document.createElement('div');
            partDiv.style.cssText = 'margin-bottom:1.25rem;padding:1rem;background:var(--bg-input);border-radius:12px;border:1px solid var(--border);';

            // Build per-subpart media HTML (ảnh + video gắn vào từng câu con)
            const partImgs = [];
            if (part.images && part.images.length > 0) partImgs.push(...part.images);
            else if (part.image) partImgs.push(part.image);
            if (part.imageUrl && !partImgs.includes(part.imageUrl)) partImgs.push(part.imageUrl);

            let partMediaHtml = '';
            if (partImgs.length === 1) {
                partMediaHtml += `<div style="margin:0.5rem 0;"><img src="${partImgs[0]}" alt="" style="max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.maxWidth='none';}else{this.style='max-width:100%;max-height:300px;border-radius:10px;cursor:zoom-in;object-fit:contain';}"></div>`;
            } else if (partImgs.length > 1) {
                partMediaHtml += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.5rem 0;">`;
                partImgs.forEach((src, idx) => {
                    partMediaHtml += `<img src="${src}" alt="Hình ${idx + 1}" style="max-width:180px;max-height:150px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.maxWidth='none';}else{this.style='max-width:180px;max-height:150px;border-radius:8px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0';}">`;
                });
                partMediaHtml += `</div>`;
            }
            if (part.video) {
                partMediaHtml += this.buildVideoHtml(part.video);
            }

            // Hint mode (mediaAsHint) — ẩn sau nút gợi ý
            if (partMediaHtml && part.mediaAsHint) {
                partMediaHtml = `<div style="margin:0.5rem 0;">
                    <button onclick="this.nextElementSibling.style.display='block';this.style.display='none';"
                        style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:0.3rem 0.8rem;border-radius:8px;cursor:pointer;font-size:0.82rem;">
                        💡 Xem gợi ý
                    </button>
                    <div style="display:none;margin-top:0.4rem;">${partMediaHtml}</div>
                </div>`;
            } else if (partMediaHtml) {
                partMediaHtml = `<div style="margin:0.5rem 0;">${partMediaHtml}</div>`;
            }

            partDiv.innerHTML = `
                <div style="font-size:0.88rem;font-weight:700;color:var(--primary);margin-bottom:0.5rem;">
                    ${part.label ? `(${part.label})` : `Câu ${i + 1}`}
                    ${part.question ? `<span style="font-weight:500;color:var(--text-main);margin-left:0.4rem;">${part.question}</span>` : ''}
                </div>
                ${partMediaHtml}
                <input type="text" class="freeform-part-input"
                    placeholder="Nhập đáp số hoặc câu trả lời..."
                    value="${savedVal.replace(/"/g, '&quot;')}"
                    data-part-index="${i}"
                    oninput="window._examApp.saveFreeFormPart('${question.id}', ${i}, this.value)"
                    style="width:100%;padding:0.55rem 0.8rem;border:1.5px solid var(--border);border-radius:8px;
                        background:white;font-size:0.95rem;font-family:inherit;color:var(--text-main);
                        transition:border-color 0.15s;outline:none;"
                    onfocus="this.style.borderColor='var(--primary)'"
                    onblur="this.style.borderColor='var(--border)'">`;
            container.appendChild(partDiv);
        });

        // Upload zone (reuse essay upload zone logic)
        let uploadZone = document.getElementById('freeFormUploadZone');
        if (!uploadZone) {
            uploadZone = document.createElement('div');
            uploadZone.id = 'freeFormUploadZone';
            container.appendChild(uploadZone);
        } else {
            container.appendChild(uploadZone);
        }
        this._renderFreeFormUpload(question.id, attachments);
    }

    _renderFreeFormUpload(questionId, attachments = []) {
        const zone = document.getElementById('freeFormUploadZone');
        if (!zone) return;
        const thumbs = attachments.map((url, i) => {
            const isPdf = url.endsWith('.pdf');
            return `<div class="essay-attach-item">
                ${isPdf
                    ? `<div class="essay-attach-pdf">📄 <a href="${url}" target="_blank" style="color:var(--primary);font-size:0.8rem;">PDF</a></div>`
                    : `<img src="${url}" class="essay-attach-thumb" onclick="this.classList.toggle('zoomed')" alt="Ảnh ${i + 1}">`}
                <button class="essay-attach-remove" onclick="window._examApp.removeFreeFormAttachment('${questionId}', ${i})" title="Xóa">✕</button>
            </div>`;
        }).join('');

        zone.innerHTML = `<div class="essay-upload-area" style="margin-top:0.75rem;">
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.5rem;font-weight:600;">📎 Đính kèm bài làm (tuỳ chọn)</div>
            <div class="essay-attach-list">${thumbs}</div>
            <label class="essay-upload-btn" title="Tối đa 10MB - JPG/PNG/WebP/PDF">
                📷 Thêm ảnh/PDF
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:none"
                    onchange="window._examApp.handleFreeFormFileInput(event, '${questionId}')">
            </label>
            ${attachments.length > 0 ? `<span style="font-size:0.75rem;color:var(--text-muted);">${attachments.length} file</span>` : ''}
        </div>`;
    }

    saveFreeFormPart(questionId, partIndex, value) {
        const current = this.userAnswers[questionId] || { parts: {}, attachments: [] };
        if (!current.parts) current.parts = {};
        current.parts[partIndex] = value;
        this.userAnswers[questionId] = current;
        this.saveProgress();
        this.updateQuestionGrid();
    }

    async handleFreeFormFileInput(event, questionId) {
        const file = event.target.files[0];
        if (!file) return;
        await this.uploadFreeFormFile(questionId, file);
        event.target.value = '';
    }

    async uploadFreeFormFile(questionId, file) {
        const zone = document.getElementById('freeFormUploadZone');
        if (zone) { zone.dataset.prevHtml = zone.innerHTML; zone.innerHTML = '<div style="padding:0.75rem;text-align:center;color:var(--text-muted);font-size:0.85rem;">⏳ Đang tải lên...</div>'; }
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('examId', this.examId);                                              // TASK 2a
            const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
            const codeVal = unlocked[this.examId] || '';
            if (codeVal) formData.append('code', codeVal);                                       // TASK 2a
            const headers = {};
            const token = localStorage.getItem('easyrevise_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            if (codeVal) headers['x-access-code'] = codeVal;                                    // keep backward compat
            const res = await fetch('/api/upload-submission', { method: 'POST', headers, body: formData });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload thất bại'); }
            const { url } = await res.json();
            const current = this.userAnswers[questionId] || { parts: {}, attachments: [] };
            if (!current.attachments) current.attachments = [];
            current.attachments.push(url);
            this.userAnswers[questionId] = current;
            this.saveProgress();
            this._renderFreeFormUpload(questionId, current.attachments);
        } catch (err) {
            alert('❌ ' + err.message);
            if (zone && zone.dataset.prevHtml) zone.innerHTML = zone.dataset.prevHtml;
        }
    }

    removeFreeFormAttachment(questionId, idx) {
        const current = this.userAnswers[questionId];
        if (!current) return;
        current.attachments = (current.attachments || []).filter((_, i) => i !== idx);
        this.userAnswers[questionId] = current;
        this.saveProgress();
        this._renderFreeFormUpload(questionId, current.attachments);
    }

    renderQuestionMedia(question) {
        const imgContainer = document.getElementById('questionImageContainer');
        const hintContainer = document.getElementById('questionHintContainer');
        if (!imgContainer || !hintContainer) return;

        // Reset
        imgContainer.innerHTML = ''; imgContainer.style.display = 'none';
        hintContainer.innerHTML = ''; hintContainer.style.display = 'none';

        // Collect all images: images[] takes priority and extends image (legacy)
        const allImages = [];
        if (question.images && question.images.length > 0) {
            allImages.push(...question.images);
        } else if (question.image) {
            allImages.push(question.image); // backward compat
        }
        // Also include legacy imageUrl (from AI crop)
        if (question.imageUrl && !allImages.includes(question.imageUrl)) {
            allImages.push(question.imageUrl);
        }

        const hasVideo = !!question.video;
        if (!allImages.length && !hasVideo) return;

        let mediaHtml = '';

        if (allImages.length === 1) {
            mediaHtml += `<img src="${allImages[0]}" alt="" style="max-width:350px;width:100%;border-radius:12px;cursor:zoom-in;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:350px;width:100%;border-radius:12px;cursor:zoom-in;';}">`;
        } else if (allImages.length > 1) {
            // Grid layout for multiple images
            mediaHtml += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.5rem;">`;
            allImages.forEach((src, i) => {
                mediaHtml += `<img src="${src}" alt="Hình ${i + 1}" style="max-width:200px;max-height:180px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:200px;max-height:180px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0';}">`;
            });
            mediaHtml += `</div>`;
        }

        if (hasVideo) {
            mediaHtml += this.buildVideoHtml(question.video);
        }

        if (question.mediaAsHint) {
            // Hint mode: hidden behind button
            hintContainer.style.display = 'block';
            hintContainer.innerHTML = `
                <button class="btn btn-sm" onclick="this.nextElementSibling.style.display='block';this.style.display='none';" 
                    style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:0.4rem 1rem;border-radius:8px;cursor:pointer;font-size:0.85rem;">
                    💡 Xem gợi ý
                </button>
                <div style="display:none;margin-top:0.5rem;">${mediaHtml}</div>`;
        } else {
            // Direct display
            imgContainer.style.display = 'block';
            imgContainer.innerHTML = mediaHtml;
        }
    }

    buildVideoHtml(url) {
        if (!url) return '';
        // YouTube
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
            return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-top:0.5rem;">
                <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
            </div>`;
        }
        // Google Drive
        const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
            return `<div style="position:relative;padding-bottom:56.25%;height:0;border-radius:12px;overflow:hidden;margin-top:0.5rem;">
                <iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;" allowfullscreen></iframe>
            </div>`;
        }
        // Direct video (mp4 etc)
        return `<video controls style="max-width:100%;border-radius:12px;margin-top:0.5rem;" preload="metadata"><source src="${url}"></video>`;
    }


    navigate(direction) {
        const nextIndex = this.currentQuestionIndex + direction;
        if (nextIndex >= 0 && nextIndex < this.totalQuestions) {
            this.currentQuestionIndex = nextIndex;
            this.visitedQuestions.add(nextIndex);
            this.renderQuestion();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    saveProgress() {
        localStorage.setItem(`easyrevise_progress_${this.examId}`, JSON.stringify(this.userAnswers));
        this.saveInProgress();
    }

    saveInProgress() {
        const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
        inProgress[this.examId] = {
            examTitle: this.examData?.title || '',
            answeredCount: Object.keys(this.userAnswers).length,
            totalQuestions: this.totalQuestions,
            lastAccessed: Date.now(),
            currentQuestion: this.currentQuestionIndex
        };
        localStorage.setItem('easyrevise_in_progress', JSON.stringify(inProgress));
    }

    exitExam() {
        this.showExitModal();
    }

    showExitModal() {
        // Remove old modal if exists
        document.getElementById('exitModal')?.remove();
        const answeredCount = Object.keys(this.userAnswers).length;
        const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        const hasCode = !!unlocked[this.examId];
        const modal = document.createElement('div');
        modal.id = 'exitModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = `<div style="background:white;border-radius:16px;padding:2rem;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="font-size:1.15rem;font-weight:700;margin-bottom:0.75rem;">⚠️ Thoát bài thi?</h3>
            <p style="color:#64748b;font-size:0.9rem;line-height:1.5;margin-bottom:0.5rem;">Bạn đã trả lời <strong>${answeredCount}/${this.totalQuestions}</strong> câu.</p>
            ${hasCode ? '<p style="color:#92400e;font-size:0.82rem;background:#fef3c7;padding:0.5rem 0.75rem;border-radius:8px;margin-bottom:0.75rem;">🔑 Mã kích hoạt sẽ được giữ lại. Bạn có thể quay lại làm tiếp.</p>' : ''}
            <div style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem;">
                <button onclick="window._examApp.exitKeepProgress()" style="padding:0.6rem 1rem;border-radius:10px;border:none;background:#3b82f6;color:white;font-weight:600;cursor:pointer;font-size:0.9rem;">💾 Thoát & lưu tiến độ</button>
                <button onclick="window._examApp.exitDiscardProgress()" style="padding:0.6rem 1rem;border-radius:10px;border:1px solid #e2e8f0;background:white;color:#dc2626;font-weight:600;cursor:pointer;font-size:0.9rem;">🗑️ Thoát & xoá tiến độ</button>
                <button onclick="document.getElementById('exitModal').remove()" style="padding:0.5rem 1rem;border-radius:10px;border:none;background:#f1f5f9;color:#475569;font-weight:500;cursor:pointer;font-size:0.85rem;">← Tiếp tục làm bài</button>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }

    exitKeepProgress() {
        this.intentionalExit = true;
        this.saveProgress();
        this.saveInProgress();
        document.getElementById('exitModal')?.remove();
        window.location.href = '/';
    }

    exitDiscardProgress() {
        this.intentionalExit = true;
        const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        const code = unlocked[this.examId];
        if (code) this.cancelCodeUsage(code);
        localStorage.removeItem(`easyrevise_progress_${this.examId}`);
        localStorage.removeItem(`easyrevise_flags_${this.examId}`);
        localStorage.removeItem(`easyrevise_startTime_${this.examId}`);
        const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
        delete inProgress[this.examId];
        localStorage.setItem('easyrevise_in_progress', JSON.stringify(inProgress));
        const unlocked2 = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        delete unlocked2[this.examId];
        localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlocked2));
        document.getElementById('exitModal')?.remove();
        window.location.href = '/';
    }

    async cancelCodeUsage(code) {
        try {
            const userId = JSON.parse(localStorage.getItem('easyrevise_user') || '{}').id || 'anonymous';
            await fetch(`/api/exams/${this.examId}/cancel-code`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, userId })
            });
        } catch (e) { /* silent */ }
    }

    async submitExam(auto = false) {
        if (!auto) {
            // Count answered
            const answeredCount = this.questionsList.filter(q => {
                const ans = this.userAnswers[q.id];
                if (ans === undefined) return false;
                if (q.isFreeForm) {
                    const parts = ans && ans.parts ? ans.parts : {};
                    return Object.values(parts).some(v => v && String(v).trim());
                }
                return true;
            }).length;
            if (answeredCount < this.totalQuestions) {
                const unanswered = this.totalQuestions - answeredCount;
                // Find which questions are unanswered (by index for display)
                const unansweredIndices = this.questionsList
                    .map((q, i) => {
                        const ans = this.userAnswers[q.id];
                        if (ans === undefined) return i + 1;
                        if (q.isFreeForm) {
                            const parts = ans && ans.parts ? ans.parts : {};
                            return Object.values(parts).some(v => v && String(v).trim()) ? null : i + 1;
                        }
                        return null;
                    })
                    .filter(Boolean);
                const confirmed = await this._showSubmitConfirmModal(unanswered, unansweredIndices);
                if (!confirmed) return;
            }
        }

        // TN3: Guest Name — show custom input modal if not logged in
        const userObj = JSON.parse(localStorage.getItem('easyrevise_user') || '{}');
        let displayName = userObj.displayName || userObj.username || null;
        if (!displayName) {
            let guestName = sessionStorage.getItem(`easyrevise_guest_name_${this.examId}`);
            if (!guestName) {
                guestName = await this._showGuestNameModal();
                if (guestName && guestName.trim()) {
                    sessionStorage.setItem(`easyrevise_guest_name_${this.examId}`, guestName.trim());
                }
            }
            displayName = (guestName || '').trim() || 'Ẩn danh';
        }

        this.intentionalExit = true;
        if (this.timerInterval) clearInterval(this.timerInterval);

        let correct = 0, incorrect = 0, skipped = 0;
        const results = this.questionsList.map(q => {
            const userAns = this.userAnswers[q.id];
            let isCorrect = false;
            if (q.isEssay) {
                // Normalize essay answer: support both string and {text, attachments} formats
                const textAns = (typeof userAns === 'object' && userAns !== null) ? (userAns.text || '') : (userAns || '');
                const attachments = (typeof userAns === 'object' && userAns !== null) ? (userAns.attachments || []) : [];
                return { id: q.id, userAnswer: textAns, attachments, isCorrect: null, isEssay: true };
            }
            if (q.isFreeForm) {
                const parts = (userAns && userAns.parts) ? userAns.parts : {};
                const attachments = (userAns && userAns.attachments) ? userAns.attachments : [];
                // Serialize parts as readable text for AI grading
                const partsList = (q.subParts || q.questions || []).map((p, i) => {
                    const ans = parts[i] || '';
                    const label = p.label ? `(${p.label})` : `Phần ${i + 1}`;
                    return `${label}: ${ans || '(chưa điền)'}`;
                }).join('\n');
                const hasAny = Object.values(parts).some(v => v && String(v).trim());
                if (!hasAny && !attachments.length) skipped++;
                return { id: q.id, userAnswer: partsList, attachments, isCorrect: null, isEssay: true, isFreeFormOrigin: true };
            }
            if (q.isFillBlank) {
                const blanks = q.blanks || [];
                const answers = userAns || {};
                let allCorrect = blanks.length > 0;
                blanks.forEach((blank, i) => {
                    const given = (answers[i] || '').trim();
                    const expected = String(blank.answer || '').trim();
                    let match = false;
                    if (blank.type === 'int') match = parseInt(given) === parseInt(expected);
                    else if (blank.type === 'float') match = Math.abs(parseFloat(given) - parseFloat(expected)) <= 0.01;
                    else match = given.toLowerCase() === expected.toLowerCase();
                    if (!match) allCorrect = false;
                });
                if (Object.keys(answers).length === 0) skipped++;
                else if (allCorrect) { correct++; isCorrect = true; }
                else incorrect++;
                return { id: q.id, userAnswer: answers, isCorrect, isFillBlank: true, blanks: q.blanks };
            }
            if (userAns === undefined) skipped++;
            else if (userAns === q.correctAnswer) { correct++; isCorrect = true; }
            else incorrect++;
            return { id: q.id, userAnswer: userAns, isCorrect, correctAnswer: q.correctAnswer, isEssay: false };

        });

        const mcTotal = this.questionsList.filter(q => !q.isEssay && !q.isFreeForm).length;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

        const summary = {
            examId: this.examId, score: mcTotal > 0 ? ((correct / mcTotal) * 10).toFixed(1) : '—',
            correct, incorrect, skipped, total: mcTotal, results,
            examTitle: this.examData.title, timestamp: new Date().toLocaleString('vi-VN'), timeSpent: elapsed,
            autoSubmitted: auto
        };

        this.saveToHistory(summary);
        sessionStorage.setItem('easyrevise_final_result', JSON.stringify(summary));

        // Save result by code if applicable
        const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        const code = unlocked[this.examId];
        const userId = userObj.id;
        if (code) {
            fetch(`/api/exams/${this.examId}/code-result`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, result: summary, displayName })  // TN3: pass displayName
            }).catch(() => { });
            // Save polling context for result page
            const hasEssayOrFill = results.some(r => r.isEssay || r.isFillBlank);
            if (hasEssayOrFill) {
                sessionStorage.setItem('easyrevise_grade_poll', JSON.stringify({
                    examId: this.examId, code, userId: userId || null
                }));
            } else {
                sessionStorage.removeItem('easyrevise_grade_poll');
            }
            // Persist code briefly in sessionStorage so result.html can still fetch exam content
            sessionStorage.setItem('easyrevise_result_code', JSON.stringify({ examId: this.examId, code }));
        } else {
            // Open exam (no code) — still save to server so admin can see submissions
            fetch(`/api/exams/${this.examId}/open-result`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    result: summary,
                    userId: userId || 'anonymous',
                    displayName: displayName  // TN3: pass displayName
                })
            }).catch(() => { });
        }

        // Remove in-progress + unlock so student must re-enter code for a new attempt
        localStorage.removeItem(`easyrevise_progress_${this.examId}`);
        localStorage.removeItem(`easyrevise_flags_${this.examId}`);
        localStorage.removeItem(`easyrevise_startTime_${this.examId}`);
        const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
        delete inProgress[this.examId];
        localStorage.setItem('easyrevise_in_progress', JSON.stringify(inProgress));
        // Clear the unlock so the exam re-locks after submission (requires new code for re-attempt)
        const unlockedAfterSubmit = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        delete unlockedAfterSubmit[this.examId];
        localStorage.setItem('easyrevise_unlocked', JSON.stringify(unlockedAfterSubmit));

        window.location.href = 'result.html';
    }

    saveToHistory(summary) {
        const token = localStorage.getItem('easyrevise_token');
        if (token) {
            fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(summary)
            }).catch(() => { });
        }
        const history = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
        history.unshift(summary);
        if (history.length > 50) history.pop();
        localStorage.setItem('easyrevise_history', JSON.stringify(history));
    }

    // ── Custom modal: Xác nhận nộp bài khi còn câu chưa làm ──
    _showSubmitConfirmModal(unanswered, unansweredIndices = []) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;animation:erFadeIn 0.18s ease;';

            const MAX_SHOW = 12;
            const shownIndices = unansweredIndices.slice(0, MAX_SHOW);
            const moreCount = unansweredIndices.length - MAX_SHOW;
            const pillsHtml = shownIndices.map(n =>
                `<span style="display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:#fef2f2;border:1.5px solid #fecaca;color:#dc2626;font-size:0.78rem;font-weight:700;">${n}</span>`
            ).join('') + (moreCount > 0 ? `<span style="display:inline-flex;align-items:center;padding:0 0.6rem;height:32px;border-radius:16px;background:#f1f5f9;color:#64748b;font-size:0.75rem;font-weight:600;">+${moreCount}</span>` : '');

            overlay.innerHTML = `
                <div style="background:var(--bg-card,#fff);border-radius:22px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;animation:erSlideUp 0.22s ease;">
                    <div style="padding:1.5rem 1.75rem 1.25rem;border-bottom:1px solid #f1f5f9;">
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem;">
                            <div style="width:42px;height:42px;border-radius:12px;background:#fef2f2;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">⚠️</div>
                            <div>
                                <div style="font-weight:800;font-size:1.05rem;color:#1e293b;">Còn ${unanswered} câu chưa trả lời</div>
                                <div style="font-size:0.82rem;color:#94a3b8;margin-top:0.15rem;">Bạn có chắc muốn nộp bài ngay?</div>
                            </div>
                        </div>
                        ${pillsHtml ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:0.5rem;">${pillsHtml}</div>` : ''}
                    </div>
                    <div style="padding:1.25rem 1.75rem;display:flex;gap:0.75rem;">
                        <button id="_submitCancel" style="flex:1;padding:0.75rem;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:0.9rem;font-weight:600;cursor:pointer;transition:all 0.15s;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f8fafc'">Làm tiếp</button>
                        <button id="_submitConfirm" style="flex:1;padding:0.75rem;border-radius:12px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-size:0.9rem;font-weight:700;cursor:pointer;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">Nộp bài</button>
                    </div>
                </div>`;

            if (!document.getElementById('_erModalStyles')) {
                const s = document.createElement('style');
                s.id = '_erModalStyles';
                s.textContent = `@keyframes erFadeIn{from{opacity:0}to{opacity:1}} @keyframes erSlideUp{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}`;
                document.head.appendChild(s);
            }
            document.body.appendChild(overlay);

            overlay.querySelector('#_submitCancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
            overlay.querySelector('#_submitConfirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
            // Click outside = cancel
            overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
        });
    }

    // ── Custom modal: Nhập tên học sinh (thay native prompt) ──
    _showGuestNameModal() {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem;animation:erFadeIn 0.18s ease;';
            overlay.innerHTML = `
                <div style="background:var(--bg-card,#fff);border-radius:22px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);overflow:hidden;animation:erSlideUp 0.22s ease;">
                    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:1.4rem 1.75rem;">
                        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.7);margin-bottom:0.3rem;">📝 Lưu kết quả</div>
                        <div style="font-size:1.1rem;font-weight:800;color:#fff;">Nhập tên của bạn</div>
                        <div style="font-size:0.83rem;color:rgba(255,255,255,0.75);margin-top:0.2rem;">Để giáo viên nhận diện bài làm của bạn</div>
                    </div>
                    <div style="padding:1.5rem 1.75rem;">
                        <input id="_guestNameInput" placeholder="Tên của bạn..." autocomplete="name" style="width:100%;padding:0.85rem 1rem;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;font-size:1rem;color:#1e293b;font-family:inherit;box-sizing:border-box;outline:none;transition:border-color 0.15s;" onfocus="this.style.borderColor='#6366f1';this.style.boxShadow='0 0 0 3px rgba(99,102,241,0.12)'" onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
                        <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                            <button id="_guestSkip" style="flex:1;padding:0.7rem;border-radius:12px;border:1.5px solid #e2e8f0;background:#f8fafc;color:#94a3b8;font-size:0.88rem;font-weight:600;cursor:pointer;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f8fafc'">Ẩn danh</button>
                            <button id="_guestSave" style="flex:2;padding:0.7rem;border-radius:12px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:0.88rem;font-weight:700;cursor:pointer;transition:opacity 0.15s;" onmouseover="this.style.opacity='0.88'" onmouseout="this.style.opacity='1'">Lưu & Nộp bài →</button>
                        </div>
                    </div>
                </div>`;

            document.body.appendChild(overlay);
            const input = overlay.querySelector('#_guestNameInput');
            setTimeout(() => input.focus(), 120);

            const done = (val) => { overlay.remove(); resolve(val); };
            overlay.querySelector('#_guestSkip').addEventListener('click', () => done(''));
            overlay.querySelector('#_guestSave').addEventListener('click', () => done(input.value));
            input.addEventListener('keydown', e => { if (e.key === 'Enter') done(input.value); });
        });
    }
}


function toggleFlag() {
    const app = window._examApp;
    if (!app) return;
    const idx = app.currentQuestionIndex;
    if (app.flaggedQuestions.has(idx)) app.flaggedQuestions.delete(idx);
    else app.flaggedQuestions.add(idx);
    localStorage.setItem(`easyrevise_flags_${app.examId}`, JSON.stringify([...app.flaggedQuestions]));
    app.renderQuestion();
}

function exitExam() {
    if (window._examApp) window._examApp.exitExam();
    else window.location.href = '/';
}

document.addEventListener('DOMContentLoaded', () => { window._examApp = new ExamApp(); });

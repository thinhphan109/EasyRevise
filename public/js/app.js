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
            } else {
                (section.questions || []).forEach(q => {
                    this.questionsList.push({
                        ...q, isEssay: false, sectionTitle: section.title,
                        instruction: section.instruction, passage: section.passage || null
                    });
                });
            }
        });

        this.totalQuestions = this.questionsList.length;

        // Load saved progress
        const saved = localStorage.getItem(`easyrevise_progress_${this.examId}`);
        if (saved) { try { this.userAnswers = JSON.parse(saved); } catch (e) {} }

        // Load flags
        const savedFlags = localStorage.getItem(`easyrevise_flags_${this.examId}`);
        if (savedFlags) { try { this.flaggedQuestions = new Set(JSON.parse(savedFlags)); } catch (e) {} }

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
                this.userAnswers[currentQ.id] = e.target.value;
                this.saveProgress();
                this.updateQuestionGrid();
            };
        }

        document.onkeydown = (e) => {
            if (e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft') this.navigate(-1);
            if (e.key === 'ArrowRight') this.navigate(1);
            if (['a','b','c','d'].includes(e.key.toLowerCase())) {
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

        // Save progress on tab close / refresh
        this.intentionalExit = false;
        window.addEventListener('beforeunload', (e) => {
            this.saveProgress();
            this.saveInProgress();
            if (!this.intentionalExit) {
                e.preventDefault();
                e.returnValue = '';
            }
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

        if (question.isEssay) this.renderEssay(question);
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
    }

    renderMultipleChoice(question) {
        this.instruction.textContent = question.instruction || '';
        if (question.passage) {
            this.passageContainer.style.display = 'block';
            this.passageContainer.innerHTML = question.passage.replace(/\n/g, '<br>');
        }
        this.questionText.textContent = question.question;

        // Render question media (image/video, with optional hint mode)
        this.renderQuestionMedia(question);

        this.optionGrid.style.display = 'flex';
        this.optionGrid.innerHTML = '';

        question.options.forEach((option, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            if (this.userAnswers[question.id] === index) btn.classList.add('selected');
            const labelKey = String.fromCharCode(65 + index);
            btn.innerHTML = `<div class="option-label">${labelKey}</div><div class="option-text">${option}</div>`;
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
        this.instruction.textContent = question.instruction || '';
        this.questionText.textContent = question.prompt || '';

        // Render question media
        this.renderQuestionMedia(question);

        this.essayArea.style.display = 'block';
        this.essayInput.value = this.userAnswers[question.id] || '';
        this.cuesList.innerHTML = '';
        (question.cues || []).forEach(cue => {
            const li = document.createElement('li');
            li.textContent = cue;
            this.cuesList.appendChild(li);
        });
    }

    renderQuestionMedia(question) {
        const imgContainer = document.getElementById('questionImageContainer');
        const hintContainer = document.getElementById('questionHintContainer');
        if (!imgContainer || !hintContainer) return;

        // Reset
        imgContainer.innerHTML = ''; imgContainer.style.display = 'none';
        hintContainer.innerHTML = ''; hintContainer.style.display = 'none';

        const hasImage = !!question.image;
        const hasVideo = !!question.video;
        if (!hasImage && !hasVideo) return;

        let mediaHtml = '';
        if (hasImage) {
            mediaHtml += `<img src="${question.image}" alt="" style="max-width:350px;width:100%;border-radius:12px;cursor:zoom-in;" onclick="this.classList.toggle('img-zoomed');if(this.classList.contains('img-zoomed')){this.style.position='fixed';this.style.top='0';this.style.left='0';this.style.width='100vw';this.style.height='100vh';this.style.objectFit='contain';this.style.background='rgba(0,0,0,0.85)';this.style.zIndex='9999';this.style.borderRadius='0';this.style.cursor='zoom-out';this.style.maxWidth='none';}else{this.style='max-width:350px;width:100%;border-radius:12px;cursor:zoom-in;';}">`;
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

    submitExam(auto = false) {
        if (!auto) {
            const answeredCount = Object.keys(this.userAnswers).length;
            if (answeredCount < this.totalQuestions) {
                const unanswered = this.totalQuestions - answeredCount;
                if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`)) return;
            }
        }
        this.intentionalExit = true;
        if (this.timerInterval) clearInterval(this.timerInterval);

        let correct = 0, incorrect = 0, skipped = 0;
        const results = this.questionsList.map(q => {
            const userAns = this.userAnswers[q.id];
            let isCorrect = false;
            if (q.isEssay) return { id: q.id, userAnswer: userAns, isCorrect: null, isEssay: true };
            if (userAns === undefined) skipped++;
            else if (userAns === q.correctAnswer) { correct++; isCorrect = true; }
            else incorrect++;
            return { id: q.id, userAnswer: userAns, isCorrect, correctAnswer: q.correctAnswer, isEssay: false };
        });

        const mcTotal = this.questionsList.filter(q => !q.isEssay).length;
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);

        const summary = {
            examId: this.examId, score: ((correct / mcTotal) * 10).toFixed(1),
            correct, incorrect, skipped, total: mcTotal, results,
            examTitle: this.examData.title, timestamp: new Date().toLocaleString('vi-VN'), timeSpent: elapsed,
            autoSubmitted: auto
        };

        this.saveToHistory(summary);
        sessionStorage.setItem('easyrevise_final_result', JSON.stringify(summary));

        // Save result by code if applicable
        const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
        const code = unlocked[this.examId];
        if (code) {
            fetch(`/api/exams/${this.examId}/code-result`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, result: summary })
            }).catch(() => {});
        }

        // Remove in-progress
        localStorage.removeItem(`easyrevise_progress_${this.examId}`);
        localStorage.removeItem(`easyrevise_flags_${this.examId}`);
        localStorage.removeItem(`easyrevise_startTime_${this.examId}`);
        const inProgress = JSON.parse(localStorage.getItem('easyrevise_in_progress') || '{}');
        delete inProgress[this.examId];
        localStorage.setItem('easyrevise_in_progress', JSON.stringify(inProgress));

        window.location.href = 'result.html';
    }

    saveToHistory(summary) {
        const token = localStorage.getItem('easyrevise_token');
        if (token) {
            fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(summary)
            }).catch(() => {});
        }
        const history = JSON.parse(localStorage.getItem('easyrevise_history') || '[]');
        history.unshift(summary);
        if (history.length > 50) history.pop();
        localStorage.setItem('easyrevise_history', JSON.stringify(history));
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

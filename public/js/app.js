// EasyRevise - Exam Engine with Navigator + Auth + History

class ExamApp {
    constructor() {
        this.examData = null;
        this.currentQuestionIndex = 0;
        this.userAnswers = {};
        this.totalQuestions = 0;
        this.questionsList = [];
        this.examId = null;
        this.startTime = Date.now();
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
            const res = await fetch(`/api/exams/${this.examId}`);
            if (!res.ok) throw new Error('Exam not found');
            this.examData = await res.json();
        } catch (err) {
            alert('Không tìm thấy đề thi!');
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
        setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const sec = String(elapsed % 60).padStart(2, '0');
            this.countdown.textContent = `${min}:${sec}`;
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
        this.essayArea.style.display = 'block';
        this.essayInput.value = this.userAnswers[question.id] || '';
        this.cuesList.innerHTML = '';
        (question.cues || []).forEach(cue => {
            const li = document.createElement('li');
            li.textContent = cue;
            this.cuesList.appendChild(li);
        });
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
        if (Object.keys(this.userAnswers).length > 0) {
            if (!confirm('Bài làm sẽ được lưu lại. Bạn có thể quay lại tiếp tục bất kỳ lúc nào.\n\nThoát ra?')) return;
        }
        this.saveProgress();
        window.location.href = '/';
    }

    submitExam() {
        const answeredCount = Object.keys(this.userAnswers).length;
        if (answeredCount < this.totalQuestions) {
            const unanswered = this.totalQuestions - answeredCount;
            if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`)) return;
        }

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
            examTitle: this.examData.title, timestamp: new Date().toLocaleString('vi-VN'), timeSpent: elapsed
        };

        this.saveToHistory(summary);
        sessionStorage.setItem('easyrevise_final_result', JSON.stringify(summary));

        // Remove in-progress
        localStorage.removeItem(`easyrevise_progress_${this.examId}`);
        localStorage.removeItem(`easyrevise_flags_${this.examId}`);
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

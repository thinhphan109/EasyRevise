// EasyRevise - Results Engine (API-based)

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

            // Fetch full exam data from API
            const res = await fetch(`/api/exams/${this.results.examId}`);
            if (!res.ok) throw new Error('Exam not found');
            this.examData = await res.json();

            // Flatten
            this.examData.sections.forEach(section => {
                if (section.type === 'writing-essay') {
                    this.questionsList.push({ ...section, isEssay: true, sectionTitle: section.title });
                } else {
                    (section.questions || []).forEach(q => {
                        this.questionsList.push({ ...q, isEssay: false, sectionTitle: section.title });
                    });
                }
            });

            this.renderSummary();
            this.renderReviewItems();
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
        if (retakeBtn) retakeBtn.href = `exam.html?id=${this.results.examId}`;
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
            } else if (userAnsId === undefined) {
                statusBadge = '<span class="status-badge" style="background: rgba(245,158,11,0.2); color: #fbbf24;">⚠️ Bỏ Qua</span>';
            } else if (userAnsId === q.correctAnswer) {
                statusBadge = '<span class="status-badge badge-correct">✅ Chính Xác</span>';
            } else {
                statusBadge = '<span class="status-badge badge-incorrect">❌ Chưa Đúng</span>';
            }

            let responseRow = '';
            if (!q.isEssay) {
                const correctLabel = String.fromCharCode(65 + q.correctAnswer);
                const userLabel = userAnsId !== undefined ? String.fromCharCode(65 + userAnsId) : '—';

                responseRow = `
                    <div style="display: flex; gap: 1.5rem; margin-bottom: 1.25rem; font-size: 0.95rem; font-weight: 600; flex-wrap: wrap;">
                        <span style="color: var(--success);">✅ Đáp án đúng: ${correctLabel}. ${q.options[q.correctAnswer]}</span>
                        ${userAnsId !== undefined && userAnsId !== q.correctAnswer ? `
                            <span style="color: var(--error);">❌ Bạn chọn: ${userLabel}. ${q.options[userAnsId]}</span>
                        ` : ''}
                        ${userAnsId === undefined ? '<span style="color: var(--warning);">⚠️ Không chọn đáp án</span>' : ''}
                    </div>`;
            } else {
                responseRow = `
                    <div style="margin-bottom: 1rem;">
                        <strong style="color: var(--text-main); font-size: 0.9rem;">Bài làm của bạn:</strong>
                        <div style="margin-top: 0.5rem; padding: 1rem; background:rgba(255,255,255,0.03); border-radius: 12px; color: var(--text-muted); font-size: 0.9rem; white-space: pre-line;">${userAnsId || 'Không có bài làm.'}</div>
                    </div>
                    <div style="padding: 1.25rem; background: rgba(34,197,94,0.05); border: 1px dashed rgba(34,197,94,0.3); border-radius: 12px; margin-bottom: 1rem;">
                        <strong style="color: var(--success); display: block; margin-bottom: 0.75rem;">📝 Mẫu đáp án:</strong>
                        <div style="color: var(--text-main); font-size: 0.95rem; white-space: pre-line;">${q.sampleAnswer || 'Chưa có mẫu.'}</div>
                    </div>`;
            }

            reviewItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">
                        ${q.sectionTitle} — Câu ${index + 1}
                    </div>
                    ${statusBadge}
                </div>
                <p style="font-size: 1.1rem; font-weight: 600; margin-bottom: 1.25rem; color: var(--text-main); line-height: 1.5;">
                    ${q.isEssay ? q.prompt : q.question}
                </p>
                ${responseRow}
                ${q.explanation ? `
                <div class="explanation-box">
                    <div class="explanation-title">📝 Giải đáp & Phân tích</div>
                    <p style="color: var(--text-main); font-size: 0.95rem; line-height: 1.6;">${q.explanation}</p>
                </div>` : ''}
                ${q.expansion ? `
                <div class="expansion-box">
                    <div class="expansion-title">💡 Mở rộng kiến thức</div>
                    <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6;">${q.expansion}</p>
                </div>` : ''}`;

            this.reviewContainer.appendChild(reviewItem);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => { new ResultApp(); });

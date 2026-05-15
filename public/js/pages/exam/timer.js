// EasyRevise — Exam countdown timer.
// Depends on: examData.timeLimit, startTime, countdown DOM element.
// Callbacks: onAutoSubmit (when time runs out), onEssayWarning (5min mark with essay sections).

import { playBeep } from './audio.js';

export class ExamTimer {
    /**
     * @param {Object} opts
     * @param {Object} opts.examData - exam config with timeLimit (in minutes)
     * @param {number} opts.startTime - epoch ms when exam started
     * @param {HTMLElement} opts.countdownEl - element to display countdown
     * @param {Function} opts.onAutoSubmit - called when time expires
     * @param {Function} opts.onEssayWarning - called once at 5min mark if exam has essay/free-form
     */
    constructor({ examData, startTime, countdownEl, onAutoSubmit, onEssayWarning }) {
        this.examData = examData;
        this.startTime = startTime;
        this.countdownEl = countdownEl;
        this.onAutoSubmit = onAutoSubmit;
        this.onEssayWarning = onEssayWarning;
        this.timeLimit = examData.timeLimit ? examData.timeLimit * 60 : 0; // seconds
        this._essayWarnShown = false;
        this._warned60s = false;
        this._intervalId = null;
    }

    start() {
        this._intervalId = setInterval(() => this._tick(), 1000);
    }

    stop() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
    }

    _tick() {
        const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
        if (this.timeLimit > 0) {
            const remaining = Math.max(0, this.timeLimit - elapsed);
            const min = String(Math.floor(remaining / 60)).padStart(2, '0');
            const sec = String(remaining % 60).padStart(2, '0');
            this.countdownEl.textContent = `${min}:${sec}`;

            // Warning colors
            if (remaining <= 60) {
                this.countdownEl.style.background = '#dc2626';
                this.countdownEl.classList.remove('timer-warning');
                this.countdownEl.classList.add('timer-danger');
                if (remaining === 60 && !this._warned60s) {
                    this._warned60s = true;
                    playBeep(880, 0.18, 2);
                }
            } else if (remaining <= 300) {
                this.countdownEl.style.background = '#f59e0b';
                this.countdownEl.classList.add('timer-warning');
                this.countdownEl.classList.remove('timer-danger');
            } else {
                this.countdownEl.classList.remove('timer-warning', 'timer-danger');
            }

            // Essay upload warning at 5min mark
            if (remaining <= 300 && !this._essayWarnShown) {
                const hasEssay = (this.examData.sections || []).some(s =>
                    s.type === 'writing-essay' || s.type === 'free-form'
                );
                if (hasEssay) {
                    this._essayWarnShown = true;
                    if (typeof this.onEssayWarning === 'function') {
                        this.onEssayWarning();
                    }
                }
            }

            // Auto-submit on expiry
            if (remaining <= 0) {
                this.stop();
                playBeep(660, 0.25, 3);
                alert('⏰ Hết giờ! Bài sẽ được tự động nộp.');
                if (typeof this.onAutoSubmit === 'function') {
                    this.onAutoSubmit();
                }
            }
        } else {
            // Count up if no time limit
            const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const sec = String(elapsed % 60).padStart(2, '0');
            this.countdownEl.textContent = `${min}:${sec}`;
        }
    }
}

/**
 * Show top banner reminding user to upload essay/free-form attachments.
 * Auto-dismisses after 12s. Pure DOM helper.
 */
export function showEssayUploadWarning() {
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
        <button data-action="dismiss-essay-warning"
            style="background:rgba(255,255,255,0.2);border:none;color:white;border-radius:8px;
                   padding:0.25rem 0.5rem;cursor:pointer;font-size:0.85rem;flex-shrink:0;">✕</button>
    `;

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

    // Wire dismiss button (no inline onclick)
    banner.querySelector('[data-action="dismiss-essay-warning"]').addEventListener('click', () => banner.remove());

    document.body.appendChild(banner);
    setTimeout(() => { if (banner.parentNode) banner.remove(); }, 12000);
}

// public/ielts/_shared/ielts-runtime.js
// Tiny client runtime shared between catalog / test / result pages.
// Talks to /api/ielts using JWT from localStorage (key: er_token, mirrors
// the rest of the EasyRevise app).

(function (root) {
    'use strict';

    function getToken() {
        return localStorage.getItem('easyrevise_token') || '';
    }

    async function api(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const tok = getToken();
        if (tok) headers.Authorization = 'Bearer ' + tok;
        const res = await fetch('/api/ielts' + path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
        if (res.status === 401 || res.status === 403) {
            // Bubble up so caller can redirect to login
            const err = new Error(res.status === 401 ? 'Unauthorized' : 'Forbidden');
            err.status = res.status;
            throw err;
        }
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (!res.ok) {
            const err = new Error((data && data.error) || ('HTTP ' + res.status));
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    function debounce(fn, ms) {
        let h;
        return function (...args) {
            clearTimeout(h);
            h = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    function formatTime(sec) {
        if (sec == null) return '--:--';
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function flattenQuestions(test) {
        const flat = [];
        for (const p of (test.passages || [])) {
            for (const q of (p.questions || [])) flat.push(q);
        }
        return flat;
    }

    function getQuery(name) {
        return new URLSearchParams(window.location.search).get(name);
    }

    function isLoggedIn() {
        return !!getToken();
    }

    function ensureLogin() {
        if (!isLoggedIn()) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = '/?login=1&next=' + next;
            return false;
        }
        return true;
    }

    root.IeltsRuntime = {
        api,
        debounce,
        formatTime,
        flattenQuestions,
        getQuery,
        isLoggedIn,
        ensureLogin,

        listTests: () => api('GET', '/tests'),
        getTest: (id) => api('GET', '/tests/' + id),
        startSubmission: (testId, code) =>
            api('POST', '/tests/' + testId + '/start', code ? { code } : undefined),
        saveAnswers: (subId, answers, flags) =>
            api('POST', '/submissions/' + subId + '/answer', { answers, flags }),
        submit: (subId, answers, flags) =>
            api('POST', '/submissions/' + subId + '/submit', { answers, flags }),
        getSubmission: (id) => api('GET', '/submissions/' + id),
        listSubmissions: () => api('GET', '/submissions'),
        verifyCode: (testId, code) =>
            api('POST', '/tests/' + testId + '/verify-code', { code }),
        previewCode: (testId, code) =>
            api('POST', '/tests/' + testId + '/preview-code', { code }),
        startWriting: (testId, code) =>
            api('POST', '/writing/tests/' + testId + '/start', code ? { code } : undefined),
        startSpeaking: (testId, code) =>
            api('POST', '/speaking/tests/' + testId + '/start', code ? { code } : undefined),

        // ── High-level helper: start a session, auto-prompt for code when required ──
        // Pass `kind` = 'reading' | 'listening' | 'writing' | 'speaking'.
        // Returns the start response on success; throws on cancel/failure.
        async startWithCode(kind, testId) {
            const startFn = (kind === 'writing') ? this.startWriting
                          : (kind === 'speaking') ? this.startSpeaking
                          : this.startSubmission;
            const tryStart = (code) => startFn.call(this, testId, code);

            try {
                return await tryStart();
            } catch (e) {
                const requiresCode =
                    e.status === 403 && /mã kích hoạt|mã này/i.test(e.message);
                if (!requiresCode) throw e;
            }

            // Prompt the user for a code, retry up to 5 times
            for (let attempt = 0; attempt < 5; attempt++) {
                const code = await promptForCode(attempt);
                if (!code) throw new Error('CODE_CANCELLED');
                try {
                    return await tryStart(code);
                } catch (e) {
                    if (e.status === 403) {
                        if (window.notifyPopup) {
                            window.notifyPopup({
                                title: 'Mã không hợp lệ',
                                message: e.message, type: 'error', duration: 3500
                            });
                        }
                        continue;
                    }
                    throw e;
                }
            }
            throw new Error('CODE_TOO_MANY_ATTEMPTS');
        }
    };

    // ── Inline modal for code entry (avoids loading another component) ──
    function promptForCode(attempt) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(4px);';
            overlay.innerHTML = `
                <div style="background:var(--surface,#fff);color:var(--text,#1a1a1a);padding:1.75rem 1.85rem;border-radius:14px;max-width:400px;width:calc(100% - 2rem);box-shadow:0 16px 40px rgba(0,0,0,0.18);font-family:Inter,sans-serif;">
                    <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted,#888);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:0.4rem;">Mã kích hoạt đề thi</div>
                    <h3 style="margin:0 0 0.45rem;font-size:1.1rem;font-weight:600;">Nhập mã để vào phòng thi</h3>
                    <p style="margin:0 0 1rem;font-size:0.85rem;color:var(--text-2,#555);line-height:1.5;">
                        Đề thi này được bảo vệ bằng mã kích hoạt. Nhập mã được cấp để bắt đầu làm bài.
                    </p>
                    <input id="_codeInp" type="text" placeholder="VD: ABCD1234" autocomplete="off" maxlength="32"
                           style="width:100%;padding:0.7rem 0.85rem;font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;background:var(--surface-2,#f5f5f5);border:1.5px solid var(--border,#e5e5e5);border-radius:8px;color:var(--text,#1a1a1a);outline:none;transition:border-color 0.15s;" />
                    <div style="display:flex;gap:0.55rem;margin-top:1.1rem;">
                        <button id="_codeCancel" style="flex:1;padding:0.6rem;background:var(--surface,#fff);border:1px solid var(--border,#e5e5e5);border-radius:8px;font-family:inherit;font-size:0.88rem;cursor:pointer;">Huỷ</button>
                        <button id="_codeOk" style="flex:1.4;padding:0.6rem;background:var(--text,#1a1a1a);color:var(--bg,#fff);border:0;border-radius:8px;font-family:inherit;font-size:0.88rem;font-weight:600;cursor:pointer;">Xác nhận</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            const inp = overlay.querySelector('#_codeInp');
            inp.focus();
            const close = (val) => { document.body.removeChild(overlay); resolve(val); };
            overlay.querySelector('#_codeCancel').onclick = () => close(null);
            overlay.querySelector('#_codeOk').onclick = () => close(inp.value.trim().toUpperCase());
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') close(inp.value.trim().toUpperCase());
                if (e.key === 'Escape') close(null);
            });
        });
    }
})(window);

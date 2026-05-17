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
        startSubmission: (testId) => api('POST', '/tests/' + testId + '/start'),
        saveAnswers: (subId, answers, flags) =>
            api('POST', '/submissions/' + subId + '/answer', { answers, flags }),
        submit: (subId, answers, flags) =>
            api('POST', '/submissions/' + subId + '/submit', { answers, flags }),
        getSubmission: (id) => api('GET', '/submissions/' + id),
        listSubmissions: () => api('GET', '/submissions')
    };
})(window);

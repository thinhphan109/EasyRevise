/**
 * public/demos/ielts/_shared/demo-runtime.js
 *
 * Tiny vanilla state-store + scoring engine shared by all 3 demo
 * styles. Each style only ships HTML + CSS — DOM hooks call into
 * `IeltsDemo.*` defined here.
 *
 * Storage keys are scoped per-style so switching styles doesn't
 * cross-contaminate state.
 */
(function () {
    const STYLE = (document.body.dataset.demoStyle || 'authentic').trim();
    const KEY = `ielts_demo_${STYLE}_state_v1`;

    const T = window.IELTS_SAMPLE;
    if (!T) { console.warn('IELTS_SAMPLE not loaded'); return; }

    /** Flatten all questions across passages so palette can index 1..N */
    const FLAT = [];
    T.passages.forEach(p => p.questions.forEach(q => FLAT.push(q)));

    /** Default state */
    function fresh() {
        return {
            startedAt: Date.now(),
            answers: {},        // qId -> user answer
            flags: {},          // qId -> bool
            currentQ: FLAT[0]?.id || null,
            submitted: false,
            timeLeft: T.durationSec
        };
    }

    /** Persisted store */
    let state = (() => {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* ignore */ }
        return fresh();
    })();

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
    }

    /* ── Public API ───────────────────────────────────────── */
    const subscribers = new Set();
    function emit() { subscribers.forEach(fn => { try { fn(state); } catch (e) { console.error(e); } }); }

    const api = {
        // Data
        test: T,
        flat: FLAT,
        get state() { return state; },

        // Subscriptions
        subscribe(fn) { subscribers.add(fn); fn(state); return () => subscribers.delete(fn); },

        // Mutations
        setAnswer(qId, value) {
            state.answers[qId] = value;
            save(); emit();
        },
        toggleFlag(qId) {
            state.flags[qId] = !state.flags[qId];
            save(); emit();
        },
        focusQuestion(qId) {
            state.currentQ = qId;
            save(); emit();
        },
        reset() { state = fresh(); save(); emit(); },

        // Scoring
        score() {
            let raw = 0, total = 0;
            const detail = {};
            FLAT.forEach(q => {
                if (q.type === 'matching_headings') {
                    // 5 sub-marks (one per paragraph) but for the demo we
                    // count the whole question = #paragraphs raw points.
                    const userMap = state.answers[q.id] || {};
                    q.payload.paragraphs.forEach(p => {
                        total++;
                        const isCorrect = userMap[p] === q.correct[p];
                        if (isCorrect) raw++;
                        detail[`${q.id}:${p}`] = { correct: isCorrect, expected: q.correct[p], got: userMap[p] };
                    });
                } else {
                    total++;
                    const user = state.answers[q.id];
                    const isCorrect = checkAnswer(q, user);
                    if (isCorrect) raw++;
                    detail[q.id] = { correct: isCorrect, expected: q.correct, got: user };
                }
            });
            return { raw, total, band: bandFor(raw), detail };
        },

        // Submit
        submit() {
            state.submitted = true;
            const result = api.score();
            state.result = result;
            save(); emit();
            return result;
        }
    };

    function checkAnswer(q, user) {
        if (user === undefined || user === null || user === '') return false;
        if (q.type === 'tfng' || q.type === 'ynng') {
            return String(user).toLowerCase() === String(q.correct).toLowerCase();
        }
        if (q.type === 'mc_single') {
            return Number(user) === Number(q.correct);
        }
        if (q.type === 'mc_multi') {
            const u = Array.isArray(user) ? [...user].sort() : [];
            const c = [...q.correct].sort();
            return u.length === c.length && u.every((v, i) => v === c[i]);
        }
        if (q.type === 'sentence_completion' || q.type === 'short_answer' || q.type === 'summary_completion') {
            const norm = s => String(s).trim().toLowerCase().replace(/[.,;:!?]+$/g, '');
            const accepted = [q.correct, ...(q.alternatives || [])].map(norm);
            return accepted.includes(norm(user));
        }
        return false;
    }

    function bandFor(raw) {
        const tbl = T.bandTable || {};
        if (tbl[raw] !== undefined) return tbl[raw];
        // Fallback: linear interpolation 0..max
        const max = Math.max(...Object.keys(tbl).map(Number));
        return Math.round((raw / max) * 9 * 2) / 2;
    }

    /* ── Timer ───────────────────────────────────────────── */
    let timerHandle = null;
    api.startTimer = function (onTick) {
        if (timerHandle) clearInterval(timerHandle);
        timerHandle = setInterval(() => {
            if (state.submitted) return;
            state.timeLeft = Math.max(0, state.timeLeft - 1);
            onTick && onTick(state.timeLeft);
            if (state.timeLeft === 0) {
                clearInterval(timerHandle);
                api.submit();
                onTick && onTick(0, true);
            }
            // Persist every 5 s
            if (state.timeLeft % 5 === 0) save();
        }, 1000);
    };

    api.formatTime = function (sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    window.IeltsDemo = api;
})();

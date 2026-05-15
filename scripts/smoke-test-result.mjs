// EasyRevise — Smoke test for refactored result.js modules.
// Strategy: Use JSDOM as DOM/sessionStorage/localStorage shim, then directly
// `import()` the ESM modules in Node and orchestrate them on the JSDOM document.
// This bypasses jsdom's lack of `<script type="module">` support.

import http from 'node:http';
import { JSDOM } from 'jsdom';

const HOST = 'http://localhost:3000';
const EXAM_ID = 'feb0758f';

function get(path) {
    return new Promise((resolve, reject) => {
        http.get(`${HOST}${path}`, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        }).on('error', reject);
    });
}

async function findExam(idPrefix) {
    const r = await get('/api/exams');
    const list = JSON.parse(r.body);
    const match = list.find(e => e.id.startsWith(idPrefix));
    if (!match) throw new Error(`No exam found starting with ${idPrefix}`);
    const detail = await get(`/api/exams/${match.id}`);
    return JSON.parse(detail.body);
}

function buildMockResult(exam) {
    const flat = [];
    for (const section of exam.sections) {
        if (section.type === 'writing-essay') flat.push({ ...section, isEssay: true });
        else if (section.type === 'free-form') for (const q of (section.questions || [])) flat.push({ ...q, isFreeForm: true });
        else if (section.type === 'fill-in-blank') for (const q of (section.questions || [])) flat.push({ ...q, isFillBlank: true });
        else for (const q of (section.questions || [])) flat.push(q);
    }

    let mcSeen = 0;
    const mockResults = flat.map((q, i) => {
        if (q.isEssay) return { id: q.id || `essay-${i}`, userAnswer: 'Mock essay text answer.', attachments: [] };
        if (q.isFreeForm) return { id: q.id, userAnswer: 'Mock free-form answer line 1\nMock line 2', attachments: [] };
        if (q.isFillBlank) {
            const ans = {};
            (q.blanks || []).forEach((b, j) => { ans[j] = (j % 2 === 0) ? String(b.answer) : 'wrong'; });
            return { id: q.id, userAnswer: ans };
        }
        // Force first MC wrong (so data-action button renders); rest correct.
        mcSeen++;
        const isCorrect = mcSeen !== 1;
        const userAns = isCorrect ? q.correctAnswer : ((q.correctAnswer + 1) % q.options.length);
        return { id: q.id, userAnswer: userAns, isCorrect };
    });

    return {
        examId: exam.id,
        score: '7.5',
        correct: Math.floor(flat.length * 0.66),
        incorrect: Math.floor(flat.length * 0.20),
        skipped: Math.floor(flat.length * 0.14),
        results: mockResults,
        timestamp: new Date().toLocaleString('vi-VN'),
        timeSpent: 1234,
        completedAt: new Date().toISOString()
    };
}

function setupDom(mockResult) {
    // Build minimal result.html DOM (the structure result/* modules expect)
    const html = `<!DOCTYPE html><html><body>
        <span id="scoreValue"></span>
        <span id="scoreLabel"></span>
        <span id="correctCount"></span>
        <span id="incorrectCount"></span>
        <span id="skipCount"></span>
        <span id="examDate"></span>
        <span id="timeSpent"></span>
        <a id="retakeBtn" href="#"></a>
        <div id="aiGradingBanner"></div>
        <div id="aiGradingSpinner"></div>
        <div id="aiGradingSubtext"></div>
        <div id="aiGradingTimer"></div>
        <div id="reviewContainer"></div>
    </body></html>`;
    const dom = new JSDOM(html, { url: HOST + '/result.html' });
    const { window } = dom;

    // Polyfills
    window.matchMedia = (q) => ({ matches: false, media: q, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} });
    window.fetch = async (url, opts = {}) => {
        const fullUrl = url.startsWith('/') ? `${HOST}${url}` : url;
        return new Promise((resolve, reject) => {
            const u = new URL(fullUrl);
            const req = http.request({
                hostname: u.hostname, port: u.port, path: u.pathname + u.search,
                method: opts.method || 'GET', headers: opts.headers || {}
            }, (res) => {
                let data = '';
                res.on('data', (c) => data += c);
                res.on('end', () => resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => JSON.parse(data),
                    text: async () => data
                }));
            });
            req.on('error', reject);
            if (opts.body) req.write(opts.body);
            req.end();
        });
    };

    // Inject mock session
    window.sessionStorage.setItem('easyrevise_final_result', JSON.stringify(mockResult));

    // Make DOM globals visible to ESM modules
    global.window = window;
    global.document = window.document;
    global.sessionStorage = window.sessionStorage;
    global.localStorage = window.localStorage;
    global.URLSearchParams = window.URLSearchParams;
    global.fetch = window.fetch;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.Node = window.Node;
    global.location = window.location;

    return dom;
}

async function runTest() {
    console.log('🧪 EasyRevise — Result modules smoke test (Node ESM mode)\n');

    console.log(`[1] Fetching exam ${EXAM_ID}*...`);
    const exam = await findExam(EXAM_ID);
    console.log(`    ✓ Loaded "${exam.title}"`);
    console.log(`    ✓ ${exam.sections.length} sections: ${exam.sections.map(s => s.type).join(', ')}`);

    console.log('\n[2] Building mock submission...');
    const mockResult = buildMockResult(exam);
    console.log(`    ✓ ${mockResult.results.length} answers (${mockResult.correct} correct, ${mockResult.incorrect} wrong, ${mockResult.skipped} skipped)`);

    console.log('\n[3] Setting up JSDOM environment...');
    const dom = setupDom(mockResult);
    console.log('    ✓ DOM created, polyfills installed (matchMedia, fetch)');

    console.log('\n[4] Importing ESM modules + running orchestrator...');
    const errors = [];
    try {
        // Import the actual modules user code uses
        const stateMod = await import('../public/js/pages/result/state.js');
        const summaryMod = await import('../public/js/pages/result/summary.js');
        const reviewMod = await import('../public/js/pages/result/review-list.js');
        const explainMod = await import('../public/js/pages/result/explain.js');

        // Replicate index.js bootstrap
        const state = new stateMod.ResultState();
        if (!state.loadSavedResult()) throw new Error('No saved result');
        await state.fetchExamAndFlatten();
        console.log(`    ✓ Loaded ${state.questionsList.length} questions from API`);

        summaryMod.renderSummary(state);
        console.log('    ✓ renderSummary executed');

        reviewMod.renderReviewList({
            state,
            container: document.getElementById('reviewContainer'),
            onAskWhyWrong: (qid, btn) => explainMod.askWhyWrong({ state, questionId: qid, btnEl: btn })
        });
        console.log('    ✓ renderReviewList executed');
    } catch (e) {
        errors.push(`[bootstrap] ${e.message}`);
        console.log(`    ✗ Bootstrap failed: ${e.message}`);
    }

    console.log('\n[5] Verifying rendered DOM:');
    const checks = [
        { name: 'Score value', test: () => document.getElementById('scoreValue')?.textContent === '7.5' },
        { name: 'Correct count', test: () => document.getElementById('correctCount')?.textContent === String(mockResult.correct) },
        { name: 'Incorrect count', test: () => document.getElementById('incorrectCount')?.textContent === String(mockResult.incorrect) },
        { name: 'Skip count', test: () => document.getElementById('skipCount')?.textContent === String(mockResult.skipped) },
        { name: 'Time spent shown', test: () => document.getElementById('timeSpent')?.textContent.includes('phút') },
        { name: 'Review container populated', test: () => document.getElementById('reviewContainer')?.children.length > 0 },
        { name: 'Status badges present', test: () => document.querySelectorAll('.status-badge').length > 0 },
        { name: 'Review items rendered', test: () => document.querySelectorAll('.review-item').length > 0 },
        { name: 'Why-wrong button uses data-action (CSP)', test: () => document.querySelectorAll('[data-action="ask-why-wrong"]').length > 0 || document.querySelectorAll('.review-item').length === 0 /* no wrong MC */ }
    ];

    let pass = 0, fail = 0;
    for (const c of checks) {
        try {
            const ok = c.test();
            if (ok) { console.log(`    ✓ ${c.name}`); pass++; }
            else { console.log(`    ✗ ${c.name}`); fail++; }
        } catch (e) { console.log(`    ✗ ${c.name} — ${e.message}`); fail++; }
    }

    console.log('\n[6] Review items summary:');
    const reviewItems = document.querySelectorAll('.review-item');
    console.log(`    Total items: ${reviewItems.length}`);
    Array.from(reviewItems).forEach((el, i) => {
        const badge = el.querySelector('.status-badge')?.textContent.trim();
        console.log(`    [${i + 1}] ${badge}`);
    });

    console.log('\n[7] Errors during execution:');
    if (errors.length === 0) console.log('    ✓ None');
    else errors.forEach(e => console.log(`    ⚠️  ${e}`));

    console.log(`\n${'='.repeat(60)}`);
    const totalErr = errors.length + fail;
    if (totalErr === 0) console.log(`✅ PASS — ${pass}/${checks.length} checks, no errors`);
    else console.log(`❌ FAIL — ${pass}/${checks.length} checks, ${errors.length} errors`);
    console.log('='.repeat(60));

    dom.window.close();
    process.exit(totalErr === 0 ? 0 : 1);
}

runTest().catch(e => { console.error('Fatal:', e); process.exit(2); });

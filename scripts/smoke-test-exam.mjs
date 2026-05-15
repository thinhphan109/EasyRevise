// EasyRevise — Smoke test for refactored exam modules.
// Imports each module + verifies render against real exam from local API.

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

function setupDom() {
    // Minimal DOM with elements every renderer expects
    const html = `<!DOCTYPE html><html><body>
        <div id="instruction"></div>
        <div id="passageContainer" style="display:none"></div>
        <div id="questionText"></div>
        <div id="optionGrid" style="display:none"></div>
        <div id="essayArea" style="display:none">
            <ul id="cuesList"></ul>
            <textarea id="essayInput"></textarea>
        </div>
        <div id="questionImageContainer" style="display:none"></div>
        <div id="questionHintContainer" style="display:none"></div>
        <div id="questionWrapper"></div>
        <span id="countdown"></span>
    </body></html>`;
    const dom = new JSDOM(html, { url: HOST + '/exam.html' });
    const { window } = dom;
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

    global.window = window;
    global.document = window.document;
    global.sessionStorage = window.sessionStorage;
    global.localStorage = window.localStorage;
    global.URLSearchParams = window.URLSearchParams;
    global.fetch = window.fetch;
    global.alert = (msg) => console.log('[alert]', msg);
    global.AudioContext = function () {
        return {
            createOscillator: () => ({ connect: () => {}, frequency: {}, type: '', start: () => {}, stop: () => {} }),
            createGain: () => ({ connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } }),
            destination: {},
            currentTime: 0
        };
    };

    return dom;
}

function flattenQuestions(exam) {
    const flat = [];
    for (const section of exam.sections) {
        if (section.type === 'writing-essay') flat.push({ ...section, isEssay: true, sectionTitle: section.title });
        else if (section.type === 'free-form') {
            const qs = (section.questions && section.questions.length)
                ? section.questions
                : (section.subParts && section.subParts.length)
                    ? [{ id: section.id, question: section.prompt || section.title || '', subParts: section.subParts }]
                    : [];
            qs.forEach(q => flat.push({
                ...q, isFreeForm: true, isEssay: false,
                sectionTitle: section.title,
                instruction: section.instruction || '',
                sectionPrompt: section.prompt || ''
            }));
        } else if (section.type === 'fill-in-blank') {
            (section.questions || []).forEach(q => flat.push({ ...q, isFillBlank: true, isEssay: false, sectionTitle: section.title }));
        } else {
            (section.questions || []).forEach(q => flat.push({ ...q, isEssay: false, sectionTitle: section.title }));
        }
    }
    return flat;
}

async function runTest() {
    console.log('🧪 EasyRevise — Exam modules smoke test\n');

    console.log(`[1] Loading exam ${EXAM_ID}*...`);
    const exam = await findExam(EXAM_ID);
    const flat = flattenQuestions(exam);
    console.log(`    ✓ ${flat.length} questions, types: ${exam.sections.map(s => s.type).join(', ')}`);

    console.log('\n[2] Setting up DOM environment...');
    setupDom();

    console.log('\n[3] Importing exam modules...');
    const audio = await import('../public/js/pages/exam/audio.js');
    const timer = await import('../public/js/pages/exam/timer.js');
    const media = await import('../public/js/pages/exam/media.js');
    const navigator = await import('../public/js/pages/exam/navigator.js');
    const keyboard = await import('../public/js/pages/exam/keyboard.js');
    const autoSave = await import('../public/js/pages/exam/auto-save.js');
    const mc = await import('../public/js/pages/exam/question-mc.js');
    const fillBlank = await import('../public/js/pages/exam/question-fill-blank.js');
    const essay = await import('../public/js/pages/exam/question-essay.js');
    const freeForm = await import('../public/js/pages/exam/question-free-form.js');
    console.log('    ✓ 10 modules imported');

    const errors = [];
    const checks = [];

    // Build minimal state
    const state = {
        examId: exam.id,
        examData: exam,
        questionsList: flat,
        userAnswers: {},
        currentQuestionIndex: 0,
        totalQuestions: flat.length,
        visitedQuestions: new Set([0]),
        flaggedQuestions: new Set()
    };

    const elements = {
        instruction: document.getElementById('instruction'),
        passageContainer: document.getElementById('passageContainer'),
        questionText: document.getElementById('questionText'),
        optionGrid: document.getElementById('optionGrid'),
        essayArea: document.getElementById('essayArea'),
        cuesList: document.getElementById('cuesList'),
        essayInput: document.getElementById('essayInput'),
        questionWrapper: document.getElementById('questionWrapper')
    };
    const handlers = {
        renderMedia: (q) => media.renderQuestionMedia(q, {
            imgContainer: document.getElementById('questionImageContainer'),
            hintContainer: document.getElementById('questionHintContainer')
        }),
        saveProgress: () => autoSave.saveProgress(state),
        debouncedSave: () => autoSave.saveProgress(state),
        navigate: () => {},
        updateGrid: () => {}
    };
    const ctx = { state, handlers };

    console.log('\n[4] Testing each question type render:');

    // Test MC
    try {
        const q = flat.find(q => !q.isEssay && !q.isFreeForm && !q.isFillBlank);
        if (q) {
            mc.renderMultipleChoice(q, elements, ctx);
            const ok = document.querySelectorAll('.option-btn').length > 0;
            checks.push({ name: 'renderMultipleChoice creates option buttons', ok });
            console.log(`    ${ok ? '✓' : '✗'} MC: ${document.querySelectorAll('.option-btn').length} option buttons rendered`);
        }
    } catch (e) { errors.push(`MC: ${e.message}`); }

    // Test fill-blank
    try {
        const q = flat.find(q => q.isFillBlank);
        if (q) {
            fillBlank.renderFillInBlank(q, elements, ctx);
            const ok = document.querySelectorAll('.fill-blank-input').length > 0;
            checks.push({ name: 'renderFillInBlank creates input fields', ok });
            console.log(`    ${ok ? '✓' : '✗'} Fill-blank: ${document.querySelectorAll('.fill-blank-input').length} blank inputs rendered`);
        } else {
            console.log('    - Fill-blank: skip (no question of this type)');
        }
    } catch (e) { errors.push(`Fill-blank: ${e.message}`); }

    // Test free-form
    try {
        const q = flat.find(q => q.isFreeForm);
        if (q) {
            freeForm.renderFreeForm(q, elements, ctx);
            const ok = document.querySelectorAll('.freeform-part-input').length > 0;
            checks.push({ name: 'renderFreeForm creates part inputs', ok });
            console.log(`    ${ok ? '✓' : '✗'} Free-form: ${document.querySelectorAll('.freeform-part-input').length} part inputs rendered`);
        } else {
            console.log('    - Free-form: skip (no question of this type)');
        }
    } catch (e) { errors.push(`Free-form: ${e.message}`); }

    // Test essay
    try {
        const q = flat.find(q => q.isEssay);
        if (q) {
            essay.renderEssay(q, elements, ctx);
            const ok = document.getElementById('essayUploadZone') !== null;
            checks.push({ name: 'renderEssay creates upload zone', ok });
            console.log(`    ${ok ? '✓' : '✗'} Essay: upload zone ${ok ? 'created' : 'missing'}`);
        } else {
            console.log('    - Essay: skip (no question of this type)');
        }
    } catch (e) { errors.push(`Essay: ${e.message}`); }

    console.log('\n[5] Testing helper modules:');

    try {
        navigator.buildQuestionGrid({ ...state }, () => {});
        checks.push({ name: 'buildQuestionGrid runs without error', ok: true });
        console.log('    ✓ buildQuestionGrid OK (no qGrid el needed)');
    } catch (e) { errors.push(`Navigator: ${e.message}`); }

    try {
        const debounced = autoSave.createDebouncedSave(state, () => {}, 10);
        debounced();
        checks.push({ name: 'createDebouncedSave returns callable', ok: typeof debounced === 'function' });
        console.log('    ✓ createDebouncedSave OK');
    } catch (e) { errors.push(`Auto-save: ${e.message}`); }

    try {
        const cleanup = keyboard.attachKeyboardShortcuts(state, { onPrev: () => {}, onNext: () => {}, onRender: () => {}, onSaveProgress: () => {} });
        cleanup();
        checks.push({ name: 'attachKeyboardShortcuts attach+cleanup', ok: typeof cleanup === 'function' });
        console.log('    ✓ Keyboard shortcuts OK');
    } catch (e) { errors.push(`Keyboard: ${e.message}`); }

    try {
        audio.playBeep(440, 0.05, 1);
        checks.push({ name: 'playBeep silent fallback works', ok: true });
        console.log('    ✓ playBeep OK (silent in JSDOM)');
    } catch (e) { errors.push(`Audio: ${e.message}`); }

    // Final
    const passed = checks.filter(c => c.ok).length;
    const failed = checks.filter(c => !c.ok).length;

    console.log(`\n${'='.repeat(60)}`);
    if (errors.length === 0 && failed === 0) {
        console.log(`✅ PASS — ${passed}/${checks.length} checks, no errors`);
    } else {
        console.log(`❌ FAIL — ${passed}/${checks.length} checks, ${errors.length} errors`);
        errors.forEach(e => console.log(`    ⚠️  ${e}`));
    }
    console.log('='.repeat(60));

    process.exit(errors.length === 0 && failed === 0 ? 0 : 1);
}

runTest().catch(e => { console.error('Fatal:', e); process.exit(2); });

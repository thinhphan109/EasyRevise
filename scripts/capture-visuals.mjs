// EasyRevise — Visual capture for redesigned result page (Apple HIG).
// Submits a mock answer set, then screenshots the result page.

import puppeteer from 'puppeteer';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';
const EXAM_ID = 'feb0758f';

function get(p) {
    return new Promise((resolve, reject) => {
        http.get(`${HOST}${p}`, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function findExam(prefix) {
    const list = await get('/api/exams');
    const match = list.find(e => e.id.startsWith(prefix));
    return await get(`/api/exams/${match.id}`);
}

function flatten(exam) {
    const flat = [];
    for (const s of exam.sections) {
        if (s.type === 'writing-essay') flat.push({ ...s, isEssay: true });
        else if (s.type === 'free-form') for (const q of (s.questions || [])) flat.push({ ...q, isFreeForm: true });
        else if (s.type === 'fill-in-blank') for (const q of (s.questions || [])) flat.push({ ...q, isFillBlank: true });
        else for (const q of (s.questions || [])) flat.push(q);
    }
    return flat;
}

function buildMockResult(exam) {
    const flat = flatten(exam);
    let mcSeen = 0;
    const results = flat.map((q, i) => {
        if (q.isEssay) return { id: q.id || `essay-${i}`, userAnswer: 'Mock essay text answer for visual capture.', attachments: [] };
        if (q.isFreeForm) return { id: q.id, userAnswer: 'Mock free-form line 1\nMock line 2', attachments: [] };
        if (q.isFillBlank) {
            const ans = {};
            (q.blanks || []).forEach((b, j) => { ans[j] = (j % 2 === 0) ? String(b.answer) : 'wrong'; });
            return { id: q.id, userAnswer: ans };
        }
        mcSeen++;
        const isCorrect = mcSeen !== 1;
        const userAns = isCorrect ? q.correctAnswer : ((q.correctAnswer + 1) % q.options.length);
        return { id: q.id, userAnswer: userAns, isCorrect };
    });
    return {
        examId: exam.id,
        score: '8.5',
        correct: 7,
        incorrect: 1,
        skipped: 1,
        results,
        timestamp: '15/5/2026 14:30',
        timeSpent: 1234,
        completedAt: new Date().toISOString()
    };
}

async function captureResult(theme = 'light') {
    const exam = await findExam(EXAM_ID);
    const mockResult = buildMockResult(exam);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

    await page.evaluateOnNewDocument((theme, result) => {
        localStorage.setItem('easyrevise_theme', theme);
        sessionStorage.setItem('easyrevise_final_result', JSON.stringify(result));
    }, theme, mockResult);

    await page.goto(`${HOST}/result.html`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500));

    const outDir = path.join(__dirname, '..', '_visual_captures');
    await page.screenshot({
        path: path.join(outDir, `result_apple_hig_${theme}.png`),
        fullPage: true
    });
    console.log(`✓ Saved result_apple_hig_${theme}.png`);
    await browser.close();
}

async function captureHome(theme = 'light') {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

    await page.evaluateOnNewDocument((theme) => {
        localStorage.setItem('easyrevise_theme', theme);
        // Seed in-progress + history mock to show all sections
        localStorage.setItem('easyrevise_in_progress', JSON.stringify({
            'demo-1': { examTitle: 'Đề minh hoạ Toán 9 - Tuyển sinh 10', answeredCount: 4, totalQuestions: 7, lastAccessed: Date.now() - 1000 * 60 * 30, currentQuestion: 3 }
        }));
        localStorage.setItem('easyrevise_history', JSON.stringify([
            { examTitle: 'IELTS Reading - Section 1', score: '8.5', correct: 11, total: 13, timeSpent: 1234, timestamp: '14/05/2026 10:30' },
            { examTitle: 'Đề kiểm tra HKII Vật Lí 9', score: '6.0', correct: 18, total: 30, timeSpent: 2400, timestamp: '13/05/2026 14:00' },
            { examTitle: 'Đề minh hoạ HCM 2024', score: '4.5', correct: 9, total: 20, timeSpent: 3000, timestamp: '12/05/2026 09:15', autoSubmitted: true }
        ]));
    }, theme);

    await page.goto(`${HOST}/`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // wait for exam list fetch + render

    const outDir = path.join(__dirname, '..', '_visual_captures');
    await page.screenshot({
        path: path.join(outDir, `home_apple_hig_${theme}.png`),
        fullPage: true
    });
    console.log(`✓ Saved home_apple_hig_${theme}.png`);
    await browser.close();
}

async function captureExam(theme = 'light') {
    // Resolve full UUID first (so exam.html?id=<full> works)
    const exam = await findExam(EXAM_ID);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.log('  [browser-error]', msg.text()); });
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

    await page.evaluateOnNewDocument((theme) => {
        localStorage.setItem('easyrevise_theme', theme);
    }, theme);

    await page.goto(`${HOST}/exam.html?id=${exam.id}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 4500)); // wait for app.js init + first question render

    const outDir = path.join(__dirname, '..', '_visual_captures');
    await page.screenshot({
        path: path.join(outDir, `exam_apple_hig_${theme}.png`),
        fullPage: false  // viewport only
    });
    console.log(`✓ Saved exam_apple_hig_${theme}.png`);
    await browser.close();
}

async function main() {
    const fs = await import('node:fs');
    fs.mkdirSync(path.join(__dirname, '..', '_visual_captures'), { recursive: true });
    const args = process.argv.slice(2);
    const pages = args.length ? args : ['result', 'home', 'exam'];
    const themes = ['light', 'dark'];
    for (const t of themes) {
        if (pages.includes('result')) await captureResult(t);
        if (pages.includes('home')) await captureHome(t);
        if (pages.includes('exam')) await captureExam(t);
    }
    console.log('\nDone. Screenshots in _visual_captures/');
}

main().catch(e => { console.error(e); process.exit(1); });

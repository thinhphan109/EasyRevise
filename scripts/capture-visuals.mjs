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

async function capture(theme = 'light') {
    const exam = await findExam(EXAM_ID);
    const mockResult = buildMockResult(exam);

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

    // Pre-set theme + mock result via initial navigation script
    await page.evaluateOnNewDocument((theme, result) => {
        localStorage.setItem('easyrevise_theme', theme);
        sessionStorage.setItem('easyrevise_final_result', JSON.stringify(result));
    }, theme, mockResult);

    await page.goto(`${HOST}/result.html`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1500)); // animations + KaTeX

    const outDir = path.join(__dirname, '..', '_visual_captures');
    await page.screenshot({
        path: path.join(outDir, `result_apple_hig_${theme}.png`),
        fullPage: true
    });
    console.log(`✓ Saved result_apple_hig_${theme}.png`);

    await browser.close();
}

async function main() {
    const fs = await import('node:fs');
    fs.mkdirSync(path.join(__dirname, '..', '_visual_captures'), { recursive: true });
    await capture('light');
    await capture('dark');
    console.log('\nDone. Screenshots in _visual_captures/');
}

main().catch(e => { console.error(e); process.exit(1); });

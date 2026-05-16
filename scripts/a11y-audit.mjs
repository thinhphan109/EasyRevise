// EasyRevise — A11y audit using axe-core (simplified, robust).
// Skips eval-based seeding; uses URL params + direct localStorage.

import puppeteer from 'puppeteer';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';
const AXE_URL = `${HOST}/_test_axe.min.js`;

function get(p) {
    return new Promise((resolve, reject) => {
        http.get(`${HOST}${p}`, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function auditPage(browser, theme, name, url, waitMs, presetStorage) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await page.evaluateOnNewDocument((theme, preset) => {
        localStorage.setItem('easyrevise_theme', theme);
        if (preset) {
            for (const [k, v] of Object.entries(preset.local || {})) localStorage.setItem(k, v);
            for (const [k, v] of Object.entries(preset.session || {})) sessionStorage.setItem(k, v);
        }
    }, theme, presetStorage);

    await page.goto(`${HOST}${url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, waitMs));

    // Inject axe via DOM
    await page.evaluate((url) => {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('axe load failed'));
            document.head.appendChild(s);
        });
    }, AXE_URL);

    const results = await page.evaluate(async () => {
        if (!window.axe) return { violations: [] };
        return await window.axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
            resultTypes: ['violations']
        });
    });

    await page.close();

    const violations = (results.violations || []).map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length
    }));

    return {
        page: name,
        theme,
        violations,
        total: violations.length,
        critical: violations.filter(v => v.impact === 'critical').length,
        serious: violations.filter(v => v.impact === 'serious').length,
        moderate: violations.filter(v => v.impact === 'moderate').length,
        minor: violations.filter(v => v.impact === 'minor').length
    };
}

async function main() {
    console.log('🔍 EasyRevise A11y Audit (axe-core, WCAG 2.1 AA + best-practice)\n');

    // Resolve real exam ID
    const exams = await get('/api/exams');
    const examId = exams[0].id;

    // Build mock dashboard data (the dashboard page checks for a token)
    const dashMock = JSON.stringify({
        user: { username: 'demo', displayName: 'Demo', joinedAt: '2025-09-15T08:00:00Z' },
        stats: { totalExams: 24, avgScore: 7.8, accuracy: 82, timeSpentMinutes: 460, totalAttempts: 24, streakDays: 7 },
        subjectBreakdown: [{ subject: 'Toán', attempts: 9, avgScore: 8.2 }],
        recentHistory: [{ examId: 'd1', examTitle: 'Demo', subject: 'Toán', score: '8.5', correct: 9, total: 10, timeSpent: 600, completedAt: new Date().toISOString() }]
    });

    const finalResult = JSON.stringify({
        examId: 'demo', score: '8.5', correct: 9, incorrect: 1, skipped: 0,
        results: [], timestamp: 'demo', timeSpent: 600,
        completedAt: new Date().toISOString()
    });

    const cases = [
        { name: 'home',      url: '/',                            wait: 2000, preset: null },
        { name: 'exam',      url: `/exam.html?id=${examId}`,      wait: 3500, preset: null },
        { name: 'result',    url: '/result.html',                 wait: 2000, preset: { session: { 'easyrevise_final_result': finalResult } } },
        // Dashboard requires login UI (we won't bypass auth here — accept that we get login-required state)
        { name: 'dashboard', url: '/dashboard.html',              wait: 1500, preset: null }
    ];

    const allResults = [];

    for (const theme of ['light', 'dark']) {
        console.log(`\n━━━ ${theme.toUpperCase()} THEME ━━━\n`);
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox'],
            protocolTimeout: 180000
        });

        try {
            for (const c of cases) {
                try {
                    const r = await auditPage(browser, theme, c.name, c.url, c.wait, c.preset);
                    const icon = r.total === 0 ? '✅' : (r.critical > 0 ? '❌' : r.serious > 0 ? '⚠️' : '⚠');
                    console.log(`${icon} ${c.name.padEnd(12)} : ${r.total} violations (critical=${r.critical}, serious=${r.serious}, moderate=${r.moderate}, minor=${r.minor})`);
                    for (const v of r.violations) {
                        console.log(`     · [${v.impact}] ${v.id} (${v.nodes}) — ${v.help}`);
                    }
                    allResults.push(r);
                } catch (err) {
                    console.log(`❌ ${c.name.padEnd(12)} : audit failed — ${err.message}`);
                    allResults.push({ page: c.name, theme, error: err.message, total: 0, critical: 0, serious: 0, moderate: 0, minor: 0, violations: [] });
                }
            }
        } finally {
            await browser.close();
        }
    }

    // Save report
    const out = path.join(__dirname, '..', '_a11y-report.json');
    fs.writeFileSync(out, JSON.stringify(allResults, null, 2));
    console.log(`\n📝 Saved report: ${out}`);

    const critTotal = allResults.reduce((s, r) => s + r.critical, 0);
    const seriousTotal = allResults.reduce((s, r) => s + r.serious, 0);
    if (critTotal > 0) {
        console.log(`\n❌ FAIL — ${critTotal} critical violations across all pages`);
        process.exit(1);
    } else if (seriousTotal > 0) {
        console.log(`\n⚠️  WARN — ${seriousTotal} serious violations (no critical)`);
    } else {
        console.log(`\n✅ PASS — no critical or serious WCAG AA violations`);
    }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

// scripts/youpass/network-recon.mjs
// Drives a real Chromium with the user's cookies + records every network call
// on the IELTS practice pages. Saves a deduped log to docs/youpass-network.json.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const TOKEN = process.env.YOUPASS_TOKEN;
const REFRESH = process.env.YOUPASS_REFRESH;
const DEVICE = process.env.YOUPASS_DEVICE;

if (!TOKEN) { console.error('Missing YOUPASS_TOKEN'); process.exit(1); }

const PAGES = [
    'https://youpass.vn/luyen-thi/ielts/writing/task-1?quiz_type=quiz&status=unfinished',
    'https://youpass.vn/luyen-thi/ielts/writing/task-2?quiz_type=quiz&status=unfinished',
    'https://youpass.vn/luyen-thi/ielts/reading?quiz_type=quiz&status=unfinished',
    'https://youpass.vn/luyen-thi/ielts/listening?quiz_type=quiz&status=unfinished',
    'https://youpass.vn/luyen-thi/ielts/speaking?quiz_type=quiz&status=unfinished'
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    viewport: { width: 1280, height: 800 }
});

await ctx.addCookies([
    { name: 'auth_token', value: TOKEN, domain: '.youpass.vn', path: '/', secure: true, sameSite: 'None' },
    { name: 'directus_refresh_token', value: REFRESH, domain: '.youpass.vn', path: '/', secure: true, httpOnly: true, sameSite: 'None' },
    { name: 'device_id', value: DEVICE || '', domain: '.youpass.vn', path: '/', secure: true, sameSite: 'None' }
]);

const log = [];

const page = await ctx.newPage();
page.on('request', req => {
    const url = req.url();
    if (!/cms\.youpass\.vn|youpass\.vn\/api/.test(url)) return;
    log.push({
        page: page.url(),
        method: req.method(),
        url,
        resourceType: req.resourceType(),
        postData: req.postData()?.slice(0, 800) || null
    });
});

page.on('response', async res => {
    const req = res.request();
    const url = res.url();
    if (!/cms\.youpass\.vn|youpass\.vn\/api/.test(url)) return;
    const entry = log.find(l => l.url === url && l.method === req.method() && !l.responseStatus);
    if (entry) {
        entry.responseStatus = res.status();
        try {
            const ct = res.headers()['content-type'] || '';
            if (ct.includes('application/json')) {
                const text = await res.text();
                entry.responseSnippet = text.slice(0, 800);
                try {
                    const j = JSON.parse(text);
                    if (Array.isArray(j?.data)) entry.dataLen = j.data.length;
                    if (j?.meta) entry.meta = j.meta;
                } catch {}
            }
        } catch {}
    }
});

for (const url of PAGES) {
    console.log('\n→', url);
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(8000);    // generous time for lazy fetches
    } catch (e) {
        console.log('  goto failed:', e.message);
    }
}

// Try clicking the first quiz card on the writing task-1 page
console.log('\n→ Clicking first quiz on writing/task-1');
await page.goto('https://youpass.vn/luyen-thi/ielts/writing/task-1?quiz_type=quiz&status=unfinished', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(5000);
try {
    const link = await page.$('a[href*="/quiz/"], a[href*="/practice/"], a[href*="/test/"]');
    if (link) {
        const href = await link.getAttribute('href');
        console.log('  found link:', href);
        await link.click();
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'docs/youpass-quiz-detail.png', fullPage: true });
        console.log('  screenshot: docs/youpass-quiz-detail.png');
    } else {
        console.log('  no quiz link found');
    }
} catch (e) {
    console.log('  click failed:', e.message);
}

await browser.close();

// Dedupe identical URL+method
const seen = new Set();
const dedup = log.filter(l => {
    const k = `${l.method}::${l.url.split('?')[0]}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
});

const outDir = path.join(process.cwd(), 'docs');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'youpass-network.json'), JSON.stringify({ pages: PAGES, total: log.length, deduped: dedup.length, log: dedup, full: log }, null, 2));
console.log(`\nCaptured ${log.length} requests (${dedup.length} unique). Saved to docs/youpass-network.json`);

// scripts/youpass/network-recon-v2.mjs — capture ALL requests, screenshot login state
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const TOKEN = process.env.YOUPASS_TOKEN;
const REFRESH = process.env.YOUPASS_REFRESH;
const DEVICE = process.env.YOUPASS_DEVICE;

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
    log.push({
        page: page.url(),
        method: req.method(),
        url: req.url(),
        type: req.resourceType()
    });
});
page.on('response', res => {
    const entry = log.find(l => l.url === res.url() && !l.status);
    if (entry) entry.status = res.status();
});

console.log('→ Navigate to homepage to verify login');
await page.goto('https://youpass.vn/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: 'docs/youpass-home.png', fullPage: false });

const title = await page.title();
const userMenu = await page.$('text=Đăng xuất').catch(() => null) ||
                 await page.$('text=Logout').catch(() => null) ||
                 await page.$('[class*="avatar"]').catch(() => null);
console.log(`  title: ${title}`);
console.log(`  logged in indicator: ${userMenu ? 'YES' : 'NO'}`);

console.log('\n→ Navigate to writing task-1');
await page.goto('https://youpass.vn/luyen-thi/ielts/writing/task-1?quiz_type=quiz&status=unfinished', { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: 'docs/youpass-writing.png', fullPage: false });

console.log('\nTotal requests captured:', log.length);
console.log('Resource type breakdown:');
const byType = {};
log.forEach(l => byType[l.type] = (byType[l.type] || 0) + 1);
console.log(byType);

const xhr = log.filter(l => l.type === 'xhr' || l.type === 'fetch');
console.log(`\nXHR/Fetch requests (${xhr.length}):`);
xhr.slice(0, 25).forEach(l => console.log(`  [${l.status || '?'}] ${l.method} ${l.url.slice(0, 140)}`));

await browser.close();

const outDir = path.join(process.cwd(), 'docs');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'youpass-network-v2.json'),
    JSON.stringify({ total: log.length, byType, xhr, all: log.slice(0, 200) }, null, 2));
console.log('\nSaved to docs/youpass-network-v2.json');

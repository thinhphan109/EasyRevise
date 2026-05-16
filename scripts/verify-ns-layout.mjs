import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const admin = usersData.users.find(u => u.role === 'admin') || usersData.users[0];
const ART = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\226f2d85-2fe8-470b-b598-63e7703afe4e\\artifacts';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1300, height: 900, deviceScaleFactor: 1.5 });
await page.evaluateOnNewDocument((u, t) => {
    localStorage.setItem('easyrevise_token', t);
    localStorage.setItem('easyrevise_user', JSON.stringify(u));
    localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 3600 * 1000 }));
    localStorage.setItem('easyrevise_theme', 'dark');
}, { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role }, admin.token);

await page.goto('http://localhost:3000/admin/', { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 1500));

// Question bank tab — has 3 selects on one row
await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('questionBank'); });
await new Promise(r => setTimeout(r, 1800));
await page.screenshot({ path: path.join(ART, 'verify_qb_filters.png'), clip: { x: 230, y: 70, width: 1060, height: 220 }});
console.log('✓ verify_qb_filters.png');

// Open one select with search
await page.evaluate(() => {
    const trigs = document.querySelectorAll('.page-filter-bar .ns-host .ns-trigger, .ns-host .ns-trigger');
    if (trigs.length) trigs[0].click();
});
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: path.join(ART, 'verify_search_box.png') });
console.log('✓ verify_search_box.png');

await browser.close();

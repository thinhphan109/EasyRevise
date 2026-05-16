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
await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('submissions'); });
await new Promise(r => setTimeout(r, 1500));

// 1) Click 2 checkboxes
const clicked = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('.submission-checkbox input').forEach((cb, i) => { if (i < 2) { cb.click(); n++; } });
    return n;
});
console.log(`clicked ${clicked} checkboxes`);
await new Promise(r => setTimeout(r, 700));

// 2) Scroll down so sticky goes off screen → floating appears
await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: path.join(ART, 'verify_on_submissions_floating.png') });
console.log('✓ verify_on_submissions_floating.png');

// 3) Switch to another tab — floating should disappear
await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('exams'); });
await new Promise(r => setTimeout(r, 1000));
await page.screenshot({ path: path.join(ART, 'verify_off_submissions.png') });
console.log('✓ verify_off_submissions.png');

// 4) Check is-visible class state
const fbState = await page.evaluate(() => {
    const f = document.getElementById('submissionFloatingBar');
    return { exists: !!f, visible: f ? f.classList.contains('is-visible') : null };
});
console.log('floating bar after tab switch:', fbState);

await browser.close();

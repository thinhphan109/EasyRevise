import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const admin = usersData.users.find(u => u.role === 'admin') || usersData.users[0];
const ART = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\226f2d85-2fe8-470b-b598-63e7703afe4e\\artifacts';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const [theme, suffix] of [['light', ''], ['dark', '_dark']]) {
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('  err:', m.text().slice(0, 100)); });
    await page.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 1.5 });
    await page.evaluateOnNewDocument((u, t, th) => {
        localStorage.setItem('easyrevise_token', t);
        localStorage.setItem('easyrevise_user', JSON.stringify(u));
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 3600 * 1000 }));
        localStorage.setItem('easyrevise_theme', th);
    }, { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role }, admin.token, theme);

    await page.goto('http://localhost:3000/admin/', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    // Switch to submissions tab
    await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('submissions'); });
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(ART, `admin_submissions${suffix}.png`) });
    console.log(`✓ admin_submissions${suffix}.png`);

    // Click first checkbox if any
    const ok = await page.evaluate(() => {
        const cb = document.querySelector('.submission-checkbox input');
        if (cb) { cb.click(); return true; }
        return false;
    });
    if (ok) {
        await new Promise(r => setTimeout(r, 600));
        await page.screenshot({ path: path.join(ART, `admin_submissions_selected${suffix}.png`) });
        console.log(`✓ admin_submissions_selected${suffix}.png`);
    }
    await page.close();
}
await browser.close();

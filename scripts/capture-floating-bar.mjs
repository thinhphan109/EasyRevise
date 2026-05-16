import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const admin = usersData.users.find(u => u.role === 'admin') || usersData.users[0];
const ART = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\226f2d85-2fe8-470b-b598-63e7703afe4e\\artifacts';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const [theme, suffix] of [['dark', '_dark'], ['light', '']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1300, height: 900, deviceScaleFactor: 1.5 });
    await page.evaluateOnNewDocument((u, t, th) => {
        localStorage.setItem('easyrevise_token', t);
        localStorage.setItem('easyrevise_user', JSON.stringify(u));
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 3600 * 1000 }));
        localStorage.setItem('easyrevise_theme', th);
    }, { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role }, admin.token, theme);

    await page.goto('http://localhost:3000/admin/', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('submissions'); });
    await new Promise(r => setTimeout(r, 1800));

    // Select 3 first checkboxes
    await page.evaluate(() => {
        document.querySelectorAll('.submission-checkbox input').forEach((cb, i) => {
            if (i < 3) cb.click();
        });
    });
    await new Promise(r => setTimeout(r, 500));

    // Scroll down so the sticky bar goes off-screen
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ART, `admin_floating_bar${suffix}.png`) });
    console.log(`✓ admin_floating_bar${suffix}.png`);
    await page.close();
}
await browser.close();

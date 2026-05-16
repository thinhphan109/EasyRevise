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

// Wait for filter select to be enhanced and click it
const opened = await page.evaluate(() => {
    const trig = document.querySelector('.ns-host .ns-trigger');
    if (!trig) return false;
    trig.click();
    return true;
});
await new Promise(r => setTimeout(r, 600));
console.log('opened native dropdown:', opened);
await page.screenshot({ path: path.join(ART, 'verify_native_select_open.png'), fullPage: false });
console.log('✓ verify_native_select_open.png');

await browser.close();

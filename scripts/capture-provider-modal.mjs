// Capture provider modal in 3 states: closed, open with dropdown closed, open with dropdown expanded
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
    await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 1.5 });
    await page.evaluateOnNewDocument((user, token, t) => {
        localStorage.setItem('easyrevise_token', token);
        localStorage.setItem('easyrevise_user', JSON.stringify(user));
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 3600 * 1000 }));
        localStorage.setItem('easyrevise_theme', t);
    }, { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role }, admin.token, theme);

    await page.goto('http://localhost:3000/admin/', { waitUntil: 'networkidle2', timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    // Open provider modal directly via JS (avoid needing to click into Settings tab)
    await page.evaluate(() => {
        if (typeof showProviderModal === 'function') showProviderModal();
        else if (typeof window.showProviderModal === 'function') window.showProviderModal();
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ART, `provider_modal${suffix}.png`) });
    console.log(`✓ provider_modal${suffix}.png`);

    // Now expand the dropdown
    await page.evaluate(() => window._themeDropdownToggle('pmSdkDropdown'));
    await new Promise(r => setTimeout(r, 350));
    await page.screenshot({ path: path.join(ART, `provider_modal_dropdown${suffix}.png`) });
    console.log(`✓ provider_modal_dropdown${suffix}.png`);
    await page.close();
}

await browser.close();

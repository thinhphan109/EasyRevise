// Capture admin panel baseline before HIG redesign
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const adminUser = usersData.users.find(u => u.role === 'admin');

async function shoot(theme, name) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    page.on('console', m => { if (m.type() === 'error') console.log('  err:', m.text()); });

    await page.evaluateOnNewDocument((theme, user, token) => {
        localStorage.setItem('easyrevise_theme', theme);
        localStorage.setItem('easyrevise_token', token);
        localStorage.setItem('easyrevise_user', JSON.stringify(user));
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
    }, theme, { id: adminUser.id, username: adminUser.username, displayName: adminUser.displayName, role: adminUser.role }, adminUser.token);

    await page.goto(`${HOST}/admin`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 3000));

    const outDir = path.join(__dirname, '..', '_visual_captures');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, `${name}_${theme}.png`), fullPage: false });
    console.log(`✓ ${name}_${theme}.png`);
    await browser.close();
}

await shoot('light', 'admin_baseline');
await shoot('dark', 'admin_baseline');

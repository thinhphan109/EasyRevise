// Quick mobile screenshots — both themes, signed-in (avatar)
import puppeteer from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';

const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const adminUser = usersData.users.find(u => u.role === 'admin') || usersData.users[0];

async function shoot(theme) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 375, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    await page.evaluateOnNewDocument((theme, user, token) => {
        localStorage.setItem('easyrevise_theme', theme);
        localStorage.setItem('easyrevise_token', token);
        localStorage.setItem('easyrevise_user', JSON.stringify(user));
    }, theme, { id: adminUser.id, username: adminUser.username, displayName: adminUser.displayName, role: adminUser.role }, adminUser.token);

    await page.goto(`${HOST}/`, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    const outDir = path.join(__dirname, '..', '_visual_captures');
    fs.mkdirSync(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, `home_mobile_${theme}.png`), fullPage: false });
    console.log(`✓ Saved home_mobile_${theme}.png`);
    await browser.close();
}

await shoot('light');
await shoot('dark');

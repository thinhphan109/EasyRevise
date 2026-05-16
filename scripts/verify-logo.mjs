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
await page.setViewport({ width: 1300, height: 900, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument((u, t) => {
    localStorage.setItem('easyrevise_token', t);
    localStorage.setItem('easyrevise_user', JSON.stringify(u));
    localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 3600 * 1000 }));
    localStorage.setItem('easyrevise_theme', 'dark');
}, { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role }, admin.token);

// Admin sidebar logo
await page.goto('http://localhost:3000/admin/', { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: path.join(ART, 'verify_admin_logo.png'), clip: { x: 0, y: 0, width: 280, height: 100 }});
console.log('✓ verify_admin_logo.png');

// Home header logo (light mode)
await page.evaluateOnNewDocument(() => { localStorage.setItem('easyrevise_theme', 'light'); });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: path.join(ART, 'verify_home_logo_light.png'), clip: { x: 0, y: 0, width: 600, height: 100 }});
console.log('✓ verify_home_logo_light.png');

// Verify favicon link works
const headState = await page.evaluate(() => ({
    favicon: document.querySelector('link[rel="icon"]')?.href,
    manifest: document.querySelector('link[rel="manifest"]')?.href,
    themeColor: document.querySelector('meta[name="theme-color"]')?.content,
    ogImage: document.querySelector('meta[property="og:image"]')?.content
}));
console.log('head state:', headState);

await browser.close();

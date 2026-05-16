import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const adminUser = usersData.users.find(u => u.role === 'admin');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument((user, token) => {
    localStorage.setItem('easyrevise_token', token);
    localStorage.setItem('easyrevise_user', JSON.stringify(user));
    localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
}, { id: adminUser.id, username: adminUser.username, displayName: adminUser.displayName, role: adminUser.role }, adminUser.token);
await page.goto(`${HOST}/admin`, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));

const result = await page.evaluate(() => {
    const nav = document.querySelector('.sidebar-nav');
    const items = Array.from(document.querySelectorAll('.sidebar-nav > *'));
    const widest = items.map(el => ({
        tag: el.tagName,
        cls: el.className?.toString().slice(0, 50),
        text: el.textContent?.trim().slice(0, 30),
        w: el.offsetWidth,
        sw: el.scrollWidth,
        oversized: el.scrollWidth > nav.clientWidth
    })).filter(x => x.oversized).slice(0, 10);

    // Find actual element widest
    const wider = [];
    nav.querySelectorAll('*').forEach(el => {
        if (el.offsetWidth > 250 || el.scrollWidth > 250) {
            wider.push({
                tag: el.tagName,
                cls: el.className?.toString().slice(0, 50),
                text: el.textContent?.trim().slice(0, 40),
                w: el.offsetWidth,
                sw: el.scrollWidth
            });
        }
    });

    return {
        navContainer: { w: nav.clientWidth, sw: nav.scrollWidth },
        oversizedDirectChildren: widest,
        anyWideDescendant: wider.slice(0, 8)
    };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();

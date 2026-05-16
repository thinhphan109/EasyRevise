// Inspect what child of .sidebar-nav is 470px wide.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const admin = usersData.users.find(u => u.role === 'admin') || usersData.users[0];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.evaluateOnNewDocument((user, token) => {
    localStorage.setItem('easyrevise_token', token);
    localStorage.setItem('easyrevise_user', JSON.stringify(user));
    localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
}, { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role }, admin.token);

await page.goto('http://localhost:3000/admin', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));

const offenders = await page.evaluate(() => {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return null;
    const navW = nav.getBoundingClientRect().width;
    const navSw = nav.scrollWidth;
    const items = [];
    nav.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > navW + 1 || r.right > navW + 1) {
            items.push({
                tag: el.tagName,
                cls: el.className?.toString().slice(0, 80),
                width: Math.round(r.width),
                left: Math.round(r.left),
                right: Math.round(r.right),
                text: el.textContent.trim().slice(0, 30)
            });
        }
    });
    return { navW, navSw, items: items.slice(0, 20) };
});

console.log(JSON.stringify(offenders, null, 2));
await browser.close();

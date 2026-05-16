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
const consoleErrors = [];
const networkErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('requestfailed', r => networkErrors.push(`${r.method()} ${r.url()} - ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) networkErrors.push(`${r.status()} ${r.url()}`); });

await page.setViewport({ width: 1440, height: 900 });

await page.evaluateOnNewDocument((user, token) => {
    localStorage.setItem('easyrevise_token', token);
    localStorage.setItem('easyrevise_user', JSON.stringify(user));
    localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
}, { id: adminUser.id, username: adminUser.username, displayName: adminUser.displayName, role: adminUser.role }, adminUser.token);

await page.goto(`${HOST}/admin`, { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise(r => setTimeout(r, 2500));

const layout = await page.evaluate(() => {
    return {
        viewport: window.innerWidth,
        htmlScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        sidebar: (() => { const s = document.querySelector('.admin-sidebar'); return s ? { width: s.offsetWidth, top: s.getBoundingClientRect().top, left: s.getBoundingClientRect().left } : null; })(),
        topbar: (() => { const t = document.querySelector('.admin-topbar'); return t ? { width: t.offsetWidth, height: t.offsetHeight } : null; })(),
        mainArea: (() => { const m = document.querySelector('.admin-main-area'); return m ? { width: m.offsetWidth, marginLeft: getComputedStyle(m).marginLeft } : null; })(),
        viewContainer: (() => { const v = document.querySelector('.admin-view-container'); return v ? { width: v.offsetWidth, scrollWidth: v.scrollWidth } : null; })(),
        tabBar: (() => { const t = document.querySelector('.tab-bar-wrapper'); return t ? { found: true, hasBg: getComputedStyle(t).backgroundColor !== 'rgba(0, 0, 0, 0)', hasBorder: getComputedStyle(t).borderTopWidth } : null; })(),
        loginGate: (() => { const l = document.getElementById('loginGate'); return l ? { display: getComputedStyle(l).display, visibility: getComputedStyle(l).visibility } : null; })(),
        adminMain: (() => { const a = document.getElementById('adminMain'); return a ? { display: getComputedStyle(a).display } : null; })(),
        activeTabItem: (() => { const a = document.querySelector('.tab-item.active, .sidebar-item.active'); return a ? { text: a.textContent.trim().slice(0, 30), bg: getComputedStyle(a).backgroundColor, color: getComputedStyle(a).color } : null; })(),
        anyOverflowingElement: (() => {
            const overflows = [];
            document.querySelectorAll('*').forEach(el => {
                if (el.scrollWidth > el.clientWidth + 5 && el.tagName !== 'HTML') {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 100) overflows.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 60), w: el.clientWidth, sw: el.scrollWidth });
                }
            });
            return overflows.slice(0, 8);
        })()
    };
});

console.log('=== LAYOUT ===');
console.log(JSON.stringify(layout, null, 2));
console.log('\n=== CONSOLE ERRORS (' + consoleErrors.length + ') ===');
consoleErrors.slice(0, 10).forEach(e => console.log(' ', e));
console.log('\n=== NETWORK ERRORS (' + networkErrors.length + ') ===');
networkErrors.slice(0, 10).forEach(e => console.log(' ', e));

await browser.close();

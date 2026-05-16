import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const adminUser = usersData.users.find(u => u.role === 'admin') || usersData.users[0];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 800, isMobile: true });

await page.evaluateOnNewDocument((user, token) => {
    localStorage.setItem('easyrevise_token', token);
    localStorage.setItem('easyrevise_user', JSON.stringify(user));
}, { id: adminUser.id, username: adminUser.username, displayName: adminUser.displayName, role: adminUser.role }, adminUser.token);

await page.goto(`${HOST}/`, { waitUntil: 'networkidle0', timeout: 15000 });
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const header = document.querySelector('.home-header');
    const headerInner = document.querySelector('.home-header-inner');
    const authArea = document.getElementById('authArea');
    const authMenu = document.querySelector('.home-auth-menu');
    return {
        viewport: window.innerWidth,
        htmlScrollWidth: html.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        hasOverflow: html.scrollWidth > window.innerWidth,
        header: header ? { width: header.offsetWidth, scrollWidth: header.scrollWidth } : null,
        headerInner: headerInner ? { width: headerInner.offsetWidth, scrollWidth: headerInner.scrollWidth } : null,
        authArea: authArea ? { width: authArea.offsetWidth, scrollWidth: authArea.scrollWidth, html: authArea.innerHTML.slice(0, 200) } : null,
        authMenuChildren: authMenu ? authMenu.children.length : 0
    };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();

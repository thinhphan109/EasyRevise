// Render dashboard, trigger delete confirm popup, capture
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const user = usersData.users.find(u => Array.isArray(u.history) && u.history.length) || usersData.users[0];

const out = path.join(__dirname, '..', 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\226f2d85-2fe8-470b-b598-63e7703afe4e\\artifacts');
const ART_DIR = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\226f2d85-2fe8-470b-b598-63e7703afe4e\\artifacts';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// 1) Dashboard delete confirm popup
{
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 720, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((tok) => localStorage.setItem('easyrevise_token', tok), user.token);
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1200));
    // Click first delete button
    await page.click('.history-item-delete');
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ART_DIR, 'popup_confirm_v2.png') });
    console.log('✓ popup_confirm_v2.png');
    await page.close();
}

// 2) Dashboard delete confirm — DARK theme
{
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 720, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument((tok) => {
        localStorage.setItem('easyrevise_token', tok);
        localStorage.setItem('easyrevise_theme', 'dark');
    }, user.token);
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1200));
    await page.click('.history-item-delete');
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ART_DIR, 'popup_confirm_dark_v2.png') });
    console.log('✓ popup_confirm_dark_v2.png');
    await page.close();
}

await browser.close();

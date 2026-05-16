// Quick debug: open dashboard with admin token, capture console + state
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usersPath = path.join(__dirname, '..', 'data', 'users.json');
const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
const token = usersData.users[0].token;
console.log('Real token:', token.slice(0, 30) + '...');

// Test 3 scenarios
const scenarios = [
    { name: 'no-token', token: null },
    { name: 'invalid-token', token: 'fake-invalid-token-xyz' },
    { name: 'real-token', token }
];

for (const scenario of scenarios) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 60000 });
    const page = await browser.newPage();
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleMessages.push(`[pageerror] ${err.message}`));

    await page.evaluateOnNewDocument((t) => {
        if (t) localStorage.setItem('easyrevise_token', t);
        localStorage.setItem('easyrevise_theme', 'light');
    }, scenario.token);

    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 4000));

    const state = await page.evaluate(() => ({
        loadingHidden: document.getElementById('dashboardLoading')?.hidden,
        contentHidden: document.getElementById('dashboardContent')?.hidden,
        loginHidden: document.getElementById('dashboardLoginRequired')?.hidden,
        profileName: document.getElementById('profileName')?.textContent
    }));

    console.log(`\n━━━ ${scenario.name} ━━━`);
    console.log('State:', JSON.stringify(state));
    if (consoleMessages.length) console.log('Console:', consoleMessages.slice(0, 5).join(' | '));

    await browser.close();
}

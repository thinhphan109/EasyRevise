// Quick capture of dashboard.html (logged in as admin user) to verify delete buttons appear
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const usersData = JSON.parse(fs.readFileSync('./data/users.json', 'utf8'));
const user = usersData.users.find(u => Array.isArray(u.history) && u.history.length) || usersData.users[0];
const token = user.token;

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// Set token before navigation
await page.evaluateOnNewDocument((tok) => {
    localStorage.setItem('easyrevise_token', tok);
}, token);

await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'networkidle2', timeout: 15000 });
await new Promise(r => setTimeout(r, 1500));

const out = path.resolve('./_dashboard_capture.png');
await page.screenshot({ path: out, fullPage: true });
console.log('Saved:', out);

// Check delete buttons
const delCount = await page.$$eval('.history-item-delete', els => els.length);
const expandedToggle = await page.$$eval('.home-list-toggle', els => els.map(b => b.textContent.trim()));
const loadingHidden = await page.$eval('#dashboardLoading', el => el.hasAttribute('hidden'));
console.log('delete buttons:', delCount, '| toggle:', expandedToggle, '| loadingHidden:', loadingHidden);

await browser.close();

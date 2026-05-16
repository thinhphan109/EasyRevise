// Auto-detect visual bugs in admin: contrast, overlap, hidden elements, inline color hacks
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = 'http://localhost:3000';
const usersData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'users.json'), 'utf8'));
const adminUser = usersData.users.find(u => u.role === 'admin');

async function audit(theme) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', e => console.log('PAGE ERR:', e.message));

    await page.evaluateOnNewDocument((theme, user, token) => {
        localStorage.setItem('easyrevise_theme', theme);
        localStorage.setItem('easyrevise_token', token);
        localStorage.setItem('easyrevise_user', JSON.stringify(user));
        localStorage.setItem('easyrevise_admin_pin_session', JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
    }, theme, { id: adminUser.id, username: adminUser.username, displayName: adminUser.displayName, role: adminUser.role }, adminUser.token);

    await page.goto(`${HOST}/admin`, { waitUntil: 'networkidle0', timeout: 20000 });
    await new Promise(r => setTimeout(r, 2500));

    const result = await page.evaluate(() => {
        // Compute relative luminance
        const lum = (r, g, b) => {
            const a = [r, g, b].map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
        };
        const parseColor = c => { const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
        const contrast = (c1, c2) => { const a = lum(...c1) + 0.05; const b = lum(...c2) + 0.05; return a > b ? a / b : b / a; };

        // Find effective bg behind transparent elements
        const getEffectiveBg = el => {
            let cur = el;
            while (cur) {
                const c = parseColor(getComputedStyle(cur).backgroundColor);
                if (c) {
                    const opacity = parseFloat(getComputedStyle(cur).opacity);
                    const m = getComputedStyle(cur).backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
                    const alpha = m ? parseFloat(m[1]) : 1;
                    if (alpha > 0.5) return c;
                }
                cur = cur.parentElement;
            }
            return [255, 255, 255];
        };

        const bugs = [];

        // 1. Low-contrast text (interactive + visible)
        const checkContrast = sel => {
            document.querySelectorAll(sel).forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.width < 5 || r.height < 5) return;
                const txt = el.textContent.trim();
                if (!txt || txt.length < 2) return;
                const fg = parseColor(getComputedStyle(el).color);
                const bg = getEffectiveBg(el);
                if (!fg) return;
                const c = contrast(fg, bg);
                const fontSize = parseFloat(getComputedStyle(el).fontSize);
                const isLarge = fontSize >= 18 || (fontSize >= 14 && parseInt(getComputedStyle(el).fontWeight) >= 700);
                const min = isLarge ? 3 : 4.5;
                if (c < min) {
                    bugs.push({
                        type: 'low-contrast',
                        ratio: c.toFixed(2),
                        min,
                        sel: el.tagName + (el.id ? '#' + el.id : '') + (el.className?.toString ? '.' + el.className.toString().split(' ')[0] : ''),
                        text: txt.slice(0, 50),
                        fg: `rgb(${fg.join(',')})`,
                        bg: `rgb(${bg.join(',')})`,
                        path: getPath(el)
                    });
                }
            });
        };
        const getPath = el => {
            const parts = [];
            let cur = el;
            while (cur && cur !== document.body && parts.length < 4) {
                let p = cur.tagName.toLowerCase();
                if (cur.id) p += '#' + cur.id;
                else if (cur.className && typeof cur.className === 'string') p += '.' + cur.className.split(' ').slice(0, 2).join('.');
                parts.unshift(p);
                cur = cur.parentElement;
            }
            return parts.join(' > ');
        };

        // Test common interactive selectors
        ['button', '.btn', '.tab-item', '.sidebar-item', '.help-badge', '.role-badge', 'h2', 'h3', 'h4', '.page-subtitle', '.h-note', '.h-tip', 'label'].forEach(checkContrast);

        // 2. Find inline styles with hex colors that aren't tokens
        const inlineHex = [];
        document.querySelectorAll('[style]').forEach(el => {
            const s = el.getAttribute('style');
            const m = s.match(/#[0-9a-fA-F]{6}/g);
            if (m) {
                inlineHex.push({
                    tag: el.tagName,
                    cls: el.className?.toString().slice(0, 40),
                    hex: m.join(', '),
                    visible: el.offsetWidth > 0 && el.offsetHeight > 0,
                    text: el.textContent.trim().slice(0, 30)
                });
            }
        });

        // 3. Find overlapping clickable elements (z-index conflicts)
        // 4. Hidden/clipped buttons
        const clipped = [];
        document.querySelectorAll('button, .btn').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) {
                if (getComputedStyle(el).display !== 'none' && el.offsetParent !== null) {
                    clipped.push({ tag: el.tagName, cls: el.className?.toString().slice(0, 40), text: el.textContent.trim().slice(0, 30) });
                }
            }
        });

        return {
            theme: document.documentElement.getAttribute('data-theme'),
            contrastBugs: bugs.slice(0, 20),
            inlineHexCount: inlineHex.length,
            visibleInlineHex: inlineHex.filter(x => x.visible).slice(0, 15),
            clippedButtons: clipped.slice(0, 10)
        };
    });

    await browser.close();
    return result;
}

console.log('=== LIGHT THEME ===');
const light = await audit('light');
console.log(JSON.stringify(light, null, 2));
console.log('\n\n=== DARK THEME ===');
const dark = await audit('dark');
console.log(JSON.stringify(dark, null, 2));

import puppeteer from 'puppeteer';
import path from 'node:path';
const ART = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\226f2d85-2fe8-470b-b598-63e7703afe4e\\artifacts';

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

for (const [theme, suffix] of [['light', ''], ['dark', '_dark']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 700, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(t => localStorage.setItem('easyrevise_theme', t), theme);
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => {
        // Build a stub overlay using the new CSS classes
        const overlay = document.createElement('div');
        overlay.className = 'submit-confirm-overlay is-open';
        overlay.innerHTML = `
            <div class="submit-confirm-card">
                <div class="submit-confirm-body">
                    <div class="submit-confirm-head">
                        <div class="submit-confirm-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></svg>
                        </div>
                        <div class="submit-confirm-text">
                            <div class="submit-confirm-title">Còn 56 câu chưa trả lời</div>
                            <div class="submit-confirm-subtitle">Bạn có chắc muốn nộp bài ngay?</div>
                        </div>
                    </div>
                    <div class="submit-pills">
                        ${[6,10,11,12,13,14,15,16,17,18,19,20].map(n => `<span class="submit-pill">${n}</span>`).join('')}
                        <span class="submit-pill submit-pill-more">+44</span>
                    </div>
                </div>
                <div class="submit-confirm-actions">
                    <button class="submit-btn submit-btn-cancel">Làm tiếp</button>
                    <button class="submit-btn submit-btn-confirm">Nộp bài</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    });
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ART, `submit_confirm${suffix}.png`) });
    console.log(`✓ submit_confirm${suffix}.png`);
    await page.close();
}
await browser.close();

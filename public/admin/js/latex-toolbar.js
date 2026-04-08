// ========================
// latex-toolbar.js — LaTeX toolbar injection
// ========================

function injectLatexToolbar(textareaId, imageUploadCallback) {
    const ta = document.getElementById(textareaId);
    if (!ta || ta.dataset.latexToolbar) return;
    ta.dataset.latexToolbar = '1';

    const tokens = [
        { label: '∑', insert: '$\\sum_{i=1}^{n} $', cursor: -1 },
        { label: 'x²', insert: '^{2}' },
        { label: 'xₙ', insert: '_{n}' },
        { label: '√', insert: '$\\sqrt{}$', cursor: -2 },
        { label: '∫', insert: '$\\int_{a}^{b} $', cursor: -1 },
        { label: 'a/b', insert: '$\\frac{}{}$', cursor: -3 },
        { label: 'π', insert: '$\\pi$' },
        { label: '≤', insert: ' $\\leq$ ' },
        { label: '≥', insert: ' $\\geq$ ' },
        { label: '≠', insert: ' $\\neq$ ' },
        { label: '∞', insert: '$\\infty$' },
        { label: '±', insert: ' $\\pm$ ' },
        { label: '$…$', insert: '$$', cursor: -1, surround: true, inline: true },
        { label: '$$…$$', insert: '$$$$', cursor: -2, surround: true, block: true },
    ];

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-bottom:none;border-radius:8px 8px 0 0;';

    tokens.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = t.label;
        btn.title = t.insert;
        btn.style.cssText = 'padding:2px 7px;font-size:0.78rem;font-family:monospace;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-main);cursor:pointer;transition:all 0.12s;';
        btn.onmouseenter = () => { btn.style.borderColor = 'var(--primary)'; btn.style.color = 'var(--primary)'; };
        btn.onmouseleave = () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--text-main)'; };
        btn.onclick = () => insertLatex(ta, t.insert, t.cursor || 0, t.inline, t.block);
        bar.appendChild(btn);
    });

    if (imageUploadCallback) {
        const imgInput = document.createElement('input');
        imgInput.type = 'file';
        imgInput.accept = 'image/*';
        imgInput.multiple = true;
        imgInput.style.display = 'none';
        imgInput.addEventListener('change', async () => {
            for (const file of imgInput.files) { await imageUploadCallback(file); }
            imgInput.value = '';
        });
        bar.appendChild(imgInput);

        const imgBtn = document.createElement('button');
        imgBtn.type = 'button';
        imgBtn.textContent = '📷 Ảnh';
        imgBtn.title = 'Chèn ảnh vào ô giải thích (hỗ trợ nhiều ảnh, Ctrl+V)';
        imgBtn.style.cssText = 'padding:2px 8px;font-size:0.78rem;border:1px solid #10b981;border-radius:5px;background:rgba(16,185,129,0.08);color:#10b981;cursor:pointer;transition:all 0.12s;font-weight:600;';
        imgBtn.onmouseenter = () => { imgBtn.style.background = 'rgba(16,185,129,0.18)'; };
        imgBtn.onmouseleave = () => { imgBtn.style.background = 'rgba(16,185,129,0.08)'; };
        imgBtn.onclick = () => imgInput.click();
        bar.appendChild(imgBtn);
    }

    const lbl = document.createElement('span');
    lbl.textContent = 'LaTeX';
    lbl.style.cssText = 'margin-left:auto;font-size:0.65rem;color:var(--text-muted);align-self:center;padding-right:4px;font-weight:700;';
    bar.appendChild(lbl);

    ta.parentNode.insertBefore(bar, ta);
    ta.style.borderRadius = '0 0 8px 8px';
}

function insertLatex(ta, text, cursorOffset, inline, block) {
    const start = ta.selectionStart, end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    let inserted;
    if (inline && selected) { inserted = `$${selected}$`; }
    else if (block && selected) { inserted = `$$${selected}$$`; }
    else { inserted = text; }
    ta.value = ta.value.substring(0, start) + inserted + ta.value.substring(end);
    const pos = start + inserted.length + cursorOffset;
    ta.setSelectionRange(pos, pos);
    ta.focus();
}

// ========================
// ai-extract-ocr.js — AI Bóc tách: PDF/Image → Text → Word
// Converted from React to Vanilla JS for EasyRevise Admin Panel
// v2: Fixed UTF-8 Vietnamese in Word, drag-drop PDF, auto PDF→image
// ========================

const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
const PDF_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let _ocrPdfReady = false;
let _ocrPdfLoading = false;
let _ocrPreviewUrls = [];
let _ocrFileNames = [];
let _ocrExtractedImages = {};
let _ocrResultText = '';
let _ocrIsProcessing = false;
let _ocrAbortController = null;

// ── Load PDF.js lazily (returns Promise) ────────────────
function loadPdfJs() {
    if (_ocrPdfReady) return Promise.resolve();
    if (_ocrPdfLoading) {
        return new Promise(resolve => {
            const check = setInterval(() => {
                if (_ocrPdfReady) { clearInterval(check); resolve(); }
            }, 100);
        });
    }
    _ocrPdfLoading = true;
    return new Promise((resolve, reject) => {
        if (document.getElementById('pdfjsScript')) {
            _ocrPdfReady = true;
            _ocrPdfLoading = false;
            resolve();
            return;
        }
        const s = document.createElement('script');
        s.id = 'pdfjsScript';
        s.src = PDF_JS_CDN;
        s.onload = () => {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;
            _ocrPdfReady = true;
            _ocrPdfLoading = false;
            console.log('[AI OCR] PDF.js loaded');
            resolve();
        };
        s.onerror = () => {
            _ocrPdfLoading = false;
            reject(new Error('Failed to load PDF.js'));
        };
        document.head.appendChild(s);
    });
}

// ── Show the AI Extract Modal ──────────────────────────
function showAIExtractModal() {
    loadPdfJs(); // start loading early
    document.getElementById('aiOcrModal')?.remove();

    // Reset state
    _ocrPreviewUrls = [];
    _ocrFileNames = [];
    _ocrExtractedImages = {};
    _ocrResultText = '';
    _ocrIsProcessing = false;

    const modal = document.createElement('div');
    modal.id = 'aiOcrModal';
    modal.className = 'modal-overlay active';
    modal.style.cssText = 'display:flex;z-index:500;';
    modal.innerHTML = `
    <div class="glass-panel modal-content" style="max-width:960px;width:95vw;max-height:90vh;overflow-y:auto;padding:0;">
        <!-- Header -->
        <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--color-surface);z-index:1;">
            <div>
                <h3 style="font-size:1.1rem;font-weight:700;margin:0;">Chuyển đổi PDF/Ảnh sang Word</h3>
                <p style="font-size:0.78rem;color:var(--text-muted);margin:0.25rem 0 0;">AI đọc ảnh → văn bản có cấu trúc (LaTeX, bảng, hình ảnh)</p>
            </div>
            <button class="btn btn-sm btn-ghost" onclick="ocrSafeClose()" style="font-size:1.2rem;padding:0.25rem 0.5rem;">✕</button>
        </div>

        <!-- Body -->
        <div style="padding:1.25rem 1.5rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;" id="ocrGrid">
                <!-- Left: Upload + Preview -->
                <div>
                    <!-- Drop zone -->
                    <div id="ocrDropZone" class="ocr-drop-zone" onclick="document.getElementById('ocrFileInput').click()">
                        <input type="file" id="ocrFileInput" accept="image/*,application/pdf" multiple style="display:none;" onchange="ocrHandleFiles(this.files)">
                        <div class="ocr-drop-content">
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-muted);"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            <p style="font-weight:600;margin:0.5rem 0 0;">Kéo thả, nhấn chọn hoặc dán (Ctrl+V)</p>
                            <p style="font-size:0.75rem;color:var(--text-muted);margin:0;">Hỗ trợ PDF, JPG, PNG (nhiều file)</p>
                        </div>
                        <button id="ocrClearBtn" class="ocr-clear-btn" style="display:none;" onclick="event.stopPropagation();ocrClearAll()">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>

                    <!-- File count -->
                    <div id="ocrFileInfo" style="display:none;margin-top:0.5rem;font-size:0.78rem;color:var(--text-muted);"></div>

                    <!-- Preview thumbnails -->
                    <div id="ocrPreviewArea" style="display:none;margin-top:0.75rem;">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                            <span style="font-weight:600;font-size:0.82rem;">Xem trước (<span id="ocrPageCount">0</span>)</span>
                            <div style="display:flex;gap:0.4rem;">
                                <button id="ocrStitchBtn" class="btn btn-sm" style="background:var(--color-primary-50);color:var(--color-primary);border:none;display:none;" onclick="ocrStitchImages()">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:3px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>Dàn ảnh
                                </button>
                                <button id="ocrConvertBtn" class="btn btn-sm btn-primary" onclick="ocrProcessOCR()" disabled>Chuyển đổi</button>
                            </div>
                        </div>
                        <div id="ocrThumbs" class="ocr-thumbs-row"></div>
                    </div>
                </div>

                <!-- Right: Results -->
                <div style="display:flex;flex-direction:column;min-height:400px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                        <span style="font-weight:600;font-size:0.82rem;">Kết quả</span>
                        <div style="display:flex;gap:0.4rem;">
                            <button class="btn btn-sm btn-ghost" onclick="ocrCopyResult()" id="ocrCopyBtn" disabled title="Sao chép">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                            <button class="btn btn-sm" style="background:#10b981;color:white;border:none;" onclick="ocrDownloadWord()" id="ocrDownloadBtn" disabled>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:3px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Xuất Word
                            </button>
                        </div>
                    </div>

                    <!-- Status -->
                    <div id="ocrStatusBar" style="display:none;" class="ocr-status-bar"></div>

                    <!-- Progress -->
                    <div id="ocrProgressBar" style="display:none;margin-bottom:0.5rem;">
                        <div style="width:100%;height:4px;background:var(--color-border);border-radius:4px;overflow:hidden;">
                            <div id="ocrProgressFill" style="width:0%;height:100%;background:var(--color-primary);transition:width 0.3s;border-radius:4px;"></div>
                        </div>
                    </div>

                    <!-- Textarea output -->
                    <textarea id="ocrResultTextarea" class="ocr-result-textarea" placeholder="Văn bản sẽ xuất hiện tại đây sau khi chuyển đổi..."></textarea>

                    <div id="ocrImageHint" style="display:none;margin-top:0.5rem;padding:0.5rem 0.75rem;background:var(--color-warning-bg, #fef3c7);border:1px solid var(--color-warning, #f59e0b);border-radius:var(--radius-md);font-size:0.72rem;color:var(--color-warning-text, #92400e);">
                        💡 Thẻ [HÌNH ẢNH MINH HOẠ: IMG_...] sẽ biến thành ảnh thật khi Xuất Word.
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) ocrSafeClose(); });

    // Setup drag & drop on BOTH dropzone and the entire modal body
    const dz = document.getElementById('ocrDropZone');

    // Prevent browser default for drag over the entire modal
    const modalContent = modal.querySelector('.modal-content');
    modalContent.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
    modalContent.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        if (!_ocrIsProcessing) ocrHandleFiles(e.dataTransfer.files);
    });

    // Visual feedback on drop zone specifically
    dz.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('dragging'); });
    dz.addEventListener('dragleave', e => { e.preventDefault(); dz.classList.remove('dragging'); });
    dz.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragging');
        if (!_ocrIsProcessing) ocrHandleFiles(e.dataTransfer.files);
    });

    // Clipboard paste
    const pasteHandler = async (e) => {
        if (_ocrIsProcessing) return;
        if (!document.getElementById('aiOcrModal')) { window.removeEventListener('paste', pasteHandler); return; }
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        const items = e.clipboardData?.items;
        if (!items) return;
        const files = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                const f = items[i].getAsFile();
                if (f) {
                    const ext = f.type.split('/')[1] || 'png';
                    files.push(new File([f], `Clipboard_${Date.now()}_${i}.${ext}`, { type: f.type }));
                }
            }
        }
        if (files.length > 0) { e.preventDefault(); ocrHandleFiles(files); }
    };
    window.addEventListener('paste', pasteHandler);

    // Mobile responsive
    if (window.innerWidth <= 768) {
        document.getElementById('ocrGrid').style.gridTemplateColumns = '1fr';
    }
}

// ── Handle file selection ──────────────────────────────
async function ocrHandleFiles(fileList) {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);

    ocrSetStatus('info', 'Đang tải file...');
    _ocrIsProcessing = true;

    for (const file of files) {
        _ocrFileNames.push(file.name);
        if (file.type.startsWith('image/')) {
            const url = await new Promise(resolve => {
                const r = new FileReader();
                r.onload = e => resolve(e.target.result);
                r.readAsDataURL(file);
            });
            _ocrPreviewUrls.push(url);
        } else if (file.type === 'application/pdf') {
            // Wait for PDF.js to be fully loaded before processing
            try {
                await loadPdfJs();
            } catch (e) {
                ocrSetStatus('error', 'Không thể tải PDF.js. Vui lòng tải lại trang.');
                continue;
            }
            try {
                ocrSetStatus('info', `Đang render PDF: ${file.name}...`);
                const buf = await file.arrayBuffer();
                const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    ocrSetStatus('info', `Đang render PDF trang ${i}/${pdf.numPages}: ${file.name}`);
                    const pg = await pdf.getPage(i);
                    const vp = pg.getViewport({ scale: 1.5 });
                    const cv = document.createElement('canvas');
                    cv.width = vp.width; cv.height = vp.height;
                    await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
                    _ocrPreviewUrls.push(cv.toDataURL('image/jpeg', 0.85));
                    cv.width = 0; // free memory
                }
            } catch (e) {
                console.error('PDF parse error:', e);
                ocrSetStatus('error', `Lỗi đọc PDF "${file.name}": ${e.message}`);
            }
        } else {
            console.warn('Bỏ qua file không hỗ trợ:', file.name);
        }
    }

    _ocrIsProcessing = false;
    ocrUpdateUI();
    if (_ocrPreviewUrls.length > 0) {
        ocrSetStatus('success', `Đã tải ${_ocrPreviewUrls.length} trang/ảnh. Nhấn "Chuyển đổi" để bắt đầu.`);
    }

    // Reset file input
    const fi = document.getElementById('ocrFileInput');
    if (fi) fi.value = '';
}

// ── Update UI (thumbnails, buttons) ─────────────────────
function ocrUpdateUI() {
    const preview = document.getElementById('ocrPreviewArea');
    const thumbs = document.getElementById('ocrThumbs');
    const pageCount = document.getElementById('ocrPageCount');
    const clearBtn = document.getElementById('ocrClearBtn');
    const stitchBtn = document.getElementById('ocrStitchBtn');
    const convertBtn = document.getElementById('ocrConvertBtn');
    const fileInfo = document.getElementById('ocrFileInfo');

    if (_ocrPreviewUrls.length > 0) {
        preview.style.display = '';
        clearBtn.style.display = '';
        convertBtn.disabled = false;
        pageCount.textContent = _ocrPreviewUrls.length;
        stitchBtn.style.display = _ocrPreviewUrls.length > 1 ? '' : 'none';
        fileInfo.style.display = '';
        fileInfo.textContent = _ocrFileNames.join(', ');

        thumbs.innerHTML = _ocrPreviewUrls.map((url, i) =>
            `<div class="ocr-thumb">
                <img src="${url}" alt="Page ${i + 1}">
                <span class="ocr-thumb-label">Trang ${i + 1}</span>
            </div>`
        ).join('');
    } else {
        preview.style.display = 'none';
        clearBtn.style.display = 'none';
        fileInfo.style.display = 'none';
    }
}

// ── Stitch images vertically ───────────────────────────
async function ocrStitchImages() {
    if (_ocrPreviewUrls.length <= 1) return;
    _ocrIsProcessing = true;
    ocrSetStatus('info', 'Đang gộp ảnh...');

    try {
        const imgs = await Promise.all(_ocrPreviewUrls.map(url => new Promise(resolve => {
            const img = new Image(); img.onload = () => resolve(img); img.src = url;
        })));

        const MAX_H = 8000;
        const stitched = [];
        let batch = [], batchH = 0;

        for (const img of imgs) {
            if (batchH + img.height > MAX_H && batch.length) {
                stitched.push(ocrCreateStitchedCanvas(batch));
                batch = [img]; batchH = img.height;
            } else {
                batch.push(img); batchH += img.height;
            }
        }
        if (batch.length) stitched.push(ocrCreateStitchedCanvas(batch));

        _ocrPreviewUrls = stitched;
        ocrUpdateUI();
        ocrSetStatus('success', `Gộp thành ${stitched.length} ảnh. Nhấn "Chuyển đổi" để tiếp tục.`);
    } catch (e) {
        ocrSetStatus('error', 'Lỗi gộp ảnh: ' + e.message);
    }
    _ocrIsProcessing = false;
}

function ocrCreateStitchedCanvas(images) {
    const totalH = images.reduce((s, i) => s + i.height, 0);
    const maxW = Math.max(...images.map(i => i.width));
    const cv = document.createElement('canvas');
    cv.width = maxW; cv.height = totalH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    let y = 0;
    for (const img of images) {
        ctx.drawImage(img, (maxW - img.width) / 2, y);
        y += img.height;
    }
    const url = cv.toDataURL('image/jpeg', 0.85);
    cv.width = 0;
    return url;
}

// ── Process OCR via server ─────────────────────────────
async function ocrProcessOCR() {
    if (!_ocrPreviewUrls.length || _ocrIsProcessing) return;

    _ocrIsProcessing = true;
    _ocrResultText = '';
    _ocrExtractedImages = {};

    const textarea = document.getElementById('ocrResultTextarea');
    const progressBar = document.getElementById('ocrProgressBar');
    const progressFill = document.getElementById('ocrProgressFill');
    const convertBtn = document.getElementById('ocrConvertBtn');

    textarea.value = '';
    progressBar.style.display = '';
    progressFill.style.width = '0%';
    convertBtn.disabled = true;
    convertBtn.textContent = '⏳ Đang xử lý...';

    const token = localStorage.getItem('easyrevise_token');
    const BATCH = 2; // concurrent pages
    const results = new Array(_ocrPreviewUrls.length).fill('');
    let completed = 0;
    _ocrAbortController = new AbortController();
    const signal = _ocrAbortController.signal;

    try {
        for (let i = 0; i < _ocrPreviewUrls.length; i += BATCH) {
            if (signal.aborted) break;

            const batch = _ocrPreviewUrls.slice(i, i + BATCH);
            const endIdx = Math.min(i + BATCH, _ocrPreviewUrls.length);
            ocrSetStatus('info', `Đang xử lý trang ${i + 1}–${endIdx} / ${_ocrPreviewUrls.length}...`);

            const promises = batch.map(async (url, localIdx) => {
                const globalIdx = i + localIdx;
                const base64 = url.split(',')[1];

                const resp = await fetch('/api/admin/ai-ocr', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' }),
                    signal
                });

                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP ${resp.status}`);
                }

                const data = await resp.json();
                let text = data.text || '';

                // Extract bounding box images
                const bboxRegex = /\[IMG_BBOX:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g;
                const img = new Image();
                img.src = url;
                await new Promise(r => { img.onload = r; });

                let match, imgCount = 0;
                while ((match = bboxRegex.exec(text)) !== null) {
                    const [, ymin, xmin, ymax, xmax] = match.map(Number);
                    const sX = (xmin / 1000) * img.width, sY = (ymin / 1000) * img.height;
                    const sW = ((xmax - xmin) / 1000) * img.width, sH = ((ymax - ymin) / 1000) * img.height;
                    if (sW > 10 && sH > 10) {
                        const tc = document.createElement('canvas');
                        tc.width = sW; tc.height = sH;
                        tc.getContext('2d').drawImage(img, sX, sY, sW, sH, 0, 0, sW, sH);
                        const imageId = `IMG_P${globalIdx}_${imgCount}`;
                        _ocrExtractedImages[imageId] = tc.toDataURL('image/jpeg', 0.9);
                        text = text.replace(match[0], `\n[HÌNH ẢNH MINH HOẠ: ${imageId}]\n`);
                        tc.width = 0;
                        imgCount++;
                    }
                }

                results[globalIdx] = text;
                completed++;
                progressFill.style.width = `${Math.round((completed / _ocrPreviewUrls.length) * 100)}%`;
            });

            await Promise.all(promises);
        }

        _ocrResultText = results.join('\n\n--- PAGE BREAK ---\n\n');
        textarea.value = _ocrResultText;
        textarea.removeAttribute('readonly');

        // Enable result buttons
        document.getElementById('ocrCopyBtn').disabled = false;
        document.getElementById('ocrDownloadBtn').disabled = false;
        if (Object.keys(_ocrExtractedImages).length > 0) {
            document.getElementById('ocrImageHint').style.display = '';
        }

        ocrSetStatus('success', `✅ Hoàn tất! Đã xử lý ${_ocrPreviewUrls.length} trang.`);
    } catch (err) {
        if (err.name === 'AbortError') {
            ocrSetStatus('info', 'Đã hủy xử lý.');
        } else {
            console.error('OCR error:', err);
            ocrSetStatus('error', 'Lỗi: ' + err.message);
        }
    }

    _ocrIsProcessing = false;
    _ocrAbortController = null;
    convertBtn.disabled = false;
    convertBtn.textContent = 'Chuyển đổi';
    progressBar.style.display = 'none';
}

// ── Safe close (abort if processing) ───────────────────
function ocrSafeClose() {
    if (_ocrIsProcessing && _ocrAbortController) {
        _ocrAbortController.abort();
        _ocrIsProcessing = false;
        _ocrAbortController = null;
    }
    document.getElementById('aiOcrModal')?.remove();
}

// ── Copy result to clipboard ───────────────────────────
function ocrCopyResult() {
    const textarea = document.getElementById('ocrResultTextarea');
    if (textarea?.value) {
        navigator.clipboard.writeText(textarea.value);
        showToast('Đã sao chép!', 'success');
    }
}

// ── Download as Word (.doc) — FIX UTF-8 Vietnamese ─────
function ocrDownloadWord() {
    const text = document.getElementById('ocrResultTextarea')?.value;
    if (!text) return;

    // UTF-8 BOM is critical for Word to detect encoding correctly
    const BOM = '\uFEFF';

    // Word HTML format with proper Vietnamese font support
    const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta charset="utf-8">
<title>EasyRevise OCR Export</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
<style>
    @page { mso-page-orientation:portrait; margin:2cm; }
    body {
        font-family: 'Times New Roman', Times, serif;
        mso-ascii-font-family: 'Times New Roman';
        mso-hansi-font-family: 'Times New Roman';
        mso-bidi-font-family: 'Times New Roman';
        font-size: 13pt;
        line-height: 1.6;
        color: #000000;
    }
    p { margin: 0 0 6pt 0; mso-pagination: none; }
    b, strong { font-weight: bold; }
    table { border-collapse: collapse; margin: 6pt 0; }
    td, th { border: 1px solid #000; padding: 4pt 8pt; }
    hr { page-break-after: always; border: none; margin: 0; padding: 0; }
    img { max-width: 100%; }
    .page-break { page-break-after: always; }
</style>
</head>
<body>`;

    const footer = '</body></html>';

    let formatted = text;

    // ── 1. Convert LaTeX tables to HTML tables for Word ──
    formatted = formatted.replace(
        /\\begin\{tabular\}\{[^}]*\}([\s\S]*?)\\end\{tabular\}/g,
        (match, tableBody) => {
            let html = '<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;margin:6pt 0;">';
            // Split rows by \\ (row separator in LaTeX)
            const rows = tableBody.split('\\\\').filter(r => r.trim());
            for (const row of rows) {
                const trimmed = row.replace(/\\hline/g, '').trim();
                if (!trimmed) continue;
                html += '<tr>';
                const cells = trimmed.split('&');
                for (const cell of cells) {
                    const cellText = cell.trim();
                    html += `<td style="border:1px solid #000;padding:4pt 8pt;">${cellText}</td>`;
                }
                html += '</tr>';
            }
            html += '</table>';
            return html;
        }
    );

    // ── 2. Ensure spaces around $ delimiters (Toggle TeX compatibility) ──
    // "$AB$và" → "$AB$ và"  |  "điểm$M$" → "điểm $M$"
    formatted = formatted.replace(/\$([^$\n]+)\$([^\s\n,.:;!?\)}\]$"'])/g, '$$$1$$ $2');
    formatted = formatted.replace(/([^\s\n(\[{$"'])\$([^$\n]+)\$/g, '$1 $$$2$$');

    // ── 3. Convert markdown bold to HTML ──
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

    // ── 4. Page breaks ──
    formatted = formatted.replace(/---\s*PAGE BREAK\s*---/g, '<hr>');

    // ── 5. Convert newlines to HTML ──
    formatted = formatted.replace(/\n\n+/g, '</p>\n<p>');
    formatted = formatted.replace(/\n/g, '<br>\n');

    // Wrap in paragraphs
    formatted = '<p>' + formatted + '</p>';

    // Clean up empty paragraphs
    formatted = formatted.replace(/<p>\s*<\/p>/g, '');

    // ── 6. Replace image placeholders with actual base64 images ──
    formatted = formatted.replace(/\[HÌNH ẢNH MINH HOẠ:\s*(IMG_[^\]]+)\]/g, (match, id) => {
        if (_ocrExtractedImages[id]) {
            return `</p><div style="text-align:center;margin:12pt 0;"><img src="${_ocrExtractedImages[id]}" style="max-width:100%;border:1px solid #ccc;" /></div><p>`;
        }
        return match;
    });

    // Build final HTML with BOM
    const fullHtml = BOM + header + formatted + footer;

    // Create Blob with explicit UTF-8 charset
    const blob = new Blob([fullHtml], {
        type: 'application/msword;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TaiLieu_OCR_${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống file Word!', 'success');
}

// ── Clear all ──────────────────────────────────────────
function ocrClearAll() {
    _ocrPreviewUrls = [];
    _ocrFileNames = [];
    _ocrExtractedImages = {};
    _ocrResultText = '';

    const textarea = document.getElementById('ocrResultTextarea');
    if (textarea) { textarea.value = ''; textarea.setAttribute('readonly', ''); }
    document.getElementById('ocrCopyBtn') && (document.getElementById('ocrCopyBtn').disabled = true);
    document.getElementById('ocrDownloadBtn') && (document.getElementById('ocrDownloadBtn').disabled = true);
    document.getElementById('ocrImageHint') && (document.getElementById('ocrImageHint').style.display = 'none');
    document.getElementById('ocrStatusBar') && (document.getElementById('ocrStatusBar').style.display = 'none');

    ocrUpdateUI();
}

// ── Status bar helper ──────────────────────────────────
function ocrSetStatus(type, msg) {
    const bar = document.getElementById('ocrStatusBar');
    if (!bar) return;
    bar.style.display = '';
    const colors = {
        info: 'background:var(--color-info-bg, #dbeafe);color:var(--color-info, #2563eb);border-color:var(--color-info, #2563eb)',
        success: 'background:var(--color-success-bg, #d1fae5);color:var(--color-success, #059669);border-color:var(--color-success, #059669)',
        error: 'background:var(--color-error-bg, #fee2e2);color:var(--color-error, #dc2626);border-color:var(--color-error, #dc2626)'
    };
    bar.style.cssText = `display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;border-radius:var(--radius-md);margin-bottom:0.5rem;font-size:0.8rem;border:1px solid;${colors[type] || colors.info}`;
    const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : '⏳';
    bar.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
}

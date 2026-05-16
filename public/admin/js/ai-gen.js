// ========================
// ai-gen.js — AI exam generation, PDF/image preprocessing, preview, edit
// ========================

const AI_MAX_FILES = 10;
const AI_MAX_CANVAS_HEIGHT = 8000;
let aiPreviewUrls = [];
let aiClientOcrText = '';
let aiExtractedInlineImages = {};

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function dataUrlToFile(dataUrl, filename, mimeType = 'image/jpeg') {
    const [meta, data] = dataUrl.split(',');
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mimeType || meta.match(/data:(.*?);/)?.[1] || 'image/jpeg' });
}

async function ensurePdfJsReady() {
    if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = window.pdfjsLib.GlobalWorkerOptions.workerSrc || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        return window.pdfjsLib;
    }
    await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    return window.pdfjsLib;
}

async function renderPdfToImageFiles(file) {
    const pdfjsLib = await ensurePdfJsReady();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const out = [];
    const maxPages = Math.min(pdf.numPages, 20);

    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const url = canvas.toDataURL('image/jpeg', 0.84);
        out.push(dataUrlToFile(url, `${file.name.replace(/\.pdf$/i, '')}_page_${i}.jpg`, 'image/jpeg'));
    }

    if (pdf.numPages > maxPages) showToast(`PDF có ${pdf.numPages} trang, chỉ lấy ${maxPages} trang đầu để tránh quá tải.`, 'warning', 6000);
    return out;
}

async function handleAIFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const status = document.getElementById('aiStatus');
    if (status) { status.textContent = '⏳ Đang đọc file và tạo preview...'; status.style.color = 'var(--text-muted)'; }

    try {
        for (const f of files) {
            if (aiSelectedFiles.length >= AI_MAX_FILES) break;

            if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
                const pages = await renderPdfToImageFiles(f);
                for (const imgFile of pages) {
                    if (aiSelectedFiles.length >= AI_MAX_FILES) break;
                    aiSelectedFiles.push(imgFile);
                    aiPreviewUrls.push(await fileToDataUrl(imgFile));
                }
            } else if (f.type.startsWith('image/')) {
                aiSelectedFiles.push(f);
                aiPreviewUrls.push(await fileToDataUrl(f));
            } else {
                // DOCX hoặc file khác vẫn gửi server xử lý theo logic cũ
                aiSelectedFiles.push(f);
            }
        }

        aiClientOcrText = '';
        renderAIFileList();
        if (status) { status.textContent = `✅ Đã tải ${aiSelectedFiles.length} file/trang. Có thể dàn ảnh hoặc tạo đề ngay.`; status.style.color = 'var(--success)'; }
    } catch (err) {
        console.error('[AI files] error:', err);
        if (status) { status.textContent = '❌ Lỗi đọc file: ' + err.message; status.style.color = 'var(--danger)'; }
    } finally {
        const input = document.getElementById('aiFileInput');
        if (input) input.value = '';
    }
}

function removeAIFile(idx) {
    aiSelectedFiles.splice(idx, 1);
    aiPreviewUrls.splice(idx, 1);
    aiClientOcrText = '';
    renderAIFileList();
}

function clearAIFiles() {
    aiSelectedFiles = [];
    aiPreviewUrls = [];
    aiClientOcrText = '';
    aiExtractedInlineImages = {};
    renderAIFileList();
    const status = document.getElementById('aiStatus');
    if (status) status.textContent = '';
}

function renderAIFileList() {
    const c = document.getElementById('aiFileList');
    if (!c) return;
    if (!aiSelectedFiles.length) { c.innerHTML = ''; return; }

    const icons = { 'application/pdf': '📕', 'image/jpeg': '🖼️', 'image/png': '🖼️', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📘' };
    let html = `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">`;
    html += aiSelectedFiles.map((f, i) => {
        const icon = icons[f.type] || (f.type?.startsWith('image/') ? '🖼️' : '📄');
        const size = (f.size / 1024).toFixed(0);
        return `<div style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.4rem 0.8rem;background:var(--bg-input);border:1px solid var(--border);border-radius:10px;font-size:0.85rem;">
            ${icon} ${escapeHtml(f.name)} <span style="color:var(--text-muted);font-size:0.75rem;">(${size}KB)</span>
            <span style="cursor:pointer;color:#dc2626;font-weight:700;" onclick="removeAIFile(${i})">×</span>
        </div>`;
    }).join('');
    html += `</div>`;

    if (aiPreviewUrls.length) {
        html += `<div style="display:flex;gap:0.65rem;overflow-x:auto;padding:0.6rem;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:14px;">
            ${aiPreviewUrls.map((url, idx) => `<div style="flex:0 0 88px;height:122px;border-radius:10px;overflow:hidden;border:1px solid var(--border);position:relative;background:white;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
                <img src="${url}" alt="Trang ${idx + 1}" style="width:100%;height:100%;object-fit:cover;">
                <div style="position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);color:white;font-size:10px;text-align:center;padding:2px;">Trang ${idx + 1}</div>
            </div>`).join('')}
        </div>`;
    }

    c.innerHTML = html;
}

async function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

function createStitchedCanvas(images) {
    const totalHeight = images.reduce((sum, img) => sum + img.height, 0);
    const maxWidth = Math.max(...images.map(img => img.width));
    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const img of images) {
        const x = (maxWidth - img.width) / 2;
        ctx.drawImage(img, x, y);
        y += img.height;
    }
    return canvas.toDataURL('image/jpeg', 0.86);
}

async function stitchAIImages() {
    if (aiPreviewUrls.length <= 1) return showToast('Cần ít nhất 2 ảnh/trang để dàn.', 'warning');
    const status = document.getElementById('aiStatus');
    if (status) { status.textContent = '⏳ Đang dàn ảnh dọc...'; status.style.color = 'var(--text-muted)'; }
    _aiGenerating = true;
    try {
        const imgs = await Promise.all(aiPreviewUrls.map(loadImageFromUrl));
        const stitchedUrls = [];
        let batch = [];
        let h = 0;
        for (const img of imgs) {
            if (h + img.height > AI_MAX_CANVAS_HEIGHT && batch.length) {
                stitchedUrls.push(createStitchedCanvas(batch));
                batch = [img];
                h = img.height;
            } else {
                batch.push(img);
                h += img.height;
            }
        }
        if (batch.length) stitchedUrls.push(createStitchedCanvas(batch));
        aiPreviewUrls = stitchedUrls;
        aiSelectedFiles = stitchedUrls.map((url, i) => dataUrlToFile(url, `ai_stitched_${i + 1}.jpg`, 'image/jpeg'));
        aiClientOcrText = '';
        renderAIFileList();
        if (status) { status.textContent = `✅ Dàn xong thành ${stitchedUrls.length} ảnh liền mạch.`; status.style.color = 'var(--success)'; }
    } catch (err) {
        console.error('[AI stitch] error:', err);
        if (status) { status.textContent = '❌ Lỗi dàn ảnh: ' + err.message; status.style.color = 'var(--danger)'; }
    } finally {
        _aiGenerating = false;
    }
}

function cleanOcrText(text) {
    return String(text || '')
        .replace(/^```(?:latex|tex|math|markdown|md)?\s*\n?/gm, '')
        .replace(/```\s*$/gm, '')
        .replace(/\${3,}/g, '$$')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function aiClamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function aiNormalizeBBox(values, img, order) {
    let xmin, ymin, xmax, ymax;
    if (order === 'yxyx') {
        [ymin, xmin, ymax, xmax] = values;
    } else {
        [xmin, ymin, xmax, ymax] = values;
    }

    // Most vision models return normalized 0–1000. If values look like pixels, keep as pixels.
    const maxVal = Math.max(xmin, ymin, xmax, ymax);
    if (maxVal <= 1000) {
        xmin = (xmin / 1000) * img.width;
        xmax = (xmax / 1000) * img.width;
        ymin = (ymin / 1000) * img.height;
        ymax = (ymax / 1000) * img.height;
    }

    const x1 = aiClamp(Math.min(xmin, xmax), 0, img.width - 1);
    const y1 = aiClamp(Math.min(ymin, ymax), 0, img.height - 1);
    const x2 = aiClamp(Math.max(xmin, xmax), x1 + 1, img.width);
    const y2 = aiClamp(Math.max(ymin, ymax), y1 + 1, img.height);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function aiExpandRect(rect, img, padRatio = 0.12) {
    const padX = Math.max(12, rect.w * padRatio);
    const padY = Math.max(12, rect.h * padRatio);
    const x = aiClamp(rect.x - padX, 0, img.width - 1);
    const y = aiClamp(rect.y - padY, 0, img.height - 1);
    const x2 = aiClamp(rect.x + rect.w + padX, x + 1, img.width);
    const y2 = aiClamp(rect.y + rect.h + padY, y + 1, img.height);
    return { x, y, w: x2 - x, h: y2 - y };
}

function aiCropToCanvas(img, rect) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(rect.w));
    canvas.height = Math.max(1, Math.ceil(rect.h));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function aiRefineCanvasByContent(canvas, padding = 10) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = canvas;
    if (width < 20 || height < 20) return { canvas, score: 0 };

    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = 0, maxY = 0, content = 0;

    // Estimate white/gray paper background; detect dark/colored pixels.
    for (let y = 0; y < height; y += 2) {
        for (let x = 0; x < width; x += 2) {
            const idx = (y * width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const dark = max < 235;
            const colored = max - min > 28 && max < 250;
            const ink = dark || colored;
            if (ink) {
                content++;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    const sampled = Math.max(1, Math.ceil(width / 2) * Math.ceil(height / 2));
    const density = content / sampled;
    if (!content || density < 0.002) return { canvas, score: density };

    minX = aiClamp(minX - padding, 0, width - 1);
    minY = aiClamp(minY - padding, 0, height - 1);
    maxX = aiClamp(maxX + padding, minX + 1, width);
    maxY = aiClamp(maxY + padding, minY + 1, height);

    const refinedW = maxX - minX;
    const refinedH = maxY - minY;
    // Avoid over-trimming to tiny snippets; keep original if refined is suspiciously small.
    if (refinedW < width * 0.25 || refinedH < height * 0.25) {
        return { canvas, score: density };
    }

    const refined = document.createElement('canvas');
    refined.width = Math.ceil(refinedW);
    refined.height = Math.ceil(refinedH);
    refined.getContext('2d').drawImage(canvas, minX, minY, refinedW, refinedH, 0, 0, refined.width, refined.height);
    canvas.width = 0;
    return { canvas: refined, score: density + (refinedW * refinedH) / (width * height) * 0.02 };
}

function aiBuildBestCrop(img, values) {
    const candidates = ['yxyx', 'xyxy'].map(order => {
        const raw = aiNormalizeBBox(values, img, order);
        if (raw.w < 10 || raw.h < 10) return null;
        const expanded = aiExpandRect(raw, img, 0.14);
        const canvas = aiCropToCanvas(img, expanded);
        const refined = aiRefineCanvasByContent(canvas, 14);
        const aspectPenalty = refined.canvas.width / Math.max(1, refined.canvas.height) > 12 ? -1 : 0;
        return { order, canvas: refined.canvas, score: refined.score + aspectPenalty };
    }).filter(Boolean);

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    candidates.slice(1).forEach(c => { c.canvas.width = 0; });
    return candidates[0].canvas;
}

async function cropAIInlineImagesFromText(text, pageUrl, pageIndex) {
    const bboxRegex = /\[IMG_BBOX:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g;
    if (!bboxRegex.test(text || '')) return text || '';
    bboxRegex.lastIndex = 0;

    const img = await loadImageFromUrl(pageUrl);
    let output = text || '';
    let match;
    let imgCount = 0;

    while ((match = bboxRegex.exec(text)) !== null) {
        const values = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
        const canvas = aiBuildBestCrop(img, values);
        if (canvas && canvas.width > 10 && canvas.height > 10) {
            const imageId = `AI_IMG_P${pageIndex + 1}_${imgCount}`;
            aiExtractedInlineImages[imageId] = canvas.toDataURL('image/jpeg', 0.94);
            output = output.replace(match[0], `\n[HÌNH ẢNH MINH HOẠ: ${imageId}]\n`);
            canvas.width = 0;
            imgCount++;
        }
    }

    return output;
}

async function ocrAIImages() {
    if (!aiPreviewUrls.length) return '';
    const status = document.getElementById('aiStatus');
    const results = new Array(aiPreviewUrls.length).fill('');
    const batchSize = 3;
    aiExtractedInlineImages = {};

    for (let i = 0; i < aiPreviewUrls.length; i += batchSize) {
        const batch = aiPreviewUrls.slice(i, i + batchSize);
        const end = Math.min(i + batchSize, aiPreviewUrls.length);
        if (status) { status.textContent = `🔍 OCR trang ${i + 1} đến ${end}/${aiPreviewUrls.length}...`; status.style.color = 'var(--text-muted)'; }

        await Promise.all(batch.map(async (url, localIdx) => {
            const globalIdx = i + localIdx;
            const base64 = url.split(',')[1];
            const token = localStorage.getItem('easyrevise_token');
            const res = await fetch('/api/admin/ai-ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: JSON.stringify({ imageBase64: base64, mimeType: 'image/jpeg' })
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'OCR lỗi');

            let pageText = data.text || '';
            pageText = await cropAIInlineImagesFromText(pageText, url, globalIdx);
            results[globalIdx] = cleanOcrText(pageText);
        }));
    }

    aiClientOcrText = results.join('\n\n--- PAGE BREAK ---\n\n');
    if (status) { status.textContent = '✅ OCR hoàn tất. Đang gửi AI tạo đề...'; status.style.color = 'var(--success)'; }
    return aiClientOcrText;
}

async function generateWithAI(useOcrFirst = false) {
    if (!aiSelectedFiles.length) { showToast('Vui lòng chọn ít nhất 1 file!', 'warning'); return; }
    const btn = document.getElementById('aiGenerateBtn');
    const loading = document.getElementById('aiLoading');
    const preview = document.getElementById('aiPreview');
    const errorDiv = document.getElementById('aiError');
    const status = document.getElementById('aiStatus');
    btn.disabled = true; btn.textContent = useOcrFirst ? '🔍 Đang OCR...' : '⏳ Đang xử lý...';
    loading.style.display = 'block'; preview.style.display = 'none'; errorDiv.style.display = 'none'; status.textContent = '';
    _aiGenerating = true;

    const examLabel = document.getElementById('aiTitle').value.trim() || document.getElementById('aiSubject').value.trim() || 'Đề thi mới';
    const pendingId = 'notif_' + Date.now();
    NotificationManager.add({ id: pendingId, type: 'ai-generate', status: 'pending', title: examLabel, message: 'AI đang xử lý...' });

    try {
        if (useOcrFirst && aiPreviewUrls.length && !aiClientOcrText) await ocrAIImages();

        const formData = new FormData();
        aiSelectedFiles.forEach(f => formData.append('files', f));
        if (aiClientOcrText) formData.append('clientOcrText', aiClientOcrText);

        const title = document.getElementById('aiTitle').value.trim();
        const subject = document.getElementById('aiSubject').value.trim();
        const year = document.getElementById('aiYear').value.trim();
        const subjectType = document.getElementById('aiSubjectType').value;
        const aiModel = document.getElementById('aiModel')?.value || '';
        if (title) formData.append('title', title);
        if (subject) formData.append('subject', subject);
        if (year) formData.append('year', year);
        formData.append('subjectType', subjectType);
        if (aiModel) formData.append('model', aiModel);

        btn.textContent = '🤖 Đang tạo đề...';
        const token = localStorage.getItem('easyrevise_token');
        if (!token) throw new Error('Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
        const res = await fetch('/api/admin/ai-generate', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
        const data = await res.json();
        loading.style.display = 'none'; btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI';
        _aiGenerating = false;

        if (!res.ok || !data.success) {
            const msg = /token|hợp lệ|unauthorized|forbidden|đăng nhập/i.test(data.error || '')
                ? 'Phiên đăng nhập không hợp lệ/hết hạn. Vui lòng đăng nhập lại rồi bấm tạo đề.'
                : (data.error || 'Lỗi không xác định');
            errorDiv.style.display = 'block'; document.getElementById('aiErrorMsg').textContent = msg;
            if (data.raw || data.detail) { document.getElementById('aiErrorDetail').textContent = data.raw || data.detail; document.getElementById('aiErrorDetail').style.display = 'block'; }
            document.getElementById('aiRecoverBtn').style.display = 'inline-flex';
            NotificationManager.updateById(pendingId, { status: 'error', message: msg, finishedAt: new Date().toISOString() });
            return;
        }
        aiGeneratedData = data.data; renderAIPreview(aiGeneratedData); preview.style.display = 'block';
        status.textContent = '✅ Tạo thành công!'; status.style.color = 'var(--success)';
        document.getElementById('aiRecoverBtn').style.display = 'none';
        NotificationManager.updateById(pendingId, { status: 'success', message: `Tạo xong! ${(data.data?.exam?.sections || []).reduce((s, x) => s + (x.questions?.length || 0), 0)} câu.`, data: data.data, finishedAt: new Date().toISOString() });
    } catch (err) {
        loading.style.display = 'none'; btn.disabled = false; btn.textContent = '🚀 Tạo đề bằng AI';
        errorDiv.style.display = 'block'; document.getElementById('aiErrorMsg').textContent = 'Lỗi kết nối/xử lý: ' + err.message;
        document.getElementById('aiRecoverBtn').style.display = 'inline-flex'; _aiGenerating = false;
        NotificationManager.updateById(pendingId, { status: 'error', message: 'Lỗi kết nối: ' + err.message, finishedAt: new Date().toISOString() });
    }
}

async function recoverAIResult() {
    const btn = document.getElementById('aiRecoverBtn'); const status = document.getElementById('aiStatus');
    btn.disabled = true; btn.textContent = '⏳ Đang kiểm tra...';
    try {
        const res = await api('/api/admin/ai-last-result');
        if (res.error) { status.textContent = '❌ Không có cache: ' + res.error; status.style.color = 'var(--danger)'; }
        else { aiGeneratedData = res.data; renderAIPreview(aiGeneratedData); document.getElementById('aiPreview').style.display = 'block'; document.getElementById('aiError').style.display = 'none'; status.textContent = `✅ Khôi phục thành công! (Cache tạo ${res.ageMinutes || 0} phút trước)`; status.style.color = 'var(--success)'; btn.style.display = 'none'; NotificationManager.add({ type: 'ai-generate', status: 'success', title: res.data?.exam?.title || 'Khôi phục kết quả', message: 'Khôi phục thành công từ cache server.', data: res.data, finishedAt: new Date().toISOString() }); }
    } catch (e) { status.textContent = '❌ Lỗi khi khôi phục: ' + e.message; status.style.color = 'var(--danger)'; }
    finally { btn.disabled = false; btn.textContent = '🔄 Khôi phục kết quả từ server'; }
}

function renderAIPreview(data) {
    const exam = data.exam;
    const totalQ = exam.sections.reduce((sum, s) => sum + (s.questions?.length || 0), 0);
    let html = `<div class="glass-panel" style="padding:1.5rem;margin-bottom:1.5rem;"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;"><div><h3 style="font-size:1.2rem;font-weight:700;margin-bottom:0.25rem;">${escapeHtml(exam.title || 'Đề thi')}</h3><p style="font-size:0.85rem;color:var(--text-muted);">${escapeHtml(exam.subject || '')} ${exam.year ? '• ' + escapeHtml(exam.year) : ''}</p></div><div style="display:flex;gap:1rem;"><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--primary);">${exam.sections.length}</div><div style="font-size:0.7rem;color:var(--text-muted);">Phần</div></div><div style="text-align:center;"><div style="font-size:1.5rem;font-weight:800;color:var(--secondary);">${totalQ}</div><div style="font-size:0.7rem;color:var(--text-muted);">Câu hỏi</div></div></div></div></div>`;
    exam.sections.forEach((s, si) => {
        const typeClass = s.type === 'reading' ? 'type-reading' : s.type === 'writing-choice' ? 'type-writing' : s.type === 'writing-essay' ? 'type-essay' : s.type === 'fill-in-blank' ? 'type-fillin' : s.type === 'free-form' ? 'type-freeform' : 'type-mc';
        const typeLabel = s.type === 'reading' ? 'Đọc hiểu' : s.type === 'writing-choice' ? 'Viết' : s.type === 'writing-essay' ? 'Luận' : s.type === 'fill-in-blank' ? 'Điền từ' : s.type === 'free-form' ? 'Tự luận' : 'Trắc nghiệm';
        html += `<div class="section-card" id="ai-section-${si}"><div class="section-header"><div style="display:flex;align-items:center;gap:0.75rem;"><span class="section-type-badge ${typeClass}">${typeLabel}</span><span style="font-weight:700;">${escapeHtml(s.title || 'Phần ' + (si + 1))}</span><span style="color:var(--text-muted);font-size:0.85rem;">(${s.questions?.length || 0} câu)</span></div><button onclick="deleteAISection(${si})" class="btn btn-sm btn-danger" style="padding:0.25rem 0.6rem;font-size:0.75rem;">🗑️ Xóa phần</button></div>`;
        if (s.passage) html += `<div style="padding:0.75rem 1rem;background:var(--bg-input);border-radius:10px;margin-bottom:1rem;font-size:0.85rem;color:var(--text-secondary);max-height:150px;overflow-y:auto;">${renderMarkdown(escapeHtml(s.passage.substring(0, 500)))}${s.passage.length > 500 ? '...' : ''}</div>`;
        (s.questions || []).forEach((q, qi) => {
            const correct = q.options?.[q.correctAnswer] || (q.blanks ? '(fill-in-blank)' : q.subParts ? '(free-form)' : '?');
            html += `<div class="question-item" id="ai-q-${si}-${qi}" style="flex-direction:column;align-items:flex-start;"><div style="display:flex;align-items:flex-start;width:100%;gap:0.5rem;"><div class="q-num" style="flex-shrink:0;">${q.id}</div><div class="q-text" style="flex:1;"><div>${renderMarkdown(escapeHtml(q.question || ''))}</div>${q.options ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.25rem;">${q.options.map(o => renderMarkdown(escapeHtml(o))).join(' | ')}</div>` : ''}${q.blanks ? `<div style="font-size:0.82rem;color:#9333ea;margin-top:0.25rem;">Blanks: ${q.blanks.map(b => escapeHtml(b.answer)).join(', ')}</div>` : ''}${q.subParts ? `<div style="font-size:0.82rem;color:#0284c7;margin-top:0.25rem;">${q.subParts.map(p => escapeHtml(p.label + ') ' + String(p.question || '').substring(0, 40))).join(' | ')}</div>` : ''}</div><div class="q-correct" style="flex-shrink:0;">${escapeHtml(correct)}</div></div><div style="display:flex;gap:0.4rem;margin-top:0.5rem;margin-left:2.5rem;"><button onclick="editAIQuestion(${si},${qi})" class="btn btn-sm btn-outline" style="padding:0.2rem 0.6rem;font-size:0.75rem;">✏️ Sửa</button><button onclick="deleteAIQuestion(${si},${qi})" class="btn btn-sm btn-danger" style="padding:0.2rem 0.6rem;font-size:0.75rem;">🗑️ Xóa</button></div></div>`;
        });
        html += '</div>';
    });
    document.getElementById('aiPreviewContent').innerHTML = html;
    if (typeof renderMathInElement === 'function') { renderMathInElement(document.getElementById('aiPreviewContent'), { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }] }); }
}

function deleteAIQuestion(sectionIdx, qIdx) { if (!aiGeneratedData) return; const section = aiGeneratedData.exam.sections[sectionIdx]; if (!section || !section.questions) return; section.questions.splice(qIdx, 1); renderAIPreview(aiGeneratedData); }
function deleteAISection(sectionIdx) { if (!aiGeneratedData) return; aiGeneratedData.exam.sections.splice(sectionIdx, 1); renderAIPreview(aiGeneratedData); }

// ── Load models from provider config ─────────────────────────────
async function loadAITabModels() {
    try {
        const info = await api('/api/ai-models');
        const sel = document.getElementById('aiModel');
        if (!sel || !info?.models?.length) return;
        sel.innerHTML = info.models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
        if (info.defaultModel) sel.value = info.defaultModel;
        const badge = document.getElementById('aiTabProviderBadge');
        if (badge) badge.textContent = `⚡ ${info.provider || 'AI'}`;
    } catch (e) {
        console.warn('[AI Tab] Failed to load models:', e.message);
    }
}

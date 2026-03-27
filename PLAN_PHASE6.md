# EasyRevise — Kế Hoạch Chi Tiết Phase 6

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox `[ ]` → `[x]` và ghi chú vào **Nhật ký thay đổi**.
> Last updated: 2026-03-27T04:23+07:00
> Oversight: Planning Agent

---

## 🎯 Mục tiêu Phase 6

5 tính năng độc lập, không phụ thuộc nhau, làm theo thứ tự từ nhỏ → lớn:

| # | Tính năng | Thời gian |
|---|---|---|
| 1 | Duplicate đề / Copy section | ~30 phút |
| 2 | QR Code cho mã kích hoạt | ~45 phút |
| 3 | Guest Name — Hỏi tên khi nộp bài | ~30 phút |
| 4 | LaTeX Toolbar (WYSIWYG) | ~1.5 giờ |
| 5 | AI "Tại sao tôi sai?" (có limit) | ~2 giờ |

---

## ✅ Danh sách Task

---

### TÍNH NĂNG 1: Duplicate đề / Copy section

**Mô tả:**
- Nút **"📋 Nhân bản"** trong trang Exam List cạnh mỗi đề → tạo bản copy y chang, title thêm ` (Copy)`, id mới
- Nút **"📋 Copy section"** trong Section Editor → copy 1 section (kèm toàn bộ câu hỏi) sang đề khác

**Server — 2 routes mới:**

```js
// Route 1: Duplicate toàn bộ đề
POST /api/admin/exams/:id/duplicate
→ Deep clone exam object
→ Gán id mới (uuid) cho exam + từng section + từng question
→ Title = originalTitle + ' (Copy)'
→ accessCodes = [] (xóa mã cũ, đề mới chưa có mã)
→ Push vào data.exams, writeData()
→ Trả về { id: newExam.id }

// Route 2: Copy section sang đề khác
POST /api/admin/exams/:id/copy-section
Body: { sectionId, targetExamId }
→ Clone section + tất cả questions
→ Gán id mới cho section + từng question
→ Push vào targetExam.sections
→ writeData()
→ Trả về { success: true }
```

**Admin UI:**

*Trang Exam List (`openExamEditor()`)* — thêm nút vào action bar:
```html
<button class="btn btn-sm btn-ghost" onclick="duplicateExam('${exam.id}')">📋 Nhân bản</button>
```

*Section Editor* — thêm nút cạnh "Sửa phần":
```html
<button class="btn btn-sm btn-ghost" onclick="copySectionTo('${s.id}')">📋 Copy sang đề khác</button>
```

`copySectionTo(sectionId)` → hiện dropdown/prompt chọn đề đích → gọi API.

**Checklist:**
- [x] `server.js`: Thêm route `POST /api/admin/exams/:id/duplicate` — deep clone với id mới
- [x] `server.js`: Thêm route `POST /api/admin/exams/:id/copy-section` — clone section sang exam khác
- [x] `public/admin/admin.js`: Thêm hàm `duplicateExam(examId)` → gọi API → reload list
- [x] `public/admin/admin.js`: Thêm hàm `copySectionTo(sectionId)` → prompt chọn đề đích → gọi API
- [x] `public/admin/index.html` hoặc `admin.js` renderSections: thêm nút "📋 Nhân bản" và "📋 Copy section"

---

### TÍNH NĂNG 2: QR Code cho mã kích hoạt

**Mô tả:** Mỗi access code trong Code Manager có nút **QR** → popup hiện QR code → admin chụp màn hình hoặc in cho học sinh quét.

**Thiết kế:**
- QR encode URL: `https://[domain]/exam.html?id=EXAM_ID&code=ABC123`
- Học sinh quét → trình duyệt mở trang thi → URL param tự điền examId + code → **skip nhập code thủ công**
- Không cần backend, **dùng CDN**: `https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js`

**Client-side flow:**
```js
// Trong admin.js — hàm mới:
async function showQRCode(examId, code) {
    const url = `${window.location.origin}/exam.html?id=${examId}&code=${code}`;
    // Tạo modal overlay
    // Dùng QRCode.toCanvas(canvasEl, url, { width: 240 }) từ thư viện CDN
    // Hiện title: "QR — Mã ${code}", nút "✕ Đóng", nút "🖨️ In"
}
```

**Tích hợp vào `showCodeManager()`:** Thêm nút QR vào mỗi code row:
```js
// Trong codeRows template (dòng ~708):
<button class="btn btn-sm btn-ghost" onclick="showQRCode('${exam.id}','${c.code}')"
    style="padding:0.2rem 0.5rem;font-size:0.72rem;" title="QR Code">📱</button>
```

**Load QR library:** Thêm vào `admin/index.html` head:
```html
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
```

**exam.html — auto-fill code từ URL param:**
- Khi trang exam.html load, check `?code=ABC123` trong URL
- Nếu có → tự điền vào input mã + trigger nhập code → học sinh vào thẳng bài thi

**Checklist:**
- [x] `public/admin/index.html`: Thêm `<script src="...qrcode.min.js">` vào `<head>`
- [x] `public/admin/admin.js`: Thêm hàm `showQRCode(examId, code)` với modal + QRCode.toCanvas
- [x] `public/admin/admin.js` → `showCodeManager()`: Thêm nút 📱 vào mỗi code row
- [x] Fix nút Đóng modal QR Admin (thay `closeModal()` không tồn tại → `addEventListener`)
- [x] `public/index.html`: Thêm route `POST /api/exams/:id/preview-code` (server) — xem thông tin đề + lịch sử code MÀ KHÔNG tiêu slot
- [x] `public/index.html`: QR deep-link (`?code=&examId=`) → hiện popup đẹp thay auto-redirect
- [x] Popup QR gồm: tên đề/môn/số câu, lịch sử làm bài (tên, điểm, giờ), đang làm dở, counter lượt dùng, CTA button
- [x] `public/index.html`: Nút "📷 Quét QR" (mobile-only, ẩn desktop) → mở camera scanner
- [x] `public/index.html`: jsQR CDN tích hợp, scan camera real-time, detect EasyRevise URL → gọi showQREntryPopup()

---

### TÍNH NĂNG 3: Guest Name — Hỏi tên khi nộp bài

**Mô tả:** Khi học sinh **chưa đăng nhập** bấm "Nộp bài", hiện popup hỏi tên trước khi submit. Tên được lưu vào localStorage và gửi kèm result → admin thấy tên thật thay vì "anonymous".

**Luồng:**

```
Học sinh bấm "Nộp bài"
  → showSubmitModal() kiểm tra:
    - Nếu đã login (có token + user.displayName) → submit bình thường
    - Nếu CHƯA login → kiểm tra localStorage['easyrevise_guest_name']
      - Có rồi → dùng tên đó (không hỏi lại)
      - Chưa có → hiện popup hỏi tên:
        ┌──────────────────────────────────┐
        │  📝 Trước khi nộp bài...         │
        │  Nhập tên của bạn để giáo viên   │
        │  nhận ra bài nộp của bạn         │
        │  ┌──────────────────────────┐    │
        │  │ VD: Nguyễn Văn An        │    │
        │  └──────────────────────────┘    │
        │  [Tiếp tục nộp bài →]           │
        └──────────────────────────────────┘
      → Lưu tên vào localStorage['easyrevise_guest_name']
      → Submit với displayName = tên vừa nhập
```

**Vị trí fix:**

`public/js/app.js` — hàm `submitExam(auto = false)`:
- Tìm đoạn gửi `fetch('/api/exams/${this.examId}/code-result', { body: { code, result: summary } })`
- Thêm `displayName` vào body:
```js
const user = JSON.parse(localStorage.getItem('easyrevise_user') || '{}');
const guestName = localStorage.getItem('easyrevise_guest_name') || '';
const displayName = user.displayName || guestName || '';
// gửi kèm displayName trong body
body: JSON.stringify({ code, result: summary, displayName })
```

`server.js` — route `POST /api/exams/:examId/code-result`:
- Khi lưu usage, ưu tiên: `req.body.displayName || usage.displayName || 'Ẩn danh'`

**Thêm popup vào `showExitModal()` flow:**
- Trước khi confirm nộp bài, check guest → hỏi tên nếu cần
- Popup dùng `document.createElement` giống exitModal hiện tại

**Checklist:**
- [x] `public/js/app.js`: Thêm hàm `_showGuestNameModal()` → trả về Promise với tên (custom modal, không dùng prompt())
- [x] `public/js/app.js` → `submitExam()`: Gọi `_showGuestNameModal()` nếu chưa login, truyền displayName vào POST body
- [x] `server.js` → route `POST /api/exams/:examId/code-result`: Lưu `displayName` từ body vào `usage.displayName`
- [x] `public/js/app.js`: Thêm `_showSubmitConfirmModal()` — custom popup xác nhận nộp (thay `confirm()` native) với pills số câu chưa làm

---

### TÍNH NĂNG 4: LaTeX Toolbar (WYSIWYG nhỏ)

**Mô tả:** Thanh toolbar nhỏ phía trên textarea câu hỏi trong admin, với các nút LaTeX phổ biến. Click → insert vào vị trí con trỏ. Preview realtime bên dưới bằng KaTeX (đã có sẵn).

**Thiết kế toolbar:**

```
[ √x ] [ x² ] [ xₙ ] [ ½ ] [ ∫ ] [ Σ ] [ ± ] [ × ] [ ÷ ] [ ≤ ] [ ≥ ] [ → ] [ π ] [ ∞ ] [ |x| ]
```

Ánh xạ nút → LaTeX syntax:
```js
const LATEX_BUTTONS = [
    { label: '√x',  insert: '\\sqrt{}',      cursorBack: 1 },
    { label: 'x²',  insert: '^{2}',           cursorBack: 2 },
    { label: 'xₙ',  insert: '_{n}',           cursorBack: 2 },
    { label: '½',   insert: '\\frac{}{}',     cursorBack: 3 },
    { label: '∫',   insert: '\\int_{}^{}',    cursorBack: 6 },
    { label: 'Σ',   insert: '\\sum_{}^{}',    cursorBack: 6 },
    { label: '±',   insert: '\\pm ',          cursorBack: 0 },
    { label: '×',   insert: '\\times ',       cursorBack: 0 },
    { label: '÷',   insert: '\\div ',         cursorBack: 0 },
    { label: '≤',   insert: '\\leq ',         cursorBack: 0 },
    { label: '≥',   insert: '\\geq ',         cursorBack: 0 },
    { label: '→',   insert: '\\to ',          cursorBack: 0 },
    { label: 'π',   insert: '\\pi ',          cursorBack: 0 },
    { label: '∞',   insert: '\\infty ',       cursorBack: 0 },
    { label: '|x|', insert: '|{}|',           cursorBack: 2 },
];
```

**Hàm insert vào con trỏ:**
```js
function insertAtCursor(textarea, text, cursorBack = 0) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    textarea.value = val.slice(0, start) + text + val.slice(end);
    const newPos = start + text.length - cursorBack;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
    // Trigger input event để preview update
    textarea.dispatchEvent(new Event('input'));
}
```

**Preview realtime:**
```js
// Khi textarea input → render preview
function updateLatexPreview(textarea, previewEl) {
    const rawText = textarea.value;
    // Wrap inline math: $...$ → KaTeX render
    try {
        previewEl.innerHTML = rawText.replace(/\$([^$]+)\$/g, (_, math) => {
            return katex.renderToString(math, { throwOnError: false });
        });
    } catch(e) { previewEl.textContent = rawText; }
}
```

**Áp dụng cho:**
- `inputQuestionText` (textarea câu hỏi)
- `inputOptA/B/C/D` (các đáp án)

**Tích hợp:** Thêm toolbar vào modal question (`modalQuestion` trong `index.html`) bằng JS, inject sau khi modal mở.

**Checklist:**
- [x] `public/admin/admin.js`: Thêm `LATEX_BUTTONS` array + `insertAtCursor()` + `updateLatexPreview()`
- [x] `public/admin/admin.js`: Thêm hàm `renderLatexToolbar(targetTextareaId)` → tạo toolbar DOM
- [x] `public/admin/admin.js` → `showAddQuestionModal()` và `editQuestion()`: Gọi `renderLatexToolbar('inputQuestionText')` sau khi modal mở
- [x] `public/admin/admin.js`: Thêm preview div sau `inputQuestionText` — update realtime khi input
- [ ] Test: gõ `$\frac{1}{2}$` trong textarea → preview hiện phân số đẹp

---

### TÍNH NĂNG 5: AI "Tại sao tôi sai?"

**Mô tả:** Trên trang result, mỗi câu học sinh trả lời **sai** có nút **"🤖 Tại sao tôi sai?"**. Click → AI giải thích ngắn (3-5 câu), hiển thị inline. Có hệ thống giới hạn lần dùng để tránh spam token.

**Hệ thống giới hạn:**

```
Schema:
exam.aiExplainLimit = 3     // mặc định -1 (vô hạn, giáo viên tự set nếu cần giới hạn)
usage.aiExplainUsed = 0     // số lần học sinh đã dùng

Ưu tiên: accessCode.aiExplainLimit > exam.aiExplainLimit > -1 (vô hạn)
```

> **Quyết định thiết kế:** Mặc định `-1` (vô hạn) để GV không cần cấu hình gì cũng dùng được. GV chỉ set limit khi muốn kiểm soát.

**Route mới:**
```
POST /api/exams/:examId/explain-wrong
Body: { code, questionId, userAnswer, correctAnswer, questionText, options, explanation }
Response: { explanation: "...", used: 2, limit: -1, remaining: -1 }
  → remaining = -1 nghĩa là vô hạn
```

**Server logic:**
```js
app.post('/api/exams/:examId/explain-wrong', async (req, res) => {
    const { code, questionId, userAnswer, correctAnswer, questionText, options, explanation } = req.body;
    const data = readData();
    const exam = data.exams.find(e => e.id === req.params.examId);
    const codeObj = (exam?.accessCodes || []).find(c => c.code === code?.toUpperCase().trim());
    const usage = (codeObj?.usedBy || []).find(u => u.completed && u.result);
    if (!usage) return res.status(404).json({ error: 'Bài nộp không tìm thấy' });

    // Check limit
    const examLimit = exam.aiExplainLimit ?? -1;
    const codeLimit = codeObj.aiExplainLimit ?? examLimit;
    const effectiveLimit = codeLimit;
    const used = usage.aiExplainUsed || 0;
    if (effectiveLimit !== -1 && used >= effectiveLimit) {
        return res.status(429).json({ error: `Đã dùng hết ${effectiveLimit} lần giải thích AI`, used, limit: effectiveLimit });
    }

    // Build AI prompt
    const optLabels = ['A', 'B', 'C', 'D'];
    const optText = (options || []).map((o, i) => `${optLabels[i]}. ${o}`).join('\n');
    const userLabel = optLabels[userAnswer] || userAnswer;
    const correctLabel = optLabels[correctAnswer] || correctAnswer;
    const prompt = `Học sinh vừa trả lời sai câu hỏi sau:
Câu hỏi: ${questionText}
Các lựa chọn:\n${optText}
Học sinh chọn: ${userLabel}
Đáp án đúng: ${correctLabel}
${explanation ? `Giải thích có sẵn: ${explanation}` : ''}

Hãy giải thích ngắn gọn (3-5 câu) tại sao đáp án của học sinh sai và tại sao đáp án đúng là đúng. Dùng tiếng Việt, thân thiện, dễ hiểu.`;

    // Gọi AI (dùng cùng pattern Anthropic/OpenAI như các route khác)
    // ... (xem code route /api/admin/ai-grade-essay để copy pattern)
    
    // Tăng counter, lưu
    usage.aiExplainUsed = used + 1;
    writeData(data);
    
    const remaining = effectiveLimit === -1 ? -1 : effectiveLimit - (used + 1);
    res.json({ explanation: aiText, used: used + 1, limit: effectiveLimit, remaining });
});
```

**result.js — UI:**

Trong `renderReviewItems()`, với câu sai (điều kiện: `!q.isEssay && !q.isFreeForm && userAnsId !== q.correctAnswer && userAnsId !== undefined`):

```js
// Thêm vào reviewItem innerHTML:
`<div id="explain-slot-${q.id}" style="margin-top:0.75rem;"></div>
<button onclick="window._resultApp.askWhyWrong('${q.id}', ${userAnsId}, ${q.correctAnswer}, ...)"
    class="explain-why-btn"
    style="margin-top:0.5rem;padding:0.35rem 0.85rem;border-radius:10px;
           background:rgba(99,102,241,0.1);color:#818cf8;border:1px solid rgba(99,102,241,0.2);
           font-size:0.8rem;cursor:pointer;font-family:inherit;">
    🤖 Tại sao tôi sai?
</button>`
```

Hàm `askWhyWrong()`:
```js
async askWhyWrong(questionId, userAnswer, correctAnswer, questionText, options, explanation) {
    const slot = document.getElementById(`explain-slot-${questionId}`);
    const btn = document.querySelector(`[data-explain-btn="${questionId}"]`);
    if (!slot) return;
    slot.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0;">⏳ AI đang giải thích...</div>';
    if (btn) btn.disabled = true;
    
    const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
    const code = unlocked[this.results.examId];
    
    try {
        const res = await fetch(`/api/exams/${this.results.examId}/explain-wrong`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, questionId, userAnswer, correctAnswer, questionText, options, explanation })
        });
        const data = await res.json();
        if (!res.ok) {
            slot.innerHTML = `<div style="color:#dc2626;font-size:0.82rem;">${data.error}</div>`;
            return;
        }
        slot.innerHTML = `
            <div style="margin-top:0.5rem;padding:0.85rem 1rem;background:rgba(99,102,241,0.06);
                border:1px solid rgba(99,102,241,0.15);border-radius:12px;">
                <div style="font-size:0.72rem;font-weight:700;color:#818cf8;margin-bottom:0.4rem;">🤖 AI Giải thích</div>
                <div style="font-size:0.88rem;color:var(--text-main);line-height:1.6;">${renderMarkdown(data.explanation)}</div>
                ${data.remaining !== -1 ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.4rem;">Còn lại: ${data.remaining} lần</div>` : ''}
            </div>`;
        if (btn) btn.remove(); // Ẩn nút sau khi đã giải thích
    } catch (e) {
        slot.innerHTML = '<div style="color:#dc2626;font-size:0.82rem;">❌ Lỗi kết nối</div>';
        if (btn) btn.disabled = false;
    }
}
```

**Admin — thêm field limit (tùy chọn):**
- Trong `modalExam` (form sửa đề): thêm input "AI Explain limit (-1=vô hạn, 0=tắt)"
- Mặc định `-1`, giáo viên chỉ cần sửa nếu muốn giới hạn

**Checklist:**
- [x] `server.js`: Thêm route `POST /api/exams/:examId/explain-wrong` với limit check + AI call
- [x] `server.js`: Copy pattern AI call từ route `/api/admin/ai-grade-essay` (cùng Anthropic/OpenAI dual SDK)
- [x] `public/js/result.js`: Thêm nút "🤖 Tại sao tôi sai?" cho mỗi câu sai (không phải essay/freeform)
- [x] `public/js/result.js`: Thêm hàm `askWhyWrong()` với loading state + inline display
- [x] `public/admin/index.html`: Thêm field `aiExplainLimit` vào `modalExam` (input number, mặc định -1)
- [x] `public/admin/admin.js` → `saveExam()`: Gửi `aiExplainLimit` khi save
- [x] `public/admin/admin.js` → `showEditExamMeta()`: Load `aiExplainLimit` từ `currentExamData`

---

## 📋 Thứ tự thực hiện

```
TN1: Duplicate đề       (~30p)  ← Nhỏ nhất, làm nóng tay
TN2: QR Code            (~45p)  ← Frontend-only, không rủi ro
TN3: Guest Name         (~30p)  ← Frontend-only, nhỏ
TN4: LaTeX Toolbar     (~1.5h)  ← Phức tạp hơn nhưng không đụng backend
TN5: AI Explain         (~2h)   ← Lớn nhất, làm cuối
```

---

## 🧪 Test checklist cuối Phase 6

```
[ ] TN1: Nhân bản đề → đề mới xuất hiện, title có "(Copy)", không có mã cũ
[ ] TN1: Copy section → section xuất hiện trong đề đích
[ ] TN2: Click QR → hiện QR đúng URL → quét bằng điện thoại → mở đúng trang thi
[ ] TN2: URL có ?code= → trang exam tự nhận code → không phải nhập tay
[ ] TN3: Chưa login, nộp bài lần đầu → popup hỏi tên → admin thấy tên đúng
[ ] TN3: Nộp bài lần 2 (cùng session) → không hỏi lại tên
[ ] TN4: Click nút phân số → insert `\frac{}{}` vào con trỏ → preview hiện phân số
[ ] TN4: Gõ $x^2 + y^2$ → preview realtime bên dưới textarea
[ ] TN5: Câu trả lời sai → nút "🤖 Tại sao tôi sai?" hiện → click → AI giải thích
[ ] TN5: Set limit=0 → nút không xuất hiện
[ ] TN5: Set limit=2 → dùng 2 lần → lần 3 hiện "Đã hết lượt"
```

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-03-27T03:14 | TN1: Duplicate đề + Copy section | server.js 2 routes mới, admin.js 2 hàm mới |
| 2026-03-27T03:14 | TN2: QR Code Admin | showQRCode() với QRCode.toCanvas, fix nút Đóng (closeModal undefined → addEventListener) |
| 2026-03-27T04:04 | TN2 mở rộng: QR Entry Popup | index.html: preview-code API không tiêu slot, popup thông tin đề + lịch sử + nút CTA |
| 2026-03-27T04:10 | TN2 mở rộng: QR Scanner mobile | index.html: jsQR CDN, nút 📷 Quét QR (mobile-only), camera modal với khung ngắm + scan line |
| 2026-03-27T03:14 | TN3: Guest Name | submitExam async, _showGuestNameModal() thay prompt(), _showSubmitConfirmModal() thay confirm() |
| 2026-03-27T03:14 | TN4: LaTeX Toolbar | injectLatexToolbar() trong admin.js, 14 ký hiệu |
| 2026-03-27T03:14 | TN5: AI "Tại sao tôi sai?" | server route explain-wrong, result.js askWhyWrong(), aiExplainLimit per exam |

---

## ⚙️ Hướng dẫn cho AI Sub-Agent

1. Đọc `PROJECT.md` trước để hiểu codebase
2. Làm **từng TN một**, xong mới qua TN tiếp theo
3. **TN2 — QR:** Dùng `QRCode.toCanvas(canvasEl, url)` từ CDN, KHÔNG dùng npm
4. **TN5 — AI call:** Copy pattern từ route `/api/admin/ai-grade-essay` trong server.js (đã có dual SDK Anthropic/OpenAI, retry, model selector từ settings)
5. **TN5 — limit:** `aiExplainLimit = -1` nghĩa là **vô hạn** (không limit). `0` = tắt hẳn.
6. Checkbox `[ ]` → `[x]` khi xong, cập nhật nhật ký + `Last updated`
7. Xong toàn bộ → báo user để plan Phase 7 (Storage Migration)

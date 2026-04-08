# EasyRevise — Kế Hoạch Chi Tiết Phase 4

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox và ghi chú vào mục **Nhật ký thay đổi**.
> Last updated: 2026-03-26T11:53:00+07:00

---

## 🎯 Mục tiêu Phase 4

5 nhóm việc (bao gồm bug fix + security fix ưu tiên cao):

0. **Security fix** — vá lỗ hổng upload không xác thực
0b. **Bug fixes** — 3 bug tiềm ẩn phát hiện qua review code
1. **Markdown render** — feedback AI hiển thị đúng bold/italic/xuống dòng
2. **PDF → ảnh** — convert PDF thành ảnh để AI đọc được hình vẽ, đề scan
3. **Trang Help/Guide** — tab hướng dẫn cho giáo viên trong admin panel
4. **Data backup** — tự động backup `exams.json` hàng ngày
5. **UX cải thiện nhỏ** — upload spinner + admin submissions auto-refresh

---

## ✅ Danh sách Task

---

### � BUG FIXES (phát hiện qua review code)

**BUG-A: `submitExam()` đếm câu đã trả lời sai với free-form**

- **Vấn đề:** `userAnswers[q.id]` của free-form được tạo ngay khi upload ảnh dù chưa điền chữ → bị tính là "câu đã trả lời" trong xác nhận nộp bài
- **Fix:** Kiểm tra `Object.values(parts).some(v => v && String(v).trim())` thay vì chỉ check `userAnswers[q.id] !== undefined`

- [x] `public/js/app.js` — `submitExam()`:
  - Sửa điều kiện "`answeredCount`" cho free-form question: phải có ít nhất 1 `parts[i]` không trống mới tính là đã trả lời

**BUG-B: `grade-slot-${q.id}` có thể trùng ID nếu 2 section essay**

- **Vấn đề:** Nếu AI tạo đề có 2 section `writing-essay`, khi flatten thành `questionsList` cả 2 có `id = section.id` giống nhau → `updateEssayGradeCards()` chỉ update cái đầu
- **Fix:** Khi flatten essay section → gán `q.id = section.id + '-' + sectionIndex` cho unique

- [x] `public/js/app.js` — flatten logic (khoảng dòng 84):
  - Thêm `sectionIndex` vào id: `{ ...section, id: section.id || ('essay-' + si), isEssay: true }`
- [x] `public/js/result.js` — flatten tương tự: đảm bảo id unique

**BUG-C: Auto-grade background không tìm được free-form section**

- **Vấn đề:** Trong `code-result` autograde, đoạn tìm section dùng `section.id === r.id || section.type === 'writing-essay'` → free-form section có `type = 'free-form'` nên bị bỏ qua
- **Fix:** Mở rộng điều kiện tìm kiếm thêm `section.type === 'free-form'`

- [x] `server.js` — route `POST /api/exams/:examId/code-result` (phần autograde essay):
  - Thay: `section.type === 'writing-essay'`
  - Bằng: `section.type === 'writing-essay' || section.type === 'free-form'`

---

### �🔒 TASK 0 (Ưu tiên cao): Vá security gap upload

**Vấn đề:** Route `POST /api/upload-submission` **không có auth nào** — bất kỳ ai biết URL đều upload được file lên server.

**Fix tối thiểu (không bắt đăng nhập, nhưng phải có mã hợp lệ):**
```js
// Thêm vào trước khi xử lý upload:
const { examId, code } = req.body;
if (!examId || !code) return res.status(400).json({ error: 'Thiếu examId hoặc code' });
const data = readData();
const exam = data.exams.find(e => e.id === examId);
const codeObj = exam?.accessCodes?.find(c => c.code === code.toUpperCase().trim());
if (!codeObj) return res.status(403).json({ error: 'Mã không hợp lệ' });
```

**Files cần sửa:**

- [x] `server.js` — route `POST /api/upload-submission`:
  - Thêm validate `examId` + `code` trước khi `multer` xử lý
  - Trả về 403 nếu không hợp lệ

- [x] `public/js/app.js` — `uploadSubmissionFile()`:
  - Đảm bảo gửi kèm `examId` và `code` (lấy từ URL + localStorage) trong FormData

---

### TÍNH NĂNG 1: Markdown render trong feedback AI

**Hiện trạng:** AI trả về feedback dạng `**Nhận xét**`, `*lưu ý*`, `- danh sách`, xuống dòng `\n` → hiển thị plain text.

**Phạm vi cần áp dụng (rộng hơn plan gốc):**
- [x] `public/js/result.js` — `updateEssayGradeCards()`: : `aiFeedback`, `aiBreakdown`, `teacherFeedback`
- `admin.js → renderSubmissions()` : `aiFeedback`, `teacherFeedback`
- `admin.js → renderAIPreview()` : `explanation`, `expansion`, `sampleAnswer` (AI hay dùng markdown)
- `result.js → renderReviewItems()` : `explanation`, `expansion` khi hiển thị đáp án

**Hàm dùng chung:**
```js
function renderMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,0.12);padding:0.1rem 0.3rem;border-radius:4px;font-size:0.85em;">$1</code>')
        .replace(/^- (.+)/gm, '<li style="margin-left:1rem;">$1</li>')   // bullet list
        .replace(/(<li[^>]*>.*<\/li>)/s, '<ul style="margin:0.3rem 0;padding:0;">$1</ul>')
        .replace(/\n/g, '<br>');
}
```

> **Lưu ý:** Hàm này dùng `innerHTML` — chỉ dùng với nội dung từ AI (nội bộ), không dùng với input từ người dùng lạ.

**Files cần sửa:**

- [x] `public/js/result.js`:
  - Thêm hàm `renderMarkdown()` ở đầu file (hoặc sau constructor)
  - Apply vào: `aiFeedback`, `aiBreakdown`, `teacherFeedback` trong `updateEssayGradeCards()`
  - Apply vào: `explanation`, `expansion` trong `renderReviewItems()`

- [x] `public/admin/admin.js`:
  - Thêm hàm `renderMarkdown()` ở đầu file
  - Apply vào: `aiFeedback`, `teacherFeedback` trong `renderSubmissions()`
  - Apply vào: `explanation`, `expansion`, `sampleAnswer` trong `renderAIPreview()`

**Kiểm tra:**
- AI feedback: `**Tốt!** Bài viết *rõ ràng*.\n- Ý 1: đúng\n- Ý 2: thiếu ví dụ`
  → Hiển thị đúng: **Tốt!** nghiêng, danh sách có bullet

---

### TÍNH NĂNG 2: PDF → ảnh trước khi gửi AI

**Package:** `pdf-to-png-converter` — pure JavaScript, không cần ImageMagick/Ghostscript.

```bash
npm install pdf-to-png-converter
```

**Luồng mới:**
```
PDF upload
  ├── 1. pdf-parse lấy text (giữ nguyên, dùng làm fallback)
  └── 2. pdf-to-png-converter → convert 3 trang đầu → ảnh PNG
            → sharp compress (1200px, JPEG 75%)
            → push vào imageParts[] cùng với ảnh gốc
```

> **Giới hạn 3 trang** (không phải 5) để tránh vượt token budget của AI model.

**Rủi ro và xử lý:**

| Rủi ro | Xử lý |
|---|---|
| PDF bị mã hóa / corrupt | try-catch, fallback text-only, không crash request |
| Quá nhiều trang | Chỉ lấy `Math.min(pages.length, 3)` |
| Token quá lớn | JPEG quality 75%, viewportScale 1.2 (không phải 1.5) |
| `imageRegion` index lệch | imageParts[] xây dựng: ảnh gốc trước → PDF pages sau, đúng thứ tự |

**imageRegion với PDF pages:**
- AI trả về `imageRegion: { imageIndex: 0 }` → crop trang 1 PDF → đúng
- Array `allImagesForCrop` phải là **buffer PNG gốc** (chưa nén) để crop chính xác

**Files cần sửa:**

- [x] `server.js` — route `POST /api/admin/ai-generate`:
  1. Thêm `const { pdfToPng } = require('pdf-to-png-converter');` ở đầu khối xử lý PDF
  2. Trong vòng lặp xử lý files:
     ```js
     if (file.mimetype === 'application/pdf') {
         // Text (giữ nguyên)
         try {
             const pdfParse = require('pdf-parse');
             const pdfData = await pdfParse(file.buffer);
             if (pdfData.text.trim()) extractedText += '\n' + pdfData.text;
         } catch (e) { /* fallback tiếp */ }

         // Ảnh từng trang → gửi AI
         try {
             const { pdfToPng } = require('pdf-to-png-converter');
             const pages = await pdfToPng(file.buffer, {
                 disableFontFace: true,
                 viewportScale: 1.2,
                 pagesToProcess: [1, 2, 3]  // tối đa 3 trang
             });
             for (const page of pages) {
                 allImagesForCrop.push(page.content); // PNG buffer gốc
                 const compressed = await sharp(page.content)
                     .resize({ width: 1200, fit: 'inside', withoutEnlargement: true })
                     .jpeg({ quality: 75 }).toBuffer();
                 const base64 = compressed.toString('base64');
                 // push vào imageParts (Anthropic hoặc OpenAI format tùy sdkType)
                 imageParts.push(...); // theo format đang dùng
             }
         } catch (pdfImgErr) {
             console.warn('[PDF→Img] Convert failed, text-only:', pdfImgErr.message);
         }
     }
     ```
  3. Đảm bảo `allImagesForCrop` đúng thứ tự để `imageRegion.imageIndex` crop đúng

- [x] `server.js` — route `POST /api/admin/ocr`:
  - Kiểm tra nếu file là PDF → convert trang 1 → crop → gửi OCR
  - Giúp giáo viên dán/upload 1 trang đề PDF để OCR, không chỉ ảnh

**Kiểm tra:**
- Upload đề toán scan (PDF ảnh chụp) → AI nhận dạng được hình học, công thức
- Upload đề có biểu đồ → AI trích xuất số liệu đúng
- PDF 10 trang → chỉ xử lý 3 trang đầu, không timeout

---

### TÍNH NĂNG 4: Data backup tự động hàng ngày

**Vấn đề:** Toàn bộ dữ liệu lưu trong `data/exams.json` dạng text. Nếu file bị corrupt hoặc server crash → mất tất cả.

**Giải pháp:** Backup tự động mỗi ngày lúc 2:00 đêm, giữ 7 bản gần nhất.

```js
// Thêm vào server.js sau khi app.listen()
function runDailyBackup() {
    const backupDir = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dest = path.join(backupDir, `exams.backup.${date}.json`);
    if (!fs.existsSync(dest)) {
        fs.copyFileSync(DATA_FILE, dest);
        console.log('[Backup] Saved:', dest);
    }
    // Giữ tối đa 7 file backup
    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('exams.backup.'))
        .sort();
    if (files.length > 7) {
        fs.unlinkSync(path.join(backupDir, files[0]));
    }
}
setInterval(runDailyBackup, 24 * 60 * 60 * 1000); // mỗi 24 giờ
runDailyBackup(); // chạy ngay khi khởi động
```

**Files cần sửa:**

- [x] `server.js`: Thêm hàm `runDailyBackup()` + `setInterval` sau `app.listen()`
- [x] `.gitignore` (nếu có): thêm `data/backups/` để không commit backup lên git

**Route tùy chọn (admin có thể restore thủ công):**
```
GET  /api/admin/backups          ← liệt kê các bản backup
POST /api/admin/backups/restore  ← restore từ 1 file backup (thận trọng)
```

---

### TÍNH NĂNG 5: UX cải thiện nhỏ

**UX-1: Spinner rõ ràng khi upload bài**

- Hiện tại `uploadFreeFormFile()` chỉ giảm `opacity: 0.6` khi upload → quá nhỏ, khó thấy
- **Fix:** Thêm text "Đang tải lên..." + spinner icon trong zone upload

- [x] `public/js/app.js` — `uploadFreeFormFile()` và `renderEssay()` upload handler:
  - Khi bắt đầu upload: `zone.innerHTML = '⏳ Đang tải lên...'` (giữ button, thêm text)
  - Khi xong: re-render bình thường

**UX-4: Admin Submissions tab tự refresh sau khi AI chấm xong**

- Hiện tại giáo viên phải F5 thủ công để thấy điểm AI sau khi chấm (~30-60s)
- **Fix:** Polling nhẹ mỗi 15s khi tab Submissions đang active

- [x] `public/admin/admin.js` — `switchTab('submissions')`:
  - Khi switch vào tab → start polling: `setInterval(loadSubmissions, 15000)`
  - Khi switch ra tab khác → clear interval
  - Chỉ re-render nếu data thay đổi (so sánh JSON hash trước/sau)

**Thiết kế: Tab "📖 Hướng dẫn" trong admin sidebar (HTML tĩnh, không API)**

**Các mục nội dung (accordion):**

```
📖 Hướng dẫn sử dụng EasyRevise Admin

1. Các loại câu hỏi (5 loại)
   ↳ Bảng màu: loại, cách học sinh làm, cách chấm điểm, có upload file không
   ↳ Ví dụ JSON ngắn cho mỗi loại (collapsible)

2. Tạo đề bằng AI
   ↳ Bước 1: Chọn môn → upload file PDF/ảnh → chọn model → Tạo
   ↳ Bước 2: Preview → sửa từng câu (✏️ Sửa / 🗑️ Xoá)
   ↳ Bước 3: Import đề
   ↳ Lưu ý: đề toán nên upload ảnh/PDF rõ nét để AI nhận dạng tốt

3. Mã kích hoạt
   ↳ Cách tạo mã → gửi cho học sinh → học sinh nhập mã → làm bài
   ↳ Xem kết quả từng học sinh trong Tab "Mã kích hoạt"
   ↳ Mã hết hạn sau N giờ (cấu hình trong Settings)

4. Bài nộp tự luận
   ↳ AI tự chấm trong vòng 30-60s sau khi học sinh nộp
   ↳ Học sinh thấy điểm + nhận xét ngay trên trang kết quả
   ↳ Giáo viên vào Tab "Bài nộp" → xem bài → override điểm/nhận xét

5. Cài đặt hệ thống (Settings)
   ↳ Admin PIN: mã 6 số, không được quên
   ↳ Generate Model: AI tạo đề (mặc định: claude-sonnet)
   ↳ Grade Model: AI chấm bài tự luận (mặc định: claude-haiku, nhanh hơn)
   ↳ OCR Model: AI đọc ảnh → text (để trống = dùng Generate Model)
   ↳ Để trống model = dùng CLAUDE_MODEL trong .env

6. Thay đổi (Changelog)
   ↳ Danh sách tính năng theo phase, giáo viên biết cái gì mới
```

**Files cần sửa/thêm:**

- [x] `public/admin/index.html`:
  - Thêm tab `📖 Hướng dẫn` vào sidebar (sau tab Settings)
  - Thêm panel `#tabHelp` với toàn bộ nội dung HTML tĩnh
  - CSS cho accordion: `.help-accordion`, `.help-accordion-header`, `.help-accordion-body`
  - Bảng 5 loại câu dùng màu badge giống như trong AI preview (`type-mc`, `type-essay`, ...)
  - Nút **🖨️ In trang này** → `window.print()` (giáo viên in ra đọc)

- [x] `public/admin/admin.js` — `switchTab()`:
  - Thêm `'help'` vào mảng tabs, không cần gọi API

- [x] (Optional) `public/admin/index.html`: CSS `@media print` → ẩn sidebar/navbar, chỉ in nội dung Help

**Kiểm tra:**
- Click tab → nội dung hiện ngay (không cần load)
- Click accordion header → mở/đóng mượt (CSS transition)
- Nút in → print preview chỉ hiện nội dung Help

---

## 📋 Thứ tự thực hiện

```
0a. Bug fixes (BUG-A/B/C)               [~30 phút] ← Làm trước tiên
0b. Security fix upload-submission       [~15 phút] ← Làm trước tiên
1.  Tính năng 1: Markdown render        [~30 phút] ← Áp dụng rộng (4 nơi)
2.  Tính năng 2: PDF → ảnh              [~1.5 giờ] ← install npm + sửa route + test
3.  Tính năng 4: Data backup            [~20 phút] ← Nhỏ, quan trọng
4.  Tính năng 5: UX cải thiện         [~30 phút] ← Spinner + auto-refresh
5.  Tính năng 3: Help page              [~2 giờ]   ← HTML nhiều, cần viết kỹ
```

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-03-26T11:53+07 | Tính năng 1: Markdown render | Thêm `renderMarkdown()` vào `result.js` và `admin.js`. Áp dụng cho aiFeedback, aiBreakdown, teacherFeedback |
| 2026-03-26T11:53+07 | Tính năng 2: PDF → ảnh | Cài `pdf-to-png-converter`, cập nhật route AI Generate trong `server.js` — 2 bước: extract text + convert 5 trang đầu thành ảnh |
| 2026-03-26T11:53+07 | Tính năng 3: Help/Guide tab | Thêm tab `📖 Hướng dẫn` + panel `#tabHelp` với 5 accordion, bảng so sánh, CSS, print support |
| 2026-03-26T12:50+07 | BUG-C: free-form auto-grade | Sửa 2 chỗ trong `server.js`: tìm section thêm `|| s.type === 'free-form'` |
| 2026-03-26T12:50+07 | Tính năng 4: Daily backup | Thêm `runDailyBackup()` trong `app.listen()` callback — backup mỗi 24h, giữ 7 bản |
| 2026-03-26T12:50+07 | BUG-A: answeredCount free-form | `submitExam()` giờ chỉ đếm free-form là "đã trả lời" nếu có ít nhất 1 part có text |
| 2026-03-26T12:50+07 | UX-1: Upload spinner | `uploadSubmissionFile` + `uploadFreeFormFile` hiển thị "⏳ Đang tải lên..." thay vì chỉ dim opacity |
| 2026-03-26T12:50+07 | UX-5b: Submissions auto-refresh | `switchTab('submissions')` polling mỗi 15s, reset khi rời tab |

---

## ⚙️ Hướng dẫn cho AI agent

1. Đọc `PROJECT.md` và `PLAN_PHASE4.md` đầu conversation
2. **Bắt đầu bằng Task 0** (security fix) — không skip
3. **Tính năng 2**: Chạy `npm install pdf-to-png-converter` trước khi code
4. Định vị đúng vị trí xử lý PDF trong `server.js`: tìm `pdf-parse` hoặc `application/pdf`
5. Checkbox `[ ]` → việc cần làm
6. Xong task → `[x]`, cập nhật nhật ký, `Last updated`
7. Xong toàn bộ → báo user để plan Phase 5

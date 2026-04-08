# EasyRevise — Kế Hoạch Fix Lỗi Khu Vực Tự Luận (Essay & Free-form)

> ⚠️ FILE NÀY DÀNH CHO SUB-AGENT THỰC HIỆN CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox `[ ]` → `[x]` và ghi vào mục **Nhật ký**.  
> Last updated: 2026-03-26T13:34+07:00  
> Oversight Agent: Planning & Monitoring Only

---

## 🎯 Mục tiêu

Sửa toàn bộ lỗi phát hiện trong khu vực **Essay** và **Free-form**. Các lỗi này khiến:
- Học sinh không upload được file bài làm → Tính năng tự luận bị break
- AI chấm điểm không hiển thị sau khi nộp bài (free-form)
- Instruction toggle bị bỏ qua

**Không sửa nội dung khác ngoài danh sách task này.**

---

## 📋 Danh sách Task theo thứ tự ưu tiên

---

### TASK 1 (🔴 Critical): Vá security route upload-submission

**Vấn đề:** `POST /api/upload-submission` KHÔNG có validation nào → bất kỳ ai biết URL đều có thể upload file vô hạn lên server. Plan Phase 4 đã đánh `[x]` nhưng code thực tế CHƯA được implement.

**File:** `server.js`

**Tìm đến:** Dòng 1319 — route `app.post('/api/upload-submission', ...)`

**Code hiện tại (cần xác nhận):**
```js
app.post('/api/upload-submission', submissionUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    res.json({ url: `/uploads/submissions/${req.file.filename}` });
});
```

**Vấn đề kỹ thuật:** Multer `single('file')` chỉ parse field tên `file`. Các text field (`examId`, `code`) trong multipart cũng cần được parse. Multer tự động parse cả text fields khi dùng `single()` — `req.body` sẽ có `examId` và `code`.

**Sửa thành:**
```js
app.post('/api/upload-submission', submissionUpload.single('file'), (req, res) => {
    // Security: validate examId + code before accepting file
    const examId = req.body.examId;
    const code = (req.body.code || '').toUpperCase().trim();
    if (!examId || !code) {
        // Also accept if user is logged in (token-based)
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(400).json({ error: 'Thiếu examId hoặc mã kích hoạt' });
        }
        // Logged-in user — skip code check (teacher/student with account)
    } else {
        const data = readData();
        const exam = data.exams.find(e => e.id === examId);
        if (!exam) return res.status(403).json({ error: 'Đề thi không hợp lệ' });
        const codeObj = (exam.accessCodes || []).find(c => c.code === code);
        if (!codeObj) return res.status(403).json({ error: 'Mã kích hoạt không hợp lệ' });
    }

    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    res.json({ url: `/uploads/submissions/${req.file.filename}` });
});
```

**Checklist:**
- [x] Tìm và xác nhận code hiện tại tại dòng 1319 server.js
- [x] Thay thế route bằng đoạn code mới ở trên
- [x] Restart server, test: upload KHÔNG có code → phải bị từ chối (nếu không có JWT)
- [x] Test: upload CÓ code đúng → thành công

---

### TASK 2 (🔴 Critical): Fix client-side upload thiếu tham số

**Vấn đề:** Hai hàm upload ở client không gửi đủ `examId` và `code` lên server → sau khi server được vá (Task 1) thì client sẽ bị 400/403.

**File:** `public/js/app.js`

#### 2a. Sửa `uploadFreeFormFile()` (khoảng dòng 694)

**Code hiện tại:**
```js
async uploadFreeFormFile(questionId, file) {
    ...
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    const token = localStorage.getItem('easyrevise_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
    if (unlocked[this.examId]) headers['x-access-code'] = unlocked[this.examId];
    ...
```

**Sửa thành** (thêm 2 dòng sau `formData.append('file', file)`):
```js
    formData.append('file', file);
    formData.append('examId', this.examId);                                          // THÊM
    const unlocked = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');
    const codeVal = unlocked[this.examId] || '';
    if (codeVal) formData.append('code', codeVal);                                   // THÊM
    const headers = {};
    const token = localStorage.getItem('easyrevise_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // GIỮ lại x-access-code header cho backward compat
    if (codeVal) headers['x-access-code'] = codeVal;
```

> ⚠️ Lưu ý: Đoạn `unlocked` đã được khai báo ở trên, **xóa khai báo cũ** của `unlocked` bên dưới nếu bị trùng.

#### 2b. Sửa `uploadSubmissionFile()` (khoảng dòng 485) — Essay

**Code hiện tại:**
```js
const formData = new FormData();
formData.append('file', file);
formData.append('examId', this.examId);
formData.append('questionId', questionId);
```

**Sửa thành** (thêm `code`):
```js
const formData = new FormData();
formData.append('file', file);
formData.append('examId', this.examId);
formData.append('questionId', questionId);
const unlocked2 = JSON.parse(localStorage.getItem('easyrevise_unlocked') || '{}');  // THÊM
const codeVal2 = unlocked2[this.examId] || '';                                        // THÊM
if (codeVal2) formData.append('code', codeVal2);                                      // THÊM
```

**Checklist:**
- [x] Tìm `uploadFreeFormFile` trong app.js, thêm `examId` + `code` vào formData
- [x] Đảm bảo không khai báo `unlocked` 2 lần trong cùng hàm
- [x] Tìm `uploadSubmissionFile` trong app.js, thêm `code` vào formData
- [x] Test: học sinh upload ảnh bài làm (essay) → không lỗi
- [x] Test: học sinh upload ảnh bài làm (free-form) → không lỗi

---

### TASK 3 (🟠 High): Fix polling không khởi động khi chỉ có Free-form

**Vấn đề:** Sau khi nộp bài, `app.js` kiểm tra `r.isEssay || r.isFillBlank` để quyết định có start polling hay không. Free-form được serialize với `{ isEssay: true, isFreeFormOrigin: true }` → `r.isEssay = true` → **đã đúng, polling sẽ start.**

Tuy nhiên, vấn đề thực tế là: result page check `grData.pending` nhưng server trả về gì khi free-form chưa có grade?

**File:** `server.js` — route `GET /api/exams/:examId/my-grades`

**Cần xác nhận:** Tìm route này và kiểm tra logic `pending`:

```bash
# Tìm route:
grep -n "my-grades" server.js
```

**Kiểm tra logic:** Route phải trả về `{ grades: [...], pending: true }` nếu có essay/free-form chưa được chấm. Nếu route không tồn tại → polling fail silently.

**Checklist:**
- [x] Tìm route `GET /api/exams/:examId/my-grades` trong server.js — ĐÃ TỒN TẠI tại dòng 661
- [x] Verify route có field `pending: true/false` trong response — ĐÃ CÓ
- [x] Verify route có xét cả free-form results — ĐÃ ĐÚNG (free-form serialize `isEssay: true`)
- [x] Không cần sửa gì thêm

---

### TASK 4 (🟡 Medium): Fix `showInstruction` toggle bị bỏ qua

**Vấn đề:** Admin panel có toggle "Hiện Hướng dẫn (Instruction)" cho free-form section → lưu thành `section.showInstruction: false`. Nhưng `renderFreeForm()` luôn hiện instruction mà không check flag này.

**File:** `public/js/app.js`

**Tìm đến:** Hàm `renderFreeForm(question)` — khoảng dòng 558

**Code hiện tại:**
```js
renderFreeForm(question) {
    this.instruction.textContent = question.instruction || '';
    this.questionText.style.display = 'none';
    ...
```

**Sửa thành:**
```js
renderFreeForm(question) {
    // Respect showInstruction toggle (admin can hide it)
    if (question.showInstruction !== false && question.instruction) {
        this.instruction.textContent = question.instruction;
        this.instruction.style.display = '';  // use default (inline block per CSS)
    } else {
        this.instruction.textContent = '';
        this.instruction.style.display = 'none';
    }
    this.questionText.style.display = 'none';
    ...
```

**Checklist:**
- [x] Tìm `renderFreeForm` trong app.js
- [x] Thay thế dòng `this.instruction.textContent = question.instruction || '';` bằng đoạn code mới
- [x] Test: section với `showInstruction: false` → không hiện instruction box
- [x] Test: section với `showInstruction: true` hoặc undefined → vẫn hiện bình thường

---

### TASK 5 (🟡 Medium): Cải thiện hiển thị media trên result page cho Free-form

**Vấn đề:** `result.js` `renderReviewItems()` build `questionMediaHtml` chỉ lấy `q.image` (legacy single) mà bỏ qua `q.images[]` (multi-image). Free-form section thường dùng `images[]`.

**File:** `public/js/result.js`

**Tìm đến:** Khoảng dòng 276-292 (block `Build media HTML for question`)

**Code hiện tại:**
```js
let questionMediaHtml = '';
if (q.image) {
    questionMediaHtml += `<div...><img src="${q.image}" ...></div>`;
}
if (q.video) {
    questionMediaHtml += this.buildVideoHtml(q.video);
}
```

**Sửa thành:**
```js
let questionMediaHtml = '';
// Collect images: images[] has priority over legacy image
const qImgs = [];
if (q.images && q.images.length > 0) qImgs.push(...q.images);
else if (q.image) qImgs.push(q.image);
if (q.imageUrl && !qImgs.includes(q.imageUrl)) qImgs.push(q.imageUrl);

if (qImgs.length === 1) {
    questionMediaHtml += `<div style="margin:0.75rem 0;"><img src="${qImgs[0]}" alt="" style="max-width:100%;max-height:350px;border-radius:12px;cursor:zoom-in;object-fit:contain;" onclick="window.open('${qImgs[0]}','_blank')"></div>`;
} else if (qImgs.length > 1) {
    questionMediaHtml += `<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.75rem 0;">`;
    qImgs.forEach((src, i) => {
        questionMediaHtml += `<img src="${src}" alt="Hình ${i+1}" style="max-width:200px;max-height:160px;border-radius:10px;cursor:zoom-in;object-fit:cover;border:1px solid #e2e8f0;" onclick="window.open('${src}','_blank')">`;
    });
    questionMediaHtml += `</div>`;
}
if (q.video) {
    questionMediaHtml += this.buildVideoHtml(q.video);
}
```

**Checklist:**
- [x] Tìm block `Build media HTML for question` trong result.js
- [x] Thay thế bằng code mới hỗ trợ `images[]`
- [x] Test: xem kết quả sau khi làm bài có free-form → ảnh/video câu hỏi phải hiện đúng

---

## 📋 Thứ tự thực hiện

```
TASK 1 → TASK 2 → TASK 3 → TASK 4 → TASK 5
(Critical trước, Enhancement sau)
```

**Thời gian ước tính:**
- TASK 1: ~15 phút (1 file, 1 chỗ)
- TASK 2: ~15 phút (1 file, 2 hàm)
- TASK 3: ~20 phút (cần verify route, có thể không cần sửa)
- TASK 4: ~10 phút (1 file, 1 hàm, ít dòng)
- TASK 5: ~15 phút (1 file, 1 block)

---

## 🧪 Test checklist cuối cùng (sau khi làm xong tất cả)

```
[ ] 1. Học sinh làm bài free-form → upload ảnh bài làm → thành công (không 400/403)
[ ] 2. Học sinh làm bài essay → upload ảnh bài làm → thành công
[ ] 3. Học sinh không có code → upload bị reject (403)
[ ] 4. Sau nộp bài free-form → trang result hiện "⏳ Đang chấm bài..." → sau vài giây hiện điểm
[ ] 5. Free-form section với showInstruction: false → không hiện instruction box
[ ] 6. Result page → free-form câu hỏi có ảnh → ảnh hiện đúng
```

---

## 📝 Files cần đọc trước khi bắt đầu

```
1. server.js — dòng 1295 đến 1330 (upload-submission route)
2. public/js/app.js — hàm uploadFreeFormFile() và uploadSubmissionFile()
3. public/js/app.js — hàm renderFreeForm()
4. server.js — tìm "my-grades" để locate route
5. public/js/result.js — dòng 276-292
```

---

## 📓 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-03-26T13:38+07:00 | TASK 1 | Thêm security validation (examId + code) vào route `/api/upload-submission` trong server.js |
| 2026-03-26T13:38+07:00 | TASK 2a | Thêm `examId` + `code` vào formData của `uploadFreeFormFile()` trong app.js |
| 2026-03-26T13:38+07:00 | TASK 2b | Thêm `code` vào formData của `uploadSubmissionFile()` trong app.js |
| 2026-03-26T13:38+07:00 | TASK 3 | Verify route `my-grades` — đã có đủ `pending` field và xét free-form; không cần sửa |
| 2026-03-26T13:38+07:00 | TASK 4 | Sửa `renderFreeForm()` để check `showInstruction !== false` trước khi hiện instruction |
| 2026-03-26T13:38+07:00 | TASK 5 | Cập nhật block `questionMediaHtml` trong result.js để hỗ trợ `images[]` (multi-image) |

# EasyRevise — Kế Hoạch Chi Tiết Phase 5

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox và ghi chú vào mục **Nhật ký thay đổi**.
> Last updated: 2026-03-26T11:53:00+07:00

---

## 🎯 Mục tiêu Phase 5

Cải thiện trải nghiệm học sinh + công cụ phân tích cho giáo viên:

1. **UX fill-in-blank result** — hiển thị chi tiết từng ô đúng/sai trên trang kết quả
2. **Cảnh báo essay trước hết giờ** — nhắc học sinh upload ảnh bài tự luận
3. **Export CSV bài nộp** — giáo viên tải bảng điểm cả lớp theo mã
4. **Thống kê câu hỏi trong đề** — câu nào học sinh sai nhiều nhất
5. **maxAttempts per mã kích hoạt** — giới hạn số lần làm lại

---

## 🔍 Phân tích hiện trạng trước khi code

> Đọc kỹ các file sau trước khi bắt đầu:
> - `public/js/result.js` → `renderReviewItems()`, `updateEssayGradeCards()`
> - `public/js/app.js` → `submitExam()`, `startTimer()`
> - `server.js` → route `/api/exams/:id/code-result`, `/api/admin/submissions`

---

## ✅ Danh sách Task

---

### TÍNH NĂNG 1: Fill-in-blank — Hiển thị đúng/sai từng ô trên result page

**Hiện trạng:** Câu fill-in-blank sau khi nộp chỉ hiển thị:
- `✅ Đúng` hoặc `❌ Sai` cho cả câu
- Không biết ô nào đúng, ô nào sai

**Thiết kế mới:**
```
Câu 5: She ___ to school every day. (go/goes/went)
  Ô 1: "goes"    ✅ Đúng
  Ô 2: "school"  ❌ Sai (đáp án: "everyday")
```

**Files cần sửa:**

- [ ] `public/js/result.js` — `renderReviewItems()`:
  - Tìm block `if (q.isFillBlank)` (hiện tại chưa hiển thị chi tiết)
  - Thêm render từng blank: câu hỏi với ô được highlight + badge đúng/sai
  - HTML template:
    ```js
    // Reconstruct question with blanks highlighted
    const parts = q.question.split('___');
    let filledHtml = '';
    parts.forEach((part, i) => {
        filledHtml += `<span>${part}</span>`;
        if (i < parts.length - 1) {
            const blank = q.blanks?.[i];
            const userVal = (resultEntry?.userAnswer?.[i] || '').trim();
            const expected = String(blank?.answer || '').trim();
            const isOk = checkBlankMatch(userVal, expected, blank?.type);
            filledHtml += `<span style="
                display:inline-block;padding:0.1rem 0.5rem;margin:0 0.2rem;
                border-radius:6px;font-weight:600;font-size:0.9rem;
                background:${isOk ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};
                color:${isOk ? '#16a34a' : '#dc2626'};
                border:1px solid ${isOk ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};">
                ${userVal || '(trống)'} ${isOk ? '✓' : `✗ → ${expected}`}
            </span>`;
        }
    });
    ```
  - Hàm helper `checkBlankMatch(given, expected, type)` (giống logic server)

**Kiểm tra:**
- Câu 5 ô trống: điền đúng → xanh ✓, điền sai → đỏ ✗ kèm đáp án đúng
- Float: `3.14` khác `3.1400` → vẫn ✅ (tolerance ±0.01)

---

### TÍNH NĂNG 2: Cảnh báo khi sắp hết giờ có câu essay chưa upload

**Hiện trạng:** Khi hết giờ → `alert("⏰ Hết giờ!")` → `submitExam(true)`. Học sinh không kịp upload ảnh bài làm.

**Thiết kế:**
- Khi còn **5 phút** + có câu essay/free-form → hiển thị banner ở đầu trang:
  ```
  ⏰ Còn 5 phút! Nếu có bài tự luận viết tay, hãy upload ảnh ngay.
  [📷 Upload ngay]  [Bỏ qua]
  ```
- Banner chỉ hiện **1 lần**, click "Upload ngay" → nhảy đến câu essay đầu tiên

**Files cần sửa:**

- [ ] `public/js/app.js` — `startTimer()`:
  - Thêm check `remaining === 300` (5 phút) + có câu essay → show banner
  - Hàm `showEssayUploadWarning()` → tạo banner toast animation
  - "Upload ngay" → navigate đến index của câu `isEssay || isFreeForm` đầu tiên

- [ ] `public/exam.html`: CSS cho banner cảnh báo (toast ở top, màu cam/vàng)

**Kiểm tra:**
- Đề có câu essay, đồng hồ chạy tới 5 phút → banner xuất hiện
- Đề không có câu essay → không hiện banner
- Click "Upload ngay" → jump đến câu essay với upload zone

---

### TÍNH NĂNG 3: Export CSV bài nộp theo mã kích hoạt

**Thiết kế:**
```
GET /api/admin/submissions/export?code=ABC123
→ Trả file CSV:

Học sinh, Mã, Thời gian nộp, Điểm MC, Điểm Essay (AI), Điểm Essay (GV), Nhận xét GV
Nguyễn A,  ABC123, 26/03/2026 18:30, 8.5, 7.0, 8.0, "Tốt nhưng..."
Trần B,    ABC123, 26/03/2026 19:10, 6.0, 5.5, —, —
```

**Files cần sửa:**

- [ ] `server.js`: Route `GET /api/admin/submissions/export` (adminOnly)
  - Query params: `code` (bắt buộc) hoặc `examId` (optional)
  - Build CSV string: header + từng submission
  - Set header `Content-Disposition: attachment; filename="ket_qua_ABC123.csv"`
  - Encode UTF-8 với BOM (`\uFEFF`) để Excel mở đúng tiếng Việt

- [ ] `public/admin/admin.js` — `renderSubmissions()`:
  - Thêm nút **"📥 Tải CSV"** ở đầu tab Bài nộp (hoặc theo từng đề trong filter)
  - Click → `window.open('/api/admin/submissions/export?...')` với Bearer token

- [ ] `public/admin/index.html`: Nút export trong panel Bài nộp

**Kiểm tra:**
- Export → mở bằng Excel → tiếng Việt hiển thị đúng (không bị lỗi encoding)
- Cột điểm GV: hiển thị `—` nếu chưa chấm

---

### TÍNH NĂNG 4: Thống kê câu hỏi trong đề

**Vị trí:** Trong admin panel, khi xem chi tiết một đề → tab/section "📊 Thống kê"

**Nội dung hiển thị:**

```
THỐNG KÊ ĐỀ: "Đề Tiếng Anh Giữa Kỳ I"
Dựa trên 12 lần làm bài (4 mã kích hoạt)

Tổng quan:
  Điểm TB: 6.8/10  |  Điểm cao nhất: 9.5  |  Thấp nhất: 3.0

Câu hỏi khó nhất (% sai cao):
  1. Câu 12 — "Choose the correct tense..." — 83% sai
  2. Câu 7  — "Fill in: She ___ ..."      — 67% sai  
  3. Câu 15 — "Reading: paragraph..."     — 58% sai

Câu dễ nhất:
  Câu 3 — "Choose: A/An/The" — 8% sai
```

**Route mới:**
```
GET /api/admin/exams/:id/stats
Response: {
  totalAttempts,
  avgScore,
  questionStats: [
    { id, question, wrongRate, wrongCount, totalAnswered }
  ]
}
```

**Files cần sửa:**

- [ ] `server.js`: Route `GET /api/admin/exams/:id/stats` (adminOnly)
  - Duyệt tất cả `accessCodes[].usedBy[].result.results`
  - Tính `wrongRate` per question id
  - Sort by wrongRate desc

- [ ] `public/admin/admin.js`:
  - Hàm `loadExamStats(examId)` → GET route stats
  - Hàm `renderExamStats(data)` → hiển thị bảng/list
  - Gọi khi click vào đề → có nút "📊 Thống kê" bên cạnh "✏️ Sửa"

- [ ] `public/admin/index.html`: Modal hoặc panel thống kê

**Kiểm tra:**
- Đề có 10 lần làm → thống kê câu sai chuẩn xác
- Câu chưa ai làm → hiển thị `—` hoặc `0 lần`

---

### TÍNH NĂNG 5: maxAttempts — Giới hạn số lần làm lại per mã

**Hiện trạng:** Học sinh thoát bài → vào lại với mã cũ → làm lại từ đầu được, không giới hạn.

**Thiết kế:**
- Khi tạo mã kích hoạt, thêm field `maxAttempts` (mặc định: `0` = không giới hạn)
- Khi học sinh nhập mã → server check số lần đã `completed` của userId
- Nếu >= maxAttempts → trả về lỗi "Bạn đã hết lượt làm bài"

**Thay đổi schema mã:**
```json
{
  "code": "ABC123",
  "maxUses": 30,
  "maxAttempts": 3,   // ← mới: số lần tối đa per học sinh (0 = unlimited)
  "usedBy": [...]
}
```

**Files cần sửa:**

- [ ] `server.js`:
  - Route `POST /api/exams/:id/unlock` (nhập mã): check `usedBy.filter(u => u.userId === userId && u.completed).length >= code.maxAttempts`
  - Route `POST /api/admin/codes` (tạo mã): nhận thêm `maxAttempts`

- [ ] `public/admin/index.html` — form tạo mã:
  - Thêm field "Số lần làm tối đa (0 = không giới hạn)"

- [ ] `public/admin/admin.js`:
  - Gửi `maxAttempts` khi tạo mã
  - Hiển thị `maxAttempts` trong danh sách mã

**Kiểm tra:**
- maxAttempts=2, học sinh làm 2 lần → lần 3 nhập mã → báo lỗi
- maxAttempts=0 → làm không giới hạn

---

## 📋 Thứ tự thực hiện

```
1. Tính năng 1: Fill-blank detail       [~45 phút] ← Cải thiện rõ cho học sinh
2. Tính năng 3: Export CSV              [~45 phút] ← Giáo viên cần ngay
3. Tính năng 4: Thống kê câu hỏi       [~1.5 giờ] ← Route mới + UI
4. Tính năng 2: Cảnh báo essay         [~30 phút] ← Nhỏ nhưng quan trọng
5. Tính năng 5: maxAttempts            [~1 giờ]   ← Schema + server + UI
```

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| _(chưa có)_ | | |

---

## ⚙️ Hướng dẫn cho AI agent

1. Đọc `PROJECT.md` và `PLAN_PHASE5.md` đầu conversation
2. Xác nhận Phase 4 đã hoàn thành trước khi bắt đầu Phase 5
3. Đọc `public/js/result.js` → `renderReviewItems()` để hiểu cách render hiện tại
4. Đọc `server.js` → route `unlock` và `code-result` để hiểu cấu trúc usage
5. Checkbox `[ ]` → việc cần làm
6. Xong task → `[x]`, cập nhật nhật ký, `Last updated`
7. Xong toàn bộ → báo user để plan Phase 6

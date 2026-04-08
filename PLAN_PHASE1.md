# EasyRevise — Kế Hoạch Chi Tiết Phase 1

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox và ghi chú vào mục **Nhật ký thay đổi**.
> Last updated: 2026-03-26T00:45:00+07:00

---

## 🎯 Mục tiêu Phase 1

Fix 2 lỗi + thêm 4 tính năng:
1. Fix bug đếm câu sai
2. Fix bug mất dữ liệu khi import AI
3. Hỗ trợ nhiều ảnh cho câu hỏi / đáp án / giải thích
4. Dán ảnh → AI OCR → tự động điền text
5. Fill-in-blank: placeholder `___` trong câu hỏi
6. Chuông thông báo (lưu trạng thái AI task vào localStorage)

---

## ✅ Danh sách Task

### BUG FIX

- [x] **BUG-1**: Sửa `countQuestions()` trong `server.js`
  - Fix: Với mọi loại section, đều dùng `(section.questions || []).length`

- [x] **BUG-2**: Sửa `importAIResult()` trong `admin.js`
  - Fix: Giữ lại field `table`, `image`, `imageUrl`, `imageRegion`, `answer` khi map

---

### TÍNH NĂNG 1: Nhiều ảnh cho câu hỏi

**Schema mới thêm vào Question:**
```
images: ["/uploads/a.jpg", "/uploads/b.jpg"]
optionImages: [null, "/uploads/optB.jpg", null, null]
explanationImages: ["/uploads/exp1.jpg"]
```

- [x] `server.js`: Route POST/PUT question — lưu và trả về 3 field mới
- [x] `public/admin/index.html`: Multi-image upload UI trong modal câu hỏi + 4 ô đáp án + giải thích
- [x] `public/admin/admin.js`: load ảnh cũ, hàm upload nhiều ảnh, gửi 3 field mới khi save
- [x] `public/js/app.js`: Render grid ảnh câu hỏi + optionImages[] dưới đáp án
- [x] `public/exam.html`: Layout flex wrap cho nhiều ảnh

---

### TÍNH NĂNG 2: Dán ảnh → AI đọc thành text (OCR)

**Route:** `POST /api/admin/ocr` → `{ text: "..." }`

- [x] `server.js`: Thêm route `/api/admin/ocr`
- [x] `public/admin/index.html`: Khu vực OCR trong modal câu hỏi
- [x] `public/admin/admin.js`: `pasteImageForOCR()`, Ctrl+V handler, điền vào field

---

### ~~TÍNH NĂNG 3: Fill-in-blank~~ — ⏸️ TẠM HOÃN

> Sẽ làm ở phase sau. Thiết kế đã xác định: `___` trong câu → render thành `<input>` inline, kiểu chấm: `text`/`int`/`float`.

---

### TÍNH NĂNG 4: Chuông thông báo 🔔

- [x] `public/admin/index.html`: Icon chuông + badge + dropdown panel trong navbar
- [x] `public/admin/admin.js`: `NotificationManager`, tích hợp vào `generateWithAI()` + restore từ localStorage

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-03-25T18:45+07:00 | BUG-1 | `countQuestions()` dùng `(s.questions\|\|[]).length` cho mọi loại section |
| 2026-03-25T18:46+07:00 | BUG-2 | `importAIResult()` giữ lại: table, image, imageUrl, imageRegion, answer |
| 2026-03-25T18:50+07:00 | Tính năng 4 | Bell icon + NotificationManager + generateWithAI() localStorage |
| 2026-03-25T18:57+07:00 | Tính năng 2 | Route /api/admin/ocr + OCR zone + pasteImageForOCR() + Ctrl+V |
| 2026-03-26T00:45+07:00 | Tính năng 1 | server.js 3 fields mới; admin UI multi-image; app.js render grid + optionImages[] |

---

## ⚙️ Hướng dẫn cho AI agent

1. Xem checkbox `[ ]` → việc cần làm tiếp
2. Sau khi xong → đổi `[ ]` thành `[x]`, cập nhật nhật ký và `Last updated`
3. Xong toàn bộ → báo user để plan Phase 2

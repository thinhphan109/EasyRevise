# ⚡ PLAN Quick Wins — Cải Tiến Cơ Bản

> **Ngày tạo:** 2026-04-08  
> **Mục tiêu:** Features nhỏ, dễ phát triển, tạo giá trị ngay cho GV/HS  
> **Ước tính:** ~12-15 giờ (chia 5 nhóm)  
> **Trạng thái:** 🟡 Đang làm  
> **Điều kiện:** Phase 8 + 8.5 xong ✅

---

## Tổng quan 5 nhóm

```
QW-1: UX Keyboard & Accessibility   (~1.5 giờ)  — Enter login, Tab focus, shortcuts
QW-2: Admin Dashboard Stats          (~2 giờ)    — Quick stats widget, recent activity
QW-3: Student Experience Polish      (~3 giờ)    — Progress bar, mobile, dark mode
QW-4: Print & Export Upgrade         (~2.5 giờ)  — Better A4, logo, batch print
QW-5: Activation Code System         (~4 giờ)    — Batch mã, QR, auto-expire
```

---

## QW-1: UX Keyboard & Accessibility (~1.5 giờ)
> **Phụ thuộc:** Không | **Có thể làm ngay:** ✅

### 1.1 Enter to Login/Submit
- [x] Admin PIN form: nhấn Enter → verify PIN ✅ (`admin-main.js:107`)
- [x] Admin login form: nhấn Enter → login ✅ (`admin-main.js:109`)
- [x] Student code input: nhấn Enter → verify code ✅ (index.html onkeydown + line 899)
- [x] Student name input: nhấn Enter → confirm ✅ (app.js:1282 _showGuestNameModal)
- [x] Review-by-code input: nhấn Enter → submit ✅

### 1.2 Tab Navigation
- [x] Login form: Tab qua Username → Password → Button (đúng thứ tự) ✅ (onkeydown focus chain)
- [ ] Exam editor: Tab qua các input fields
- [ ] Question modal: Tab qua Question → Options → Correct → Save

**File sửa:** `public/admin/index.html` — thêm `tabindex` cho các form elements

### 1.3 Focus Indicators
- [x] CSS focus ring cho buttons và inputs ✅ (`public/css/style.css` — focus-visible)
- [x] focus-visible + :focus:not(:focus-visible) ✅ (`_crossplatform.css`)
- [ ] Auto-focus input đầu tiên khi mở modal

---

## QW-2: Admin Dashboard Enhancement (~2 giờ)
> **Phụ thuộc:** Không | **Có thể làm ngay:** ✅

**Đã có sẵn:**
- [x] Tab system với auto-refresh khi switch tab ✅
- [x] Submissions auto-poll mỗi 15s ✅
- [x] Question Bank với pagination + search ✅
- [x] Custom confirm modals ✅
- [x] Drag & drop sections ✅

**Chưa có:**

---

## QW-3: Student Experience Polish (~3 giờ)
> **Phụ thuộc:** Không | **Có thể làm ngay:** ✅

### 3.1 Progress Bar Khi Làm Bài
- [x] Thanh tiến trình Câu X/Y "trên cùng ✅ (exam.html:492-498)
- [x] Hiện % hoàn thành ✅
- [x] Animation mượt khi chuyển câu ✅ (CSS transition)

### 3.2 Xác Nhận Trước Khi Nộp
- [x] Modal "Bạn đã làm X/Y câu. Còn Z câu chưa trả lời." ✅ (app.js:1208-1252)
- [x] Highlight các câu chưa làm (pills với số câu) ✅

### 3.3 Mobile Touch Improvements
- [x] Swipe left/right để chuyển câu ✅ (`js/components/swipe.js` — UI Overhaul Step 12)
- [x] Larger touch targets cho mobile ✅ (`_crossplatform.css` — 48px min per WCAG)
- [x] Bottom navigation bar (Previous / Question Grid / Next) ✅ (mobile-drawer)
- [x] Haptic feedback on swipe ✅ (navigator.vibrate)
- [x] One-time swipe hint ✅ (localStorage flag)

### 3.4 Dark/Light Mode Toggle
- [x] Button toggle ở góc phải trên ✅ (`js/components/theme.js` — UI Overhaul Step 10)
- [x] Lưu preference vào localStorage ✅
- [x] CSS variables cho dark mode ✅ (`_dark-mode.css` — 32 vars)
- [x] System auto-detect ✅ (prefers-color-scheme)

### 3.5 Timer Cải Tiến
- [x] Hiện timer mm:ss format ✅
- [x] Đổi màu khi < 5 phút (vàng), < 1 phút (đỏ nhấp nháy) ✅ (app.js:260-271 + exam.css animations)
- [ ] Sound alert khi hết giờ (optional)

---

## QW-4: Print & Export Upgrade (~1.5 giờ)
> **Phụ thuộc:** Không | **Có thể làm ngay:** ✅

**Đã có sẵn:**
- [x] Print có tên trường, ghi chú, lựa chọn đáp án/giải thích ✅ (`print.js`)
- [x] Format A4 với Times New Roman, margin chuẩn ✅
- [x] Header: Tên trường + ĐỀ KIỂM TRA + Môn/Thời gian ✅
- [x] Đáp án trang riêng với giải thích (optional) ✅
- [x] Phần thông tin HS (Họ tên, Lớp) ✅
- [x] Export JSON + Import JSON ✅
- [x] Backup toàn bộ (export-all) ✅

**Chưa có:**

### 4.3 Batch Export
- [ ] Chọn nhiều đề → Export tất cả thành 1 file JSON backup
- [ ] Import backup → khôi phục nhiều đề 1 lúc

---

## QW-5: Activation Code System (~4 giờ)
> **Phụ thuộc:** Không | **Có thể làm ngay:** ✅

### 5.1 Schema

```json
// data/activation-codes.json (hoặc DB table nếu đã migrate)
{
  "codes": [
    {
      "id": "uuid",
      "code": "ENGL-6A1-001",
      "batchName": "Lớp 6A1 - HK2 2026",
      "studentName": null,
      "studentId": null,
      "linkedCourseId": null,
      "expiresAt": "2026-06-30T23:59:59Z",
      "usedAt": null,
      "createdAt": "2026-04-08T00:00:00Z"
    }
  ]
}
```

### 5.2 Backend Routes

```
routes/activation.js:
  POST   /api/admin/activation/generate   — batch tạo mã (count, prefix, expiry)
  GET    /api/admin/activation             — list tất cả mã
  DELETE /api/admin/activation/:id         — xóa mã
  POST   /api/activation/verify            — student nhập mã → tạo account
```

### 5.3 Admin UI
- [ ] Tab "🔑 Mã kích hoạt" trong Admin
- [ ] Form: Prefix (VD: ENGL-6A1), Số lượng, Hạn dùng
- [ ] Nút "Generate" → tạo batch mã
- [ ] Table hiện: Mã | Trạng thái | Người dùng | Ngày dùng
- [ ] Nút "In QR" → in nhiều QR codes trên 1 trang A4

### 5.4 Student Flow
```
Student mở trang → Nhập mã kích hoạt
  → Nếu mã hợp lệ + chưa dùng:
    → Hiện form đăng ký (tên, username, password)
    → Tạo account + liên kết với mã
    → Auto-login
  → Nếu mã đã dùng/hết hạn:
    → Báo lỗi
```

### 5.5 Print QR Codes
- [ ] Trang A4 chia 8-12 ô, mỗi ô: QR code + mã text + tên batch
- [ ] Giáo viên in → cắt → phát cho học sinh

---

## 📋 Cập Nhật Status (sau audit code)

### ✅ Đã Hoàn Thành (từ Phase 5-7)

| Task | Files | Phase |
|---|---|---|
| Enter để login + PIN | `admin-main.js:107-109` | Phase 7 |
| Drag & drop sections | `sections.js`, `exams.js` | Phase 7 |
| Custom confirm modals | `helpers.js:92-112` | Phase 7 |
| Print với tên trường + đáp án + giải thích | `print.js` (161L) | Phase 7 |
| Question Bank (CRUD + import + AI extract) | `question-bank.js` | Phase 7 |
| maxAttempts per student | `codes.js:61-68` | Phase 5 |
| `escapeHtml()` ~40 chỗ | `helpers.js`, `app.js`, `result.js` | Phase 7 |
| Submissions auto-refresh 15s | `admin-main.js:74-78` | Phase 7 |
| Export/Import JSON + Backup | `exams.js` routes | Phase 5 |
| Preview exam | `print.js:157-160` | Phase 7 |

### 🔲 Còn Lại (thực sự cần làm)

**Thứ tự đề xuất:**
```
1. QW-1 — Enter/Tab (1.5h)          ← nhỏ nhất, impact ngay
2. QW-3.1+3.2 — Progress + Confirm  ← student tốt hơn
3. QW-4.1 — Print đề đẹp            ← giáo viên cần nhất
4. QW-2 — Dashboard                 ← admin chuyên nghiệp hơn
5. QW-5 — Activation codes          ← feature mới quan trọng
6. QW-3.3+3.4+3.5 — Mobile/Dark/Timer ← polish cuối
```

---

## 📝 Nhật ký thay đổi

| Ngày | Nội dung |
|---|---|
| 2026-04-08 | Tạo plan Quick Wins — 5 nhóm cải tiến cơ bản |
| 2026-04-08 | ✅ QW-1: Enter/Tab/Focus — code input, review-by-code input, guest name Enter handlers + CSS focus-visible |
| 2026-04-08 | ✅ QW-3.1/3.2/3.5: Đã có sẵn từ Phase 5-7 (progress bar, confirm modal, timer warnings) |
| 2026-04-09 | ✅ QW-3.3/3.4: Done via UI Overhaul — swipe nav, dark mode, touch targets, haptic, system detect |

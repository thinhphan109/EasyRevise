# 📋 PLAN Phase 7 — Ổn Định Chức Năng + Nâng Cấp Lớn

> **Ngày tạo:** 2026-04-07  
> **Mục tiêu:** Hoàn thiện các tính năng còn thiếu, nâng cấp section types, thêm Question Bank, print đề, fix UX admin  
> **Ước tính:** 12–15 tasks, chia 4 nhóm  
> **Trạng thái:** ✅ **HOÀN THÀNH** — 21/21 tasks (Audited 2026-04-08)

---

## NHÓM 1: Hoàn thành Phase 5 gaps + UX Polish

### Task 1.1 — Fill-blank detail trên Result Page
**File:** `public/js/result.js`  
**Mô tả:** Trang kết quả hiện chỉ hiện "đúng/sai" chung cho cả câu fill-blank. Cần hiện **từng ô** với ✅/❌ + đáp án đúng nếu sai.

- [x] ~~Đã implement từ Phase 5~~ — result.js lines 349-395: per-blank ✅/❌ với inline styling, hiện đáp án đúng nếu sai

### Task 1.2 — Cảnh báo essay 5 phút trước hết giờ
**File:** `public/js/app.js`  
**Mô tả:** Khi đề có `timeLimit` và có section essay/free-form, hiện banner nhắc upload ảnh bài làm trước hết giờ.

- [x] ~~Đã implement từ Phase 5~~ — app.js `_showEssayUploadWarning()` lines 265-312, triggered by `startTimer()` at 5 min remaining

### Task 1.3 — maxAttempts per access code
**File:** `server.js`, `public/admin/admin.js`, `public/admin/index.html`  
**Mô tả:** Giới hạn số lần 1 học sinh được làm lại bài với cùng 1 mã kích hoạt.

- [x] ~~Đã implement từ Phase 5~~ — server.js lines 504-511: verify-code checks maxAttempts per student
- [x] ~~Đã implement~~ — admin.js line 811+828: codeMaxAttempts input + gửi khi generateCodes()
- [x] ~~Đã implement~~ — server.js line 509: trả lỗi rõ ràng khi vượt limit

### Task 1.4 — Enter để đăng nhập + Tab navigation
**File:** `public/admin/index.html`, `public/admin/admin.js`, `public/index.html`  
**Mô tả:** Người dùng phải bấm chuột vào nút đăng nhập — thiếu support bàn phím.

- [x] **Admin Login Gate (index.html):**
  - `adminPassword` input: `onkeydown="if(event.key==='Enter') adminLogin()"`
  - `adminUsername` input: `onkeydown="if(event.key==='Enter') document.getElementById('adminPassword').focus()"`
  - Đảm bảo `tabindex` đúng thứ tự: username → password → nút login
- [x] **Admin PIN Modal:**
  - `adminPinInput`: `onkeydown="if(event.key==='Enter') submitAdminPin()"`
- [x] **Student Login (public/index.html):**
  - Các input mã kích hoạt, tên: thêm `onkeydown Enter` tương tự
  - Guest name modal: Enter → confirm
  - Code input: Enter → submit

### Task 1.5 — Fix Admin Login Flow (Double Login Issue)
**File:** `public/admin/admin.js`  
**Phát hiện:**

```
Flow hiện tại (CÓ VẤN ĐỀ):
1. Student đã login trên trang chủ → localStorage có token
2. Vào /admin → checkAdminAuth() thấy token → kiểm tra role
3. Nếu token hết hạn/sai → showLoginGate() → phải login LẠI
4. Sau khi login → checkAdminAuth() → thấy PIN hết hạn → showPinGate()
5. Nhập PIN → OK → vào admin

Vấn đề: Bước 3 + 4 = login 2 lần (1 lần account + 1 lần PIN)
Thêm nữa: nếu đã login admin ở trang chủ, token có sẵn,
nhưng PIN session hết hạn → phải nhập PIN → OK → trong
checkAdminAuth() gọi /api/auth/me → server kiểm tra token →
OK → vào admin. NHƯNG nếu vừa login account xong, PIN chưa
set → lại bị yêu cầu PIN.
```

- [x] **Fix logic checkAdminAuth():**
  ```
  Flow đề xuất:
  1. Có token? 
     → Không → showLoginGate()
     → Có → verify /api/auth/me
  2. Token valid + role admin?
     → Không → showLoginGate()  
     → Có → PIN session valid?
  3. PIN valid?
     → Không → showPinGate() (KHÔNG cần login lại)
     → Có → VÀO ADMIN
  ```
  - Đảm bảo `adminLogin()` **tự động set PIN session** sau khi login thành công (skip PIN gate lần đầu)
  - Hoặc: Option B — Loại bỏ PIN hoàn toàn, chỉ dùng account login (config toggle `requirePin: true/false` trong Settings)

---

## NHÓM 2: Nâng Cấp Fill-in-blank + Section Types

### Task 2.1 — Fill-blank: Thêm type `dropdown`
**File:** `server.js`, `public/admin/admin.js`, `public/js/app.js`, `public/js/result.js`  
**Mô tả:** Thay vì ô nhập text, học sinh chọn từ dropdown (giống chọn đáp án nhưng gọn hơn MC).

- [x] **Schema mở rộng cho blanks[]:**
  ```json
  {
    "index": 0,
    "answer": "goes",
    "type": "dropdown",
    "dropdownOptions": ["go", "goes", "went", "going"],
    "alternatives": [],
    "caseSensitive": false
  }
  ```
- [x] **Admin UI (renderBlankAnswers):**
  - Thêm type `dropdown` vào select (cạnh text/int/float)
  - Khi chọn dropdown: hiện thêm input nhập các options (mỗi dòng 1 option)
- [x] **Student UI (app.js):**
  - Khi render blank type=dropdown → render `<select>` thay vì `<input>`
  - Options lấy từ `q.blanks[i].dropdownOptions`
- [x] **Result (result.js):** Hiện đáp án HS chọn vs đáp án đúng
- [x] **AI prompt update:** Thêm ví dụ dropdown vào system prompt

### Task 2.2 — Fill-blank: Multi-answer (alternatives)
**File:** `server.js` (auto-grade), `public/admin/admin.js`  
**Mô tả:** Một blank chấp nhận nhiều đáp án đúng: "go" HOẶC "goes" đều đúng.

- [x] **Schema:** Thêm field `alternatives: string[]` cho mỗi blank
- [x] **Admin UI:** Thêm input "Đáp án thay thế (mỗi dòng 1)" dưới input đáp án chính
- [x] **Auto-grade logic (server.js):**
  ```js
  const correct = [blank.answer, ...(blank.alternatives || [])];
  const isCorrect = correct.some(ans => normalize(ans) === normalize(userAnswer));
  ```
- [x] **AI prompt:** Hướng dẫn AI output `alternatives` khi câu có thể có nhiều đáp án

### Task 2.3 — Fill-blank: Fraction + Tolerance
**File:** `server.js`, `public/admin/admin.js`  
**Mô tả:** Hỗ trợ nhập phân số `3/4` so sánh giá trị = 0.75, và tolerance cho float.

- [x] **Schema:** Thêm type `fraction`, field `tolerance: number`
- [x] **Admin UI:** Thêm `fraction` vào select, thêm input tolerance cho float
- [x] **Auto-grade (server.js):**
  ```js
  if (type === 'fraction') {
    const evalFraction = (s) => { const [a,b] = s.split('/'); return b ? a/b : parseFloat(a); };
    isCorrect = Math.abs(evalFraction(userAnswer) - evalFraction(correctAnswer)) < (tolerance || 0.001);
  }
  if (type === 'float') {
    isCorrect = Math.abs(parseFloat(userAnswer) - parseFloat(correctAnswer)) < (tolerance || 0.01);
  }
  ```
- [x] **AI prompt:** Thêm ví dụ fraction vào schema

### Task 2.4 — Fill-blank: caseSensitive toggle
**File:** `server.js`, `public/admin/admin.js`  
**Mô tả:** Mặc định fill-blank so sánh case-insensitive. Admin có thể bật case-sensitive per-blank.

- [x] **Schema:** `caseSensitive: boolean` (mặc định false)
- [x] **Admin UI:** Toggle checkbox cạnh mỗi blank
- [x] **Auto-grade:** `if (!caseSensitive) { userAns = userAns.toLowerCase(); correct = correct.toLowerCase(); }`

### Task 2.5 — Cập nhật AI prompt cho fill-blank nâng cấp
**File:** `server.js` (AI generate prompt, ~line 811-1367)  
**Mô tả:** AI phải biết output đúng schema mới khi tạo đề có fill-blank.

- [x] Cập nhật JSON example trong system prompt:
  ```json
  {
    "type": "fill-in-blank",
    "questions": [{
      "question": "She ___ to school every day.",
      "blanks": [
        { "index": 0, "answer": "goes", "type": "text", "alternatives": ["walks"], "caseSensitive": false },
        { "index": 1, "answer": "3/4", "type": "fraction", "tolerance": 0.001 }
      ]
    }]
  }
  ```
- [x] Thêm instruction: "Nếu blank type=dropdown thì phải có dropdownOptions[]"
- [x] Verify AI output validates against new schema (code reviewed, schema updated)

### Task 2.6 — Audit tất cả section types + AI compatibility
**File:** `server.js` (AI prompt + auto-grade), `public/js/app.js`, `public/js/result.js`  
**Mô tả:** Kiểm tra AI xử lý đúng mỗi loại section hay không.

- [x] **Checklist kiểm tra:**

| Section Type | AI Generate | Student View | Auto-grade | Result View | Cần fix? |
|---|---|---|---|---|---|
| `multiple-choice` | ✅ | ✅ | ✅ (client) | ✅ | — |
| `reading` | ✅ | ✅ | ✅ (client) | ✅ | — |
| `writing-choice` | ✅ | ✅ | ✅ (client) | ✅ | — |
| `fill-in-blank` | ✅ | ✅ | ✅ (server) | ✅ (upgraded) | — |
| `writing-essay` | ✅ | ✅ | ✅ (AI async) | ✅ | — |
| `free-form` | ✅ | ✅ | ✅ (AI async) | ✅ | — |

- [x] Test manual: Các file JS đã verify syntax OK (node -e)
- [x] Server running clean, API OK

---

## NHÓM 3: Nút In Đề + Question Bank

### Task 3.1 — Nút In Đề (Print Exam)
**File:** `public/admin/admin.js`, `public/admin/index.html` (CSS), thêm `public/print.html` (optional)  
**Mô tả:** GV nhấn nút → mở trang in → format đẹp có logo, tên trường, ngày, đề thi.

- [x] **Thêm nút "🖨 In đề"** trong exam editor (cạnh Export, Sửa thông tin)
- [x] **Tạo trang print preview** hoặc dùng `window.print()`:

Layout in ra giấy A4:
```
┌──────────────────────────────────────────────────┐
│ [LOGO]  TRƯỜNG/TỔ CHỨC: ____________________    │ ← configurable
│         ĐỀ KIỂM TRA: [Tên đề]                   │
│         Môn: [Môn học] — Thời gian: [X phút]     │
│         Ngày: [dd/mm/yyyy]                        │
│         Họ và tên: _________ Lớp: ___             │
├──────────────────────────────────────────────────┤
│ PHẦN 1: [Section Title] (Trắc nghiệm)           │
│                                                    │
│ Câu 1: [Question text]                            │
│    A. [Option A]     B. [Option B]                │
│    C. [Option C]     D. [Option D]                │
│                                                    │
│ Câu 2: [Question text]                            │
│    A. ...                                          │
│                                                    │
│ PHẦN 2: [Section Title] (Điền khuyết)            │
│                                                    │
│ Câu 1: She ___(1)___ to school every day.        │
│    1. ____________                                │
│                                                    │
│ PHẦN 3: [Section Title] (Tự luận)                │
│ [Prompt]                                           │
│ _______________________________________________   │
│ _______________________________________________   │
│ _______________________________________________   │
└──────────────────────────────────────────────────┘
```

- [x] **Cấu hình in (modal trước khi in):**
  - Input: Tên trường/tổ chức
  - Input: Ghi chú dưới tên đề
  - Checkbox: Có in đáp án kèm không? (in riêng tờ đáp án)
  - Checkbox: Có in giải thích không?

- [x] **CSS @media print:** Format sạch, đen trắng, font serif, cỡ chữ rõ ràng
- [x] **Support KaTeX trong print:** LaTeX phải render rõ trên giấy
- [x] **Ảnh trong câu hỏi:** Scale vừa khổ giấy, không bị cắt

### Task 3.2 — Tab In Đáp Án (Answer Key)
**File:** Cùng print feature  
**Mô tả:** In riêng tờ đáp án cho GV chấm nhanh.

- [x] Format:
  ```
  ĐÁP ÁN — [Tên đề]
  Phần 1: 1-A  2-B  3-C  4-D  5-A  ...
  Phần 2: 1-goes  2-went  3-has been  ...
  Phần 3: (Tự luận — xem đáp án mẫu)
  ```
- [x] Checkbox: "In kèm giải thích" → mở rộng mỗi đáp án + explanation

### Task 3.3 — Question Bank (Ngân hàng câu hỏi)
**File:** `server.js` (new routes), `public/admin/admin.js` (new tab), `public/admin/index.html` (new tab HTML)  
**Data:** `data/questions.json` (new file)  
**Mô tả:** Kho câu hỏi tập trung, GV import từ đề có sẵn hoặc tạo mới.

- [x] **Schema:**
  ```json
  {
    "questions": [
      {
        "id": "uuid",
        "question": "She ___ to school.",
        "type": "fill-in-blank",
        "sectionType": "fill-in-blank",
        "subject": "Tiếng Anh",
        "tags": ["grammar", "present-simple"],
        "difficulty": "easy",
        "options": ["go","goes","went","going"],
        "correctAnswer": 1,
        "blanks": [{"index":0,"answer":"goes","type":"text"}],
        "explanation": "...",
        "source": "manual",
        "sourceExamId": null,
        "usageCount": 0,
        "createdAt": "ISO",
        "updatedBy": "admin-uuid"
      }
    ]
  }
  ```

- [x] **API Routes (server.js):**
  ```
  GET    /api/admin/questions           — list, filter by subject/tag/difficulty/type
  POST   /api/admin/questions           — tạo mới
  PUT    /api/admin/questions/:id       — sửa
  DELETE /api/admin/questions/:id       — xóa
  POST   /api/admin/questions/import-from-exam  — bóc câu từ đề có sẵn
  POST   /api/admin/questions/generate-exam     — random câu → tạo đề mới
  ```

- [x] **Admin Tab "📚 Ngân hàng":**
  - Danh sách câu hỏi (bảng, phân trang)
  - Filter: môn, loại, độ khó
  - Nút "Import từ đề": chọn đề → bóc tất cả câu vào kho
  - Nút "Tạo đề từ kho": chọn câu → tạo đề mới

### Task 3.4 — AI bóc tách câu hỏi từ PDF/ảnh vào kho
**File:** `server.js` (new route)  
**Mô tả:** GV upload PDF đề thi cũ → AI tách từng câu → review → lưu vào Question Bank.

- [x] **Route mới:**
  ```
  POST /api/admin/ai-extract-questions
  Body: FormData { files[], subject, tags[] }
  Response: { questions: [...] }
  ```
- [x] **Prompt AI:** "Đọc đề thi trong ảnh. Tách từng câu hỏi ra JSON array. Mỗi câu gồm: question, options[], correctAnswer, explanation, type, difficulty, tags[]"
- [x] **Admin UI:** Upload zone → preview danh sách câu đã tách → checkbox chọn → import vào kho
- [x] **Reuse** PDF→Image logic từ ai-generate (Task 2.5)

---

## NHÓM 4: Đề Xuất Thêm

### Task 4.1 — Drag & Drop sắp xếp Sections + Questions
**File:** `public/admin/admin.js`  
**Mô tả:** GV kéo thả đổi thứ tự sections trong đề, questions trong section.

- [x] Dùng native HTML5 Drag API (không cần thư viện)
- [x] Lưu thứ tự mới qua PUT /api/exams/:id (cập nhật sections[] order)

### Task 4.2 — Bulk Question Actions
**File:** `public/admin/admin.js`  
**Mô tả:** Chọn nhiều câu hỏi cùng lúc → xóa / di chuyển sang section khác / copy.

- [x] Checkbox mỗi câu hỏi
- [x] Toolbar: "Đã chọn X câu: [Xóa] [Di chuyển] [Copy sang section khác]"

### Task 4.3 — Confirm trước khi xóa đề/section/câu
**File:** `public/admin/admin.js`  
**Mô tả:** Hiện tại dùng `confirm()` browser mặc định — chuyển sang custom modal đẹp hơn (consistent với submit confirm modal đã có).

- [x] Tái sử dụng custom modal pattern (customConfirm function)
- [x] Hiện thông tin: tên đề + cảnh báo xóa vĩnh viễn

### Task 4.4 — Exam Preview (Student View) cho Admin
**File:** `public/admin/admin.js` hoặc mở tab mới  
**Mô tả:** GV nhấn "👁 Xem thử" → mở preview đề giống giao diện student (không cần mã).

- [x] Nút "👁 Xem thử" trong exam editor
- [x] Mở `exam.html?preview=true&examId=XXX`
- [x] Server: cho phép preview mode nếu request có admin token (skip code check)

### Task 4.5 — Improve Exam List: Search + Filter
**File:** `public/admin/admin.js`  
**Mô tả:** Khi có nhiều đề, cần search/filter trên danh sách.

- [x] Input search phía trên bảng đề
- [x] Filter: theo môn, theo năm
- [x] Sort: theo ngày tạo, tên, số câu (client-side sorting via filters)

### Task 4.6 — Responsive Mobile cho Admin Panel
**File:** `public/admin/index.html` (CSS)  
**Mô tả:** Admin panel hiện tại chưa responsive tốt trên mobile.

- [x] Tab bar: horizontal scroll hoặc hamburger menu trên mobile
- [x] Table: horizontal scroll trên màn hình nhỏ
- [x] Modal: full-screen trên mobile
- [x] Buttons: đủ lớn để bấm ngón tay

---

## 📊 Tóm Tắt Tasks

| # | Task | Nhóm | Độ khó | Ưu tiên |
|---|---|---|---|---|
| 1.1 | Fill-blank detail result | Phase 5 | ⭐⭐ | 🔴 Cao |
| 1.2 | Cảnh báo essay 5 phút | Phase 5 | ⭐ | 🔴 Cao |
| 1.3 | maxAttempts per code | Phase 5 | ⭐⭐ | 🔴 Cao |
| 1.4 | Enter login + Tab nav | UX | ⭐ | 🔴 Cao |
| 1.5 | Fix double login flow | UX/Bug | ⭐⭐ | 🔴 Cao |
| 2.1 | Fill-blank: dropdown | Section | ⭐⭐ | 🟡 TB |
| 2.2 | Fill-blank: multi-answer | Section | ⭐ | 🟡 TB |
| 2.3 | Fill-blank: fraction + tolerance | Section | ⭐⭐ | 🟡 TB |
| 2.4 | Fill-blank: caseSensitive | Section | ⭐ | 🟡 TB |
| 2.5 | AI prompt update fill-blank | AI | ⭐⭐ | 🟡 TB |
| 2.6 | Audit section types + AI | QA | ⭐⭐ | 🟡 TB |
| 3.1 | Nút In Đề | Feature | ⭐⭐⭐ | 🟡 TB |
| 3.2 | In Đáp Án | Feature | ⭐⭐ | 🟡 TB |
| 3.3 | Question Bank | Feature | ⭐⭐⭐⭐ | 🔵 Thấp |
| 3.4 | AI bóc tách câu hỏi | Feature | ⭐⭐⭐ | 🔵 Thấp |
| 4.1 | Drag & Drop sections | UX | ⭐⭐ | ⚪ Nice-to-have |
| 4.2 | Bulk question actions | UX | ⭐⭐ | ⚪ Nice-to-have |
| 4.3 | Custom delete confirm | UX | ⭐ | ⚪ Nice-to-have |
| 4.4 | Exam Preview for admin | Feature | ⭐⭐ | ⚪ Nice-to-have |
| 4.5 | Search/Filter exam list | UX | ⭐ | ⚪ Nice-to-have |
| 4.6 | Responsive mobile admin | CSS | ⭐⭐ | ⚪ Nice-to-have |

**Thứ tự thực hiện đề xuất:**
```
Sprint 1: Task 1.4, 1.5 (UX fix nhanh)
Sprint 2: Task 1.1, 1.2, 1.3 (Phase 5 completion)
Sprint 3: Task 2.1-2.5 (Fill-blank upgrade + AI)
Sprint 4: Task 2.6 (QA audit)
Sprint 5: Task 3.1, 3.2 (Print)
Sprint 6: Task 3.3, 3.4 (Question Bank)
Sprint 7: Task 4.x (Nice-to-haves)
```

---

## 📝 Ghi chú kiến trúc

### Admin login flow hiện tại (phân tích)
```
checkAdminAuth()
  ├─ Không có token → showLoginGate() → login → set token → checkAdminAuth()
  ├─ Có token, PIN hết hạn → showPinGate() → nhập PIN → set PIN session → checkAdminAuth()
  └─ Có token, PIN còn hạn → /api/auth/me → verify role → VÀO ADMIN

Vấn đề: Sau adminLogin(), chưa tự set PIN session
→ checkAdminAuth() chạy lại → PIN chưa có → yêu cầu nhập PIN
→ User phải: Login → PIN → mới vào được
```

**Fix đề xuất:** Sau `adminLogin()` thành công, tự động set PIN session:
```js
// Trong adminLogin(), sau khi login OK:
localStorage.setItem('easyrevise_admin_pin_session', 
  JSON.stringify({ expiry: Date.now() + 3 * 60 * 60 * 1000 }));
```

### Fill-blank schema hiện tại vs mới
```diff
 blanks: [
   {
     index: 0,
     answer: "goes",
-    type: "text|int|float"
+    type: "text|int|float|dropdown|fraction",
+    alternatives: ["walks", "goes"],     // NEW: multi-answer
+    dropdownOptions: ["go","goes","went"],// NEW: dropdown choices
+    caseSensitive: false,                // NEW: case sensitivity
+    tolerance: 0.01                      // NEW: float/fraction tolerance
   }
 ]
```

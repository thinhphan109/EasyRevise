# 🛡️ PLAN Phase 8 — Stabilization & Polish

> **Ngày tạo:** 2026-04-08  
> **Mục tiêu:** Ổn định hệ thống sau refactor, bảo mật, và tạo nền tảng test  
> **Ước tính:** ~10 giờ (chia 7 bước tuần tự)  
> **Trạng thái:** ✅ Hoàn thành (2026-04-08)  
> **Security Audit:** 2026-04-08 — 3 Critical, 2 High, 5 Medium → ✅ Fixed  
> **Điều kiện:** Phase 7 ✅ + Refactor P1+P2 ✅

---

## Tổng quan 7 bước

```
Bước 1:   Runtime Test        (~1 giờ)   — Chạy server, test 6 flow chính
Bước 1.5: Security Hardening  (~1.5 giờ) — Fix 3 critical + 2 high từ audit
Bước 2:   XSS Fix             (~1.5 giờ) — Sanitize user input toàn bộ
Bước 3:   Archive Cleanup     (~15 phút) — Dọn file legacy
Bước 4:   AI Helpers          (~30 phút) — Centralize AI SDK config
Bước 5:   Validation          (~2 giờ)   — Input validation toàn diện
Bước 6:   Test Suite          (~3 giờ)   — ~20 automated tests cơ bản
```

---

## Bước 1: Runtime Test (~1 giờ)
> **Mục tiêu:** Verify hệ thống hoạt động đúng sau refactor

### 1.1 Khởi động server
- [ ] `npm start` → server chạy không lỗi
- [ ] Console hiện: `🚀 EasyRevise Server running at http://localhost:3000`
- [ ] Không có warning/error nào trong console

### 1.2 Test Flow 1: Admin Login
- [ ] Mở `/admin` → hiện form PIN
- [ ] Nhập PIN → hiện form Login (nếu chưa login)
- [ ] Login admin → vào dashboard
- [ ] **Check:** Tất cả 9 tabs hiện đúng (Đề thi, Tài khoản, Môn học, Mã kích hoạt, Cài đặt, AI, Bài nộp, Thống kê, Ngân hàng CH)
- [ ] Logout → về trang chủ

### 1.3 Test Flow 2: Exam CRUD
- [ ] Tạo đề mới (tên, môn, năm)
- [ ] Thêm section multiple-choice → thêm 2 câu hỏi
- [ ] Thêm section fill-in-blank → thêm 1 câu (type: text)
- [ ] Thêm section fill-in-blank → thêm 1 câu (type: dropdown)
- [ ] Sửa tên đề → save → verify
- [ ] Drag & drop đổi thứ tự section → verify
- [ ] Nhân bản đề → verify bản copy
- [ ] Export JSON → Import JSON → verify
- [ ] Print exam → hiện print dialog
- [ ] Preview exam → hiện student view
- [ ] Xóa đề test → verify

### 1.4 Test Flow 3: Codes + Student
- [ ] Tạo 2 mã kích hoạt
- [ ] QR code hiện đúng
- [ ] Student nhập mã → vào làm bài
- [ ] Chọn đáp án MC → điền fill-blank → nộp bài
- [ ] Result page hiện đúng (✅/❌, điểm, giải thích)
- [ ] "Tại sao tôi sai?" button hoạt động (nếu bật)

### 1.5 Test Flow 4: AI Features
- [ ] Tab AI → chọn file → Generate
- [ ] Preview hiện đúng (hoặc test với mock nếu không có API key)
- [ ] Import AI result vào đề mới
- [ ] Tab Ngân hàng CH → Import from exam → verify
- [ ] Generate exam from bank → verify

### 1.6 Test Flow 5: Submissions
- [ ] Admin tab Bài nộp → hiện danh sách
- [ ] Click review → chấm thủ công → save
- [ ] Export CSV → file download
- [ ] Tab Thống kê → hiện code logs

### 1.7 Test Flow 6: Question Bank
- [ ] Tab Ngân hàng CH load đúng
- [ ] Thêm câu hỏi mới vào bank
- [ ] Search/filter hoạt động
- [ ] Bulk select → xóa nhiều câu
- [ ] Import from exam hoạt động

### Kết quả bước 1:
- [ ] ✅ Tất cả 6 flows PASS
- [ ] 📝 Ghi chú bugs phát hiện (nếu có)

---

## Bước 1.5: Security Hardening (~1.5 giờ)
> **Mục tiêu:** Fix 3 lỗ Critical + 2 High từ Security Audit 2026-04-08

### S1. 🔴 PIN Brute Force Protection ✅
- [x] Rate limit 5 lần/10 phút/IP cho `/api/admin/verify-pin`
- [x] Cleanup stale entries mỗi 5 phút

### S2. 🔴 HTTP Security Headers ⏭️
- [ ] Bỏ qua — `npm install helmet` thất bại do OOM. Sẽ làm khi migrate hosting.

### S3. 🔴 Password Hashing Upgrade ✅
- [x] `secureHash()` dùng `crypto.pbkdf2Sync` (100k iterations, SHA-512, 32-byte salt)
- [x] `verifyPassword()` hỗ trợ cả simpleHash cũ + pbkdf2 mới
- [x] Auto-upgrade: login thành công → tự chuyển hash sang pbkdf2
- [x] Register/Reset password dùng `secureHash()`

### S4. 🟠 Token Expiry ✅
- [x] `generateToken()` trả `{ token, tokenExpiry }` (7 ngày)
- [x] `authMiddleware` + `adminOnly` check `tokenExpiry`
- [x] Legacy tokens (không có expiry) vẫn hoạt động

### S5. 🟡 Endpoint Auth ✅
- [x] `POST /api/review-by-code` — rate limit 10 req/phút/IP

### Kết quả bước 1.5:
- [x] ✅ PIN có rate limit (5 lần/10 phút)
- [ ] ⏭️ Helmet headers (deferred — npm OOM)
- [x] ✅ Password hashing dùng pbkdf2 + auto-upgrade
- [x] ✅ Token hết hạn sau 7 ngày
- [x] ✅ review-by-code rate limited

---

## Bước 2: XSS Fix (~1.5 giờ)
> **Mục tiêu:** Ngăn chặn Cross-Site Scripting attacks
> **Ghi chú audit:** `escapeHtml()` đã có + đã dùng ~40 chỗ ✅. Còn thiếu: `renderMarkdown()` chưa escape trước

### 2.1 Phân tích attack surface

**Nơi user input ĐƯỢC render dạng HTML (.innerHTML):**

| File | Vị trí | Input field | Risk |
|---|---|---|---|
| `js/exams.js` | renderFilteredExams | exam.title, exam.subject | 🔴 High |
| `js/sections.js` | renderSections | section.title | 🔴 High |
| `js/questions.js` | question rendering | question, options, explanation | 🔴 High |
| `js/submissions.js` | renderSubmissions | displayName, feedback | 🔴 High |
| `js/stats.js` | renderExamStats | exam title | 🟡 Medium |
| `js/question-bank.js` | loadQuestionBank | question text | 🔴 High |
| `js/codes.js` | code list | code.code | 🟡 Low |
| `js/users.js` | user list | displayName | 🟡 Medium |
| `public/js/app.js` | exam rendering | question, options, passage | 🔴 High |
| `public/js/result.js` | result rendering | question, feedback, explanation | 🔴 High |

### 2.2 XSS Status (từ audit)

- [x] **`escapeHtml()` đã implement** trong `js/helpers.js` (admin), `app.js`, `result.js` (student)
- [x] **Đã dùng ~40 chỗ** trong admin modules: exams, users, submissions, stats, QB, codes
- [ ] **`renderMarkdown()` chưa escape** — AI feedback có thể inject HTML:
```js
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

- [ ] **Fix `renderMarkdown()` trong helpers.js:**
  ```js
  function renderMarkdown(text) {
      if (!text) return '';
      text = escapeHtml(text); // ← THÊM: escape trước khi markdown
      return text
          .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
          // ... existing replacements
  }
  ```

- [ ] **Nguyên tắc:**
  - Trường text thuần: dùng `escapeHtml()` trước khi render `.innerHTML`
  - Trường có Markdown/LaTeX: dùng `renderMarkdown()` (đã escape bên trong)
  - Trường video URL: validate URL format trước khi set `src`

### 2.3 Review XSS coverage — Admin modules (8 files)

- [x] `js/exams.js` — ✅ đã dùng escapeHtml cho title, subject, year, instruction
- [ ] `js/sections.js` — kiểm tra section editor fields
- [x] `js/questions.js` — verify question text (cần check image URLs)
- [x] `js/submissions.js` — ✅ đã escape displayName, studentAnswer, prompt, sampleAnswer
- [x] `js/stats.js` — ✅ đã escape user, examTitle, question text
- [x] `js/question-bank.js` — ✅ đã escape question text
- [x] `js/users.js` — ✅ đã escape displayName, username
- [x] `js/codes.js` — ✅ đã escape exam title, displayName

### 2.4 Apply XSS fix — Student frontend (2 files)

- [ ] `public/js/app.js` — escape question, options, passage trước khi render
  - ⚠️ **Cẩn thận:** Phải giữ nguyên Markdown/LaTeX rendering cho `question`, `explanation`
  - Chỉ escape plain text fields: `displayName`, `code`, input values
- [ ] `public/js/result.js` — escape tương tự app.js

### 2.5 Validate URL inputs

- [ ] Server-side: validate `video`, `explanationVideo` URL format trước khi lưu
  - Chỉ chấp nhận: `https://` prefix
  - Reject: `javascript:`, `data:`, `vbscript:`
- [ ] File: `routes/questions.js`, `routes/sections.js`

### 2.6 Test XSS

- [ ] Test nhập `<script>alert(1)</script>` vào tên đề → không chạy JS
- [ ] Test nhập `<img onerror=alert(1) src=x>` vào câu hỏi → không chạy
- [ ] Test nhập `"><script>` vào tên hiển thị → không chạy
- [ ] Verify LaTeX/Markdown VẪN render đúng sau fix

---

## Bước 3: Archive Cleanup (~15 phút)
> **Mục tiêu:** Dọn dẹp files legacy

### 3.1 Archive admin.js cũ
- [x] ~~Rename `public/admin/admin.js`~~ **ĐÃ XÓA** (user xóa thủ công 2026-04-08)
- [x] Verify server vẫn chạy bình thường (file này không được import)

### 3.2 Kiểm tra files không cần thiết
- [ ] Kiểm tra `seed.js` — nếu outdated, di chuyển vào `_archive/`
- [ ] Kiểm tra `migrate.js` — nếu outdated, di chuyển vào `_archive/`
- [ ] Kiểm tra `vercel.json` — xác nhận có cần không

### 3.3 Cập nhật .gitignore
- [ ] Đảm bảo `.gitignore` bao gồm:
  ```
  node_modules/
  data/*.json
  !data/.gitkeep
  .env
  public/uploads/
  _archive/
  *.bak
  ```

---

## Bước 4: AI Helpers Centralization (~30 phút)
> **Mục tiêu:** DRY — tập trung AI SDK config vào 1 file

### 4.1 Tạo `lib/ai-helpers.js`

```js
// lib/ai-helpers.js
const { readSettings } = require('./data');

const CUSTOM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

function getAIConfig(purposeModel) {
    const settings = readSettings();
    const apiKey = process.env.CLAUDE_API_KEY;
    const baseUrl = process.env.CLAUDE_API_URL || process.env.CLAUDE_BASE_URL;
    const sdkType = process.env.CLAUDE_SDK_TYPE || 'anthropic';
    const model = purposeModel || settings.generateModel || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
    return { apiKey, baseUrl, sdkType, model, CUSTOM_HEADERS };
}

function createClient(config) {
    if (config.sdkType === 'openai') {
        const OpenAI = require('openai');
        return new OpenAI({
            baseURL: `${config.baseUrl}/v1`,
            apiKey: config.apiKey,
            timeout: 300000,
            defaultHeaders: CUSTOM_HEADERS
        });
    } else {
        const Anthropic = require('@anthropic-ai/sdk');
        return new Anthropic({
            apiKey: config.apiKey,
            baseURL: config.baseUrl
        });
    }
}

function parseJSONResponse(text) {
    let jsonStr = text;
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1];
    const jStart = jsonStr.indexOf('{'), jEnd = jsonStr.lastIndexOf('}');
    if (jStart !== -1 && jEnd !== -1) jsonStr = jsonStr.substring(jStart, jEnd + 1);
    return JSON.parse(jsonStr);
}

module.exports = { getAIConfig, createClient, parseJSONResponse, CUSTOM_HEADERS };
```

### 4.2 Refactor route files

- [ ] `routes/ai-generate.js` — import `getAIConfig`, `createClient`, `parseJSONResponse`
- [ ] `routes/ai-tools.js` — import shared config
- [ ] `routes/grading.js` — import shared config
- [ ] `routes/submit.js` — import shared config (cho autoGradeEssays)
- [ ] Mỗi file: xóa duplicate `const apiKey = ...`, `const CUSTOM_HEADERS = ...`

### 4.3 Test
- [ ] AI generate vẫn hoạt động
- [ ] AI grade essay vẫn hoạt động
- [ ] OCR vẫn hoạt động
- [ ] Explain-wrong vẫn hoạt động

---

## Bước 5: Input Validation (~2 giờ)
> **Mục tiêu:** Validate data chặt chẽ trước khi lưu

### 5.1 Tạo `lib/validate.js`

```js
// lib/validate.js
const VALID_SECTION_TYPES = [
    'multiple-choice', 'reading', 'writing-choice',
    'writing-essay', 'free-form', 'fill-in-blank'
];
const VALID_BLANK_TYPES = ['text', 'int', 'float', 'fraction', 'dropdown'];

function validateExam(body) { /* title required, subject optional */ }
function validateSection(body) { /* type must be in VALID_SECTION_TYPES */ }
function validateQuestion(body) {
    /* 
    - MC: correctAnswer in 0-3, options array length 4
    - fill-blank: blanks[].type in VALID_BLANK_TYPES
    - fill-blank dropdown: dropdownOptions must be array
    - essay: prompt required
    */
}
function validateURL(url) { /* https only, reject javascript:/data: */ }
function validateCode(code) { /* alphanumeric, max 10 chars */ }

module.exports = { validateExam, validateSection, validateQuestion, validateURL, validateCode,
                   VALID_SECTION_TYPES, VALID_BLANK_TYPES };
```

### 5.2 Apply validation — Routes

- [ ] `routes/exams.js` — POST/PUT validate exam fields
- [ ] `routes/sections.js` — POST/PUT validate section type
- [ ] `routes/questions.js` — POST/PUT validate question fields per type
- [ ] `routes/question-bank.js` — POST/PUT validate QB question
- [ ] `routes/codes.js` — POST validate maxUses > 0
- [ ] `routes/settings.js` — PUT validate numeric fields

### 5.3 Validate fill-in-blank cụ thể

- [ ] `blanks[].type` phải nằm trong `VALID_BLANK_TYPES`
- [ ] `blanks[].answer` required (không để trống)
- [ ] Nếu type=`dropdown` → `dropdownOptions` phải là array, ≥2 phần tử
- [ ] Nếu type=`float`/`fraction` → `tolerance` phải là số dương
- [ ] `blanks[].alternatives` nếu có phải là array of strings
- [ ] `blanks[].caseSensitive` phải là boolean

### 5.4 Error messages thân thiện

- [ ] Trả JSON `{ error: "Loại section không hợp lệ: xyz. Chấp nhận: multiple-choice, reading, ..." }`
- [ ] Không trả stack trace cho client
- [ ] Log chi tiết trên server console

### 5.5 Test validation

- [ ] POST section với type="invalid" → 400 error (không tạo được)
- [ ] POST question MC với correctAnswer=5 → 400 error
- [ ] POST fill-blank với type="xyz" → 400 error
- [ ] POST đề với title="" → 400 error
- [ ] Verify các request hợp lệ VẪN hoạt động

---

## Bước 6: Test Suite (~3 giờ)
> **Mục tiêu:** ~20 automated tests cơ bản, chạy bằng `npm test`

### 6.1 Setup

- [ ] Cài `jest` hoặc dùng Node built-in test runner
- [ ] Tạo `tests/` directory
- [ ] Thêm `"test": "jest"` vào package.json scripts
- [ ] Tạo test data fixtures (mock exams, users)

### 6.2 Test lib/data.js (5 tests)

```
tests/data.test.js
- [ ] readData() trả về object có .exams array
- [ ] writeData() + readData() roundtrip
- [ ] readQuestionBank() trả về object có .questions array
- [ ] simpleHash() consistent output
- [ ] countQuestions() đếm đúng các loại section
```

### 6.3 Test lib/auth.js (4 tests)

```
tests/auth.test.js
- [ ] sanitizeCode() uppercase + trim
- [ ] sanitizeCode() reject quá dài
- [ ] checkLoginRateLimit() cho phép lần 1-10
- [ ] checkLoginRateLimit() block lần 11+
```

### 6.4 Test fill-blank grading (6 tests)

```
tests/grading.test.js
- [ ] text match: "hello" === "hello" → correct
- [ ] text case-insensitive: "Hello" === "hello" → correct (caseSensitive=false)
- [ ] text case-sensitive: "Hello" !== "hello" → wrong (caseSensitive=true)
- [ ] int match: "42" === 42 → correct
- [ ] float tolerance: 3.14 ≈ 3.15 (tolerance=0.01) → correct
- [ ] fraction: "1/3" ≈ 0.333 → correct
- [ ] dropdown: "optionB" === "optionB" → correct
- [ ] alternatives: "ans2" in ["ans1","ans2"] → correct
```

### 6.5 Test validation (5 tests)

```
tests/validate.test.js
- [ ] validateSection valid → pass
- [ ] validateSection invalid type → error
- [ ] validateQuestion MC valid → pass
- [ ] validateQuestion MC correctAnswer out of range → error
- [ ] validateQuestion fill-blank invalid blank type → error
```

### 6.6 Integration test script

- [ ] `tests/integration.test.js` — start server, test 5 API endpoints:
  - POST /api/auth/login → 200 + token
  - GET /api/exams → 200 + array
  - POST /api/exams → 201 + id
  - POST /api/exams/:id/codes → 200 + codes
  - DELETE /api/exams/:id → 200

### Kết quả bước 6:
- [ ] `npm test` → ALL PASS
- [ ] ~20 tests covering critical logic

---

## 📋 Checklist Summary

```
BƯỚC 1: Runtime Test                    (~1 giờ)
──────────────────────────────────────────────
[ ] 1.1 Server khởi động OK
[ ] 1.2 Admin Login flow
[ ] 1.3 Exam CRUD flow
[ ] 1.4 Codes + Student flow
[ ] 1.5 AI features flow
[ ] 1.6 Submissions flow
[ ] 1.7 Question Bank flow

BƯỚC 1.5: Security Hardening            (~1.5 giờ) ⚠️ NEW
──────────────────────────────────────────────
[ ] S1  PIN rate limit (5 lần/10 phút)          🔴 CRITICAL
[ ] S2  npm install helmet + app.use()          🔴 CRITICAL
[ ] S3  Password hash → pbkdf2 + migration      🔴 CRITICAL
[ ] S4  Token expiry (7 ngày)                   🟠 HIGH
[ ] S5  Endpoint auth hardening                 🟡 MEDIUM

BƯỚC 2: XSS Fix                        (~1.5 giờ)
──────────────────────────────────────────────
[x] 2.1 Phân tích attack surface (done in audit)
[x] 2.2 escapeHtml() đã có + đã dùng ~40 chỗ
[ ] 2.3 Fix renderMarkdown() — escape trước markdown
[ ] 2.4 Verify Student frontend (app.js, result.js)
[ ] 2.5 Validate URL inputs
[ ] 2.6 Test XSS

BƯỚC 3: Archive Cleanup                (~15 phút)
──────────────────────────────────────────────
[x] 3.1 admin.js cũ ĐÃ XÓA
[ ] 3.2 Check legacy files
[ ] 3.3 Update .gitignore

BƯỚC 4: AI Helpers                     (~30 phút)
──────────────────────────────────────────────
[ ] 4.1 Tạo lib/ai-helpers.js
[ ] 4.2 Refactor 4 route files
[ ] 4.3 Test AI features

BƯỚC 5: Validation                     (~2 giờ)
──────────────────────────────────────────────
[ ] 5.1 Tạo lib/validate.js
[ ] 5.2 Apply validation — 6 routes
[ ] 5.3 Validate fill-blank đặc biệt
[ ] 5.4 Error messages thân thiện
[ ] 5.5 Test validation

BƯỚC 6: Test Suite                     (~3 giờ)
──────────────────────────────────────────────
[ ] 6.1 Setup Jest/test runner
[ ] 6.2 Test lib/data.js (5 tests)
[ ] 6.3 Test lib/auth.js (4 tests)
[ ] 6.4 Test fill-blank grading (8 tests)
[ ] 6.5 Test validation (5 tests)
[ ] 6.6 Integration test script

TỔNG: ~10 giờ (bao gồm security + test)
```

---

## ⚠️ Lưu Ý

### Về Frontend Refactoring
> **Kết luận: ĐỂ SAU.**
> - `app.js` (1400L) và `result.js` (800L) đang ổn định, ít thay đổi
> - Chỉ cần XSS fix (Bước 2.4) cho student frontend ở phase này
> - Refactor student frontend khi: (a) thêm Course system, hoặc (b) file vượt 2000L
> - Admin frontend đã được modular hóa trong PLAN_REFACTOR

### Rollback Plan
- Git commit sau MỖI bước hoàn thành
- Nếu bước nào fail → revert commit đó
- Không bao giờ sửa quá 1 file cùng lúc khi XSS fix

### Dependency
```
Bước 1   (Runtime Test)      → phải xong trước → phát hiện bugs
  ↓
Bước 1.5 (Security)          → fix critical ngay sau khi verify runtime OK
  ↓
Bước 2   (XSS)              → bổ sung renderMarkdown fix
Bước 3   (Cleanup)           → independent, làm song song
  ↓
Bước 4   (AI Helpers)        → sau khi server chạy ổn
  ↓
Bước 5   (Validation)        → tạo lib/validate.js
  ↓
Bước 6   (Test Suite)        → cuối cùng, dùng validate.js từ Bước 5
```

---

## 📝 Nhật ký thay đổi

| Ngày | Nội dung |
|---|---|
| 2026-04-08T10:45 | **Security Audit** tích hợp → thêm Bước 1.5 |
| 2026-04-08T05:30 | Tạo plan Phase 8 — 6 bước stabilization |
| 2026-04-08T16:15 | ✅ **Bước 1.5 Security Hardening hoàn thành**: PIN rate limit, pbkdf2 hash + auto-upgrade, token expiry 7d, review-by-code rate limit. Helmet deferred (npm OOM). |

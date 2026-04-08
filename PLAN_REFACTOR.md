# 🔧 PLAN REFACTOR — Tách File Sau Phase 7

> **Ngày tạo:** 2026-04-07 | **Cập nhật:** 2026-04-08  
> **Mục tiêu:** Tách server.js (2378L) và admin.js (2629L) thành modules nhỏ  
> **Thời điểm:** Phase 7 ĐÃ HOÀN THÀNH — sẵn sàng bắt đầu  
> **Ước tính:** ~6 giờ (bao gồm test)  
> **Rủi ro:** Thấp — chỉ di chuyển code, không viết mới  
> **Trạng thái:** ✅ P1+P2 HOÀN THÀNH — server.js (2378→113L), admin.js (2629→16 modules). P3: PROJECT.md ✅, workflow ⏳

---

## Nguyên Tắc

1. **KHÔNG đổi tech stack** — giữ Express + vanilla JS
2. **KHÔNG thay đổi logic** — chỉ cut/paste + add require/module.exports
3. **KHÔNG đổi API endpoints** — mọi URL giữ nguyên
4. **Test sau mỗi file tách** — chạy server, click qua admin để verify (user admin | pass thinh123@@)
5. **Git commit sau mỗi bước** — dễ rollback nếu lỗi

---

## PHẦN 1: Tách server.js → routes/ + lib/

### Cấu trúc mới

```
[TracNghiemWeb]/
├── server.js              ← ~90 dòng (entry point, middleware, mount)
├── lib/
│   ├── data.js            ← read/write JSON helpers (exams, users, subjects, QB, settings)
│   ├── auth.js            ← middleware + rate limit + token
│   ├── ai-helpers.js      ← shared SDK init, headers, prompts
│   └── backup.js          ← daily auto-backup
├── routes/
│   ├── auth.js            ← register, login, me
│   ├── users.js           ← CRUD users (GET list in auth → move here)
│   ├── subjects.js        ← CRUD subjects
│   ├── exams.js           ← CRUD exams + duplicate + copy-section + export/import
│   ├── sections.js        ← CRUD sections
│   ├── questions.js       ← CRUD questions (in-exam)
│   ├── question-bank.js   ← 🆕 QB CRUD + import-from-exam + generate-exam
│   ├── codes.js           ← access codes + verify + release + preview + cancel
│   ├── submit.js          ← code-result, open-result, upload-submission, review-by-code
│   ├── grading.js         ← submissions list, review, AI grade essay
│   ├── ai-generate.js     ← AI exam generation + AI extract QB + cache recovery
│   ├── ai-tools.js        ← OCR + explain-wrong
│   ├── media.js           ← upload images
│   ├── stats.js           ← exam stats + CSV export + code-logs
│   ├── settings.js        ← settings + site-info
│   └── history.js         ← exam history + admin PIN verify
└── public/ (không đổi)
```

### Bước 1: Tạo lib/data.js
**Source:** server.js lines 1-27 (requires), 39-103 (helpers)

```js
// lib/data.js
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'exams.json');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const SUBJECTS_FILE = path.join(__dirname, '..', 'data', 'subjects.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');
const QUESTIONS_FILE = path.join(__dirname, '..', 'data', 'questions.json');

function readData() { /* copy từ server.js L39-47 */ }
function writeData(data) { /* L49 */ }
function readUsers() { /* L51-56 */ }
function writeUsers(data) { /* L58 */ }
function readSubjects() { /* L60-65 */ }
function writeSubjects(data) { /* L67 */ }
function readQuestionBank() { /* L70-75 */ }
function writeQuestionBank(data) { /* L76 */ }
function readSettings() { /* L78-83 */ }
function writeSettings(data) { /* L85 */ }
function simpleHash(str) { /* L87-91 */ }
function generateToken(userId) { /* L93-95 */ }
function countQuestions(exam) { /* L97-103 */ }

module.exports = {
    readData, writeData, readUsers, writeUsers,
    readSubjects, writeSubjects, readQuestionBank, writeQuestionBank,
    readSettings, writeSettings,
    simpleHash, generateToken, countQuestions, uuidv4,
    DATA_FILE, USERS_FILE, SUBJECTS_FILE, SETTINGS_FILE, QUESTIONS_FILE
};
```

- [ ] Tạo file `lib/data.js`
- [ ] Copy functions: `readData`, `writeData`, `readUsers`, `writeUsers`, `readSubjects`, `writeSubjects`, `readQuestionBank`, `writeQuestionBank`, `readSettings`, `writeSettings`, `simpleHash`, `generateToken`, `countQuestions`
- [ ] Thêm `module.exports`
- [ ] Cập nhật paths (dùng `__dirname + '/...'`)

### Bước 2: Tạo lib/auth.js
**Source:** server.js lines 105-153 (sanitize, rate limit, middleware)

```js
// lib/auth.js
const { readUsers, generateToken, simpleHash } = require('./data');

function sanitizeCode(raw) { /* L105-111 */ }
const _loginAttempts = new Map();
const LOGIN_MAX = 10;
function checkLoginRateLimit(ip) { /* L115-125 */ }
// Cleanup interval: L126-130
function authMiddleware(req, res, next) { /* L131-142 */ }
function adminOnly(req, res, next) { /* L144-153 */ }

module.exports = { sanitizeCode, checkLoginRateLimit, authMiddleware, adminOnly };
```

- [ ] Tạo file `lib/auth.js`
- [ ] Copy: `sanitizeCode`, `checkLoginRateLimit`, `_loginAttempts`, `LOGIN_MAX`, `authMiddleware`, `adminOnly`
- [ ] Thêm interval cleanup logic (L126-130)

### Bước 3: Tạo lib/ai-helpers.js
**Source:** Trích từ nhiều nơi trong server.js — shared AI config

```js
// lib/ai-helpers.js
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { readSettings } = require('./data');

const CUSTOM_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

function getAIConfig(reqSdkType, reqModel, purpose = 'generate') {
    const baseUrl = process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com';
    const sdkType = reqSdkType || (baseUrl.includes('openai') ? 'openai' : 'anthropic');
    const settings = readSettings();
    const modelKey = purpose === 'grade' ? 'gradeModel'
                   : purpose === 'ocr' ? 'ocrModel' : 'generateModel';
    const model = reqModel || settings[modelKey] || process.env.CLAUDE_MODEL || 'claude-sonnet-4.6';
    const apiKey = process.env.CLAUDE_API_KEY;
    return { baseUrl, sdkType, model, apiKey, CUSTOM_HEADERS };
}

async function imageToBase64(filePath) { /* resize + convert */ }

module.exports = { getAIConfig, imageToBase64, CUSTOM_HEADERS };
```

- [ ] Tạo file `lib/ai-helpers.js`
- [ ] Trích helper: SDK config, headers, image processing
- [ ] Export `getAIConfig()` để tất cả route AI dùng chung

### Bước 4: Tạo route files (từng file một)

**Thứ tự tách (dễ → khó, ít dependency → nhiều dependency):**

#### 4a. routes/subjects.js (~30 dòng)
**Source:** server.js lines 245-274

- [ ] Tạo file, copy 3 routes: GET/POST/DELETE /api/subjects
- [ ] `require('../lib/data')` + `require('../lib/auth')`
- [ ] server.js: `app.use('/api/subjects', require('./routes/subjects'))`
- [ ] **TEST:** Admin tab Môn học vẫn hoạt động

#### 4b. routes/settings.js (~40 dòng)
**Source:** server.js lines 1715-1737

- [ ] Copy: GET/PUT /api/settings, GET /api/site-info
- [ ] **TEST:** Admin tab Cài đặt vẫn lưu/load

#### 4c. routes/users.js (~50 dòng)
**Source:** server.js lines 203-244 (GET list at ~203, PUT/DELETE ~211-244)

- [ ] Copy: GET/PUT/DELETE /api/users
- [ ] **TEST:** Admin tab Tài khoản vẫn hoạt động

#### 4d. routes/auth.js (~80 dòng)
**Source:** server.js lines 154-210

- [ ] Copy: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
- [ ] **TEST:** Đăng nhập admin + student vẫn hoạt động

#### 4e. routes/exams.js (~180 dòng)
**Source:** server.js lines 410-497 (CRUD), 1020-1057 (export/import), 2189-2251 (duplicate, copy-section)

- [ ] Copy: GET/POST/PUT/DELETE /api/exams, export, import, export-all, duplicate, copy-section
- [ ] **TEST:** Danh sách đề, tạo/sửa/xóa đề, nhân bản, export/import

#### 4f. routes/sections.js (~50 dòng)
**Source:** server.js lines 498-541

- [ ] Copy: POST/PUT/DELETE sections
- [ ] Mount at `/api/exams` (nested route)
- [ ] **TEST:** Thêm/sửa/xóa section

#### 4g. routes/questions.js (~60 dòng)
**Source:** server.js lines 542-597

- [ ] Copy: POST/PUT/DELETE questions (in-exam)
- [ ] **TEST:** Thêm/sửa/xóa câu hỏi

#### 4h. routes/question-bank.js 🆕 (~130 dòng)
**Source:** server.js lines 275-404

- [ ] Copy: GET/POST/PUT/DELETE /api/admin/questions
- [ ] Copy: POST /api/admin/questions/import-from-exam
- [ ] Copy: POST /api/admin/questions/generate-exam
- [ ] Mount: `app.use('/api/admin', require('./routes/question-bank'))`
- [ ] **TEST:** Tab Ngân hàng câu hỏi, import từ đề, tạo đề từ bank

#### 4i. routes/codes.js (~200 dòng)
**Source:** server.js lines 598-746 (codes, verify, cancel, preview, preview-code), 1738-1757 (release)

- [ ] Copy: POST codes, DELETE code, verify-code, cancel-code, preview, preview-code, release-code
- [ ] **TEST:** Tạo mã, nhập mã, QR scan, giải phóng mã, preview admin

#### 4j. routes/submit.js (~280 dòng) ⚠️
**Source:** server.js lines 751-991 (code-result + fill-blank grading + essay AI), 992-1019 (review-by-code), 1758-1801 (upload-submission), 1891-1921 (open-result)

- [ ] Copy: code-result (bao gồm fill-blank grading + essay background AI), upload-submission, open-result, review-by-code, my-grades
- [ ] **ĐÂY LÀ FILE PHỨC TẠP NHẤT** — chứa cả auto-grade logic + fraction/float eval
- [ ] **TEST:** Nộp bài → fill-blank chấm → essay AI chấm background

#### 4k. routes/grading.js (~200 dòng)
**Source:** server.js lines 1802-1891 (submissions list), 1922-1950 (review), 1951-2065 (AI grade essay)

- [ ] Copy: GET submissions, POST review, POST ai-grade-essay
- [ ] **TEST:** Tab Bài nộp, chấm thủ công, AI chấm lại

#### 4l. routes/ai-generate.js (~500 dòng) ⚠️ Lớn nhất
**Source:** server.js lines 1152-1545 (ai-generate), 1546-1656 (ai-extract-questions), 1657-1681 (ai-last-result)

- [ ] Copy: POST ai-generate, POST ai-extract-questions, GET ai-last-result
- [ ] `SUBJECT_PROMPTS`, system prompt, file processing, retry logic, image crop
- [ ] Shared: `aiUpload` multer instance (used by both generate & extract)
- [ ] **TEST:** Upload PDF → tạo đề AI → preview → import; AI extract QB

#### 4m. routes/ai-tools.js (~170 dòng)
**Source:** server.js lines 1083-1151 (OCR), 2252-2337 (explain-wrong)

- [ ] Copy: ocrUpload + POST /api/admin/ocr, POST explain-wrong
- [ ] **TEST:** Paste ảnh OCR, nút "Tại sao sai?"

#### 4n. routes/media.js (~30 dòng)
**Source:** server.js lines 1058-1082

- [ ] Copy: multer config + POST /api/upload
- [ ] **TEST:** Upload ảnh câu hỏi

#### 4o. routes/stats.js (~130 dòng)
**Source:** server.js lines 2065-2092 (code-logs), 2093-2134 (CSV export), 2135-2189 (exam stats)

- [ ] Copy: GET code-logs, GET export CSV, GET exam stats
- [ ] **TEST:** Tab Mã kích hoạt, xuất CSV, xem thống kê

#### 4p. routes/history.js (~50 dòng)
**Source:** server.js lines 1682-1714

- [ ] Copy: POST /api/history, POST /api/admin/verify-pin
- [ ] **TEST:** Lịch sử làm bài, nhập PIN admin

### Bước 5: Tạo server.js mới (~80 dòng)

```js
// server.js — Entry Point
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use((req, res, next) => {
    express.json({ limit: '10mb' })(req, res, (err) => {
        if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu quá lớn' });
        if (err) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        next();
    });
});
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/exams', require('./routes/sections'));
app.use('/api/exams', require('./routes/questions'));
app.use('/api/exams', require('./routes/codes'));
app.use('/api/exams', require('./routes/submit'));
app.use('/api', require('./routes/media'));
app.use('/api', require('./routes/history'));
app.use('/api/admin', require('./routes/question-bank'));  // 🆕
app.use('/api/admin', require('./routes/grading'));
app.use('/api/admin', require('./routes/ai-generate'));     // includes ai-extract
app.use('/api/admin', require('./routes/ai-tools'));
app.use('/api', require('./routes/settings'));
app.use('/api', require('./routes/stats'));

// SPA fallback
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

// Global error handler
app.use((err, req, res, next) => {
    console.error('❌ Unhandled:', err.message);
    res.status(500).json({ error: 'Lỗi hệ thống' });
});

// Start
app.listen(PORT, () => {
    console.log(`\n  🚀 EasyRevise Server at http://localhost:${PORT}\n`);
    require('./lib/backup').startDailyBackup();
});
```

- [ ] Tạo server.js mới
- [ ] Verify tất cả routes mounted đúng
- [ ] **TEST TOÀN BỘ:** Login, tạo đề, AI generate, nộp bài, chấm điểm

---

## PHẦN 2: Tách admin.js → modules

### Cấu trúc mới

```
public/admin/
├── index.html             ← thêm <script> tags
├── admin.js               ← ~80 dòng (auth, tabs, state variables)
└── js/
    ├── helpers.js          ← api(), renderMarkdown, openModal, closeModal, customConfirm
    ├── exams.js            ← loadExamList, openExamEditor, saveExam, deleteExam, duplicate, copySection, renderFilteredExams
    ├── sections.js         ← openSectionEditor, saveSection, toggleSectionType, drag-drop handlers
    ├── questions.js        ← showAddQuestionModal, editQuestion, saveQuestion, fill-blank, images, OCR, LaTeX toolbar
    ├── print.js            🆕 ← printExam, doPrintExam, previewExam
    ├── codes.js            ← showCodeManager, generateCodes, deleteCode, releaseCode, QR
    ├── users.js            ← loadUsers, createUser, deleteUser
    ├── subjects.js         ← loadSubjects, saveSubject, deleteSubject
    ├── settings.js         ← loadSettings, saveSettings
    ├── ai-gen.js           ← AI tab, renderAIPreview, importAIExam, NotificationManager, recoverAIResult
    ├── submissions.js      ← loadSubmissions, renderSubmissions, review, aiGradeEssay
    ├── stats.js            ← loadExamStats, loadCodeLogs, exportCSV, renderExamStats
    ├── question-bank.js    🆕 ← loadQuestionBank, deleteQBQuestion, importFromExam, generateFromBank, bulkActions
    └── ai-extract.js       🆕 ← showAIExtractModal, doAIExtract, importExtractedQuestions
```

### Bước 6: Tạo public/admin/js/helpers.js
**Source:** admin.js lines 5-16 (renderMarkdown), 17-22 (state vars), 113-121 (api), 198-229 (view/modal helpers), 474-497 (customConfirm)

- [ ] Copy: `renderMarkdown`, `api()`, `showView`, `closeModal`, `openModal`, `customConfirm`
- [ ] Đặt shared state vars ở đây: `adminToken`, `adminUser`, `currentExamId`, `currentSectionId`, `currentExamData`, `editingQuestionId`, `editingSectionId`, `editingExamId`, `currentSectionType`, `questionImageUrl`, `fillBlanks`, `questionImages`, `optionImages`, `explanationImages`, `explanationImageUrl`

### Bước 7: Tạo từng module file

**Thứ tự:**

| # | File | Source lines (admin.js) | Functions chính |
|---|---|---|---|
| 7a | `js/exams.js` | 230-321, 446-472 | `loadExamList`, `renderFilteredExams`, `openExamEditor`, `countQ`, `getTypeBadge`, `renderSections`, `saveExam`, `deleteExam`, `exportExam`, `duplicateExam`, `copySectionTo`, `loadSubjectOptions` |
| 7b | `js/sections.js` | 360-398, 402-444, 683-722 | `renderSections` (drag part), `onSectionDrag*`, `onSectionDrop`, `openSectionEditor`, `showAddSectionModal`, `showEditSectionModal`, `toggleSectionType`, `saveSection`, `deleteSection` |
| 7c | `js/questions.js` | 724-1082, 1202-1291 | `showAddQuestionModal`, `editQuestion`, `renderBlankAnswers`, `addBlankAnswer`, `removeBlankAnswer`, `saveQuestion`, `deleteQuestion`, all image helpers, paste handler, `injectLatexToolbar`, `insertLatex` |
| 7d | `js/print.js` 🆕 | 513-681 | `printExam`, `doPrintExam`, `previewExam` |
| 7e | `js/codes.js` | 1086-1200 | `showCodeManager`, `toggleRequireCode`, `generateCodes`, `deleteCode`, `releaseCode`, `showQRCode`, `downloadQRCode` |
| 7f | `js/users.js` | 1293-1366 | `loadUsers`, `showCreateUserModal`, `showEditUserModal`, `saveUser`, `toggleRole`, `resetPw`, `deleteUser` |
| 7g | `js/subjects.js` | 1368-1393 | `loadSubjects`, `showAddSubjectModal`, `saveSubject`, `deleteSubject` |
| 7h | `js/settings.js` | 1712-1742 | `loadSettings`, `saveSettings` |
| 7i | `js/ai-gen.js` | 1743-2169, 2170-2355 | `handleAIFiles`, `removeAIFile`, `renderAIFileList`, `generateWithAI`, `recoverAIResult`, `renderAIPreview`, `deleteAIQuestion`, `deleteAISection`, `editAIQuestion`, `saveAIQuestion`, `importAIResult`, `regenerateAI`, `downloadAIJSON`, `NotificationManager`, visibility change handler |
| 7j | `js/submissions.js` | 1445-1616 | `loadSubmissions`, `exportSubmissionsCSV`, `renderSubmissions`, `aiGradeEssay`, `reviewSubmission` |
| 7k | `js/stats.js` | 1395-1443, 1619-1710 | `loadCodeLogs`, `loadExamStats`, `renderExamStats` |
| 7l | `js/question-bank.js` 🆕 | 2355-2530 | `loadQuestionBank`, `toggleQBCheckAll`, `getSelectedQBIds`, `deleteQBQuestion`, `showImportFromExamModal`, `doImportFromExam`, `showGenerateExamFromBankModal`, `doGenerateExamFromBank`, `updateBulkToolbar`, `bulkDeleteQuestions` |
| 7m | `js/ai-extract.js` 🆕 | 2531-2629 | `showAIExtractModal`, `doAIExtract`, `importExtractedQuestions` |

### Bước 8: Cập nhật index.html

```html
<!-- Load order matters — helpers first, then modules, then entry -->
<script src="js/helpers.js"></script>
<script src="js/exams.js"></script>
<script src="js/sections.js"></script>
<script src="js/questions.js"></script>
<script src="js/print.js"></script>
<script src="js/codes.js"></script>
<script src="js/users.js"></script>
<script src="js/subjects.js"></script>
<script src="js/settings.js"></script>
<script src="js/ai-gen.js"></script>
<script src="js/submissions.js"></script>
<script src="js/stats.js"></script>
<script src="js/question-bank.js"></script>
<script src="js/ai-extract.js"></script>
<script src="admin.js"></script>
```

- [ ] Thêm `<script>` tags theo đúng thứ tự
- [ ] **TEST TOÀN BỘ admin panel**

---

## PHẦN 3: Cập nhật documentation

### Bước 9: Cập nhật PROJECT.md

- [ ] Cập nhật "Cây thư mục" với cấu trúc routes/ + lib/ + public/admin/js/
- [ ] Cập nhật file sizes
- [ ] Xóa server.js line map cũ (không còn ý nghĩa)
- [ ] Thêm bảng route → file mapping

### Bước 10: Cập nhật workflow

- [ ] Cập nhật `.agents/workflows/easyrevise.md` với cấu trúc mới
- [ ] Ghi chú: khi thêm route mới → tạo file trong `routes/`
- [ ] Ghi chú: khi thêm admin tab → tạo file trong `public/admin/js/`

---

## 📋 Checklist Summary

```
PHẦN 1: server.js (2378L) → routes/ + lib/
──────────────────────────────────
[ ] Bước 1: lib/data.js           (~10 phút) — L39-103
[ ] Bước 2: lib/auth.js           (~5 phút)  — L105-153
[ ] Bước 3: lib/ai-helpers.js     (~10 phút) — trích shared AI config
[ ] Bước 4a: routes/subjects.js   (~5 phút)  — L245-274
[ ] Bước 4b: routes/settings.js   (~5 phút)  — L1715-1737
[ ] Bước 4c: routes/users.js      (~5 phút)  — L203-244
[ ] Bước 4d: routes/auth.js       (~10 phút) — L154-210
[ ] Bước 4e: routes/exams.js      (~15 phút) — L410-497, L1020-1057, L2189-2251
[ ] Bước 4f: routes/sections.js   (~5 phút)  — L498-541
[ ] Bước 4g: routes/questions.js  (~5 phút)  — L542-597
[ ] Bước 4h: routes/question-bank (~10 phút) — L275-404 🆕
[ ] Bước 4i: routes/codes.js      (~15 phút) — L598-746, L1738-1757
[ ] Bước 4j: routes/submit.js     (~20 phút) — L751-1019, L1758-1801, L1891-1921 ⚠️
[ ] Bước 4k: routes/grading.js    (~15 phút) — L1802-1891, L1922-2065
[ ] Bước 4l: routes/ai-generate   (~25 phút) — L1152-1681 ⚠️ (includes ai-extract)
[ ] Bước 4m: routes/ai-tools.js   (~10 phút) — L1083-1151, L2252-2337
[ ] Bước 4n: routes/media.js      (~5 phút)  — L1058-1082
[ ] Bước 4o: routes/stats.js      (~10 phút) — L2065-2189
[ ] Bước 4p: routes/history.js    (~5 phút)  — L1682-1714
[ ] Bước 5: server.js entry point (~15 phút)
[ ] *** TEST BACKEND ***           (~15 phút)

PHẦN 2: admin.js (2629L) → modules
────────────────────────────
[ ] Bước 6: js/helpers.js          (~10 phút) — state vars + utils
[ ] Bước 7a: js/exams.js           (~10 phút)
[ ] Bước 7b: js/sections.js        (~10 phút)
[ ] Bước 7c: js/questions.js       (~15 phút) ⚠️
[ ] Bước 7d: js/print.js           (~10 phút) 🆕
[ ] Bước 7e: js/codes.js           (~10 phút)
[ ] Bước 7f: js/users.js           (~5 phút)
[ ] Bước 7g: js/subjects.js        (~5 phút)
[ ] Bước 7h: js/settings.js        (~5 phút)
[ ] Bước 7i: js/ai-gen.js          (~15 phút) ⚠️
[ ] Bước 7j: js/submissions.js     (~10 phút)
[ ] Bước 7k: js/stats.js           (~10 phút)
[ ] Bước 7l: js/question-bank.js   (~10 phút) 🆕
[ ] Bước 7m: js/ai-extract.js      (~5 phút) 🆕
[ ] Bước 8: index.html update      (~5 phút)
[ ] *** TEST ADMIN PANEL ***        (~20 phút)

PHẦN 3: Documentation
──────────────────────
[ ] Bước 9: PROJECT.md update      (~10 phút)
[ ] Bước 10: Workflow update       (~5 phút)

TỔNG: ~6 giờ (bao gồm test)
```

---

## ⚠️ Lưu Ý Quan Trọng

### Shared State (admin.js)
Các biến sau được dùng CROSS-MODULE — đặt trong `helpers.js`:
```js
let adminToken = localStorage.getItem('easyrevise_token');
let adminUser = null;
let currentExamId = null;
let currentSectionId = null;
let currentExamData = null;
let editingQuestionId = null;
let editingSectionId = null;
let editingExamId = null;
let currentSectionType = 'multiple-choice';
let questionImageUrl = null;
let fillBlanks = [];
let questionImages = [];
let optionImages = [null, null, null, null];
let explanationImages = [];
let explanationImageUrl = null;
// Additional cross-module vars:
let _allExams = [];           // exam list cache
let _dragSectionIdx = null;   // drag-drop state
let _editingUserId = null;    // user edit state
let aiSelectedFiles = [];     // AI gen file list
let aiGeneratedData = null;   // AI gen result
let _aiGenerating = false;    // AI gen in-progress flag
let _qbPage = 1;              // question bank pagination
let _extractedQuestions = []; // AI extract result
```

### Route Mounting Order
Express match theo thứ tự → mount specific routes trước generic:
```js
// ĐÚng: specific trước
app.use('/api/admin', require('./routes/grading'));
app.use('/api/admin', require('./routes/ai-generate'));

// routes/exams.js handles: /api/exams/:id
// routes/codes.js handles: /api/exams/:id/codes, /api/exams/:id/verify-code
// → Cả hai mount at /api/exams — OK vì path khác nhau
```

### Rollback Plan
Nếu gặp lỗi nghiêm trọng:
```bash
git stash       # lưu tạm thay đổi
git checkout .   # quay về bản gốc
# Hoặc:
git checkout -b refactor-backup  # branch backup trước khi tách
```

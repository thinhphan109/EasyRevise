# EasyRevise — Project Documentation

> **⚠️ FILE NÀY ĐƯỢC TỰ ĐỘNG CẬP NHẬT BỞI AI AGENT**
> Mỗi khi có thay đổi code, agent PHẢI cập nhật file này.
> Last updated: 2026-04-08T05:00+07:00

---

## 📋 Overview
Hệ thống ôn tập & kiểm tra trực tuyến với AI tạo đề thi tự động.
Hỗ trợ nhiều loại đề: trắc nghiệm, đọc hiểu, viết, tự luận.
Có hệ thống mã kích hoạt (access code) cho từng đề thi.

## 🏗️ Architecture

### Tech Stack
- **Runtime**: Node.js v22.14.0
- **Backend**: Express.js 4.18.2
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Data Storage**: JSON files (no database)
- **AI SDKs**: @anthropic-ai/sdk 0.80.0 + openai 6.32.0 → TrollLLM proxy
- **Image Processing**: sharp 0.34.5
- **File Upload**: multer 2.1.1
- **PDF Parse**: pdf-parse 2.4.5
- **DOCX Parse**: mammoth 1.12.0
- **ID Generator**: uuid 9.0.0

### File Structure (Modular Architecture — post-refactor 2026-04-08)
```
EasyRevise/
├── server.js              # Entry point — 113 lines (middleware + route mounting)
├── .env                   # API keys, SDK config
├── package.json           # Dependencies
│
├── lib/                   # 🆕 Shared backend modules
│   ├── data.js            # read/write JSON helpers (82L)
│   ├── auth.js            # middleware + rate limit + token (52L)
│   └── backup.js          # daily auto-backup (34L)
│
├── routes/                # 🆕 Express Router modules (17 files, 2225L total)
│   ├── auth.js            # register, login, me (53L)
│   ├── users.js           # CRUD users (53L)
│   ├── subjects.js        # CRUD subjects (39L)
│   ├── exams.js           # CRUD exams + export/import (132L)
│   ├── exams-admin.js     # duplicate + copy-section (63L)
│   ├── sections.js        # CRUD sections (52L)
│   ├── questions.js       # CRUD questions in-exam (66L)
│   ├── question-bank.js   # QB CRUD + import + generate (142L)
│   ├── codes.js           # access codes + verify + release (161L)
│   ├── submit.js          # code-result + grading + upload (328L)
│   ├── grading.js         # admin submissions + review + AI grade (236L)
│   ├── ai-generate.js     # AI exam gen + extract QB + cache (508L)
│   ├── ai-tools.js        # OCR + explain-wrong (165L)
│   ├── media.js           # image upload multer (33L)
│   ├── stats.js           # code-logs + CSV + exam stats (126L)
│   ├── settings.js        # settings + site-info (32L)
│   └── history.js         # exam history + admin PIN (36L)
│
├── data/                  # Data storage (JSON files)
│   ├── exams.json         # All exam data
│   ├── users.json         # User accounts
│   ├── subjects.json      # Subject categories
│   ├── questions.json     # 🆕 Question Bank data
│   ├── settings.json      # Site settings
│   ├── ai-gen-cache.json  # AI result cache (recovery)
│   └── backups/           # Daily auto-backups (7 max)
│
├── public/                # Static frontend files
│   ├── index.html         # Student homepage
│   ├── exam.html          # Exam taking page
│   ├── result.html        # Result display page
│   │
│   ├── admin/
│   │   ├── index.html     # Admin panel HTML
│   │   ├── admin.js       # (legacy backup — NOT loaded)
│   │   └── js/            # 🆕 Admin panel modules (16 files, 1922L total)
│   │       ├── helpers.js         # State vars, api(), renderMarkdown (102L)
│   │       ├── admin-main.js      # Auth, tabs, init (115L)
│   │       ├── exams.js           # Exam list + editor (178L)
│   │       ├── sections.js        # Section CRUD + drag-drop (104L)
│   │       ├── questions.js       # Question CRUD + images + fill-blank (343L)
│   │       ├── print.js           # Print exam + answer key + preview (161L)
│   │       ├── codes.js           # Access codes + QR (106L)
│   │       ├── users.js           # User management (72L)
│   │       ├── subjects.js        # Subject management (18L)
│   │       ├── settings.js        # Settings (33L)
│   │       ├── ai-gen.js          # AI generation tab (111L)
│   │       ├── ai-gen-edit.js     # AI preview edit/delete (85L)
│   │       ├── latex-toolbar.js   # LaTeX toolbar (86L)
│   │       ├── submissions.js     # Submissions + review (168L)
│   │       ├── stats.js           # Stats + code logs (140L)
│   │       └── question-bank.js   # Question bank UI (100L)
│   │
│   ├── css/style.css      # Main stylesheet
│   ├── js/
│   │   ├── app.js         # Student app logic (~1400L)
│   │   └── result.js      # Result page logic (~800L)
│   │
│   └── uploads/           # Uploaded media files
│       ├── ai-images/     # AI-cropped images
│       └── submissions/   # Student essay uploads
│
├── PLAN_PHASE1-6.md       # Phase 1-6 plans (✅ all complete)
├── PLAN_BUGFIX.md         # Bug fix plan (✅ complete)
├── PLAN_ESSAY_FIX.md      # Essay fix plan (✅ complete)
├── PLAN_PHASE7.md         # Phase 7 plan (✅ COMPLETE — 21/21 tasks)
├── PLAN_REFACTOR.md       # Refactor plan (✅ P1+P2 DONE, P3 docs pending)
├── PLAN_PHASE8.md         # Phase 8 plan (🔲 Stabilization & Polish)
├── PLAN_STORAGE.md        # Storage migration plan (🔲 not started)
│
└── .agents/workflows/easyrevise.md  # Workflow for cross-conversation work
```

---

## 🗂️ Route → File Mapping (post-refactor 2026-04-08)

| Route prefix | File | Key endpoints |
|---|---|---|
| `/api/auth` | `routes/auth.js` | register, login, me |
| `/api/users` | `routes/users.js` | GET list, PUT, DELETE |
| `/api/subjects` | `routes/subjects.js` | GET, POST, DELETE |
| `/api/exams` | `routes/exams.js` | CRUD exams, export, import |
| `/api/admin/exams` | `routes/exams-admin.js` | duplicate, copy-section |
| `/api/exams/.../sections` | `routes/sections.js` | CRUD sections |
| `/api/exams/.../questions` | `routes/questions.js` | CRUD questions (in-exam) |
| `/api/admin/questions` | `routes/question-bank.js` | QB CRUD, import-from-exam, generate-exam |
| `/api/exams/.../codes` | `routes/codes.js` | generate, verify, cancel, preview, release |
| `/api/exams/.../code-result` | `routes/submit.js` | code-result, open-result, my-grades, upload-submission, review-by-code |
| `/api/admin/submissions` | `routes/grading.js` | submissions list, review, AI grade essay |
| `/api/admin/ai-generate` | `routes/ai-generate.js` | AI exam gen, AI extract QB, ai-last-result |
| `/api/admin/ocr` | `routes/ai-tools.js` | OCR + explain-wrong |
| `/api/upload` | `routes/media.js` | multer image upload |
| `/api/code-logs` | `routes/stats.js` | code logs, CSV export, exam stats |
| `/api/settings` | `routes/settings.js` | GET/PUT settings, site-info |
| `/api/history` | `routes/history.js` | exam history, admin PIN verify |

### Shared Libraries
| File | Exports |
|---|---|
| `lib/data.js` | readData, writeData, readUsers, writeUsers, readSubjects, writeSubjects, readQuestionBank, writeQuestionBank, readSettings, writeSettings, simpleHash, generateToken, countQuestions, uuidv4 |
| `lib/auth.js` | sanitizeCode, checkLoginRateLimit, authMiddleware, adminOnly |
| `lib/backup.js` | startDailyBackup (7-day rotation) |

---

## 🗂️ Admin Panel Modules (post-refactor)

| Module | Functions | Lines |
|---|---|---|
| `js/helpers.js` | api(), renderMarkdown, showView, openModal, closeModal, customConfirm, shared state vars | 102 |
| `js/admin-main.js` | checkAdminAuth, switchTab, adminLogin, adminLogout, showPinGate, submitAdminPin | 115 |
| `js/exams.js` | loadExamList, renderFilteredExams, openExamEditor, saveExam, deleteExam, exportExam, duplicateExam, copySectionTo | 178 |
| `js/sections.js` | openSectionEditor, showAddSectionModal, toggleSectionType, saveSection, deleteSection, drag-drop handlers | 104 |
| `js/questions.js` | showAddQuestionModal, editQuestion, renderBlankAnswers, saveQuestion, deleteQuestion, image helpers, paste handler | 343 |
| `js/print.js` | printExam, doPrintExam, previewExam | 161 |
| `js/codes.js` | showCodeManager, generateCodes, deleteCode, releaseCode, showQRCode, downloadQRCode | 106 |
| `js/users.js` | loadUsers, showCreateUserModal, saveUser, deleteUser | 72 |
| `js/subjects.js` | loadSubjects, saveSubject, deleteSubject | 18 |
| `js/settings.js` | loadSettings, saveSettings | 33 |
| `js/ai-gen.js` | handleAIFiles, generateWithAI, recoverAIResult, renderAIPreview, importAIResult, NotificationManager | 111 |
| `js/ai-gen-edit.js` | editAIQuestion, saveAIQuestion, deleteAIQuestion, deleteAISection | 85 |
| `js/latex-toolbar.js` | injectLatexToolbar, insertLatex | 86 |
| `js/submissions.js` | loadSubmissions, renderSubmissions, aiGradeEssay, reviewSubmission, exportSubmissionsCSV | 168 |
| `js/stats.js` | loadCodeLogs, loadExamStats, renderExamStats | 140 |
| `js/question-bank.js` | loadQuestionBank, deleteQBQuestion, showImportFromExamModal, doImportFromExam, showGenerateExamFromBankModal, doGenerateExamFromBank, updateBulkToolbar, bulkDeleteQuestions | 100 |

---

## 📊 Data Schemas

### Exam (exams.json)
```json
{
  "id": "uuid",
  "title": "Tên đề thi",
  "subject": "Môn",
  "year": "2025-2026",
  "timeLimit": 0,
  "requireCode": false,
  "autoGrade": true,           // 🆕 AI tự chấm sau nộp bài (default: true)
  "accessCodes": [
    {
      "code": "ABC123",
      "maxUses": 1,
      "usedBy": [
        { "userId": "...", "displayName": "...", "usedAt": "ISO", "completed": true, "score": 8.5, "result": {...} }
      ],
      "createdAt": "ISO"
    }
  ],
  "sections": [ /* see Section schema */ ],
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

### Section
```json
{
  "id": "uuid",
  "title": "Phần 1",
  "instruction": "Choose the correct answer",
  "type": "multiple-choice | reading | writing-choice | writing-essay | free-form | fill-in-blank",
  "passage": "Reading passage text (for reading type)",
  "prompt": "Essay prompt (for writing-essay)",
  "context": "Background context",
  "cues": ["cue1", "cue2"],
  "sampleAnswer": "Model answer",
  "explanation": "Section-level explanation",
  "showExplanation": true,    // 🆕 Toggle ẩn giải thích (default: true)
  "showExpansion": true,       // 🆕 Toggle ẩn mở rộng (default: true)
  "showInstruction": true,     // Toggle ẩn instruction với free-form
  "showCues": true,            // Toggle ẩn gợi ý với essay
  "explanationVideo": "https://youtube.com/...",  // 🆕 Video giải đáp section-level
  "questions": [ /* see Question schema */ ]
}
```

### Question
```json
{
  "id": 1,
  "question": "Nội dung câu hỏi",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctAnswer": 0,
  "explanation": "Giải thích chi tiết bằng tiếng Việt",
  "expansion": "Kiến thức mở rộng (quy tắc, công thức, ví dụ thêm)",
  "answer": "",
  "image": "/uploads/xxx.jpg",
  "video": "https://youtube.com/...",
  "mediaAsHint": false,
  "explanationImage": "/uploads/xxx.jpg",
  "explanationVideo": "https://...",
  "table": {
    "headers": ["Col1", "Col2"],
    "rows": [[1, 2], [3, 4]]
  },
  "imageUrl": "/uploads/ai-images/q1_123456.jpg",
  "imageRegion": {
    "imageIndex": 0,
    "topPercent": 60,
    "heightPercent": 30,
    "description": "Hình chữ nhật 14m x 12m..."
  }
}
```

### User (users.json)
```json
{
  "id": "uuid",
  "name": "username",
  "password": "hashed",
  "displayName": "Display Name",
  "role": "user | admin",
  "token": "base64-token",
  "history": [ /* exam results */ ]
}
```

### Settings (settings.json)
```json
{
  "adminPin": "123456",
  "pinSessionHours": 3,
  "codeExpireHours": 24,
  "siteName": "EasyRevise",
  "siteDescription": "Hệ thống ôn tập...",
  "generateModel": "claude-sonnet-4.6",
  "gradeModel": "claude-haiku-4.5",
  "ocrModel": ""
}
```
> `generateModel` — default model tab AI Tạo Đề (vẫn có thể override từng lần)
> `gradeModel` — auto-grade background + admin manual grade (essay/free-form)
> `ocrModel` — OCR paste ảnh → điền form
> Để trống = dùng env `CLAUDE_MODEL`

---

## 📚 Loại Câu Hỏi (Question Types)

EasyRevise hỗ trợ **5 loại section**, mỗi loại có cách hiển thị, chấm điểm và lưu kết quả khác nhau.

---

### 1. 🔵 `multiple-choice` — Trắc nghiệm
> **Loại phổ biến nhất.** Học sinh chọn 1 trong 4 đáp án A/B/C/D.

| Thuộc tính | Chi tiết |
|---|---|
| Section `type` | `"multiple-choice"` hoặc `"reading"` (reading có thêm `passage`) |
| Câu hỏi có | `question`, `options[4]`, `correctAnswer` (index 0-3), `explanation`, `expansion` |
| Ảnh/Video | `image`, `video`, `explanationImage`, `explanationVideo`, `mediaAsHint` |
| Đặc biệt | `table` (bảng dữ liệu), `imageRegion` (vùng crop từ ảnh AI) |
| **Chấm điểm** | ✅ **Tự động client-side** — so sánh `userAnswer === correctAnswer` |
| Điểm tổng | Tính vào điểm thang 10 (`correct / totalMC * 10`) |
| Result page | Hiện ✅ Đáp án đúng / ❌ Bạn chọn / ⚠️ Bỏ qua |
| AI tạo | ✅ Được nhận dạng đầy đủ |

---

### 2. 🟣 `fill-in-blank` — Điền vào chỗ trống
> Học sinh gõ đáp số vào ô trống trong câu. Hỗ trợ: text, int, float, fraction, dropdown.

| Thuộc tính | Chi tiết |
|---|---|
| Section `type` | `"fill-in-blank"` |
| Câu hỏi có | `question` (chứa blank marker), `blanks[]` |
| **Blank markers** | `___` (chuẩn), `__`, hoặc ` _ ` (standalone) — flexible detection |
| `blanks[]` | `[{ index, answer, type, alternatives, caseSensitive, dropdownOptions, tolerance }]` |
| **Blank types** | `text` (mặc định), `int`, `float` (±tolerance), `fraction` (a/b), `dropdown` (chọn từ list) |
| **alternatives** | Array đáp án thay thế `["ans2","ans3"]` — tất cả đều đúng |
| **caseSensitive** | Boolean (default: false) — text/dropdown so sánh |
| **dropdownOptions** | Array options cho dropdown type `["opt1","opt2","opt3"]` |
| **tolerance** | Float tolerance (default: 0.01 for float, 0.001 for fraction) |
| **Chấm điểm** | ✅ **Tự động server-side** ngay khi nộp bài (so sánh + normalize) |
| Điểm tổng | Tính vào điểm thang 10 (đúng toàn bộ blank thì correct++) |
| Result page | Hiện từng blank đúng/sai |
| AI tạo | ✅ Được nhận dạng (schema đầy đủ trong AI prompt) |

---

### 3. 🟡 `writing-essay` — Viết luận (Essay)
> Học sinh viết bài tự do + có thể đính kèm ảnh/PDF bài làm viết tay.

| Thuộc tính | Chi tiết |
|---|---|
| Section `type` | `"writing-essay"` |
| Section có | `prompt` (đề bài), `sampleAnswer` (đáp án mẫu), `instruction` |
| Học sinh nộp | Text gõ vào textarea + upload ảnh/PDF (`.jpg .png .webp .pdf`, max 10MB) |
| **Chấm điểm** | 🤖 **AI tự động** chạy background sau khi nộp bài |
| AI chấm | Gửi prompt + sampleAnswer + text + ảnh đính kèm → AI trả về `{score, feedback, breakdown}` |
| GV có thể | Override điểm + thêm nhận xét riêng trong Admin → Tab Bài nộp |
| Điểm tổng | **Không tính vào điểm MC** — hiện riêng trong grade slot |
| Result page | Hiện bài làm + mẫu đáp án + **🤖 Nhận xét** (điểm + feedback + breakdown) |
| Admin | Tab "📋 Bài nộp" — xem bài, trigger AI chấm, override điểm/feedback |
| AI tạo | ✅ Được nhận dạng |

---

### 4. 🟠 `free-form` — Tự luận có cấu trúc (Multi-part)
> Dành cho bài thi dạng tự luận nhiều phần (ví dụ: bài toán có a, b, c). Học sinh điền đáp số từng phần + có thể đính kèm bài giải viết tay.

| Thuộc tính | Chi tiết |
|---|---|
| Section `type` | `"free-form"` |
| Section có | `prompt` (đề tổng), `instruction`, `subParts[]` |
| `subParts[]` | `[{ label: 'a', question: 'Tính...' }]` — mỗi phần có label và câu hỏi |
| Học sinh nộp | Input text cho từng sub-part + upload ảnh/PDF bài giải |
| **Chấm điểm** | 🤖 **AI tự động** — serialize các đáp số thành text → AI chấm toàn bộ |
| GV có thể | Override trong Admin → Tab Bài nộp |
| Điểm tổng | **Không tính vào điểm MC** — hiện riêng trong grade slot |
| Result page | Hiện từng sub-part + đáp số học sinh + **🤖 Nhận xét** |
| Admin | Tab "📋 Bài nộp" (giống essay) |
| AI tạo | ✅ Được nhận dạng |

---

### 5. 🔴 `writing-choice` — Viết + Chọn đáp án
> Dạng câu hỏi kết hợp: có đáp án đúng/sai nhưng cần giải thích. Hiện render như trắc nghiệm.

| Thuộc tính | Chi tiết |
|---|---|
| Section `type` | `"writing-choice"` |
| Chấm điểm | ✅ Tự động (giống MC) |
| Ghi chú | Ít dùng, chủ yếu dùng cho dạng đúng/sai có giải thích |

---

### � So sánh nhanh

| Loại | Học sinh làm | Chấm điểm | Vào điểm tổng | Upload file | AI review |
|---|---|---|---|---|---|
| `multiple-choice` | Chọn A/B/C/D | ✅ Tự động (client) | ✅ Có | ❌ | ❌ |
| `reading` | Chọn A/B/C/D (có passage) | ✅ Tự động (client) | ✅ Có | ❌ | ❌ |
| `fill-in-blank` | Điền/chọn dropdown | ✅ Tự động (server) — text/int/float/fraction/dropdown + alternatives | ✅ Có | ❌ | ❌ |
| `writing-essay` | Viết textarea + upload | 🤖 AI background | ❌ Không | ✅ Ảnh/PDF | ✅ Có |
| `free-form` | Điền từng sub-part + upload | 🤖 AI background | ❌ Không | ✅ Ảnh/PDF | ✅ Có |

---

## �🔧 AI SDK Configuration

### .env Variables
```env
CLAUDE_API_KEY=sk-trollllm-...           # TrollLLM API key
CLAUDE_API_URL=https://chat.trollllm.xyz  # Base URL (NO /v1 for Anthropic)
CLAUDE_MODEL=claude-sonnet-4.6            # Default model
CLAUDE_SDK_TYPE=anthropic                 # Default SDK: anthropic | openai
MONGODB_URI=mongodb+srv://...            # (installed but not used for primary data)
```

### SDK Comparison
| | Anthropic SDK | OpenAI SDK |
|---|---|---|
| Package | `@anthropic-ai/sdk` | `openai` |
| Base URL | `https://chat.trollllm.xyz` (**NO** /v1) | `https://chat.trollllm.xyz/v1` |
| Image | `{type:'image', source:{type:'base64',...}}` | `{type:'image_url', image_url:{url:'data:...'}}` |
| Call | `client.messages.stream()` → `.finalMessage()` | `openai.chat.completions.create()` |
| Stability | ✅ Reliable | ⚠️ 502 with images |
| Timeout | 10 min | 5 min |

### Available Models (17 total, grouped in admin UI)
| Group | Models |
|---|---|
| Claude | claude-sonnet-4, claude-sonnet-4.6 *(default)*, claude-opus-4.6, claude-haiku-4.5 |
| GPT | gpt-4.1, gpt-4o, gpt-5-mini, gpt-5.1-codex, gpt-5.1-codex-max, gpt-5.1-codex-mini, gpt-5.2, gpt-5.2-codex, gpt-5.3-codex, gpt-5.4 |
| Gemini | gemini-3-flash, gemini-3.1-pro |
| Grok | grok-code-fast |

---

## 🐛 Known Bugs

| ID | Severity | Description | Files |
|---|---|---|---|
| BUG-1 | ✅ FIXED | `countQuestions()` counts writing-essay as 1/section | server.js |
| BUG-2 | ✅ FIXED | `importAIResult()` strips table, imageRegion, imageUrl fields | admin.js |
| BUG-3 | ✅ FIXED | Anthropic SDK timeout → switched to streaming | server.js |
| BUG-4 | 🟡 INTERMITTENT | OpenAI SDK returns 502 on image requests via TrollLLM | server.js |
| BUG-5 | ✅ FIXED | freeFormContainer state leak khi chuyển câu | app.js |
| BUG-6 | ✅ FIXED | result.js isFillBlank missing khi flatten sections | result.js |
| BUG-7 | ✅ FIXED | fill-in-blank flexible marker (`___`, `__`, ` _ `) | app.js + result.js |
| BUG-8 | ✅ FIXED | Free-form result header sai field name | result.js |
| BUG-A | ✅ FIXED | answeredCount sai với free-form | app.js |
| BUG-B | ✅ FIXED | Duplicate essay ID khi 2 section essay | app.js + result.js |
| BUG-C | ✅ FIXED | Auto-grade không tìm free-form section | server.js |
| FIX-1 | ✅ FIXED | Crash guard (uncaughtException + unhandledRejection) | server.js |
| FIX-2 | ✅ FIXED | Safe body parser trả 413/400 thay vì crash | server.js |
| FIX-3 | ✅ FIXED | Section detection sai khi AI chấm essay | server.js |
| FIX-4 | ✅ FIXED | Free-form prompt rỗng (sai field: prompt vs instruction) | server.js |
| FIX-5 | ✅ FIXED | explain-wrong tìm sai bài nộp (sai học sinh) | server.js + result.js |
| FIX-6 | ✅ FIXED | sanitizeCode() input validation | server.js |
| FIX-7 | ✅ FIXED | Login rate limit 10 lần/3 phút/IP | server.js |

---

## 📊 Feature Status

### ✅ Completed
- Multi-section exam system (MC, reading, writing, essay)
- Admin panel with full CRUD (exams, sections, questions, users, subjects)
- Access code system (generate, verify, auto-expire, release stuck)
- Code-based result tracking + review
- Dual SDK support (Anthropic streaming + OpenAI)
- 17 model selector in admin UI
- Image compression pipeline (Sharp → 1200px, 80% JPEG)
- 3-attempt retry logic with 2s delay
- Table + imageRegion in AI prompt schema
- Post-processing: crop imageRegion → save to /uploads/ai-images/
- Export/Import exam JSON
- Student exam history
- Admin PIN verification
- Settings management

### ✅ Phase 1 (Hoàn thành 2026-03-26)
- [x] Fix BUG-1: `countQuestions()` đếm sai writing-essay
- [x] Fix BUG-2: `importAIResult()` strip mất table/imageUrl/imageRegion
- [x] Nhiều ảnh cho câu hỏi / đáp án A-D / giải thích
- [x] OCR: Dán ảnh → AI đọc → tự điền text vào form
- [x] Chuông 🔔 thông báo + localStorage lưu trạng thái AI task

> 📄 **Chi tiết:** Xem [PLAN_PHASE1.md](./PLAN_PHASE1.md)

### ✅ Phase 2 (Hoàn thành 2026-03-26)
- [x] Cải thiện AI nhận dạng 6 loại câu (MC, reading, fill-blank, writing, essay, free-form)
- [x] LaTeX / KaTeX render công thức toán (exam.html, index.html, admin, result)
- [x] Preview & Edit từng câu trước khi import AI (sửa/xoá/xoá section)
- [x] AI prompt bắt buộc LaTeX $...$ cho công thức toán
- [x] Schema fill-in-blank + free-form trong prompt + JSON example

> 📄 **Chi tiết:** Xem [PLAN_PHASE2.md](./PLAN_PHASE2.md)

### ✅ Phase 3 (Hoàn thành 2026-03-26)
- [x] Học sinh upload ảnh/PDF bài tự luận khi nộp bài
- [x] AI tự động chấm điểm ngay sau khi nộp (background, không block)
- [x] Banner "Đang chấm..." + polling tự động trên result page
- [x] Free-form question: sub-part inputs + upload + AI grading
- [x] Dashboard giáo viên review + override điểm AI
- [x] Nhận xét AI hiển thị đẹp trên result page (score + feedback + breakdown)
- [x] Fix dotenv `(0)` với thư mục có ký tự `[` `]`
- [x] Auto-recover AI Generate khi switch tab (visibilitychange + switchTab)
- [x] Per-feature model config trong Settings (gradeModel, ocrModel, generateModel)

> 📄 **Chi tiết:** Xem [PLAN_PHASE3.md](./PLAN_PHASE3.md)

### ✅ Phase 4 (Hoàn thành 2026-03-26)
- [x] **Security fix**: vá `/api/upload-submission` — validate examId + code
- [x] **Bug fixes**: BUG-A/B/C (answeredCount, duplicate ID, free-form auto-grade)
- [x] Markdown render trong feedback AI (`**in đậm**`, `*in nghiêng*`, bullet list, xuống dòng)
- [x] PDF → ảnh: convert 3 trang đầu thành ảnh, gửi AI đọc được đề scan + hình vẽ
- [x] Trang Help/Guide trong admin panel (accordion, bảng 5 loại câu, changelog, nút in)
- [x] Data backup tự động hàng ngày (giữ 7 bản)
- [x] Upload spinner UX + Admin submissions auto-refresh

> 📄 **Chi tiết:** Xem [PLAN_PHASE4.md](./PLAN_PHASE4.md)

### ✅ Phase 5 (Hoàn thành 2026-03-27)

- [x] **AI auto-grade toggle per exam** — `autoGrade` field trên exam, tắt thì bỏ qua AI chấm essay/free-form
- [x] **showExplanation / showExpansion toggle** — Admin bật/tắt từng section, student view tự ẩn
- [x] **Show sub-part question text** — Result page hiện `p.question` mỗi sub-part (thay vì chỉ đáp số)
- [x] **Sub-part label** — Đổi "Phần X" → "Câu X" cho free-form sub-parts (cả exam + result view)
- [x] **Free-form result header** — Bỏ "— CÂU X" khỏi header, chỉ hiện section title
- [x] **Flexible fill-in-blank marker** — Nhận `___`, `__`, ` _ ` (flexible detection trong app.js + result.js)
- [x] **Fix `isFillBlank` trong result.js** — flatten sections phải set `isFillBlank: true` tường minh
- [x] **Fix freeFormContainer state leak** — Reset container khi chuyển câu, ngăn video/hint Q1 hiện ở Q2
- [x] **Video giải đáp section-level** — Free-form admin thêm field `explanationVideo`, student thấy sau nộp
- [x] **Conditional hide empty sections** — Instruction/cues tự ẩn nếu trống
- [x] **Open-result tracking** — Đề không cần mã vẫn POST lên server, admin xem được bài nộp
- [x] **Export CSV bài nộp** — route GET /api/admin/submissions/export (UTF-8 BOM)
- [x] **Thống kê câu hỏi** — route GET /api/admin/exams/:id/stats
- [x] Fill-blank detail từng ô trên result page *(done in Phase 7)*
- [x] Cảnh báo essay 5 phút trước hết giờ *(done in Phase 7)*
- [x] maxAttempts per access code *(done in Phase 7)*

> 📄 **Chi tiết:** Xem [PLAN_PHASE5.md](./PLAN_PHASE5.md)

### ✅ Phase 6 (Hoàn thành 2026-03-27)
- [x] **TN1: Duplicate đề / Copy section** — 2 admin routes mới, UI nút Nhân bản + Copy section
- [x] **TN2: QR Code** — Admin tạo QR, fix nút Đóng; scan URL deep-link → popup thông tin đề đẹp (tên đề, lịch sử, lượt dùng, bài đang dở, CTA button)
- [x] **TN2+: preview-code API** — lấy info đề + lịch sử code MÀ KHÔNG tiêu slot
- [x] **TN2+: QR Scanner mobile** — nút 📷 Quét QR (ẩn trên desktop ≥768px), jsQR camera scan, tự nhận URL rồi mở popup
- [x] **TN3: Guest Name** — custom modal nhập tên (thay `prompt()`), custom confirm nộp bài (thay `confirm()`) với pills số câu chưa làm
- [x] **TN4: LaTeX Toolbar** — toolbar 14 ký hiệu inject tự động vào `modalQuestion` và `modalSection` trong Admin
- [x] **TN5: AI "Tại sao tôi sai?"** — route explain-wrong, limit per exam, nút trong result.js, render markdown/KaTeX

> 📄 **Chi tiết:** Xem [PLAN_PHASE6.md](./PLAN_PHASE6.md)

### ✅ Bug Fix Plans (Hoàn thành 2026-03-27)
- [x] **PLAN_BUGFIX.md** — 7 fixes: crash guard, body parser, section detection, sectionPrompt, explain-wrong, sanitizeCode, rate limit, disable register
- [x] **PLAN_ESSAY_FIX.md** — 5 tasks: security upload, client upload params, polling verify, showInstruction, multi-image result

> 📄 **Chi tiết:** Xem [PLAN_BUGFIX.md](./PLAN_BUGFIX.md) và [PLAN_ESSAY_FIX.md](./PLAN_ESSAY_FIX.md)

### ✅ Phase 7 — Ổn Định + Nâng Cấp Lớn (Hoàn thành 2026-04-08)
**21/21 tasks COMPLETE:**

- [x] Fill-blank detail, essay 5-min warning, maxAttempts, Enter login, Fix double login
- [x] Fill-blank upgrade: dropdown, alternatives, fraction/float tolerance, caseSensitive, AI prompt
- [x] Print Exam + Answer Key, Question Bank (CRUD + import + generate), AI Extract QB
- [x] Drag & Drop sections, Bulk delete, Custom confirm modal, Exam Preview, Search/Filter, Responsive

> 📄 **Chi tiết:** Xem [PLAN_PHASE7.md](./PLAN_PHASE7.md)

### ✅ Architecture Refactor (Hoàn thành 2026-04-08)
**server.js: 2,378 → 113 dòng** (17 route files + 3 lib files)  
**admin.js: 2,629 → 16 module files** (1,922 dòng total)

> 📄 **Chi tiết:** Xem [PLAN_REFACTOR.md](./PLAN_REFACTOR.md)

### 🔲 Phase 8 — Stabilization & Polish (chưa bắt đầu)
**6 bước, ~8 giờ:**

- [ ] Runtime test — verify 6 flows chính sau refactor
- [ ] XSS Protection — sanitize user input toàn bộ (admin + student)
- [ ] Archive cleanup — dọn legacy files (admin.js cũ, seed.js, etc.)
- [ ] AI Helpers — centralize SDK config vào `lib/ai-helpers.js`
- [ ] Input Validation — validate data types, ranges, URL formats
- [ ] Test Suite — ~20 automated tests (data, auth, grading, validation)

> 📄 **Chi tiết:** Xem [PLAN_PHASE8.md](./PLAN_PHASE8.md)

### 🔲 Storage Migration — (chưa bắt đầu, thực hiện sau Phase 7)
- Tự động upload ảnh/PDF lên Google Drive (admin không cần can thiệp)
- Video watcher: bỏ file .ts/.m3u8 vào folder `pending/` → tự convert .mp4 → tự lên Drive
- Proxy route `/api/file/:id` → serve file từ Drive qua server (có cache RAM)
- Migration script: chuyển file cũ từ /uploads/ lên Drive (chạy 1 lần)
- VPS chỉ làm nơi xử lý tạm, không lưu file vĩnh viễn

> 📄 **Chi tiết:** Xem [PLAN_STORAGE.md](./PLAN_STORAGE.md)

---

## 🎨 Design Decisions (đã xác nhận)

| Vấn đề | Quyết định |
|---|---|
| Fill-in-blank UI | Dùng `___` placeholder trong câu hỏi text, render thành `<input>` |
| Lưu bài nộp học sinh | Hiện tại: `/uploads/submissions/`. Kế hoạch: tự upload Google Drive (PLAN_STORAGE.md) |
| Kiểu fill-in-blank | `text`, `int`, `float` (±tolerance), `fraction` (a/b), `dropdown` + alternatives + caseSensitive |
| Chuông thông báo | Lưu vào `localStorage`, persist qua F5 |
| Storage backend | Hiện tại: local disk. Kế hoạch: Google Drive (Drive 2TB đã có, < 10 user) |
| Video hosting | Kế hoạch: tự convert .ts/.m3u8 → .mp4 bằng ffmpeg → lưu Drive |
| AI Explain limit | Mặc định tắt (0). Giáo viên tự bật per đề/mã, giới hạn lần dùng để tránh spam token |
| Architecture | Modular: server.js entry → routes/ + lib/ ; admin panel → js/ modules (post-refactor 2026-04-08) |

---

## 📝 Change Log
| Date | Changes |
|---|---|
| **2026-04-08T05:00** | **PROJECT.md major update:** File tree → modular architecture. Line maps → route/module tables. Phase 7 ✅ + Refactor ✅. Fill-blank schema updated (dropdown, alternatives, fraction, tolerance) |
| **2026-04-08T04:30** | **PLAN_REFACTOR P1+P2 ✅:** server.js 2378→113L (17 routes + 3 libs). admin.js→16 modules (1922L). index.html updated. Old admin.js kept as backup |
| **2026-04-08T00:30** | **Phase 7 ✅ COMPLETE (21/21):** Fill-blank upgrade (dropdown/alternatives/fraction/tolerance/caseSensitive), Print Exam+Answer Key, Question Bank (CRUD+import+generate+AI extract), Drag&Drop, Bulk delete, Custom confirm, Exam Preview, Search/Filter, Responsive, Enter login, Fix double-login |
| **2026-04-07T12:54** | **PLAN_PHASE7.md created:** 21 tasks (4 nhóm): Phase 5 gaps, fill-blank upgrade, print đề, question bank, UX fixes |
| **2026-04-07T12:35** | **PROJECT.md sync:** Cập nhật tất cả file sizes, line maps, phase statuses. Fix Phase 4 từ 🔲→✅. Thêm Bug Fix Plans section. Cập nhật Phase 5 tasks |
| **2026-03-27T11:49** | **PLAN_BUGFIX ✅ hoàn thành:** FIX-1→9 (crash guard, body parser, section detection, sectionPrompt, explain-wrong userId, sanitizeCode, rate limit, disable register) |
| **2026-03-27T04:37** | Admin "Bài nộp": submission card mặc định thu gọn, click header ▶/▼ để mở/đóng nội dung |
| **2026-03-27T04:24** | **Phase 6 ✅ hoàn thành:** TN1 Duplicate/Copy section, TN2 QR popup (preview-code API, scanner mobile, jsQR), TN3 custom modals (submit confirm + guest name), TN4 LaTeX toolbar admin, TN5 AI explain wrong |
| **2026-03-27T02:59** | **Phase 5 ✅ hoàn thành:** autoGrade toggle, showExplanation/showExpansion toggle, sub-part labels, flexible blank markers, video giải đáp, open-result tracking, Export CSV, Exam stats |
| **2026-03-26T13:38** | **PLAN_ESSAY_FIX ✅ hoàn thành:** Security upload-submission, client upload params, verify my-grades, showInstruction toggle, multi-image result |
| **2026-03-26T12:50** | **Phase 4 ✅ hoàn thành:** Security fix, BUG-A/B/C, Markdown render, PDF→ảnh, Help/Guide tab, Data backup, Upload spinner, Auto-refresh |
| **2026-03-26T11:38** | **Phase 2 ✅ + Phase 3 ✅ đánh dấu hoàn thành.** Bổ sung bonus Phase 3: auto-recover AI tab, per-feature model (generate/grade/ocr), importAIResult giữ blanks+subParts, AI preview badge fill/free-form |
| **2026-03-26** | **Phase 3:** Essay/Free-form upload + AI auto-grade background + polling banner + admin submissions dashboard + result page AI grade cards. Fix dotenv [brackets]. Per-feature model config |
| **2026-03-26** | **Phase 2:** fill-in-blank + free-form type + LaTeX/KaTeX tất cả trang + AI preview edit/delete per-câu/section + prompt LaTeX mandatory |
| 2026-03-25 | Model selector, table/imageRegion prompt, Anthropic streaming fix, PROJECT.md, workflow setup. Phase 1: multi-image, OCR, bell notification, bug fixes |
| 2026-03-24 | Dual SDK (Anthropic + OpenAI), Sharp compression, retry logic |
| 2026-03-23 | Initial AI exam generator, admin panel, student UI |
| **2026-04-07T12:35** | **PROJECT.md sync:** Cập nhật tất cả file sizes, line maps, phase statuses |
| **2026-03-27T11:49** | **PLAN_BUGFIX ✅ hoàn thành:** FIX-1→9 |
| **2026-03-27T04:24** | **Phase 6 ✅ hoàn thành:** TN1-TN5 (Duplicate, QR, Modals, LaTeX, AI explain wrong) |
| **2026-03-27T02:59** | **Phase 5 ✅ hoàn thành:** autoGrade, toggles, sub-parts, blank markers, CSV, Stats |
| **2026-03-26** | **Phase 2-4 ✅ hoàn thành.** AI pipeline, upload, grading, security, backup |
| 2026-03-25 | Phase 1 ✅. Model selector, streaming fix, multi-image, OCR, notifications |
| 2026-03-23-24 | Initial release: AI exam generator, dual SDK, admin panel, student UI |
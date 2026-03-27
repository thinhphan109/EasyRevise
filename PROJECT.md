# EasyRevise — Project Documentation

> **⚠️ FILE NÀY ĐƯỢC TỰ ĐỘNG CẬP NHẬT BỞI AI AGENT**
> Mỗi khi có thay đổi code, agent PHẢI cập nhật file này.
> Last updated: 2026-03-27T04:24+07:00

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

### File Structure (with sizes)
```
EasyRevise/
├── server.js              # ALL routes + AI pipeline (~1980 lines, 97KB)
├── .env                   # API keys, SDK config
├── package.json           # Dependencies (558B)
├── seed.js                # Sample data seeder
├── migrate.js             # Data migration helper
├── vercel.json            # Vercel deployment config
├── PROJECT.md             # THIS FILE — auto-updated docs
├── .gitignore             # Git ignore rules
│
├── data/                  # Data storage (JSON files)
│   ├── exams.json         # All exam data
│   ├── users.json         # User accounts
│   ├── subjects.json      # Subject categories
│   └── settings.json      # Site settings
│
├── public/                # Static frontend files
│   ├── index.html         # Student homepage
│   ├── exam.html          # Exam taking page
│   ├── result.html        # Result display page
│   │
│   ├── admin/
│   │   ├── index.html     # Admin panel HTML (~1960 lines, 95KB)
│   │   └── admin.js       # Admin panel JS (~1906 lines, 110KB)
│   │
│   ├── css/
│   │   └── style.css      # Main stylesheet
│   │
│   ├── js/
│   │   ├── app.js         # Student app logic (~1185 lines, 58KB)
│   │   └── result.js      # Result page logic (~640 lines, 37KB)
│   │
│   └── uploads/           # Uploaded media files
│       └── ai-images/     # AI-cropped images (auto-created)
│
└── .agents/
    └── workflows/
        └── easyrevise.md  # Workflow for cross-conversation work
```

---

## 🗂️ Server.js Line Map (DETAILED)

```
Lines 1-7       │ Imports: dotenv, express, fs, path, uuid, sharp
Lines 8-13      │ App setup: PORT, DATA_FILE, USERS_FILE, SUBJECTS_FILE, SETTINGS_FILE  
Lines 15-17     │ Middleware: express.json({limit:'10mb'}), express.static
Lines 19-66     │ Helper functions:
                │   readData(), writeData()          — exams.json
                │   readUsers(), writeUsers()        — users.json
                │   readSubjects(), writeSubjects()  — subjects.json
                │   readSettings(), writeSettings()  — settings.json
                │   simpleHash(str)                  — hash for tokens
                │   generateToken(userId)            — auth token gen
Lines 68-76     │ countQuestions(exam) — ⚠️ BUG: writing-essay counts as 1/section
Lines 78-100    │ Auth middleware:
                │   authMiddleware — Bearer token check (any user)
                │   adminOnly     — Bearer token + role=admin check

Lines 102-186   │ === AUTH ROUTES ===
  105-125       │   POST /api/auth/register    — {name, password, displayName?}
  126-135       │   POST /api/auth/login       — {name, password}
  136-142       │   GET  /api/auth/me          — returns user info
  143-150       │   GET  /api/users            — admin: list all users
  151-165       │   PUT  /api/users/:id        — admin: update user
  166-176       │   PUT  /api/users/:id/reset-password — admin: reset pw
  177-186       │   DELETE /api/users/:id      — admin: delete user

Lines 187-213   │ === SUBJECTS CRUD ===
  187           │   GET    /api/subjects       — list all
  189-195       │   POST   /api/subjects       — admin: create {name, icon}
  197-205       │   PUT    /api/subjects/:id   — admin: update
  207-212       │   DELETE /api/subjects/:id   — admin: delete

Lines 214-295   │ === EXAMS CRUD ===
  217-227       │   GET    /api/exams          — list (summary: id,title,subject,year,counts)
  229-255       │   GET    /api/exams/:id      — full exam (with access code check)
  257-269       │   POST   /api/exams          — admin: create {title,subject,year,timeLimit,sections[]}
  271-288       │   PUT    /api/exams/:id      — admin: update (spread merge)
  290-295       │   DELETE /api/exams/:id      — admin: delete

Lines 296-339   │ === SECTIONS CRUD (Admin) ===
  300-317       │   POST   /api/exams/:id/sections         — add section
  319-329       │   PUT    /api/exams/:eid/sections/:sid    — update (spread merge)
  331-339       │   DELETE /api/exams/:eid/sections/:sid    — delete

Lines 341-389   │ === QUESTIONS CRUD (Admin) ===
  344-363       │   POST   /api/exams/:eid/sections/:sid/questions          — add question
  365-377       │   PUT    /api/exams/:eid/sections/:sid/questions/:qid     — update (spread merge)
  379-389       │   DELETE /api/exams/:eid/sections/:sid/questions/:qid     — delete

Lines 391-461   │ === ACCESS CODES ===
  394-411       │   POST   /api/exams/:id/codes       — generate codes {count, maxUses}
  413-420       │   DELETE /api/exams/:id/codes/:code  — delete code
  422-447       │   POST   /api/exams/:id/verify-code  — verify + track usage
                │     ↳ Auto-expire incomplete usages after codeExpireHours
  449-461       │   POST   /api/exams/:id/cancel-code  — cancel incomplete usage

Lines 463-660   │ === CODE-BASED RESULTS + AUTO-GRADE ===
  466-485       │   POST   /api/exams/:examId/code-result  — lưu kết quả, trigger background grading
  487-510       │   POST   /api/review-by-code             — lấy kết quả theo code
  512-660       │   Background autoGradeEssays():
                │     fill-in-blank → so sánh tức thì
                │     essay/free-form → AI async, đọc gradeModel từ settings → env → fallback
                │   GET /api/exams/:examId/my-grades       — polling kết quả chấm

Lines 662-680   │ === SUBMISSION UPLOAD ===
  665-680       │   POST /api/upload-submission — multer, lưu /uploads/submissions/

Lines 682-700   │ === EXPORT / IMPORT ===
  685-696       │   GET    /api/exams/:id/export  — download single exam JSON
  698-713       │   POST   /api/exams/import      — import exam từ JSON
  715-720       │   GET    /api/export-all         — download all exams backup JSON

Lines 722-744   │ === IMAGE UPLOAD ===
  725-739       │   Multer config: disk storage, 5MB limit, image only
  741-744       │   POST /api/upload — admin: upload image → /uploads/{filename}

Lines 746-760   │ === OCR ===
  749-760       │   POST /api/admin/ocr — đọc ảnh → text
                │     model: settings.ocrModel → env → fallback

Lines 762-1100  │ === AI EXAM GENERATOR ===
  ...           │   POST /api/admin/ai-generate
                │     model: reqModel → settings.generateModel → env → fallback

Lines 1102-1120 │ === EXAM HISTORY ===
Lines 1122-1130 │ === ADMIN PIN VERIFICATION ===
Lines 1132-1250 │ === SETTINGS ===
  1214          │   GET  /api/settings        — full settings (adminOnly)
  1216-1228     │   PUT  /api/settings        — update: adminPin, pinSessionHours, codeExpireHours,
                │         siteName, siteDescription, generateModel, gradeModel, ocrModel
  1230          │   GET  /api/settings/public  — public: siteName, siteDescription, codeExpireHours

Lines 1252-1270 │ === RELEASE STUCK CODE ===
Lines 1272-1294 │ === CODE LOGS ===
Lines 1296-1450 │ === AI GRADE ESSAY (Admin manual) ===
  1300-1450     │   POST /api/admin/ai-grade-essay
                │     model: settings.gradeModel → env → fallback
Lines 1452-1465 │ === SPA + SERVER START ===
```

---

## 🗂️ Admin.js Line Map

```
Lines 1-20      │ Global vars: adminToken, currentExam, currentSection, etc.
Lines 20-98     │ Init: checkAuth(), showView(), loadExamList(), loadUsers()
Lines 99-104    │ api(url, method, body) — fetch wrapper with auth
Lines 106-120   │ Tab switching: exams, users, subjects, codeLogs, settings, aiGen
Lines 120-400   │ Exam management:
                │   loadExamList() — fetch + render exam cards
                │   openExam(id)  — open exam editor
                │   createExam()  — modal + POST /api/exams
                │   saveExam()    — PUT /api/exams/:id
                │   deleteExam()  — DELETE /api/exams/:id
Lines 400-620   │ Section & Question CRUD UI:
                │   addSection(), saveSection(), deleteSection()
                │   addQuestion(), saveQuestion(), deleteQuestion()
                │   renderSections(), renderQuestions()
                │   Media upload for questions (image, video, explanation media)
Lines 620-660   │ AI Generator variables + file handling:
                │   aiSelectedFiles[], handleAIFiles(), removeAIFile()
Lines 660-736   │ generateWithAI():
                │   Build FormData (files, title, subject, year, subjectType, sdkType, model)
                │   POST /api/admin/ai-generate
                │   Store result in aiGeneratedData
                │   Call renderAIPreview()
Lines 738-805   │ renderAIPreview(data):
                │   Display exam title, section count, question count
                │   Render each section with type badges
                │   Show questions with options + correct answer highlight
Lines 805-851   │ importAIResult():
                │   Map sections + questions to system format
                │   ⚠️ STRIPS: table, imageRegion, imageUrl (BUG-2)
                │   POST /api/exams with mapped data
Lines 853-858   │ regenerateAI() — retry AI generation
Lines 860-875   │ downloadAIJSON() — download raw AI JSON
```

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
> Học sinh gõ đáp số vào ô trống trong câu. Hỗ trợ số nguyên, số thực, text.

| Thuộc tính | Chi tiết |
|---|---|
| Section `type` | `"fill-in-blank"` |
| Câu hỏi có | `question` (chứa blank marker), `blanks[]` |
| **Blank markers** | `___` (chuẩn), `__`, hoặc ` _ ` (standalone) — flexible detection |
| `blanks[]` | `[{ index, answer, type: 'text'\|'int'\|'float' }]` |
| **Chấm điểm** | ✅ **Tự động server-side** ngay khi nộp bài (so sánh đáp án) |
| Tolerance | `float`: ±0.01 \| `int`: parseInt \| `text`: case-insensitive |
| Điểm tổng | Tính vào điểm thang 10 (đúng toàn bộ blank thì correct++) |
| Result page | Hiện từng blank đúng/sai |
| AI tạo | ✅ Được nhận dạng |

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
| `fill-in-blank` | Điền vào ô trống | ✅ Tự động (server) | ✅ Có | ❌ | ❌ |
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
| BUG-1 | 🔴 CRITICAL | `countQuestions()` counts writing-essay as 1/section, not by questions array | server.js:68-76 |
| BUG-2 | 🟡 MEDIUM | `importAIResult()` strips table, imageRegion, imageUrl fields | admin.js:824-831 |
| BUG-3 | ✅ FIXED | Anthropic SDK timeout → switched to streaming | server.js:800-807 |
| BUG-4 | 🟡 INTERMITTENT | OpenAI SDK returns 502 on image requests via TrollLLM | server.js:760-773 |
| BUG-5 | ✅ FIXED | freeFormContainer không reset khi chuyển câu → video/hint Q1 leak sang Q2/Q3 | app.js |
| BUG-6 | ✅ FIXED | result.js không set `isFillBlank: true` khi flatten sections → `[object Object]` | result.js:84-98 |
| BUG-7 | ✅ FIXED | fill-in-blank chỉ nhận `___`, dữ liệu có `_` không render ô nhập | app.js + result.js |
| BUG-8 | ✅ FIXED | Free-form result header dùng `q.title` thay `q.instruction` → hiện "ĐỀ BÀI" làm nội dung | result.js |

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

### 🔲 Phase 1 (Đang lên kế hoạch)
- Fix BUG-1: `countQuestions()` đếm sai writing-essay
- Fix BUG-2: `importAIResult()` strip mất table/imageUrl/imageRegion
- Nhiều ảnh cho câu hỏi / đáp án A-D / giải thích
- OCR: Dán ảnh → AI đọc → tự điền text vào form
- Fill-in-blank: placeholder `___` trong câu, học sinh bấm điền
- Chuông 🔔 thông báo + localStorage lưu trạng thái AI task

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

### 🔲 Phase 4 — (chưa bắt đầu)
- **Security fix**: vá `/api/upload-submission` không có auth — validate examId + code
- Markdown render trong feedback AI (`**in đậm**`, `*in nghiêng*`, bullet list, xuống dòng)
- PDF → ảnh: convert 3 trang đầu thành ảnh, gửi AI đọc được đề scan + hình vẽ
- OCR route mở rộng nhận PDF (convert trang 1 → OCR)
- Trang Help/Guide trong admin panel (accordion, bảng 5 loại câu, changelog, nút in)

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

### 🔲 Storage Migration — (chưa bắt đầu, thực hiện sau Phase 6)
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
| Kiểu fill-in-blank | `text` (case-insensitive), `int`, `float` (±0.01 tolerance) |
| Chuông thông báo | Lưu vào `localStorage`, persist qua F5 |
| Storage backend | Hiện tại: local disk. Kế hoạch: Google Drive (Drive 2TB đã có, < 10 user) |
| Video hosting | Kế hoạch: tự convert .ts/.m3u8 → .mp4 bằng ffmpeg → lưu Drive |
| AI Explain limit | Mặc định tắt (0). Giáo viên tự bật per đề/mã, giới hạn lần dùng để tránh spam token |

---

## 📝 Change Log
| Date | Changes |
|---|---|
| **2026-03-27T04:37** | Admin "Bài nộp": submission card mặc định thu gọn, click header ▶/▼ để mở/đóng nội dung |
| **2026-03-27T04:24** | **Phase 6 ✅ hoàn thành:** TN1 Duplicate/Copy section, TN2 QR popup (preview-code API, scanner mobile, jsQR), TN3 custom modals (submit confirm + guest name), TN4 LaTeX toolbar admin, TN5 AI explain wrong |
| **2026-03-27T02:59** | **Session trước:** Fix freeFormContainer leak (BUG-5), fix isFillBlank result.js (BUG-6), fix flexible fill-in-blank marker (BUG-7), fix free-form result header (BUG-8), đổi "Phần X"→"Câu X" sub-part label, add autoGrade toggle per exam |
| **2026-03-26T11:38** | **Phase 2 ✅ + Phase 3 ✅ đánh dấu hoàn thành.** Bổ sung bonus Phase 3: auto-recover AI tab, per-feature model (generate/grade/ocr), importAIResult giữ blanks+subParts, AI preview badge fill/free-form |
| **2026-03-26** | **Phase 3:** Essay/Free-form upload + AI auto-grade background + polling banner + admin submissions dashboard + result page AI grade cards. Fix dotenv [brackets]. Per-feature model config |
| **2026-03-26** | **Phase 2:** fill-in-blank + free-form type + LaTeX/KaTeX tất cả trang + AI preview edit/delete per-câu/section + prompt LaTeX mandatory |
| 2026-03-25 | Model selector, table/imageRegion prompt, Anthropic streaming fix, PROJECT.md, workflow setup. Phase 1: multi-image, OCR, bell notification, bug fixes |
| 2026-03-24 | Dual SDK (Anthropic + OpenAI), Sharp compression, retry logic |
| 2026-03-23 | Initial AI exam generator, admin panel, student UI |

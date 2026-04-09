# EasyRevise

> Hệ thống ôn tập & kiểm tra trực tuyến với AI tạo đề thi tự động

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/Website-thinhme.tech-6366f1?logo=googlechrome&logoColor=white)](https://thinhme.tech)

---

## ✨ Tính năng

### Cho giáo viên (Admin)
- 🤖 **AI Tạo đề** — Dán ảnh/PDF/text → AI sinh đề thi hoàn chỉnh (Claude, GPT, Gemini)
- 📝 **5 loại câu hỏi** — Trắc nghiệm, điền chỗ trống, đọc hiểu, tự luận, viết luận
- 🖨️ **In đề thi** — Xuất PDF đề + đáp án, preview trước khi in
- 📊 **Thống kê** — Phân tích bài nộp, CSV export, accuracy per câu
- 🔐 **Mã kích hoạt** — Tạo mã + QR code, giới hạn lượt dùng, tự giải phóng
- 📚 **Ngân hàng câu hỏi** — CRUD, import từ đề, AI extract, sinh đề từ bank
- 🖼️ **Thư viện media** — Upload ảnh/file lên Google Drive, quản lý tập trung
- ✍️ **AI chấm bài** — Tự luận/essay được AI chấm background, GV override điểm

### Cho học sinh (Student)
- 📱 **Làm bài trực tuyến** — Responsive, hỗ trợ mobile, swipe câu hỏi
- ⏱️ **Timer** — Đếm ngược, cảnh báo 5 phút, auto-submit
- 📋 **Xem kết quả** — Điểm chi tiết, giải thích, kiến thức mở rộng
- 🤖 **"Tại sao sai?"** — AI giải thích câu trả lời sai
- 📷 **Upload bài tay** — Chụp ảnh/scan PDF bài tự luận
- 🔗 **QR Code** — Quét QR → vào đề ngay

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v22 |
| Backend | Express.js 4.18 |
| Frontend | Vanilla HTML/CSS/JS |
| Data | JSON files (no database) |
| AI | Anthropic SDK + OpenAI SDK → TrollLLM proxy |
| Storage | Google Drive API (ảnh, PDF, video) |
| Image | Sharp (compress, crop) |

---

## 🚀 Cài đặt

### Yêu cầu
- Node.js ≥ 18
- Google Drive API credentials (cho media library)
- AI API key (Claude/GPT/Gemini qua TrollLLM)

### Bước 1: Clone & Install

```bash
git clone https://github.com/your-username/EasyRevise.git
cd EasyRevise
npm install
```

### Bước 2: Tạo file `.env`

```env
# AI Configuration
CLAUDE_API_KEY=sk-your-api-key
CLAUDE_API_URL=https://chat.trollllm.xyz
CLAUDE_MODEL=claude-sonnet-4.6
CLAUDE_SDK_TYPE=anthropic

# Google Drive (optional — for media library)
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Bước 3: Chạy

```bash
# Development
node server.js

# Hoặc với nodemon (auto-restart)
npx nodemon server.js
```

Mở: `http://localhost:3000`
Admin: `http://localhost:3000/admin`

---

## 📁 Cấu trúc dự án

```
EasyRevise/
├── server.js              # Entry point (113 dòng)
├── .env                   # API keys & config
│
├── lib/                   # Backend shared modules
│   ├── auth.js            # Auth middleware, rate limit
│   ├── data.js            # JSON read/write helpers
│   ├── drive.js           # Google Drive API
│   ├── backup.js          # Daily auto-backup (7 bản)
│   ├── ai-helpers.js      # AI SDK abstraction
│   └── validate.js        # Input validation
│
├── routes/                # Express Router modules (17 files)
│   ├── auth.js            # Register, login
│   ├── exams.js           # CRUD exams
│   ├── sections.js        # CRUD sections
│   ├── questions.js       # CRUD questions
│   ├── codes.js           # Access codes + QR
│   ├── submit.js          # Submit exam + grading
│   ├── ai-generate.js     # AI exam generation
│   ├── ai-tools.js        # OCR + explain-wrong
│   ├── media-library.js   # Media management
│   └── ...
│
├── data/                  # JSON data store
│   ├── exams.json
│   ├── users.json
│   ├── settings.json
│   └── backups/
│
├── public/                # Frontend
│   ├── index.html         # Student homepage
│   ├── exam.html          # Exam taking
│   ├── result.html        # Result display
│   ├── css/style.css      # Stylesheet
│   ├── js/                # Student JS
│   └── admin/             # Admin panel (16 JS modules)
│
└── tests/                 # Automated tests
```

---

## 📊 Loại câu hỏi

| Loại | Mô tả | Chấm điểm |
|---|---|---|
| `multiple-choice` | Trắc nghiệm A/B/C/D | ✅ Tự động |
| `reading` | Trắc nghiệm + đoạn văn | ✅ Tự động |
| `fill-in-blank` | Điền chỗ trống (text/number/dropdown) | ✅ Tự động |
| `writing-essay` | Viết luận + upload bài tay | 🤖 AI chấm |
| `free-form` | Tự luận nhiều phần (a, b, c) | 🤖 AI chấm |

---

## 🔧 Admin Panel

Truy cập: `/admin` → Nhập PIN (mặc định: `123456`)

| Tab | Chức năng |
|---|---|
| 📝 Đề thi | CRUD đề, section, câu hỏi, export/import JSON |
| 👥 Tài khoản | Quản lý user, role (admin/user) |
| 📊 Mã kích hoạt | Tạo mã, QR code, theo dõi sử dụng |
| 📋 Bài nộp | Xem bài, AI chấm, override điểm, export CSV |
| 📚 Ngân hàng | Câu hỏi tái sử dụng, import từ đề, AI extract |
| ⚙️ Cài đặt | PIN, model AI, tên site |
| 🤖 AI Tạo Đề | Dán ảnh/text → AI sinh đề hoàn chỉnh |

---

## 📄 Documentation

| File | Mô tả |
|---|---|
| [PROJECT.md](./PROJECT.md) | Tài liệu kỹ thuật chi tiết (schema, routes, modules) |
| [PLAN_UI_OVERHAUL.md](./PLAN_UI_OVERHAUL.md) | Plan tân trang UI (đang thực hiện) |
| [PLAN_STORAGE.md](./PLAN_STORAGE.md) | Plan migration storage → Google Drive |
| [PLAN_QUICKWINS.md](./PLAN_QUICKWINS.md) | Quick wins UX improvements |

---

## 📝 License

[MIT License](./LICENSE) — Xem file LICENSE để biết chi tiết.

---

<p align="center">Made with ❤️ by <a href="https://thinhme.tech">thinhme.tech</a></p>

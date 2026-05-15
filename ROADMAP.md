# 🗺️ EasyRevise — Roadmap

> **Replaces:** PLAN_PHASE1-8, PLAN_BUGFIX, PLAN_ESSAY_FIX, PLAN_QUICKWINS, PLAN_REFACTOR, PLAN_STORAGE, PLAN_UI_OVERHAUL.
> **Status legend:** ✅ Done · 🔄 In progress · ⏳ Planned · 🚫 Cancelled
> **Cập nhật:** 2026-05-14

---

## 📜 Lịch sử (đã hoàn thành)

| Phase | Tên | Trạng thái | Tài liệu nguồn |
|---|---|---|---|
| 1 | Bug fixes + multi-image + OCR + notification | ✅ | PLAN_PHASE1.md |
| 2 | AI 6 loại câu + LaTeX/KaTeX + AI preview edit | ✅ | PLAN_PHASE2.md |
| 3 | Essay upload + AI auto-grade + per-feature model | ✅ | PLAN_PHASE3.md |
| 4 | Security upload + bug fixes + PDF→image + backup | ✅ | PLAN_PHASE4.md |
| 5 | autoGrade toggle + showExplanation + flexible blanks | ✅ | PLAN_PHASE5.md |
| 6 | Duplicate exam + QR code + LaTeX toolbar + explain-wrong | ✅ | PLAN_PHASE6.md |
| BUG | Crash guard + body parser + sanitize + login rate-limit | ✅ | PLAN_BUGFIX.md, PLAN_ESSAY_FIX.md |
| 7 | Question Bank + Print + Drag-drop + Bulk delete + Search | ✅ | PLAN_PHASE7.md |
| Refactor | server.js 2,378→113L + admin.js → 16 modules | ✅ | PLAN_REFACTOR.md |
| 8 | pbkdf2 + token expiry + rate-limit + validate.js + tests | ✅ | PLAN_PHASE8.md |
| 9 | Google Drive integration + Media Library | ✅ | PLAN_STORAGE.md |
| UI | CSS modules + dark mode + dashboard + animations | ✅ | PLAN_UI_OVERHAUL.md |

---

## 🎯 Hiện tại (2026-05-14)

**Tình trạng:** MVP đầy đủ tính năng nhưng **chưa production-ready** về security & scalability.

**Kết quả audit:**
- 9 lỗ hổng CRITICAL
- 13 vấn đề HIGH severity
- 16 vấn đề MEDIUM
- Risk score 7.8/10 (HIGH)

**Tham khảo:** `AUDIT_REPORT.md` (báo cáo đầy đủ) · `SECURITY_FIXES.md` (working checklist).

**Nguyên tắc trong giai đoạn tiếp theo:** **DỪNG thêm feature** trong 30 ngày. Tập trung security + DB migration. Sau đó mới quay lại feature mới.

---

## 🚀 SPRINT 1 — Security Hotfix (Tuần 1, ~5 ngày)

**Mục tiêu:** Bịt 9 lỗ hổng CRITICAL. Code base sau sprint 1 phải an toàn để mở public.

| Task | Effort | Owner | Acceptance |
|---|---|---|---|
| ⏳ C1 — XSS escape trong `submissions.js` | 5 phút | | Penetration test với `<img onerror=...>` không trigger |
| ⏳ C2 — Validate token trong `upload-submission` | 30 phút | | curl với fake Bearer trả 401 |
| ⏳ C3 — Bỏ SVG khỏi media.js mime regex | 2 phút | | Upload SVG → 400 |
| ⏳ C4 — Magic-byte verify (`file-type` lib) | 4 giờ | | Đổi tên `.html`→`.jpg` upload → 400 |
| ⏳ C5 — Crypto random code + verify rate-limit | 1 giờ | | 6 lần verify-code/phút → 429 |
| ⏳ C6 — Auth check `cancel-code` | 30 phút | | Cancel code người khác → 401/403 |
| ⏳ C7 — Hide PII trong `preview-code` (non-admin) | 1 giờ | | Public POST chỉ trả `usedCount`, không có `displayName` |
| ⏳ C8 — Atomic write + lockfile cho JSON | 4 giờ | | 10 concurrent writes → không mất data |
| ⏳ C9 — Move `/uploads/submissions` → private route | 6 giờ | | URL trực tiếp file người khác → 403 |

**Definition of Done:**
- [ ] Tất cả 9 issues đóng trong `SECURITY_FIXES.md`
- [ ] Manual pentest pass cho từng attack scenario
- [ ] `npm audit` không còn CRITICAL/HIGH advisory chưa giải quyết
- [ ] PROJECT.md cập nhật ngày fix

---

## 🛡️ SPRINT 2 — Auth & Hardening (Tuần 2-3, ~10 ngày)

**Mục tiêu:** Auth đúng chuẩn + observability cơ bản + remove tech debt.

### Tuần 2: Auth migration
- ⏳ H1 — JWT (jsonwebtoken) thay opaque token
- ⏳ H4 — Whitelist role trong PUT /users
- ⏳ H5 — Admin nhập password khi reset (không tự sinh)
- ⏳ H6 — Random admin PIN khi init
- ⏳ H7 — Force migrate simpleHash → pbkdf2 (drop legacy)

### Tuần 3: Hardening
- ⏳ H2 — `app.set('trust proxy', true)`
- ⏳ H3 — Helmet middleware (CSP có nới cho KaTeX)
- ⏳ H8 — Prompt injection guard cho AI grader
- ⏳ H9 — AI grader rate-limit (5 phút/user)
- ⏳ H10 — `npm audit fix` + bump pdf-parse
- ⏳ H11 — uncaughtException → exit 1
- ⏳ H12 — Vercel Cron cho daily backup
- ⏳ H13 — Remove dead deps (mongoose, react, react-dom)

**Definition of Done:**
- [ ] Login flow dùng JWT verifiable offline
- [ ] CSP active, không break KaTeX/YouTube embed
- [ ] Vercel cron chạy backup hàng ngày, có log
- [ ] `package.json` không còn dep không dùng

---

## 🏗️ SPRINT 3 — DB Migration (Tuần 4-5, ~10 ngày)

**Mục tiêu:** Bỏ JSON file → SQLite (single file, transactions, index, sync API).

### Schema (better-sqlite3)
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    role TEXT DEFAULT 'student',
    created_at TEXT NOT NULL
);

CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT,
    year TEXT,
    time_limit INTEGER DEFAULT 0,
    require_code INTEGER DEFAULT 0,
    auto_grade INTEGER DEFAULT 1,
    payload TEXT NOT NULL, -- JSON: sections, settings, etc.
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX idx_exams_subject ON exams(subject);

CREATE TABLE access_codes (
    code TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    max_uses INTEGER DEFAULT 1,
    max_attempts INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_codes_exam ON access_codes(exam_id);

CREATE TABLE code_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL REFERENCES access_codes(code) ON DELETE CASCADE,
    user_id TEXT,
    display_name TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    score REAL,
    result TEXT, -- JSON
    essay_grades TEXT -- JSON
);
CREATE INDEX idx_usages_code ON code_usages(code);
CREATE INDEX idx_usages_user ON code_usages(user_id);

CREATE TABLE submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_usage_id INTEGER REFERENCES code_usages(id) ON DELETE CASCADE,
    question_id TEXT,
    content TEXT,
    attachments TEXT, -- JSON array
    grade TEXT, -- JSON
    created_at TEXT NOT NULL
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    ip TEXT,
    metadata TEXT, -- JSON
    ts TEXT NOT NULL
);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_ts ON audit_log(ts);
```

### Phase A: Repository layer (3 ngày)
- ⏳ Cài `better-sqlite3@11`
- ⏳ Tạo `lib/db.js` — connection + migration runner
- ⏳ Tạo `lib/repos/` — `userRepo.js`, `examRepo.js`, `codeRepo.js`, `submissionRepo.js`, `auditRepo.js`
- ⏳ Mỗi repo có API tương đương `readData/writeData/find/insert/update/delete`

### Phase B: Migration script (1 ngày)
- ⏳ `scripts/migrate-json-to-sqlite.js`: đọc JSON files → insert vào SQLite
- ⏳ Chạy thử trên dev environment
- ⏳ Verify counts khớp

### Phase C: Swap routes (4 ngày)
- ⏳ Replace `readData/writeData` calls trong `routes/*.js` bằng repo
- ⏳ Auth middleware đọc từ `sessions` table (cache 5 phút trong Map)
- ⏳ Smoke test 6 flow chính
- ⏳ Audit log mọi admin action

### Phase D: Cleanup (2 ngày)
- ⏳ Remove `lib/data.js` (giữ alias mỏng nếu cần)
- ⏳ Update PROJECT.md schema section
- ⏳ Backup strategy: SQLite → S3/Drive cron

**Definition of Done:**
- [ ] `data/easyrevise.db` thay 6 file JSON
- [ ] 10 concurrent submissions không lỗi
- [ ] Auth lookup < 5ms (đã có index + cache)
- [ ] Audit log có entry cho mọi admin action

---

## 📊 SPRINT 4 — Observability + CI (Tuần 6, ~5 ngày)

- ⏳ M4 — Sentry free tier setup
- ⏳ M4 — Pino structured logging
- ⏳ `/api/health` endpoint (check DB readable)
- ⏳ M5 — GitHub Actions: install → npm test → eslint → npm audit
- ⏳ ESLint + Prettier config
- ⏳ M6 — Supertest integration tests cho 6 flow
- ⏳ Coverage báo cáo (target 60%)

**Definition of Done:**
- [ ] Mọi error 500 đều push lên Sentry với context user
- [ ] CI chạy trên mọi PR, fail nếu test fail hoặc lint error
- [ ] Coverage badge trong README

---

## ⚡ SPRINT 5 — Frontend cleanup (Tháng 2)

- ⏳ M7 — Split `public/js/app.js` (1,400L) → 4-5 module
- ⏳ M7 — Split `public/js/result.js` (800L) → 3 module
- ⏳ M8 — Quyết định fate của `public/redesign-vintage/`: merge hoặc delete
- ⏳ Frontend bundling với esbuild → 1 file gzipped < 200KB
- ⏳ H14 — Move JWT từ localStorage → httpOnly cookie
- ⏳ H15 — CSRF token (double-submit pattern)
- ⏳ TypeScript progressive: lib/ → routes/ → public/js/ (start với type definitions)

---

## 🚦 SPRINT 6+ — Scalability (Tháng 3+)

### Khi vượt 200 concurrent users
- ⏳ Postgres migration (Neon/Supabase free tier)
- ⏳ Redis Upstash cho rate-limit + token cache
- ⏳ BullMQ + Redis cho AI grading queue
- ⏳ Move `/uploads` → S3/R2 với signed URL
- ⏳ Multi-tenancy: workspace_id trong mọi bảng
- ⏳ Worker process tách khỏi web (Fly.io/Railway)

### Khi vượt 1000 concurrent users
- ⏳ Read replica Postgres
- ⏳ CDN cho assets (Cloudflare)
- ⏳ Edge function cho auth check
- ⏳ Connection pool (pgBouncer)
- ⏳ Sharding theo workspace nếu cần

---

## 🎁 PRODUCT FEATURES (sau khi infra ổn định)

### Tier 1 — Quan trọng cho user thật
- ⏳ Forgot password flow (email magic link)
- ⏳ Email/SMS notification khi AI chấm xong
- ⏳ Bulk export điểm Excel (xlsx)
- ⏳ Class/Group: phân lớp học sinh, gán đề theo lớp
- ⏳ Teacher role (tách khỏi admin) — chỉ xem bài lớp mình
- ⏳ Audit log UI cho admin

### Tier 2 — Differentiators
- ⏳ Plagiarism check giữa các bài essay
- ⏳ Anti-cheat: tab switch detection, fullscreen exit alert
- ⏳ Question recommendation engine (dựa history sai)
- ⏳ Spaced repetition cho câu sai
- ⏳ AI explain trong khi đang ôn (mở rộng explain-wrong)
- ⏳ Audio question (listening section)
- ⏳ PWA: service worker, offline mode, install prompt
- ⏳ OAuth login (Google, Microsoft)

### Tier 3 — Monetization
- ⏳ Per-class subscription (giáo viên trả phí)
- ⏳ AI credit pool (admin mua credit, học sinh dùng "explain wrong")
- ⏳ White-label cho trường tư
- ⏳ Webhook integration với Google Classroom, Moodle

### Tier 4 — Nice-to-have
- ⏳ Multi-language UI (tiếng Anh, tiếng Hàn?)
- ⏳ Time-zone aware
- ⏳ Live exam: timer chung, leaderboard real-time (WebSocket)
- ⏳ Adaptive difficulty
- ⏳ 2FA cho admin (TOTP)
- ⏳ Mobile app native (React Native?)

---

## 🎯 30-DAY PLAN

```
Tuần 1: Sprint 1 — Security hotfix (9 CRITICAL)
Tuần 2: Sprint 2 phần A — Auth migration (JWT, role, PIN, simpleHash)
Tuần 3: Sprint 2 phần B — Hardening (helmet, prompt inj, npm audit, cron)
Tuần 4: Sprint 3 phần A+B — DB repos + migration script
```

**End state:** An toàn cho public deploy, audit log, observability cơ bản, sẵn sàng migrate DB.

---

## 🎯 90-DAY PLAN

```
Tháng 1: Sprint 1-3 (Security + Auth + DB SQLite)
Tháng 2: Sprint 4-5 (Observability, CI/CD, Frontend cleanup)
Tháng 3: Tier 1 features (forgot password, classes, teacher role) + bắt đầu TS migration
```

**End state:** Production-ready, multi-class deployment, có notification, có audit, có CI.

---

## 🎯 10X TRAFFIC PLAN (6 tháng)

```
┌──────────────────────────────────────────────────────────┐
│  CDN (Cloudflare/Vercel Edge)                            │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Web tier (Vercel/Fly.io) — stateless, autoscale         │
│  ├── Auth (JWT + httpOnly cookie + Redis session)        │
│  ├── Routes (TS + Zod validation)                        │
│  └── Worker dispatch (BullMQ)                            │
└────────┬──────────────────┬──────────────────┬───────────┘
         │                  │                  │
   ┌─────▼─────┐      ┌─────▼─────┐      ┌────▼─────┐
   │ Postgres  │      │ Redis     │      │ Worker   │
   │ (Neon)    │      │ (Upstash) │      │ (Fly.io) │
   │ - exams   │      │ - rate    │      │ - AI grade│
   │ - users   │      │ - cache   │      │ - PDF→PNG │
   │ - audit   │      │ - queue   │      │ - backup  │
   └───────────┘      └───────────┘      └──────────┘
                                              │
                                       ┌──────▼──────┐
                                       │ S3/R2       │
                                       │ - uploads   │
                                       │ - backups   │
                                       │ - AI cache  │
                                       └─────────────┘
```

**Capacity target:** 2,000 concurrent users, 100 exam submissions/phút, 500 AI grading/giờ.
**Cost target:** dưới $50/tháng cho infra (free tier Vercel + Neon + Upstash + Cloudflare R2).

---

## 🛠️ Stack Evolution

| Layer | Now | 30-day | 90-day | 10x |
|---|---|---|---|---|
| Lang | JS | JS | TS partial | TS full |
| Backend | Express | Express | Express + Zod | Fastify + Zod |
| DB | JSON | SQLite | SQLite/Postgres | Postgres + read replica |
| Cache/Queue | None | None | Node-cache | Redis Upstash + BullMQ |
| Auth | base64 token | JWT localStorage | JWT cookie + CSRF | Auth.js / Clerk |
| File | Local + Drive | Same + private route | Drive + signed URL | S3/R2 + signed URL |
| AI | h2cloud OpenAI-compat | Same + cache | Same + queue | Same + LangSmith |
| Frontend | Vanilla JS | Vanilla + bundling | Vanilla TS | SvelteKit / Astro? |
| Test | jest minimal | jest + supertest | + playwright | + property tests |
| CI | None | GitHub Actions | + Renovate | + e2e nightly |
| Monitor | console.log | Sentry + pino | + dashboard | + Datadog/Grafana |

---

## 📝 Process Notes

### Branching strategy
- `main` — production, deploy tự động Vercel
- `develop` — integration branch
- `feature/sprint-N-task-X` — feature branches
- PR phải pass CI (sau khi setup)

### Commit convention
```
type(scope): description

feat(auth): add JWT signing and verification
fix(submit): prevent upload bypass via fake Bearer
chore(deps): remove unused mongoose
docs(audit): update SECURITY_FIXES status
```

### Update PROJECT.md
Sau mỗi PR merge, update PROJECT.md ở:
- Section bug fixes nếu là bug
- Section feature status nếu là feature
- Last updated timestamp

### Sprint review (mỗi 2 tuần)
- Review checklist `SECURITY_FIXES.md`
- Update `ROADMAP.md` status
- Document blockers
- Plan tuần tiếp theo

# EasyRevise — Kế Hoạch Fix Bug & Bảo Mật

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Làm theo thứ tự từ trên xuống. Xong task → đánh `[x]` + ghi nhật ký.
> Trạng thái hiện tại: **Chưa có fix nào được áp dụng — server.js đang ở trạng thái gốc**
> Last updated: 2026-03-27T11:49+07:00

---

## 📚 Bối cảnh dự án — ĐỌC TRƯỚC KHI CODE

### Đây là dự án gì?
**EasyRevise** — hệ thống thi trắc nghiệm + tự luận trực tuyến cho trường học.
- Server: Node.js + Express, chạy trên Windows VPS
- Database: JSON files (exams.json, users.json, settings.json, subjects.json) trong thư mục `data/`
- Frontend: Vanilla HTML/CSS/JS trong thư mục `public/`
- Admin panel: `public/admin/`

### File quan trọng nhất
```
server.js          ← 1974 dòng, chứa toàn bộ API backend (file cần sửa trong task này)
data/exams.json    ← Toàn bộ đề thi + bài nộp học sinh
data/users.json    ← Tài khoản giáo viên/học sinh
public/js/result.js ← Trang kết quả bài thi (có route explain-wrong)
```

### Cấu trúc dữ liệu cốt lõi trong exams.json
```json
{
  "exams": [{
    "id": "uuid",
    "sections": [
      {
        "id": "uuid",
        "type": "multiple-choice" | "writing-essay" | "free-form" | "fill-in-blank",
        "prompt": "Đề bài (dùng cho writing-essay)",
        "instruction": "Đề bài (dùng cho free-form — KHÁC với prompt!)",
        "sampleAnswer": "Đáp án mẫu",
        "questions": [{ "id": "uuid", "question": "...", "correctAnswer": 0 }]
      }
    ],
    "accessCodes": [{
      "code": "ABC123",
      "maxUses": 30,
      "usedBy": [{
        "userId": "anonymous",
        "completed": true,
        "completedAt": "2026-03-27T...",
        "result": { "results": [...] },
        "essayGrades": [{ "questionId": "uuid", "aiScore": 7.5, "aiFeedback": "..." }],
        "aiExplainUsed": 0
      }]
    }]
  }]
}
```

### AI grading pipeline (quan trọng để hiểu trước khi sửa)
Khi học sinh nộp bài → `POST /api/exams/:examId/code-result`:
1. Lưu kết quả vào `usedBy[]`
2. Trả về `res.json({ success: true })` ngay
3. Chạy background: chấm fill-blank (không cần AI) + chấm essay (gọi AI)
4. Logic chấm essay ở dòng **616–714** trong server.js

---

## Tóm tắt fix cần làm (5 fix ưu tiên)

| # | Fix | Dòng | Mức |
|---|---|---|---|
| FIX-1 | Crash guard — server không tắt khi nhận payload lớn | ~7, ~16 | 🔴 Ngay |
| FIX-2 | Body parser trả 413 thay vì crash | ~16 | 🔴 Ngay |
| FIX-3 | Section detection sai → AI chấm sai đề | 618 | 🔴 Ngay |
| FIX-4 | Free-form nhận đề bài rỗng (sai field name) | 654 | 🔴 Ngay |
| FIX-5 | explain-wrong tìm sai bài nộp (sai học sinh) | 1855, 1865 | 🔴 Ngay |

> Fix 6–9 (rate limit login, input validation, disable register) là nâng cấp bảo mật, làm sau.

---

## FIX-1 & 2: Crash guard + Body parser an toàn

### Vấn đề
Gửi JSON body 11MB → server crash hoàn toàn, tắt hẳn, mọi học sinh mất kết nối.
Đã xác nhận bằng live test.

### Sửa — thêm vào đầu server.js (sau dòng 6, trước `const app = ...`)

```js
// ========================
// Crash Guard — prevent server shutdown
// ========================
process.on('uncaughtException', (err) => {
    console.error(`[CRASH PREVENTED] ${new Date().toISOString()}:`, err.message);
    console.error(err.stack);
    // Không gọi process.exit() — server tiếp tục chạy
});
process.on('unhandledRejection', (reason) => {
    console.error(`[CRASH PREVENTED] unhandledRejection:`, String(reason));
});
```

### Sửa — thay dòng 16 (body parser)

```js
// TRƯỚC (dòng 16):
app.use(express.json({ limit: '10mb' }));

// SAU — trả 413 thay vì crash:
app.use((req, res, next) => {
    express.json({ limit: '10mb' })(req, res, (err) => {
        if (err && err.type === 'entity.too.large') {
            return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn (tối đa 10MB)' });
        }
        if (err) return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
        next();
    });
});
```

**Checklist FIX-1+2:**
- [x] Thêm crash guard 2 dòng `process.on(...)` vào `server.js` sau dòng 6
- [x] Thay dòng 16 bằng body parser mới
- [ ] Restart server, test gửi payload 11MB → phải nhận 413, server vẫn sống

---

## FIX-3: Section detection sai khi chấm essay

### Vấn đề
**`server.js` dòng 618** — đang là:
```js
const section = exam.sections.find(s =>
    s.id === r.id || s.type === 'writing-essay' || s.type === 'free-form'
);
```
Vì có `||` với type check, hệ thống luôn trả về section essay ĐẦU TIÊN trong đề, dù đang chấm câu nào. Đề có 2 phần tự luận → luôn dùng đề bài của phần 1.

### Sửa dòng 618

```js
// SAU — tìm section CHỨA câu hỏi này trước; fallback mới dùng type:
const section = exam.sections.find(s =>
    s.id === r.id ||
    (s.questions || []).some(q => String(q.id) === String(r.id))
) || exam.sections.find(s => s.type === 'writing-essay' || s.type === 'free-form');
```

**Checklist FIX-3:**
- [x] Sửa dòng 618 trong `server.js`

---

## FIX-4: Free-form nhận đề bài rỗng

### Vấn đề
**`server.js` dòng 654** — đang là:
```js
Câu hỏi/Đề bài: ${section.prompt || '(không có)'}
Đáp án mẫu: ${section.sampleAnswer || '(không có)'}
```

- `writing-essay` sections: lưu đề bài ở `section.prompt` → đúng
- `free-form` sections: lưu đề bài ở `section.instruction` (KHÁC field) → AI luôn thấy "(không có)"

### Sửa — thêm 2 dòng trước gradingPrompt (khoảng dòng 652)

```js
// Thêm trước khi build gradingPrompt:
const sectionPrompt = section.prompt
    || section.instruction
    || section.essayPrompt
    || section.passage
    || '(không có)';
const sectionSample = section.sampleAnswer
    || section.sampleEssay
    || section.expectedAnswer
    || '(không có)';
```

Rồi cập nhật gradingPrompt dùng 2 biến mới:
```js
Câu hỏi/Đề bài: ${sectionPrompt}
Đáp án mẫu: ${sectionSample}
```

**Checklist FIX-4:**
- [x] Thêm biến `sectionPrompt` và `sectionSample` trước phần build gradingPrompt (~dòng 652)
- [x] Cập nhật gradingPrompt dùng 2 biến mới thay vì `section.prompt` và `section.sampleAnswer`

---

## FIX-5: explain-wrong tìm sai bài nộp

### Vấn đề
**`server.js` dòng 1865** — đang là:
```js
const usage = [...codeObj.usedBy].reverse().find(u => u.completed && u.result);
```
Tìm bài nộp MỚI NHẤT của mã này, không quan tâm ai. Nếu 2 học sinh dùng cùng mã, học sinh A hỏi AI sẽ nhận giải thích dựa trên bài của học sinh B.

### Thay đổi 2 chỗ:

**Chỗ 1 — Dòng 1855 (destructure body):**
```js
// TRƯỚC:
const { code, questionId, userAnswer, correctAnswer, questionText, options, explanation } = req.body;

// SAU — thêm userId và completedAt:
const { code, questionId, userAnswer, correctAnswer, questionText, options, explanation, userId, completedAt } = req.body;
```

**Chỗ 2 — Dòng 1865 (tìm usage):**
```js
// TRƯỚC:
const usage = [...codeObj.usedBy].reverse().find(u => u.completed && u.result);

// SAU — tìm đúng người, fallback về mới nhất:
const usage = [...codeObj.usedBy].reverse().find(u =>
    u.completed && u.result &&
    (userId ? u.userId === userId : true) &&
    (completedAt ? u.completedAt === completedAt : true)
) || [...codeObj.usedBy].reverse().find(u => u.completed && u.result);
```

### Cần update `result.js` — gửi thêm userId + completedAt

Tìm hàm fetch tới `/api/exams/:examId/explain-wrong` trong `public/js/result.js` và thêm 2 field vào body:
```js
body: JSON.stringify({
    // ... các field hiện có ...
    userId: /* lấy từ localStorage hoặc sessionStorage hoặc results data */,
    completedAt: /* lấy từ results.completedAt hoặc tương đương */
})
```
> Cần xem `result.js` để biết data được lưu ở đâu (localStorage key, biến global, v.v.)

**Checklist FIX-5:**
- [x] Sửa dòng 1855: thêm `userId`, `completedAt` vào destructure
- [x] Sửa dòng 1865: logic tìm usage theo userId+completedAt
- [x] Xem hàm explain-wrong trong `public/js/result.js` → thêm `userId` + `completedAt` vào request body

---

## Fix nâng cấp bảo mật (làm sau FIX-1 đến FIX-5)

### FIX-6: Input validation — code phải là string
Thêm helper vào phần Helper Functions (dòng ~74):
```js
function sanitizeCode(raw) {
    if (!raw || typeof raw !== 'string') return null;
    return raw.toUpperCase().trim();
}
```
Dùng `sanitizeCode(req.body.code)` thay cho `(req.body.code || '').toUpperCase().trim()` trong các routes:
- verify-code (dòng ~435)
- preview-code (dòng ~489)
- cancel-code (dòng ~471)
- code-result (dòng ~541)
- explain-wrong (dòng ~1861)

### FIX-7: Rate limit login
Thêm vào phần Helper Functions (sau sanitizeCode):
```js
const _loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 3 * 60 * 1000;
function checkLoginRateLimit(ip) {
    const now = Date.now();
    const rec = _loginAttempts.get(ip);
    if (!rec || now > rec.resetAt) {
        _loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return true;
    }
    rec.count++;
    return rec.count <= LOGIN_MAX;
}
setInterval(() => {
    const now = Date.now();
    for (const [ip, rec] of _loginAttempts) { if (now > rec.resetAt) _loginAttempts.delete(ip); }
}, 5 * 60 * 1000);
```
Dùng trong route login (dòng ~124):
```js
const ip = req.ip || req.connection?.remoteAddress || 'unknown';
if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Đăng nhập quá nhiều lần. Vui lòng thử lại sau 3 phút.' });
}
```

### FIX-9 (optional): Tắt đăng ký mở
Đầu route `POST /api/auth/register` (dòng ~103):
```js
if (process.env.ALLOW_REGISTER !== 'true') {
    return res.status(403).json({ error: 'Đăng ký tài khoản đã bị tắt' });
}
```
Thêm vào `.env`: `ALLOW_REGISTER=false`

---

## Thứ tự thực hiện

```
Bước 1: FIX-1 + FIX-2  (crash guard + body parser)   ~10 phút
Bước 2: FIX-3 + FIX-4  (auto-grade section + prompt)  ~10 phút
Bước 3: FIX-5          (explain-wrong + result.js)    ~15 phút
Bước 4: FIX-6 + FIX-7  (input validation + rate limit) ~15 phút
Bước 5: FIX-9          (tắt đăng ký mở)              ~5 phút
```

Sau mỗi nhóm fix → restart server → test lại route đó trực tiếp.

---

## Kiểm tra sau khi xong

```
1. Gửi 11MB JSON → phải nhận 413, server vẫn sống
2. Gửi {"code": {"$gt": ""}} → phải nhận 400 (không phải 500)
3. Login sai 11 lần liên tiếp → lần 11 phải nhận 429
4. Đăng ký tài khoản → phải nhận 403
5. Gửi 2 bài nộp essay khác nhau cùng mã → AI chấm đúng đề bài từng bài
```

---

## 📝 Nhật ký thay đổi

| Thời gian | Fix | Ghi chú |
|---|---|---|
| 2026-03-27T11:49+07:00 | FIX-1+2 | Crash guard (uncaughtException + unhandledRejection) + safe body parser 413/400 |
| 2026-03-27T11:49+07:00 | FIX-3 | Section detection sửa: tìm section chứa câu hỏi trước, fallback mới dùng type |
| 2026-03-27T11:49+07:00 | FIX-4 | Free-form: thêm sectionPrompt/sectionSample, fallback qua instruction/essayPrompt/passage |
| 2026-03-27T11:49+07:00 | FIX-5 | explain-wrong: server dùng userId+completedAt, result.js gửi thêm 2 field |
| 2026-03-27T11:49+07:00 | FIX-6 | sanitizeCode() helper, dùng trong explain-wrong route |
| 2026-03-27T11:49+07:00 | FIX-7 | Login rate limit: tối đa 10 lần / 3 phút / IP |
| 2026-03-27T11:49+07:00 | FIX-9 | Tắt đăng ký mở (403 trừ khi ALLOW_REGISTER=true) |

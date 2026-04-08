# EasyRevise — Kế Hoạch Chi Tiết Phase 3

> ✅ PHASE 3 HOÀN THÀNH — 2026-03-26T11:34+07:00
> Last updated: 2026-03-26T11:38:00+07:00

---

## 🎯 Mục tiêu Phase 3

Học sinh **nộp bài tự luận bằng ảnh/PDF**, AI chấm điểm tự động,
giáo viên xem và **review/override điểm** trực tiếp trong admin panel.

**3 phần chính:**
1. Học sinh upload ảnh/PDF bài tự luận khi nộp bài
2. AI tự động chấm điểm bài tự luận
3. Dashboard giáo viên review + override điểm AI

---

## 🔍 Phân tích hiện trạng

### Luồng nộp bài hiện tại (app.js `submitExam()`):
```
- Tính điểm trắc nghiệm: correct/total*10 → score
- Essay question: isCorrect = null (không chấm)
- Lưu result vào sessionStorage → redirect result.html
- Nếu có mã code: POST /api/exams/:id/code-result { code, result }
- Nếu đăng nhập: POST /api/history { summary }
```

### Vấn đề:
- Câu `writing-essay` (isEssay=true) không được chấm điểm
- Học sinh chỉ có thể gõ text vào ô essay — không upload ảnh/file
- Không có cơ chế nào để giáo viên xem và chấm bài tự luận
- Admin panel không có tab "Bài nộp"

---

## ✅ Danh sách Task

---

### PHẦN A: Học sinh upload bài tự luận

**Thiết kế:**
- Câu `writing-essay` hiện render `<textarea>` (renderEssay)
- Thêm nút **"📷 Upload ảnh/PDF bài làm"** bên dưới textarea
- Học sinh có thể vừa gõ text, vừa upload ảnh (hoặc chỉ 1 trong 2)
- File upload tối đa: 10MB, hỗ trợ jpg/png/webp/pdf
- Hiển thị thumbnail preview sau khi upload thành công
- Khi nộp bài: URL file đính kèm lưu vào `userAnswers[essayId].attachments[]`

**Route mới:**
```
POST /api/upload-submission
Auth: Bearer token hoặc x-access-code
Body: FormData { file: File, examId, questionId }
Response: { url: "/uploads/submissions/filename.jpg" }
```

**Files cần sửa:**

- [x] `server.js`: Thêm route `POST /api/upload-submission`
  - Multer lưu vào `public/uploads/submissions/`
  - Chấp nhận jpg/png/webp/pdf, tối đa 10MB
  - Không cần adminOnly (học sinh dùng)

- [x] `public/js/app.js` — `renderEssay()`:
  - Thêm khu vực upload dưới textarea
  - Hàm `uploadSubmissionFile(questionId, file)` → POST lên server → lưu URL
  - Hiển thị thumbnail/tên file sau khi upload
  - Lưu `attachments[]` vào `userAnswers[questionId]`

- [x] `public/exam.html`: CSS cho khu vực upload trong essay section

---

### PHẦN B: AI tự động chấm bài tự luận

**Thiết kế luồng:**
1. Học sinh nộp bài → `submitExam()` gửi kết quả lên server
2. Server nhận kết quả → với mỗi câu essay (isEssay=true) → chạy AI chấm

**Route mới:**
```
POST /api/admin/ai-grade-essay
Auth: AdminOnly
Body: {
  examId,
  code,          ← để lấy bài nộp của học sinh
  questionId,
  studentAnswer: "text gõ vào",
  attachments: ["/uploads/submissions/abc.jpg"],
  sampleAnswer: "đáp án mẫu từ section",
  rubric: "tiêu chí chấm (optional)"
}
Response: {
  score: 7,        ← trên 10
  maxScore: 10,
  feedback: "Bài làm đúng hướng...",
  breakdown: "Ý 1: 3đ, Ý 2: 4đ..."
}
```

**Prompt AI cho chấm bài:**
```
Bạn là giáo viên chấm bài. Dưới đây là:
- Câu hỏi: {question.prompt}
- Đáp án mẫu: {section.sampleAnswer}
- Bài làm của học sinh: {studentAnswer}
(+ ảnh bài làm nếu có)

Hãy chấm điểm theo thang 10, cho biết:
1. Điểm số (số nguyên hoặc thập phân X.X)
2. Nhận xét chi tiết (đúng phần nào, sai phần nào)
3. Breakdown điểm từng ý (nếu có thể)

Trả về JSON: { "score": 7, "maxScore": 10, "feedback": "...", "breakdown": "..." }
```

**Tự động chấm khi nộp bài (optional — làm nếu đủ thời gian):**
- Khi học sinh nộp bài → server nhận `/api/exams/:id/code-result`
- Server tự động gọi AI chấm cho mỗi câu essay trong background
- Lưu kết quả AI vào `usage.essayGrades[]`

**Files cần sửa:**

- [x] `server.js`: Thêm route `POST /api/admin/ai-grade-essay`
- [x] (Optional) Sửa route `POST /api/exams/:id/code-result`: tự động trigger AI grading trong background

---

### PHẦN C: Dashboard giáo viên review bài nộp

**Thiết kế tab mới "📋 Bài nộp" trong admin panel:**

```
[📋 Bài nộp]

Lọc theo đề: [dropdown chọn đề]

┌─────────────────────────────────────────────────────┐
│ Học sinh: Nguyễn Văn An                              │
│ Đề: Đề Toán Giữa Kỳ II  │  Mã: ABC123              │
│ Nộp lúc: 25/03/2026 18:30  │  Điểm MC: 8.5/10       │
├─────────────────────────────────────────────────────┤
│ Câu Tự Luận — Phần Viết                             │
│   Bài gõ: "Đề bài yêu cầu..."                       │
│   Ảnh đính kèm: [🖼 Xem ảnh]                        │
│   AI chấm: 7/10  │  "Đúng hướng nhưng thiếu..."    │
│                                                      │
│   [✅ Xác nhận điểm AI: 7]  [✏️ Sửa điểm: ___]     │
│   [💬 Ghi nhận xét riêng cho học sinh]              │
└─────────────────────────────────────────────────────┘
```

**Dữ liệu cần lưu trong `usage` object (code-result):**
```json
{
  "userId": "...",
  "completed": true,
  "result": { ...summary... },
  "essayGrades": [
    {
      "questionId": "sec-1",
      "aiScore": 7,
      "aiMaxScore": 10,
      "aiFeedback": "...",
      "teacherScore": null,
      "teacherFeedback": null,
      "reviewedAt": null
    }
  ]
}
```

**Route mới:**
```
GET  /api/admin/submissions?examId=xxx      ← danh sách bài nộp
POST /api/admin/submissions/review          ← giáo viên ghi điểm/nhận xét
Body: { examId, code, userId, questionId, teacherScore, teacherFeedback }
```

**Files cần sửa/thêm:**

- [x] `server.js`:
  - Route `GET /api/admin/submissions` → trả danh sách usage đã completed, kèm essay content
  - Route `POST /api/admin/submissions/review` → lưu `teacherScore`, `teacherFeedback` vào usage

- [x] `public/admin/index.html`:
  - Thêm tab "📋 Bài nộp" vào sidebar
  - Panel hiển thị danh sách + filter theo đề

- [x] `public/admin/admin.js`:
  - Hàm `switchTab('submissions')` → load bài nộp
  - Hàm `loadSubmissions(examId)` → GET /api/admin/submissions
  - Hàm `renderSubmissions(data)` → render danh sách
  - Hàm `aiGradeEssay(examId, code, questionId, ...)` → call AI grading route
  - Hàm `reviewSubmission(...)` → POST review, cập nhật UI

---

## 📋 Thứ tự thực hiện

```
1. PHẦN A: Upload bài nộp      [~45 phút] ← Server route + exam UI
2. PHẦN C: Dashboard admin     [~2 giờ]   ← Tab mới, routes, render
3. PHẦN B: AI chấm tự động     [~1 giờ]   ← AI route + tích hợp
   (Phần B làm sau C vì C cần UI để test AI grading)
```

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-03-26T01:27+07:00 | PHẦN A: Upload bài nộp | Route POST /api/upload-submission, renderEssay() upload zone + thumbnail, submitExam() lưu attachments |
| 2026-03-26T01:27+07:00 | PHẦN B: AI chấm tự động | Route POST /api/admin/ai-grade-essay, lưu vào usage.essayGrades |
| 2026-03-26T01:27+07:00 | PHẦN C: Dashboard giáo viên | Tab "📋 Bài nộp", GET /api/admin/submissions, POST /api/admin/submissions/review |
| 2026-03-26T02:02+07:00 | Auto-grade khi nộp bài | code-result: fill-in-blank so sánh tức thì, essay AI async background. GET /api/exams/:id/my-grades |
| 2026-03-26T02:04+07:00 | Banner "Đang chấm..." | result.html + result.js: polling 4s, đếm giây, banner xanh khi xong, timeout >3 phút |
| 2026-03-26T02:26+07:00 | Free-form question | app.js renderFreeForm() sub-part inputs + upload; submitExam() serialize; result.js flatten + render |
| 2026-03-26T02:33+07:00 | AI grade cards | updateEssayGradeCards(): score badge + feedback + breakdown + GV override card |
| 2026-03-26T02:08+07:00 | Fix dotenv brackets | path.resolve(__dirname, '.env') để dotenv đọc đúng với folder [brackets] |
| 2026-03-26T11:34+07:00 | Auto-recover AI tab | visibilitychange + switchTab('aiGen') restore từ NotificationManager localStorage |
| 2026-03-26T11:34+07:00 | Per-feature model config | generateModel, gradeModel, ocrModel trong settings.json + Settings UI + server routes |
| 2026-03-26T11:34+07:00 | importAIResult() bổ sung | blanks, subParts giữ lại khi import AI đề |
| 2026-03-26T11:34+07:00 | Preview badge fill/free | type-fillin, type-freeform badge trong AI preview; blanks/subParts hiển thị |
| 2026-03-26T11:34+07:00 | Free-form result.js | flatten free-form section, render sub-parts + attachments + sampleAnswer + grade slot |

---

## ⚙️ Hướng dẫn cho AI agent

1. Phase 3 ✅ HOÀN THÀNH
2. Cập nhật PLAN_PHASE4.md khi có yêu cầu tiếp theo

---

## 🎁 Tính năng bonus (ngoài plan gốc, đã thêm trong Phase 3)

- ✅ **Auto-recover AI Generate** — `visibilitychange` + `switchTab('aiGen')` tự khôi phục result từ localStorage khi quay lại tab
- ✅ **Per-feature model config** — `generateModel`, `gradeModel`, `ocrModel` trong Settings UI + server
- ✅ **importAIResult() bổ sung** — giữ lại `blanks`, `subParts` khi import đề AI
- ✅ **Preview badge fill/free** — type-fillin, type-freeform badge + hiện nội dung blanks/subParts trong AI preview
- ✅ **AI exam prompt nâng cấp** — 6 loại section, LaTeX mandatory, schema fill-in-blank + free-form

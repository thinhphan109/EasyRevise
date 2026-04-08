# EasyRevise — Kế Hoạch Chi Tiết Phase 2

> ⚠️ FILE NÀY ĐƯỢC AI AGENT SỬ DỤNG ĐỂ CODE
> Sau khi hoàn thành mỗi task, AI PHẢI cập nhật checkbox và ghi chú vào mục **Nhật ký thay đổi**.
> Last updated: 2026-03-26T01:14:00+07:00

---

## 🎯 Mục tiêu Phase 2

3 tính năng lớn nâng cấp pipeline AI + trải nghiệm admin:

1. **LaTeX / KaTeX** — render công thức toán đẹp
2. **Cải thiện prompt AI** — nhận dạng thêm loại câu `fill-in-blank`, `free-form`; LaTeX output cho đề toán
3. **Preview & Edit workflow** — admin xem và sửa từng câu ngay trong preview trước khi import

---

## ✅ Danh sách Task

---

### TÍNH NĂNG 1: LaTeX / KaTeX render công thức toán

**Hiện trạng:** Prompt AI đề toán đã hướng dẫn dùng `$...$` và `$$...$$`, nhưng trang thi và admin panel chưa render — chỉ hiện plain text.

**Đề xuất:** Dùng **KaTeX** (nhẹ hơn MathJax, load CDN) để render.
- KaTeX CDN: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">`
- Script: `<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>`
- Auto-render: `<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>`
- Gọi: `renderMathInElement(el, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}] })`

**Files cần sửa:**

- [x] `public/exam.html`: Thêm KaTeX CDN + gọi `renderMathInElement` sau khi render câu hỏi
- [x] `public/index.html`: Thêm KaTeX (trang chủ học sinh, hiển thị thông tin đề)
- [x] `public/admin/index.html`: Thêm KaTeX CDN + gọi render trong preview AI và modal xem câu
- [x] `public/js/app.js`: Sau mỗi lần render câu hỏi ra DOM → gọi KaTeX render
- [x] `public/admin/admin.js`: Sau `renderAIPreview()` và sau `openSectionEditor()` → gọi KaTeX render

**Kiểm tra:**
- Câu hỏi có `$x^2 + 2x + 1 = 0$` → hiện công thức đẹp
- `$$\frac{a}{b}$$` → hiện phân số block, giữa dòng riêng

---

### TÍNH NĂNG 2: Cải thiện prompt AI tạo đề

**Hiện trạng phân tích từ server.js (line 744):**
```
"type": "multiple-choice|reading|writing-choice|writing-essay"
```
→ Thiếu 2 loại: `fill-in-blank` và `free-form`
→ Công thức toán đang hướng dẫn dùng text `x²` thay vì LaTeX `$x^2$`

**Thay đổi cần làm trong `server.js` (systemPrompt, line 743-799):**

**a) Bổ sung 2 loại section mới vào prompt:**
```
- "fill-in-blank": câu có chỗ trống ___ để điền, dùng khi đề có dạng: điền từ, điền số, hoàn thành câu
  → questions[].blanks: [{index:0, answer:"...", type:"text|int|float"}]
- "free-form": câu tự luận có nhiều phần a,b,c
  → questions[].subParts: [{label:"a", question:"...", sampleAnswer:"..."}]
```

**b) Cập nhật hướng dẫn LaTeX:**
```
CÔNG THỨC TOÁN (QUAN TRỌNG):
- PHẢI dùng LaTeX: $...$ cho inline, $$...$$ cho block
- VD: $x^2 + 2x + 1 = 0$, $$\frac{a}{b} = c$$, $\sqrt{x}$
- KHÔNG dùng: x^2, sqrt(x), x² (unicode)
```

**c) Bổ sung schema cho 2 loại mới vào JSON example trong prompt**

**Files cần sửa:**

- [x] `server.js` (line 743-799): Cập nhật systemPrompt — loại câu, hướng dẫn LaTeX, schema ví dụ

**Kiểm tra:**
- Upload đề có dạng điền từ → AI tạo section `fill-in-blank` với `blanks[]`
- Upload đề toán → AI dùng `$x^2$` không phải `x^2` plain text
- Upload đề tự luận câu a,b,c → AI tạo section `free-form` với `subParts[]`

---

### TÍNH NĂNG 3: Preview & Edit workflow — sửa từng câu trước khi import

**Hiện trạng phân tích:**
- `renderAIPreview()` (admin.js line 738): Chỉ hiển thị readonly, không có nút sửa/xoá
- `importAIResult()` (admin.js line 805): Import thẳng không qua review
- Sau Phase 1, BUG-2 đã fix → `table`, `imageUrl` không còn bị mất

**Đề xuất thêm vào giao diện preview:**

**Actions per câu hỏi:**
| Nút | Hành động |
|---|---|
| ✏️ Sửa | Mở inline form trong preview (text area), lưu vào `aiGeneratedData` |
| 🗑️ Xoá | Xoá câu khỏi `aiGeneratedData` (chưa import), re-render |
| 🔄 Làm lại | Gửi lại prompt riêng cho câu đó (gọi `/api/admin/ai-generate-single`) |

**Actions per section:**
| Nút | Hành động |
|---|---|
| 🗑️ Xoá cả phần | Xoá cả section khỏi preview |

**Actions tổng đề (đã có, cải thiện):**
| Nút | Mô tả |
|---|---|
| ✅ Import đề | Lưu vào DB (giữ nguyên) |
| 🔄 Tạo lại toàn bộ | regenerate (giữ nguyên) |
| 💾 Tải JSON | download (giữ nguyên) |

**Route mới (optional, làm nếu còn thời gian):**
```
POST /api/admin/ai-generate-single
Body: { sectionIndex, questionId, instruction, sdkType, model }
Response: { question: {...} }  ← 1 câu được tạo lại
```

**Files cần sửa:**

- [x] `public/admin/admin.js` — `renderAIPreview()`:
  - Thêm nút ✏️ Sửa và 🗑️ Xoá vào mỗi câu
  - Hàm `editAIQuestion(sectionIdx, qIdx)` → render inline form
  - Hàm `saveAIQuestion(sectionIdx, qIdx)` → cập nhật `aiGeneratedData`
  - Hàm `deleteAIQuestion(sectionIdx, qIdx)` → xoá khỏi data + re-render
  - Hàm `deleteAISection(sectionIdx)` → xoá section

- [x] `public/admin/index.html`:
  - CSS cho type-fillin, type-freeform badge đã có sẵn
  - Nút ✏️ và 🗑️ style nhỏ inline

- [ ] `server.js` (optional): Route `POST /api/admin/ai-generate-single`

**Thiết kế inline edit:**
```
[Câu 5] She ___ to school every day.
  Options: A. go | B. goes | C. went | D. going
  Đáp án: B          [✏️ Sửa] [🗑️ Xoá]
  
  ↓ sau khi bấm ✏️ Sửa ↓
  
[Câu 5 - Đang sửa]
  Câu hỏi: [textarea - prefilled]
  Đáp án A: [input]  B: [input]  C: [input]  D: [input]
  Đáp án đúng: [select 0/1/2/3]
  Giải thích: [textarea]
  [💾 Lưu]  [↩️ Huỷ]
```

**Kiểm tra:**
- Bấm ✏️ câu 3 → form hiện, sửa nội dung → Lưu → preview cập nhật ngay
- Bấm 🗑️ câu 5 → câu biến mất khỏi preview → Import → DB không có câu 5
- Xoá section 2 → section biến mất → Import → DB không có section 2

---

## 📋 Thứ tự thực hiện đề xuất

```
1. Tính năng 1: KaTeX render             [~30 phút] ← Nhanh nhất, ảnh hưởng ngay
2. Tính năng 2: Cải thiện prompt AI      [~20 phút] ← Chỉ sửa text trong server.js
3. Tính năng 3: Preview & Edit workflow  [~2-3 giờ] ← Lớn nhất, làm cuối
```

---

## 📝 Nhật ký thay đổi

| Thời gian | Task | Ghi chú |
|---|---|---|
| 2026-03-26T01:14 | Tính năng 1: KaTeX | Đã có trong exam.html, admin/index.html, app.js. Thêm vào index.html |
| 2026-03-26T01:14 | Tính năng 2: Prompt AI | Thêm fill-in-blank, free-form, bắt buộc LaTeX $...$, cập nhật schema |
| 2026-03-26T01:14 | Tính năng 3: Preview & Edit | editAIQuestion, saveAIQuestion, deleteAIQuestion, deleteAISection trong admin.js; importAIResult bổ sung blanks/subParts |

---

## ⚙️ Hướng dẫn cho AI agent

1. Đọc `PROJECT.md` và `PLAN_PHASE2.md` ngay đầu conversation
2. Kiểm tra checkbox `[ ]` → việc cần làm
3. Xong task → `[x]`, cập nhật nhật ký, cập nhật `Last updated`
4. Xong toàn bộ → báo user để plan Phase 3

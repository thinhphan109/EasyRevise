# Requirements Document

**Spec:** Frontend Redesign
**Status:** Approved (locked decisions in §6)
**Owner:** thinhme.tech
**Created:** 2026-05-14

> Spec này định nghĩa "what + why" cho việc thiết kế lại toàn bộ frontend EasyRevise. Sau khi approve, sẽ chuyển sang `design.md` (mood-board, design tokens, component library) rồi `tasks.md` (implementation plan).

---

## Introduction

### Vấn đề hiện tại
- Frontend đã trải qua 1 lần "UI Overhaul" (2026-04) nhưng owner cảm nhận **không còn đẹp** — visual fatigue, thiếu identity rõ ràng.
- Bố cục **không nhất quán** giữa student-facing pages và admin panel.
- Code style mỗi trang một kiểu: nhiều inline `style="..."` trong template literals, mix với CSS modules, khó maintain.
- `app.js` 1,400 dòng + `result.js` 800 dòng monolith → mỗi UI tweak phải đọc cả file.
- 25+ CSS modules nhưng không có document design system nào để onboard người mới.

### Mục tiêu
Thiết kế lại frontend với:
1. **Visual identity rõ ràng, hiện đại, không lỗi mốt sau 6 tháng**
2. **Consistency** giữa student + admin (cùng design tokens, cùng component library)
3. **Code maintainable** — design system có doc, components có API rõ
4. **Performance** không tệ hơn hiện tại (mobile 3G LTE vẫn dùng được)
5. **Accessibility** đạt mức cơ bản (keyboard nav, ARIA, contrast AA)

### Non-goals (KHÔNG làm trong sprint này)
- Không đổi backend API contract
- Không thêm feature mới (chỉ redesign UI cho feature đã có)
- Không làm i18n/multi-language (giữ tiếng Việt)
- Không làm native mobile app (PWA tối đa)
- Không migrate sang React/Vue/Svelte trong sprint này (giữ stack hiện tại trừ khi user approve thay đổi)

---

## Glossary

- **Apple HIG:** Apple Human Interface Guidelines — ngôn ngữ thiết kế của iOS/macOS với soft shadows, rounded corners, glass blur, system fonts.
- **Liquid Glass:** Hiệu ứng nền mờ + viền rất nhẹ, mô phỏng kính trong suốt — sticky header và modal overlay.
- **Bento grid:** Layout dạng card với kích thước biến (small/medium/large) ghép lại như hộp bento — phù hợp dashboard.
- **EARS:** Easy Approach to Requirements Syntax — format `WHEN/IF/WHILE ... THE SYSTEM SHALL ...`.
- **KaTeX:** Library render công thức toán LaTeX trong browser, nhanh hơn MathJax.
- **FaceHash:** Library deterministic SVG avatar dựa trên username, đã có sẵn trong project.
- **Lucide:** Bộ icon line MIT licensed, ~1500 icons, style đồng nhất với Apple HIG.
- **Magic byte:** 4-16 bytes đầu của file dùng để xác định loại thực sự (chống mime-type spoof).
- **JWT:** JSON Web Token — token có chữ ký HMAC, verify offline.
- **Signed URL:** URL có HMAC signature + expiry, chống IDOR truy cập file trái phép.
- **Section / Question / Blank:** Thuật ngữ trong domain hệ thống đề thi.
- **EasyRevise:** Tên platform hiện tại (có thể đổi sau).

---

## Requirements

### 2. User Personas

### P1 — Học sinh (primary user)
- 14-18 tuổi, dùng smartphone Android phổ thông, mạng 3G/4G không ổn định.
- Thường vào qua QR code hoặc link giáo viên gửi.
- Quan tâm: làm bài nhanh, biết điểm ngay, hiểu tại sao sai.
- Pain hiện tại: layout exam.html chật trên màn hình nhỏ, AI feedback hơi rối mắt.

### P2 — Giáo viên / Admin (power user)
- 25-50 tuổi, dùng laptop Windows + Chrome, có thể là desktop công ty.
- Tạo đề bằng AI, quản lý mã, chấm tự luận, xem báo cáo.
- Quan tâm: bulk operation nhanh, ít click, modal phù hợp luồng.
- Pain hiện tại: admin panel có nhiều icon emoji, thiếu hierarchy, khó scan nhanh khi có nhiều đề.

### P3 — Khách (guest, không đăng ký)
- Vào qua code, không có account.
- Quan tâm: làm bài, lưu kết quả tạm.
- Pain hiện tại: flow nhập tên/mã hơi mơ hồ, không biết bài có được lưu không.

---

## 3. Functional Requirements

### 3.1 Student Homepage (`index.html`)

**FR-S1.** WHEN người dùng truy cập trang chủ THE SYSTEM SHALL hiển thị danh sách đề thi công khai, ô nhập mã kích hoạt, nút quét QR, và lịch sử bài đã làm (nếu đã đăng nhập).

**FR-S2.** WHEN người dùng nhập mã hợp lệ THE SYSTEM SHALL hiển thị popup xem trước (preview) gồm tên đề, môn, số câu, thời gian, lịch sử dùng mã (đã masked PII), và CTA "Bắt đầu làm bài".

**FR-S3.** WHEN người dùng bấm nút quét QR (chỉ trên mobile <768px) THE SYSTEM SHALL mở camera, scan QR, parse URL deep-link và hiển thị popup tương tự FR-S2.

**FR-S4.** IF người dùng chưa đăng nhập THEN THE SYSTEM SHALL hiển thị nút "Đăng nhập" góc phải header. Sau đăng nhập, header SHALL chuyển sang avatar + tên + dropdown (Dashboard / Đăng xuất / Admin nếu role admin).

**FR-S5.** Trang chủ SHALL có dark mode toggle ở header, persist preference vào localStorage, respect `prefers-color-scheme` lần đầu.

### 3.2 Exam Taking Page (`exam.html`)

**FR-E1.** WHEN người dùng bắt đầu làm bài THE SYSTEM SHALL hiển thị: progress bar, số câu hiện tại / tổng, timer (nếu có timeLimit), nút flag câu, navigator grid để nhảy giữa các câu.

**FR-E2.** WHEN render câu hỏi THE SYSTEM SHALL hỗ trợ 5 loại section (multiple-choice, reading, fill-in-blank, writing-essay, free-form) với UI phù hợp từng loại.

**FR-E3.** IF câu hỏi có công thức LaTeX THEN THE SYSTEM SHALL render bằng KaTeX inline (không CDN delay).

**FR-E4.** WHEN còn 5 phút (chỉ với essay/free-form) THE SYSTEM SHALL hiển thị warning banner non-intrusive.

**FR-E5.** WHEN người dùng bấm "Nộp bài" với câu chưa làm THE SYSTEM SHALL hiển thị custom confirm modal có pills số câu chưa làm.

**FR-E6.** WHILE đang làm bài THE SYSTEM SHALL auto-save answer vào localStorage mỗi khi user thay đổi (không spam network).

**FR-E7.** IF người dùng disconnect network giữa kỳ thi THEN THE SYSTEM SHALL vẫn cho làm tiếp (state local), warning banner báo "Mất kết nối, sẽ thử lại khi nộp".

### 3.3 Result Page (`result.html`)

**FR-R1.** WHEN hiển thị kết quả THE SYSTEM SHALL show: điểm tổng, breakdown theo loại câu (MC vs essay), thời gian làm, danh sách câu sai/đúng/bỏ qua.

**FR-R2.** IF có essay/free-form chưa AI chấm THEN THE SYSTEM SHALL hiển thị banner "Đang chấm AI..." với polling 5s, replace bằng kết quả khi xong.

**FR-R3.** WHEN xem từng câu sai THE SYSTEM SHALL có nút "🤔 Tại sao tôi sai?" gọi AI explain (có rate limit từ backend).

**FR-R4.** WHEN có attachment (ảnh/PDF bài tự luận) THE SYSTEM SHALL hiển thị thumbnail click-to-zoom (lightbox), URL signed (C9).

**FR-R5.** AI feedback markdown SHALL render đẹp: bold, italic, code, bullet, line break, code blocks.

### 3.4 Student Dashboard (`dashboard.html`)

**FR-D1.** WHEN học sinh đăng nhập và mở dashboard THE SYSTEM SHALL hiển thị: profile avatar (FaceHash), số bài đã làm, điểm trung bình, biểu đồ tiến trình, gợi ý đề tiếp theo.

**FR-D2.** Dashboard SHALL có 3 tab: "Lịch sử", "Thống kê", "Đang học dở".

### 3.5 Admin Panel (`admin/index.html`)

**FR-A1.** Admin layout SHALL có sidebar trái (collapsible) với 9 tab: Đề thi, Câu hỏi, Bài nộp, Người dùng, Môn học, Mã, Thống kê, Settings, Help.

**FR-A2.** WHEN admin tạo/sửa đề THE SYSTEM SHALL có form rõ ràng, drag-drop sections, custom modals (không dùng `confirm()`/`prompt()`).

**FR-A3.** AI Generate tab SHALL có drop zone file, preview JSON output, edit từng câu trước import.

**FR-A4.** Submissions tab SHALL có filter theo đề, batch AI grade, override điểm GV, export CSV.

**FR-A5.** Toast notifications SHALL có 4 type (success, error, warning, info), max 5 toast, auto-dismiss 4s.

### 3.6 Auth Modals

**FR-AU1.** Login + Register SHALL trong cùng 1 modal, switch tab.

**FR-AU2.** Admin PIN SHALL trong modal riêng với 6 ô input (autoFocus next).

**FR-AU3.** Errors SHALL display inline trong modal, không alert.

---

## 4. Non-Functional Requirements

### 4.1 Performance
- **NFR-P1.** First Contentful Paint < 1.5s trên Moto G4 + 3G LTE Fast (Chrome DevTools throttle).
- **NFR-P2.** Total JS payload (gzipped) < 200KB cho student pages, < 500KB cho admin.
- **NFR-P3.** No layout shift sau khi load (CLS < 0.1).
- **NFR-P4.** KaTeX render đồng bộ < 200ms cho 50 công thức.

### 4.2 Accessibility
- **NFR-A1.** Color contrast SHALL đạt WCAG AA (4.5:1 text, 3:1 UI).
- **NFR-A2.** Mọi button, link, input SHALL focus được bằng keyboard, có visible focus ring.
- **NFR-A3.** Modal SHALL trap focus, đóng bằng `Esc`, return focus về trigger element.
- **NFR-A4.** Icon-only buttons SHALL có `aria-label`.
- **NFR-A5.** Form inputs SHALL có `<label>` liên kết.

### 4.3 Responsive
- **NFR-R1.** Mọi trang student SHALL hoạt động tốt trên viewport 320px → 1920px.
- **NFR-R2.** Admin panel SHALL responsive ≥768px (tablet+), graceful degrade dưới 768.
- **NFR-R3.** Touch targets ≥ 44×44 px trên mobile.

### 4.4 Browser support
- Chrome/Edge (Chromium) 2 versions cuối, Safari 16+, Firefox 2 versions cuối.
- KHÔNG support IE11.

### 4.5 Dark mode
- **NFR-D1.** Mọi trang SHALL có dark mode hoàn chỉnh (không "patchy").
- **NFR-D2.** Toggle SHALL không flicker khi load (apply class `<html>` từ inline script).

### 4.6 Maintainability
- **NFR-M1.** Design tokens SHALL define trong CSS variables (1 nơi duy nhất), không hardcode hex/px trong components.
- **NFR-M2.** Mỗi component SHALL có doc ngắn (props, slots, example).
- **NFR-M3.** Không inline `style="..."` trong template literals trừ khi value động (vd: progress width).

---

## 5. Constraints (đã quyết)

- **C1.** Backend API contract giữ nguyên (đã verified ở Sprint 1+2).
- **C2.** Auth flow giữ JWT + localStorage (đã planned move sang httpOnly cookie ở sprint sau).
- **C3.** KaTeX bắt buộc (đề thi có công thức Toán/Lý).
- **C4.** Self-hosted Inter fonts (đã có).
- **C5.** Dark mode bắt buộc.
- **C6.** Vietnamese-first UI copy.

---

## 6. Locked Decisions (đã chốt sau review demos)

| Quyết định | Giá trị | Ghi chú |
|---|---|---|
| **Mức độ thay đổi** | Full redesign | Q1 |
| **Style direction** | **Apple HIG / Liquid Glass** | Q2 — chọn demo `3-apple-hig.html` |
| **Icons** | **SVG inline (sprite)**, KHÔNG dùng emoji decorative | User request — đảm bảo render nhất quán mọi OS, dark mode, có color/stroke control |
| **Stack** | Vanilla + esbuild bundle (chưa migrate framework) | Q3 — giữ stack hiện có, chỉ thêm bundling |
| **Đối tượng** | Cân bằng student + admin | Q4 |
| **Brand name** | EasyRevise (tạm) | Q5 — có thể đổi sau |
| **Motion level** | Moderate | Q6 — page transition, count-up score, stagger reveal |
| **Mobile** | **First-class** | User request — design 320px → desktop, không "graceful degrade" |
| **Deadline** | Thoải mái | Q8 — chia phase nhỏ |
| **Reference** | Apple Music, App Store, iCloud, Linear | derived |

### Apple HIG style — design principles được apply

1. **Soft shadows** — `0 1px 2px / 0 4px 16px / 0 10px 40px` thay vì border đậm
2. **Generous border-radius** — 12px / 18px / 24px (small/medium/large)
3. **Glass blur** — header sticky + modal overlay (`backdrop-filter: blur(20px)`)
4. **Smooth easing** — `cubic-bezier(0.2, 0.8, 0.2, 1)` cho mọi transition
5. **System fonts** — `-apple-system, BlinkMacSystemFont, 'SF Pro', Inter` (fallback chain)
6. **Apple blue accent** — `#0071e3` light / `#0a84ff` dark
7. **Pure black dark mode** — `#000000` background, không gray-tint
8. **Pill-shaped buttons** — `border-radius: 980px` cho primary CTA
9. **Subtle gradients** — chỉ trên icon containers, không ở background lớn
10. **Letter-spacing tight** — `-0.02em` đến `-0.04em` cho headings

### Icons — yêu cầu cụ thể

- ✅ Bộ icon chuẩn: **Lucide** (MIT, đẹp + nhất quán Apple-feel) hoặc **SF Symbols web fallback**
- ✅ Lưu trong `public/assets/icons/sprite.svg` (đã có sprite hệ thống, mở rộng)
- ✅ Mỗi icon SHALL: 24×24 viewBox, stroke-width 1.5-2, color: currentColor
- ✅ Render qua `<svg><use href="/assets/icons/sprite.svg#icon-name"/></svg>`
- ❌ KHÔNG dùng emoji decorative (`📐 🎯 🔵`) trong UI structure
- ✅ Emoji **chỉ giữ trong content do user nhập** (vd: tên đề có emoji, AI feedback)

### Mobile-first — yêu cầu cụ thể

- Breakpoints: `0-639px (mobile)`, `640-1023px (tablet)`, `1024px+ (desktop)`
- Touch targets ≥ 44×44 px
- Bottom-sheet modal trên mobile (slide up từ dưới) thay vì center modal
- Sticky bottom navigation cho student app trên mobile (Home / Lịch sử / Dashboard)
- Safe-area inset cho iPhone notch/home-bar
- Disable hover effects trên touch device (`@media (hover: hover)`)
- Native-feel: `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation`
- Form inputs `font-size: 16px` để iOS không zoom khi focus

---

> **Đây là phần quan trọng nhất** — câu trả lời sẽ shape design.md.

### Q1 — Mức độ thay đổi
Bạn muốn:
- **(a) Refactor visual** — giữ structure, đổi color/typography/spacing, thêm motion. Effort: 1 tuần.
- **(b) Full redesign** — đổi cả layout, có thể rework navigation pattern, animation principles. Effort: 2-3 tuần.
- **(c) Strip & rebuild** — bỏ hết CSS hiện tại, design system mới từ scratch + có thể đổi stack (Astro/SvelteKit). Effort: 4-6 tuần.

### Q2 — Style direction (chọn 1 hoặc kết hợp 2)
- **Linear/Notion clean** — minimal, monochrome + 1 accent, generous whitespace, typography-driven
- **Apple HIG / iOS feel** — soft shadows, rounded, glass blur, SF Pro-like
- **Vercel / Geist** — black & white extreme, sharp edges, high contrast
- **Stripe / Cred** — gradient accents, vibrant but tasteful, subtle motion
- **Brutalist editorial** — bold typography, asymmetric, raw, tabular layout
- **Bento / Dashboard** — card grid, varied sizes, info-dense (tốt cho admin)
- **Y2K / Retro pixel** — nostalgic, có chỗ dùng được cho gamification điểm

### Q3 — Stack
- **(a) Giữ Vanilla JS** — fast, no build, đã có infrastructure
- **(b) Vanilla + esbuild bundle** — vẫn vanilla nhưng có code splitting, tree-shake (NEW)
- **(c) Astro** — multi-framework, partial hydration, SEO tốt
- **(d) SvelteKit** — modern, ít runtime, dev experience tốt
- **(e) Next.js** — quá nặng cho usecase này, không nên

### Q4 — Đối tượng ưu tiên
- **(a) Student mobile-first** — design cho 320-768px trước, desktop sau
- **(b) Admin desktop-first** — admin panel ưu tiên desktop UX
- **(c) Cân bằng** — cả 2 cùng quan trọng

### Q5 — Identity / Branding
- Tên thương hiệu giữ "EasyRevise"?
- Có logo riêng không, hay dùng wordmark + icon?
- Tone of voice: serious/academic vs friendly/playful?
- Có animal mascot hoặc character không?

### Q6 — Motion / Animation
- **(a) Minimal** — chỉ transition cơ bản (hover, modal in/out)
- **(b) Moderate** — page transitions, count-up scores, stagger reveal
- **(c) Rich** — confetti khi đạt điểm cao, micro-interaction nhiều, scroll-driven animation

### Q7 — Inspirational references
Bạn có site nào đẹp mà thích không? Paste 2-3 URL để tôi grab visual direction.

### Q8 — Deadline
Có timeline cụ thể không? (Vd: 1 tuần, 1 tháng, không vội)

---

## 7. Acceptance Criteria

Spec này đã approved sau khi user chốt 8 decisions trong phần "Locked Decisions" (section 6). Bước tiếp theo:
1. ✅ Lock requirements (file này — DONE)
2. ⏳ Tạo `design.md` — design tokens, component library, layout sketches cho Apple HIG style
3. ⏳ Tạo `tasks.md` — implementation plan chia phase
4. ⏳ Implement

---

## 8. Success Metrics (đo sau khi launch)

- **M1.** Time-to-complete-exam giảm ≥10% (baseline: hiện tại)
- **M2.** Bounce rate trang chủ < 30%
- **M3.** Admin time-per-action giảm ≥15% (đo qua audit log)
- **M4.** Lighthouse score ≥ 90 trên cả 4 axis (Performance, A11y, BP, SEO) cho student pages
- **M5.** Subjective: owner cảm thấy "đẹp" sau 2 tuần dùng (no more visual fatigue)

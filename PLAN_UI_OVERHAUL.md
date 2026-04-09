# 🎨 PLAN UI OVERHAUL — Tân Trang Hệ Thống

> **Branch:** `feature/ui-overhaul`
> **Ngày tạo:** 2026-04-09
> **Mục tiêu:** Chuyển EasyRevise từ project nhỏ → nền tảng chuyên nghiệp cấp Coursera/Notion
> **Trạng thái:** 🟡 Đang implement — Steps 1-3, 10 done
> **Quyết định:** ✅ **Vanilla JS (Option A)** — tổ chức lại file, KHÔNG dùng framework/bundler
> Lý do: 4 trang, <100 users, Express backend giữ nguyên, dễ maintain, deploy đơn giản

---

## PHẦN 1: Cấu Trúc File — Enterprise Grade

### 📊 Hiện trạng (VẤN ĐỀ)

```
public/
├── index.html          # 1,161 dòng (60 KB!) — MONOLITH: HTML + 250 dòng CSS + 780 dòng JS
├── exam.html           # 18 KB — inline JS + inline CSS
├── result.html         # 6 KB — chỉ có HTML wrapper
├── css/style.css       # 393 dòng (8.9 KB) — NHỎ vì 90% CSS inline trong HTML!
├── js/
│   ├── app.js          # 70 KB — MONOLITH cho toàn bộ exam logic
│   └── result.js       # 44 KB — MONOLITH cho result logic
└── admin/
    ├── index.html      # 104 KB — MONOLITH admin HTML
    ├── admin.js         # 113 KB — LEGACY backup (không load)
    └── js/             # 17 modules (✅ đã modular)
```

**Vấn đề cốt lõi:**
1. `index.html = 60 KB` — chứa 780 dòng JS inline, 250 dòng CSS inline
2. `app.js = 70 KB` — 1 file chứa toàn bộ exam logic (timer, questions, navigation, upload...)
3. `result.js = 44 KB` — 1 file chứa toàn bộ result rendering
4. `style.css = 8.9 KB` chỉ — vì style thật nằm inline trong HTML!
5. Admin CSS inline trong `admin/index.html` (104 KB)
6. Không có shared components, không reuse gì giữa các trang

---

### 🏗️ Cấu trúc mới (Enterprise)

> Lấy cảm hứng từ: Coursera, Notion, Linear

```
[TracNghiemWeb]/
│
├── server.js                       # Entry point (113L — giữ nguyên)
├── .env                            # Environment config
├── package.json
│
├── lib/                            # Backend shared modules (giữ nguyên)
│   ├── auth.js
│   ├── data.js
│   ├── drive.js
│   ├── backup.js
│   ├── ai-helpers.js
│   └── validate.js
│
├── routes/                         # Backend routes (giữ nguyên 17 files)
│   ├── auth.js
│   ├── exams.js
│   ├── ...
│   └── media-library.js
│
├── data/                           # JSON data store (giữ nguyên)
│   ├── exams.json
│   ├── users.json
│   ├── media.json
│   └── backups/
│
├── tests/                          # Backend tests (giữ nguyên)
│
├── _archive/                       # Legacy files (giữ nguyên)
│
└── public/                         # ========== FRONTEND (REFACTOR) ==========
    │
    ├── index.html                  # Student home — HTML ONLY (<100 dòng)
    ├── exam.html                   # Exam taking — HTML ONLY (<60 dòng)
    ├── result.html                 # Result view — HTML ONLY (<60 dòng)
    ├── manifest.json               # 🆕 PWA manifest
    ├── sw.js                       # 🆕 Service Worker
    ├── favicon.ico
    │
    ├── assets/                     # 🆕 Static assets
    │   ├── fonts/                  # Self-hosted fonts (tránh Google CDN blocking)
    │   │   ├── inter-400.woff2
    │   │   ├── inter-500.woff2
    │   │   ├── inter-600.woff2
    │   │   ├── inter-700.woff2
    │   │   └── inter-800.woff2
    │   ├── icons/                  # 🆕 SVG icon system (thay emoji)
    │   │   ├── sprite.svg          # SVG sprite sheet
    │   │   ├── exam.svg
    │   │   ├── timer.svg
    │   │   ├── check.svg
    │   │   ├── lock.svg
    │   │   └── ...
    │   └── images/                 # Logo, hero, og-image
    │       ├── logo.svg
    │       ├── logo-dark.svg
    │       ├── hero-pattern.svg    # Background pattern
    │       └── og-image.png        # Social share image
    │
    ├── css/                        # 🆕 CSS Architecture (thay 1 file style.css)
    │   │
    │   ├── base/                   # Foundation layer
    │   │   ├── _reset.css          # Box-sizing, margin reset, smooth scroll
    │   │   ├── _tokens.css         # Design tokens (colors, spacing, radius, shadows, fonts)
    │   │   ├── _typography.css     # Font-face, heading scale, body, code, links
    │   │   ├── _dark-mode.css      # [data-theme="dark"] overrides
    │   │   └── _animations.css     # Keyframes: fadeIn, slideUp, scaleIn, shimmer, pulse
    │   │
    │   ├── components/             # Reusable UI components
    │   │   ├── _buttons.css        # .btn, .btn-primary, .btn-ghost, .btn-danger, .btn-icon
    │   │   ├── _cards.css          # .card, .card-hover, .card-gradient-top
    │   │   ├── _modals.css         # .modal-overlay, .modal-box, .modal-header
    │   │   ├── _forms.css          # .input, .select, .textarea, .checkbox, .radio
    │   │   ├── _badges.css         # .badge, .badge-success, .badge-error, .badge-warning
    │   │   ├── _toasts.css         # .toast, .toast-stack, .toast-success/error/warning/info
    │   │   ├── _dropdown.css       # .dropdown, .dropdown-item
    │   │   ├── _tabs.css           # .tab-bar, .tab-item, .tab-active
    │   │   ├── _avatars.css        # .avatar, .avatar-sm/md/lg, .avatar-initials
    │   │   ├── _progress.css       # .progress-bar, .progress-ring (SVG circle)
    │   │   ├── _skeleton.css       # .skeleton, .skeleton-text, .skeleton-card
    │   │   └── _tooltips.css       # .tooltip (CSS-only, no JS)
    │   │
    │   ├── layout/                 # Layout system
    │   │   ├── _grid.css           # .container, .grid, .flex, .gap-*, .col-*
    │   │   ├── _header.css         # .site-header, .nav-bar, .user-menu
    │   │   ├── _footer.css         # .site-footer
    │   │   ├── _sidebar.css        # .sidebar (admin), .sidebar-collapsed
    │   │   └── _responsive.css     # @media queries, .hide-mobile, .hide-desktop
    │   │
    │   ├── pages/                  # Page-specific styles
    │   │   ├── home.css            # Exam grid, code modal, QR popup, history list
    │   │   ├── exam.css            # Question UI, options, timer, drawer, navigation
    │   │   ├── result.css          # Score circle, review items, explanation boxes
    │   │   └── admin.css           # Admin panel specific (tabs, tables, forms)
    │   │
    │   ├── vendors/                # Third-party CSS
    │   │   └── katex.min.css       # 🆕 Self-hosted (thay CDN)
    │   │
    │   └── main.css                # 🆕 Entry: @import all of above in correct order
    │
    ├── js/                         # 🆕 JS Architecture
    │   │
    │   ├── core/                   # Core utilities (shared across ALL pages)
    │   │   ├── api.js              # fetch wrapper: get(), post(), put(), del()
    │   │   ├── auth.js             # login, register, logout, getUser(), getToken()
    │   │   ├── router.js           # Simple client-side navigation helpers
    │   │   ├── store.js            # Simple state management (localStorage wrapper)
    │   │   ├── events.js           # Custom event bus (pubsub)
    │   │   └── utils.js            # escapeHtml, formatDate, formatSize, debounce, etc.
    │   │
    │   ├── components/             # 🆕 Reusable UI components (JS logic)
    │   │   ├── modal.js            # createModal(), closeModal(), confirmModal()
    │   │   ├── toast.js            # showToast(msg, type, duration) — stack system
    │   │   ├── theme.js            # toggleTheme(), getTheme(), applyTheme()
    │   │   ├── timer.js            # CountdownTimer class
    │   │   ├── dropdown.js         # Dropdown/context menu
    │   │   ├── tabs.js             # Tab switching logic
    │   │   ├── skeleton.js         # Skeleton loading helpers
    │   │   ├── lightbox.js         # Image lightbox viewer
    │   │   └── swipe.js            # Touch swipe detection
    │   │
    │   ├── pages/                  # Page-specific logic
    │   │   ├── home/               # Student homepage
    │   │   │   ├── index.js        # Init: loadExams(), loadHistory(), setupAuth()
    │   │   │   ├── exam-list.js    # renderExamCards(), skeleton loading
    │   │   │   ├── history.js      # loadHistory(), renderHistory()
    │   │   │   ├── auth-ui.js      # openAuthModal(), updateAuthUI()
    │   │   │   ├── qr-scanner.js   # QR deep-link, camera scanner
    │   │   │   └── code-entry.js   # submitCode(), verifyCode()
    │   │   │
    │   │   ├── exam/               # Exam taking page
    │   │   │   ├── index.js        # Init: loadExam(), startTimer()
    │   │   │   ├── questions.js    # renderQuestion(), navigateQuestion()
    │   │   │   ├── answers.js      # selectAnswer(), saveProgress()
    │   │   │   ├── fill-blank.js   # Fill-in-blank rendering + validation
    │   │   │   ├── essay.js        # Essay textarea + file upload
    │   │   │   ├── free-form.js    # Free-form sub-parts
    │   │   │   ├── navigation.js   # prev/next, question grid drawer
    │   │   │   ├── timer.js        # Exam timer logic + warnings
    │   │   │   ├── submit.js       # Submit exam, confirm modal
    │   │   │   └── progress.js     # Progress bar, save/restore state
    │   │   │
    │   │   └── result/             # Result page
    │   │       ├── index.js        # Init: loadResult()
    │   │       ├── score.js        # Score circle animation
    │   │       ├── review.js       # Review items rendering
    │   │       ├── explain.js      # Explanation + expansion boxes
    │   │       ├── ai-feedback.js  # AI grade cards
    │   │       └── share.js        # Share result card
    │   │
    │   └── vendors/                # Third-party JS (self-hosted)
    │       ├── katex.min.js
    │       ├── katex-auto-render.min.js
    │       └── jsqr.min.js
    │
    └── admin/                      # Admin panel (ĐÃ MODULAR — chỉ cần tối ưu CSS)
        ├── index.html              # Admin HTML (<200 dòng — tách inline CSS/JS ra)
        └── js/                     # 17 modules (giữ nguyên)
            ├── helpers.js
            ├── admin-main.js
            ├── media-library.js
            └── ...
```

---

### 📐 So sánh: Trước vs Sau

| Metric | Trước | Sau |
|---|---|---|
| `index.html` | 60 KB (1,161 dòng) | ~6 KB (~100 dòng) |
| `exam.html` | 18 KB | ~4 KB (~60 dòng) |
| `result.html` | 6 KB | ~3 KB (~50 dòng) |
| `style.css` | 1 file (393L) + 90% inline | 25+ files CSS modules |
| `app.js` | 1 file (70 KB) | 10 files trong `pages/exam/` |
| `result.js` | 1 file (44 KB) | 6 files trong `pages/result/` |
| Inline CSS | ~500 dòng rải 3 file HTML | 0 dòng inline |
| Inline JS | ~780 dòng trong index.html | 0 dòng inline |
| Shared components | 0 | 9 components (modal, toast, theme...) |
| Assets | Google CDN fonts | Self-hosted fonts + SVG icons |
| Dark mode | Không | ✅ CSS vars + toggle |
| PWA | Không | ✅ manifest + service worker |

---

### 🔄 Migration Plan (Từng bước)

> ⚠️ Mỗi step phải giữ app hoạt động — KHÔNG phá hỏng gì đang chạy

#### Step 1: CSS Foundation (2h)
```
Tạo css/base/ (reset, tokens, typography, dark-mode, animations)
Tạo css/components/ (buttons, cards, modals, forms, badges)
Tạo css/layout/ (grid, header, responsive)
Tạo css/main.css (@import tất cả)
→ Đổi <link> trong HTML sang main.css
→ XÓA inline <style> tags khỏi HTML
→ TEST: UI phải giống hệt trước khi refactor
```

#### Step 2: JS Core Utilities (1h)
```
Tạo js/core/ (api, auth, store, utils, events)
Extract logic từ index.html inline JS → js/core/auth.js
Extract fetch wrapper → js/core/api.js
Extract utility functions → js/core/utils.js
→ Load bằng <script src="js/core/...">
→ TEST: Login, register, history phải hoạt động
```

#### Step 3: JS Components (1.5h)
```
Tạo js/components/ (modal, toast, theme, timer, dropdown)
Extract modal logic → js/components/modal.js
Extract toast → js/components/toast.js
Tạo theme toggle → js/components/theme.js
→ TEST: Modals, toasts phải hoạt động
```

#### Step 4: Tách index.html (2h)
```
index.html: giữ HTML skeleton (<100 dòng)
Inline CSS 250 dòng → css/pages/home.css
Inline JS 780 dòng → js/pages/home/ (6 files)
→ <script src="js/pages/home/index.js">
→ TEST: Toàn bộ homepage phải hoạt động (exam list, auth, QR, history)
```

#### Step 5: Tách app.js (2h)
```
app.js (70 KB) → js/pages/exam/ (10 files)
Chia theo concern: questions, answers, fill-blank, essay, timer, submit...
→ Load files theo thứ tự phụ thuộc
→ TEST: Làm bài thi end-to-end (MC + fill-blank + essay)
```

#### Step 6: Tách result.js (1.5h)
```
result.js (44 KB) → js/pages/result/ (6 files)
Chia: score, review, explain, ai-feedback, share
→ TEST: Xem kết quả, giải thích, AI grade
```

#### Step 7: Assets + PWA (1h)
```
Self-host fonts (Inter woff2)
Self-host KaTeX + jsQR
SVG icon sprite
manifest.json + sw.js
→ TEST: Offline access, fonts load nhanh
```

#### Step 8: Admin CSS cleanup (1h)
```
Extract inline CSS từ admin/index.html → css/pages/admin.css
Dùng chung css/base/ + css/components/ (consistency)
→ TEST: Admin panel hoạt động đầy đủ
```

#### Step 9: Polish + QA (1h)
```
Cross-browser test (Chrome, Firefox, Safari, Mobile)
Accessibility audit
Performance audit (Lighthouse)
Dark mode test all pages
```

---

### 📦 HTML Template mẫu (sau refactor)

```html
<!-- index.html — CHỈ CÒN HTML STRUCTURE -->
<!DOCTYPE html>
<html lang="vi" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EasyRevise — Ôn Tập Đề Cương</title>
    <meta name="description" content="Hệ thống ôn tập hiệu quả có chấm điểm và lời giải chi tiết">
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" href="/favicon.ico">

    <!-- CSS: 1 file entry point -->
    <link rel="stylesheet" href="/css/main.css">
    <link rel="stylesheet" href="/css/pages/home.css">
</head>
<body>
    <!-- Header: compact, tối giản -->
    <header class="site-header">
        <div class="container flex justify-between align-center">
            <div>
                <h1 class="text-2xl font-extrabold">EasyRevise</h1>
                <p class="text-muted text-sm">Hệ thống ôn tập đề cương thông minh</p>
            </div>
            <nav class="user-bar">
                <button id="themeToggle" class="btn btn-icon btn-ghost" onclick="toggleTheme()" title="Đổi giao diện">🌙</button>
                <button class="btn btn-sm btn-ghost" onclick="openQRScanner()" title="Quét mã QR">📷<span class="hide-mobile"> Quét QR</span></button>
                <button class="btn btn-sm btn-ghost" onclick="openReviewByCodeModal()" title="Xem lại bằng mã">📋<span class="hide-mobile"> Xem lại bằng mã</span></button>
                <div id="authArea"></div>
            </nav>
        </div>
    </header>

    <!-- Main Content -->
    <main class="container">
        <section class="section">
            <h2 class="text-xl font-bold mb-6">Chọn đề ôn tập</h2>
            <div id="examList" class="exam-grid">
                <!-- JS sẽ render -->
            </div>
        </section>

        <section id="inProgressSection" class="section" hidden>
            <h2 class="text-lg font-bold text-warning mb-4">📌 Bài đang làm dở</h2>
            <div id="inProgressList"></div>
        </section>

        <section id="historySection" class="section" hidden>
            <h2 class="text-lg font-bold mb-4">Lịch sử làm bài</h2>
            <div id="historyList"></div>
        </section>
    </main>

    <!-- Modals rendered by JS -->
    <div id="modal-root"></div>

    <!-- Scripts -->
    <script src="/js/vendors/katex.min.js" defer></script>
    <script src="/js/vendors/katex-auto-render.min.js" defer></script>
    <script src="/js/vendors/jsqr.min.js" defer></script>

    <script src="/js/core/utils.js"></script>
    <script src="/js/core/api.js"></script>
    <script src="/js/core/auth.js"></script>
    <script src="/js/core/store.js"></script>
    <script src="/js/components/modal.js"></script>
    <script src="/js/components/toast.js"></script>
    <script src="/js/components/theme.js"></script>
    <script src="/js/pages/home/exam-list.js"></script>
    <script src="/js/pages/home/history.js"></script>
    <script src="/js/pages/home/auth-ui.js"></script>
    <script src="/js/pages/home/qr-scanner.js"></script>
    <script src="/js/pages/home/code-entry.js"></script>
    <script src="/js/pages/home/index.js"></script>
</body>
</html>
```

---

### ⏱️ Timeline tổng

| Step | Nội dung | Effort | Dependencies |
|---|---|---|---|
| 1 | CSS Foundation | 2h | — |
| 2 | JS Core | 1h | — |
| 3 | JS Components | 1.5h | Step 2 |
| 4 | Tách index.html | 2h | Step 1, 2, 3 |
| 5 | Tách app.js | 2h | Step 2, 3 |
| 6 | Tách result.js | 1.5h | Step 2, 3 |
| 7 | Assets + PWA | 1h | Step 1 |
| 8 | Admin CSS | 1h | Step 1 |
| 9 | Polish + QA | 1h | All |
| | **Tổng** | **~13h** | |

---

## 📝 Nhật ký thay đổi

| Ngày | Nội dung |
|---|---|
| 2026-04-09 | Tạo plan UI Overhaul. Branch `feature/ui-overhaul`. Phần 1-5 hoàn tất |
| 2026-04-09 | Quyết định: Vanilla JS Option A. Không dùng React/Vite/Tailwind/Next.js |
| 2026-04-09 | Style C (Mixed: Clean + Liquid Glass selective). Không gradient. Không PWA. Thêm Student Dashboard |
| 2026-04-09 | ✅ **Step 1-3, 10 DONE**: CSS Foundation (5 base + 8 components + 3 layout + 3 pages = 19 files), Dark mode toggle + theme.js + toast.js. All 3 HTML pages migrated to main.css. Tất cả 21 files HTTP 200 verified |

---

## Quyết định đã xác nhận

| Hạng mục | Quyết định |
|---|---|
| Architecture | ✅ Vanilla JS (Option A) — không React/Vite/Tailwind |
| Design Style | ✅ **Style C** — Clean base + Liquid Glass cho hover/modal/dark |
| Gradient | ❌ Không dùng gradient hero/backgrounds — giữ clean |
| PWA | ❌ Skip — không hoạt động tốt |
| SVG Icons | ✅ Thay emoji bằng SVG icons |
| Dark Mode | ✅ Auto system + manual toggle |
| Student Dashboard | ✅ Cần — avatar, stats, history |
| Leaderboard | ❌ Chưa cần |
| Share Result | 🟡 Để sau, có thể apply |
| Sound Effects | 🟡 Để sau, có thể apply |

---

## PHẦN 2: Design Style — Clean + Liquid Glass (Style C, no gradient)

> **Quyết định:** Clean solid base + Liquid Glass chỉ cho hover/modal/dark mode
> Student pages: clean white, solid cards, glass effect khi hover + modals
> Admin panel: clean, dùng chung component CSS
> **KHÔNG dùng gradient** — backgrounds solid, accent bằng border-top hoặc color

### 2.1 Color Palette

```css
/* css/base/_tokens.css */
:root {
    /* Primary: Indigo (giữ nguyên — brand color đã quen) */
    --color-primary: #6366f1;
    --color-primary-hover: #4f46e5;
    --color-primary-light: #eef2ff;
    --color-primary-50: rgba(99,102,241,0.08);
    --color-primary-glow: rgba(99,102,241,0.25);

    /* Accent: Violet (nhẹ hơn fuchsia, hài hòa hơn) */
    --color-accent: #8b5cf6;
    --color-accent-light: #f5f3ff;

    /* Semantic */
    --color-success: #10b981;
    --color-success-bg: #ecfdf5;
    --color-error: #ef4444;
    --color-error-bg: #fef2f2;
    --color-warning: #f59e0b;
    --color-warning-bg: #fffbeb;
    --color-info: #3b82f6;
    --color-info-bg: #eff6ff;

    /* Neutral (Slate scale) — CLEAN, solid backgrounds */
    --color-bg: #f8fafc;
    --color-surface: #ffffff;
    --color-surface-elevated: #ffffff;
    --color-surface-hover: #f1f5f9;
    --color-text: #0f172a;
    --color-text-secondary: #475569;
    --color-text-muted: #94a3b8;
    --color-border: #e2e8f0;
    --color-border-hover: #cbd5e1;

    /* Liquid Glass tokens (dùng cho hover, modal, dark mode) */
    --glass-bg: rgba(255,255,255,0.7);
    --glass-blur: blur(16px) saturate(180%);
    --glass-border: rgba(255,255,255,0.3);
    --glass-highlight: inset 0 1px 0 rgba(255,255,255,0.5);
}
```

### 2.2 Typography Scale

```css
/* css/base/_typography.css */
@font-face {
    font-family: 'Inter';
    src: url('/assets/fonts/inter-400.woff2') format('woff2');
    font-weight: 400; font-display: swap;
}
/* ... 500, 600, 700, 800 tương tự */

:root {
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

    --text-xs: 0.75rem;    /* 12px */
    --text-sm: 0.875rem;   /* 14px */
    --text-base: 1rem;     /* 16px */
    --text-lg: 1.125rem;   /* 18px */
    --text-xl: 1.25rem;    /* 20px */
    --text-2xl: 1.5rem;    /* 24px */
    --text-3xl: 1.875rem;  /* 30px */
    --text-4xl: 2.25rem;   /* 36px */

    --leading-tight: 1.25;
    --leading-normal: 1.6;
    --leading-relaxed: 1.75;
}

body {
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    color: var(--color-text);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
```

### 2.3 Elevation (Shadow System)

```css
:root {
    --shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
    --shadow-sm: 0 2px 4px rgba(0,0,0,0.06);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
    --shadow-lg: 0 12px 36px rgba(0,0,0,0.10);
    --shadow-xl: 0 24px 60px rgba(0,0,0,0.14);

    /* Colored shadows (cho buttons/cards) */
    --shadow-primary: 0 4px 14px var(--color-primary-glow);
    --shadow-accent: 0 4px 14px rgba(217,70,239,0.3);
}
```

### 2.4 Glassmorphism Components

```css
/* css/components/_cards.css */

/* Standard card */
.card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: all var(--duration-normal) var(--ease-out);
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--color-border-hover);
}

/* Glass card (for overlays, hero sections) */
.card-glass {
    background: rgba(255,255,255,0.7);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(255,255,255,0.4);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-md);
}

/* Gradient top accent (exam cards) */
.card-accent::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: var(--gradient-card);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}
```

### 2.5 Button System

```css
/* css/components/_buttons.css */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    border: none;
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: var(--text-sm);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    outline: none;
    position: relative;
    overflow: hidden;
}

.btn-primary {
    background: var(--color-primary);
    color: white;
}

.btn-primary:hover {
    background: var(--color-primary-hover);
    box-shadow: var(--shadow-primary);
    transform: translateY(-1px);
}

.btn-primary:active {
    transform: translateY(0);
}

.btn-ghost {
    background: var(--color-primary-light);
    color: var(--color-primary);
}

.btn-danger {
    background: var(--color-error);
    color: white;
}

.btn-sm { padding: var(--space-2) var(--space-4); font-size: var(--text-xs); }
.btn-lg { padding: var(--space-4) var(--space-8); font-size: var(--text-base); }
.btn-icon {
    width: 40px; height: 40px; padding: 0;
    border-radius: var(--radius-md);
}

/* Focus ring */
.btn:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
}
```

### 2.6 Animation Library

```css
/* css/base/_animations.css */
@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes slideDown {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
}

@keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}

@keyframes countUp {
    from { --num: 0; }
    to { --num: var(--target); }
}

@keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}

/* Stagger animation for lists */
.stagger > * { animation: slideUp 0.4s var(--ease-out) both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 60ms; }
.stagger > *:nth-child(3) { animation-delay: 120ms; }
.stagger > *:nth-child(4) { animation-delay: 180ms; }
.stagger > *:nth-child(5) { animation-delay: 240ms; }
.stagger > *:nth-child(6) { animation-delay: 300ms; }

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```

---

## PHẦN 3: Dark Mode

### 3.1 Implementation

```css
/* css/base/_dark-mode.css */
[data-theme="dark"] {
    --color-bg: #0c1222;
    --color-surface: #1a2332;
    --color-surface-elevated: #243044;
    --color-surface-hover: #2a3a4e;
    --color-text: #e2e8f0;
    --color-text-secondary: #94a3b8;
    --color-text-muted: #64748b;
    --color-border: #2d3f54;
    --color-border-hover: #3d5068;
    --color-primary-light: rgba(99,102,241,0.15);
    --color-primary-50: rgba(99,102,241,0.1);

    /* Shadows darker */
    --shadow-xs: 0 1px 2px rgba(0,0,0,0.2);
    --shadow-sm: 0 2px 4px rgba(0,0,0,0.25);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
    --shadow-lg: 0 12px 36px rgba(0,0,0,0.35);

    /* Glass card in dark mode */
    --glass-bg: rgba(26,35,50,0.8);
    --glass-border: rgba(255,255,255,0.08);

    color-scheme: dark;
}
```

### 3.2 Theme Toggle (JS)

```js
// js/components/theme.js
const THEME_KEY = 'easyrevise_theme';

function getTheme() {
    return localStorage.getItem(THEME_KEY) ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    // Update toggle button icon
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

// Auto-apply on load (trước khi render để tránh flash)
applyTheme(getTheme());

// Listen system preference changes
window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', e => {
        if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light');
    });
```

### 3.3 Toggle Button (HTML)

```html
<!-- Trong header, cạnh user menu -->
<button id="themeToggle" class="btn btn-icon btn-ghost" onclick="toggleTheme()" title="Đổi giao diện">
    🌙
</button>
```

### 3.4 Behavior

| Lần đầu | Theo system preference (auto) |
|---|---|
| User bấm toggle | Ghi localStorage, ưu tiên user choice |
| Lần sau load | Đọc localStorage nếu có, fallback system |
| Flash prevention | `applyTheme()` chạy ngay trong `<head>` |

---

## PHẦN 4: Cross-Platform

### 4.1 Responsive Breakpoints

```css
/* css/layout/_responsive.css */
:root {
    --screen-sm: 640px;
    --screen-md: 768px;
    --screen-lg: 1024px;
    --screen-xl: 1280px;
}

/* Mobile first → scale up */
.container { max-width: 100%; padding: 0 var(--space-4); margin: 0 auto; }
@media (min-width: 640px) { .container { max-width: 640px; } }
@media (min-width: 768px) { .container { max-width: 768px; } }
@media (min-width: 1024px) { .container { max-width: 1000px; } }
@media (min-width: 1280px) { .container { max-width: 1200px; } }

/* Utility classes */
.hide-mobile { display: none !important; }
@media (min-width: 768px) { .hide-mobile { display: initial !important; } }
@media (min-width: 768px) { .hide-desktop { display: none !important; } }
```

### 4.2 PWA Setup

**manifest.json:**
```json
{
    "name": "EasyRevise",
    "short_name": "EasyRevise",
    "description": "Hệ thống ôn tập đề cương thông minh",
    "start_url": "/",
    "display": "standalone",
    "theme_color": "#6366f1",
    "background_color": "#f8fafc",
    "icons": [
        { "src": "/assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
}
```

**sw.js (Service Worker):**
```js
// Cache tên + version
const CACHE_NAME = 'easyrevise-v1';
const ASSETS = [
    '/', '/exam.html', '/result.html',
    '/css/main.css', '/css/pages/home.css', '/css/pages/exam.css',
    '/js/core/utils.js', '/js/core/api.js', '/js/core/auth.js',
    '/assets/fonts/inter-400.woff2', '/assets/fonts/inter-600.woff2'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    // Network first cho API, cache first cho static
    if (e.request.url.includes('/api/')) return; // skip API
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

### 4.3 Touch & Mobile

| Feature | File | Code |
|---|---|---|
| Swipe câu hỏi | `js/components/swipe.js` | Touch events: swipeleft → nextQ, swiperight → prevQ |
| Safe area | `css/base/_reset.css` | `padding-bottom: env(safe-area-inset-bottom)` |
| Haptic | `js/pages/exam/answers.js` | `navigator.vibrate?.(10)` khi chọn đáp án |
| Landscape exam | `css/pages/exam.css` | `@media (orientation: landscape)` → 2 col layout |
| Pull refresh | `js/pages/home/index.js` | Touch drag down → `loadExams()` |

### 4.4 Performance

| Kỹ thuật | Cách làm |
|---|---|
| Self-host fonts | Download Inter woff2 → `/assets/fonts/` + `@font-face` + `font-display: swap` |
| Lazy KaTeX | Chỉ load khi `document.body.textContent.includes('$')` |
| Lazy jsQR | Chỉ load khi user bấm "Quét QR" |
| Critical CSS | Inline `_reset.css` + `_tokens.css` trong `<head>` (< 2KB) |
| Prefetch | `<link rel="prefetch" href="/exam.html">` khi hover exam card |
| Image lazy | `loading="lazy"` trên tất cả `<img>` |
| Gzip | Express: `app.use(compression())` — npm compression |

---

## PHẦN 5: Tính Năng Mới (trong scope UI Overhaul)

### 5.1 Homepage Layout (Compact, tối giản)

> ❌ Không dùng hero section lớn — tránh chiếm không gian
> ✅ Header nhỏ gọn, content ngay bên dưới

```
Desktop (≥768px):
┌──────────────────────────────────────────────────────────┐
│  EasyRevise              [🌙] [📷 Quét QR] [📋 Xem lại bằng mã] [Đăng nhập] │
│  Hệ thống ôn tập thông minh                                                 │
├──────────────────────────────────────────────────────────┤
│  Chọn đề ôn tập                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐                        │
│  │ Đề 1   │ │ Đề 2   │ │ Đề 3   │                       │
│  └────────┘ └────────┘ └────────┘                        │
└──────────────────────────────────────────────────────────┘

Mobile (<768px):
┌──────────────────────────┐
│  EasyRevise   [🌙][📷][📋][👤] │
│  ────────────────────────│
│  Chọn đề ôn tập          │
│  ┌──────────────────────┐│
│  │ Đề 1                 ││
│  └──────────────────────┘│
│  ┌──────────────────────┐│
│  │ Đề 2                 ││
│  └──────────────────────┘│
└──────────────────────────┘
(mobile: icon-only, có tooltip khi long-press)
```

### 5.2 Score Reveal Animation (Result Page)

```js
// Count-up animation: 0 → 8.5 trong 1.5s
function animateScore(el, target) {
    const duration = 1500;
    const start = performance.now();
    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = (target * eased).toFixed(1);
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}
```

### 5.3 Stagger Load Animation

Exam cards xuất hiện lần lượt với delay:
```html
<div class="exam-grid stagger">
    <!-- Mỗi card tự động delay 60ms -->
</div>
```

### 5.4 Icon System (SVG thay Emoji)

```html
<!-- Sử dụng SVG sprite -->
<svg class="icon icon-sm"><use href="/assets/icons/sprite.svg#exam"></use></svg>
<svg class="icon icon-sm"><use href="/assets/icons/sprite.svg#timer"></use></svg>
<svg class="icon icon-sm"><use href="/assets/icons/sprite.svg#check"></use></svg>
```

```css
.icon { width: 20px; height: 20px; fill: currentColor; flex-shrink: 0; }
.icon-sm { width: 16px; height: 16px; }
.icon-lg { width: 24px; height: 24px; }
```

---

## 📋 TỔNG HỢP — Thứ tự thực hiện

| # | Step | Effort | Nội dung | Status |
|---|---|---|---|---|
| 1 | CSS Foundation | 2h | `_reset`, `_tokens`, `_typography`, `_dark-mode`, `_animations` | ✅ DONE |
| 2 | CSS Components | 1.5h | `_buttons`, `_cards`, `_modals`, `_forms`, `_badges`, `_toasts`, `_skeleton`, `_progress` | ✅ DONE |
| 3 | CSS Layout + Pages | 1h | `_grid`, `_header`, `_responsive`, `home.css`, `exam.css`, `result.css` | ✅ DONE |
| 4 | JS Core + Components | 2h | `api`, `auth`, `utils`, `store`, `modal`, `toast`, `theme` | 🟡 toast + theme DONE, core pending |
| 5 | Tách index.html | 2h | HTML skeleton + 6 JS files home/ | 🔲 Pending |
| 6 | Tách app.js | 2h | 10 JS files exam/ | 🔲 Pending |
| 7 | Tách result.js | 1.5h | 6 JS files result/ | 🔲 Pending |
| 8 | Assets (fonts + icons) | 1h | Self-host Inter, SVG sprite | 🔲 Pending |
| 9 | Admin CSS cleanup | 1h | Tách inline CSS, dùng chung components | 🔲 Pending |
| 10 | Dark mode | 1h | Toggle, localStorage, Liquid Glass dark | ✅ DONE |
| 11 | Animations + Polish | 1h | Stagger, score count-up, glass hover | 🔲 Pending |
| 12 | Cross-platform | 1h | Swipe, safe area, landscape, haptic | 🔲 Pending |
| 13 | Student Dashboard | 2h | Trang /dashboard.html + API + UI | 🔲 Pending |
| 14 | QA + Testing | 1h | All browsers, mobile, dark mode, perf | 🔲 Pending |
| | **Tổng** | **~20h** | |

---

## PHẦN 6: Student Dashboard

### 6.1 Route + Trang mới

```
public/dashboard.html       # Student dashboard page
js/pages/dashboard/
├── index.js                # Init dashboard
├── stats.js                # Load + render stats
└── history.js              # Exam history list
```

### 6.2 Backend API

```
GET /api/dashboard          # Trả về stats + recent history của user
```

```json
// Response:
{
    "user": {
        "id": "uuid",
        "displayName": "Nguyễn Văn A",
        "role": "user",
        "joinedAt": "2026-03-15T00:00:00Z"
    },
    "stats": {
        "totalExams": 12,
        "totalAttempts": 18,
        "avgScore": 7.8,
        "bestScore": 10,
        "totalCorrect": 156,
        "totalQuestions": 200,
        "accuracy": 78,
        "timeSpentMinutes": 245,
        "streakDays": 3,
        "lastActiveAt": "2026-04-09T05:30:00Z"
    },
    "recentHistory": [
        {
            "examId": "...",
            "examTitle": "Đề thi HK2 - Unit 1",
            "subject": "Tiếng Anh",
            "score": 8.5,
            "correct": 17,
            "total": 20,
            "timeSpent": 1200,
            "completedAt": "2026-04-09T05:30:00Z"
        }
    ],
    "subjectBreakdown": [
        { "subject": "Tiếng Anh", "attempts": 12, "avgScore": 7.5 },
        { "subject": "Toán", "attempts": 6, "avgScore": 8.2 }
    ]
}
```

### 6.3 UI Layout

```
┌──────────────────────────────────────────────────┐
│  HEADER:  ← Quay lại  |  EasyRevise  |  🌙 👤   │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  👤 Nguyễn Văn A            🔥 3 ngày liên  │  │
│  │     Thành viên từ 15/03/2026   tiếp ôn tập  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│  │  12  │ │ 7.8  │ │ 78%  │ │ 4h5m │            │
│  │ Đề đã│ │ Điểm │ │ Chính│ │ Thời │            │
│  │  làm │ │  TB  │ │ xác  │ │ gian │            │
│  └──────┘ └──────┘ └──────┘ └──────┘            │
│                                                  │
│  📊 Phân tích theo môn                           │
│  ┌────────────────────────────────────────────┐  │
│  │ Tiếng Anh  ████████████░░░  12 bài · 7.5  │  │
│  │ Toán       ██████░░░░░░░░░   6 bài · 8.2  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  📋 Lịch sử gần đây                             │
│  ┌────────────────────────────────────────────┐  │
│  │ Đề thi HK2 Unit 1     8.5/10    2 giờ trước│  │
│  │ Đề thi HK2 Unit 2     7.0/10    1 ngày trước│  │
│  │ Kiểm tra từ vựng       9.0/10    3 ngày trước│  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [← Về trang chủ]                                │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 6.4 Stat Cards CSS

```css
/* css/pages/dashboard.css */
.stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-4);
}

.stat-card {
    padding: var(--space-6);
    text-align: center;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-xs);
    transition: all var(--duration-normal) var(--ease-out);
}

.stat-card:hover {
    background: var(--glass-bg);
    backdrop-filter: var(--glass-blur);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
}

.stat-value {
    font-size: var(--text-3xl);
    font-weight: 800;
    color: var(--color-primary);
    line-height: 1;
    margin-bottom: var(--space-1);
}

.stat-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* Subject breakdown bar */
.subject-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-hover);
    margin-bottom: var(--space-2);
}

.subject-bar-fill {
    height: 8px;
    border-radius: 4px;
    background: var(--color-primary);
    transition: width 0.6s var(--ease-out);
}
```

### 6.5 Navigation

| Từ đâu | Đi đâu | Cách |
|---|---|---|
| Homepage (avatar) | `/dashboard.html` | Click avatar → dropdown → "Dashboard" |
| Dashboard | Homepage | Nút "← Về trang chủ" |
| Dashboard | Result | Click lịch sử item → `result.html` |

### 6.6 Checklist

- [ ] `routes/dashboard.js`: API `GET /api/dashboard` (aggregate từ users.json history)
- [ ] `server.js`: Mount route `app.use('/api', dashboardRoutes)`
- [ ] `public/dashboard.html`: HTML skeleton
- [ ] `css/pages/dashboard.css`: Stat grid, subject bars, history list
- [ ] `js/pages/dashboard/index.js`: Init, load data, render
- [ ] `js/pages/dashboard/stats.js`: Render stat cards + subject breakdown
- [ ] `js/pages/dashboard/history.js`: Render history list
- [ ] Test: Login → avatar → Dashboard → xem stats + history → click bài → result

---

## PHẦN 7: Admin Panel — Settings & UX

### 7.1 Hiện trạng Settings (3 nhóm, 8 fields)

| Nhóm | Fields | Vấn đề |
|---|---|---|
| 🔐 Bảo mật | PIN, PIN session hours, Code expire hours | OK nhưng alert() thô |
| 🌐 Trang chủ | Site name, description | Thiếu logo, theme |
| 🤖 AI Model | Generate, Grade, OCR (3 dropdown) | Copy-paste 60 dòng x3 |

### 7.2 Vấn đề kỹ thuật

| # | Vấn đề | Mức | Giải pháp |
|---|---|---|---|
| 1 | 100% inline styles | 🔴 | Chuyển sang CSS classes trong `admin.css` |
| 2 | Model select duplicate 3 lần | 🟡 | JS render dynamic từ 1 danh sách models |
| 3 | `alert()` khi validate lỗi | 🟡 | Dùng toast/inline error message |
| 4 | Save feedback yếu (flash 2s) | 🟡 | Toast "Đã lưu!" persistent hơn |
| 5 | Thiếu nhiều settings hữu ích | 🟡 | Xem 7.3 |

### 7.3 Đề xuất bổ sung settings

#### Nhóm: 🎨 Giao diện

| Setting | Type | Mô tả |
|---|---|---|
| Default theme | select: light/dark/auto | Theme mặc định cho student |
| Logo URL | text/upload | Logo hiển thị trên homepage |
| Primary color | color picker | Đổi màu brand (mặc định #6366f1) |

#### Nhóm: 📋 Đề thi (defaults)

| Setting | Type | Mô tả |
|---|---|---|
| Max attempts mặc định | number | Số lần làm bài tối đa (hiện phải set per exam) |
| Cho xem đáp án | toggle | Bật/tắt global cho HS xem đáp án sau khi nộp |
| Tự động chấm AI | toggle | On/Off AI chấm tự luận khi HS nộp |

#### Nhóm: 🗂️ Storage

| Setting | Type | Mô tả |
|---|---|---|
| Drive folder ID | text (readonly) | Hiện đang trong .env — show ở đây để biết |
| Max file size (MB) | number | Giới hạn upload (hiện hardcode 10MB) |

#### Nhóm: 📧 Thông báo (tương lai)

| Setting | Type | Mô tả |
|---|---|---|
| Webhook URL | text | Gửi notify khi có bài nộp mới (Zalo/Telegram bot) |

#### Nhóm: ⚠️ Danger Zone (tách riêng, cuối trang, viền đỏ)

| Action | Mô tả |
|---|---|
| Backup database | Download tất cả JSON → zip |
| Restore backup | Upload zip → confirm → restore |
| Xóa tất cả bài nộp | Confirm modal + nhập PIN |
| Reset settings | Khôi phục cài đặt mặc định |

### 7.4 Admin Tab Bar UX

**Hiện tại 9 tabs:**
```
📝 Đề thi | 👥 Tài khoản | 📚 Môn học | 📊 Mã kích hoạt | 📋 Bài nộp | 📚 Ngân hàng | ⚙️ Cài đặt | 📖 Hướng dẫn | 🤖 AI Tạo Đề
```

**Vấn đề:** 9 tabs tràn trên mobile, khó tìm, overwhelming

**Đề xuất — gom lại:**

```
Desktop (≥1024px): Hiện tất cả tabs 1 hàng
Tablet (768-1024px): 2 hàng hoặc scroll ngang
Mobile (<768px): Sidebar/Hamburger menu thay tab bar
```

**Hoặc nhóm tabs:**

| Nhóm | Tabs |
|---|---|
| **Chính** (hiện luôn) | 📝 Đề thi · 📋 Bài nộp · 🤖 AI Tạo Đề |
| **Quản lý** (dropdown ▾) | 👥 Tài khoản · 📚 Môn học · 📊 Mã kích hoạt · 📚 Ngân hàng |
| **Hệ thống** (dropdown ▾) | ⚙️ Cài đặt · 📖 Hướng dẫn |

### 7.5 Checklist

- [ ] Chuyển inline styles → `css/pages/admin.css`
- [ ] JS render model dropdown (bỏ 3x copy-paste HTML)
- [ ] Thay `alert()` → toast
- [ ] Thêm settings mới: theme, max attempts, xem đáp án
- [ ] Danger Zone UI (viền đỏ, confirm modal)
- [ ] Tab bar responsive: scroll/dropdown trên mobile
- [ ] Backup/Restore UI

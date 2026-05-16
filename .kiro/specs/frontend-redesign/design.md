# Design Document

**Spec:** Frontend Redesign
**Status:** Approved (locked decisions in §11)
**Style:** Apple HIG / Liquid Glass
**Tech:** Vanilla JS + esbuild bundle, CSS custom properties
**Mobile-first:** 320px → 1920px

> Document này định nghĩa "how" — design tokens cụ thể, component library, layout sketches. Sau khi approve sẽ chuyển sang `tasks.md`.

---

## Overview

Redesign toàn bộ frontend EasyRevise theo style Apple HIG / Liquid Glass, mobile-first, với mục tiêu:

1. **Visual identity rõ ràng** — soft shadows, generous radius, glass blur, system fonts
2. **Mobile-first** — design 320px trước, scale up lên desktop
3. **Component-driven** — design tokens + reusable components, không inline style
4. **Performance** — lazy-load KaTeX, code-split bundle, < 30KB gzipped cho home page
5. **Accessibility** — WCAG AA, keyboard navigation, focus rings, ARIA labels

Tài liệu được tổ chức:
- §1 Design Tokens (colors, typography, spacing, motion, breakpoints)
- §2 Iconography (SVG sprite, Lucide-based)
- §3 Component Library (12 components có specs + API)
- §4 Layout Sketches (5 pages chính, mobile + desktop)
- §5 CSS Architecture
- §6 JavaScript Architecture (split monolith + esbuild)
- §7 Animation Principles
- §8 Accessibility Checklist
- §9 Mobile Patterns (bottom nav, bottom sheet, haptic, no zoom)
- §10 Brand
- §11 Locked Decisions

---

## Architecture

### Layered architecture

```
┌──────────────────────────────────────────────┐
│  HTML pages (index, exam, result, dashboard) │  ← Entry points
├──────────────────────────────────────────────┤
│  Page modules (public/js/pages/*)            │  ← Business logic
│  - home/, exam/, result/, dashboard/, admin/ │
├──────────────────────────────────────────────┤
│  Components (public/js/components/*)         │  ← Reusable UI
│  - modal, toast, lightbox, tabs, tooltip     │
├──────────────────────────────────────────────┤
│  Core (public/js/core/*)                     │  ← Foundation
│  - api, auth, store, theme, icons, utils     │
├──────────────────────────────────────────────┤
│  CSS (public/css/*)                          │  ← Visual layer
│  - tokens, base, components, layout, pages   │
├──────────────────────────────────────────────┤
│  Assets (public/assets/*)                    │  ← Static
│  - icons/sprite.svg, fonts/                  │
└──────────────────────────────────────────────┘
```

### Build pipeline

- **esbuild** bundles each page entry into a single ESM module
- Code splitting: KaTeX, jsQR lazy-loaded only when needed
- Source maps in dev, minified in prod
- Output: `public/js/dist/{home,exam,result,dashboard,admin}.js`
- HTML pages load 1 entry point: `<script type="module" src="/js/dist/home.js"></script>`

### State management

- **No global state library** — vanilla JS, page-scoped state
- **localStorage** for: theme preference, auth token, exam in-progress, in-memory cache invalidation
- **sessionStorage** for: temp UI state (open modals, scroll position)
- **In-memory** for: user cache (60s TTL in `lib/auth.js` server-side, mirrored client side)

### Server contract

KHÔNG đổi backend API. Frontend chỉ:
- Read existing endpoints (`/api/exams`, `/api/auth/*`, `/api/exams/:id/code-result`...)
- Send signed URLs verbatim (không parse/manipulate `?sig=...&exp=...`)
- Use JWT from login response, store in localStorage (chuyển sang httpOnly cookie ở sprint sau)

---

## Components and Interfaces

Chi tiết đầy đủ ở §3 (Component Library) bên dưới. Tóm tắt API:

### Button
```js
<button class="btn btn-primary">Bắt đầu</button>
<button class="btn btn-secondary btn-icon" aria-label="Đóng">
    <svg class="icon"><use href="#x"/></svg>
</button>
```

### Modal
```js
import { openModal, closeModal } from '/js/components/modal.js';
openModal('previewModal', { onClose: () => {...} });
```

### Toast
```js
import { showToast } from '/js/components/toast.js';
showToast('Đã lưu thành công', 'success');
showToast('Lỗi kết nối', 'error', { duration: 0 }); // sticky
```

### Theme
```js
import { toggleTheme, getTheme } from '/js/core/theme.js';
```

### Icons
```js
import { Icon } from '/js/core/icons.js';
element.innerHTML = Icon('timer', { size: 'lg' });
```

---

## Data Models

Frontend không định nghĩa data models mới — sử dụng schema hiện có từ backend (xem `PROJECT.md` § Data Schemas):

- **Exam:** `{id, title, subject, year, sections[], accessCodes[], ...}`
- **Section:** `{id, title, type, questions[], ...}`
- **Question:** `{id, question, options[], correctAnswer, blanks[], ...}`
- **User:** `{id, username, displayName, role, history[]}`
- **Result:** `{score, results[], timeSpent, ...}`
- **Settings:** `{adminPin, siteName, siteDescription, generateModel, ...}`

### Frontend-only state

```ts
// localStorage keys (existing — preserved for backward compat)
'easyrevise_token'         : string (JWT or legacy opaque)
'easyrevise_user'          : { id, username, displayName, role }
'easyrevise_unlocked'      : { [examId]: code }
'easyrevise_in_progress'   : { [examId]: { answeredCount, totalQuestions, timestamp } }
'easyrevise_admin_pin_session' : { expiry: number }

// NEW
'easyrevise_theme'         : 'light' | 'dark' | 'auto'
'easyrevise_exam_draft'    : { [examId]: answers }  // auto-save
```

---

## Correctness Properties

Properties UI phải uphold (testable bằng manual QA hoặc smoke test):

### Property 1: Theme persists across reloads

Reload page → theme giữ nguyên (no flicker, no flash of wrong theme). Apply via inline `<script>` in `<head>` before CSS.

**Validates: Requirements 4.5, 3.1**

### Property 2: Modal focus trap

Mở modal → Tab loop trong modal, Esc đóng, focus trở về trigger element.

**Validates: Requirements 4.2**

### Property 3: Form validation before submit

Input invalid → show error inline, không call API.

**Validates: Requirements 3.6**

### Property 4: Auto-save exam state

Thay đổi answer → debounced save vào localStorage. Reload mid-exam → restore answers.

**Validates: Requirements 3.2**

### Property 5: Polling stops when graded

Nếu AI đã chấm xong → polling dừng, không tiếp tục network requests.

**Validates: Requirements 3.3**

### Property 6: Bottom nav visibility

Visible trên home/dashboard/history, ẩn trên exam page (immersive).

**Validates: Requirements 6.1**

### Property 7: Reduced motion respected

`prefers-reduced-motion: reduce` → animations < 0.01ms.

**Validates: Requirements 4.2**

### Property 8: Touch target sizing

Mọi interactive element ≥ 44×44px trên mobile.

**Validates: Requirements 4.3**

### Property 9: Color contrast

≥ 4.5:1 cho text, ≥ 3:1 cho UI (auto check via Lighthouse).

**Validates: Requirements 4.2**

### Property 10: No console errors on happy path

Load page, click around standard flows, no errors in console.

**Validates: Requirements 4.1**

---

## Error Handling

### Network errors
- Use existing `EasyAPI` wrapper (`public/js/core/api.js`)
- 401 → redirect login modal (existing behavior)
- 403 → show toast "Không có quyền"
- 429 → show toast "Quá nhiều yêu cầu, đợi 1 phút"
- 5xx → show toast "Lỗi hệ thống, thử lại sau"
- Offline → banner "Mất kết nối" + retry button

### Form errors
- Inline error message dưới input
- `aria-describedby` link to error
- Border-color `--error`, helper text in `--error`
- Focus first invalid field on submit

### File upload errors
- 400 magic-byte fail → "File không hợp lệ (mime spoof)"
- 413 → "File quá lớn (max 10MB)"
- 401 → "Token hết hạn, đăng nhập lại"

### AI grading errors
- Skipped (no API key) → show "AI chưa cấu hình" badge, GV chấm tay
- Error → show "AI lỗi: {message}", retry button
- Timeout → polling timeout 30s, show "Đang chậm" message

### Render errors
- KaTeX fail → fallback raw LaTeX text với note "Lỗi render"
- Image fail → show placeholder + "Ảnh lỗi"
- Markdown fail → fallback escaped plain text

### Boundary error
- Wrap each page module in try/catch
- Log to console + send to error tracking (Sentry future)
- Show "Có lỗi xảy ra" + reload button

---

## Testing Strategy

### Visual regression
- Screenshots saved per page in `.kiro/specs/frontend-redesign/screenshots/`
- Compare before/after for each phase
- Key viewports: 320px, 768px, 1280px

### Lighthouse audit (mobile)
- Target ≥ 90 on Performance, A11y, Best Practices, SEO for student pages
- Target ≥ 80 admin (info-dense, OK lower bar)
- Run via Chrome DevTools or `lighthouse-ci` in CI

### Manual QA per page
1. Resize to 320px / 375px / 768px / 1024px / 1920px → no horizontal scroll, no overflow
2. Tab through all interactive → focus ring visible, logical order
3. Toggle dark mode → no flicker, all elements styled
4. Test reduced-motion (DevTools render emulation)
5. Test slow 3G (DevTools network throttle)
6. Test on real mobile device (at least 1 Android + 1 iOS)

### Component style guide
- `/components.html` shows all components in all variants/states
- Visual reference for design QA
- Useful when developer adds new feature

### Smoke tests (existing)
- 15 integration tests in `tests/integration.test.js` already cover backend contract
- Frontend-specific smoke: manual checklist per page (saved in `tasks.md`)

### A11y testing
- Lighthouse a11y score
- Manual: keyboard-only navigation
- VoiceOver (Mac) or NVDA (Windows) basic flow once per phase
- Color contrast: Lighthouse auto + DevTools color picker

### Performance testing
- Lighthouse mobile audit on each page
- Bundle size verification (`npm run build` → check dist sizes)
- KaTeX render benchmark: 50 formulas page, expect < 200ms total

---

## 1. Design Tokens

### 1.1 Color palette

#### Light theme
```css
/* Surfaces */
--bg:           #f5f5f7;   /* page background, soft gray (Apple system) */
--surface:      #ffffff;   /* card, modal */
--surface-2:    #f5f5f7;   /* secondary surface, hover state */
--surface-3:    #ebebed;   /* tertiary, dividers backgrounds */
--surface-glass: rgba(255, 255, 255, 0.72);  /* sticky header */

/* Borders */
--border:        rgba(0, 0, 0, 0.08);
--border-strong: rgba(0, 0, 0, 0.16);

/* Text */
--text:    #1d1d1f;   /* primary text */
--text-2:  #515154;   /* secondary text */
--text-3:  #86868b;   /* tertiary, captions */
--text-4:  #a1a1a6;   /* placeholder, disabled */

/* Accent — Apple Blue */
--accent:        #0071e3;
--accent-hover:  #0077ed;
--accent-soft:   rgba(0, 113, 227, 0.12);
--accent-text:   #0071e3;

/* Semantic */
--success:        #248a3d;
--success-soft:   rgba(36, 138, 61, 0.12);
--warning:        #c93400;
--warning-soft:   rgba(201, 52, 0, 0.10);
--error:          #ff3b30;
--error-soft:     rgba(255, 59, 48, 0.12);
--info:           #0071e3;
```

#### Dark theme
```css
--bg:           #000000;
--surface:      #1c1c1e;
--surface-2:    #2c2c2e;
--surface-3:    #3a3a3c;
--surface-glass: rgba(28, 28, 30, 0.72);

--border:        rgba(255, 255, 255, 0.08);
--border-strong: rgba(255, 255, 255, 0.16);

--text:    #f5f5f7;
--text-2:  #a8a8ad;
--text-3:  #6e6e73;
--text-4:  #48484a;

--accent:        #0a84ff;
--accent-hover:  #409cff;
--accent-soft:   rgba(10, 132, 255, 0.18);
--accent-text:   #0a84ff;

--success:        #30d158;
--success-soft:   rgba(48, 209, 88, 0.16);
--warning:        #ff9f0a;
--warning-soft:   rgba(255, 159, 10, 0.16);
--error:          #ff453a;
--error-soft:     rgba(255, 69, 58, 0.16);
```

### 1.2 Typography

```css
/* Font stack (Apple system fallback chain) */
--font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text',
             'Inter', 'Segoe UI', system-ui, sans-serif;
--font-mono: 'SF Mono', 'Menlo', 'JetBrains Mono', 'Geist Mono', monospace;

/* Sizes — modular scale (1.125 ratio) */
--text-xs:   12px;   /* caption, badges */
--text-sm:   13px;   /* labels, table cells */
--text-base: 15px;   /* body */
--text-md:   16px;   /* large body, mobile inputs (no zoom) */
--text-lg:   17px;   /* card title */
--text-xl:   20px;   /* section h2 */
--text-2xl:  22px;   /* page title (compact) */
--text-3xl:  28px;   /* page title (default) */
--text-4xl:  34px;   /* hero (mobile) */
--text-5xl:  44px;   /* hero (desktop) */

/* Weights */
--weight-regular: 400;
--weight-medium:  500;
--weight-semi:    600;
--weight-bold:    700;

/* Line heights */
--leading-tight:  1.15;
--leading-normal: 1.47;
--leading-relaxed: 1.6;

/* Letter spacing */
--tracking-tight: -0.04em;   /* hero */
--tracking-snug:  -0.02em;   /* heading */
--tracking-normal: -0.01em;  /* body */
```

### 1.3 Spacing scale (4px base)

```css
--space-0:  0;
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  20px;
--space-6:  24px;
--space-8:  32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
```

### 1.4 Radius

```css
--radius-xs:  6px;    /* tags, small inputs */
--radius-sm:  8px;    /* compact buttons */
--radius:     12px;   /* card, button default */
--radius-md:  14px;   /* input */
--radius-lg:  18px;   /* card large */
--radius-xl:  24px;   /* modal */
--radius-2xl: 32px;   /* hero card */
--radius-pill: 980px; /* pill button (Apple CTA) */
--radius-full: 9999px;
```

### 1.5 Shadow

```css
/* Apple-style soft shadows — multiple layers */
--shadow-xs:  0 1px 1px rgba(0,0,0,0.04);
--shadow-sm:  0 1px 2px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04);
--shadow-md:  0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.04);
--shadow-lg:  0 10px 40px rgba(0,0,0,0.12);
--shadow-xl:  0 20px 60px rgba(0,0,0,0.16);
--shadow-glass: 0 8px 32px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.06);

/* Dark mode override (opacity boost) */
[data-theme="dark"] {
    --shadow-sm:  0 1px 2px rgba(0,0,0,0.4);
    --shadow-md:  0 4px 16px rgba(0,0,0,0.5);
    --shadow-lg:  0 10px 40px rgba(0,0,0,0.6);
    --shadow-xl:  0 20px 60px rgba(0,0,0,0.7);
}
```

### 1.6 Motion

```css
/* Easing curves */
--ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);   /* slight overshoot */
--ease-apple:  cubic-bezier(0.2, 0.8, 0.2, 1);      /* Apple signature */

/* Duration */
--dur-instant: 100ms;
--dur-fast:    150ms;   /* hover, focus */
--dur-base:    220ms;   /* modal, dropdown */
--dur-slow:    320ms;   /* page transition */
--dur-slower:  500ms;   /* count-up, stagger */
```

### 1.7 Z-index layers

```css
--z-base:     0;
--z-sticky:   10;     /* sticky header */
--z-dropdown: 50;
--z-overlay:  100;    /* modal overlay */
--z-modal:    101;
--z-toast:    200;    /* highest */
```

### 1.8 Breakpoints

```css
/* Mobile-first: default styles for mobile, media queries scale up */
--bp-sm:   640px;     /* large phone, small tablet portrait */
--bp-md:   768px;     /* tablet portrait */
--bp-lg:   1024px;    /* tablet landscape, small laptop */
--bp-xl:   1280px;    /* desktop */
--bp-2xl:  1536px;    /* large desktop */
```

---

## 2. Iconography

### 2.1 Strategy

- **Primary library:** Lucide (lucide.dev) — MIT licensed, ~1500 icons, Apple-feel
- **Fallback for special:** SF Symbols-style custom SVG (only when Lucide doesn't have)
- **Storage:** `public/assets/icons/sprite.svg` (single file with `<symbol>` elements)
- **Render:** `<svg class="icon"><use href="/assets/icons/sprite.svg#name"/></svg>`

### 2.2 Specs

```
viewBox: 0 0 24 24
stroke-width: 1.5 (default), 2 (emphasis)
stroke-linecap: round
stroke-linejoin: round
fill: none (line icons)
color: currentColor (inherit from parent)
```

### 2.3 CSS class

```css
.icon {
    width: 1em;
    height: 1em;
    display: inline-block;
    vertical-align: -0.125em;
    flex-shrink: 0;
}
.icon-sm { width: 14px; height: 14px; }
.icon-md { width: 18px; height: 18px; }
.icon-lg { width: 22px; height: 22px; }
.icon-xl { width: 28px; height: 28px; }
```

### 2.4 Icon set (initial — sẽ mở rộng)

| Use case | Icon (Lucide name) |
|---|---|
| Logo mark | (custom — chữ "E" hoặc "D" trong rounded square) |
| Theme toggle | `sun` / `moon` |
| User account | `user` / `user-circle` |
| Login | `log-in` |
| Logout | `log-out` |
| Admin | `shield-check` |
| Search | `search` |
| Close | `x` |
| Menu | `menu` |
| More | `more-horizontal` |
| Code/key | `key` |
| QR scan | `qr-code` |
| Camera | `camera` |
| Exam (paper) | `file-text` |
| Math | `function-square` |
| English | `globe` |
| Physics | `atom` |
| Reading | `book-open` |
| Listening | `headphones` |
| Writing | `pen-line` |
| Multiple choice | `check-circle` |
| Fill in blank | `pencil-line` |
| Timer | `timer` |
| Clock | `clock` |
| Flag (mark) | `flag` |
| Bookmark | `bookmark` |
| Submit | `send` |
| Result/score | `trophy` / `medal` |
| Stats | `bar-chart-3` |
| Dashboard | `layout-dashboard` |
| Settings | `settings-2` |
| Help | `help-circle` |
| Info | `info` |
| Success | `check-circle-2` |
| Warning | `alert-triangle` |
| Error | `x-circle` |
| Upload | `upload-cloud` |
| Download | `download` |
| File PDF | `file-text` |
| Image | `image` |
| Trash | `trash-2` |
| Edit | `pencil` |
| Plus | `plus` |
| Arrow right | `arrow-right` |
| Chevron right | `chevron-right` |
| Sparkle (AI) | `sparkles` |
| Refresh | `refresh-cw` |

### 2.5 Subject colors

Mỗi môn có 1 accent màu nhẹ cho icon container (giữ icon line đen/trắng, chỉ tint background):

| Môn | Color (light) | Color (dark) |
|---|---|---|
| Toán | `#5856d6` (purple) | `#5e5ce6` |
| Anh | `#0071e3` (blue) | `#0a84ff` |
| Vật lý | `#ff9500` (orange) | `#ff9f0a` |
| Hóa | `#34c759` (green) | `#30d158` |
| Sinh | `#00c7be` (teal) | `#40c8e0` |
| Sử | `#a2845e` (brown) | `#bf8d4f` |
| Địa | `#cc4c8a` (pink) | `#ff375f` |
| Văn | `#ff3b30` (red) | `#ff453a` |
| Tin | `#5ac8fa` (cyan) | `#64d2ff` |
| IELTS | `#5856d6` + gradient | đặc biệt |

---

## 3. Component Library

### 3.1 Button

```
Variants: primary, secondary, ghost, danger
Sizes: sm (32px), md (40px), lg (44px)
Shape: pill (default for CTA), rounded (default for secondary)
States: default, hover, active, focus, disabled, loading
```

**API:**
```html
<button class="btn btn-primary">Bắt đầu</button>
<button class="btn btn-primary btn-pill btn-lg">Bắt đầu làm bài</button>
<button class="btn btn-secondary"><svg class="icon"><use href="..."/></svg> Xuất CSV</button>
<button class="btn btn-ghost btn-icon" aria-label="Đóng"><svg class="icon"><use href="...#x"/></svg></button>
<button class="btn btn-primary" disabled>Đang xử lý...</button>
```

**Touch:** All buttons SHALL have minimum 44×44 hit area on mobile (use padding or `:before` expansion).

### 3.2 Input / Textarea

```
Sizes: sm (32px), md (44px desktop / 48px mobile)
States: default, focus (ring), error, success, disabled
font-size: 16px on mobile (no iOS zoom)
```

**Variants:**
- Code input — uppercase, letter-spacing, monospace optional
- Search input — leading icon
- Textarea — auto-resize optional

### 3.3 Card

```
Variants: flat (1px border, no shadow), raised (shadow-sm), glass (blur)
Padding: 16px (mobile) / 20px (desktop)
Radius: var(--radius-lg) = 18px
Hover (raised only): translateY(-2px) + shadow-md
```

### 3.4 Modal / Bottom sheet

**Desktop (≥640px):** centered modal with `scale-in` animation
**Mobile (<640px):** bottom sheet sliding up, full-width

```
Background: var(--surface)
Border-radius: 24px (desktop) / 20px 20px 0 0 (bottom sheet)
Backdrop: blur(20px) + rgba(0,0,0,0.4) overlay
Close: X button top-right + Esc key + click outside
Focus trap: required
Animation:
  Desktop: opacity 0→1 + scale 0.95→1, 220ms ease-apple
  Mobile: translateY(100%)→0, 280ms ease-apple
```

### 3.5 Toast

```
Position: top-right (desktop), top-center (mobile)
Max stacked: 3 (oldest auto-dismiss)
Duration: 4s default, infinite for errors with action
Slide-in: from right (desktop) / from top (mobile)
Variants: success, error, warning, info
```

### 3.6 Tab

```
Pill style for primary tabs (rounded background)
Underline style for sub-tabs
Sliding indicator on active tab change
Keyboard: arrow keys to navigate, Tab to enter content
```

### 3.7 Badge / Tag / Pill

```
Sizes: xs (16px), sm (20px), md (24px)
Variants: neutral, accent, success, warning, error, with-dot
Use cases: "Mới", "Hot", score pills, status tags
```

### 3.8 Avatar

Use existing FaceHash SSR. Sizes: 24, 32, 40, 56, 80px.
Fallback: initial letter on gradient background.

### 3.9 Progress bar

```
Linear: 4px height, rounded ends, accent fill
Circular (timer): SVG, animated stroke-dashoffset
Indeterminate: shimmer or sliding bar for loading
```

### 3.10 Empty state

```
Vertical centered layout
Icon (60px) - title - description - optional action button
Use cases: no exams, no submissions, error state
```

### 3.11 Skeleton

Pulsing gray blocks matching final layout. 3 variants: text-line, avatar, card.

### 3.12 Bottom Navigation (mobile only)

```
Position: fixed bottom, safe-area inset
Height: 56px + safe-area-inset-bottom
Items: 4 tabs max — Home, Đề thi, Lịch sử, Tài khoản
Active: filled icon + label
Inactive: outline icon + muted label
```

---

## 4. Layout Sketches

### 4.1 Student Home (`index.html`) — mobile

```
┌─────────────────────────────┐
│  ☰  EasyRevise         🌙 👤 │ ← Glass header, sticky
├─────────────────────────────┤
│                             │
│  Tham gia bài thi           │ ← Eyebrow accent
│  Nhập mã kích hoạt          │ ← Hero h1
│                             │
│  ┌───────────────────┐      │
│  │ ABC12345          │      │ ← Code input
│  └───────────────────┘      │
│  [   Vào thi   →  ]         │ ← Pill primary
│                             │
│  [ 📷 Quét QR ]             │ ← Secondary
│                             │
├─────────────────────────────┤
│  Đề thi mở      Xem tất cả →│
│  ┌─────────────────────┐    │
│  │ [📐] Toán THPT      │    │ ← Card
│  │      30 câu · 45 ph │    │
│  │      [Mới]          │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ [🌐] English Reading│    │
│  ...                        │
├─────────────────────────────┤
│  Lịch sử của bạn            │
│  ...                        │
├─────────────────────────────┤
│  [🏠] [📚] [📊] [👤]        │ ← Bottom nav
└─────────────────────────────┘
```

### 4.2 Student Home — desktop

```
┌────────────────────────────────────────────────────────┐
│  EasyRevise        Đề  Lịch sử  Hướng dẫn   🌙 [Login] │
├────────────────────────────────────────────────────────┤
│                                                        │
│  Tham gia bài thi                                      │
│  Nhập mã kích hoạt                                     │
│  Mã do giáo viên cung cấp...                           │
│                                                        │
│  ┌──────────────┐  [  Vào thi →  ]                     │
│  │ ABC12345     │                                      │
│  └──────────────┘                                      │
│                                                        │
├────────────────────────────────────────────────────────┤
│  Đề thi mở                          Xem tất cả →       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │📐 Toán  │ │🌐 English│ │🎯 IELTS │                   │
│  │30 · 45p │ │40 · 60p │ │40 · 60p │                   │
│  │[Mới]    │ │         │ │[Hot]    │                   │
│  └─────────┘ └─────────┘ └─────────┘                   │
├────────────────────────────────────────────────────────┤
│  Lịch sử của bạn                                       │
│  Toán Lượng giác         Hôm qua    [9.2]              │
│  English Grammar Quiz    3 ngày     [7.5]              │
│  ...                                                   │
└────────────────────────────────────────────────────────┘
```

### 4.3 Exam page (`exam.html`)

**Mobile:** sticky top with timer + progress, single column. Question text dominant. Sticky bottom action bar.
**Desktop:** sidebar with navigator grid (left) + content (center) + flag/notes (right collapsible).

```
┌─────────────────────────────┐
│  ⏱ 23:45  ●●●○○○○○○○ 3/10  │ ← Sticky bar
├─────────────────────────────┤
│                             │
│  Câu 3                  [⚑] │
│                             │
│  Tìm giá trị x:             │
│  $$ x^2 - 5x + 6 = 0 $$     │ ← KaTeX
│                             │
│  ┌──────────────────────┐   │
│  │ A.  x = 2 hoặc x = 3 │   │
│  └──────────────────────┘   │
│  ┌──────────────────────┐   │
│  │ B.  x = -2 hoặc x = -3│  │
│  └──────────────────────┘   │
│  ...                        │
├─────────────────────────────┤
│ [< Câu trước] [Tiếp →]      │ ← Sticky
└─────────────────────────────┘
```

### 4.4 Result page

```
┌─────────────────────────────┐
│  ← Quay về                  │
├─────────────────────────────┤
│                             │
│      Toán THPT — Lượng giác │
│                             │
│           ┌─────┐           │
│           │ 8.5 │           │ ← Big circular score
│           │ /10 │           │
│           └─────┘           │
│                             │
│   Đúng 17/20 · Bỏ 3         │
│                             │
├─────────────────────────────┤
│  📊 Phân tích                │
│  Trắc nghiệm    17/20  ✓    │
│  Tự luận        7.5/10 🤖   │
│  Thời gian      32 phút      │
├─────────────────────────────┤
│  📝 Chi tiết                 │
│  > Câu 1   ✓ Đúng           │
│  > Câu 2   ✗ Sai  [🤔 Tại sao?]│
│  > Câu 3   ⚠ Bỏ qua         │
│  ...                        │
└─────────────────────────────┘
```

### 4.5 Admin layout (desktop)

```
┌──────────┬───────────────────────────────────────────┐
│ EasyRevise│  Bảng điều khiển              [+ Tạo đề] │
│ /admin   ├───────────────────────────────────────────┤
│          │  ┌──Stats────┐ ┌──Stats────┐ ┌──Stats──┐ │
│ TỔNG QUAN│  │ Đề: 42    │ │ HS: 386   │ │ Bài:1842│ │
│ ▸ Dashboard│ └───────────┘ └───────────┘ └─────────┘ │
│   Đề thi │                                           │
│   Câu hỏi│  ┌──Chart──────────┐ ┌──Activity───────┐  │
│   Bài nộp│  │ Bài nộp 7 ngày  │ │ Mới đây         │  │
│          │  │ ▮▮▯▮▯▮▮         │ │ • A nộp Toán    │  │
│ QUẢN LÝ  │  └─────────────────┘ │ • AI chấm 3 bài │  │
│   Người  │                      │ • ...           │  │
│   Mã     │  ┌──Table──────────┴──────────────────┐  │
│   Stats  │  │ Bài nộp mới nhất                   │  │
│          │  │ ...                                │  │
│ HỆ THỐNG │  └────────────────────────────────────┘  │
│   Cài đặt│                                          │
│ ┌──────┐ │                                          │
│ │ A   ⚙│ │ ← User card + theme toggle               │
│ └──────┘ │                                          │
└──────────┴──────────────────────────────────────────┘
```

**Mobile admin:** sidebar trở thành slide-out drawer + topbar có hamburger.

---

## 5. CSS Architecture

```
public/css/
├── main.css                # Entry point — @import everything
│
├── tokens/                 # Design tokens (NEW)
│   ├── _colors.css         # CSS variables light + dark
│   ├── _typography.css
│   ├── _spacing.css
│   ├── _shadows.css
│   ├── _motion.css
│   └── _breakpoints.css
│
├── base/                   # Foundation
│   ├── _reset.css          # Modern reset (Josh Comeau base)
│   ├── _global.css         # html/body defaults
│   ├── _typography.css     # h1-h6, p, links
│   ├── _focus.css          # :focus-visible ring
│   ├── _scrollbar.css      # custom scrollbar
│   └── _print.css
│
├── components/             # UI primitives
│   ├── _button.css
│   ├── _input.css
│   ├── _card.css
│   ├── _modal.css          # + bottom sheet variant
│   ├── _toast.css
│   ├── _tab.css
│   ├── _badge.css
│   ├── _avatar.css
│   ├── _progress.css
│   ├── _skeleton.css
│   ├── _empty-state.css
│   ├── _bottom-nav.css     # mobile only
│   └── _icon.css
│
├── layout/                 # Page structures
│   ├── _container.css
│   ├── _header.css         # glass sticky header
│   ├── _footer.css
│   ├── _sidebar.css        # admin sidebar
│   └── _grid.css
│
├── pages/                  # Page-specific
│   ├── _home.css
│   ├── _exam.css
│   ├── _result.css
│   ├── _dashboard.css
│   ├── _admin.css
│   └── _admin-bento.css
│
└── utilities/              # Atomic helpers (sparingly)
    ├── _spacing.css        # m-*, p-*
    ├── _flex.css
    ├── _text.css
    └── _hide.css
```

**Rules:**
- Mỗi component file < 250 lines, nếu lớn → split
- KHÔNG dùng `!important` trừ utility class hoặc print
- Inline `style="..."` chỉ cho dynamic value (vd progress width: 47%)
- Dùng CSS nesting (browser native) khi cần (target: Chrome 112+, Safari 16.5+, FF 117+)

---

## 6. JavaScript Architecture

### 6.1 Cấu trúc

```
public/js/
├── core/
│   ├── api.js              # fetch wrapper (existing)
│   ├── auth.js             # login/logout state
│   ├── store.js            # localStorage helpers
│   ├── utils.js            # debounce, throttle, formatDate, escapeHtml
│   ├── icons.js            # NEW — sprite loader, <Icon> helper
│   ├── theme.js            # NEW — dark mode toggle + persist
│   └── i18n.js             # NEW (future) — string lookup
│
├── components/             # Reusable UI logic
│   ├── modal.js            # open/close/trap focus
│   ├── toast.js            # show/dismiss
│   ├── bottom-sheet.js     # mobile modal variant
│   ├── tabs.js
│   ├── tooltip.js
│   ├── confirm.js          # custom confirm()
│   ├── prompt.js           # custom prompt()
│   └── lightbox.js         # image preview
│
├── pages/                  # One folder per page
│   ├── home/
│   │   ├── index.js        # entry
│   │   ├── exam-list.js
│   │   ├── code-entry.js
│   │   ├── qr-scanner.js
│   │   ├── qr-popup.js
│   │   └── history.js
│   ├── exam/
│   │   ├── index.js        # split from monolith app.js (1400L)
│   │   ├── timer.js
│   │   ├── navigator.js
│   │   ├── question-mc.js
│   │   ├── question-fill-blank.js
│   │   ├── question-essay.js
│   │   ├── question-free-form.js
│   │   ├── submission.js
│   │   └── auto-save.js
│   ├── result/
│   │   ├── index.js        # split from result.js (800L)
│   │   ├── score-display.js
│   │   ├── breakdown.js
│   │   ├── question-review.js
│   │   ├── essay-feedback.js
│   │   └── explain-wrong.js
│   ├── dashboard/
│   │   ├── index.js
│   │   ├── stats.js
│   │   ├── chart.js
│   │   └── recent.js
│   └── admin/
│       └── (existing 17 modules — refactor incrementally)
│
└── lib/                    # Vendor wrappers
    ├── katex-loader.js     # lazy-load KaTeX
    └── jsqr-loader.js      # lazy-load QR scanner
```

### 6.2 Bundling — esbuild

```js
// build.js
require('esbuild').build({
    entryPoints: {
        'home':       'public/js/pages/home/index.js',
        'exam':       'public/js/pages/exam/index.js',
        'result':     'public/js/pages/result/index.js',
        'dashboard':  'public/js/pages/dashboard/index.js',
        'admin':      'public/js/pages/admin/index.js'
    },
    bundle: true,
    minify: process.env.NODE_ENV === 'production',
    sourcemap: true,
    format: 'esm',
    target: ['es2020'],
    outdir: 'public/js/dist',
    splitting: true,
    loader: { '.css': 'text' }
}).catch(() => process.exit(1));
```

Mỗi HTML chỉ load 1 entry: `<script type="module" src="/js/dist/home.js"></script>`.

### 6.3 Code splitting payload target

| Page | Target gzipped | Rationale |
|---|---|---|
| Home | < 30 KB | First page, mobile crucial |
| Exam | < 80 KB | KaTeX lazy-loaded only when has formula |
| Result | < 60 KB | KaTeX shared with exam |
| Dashboard | < 50 KB | Charts CSS-only |
| Admin | < 200 KB | Power user, allowed bigger |

---

## 7. Animation Principles

### 7.1 Page transition

- Route change: subtle fade + 4px translateY, 200ms ease-apple
- KHÔNG dùng full-page slide hoặc 3D transform (tốn perf)

### 7.2 Stagger reveal

Khi load list (đề, lịch sử, dashboard cards):
```css
@keyframes stagger-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}
.stagger > * {
    animation: stagger-in 360ms var(--ease-apple) both;
}
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 60ms; }
.stagger > *:nth-child(3) { animation-delay: 120ms; }
/* ... */
```

### 7.3 Score count-up

Khi hiển thị điểm: animate từ 0 → final value trong 800ms với ease-out, đồng thời border-color và shadow tăng dần.

### 7.4 Hover micro-interactions

- Card: translateY(-2px) + shadow-md, 220ms ease-apple
- Button: opacity 0.88, 150ms
- Icon button: scale(1.05) + bg, 150ms

### 7.5 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

---

## 8. Accessibility Checklist

- [ ] All interactive elements keyboard-reachable (`tabindex` correct)
- [ ] `:focus-visible` ring visible (3px accent-soft) on all interactive
- [ ] Modal traps focus, returns to trigger on close
- [ ] Esc closes modal/dropdown
- [ ] All icons-only buttons have `aria-label`
- [ ] Form inputs have associated `<label>` (visible or sr-only)
- [ ] Error messages linked via `aria-describedby`
- [ ] Loading states announced via `aria-live`
- [ ] Color contrast ≥ 4.5:1 for text, ≥ 3:1 for UI
- [ ] Don't rely on color alone (e.g., add icon + text for status)
- [ ] Skip-to-main-content link
- [ ] Tested with screen reader (VoiceOver / NVDA basic flow)
- [ ] `prefers-reduced-motion` respected
- [ ] Touch targets ≥ 44×44px

---

## 9. Mobile-Specific Patterns

### 9.1 Bottom Navigation

```html
<nav class="bottom-nav">
    <a class="bottom-nav-item active">
        <svg class="icon"><use href="#home"/></svg>
        <span>Trang chủ</span>
    </a>
    <a class="bottom-nav-item">
        <svg class="icon"><use href="#book"/></svg>
        <span>Đề thi</span>
    </a>
    <a class="bottom-nav-item">
        <svg class="icon"><use href="#chart"/></svg>
        <span>Lịch sử</span>
    </a>
    <a class="bottom-nav-item">
        <svg class="icon"><use href="#user"/></svg>
        <span>Tài khoản</span>
    </a>
</nav>
```

```css
.bottom-nav {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: var(--z-sticky);
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--surface-glass);
    backdrop-filter: blur(20px);
    border-top: 1px solid var(--border);
    display: flex;
    /* Hide on desktop */
}
@media (min-width: 768px) { .bottom-nav { display: none; } }
```

### 9.2 Bottom Sheet

Slide up from bottom on mobile. Drag-to-dismiss optional.

### 9.3 Pull-to-refresh

Implement on dashboard / history (use `<details>` or library).

### 9.4 Haptic feedback (where supported)

```js
function haptic(type = 'light') {
    if (!window.navigator.vibrate) return;
    const patterns = { light: 10, medium: 25, heavy: 50, success: [10, 30, 10] };
    navigator.vibrate(patterns[type] || patterns.light);
}
```

### 9.5 No iOS double-tap zoom

```css
button, a, [role="button"] { touch-action: manipulation; }
```

### 9.6 Input no-zoom on focus (iOS)

```css
input, textarea, select { font-size: 16px; }
@media (min-width: 1024px) {
    input, textarea, select { font-size: 14px; }   /* desktop allowed smaller */
}
```

---

## 10. Brand & Logo

### 10.1 Wordmark

```
EasyRevise   ← weight 700, letter-spacing -0.02em, system font
```

Khi viết với mark:
```
[E]  EasyRevise   ← mark = rounded-square 24-32px, text trong box
```

### 10.2 Logo mark variants

- **Full color:** gradient indigo→blue background, white "E"
- **Mono dark:** black bg, white "E" — cho light theme
- **Mono light:** white bg, black "E" — cho dark theme

### 10.3 Future "Drill" / "Forte" rebrand

Khi user chốt tên mới, thay `[E]` → `[D]` hoặc `[F]`. Mọi text "EasyRevise" → "Drill". Component không phụ thuộc tên — chỉ thay token `--brand-name` và logo SVG.

---

## 11. Locked Decisions (Phase 2)

Đã chốt sau review:

| ID | Quyết định | Giá trị |
|---|---|---|
| **D1** | Thứ tự migrate | 1) Foundation (tokens + base + sprite) → 2) Components → 3) Home → 4) Result → 5) Exam → 6) Dashboard → 7) Admin |
| **D2** | Strategy | **Page-by-page** — mỗi page xong deploy luôn, accept inconsistency tạm thời ~2-4 tuần |
| **D3** | CSS class names | **Giữ tên cũ phổ biến** (`.btn`, `.card`, `.modal-overlay`...) — chỉ rewrite implementation. Không đổi 100+ HTML refs. |
| **D4** | Icons | **Manual SVG sprite** — paste từ lucide.dev vào `public/assets/icons/sprite.svg`, không add npm dep |
| **D5** | Mobile nav | **Bottom nav** 4 tab cho student (Home / Đề thi / Lịch sử / Tài khoản). Hiển thị trên home, dashboard. **Ẩn** trong exam page (immersive). |

Bước tiếp: `tasks.md` — chia phase, mỗi phase có acceptance criteria + có thể deploy độc lập.

# Implementation Plan: Frontend Redesign

**Style:** Apple HIG / Liquid Glass
**Strategy:** Page-by-page (D2)
**Stack:** Vanilla JS + esbuild

## Overview

Tasks này implement design.md theo strategy page-by-page. Mỗi phase có thể deploy độc lập, không break phần còn lại. Effort: ~3 tuần dev time chia 8 phases.

Foundation (Phase 0-1) build infrastructure trước. Từ Phase 2 trở đi, mỗi page được redesign riêng biệt và có thể release ngay.

> Each task có acceptance criteria cụ thể và link tới requirement IDs từ `requirements.md`. Mark `[x]` khi xong.

## Tasks

### Phase 0 — Foundation (1-2 ngày)

Setup tokens + build pipeline + icon sprite. Nothing user-facing changes yet.

- [x] 1. Setup esbuild build pipeline
  - Install `esbuild` as devDep
  - Create `build.js` with entry points (home/exam/result/dashboard/admin)
  - Add npm scripts: `build`, `build:watch`, `build:prod`
  - Add `public/js/dist/` to `.gitignore`
  - **Acceptance:** `npm run build` produces 5 bundle files in `public/js/dist/`. Source maps available in dev.
  - _Validates: NFR-P2 (bundle size budget)_

- [x] 2. Create design tokens layer
  - Create `public/css/tokens/_colors.css` with light + dark palette (per design.md §1.1)
  - Create `public/css/tokens/_typography.css`, `_spacing.css`, `_shadows.css`, `_motion.css`, `_breakpoints.css`
  - Update `public/css/main.css` to `@import` token files first
  - **Acceptance:** All design.md §1 tokens defined as CSS variables. Light/dark switching by `[data-theme="dark"]` on `<html>`.
  - _Validates: NFR-D1, NFR-M1_

- [x] 3. Modernize base CSS
  - Update `public/css/base/_reset.css` (Josh Comeau modern reset baseline)
  - Update `public/css/base/_global.css` (html/body, font-feature-settings, antialiasing)
  - Create `public/css/base/_focus.css` (`:focus-visible` ring with `--accent-soft`)
  - Update `public/css/base/_typography.css` (h1-h6, links, lists)
  - Add `public/css/base/_scrollbar.css` (custom scrollbar matching surface)
  - **Acceptance:** Reset, focus ring, scrollbar all use design tokens. No hardcoded colors.
  - _Validates: NFR-A2, NFR-M1_

- [x] 4. Build SVG icon sprite
  - Create `public/assets/icons/sprite.svg` with `<svg><defs>...<symbol>` structure
  - Paste 50+ Lucide icons listed in design.md §2.4 (download from lucide.dev/icons)
  - Each icon: 24×24 viewBox, stroke 1.5, fill none, color currentColor
  - Add subject icons (math, english, physics, chemistry...) — line variants
  - Create `public/css/components/_icon.css` — `.icon`, `.icon-sm/md/lg/xl`
  - **Acceptance:** `<svg class="icon"><use href="/assets/icons/sprite.svg#timer"/></svg>` renders timer icon. All sizes available. Color inherits.
  - _Validates: locked decision D4_

- [x] 5. Theme module
  - Create `public/js/core/theme.js` — read prefer-color-scheme, persist to localStorage
  - Apply theme via inline `<script>` in `<head>` BEFORE CSS load (no flicker)
  - Export `toggleTheme()`, `getTheme()`, `setTheme(t)`
  - **Acceptance:** Reload page → theme persists. System theme change → respect if no manual override. No flash of wrong theme.
  - _Validates: NFR-D2, FR-S5_

- [x] 6. Icons module
  - Create `public/js/core/icons.js` — `Icon(name, options)` helper returning SVG string
  - Preload sprite once via `fetch('/assets/icons/sprite.svg')` + inject inline (eliminates 1 round-trip on every `<use>`)
  - **Acceptance:** `Icon('timer', {size: 'lg'})` returns valid SVG markup. Sprite cached in memory.
  - _Validates: locked decision D4_

### Phase 1 — Component Library (3-4 ngày)

Build reusable components matching design.md §3. Each component has CSS + JS pair when interactive.

- [x] 7. Button component
  - Update `public/css/components/_button.css` — pill, rounded variants; primary/secondary/ghost/danger; sm/md/lg sizes
  - Hover: opacity 0.88 + scale 1.01 (primary), background change (secondary)
  - Focus-visible ring 3px `--accent-soft`
  - Loading state with spinner SVG
  - **Acceptance:** All buttons in demo `3-apple-hig.html` reproduce 1:1 using these classes.
  - _Validates: NFR-R3 (touch targets), NFR-A2_

- [x] 8. Input + Textarea
  - `public/css/components/_input.css` — base + variants (search, code, password)
  - Focus ring with `--accent-soft` shadow
  - Mobile-safe `font-size: 16px` (no iOS zoom)
  - Error state with `--error` border + helper text
  - Code input: uppercase, letter-spacing 0.06em
  - **Acceptance:** Code input on home page renders identical to demo. iOS Safari doesn't zoom on focus.
  - _Validates: FR-S1 (code entry), NFR-R3_

- [x] 9. Card component
  - `public/css/components/_card.css` — flat / raised / glass variants
  - Hover lift on raised: translateY(-2px) + shadow-md transition
  - Padding tokens: 16px mobile, 20px desktop
  - **Acceptance:** Apple-feel cards with soft shadows match demo.
  - _Validates: design tokens compliance_

- [x] 10. Modal + Bottom Sheet
  - `public/css/components/_modal.css` — desktop center modal + mobile bottom sheet variant
  - `public/js/components/modal.js` — open/close, focus trap, Esc key, backdrop click
  - Glass overlay: `backdrop-filter: blur(20px)` + `rgba(0,0,0,0.4)`
  - Animation: scale-in (desktop) / slide-up (mobile)
  - **Acceptance:** FR-S2 preview popup works. Focus trapped, Esc closes, returns focus to trigger.
  - _Validates: FR-S2, FR-E5, FR-AU1, FR-AU2, NFR-A3_

- [x] 11. Toast notifications
  - `public/css/components/_toast.css` — top-right desktop, top-center mobile
  - `public/js/components/toast.js` — `showToast(msg, type, duration)`, max 3 stacked, auto-dismiss
  - Icons: success/error/warning/info from sprite
  - Slide-in animation per platform
  - **Acceptance:** Test 5 calls in row → only 3 visible, oldest dismissed.
  - _Validates: FR-A5_

- [x] 12. Custom Confirm + Prompt
  - `public/js/components/confirm.js` — `customConfirm(title, msg, ok, danger?) → Promise<boolean>`
  - `public/js/components/prompt.js` — `customPrompt(title, msg, default?) → Promise<string|null>`
  - Use Modal component as base, themed for danger when `danger=true`
  - **Acceptance:** Replaces native `confirm()`/`prompt()`. Used in admin actions (delete user, reset password).
  - _Validates: FR-A2 (admin no native dialogs)_

- [x] 13. Tab component
  - `public/css/components/_tab.css` — pill style + underline style
  - `public/js/components/tabs.js` — keyboard nav (arrows, home/end), aria-selected
  - Sliding indicator on active tab
  - **Acceptance:** Dashboard tabs + auth modal tabs work via keyboard.
  - _Validates: FR-D2, FR-AU1_

- [x] 14. Badge / Tag / Pill
  - `public/css/components/_badge.css` — neutral, accent, success, warning, error, with-dot variants
  - **Acceptance:** Score pills, "Mới"/"Hot" tags, AI status tags all use this.
  - _Validates: design consistency_

- [x] 15. Avatar
  - `public/css/components/_avatar.css` — sizes 24/32/40/56/80 (px)
  - Keep existing FaceHash SSR integration
  - Fallback initial-on-gradient if FaceHash fails
  - **Acceptance:** All 5 sizes render with consistent ring + shadow.
  - _Validates: existing FaceHash compat_

- [x] 16. Progress (linear + circular)
  - `public/css/components/_progress.css` — linear bar 4-8px, circular SVG
  - Indeterminate variant (shimmer/sliding)
  - Circular for exam timer (animated stroke-dashoffset)
  - **Acceptance:** FR-E1 timer animates smoothly, exam progress bar updates per question.
  - _Validates: FR-E1_

- [x] 17. Skeleton loaders
  - `public/css/components/_skeleton.css` — text-line, avatar, card variants
  - Shimmer animation respecting reduced-motion
  - **Acceptance:** Loading states for exam list, history list, dashboard stats.
  - _Validates: NFR-P3 (no CLS), reduced-motion_

- [x] 18. Empty State
  - `public/css/components/_empty-state.css` — icon (60px) + title + desc + action
  - **Acceptance:** No exam, no submission, error states all use this layout.
  - _Validates: design consistency_

- [x] 19. Bottom Navigation (mobile)
  - `public/css/components/_bottom-nav.css` — fixed bottom, glass blur, safe-area inset
  - 4 items: Trang chủ / Đề thi / Lịch sử / Tài khoản
  - Hide on `min-width: 768px`, also hide via class on exam page
  - **Acceptance:** Visible only on mobile, never in exam page.
  - _Validates: locked decision D5_

- [x] 20. Lightbox
  - `public/js/components/lightbox.js` — image preview with backdrop, swipe to close on mobile
  - **Acceptance:** Student attachments click-to-zoom.
  - _Validates: FR-R4_

- [x] 21. Theme toggle button
  - Reusable component using sun/moon icon, fade-cross-fade animation
  - **Acceptance:** Header on every page.
  - _Validates: FR-S5_

- [x] 22. Components style guide page
  - Create `public/components.html` — internal preview of all components
  - List every variant + size + state
  - **Acceptance:** Visit `/components.html` to see entire library.
  - _Validates: NFR-M2 (component docs)_

### Phase 2 — Student Home (1-2 ngày)

First user-facing redesign. Validate the system end-to-end.

- [x] 23. New `public/index.html` skeleton
  - Apple HIG glass header with logo + nav + theme toggle + auth area
  - Code entry section (eyebrow + h1 + desc + input + primary button)
  - Exam list section (cards grid, 1 col mobile / 3 col desktop)
  - History list section (list with score pills)
  - Bottom nav for mobile
  - Footer minimal
  - Inline theme apply script in `<head>` (no flicker)
  - **Acceptance:** Matches demo `3-apple-hig.html` visually.
  - _Validates: FR-S1, FR-S5_

- [x] 24. Home page CSS
  - Create `public/css/pages/_home.css` for layout (hero, exam grid, history list)
  - Mobile-first, scale up via media queries
  - **Acceptance:** Visual diff vs demo < 2%. No layout shift on load.
  - _Validates: NFR-P3, NFR-R1_

- [x] 25. Refactor home page modules
  - Split existing 7 modules in `public/js/pages/home/` to align with new flow
  - `code-entry.js` validates code format, shows preview modal
  - `qr-scanner.js` mobile only, lazy-load jsQR
  - `qr-popup.js` restyle with new modal component
  - `exam-list.js` renders grid, click → preview modal
  - `history.js` renders list with score pills
  - **Acceptance:** All FR-S1 to FR-S5 pass. jsQR lazy-loaded only when QR button clicked.
  - _Validates: FR-S1, FR-S2, FR-S3, FR-S4, FR-S5_

- [x] 26. Auth modal redesign
  - Login + Register tabs in single modal
  - Use new Tab + Modal + Input components
  - Validation inline (no alerts)
  - **Acceptance:** Form errors display inline. Submit button disabled while pending.
  - _Validates: FR-AU1, FR-AU3_

- [x] 27. Admin PIN modal redesign
  - 6 individual digit inputs (autoFocus next on type, autoBack on Backspace)
  - Use new Modal component
  - **Acceptance:** Paste 6-digit code distributes correctly across inputs.
  - _Validates: FR-AU2_

- [ ] 28. Visual QA — Home
  - Test on 320px / 375px / 768px / 1024px / 1920px
  - Lighthouse mobile audit ≥ 90 across 4 axis
  - Test dark mode no flicker
  - Test reduced-motion respected
  - Test keyboard navigation full flow
  - **Acceptance:** Passing on all checks. Screenshots saved to `.kiro/specs/frontend-redesign/screenshots/home/`.
  - _Validates: NFR-P1, NFR-A1, NFR-A2, NFR-D1, NFR-R1_

### Phase 3 — Result Page (2 ngày)

Medium complexity. Multiple UI variants depending on exam type.

- [x] 29. New `public/result.html` skeleton
  - Hero with circular score
  - Breakdown card (MC vs essay vs time)
  - Question detail collapsible list
  - AI feedback section per essay (when present)
  - Lightbox-able attachments
  - "Tại sao tôi sai?" buttons per wrong question
  - **Acceptance:** Layout matches design.md §4.4.
  - _Validates: FR-R1, FR-R3, FR-R4_

- [x] 30. Result page CSS
  - Create `public/css/pages/_result.css`
  - **Acceptance:** Tokens-based, mobile-first.
  - _Validates: NFR-M1, NFR-R1_

- [x] 31. Split result.js into modules
  - `pages/result/index.js` — entry, fetch result data
  - `pages/result/score-display.js` — circular score with count-up animation
  - `pages/result/breakdown.js` — type/time stats card
  - `pages/result/question-review.js` — list of questions with status pill
  - `pages/result/essay-feedback.js` — AI feedback render with markdown (escape user content!)
  - `pages/result/explain-wrong.js` — handle "Tại sao tôi sai?" CTA
  - `pages/result/polling.js` — poll my-grades when AI grading pending
  - **Acceptance:** Module sizes all < 300 lines. No regression vs current.
  - _Validates: FR-R1, FR-R2, FR-R3, FR-R5, NFR-M2_
  - **Status (2026-05-15):** Done. Split into 11 modules: escape, blank-checker, markdown, media, status-badge, summary, state, polling, explain, review-list, index. Each < 240 lines. 81/82 integration tests pass.

- [x] 32. Score count-up animation
  - Animate from 0 → final score in 800ms ease-out
  - Color pill changes based on threshold (high/normal/low)
  - **Acceptance:** Visible animation on result page load, respects reduced-motion.
  - _Validates: locked decision Q6 (moderate motion)_

- [ ] 33. Visual QA — Result
  - Test with: MC-only result, essay-graded result, essay-pending result, mixed types
  - Test attachments lightbox
  - Test "Tại sao tôi sai?" with rate-limit message
  - **Acceptance:** All result variants render correctly. Polling stops when graded.
  - _Validates: FR-R1, FR-R2, FR-R3, FR-R4_

### Phase 4 — Exam Page (3-5 ngày)

Split monolith `app.js` (1,400 lines) and apply new design.

- [ ] 34. Plan module split
  - Document current `app.js` responsibilities → group into modules per design.md §6.1
  - Create skeleton files in `public/js/pages/exam/`
  - **Acceptance:** Mapping document committed with current → new module assignments.
  - _Validates: NFR-M2 (maintainability)_

- [ ] 35. Extract `timer.js`
  - Countdown logic, auto-submit on expiry, 5-min warning for essay
  - Circular progress UI integration
  - **Acceptance:** Module < 200 lines. Tests for boundary cases (expiry, warning trigger).
  - _Validates: FR-E1, FR-E4_

- [ ] 36. Extract `navigator.js`
  - Question grid, jump-to logic, status indicators (answered, flagged, current)
  - **Acceptance:** Independent of question type.
  - _Validates: FR-E1_

- [ ] 37. Extract question renderers
  - `question-mc.js` — multiple choice + reading (with passage)
  - `question-fill-blank.js` — flexible markers, all blank types
  - `question-essay.js` — textarea + file upload + AI grading state
  - `question-free-form.js` — sub-parts + uploads
  - Each module exports `render(question, answers)` and emits answer-change events
  - **Acceptance:** Pluggable architecture. Adding new type = 1 new module.
  - _Validates: FR-E2_

- [ ] 38. Extract `auto-save.js`
  - Debounced localStorage save on answer change
  - Restore on reload
  - **Acceptance:** Refresh mid-exam → answers preserved.
  - _Validates: FR-E6_

- [ ] 39. Extract `submission.js`
  - Validate answers, build submit payload, handle network retry
  - Disconnection banner
  - **Acceptance:** Offline submission queues + flushes when online.
  - _Validates: FR-E7_

- [ ] 40. Apply new exam UI
  - Glass top bar with timer + progress + flag
  - Question card with KaTeX render
  - Sticky bottom action bar (mobile) / floating navigator (desktop)
  - Hide bottom-nav on this page
  - **Acceptance:** Matches design.md §4.3 sketch. KaTeX renders < 200ms for 50 formulas.
  - _Validates: FR-E1, FR-E3, NFR-P4, locked decision D5_

- [ ] 41. Submit confirmation modal
  - Custom confirm with answered/unanswered/flagged pills
  - **Acceptance:** Click submit with skipped → shows pills. Confirm → POST.
  - _Validates: FR-E5_

- [ ] 42. Visual QA — Exam
  - Test all 5 section types
  - Test on 320px (cramped) → verify no horizontal scroll
  - Test long passages (reading section) — proper scroll within
  - Test KaTeX dark mode
  - Test timer expiry auto-submit
  - **Acceptance:** All passes. Test recording saved.
  - _Validates: FR-E1, FR-E2, FR-E3, FR-E4, NFR-R1_

### Phase 5 — Dashboard (1 ngày)

Smaller page, validate stats/charts patterns.

- [x] 43. New dashboard.html
  - Profile card (avatar + name + stats)
  - 3 tabs: Lịch sử / Thống kê / Đang học dở
  - CSS-only bar chart for progress
  - **Acceptance:** Layout matches design.md §4 reference.
  - _Validates: FR-D1, FR-D2_

- [x] 44. Dashboard CSS
  - Create `public/css/pages/_dashboard.css`
  - **Acceptance:** Mobile-first, tokens-based.
  - _Validates: NFR-M1, NFR-R1_

- [x] 45. Refactor dashboard modules
  - Split into `index.js`, `stats.js`, `chart.js`, `recent.js`
  - Animate count-up for stats numbers
  - **Acceptance:** Smooth animations, no jank on Moto G4.
  - _Validates: FR-D1, FR-D2, NFR-P1_

- [ ] 46. Visual QA — Dashboard
  - **Acceptance:** All tabs work, chart renders correctly, mobile responsive.
  - _Validates: FR-D2, NFR-R1_

### Phase 6 — Admin Panel (3-4 ngày)

Apply Bento layout + new components without rewriting everything.

- [x] 47. New admin.css
  - Replace inline styles in admin pages with token-based CSS
  - Add Bento grid layout for dashboard tab (matches demo `4-admin-bento.html`)
  - Sidebar collapsible with new icons
  - **Acceptance:** No `style="..."` attributes in admin HTML.
  - _Validates: NFR-M1, NFR-M3_

- [x] 48. New admin dashboard tab
  - Stats cards (top row): Đề / HS / Bài nộp / AI cost
  - Chart: 7-day submission count (CSS bars or simple SVG)
  - Activity feed (right column): recent submissions, code usage, AI grades
  - Recent submissions table (full width)
  - **Acceptance:** Matches demo `4-admin-bento.html`.
  - _Validates: FR-A1_

- [x] 49. Restyle existing admin tabs
  - Apply new button/input/modal/toast components
  - No functional change, just visual refresh
  - Replace emoji icons with SVG sprite icons
  - **Acceptance:** No regression in admin functionality. Visual consistency across tabs.
  - _Validates: FR-A1, FR-A2, FR-A3, FR-A4, FR-A5, locked decision Q2 (no emoji decorative)_

- [x] 50. Mobile admin
  - Hamburger menu opens sidebar as drawer
  - Sticky bottom action bar for primary CTAs in editor views
  - **Acceptance:** Admin usable on tablet/mobile.
  - _Validates: NFR-R2_

- [ ] 51. Visual QA — Admin
  - **Acceptance:** All 9 tabs work, no inline emoji, all CSS tokens.
  - _Validates: FR-A1 to FR-A5_

### Phase 7 — Polish + Cross-cutting (1-2 ngày)

Final pass.

- [ ] 52. Stagger reveal animations on lists
  - **Acceptance:** Exam grid, history list, dashboard cards animate in stagger pattern.
  - _Validates: locked decision Q6 (moderate motion)_

- [ ] 53. Page transition between routes
  - Subtle fade + 4px translateY
  - **Acceptance:** Navigation between pages smooth, respects reduced-motion.
  - _Validates: locked decision Q6_

- [ ] 54. Reduced-motion full audit
  - Test every animation respects `prefers-reduced-motion: reduce`
  - **Acceptance:** All transitions become instant when reduced-motion active.
  - _Validates: NFR-A1_

- [ ] 55. Accessibility full pass
  - Run through design.md §8 checklist on every page
  - **Acceptance:** All checkboxes ticked. Manual screen reader test passed.
  - _Validates: NFR-A1, NFR-A2, NFR-A3, NFR-A4, NFR-A5_

- [ ] 56. Components style guide complete
  - Verify `/components.html` shows all components in all variants
  - **Acceptance:** Used as reference for design QA.
  - _Validates: NFR-M2_

- [ ] 57. Lighthouse final audit
  - All student pages ≥ 90 across 4 axis on mobile
  - **Acceptance:** Screenshots of Lighthouse reports saved per page.
  - _Validates: NFR-P1_

- [ ] 58. Bundle size verification
  - Verify each entry meets target in design.md §6.3
  - Home < 30KB, Exam < 80KB, Result < 60KB, Dashboard < 50KB, Admin < 200KB (gzipped)
  - **Acceptance:** All bundles within budget. Document in PROJECT.md.
  - _Validates: NFR-P2_

- [ ] 59. Update PROJECT.md
  - Document new architecture (CSS folder structure, JS modules, build pipeline)
  - **Acceptance:** PROJECT.md reflects current reality after redesign.
  - _Validates: NFR-M2_

- [ ] 60. Delete legacy CSS modules
  - Remove unused CSS modules after page-by-page migration complete
  - **Acceptance:** No dead CSS. `main.css` only imports active modules.
  - _Validates: NFR-M2_

- [ ] 61. Visual regression QA
  - Compare screenshots before/after for all pages
  - **Acceptance:** Document of visual changes saved to `.kiro/specs/frontend-redesign/regressions.md`.
  - _Validates: M5 (subjective owner approval)_

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "label": "Foundation",
      "tasks": [1, 2, 3, 4, 5, 6],
      "rationale": "Build pipeline, design tokens, base CSS, sprite, theme + icons modules. No dependencies, all parallelizable."
    },
    {
      "wave": 2,
      "label": "Component Library",
      "tasks": [7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21],
      "rationale": "All components depend only on Phase 0 (tokens, sprite, theme). Build in parallel; no inter-component dep except 12 (confirm/prompt) which depends on 10 (modal)."
    },
    {
      "wave": 3,
      "label": "Component Library — confirm/prompt + style guide",
      "tasks": [12, 22],
      "rationale": "Task 12 depends on 10 (modal). Task 22 (components.html) depends on all components done."
    },
    {
      "wave": 4,
      "label": "Page redesigns (parallelizable)",
      "tasks": [23, 24, 25, 26, 27, 29, 30, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45, 47, 48, 49, 50],
      "rationale": "After Phase 1 done, pages can be migrated in parallel. Single dev: follow D1 order (home → result → exam → dashboard → admin)."
    },
    {
      "wave": 5,
      "label": "Visual QA per page",
      "tasks": [28, 33, 42, 46, 51],
      "rationale": "Each page QA only after that page's redesign complete. Done in sequence as pages roll out."
    },
    {
      "wave": 6,
      "label": "Polish + cross-cutting",
      "tasks": [52, 53, 54, 55, 56, 57, 58, 59, 60, 61],
      "rationale": "Final pass after all pages migrated. Cleanup, audit, documentation."
    }
  ],
  "criticalPath": [1, 2, 4, 5, 10, 23, 25, 28, 31, 33, 37, 40, 42, 49, 51, 55, 57, 61],
  "parallelization": "Single dev can do sequential. Multiple devs can split Wave 4 by page (one dev per page)."
}
```

## Notes

### Implementation guidelines

1. **Tokens first** — Mọi CSS phải dùng CSS custom properties từ `public/css/tokens/`. KHÔNG hardcode hex/px.
2. **Mobile-first** — Default styles cho mobile (<640px), scale up qua media queries.
3. **Component contract** — Mỗi component có CSS class API rõ + JS API documented. Không phá API hiện có (giữ tên `.btn`, `.card` ...).
4. **No regression** — Mỗi phase phải pass 15 integration tests hiện có (`npm test`).
5. **Performance budget** — Bundle size verify sau mỗi phase (target trong design.md §6.3).
6. **A11y mandatory** — Mỗi component qua a11y checklist trước khi mark done.

### Deployment cadence

- Strategy: page-by-page (D2)
- Mỗi phase từ 2-6 xong → deploy lên Vercel ngay
- Có thể có short period (~1-2 tuần) mixed style giữa pages — chấp nhận
- Phase 7 cleanup sau khi tất cả page redesign xong

### Risk mitigation

| Risk | Mitigation |
|---|---|
| Visual inconsistency during transition | Token system shared giữa old + new pages |
| KaTeX dark mode broken | Test sớm Phase 1 với sample formulas |
| Bundle size exceeds target | Code-split KaTeX, jsQR (lazy-load) |
| Mobile perf trên Moto G4 | Test sớm, profile, tránh heavy animation |
| Backend API incompatibility | Không có — design preserves API contract |
| Admin redesign breaks workflow | Phase 6 task 49 chỉ restyle, không đổi function |

### Definition of Done (per task)

1. CSS dùng tokens — không hardcode hex/px
2. Mobile (320-639) + tablet (640-1023) + desktop (1024+) tested
3. Dark mode tested
4. `:focus-visible` works trên mọi interactive element
5. ARIA labels trên icon-only buttons
6. Reduced-motion respected
7. No console errors
8. Lighthouse mobile ≥ 90 perf cho student pages
9. Self-reviewed
10. Linked requirement IDs satisfied

### Spec status

- `requirements.md` — APPROVED (locked decisions trong §6)
- `design.md` — APPROVED (locked decisions trong §11)
- `tasks.md` — READY for implementation

### Phase 8 — Future enhancements (deferred)

Not part of current implementation plan. Move to ROADMAP.md when ready:

- Brand rename (EasyRevise → Drill / Forte)
- TypeScript progressive migration
- httpOnly cookie + CSRF
- Pull-to-refresh
- Haptic feedback integration
- Notification center

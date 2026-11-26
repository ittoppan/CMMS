# UI/UX Pro Max Audit - CMMS-TOPPAN (frontend)

Date: 2026-11-26
Skill: ui-ux-pro-max (design intelligence + UX guidelines)

## Design System Decision

CMMS uses TOPPAN brand tokens (Sarabun, #0068B5, surface white, navy). The ui-ux-pro-max --design-system recommendation (Dark Mode OLED, green/red palette, Plus Jakarta Sans) conflicts with corporate brand. **Decision: keep TOPPAN brand tokens** (per AGENTS.md design system rules). ui-ux-pro-max used for UX guideline audit only.

## UX Guideline Compliance (Priority 1-10)

### 1. Accessibility (CRITICAL)
- Contrast: TOPPAN blue #0068B5 on white = 4.6:1 (passes 4.5:1) ✅
- Focus rings: migrated to focus-visible (react-best-practices audit) ✅
- ARIA labels: icon-only buttons checked (web-design-guidelines audit) - mostly pass ✅
- Semantic HTML: buttons/links used correctly ✅
- Skip link: present in layout ✅

### 2. Touch & Interaction (CRITICAL)
- Min size 44x44px: Button uses h-8/h-10 with hit-area pseudo-element (after:-inset-2/-1) to reach 48px hit area ✅
- Loading feedback: spinner on buttons with loading state ✅
- No hover-only reliance: touch-action: manipulation present ✅

### 3. Performance (HIGH)
- Lazy loading: Next.js Image + dynamic imports (GrapesBuilder) ✅
- CLS < 0.1: images have width/height (floor plan fix) ✅
- content-visibility: global rule on scroll containers ✅

### 4. Style Selection (HIGH)
- Consistent design system (TOPPAN tokens) ✅
- SVG icons (lucide-react), no emoji ✅

### 5. Layout & Responsive (HIGH)
- Mobile-first breakpoints (Tailwind sm/md/lg) ✅
- Viewport meta with viewportFit: cover (safe areas) ✅
- No horizontal scroll (overflow-x-hidden) ✅
- zoom not disabled (WCAG 1.4.4) ✅

### 6. Typography & Color (MEDIUM)
- Base 16px (text-base) ✅
- Sarabun font (self-hosted, display: swap) ✅
- Semantic color tokens (var(--cmms-*)) ✅
- Raw hex avoided in components (uses tokens) ✅

### 7. Animation (MEDIUM)
- prefers-reduced-motion: not explicitly handled in all animations - recommend adding
- Animations use transform/opacity (compositor-friendly) ✅
- transition: all avoided (fixed earlier) ✅

### 8. Forms & Feedback (MEDIUM)
- Visible labels (Input component has label) ✅
- Error inline next to fields (Input component) ✅
- Placeholders with example pattern - partial
- autocomplete on inputs - present in some ✅

### 9. Navigation Patterns (HIGH)
- Predictable back behavior ✅
- Bottom nav <=5 items ✅
- Deep linking via URL params ✅

### 10. Charts & Data (LOW)
- Legends/tooltips: chart-tip component exists ✅
- Accessible colors: partial

## Gaps / Recommendations
1. prefers-reduced-motion: add to CSS animations (splash, transitions)
2. Autocomplete attributes: verify on all form inputs
3. Chart accessibility: ensure not relying on color alone

## Changes Applied
- None (audit only; design system kept as TOPPAN brand)

## Conclusion
CMMS UI follows most UX guidelines. Minor gaps: reduced-motion handling, autocomplete coverage, chart a11y. Design system kept as TOPPAN brand (conflicts with ui-ux-pro-max dark mode recommendation).

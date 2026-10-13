---
name: CMMS App
description: Offline-first maintenance console for the factory floor — operate by signal, not by slog. TOPPAN blue, Andon lamp language, Barlow numerical readouts.
colors:
  toppan-blue: "#0068B5"
  toppan-blue-hover: "#005FA3"
  accent-tint: "#EEF4F9"
  accent-ink: "#00508C"
  deep-navy: "#193264"
  navy-dark: "#0B1F4B"
  page-bg: "#F4F5F7"
  ink: "#18181B"
  card: "#FFFFFF"
  muted-bg: "#F4F4F5"
  muted-ink: "#52525B"
  faint-ink: "#A1A1AA"
  line: "#E4E4E7"
  line-strong: "#D4D4D8"
  success: "#16A34A"
  warning: "#D97706"
  danger: "#DC2626"
  info: "#0284C7"
  on-accent: "#FFFFFF"
  andon-green: "#10B981"
  andon-amber: "#F59E0B"
  andon-red: "#EF4444"
typography:
  display:
    fontFamily: "Barlow Condensed, 'Noto Sans Thai', Inter, sans-serif"
    fontSize: "2.15rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
    fontFeature: "'tnum' 1"
  headline:
    fontFamily: "Barlow Condensed, 'Noto Sans Thai', Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Barlow Condensed, 'Noto Sans Thai', Inter, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Roboto, 'Noto Sans Thai', Inter, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Barlow Condensed, 'Noto Sans Thai', Inter, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.16em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.toppan-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.toppan-blue-hover}"
  button-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  input-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 12px"
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  chip-default:
    backgroundColor: "{colors.muted-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  chip-selected:
    backgroundColor: "{colors.toppan-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
  nav-item-active:
    backgroundColor: "{colors.toppan-blue}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
  kpi-value:
    typography: "{typography.display}"
    textColor: "{colors.ink}"
  andon-lamp-ok:
    backgroundColor: "{colors.andon-green}"
    rounded: "50%"
---

# Design System: CMMS App

## Overview

**Creative North Star: "The Factory Floor Console"**

The interface behaves like the machine room of plant maintenance: a calm surface that speaks in signals, not slogans. It inherits the motifs a technician already reads on the physical floor — the Andon signal stack on the machine, part numbers printed in condensed block type, the blue laminating standards tag on calibrated equipment — and renders them as a software control panel rather than a dashboard prettied up for management reviews.

TOPPAN blue (`#0068B5`) is the single calibrated interactive accent, used the way it is in the source world: a subdued, precise indicator of "you can act here," never a decorative wash. Numbers are the loudest typographic voice. They are set in Barlow Condensed with tabular numerals, so a column of OEE figures aligns like a row of readouts, and any figure can glance-diff at arm's length in bad light.

Everything else is quiet enough to disappear. Zinc neutrals, flat surfaces, thin one-pixel hairlines, and a deliberately dry depth vocabulary put the factory's own syntax — lamp colors, status text, machine names, work order numbers — on top of the interface where it belongs. Dialogs, toasts, and the command palette are the only surfaces that float, and even those stay within one restrained shadow ladder.

The shell is an app, not a website: the PWA App Shell (56px top bar / bottom nav on phones, 260px sidebar on desktop) is the enduring frame, sized for gloved thumbs and full-brightness field light. Offline-first behavior is the operating truth — every screen reads like the console still works when the uplink drops.

**Key Characteristics:**
- Machine-health color grammar: green / amber / red mean what they mean on the Andon pole, everywhere in the app
- Barlow Condensed numerals for every measurement; Thai and body copy in Roboto / Noto Sans Thai at 16px-equivalent clarity
- Flat surfaces separated by 1px hairlines; shadows reserved for floating layers and KPI lifts
- TOPPAN blue appears at most a few times per screen, always meaning "act"
- Touch targets ≥48px, dark-mode aware, `prefers-reduced-motion` respected end-to-end

## Colors

A blue-and-navy industrial palette over warm-zinc neutrals. Hue carries function before mood: blue means action, deep navy means the board, and the Andon triad means machine health.

The light theme is the canonical token set; dark mode remaps the same roles to a near-black field (`#101012` background, `#1B1B1F` card) with lifted blue and signal luminances for reduced-glare night use.

### Primary
- **Toppan Blue** (#0068B5): The single actionable accent — primary buttons, active navigation, links, focus rings, selected chips, KPI accent bars, the sidebar active state (as active-fill `#005FA3`, and the desktop indicator dot). On white surfaces it stays flat; gradients are reserved for the navy hero consoles only.
- **Accent Tint** (#EEF4F9) with **Accent Ink** (#00508C): The quiet blue family for tinted chips, hover row fills, `--primary-light` washes, and blue text on white. Tint carries 10–15% blue so a hover never reads as a state change to the product.

### Secondary / Board
- **Deep Navy** (#193264) and **Navy Dark** (#0B1F4B): The console surfaces — page heroes and the Andon board run `deep-navy → navy-dark` gradients, and `navy-dark` prints the sidebar's strong labels. Never used as an interactive fill on white.

### Neutral
- **Page Field** (#F4F5F7): The app's resting background.
- **Ink** (#18181B): Primary text and strongest figures.
- **Card** (#FFFFFF): Every surface that sits on the field — cards, popovers, dialogs, sidebar.
- **Muted Bg** (#F4F4F5): Secondary surfaces, unselected chips, disabled fills, skeleton rests.
- **Muted Ink** (#52525B): Secondary text, table labels, helper copy. (≥4.5:1 on white.)
- **Faint Ink** (#A1A1AA): Placeholders, eyebrow labels, disabled text. (≥4.5:1 on white; lifted to `#A1A1AA`→`#71717A` in dark.)
- **Line** (#E4E4E7) / **Line Strong** (#D4D4D8): 1px hairlines and their hover/intensified state.

### Semantic
- **Success** (#16A34A light / #22C55E dark): Actions completed, equipment OK, checklists green. Light-tinted fills `#DCFCE7`.
- **Warning** (#D97706 light / #F59E0B dark): Needs attention, amber schedule states. Fills `#FEF3C7`.
- **Danger** (#DC2626 light / #EF4444 dark): Stops, overdue failures, destructive actions. Fills `#FEE2E2`.
- **Info** (#0284C7 light / #38BDF8 dark): Guidance and neutral system notes. Fills `#E0F2FE`.
- **Andon Glow Set**: `#10B981` green, `#F59E0B` amber, `#EF4444` red — the lamp colors themselves, used for status dots and the Andon stack with a soft matching glow (`0 0 6–10px`).

### Named Rules
**The Andon Rule.** Green, amber, and red mean machine and process health — nothing else. If a color is not signaling a state change, it does not earn a signal color. Graph bars and decorative accents use Toppan blue or ink instead.

**The Calibrated Blue Rule.** Toppan blue is the only interactive accent. On any given screen it covers no more than ~10% of visible surface. Its rarity is what makes the active button and the indicator dot find themselves at a glance.

**The Flat-Alloy Rule.** Blue on white is always a flat fill. Gradients belong to the navy console (hero headers, Andon board, login band) and nowhere else — no gradient buttons, no gradient icon tiles, no gradient callout strips.

## Typography

**Display Font:** Barlow Condensed (with Noto Sans Thai / Inter fallback) — the machine type. Condensed block lettering for numbers, page titles, and section eyebrows.
**Body Font:** Roboto with Noto Sans Thai (primary for the Thai-first UI), Inter/Sarabun fallback — technical, neutral, never decorative.
**Label/Mono Font:** System monospace stacks for codes, part numbers, and work order IDs; never a costume.

**Character:** A compressed industrial voice for readouts and section labels against a calm, human body face. Barlow gives numbers the visual weight of stamped part numbers; Roboto/Noto Sans Thai keeps the technician's actual reading comfortable, including the tall ascenders and descenders of Thai glyphs.

Protect the display voice at every size — no UI kit's generic sans is a substitute for the condensed block pair. `font-feature-settings: "tnum"` is on for every numeral surface so tabular data aligns column-to-column.

### Hierarchy
- **Display (Bold 700 · 2.15rem · line-height 1 · tracking 0.01em, tabular):** KPI values, board counters, the big figure on a work order. The loudest voice in the system; used sparingly, one per card.
- **Headline (Bold 700 · 1.5rem · line-height 1.3 · tracking -0.02em):** Page titles inside heroes and card sections. The hero band sets these white.
- **Title (Semibold 600 · 1.0625rem · line-height 1.4 · tracking -0.02em):** Card titles, dialog titles, table-of-contents anchors.
- **Body (Regular 400 · 0.875rem · line-height 1.6):** UI copy, descriptions, helper text. Thai copy keeps ≥1.6 line-height and generous leading so tone marks never clip. Table data and dense lists may run at 12–13px/1.45.
- **Label (Semibold 600 · 0.72rem · tracking 0.16em, uppercase):** Section eyebrows, table column headers, stat labels, mobile card `data-label` tags. The only uppercase in the system, and only for micro-heads — never headings.

### Named Rules
**The Readout Rule.** Every numeric measure — counts, ratios, times, units — is set in Barlow Condensed with tabular numerals. Figures align like instrument readouts; they never inherit body type.

**The Two-Voice Rule.** Display type and body type never trade roles. Headings get Barlow; paragraphs, controls, and instructions get Roboto/Noto Sans Thai. A Thai sentence in the display face is always a mistake.

**The Eyebrow Rule.** Uppercase micro-labels are the only label layer, they are always Barlow 600, and they never sit above a heading alone — a heading carries its own weight.

## Layout

A fixed app shell frames a separable content area. Desktop: 260px sidebar (68px collapsed), 56px top bar, sticky section nav within long pages. Mobile and tablet (<1024px): 56px top app bar plus a 60px bottom navigation — the permanent thumb zone, all instances padded by `env(safe-area-inset-*)`.

- **Content column** constrains to a comfortable measure; phone-first flows (LIFF standalone, repair request, scan) cap at 560px so a thumb can reach every control on the largest phone.
- **Responsive tables** are the diagnostic signature: full grid on desktop with sticky labeled headers; below 768px each row becomes a stacked card — header hidden, cell `data-label` promotes to an uppercase micro-head above its value, first cell becomes the card title.
- **Spacing rhythm** follows the 4/8/12/16/24/32 scale. Group tightly (4–16px between related controls), separate sections generously (24–32px above a section heading, less below). Cards pack at 10–20px internal padding; stacked cards breathe on 10–12px gutters at mobile.
- **Density is operational.** Rows reuse `10px 12px` padding; anything a technician must re-read (a work order state, a machine status) gets one line of body copy, never a collapsed accordion.
- **Forms** on phones become single-column full-bleed inputs with 48px touch height and 16px font to suppress iOS zoom.

## Elevation & Depth

Flat by default; the 1px hairline is the primary separating device. A short, cool-zinc shadow ladder adds lift only where a layer must float above the board — dialogs, popovers, toasts, the command palette, and the mobile bottom bar.

- **Resting surfaces** (cards in a grid, rows, panels) carry at most an ambient shadow and a hairline; borders, not shadows, do the resting separation.
- **Lift ladder** (light theme): `--shadow-sm` `0 1px 2px rgba(24,24,27,.05)`; `--shadow` `0 1px 3px/.07 + 0 1px 2px/.04` for cards; `--shadow-md` for hover lift on KPI cards; `--shadow-lg` toasts and dialogs; `--shadow-xl` the command palette and success overlay. Dark mode deepens the same roles with `rgba(0,0,0,.45–.55)`.
- **Focus is a glow ring, not a border fatten.** `0 0 0 3px rgba(0,104,181,.18)` on primary-outline focus-visible; selection uses the same glow. This keeps 1px hairlines honest — resting separation never thickens into a state.
- **Signal glow** on Andon lamps and status dots (`0 0 6–10px` in the lamp's own color) is the one sanctioned glow: it is the machine's light, not decoration. Respect `prefers-reduced-motion` by killing the red blink.
- **Interaction lift:** KPI cards rise 2–3px to `--shadow-lg` on hover; buttons deepen their fill one step and release their tinted shadow.

### Named Rules
**The Flat-By-Default Rule.** Resting separation is always a hairline or a tonal step — never a shadow. Shadow appears as a response to hover, float (overlay), or importance (toast), and each use maps to one step in the ladder.

## Shapes

Gently rounded and machined: radius reads as component edges you can snap together, not softened blobs. The scale is `sm 6px · md 8px · lg 12px · xl 16px · pill 9999px`.

- **Cards and containers:** 12–16px (`lg`/`xl`). Dialogs and the close-work sheet go 16–20px; mobile bottom sheets square off at `20px 20px 0 0` to seat against the screen edge.
- **Buttons and icon tiles:** 12px. **Inputs and menus:** 6–8px. **Badges, chips, stat pills, avatars, user chips:** pill (9999px) — pills are for small controls only, never containers.
- **Borders** are 1px hairlines (`--line`), strengthening to `--line-strong` on hover. Selection borders may use `1.5px` on tactile selectors (machine chips, option rows), where a slightly heavier edge reads as a physical key.
- **Pressed keyboard states:** tactile selectors compress on press (`scale(0.96–0.98)`) — the momentary "key pushed" feedback that fingers read through gloves.
- **Accent rails** on KPI cards are exactly 2px, at the card head (`::before`) or receding side (`border-left 2px opacity .4`) — a crisp indicator line, never a gradient sash.

## Components

### Buttons
- **Shape:** Flat fills, 12px radius, 10px×16px padding, weight 600 at 0.875rem; on mobile min-height 48px and full-width for primary actions in forms.
- **Primary** — Toppan blue fill, white text, one-step-darken hover (`#005FA3`), a faint blue under-shadow at rest that drops on hover. **Success** `#16A34A` and **Danger** `#DC2626` follow the same recipe for their actions.
- **Hover / Focus:** Background darkens one step; focus-visible draws the `3px` primary glow ring; disabled fades to 50% and stops the cursor.
- **Secondary / Ghost:** Muted background with a hairline, ink text; used for cancellation and tertiary actions. Gradients never appear on buttons.

### Chips & Stat Pills
- **Style:** Pill, 12×5px padding, 0.8rem weight 600. Unselected = muted fill + hairline + ink text.
- **Selected:** Flat Toppan blue fill, white text, soft primary glow. Machine/job selectors use the heavier 1.5px hairline and `scale(.96)` press so they read as tactile keys.
- **Filters & status:** The pill vocabulary carries tags and stat counts; counts set their numerals in Barlow tabular.

### Cards / Containers
- **Corner Style:** 12–16px radius; flat white fill.
- **Background:** Card (#FFFFFF) on the page field; BP cards, KPI cards, tables, and dialogs all share it.
- **Shadow Strategy:** Hairline + ambient shadow at rest (Elevation section); KPI cards lift to `--shadow-lg` on hover and carry a 2px semantic accent rail or icon tile.
- **Border:** 1px `--line`, never a fat border. Dashed hairlines are reserved for drop zones (photo add, empty form stage).
- **Internal Padding:** 20px standard, 10–14px on dense operational cards, 0 on table rows.

### Inputs / Fields
- **Style:** White fill, 1px `--input` stroke (`#D4D4D8`), 6–8px radius, 2px focus glow ring in primary. Height 48px on mobile, 16px font (kills iOS auto-zoom); desktop at 36–40px.
- **Focus:** Border shifts to Toppan blue + the 3px glow ring — height and layout never animate.
- **Error / Disabled:** Error = danger border plus a danger-tinted callout naming the problem; disabled = muted fill, faint ink, `not-allowed` cursor.

### Navigation
- **Sidebar (desktop):** Flat white rail; items are ink text on transparent, hover on `--bg-sidebar-hover`. Active item fills flat Toppan blue, white text, 8px radius, plus a 5px indicator dot with a faint glow.
- **Mobile bottom nav:** 60px bar + safe-area; items are a 22px icon over a 10px label, 48px touch height each; the active tab is Toppan blue icon + text. The unsynced-queue badge is a 17px danger pill.
- **Top bar / app bar:** White, hairline bottom; the top bar can hold the action (bell, avatar chip) while the bottom nav holds destinations.

### Andon Status
- **The status system is the signature component.** Machine health reads in two forms: the 3-lamp **Andon stack** (red / amber / green, `#EF4444` / `#F59E0B` / `#10B981`, lit lamp glows, red blinks) and inline **status dots** (`9px`, same colors, `0 0 6px` glow) beside 0.8rem weight-600 status copy — "พร้อมใช้งาน" / "ต้องดูแล" / "หยุดทำงาน".
- **Idle / neutral** state is a `#94A3B8` dot. Red blink, and only red, is the alarm animation, and it dies under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** reserve Toppan blue for exactly one interactive thing per view; the active button deserves to be the only blue that pops.
- **Do** set every number in Barlow Condensed tabular numerals — KPIs, counters, pills, board figures.
- **Do** let green/amber/red mean machine health via the Andon vocabulary, and keep their fills and dots consistent with the lamp set.
- **Do** keep resting surfaces flat with a 1px hairline; reach for shadow only to lift a floating layer or answer a hover.
- **Do** keep touch targets ≥48px and form inputs 48px/16px on phones.
- **Do** give every interactive element a 3px primary glow ring on focus-visible, and let hairline borders stay 1px from rest to focus.
- **Do** round dialogs 16–20px and seat mobile bottom sheets at the screen edge.

### Don't:
- **Don't** run gradients on white — buttons, icon tiles, list rails, or callout strips. Gradients live on the navy console surfaces only.
- **Don't** decorate with a signal color. Amber and red are earned by state, never applied for variety.
- **Don't** give a card a border and a wide shadow at once — the ghost-card double separation.
- **Don't** set Thai or paragraph text in the display face, and don't clip Thai glyph descenders with tight line-heights.
- **Don't** use monospace as a mood for "technical"; codes, part numbers, and WO IDs may be monospace, body copy may not.
- **Don't** animate the red Andon lamp when `prefers-reduced-motion` is on.
- **Don't** let an eyebrow label float above a heading — the heading carries its own weight and no kicker earns it back.
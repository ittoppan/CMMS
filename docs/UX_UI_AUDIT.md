# UX/UI Audit — CMMS-TOPPAN (STEP 1: Full Project Audit)

> วันที่: 2026-08-20 · ขอบเขต: `frontend/` (Next.js) + PHP API layer · สถานะ: **Audit เสร็จสมบูรณ์ — รออนุมัติแผนก่อนแก้โค้ด**
> เอกสารคู่: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) · [UI_MIGRATION_PLAN.md](./UI_MIGRATION_PLAN.md)

---

## 1. Executive Summary

CMMS-TOPPAN เป็นระบบ 2 stack ในโปรเจกต์เดียว:

| Stack | ตำแหน่ง | บทบาท |
|---|---|---|
| PHP REST API (legacy) | `src/`, `public/` | Business logic, DB, Auth, Permission, Notification — **ไม่แตะ** |
| Next.js 16 PWA | `frontend/` | UI ทั้งหมด — **เป้าหมายการ transform** |

**สถานะปัจจุบัน:** UI ใช้งานได้ครบ 112 หน้า แต่มี debt สะสมหนัก:

- **2,011** inline `style={{...}}` + **451** hex สี hard-code ใน TSX
- **Dark mode ถูกปิดตาย** (inert `.dark` variant) แต่มี `dark:` class ค้าง 62 จุด
- **ไม่มี** react-hook-form/zod, react-query, TanStack Table, shadcn/ui, lucide-react
- ฟอร์มทั้งหมดเป็น `useState` + `onChange` แบบมือถือ (ไม่มี `<form>` semantics)
- Loading/Empty/Error state ไม่เป็นมาตรฐานเดียวกัน
- a11y หลัก: `userScalable:false`, ไม่มี `lang` บน `<html>`, emoji เป็น icon, clickable `<div>` แทน button
- Legacy: jQuery + formBuilder + GrapesJS + `dangerouslySetInnerHTML` + header `ngrok-skip-browser-warning` 59 จุด + IP dev `192.168.1.9` hard-code
- Route ซ้ำ 4 คู่ (ต้องตัดสินใจเลือก canonical)

**จุดแข็งที่ต้องรักษา:** offline queue + IndexedDB snapshot ใช้ได้จริง (repair/my_tasks, checksheet, inspections), PWA manifest/SW ครบ (icons ตรวจแล้ว path ถูกต้อง), permission UI filtering ผ่าน `useMenuPermission`, i18n TH/EN, PDF/Excel export, LINE LIFF integration

---

## 2. Tech Stack (ปัจจุบัน vs เป้าหมาย)

### ปัจจุบัน (`frontend/package.json`)
| หมวด | ของจริง | หมายเหตุ |
|---|---|---|
| Framework | Next.js **16.2.10**, React **19.2.4**, TS strict, Turbopack | `output: "standalone"` |
| Styling | Tailwind **v4** (CSS-first, `@tailwindcss/postcss`, ไม่มี tailwind.config) | `@theme` remap indigo→TOPPAN blue |
| Design System | **Astryx** `@astryxdesign/core` + `theme-neutral` 0.1.9 | transpile ใน next.config |
| Icon | `@heroicons/react` ^2.2.0 (ตัวเดียว) + Astryx NavIcon + **emoji** | ต้องย้ายเป็น Lucide |
| Chart | recharts 3.10, react-countup 6.5 | ใช้ได้ เก็บไว้ |
| PDF/QR | jspdf, html2canvas, qrcode | ใช้ได้ เก็บไว้ |
| Legacy | jquery, formBuilder, jquery-ui-sortable, grapesjs | debt — เก็บไว้ชั่วคราว (forms designer, page builder) |
| PWA | manifest + sw.js (v11) + offline.html + PwaRegister | ครบ ใช้งานได้ |

### เป้าหมาย (ต้องเพิ่ม — ยังไม่มีทั้งหมด)
| ไลบรารี | เหตุผล |
|---|---|
| `lucide-react` | แทน heroicons + emoji เป็น icon หลัก |
| `react-hook-form` + `zod` | ฟอร์มมาตรฐาน + validation + error state |
| `@tanstack/react-query` | แทน fetch-in-useEffect (cache, retry, offline) |
| `@tanstack/react-table` | ตารางมาตรฐาน (sort/filter/pagination) |
| `clsx` + `tailwind-merge` + `class-variance-authority` | utility สำหรับ component variants |
| `next-themes` | dark mode (light/dark/system) |
| shadcn/ui (เลือกเฉพาะ component) | Button/Input/Dialog/Table/Select ฯลฯ บน Radix — **ไม่ต้องทั้งหมด** |

---

## 3. Routes Inventory (112 หน้า)

### 3.1 Standalone — นอก `(dashboard)` (8 หน้า, ไม่มี AppShell)
| Route | ไฟล์ | หน้าที่ |
|---|---|---|
| `/` | `app/page.tsx` | redirect → `/dashboard` |
| `/login` | `app/login/page.tsx` | LINE + username/password, demo login |
| `/register` | `app/register/page.tsx` | ผูก LINE ด้วย employee_code |
| `/scan` | `app/scan/page.tsx` | QR scan → repair/PM actions |
| `/qr-sheet` | `app/qr-sheet/page.tsx` | พิมพ์สติกเกอร์ QR |
| `/change-password` | `app/change-password/page.tsx` | เปลี่ยนรหัสครั้งแรก |
| `/repair/request` | `app/repair/request/page.tsx` | LIFF ฟอร์มแจ้งซ่อม F-EN-03 (canonical) |
| `/repair-request` | `app/repair-request/page.tsx` | **alias ซ้ำ** ของข้างบน |

### 3.2 Dashboard — ใน `(dashboard)` (104 หน้า)
| Module | Routes |
|---|---|
| Overview | `/dashboard` |
| Repair (9) | `/repair`, `/repair/create`, `/repair/assign`, `/repair/my_tasks`, `/repair/tracking`, `/repair/workload`, `/repair/kanban`, `/repair/history`, `/repair/edit`, `/repair/view` |
| Approval & Docs (6) | `/approval`, `/approval/center`, `/forms`, `/forms/designer`, `/forms/run/[id]`, `/manuals`, `/manuals/create`, `/manuals/edit` |
| PM/AM & Machines (13) | `/pm_am`, `/pm_am/create`, `/pm_am/edit`, `/pm_am/batch_schedule`, `/pm_am/calendar`, `/pm_am/checksheet`, `/inspections`, `/inspections/templates`, `/inspections/run`, `/asset_registry`, `/asset_registry/create`, `/asset_registry/edit`, `/asset_registry/bom_tree`, `/asset_registry/criticality`, `/assets`, `/assets/create` |
| Borrowing/Calibration/MTBF (9) | `/equipment_borrowing` + create/edit, `/calibration` + create/edit, `/mtbf_mttr` + create/edit |
| Spare parts (9) | `/spare_parts`, `/spare_parts/create`, `/spare_parts/edit`, `/spare_parts/issue_center`, `/spare_parts/stock_take`, `/spare_parts/sage_po`, `/spare_parts/sage_sync`, `/spare_parts/optimization`, `/suppliers` + create/edit |
| Analytics & Reports (6) | `/analytics`, `/analytics/kpi`, `/reports`, `/reports/monthly_pdf`, `/reports/export_excel` |
| Safety & IoT (2) | `/safety/work_permit`, `/iot/monitor` |
| People (7) | `/users` + create/edit, `/roles` + create/edit, `/profile` |
| System & Settings (13) | `/notifications`, `/notifications/history`, `/settings`, `/settings/notifications`, `/settings/menus`, `/settings/services`, `/settings/pwa`, `/settings/design`, `/settings/repair-options`, `/editor`, `/editor/builder`, `/pages`, `/pages/[slug]` |

### 3.3 Route ซ้ำ / ทับซ้อน (ต้องตัดสินใจ)
| คู่ | สถานะ | ข้อเสนอ |
|---|---|---|
| `/repair-request` vs `/repair/request` | เกือบเหมือนกันทุกบรรทัด (metadata, `<main>`, `<LiffBridge/>` + `<RepairRequestForm/>`) | **เก็บ `/repair/request`** (มี comment ว่า LiffBridge init เฉพาะ path นี้) — `/repair-request` เก็บไว้เป็น redirect หรือลบ + แก้ `scan/page.tsx:144` |
| `/assets` vs `/asset_registry` | ทั้งคู่ list asset แต่ `dbStatusToUi` ต่างกัน (active→operational vs running); `asset_registry` มี create/edit/bom_tree/criticality | **เก็บ `/asset_registry`** เป็น canonical — `/assets` redirect หรือลบ |
| `/analytics` vs `/analytics/kpi` | analytics = BI รายปี/trend; kpi = executive KPI (MTBF/MTTR/PM/SLA) | **ไม่ซ้ำกันจริง** — แยกหน้าที่ชัดเจน เก็บทั้งคู่ |
| `/repair/history` vs `/repair/tracking` | history = WO เสร็จ + cost/root cause; tracking = สถานะสด + rating | **ไม่ซ้ำกันจริง** — เก็บทั้งคู่ |

---

## 4. Components & Libs Inventory

### 4.1 Components (24 ไฟล์ใน `frontend/components/`)
| หมวด | รายการ |
|---|---|
| Shell | `LiffBridge`, `LiffLangToggle`, `MenuSection`, `SideNavSearch`, `SideNavScrollControls`, `CommandPalette`, `SplashScreen`, `PwaRegister` |
| UI primitives | `AnimatedDialog`, `SuccessDialog`, `ToastProvider`, `AndonLamp`, `CountUp`, `CardTableLabels`, `ImageUploadField` |
| Feature | `RepairRequestForm`, `EmailNotifySettings`, `PMChecksheetDocument`, `WorkOrderClosureDocument`, `GrapesBuilder`, `LayoutDndEditor` |
| Theme | `ThemeProvider`, `ThemeSettingsPanel` |

### 4.2 Lib (14 ไฟล์ใน `frontend/lib/`)
`i18n.ts` (TH/EN + PAGE_TITLES), `i18n-liff.ts`, `offline-store.ts` (IndexedDB v2), `offlineQueue.ts` (localStorage v1), `queue-migration.ts`, `server-check.ts`, `time-utils.ts`, `useMenuPermission.ts`, `repair-status.ts`, `pageLayout.ts`, `form-builder-loader.ts`, `form-data-sources.ts`, `dynamicPages.ts`, `imageCompress.ts`

### 4.3 หมายเหตุสำคัญ
- **ไม่มี** `hooks/` directory, **ไม่มี** central api client (ทุกหน้า fetch `/api/v1/*.php` ตรง ๆ ผ่าน rewrite)
- CSRF: frontend **ไม่ส่ง** `X-CSRF-Token` — backend ใช้ Origin/Referer fallback (`src/csrf.php`) — ใช้ได้ แต่ควรเพิ่ม token header ใน migration
- `useMenuPermission` fallback error → `setCanShowAll(true)` (UI-only, ไม่ใช่ security boundary — backend ยังบังคับ `requireLogin`)

---

## 5. UX Problems (เรียงตามความรุนแรง)

### P0 — ต้องแก้ (blocker สำหรับ design system)
1. **Dark mode ปิดตาย** — `globals.css:13-15` `@custom-variant dark` inert + `color-scheme: light` (line 189) แต่มี `dark:` class ค้าง 62 จุด → ต้องเปิด dark mode ด้วย token จริง (light/dark/system)
2. **Hard-code สี/สไตล์** — 2,011 inline `style` + 451 hex (worst: `settings/notifications` 121, `WorkOrderClosureDocument` 94, `RepairRequestForm` 77, `settings/page` 67, `reports/monthly_pdf` 64) → ต้องย้ายเป็น design tokens
3. **CSS hack เปราะ** — `[class*="Button_primary"]`, `[class*="TableRow_row"]`, `.astryx-top-nav { display:none !important }` — พังทันทีถ้า Astryx เปลี่ยน class name → ต้องลดการพึ่งพา CSS-module internals
4. **ฟอร์มไม่มี semantics** — ไม่มี `<form>`/`onSubmit`/`FormEvent` เลยทั้งโปรเจกต์; validation ด้วยมือ → ต้อง react-hook-form + zod
5. **a11y viewport** — `userScalable:false, maximumScale:1` (`app/layout.tsx:26-33`) → ต้องเปิด zoom ได้ (WCAG 1.4.4)

### P1 — ควรแก้ (UX quality)
6. **Loading/Empty/Error ไม่มาตรฐาน** — บางหน้า Spinner, บางหน้า text `กำลังโหลด...`, `safety/work_permit` มี state แต่ไม่ render; empty state มีทั้ง `EmptyState` (Astryx) และ dashed-card copy → ต้อง standardize (skeleton + EmptyState + Banner)
7. **Emoji เป็น icon** — `ToastProvider` (`✅ ❌ ℹ️`), `EmailNotifySettings`, `ImageUploadField` → ต้อง Lucide + `aria-hidden` + `aria-live` สำหรับ toast
8. **Clickable `<div>`** — `SuccessDialog` backdrop `<div onClick>` ไม่มี role/keyboard; `repair/page.tsx:593,620` `role="button"` ไม่ครบ semantics → ต้อง `<button>` จริง
9. **ngrok header รั่ว production** — `"ngrok-skip-browser-warning": "1"` 59 จุด / 20 ไฟล์ → ลบทั้งหมด (ไม่จำเป็นกับ production)
10. **IP dev hard-code** — `settings/notifications/page.tsx:676` `http://192.168.1.9:8081/bind_line.php` → ใช้ env `APP_URL`/`NEXT_PUBLIC_API_URL`
11. **`login/page.tsx` redirect ไป PHP ตรง** (`/line_login.php`) → ควรผ่าน Next route/rewrite ให้เป็นระเบียบ
12. **ตารางมือทำ 6 จุด** — `notifications`, `notifications/history`, `reports/monthly_pdf`, `settings/repair-options`, `repair/view`, Excel export string-HTML ใน `repair/page.tsx:369` → ย้ายเป็น component มาตรฐาน

### P2 — เก็บไว้ (tech debt, ไม่เร่ง)
13. jQuery + formBuilder (`forms/designer`), GrapesJS (`editor/builder`), `dangerouslySetInnerHTML` (EmailNotifySettings:506, GrapesBuilder:884) — เก็บไว้ก่อน วางแผนแทนที่ทีหลัง
14. `src/app` legacy tree (`editor`, `settings-sidebar`, `shell-side-nav`) — dead code? ตรวจและลบถ้าไม่มี route อ้างถึง
15. `dark:` class ค้าง 62 จุด — ล้างเมื่อเปิด dark mode จริง

---

## 6. Mobile / Responsive — สถานะ

**มีแล้ว (ดี):**
- Breakpoint 1023.98px: ซ่อน Astryx top-nav → แสดง `.cmms-mobile-app-bar` + `.cmms-mobile-bottom-nav` (role-based: Admin/Manager/Technician/Operator/Viewer, override ได้จาก API `bottomNavKeys`)
- `CardTableLabels` + `.cmms-card-table` เปลี่ยน table → card list บนจอเล็ก (MutationObserver inject `data-label`)
- 149 จุด `sm:/md:/lg:/xl:` responsive classes
- `useMediaQuery` ใช้ใน 5 ไฟล์

**ขาด/ต้องปรับ:**
- Touch target ยังไม่การันตี ≥44px ทุกจุด
- ฟอร์มยาว (repair/create, checksheet) ยังต้องตรวจ one-hand usability
- Bottom nav ต้องมี active state + safe-area (iOS home indicator)
- ต้องมี offline indicator ที่ชัดเจน (มี badge แล้วที่ queue — ตรวจความสม่ำเสมอ)

---

## 7. PWA — สถานะ

**มีแล้ว (ตรวจแล้ว ใช้ได้):**
- `manifest.webmanifest`: name/id/start/scope `/`, standalone, portrait, `lang:th`, theme `#0068B5`, icons `/icons/icon-192.png` + `/icons/icon-512.png` (any + maskable) — **path ตรวจแล้วมีไฟล์จริง**, shortcuts 4 ตัว
- `sw.js` v11: cache groups `cmms-tpt-{shell,assets,api,pages}-v11`; API network-first, `/_next/`+icons stale-while-revalidate, `OFFLINE_ROUTES` (`/repair/request`, `/repair-request`, `/repair/my_tasks`, `/repair/view`, `/pm_am/checksheet`) network-first→PAGE_CACHE, อื่น ๆ → `/offline.html`; Web Push handler ครบ
- `offline.html`: dark-gradient card + reload
- `PwaRegister`: prod register + auto-reload on controllerchange + Web Push (VAPID จาก `/api/v1/push_subscribe.php`, prompt หลัง 8s)
- Offline data: IndexedDB `cmms-offline-queue` v2 (submissions + snapshots) + localStorage v1 + migration — ใช้ใน repair/create, my_tasks, view, checksheet, inspections/run

**ต้องปรับ:**
- `OFFLINE_ROUTES` ยังมี `/repair-request` (alias) — ล้างเมื่อตัด route ซ้ำ
- ตรวจ `updateViaCache:"none"` + SKIP_WAITING flow กับ production จริง
- Push permission prompt หลัง 8s — ควรให้ user opt-in ชัดเจนกว่า (UX)

---

## 8. Accessibility — สรุป findings

| ประเด็น | หลักฐาน | ระดับ |
|---|---|---|
| Zoom ถูกปิด | `viewport` `userScalable:false, maximumScale:1` | P0 |
| ไม่มี `lang` บน `<html>` | `app/layout.tsx` (ตรวจไม่พบ) | P1 |
| Emoji เป็น icon หลัก | ToastProvider, EmailNotifySettings, ImageUploadField | P1 |
| Clickable `<div>` / `role="button"` ไม่ครบ | SuccessDialog, repair/page:593,620 | P1 |
| Toast ไม่มี `aria-live` | ToastProvider render | P1 |
| ตารางมือทำไม่มี semantics ครบ | 6 จุด (scope/caption) | P2 |
| `aria-label` มี 32 จุด (ดี) | layout, settings, repair | ✅ |
| Status ใช้ dot + text (ดี) | `.cmms-status-dot`, `.cmms-andon-chip` | ✅ |
| `aria-busy` บน loading skeleton (ดี) | `(dashboard)/loading.tsx` | ✅ |

---

## 9. Performance — สังเกต

- ทุกหน้า client-side fetch → FCP ดี แต่ data waterfall ตาม useEffect; ไม่มี Suspense/streaming
- `repair/my_tasks` 981 บรรทัด, `settings` 1,477 บรรทัด, `spare_parts` 1,050 บรรทัด — ไฟล์ยักษ์ ต้องแยก component
- jQuery + formBuilder + GrapesJS โหลดเฉพาะหน้า (dynamic import) — ดีอยู่แล้ว
- `html2canvas` + `jspdf` หนัก — ใช้เฉพาะหน้า PDF (ok)
- ไม่มี `images` config / next/image — ตรวจ lazy loading รูป upload
- Bundle: ยังไม่ได้วัด — ควรเพิ่ม `@next/bundle-analyzer` ใน migration

---

## 10. Backend Findings (บันทึกไว้ — ไม่แก้ใน STEP นี้)

> UI migration ไม่แตะ backend แต่ต้องรู้ไว้ (บางจุดกระทบ UX/security):

1. `settings.php` POST/PUT ตรวจแค่ login ไม่ตรวจ admin — user ธรรมดาแก้ setting ได้
2. `public/api/v1/index.php` `Access-Control-Allow-Origin: *`
3. `ngrok.php` — user ที่ login ใด ๆ ควบคุม tunnel ได้ (`exec` taskkill/start)
4. Seed password `'password'` ทั้ง 5 user (มี `must_change_password` + `demo_login_enabled` ตั้ง 0 เมื่อใช้งานจริง)
5. Error message leak: `'Server Error: ' . $e->getMessage()` หลายจุด
6. `CURLOPT_SSL_VERIFYPEER => false` ใน line_callback.php + ngrok.php
7. Hard-code ngrok URL ใน `ngrok.php:26` + `next.config.ts:20` (`allowedDevOrigins`)
8. `repair.php` POST anonymous (ตั้งใจ — ฟอร์มสาธารณะ LIFF) + CSRF ผ่าน Origin fallback

---

## 11. ข้อเสนอการแก้ (ลำดับ)

ดูรายละเอียดใน [UI_MIGRATION_PLAN.md](./UI_MIGRATION_PLAN.md) — สรุป:

1. **Phase 0 — Foundation**: เพิ่ม deps (lucide, RHF+zod, react-query, tanstack table, clsx/tw-merge/cva, next-themes) + เปิด dark mode tokens + แก้ a11y หลัก (viewport zoom, lang) + ลบ ngrok header/IP hard-code
2. **Phase 1 — Shared components**: Button/Input/Select/Dialog/Table/Toast/EmptyState/Skeleton/Badge มาตรฐาน (บน tokens)
3. **Phase 2 — Module-by-module**: เริ่มจากหน้าใช้งานบ่อย (repair list/create/my_tasks, dashboard, spare_parts) → ตามด้วย module อื่น
4. **Phase 3 — Cleanup**: ตัด route ซ้ำ, ลบ legacy tree, ล้าง dark: ค้าง, bundle analyze

ทุก module หลังแก้: build + lint + type check + ตรวจ route/API/responsive/console/network/loading/error + commit/push + แจ้ง Telegram
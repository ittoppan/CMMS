# UI Migration Plan — CMMS-TOPPAN (STEP 1: Full Project Audit)

> วันที่: 2026-08-20 · สถานะ: **แผนฉบับร่าง — รออนุมัติก่อนเริ่มแก้โค้ด**
> เอกสารคู่: [UX_UI_AUDIT.md](./UX_UI_AUDIT.md) · [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)

---

## 1. ภาพรวม

Migration แบ่ง 4 Phase — **ห้ามข้าม Phase 0/1** เพราะ component มาตรฐานต้องมีก่อน:

```
Phase 0: Foundation (deps + tokens + dark mode + a11y หลัก + cleanup เร็ว)
   ↓
Phase 1: Shared Components (UI kit มาตรฐาน)
   ↓
Phase 2: Module-by-Module (หน้าใช้งานบ่อยก่อน)
   ↓
Phase 3: Cleanup (route ซ้ำ, legacy, bundle, QA รวม)
```

**กฎทุก module:** หลังแก้ → `npm run build` + lint + type check + ตรวจ route/API/responsive/console/network/loading/error → commit + push → แจ้ง Telegram

---

## 2. Phase 0 — Foundation (ทำก่อนทุกอย่าง)

| # | งาน | รายละเอียด | ไฟล์หลัก | สถานะ |
|---|---|---|---|---|
| 0.1 | เพิ่ม dependencies | `lucide-react`, `react-hook-form`, `zod`, `@hookform/resolvers`, `@tanstack/react-query`, `@tanstack/react-table`, `clsx`, `tailwind-merge`, `class-variance-authority`, `next-themes` | `frontend/package.json` | ⬜ |
| 0.2 | เปิด Dark Mode | `next-themes` provider + CSS variables คู่ light/dark + `color-scheme` dynamic + ล้าง `@custom-variant dark` inert | `app/layout.tsx`, `app/globals.css`, `components/ThemeProvider.tsx` | ⬜ |
| 0.3 | แก้ a11y หลัก | `<html lang="th">`, เปิด zoom (ลบ `userScalable:false`/`maximumScale:1`) | `app/layout.tsx` | ⬜ |
| 0.4 | ลบ ngrok header | ลบ `"ngrok-skip-browser-warning": "1"` ทั้ง 59 จุด/20 ไฟล์ | ทั่ว `app/` + `components/` | ⬜ |
| 0.5 | ลบ IP hard-code | `192.168.1.9:8081` → env `NEXT_PUBLIC_API_URL`/`APP_URL` | `settings/notifications/page.tsx:676` | ⬜ |
| 0.6 | Token cleanup เริ่มต้น | ตั้ง `--cmms-*`/`--tp-*` เป็น single source; สร้าง `tokens.css` กลาง (มี `design-system/tokens.css` อยู่แล้ว — เชื่อมกับ globals.css) | `app/globals.css`, `design-system/tokens.css` | ⬜ |
| 0.7 | API client กลาง | สร้าง `lib/api.ts` (fetch wrapper: base URL, credentials, error normalize, react-query hooks) — ลด fetch ซ้ำ | `frontend/lib/api.ts` (ใหม่) | ⬜ |
| 0.8 | CSRF header | ส่ง `X-CSRF-Token` ใน POST/PUT/DELETE (backend มี fallback อยู่แล้ว — เพิ่ม token path ให้ครบ) | `lib/api.ts` | ⬜ |

**Exit criteria Phase 0:** build+lint+type ผ่าน, dark mode เปิดได้ 3 โหมด, zoom ใช้ได้, ไม่มี ngrok header/IP hard-code เหลือ

---

## 3. Phase 1 — Shared Components (UI Kit) ✅

สร้างใน `frontend/components/ui/` (shadcn-style) บน tokens + cva:

| Component | แทนที่ของเดิม | หมายเหตุ |
|---|---|---|
| `Button` ✅ | ปุ่มมือทำทุกหน้า | variants + sizes + icon slot (`ui/button.tsx`) |
| `Input/Textarea/Select` ✅ | field มือทำ | label + error + focus ring (`ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`) |
| `FormField` ✅ (RHF + zod) | ฟอร์ม useState ทั้งหมด | wrapper มาตรฐาน (`ui/form-field.tsx`) |
| `Table` ✅ (TanStack v9) | Astryx Table + ตารางมือทำ 6 จุด | sort/pagination + mobile card (`ui/table.tsx` + `ui/pagination.tsx`) |
| `Dialog` ✅ | `AnimatedDialog` (เก็บไว้ backward compat) | native `<dialog>` + animation เดิม + bottom sheet (`ui/dialog.tsx`) |
| `Toast` ✅ | `ToastProvider` (เก็บ context) | Lucide icon + aria-live (`components/ToastProvider.tsx`) |
| `EmptyState` ✅ | Astryx EmptyState + dashed-card copy | ตัวเดียวทั้งระบบ (`ui/empty-state.tsx`) |
| `Skeleton` ✅ | Spinner/text `กำลังโหลด...` | shimmer + aria-busy (`ui/skeleton.tsx`) |
| `Badge/Chip` ✅ | status chip มือทำ | semantic tokens (`ui/badge.tsx`) |
| `Tabs` ✅ | TabList (spare_parts) | accessible tabs ไม่พึ่ง Radix (`ui/tabs.tsx`) |
| เพิ่มเติม | — | `Card`, `Alert`, `Spinner`, `PageHeader` (`ui/card.tsx`, `ui/alert.tsx`, `ui/spinner.tsx`, `ui/page-header.tsx`) |

**Exit criteria:** ✅ ทุก component ใช้ในอย่างน้อย 1 หน้า pilot (repair list) — `/repair` migrate แล้ว (Lucide + Button/Input/Select + Badge + DataTable + Skeleton + EmptyState + Toast แทน alert; Astryx Table/TextInput/Selector/Spinner/EmptyState ถอดออกแล้ว) — Dialog/Tabs/FormField พร้อมใช้ใน Phase 2

---

## 4. Phase 2 — Module-by-Module

> Priority: **P0** = ใช้บ่อย/หน้าหลัก · **P1** = สำคัญ · **P2** = ตามหลัง
> สถานะ: ⬜ ยังไม่เริ่ม · 🔄 กำลังทำ · ✅ เสร็จ

### 4.1 Repair (หน้าหลัก — เริ่มก่อน)
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/repair` (list) | Astryx Table + fetch useEffect + Spinner | TanStack Table + react-query + Skeleton + EmptyState + filter/search | P0 | 0.x, 1.x | ✅ |
| `/repair/create` | useState ฟอร์ม + offlineQueue + SuccessDialog | RHF+zod + FormField + offline queue (เก็บ) | P0 | 0.x, 1.x | ✅ |
| `/repair/my_tasks` (981 บรรทัด) | ฟอร์ม/รายการ + offline snapshot | DataTable v9 + ui kit + Lucide (offline/AndonLamp/signature เก็บ) | P0 | 0.x, 1.x | ✅ |
| `/repair/view` | detail + WorkOrderClosureDocument PDF | tokens cleanup + PDF (เก็บ) + ตารางมือทำ → Tailwind | P0 | 0.x, 1.x | ✅ |
| `/repair/edit` | Suspense + ?id= | RHF + zod + ui kit + Lucide | P1 | 0.x, 1.x | ✅ |
| `/repair/kanban` | KanbanItem + priorityTone inline | tokens + Lucide + a11y | P1 | 0.x, 1.x | ⬜ |
| `/repair/tracking` | สถานะสด + rating dialog | tokens + Dialog มาตรฐาน | P1 | 0.x, 1.x | ⬜ |
| `/repair/history` | Table + CountUp + pagination | TanStack Table + tokens | P1 | 0.x, 1.x | ⬜ |
| `/repair/assign` | assignment UI | tokens + a11y | P1 | 0.x, 1.x | ⬜ |
| `/repair/workload` | tech load | tokens | P2 | 0.x | ⬜ |

### 4.2 Dashboard & Analytics
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/dashboard` | KPI cards + recharts + andon | tokens + Skeleton + Lucide + dark: ค้างล้าง | P0 | 0.x, 1.x | ⬜ |
| `/analytics` | BI รายปี + charts | tokens + Skeleton | P1 | 0.x | ⬜ |
| `/analytics/kpi` | KPI headline + AndonLamp | tokens (เก็บ AndonLamp) | P1 | 0.x | ⬜ |
| `/reports` + monthly_pdf + export_excel | hub + PDF + CSV | tokens + ตารางมือทำ → Table | P2 | 0.x, 1.x | ⬜ |

### 4.3 PM/AM & Inspections
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/pm_am` | list + calendar | tokens + Skeleton + EmptyState | P1 | 0.x, 1.x | ⬜ |
| `/pm_am/checksheet` (875 บรรทัด) | offline queue + PDF + LIFF lang | แยก component + RHF + offline (เก็บ) | P0 | 0.x, 1.x | ⬜ |
| `/pm_am/calendar` | calendar | tokens | P2 | 0.x | ⬜ |
| `/pm_am/create|edit|batch_schedule` | ฟอร์ม | RHF + zod | P2 | 0.x, 1.x | ⬜ |
| `/inspections` + templates + run | checklist engine + offline | tokens + RHF + offline (เก็บ) | P1 | 0.x, 1.x | ⬜ |

### 4.4 Assets & Registry
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/asset_registry` | list + create/edit/bom_tree/criticality | TanStack Table + tokens | P1 | 0.x, 1.x | ⬜ |
| `/assets` (ซ้ำ) | list อีกชุด | **redirect → `/asset_registry`** | P1 | — | ⬜ |
| `/equipment_borrowing` + create/edit | CRUD | tokens + RHF | P2 | 0.x, 1.x | ⬜ |
| `/calibration` + create/edit | CRUD | tokens + RHF | P2 | 0.x, 1.x | ⬜ |
| `/mtbf_mttr` + create/edit | CRUD | tokens + RHF | P2 | 0.x, 1.x | ⬜ |

### 4.5 Spare Parts & Suppliers
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/spare_parts` (1,050 บรรทัด) | detail layout + TabList | แยก component + TanStack Table + tokens | P0 | 0.x, 1.x | ⬜ |
| `/spare_parts/create|edit` | ฟอร์ม | RHF + zod | P1 | 0.x, 1.x | ⬜ |
| `/spare_parts/issue_center` | Sage cart | tokens | P2 | 0.x | ⬜ |
| `/spare_parts/stock_take` | stock count | tokens + offline (ถ้าใช้หน้างาน) | P2 | 0.x | ⬜ |
| `/spare_parts/sage_po|sage_sync` | Sage integration | tokens | P2 | 0.x | ⬜ |
| `/spare_parts/optimization` | EOQ/dead-stock | tokens | P2 | 0.x | ⬜ |
| `/suppliers` + create/edit | CRUD | TanStack Table + RHF | P2 | 0.x, 1.x | ⬜ |

### 4.6 People & Permissions
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/users` + create/edit | CRUD | TanStack Table + RHF | P1 | 0.x, 1.x | ⬜ |
| `/roles` + create/edit | CRUD + permissions | TanStack Table + RHF | P1 | 0.x, 1.x | ⬜ |
| `/profile` | profile | tokens + RHF | P2 | 0.x, 1.x | ⬜ |

### 4.7 Settings & System
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/settings` (1,477 บรรทัด) | ThemeSettingsPanel + pageLayout | **แยก component ก่อน** + tokens | P1 | 0.x, 1.x | ⬜ |
| `/settings/notifications` (121 inline style) | LINE templates + EmailNotifySettings | tokens cleanup + Lucide + ลบ IP hard-code | P1 | 0.x | ⬜ |
| `/settings/menus` | role menu permissions | tokens + Table | P2 | 0.x, 1.x | ⬜ |
| `/settings/services|pwa|design|repair-options` | service status, PWA, page designer | tokens | P2 | 0.x | ⬜ |
| `/notifications` + history | center + log | tokens + ตารางมือทำ → Table | P2 | 0.x, 1.x | ⬜ |

### 4.8 Approval, Forms, Manuals, Safety, IoT
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/approval` + center | workflow center | tokens + Skeleton | P1 | 0.x | ⬜ |
| `/forms` + run/[id] | form center + fill + PDF | tokens + RHF (run) | P2 | 0.x, 1.x | ⬜ |
| `/forms/designer` | jQuery formBuilder | **เก็บไว้** (legacy) — แผนแทนที่แยก | P3 | — | ⬜ |
| `/manuals` + create/edit | manuals CRUD | tokens + RHF | P2 | 0.x, 1.x | ⬜ |
| `/safety/work_permit` | LOTO permits — **ไม่มี loading state** | เพิ่ม Skeleton + EmptyState + tokens | P1 | 0.x, 1.x | ⬜ |
| `/iot/monitor` | sensor nodes | tokens + AndonLamp | P2 | 0.x | ⬜ |

### 4.9 Standalone (นอก dashboard)
| หน้า | ปัจจุบัน | ใหม่ | Pri | Deps | สถานะ |
|---|---|---|---|---|---|
| `/login` | LINE + form + demo login | tokens + RHF + zod | P0 | 0.x, 1.x | ⬜ |
| `/register` | LINE bind | tokens + RHF | P1 | 0.x, 1.x | ⬜ |
| `/change-password` | เปลี่ยนรหัสครั้งแรก | tokens + RHF + zod | P1 | 0.x, 1.x | ⬜ |
| `/scan` | QR scan | tokens + Lucide | P1 | 0.x | ⬜ |
| `/qr-sheet` | พิมพ์ QR | tokens | P2 | 0.x | ⬜ |
| `/repair/request` (canonical) | LIFF form | tokens + RHF + offline (เก็บ) | P0 | 0.x, 1.x | ⬜ |
| `/repair-request` (ซ้ำ) | alias | **redirect → `/repair/request`** + แก้ `scan/page.tsx:144` | P1 | — | ⬜ |

---

## 5. Phase 3 — Cleanup & QA

| # | งาน | รายละเอียด | สถานะ |
|---|---|---|---|
| 3.1 | ตัด route ซ้ำ | `/repair-request` → redirect, `/assets` → redirect; อัปเดต manifest shortcuts + SW `OFFLINE_ROUTES` | ⬜ |
| 3.2 | ลบ legacy tree | ตรวจ `src/app` (editor, settings-sidebar, shell-side-nav) — ลบถ้าไม่มี route อ้างถึง | ⬜ |
| 3.3 | ล้าง `dark:` ค้าง | 62 จุด → token จริง | ⬜ |
| 3.4 | Bundle analyze | เพิ่ม `@next/bundle-analyzer` + ลด chunk (dynamic import หน้าใหญ่) | ⬜ |
| 3.5 | QA รวม | ทดสอบทุก role (Admin/Manager/Technician/Operator/Viewer) × ทุก breakpoint × offline × dark mode × a11y (axe) | ⬜ |
| 3.6 | PWA re-check | manifest/SW/icons หลังตัด route; push opt-in UX | ⬜ |
| 3.7 | Backend findings รายงาน | ส่ง findings (settings.php admin check, CORS, ngrok.php, seed password) ให้ owner ตัดสินใจ — **ไม่แก้เอง** | ⬜ |

---

## 6. ลำดับการลงมือ (Recommended Order)

1. **Phase 0 ทั้งหมด** (0.1 → 0.8) — 1 commit ต่องานย่อย
2. **Phase 1** — สร้าง UI kit + pilot ที่ `/repair` list
3. **Phase 2 ตามลำดับ:** Repair (P0) → Dashboard → PM/AM checksheet → Spare parts → Standalone (login/repair-request) → People → Settings → ที่เหลือ P1/P2
4. **Phase 3** — cleanup + QA

> ⚠️ ทุก commit: ตรวจ `git status`/`diff` ก่อน, ห้าม commit secrets, push `origin main`, แจ้ง Telegram `telegramAdminAlert($title,$message,$url,$level)` ครบ args

---

## 7. ตัวชี้วัดความสำเร็จ (Definition of Done)

- [ ] build + lint + type check ผ่าน 0 error ทุก module
- [ ] ไม่มี hard-code สี/ขนาดใหม่; inline style ใน module ที่ทำ = 0
- [ ] ทุกหน้าใน module มี loading/empty/error/no-result/offline/permission state
- [ ] Dark mode 3 โหมดใช้ได้ทั้งระบบ
- [ ] a11y: zoom ได้, keyboard navigable, aria-label ครบ, contrast ผ่าน
- [ ] Mobile: bottom nav + card table + touch target ≥44px
- [ ] PWA: offline routes ครบตาม module, queue sync ทำงาน
- [ ] ไม่แตะ Business Logic/DB/API/Auth/Permission
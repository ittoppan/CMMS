# MASTER UI AUDIT — CMMS-TPT

> Phase 1 · 2026-11-23 · Consolidation จาก `docs/DESIGN_SYSTEM.md`, `docs/DESIGN_REPORT.md`, `docs/IMPECCABLE_FULL_PROJECT_AUDIT.md` §6, `docs/CMMS_UI_AUDIT.md` §8, `docs/UI_MIGRATION.md`
> ขอบเขต: ความสม่ำเสมอของหน้าตา ไม่ใช่ logic

## 1. Design System ที่ประกาศไว้ vs ที่ใช้จริง

| หัวข้อ | ประกาศ | ใช้จริง | ช่องว่าง |
|---|---|---|---|
| Tokens | Corporate Navy/White/Teal, `--cmms-*` | ใช้ CSS vars ทั่วไป | ไม่มีไฟล์ `DESIGN_TOKENS.md` (ต้องสร้าง Phase 2) |
| Typography | scale ตาม `DESIGN_SYSTEM.md` §3 | ใช้ `text-sm` เป็นหลัก (กฎห้ามต่ำกว่า `text-sm` สำหรับไทย) | ต้องตรวจ badge/caption ที่เล็กกว่า |
| Cards | `.card` canonical | ผ่านการแปลง 78+72 จุด (2026-08-23) | อาจมี card-in-card ใน dashboard ใหม่ |
| Tables | ❌ ของจริง = `overflow-x-auto` + `min-w-[…px]` (`.cmms-stack-table`/`.data-table` **ไม่มีในโค้ด**: 0 ครั้ง, `data-label` 4 ครั้ง) | 89 ตาราง / 55 ไฟล์ — ตรวจ 768/390/1440 แล้ว overflowX = 0 (`PHASE_1_TABLET_768_REPORT.md`) | ยังไม่มี stacked-card mode · ตารางคอลัมน์มากบนมือถือต้องทดสอบบนอุปกรณ์ |
| Badges | `.status-*` / `.priority-*` + `src/components/badge.php` | ใช้แล้ว ~30 หน้า PHP + StatusChip/PriorityChip FE | ยังมี raw Tailwind สีเข้มในบางหน้าใหม่ |
| Alerts/Banner | `.cmms-banner` 4 แบบ / `Alert` FE | 134 alert div ใน ~78 หน้า PHP | FE ใช้ `Alert` ไม่ครบทุกหน้า |
| Modal | `.cmms-modal-*` + `CMMS_UI.openModal` | migrate แล้วบางจุด (smart-req) | dialog FE ยังใช้ `Dialog` ตรง ๆ หลายหน้า |
| Empty/Loading | `.cmms-empty-state`, `Skeleton` | 30 empty cells | dashboard ใหม่ใช้ข้อความ "…" บางหน้า |
| Icons | lucide-react เท่านั้น | ใช้ถูกใน FE; PHP pages ใช้ inline SVG/emoji บางจุด | ตรวจ emoji แทน icon |
| Header | `PageHeader`/`DetailHeader` เท่านั้น | ครบ 252 หน้าเดิม | 13 route ใหม่ยังไม่ยืนยัน |

## 2. Findings (UI)

| # | เรื่อง | ระดับ | หน้า | หลักฐาน |
|---|---|---|---|---|
| U1 | 13 route ใหม่ยังไม่ผ่านกติกา header/spacing | High | dashboard 10 + onboarding | Phase 0 |
| U2 | บางหน้า dashboard ใหม่ใช้ข้อความ "…" แทน skeleton | Medium | `/supervisor` (แก้แล้วใน D3.2), อื่น ๆ | D3 audit |
| U3 | hex สีค้าง 2 จุด | Low | `/dashboard/my` | DESIGN_REPORT §7 |
| U4 | card-in-card / panel ซ้อนในหน้า wallboard และ dashboard ใหม่ | Low-Med | `/dashboard/wallboard`, `/dashboard/*` | อ่านโค้ด |
| U5 | Demo pages ยังเข้าถึงได้ | Low | `/ui-demo`, `/ui-kit` | route จริง |
| U6 | Chart สี/legend ไม่เป็นมาตรฐานเดียวกันทุกหน้า | Medium | analytics, reports, wallboard | `DESIGN_REPORT` §8 |
| U7 | KPI tile หลายแบบ (`.cmms-stat-tile` vs dashboard ใหม่) | Medium | dashboard/* | `TASKS.md` (Step 11) |
| U8 | Badge/Status colour ไม่ตรงกันระหว่าง PHP และ FE | Medium | หน้า PHP ที่ยังเหลือ | `badge.php` vs `StatusChip` |

## 3. Responsive

| breakpoint | สถานะ |
|---|---|
| 390 | ผ่านเฉพาะ Level 1 6 หน้า + wallboard; queue/detail ยังไม่ผ่าน (ตาราง) |
| 768 | ยังไม่ตรวจ |
| 1440 | ยังไม่ตรวจ |

## 4. Accessibility (สรุปจากหลักฐานเดิม)

- axe: critical 0 / serious 0 ใน Level 1 + wallboard + `/dashboard/my` (หลังแก้)
- แก้แล้ว: kpi-strip scrollable region `tabIndex`, profile button `aria-label`, scan FAB landmark, PwaRegister touch target 24→ ≥24
- ยังต้อง: dialog focus trap ทุกหน้า, heading hierarchy หน้าใหม่, table header scope, contrast ของ hex ค้าง

## 5. Acceptance ของ Phase 1 (UI)

- [x] ระบุมาตรฐานที่ประกาศ vs ใช้จริง
- [x] ระบุหน้า + ระดับความรุนแรง
- [ ] ปิด U1/U2/U7 ใน Phase 4/6 (หลังทำ Design tokens)

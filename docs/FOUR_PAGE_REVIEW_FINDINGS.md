# สรุป Finding รีวิว 4 หน้าหลัก (repair, spare_parts, dashboard, pm_am)

เอกสารนี้รวม finding จากรีวิว 4 หน้าหลัก + sibling ที่เกี่ยวข้อง เพื่อกันสั่งแก้ซ้ำในสิ่งที่แก้ไปแล้ว และชี้ชัดว่าอะไรยังค้างจริง

อัปเดตล่าสุด: 25 พ.ย. 2026 — commit `016b85ef` (main) — base สำหรับ review ควรเป็น origin/main (ล่าสุด) ไม่ใช่ commit เก่า

## สถานะภาพรวม

| หมวด | แก้แล้ว | ยังค้าง |
|------|---------|---------|
| Heading hierarchy (h1→KPI ไม่ใช่ h3) | repair, pm_am หลัก, pm_am/dashboard, pm_am/calendar, pm_am/plans, pm_am/plans/[id] | — |
| Heading skip (h1→h4/h5) | — | pm_am/calendar, pm_am/dashboard |
| Ellipsis `...` → `…` | 4 โมดูลหลัก + shared components | — (gate ป้องกัน regression: `scripts/design-audit.py` check `thai-ellipsis`) |
| Search URL debounce + flush | repair, spare_parts | — |
| transition-all → transition | 31 จุด (ยกเว้น progress bar width) | — |
| `<img>` lazy/async + width/height | 18 แท็ก | — |
| KPI tabular-nums | `.cmms-kpi-value` ใน globals.css | — |
| alert() → toast | repair/view PDF fallback | — |
| Focus ring HubCard (outline 2px) | hub-grid.tsx | — |
| viewport theme-color per route | login, change-password | — |
| Mobile logout | drawer + header | — |
| spare_parts row restructure + overlay | page.tsx | — |

## แก้แล้ว (Fixed)

| # | หน้า/ไฟล์ | หัวข้อ | file:line (ปัจจุบัน) | คอมมิต | หลักฐาน |
|---|-----------|--------|----------------------|--------|---------|
| 1 | repair | debounce URL 350ms + flush blur/unmount | `frontend/app/(dashboard)/repair/page.tsx` (changeSearch, flushPendingUrlSync) | `c73e801f`, `3e826665` | tsc/build ผ่าน; pre-push PASS |
| 2 | repair/view | `alert()` → `showToast("error", …)` | `frontend/app/(dashboard)/repair/view/page.tsx:505` | `0f0c3d8f` | diff แสดง import useToast + hook |
| 3 | repair/my_tasks | img + width/height 56×56 | `frontend/app/(dashboard)/repair/my_tasks/page.tsx` | `0f0c3d8f` | diff |
| 4 | spare_parts | row restructure + full-row overlay | `frontend/app/(dashboard)/spare_parts/page.tsx` | `22346ba4` | hit-testing จริง (stock number/minibar/padding hit overlay/main button) |
| 5 | spare_parts | debounce searchInput 350ms + flush | `frontend/app/(dashboard)/spare_parts/page.tsx` (useEffect debounce, flushSearchInput) | `3c3b8b77` | build ผ่าน |
| 6 | spare_parts | `<img>` lazy/async + width/height 40×40 | `frontend/app/(dashboard)/spare_parts/page.tsx:534,658,683` | `0f0c3d8f` | diff |
| 7 | pm_am หลัก | KPI 5 ใบเป็น `<p className="cmms-kpi-value">` | `frontend/app/(dashboard)/pm_am/page.tsx:604,613,622,631,644` | `40b26fd0` | grep cmms-kpi-value |
| 18 | pm_am/plans | KPI 5 ใบ h3→p | `frontend/app/(dashboard)/pm_am/plans/page.tsx:234,243,252,261,270` | `05a9a84e` | grep cmms-kpi-value |
| 19 | pm_am/plans/[id] | KPI 4 ใบ h3→p | `frontend/app/(dashboard)/pm_am/plans/[id]/page.tsx:346,352,358,364` | `05a9a84e` | grep cmms-kpi-value |
| 8 | pm_am/dashboard | KPI h3→p | `frontend/app/(dashboard)/pm_am/dashboard/page.tsx` | `40b26fd0` | commit |
| 9 | pm_am/calendar | KPI h3→p | `frontend/app/(dashboard)/pm_am/calendar/page.tsx` | `40b26fd0` | commit |
| 10 | pm_am/* | transition-all → transition (31 จุด) | หลายไฟล์ใน pm_am/ | `0f0c3d8f` | diff |
| 11 | globals.css | `.cmms-kpi-value` tabular-nums | `frontend/app/globals.css` (.cmms-kpi-value) | `0f0c3d8f` | diff |
| 12 | shared components | `...` → `…` | CommandPalette, EmailNotifySettings, GrapesBuilder, calibration/FileAttachment + spinner, list-toolbar, NotificationBell, ImageUploadField, ThemeSettingsPanel, report-page, RepairRequestForm | `22346ba4` | grep ไม่เหลือ `...` ในสตริงไทย |
| 13 | hub-grid.tsx | focus ring outline 2px | `frontend/components/layout/hub-grid.tsx` | `13cadf2e` | วัด DOM ที่ 390px |
| 14 | login/change-password layout | viewport themeColor | `frontend/app/login/layout.tsx`, `frontend/app/change-password/layout.tsx` | (commit ก่อนหน้า) | meta ที่เสิร์ฟจริง |
| 15 | 4 โมดูลหลัก | `...` → `…` | 40 ไฟล์ | `59a5b9bf` | diff 121 จุด |
| 16 | design-audit | gate `thai-ellipsis` | `scripts/design-audit.py` | `b1995aa6` | ทดสอบจับ regression ได้ |
| 17 | review cleanup | progress bar transition-all + ลบ blank lines | `frontend/app/(dashboard)/spare_parts/sage_shipments/page.tsx`, repair/workload, spare_parts/issue_center | `fc901023` | build ผ่าน |

## ยังค้างจริง (Pending)

| # | หน้า/ไฟล์ | ปัญหา | file:line | ความเสี่ยง | ข้อเสนอ |
|---|-----------|--------|-----------|-----------|---------|
| P3 | pm_am/calendar | heading skip h1→h5/h4 | `frontend/app/(dashboard)/pm_am/calendar/page.tsx:424,550,561,606,640` (h5/h4) | a11y heading order | normalize เป็น h2/h3 |
| P4 | pm_am/dashboard | heading skip h1→h4 | `frontend/app/(dashboard)/pm_am/dashboard/page.tsx:197` | a11y heading order | normalize เป็น h2/h3 |

## หมายเหตุสภาพแวดล้อม (ไม่ใช่ finding ของโค้ด)

- บัญชีทดสอบ `CMMSTEST403` เป็น role Viewer (role_id=5) → หน้า repair/spare_parts/pm_am ตอบ 403; ถ้าต้องวัด DOM ให้ย้าย role ชั่วคราวเป็น role 10 แล้วคืนค่า
- Telegram แจ้งเตือนทำไม่ได้ (ไม่มี `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`)
- session ในเบราว์เซอร์พรีวิวหมดอายุบ่อย

## ไฟล์หลักฐาน (screenshots ใน artifacts/)

- `artifacts/nav-390-*.png`, `hubcard-focus-390-v2.png`, `spare-row-clickable-390.png`, `verify-row-focus-390.png`, `change-password-390.png`, `drawer-logout-390-v2.png`
- untracked: `403-desktop-1440.png`, `403-mobile-390.png`, `artifacts/`

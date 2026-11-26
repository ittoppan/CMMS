# Web Interface Guidelines Audit — CMMS-TPT Frontend

วันที่: 2026-11-26
ขอบเขต: `frontend/app/**/*.tsx`, `frontend/components/**/*.tsx` (ทุกหน้า + shared components)
แหล่งกฎ: Vercel Web Interface Guidelines snapshot `434b7f91` (skill `web-design-guidelines`)
วิธีตรวจ: static scan (JSX tag parser) + ตรวจด้วยมือในไฟล์ที่พบ + ยืนยันด้วย `tsc`, `design-audit --strict`

## สรุปผล

| หมวด | ผลก่อนแก้ | ผลหลังแก้ |
|---|---|---|
| Accessibility — form labels | 43 controls ไม่มี accessible name | ✅ แก้ครบ (aria-label) |
| Accessibility — icon buttons | 0 ปัญหาจริง (ทุกปุ่มมีข้อความหรือ aria-label) | ✅ ผ่าน |
| Accessibility — images | 0 ปัญหาจริง (มี alt + dimensions หรือ CSS aspect-ratio) | ✅ ผ่าน |
| Focus states | ✅ `outline-none` ทุกจุดมี `focus-visible:ring-*` | ✅ ผ่าน |
| Animation | ✅ ไม่มี `transition: all`, มี `prefers-reduced-motion` | ✅ ผ่าน |
| Typography | ✅ ใช้ `…` ไม่มี `...` ในข้อความที่ผู้ใช้เห็น | ✅ ผ่าน |
| Forms | ✅ ไม่มี `onPaste` block, login มี autocomplete/spellCheck | ✅ ผ่าน |
| Navigation | ✅ `target="_blank"` มี `rel` ครบ | ✅ ผ่าน |
| Touch & layout | ✅ `touch-action: manipulation`, safe-area, skip link | ✅ ผ่าน |
| Theming | ✅ `lang="th"`, `theme-color`, zoom เปิด, `color-scheme: light` | ✅ ผ่าน |
| Hydration | ✅ ไม่มี controlled input ที่ขาด `onChange` | ✅ ผ่าน |

**ผลรวม: PASS** — ไม่เหลือ violation ที่ยืนยันได้; รายการ backlog ด้านล่างเป็นข้อจำกัดเชิงสถาปัตยกรรม ไม่ใช่ bug

## สิ่งที่แก้ไข (57 จุด / 23 ไฟล์)

### Shared components
- `frontend/components/CommandPalette.tsx:147` — search input เพิ่ม `aria-label="ค้นหาเมนูและคำสั่ง"`
- `frontend/components/MyRepairs.tsx:233` — textarea ความคิดเห็น เพิ่ม `aria-label`
- `frontend/components/ThemeSettingsPanel.tsx:143,166` — HEX inputs เพิ่ม `aria-label`
- `frontend/components/RepairRequestForm.tsx:1025` — ลบ `onClick` navigation ออกจาก success overlay (ใช้ปุ่มใน card แทน)

### หน้าที่มี label แบบ sibling แต่ไม่ได้ associate
- `frontend/app/(dashboard)/cost/page.tsx:592` — เลขที่ใบงาน
- `frontend/app/(dashboard)/dashboard/lubrication/page.tsx:107,111,115,157`
- `frontend/app/(dashboard)/dashboard/shift-handover/page.tsx:101,105,111,115,119,123`
- `frontend/app/(dashboard)/dashboard/utility-energy/page.tsx:91,97,101,105,109`
- `frontend/app/(dashboard)/pm_am/checklists/page.tsx:325,361`
- `frontend/app/(dashboard)/predictive-maintenance/page.tsx:63`
- `frontend/app/(dashboard)/settings/design/page.tsx:171`

### หน้าที่มีเฉพาะ placeholder / ไม่มี label
- `frontend/app/(dashboard)/contractors/create/page.tsx:234-239` (5 ช่องผู้ติดต่อ)
- `frontend/app/(dashboard)/contractors/work/page.tsx:462,463,486`
- `frontend/app/(dashboard)/contractors/[id]/page.tsx:361,363`
- `frontend/app/(dashboard)/rca/events/page.tsx:119`
- `frontend/app/(dashboard)/rca/[id]/page.tsx:297`
- `frontend/app/(dashboard)/calibration/standards/page.tsx:142`
- `frontend/app/(dashboard)/calibration/mobile/page.tsx:120`
- `frontend/app/(dashboard)/feedback/page.tsx:264`
- `frontend/app/(dashboard)/pm_am/plans/create/page.tsx:631`
- `frontend/app/(dashboard)/repair/view/page.tsx:1209`
- `frontend/app/(dashboard)/spare_parts/issue_center/page.tsx:305`

### Facility layout (special-format page)
- `frontend/app/(dashboard)/facility-layout/page.tsx` — เพิ่ม `aria-label` ให้ select 14 จุด (ประเภท/สถานะพอร์ต, ประเภท/สถานะตู้, ตัวกรอง, ตำแหน่งติดตั้ง, แหล่งจ่ายไฟ)

## ตรวจแล้วไม่พบปัญหา (verified clean)

- **Icon-only buttons:** ปุ่ม icon ทุกตัวมีข้อความ, `aria-label`, หรือ `title` (เช่น issue_center qty, sage_sync save, hub-grid/kpi-strip)
- **Images:** `alt` ครบ; รูปที่ไม่มี `width`/`height` attribute ใช้ CSS `aspect-ratio`/fixed height (`.cmms-img-fill`, `.cmms-img-thumb`, `.cmms-img-part`) เพื่อกัน CLS ตามคอมเมนต์ใน `globals.css`
- **Links:** `target="_blank"` มี `rel="noreferrer"`/`noopener` ทุกจุด
- **Focus:** `outline-none` ถูกใช้เฉพาะคู่กับ `focus-visible:ring-*` หรือ `box-shadow` focus indicator
- **Animation:** ไม่มี `transition: all`; มี `@media (prefers-reduced-motion: reduce)` หลายจุด
- **Typography:** ไม่มี `...` ในข้อความ UI (พบเฉพาะใน JSDoc ตัวอย่าง); มี `tabular-nums`, `text-wrap: balance/pretty`
- **Forms:** ไม่มี `onPaste` + `preventDefault`; login/change-password มี `autoComplete`, `spellCheck={false}`; ไม่ปิด zoom (`maximum-scale`/`user-scalable` ไม่มี)
- **Navigation/state:** skip link `#cmms-main-scroll` ใช้งานได้; `lang="th"`; `theme-color`; `viewport-fit=cover`
- **Async feedback:** toast/error ใช้ `aria-live="polite"`/`role="alert"` + `aria-live="assertive"`

## Backlog (ไม่บล็อก — ต้องตัดสินใจเชิงสถาปัตยกรรม)

1. **URL state sync** — ตัวกรอง/แท็บ/ pagination หลายหน้าเก็บใน `useState` ไม่ได้สะท้อนใน query string (ต้องใช้ `nuqs` หรือเทียบเท่า)
2. **`autocomplete`/`name` บนฟอร์ม non-auth** — ฟอร์มภายในยังไม่ใส่ `name`/`autocomplete` ครบทุกช่อง (เสี่ยง password manager trigger ต่ำ)
3. **`translate="no"`** — brand names/รหัส (CMMS-TOPPAN, WO codes) ยังไม่ได้ wrap ทุกจุด
4. **`overscroll-behavior: contain`** — มีเฉพาะ `sheet.tsx`; dialog overlay อื่นใช้ fixed backdrop (behavior ปกติ)
5. **Virtualization** — ตารางที่มีแถวมาก (>50) บางหน้ายัง render ทั้งหมด; มี `content-visibility: auto` ใน `globals.css` แล้ว

## การยืนยัน

```text
npx tsc --noEmit                                  → PASS (0 errors)
python scripts/design-audit.py --diff origin/main --strict → PASS (0 FAIL / 0 WARN, 19 pages)
pre-push: php-tests / tsc / next build / design-audit → PASS
```

หมายเหตุ: การแก้ครั้งนี้เพิ่มเฉพาะ `aria-label` และลบ overlay onClick 1 จุด — ไม่แตะ logic/API/route/permission

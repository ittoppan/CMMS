# CMMS-TPT — Dashboard Design System

## ของเดิมที่ใช้ (ไม่สร้างใหม่)

| ชั้น | ไฟล์ | หมายเหตุ |
|---|---|---|
| Design tokens (light) | `frontend/app/globals.css` (`--cmms-*`) | สี/ระยะ/เงา ใช้ทั้งแอป |
| Component library | `frontend/components/ui/*` (card, button, badge, table, alert, dialog, select...) | ใช้ซ้ำทุกหน้า |
| Page chrome | `components/ui/page-header`, `PageShell`, `components/layout` | header/filter bar มาตรฐาน |
| Wallboard scope | `frontend/app/tower.css` | เฉพาะ `.cmms-tower` + `[data-tower-shell]` |
| ไอคอน | Lucide (`lucide-react`) เป็นหลัก | ห้าม emoji ในหน้า dashboard |
| สถานะเครื่อง | `components/AndonLamp` | เขียว/เหลือง/แดง/เทา ตามความหมาย |

## กติกาที่บังคับด้วยสคริปต์

`python scripts/design-audit.py --strict` สแกนทุก `page.tsx` (242 หน้า) และ fail ถ้า:
- ไม่มี eyebrow/หัวเรื่องตามมาตรฐาน
- มี emoji, hex color, gradient, หรือ KPI ที่ไม่ใช้คลาสมาตรฐาน

ข้อยกเว้นที่ตั้งใจ: gradient อยู่ใน `tower.css` เท่านั้น (หน้า wallboard) — ไม่ใช่ inline ใน `page.tsx`

## โทนสี wallboard (`tower.css`)

Navy canvas + panel, ตัวอักษร 3 ระดับ, สีสถานะ: blue/teal/green/amber/red/purple
ค่า KPI ที่ไม่มีข้อมูลใช้ `N/A` สีกลาง (ไม่ย้อมแดง/เขียวเพื่อไม่ให้ตีความผิด)

## Component ที่ dashboard ใช้ซ้ำ

- `Kpi` (การ์ด KPI + sparkline + overlay link drill-down)
- `Panel` (กรอบกราฟ/ตารางใน wallboard)
- `Donut`, `Wave`, `Meter`, `GaugeRow` — ภายในหน้า dashboard
- `Card/CardHeader/CardTitle/CardContent`, `Button`, `Alert`, `PageHeader` — หน้าอื่น ๆ

## Responsive

- Wallboard: 4 แถว, กำหนดความสูงแบบ flex + `lg:overflow-hidden` เพื่อไม่ให้ scroll บนจอ 1920×1080 ขึ้นไป
- หน้าทั่วไป: grid 2/3/6 คอลัมน์ ตาม breakpoint มาตรฐานของโปรเจกต์

## สิ่งที่ยังไม่ได้ทำ

- ยังไม่มี design token ชุด "dark theme" แยกสำหรับหน้าทั่วไป (มี `next-themes` แต่ dashboard ใช้ dark เฉพาะ scope)
- ยังไม่มีชุด `components/charts/*` ที่รวมศูนย์ (ดู `CHART_ARCHITECTURE.md`)

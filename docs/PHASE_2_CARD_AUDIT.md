# Phase 2 (ต่อ) — Card-in-card audit (nested `<Card>`)

> วันที่: 2026-11-23 · ปิดช่อง "ค้างเก็บกวาด card-in-card/tile ในหน้าที่ยังไม่ย้าย" (tracker §2)
> วิธี: นับ `<Card>` ซ้อนกันจริง (JSX depth tracking) ไม่ใช่ heuristic ที่นับ sibling card ใน grid

## 1. วิธีนับ

สแกน `app/**/*.tsx` + `components/**/*.tsx` (100+ ไฟล์) ด้วย depth tracking:
เปิด `<Card>` ขณะที่ depth ≥ 1 → นับเป็น nested

## 2. ผล

**8 nested openings ใน 5 ไฟล์** (จาก `<Card>` ทั้งหมด ~430 จุด / ~55 ไฟล์)

| ไฟล์ | จำนวน Card ซ้อน | ลักษณะ |
|---|---|---|
| `app/scan/page.tsx` | 3 | scanner panel (outer) ครอบ list ของ work-order card |
| `app/(dashboard)/asset_registry/view/page.tsx` | 1 | quick-actions card ครอบ progress card |
| `app/(dashboard)/forms/page.tsx` | 1 | ฟอร์มหลัก card ครอบ card ของแต่ละฟอร์มใน list |
| `app/(dashboard)/spare_parts/sage_sync/page.tsx` | 1 | sync panel ครอบ card สถานะ |
| `components/EmailNotifySettings.tsx` | 2 | settings card ครอบ sub-card |

**ไม่พบ nested Card ใน 247 หน้าอื่น** — ที่เหลือเป็น sibling card ใน grid (KPI strip) ไม่ใช่ card-in-card

## 3. ประเมิน

- ไม่ใช่ "bug ที่ผู้ใช้เห็น" โดยตรง (Card ซ้อนกันยัง render ได้ปกติ) แต่ฝ่าฝืนหลัก "card-in-card" ของ design system → เพิ่ม padding/border ซ้อนกัน ทำให้หน้าดูหนัก
- 5 ไฟล์นี้อยู่นอก dashboard shell บางส่วน (`scan`, `forms`) จึงไม่ได้ถูกเก็บกวาดใน Phase 2 แรก
- ทางแก้ (ต้องอนุมัติ เพราะแตะ UI): แยก outer card เป็น section/div ธรรมดา หรือ flatten เป็น list ของ card ที่มี divider

## 4. ยังไม่ได้ตรวจ

- Tile pattern (`.cmms-tile`?) —  grep ไม่พบ class tile ในโค้ด; ถ้ามี tile ที่ซ้อนกันต้องตรวจด้วยมือ
- card-in-card ที่สร้างด้วย `div` ที่มี border/shadow แทน `<Card>` (ไม่นับในรอบนี้)
EOF
echo written
# DESIGN TOKENS — CMMS-TOPT

> อ้างอิงจากโค้ดจริง: `frontend/app/globals.css` (ชั้น `v3 TOKEN LAYER` ท้ายไฟล์ เป็นค่าที่ชนะ cascade)
> เอกสารนี้คือ "ค่าจริงที่เบราว์เซอร์ใช้" — `docs/DESIGN_SYSTEM.md` คือเหตุผล/หลักการ

## 1. ชั้นของ token (สำคัญก่อนอ่านค่า)

`globals.css` มี token สองชุดที่ชื่อต่างกันแต่ทำงานคู่กัน:

| ชั้น | ชื่อ | ที่มา |
|---|---|---|
| shadcn/Tailwind | `--background`, `--card`, `--primary`, `--muted-foreground`, … (ใช้ผ่าน `bg-card`, `text-muted-foreground`) | `@theme` + `:root` ท้ายไฟล์ |
| CMMS เดิม | `--cmms-*` (ใช้ผ่าน `var(--cmms-…)`) | บล็อก legacy + บล็อก "refreshed" ท้ายไฟล์ |

> **บทเรียนจาก D3.6:** `--cmms-text-muted` ถูกประกาศซ้ำ 3 ครั้งในไฟล์ (บรรทัด ~241, ~255, ~2976) ค่าที่ชนะคือตัวสุดท้าย — เวลาแก้ token ให้แก้ **ตัวสุดท้าย** และตรวจด้วย `getComputedStyle(document.documentElement).getPropertyValue("--cmms-text-muted")`

## 2. สีพื้นผิว / ข้อความ / เส้นขอบ

| Token | ค่า | ใช้ที่ |
|---|---|---|
| `--background` / `--cmms-bg-page` | `#f4f5f7` / `#f6f8fb` | พื้นหลังหน้า |
| `--card` / `--cmms-bg-card` | `#ffffff` | การ์ด, popover |
| `--popover` | `#ffffff` | dropdown/popover |
| `--foreground` / `--cmms-text-primary` | `#18181b` / `#1c2536` | ข้อความหลัก |
| `--muted-foreground` | `#475569` | คำอธิบาย, label (ใช้ `text-muted-foreground`) |
| `--cmms-text-secondary` | `#475569` | ข้อความรอง |
| `--cmms-text-muted` | **`#5b6b80`** | meta/ข้อความจาง — ปรับใน D3.6 จาก `#64748b` เพราะ 4.43:1 ไม่ผ่าน AA |
| `--muted` / `--cmms-bg-muted` / `--cmms-bg-wash` | `#eff3f8` | พื้นอ่อน, ปุ่ม secondary |
| `--secondary` | `#eff3f8` | ปุ่ม secondary |
| `--accent` | `#e8f0f9` | hover wash (อมฟ้า) |
| `--border` / `--cmms-border` | `#e6ebf2` | เส้นขอบปกติ |
| `--cmms-border-hover` | `#cbd5e1` | ขอบตอน hover |
| `--input` | `#d0d9e4` | ขอบ input |
| `--ring` / `--cmms-border-focus` | `#0068b5` | focus ring |

## 3. สีแบรนด์และสถานะ

| Token | ค่า | ใช้ที่ |
|---|---|---|
| `--primary` / `--cmms-primary` | `#0068b5` (TOPPAN Blue) | ปุ่มหลัก, active nav, focus |
| `--primary-foreground` | `#ffffff` | ข้อความบนปุ่มหลัก |
| `--cmms-primary-hover` | `#005fa3` | hover/ข้อความ primary บนพื้นอ่อน |
| `--cmms-primary-light` | `rgba(0,104,181,0.08)` | พื้น badge primary, แถวที่เลือก |
| `--success` / `--cmms-success` | `#16a34a` | ไอคอน/จุดสถานะ |
| `--cmms-success-light` | `#dcfce7` | พื้น badge success |
| `--cmms-success-dark` | `#15803d` | **ข้อความ**บนพื้น success (ผ่าน AA) |
| `--warning` / `--cmms-warning` | `#d97706` | เตือน |
| `--cmms-warning-light` / `--cmms-warning-dark` | `#fef3c7` / `#b45309` | พื้น / ข้อความ |
| `--destructive` / `--cmms-danger` | `#dc2626` | อันตราย, เกินกำหนด |
| `--cmms-danger-light` / `--cmms-danger-dark` | `#fee2e2` / `#b91c1c` | พื้น / ข้อความ (ใช้ `#b91c1c` เมื่อเป็นตัวอักษร) |
| `--info` / `--cmms-info` | `#0284c7` | ข้อมูล |
| `--cmms-info-light` | `#e0f2fe` | พื้น badge info |

**กฎการจับคู่สีสถานะ (ผ่าน axe แล้วที่ 1440/768/390):** พื้นอ่อน + ข้อความเข้มเสมอ (`*-light` + `*-dark`) — ห้ามใช้สี `*-success`/`*-danger` เป็นสีตัวอักษรบนพื้นอ่อนโดยตรง เพราะจะตกเกณฑ์ 4.5:1

## 4. รัศมี / เงา / การเคลื่อนไหว

| Token | ค่า |
|---|---|
| `--radius` | `0.75rem` (การ์ด `rounded-xl`) |
| `--cmms-radius-sm` | `8px` |
| `--cmms-radius` | `10px` (ปุ่ม/อินพุต) |
| `--cmms-radius-lg` | `14px` |
| `--cmms-radius-xl` | `18px` |
| `--cmms-shadow-sm` | `0 1px 2px rgba(15,35,75,.05)` |
| `--cmms-shadow` | `0 1px 3px rgba(15,35,75,.06), 0 1px 2px rgba(15,35,75,.04)` |
| `--cmms-shadow-md` | `0 4px 12px -2px rgba(15,35,75,.08), 0 2px 4px -1px rgba(15,35,75,.05)` |
| `--cmms-shadow-lg` | `0 12px 20px -6px rgba(15,35,75,.10), 0 4px 8px -4px rgba(15,35,75,.05)` |
| `--cmms-shadow-focus` | `0 0 0 3px rgba(0,104,181,.18)` |
| `--cmms-transition` / `--cmms-transition-fast` | ใช้กับ `transition` ของปุ่ม/ลิงก์ (ค่าอยู่ในบล็อก legacy) |
| แอนิเมชัน dialog/sheet | `cmmsFadeIn 150ms`, `cmmsPopIn 160ms` (ease-out), ปิด 140ms |

## 5. ระยะ/ขนาดที่ใช้ซ้ำ (ไม่มี token — ใช้ Tailwind)

| งาน | คลาส |
|---|---|
| ระยะระหว่างบล็อกในหน้า | `space-y-6` |
| ระยะในการ์ด | `p-5` (ปกติ), `p-6` (การ์ดหลักของหน้า) |
| กริด summary แน่น | `gap-2` / `gap-3` |
| ความสูงปุ่ม/อินพุต | `h-10` (md), `h-8` (sm), `h-12` (lg) |
| Hit area การใช้งานถุงมือ | ปุ่ม `sm`/`icon-xs` ขยาย hit เป็น ≥48px ด้วย pseudo-element (`after:-inset-2`) |

## 6. ข้อจำกัดที่ต้องรู้

- **ยังไม่มี dark theme ในสไตล์ชีตนี้** — `globals.css` ไม่มี `html.dark` / `[data-theme]` / `prefers-color-scheme` เลย (ตรวจ 2026-11-23) แม้ `DESIGN_SYSTEM.md` §2.2 จะระบุค่าธีมมืดไว้ → ต้องทำให้ตรงกันใน Phase 3 (และเป็นเหตุผลที่ contrast โหมดมืดยังวัดไม่ได้)
- Token ชุด `--tp-*` ใน `design-system/tokens.css` เป็นแหล่งแบรนด์ดิบ ไม่ควรเรียกใช้ตรงจากหน้า
- ชื่อ `--cmms-*` ถูกรักษาไว้เพื่อความเข้ากันได้ของ CSS เดิม — ห้ามลบ ให้เปลี่ยนค่าเท่านั้น

## 7. วิธีตรวจค่าเร็ว ๆ

```js
// ในเบราว์เซอร์ (DevTools console)
getComputedStyle(document.documentElement).getPropertyValue("--cmms-text-muted").trim()
```

```bash
# ตรวจว่า token ถูกประกาศซ้ำที่บรรทัดไหน (ค่าที่ชนะ = ตัวสุดท้าย)
cd frontend && grep -n "cmms-text-muted:" app/globals.css
```

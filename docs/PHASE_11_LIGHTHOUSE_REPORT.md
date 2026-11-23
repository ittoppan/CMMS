# Phase 11/10 — Lighthouse audit (Performance / Accessibility / Best Practices / SEO)

> วันที่: 2026-11-23 · Lighthouse **12.8.2** (`npx lighthouse@12`) · Chrome จาก Playwright (`chromium-1234`) headless
> target: `http://localhost:3001` · ค่าเริ่มต้นของ Lighthouse = **mobile emulation**
> session: login ด้วย role 5 (Viewer) แล้วส่ง `Cookie` ผ่าน `--extra-headers` สำหรับหน้าที่ต้องล็อกอิน
> ⚠️ วัดบน **build 22 พ.ย.** (R9-9) — ค่าต้องวัดซ้ำหลัง rebuild; เป็นการรันครั้งเดียว (ไม่ใช่ median)

## 1. คะแนน

| หน้า | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| `/login` (ไม่ล็อกอิน) | **70** | 96 | 96 | 100 |
| `/dashboard` | **63** | 96 | 96 | 100 |
| `/reports` | **66** | 92 | 96 | 100 |

## 2. Metrics

| หน้า | FCP | LCP | TBT | CLS | Speed Index | TTI |
|---|---|---|---|---|---|---|
| `/login` | 3.1 s | **7.2 s** | 30 ms | 0 | 3.1 s | 7.3 s |
| `/dashboard` | 3.7 s | **10.2 s** | 200 ms | 0.001 | 3.7 s | 11.7 s |
| `/reports` | 3.1 s | **9.7 s** | 200 ms | 0 | 3.1 s | 11.3 s |

- LCP 7–10 วินาที คือตัวฉุดคะแนนหลัก (ทุกหน้าได้ ❌ ที่ `largest-contentful-paint`, `first-contentful-paint`, `speed-index`, `interactive`)
- CLS ~0 ทุกหน้า → ไม่มี layout shift
- element ที่เป็น LCP: `/dashboard` = `<h1 class="max-w-3xl …">` (ข้อความหัวเพจ), `/reports` = `<span>` คำอธิบาย hero → เป็น **ข้อความที่รอ JS/hydration** ไม่ใช่ภาพ

## 3. ขนาด/จำนวน request

| หน้า | requests | transfer |
|---|---|---|
| `/login` | 32 | **2,114,826 B (~2.1 MB)** |
| `/dashboard` | 91 | 1,582,865 B (~1.5 MB) |
| `/reports` | 78 | 1,567,514 B (~1.5 MB) |

- JS ที่โหลดแล้วไม่ถูกใช้: `/dashboard` **359 KiB**, `/reports` **341 KiB**
- render-blocking: 0 ms ทั้งสองหน้า
- หน้า `/login` โหลด 2.1 MB ทั้งที่ไม่มีข้อมูล — หนักกว่าหน้าที่มีข้อมูลจริง

## 4. Finding

### L11-1 (MEDIUM) — ทุกหน้าใน dashboard ยิง `/api/v1/settings.php` แล้วได้ **403** สำหรับ Viewer

| หน้า | console error |
|---|---|
| `/dashboard` | 1 → `403 /api/v1/settings.php` |
| `/reports` | 1 → `403 /api/v1/settings.php` |
| `/login` | 0 |

สาเหตุ: `components/ThemeProvider.tsx:177` เรียก `fetch("/api/v1/settings.php")` ทุกครั้งที่ mount (ทุกหน้า) แต่ `public/api/v1/settings.php:40,65` บังคับ `settings:view` → role 5 ไม่มีสิทธิ์
ผลกระทบ: (1) console error ทุกหน้า (ต่อยอด F5-1) (2) Viewer ไม่ได้รับ theme/design จาก settings เลย ใช้ preset `toppan` ตลอด (โค็ด `if (!Array.isArray(json)) return;` กัน crash ไว้แล้ว จึงไม่พังหน้า)
ทางแก้ที่ต้องอนุมัติ: ให้ `settings.php` เปิดอ่านเฉพาะ key ที่ไม่ลับ (theme_preset/theme_primary_hex/theme_secondary_hex/design_*/anim_*) สำหรับผู้ใช้ที่ล็อกอินทุกคน **หรือ** ให้ ThemeProvider ข้ามการเรียกเมื่อไม่มีสิทธิ์

### L11-2 (LOW) — Lighthouse 12 ไม่มีหมวด PWA แล้ว

`--only-categories=pwa` ใช้ไม่ได้ใน Lighthouse 12 (หมวด PWA ถูกถอดออกตั้งแต่ v12) → ข้อ `[ ] Lighthouse PWA` ใน Phase 10 **วัดด้วย Lighthouse ไม่ได้อีกต่อไป** ต้องใช้การตรวจ manifest + service worker + offline (ซึ่งทำเสร็จแล้วใน `PHASE_10_TECHNICIAN_MOBILE_REPORT.md`)

## 5. สอดคล้องกับ axe (หลักฐานสองทาง)

- `/reports` a11y 92 = หน้าที่ย่ำแย่ที่สุด — ตรงกับ `PHASE_11_AXE_AUDIT.md` ที่ `/reports` มี contrast 5 node (มากสุด)
- `/login` a11y 96 แต่ axe เจอ `color-contrast` 1 node (ปุ่ม LINE 2.25) — Lighthouse จับไม่ครบทุก node
- Lighthouse ไม่เจอ `aria-valid-attr-value` ของ `/notifications` (ไม่ได้สแกนหน้านั้นในรอบนี้)

## 6. สิ่งที่ยังไม่ได้วัด

- Performance บน build ที่ rebuild แล้ว (R9-9) และบนเครื่อง/เน็ตเวิร์กอื่น
- หน้า authenticated อีก 6+ หน้าที่ role 5 ไม่มีสิทธิ์
- desktop preset (`--preset=desktop`) — รอบนี้เป็น mobile เท่านั้น
- median ของ 3 รอบ (ตอนนี้ 1 รอบ)

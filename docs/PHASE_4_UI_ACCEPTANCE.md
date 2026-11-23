# Phase 4 — UI Acceptance (last-updated / drill-down / TBT)

> วัด 2026-11-23 · production build (`NEXT_DIST_DIR=.next-verify`) เสิร์ฟที่ `:3003` · บัญชี `e2e_bot` · DB `cmms_tpt`
> บันทึกนี้ตอบเฉพาะข้อที่ยังไม่มีหลักฐานใน Phase 4 — ไม่ได้แก้สูตร KPI (ดู `PHASE_4_KPI_VALIDATION_REPORT.md`)

---

## 1. last-updated

| หน้าจอ | แสดงอะไร | ที่มา |
|---|---|---|
| `/dashboard/wallboard` | `เชื่อมต่อแล้ว · รีเฟรช HH:MM · ข้อมูล ณ HH:MM` | `รีเฟรช` = เวลาที่โหลดสำเร็จฝั่ง client (`lastOk`); `ข้อมูล ณ` = `overview.last_updated` จาก server (**เพิ่มในรอบนี้**) |
| `/supervisor` | `อัปเดตเมื่อ HH:MM · วันที่` | `lastUpdated` ของหน้า (มีอยู่เดิม) |

**หลักฐาน:** Playwright เปิดหน้า wallboard ด้วยบัญชีจริงแล้วอ่าน `innerText` → `hasServerStamp = true`, `hasRefreshStamp = true`
(ก่อนรอบนี้มีแต่เวลารีเฟรชฝั่ง client ทำให้แยกไม่ออกว่าข้อมูลจาก API เก่ากี่นาที)

## 2. drill-down (ลิงก์จากการ์ด → รายการที่กรองแล้ว)

| ต้นทาง | ปลายทาง | ปลายทางรองรับจริงหรือไม่ |
|---|---|---|
| wallboard — Total Work Orders | `/repair` | ใช่ (รายการงานทั้งหมด) |
| wallboard — Completed | `/repair?status=completed` | ใช่ |
| wallboard — In Progress | `/repair?status=in_progress` | ใช่ |
| wallboard — Overdue | `/repair?status=overdue` | ใช่ — `repair/page.tsx` แปลง `overdue` เป็นตัวกรองงานค้างเกินกำหนด (`:86, :330`) |
| wallboard — แผง SLA ตามระดับความสำคัญ | `/repair?priority=X&status=overdue` และ `status=sla_risk` | ใช่ — รองรับ `sla_risk` (`repair/page.tsx:340`) |
| supervisor — 6 การ์ด KPI | `/supervisor/queue?g=all\|active\|waiting\|overdue\|pending_verification\|verified` | ใช่ — `kpi_wo_list()` มี case ครบ (เพิ่ม `verified` ใน `f86634f6`) |
| supervisor — การ์ด attention | `/supervisor/queue?g=unassigned\|pending_approval` + `/repair/view?id=` | ใช่ |

**ตรวจแล้ว:** อ่านโค้ดฝั่งปลายทางยืนยันว่า query ที่ลิงก์ส่งไปถูกแปลงเป็นตัวกรองจริง
**ยังไม่ได้ตรวจ:** การกดลิงก์ทีละตัวบนเบราว์เซอร์

## 3. INSUFFICIENT DATA

- wallboard: 19 จุดใช้ `<Na>` ครอบ panel (MTBF, OEE, downtime, spare, plant map, PM ฯลฯ) และ KPI tile แสดง `—` / `N/A` เมื่อ `core` เป็น null — ไม่พบการ์ดที่แสดง `0` แทน "ไม่มีข้อมูล" ในรอบที่ตรวจ KPI (§9–§10)
- **สถานะ: PARTIAL** — ยังไม่ได้ไล่ตรวจทีละการ์ดครบทุกใบ (ที่เหลือ: dashboard ตามบทบาท, supervisor, analytics)

## 4. TBT (Total Blocking Time)

**วิธีวัด:** Playwright + Desktop Chrome → login → ไป `/dashboard/wallboard` → `PerformanceObserver({entryTypes:['longtask']})` ตั้งแต่ init script → รอ `.tower-header` visible แล้วรออีก 6 วินาที
`TBT = Σ max(0, duration − 50ms)` · ตัวแปรที่ throttle: CDP `Emulation.setCPUThrottlingRate(4)`

| โปรไฟล์ | จำนวนรอบ | TBT | long tasks | task ยาวสุด | FCP | load |
|---|---|---|---|---|---|---|
| desktop (ไม่ throttle) | 2 | **0 ms** | 0 | 0 ms | 100 ms | 157–161 ms |
| CPU 4× (ตัวแทนแท็บเล็ต/เครื่องสเปกต่ำ) | 3 | **379 / 531 / 512 ms** (median **512**) | 5–6 | 190–204 ms | 324–356 ms | 480–488 ms |

DOM 878 โหนด, ไม่มี request ที่ error (`PROBE_FAILURES = []`)

### 4.1 รอบละเอียด — long task เกิดตอนไหน

วัดซ้ำด้วยการบันทึกทุก long task เทียบ FCP (CPU 4×, 3 รอบ):

| รอบ | FCP | TBT รวม | TBT ในหน้าต่าง FCP→+5s | TBT ก่อน load event | long tasks (start ms → dur ms) |
|---|---|---|---|---|---|
| 1 | 336 | 367 | **367** | 0 | 482→171, 751→190, 1219→51, 1337→56, 1782→149 |
| 2 | 268 | 375 | **375** | 0 | 462→167, 722→189, 1297→61, 1755→158 |
| 3 | 220 | 372 | **372** | 0 | 490→167, 728→194, 1181→50, 1324→60, 1733→151 |

อ่านผล: **ไม่มี long task ก่อน `load` เลย (0 ms)** — คอขวดอยู่หลังโหลดแล้ว:
- ~360 ms จาก 2 task แรก (467–751 ms) = hydration + เรนเดอร์ panel/กราฟชุดแรก
- ~90–110 ms จาก task ที่ 1.2–1.8 วินาที = งานโหลดข้อมูลรอง (12 เดือน, plant map, spare, MTBF) ที่ defer ไว้แล้ว

### 4.2 ลองแยกกราฟเป็น lazy chunk — **ไม่ได้ผล (ย้อนกลับแล้ว)**

**ที่ทำ:** แยก JSX ของกราฟทั้ง 4 ชนิด (5 ตัวบนจอ) ออกเป็น `components/wallboard/charts.tsx`
แล้ว import ด้วย `next/dynamic(..., { ssr: false })` เพื่อให้ Recharts หลุดจาก chunk แรก

| build | รอบ | TBT (FCP→+5s, CPU 4×) | `charts_rendered` |
|---|---|---|---|
| ก่อนแยก (§4.1) | 3 | 367 / 375 / 372 | ไม่ได้นับ |
| หลังแยก lazy chunk | 3 | **481 / 334 / 418** | **0** |
| หลังย้อนกลับ | 2 | **504 / 366** | **0** |

**ผล:** ไม่ดีขึ้น (ช่วงทับกับ baseline) และ **กราฟไม่ mount เลย** ทั้ง build ก่อนและหลังแยก
สาเหตุคือ `IdleChart` (IntersectionObserver, `page.tsx`) จะ render children เมื่อ panel อยู่ในระยะ intersect เท่านั้น —
ใน viewport 1280×720 ของ layout wallboard ที่ถูก clip ด้วย `overflow-hidden` panel กราฟอยู่นอกพื้นที่จึงไม่เคย intersect
→ Recharts ไม่เคยอยู่ใน blocking window ตั้งแต่ต้น การย้ายมันออกจาก chunk แรกจึงไม่มีผลกับ TBT

**การย้อนกลับ:** `git checkout` หน้าหลัก + ลบ `components/wallboard/` — `tsc --noEmit` ผ่าน, production build ผ่าน,
วัดซ้ำได้ 504/366 ms (ช่วงเดิม) ไม่มีไฟล์ค้างใน working tree

**ข้อสังเกตที่ต้องตัดสินใจ (ยังไม่แก้):** บน build เก่าที่ `:3001` กราฟ mount ครบ 5/5 (`recharts-surface = 5`)
แต่บน source ปัจจุบันกราฟไม่ mount ถ้า panel ไม่ intersect — ถ้าจอจริงอยู่ในสภาพเดียวกันจะเห็นกราฟว่างตลอด
ควรเพิ่ม fallback/timeout ให้ `IdleChart` (เช่น force render หลัง 1.5 วิ แม้ยังไม่ intersect)

**ทางลด TBT ที่เหลือ:** ~360 ms มาจาก hydration ของหน้า (878 โหนด, panel 10 ใบ) ไม่ใช่กราฟ
และ ~90–110 ms มาจากชุด fetch รองที่ defer อยู่แล้ว → แนวทางถัดไปคือลดจำนวน node/panel ที่ hydrate รอบแรก

**สรุป:** เป้า TBT < 300 ms **ผ่านบน desktop (0 ms)**

### 4.3 แก้ bug: กราฟ wallboard ไม่เคยถูกวาดจริง + TBT ที่วัดได้จริง

**อาการ:** `.recharts-surface` = **0** ทุก build ของ source ปัจจุบัน (ทั้งก่อน/หลังทดลอง lazy chunk) ขณะที่ build เก่าที่ `:3001` ได้ 5/5
→ ตัวเลข TBT 367–375 ms ใน §4.1 วัดจากหน้า **ที่ไม่มีกราฟเลย** จึงใช้เป็น baseline ไม่ได้

**สาเหตุ 2 ชั้น (`page.tsx`, `IdleChart`)**
1. render children เมื่อ panel intersect เท่านั้น — ใน layout ที่ clip ด้วย `overflow-hidden` panel กราฟไม่ intersect จึงไม่เคย mount
2. div ครอบมีแค่ `style={{ minHeight: 120 }}` ไม่มี height จริง → `ResponsiveContainer height="100%"` วัดได้ **0px** → Recharts ไม่วาด

**ที่แก้**
- เพิ่ม timeout fallback 1.5 วิ (และ `IntersectionObserver` ไม่มี → render ทันที)
- เปลี่ยน div ครอบเป็น `className="h-full w-full"` คง `minHeight: 120` → ได้ความสูงจริงจาก flex parent (168px)

**ผลหลังแก้** — วัดที่ production build :3003 (CPU 4×, FCP→+5s)

| รอบ | TBT | long task หลัก | กราฟ | DOM nodes |
|---|---|---|---|---|
| 1 | **1,084 ms** | 392 ms (chart mount) + 291 ms | 5/5 | 1,289 |
| 2 | **1,255 ms** | 411 ms + 333 ms | 5/5 | 1,289 |
| 3 | **1,060 ms** | 404 ms + 299 ms | 5/5 | 1,289 |

ตรวจภาพด้วยตาแล้ว: `docs/wallboard-after-idlechart-fix.png` (monthly bar+line, donut Asset Health 100%, donut Work Orders 105, MTBF/MTTR, Top 5 Downtime — ครบ ไม่เพี้ยน)

**สรุป:** เป้า TBT < 300 ms **ยังไม่ผ่าน** เมื่อกราฟแสดงจริง (median **1,084 ms**)
ภาระหลัก = การ mount กราฟ Recharts 5 ตัว (~400 ms + ~300 ms ในหน้าต่างวัด) ไม่ใช่ hydration ของ panel
แนวทางถัดไป: แยก Recharts เป็น chunk (`next/dynamic`) **และ** mount กราฟทีละตัวผ่าน `requestIdleCallback`/staggered delay แล้ววัดซ้ำด้วย baseline ใหม่นี้

### 4.4 แยก Recharts เป็น lazy chunk + เกลี่ยการ mount (stagger) — **ภายหลังวัดซ้ำ 5+5 รอบแล้ว stagger ไม่ได้ผล (ดู §4.5)**

**ที่ทำ**
- ย้าย leaf component ของกราฟ 4 ชนิดไป `components/wallboard/charts.tsx` แล้วโหลดด้วย `next/dynamic(ssr:false)` → Recharts หลุดจาก chunk แรก
- `IdleChart` รับ prop `delay` เพิ่ม: monthly 0, asset donut 200, status donut 400, MTBF 600, downtime 800 ms (เริ่มนับหลัง intersect หรือหลัง fallback 1.5 วิ)

| build | รอบ | TBT (FCP→+5s) | long task ≥100 ms | กราฟ |
|---|---|---|---|---|
| §4.3 inline (baseline) | 3 | 1,084 / 1,255 / 1,060 (median **1,084**) | 392–411, 291–333 | 5/5 |
| §4.4 lazy + stagger | 3 | **1,038 / 1,016 / 1,145** (median **1,038**) | สูงสุด **314** (ก้อนใหญ่สุดหายไป) | 5/5 |

- TBT median ดีขึ้น **46 ms (~4%)**, long task ก้อนใหญ่สุดลดจาก **411 → 314 ms** แต่จำนวน task 120–225 ms เพิ่มขึ้น (งานเท่าเดิม แค่ถูกแบ่ง) → TBT รวมจึงแทบไม่ขยับ เพราะ TBT บวกส่วนเกิน 50 ms ของทุก task
- DOM 1,290 โหนด, load event 396–481 ms, ไม่มี console/network error, ภาพตรงกับของเดิม (`docs/wallboard-lazy-charts.png`)

**สรุป:** เป้า TBT < 300 ms **ยังไม่ผ่าน** (median 1,038 ms) — พื้นของงานคือการ mount กราฟ Recharts 5 ตัวจริง ๆ (~600–700 ms ที่ CPU 4×) การเกลี่ยช่วยลด long task ก้อนใหญ่สุดได้ แต่ไม่ลดภาระรวม
**ทางที่จะแตะ 300 ms ได้จริง:** ลดจำนวน/ความซับซ้อนของกราฟที่ render รอบแรก (เช่น แสดงเฉพาะกราฟหลัก 1–2 ตัว แล้วให้ผู้ใช้กดดูที่เหลือ), หรือวาดกราฟด้วย SVG/CSS เบา ๆ แทน Recharts ในหน้า wallboard — ทั้งสองทางเป็นการเปลี่ยนรูปลักษณ์/สเปก ต้องให้เจ้าของระบบอนุมัติก่อน

### 4.5 วัดซ้ำ 5+5 รอบ: **stagger ไม่ผ่านการยืนยัน → ตัดออก**

| แบบ | 5 รอบ | median | ช่วง | long task สูงสุด (median) |
|---|---|---|---|---|
| **A** lazy chunk ล้วน | 1,024 / 1,035 / 1,030 / 974 / 997 | **1,024** | 974–1,035 (61) | 360 ms |
| **B** lazy chunk + stagger 200/400/600/800 | 1,125 / 1,052 / 999 / 1,233 / 942 | **1,052** | 942–1,233 (291) | 301 ms |

- stagger **ไม่ได้ลด TBT** (median แย่กว่า 28 ms, ช่วงกระจายกว้างขึ้น ~5 เท่า) — ผลเดียวที่ชัดคือ long task ก้อนใหญ่สุดเล็กลง (360 → 301 ms) แต่ TBT รวมไม่ลด
- **ตัด `delay`/stagger ออกแล้ว** เหลือ lazy chunk อย่างเดียว: กราฟ 5/5, `tsc` + production build ผ่าน, ภาพตรงกับของเดิม (`docs/wallboard-lazy-only.png`)
- ต้นทุนที่ใช้คำนวณข้อเสนอ: hydration ≈ **370 ms** + การ mount กราฟ Recharts ≈ **650 ms**
- ข้อเสนอทางเลือกเพื่อไปให้ถึง < 300 ms (3 ทาง + สิ่งที่ขออนุมัติ): **`docs/PHASE_4_TBT_OPTIONS.md`** แต่ **ไม่ผ่านเมื่อ throttle CPU 4×** — วัดในหน้าต่างมาตรฐาน (FCP→+5s) ได้ **367 / 375 / 372 ms** (median 372) และ **ไม่มี long task ก่อน load event** แปลว่าต้องลดงาน hydration/เรนเดอร์กราฟชุดแรก (~360 ms) ไม่ใช่ลดงานโหลดข้อมูล

## 5. Acceptance

| รายการ | ผล |
|---|---|
| last-updated (มีเวลาข้อมูลจาก server) | **PASS** |
| drill-down ครบทุกการ์ด KPI | **PASS (ตรวจจากโค้ดปลายทาง)** |
| INSUFFICIENT DATA ครบทุกการ์ด | **PARTIAL** |
| TBT < 300 ms | **PASS desktop / FAIL ที่ CPU 4×** |
| Phase 4 COMPLETE | **ยังไม่** — เหลือ audit INSUFFICIENT DATA ให้ครบ + ลด TBT ใต้ 300 ms เมื่อ throttle |

## 6. ข้อจำกัด

- วัดเฉพาะ `/dashboard/wallboard` — ไม่ได้วัด dashboard ตามบทบาท, `/supervisor`, และจอ 390/768
- ไม่ได้ throttle network — Lighthouse mobile (Slow 4G) จะได้ค่าสูงกว่าตารางนี้
- ข้อมูลเป็นชุด dev (`repair` 105 ใบ, `pm_am` 3 แถว seed) — ตัวเลข performance ไม่ขึ้นกับจำนวนแถวมากนัก แต่ DOM/กราฟผูกกับข้อมูลที่มี
- สคริปต์วัดเป็นไฟล์ชั่วคราว (ไม่ commit): สเปก Playwright ที่ login ด้วย `.e2e-auth.json`, CDP throttle 4×, longtask observer ตามวิธีข้างบน

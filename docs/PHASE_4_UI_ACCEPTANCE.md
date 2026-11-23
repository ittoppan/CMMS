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

**สรุป:** เป้า TBT < 300 ms **ผ่านบน desktop (0 ms)** แต่ **ไม่ผ่านเมื่อ throttle CPU 4×** — วัดในหน้าต่างมาตรฐาน (FCP→+5s) ได้ **367 / 375 / 372 ms** (median 372) และ **ไม่มี long task ก่อน load event** แปลว่าต้องลดงาน hydration/เรนเดอร์กราฟชุดแรก (~360 ms) ไม่ใช่ลดงานโหลดข้อมูล

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

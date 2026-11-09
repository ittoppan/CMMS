# Performance Monitoring — CMMS-TOPPAN

> Phase 22 (§9 — ปรับปรุงย่อส่วนจาก PERFORMANCE_BASELINE.md ที่ยังใช้ได้) · วิธีวัด, baseline ปัจจุบัน, สิ่งที่ต้องทำเมื่อโต

## 1. มุมที่ทำได้จริงวันนี้ (ทุก Host เดียวกัน)

| ชั้น | วัดอะไร | ยังไง |
|---|---|---|
| API | latency ต่อ endpoint | `timing_ms` ในทุก response (เช่น health ~9–39 ms, ครั้งล่าสุด ~22 ms) |
| DB | connection ping | health `db_ping` (0.2–0.3 ms — MySQL เดียวกับ host) · log slow query (>500ms) |
| Frontend | waktu render / bundle | Next production build metrics; บันทึกใน CI build log |
| Storage/OS | disk, php-error.log ขนาด | health dashboard (ดู `PRODUCTION_MONITORING.md`) |
| Sage integration | latency ต่อ query | log ฝั่ง Sage service (`Sage300Service`) — probe จริงบนหน้า health |

`PERFORMANCE_BASELINE.md` (จาก Phase 18/20) ยังเป็นแหล่งอ้างอิงของการ benchmark ราย endpoint และวิธี build; ตัวเลขบนเครื่อง dev เดิมอาจไม่ใช่บนเครื่อง prod เดียวนี้ — ไม่ยกไปอ้างเป็นสัญญา SLO

## 2. Baseline จริง ณ 2026-09-17 (จากเครื่อง prod ปัจจุบัน)

- DB ping: 0.2–0.3 ms (local socket/localhost)
- system_health ทั้งหน้าชุด: 9.2–38.8 ms (median ~22 ms)
- Production Next.js standalone build: boot ✓, SSR หน้าแรกเร็วระดับ ms (หลัง build ไม่มี client waterfall ผิดปกติ)
- ขนาดข้อมูล: 110 ตาราง; อะไหล่ 1,870 รายการ (Sage); งานซ่อม 102 แถว; ยังเล็กมาก ยังวัด scaling ไม่ได้
- php-error.log: เริ่มเกลี้ยง (bytes ~10KB → truncate หลัง config แก้ถูกที่)

> แจ้งเตือน: "Sage 300 : CMMS เป็น read snapshot" latency เฉลี่ยการ query ยังไม่เก็บเป็น series — เริ่มเก็บได้ที่ backlog

## 3. สิ่งที่ทำให้เร็วขึ้นแล้ว (ไม่แต่งตัวเลข)

- `SET time_zone='+07:00'` + `date.timezone=Asia/Bangkok` — ผลข้างเคียง: ลบเวลา run ที่ mismatch (ต้นตอเส้นข้อมูลปั่นในอดีต)
- แก้ `display_errors=Off` + fastcgi log → error ไม่ดังเปรี้ยงใส่หน้า 500
- System_health รวม query มาไว้ endpoint เดียว (ลด roundtrip ของ dashboard)
- PWA/SyncEngine (Phase 19) ทำให้ offline replay ไม่ทะลุ API

## 4. Threshold ที่ควรใช้ตอนนี้ (ยังไม่ใช่กฎเหล็ก)

| Metric | จุดเหลือง | จุดแดง | ทำ |
|---|---|---|---|
| db_ping | > 5 ms | > 50 ms | ดู slow query / locks |
| system_health timing | > 300 ms | > 1000 ms | ตรวจ query กลุ่มที่ช้า (notification/audit) |
| disk_free | < 5% | < 2% | คืนพื้นที่ (backup/error-log/upload) |
| php-error.log โต > 10MB/วัน | เฝ้า | ดู src ของ error ก่อน |

## 5. สิ่งที่ยังไม่ตั้ง (ทำเมื่อมีข้อมูลจริง/ผู้ใช้จริง)

- APM ภายนอก (เช่น PHP profiler / uptime bot) — ตอนนี้ยัง overkill
- Cache layer (Redis) — ยังไม่จำเป็นจนกว่า concurrent user > 20
- SLO/SLA อย่างเป็นทางการ (ต้องมีข้อมูลวัดหลัง production จริง ≥ 2 สัปดาห์ก่อนตั้ง)
- Load test ในสภาพการใช้งานจริง (มี seed เบา ยังไม่อันตราย; ทำก่อนเปิด wide ได้ใน backlog I-07)

## 6. วิธี rerun baseline

```powershell
# รันที่เครื่อง Web (IIS 8081)
Invoke-RestMethod -Method GET http://localhost:8081/api/v1/system_health.php -Headers @{Authorization="Bearer ..."}
# ดู timing_ms; ค่า db_ping; แล้วเทียบกับบนสุดของ docs นี้
```

(หรือดูหน้า `/settings/health` — มี `timing_ms` แสดง)
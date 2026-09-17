# Changelog — CMMS-TOPPAN

รูปแบบ: [Keep a Changelog](https://keepachangelog.com/) · ตัวเลขเวอร์ชันตรงกับ `frontend/package.json` (ตอนนี้ `1.0.0`) และ tag ใน git (เช่น `v1.0.0`)

## [Unreleased]
- (ว่าง — อยู่ระหว่างการเก็บฟีเจอร์ของ Phase 21 จนกว่าจะตัดสินใจเปิดถัดไป ซึ่งต้องทำเป็น controlled release)

## [1.0.0] — 2026-09-17 — RELEASE CANDIDATE (Go-Live)

Commit: `bf0a0f0` (Phase 20) · ตัวเลข build `hdZW7CLyR4LnpYB9mnGoT`
DB migration เวอร์ชัน: schema อยู่ในสถานะ 110 ตาราง — การ migration ตัวสุดท้ายที่ใช้ = `migration_20260916_phase19_pwa_offline.sql` (ไม่มี migration ใหม่ใน Phase 21/20)

### สรุปความพร้อม (เอกสาร/เกต)
- QA: `docs/QA_MATRIX.md`, `docs/FINAL_QA_REPORT.md` (ความเห็น GO) — เกตทุกตัวผ่าน 0 fail
- ครอบคลุม phase: API, PDF, รายงาน (Phase 17), Security/audit (Phase 18), PWA offline/sync (Phase 19), เตรียมพร้อม production (Phase 20)
- Segment: **RELEASE CANDIDATE** — ยังมี GO-LIVE BLOCKER ด้าน TLS/HTTPS สำหรับอุปกรณ์จริง (ดู `docs/GO_LIVE_PLAN.md` §3)

### เด่นๆ จำแนกตาม phase
- **Phase 20 (QA/Hardening):** ปิดช่องโหว่ `repair_options.php` (เขียนได้แบบไม่ login), `api_safe_catch()` ทุก catch, ยกระดับ 14 endpoint weak-auth → 401 มาตรฐาน, `/health`, `settings` public-GET เฉพาะคีย์ธีม, แก้ hydration #418/CSP font/PWA push, แก้ timezone root cause (`SET time_zone='+07:00'` + `date.timezone=Asia/Bangkok`), `report-chart` dynamic import, sw.js v38, `scripts/phase20_qa.php` 50/50
- **Phase 19 (PWA):** SyncEngine idempotent (IndexedDB queue/cache/attachments) + offline photos + `/sync-center` UI + `base_updated_at` optimistic-lock (409) + `client_action_log` replay + repair attachment list + phase19_sync_check 15/15
- **Phase 18 (Security):** RBAC `requirePerm` central matrix, audit_logs append-only + `/audit-log`, mask ค่าลับ, hardened auth/session, CORS wildcard ลบ, security headers, security_check 32/32
- **Phase 17 (Reports):** report API 12 กลุ่ม + CSV/XLSX + schedule 5 นาที + 13 หน้า report
- **Phase 16 (Notifications):** notification center + alert engine
- **Phase 15 (Dashboard):** KPI drill-down
- **Phase 14 (Supervisor):** หน้าฝ่ายซ่อม/อนุมัติ
- **Phase 13 (Inspection):** checklist/ตรวจสอบเครื่องจักร
- **Phase 12 (Sage):** Sage 300 item/stock lookup (source of truth), ใบเบิก→ตัดสต็อก
- **Phase 11 (PM):** PM/AM plan + generate
- ก่อน phase 11: งานซ่อม, ครุภัณฑ์, อะไหล่, ผู้ขาย, calibration, เส้นทาง LINE/Email notify

### ข้อจำกัดที่รู้ (ณ รุ่นนี้)
- ปุ่ม HTTPS ไม่มีใน IIS/Next (เดี๋ยวต้องติดตั้ง cert + bind ก่อนใช้งานอุปกรณ์จริง) — GO-LIVE BLOCKER
- recharts โหลดตรงบน dashboard/analytics (ยกเว้นหน้า report)
- Sage 300: ตัดสต็อกจริงทำที่ฝั่งคลัง (out-of-band) แล้วบันทึก doc# ผ่าน sage_shipments — CMMS บันทึกเฉพาะ snapshot ROI
- `public/uploads` 66 ไฟล์ติด git (ควรลบ/ignore รอบถัดไป)
- ตาราง `audit_trail` (เก่า) ยังไม่ถูก drop; `roles` id 3 label "Operate" ≠ matrix "Technician" (label เท่านั้น)

### Backward compatibility
- ทุก migration เป็น additive (ไม่มี DROP/TRUNCATE/DELETE) — ย้อนกลับอย่างปลอดภัยด้วย forward-fix + restore (ดู `docs/DATABASE_RECOVERY.md`)
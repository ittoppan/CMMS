# สถานะโปรเจกต์ CMMS-TPT (สรุป ณ 23 พ.ย. 2026)

## 1. Git
- branch: `main`
- git status: **ไม่สะอาด** (อัปเดต 2026-11-23 หลังเปิดงาน master redesign) — มีงานค้าง: D3.2 supervisor overview + `WorkOrderTrendChart.tsx` (untracked), Phase C/D code+tests, เอกสาร Phase C/D และ Phase 0 master docs
- commit ล่าสุด (HEAD ก่อนรอบนี้): `bf0ab5f2` — docs: KPI inventory for dashboard modules (master spec §6)
- 10 commit ล่าสุด: bf0ab5f2, c7498618, 3f2d792b, d7a12f6a, 114f0dba, f27915e7, 7a6d1f4d, c2c7dbb9, c9dbb3fd, c7746eb3
- remote: `origin https://github.com/ittoppan/CMMS.git` (fetch/push)
- commit ล่าสุดที่ push แล้ว (origin/main): `72eb8443` — feat: settings security hardening (step 1)
- สถานะ push: local นำหน้า origin 10 commit (ยังไม่ push)

## 2. Production
- BUILD_ID ที่รันอยู่: `htWEsqvUdXnCZgebfn3yN` (frontend/.next/BUILD_ID และ live server ยืนยัน)
- ตรงกับ commit: `c9dbb3fd` (feat(settings): explicit allowlist, secret write guards, proxy-safe login delay) ตาม docs/DEPLOY_LOG.md
- PID 7920 (node) ยังทำงาน; ตรวจจริง localhost:3001:
  - /login → 200
  - /repair → 200
  - /dashboard → 200
  - /settings → 200
  - /asset_registry → 200
- หมายเหตุ: design phase 2–4 (bf0ab5f2 ฯลฯ) ยังไม่ deploy

## 3. เอกสารใน docs/ (เวลาแก้ล่าสุด)
- UI_MIGRATION.md — 2026-11-21 10:42
- DASHBOARD_BUILD.md — 2026-11-22 10:03
- SECURITY_FIX_REPORT.md — 2026-11-22 15:35
- SECURITY.md — 2026-09-15 09:48
- SECURITY_MATRIX.md — 2026-11-22 18:58
- SETTINGS_REPORT.md — 2026-11-22 22:50
- SETTINGS_AUDIT.md — 2026-11-22 22:03
- ASSET_DETAIL_REPORT.md — 2026-11-22 19:29
- ASSET_DETAIL_GAP.md — 2026-11-22 16:47
- LOG_REVIEW.md — ไม่มีไฟล์นี้

## 4. งานที่ค้าง (จาก SECURITY_FIX_REPORT / SETTINGS_REPORT / ASSET_DETAIL_REPORT)
### SECURITY_FIX_REPORT
- endpoint ที่ยังไม่ enforced: repair (GET), spare_parts, spare_issue_request, stock_take, inspections, checklist_templates, form_templates, forms, planning, supervisor, approval, sage_shipments, permission_diff
- รอตัดสินใจ: approval ประเภท loto/pm/spare_issue ให้ Foreman+ หรือ Manager+; User ควรเห็น repair ที่ assigned ให้ตัวเองหรือไม่; inspections/form_templates internal check ควรย้ายมา api_permissions หรือไม่
- approval.php ยังเป็น token-based (email/line link) — ไม่เปลี่ยนตามคำสั่ง
### SETTINGS_REPORT
- secret rotation ยังไม่ทำ (รอคำสั่งผู้ใช้) — key ที่เคยรั่ว: line_channel_*, smtp_pass, telegram_bot_token, vapid_*, ntfy_token
- zrok ตรวจไม่ได้ (service ล่ม)
- LOTO/สิทธิ์อื่นคงเดิม (canApproveType ตรงสเปก)
### ASSET_DETAIL_REPORT
- ปุ่ม "เบิกอะไหล่" (issue_center) ไม่มี route → ซ่อน
- MTBF/MTTR คำนวณไม่ได้ (downtime_minutes 0/114) → แสดง "ไม่มีข้อมูล"
- PM ครั้งถัดไป: pm_am 0 แถว → empty state
- รอตัดสินใจ: เกณฑ์แยกข้อมูลเก่าจากการนำเข้า (A–D) ยังไม่ปิดใบงาน; calibration/facility gated ตาม permission ของตัวเอง

## 5. เทส
- Playwright ทั้งหมด (นับจากโค้ด, --list): 213 tests ใน 27 ไฟล์
- บัญชี e2e_*: พบ 9 บัญชี (e2e_viewer, e2e_officer_read, e2e_operate, e2e_user, e2e_admin, e2e_manager, e2e_asstmanager, e2e_foreman, e2e_officer) — is_active=0 ทั้งหมด → active (is_active=1) = 0

## 6. ข้อมูล (DB)
- users: 21
- asset_registry: 82
- repair: 126 (completed 0; ไม่ completed 126 — open 99, in_progress 24, pending 2, assigned 1)
- spare_parts: 1870
- pm_am: 0
- ตารางใหม่ 4 ตารางของ dashboard:
  - shift_handovers: 33
  - utility_readings: 33
  - lubrication_points: 33
  - lubrication_logs: 0
"
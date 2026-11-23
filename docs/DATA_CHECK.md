# ตรวจข้อมูลและสถานะ (DATA_CHECK) — สร้าง 2026-11-23 (อ่านจริง ไม่แก้โค้ด/ข้อมูล)

## 1. ตารางใหม่ของ dashboard

| ตาราง | จำนวนแถว | created_at เล็กสุด | created_at ใหญ่สุด | สร้างโดย (id:จำนวน) | role |
|---|---:|---|---|---|---|
| shift_handovers | 33 | 2026-11-22 09:57:24 | 2026-11-22 22:40:26 | 561:33 | Operate (role_id 3, e2e_operate) |
| utility_readings | 33 | 2026-11-22 09:57:24 | 2026-11-22 22:40:26 | 561:33 | Operate (role_id 3, e2e_operate) |
| lubrication_points | 33 | 2026-11-22 09:57:24 | 2026-11-22 22:40:26 | 561:33 | Operate (role_id 3, e2e_operate) |
| lubrication_logs | 0 | — | — | — | — |

สัญญาณว่าเป็นข้อมูลทดสอบ:
- ทุกแถวใน 3 ตารางที่มีข้อมูลสร้างโดยบัญชี `e2e_operate` (id 561) ทั้งหมด
- `lubrication_points.name` = "e2e point" ทุกแถว (33/33)
- `utility_readings.value` = 1.0000 ทุกแถว; `shift_handovers.shift_code` = "day" ทุกแถว; `lubrication_points.interval_days` = 30 ทุกแถว
- `created_at` 33 ค่า distinct ต่อตาราง (ไม่ชนกันเป็นกลุ่มในไม่กี่วินาที แต่กระจายตลอดวัน)
- `notes` ว่างทุกแถว
- สรุป: เป็นข้อมูลทดสอบที่กรอกผ่านหน้าจอโดยบัญชีทดสอบ e2e_operate (ไม่ใช่ข้อมูลจริง) — ไม่ลบ

ค้นโค้ด/สคริปต์ seed ที่สร้างข้อมูลลงตารางเหล่านี้:
- ไม่พบไฟล์ seed ใน `scripts/` หรือโค้ดที่ INSERT ข้อมูลตัวอย่างลง 4 ตารางนี้ (grep `shift_handovers`/`utility_readings`/`lubrication_points` ใน scripts ไม่พบ)
- ตารางถูกสร้างโดย migration:
  - `database/migration_20261122_dashboard_shift_handover.sql` — commit `3cc6b850` (2026-11-22 08:46:10 +0700, อภิชัย สุกรีฑา)
  - `database/migration_20261122_dashboard_utility.sql` — commit `23fde41a` (2026-11-22 08:48:49 +0700)
  - `database/migration_20261122_dashboard_lubrication.sql` — commit `e6f1b714` (2026-11-22 08:51:12 +0700)
- รันบน production เมื่อไหร่: ไม่แน่ใจ (ไม่มีบันทึก deploy-run ของ migration นี้; ตารางและข้อมูลปรากฏใน DB ปัจจุบัน ข้อมูลสร้างวัน 2026-11-22)

## 2. ใบงาน (repair)

- จำนวนก่อนรายงาน REPAIR_BACKLOG_REPORT.md: 114; ปัจจุบัน: 126; ใบที่สร้างหลังรายงาน: 12
- ช่วง created_at ของ 12 ใบ: 2026-11-22 17:32:09 ถึง 2026-11-22 22:40:49 (cutoff = mtime รายงาน 2026-11-22 17:17:44)
- สร้างโดย role: e2e_user (role_id 9, User) ทั้ง 12 ใบ
- ผ่านช่องทาง: ตาราง `repair` ไม่มีคอลัมน์ช่องทาง → แยก web/LIFF/ฟอร์มสาธารณะไม่ได้ (ไม่แน่ใจ); source_type = breakdown ทั้ง 12, work_order_type = NULL ทั้ง 12
- เป็นของบัญชี e2e_* หรือไม่: ใช่ ทั้ง 12 ใบ (created_by = e2e_user) — เป็นใบงานทดสอบที่ teardown ไม่ได้ลบ
- มี asset_id หรือไม่: ไม่มี (asset_id IS NULL ทั้ง 12)

## 3. Git

### 3.1 commit ที่ยังไม่ push (origin/main..HEAD) — รวม 18 commit

```
bf0ab5f2 docs: KPI inventory for dashboard modules (master spec §6)
c7498618 feat(dashboard): Phase 4b — LoadingState/ErrorState for wallboard full-page state
3f2d792b feat(dashboard): Phase 4a — adopt EmployeeAvatar in My Dashboard hero
d7a12f6a feat(shell): Phase 3b — mobile app bar avatar + NotificationCenter integration
114f0dba feat(shell): Phase 3a — adopt Breadcrumb + EmployeeAvatar primitives
f27915e7 feat(design-system): implement primitive components per DESIGN.md
7a6d1f4d feat(design-system): Phase 2 primitives + extract ChartTip/Legend
c2c7dbb9 docs: record settings round 2 build (htWEsqvUdXnCZgebfn3yN)
c9dbb3fd feat(settings): explicit allowlist, secret write guards, proxy-safe login delay
c7746eb3 docs: update deploy log with new BUILD_ID
4c48f563 docs: append settings step 1 report
9afd145e docs: update deploy log for settings step 1 commit
4868b01b fix(settings): hide secrets, public allowlist, login lockout
82962f54 docs: update deploy log and asset detail report with BUILD_ID X2MVXatUUBEJyIa1pvHqR
b7f0c6e4 feat(asset): asset detail redesign + permissions hardening (BOM perm, QR minimal, tests)
055644b5 docs: deploy log mapping commit to BUILD_ID
2b1a3fc5 feat(settings): security hardening step 1
706006c8 feat(asset): redesign asset detail page + asset_registry permissions
```

### 3.2 git log --oneline -15 (ล่าสุด)

```
bf0ab5f2 docs: KPI inventory for dashboard modules (master spec §6)
c7498618 feat(dashboard): Phase 4b — LoadingState/ErrorState for wallboard full-page state
3f2d792b feat(dashboard): Phase 4a — adopt EmployeeAvatar in My Dashboard hero
d7a12f6a feat(shell): Phase 3b — mobile app bar avatar + NotificationCenter integration
114f0dba feat(shell): Phase 3a — adopt Breadcrumb + EmployeeAvatar primitives
f27915e7 feat(design-system): implement primitive components per DESIGN.md
7a6d1f4d feat(design-system): Phase 2 primitives + extract ChartTip/Legend
c2c7dbb9 docs: record settings round 2 build (htWEsqvUdXnCZgebfn3yN)
c9dbb3fd feat(settings): explicit allowlist, secret write guards, proxy-safe login delay
c7746eb3 docs: update deploy log with new BUILD_ID
4c48f563 docs: append settings step 1 report
9afd145e docs: update deploy log for settings step 1 commit
4868b01b fix(settings): hide secrets, public allowlist, login lockout
82962f54 docs: update deploy log and asset detail report with BUILD_ID X2MVXatUUBEJyIa1pvHqR
b7f0c6e4 feat(asset): asset detail redesign + permissions hardening (BOM perm, QR minimal, tests)
```

### 3.3 แยกประเภท 18 commit ที่ยังไม่ push

- โค้ด: 11 commit (706006c8, 2b1a3fc5, 4868b01b, c9dbb3fd, b7f0c6e4, 7a6d1f4d, f27915e7, 114f0dba, d7a12f6a, 3f2d792b, c7498618)
- เอกสาร: 7 commit (055644b5, 82962f54, 9afd145e, 4c48f563, c7746eb3, c2c7dbb9, bf0ab5f2)
- ข้อมูล: 0 commit

### 3.4 สแกนไฟล์ที่ติดตาม (git ls-files) หา password/secret/token/api_key/Bearer/private key

รูปแบบ: `... =` หรือ `: ` ตามด้วยค่า — รายงานเฉพาะไฟล์:บรรทัด (ไม่พิมพ์ค่า)

docs/PHASE_31_SECURITY.md:10
docs/PRODUCTION_DATA_QUALITY.md:43
docs/SECURITY_FIX_REPORT.md:129
docs/SECURITY_FIX_REPORT.md:163
docs/SECURITY_FIX_REPORT.md:191
docs/SETTINGS_REPORT.md:51
docs/audit-report-2026-08-19.md:64
frontend/app/(dashboard)/analytics/kpi/page.tsx:46
frontend/app/(dashboard)/approval/page.tsx:120
frontend/app/(dashboard)/approval/page.tsx:29
frontend/app/(dashboard)/approval/page.tsx:82
frontend/app/(dashboard)/asset_registry/view/page.tsx:298
frontend/app/(dashboard)/onboarding/page.tsx:179
frontend/app/(dashboard)/onboarding/page.tsx:88
frontend/app/(dashboard)/profile/page.tsx:196
frontend/app/(dashboard)/profile/page.tsx:197
frontend/app/(dashboard)/profile/page.tsx:198
frontend/app/(dashboard)/profile/page.tsx:207
frontend/app/(dashboard)/profile/page.tsx:433
frontend/app/(dashboard)/profile/page.tsx:439
frontend/app/(dashboard)/profile/page.tsx:445
frontend/app/(dashboard)/profile/page.tsx:74
frontend/app/(dashboard)/reports/import_excel/page.tsx:167
frontend/app/(dashboard)/settings/notifications/page.tsx:244
frontend/app/(dashboard)/settings/notifications/page.tsx:245
frontend/app/(dashboard)/settings/notifications/page.tsx:473
frontend/app/(dashboard)/settings/notifications/page.tsx:492
frontend/app/(dashboard)/settings/page.tsx:213
frontend/app/(dashboard)/settings/page.tsx:240
frontend/app/(dashboard)/settings/page.tsx:247
frontend/app/(dashboard)/spare_parts/page.tsx:114
frontend/app/(dashboard)/spare_parts/sage_shipments/page.tsx:162
frontend/app/(dashboard)/users/create/page.tsx:131
frontend/app/(dashboard)/users/create/page.tsx:163
frontend/app/(dashboard)/users/create/page.tsx:55
frontend/app/(dashboard)/users/edit/page.tsx:124
frontend/app/(dashboard)/users/edit/page.tsx:131
frontend/app/(dashboard)/users/edit/page.tsx:164
frontend/app/(dashboard)/users/edit/page.tsx:171
frontend/app/(dashboard)/users/edit/page.tsx:59
frontend/app/change-password/page.tsx:100
frontend/app/change-password/page.tsx:98
frontend/app/change-password/page.tsx:99
frontend/components/EmailNotifySettings.tsx:66
frontend/components/RepairRequestForm.tsx:568
frontend/components/RepairRequestForm.tsx:656
frontend/components/RepairRequestForm.tsx:717
frontend/components/RepairRequestForm.tsx:957
frontend/lib/api.ts:36
frontend/lib/api.ts:94
frontend/lib/document.ts:182
frontend/lib/liff-session.ts:108
frontend/lib/liff-session.ts:76
frontend/lib/liff-session.ts:81
frontend/lib/offline/engine.ts:284
frontend/tests/e2e-fixture.ts:63
frontend/tests/e2e/asset-detail-api.spec.ts:8
frontend/tests/e2e/cost.spec.ts:30
frontend/tests/e2e/cost.spec.ts:44
frontend/tests/e2e/creds.ts:16
frontend/tests/e2e/fixtures/security-probe.php:61
frontend/tests/e2e/login-lockout.spec.ts:25
frontend/tests/e2e/loto-approval.spec.ts:23
frontend/tests/e2e/phase2-write-perms.spec.ts:13
frontend/tests/e2e/phase2-write-perms.spec.ts:3
frontend/tests/e2e/phase2-write-perms.spec.ts:4
frontend/tests/e2e/phase2-write-perms.spec.ts:5
frontend/tests/e2e/phase3-lowrole.spec.ts:24
frontend/tests/e2e/phase3-lowrole.spec.ts:4
frontend/tests/e2e/phase3-lowrole.spec.ts:5
frontend/tests/e2e/phase3-lowrole.spec.ts:6
frontend/tests/e2e/phase6-matrix.spec.ts:10
frontend/tests/e2e/phase6-matrix.spec.ts:11
frontend/tests/e2e/phase6-matrix.spec.ts:12
frontend/tests/e2e/phase6-matrix.spec.ts:13
frontend/tests/e2e/phase6-matrix.spec.ts:14
frontend/tests/e2e/phase6-matrix.spec.ts:15
frontend/tests/e2e/phase6-matrix.spec.ts:16
frontend/tests/e2e/phase6-matrix.spec.ts:31
frontend/tests/e2e/phase6-matrix.spec.ts:8
frontend/tests/e2e/phase6-matrix.spec.ts:9
frontend/tests/e2e/phase6-perm.spec.ts:6
frontend/tests/e2e/phase7-read.spec.ts:52
frontend/tests/e2e/role-menus.spec.ts:11
frontend/tests/e2e/role-menus.spec.ts:12
frontend/tests/e2e/role-menus.spec.ts:76
frontend/tests/e2e/sage-shipments.spec.ts:15
frontend/tests/e2e/sage-shipments.spec.ts:20
frontend/tests/e2e/settings-secret-write.spec.ts:102
frontend/tests/e2e/settings-secret-write.spec.ts:118
frontend/tests/e2e/settings-secret-write.spec.ts:150
frontend/tests/e2e/settings-secret-write.spec.ts:163
frontend/tests/e2e/settings-secret-write.spec.ts:190
frontend/tests/e2e/settings-secret-write.spec.ts:26
frontend/tests/e2e/settings-security.spec.ts:8
public/api/auth/login.php:14
public/api/auth/login.php:16
public/api/v1/approval.php:103
public/api/v1/approval.php:89
public/api/v1/approval.php:93
public/api/v1/csrf.php:16
public/api/v1/document.php:424
public/api/v1/iot_ingest.php:46
public/api/v1/iot_ingest.php:50
public/api/v1/line_webhook.php:100
public/api/v1/line_webhook.php:29
public/api/v1/line_webhook.php:35
public/api/v1/line_webhook.php:36
public/api/v1/profile.php:186
public/api/v1/profile.php:188
public/api/v1/scan.php:141
public/api/v1/scan.php:151
public/approve.php:146
public/approve.php:17
public/approve.php:27
public/login.php:26
scripts/archive/apply_phase24_field_qr.php:108
scripts/archive/apply_phase24_field_qr.php:91
scripts/archive/apply_phase24_field_qr.php:96
scripts/archive/apply_phase24_field_qr.php:98
scripts/deploy-next.ps1:77
scripts/flag_default_passwords.php:3
scripts/flag_default_passwords.php:53
scripts/line_rich_menu.php:79
scripts/line_rich_menu.php:81
scripts/line_rich_menu.php:82
scripts/migrate_approval_token_hash.php:15
scripts/test_approval_service.php:127
scripts/test_approval_service.php:128
scripts/test_security.php:191
scripts/test_security.php:192
scripts/test_security.php:193
scripts/test_security.php:241
scripts/test_services.php:266
scripts/update_line_webhook.php:122
scripts/update_line_webhook.php:123
src/csrf.php:134
src/helpers/document_control.php:1358
src/helpers/document_control.php:1363
src/helpers/document_control.php:1367
src/helpers/document_control.php:1379
src/helpers/document_control.php:1380
src/helpers/document_control.php:1468
src/helpers/document_control.php:1470
src/helpers/errors.php:31
src/helpers/iot_ingest.php:199
src/helpers/iot_ingest.php:200
src/helpers/liff.php:143
src/helpers/liff.php:77
src/helpers/liff.php:78
src/helpers/liff.php:81
src/helpers/liff.php:84
src/helpers/liff.php:85
src/helpers/notification.php:1362
src/helpers/notification.php:1363
src/helpers/notification.php:1364
src/helpers/notification.php:793
src/helpers/scan.php:116
src/helpers/scan.php:127
src/helpers/scan.php:132
src/helpers/scan.php:136
src/helpers/scan.php:356
src/helpers/scan.php:357
src/helpers/scan.php:371
src/helpers/scan.php:70
src/services/ApprovalService.php:25
src/services/ApprovalService.php:50
src/services/ApprovalService.php:51
src/services/ApprovalService.php:75
src/services/NotificationService.php:13
src/services/NotificationService.php:46
src/services/NotificationService.php:50
src/services/WebPushService.php:179
src/services/WebPushService.php:180
src/services/WebPushService.php:90

หมายเหตุ: รายการข้างต้นรวม assignment ใน UI/form state และตัวแปร; ไม่ได้หมายความว่าทุกบรรทัดเป็นความลับฝังจริง

### 3.5 รหัสผ่านบัญชีทดสอบใน commit ที่ push แล้ว (origin/main)

- ค้นด้วยสตริงรหัสเริ่มต้นที่รู้จัก (password, 1234, ..., toppan123 ฯลฯ) ใน origin/main
- ไม่พบค่ารหัสผ่านทดสอบแบบ plaintext ใน tree ที่ push แล้ว
- พบเฉพาะลิสต์รหัสเริ่มต้นใน `scripts/flag_default_passwords.php` (commit `9a086a1a`) ซึ่งเป็นโค้ดตรวจรหัส ไม่ใช่ค่ารหัสจริง

## 4. Design phase 2–4 และ KPI inventory

- Design phase 2–4 = ชุดงาน enterprise UX/UI transformation (Corporate Navy/White/Teal, Sarabun, TOPPAN blue #0068B5) ที่ผู้ใช้สั่งใน thread นี้; ผู้ดำเนินการ/ผู้ commit = อภิชัย สุกรีฑา
  - Phase 2 (2026-11-23 00:00–00:09): ออกแบบระบบ (DESIGN.md) + primitive components (ui/employee-avatar, equipment-status, timeline, notification-center, loading-state, error-state, breadcrumb) + แยก ChartTip/Legend ไป components/charts
  - Phase 3 (2026-11-23 00:12–00:33): นำ primitive ไปใช้ใน shell (topbar breadcrumb, sidebar/mobile avatar, NotificationCenter)
  - Phase 4 (2026-11-23 00:41–05:26): นำ primitive ไปใช้ในโมดูล (My Dashboard hero, wallboard full-page loading/error)
- docs/KPI_INVENTORY.md = เอกสารสเปก KPI สำหรับ dashboard modules ตาม master spec §6 (สูตร, แหล่งตาราง/ฟิลด์, กลยุทธ์ refresh, กฎ validation) จำนวน 36 โมดูล + KPI ข้ามโมดูล; ไม่แตะ UI
  - สร้างเมื่อ: 2026-11-23 05:45:32 +0700 (commit `bf0ab5f2`)
  - สั่งโดย: ผู้ใช้ (เจ้าของโปรเจกต์) ในชุดงาน design/enterprise UX

### ไฟล์ที่ถูกแตะโดย 18 commit ที่ยังไม่ push (git diff --name-only origin/main..HEAD)

DESIGN.md
docs/ASSET_DETAIL_REPORT.md
docs/DEPLOY_LOG.md
docs/KPI_INVENTORY.md
docs/SECURITY_MATRIX.md
docs/SETTINGS_AUDIT.md
docs/SETTINGS_REPORT.md
docs/phase7_read_raw.json
docs/security_matrix_raw.json
frontend/app/(dashboard)/asset_registry/view/page.tsx
frontend/app/(dashboard)/dashboard/my/page.tsx
frontend/app/(dashboard)/dashboard/wallboard/page.tsx
frontend/app/(dashboard)/layout.tsx
frontend/app/(dashboard)/settings/page.tsx
frontend/components/ApiFetchInterceptor.tsx
frontend/components/NotificationBell.tsx
frontend/components/charts/chart-tip.tsx
frontend/components/charts/index.ts
frontend/components/ui/breadcrumb.tsx
frontend/components/ui/employee-avatar.tsx
frontend/components/ui/equipment-status.tsx
frontend/components/ui/error-state.tsx
frontend/components/ui/loading-state.tsx
frontend/components/ui/notification-center.tsx
frontend/components/ui/timeline.tsx
frontend/tests/e2e/asset-detail-api.spec.ts
frontend/tests/e2e/fixtures/security-probe.php
frontend/tests/e2e/interceptor-public.spec.ts
frontend/tests/e2e/login-lockout.spec.ts
frontend/tests/e2e/loto-approval.spec.ts
frontend/tests/e2e/settings-secret-write.spec.ts
frontend/tests/e2e/settings-security.spec.ts
public/api/auth/login.php
public/api/v1/asset_hub.php
public/api/v1/email_notify.php
public/api/v1/line_notify.php
public/api/v1/settings.php
scripts/unlock_login.php
src/helpers/api.php
src/helpers/api_permissions.php
src/helpers/asset_hub.php
src/helpers/permissions.php

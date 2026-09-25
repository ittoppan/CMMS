# PHASE 30 SECURITY — RBAC, Settings Policy, Audit

> อัปเดตล่าสุด: 2026-09-24 · กฎเหล็กจาก `AGENTS.md` + `PHASE_30_CURRENT_STATE.md` §6

## 1. RBAC — module `safety`

เพิ่มใน `PERMISSION_MATRIX` (`src/helpers/permissions.php`):

| role level | actions |
|---|---|
| admin / supervisor / safety | view, create, edit, approve, execute, cancel |
| engineer / technician | view, create, edit, execute |
| (viewer roles) | view |

Menu permission `menu_permissions` 8 keys: `safety/work_permit`, `safety/permits`,
`safety/loto`, `safety/dashboard`, `safety/stop_work`, `safety/actions`, `safety/risk_matrix`,
`safety/reports` — grant ตาม role matrix (1,2,6,7,3,4,5 …)

Alias (`permModuleAliases`): `work_permit → safety`, `safety → safety` — ใช้ `requirePerm(pdo, 'safety', action)`

**ห้าม hard-code permission ใน UI** — ใช้ `permit.can` จาก API + backend `requirePerm` ทุกครั้ง

## 2. Layer Defense บน API

```
requireLogin($pdo)                          → 401
canPerm($pdo,'safety',$action) per action   → 403
enforceCsrf() (POST/PUT/DELETE)             → 403 CSRF validation failed
clientActionBegin (idempotency)             → replay: dedup | uncertain: 409
engine validate (transition/step/risk/… )   → 409/400
audit: wp_activity + audit_log            → immutable
```

## 3. Settings (policy) — `settings` table group `work_permit`

| key | default | ความหมาย |
|---|---|---|
| `wp_require_approval` | 1 | ต้อง approval chain ครบก่อน activate |
| `wp_require_risk_review` | 1 | ต้อง risk review + save ครบก่อน approve |
| `wp_expiry_policy` | expire | expire=หมดอายุ / review=requires_review |
| `wp_auto_expire_enabled` | 1 | auto เปลี่ยน Active→Expired ตามนโยบาย |
| `wp_gas_block_red` | 1 | gas test block เมื่อ calibration RED |
| `wp_gas_warn_amber` | 1 | เตือนเมื่อ calibration AMBER |
| `wp_cert_expired_block` | 1 | worker cert หมดอายุ → NOT AUTHORIZED |
| `wp_require_final_inspection` | 1 | checklist post_work ครบก่อน close |
| `wp_valid_hours_default` | 8 | ชั่วโมง valid เริ่มต้น (override ต่อ type ได้) |
| `wp_permit_no_prefix` | PTW | prefix เลขใบอนุญาต |
| `wp_high_risk_approval` | manager | role จำเป็นสำหรับ High/Critical |
| `wp_phase30_applied_ver` | 2026-09-24 | version ที่ apply |

**Risk matrix (settings group work_permit):**
`risk_matrix_likelihood` [1-5], `risk_matrix_severity` [1-5],
`risk_matrix_thresholds` [low≤4, medium≤9, high≤15, critical≤25],
`risk_matrix_required_approval` {“critical”:["manager"],“high”:["manager"]}

## 4. Audit (immutable)

- ทุก safety-critical action → `work_permit_activity` (action/desc/actor/time) และ
  `audit_log()` สำหรับระบบ-wide
- รายการ: create, edit field, submit, risk change, control change, approve/reject, activate,
  suspend, resume, stop_work, loto add/lock/verify/remove, gas, worker add/entry/exit, ppe,
  checklist, complete, close, cancel, safety action, action_transition
- **ห้ามแก้/ลบ audit หรือ safety history** — historical immutable (กฎ 14)

## 5. Idempotency & Offline

- ทุก POST ใช้ `client_action_id` (body/header) → replay ปลอดภัย (dedup)
- offline mode: ดู/checklist/photo/draft บันทึก local ได้ แต่ **approve/activate/loto-auth/resume/close ต้อง server confirm**

## 6. Secret / Config

- ไม่มี secret ใน repo — ใช้ `.env` / env vars (`BOT_TOKEN`, DB password …)
- ไม่ hard-code IP/URL dev — ใช้ `APP_URL`/`ALLOWED_ORIGINS`/settings
- Migration additive + idempotent — รันซ้ำได้ ไม่ error

## 7. ห้าม (จาก spec)

1. ห้าม fake approval (backend source of truth)
2. ห้ามข้าม approval เลย chain ผ่าน URL/API
3. ห้ามถือว่า Zero Energy / Gas Test ผ่านโดยอัตโนมัติ
4. ห้าม auto-approve / auto-close
5. ห้ามระบบเดา Risk Score จากข้อมูลที่ไม่มี
6. ห้าม resume อัตโนมัติหลัง Stop Work
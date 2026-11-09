# PHASE 30 API — `public/api/v1/work_permit.php`

> อัปเดตล่าสุด: 2026-09-24 · format: JSON `{success,data}` / error `{success:false,error,code}`
> ทุก request ต้องการ session login; POST ต้องผ่าน `enforceCsrf()` + RBAC + idempotency
> RBAC: GET ทั้งหมด `safety:view`; POST แยกต่อ action (ดู §4)

## 1. GET (ไม่เปลี่ยนข้อมูล)

| action | params | หมายเหตุ |
|---|---|---|
| `config` | — | `{config: wp_config, statuses, can:{view,create,edit,approve,execute,cancel}}` |
| `statuses` | — | 12 สถานะ + label |
| `types` | — | `{permit_types, config}` — dropdown ประเภทงาน |
| `options` | — | ตัวเลือก form (types/asset/locations/users/contractors/…) |
| `dashboard` | `mine=1` (optional) | KPI: active, pending, loto points, high/critical + stop work/actions hang |
| `list` | `status,risk,type,search` | รายการใบอนุญาต (kebab ไม่ autogen) |
| `get` | `id` | detail เต็ม (info/approval/risk/controls/loto/gas/workers/ppe/checklist/suspensions/stopwork/actions/audit) |
| `data-quality` | — | 14 checks (missing risk/approval/close, expired active, cert expired, …) |
| อื่น | — | 404 |

## 2. POST Lifecycle

| action | perm | body ที่ต้องมี | ผล |
|---|---|---|---|
| `create` | create | permit_type_code, location?, asset_id/repair_id/location_id?, work_source, start_at/end_at?, supervisor_id?, safety_reviewer_id?, desc | 201 draft + permit_no `{prefix}-{YYYYMM}-{NNN}` |
| `submit` | edit | id | requested + สร้าง approval steps |
| `risk_review` | edit | id + risks[(label,l,s)] + controls[] | risk_review + save assessment/controls |
| `approve_step` | approve | id, step, decision(`approved`/`rejected`/`revision_requested`), comment? | ผ่านขั้น/ครบ→approved |
| `activate` | execute | id | active |
| `suspend` | execute | id, reason | suspended |
| `resume` | execute | id | active (re-verify) |
| `complete` | execute | id | completed |
| `close` | execute | id (+ final inspection flag) | closed |
| `cancel` | cancel | id, reason? | cancelled |

## 3. POST Safety (permit-scoped / global)

| action | perm | body | ผล |
|---|---|---|---|
| `loto_add` | execute | id, energy_type, source | point |
| `loto_lock` | execute | point_id, lock_no\|tag_no | locked |
| `loto_verify` | execute | id, (verify result) | zero-energy verified |
| `loto_remove` | execute | point_id, reason | removed |
| `gas_test` | execute | id, instrument, readings, gases[] | result (RED→block) |
| `worker_add` | execute (frontend: edit) | id, user_id\|name, cert | worker + auth status |
| `worker_entry` / `worker_exit` | edit/execute | worker_id | time log |
| `ppe` | edit | id, items[] | confirmations |
| `checklist` | edit | id, phase(«pre_work»/«post_work»), items[{code,label,result}] | results |
| `stop_work` | execute | id, reason, reporter | stop active |
| `stop_work_review` | execute | stop_id, decision(`resolved`/`cancel`) | review |
| `safety_action` | execute | id?, action fields | action open |
| `action_transition` | execute | action_id, to(open→in_progress/cancelled, in_progress→completed/cancelled, completed→verified/cancelled, verified→closed), note? | status change |

## 4. Permission Matrix (POST)

| perm `safety:*` | actions |
|---|---|
| `create` | create |
| `approve` | approve_step |
| `cancel` | cancel |
| `edit` | submit, risk_review, worker_add, worker_entry, worker_exit, ppe, checklist |
| `execute` | activate, suspend, resume, complete, close, loto_add/lock/verify/remove, gas_test, stop_work, stop_work_review, safety_action, action_transition |

## 5. HTTP Status Mapping (error)

| code | HTTP |
|---|---|
| NOT_FOUND | 404 |
| FORBIDDEN / FORBIDDEN_STEP | 403 |
| BAD_TRANSITION, ALREADY_DECIDED, PRIOR_STEP_PENDING, INSTRUMENT_RED, NOT_AUTHORIZED, LOCK_TAG_REQUIRED, RISK_REQUIRED, CHECKLIST_INCOMPLETE, ISOLATION_REQUIRED, GAS_REQUIRED, PPE_REQUIRED, WORKER_AUTH_REQUIRED, STEP_NOT_FOUND, BAD_DECISION, ACTIVE_STOP | 409 |
| อื่น (validation) | 400 |
| replay (dedup) | 200 `{success:true, dedup:true, id}` |
| CLIENT_ACTION_UNCERTAIN | 409 |

## 6. Idempotency

- key จาก `client_action_id` (body JSON) หรือ header `X-Client-Action-Id` (≤64)
- รายงาน replay → dedup response ไม่สร้าง record ซ้ำ
- ฝั่ง offline (PWA): view/checklist/photo/draft ได้ แต่ approve/activate/loto auth/resume/close ต้อง server confirm
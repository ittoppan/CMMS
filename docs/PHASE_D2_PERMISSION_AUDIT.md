# PHASE D2 — Permission Audit (Wallboard)

## Endpoints Reviewed
- `spare_optimization.php?action=availability&needs_reorder=1`
- `mtbf_mttr.php`

## System Permission Source
- `my_permissions.php?module=spare_parts` -> actions: view, plan, request, issue, return, approve, edit
- `my_permissions.php?module=reliability` -> actions: read, write, export

## Policy
- User role must NOT gain new permissions.
- Authorization logic unchanged.
- If no permission, endpoint is NOT called and No Permission state is shown.
- No data leak: spare/MTBF data not fetched or rendered without permission.

## Implementation
- `frontend/app/(dashboard)/dashboard/wallboard/page.tsx`:
  - `checkPerm(module)` calls `/api/v1/my_permissions.php`.
  - `spareAllowed = checkPerm("spare_parts")` (any action true).
  - `mtbfAllowed = checkPerm("reliability")` (any action true).
  - `fetchReorderParts` only if `spareAllowed`.
  - `fetchMtbfMttr` only if `mtbfAllowed`.
  - No Permission UI:
    - Spare Parts panel: "ไม่มีสิทธิ์เข้าถึงข้อมูลอะไหล่"
    - MTBF/MTTR panel: "ไม่มีสิทธิ์เข้าถึงข้อมูล MTBF/MTTR"

## API Permission Matrix (Wallboard)
| Role | spare_parts.view | reliability.read | spare_optimization called? | mtbf_mttr called? | UI State |
|---|---|---|---|---|---|
| User | false | false | No | No | No Permission |
| Operate | (role-dependent) | (role-dependent) | Only if allowed | Only if allowed | Data or No Permission |
| Foreman | (role-dependent) | (role-dependent) | Only if allowed | Only if allowed | Data or No Permission |

Verified for User role via `/api/v1/my_permissions.php`:
- spare_parts: all actions false
- reliability: all actions false
- Result: both panels show No Permission; no 403.

## Regression
- No API contract change.
- No authorization change.
- No DB change.

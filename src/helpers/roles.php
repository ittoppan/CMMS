<?php
/**
 * roles.php — Permission helper สำหรับ Phase 12 (Spare Parts / Sage 300)
 *
 * แผนการแบ่งสิทธิ์ตาม roles table:
 *   Admin (1)        → ตั้งค่า integration (Sage) + ทุกอย่าง
 *   Manager (2) / ASST Manager (6) → ดูต้นทุน, อนุมัติคำขอเบิก (supervisor/manager)
 *   Foreman (7)      → คลังจ่าย/รับคืน (warehouse)
 *   Operate (3) / Operator (4) → ช่าง: ค้นหา/ขอเบิก/บันทึกการใช้งาน
 *   Viewer (5)       → อ่านอย่างเดียว
 *
 * CMMS เก็บสิทธิ์การทำงาน (ไม่ใช่สิทธิ์สต็อก); สต็อกยังเป็นของ Sage 300.
 */

function currentRoleId(): int {
    return (int)($_SESSION['role_id'] ?? 0);
}

function currentRoleName(): string {
    return strtolower((string)($_SESSION['role_name'] ?? $_SESSION['role'] ?? ''));
}

/** Admin integration config — เปิดเฉพาะ role 1 */
function canAdminSage(): bool {
    return currentRoleId() === 1;
}

/** ดูต้นทุน / อนุมัติคำขอ (supervisor / manager) */
function canApprove(): bool {
    return in_array(currentRoleId(), [1, 2, 6], true);
}

/** คลังจ่าย/รับคืนของ (warehouse / foreman ขึ้นไป) */
function canIssue(): bool {
    return in_array(currentRoleId(), [1, 2, 6, 7], true);
}

/** ช่าง: ขอเบิก / บันทึกการใช้งาน / ค้นหา */
function canRequest(): bool {
    return currentRoleId() !== 5;
}

/** middleware สำหรับ API — คืน 403 JSON แล้วจบ request */
function requireRole(bool $ok, string $message = 'ไม่มีสิทธิ์การใช้งานนี้'): void {
    if (!$ok) {
        http_response_code(403);
        echo json_encode(['error' => $message]);
        exit;
    }
}

/**
 * Phase 14 — Supervisor + Planner workflow
 *   Admin(1) / Manager(2) / ASST Manager(6) = หัวหน้า/ผู้จัดการ (review + approve + verify)
 *   Foreman(7) = หัวหน้าชุด (วางแผน/มอบหมาย/ตรวจรับงานได้ แต่ไม่อนุมัติคำขอ)
 *   Operate(3) / Operator(4) = ช่าง (รับงาน, เริ่ม, pause/resume, เสร็จ)
 *   Viewer(5) = อ่านอย่างเดียว
 */

/** หัวหน้างานระดับควบคุมงาน — ดู Supervisor section + วางแผน/มอบหมาย/ตรวจรับงาน */
function canSupervisor(): bool {
    return in_array(currentRoleId(), [1, 2, 6, 7], true);
}

/** อนุมัติ/ไม่อนุมัติคำขอแจ้งซ่อม (review maintenance_requests) — ผู้จัดการขึ้นไป ไม่รวม Foreman */
function canReviewRequest(): bool {
    return in_array(currentRoleId(), [1, 2, 6], true);
}

/** วางแผน + มอบหมายงาน + จัดตาราง (planner) */
function canPlanWork(): bool {
    return in_array(currentRoleId(), [1, 2, 6, 7], true);
}

/** ตรวจรับงาน (verify / close / reopen) */
function canVerifyWork(): bool {
    return in_array(currentRoleId(), [1, 2, 6, 7], true);
}

/** ช่าง (รับงาน / เริ่มงาน / pause / resume / ทำเสร็จ) */
function isTechnician(): bool {
    return currentRoleId() === 3;
}

/** เป็นสมาชิกทีมงาน (lead หรือทีม) ของใบงานนี้หรือไม่ */
function isRepairAssignee(PDO $pdo, int $repairId): bool {
    $uid = (int)($_SESSION['user_id'] ?? 0);
    if (!$uid) return false;
    $sql = 'SELECT id FROM work_assignees
            WHERE ref_type = "repair" AND ref_id = ? AND user_id = ?';
    $st = $pdo->prepare($sql);
    $st->execute([$repairId, $uid]);
    if ($st->fetchColumn()) return true;
    $q = $pdo->prepare('SELECT assigned_to FROM repair WHERE id = ?');
    $q->execute([$repairId]);
    return (int)$q->fetchColumn() === $uid;
}
/* =====================================================================
 * แปลงบทบาทที่รับจากฟอร์ม → role_id (สำหรับ users.php)
 * ปัญหาเดิม: หน้า users/edit + users/create ส่ง role เป็น slug
 * (technician/engineer/manager/operator/admin) ซึ่ง (1) ไม่ตรงกับชื่อบทบาท
 * ในตาราง roles และ (2) API ไม่รับคีย์ role → role_id ไม่เคยถูกบันทึก
 * ผู้ใช้จึงตกไปอยู่ที่บทบาทเริ่มต้น (ช่างเทคนิค) เสมอ
 * ===================================================================== */

/**
 * แปลงค่าที่รับมาเป็น role_id
 * รับได้: role_id (ตัวเลข), ชื่อบทบาทใน roles.name (ไม่สนตัวพิมพ์), slug เดิมของระบบ
 *
 * @return int|null null = ไม่พบบทบาท
 */
function users_role_id_from_value(PDO $pdo, $value): ?int
{
    if ($value === null || $value === '') return null;
    if (is_numeric($value)) {
        $stmt = $pdo->prepare('SELECT id FROM roles WHERE id = ?');
        $stmt->execute([(int)$value]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int)$id;
    }

    $raw = trim((string)$value);

    // 1) ชื่อบทบาทตรงกับ roles.name (ไม่สนตัวพิมพ์)
    $stmt = $pdo->prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?) LIMIT 1');
    $stmt->execute([$raw]);
    $id = $stmt->fetchColumn();
    if ($id !== false) return (int)$id;

    // 2) slug เดิมที่ยังค้างใน users.role → ชื่อบทบาทปัจจุบัน
    $legacy = [
        'admin' => 'Admin', 'administrator' => 'Admin',
        'manager' => 'Manager',
        'technician' => 'Operate', 'tech' => 'Operate', 'operate' => 'Operate', 'operator' => 'Operate',
        'viewer' => 'Viewer',
        'asst.manager' => 'Asst.Manager', 'asstmanager' => 'Asst.Manager', 'assistantmanager' => 'Asst.Manager',
        'foreman' => 'Foreman', 'supervisor' => 'Foreman',
        'officer' => 'Officer', 'engineer' => 'Officer',
    ];
    $key = strtolower(preg_replace('/\s+/', ' ', $raw));
    $name = $legacy[$key] ?? $legacy[str_replace(' ', '', $key)] ?? null;
    if ($name === null) return null;

    $stmt = $pdo->prepare('SELECT id FROM roles WHERE LOWER(name) = LOWER(?) LIMIT 1');
    $stmt->execute([$name]);
    $id = $stmt->fetchColumn();
    return $id === false ? null : (int)$id;
}

/**
 * ข้อความบทบาทแบบเดิม (users.role) ที่สอดคล้องกับชื่อบทบาท — รายงาน/KPI บางตัว
 * ยังอ่านคอลัมน์นี้ เช่น "Asst.Manager" → "asst.manager"
 */
function users_legacy_role_text(string $roleName): string
{
    return strtolower(str_replace([' ', '.'], ['', '.'], trim($roleName)));
}

/**
 * แปลง role/role_id ใน payload ให้เป็น role_id + เติม users.role ให้ตรงกัน
 * หยุดพร้อม HTTP 400 เมื่อไม่พบบทบาท (ไม่ปล่อยให้บันทึกแบบเงียบ ๆ)
 */
function users_normalize_role(PDO $pdo, array &$data): void
{
    if (!array_key_exists('role', $data) && !array_key_exists('role_id', $data)) return;

    $source = array_key_exists('role_id', $data) ? $data['role_id'] : $data['role'];
    $resolved = users_role_id_from_value($pdo, $source);
    if ($resolved === null) {
        http_response_code(400);
        echo json_encode(
            ['error' => 'ไม่พบบทบาทที่ระบุ — กรุณาเลือกจากรายการบทบาทในหน้าจัดการสิทธิ์'],
            JSON_UNESCAPED_UNICODE
        );
        exit;
    }

    $stmt = $pdo->prepare('SELECT name FROM roles WHERE id = ?');
    $stmt->execute([$resolved]);
    $data['role_id'] = $resolved;
    $data['role'] = users_legacy_role_text((string)$stmt->fetchColumn());
}

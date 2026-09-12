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
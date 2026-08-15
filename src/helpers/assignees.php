<?php
/**
 * assignees.php — ผู้รับผิดชอบหลายคนต่อ 1 งาน (work_assignees)
 * ใช้ร่วมกัน repair + pm_am ผ่าน ref_type
 *
 * หลักการ: repair.assigned_to / pm_am.assigned_to ยังเก็บ "หัวหน้าชุด (lead)"
 * ส่วน work_assignees เก็บทุกคน (lead + ทีม) — ระบบเดิมทำงานต่อได้ไม่พัง
 */

/** ดึงทีมผู้รับผิดชอบของงาน (พร้อมชื่อ) */
function getWorkAssignees($pdo, $refType, $refId): array {
    $st = $pdo->prepare(
        "SELECT wa.user_id, wa.role, wa.status, wa.accepted_at, wa.assigned_by, wa.created_at, u.full_name
         FROM work_assignees wa
         JOIN users u ON u.id = wa.user_id
         WHERE wa.ref_type = ? AND wa.ref_id = ?
         ORDER BY (wa.role = 'lead') DESC, wa.id ASC"
    );
    $st->execute([$refType, (int)$refId]);
    return $st->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * แทนที่ทีมทั้งหมดของงาน (replace) — คืนผู้ที่ถูกเพิ่ม/ลบ เพื่อใช้แจ้ง LINE
 * @param array $userIds ช่างทุกคนในทีม
 * @param int|null $leadId หัวหน้าชุด (ปกติ = assigned_to คอลัมน์เดิม)
 */
function setWorkAssignees($pdo, $refType, $refId, array $userIds, $leadId = null, $assignedBy = null): array {
    $refId = (int)$refId;
    $userIds = array_values(array_unique(array_filter(array_map('intval', $userIds), fn($u) => $u > 0)));
    if ($leadId) {
        $leadId = (int)$leadId;
        if ($leadId > 0 && !in_array($leadId, $userIds, true)) $userIds[] = $leadId;
    }

    // ทีมเดิม (สำหรับ diff)
    $old = $pdo->prepare("SELECT user_id FROM work_assignees WHERE ref_type = ? AND ref_id = ?");
    $old->execute([$refType, $refId]);
    $oldIds = array_map('intval', $old->fetchAll(PDO::FETCH_COLUMN));

    $del = $pdo->prepare("DELETE FROM work_assignees WHERE ref_type = ? AND ref_id = ?");
    $del->execute([$refType, $refId]);

    $ins = $pdo->prepare(
        "INSERT INTO work_assignees (ref_type, ref_id, user_id, role, assigned_by, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())"
    );
    foreach ($userIds as $uid) {
        $role = ($leadId && $uid === $leadId) ? 'lead' : 'team';
        $ins->execute([$refType, $refId, $uid, $role, $assignedBy ? (int)$assignedBy : null]);
    }

    $newSet = array_flip($userIds);
    $added   = array_values(array_filter($userIds, fn($u) => !in_array($u, $oldIds, true)));
    $removed = array_values(array_filter($oldIds, fn($u) => !isset($newSet[$u])));
    return ['added' => $added, 'removed' => $removed, 'team' => $userIds, 'lead' => $leadId ? (int)$leadId : null];
}

/** ผู้ใช้คนนี้อยู่ในทีมของงานหรือไม่ */
function isWorkAssignee($pdo, $refType, $refId, $userId): bool {
    $st = $pdo->prepare("SELECT 1 FROM work_assignees WHERE ref_type = ? AND ref_id = ? AND user_id = ? LIMIT 1");
    $st->execute([$refType, (int)$refId, (int)$userId]);
    return (bool)$st->fetchColumn();
}

/**
 * ผูกฟิลด์ team + team_ids เข้าแถว (repair/pm_am) แบบ batch — หลีกเลี่ยง N+1
 * @param array $rows ผ่าน reference
 */
function attachWorkTeams(&$rows, string $refType): void {
    if (empty($rows)) return;
    $pdo = getDb();
    $ids = array_map('intval', array_column($rows, 'id'));
    $in  = implode(',', $ids);
    $all = $pdo->query(
        "SELECT wa.ref_id, wa.user_id, wa.role, wa.status, wa.accepted_at, u.full_name
         FROM work_assignees wa
         JOIN users u ON u.id = wa.user_id
         WHERE wa.ref_type = " . $pdo->quote($refType) . " AND wa.ref_id IN ($in)
         ORDER BY (wa.role = 'lead') DESC, wa.id ASC"
    )->fetchAll(PDO::FETCH_ASSOC);

    $byRef = [];
    foreach ($all as $a) $byRef[(int)$a['ref_id']][] = $a;

    foreach ($rows as &$r) {
        $team = $byRef[(int)$r['id']] ?? [];
        $r['team'] = $team;
        $r['team_ids'] = array_map('intval', array_column($team, 'user_id'));
        // เผื่อคอลัมน์เดิมว่างแต่มี lead ในตารางกลาง → เติมให้
        if (empty($r['assigned_to']) && $team) {
            foreach ($team as $m) { if ($m['role'] === 'lead') { $r['assigned_to'] = (int)$m['user_id']; break; } }
        }
    }
    unset($r);
}

/**
 * ช่างกด "รับงาน" — อัปเดตสถานะต่อคนในตารางกลาง (work_assignees.status)
 * หัวหน้าชุด/สมาชิกทีมแต่ละคนรับงานเอง → ทุกคนเห็นว่าใครรับแล้ว/ยังไม่รับ
 * @return bool มีแถวที่อัปเดตหรือไม่ (คนนี้ต้องเป็นสมาชิกทีมของงาน)
 */
function acceptWorkAssignment($pdo, $refType, $refId, $userId): bool {
    $st = $pdo->prepare(
        "UPDATE work_assignees SET status = 'accepted', accepted_at = NOW()
         WHERE ref_type = ? AND ref_id = ? AND user_id = ? AND status != 'accepted'"
    );
    $st->execute([$refType, (int)$refId, (int)$userId]);
    return $st->rowCount() > 0;
}

/** คืนชื่อหัวหน้าชุดจากทีม (ใช้แทน assigned_name ถ้าคอลัมน์ join ว่าง) */
function teamLeadName(array $team): string {
    foreach ($team as $m) if ($m['role'] === 'lead') return (string)($m['full_name'] ?? '');
    return $team ? (string)($team[0]['full_name'] ?? '') : '';
}

<?php
/**
 * planning.php — Phase 25 Advanced Maintenance Planning & Scheduling (engine)
 *
 * คำนวณทุกอย่างฝั่ง backend (ห้าม replicate ใน API/frontend):
 *   1) pln_config                 — เกณฑ์ของหลักจาก settings (capacity/conflict/SLA)
 *   2) pln_group                  — กลุ่มคิววางแผน (new → unplanned → unscheduled → scheduled → at_risk → overdue)
 *   3) pln_priority_explanation   — อธิบายว่าทำไมงานนี้จึงจัดลำดับ สูง/ต่ำ (แสดงผลเท่านั้น ไม่แก้ priority)
 *   4) pln_duration_estimate      — ค่าเฉลี่ยระยะเวลาจากประวัติ (บอกที่มา; ไม่มี ⇒ "No historical estimate")
 *   5) pln_skill_match            — เทียบ skill ช่างกับทักษะที่ใบงานต้องการ (Qualified / Skill Gap)
 *   6) pln_technician_workload    — capacity: ชั่วโมงที่วางแผน vs ชั่วโมงทำงานต่อวัน (จาก settings)
 *   7) pln_detect_conflicts       — ชนกันของช่วงเวลาช่าง / เครื่อง / PM เดียวกัน
 *   8) pln_readiness              — ความพร้อมทำงาน: แผน+มอบหมาย+ทักษะ+วัสดุ (Sage เป็นแหล่งสต็อกจริง)
 *   9) pln_sla_risk               — safe / at_risk / breached
 *  10) pln_prepare                — รวมทุกอย่างเป็น row ที่ UI ใช้ได้ทันที (No N+1 เกินจำเป็น)
 *
 * หลักการ Phase 25:
 *   - ไม่สร้างข้อมูลเทียม (shift/availability อ่านจาก settings ที่มีค่าเริ่มต้น — ปรับได้)
 *   - ไม่เปลี่ยน priority อัตโนมัติ — engine อธิบายเท่านั้น เปลี่ยนได้โดยคน + audit log
 *   - สต็อก = Sage 300 (ผ่าน spare_parts cache) — ห้ามตัด/จองของเองตอนวางแผน
 */

/** เกณฑ์ของหลัก (อ่าน settings — มี default ครบ ไม่มีฮาร์ดโค้ดค่าในโค้ด) */
function pln_config(PDO $pdo): array {
    return [
        'shift_start'     => getSettingValue('planning_shift_start', '08:00'),
        'shift_hours'     => max(1, (int)(getSettingValue('planning_shift_hours', '') ?: getSettingValue('work_hours_per_day', '8'))),
        'working_days'    => array_values(array_filter(array_map('intval', explode(',', getSettingValue('planning_working_days', '1,2,3,4,5'))))),
        'sla_risk_hours'  => max(1, (int)getSettingValue('planning_sla_risk_hours', '24')),
        'break_hour'      => max(0, (float)getSettingValue('planner_break_hour', '12.5')),
        'now'             => date('Y-m-d H:i:s'),
    ];
}

/* ───────────────────────── พื้นฐานสถานะ ───────────────────────── */

function pln_done_statuses(): array {
    return kpi_done_statuses();
}

/** สถานะที่ถือว่า "จบ/อยู่ในช่วงจบ" — ห้าม schedule/assign/priority/emergency อีก */
function pln_finished_statuses(): array {
    return array_merge(kpi_done_statuses(), ['completed', 'pending_verification', 'resolved']);
}

function pln_active_statuses(): array {
    return kpi_active_statuses();
}

function pln_execution_statuses(): array {
    // งานที่เริ่มทำไปแล้ว (มีเจ้าของงาน — ไม่ควรวางแผนใหม่ซ้ำ)
    return ['assigned', 'accepted', 'in_progress', 'paused', 'waiting_parts', 'waiting_external',
        'waiting_approval', 'completed', 'pending_verification', 'resolved'];
}

/* ───────────────────────── 1. กลุ่มคิววางแผน ───────────────────────── */

/**
 * คืนกลุ่มวางแผนของแถว (repair หรือ maintenance_request ที่ใส่ fields สถานะให้ครบ)
 * ลำดับความเร่ง: overdue > at_risk > scheduled > unscheduled > unplanned > new_request
 */
function pln_group(array $r, array $cfg, string $kind = 'workorder'): string {
    $status = (string)($r['status'] ?? '');
    if ($kind !== 'workorder') {
        if ($status === 'open') return 'new_request';
        return in_array($status, ['approved', 'in_progress', 'resolved', 'closed'], true) ? 'scheduled' : 'done';
    }
    if (in_array($status, pln_done_statuses(), true)) return 'done';
    if (kpi_is_overdue($r)) return 'overdue';
    $due = trim((string)($r['sla_due_at'] ?? ''));
    if ($due !== '' && $due !== '0000-00-00 00:00:00') {
        $t = strtotime($due);
        $riskWindow = (int)($cfg['sla_risk_hours'] ?? 24) * 3600;
        if ($t !== false && $t < strtotime('now') + $riskWindow) return 'at_risk';
    }
    $start = trim((string)($r['planned_start_at'] ?? ''));
    $end = trim((string)($r['planned_end_at'] ?? ''));
    if ($start !== '' && $end !== '') return 'scheduled';
    if (in_array($status, ['pending_approval', 'approved', 'draft'], true)) return 'unplanned';
    return 'unscheduled';
}

/* ───────────────────────── 3. ลำดับความสำคัญ + คำอธิบาย ───────────────────────── */

/**
 * อธิบายว่าทำไมใบงานนี้ "ควร" มีความเร่งด่วนสูง — อ่านจากข้อมูลจริง (ช่วย planner ตัดสินใจ)
 * ไม่เขียนกลับลง DB (ห้ามเปลี่ยน priority อัตโนมัติ — เปลี่ยนต้องผ่านคน + audit log)
 */
function pln_priority_explanation(PDO $pdo, array $r, ?array $asset = null): array {
    $reasons = [];
    $rule = 'update_priority'; // engine เสนอว่า planner ควรพิจารณาปรับ priority

    $criticality = strtoupper(trim((string)($r['asset_criticality'] ?? ($asset['criticality'] ?? ''))));
    if ($criticality === 'A') $reasons[] = ['key' => 'criticality_a', 'label' => 'เครื่องจักรวิกฤต (A)', 'weight' => 3];
    elseif ($criticality === 'B') $reasons[] = ['key' => 'criticality_b', 'label' => 'เครื่องจักรสำคัญ (B)', 'weight' => 1];

    $type = strtolower(trim((string)($r['work_order_type'] ?? 'breakdown')));
    if (in_array($type, ['breakdown', 'emergency'], true)) $reasons[] = ['key' => 'breakdown', 'label' => 'งานแจ้งซ่อม/ฉุกเฉิน', 'weight' => 2];
    if (in_array($type, ['breakdown', 'emergency'], true)) $rule = 'priority_critical';

    $priority = strtolower(trim((string)($r['priority'] ?? '')));
    if ($priority === 'critical') { $reasons[] = ['key' => 'priority_critical', 'label' => 'ระดับความเร่งด่วน: วิกฤต', 'weight' => 4]; $rule = 'priority_critical'; }
    elseif ($priority === 'high') $reasons[] = ['key' => 'priority_high', 'label' => 'ระดับความเร่งด่วน: สูง', 'weight' => 2];

    $due = trim((string)($r['sla_due_at'] ?? ''));
    $riskHours = (int)(pln_config($pdo)['sla_risk_hours'] ?? 24);
    if ($due !== '' && $due !== '0000-00-00 00:00:00') {
        $t = strtotime($due);
        if ($t !== false) {
            $hoursLeft = round(($t - time()) / 3600, 1);
            if ($hoursLeft < 0) $reasons[] = ['key' => 'overdue_sla', 'label' => 'เกิน SLA ' . kpi_overdue_days($r) . ' วัน', 'weight' => 5];
            elseif ($hoursLeft <= $riskHours) $reasons[] = ['key' => 'sla_at_risk', 'label' => "SLA จะหมดใน {$hoursLeft} ชม.", 'weight' => 3];
        }
    }
    if ((string)($r['safety_requirement'] ?? '') !== '') $reasons[] = ['key' => 'safety', 'label' => 'งานความเสี่ยงสูงต้องสวมอุปกรณ์นิรภัย', 'weight' => 1];

    if (!$reasons) $reasons[] = ['key' => 'routine', 'label' => 'งานปกติตามแผน', 'weight' => 0];

    $weight = array_sum(array_column($reasons, 'weight'));
    $level = $weight >= 7 ? 'CRITICAL' : ($weight >= 4 ? 'HIGH' : ($weight >= 1 ? 'NORMAL' : 'LOW'));

    return ['level' => $level, 'reasons' => $reasons, 'rule' => $rule];
}

/* ───────────────────────── 4. ระยะเวลางานจากประวัติ ───────────────────────── */

/**
 * ค่าเฉลี่ยระยะเวลาจากประวัติงานที่เสร็จจริง (repair_time_minutes > 0)
 * ลำดับ: failure_code_id เดียวกัน → เครื่องเดียวกัน → ทักษะเดียวกัน → หมวดเครื่องเดียวกัน
 * @return array{source:string,count:int,avg_minutes:int|float|null,min:int|null,max:int|null,basis:string}
 */
function pln_duration_estimate(PDO $pdo, array $r): array {
    $base = ['source' => 'none', 'count' => 0, 'avg_minutes' => null, 'min' => null, 'max' => null, 'basis' => ''];
    $clauses = [];
    $failure = (int)($r['failure_code_id'] ?? 0);
    $assetId = (int)($r['asset_id'] ?? 0);
    $skill = trim((string)($r['required_skill'] ?? ''));
    $assetCategory = trim((string)($r['asset_category'] ?? ''));

    if ($failure > 0) $clauses[] = ['label' => 'รหัสอาการเสียเดียวกัน', 'sql' => 'failure_code_id = ?', 'params' => [$failure]];
    if ($assetId > 0) $clauses[] = ['label' => 'เครื่องจักรเดียวกัน', 'sql' => 'asset_id = ?', 'params' => [$assetId]];
    if ($skill !== '') $clauses[] = ['label' => 'ทักษะที่ต้องการเดียวกัน', 'sql' => 'required_skill = ?', 'params' => [$skill]];
    if ($assetCategory !== '') $clauses[] = ['label' => 'หมวดเครื่องจักรเดียวกัน', 'sql' => 'asset_id IN (SELECT id FROM asset_registry WHERE category = ?)', 'params' => [$assetCategory]];

    foreach ($clauses as $c) {
        $q = $pdo->prepare('SELECT COUNT(*) c,
                                   AVG(repair_time_minutes) avg_min,
                                   MIN(repair_time_minutes) min_min,
                                   MAX(repair_time_minutes) max_min
                            FROM repair
                            WHERE status IN ("closed","verified","done")
                              AND repair_time_minutes IS NOT NULL AND repair_time_minutes > 0
                              AND created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY)
                              AND ' . $c['sql']);
        $q->execute($c['params']);
        $agg = $q->fetch(PDO::FETCH_ASSOC);
        if ((int)$agg['c'] >= 2) {
            return [
                'source' => 'history',
                'count' => (int)$agg['c'],
                'avg_minutes' => round((float)$agg['avg_min']),
                'min' => (int)$agg['min_min'],
                'max' => (int)$agg['max_min'],
                'basis' => 'ค่าเฉลี่ยประวัติ ' . (int)$agg['c'] . ' งาน (' . $c['label'] . ')',
            ];
        }
    }
    return $base;
}

/* ───────────────────────── 5. ทักษะช่าง ───────────────────────── */

/** ดึงทักษะช่าง (ทั้งหมด หรือเฉพาะคน) → [user_id => [ [skill_name, skill_level, ...], ... ]] */
function pln_get_skills(PDO $pdo, ?int $userId = null): array {
    $sql = 'SELECT user_id, skill_name, skill_level, certification, valid_until, area FROM technician_skills';
    $params = [];
    if ($userId) { $sql .= ' WHERE user_id = ?'; $params[] = $userId; }
    $sql .= ' ORDER BY user_id, skill_name';
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $uid = (int)$row['user_id'];
        $out[$uid][] = $row;
    }
    return $out;
}

/**
 * เทียบทีมที่มอบหมายกับทักษะที่ใบงานต้องการ
 * @return array{required:array,qualified:bool,missing:array,team_levels:array}
 */
function pln_skill_match(array $skillsByUser, array $teamUserIds, string $requiredSkill): array {
    $required = array_values(array_filter(array_map('trim', explode(',', $requiredSkill))));
    $teamLevels = [];
    foreach (array_values(array_unique(array_filter(array_map('intval', $teamUserIds)))) as $uid) {
        $teamLevels[$uid] = $skillsByUser[$uid] ?? [];
    }
    if (!$required) {
        return ['required' => [], 'qualified' => true, 'missing' => [], 'team_levels' => $teamLevels];
    }
    $missing = [];
    foreach ($required as $skill) {
        $has = false;
        foreach ($teamLevels as $list) {
            foreach ($list as $s) {
                if (mb_strtolower(trim((string)$s['skill_name'] ?? '')) === mb_strtolower($skill)) { $has = true; break 2; }
            }
        }
        if (!$has) $missing[] = $skill;
    }
    return ['required' => $required, 'qualified' => empty($missing), 'missing' => $missing, 'team_levels' => $teamLevels];
}

/* ───────────────────────── 6. Workload / Capacity ───────────────────────── */

/**
 * ภาระงานช่างในช่วงเวลา (ช่วงวางแผนตาม settings — capacity ต่อวันทำงานในหน้าต่าง)
 * @return array<int, array{user_id:int,user_name:string,assigned_minutes:int,total_minutes:int,utilization:int,active_jobs:int}>
 */
function pln_technician_workload(PDO $pdo, DateTimeInterface $from, DateTimeInterface $to, ?array $userIds = null): array {
    $cfg = pln_config($pdo);
    $techs = $pdo->prepare('SELECT u.id, u.full_name FROM users u
                            WHERE u.is_active = 1 AND u.role_id IN (1,2,3,6,7)' .
                            ($userIds ? ' AND u.id IN (' . implode(',', array_map('intval', $userIds)) . ')' : '') .
                            ' ORDER BY u.full_name');
    $techs->execute();
    $rows = $techs->fetchAll(PDO::FETCH_ASSOC);
    if (!$rows) return [];

    $fromStr = $from->format('Y-m-d 00:00:00');
    $toStr = $to->format('Y-m-d 00:00:00');

    // จำนวนวันทำงานตาม calendar จริง (เฉพาะวันที่ตั้งไว้ใน planning_working_days)
    $workDays = 0;
    $cursor = DateTimeImmutable::createFromInterface($from)->setTime(0, 0);
    $endDay = DateTimeImmutable::createFromInterface($to)->setTime(0, 0);
    $step = new DateInterval('P1D');
    while ($cursor < $endDay) {
        if (in_array((int)$cursor->format('N'), $cfg['working_days'], true)) $workDays++;
        $cursor = $cursor->add($step);
    }
    if ($workDays <= 0) $workDays = 1;
    $capacityMinPerTech = max(1, $cfg['shift_hours']) * 60 * $workDays;

    $active = pln_active_statuses();
    $in = implode(',', array_fill(0, count($active), '?'));

    $out = [];
    foreach ($rows as $t) {
        $uid = (int)$t['id'];
        $q = $pdo->prepare("SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE,
                                  GREATEST(r.planned_start_at, ?),
                                  LEAST(COALESCE(r.planned_end_at, r.planned_start_at), ?))), 0) AS mins,
                                  COUNT(DISTINCT r.id) AS jobs
                            FROM repair r
                            WHERE r.status IN ($in)
                              AND r.planned_start_at < ? AND COALESCE(r.planned_end_at, r.planned_start_at) > ?
                              AND (r.assigned_to = ? OR EXISTS (
                                    SELECT 1 FROM work_assignees wa WHERE wa.ref_type='repair' AND wa.ref_id = r.id AND wa.user_id = ?))");
        $q->execute(array_merge([$fromStr, $toStr], $active, [$toStr, $fromStr, $uid, $uid]));
        $agg = $q->fetch(PDO::FETCH_ASSOC);
        $assignedMin = (int)$agg['mins'];
        $out[$uid] = [
            'user_id' => $uid,
            'user_name' => (string)$t['full_name'],
            'assigned_minutes' => $assignedMin,
            'total_minutes' => $capacityMinPerTech,
            'utilization' => (int)round($capacityMinPerTech > 0 ? $assignedMin / $capacityMinPerTech * 100 : 0),
            'active_jobs' => (int)$agg['jobs'],
        ];
    }
    return $out;
}

/* ───────────────────────── 7. ตรวจสอบความขัดแย้ง ───────────────────────── */

/**
 * ตรวจหาเหตุการณ์ที่ชนกัน ช่วง [start, end) — ใช้ตอน assign/schedule/reschedule/bulk
 * ประเภท: 'technician' งานชนกันของช่าง/ทีม, 'asset' เครื่องถูกจองสองงาน, 'pm' ชนรอบ PM เดียวกัน
 */
function pln_detect_conflicts(PDO $pdo, string $start, string $end, ?array $userIds = null, int $excludeRepairId = 0, ?int $assetId = null): array {
    $conflicts = [];
    if ($start === '' || $end === '' || $start >= $end) return $conflicts;
    $active = pln_active_statuses();
    $in = implode(',', array_fill(0, count($active), '?'));
    $scope = '';

    // 1) ช่าง/ทีมชนกัน (จุดเดียวกับ supervisor p14_conflicts แต่คืน structured)
    if ($userIds) {
        foreach (array_values(array_unique(array_filter($userIds, fn($u) => (int)$u > 0))) as $uid) {
            $st = $pdo->prepare("SELECT r.id, r.work_order_no, r.title, r.planned_start_at, r.planned_end_at
                                 FROM repair r
                                 WHERE r.id != ? AND r.status IN ($in)
                                   AND r.planned_start_at < ? AND COALESCE(r.planned_end_at, r.planned_start_at) > ?
                                   AND (r.assigned_to = ? OR EXISTS (
                                         SELECT 1 FROM work_assignees wa WHERE wa.ref_type='repair' AND wa.ref_id=r.id AND wa.user_id=?))
                                 LIMIT 15");
            $st->execute(array_merge([$excludeRepairId], $active, [$end, $start, (int)$uid, (int)$uid]));
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $conflicts[] = [
                    'type' => 'technician',
                    'user_id' => (int)$uid,
                    'user_name' => pln_user_name($pdo, (int)$uid),
                    'wo' => ['id' => (int)$row['id'], 'work_order_no' => $row['work_order_no'], 'title' => $row['title']],
                    'overlap_from' => max($start, (string)$row['planned_start_at']),
                    'overlap_to' => min($end, (string)$row['planned_end_at']),
                    'severity' => 'high',
                ];
            }
        }
    }

    // 2) เครื่องจักรถูกจองสองงานในช่วงเดียวกัน
    if ($assetId) {
        $st = $pdo->prepare("SELECT r.id, r.work_order_no, r.title, r.priority, r.planned_start_at, r.planned_end_at
                             FROM repair r
                             WHERE r.id != ? AND r.status IN ($in) AND r.asset_id = ?
                               AND r.planned_start_at < ? AND COALESCE(r.planned_end_at, r.planned_start_at) > ?
                               AND r.source_type != 'pm'
                             LIMIT 10");
        $st->execute(array_merge([$excludeRepairId], $active, [$assetId, $end, $start]));
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $conflicts[] = [
                'type' => 'asset',
                'user_id' => 0,
                'user_name' => '',
                'wo' => ['id' => (int)$row['id'], 'work_order_no' => $row['work_order_no'], 'title' => $row['title']],
                'overlap_from' => max($start, (string)$row['planned_start_at']),
                'overlap_to' => min($end, (string)$row['planned_end_at']),
                'severity' => 'medium',
            ];
        }
    }

    // 3) ชนกับรอบ PM ที่ยังไม่ปิดบนเครื่องเดียวกัน (PM ต้องมีช่วงเวลาจริงบนเครื่อง)
    if ($assetId) {
        $st = $pdo->prepare("SELECT r.id, r.work_order_no, r.title, r.planned_start_at, r.planned_end_at
                             FROM repair r
                             WHERE r.id != ? AND r.status IN ($in) AND r.asset_id = ? AND r.source_type = 'pm'
                               AND r.planned_start_at < ? AND COALESCE(r.planned_end_at, r.planned_start_at) > ?
                             LIMIT 10");
        $st->execute(array_merge([$excludeRepairId], $active, [$assetId, $end, $start]));
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $conflicts[] = [
                'type' => 'pm',
                'user_id' => 0,
                'user_name' => '',
                'wo' => ['id' => (int)$row['id'], 'work_order_no' => $row['work_order_no'], 'title' => $row['title']],
                'overlap_from' => max($start, (string)$row['planned_start_at']),
                'overlap_to' => min($end, (string)$row['planned_end_at']),
                'severity' => 'low',
            ];
        }
    }

    usort($conflicts, fn($a, $b) => strtotime((string)$a['overlap_from']) <=> strtotime((string)$b['overlap_from']));
    return $conflicts;
}

/* ───────────────────────── 8. ความพร้อมทำงาน (Readiness) ───────────────────────── */

/**
 * เช็คความพร้อม 4 ด้าน (อธิบายได้ทุกข้อ): แผน/เวลา + มอบหมาย + ทักษะ + วัสดุ
 * - วัสดุ: อ่านจาก spare_issue_requests (Sage เป็นเจ้าของสต็อกจริง — ไม่เดาเอง)
 * @return array{state:string,checks:array<array{key:string,label:string,ok:bool,detail:string}>}
 */
function pln_readiness(PDO $pdo, array $r, array $skillsByUser = [], ?int $teamLeadId = null): array {
    $checks = [];

    // 1) ตารางงาน
    $hasStart = trim((string)($r['planned_start_at'] ?? '')) !== '';
    $hasEnd = trim((string)($r['planned_end_at'] ?? '')) !== '';
    $checks[] = [
        'key' => 'schedule', 'label' => 'กำหนดเวลา', 'ok' => $hasStart && $hasEnd,
        'detail' => ($hasStart && $hasEnd)
            ? substr((string)$r['planned_start_at'], 0, 16) . ' → ' . substr((string)$r['planned_end_at'], 0, 16)
            : 'ยังไม่มีรอบเวลาวางแผน',
    ];

    // 2) มอบหมาย
    $lead = $teamLeadId ?: (int)($r['assigned_to'] ?? 0);
    $checks[] = [
        'key' => 'assignee', 'label' => 'ผู้รับผิดชอบ', 'ok' => $lead > 0,
        'detail' => $lead > 0 ? (string)($r['assigned_name'] ?? $r['lead_name'] ?? 'หัวหน้างาน') : 'ยังไม่มอบหมายช่าง',
    ];

    // 3) ทักษะ (เฉพาะเมื่อใบงานระบุทักษะไว้ — ไม่ hard block แต่บันทึกเป็น Gap)
    $requiredSkill = trim((string)($r['required_skill'] ?? ''));
    $teamIds = isset($r['team_ids']) && is_array($r['team_ids']) ? $r['team_ids'] : ($lead ? [$lead] : []);
    $match = pln_skill_match($skillsByUser, $teamIds, $requiredSkill);
    $checks[] = [
        'key' => 'skill', 'label' => 'ทักษะช่าง', 'ok' => $match['qualified'],
        'detail' => $requiredSkill === ''
            ? 'ไม่ระบุทักษะ'
            : ($match['qualified'] ? 'ช่างมีทักษะตรง: ' . implode(', ', $match['required']) : 'ขาดทักษะ: ' . implode(', ', $match['missing'])),
    ];

    // 4) วัสดุ (Sage เป็นแหล่งที่มา — นับเฉพาะ request ที่ยังไม่ได้ปิด)
    $mat = $pdo->prepare("SELECT sir.id, sir.status, sir.sage_shipment_status
                          FROM spare_issue_requests sir
                          WHERE sir.work_order_id = ? AND sir.request_type = 'withdrawal'
                            AND sir.status IN ('pending','approved')
                          LIMIT 10");
    $mat->execute([(int)$r['id']]);
    $matRows = $mat->fetchAll(PDO::FETCH_ASSOC);
    if (!$matRows) {
        $checks[] = ['key' => 'parts', 'label' => 'อะไหล่', 'ok' => true, 'detail' => 'ไม่มีการขอเบิกค้าง'];
    } else {
        $blocked = false;
        $detail = [];
        foreach ($matRows as $m) {
            $st = strtolower((string)($m['status'] ?? ''));
            $shipped = strtolower(trim((string)($m['sage_shipment_status'] ?? ''))) === 'completed';
            $isBlocked = $st === 'pending' || ($st === 'approved' && !$shipped);
            if ($isBlocked) $blocked = true;
            $detail[] = 'คำขอ#' . (int)$m['id'] . ' (สถานะ ' . $m['status'] . ')';
        }
        $checks[] = [
            'key' => 'parts', 'label' => 'อะไหล่', 'ok' => !$blocked,
            'detail' => $blocked ? implode(', ', $detail) . ' → รอสต็อก/ส่งมอบ' : 'เบิกครบแล้ว',
        ];
    }

    $okCount = count(array_filter($checks, fn($c) => $c['ok']));
    $total = count($checks);
    $state = $okCount === $total ? 'READY' : ($okCount >= $total - 1 ? 'PARTIAL' : 'BLOCKED');
    return ['state' => $state, 'checks' => $checks];
}

/* ───────────────────────── 9. SLA risk ───────────────────────── */

function pln_sla_risk(array $r, int $riskHours = 24): string {
    if (in_array((string)($r['status'] ?? ''), pln_done_statuses(), true)) return 'safe';
    if (kpi_is_overdue($r)) return 'breached';
    $due = trim((string)($r['sla_due_at'] ?? ''));
    if ($due === '' || $due === '0000-00-00 00:00:00') return 'safe';
    $t = strtotime($due);
    if ($t === false) return 'safe';
    $window = max(1, $riskHours) * 3600;
    if ($t < time() + $window) return 'at_risk';
    return 'safe';
}

/* ───────────────────────── 10. ประกอบแถวสำหรับ UI ───────────────────────── */

/** เติมข้อมูลวางแผนครบชุดให้ repair row (ใช้ GET center/queue/calendar ร่วมกัน) */
function pln_prepare(PDO $pdo, array $r, array $cfg, array $skillsByUser = [], bool $withReadiness = true): array {
    // คำขอซ่อมใหม่ (maintenance_request) — ยังไม่ใช่ใบงาน: ยังไม่มอบหมาย/ยังไม่มีรอบเวลา/ยังไม่ตัดสต็อก
    if (($r['kind'] ?? 'workorder') === 'request') {
        $out = $r;
        $out['group'] = pln_group($r, $cfg, 'request');
        $out['sla_risk'] = 'safe';
        $out['overdue'] = false;
        $out['priority_explanation'] = pln_priority_explanation($pdo, $r);
        $out['duration_estimate'] = pln_duration_estimate($pdo, $r);
        $out['skill_match'] = ['required' => [], 'qualified' => true, 'missing' => [], 'team_levels' => []];
        $out['team'] = [];
        $out['team_ids'] = [];
        return $out;
    }
    $skillsByUser = $skillsByUser ?: pln_get_skills($pdo);
    $team = isset($r['team']) && is_array($r['team']) ? $r['team'] : getWorkAssignees($pdo, 'repair', (int)$r['id']);
    $teamIds = array_map('intval', array_column($team, 'user_id'));
    if (!empty($r['assigned_to']) && !in_array((int)$r['assigned_to'], $teamIds, true)) $teamIds[] = (int)$r['assigned_to'];

    $priority = pln_priority_explanation($pdo, $r);
    $match = pln_skill_match($skillsByUser, $teamIds, trim((string)($r['required_skill'] ?? '')));

    $out = $r;
    $out['group'] = pln_group($r, $cfg);
    $out['sla_risk'] = pln_sla_risk($r, (int)$cfg['sla_risk_hours']);
    $out['overdue'] = kpi_is_overdue($r);
    $out['priority_explanation'] = $priority;
    $out['duration_estimate'] = pln_duration_estimate($pdo, $r);
    $out['skill_match'] = $match;
    $out['team'] = $team;
    $out['team_ids'] = $teamIds;
    if ($withReadiness) {
        $out['readiness'] = pln_readiness($pdo, $r, $skillsByUser, (int)($r['assigned_to'] ?? 0));
    }
    return $out;
}

/* ───────────────────────── utilities ───────────────────────── */

function pln_user_name(PDO $pdo, int $uid): string {
    if (!$uid) return '-';
    $st = $pdo->prepare('SELECT full_name FROM users WHERE id = ?');
    $st->execute([$uid]);
    return (string)($st->fetchColumn() ?: '-');
}

/** เขียน audit trail ลง repair_schedule_log + repair_activity_log (ทุก schedule/assign/priority ต้องมี) */
function pln_log_schedule(PDO $pdo, int $repairId, string $action, array $before, array $after, ?string $reason = null, ?int $uid = null): void {
    $uid = $uid ?: (int)($_SESSION['user_id'] ?? 0);
    try {
        $st = $pdo->prepare('INSERT INTO repair_schedule_log
            (repair_id, action, old_start_at, new_start_at, old_end_at, new_end_at,
             old_assignee_id, new_assignee_id, old_priority, new_priority, reason, changed_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute([
            $repairId, $action,
            $before['planned_start_at'] ?? null, $after['planned_start_at'] ?? null,
            $before['planned_end_at'] ?? null, $after['planned_end_at'] ?? null,
            $before['assigned_to'] ?? null, $after['assigned_to'] ?? null,
            $before['priority'] ?? null, $after['priority'] ?? null,
            $reason !== null && $reason !== '' ? mb_substr($reason, 0, 250) : null,
            $uid,
        ]);
    } catch (Exception $e) {
        error_log('[planning] repair_schedule_log: ' . $e->getMessage());
    }
    $labels = [
        'schedule' => 'วางแผนรอบเวลา', 'reschedule' => 'เลื่อนกำหนดงาน', 'assign' => 'มอบหมายงาน',
        'priority' => 'ปรับลำดับความสำคัญ', 'emergency' => 'ประกาศงานฉุกเฉิน', 'bulk' => 'วางแผนแบบกลุ่ม',
    ];
    try {
        $desc = $labels[$action] ?? $action;
        if ($reason !== null && $reason !== '') $desc .= ' — ' . mb_substr($reason, 0, 200);
        $a = $pdo->prepare('INSERT INTO repair_activity_log (repair_id, user_id, action, description, old_value, new_value, created_at)
                            VALUES (?,?,?,?,?,?,NOW())');
        $a->execute([$repairId, $uid, $action, $desc, ($before['planned_start_at'] ?? '') . ($before['assigned_to'] ?? '') ?: null, ($after['planned_start_at'] ?? '') ?: null]);
    } catch (Exception $e) {
        error_log('[planning] repair_activity_log: ' . $e->getMessage());
    }
}
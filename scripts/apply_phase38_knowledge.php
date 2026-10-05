<?php
/**
 * scripts/apply_phase38_knowledge.php — idempotent DB migration (Phase 38)
 *
 * Document & Knowledge Management. Phase 32 already owns the CONTROLLED layer
 * (controlled_documents / document_revisions / document_approvals /
 * document_impacts / document_acknowledgements / document_training /
 * document_links / document_activity). This script creates the KNOWLEDGE layer
 * only and touches no Phase 32 table:
 *
 *   1) knowledge_category           - taxonomy tree (a category is not a doc_type)
 *   2) knowledge_article            - symptom -> cause -> resolution -> prevention
 *   3) knowledge_published_guard    - at most one published article per article_key
 *   4) knowledge_tag                - tag vocabulary
 *   5) knowledge_article_tag        - normalised article tagging
 *   6) knowledge_relation           - article -> CMMS record (reference only)
 *   7) knowledge_document_ref       - the only bridge to Phase 32 documents
 *   8) knowledge_usage              - real usage + helpfulness events
 *   9) knowledge_search_log         - every search, including zero-result ones
 *  10) knowledge_gap                - owned, closable knowledge gaps
 *  11) knowledge_review             - review cycle for published knowledge
 *  12) knowledge_activity           - append-only module activity log
 *  13) additive index on failure_events.equipment_serial_no if present
 *  14) settings group 'knowledge'
 *  15) notification_templates module 'knowledge'
 *  16) menu_permissions for the Knowledge Center routes
 *
 * NON-NEGOTIABLE GUARDS
 *   1) NO DESTRUCTIVE STATEMENT. CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD only.
 *      No Phase 32 table is ALTERed, and no existing row anywhere is moved.
 *   2) NO DUPLICATED CONTROL. No table, column or enum in this schema re-implements
 *      a Phase 32 rule. Revisions, approval chains, impacts, acknowledgements,
 *      training and file storage stay in Phase 32 and are referenced, not copied.
 *   3) NO INVENTED USAGE. knowledge_usage / knowledge_search_log are written by the
 *      API at the moment a real user acts. Nothing is back-filled, estimated or
 *      seeded with example rows.
 *   4) A PUBLISHED ARTICLE IS NOT DELETED. It is superseded or archived, and
 *      knowledge_activity keeps the history.
 *   5) references are validated before insert: knowledge_relation and
 *      knowledge_document_ref must point at a row that actually exists.
 *
 * MySQL COMMENTs are ASCII-only; Thai copy lives in PHP seeds and docs/*.md.
 *
 * Run: php scripts/apply_phase38_knowledge.php --apply
 *   --dry-run   print every statement that would run, touch nothing
 *   --apply     execute (requires --yes against a production-looking database)
 *   --yes       acknowledge that this writes to the live schema
 *   --help      usage only
 */
$argvFlags = [];
foreach (array_slice($argv ?? [], 1) as $arg) {
    $argvFlags[ltrim((string)$arg, '-')] = true;
}
if (isset($argvFlags['help']) || isset($argvFlags['h'])) {
    echo "Usage:\n";
    echo "  php scripts/apply_phase38_knowledge.php --dry-run\n";
    echo "  php scripts/apply_phase38_knowledge.php --apply [--yes]\n\n";
    echo "This migration writes to the database schema. Nothing runs without --apply.\n";
    exit(0);
}
if (!isset($argvFlags['apply']) && !isset($argvFlags['dry-run'])) {
    fwrite(STDERR, "Refusing to run: this migration writes to the schema.\n"
        . "Use --dry-run to preview, or --apply to execute.\n");
    exit(2);
}

require_once __DIR__ . '/../src/config/db.php';

$pdo = getDb();
$targetDb = (string)$pdo->query('SELECT DATABASE()')->fetchColumn();
$isProdLike = (bool)preg_match('/^(cmms|cmms_|cmmstpt)/i', $targetDb)
    || !preg_match('/(_sdtest|_test|_dev|_scratch|_tmp)$/i', $targetDb);
// --yes is only required when statements will really run. A --dry-run prints a
// preview, so demanding confirmation for it would train the operator to type --yes
// reflexively, which is exactly when it stops meaning anything.
if ($isProdLike && isset($argvFlags['apply']) && !isset($argvFlags['yes'])) {
    fwrite(STDERR, "Refusing to run: target database '{$targetDb}' looks like production.\n"
        . "Re-run with --yes to confirm you want to alter this schema.\n"
        . "Scratch databases ending in _sdtest/_test/_dev do not need --yes.\n");
    exit(3);
}
echo "target database: {$targetDb}" . PHP_EOL;

$DRY_RUN = !empty($argvFlags['dry-run']);
$changed = 0;
$log = function (string $msg): void { echo $msg . PHP_EOL; };

$hasTable = function (string $table) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
};
$hasColumn = function (string $table, string $column) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?');
    $st->execute([$table, $column]);
    return (int)$st->fetchColumn() > 0;
};
$hasIndex = function (string $table, string $index) use ($pdo): bool {
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS
                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?');
    $st->execute([$table, $index]);
    return (int)$st->fetchColumn() > 0;
};

$exec = function (string $sql, string $label) use ($pdo, $DRY_RUN, $log, &$changed): void {
    $sql = trim($sql);
    if ($sql === '' || str_starts_with($sql, '--')) return;
    if ($DRY_RUN) {
        $log('~ ' . $label . ' (dry-run)');
        return;
    }
    try {
        $pdo->exec($sql);
        $log('+ ' . $label);
        $changed++;
    } catch (Throwable $e) {
        $log('! ' . $label . ' -> ' . $e->getMessage());
    }
};

$sqlFile = __DIR__ . '/../database/migration_20260924_phase38_knowledge.sql';
if (!is_file($sqlFile)) {
    fwrite(STDERR, "Migration SQL not found: {$sqlFile}\n");
    exit(4);
}

/* ============================================================
 * 0) Preconditions — the bridge table cannot be created before Phase 32.
 * Failing loudly here is better than creating knowledge_document_ref with a
 * missing foreign key target and reporting a confusing error later.
 * ============================================================ */
$phase32Tables = ['controlled_documents', 'document_revisions'];
foreach ($phase32Tables as $t) {
    if (!$hasTable($t)) {
        fwrite(STDERR, "Missing Phase 32 table '{$t}'. Run scripts/apply_phase32_engineering_change.php first.\n");
        exit(5);
    }
}
$log('phase 32 preconditions: ok (controlled_documents, document_revisions present)');

/* ============================================================
 * 1) Schema — replay the CREATE TABLE block of the .sql file.
 * Everything in the file is CREATE TABLE IF NOT EXISTS, so a plain replay is
 * idempotent by construction and a partially applied migration resumes cleanly.
 * ============================================================ */
$raw = (string)file_get_contents($sqlFile);
$raw = preg_replace('/^\s*--.*$/m', '', $raw) ?? $raw;
$statements = array_values(array_filter(array_map('trim', explode(";\n", $raw))));
$log('--- schema statements ---');
foreach ($statements as $s) {
    if ($s === '' || str_starts_with($s, '--')) continue;
    $label = 'DDL';
    if (preg_match('/^\s*CREATE TABLE IF NOT EXISTS\s+`?([a-z0-9_]+)`?/i', $s, $m)) {
        $label = 'table ' . $m[1];
        if ($hasTable($m[1])) { $log('= table ' . $m[1] . ' (exists)'); continue; }
    }
    $exec($s, $label);
}

/* ============================================================
 * 2) Additive index used by the knowledge search over equipment context.
 * Pure ADD INDEX: no column type, no data, no constraint is touched.
 * ============================================================ */
if ($hasTable('failure_events') && $hasColumn('failure_events', 'equipment_serial_no')
    && !$hasIndex('failure_events', 'idx_fe_equipment_serial')) {
    $exec('ALTER TABLE `failure_events` ADD INDEX `idx_fe_equipment_serial` (`equipment_serial_no`)',
        'index failure_events.idx_fe_equipment_serial');
} else {
    $log('~ index failure_events.idx_fe_equipment_serial (skipped: column or index state)');
}

/* ============================================================
 * 2b) knowledge_usage.action needs its own value for "the user answered".
 * A feedback row used to be stored as action='view', which silently inflated
 * the view count of every article somebody rated. The value is added, never
 * removed, so existing rows keep their meaning.
 * ============================================================ */
if ($hasTable('knowledge_usage')) {
    $q = $pdo->prepare('SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = \'knowledge_usage\'
                          AND COLUMN_NAME = \'action\'');
    $q->execute();
    $actionType = (string)$q->fetchColumn();
    if ($actionType !== '' && stripos($actionType, '\'feedback\'') === false) {
        $exec('ALTER TABLE `knowledge_usage`
               MODIFY COLUMN `action`
               ENUM(\'view\',\'open_procedure\',\'print\',\'download\',\'copy_link\',\'search_hit\',\'acknowledge\',\'feedback\')
               NOT NULL COMMENT \'a real user action; feedback is not a view\'',
            'knowledge_usage.action += feedback');
    } else {
        $log('= knowledge_usage.action (feedback present)');
    }
}

/* ============================================================
 * 3) knowledge_category — a small shipped taxonomy.
 * These are LABELS, not knowledge: zero articles, zero usage, nothing claimed.
 * An operator renames or retires them freely.
 * ============================================================ */
$categories = [
    ['TROUBLE', 'คู่มือแก้ปัญหาเครื่องจักร', 'Troubleshooting Guides', 10],
    ['PROC', 'วิธีทำงาน/ขั้นตอนการบำรุงรักษา', 'Maintenance Procedures', 20],
    ['CLEAN', 'การทำความสะอาด/ดูแลระหว่างใช้งาน', 'Cleaning & Care', 30],
    ['LUBE', 'การหล่อลื่น/การเปลี่ยนน้ำมัน', 'Lubrication', 40],
    ['TIGHT', 'การปรับ/แน่นชิ้นส่วน', 'Adjustment & Tightening', 50],
    ['ALIGN', 'การตั้ง/เชื่อม/วัดสายพา', 'Alignment & Belting', 60],
    ['ELEC', 'ข้อมูลทางไฟฟ้า/เซ็นเซอร์', 'Electrical & Sensors', 70],
    ['SAFE', 'ความปลอดภัย/LOTO/การป้องกัน', 'Safety & LOTO', 80],
    ['SPARE', 'ข้อมูลอะไหล่/การเลือกใช้', 'Spare Parts & Selection', 90],
    ['LESSON', 'บทเรียนจากเหตุการณ์จริง', 'Lessons Learned', 100],
    ['SETUP', 'การติดตั้ง/ commissioning', 'Installation & Commissioning', 110],
];
$catIns = $pdo->prepare('INSERT IGNORE INTO knowledge_category (code, name_th, name_en, sort_order) VALUES (?, ?, ?, ?)');
foreach ($categories as [$code, $th, $en, $sort]) {
    $st = $pdo->prepare('SELECT id FROM knowledge_category WHERE code = ?');
    $st->execute([$code]);
    if ($st->fetchColumn()) { $log('= knowledge_category.' . $code . ' (exists)'); continue; }
    if ($DRY_RUN) { $log('~ knowledge_category.' . $code . ' (would add)'); $changed++; continue; }
    $catIns->execute([$code, $th, $en, $sort]);
    $changed++;
    $log('+ knowledge_category.' . $code);
}

/* ============================================================
 * 4) knowledge_tag — a starter vocabulary, also label-only.
 * Tag casing is folded to lower-case by the engine so "Bearing" and "bearing"
 * cannot become two different tags.
 * ============================================================ */
$tags = ['troubleshooting', 'lubrication', 'cleaning', 'inspection', 'alignment',
    'electrical', 'sensor', 'safety', 'loto', 'spare-part', 'replacement',
    'inspection-checklist', 'commissioning', 'root-cause', 'recurring-fault',
    'after-repair', 'torque', 'belt', 'bearing', 'seal', 'filter', 'valve',
    'pump', 'motor', 'gearbox', 'conveyor', 'compressor', 'sensor-loop'];
$tagIns = $pdo->prepare('INSERT IGNORE INTO knowledge_tag (tag) VALUES (?)');
$tagAdded = 0;
foreach ($tags as $t) {
    $st = $pdo->prepare('SELECT id FROM knowledge_tag WHERE tag = ?');
    $st->execute([$t]);
    if ($st->fetchColumn()) continue;
    if ($DRY_RUN) { $tagAdded++; continue; }
    $tagIns->execute([$t]);
    $tagAdded++;
    $changed++;
}
$log('+ knowledge_tag: ' . $tagAdded . ' added' . ($DRY_RUN ? ' (dry-run)' : ''));

/* ============================================================
 * 5) settings group 'knowledge'
 *
 * Every value below is an OPERATOR DECISION with a documented default. The engine
 * reads a missing setting as "not configured" and reports the affected result as
 * NOT_CONFIGURED rather than guessing.
 * ============================================================ */
$settings = [
    ['knowledge_enabled', '1', '1 = เปิดใช้ Knowledge Center; 0 = ซ่อนเมนูและปฏิเสธคำค้นหา'],
    ['knowledge_search_include_documents', '1', '1 = ค้นหาข้าม Knowledge + Controlled Documents (Phase 32); 0 = ค้นเฉพาะ Knowledge'],
    ['knowledge_search_include_manuals', '0', '1 = รวมคู่มือ legacy (manuals) ในผลค้นหา — ปิดไว้เป็นค่าเริ่มต้นเพราะ manuals ไม่ได้อยู่ในวงการควบคุมเอกสาร'],
    ['knowledge_min_query_len', '2', 'ความยาวคำค้นหาขั้นต่ำ (อักขระ) ก่อนยอมค้น — กันบันทึกคำค้นหาขยะ'],
    ['knowledge_max_results', '50', 'จำนวนผลลัพธ์สูงสุดต่อหนึ่งการค้นหา'],
    ['knowledge_result_window_days', '365', 'ช่วงวันที่ที่ใช้ค้นหาบทเรียน/เหตุการณ์ (ไม่เกินกำหนด)'],
    ['knowledge_usage_log_enabled', '1', '1 = บันทึกเหตุการณ์การใช้งานจริงลง knowledge_usage'],
    ['knowledge_search_log_enabled', '1', '1 = บันทึกทุกการค้นหา (รวมที่ไม่มีผลลัพธ์) ลง knowledge_search_log'],
    ['knowledge_auto_create_gap', '1', '1 = สร้าง/เพิ่ม knowledge_gap อัตโนมัติเมื่อค้นหาแล้วไม่มีผล — เป็นการนับจริงจากคำค้นหา ไม่ใช่การสรุปเชิงเนื้อหา'],
    ['knowledge_gap_min_occurrences', '2', 'จำนวนครั้งที่ค้นหาไม่มีผลขั้นต่ำก่อนเปิดเป็น knowledge_gap (กันเปิด gap จากการพิมพ์ผิดครั้งเดียว)'],
    ['knowledge_gap_window_days', '180', 'ช่วงเวลาที่นับคำค้นหาซ้ำของ gap'],
    ['knowledge_gap_default_priority', 'medium', 'ลำดับความสำคัญเริ่มต้นของ gap: low|medium|high|critical (ระบบจะไม่ตัดสินความสำคัญแทนผู้ใช้ เว้นแต่ผู้ใช้ยืนยัน)'],
    ['knowledge_review_default_days', '180', 'รอบตรวจทบทวนความรู้เริ่มต้น (วัน) ถ้าบทความไม่ได้กำหนดเอง — ใส่เฉพาะตอนสร้างใหม่ ไม่ย้อนแก้บทความที่เผยแพร่แล้ว'],
    ['knowledge_review_overdue_warn_days', '14', 'เตือนเมื่อครบกำหนดตรวจทบทวนล่วงเล้าเกินกี่วัน'],
    ['knowledge_publish_requires_approved', '1', '1 = บทความต้องผ่าน approved ก่อน published เสมอ'],
    ['knowledge_publish_requires_review_record', '1', '1 = ต้องมีบันทึกการตรวจทบทวน (knowledge_review) ก่อนเผยแพร่ครั้งแรก'],
    ['knowledge_publish_requires_category', '1', '1 = ต้องเลือกหมวดหมู่ก่อนเผยแพร่'],
    ['knowledge_publish_requires_relation', '0', '0 = ยังไม่บังคับให้ผูกกับเครื่อง/กลุ่มเครื่องก่อนเผยแพร่ (เปิดบังคับเมื่อฐานข้อมูลเครื่องพร้อม)'],
    ['knowledge_auto_check_document_stale', '1', '1 = ตรวจว่า revision เอกสารที่อ้างอิงยังเป็นฉบับมีผลอยู่ แล้วตั้ง is_stale — ไม่แก้เนื้อหาบทความอัตโนมัติ'],
    ['knowledge_helpfulness_enabled', '1', '1 = แสดงปุ่มบอกว่าความรู้นี้ช่วยไหม (บันทึกความคิดเห็นจริง ไม่อนุมานความพอใจจากการเปิดอ่าน)'],
    ['knowledge_usage_retention_days', '730', 'เก็บเหตุการณ์การใช้งานย้อนหลังกี่วัน (เกินจะถูกตัดด้วยงานบำรุงรักษา ไม่ลบเอง)'],
    ['knowledge_search_log_retention_days', '730', 'เก็บบันทึกการค้นหาย้อนหลังกี่วัน'],
    ['knowledge_page_default_size', '25', 'จำนวนแถวต่อหน้าเริ่มต้น'],
    ['knowledge_export_row_limit', '50000', 'เพดานจำนวนแถวต่อการ export'],
    ['knowledge_privileged_roles', '1,2,6', 'role ที่เห็นความรู้ restricted/confidential และทุก draft — 1=Admin 2=Manager 6=ASST Manager; การขยายสิทธิ์นี้ต้องตัดสินใจอย่างชัดเจน'],
];
$setSel = $pdo->prepare('SELECT id FROM settings WHERE setting_key = ?');
$setIns = $pdo->prepare('INSERT INTO settings (setting_key, setting_value, setting_group, description) VALUES (?, ?, "knowledge", ?)');
foreach ($settings as [$k, $v, $desc]) {
    $setSel->execute([$k]);
    if ($setSel->fetchColumn()) { $log('~ settings.' . $k . ' (existed)'); continue; }
    if ($DRY_RUN) { $log('~ settings.' . $k . ' (would add)'); $changed++; continue; }
    $setIns->execute([$k, $v, $desc]);
    $changed++;
    $log('+ settings.' . $k);
}

/* ============================================================
 * 6) notification_templates module 'knowledge'
 * Dedupe is server-side through notification_events.event_key inside
 * NotificationCenterService::notify().
 * ============================================================ */
$ntpls = [
    ['knowledge', 'gap_opened', 'Knowledge: เปิด Knowledge Gap ใหม่: {search_term}',
        "พบจากการค้นหาที่ไม่มีผลลัพธ์ {occurrence_count} ครั้ง\nเครื่อง: {asset_name}\nครั้งล่าสุด: {last_seen_at}", 'warning', '/knowledge/gaps'],
    ['knowledge', 'gap_escalated', 'Knowledge: Knowledge Gap เร่งด่วนขึ้น: {search_term}',
        "จำนวนครั้งที่ค้นไม่เจอ: {occurrence_count}\nลำดับความสำคัญเดิม: {old_priority}\nลำดับความสำคัญใหม่: {new_priority}\nเหตุผล: {reason}", 'critical', '/knowledge/gaps'],
    ['knowledge', 'gap_assigned', 'Knowledge: มอบหมายงานเขียน Knowledge: {search_term}',
        "ผู้รับผิดชอบ: {assignee}\nกำหนดส่ง: {due_date}\nผู้มอบหมาย: {triager}", 'info', '/knowledge/gaps'],
    ['knowledge', 'gap_resolved', 'Knowledge: ปิด Knowledge Gap แล้ว: {search_term}',
        "บทความที่ปิด gap: {article_title} ({article_key})\nผู้ปิด: {resolved_by}\nเวลา: {resolved_at}", 'info', '/knowledge/gaps'],
    ['knowledge', 'article_submitted', 'Knowledge: ส่งบทความเข้ารีวิว: {article_key}',
        "หัวข้อ: {title}\nผู้ส่ง: {author}\nหมวดหมู่: {category}", 'info', '/knowledge/articles/{article_id}'],
    ['knowledge', 'article_published', 'Knowledge: เผยแพร่บทความ: {article_key}',
        "หัวข้อ: {title}\nผู้เผยแพร่: {publisher}\nรอบตรวจทบทวนถัดไป: {next_review_date}", 'info', '/knowledge/articles/{article_id}'],
    ['knowledge', 'article_superseded', 'Knowledge: บทความถูกแทนที่: {article_key}',
        "ฉบับที่แทนที่: {old_version}\nฉบับใหม่: {new_version}\nผู้แทนที่: {actor}", 'warning', '/knowledge/articles/{article_id}'],
    ['knowledge', 'article_not_helpful', 'Knowledge: ผู้ใช้รายงานว่าความรู้นี้ไม่ช่วย: {article_key}',
        "หัวข้อ: {title}\nผู้รายงาน: {reporter}\nความคิดเห็น: {comment}\nเวลา: {created_at}", 'warning', '/knowledge/articles/{article_id}'],
    ['knowledge', 'review_due', 'Knowledge: ครบกำหนดตรวจทบทวน: {article_key}',
        "หัวข้อ: {title}\nกำหนดตรวจ: {next_review_date}\nผู้รับผิดชอบ: {review_owner}", 'warning', '/knowledge/reviews'],
    ['knowledge', 'review_overdue', 'Knowledge: ตรวจทบทวนค้างเกินกำหนด: {article_key}',
        "หัวข้อ: {title}\nกำหนดตรวจ: {next_review_date}\nเกินกำหนด: {overdue_days} วัน", 'critical', '/knowledge/reviews'],
    ['knowledge', 'document_revision_changed', 'Knowledge: revision เอกสารที่อ้างอิงเปลี่ยน ควรตรวจบทความ: {article_key}',
        "บทความ: {title}\nเอกสาร: {document_no}\nrevision ที่เขียนอ้างอิง: {old_revision}\nrevision ปัจจุบัน: {new_revision}", 'warning', '/knowledge/articles/{article_id}'],
];
foreach ($ntpls as [$mod, $evt, $title, $msg, $prio, $url]) {
    $st = $pdo->prepare('SELECT id FROM notification_templates WHERE module = ? AND event = ?');
    $st->execute([$mod, $evt]);
    if ($st->fetchColumn()) { $log('~ notification_templates.' . $mod . ':' . $evt . ' (existed)'); continue; }
    if ($DRY_RUN) { $log('~ notification_templates.' . $mod . ':' . $evt . ' (would add)'); $changed++; continue; }
    $pdo->prepare('INSERT INTO notification_templates (module, event, title_template, message_template, priority, url_template) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$mod, $evt, $title, $msg, $prio, $url]);
    $changed++;
    $log('+ notification_templates.' . $mod . ':' . $evt);
}

/* ============================================================
 * 7) menu_permissions for the Knowledge Center routes.
 *
 * Reading knowledge must be as easy as reading a document: engineers and
 * technicians (roles 3/4) can read and can record helpfulness, but authoring and
 * approving follow the same separation used in Phase 32 documents.
 * ============================================================ */
$menuSeeds = [
    ['knowledge', [1, 2, 3, 4, 5, 6]],
    ['knowledge/search', [1, 2, 3, 4, 5, 6]],
    ['knowledge/articles', [1, 2, 3, 4, 5, 6]],
    ['knowledge/articles/create', [1, 2, 6, 7]],
    ['knowledge/categories', [1, 2, 6]],
    ['knowledge/reviews', [1, 2, 6]],
    ['knowledge/gaps', [1, 2, 3, 4, 6]],
    ['knowledge/usage', [1, 2, 6]],
    ['knowledge/tags', [1, 2, 6]],
    ['knowledge/config', [1, 2]],
];
foreach ($menuSeeds as [$key, $roles]) {
    foreach ($roles as $roleId) {
        $st = $pdo->prepare('SELECT COUNT(*) FROM menu_permissions WHERE role_id = ? AND menu_key = ?');
        $st->execute([$roleId, $key]);
        if ((int)$st->fetchColumn() > 0) continue;
        if ($DRY_RUN) { $log('~ menu_permissions.' . $key . ' (role ' . $roleId . ', would grant)'); $changed++; continue; }
        $pdo->prepare('INSERT INTO menu_permissions (role_id, menu_key, is_granted) VALUES (?, ?, 1)')->execute([$roleId, $key]);
        $changed++;
    }
}
$log('+ menu_permissions: ' . count($menuSeeds) . ' keys seeded');

$log('');
$log('Phase 38 Document & Knowledge Management (knowledge layer) migration complete. changes=' . $changed);
$log('Phase 32 controlled-document tables were read for the bridge only; none were altered.');
$log('No article, usage, search or gap row was fabricated — those come from real user actions.');

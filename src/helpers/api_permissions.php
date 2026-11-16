<?php
/**
 * api_permissions.php — Permission matrix ระดับ endpoint (read / write / approve)
 *
 * เป้าหมาย: ทำให้ทุก endpoint มี "สิทธิ์ที่ต้องการ" ประกาศไว้ที่เดียว แทนการพึ่ง
 * requireLogin() เฉย ๆ (ซึ่งแปลว่า "ใครล็อกอินแล้วทำได้ทุกอย่าง")
 *
 * วิธีใช้: ถูกเรียกอัตโนมัติจาก requireLogin() (src/auth.php) — ไม่ต้องแก้ไฟล์ endpoint
 * ทีละไฟล์ และไม่แตะ logic ภายใน endpoint
 *
 *   - API_ENDPOINT_PERMISSIONS : matrix ของทุก endpoint (module + action สำหรับ read/write)
 *   - API_PERMISSION_ENFORCED  : รายชื่อ endpoint ที่ "บังคับใช้จริง" แล้วในรอบนี้
 *     (เพิ่มชื่อเข้าไปได้เรื่อย ๆ เมื่อทดสอบกับผู้ใช้จริงในบทบาทนั้นแล้ว — ดู docs/API_PERMISSION_MATRIX.md)
 *
 * หลักการตัดสินใจเมื่อไม่ระบุ action (null):
 *   null = endpoint นี้ไม่ต้องใช้ permission เพิ่ม (เช่น ข้อมูลของตัวเอง, public โดยออกแบบ,
 *   หรือ endpoint ที่ระบบตรวจด้วยกลไกอื่นแล้ว เช่น token/signature)
 *
 * สิทธิ์จริงมาจาก requirePerm() → canPerm() → perm_allowed() ใน src/helpers/permissions.php
 * (user_permissions override > role override > PERMISSION_MATRIX default; Admin ผ่านทุกอย่าง)
 */

require_once __DIR__ . '/permissions.php';

/**
 * module/action ที่แต่ละ endpoint ต้องใช้
 *   'read'  = GET/HEAD
 *   'write' = POST/PUT/PATCH/DELETE
 *   ['users','view','param'=>'id'] = บังคับเฉพาะเมื่อมี query param ที่ระบุ (ใช้กับ endpoint
 *   ที่หน้าเว็บของช่างเรียกเพื่อเติม dropdown — ลดความเสี่ยงพังโดยไม่ตั้งใจ)
 */
const API_ENDPOINT_PERMISSIONS = [
    /* ---------- Work order / งานซ่อม ---------- */
    'repair.php'                 => ['read' => ['repair', 'view'],        'write' => ['repair', 'edit']],
    'repair_attachment.php'      => ['read' => ['repair', 'view'],        'write' => ['repair', 'edit']],
    'repair_form_attachment.php' => ['read' => ['repair', 'view'],        'write' => ['repair', 'edit']],
    'repair_video.php'           => ['read' => ['repair', 'view'],        'write' => ['repair', 'edit']],
    'approval.php'               => ['read' => ['request', 'view'],       'write' => ['request', 'approve']],
    'planning.php'               => ['read' => ['repair', 'view'],        'write' => ['repair', 'schedule']],
    'supervisor.php'             => ['read' => ['repair', 'view'],        'write' => ['repair', 'verify']],
    'workload.php'               => ['read' => ['repair', 'view'],        'write' => null],
    'dashboard.php'              => ['read' => ['dashboard', 'view'],     'write' => null],
    'kpi_dashboard.php'          => ['read' => ['dashboard', 'view'],     'write' => null],

    /* ---------- PM / Inspection / Calibration ---------- */
    'pm_am.php'                  => ['read' => ['pm_am', 'view'],         'write' => ['pm_am', 'edit']],
    'pm_plans.php'               => ['read' => ['pm_am', 'view'],         'write' => ['pm_am', 'edit']],
    'pm_reminders.php'           => ['read' => ['pm_am', 'view'],         'write' => ['pm_am', 'execute']],
    'pm_ical.php'                => ['read' => null,                      'write' => null], // feed สำหรับปฏิทิน (ตรวจ token ในไฟล์)
    'inspections.php'            => ['read' => ['inspection', 'view'],    'write' => ['inspection', 'create']],
    'inspection_dashboard.php'   => ['read' => ['inspection', 'view'],    'write' => null],
    'inspection_history.php'     => ['read' => ['inspection', 'view'],    'write' => null],
    'inspection_execute.php'     => ['read' => ['inspection', 'view'],    'write' => ['inspection', 'execute']],
    'checklist_templates.php'    => ['read' => ['inspection', 'view'],    'write' => ['inspection', 'create']],
    'form_templates.php'         => ['read' => ['inspection', 'view'],    'write' => ['inspection', 'create']],
    'forms.php'                  => ['read' => ['inspection', 'view'],    'write' => ['inspection', 'execute']],
    'calibration.php'            => ['read' => ['calibration', 'view'],   'write' => ['calibration', 'edit']],
    'calibration_management.php' => ['read' => ['calibration', 'view'],   'write' => ['calibration', 'edit']],
    'calibration_tracking.php'   => ['read' => ['calibration', 'view'],   'write' => ['calibration', 'edit']],

    /* ---------- Asset / Reliability ---------- */
    'asset_registry.php'         => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_components.php'       => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_criticality.php'      => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_lifecycle.php'        => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_measurements.php'     => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_overhauls.php'        => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_relationships.php'    => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'asset_data_quality.php'     => ['read' => ['asset', 'view'],         'write' => null],
    'asset_stats.php'            => ['read' => ['dashboard', 'view'],     'write' => null],
    'asset_reports.php'          => ['read' => ['report', 'view'],        'write' => ['report', 'export']],
    'machine_bom.php'            => ['read' => ['asset', 'view'],         'write' => ['asset', 'edit']],
    'scan.php'                   => ['read' => ['asset', 'view'],         'write' => null],
    'reliability.php'            => ['read' => ['reliability', 'read'],   'write' => ['reliability', 'write']],
    'asset_reliability.php'      => ['read' => ['reliability', 'read'],   'write' => ['reliability', 'write']],
    'mtbf_mttr.php'              => ['read' => ['reliability', 'read'],   'write' => ['reliability', 'write']],
    'production_hours.php'       => ['read' => ['reliability', 'read'],   'write' => ['reliability', 'write']],
    'failure.php'                => ['read' => ['failure', 'view'],       'write' => ['failure', 'edit']],

    /* ---------- Spare parts / Supplier / Contractor ---------- */
    'spare_parts.php'            => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'edit']],
    'spare_issue.php'            => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'issue']],
    'spare_issue_request.php'    => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'request']],
    'spare_usage.php'            => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'request']],
    'spare_optimization.php'     => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'plan']],
    'stock_take.php'             => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'plan']],
    'equipment_borrowing.php'    => ['read' => ['spare_parts', 'view'],   'write' => ['spare_parts', 'issue']],
    'suppliers.php'              => ['read' => ['supplier', 'view'],      'write' => ['supplier', 'edit']],
    'contractor.php'             => ['read' => ['contractor', 'view'],    'write' => ['contractor', 'execute']],

    /* ---------- Safety / Document / Engineering change / Shutdown ---------- */
    'work_permit.php'            => ['read' => ['safety', 'view'],        'write' => ['safety', 'create']],
    'document.php'               => ['read' => ['document', 'view'],      'write' => ['document', 'create']],
    'manuals.php'                => ['read' => ['document', 'view'],      'write' => ['document', 'create']],
    'engineering_change.php'     => ['read' => ['engineering_change', 'view'], 'write' => ['engineering_change', 'create']],
    'shutdown.php'               => ['read' => ['shutdown', 'view'],      'write' => ['shutdown', 'plan']],
    'workforce.php'              => ['read' => ['workforce', 'view'],     'write' => ['workforce', 'manage']],

    /* ---------- Knowledge ---------- */
    'knowledge.php'              => ['read' => ['knowledge', 'read'],     'write' => ['knowledge', 'create']],

    /* ---------- Report / Analytics / Cost ---------- */
    'reports.php'                => ['read' => ['report', 'view'],        'write' => ['report', 'export']],
    'report_schedule.php'        => ['read' => ['report', 'view'],        'write' => ['report', 'export']],
    // import: ทั้งอ่านและเขียนต้องมี report:export เพราะเมนู reports/import_excel จำกัดเฉพาะ 1,2,6
    'import_excel.php'           => ['read' => ['report', 'export'],      'write' => ['report', 'export']],
    'analytics_advanced.php'     => ['read' => ['report', 'view'],        'write' => null],
    'analytics_monthly.php'      => ['read' => ['report', 'view'],        'write' => null],
    'intelligence.php'           => ['read' => ['report', 'view'],        'write' => null],
    'cost.php'                   => ['read' => ['report', 'view'],        'write' => null],

    /* ---------- System / Settings / User management ---------- */
    // users.php: รายการ (ไม่ระบุ id) ถูกใช้เติม dropdown ของหน้าแจ้งซ่อม/เบิกอะไหล่
    // → บังคับสิทธิ์เฉพาะการอ่านข้อมูลรายบุคคล (?id=) ซึ่งมี email/phone
    'users.php'                  => ['read' => ['users', 'view', 'param' => 'id'], 'write' => ['users', 'manage']],
    'roles.php'                  => ['read' => ['roles', 'view'],        'write' => ['roles', 'manage']],
    // sage_items.php: ยังไม่บังคับ — SagePartAddModal ใช้จากหน้า repair/view (ช่าง) และ pm_am/plans/create
    // ถ้าจะบังคับ ต้องเพิ่ม sage:view ให้ role 3/7 ก่อน (ดู docs/API_PERMISSION_MATRIX.md)
    'settings.php'               => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'master_data.php'            => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'menu_permissions.php'       => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    // ใช้ตัดสินการแสดงปุ่มใน UI: คืนเฉพาะสิทธิ์ของตัวเอง (ไม่มี PII) จึงเปิดให้ผู้ที่ล็อกอินทุกคน
    'my_permissions.php'         => ['read' => null,                      'write' => null],
    'repair_options.php'         => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'departments.php'            => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'pwa_settings.php'           => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'page_editor.php'            => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'custom_pages.php'           => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'system_health.php'          => ['read' => ['settings', 'view'],      'write' => null], // ไฟล์บังคับ admin เพิ่มแล้ว
    'system_services.php'        => ['read' => ['settings', 'manage'],    'write' => ['settings', 'manage']],
    'ngrok.php'                  => ['read' => ['settings', 'manage'],    'write' => ['settings', 'manage']],
    'line_notify.php'            => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'facility_layout.php'        => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'email_notify.php'           => ['read' => ['settings', 'view'],      'write' => ['settings', 'manage']],
    'audit_logs.php'             => ['read' => ['audit_log', 'view'],     'write' => null],
    'sage_items.php'             => ['read' => ['sage', 'view'],          'write' => null],
    'sage_shipments.php'         => ['read' => ['sage', 'view'],          'write' => ['sage', 'write']],
    'sage_sync.php'              => ['read' => ['sage', 'view'],          'write' => ['sage', 'write']],
    'iot.php'                    => ['read' => ['iot', 'view'],           'write' => ['iot', 'write']],

    /* ---------- Notification / Feedback / Own profile ---------- */
    'notifications.php'          => ['read' => ['notification', 'view'],  'write' => ['notification', 'view']],
    'notifications_log.php'      => ['read' => ['notification', 'view'],  'write' => null],
    'push_subscribe.php'         => ['read' => null,                      'write' => null], // การสมัครรับ push ของตัวเอง
    'feedback.php'               => ['read' => null,                      'write' => null], // ผู้ใช้ส่งข้อเสนอแนะของตัวเอง
    'profile.php'                => ['read' => null,                      'write' => null], // ข้อมูลส่วนตัวของตัวเอง

    /* ---------- Public / token / signature (ไม่ใช้ session permission) ---------- */
    'csrf.php'                   => ['read' => null, 'write' => null],
    'user_lookup.php'            => ['read' => null, 'write' => null],
    'spare_image.php'            => ['read' => null, 'write' => null],
    'line_register.php'          => ['read' => null, 'write' => null],
    'line_webhook.php'           => ['read' => null, 'write' => null],
    'iot_ingest.php'             => ['read' => null, 'write' => null],
    'upload.php'                 => ['read' => null, 'write' => null],
    'index.php'                  => ['read' => null, 'write' => null],
];

/**
 * รายชื่อ endpoint ที่ "บังคับใช้จริง" ในรอบนี้
 *
 * เกณฑ์การเปิด: ต้องพิสูจน์แล้วว่าหน้าเว็บที่ผู้ใช้บทบาทนั้นใช้งานไม่พึ่ง endpoint นี้
 * ในทางที่ต้องการสิทธิ์ต่ำกว่า (ดู docs/API_PERMISSION_MATRIX.md — คอลัมน์ "สถานะ")
 *
 * รอบนี้เปิดเฉพาะจุดที่ "พฤติกรรมไม่เปลี่ยน" สำหรับผู้ใช้ปัจจุบัน (write ของ users/roles
 * เป็น admin-only อยู่แล้วโดย requireLogin($pdo, true)) + ปิดช่องอ่านข้อมูลส่วนบุคคลรายคน
 */
const API_PERMISSION_ENFORCED = [
    'users.php',            // read เฉพาะ ?id= (PII) + write = admin
    'roles.php',            // read roles:view / write roles:manage (เมนู roles ปรับแล้ว: 1,2,6)
    'import_excel.php',     // report:view / report:export (เมนู import ปรับแล้ว: 1,2,6)
    'sage_sync.php',        // sage:view / sage:write (เมนู sage_sync ปรับแล้ว: 1,2,6)
    'sage_shipments.php',   // sage:view / sage:write (เมนู sage_shipments ปรับแล้ว: 1,2,6)
    // Phase 3: endpoint read-only (write=null) — บังคับอ่านตาม permission
    'dashboard.php',
    'kpi_dashboard.php',
    'workload.php',
    'system_health.php',
    // Report center (GET only)
    'reports.php',
    'report_schedule.php',
    'analytics_advanced.php',
    'analytics_monthly.php',
    'intelligence.php',
    'cost.php',
    // PM / Inspection
    'pm_am.php',
    'pm_plans.php',
    'pm_reminders.php',
    'inspection_dashboard.php',
    'inspection_history.php',
    // Asset (menu asset_registry ปรับแล้ว: 1,2,3,5,6,7)
    'asset_registry.php',
    'asset_components.php',
    'asset_criticality.php',
    'asset_lifecycle.php',
    'asset_measurements.php',
    'asset_overhauls.php',
    'asset_relationships.php',
    'machine_bom.php',
    // Failure / equipment borrowing
    'failure.php',
    'equipment_borrowing.php',
    // Work order flow
    'approval.php',
    'planning.php',
    'supervisor.php',
    // Calibration
    'calibration.php',
    'calibration_management.php',
    'calibration_tracking.php',
    // Contractor
    'contractor.php',
    // Safety / Document / Engineering change / Shutdown
    'work_permit.php',
    'document.php',
    'manuals.php',
    'engineering_change.php',
    'shutdown.php',
    // IoT / Supplier / Knowledge
    'iot.php',
    'suppliers.php',
    'knowledge.php',
    // Workforce
    'workforce.php',
    // Settings (read settings:view)
    'settings.php',
    'master_data.php',
    'menu_permissions.php',
    'departments.php',
    'repair_options.php',
];

/** ชื่อไฟล์ endpoint ปัจจุบัน (ทนต่อ IIS rewrite / proxy) */
function api_current_endpoint(): string
{
    foreach (['SCRIPT_FILENAME', 'SCRIPT_NAME', 'REQUEST_URI'] as $k) {
        $v = (string)($_SERVER[$k] ?? '');
        if ($v === '') {
            continue;
        }
        $path = parse_url($v, PHP_URL_PATH);
        $base = basename($path !== null && $path !== '' ? $path : $v);
        if ($base !== '' && str_ends_with($base, '.php')) {
            return $base;
        }
    }
    return '';
}

/**
 * บังคับใช้ permission ของ endpoint ปัจจุบัน (เรียกจาก requireLogin หลังยืนยันตัวตนแล้ว)
 * - endpoint ที่ไม่อยู่ใน API_PERMISSION_ENFORCED → ไม่ทำอะไร (matrix ยังเป็นเอกสาร)
 * - action เป็น null → ไม่ตรวจ (เปิดให้ผู้ใช้ที่ล็อกอินแล้วตามเดิม)
 */
function api_enforce_endpoint_permission(PDO $pdo): void
{
    $endpoint = api_current_endpoint();
    if ($endpoint === '' || !in_array($endpoint, API_PERMISSION_ENFORCED, true)) {
        return;
    }
    $cfg = API_ENDPOINT_PERMISSIONS[$endpoint] ?? null;
    if ($cfg === null) {
        return;
    }

    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $isWrite = !in_array($method, ['GET', 'HEAD', 'OPTIONS'], true);
    $spec = $isWrite ? ($cfg['write'] ?? null) : ($cfg['read'] ?? null);
    if (!is_array($spec) || count($spec) < 2) {
        return;
    }

    [$module, $action] = $spec;
    $requiredParam = $spec['param'] ?? null;
    if (is_string($requiredParam) && $requiredParam !== '') {
        $val = $_GET[$requiredParam] ?? null;
        if ($val === null || $val === '') {
            return; // endpoint เดียวกันแต่โหมดรายการ — ไม่บังคับ (ดูเหตุผลใน matrix)
        }
    }

    requirePerm($pdo, (string)$module, (string)$action, 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ (' . $module . ':' . $action . ')');
}

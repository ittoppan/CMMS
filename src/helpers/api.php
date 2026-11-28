<?php
/**
 * api.php — มาตรฐาน error response ของ API (Phase 18 Security)
 *
 * JSON รูปแบบเดียวสำหรับทุก endpoint:
 *   { "error": "ข้อความที่ปลอดภัยต่อผู้ใช้", "code": "<ERROR_CODE>", "success": false }
 *
 * - ไม่เปิดเผย stack trace / SQL error สู่ client (log ไว้ฝั่ง server ผ่าน error_log)
 * - error code (UPPER_SNAKE) ให้ frontend ตรวจสอบได้ โดยไม่ต้อง px ดึงจากข้อความ
 *
 * ตัวอย่าง:
 *   api_fail(401, 'UNAUTHENTICATED', 'ต้องเข้าสู่ระบบก่อนใช้งาน');
 *   api_fail(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้');
 *   api_fail(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง');
 *   api_fail(404, 'NOT_FOUND', 'ไม่พบข้อมูลที่ขอ');
 *   api_fail(409, 'CONFLICT', 'ข้อมูลซ้ำ/ขัดแย้ง');
 *   api_fail(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง');
 */
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/errors.php';

/** หัวข้อความลับที่ห้ามวนกลับไปยัง client (ใช้ mask ใน endpoint ที่คืน settings) */
const API_SECRET_KEYS = [
    'line_channel_access_token',
    'line_channel_secret',
    'line_liff_register_id',
    'line_notify_token',
    'vapid_private_key',
    'vapid_public_key',
    'smtp_pass',
    'telegram_bot_token',
    'telegram_chat_id',
    'teams_webhook_url',
    'sage300_db_pass',
    'sage300_db_user',
    'sage300_odbc_dsn',
    'ai_api_key',
];

/** ค่าลับถูกส่งกลับมาแบบ mask หรือไม่ (ไม่ควรเปิดเผยค่าจริงใน response) */
function apiIsSecretKey(string $key): bool {
    $k = strtolower(trim($key));
    if (in_array($k, API_SECRET_KEYS, true)) return true;
    return str_contains($k, 'token') || str_contains($k, 'secret') || str_ends_with($k, '_pass')
        || str_ends_with($k, 'password') || str_contains($k, 'private');
}

/** sentinel สำหรับค่าลับที่ถูก mask — ถ้า client ส่งกลับมาในค่าเดิม = ไม่ต้องการเปลี่ยน ให้ข้ามบันทึก */
const SETTING_MASKED = "••••••••";

/** แปลงค่าลับเป็น mask (ไม่ reveal ตัวอักษรจริงเลย — กันการนำไปใช้ต่อ เช่น token) */
function apiMaskSecret(string $value): string {
    return ($value === '') ? '' : SETTING_MASKED;
}

const API_SETTINGS_PUBLIC_KEYS = [
    'theme_preset',
    'theme_primary_hex',
    'theme_secondary_hex',
    'site_name',
    'company_name',
    'company_tagline',
    'iso_header_title',
    'login_welcome_text',
    'support_phone',
    'support_email',
    'lang_default',
    'date_format',
    'animations_enabled',
    'design_andon_ok',
    'design_andon_warn',
    'design_andon_down',
    'kpi_sla_target_minutes',
    'kpi_pm_ontime_target',
    'kpi_mtbf_target_hours',
    'kpi_mttr_target_minutes',
];

const API_SETTINGS_LOGIN_KEYS = [
    'andon_refresh_sec',
    'app_name',
    'app_version',
    'ar_criticality_auto_apply',
    'ar_criticality_review_days',
    'ar_criticality_threshold_a',
    'ar_criticality_threshold_b',
    'ar_criticality_threshold_c',
    'ar_criticality_w_cost',
    'ar_criticality_w_downtime',
    'ar_criticality_w_frequency',
    'ar_criticality_w_production',
    'ar_criticality_w_quality',
    'ar_criticality_w_redundancy',
    'ar_criticality_w_safety',
    'ar_health_window_months',
    'ar_min_failures_for_mtbf',
    'ar_overhaul_reminder_days',
    'ar_phase28_applied_ver',
    'ar_reliability_window_months',
    'ar_replacement_review_notes',
    'ar_retirement_min_age_years',
    'auto_assign_calibration',
    'auto_assign_pm',
    'auto_assign_repair',
    'auto_req_low_stock',
    'auto_sage_sync',
    'border_radius_style',
    'budget_dept_filter_enabled',
    'budget_exceed_pct',
    'budget_warning_pct',
    'cal_alert_days',
    'cal_allow_usage_basis',
    'cal_block_oo_against_expired_std',
    'cal_compliance_mode',
    'cal_data_completeness_required',
    'cal_default_interval_months',
    'cal_interval_change_requires_approval',
    'cal_phase29_applied_ver',
    'cal_rca_on_fail',
    'cal_reference_expiry_warn_days',
    'cal_require_certificate',
    'cal_require_review',
    'cal_years_validity_default',
    'calendar_view_default',
    'calibration_alert_days',
    'company_address',
    'company_phone',
    'company_tax_id',
    'contractor_blacklist_label',
    'contractor_doc_types',
    'contractor_min_qualified_to_work',
    'contractor_performance_window_days',
    'contractor_phase31_applied_ver',
    'contractor_qual_dimensions',
    'contractor_reminder_days',
    'contractor_repeat_failure_gap_days',
    'contractor_score_min_jobs',
    'contractor_service_categories',
    'contractor_sla_metrics',
    'contractor_status_labels',
    'cost_labor_enabled',
    'currency_symbol',
    'daily_summary_enabled',
    'default_pm_frequency',
    'default_repair_priority',
    'design_body_bg',
    'design_card_radius',
    'design_card_shadow',
    'design_font_family',
    'design_font_size',
    'design_sidebar_indicator',
    'design_sidebar_text',
    'document_ack_assign_extra_users',
    'document_ack_assign_roles',
    'document_ack_blocks_ecr_close',
    'document_ack_blocks_work',
    'document_ack_default_due_days',
    'document_ack_methods',
    'document_ack_overdue_reminder_days',
    'document_allowed_file_types',
    'document_approval_chain',
    'document_approval_roles',
    'document_confidentiality_labels',
    'document_default_confidentiality',
    'document_effective_date_rules',
    'document_effective_requires_impacts_closed',
    'document_effective_requires_training',
    'document_legacy_manual_bridge',
    'document_max_file_size_mb',
    'document_qr_prefix',
    'document_review_cycle_days',
    'document_review_due_days',
    'document_revision_status_labels',
    'document_status_labels',
    'document_training_default_validity_days',
    'document_training_pass_score',
    'document_types',
    'ecr_approval_chain',
    'ecr_approval_roles',
    'ecr_blocks_completion_on_fail',
    'ecr_change_types',
    'ecr_critical_impact_guards',
    'ecr_impact_action_status_labels',
    'ecr_impact_min_critical',
    'ecr_impact_required_before_approval',
    'ecr_impact_target_types',
    'ecr_link_action_status_labels',
    'ecr_link_types',
    'ecr_priority_labels',
    'ecr_rca_causation_note',
    'ecr_requires_document_revisions',
    'ecr_sla_days',
    'ecr_status_labels',
    'ecr_transitions',
    'ecr_verification_methods',
    'email_notify_enabled',
    'enable_borrowing',
    'enable_leaderboard',
    'enable_machine_bom',
    'enable_mtbf_analytics',
    'escalation_alert',
    'escalation_hours',
    'impact_areas',
    'iso_footer_note',
    'iso_form_code_prefix',
    'iso_watermark_enabled',
    'knowledge_auto_check_document_stale',
    'knowledge_auto_create_gap',
    'knowledge_enabled',
    'knowledge_export_row_limit',
    'knowledge_gap_default_priority',
    'knowledge_gap_min_occurrences',
    'knowledge_gap_window_days',
    'knowledge_helpfulness_enabled',
    'knowledge_max_results',
    'knowledge_min_query_len',
    'knowledge_page_default_size',
    'knowledge_privileged_roles',
    'knowledge_publish_requires_approved',
    'knowledge_publish_requires_category',
    'knowledge_publish_requires_relation',
    'knowledge_publish_requires_review_record',
    'knowledge_result_window_days',
    'knowledge_review_default_days',
    'knowledge_review_overdue_warn_days',
    'knowledge_search_include_documents',
    'knowledge_search_include_manuals',
    'knowledge_search_log_enabled',
    'knowledge_search_log_retention_days',
    'knowledge_usage_log_enabled',
    'knowledge_usage_retention_days',
    'log_retention_days',
    'log_retention_enabled',
    'login_card_position',
    'login_notice_text',
    'logo_position',
    'low_stock_alert',
    'maintenance_alert_days',
    'notification_sound',
    'org_chart_enabled',
    'phase32_applied_ver',
    'phase32_master_data_automation',
    'phase33_ai_scoring',
    'phase33_applied_ver',
    'phase33_auto_criticality',
    'phase33_auto_minmax_write',
    'phase33_auto_procurement',
    'phase33_reservation_deducts_stock',
    'planner_break_hour',
    'planning_shift_hours',
    'planning_shift_start',
    'planning_sla_risk_hours',
    'planning_working_days',
    'pm_deferral_enabled',
    'pm_lead_days',
    'pm_reminder_days',
    'push_alert_enabled',
    'qr_code_enabled',
    'rca_action_reminder_days',
    'rca_due_days',
    'rca_high_cost_threshold',
    'rca_high_downtime_minutes',
    'rca_repeat_threshold',
    'rca_repeat_window_days',
    'rca_trigger_critical_asset',
    'rca_trigger_emergency',
    'rca_trigger_high_cost',
    'rca_trigger_high_downtime',
    'rca_trigger_repeat',
    'rca_trigger_safety',
    'reliability_alarm_auto_treated_as_failure',
    'reliability_alarm_to_failure_window_days',
    'reliability_allow_calendar_basis',
    'reliability_availability_min_downtime_events',
    'reliability_bad_actor_auto_enable',
    'reliability_comparability_warn_bases',
    'reliability_cost_missing_display',
    'reliability_dq_max_findings',
    'reliability_dq_store_findings',
    'reliability_export_row_limit',
    'reliability_failures_need_classification',
    'reliability_growth_auto_claim',
    'reliability_max_range_days',
    'reliability_min_failures_for_mtbf',
    'reliability_min_sample_period_days',
    'reliability_operating_basis_default',
    'reliability_page_default_size',
    'reliability_repair_time_basis_default',
    'reliability_rolling_default_months',
    'reliability_snapshot_persist_enabled',
    'reliability_snapshot_persist_threshold_ms',
    'reliability_snapshot_ttl_hours',
    'reliability_trend_max_buckets',
    'reliability_weibull_cache_ttl_minutes',
    'reliability_weibull_max_failures',
    'reliability_weibull_min_failures',
    'reliability_weibull_risk_levels',
    'reliability_weibull_time_origin',
    'reliability_weibull_use_censored',
    'require_approval_repair',
    'require_root_cause',
    'risk_matrix_likelihood',
    'risk_matrix_required_approval',
    'risk_matrix_severity',
    'risk_matrix_thresholds',
    'scheduled_reports',
    'shutdown_allow_waive_blocking',
    'shutdown_block_on_readiness',
    'shutdown_material_availability_source',
    'shutdown_max_baseline_versions',
    'shutdown_progress_source',
    'shutdown_readiness_warn_hours',
    'shutdown_report_labor_money',
    'shutdown_require_reason_scope',
    'shutdown_reservation_expiry_days',
    'shutdown_scope_min_estimate_hours',
    'sidebar_style',
    'sla_auto_apply',
    'sla_hours_critical',
    'sla_hours_high',
    'sla_hours_low',
    'sla_hours_medium',
    'sp_abc_a_pct',
    'sp_abc_b_pct',
    'sp_critical_exempt_from_obsolete',
    'sp_criticality_a_score',
    'sp_criticality_auto',
    'sp_criticality_b_score',
    'sp_criticality_c_score',
    'sp_criticality_factors',
    'sp_criticality_levels',
    'sp_criticality_methods',
    'sp_criticality_reason_required',
    'sp_dead_stock_days',
    'sp_dead_stock_min_value',
    'sp_default_lead_time_days',
    'sp_default_service_level',
    'sp_demand_min_days_span',
    'sp_demand_min_movements',
    'sp_demand_reliable',
    'sp_demand_window_days',
    'sp_excess_over_max_ratio',
    'sp_holding_rate',
    'sp_minmax_apply_requires_confirm',
    'sp_minmax_enforce',
    'sp_minmax_skip_critical',
    'sp_minmax_skip_locked',
    'sp_order_cost',
    'sp_reorder_qty_method',
    'sp_reservation_auto_expire',
    'sp_reservation_blocks_issue',
    'sp_reservation_default_days',
    'sp_reservation_overdraw',
    'sp_safety_stock_factor',
    'sp_slow_moving_days',
    'sp_stale_sync_blocks_minmax',
    'sp_stale_sync_hours',
    'sp_substitute_require_approval',
    'sp_substitute_require_dates',
    'sp_warehouse_allow_cmms_created',
    'sp_warehouse_quarantine_blocks_issue',
    'spare_approval_level',
    'spare_deduct_stock',
    'spare_require_approval',
    'standard_labor_rate',
    'system_currency',
    'system_mode',
    'theme_font_family',
    'timezone',
    'topbar_style',
    'urgent_repair_auto_priority',
    'urgent_repair_escalation_hours',
    'urgent_repair_notify_line',
    'urgent_repair_notify_telegram',
    'work_hours_per_day',
    'workforce_auto_assign',
    'workforce_block_unqualified',
    'workforce_capacity_over_pct',
    'workforce_capacity_warn_pct',
    'workforce_expiry_warning_days',
    'workforce_lead_in_trend_days',
    'workforce_overtime_requires_reason',
    'workforce_require_reason',
    'workforce_skill_levels',
    'wp_auto_expire_enabled',
    'wp_cert_expired_block',
    'wp_expiry_policy',
    'wp_gas_block_red',
    'wp_gas_warn_amber',
    'wp_high_risk_approval',
    'wp_permit_no_prefix',
    'wp_phase30_applied_ver',
    'wp_require_approval',
    'wp_require_final_inspection',
    'wp_require_risk_review',
    'wp_valid_hours_default',
];


/** ระดับการเข้าถึงค่า setting */
function apiSettingsLevel(string $key): string {
    $k = strtolower(trim($key));
    $pub = array_map('strtolower', API_SETTINGS_PUBLIC_KEYS);
    if (in_array($k, $pub, true)) return 'public';
    $login = array_map('strtolower', API_SETTINGS_LOGIN_KEYS);
    if (in_array($k, $login, true)) return 'login';
    return 'admin';
}

function apiSettingsAdminOnlyKey(string $key): bool {
    $k = strtolower(trim($key));
    if (apiIsSecretKey($k)) return true;
    return apiSettingsLevel($k) === 'admin';
}

function apiSettingsPublicKeys(): array { return API_SETTINGS_PUBLIC_KEYS; }

function apiSettingsLoginKeys(): array { return API_SETTINGS_LOGIN_KEYS; }

/** mask คอลัมน์ secrets ในแถว settings (ถอดตาม key ชื่อ) — ใช้กับผลลัพธ์ GET/DETAIL */
function apiMaskSettingsRows(array $rows): array {
    foreach ($rows as $i => $r) {
        if (!is_array($r) || !isset($r['setting_key'])) continue;
        $isSecret = apiIsSecretKey((string)$r['setting_key']);
        $hasValue = isset($r['setting_value']) && $r['setting_value'] !== '' && $r['setting_value'] !== null;
        if ($isSecret) {
            // ค่า secret ห้ามส่งออกทาง API เลย - ส่งแค่ is_set (true/false)
            $rows[$i]['is_set'] = $hasValue;
            $rows[$i]['setting_value'] = '';
            $rows[$i]['masked'] = true;
        } else {
            $rows[$i]['is_set'] = $hasValue;
            $rows[$i]['masked'] = false;
        }
    }
    return $rows;
}

/** mask ค่าใน array payload (เช่น env vars / notif settings) ตามชื่อ key */
function apiMaskSecretArray(array $data): array {
    foreach ($data as $k => $v) {
        if ($v !== '' && $v !== null && apiIsSecretKey((string)$k)) {
            $data[$k] = apiMaskSecret((string)$v);
        }
    }
    return $data;
}

/** ตอบ error มาตรฐานแล้วจบ request */
function api_fail(int $status, string $code, string $message): void {
    http_response_code($status);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'success' => false,
        'error'   => $message,
        'code'    => $code,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

/** ตอบ 403 พร้อม audit เหตุการณ์ปฏิเสธสิทธิ์ (severity=security) — บันทึกเฉพาะผู้ใช้ที่ login แล้ว */
function api_forbidden(?PDO $pdo, string $code, string $message): void {
    if ($pdo && !empty($_SESSION['user_id'])) {
        audit_log($pdo, 'PERMISSION_DENIED', 'system', '', $message, null, [
            'uri'    => $_SERVER['REQUEST_URI'] ?? '',
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
        ], 'security');
    }
    api_fail(403, $code, $message);
}

/** ย่อ catch{} กลาง API: log exception จริงฝั่ง server + ตอบ generic 500 ให้ client (ไม่ leak $e->getMessage()) */
function api_safe_catch(Throwable $e, string $message = 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่ภายหลัง'): void {
    error_log(sprintf('[CMMS API] %s: %s @ %s:%d', get_class($e), $e->getMessage(), $e->getFile(), $e->getLine()));
    api_log_error($e, 'api', $message);
    api_fail(500, 'INTERNAL_ERROR', $message);
}
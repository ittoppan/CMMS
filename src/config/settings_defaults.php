<?php
/**
 * settings_defaults.php — ค่าเริ่มต้น (default values) ของตาราง settings
 *
 * ใช้เป็น single source of truth สำหรับปุ่ม "รีเซ็ตค่าเริ่มต้น" ในหน้าการตั้งค่า
 * และหน้า PHP อื่น ๆ ที่ต้องการค่าเริ่มต้น
 *
 * - key ที่เป็นค่าลับ/เครดิตจริง (token, secret, password, channel id, URL callback)
 *   ไม่มีค่าเริ่มต้น -> คืน null (ปุ่มรีเซ็ตถูกปิดใน UI)
 * - key ที่ไม่มีใน map -> คืน null เช่นกัน (unsafe ที่จะเดาค่าเริ่มต้น)
 *
 * @return array<string, string|null>  key => ค่าเริ่มต้น (null = ไม่มีค่าเริ่มต้น)
 */
function settingsDefaultValues(): array {
    static $defaults = null;
    if ($defaults !== null) return $defaults;

    $defaults = [
        // ── company ──
        'company_name'          => 'บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด',
        'company_address'       => '700/842 หมู่ 3 นิคมอุตสาหกรรมอมตะซิตี้ ชลบุรี ต.หนองกะขะ อ.พานทอง จ.ชลบุรี 20160',
        'company_tax_id'        => '0999999999999',
        'company_phone'         => '02-123-4567',
        'company_tagline'       => 'ระบบบริหารจัดการงานซ่อมบำรุงรักษาและคลังอะไหล่อุตสาหกรรม',
        'iso_header_title'      => 'บริษัท ท็อปพาน เฟล็กซิเบิ้ล แพคเกจจิ้ง (ประเทศไทย) จำกัด — ฝ่ายวิศวกรรมและซ่อมบำรุง',
        'login_welcome_text'    => '',

        // ── branding ──
        'theme_primary_hex'     => '#003399',
        'theme_secondary_hex'   => '#0055ff',
        'app_name'              => 'CMMS-TOPPAN',
        'app_version'           => '1.0.0',
        'login_notice_text'     => '',
        'login_card_position'   => 'center',
        'logo_position'         => 'sidebar_only',
        'iso_footer_note'       => 'เอกสารควบคุมตามมาตรฐาน ISO 9001 / ISO 14001 ห้ามคัดลอกโดยไม่ได้รับอนุญาต',
        'iso_form_code_prefix'  => 'F-EN-03',
        'iso_watermark_enabled' => '1',

        // ── general ──
        'auto_sage_sync'        => '1',
        'border_radius_style'   => 'rounded-xl',
        'calendar_view_default' => 'month',
        'currency_symbol'       => '฿',
        'date_format'           => 'd/m/Y',
        'default_warehouse'     => 'TPTSUP',
        'enable_borrowing'      => '1',
        'enable_leaderboard'    => '1',
        'enable_machine_bom'    => '1',
        'enable_mtbf_analytics' => '1',
        'escalation_alert'      => '1',
        'escalation_hours'      => '24',
        'max_login_attempts'    => '5',
        'notification_sound'    => 'chime',
        'org_chart_enabled'     => '1',
        'push_alert_enabled'    => '1',
        'qr_code_enabled'       => '1',
        'require_root_cause'    => '1',
        'session_timeout_mins'  => '60',
        'sidebar_style'         => 'dark_slate',
        'standard_labor_rate'   => '250',
        'system_currency'       => '฿ THB',
        'system_mode'           => 'online',
        'theme_font_family'     => 'Sarabun',
        'theme_preset'          => 'indigo',
        'timezone'              => 'Asia/Bangkok',
        'topbar_style'          => 'clean_white',
        'work_hours_per_day'    => '8',
        'lang_default'          => 'th',  // ภาษาหลักของระบบ: th (ไทย) / en (English) — ฐาน i18n
        'auto_assign_calibration' => '0',
        'calibration_alert_days'  => '30',

        // ── notification ──
        'line_notify_enabled'   => '1',
        'line_system_alerts'   => '0',  // ส่งการแจ้งเตือนระบบ/process (watchdog) เข้า LINE - default ปิด (กัน LINE เต็ม)
        'line_weekly_report'   => '1',  // ส่งรายงานสรุปประจำสัปดาห์ (ทุกวันจันทร์) เข้า LINE
        'daily_summary_enabled' => '1',  // ส่งสรุปสถานะประจำวัน (ทุกเช้า) เข้า LINE
        'line_group_enabled'   => '1',  // ส่งงานซ่อมใหม่เข้ากลุ่ม LINE ช่าง (line_maintenance_group_id) - default เปิด
        'email_notify_enabled'  => '0',
        'low_stock_alert'       => '1',
        'maintenance_alert_days'=> '7',
        'telegram_enabled'      => '1',

        // ── log retention (เก็บรักษาข้อมูล log) ──
        'log_retention_enabled' => '0',   // ลบ notification_logs อัตโนมัติ - default ปิด (กันลบข้อมูลโดยไม่ตั้งใจ)
        'log_retention_days'    => '90',  // ลบรายการที่เก่ากว่า 90 วัน (30/60/90/180/365)

        'telegram_bot_token'    => '',
        'telegram_chat_id'      => '',
        'smtp_enabled'          => '0',
        'smtp_encryption'       => 'tls',
        'smtp_from_name'        => 'CMMS-TPT',
        'smtp_port'             => '587',
        'smtp_from_email'       => '',
        'smtp_host'             => '',
        'smtp_user'             => '',
        'line_tpl_breakdown'    => json_encode(['header_color' => '#dc2626', 'header_title' => '🚨 แจ้งซ่อมด่วน #{work_order_id}', 'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nอาการเสีย: {title}\nความเร่งด่วน: {priority} | สถานะ: {status}\nผู้แจ้งซ่อม: {reporter_name}", 'btn_label' => '⚡ รับงานซ่อมด่วน', 'enabled' => '1', 'image_before' => '', 'image_after' => ''], JSON_UNESCAPED_UNICODE),
        'line_tpl_completed'    => json_encode(['header_color' => '#16a34a', 'header_title' => '✅ ซ่อมเสร็จเรียบร้อย #{work_order_id}', 'body_text' => "เครื่องจักร: {asset_code} - {asset_name}\nDowntime: {downtime_hours} ชม.\nค่าซ่อมรวม: {total_cost} บาท\nช่างผู้ปิดงาน: {assigned_name}", 'btn_label' => '📊 ประเมินผลงาน', 'enabled' => '1', 'image_before' => '', 'image_after' => ''], JSON_UNESCAPED_UNICODE),
        'line_tpl_low_stock'    => json_encode(['header_color' => '#7c3aed', 'header_title' => '📦 อะไหล่ต่ำกว่าจุดสั่งซื้อ', 'body_text' => "รหัสอะไหล่: {item_code}\nชื่ออะไหล่: {item_name}\nคงเหลือ: {qty} (ขั้นต่ำ: {min_stock})", 'btn_label' => '🛒 สั่งซื้อ/เบิกจ่าย', 'enabled' => '1', 'image_before' => '', 'image_after' => ''], JSON_UNESCAPED_UNICODE),
        'line_tpl_pm_overdue'   => json_encode(['header_color' => '#d97706', 'header_title' => '📋 แผน PM เกินกำหนด #{work_order_id}', 'body_text' => "เครื่องจักร: {asset_code}\nรายการ: {title}\nกำหนดชำระ: {due_date} (เกินมา {days_overdue} วัน)", 'btn_label' => '📝 เปิดเช็คชีท PM', 'enabled' => '1', 'image_before' => '', 'image_after' => ''], JSON_UNESCAPED_UNICODE),
        'line_tpl_sage_approval'=> json_encode(['header_color' => '#7c3aed', 'header_title' => '📦 ขออนุมัติเบิกอะไหล่ #{requisition_no}', 'body_text' => "รายการ: {items_summary}\nผู้ขอเบิก: {requester_name}\nรวมมูลค่า: {total_amount} บาท", 'btn_label' => '✔ อนุมัติการเบิก', 'enabled' => '1', 'image_before' => '', 'image_after' => ''], JSON_UNESCAPED_UNICODE),

        // ── pm ──
        'auto_assign_pm'        => '0',
        'default_pm_frequency'  => 'monthly',
        'pm_lead_days'          => '7',
        'pm_reminder_days'      => '3',
        'pm_deferral_enabled'   => '1',  // อนุญาตเลื่อนกำหนด PM พร้อมเหตุผล + อนุมัติหัวหน้า

        // ── repair ──
        'auto_assign_repair'    => '0',
        'default_repair_priority' => 'medium',
        'require_approval_repair' => '0',

        // ── andon_board ──
        'andon_refresh_sec'     => '30',  // ความถี่รีเฟรชจอ Andon TV (วินาที) - default 30

        // ── spare ──
        'spare_approval_level'  => '1',
        'spare_require_approval'=> '1',
        'auto_req_low_stock'   => '0',   // สร้างใบขอซื้ออัตโนมัติเมื่อสต็อกต่ำกว่า min (รันวันละครั้ง) - default ปิด
        'spare_deduct_stock'    => '1',  // ตัดสต็อกอัตโนมัติเมื่อเบิกอะไหล่จากใบซ่อม - default เปิด

        // ── ERP ──
        'sage_sync_config'          => '{"mode":"full","overwrite":true,"fields":["name","unit","unit_price","stock_qty","min_stock","max_stock","location"],"enabled_categories":["Spare Parts","Raw Materials","Consumables","Tools"]}',
        'sage300_allowed_categories'=> 'REPMEN, SUPAAD, STAAAD, PACWHC',

        // ── ไม่มีค่าเริ่มต้น (ค่าลับ/เครดิตจริงของลูกค้า) ──
        // key เหล่านี้คืนค่าเริ่มต้นเป็น null -> UI ปิดปุ่มรีเซ็ต
        'line_channel_access_token' => null,
        'line_channel_secret'       => null,
        'line_channel_id'           => null,
        'line_liff_id'              => null,
        'line_callback_url'         => null,
        'line_maintenance_group_id' => null,
        'vapid_private_key'         => null,
        'vapid_public_key'          => null,
        'smtp_pass'                 => null,
    ];

    return $defaults;
}

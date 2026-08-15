"use client";

import { useEffect, useState } from "react";

/**
 * i18n EN/TH — ระบบสองภาษา
 * =========================
 * วิธีใช้:
 *   import { t, useLang, setUserLang, tPage, tSection, usePageHero } from "@/lib/i18n";
 *
 *   t("menu.dashboard")              → แปลคีย์พจนานุกรม
 *   tPage("/repair")                 → ชื่อหน้า (breadcrumb)
 *   tSection("/repair")              → ชื่อหมวด (breadcrumb)
 *   usePageHero("repair")            → { eyebrow, title, desc } ของหน้า (hero)
 *   useLang()                        → ภาษาปัจจุบัน (reactive — UI อัปเดตทันที)
 *   setUserLang("en" | "th")         → สลับภาษา (เก็บ localStorage + แจ้งทุก listener)
 *
 * ค่าเริ่มต้น: อ่านจาก settings key `lang_default` (th/en) — applySystemLang() เรียกตอน app mount
 */

export type Lang = "th" | "en";

// ════════════════ พจนานุกรมหลัก ════════════════
const DICT: Record<string, { th: string; en: string }> = {
  // ── หมวดเมนู (SideNav sections) ──
  "nav.work_orders": { th: "งานซ่อมบำรุง", en: "Maintenance" },
  "nav.approval_docs": { th: "การอนุมัติ & เอกสาร", en: "Approval & Documents" },
  "nav.pm_machines": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "nav.spare_parts": { th: "คลังอะไหล่", en: "Spare Parts" },
  "nav.analytics_reports": { th: "วิเคราะห์ & รายงาน", en: "Analytics & Reports" },
  "nav.safety_iot": { th: "ความปลอดภัย & IoT", en: "Safety & IoT" },
  "nav.people": { th: "บุคลากร", en: "People" },
  "nav.system": { th: "ระบบ & ตั้งค่า", en: "System & Settings" },
  "nav.account": { th: "บัญชี", en: "Account" },

  // ── เมนูหลัก (SideNav items) ──
  "menu.dashboard": { th: "แดชบอร์ดภาพรวม", en: "Dashboard" },
  "menu.repairs": { th: "ใบสั่งงานซ่อมทั้งหมด", en: "All Work Orders" },
  "menu.repair_request": { th: "แจ้งซ่อมด่วน", en: "Quick Repair Request" },
  "menu.repair_assign": { th: "แจกงานซ่อม", en: "Assign Jobs" },
  "menu.my_tasks": { th: "งานของฉัน (ซ่อม + PM)", en: "My Tasks (Repair + PM)" },
  "menu.tracking": { th: "ติดตามงานซ่อม", en: "Repair Tracking" },
  "menu.workload": { th: "ภาระงานช่าง", en: "Technician Workload" },
  "menu.kanban": { th: "กระดานคัมบัง", en: "Kanban Board" },
  "menu.history": { th: "ประวัติงานซ่อม", en: "Repair History" },
  "menu.approval": { th: "ศูนย์อนุมัติเอกสาร", en: "Approval Center" },
  "menu.forms": { th: "ศูนย์แบบฟอร์ม (F-EN)", en: "Forms Center (F-EN)" },
  "menu.manuals": { th: "คู่มือการใช้งาน", en: "User Manuals" },
  "menu.pm_am": { th: "ตารางแผน PM", en: "PM Schedule" },
  "menu.pm_calendar": { th: "ปฏิทิน PM/AM", en: "PM/AM Calendar" },
  "menu.pm_checksheet": { th: "ทำเช็คชีท PM", en: "Run PM Checksheet" },
  "menu.pm_create": { th: "สร้างแผน PM", en: "Create PM Plan" },
  "menu.pm_batch": { th: "สร้างแผนแบบกลุ่ม", en: "Batch Schedule" },
  "menu.inspections": { th: "ตรวจเช็ครอบ (Checklist)", en: "Round Inspections" },
  "menu.inspections_run": { th: "ทำเช็คลิสต์ทันที", en: "Run Checklist Now" },
  "menu.inspections_templates": { th: "จัดการ Template ตรวจ", en: "Inspection Templates" },
  "menu.asset_registry": { th: "ทะเบียนเครื่องจักร", en: "Machine Registry" },
  "menu.assets": { th: "ทรัพย์สิน & เครื่องจักร", en: "Assets & Machines" },
  "menu.qr_sheet": { th: "แผ่น QR เครื่องจักร", en: "Machine QR Sheets" },
  "menu.bom_tree": { th: "ผังชิ้นส่วน (BOM)", en: "Parts Tree (BOM)" },
  "menu.criticality": { th: "ลำดับความสำคัญ A/B/C", en: "Criticality A/B/C" },
  "menu.equipment_borrowing": { th: "ยืม-คืนอุปกรณ์", en: "Tool Borrowing" },
  "menu.calibration": { th: "สอบเทียบเครื่องมือวัด", en: "Calibration" },
  "menu.mtbf_mttr": { th: "วิเคราะห์ MTBF/MTTR", en: "MTBF/MTTR Analysis" },
  "menu.spare_parts": { th: "คลังสต็อกอะไหล่", en: "Spare Parts Stock" },
  "menu.issue_center": { th: "ศูนย์เบิก-จ่าย Sage", en: "Issue Center (Sage)" },
  "menu.sage_po": { th: "รับอะไหล่จาก PO", en: "Receive from PO" },
  "menu.sage_sync": { th: "ซิงค์สต็อก Sage 300", en: "Sync Stock (Sage 300)" },
  "menu.optimization": { th: "AI EOQ & สต็อกค้าง", en: "AI EOQ & Dead Stock" },
  "menu.stock_take": { th: "นับสต็อกจริง (Stock Take)", en: "Stock Take" },
  "menu.suppliers": { th: "ผู้ผลิต & คะแนนผู้ขาย", en: "Suppliers & Scores" },
  "menu.analytics_kpi": { th: "KPI ผู้บริหาร", en: "Executive KPI" },
  "menu.analytics_bi": { th: "คลังข้อมูลและ BI", en: "Data Warehouse & BI" },
  "menu.reports": { th: "ศูนย์รวมรายงาน", en: "Reports Center" },
  "menu.reports_pdf": { th: "รายงาน PDF ผู้บริหาร", en: "Executive PDF Report" },
  "menu.reports_excel": { th: "ส่งออก Excel / CSV", en: "Export Excel / CSV" },
  "menu.andon_board": { th: "จอ Andon TV (โรงงาน)", en: "Andon TV Board" },
  "menu.loto": { th: "ใบอนุญาต LOTO", en: "LOTO Permits" },
  "menu.iot_monitor": { th: "มอนิเตอร์เซนเซอร์ IoT", en: "IoT Sensor Monitor" },
  "menu.users": { th: "ผู้ใช้งานระบบ", en: "Users" },
  "menu.roles": { th: "บทบาท & สิทธิ์", en: "Roles & Permissions" },
  "menu.register": { th: "ลงทะเบียนผูกบัญชี LINE", en: "Link LINE Account" },
  "menu.notifications": { th: "ศูนย์แจ้งเตือน", en: "Notifications" },
  "menu.notifications_history": { th: "ประวัติการส่ง LINE", en: "LINE Send History" },
  "menu.settings_notifications": { th: "รูปแบบการแจ้งเตือน LINE", en: "LINE Notification Templates" },
  "menu.settings": { th: "ตั้งค่าระบบทั้งหมด", en: "System Settings" },
  "menu.settings_menus": { th: "สิทธิ์เมนูตามบทบาท", en: "Menu Permissions" },
  "menu.settings_services": { th: "บริการและสถานะการรัน", en: "Services & Status" },
  "menu.settings_pwa": { th: "ไอคอน PWA (Mobile App)", en: "PWA Icons (Mobile App)" },
  "menu.settings_design": { th: "ปรับแต่งหน้าตาระบบ (Page Designer)", en: "Page Designer" },
  "menu.builder": { th: "สร้างหน้าเว็บ (Visual Builder)", en: "Visual Page Builder" },
  "menu.pages": { th: "หน้าเว็บที่สร้างเอง", en: "Custom Pages" },
  "menu.profile": { th: "โปรไฟล์", en: "Profile" },
  "menu.logout": { th: "ออกจากระบบ", en: "Log out" },

  // ── Bottom nav มือถือ ──
  "bottom.dashboard": { th: "หน้าแรก", en: "Home" },
  "bottom.my_tasks": { th: "งานของฉัน", en: "My Tasks" },
  "bottom.repair_request": { th: "แจ้งซ่อม", en: "Report" },
  "bottom.tracking": { th: "ติดตามงาน", en: "Track" },
  "bottom.checksheet": { th: "เช็คชีตตามแผน", en: "Checksheet" },
  "bottom.pm_calendar": { th: "แผน PM", en: "PM Plan" },
  "bottom.asset_registry": { th: "เครื่องจักร", en: "Machines" },
  "bottom.qr_sheet": { th: "สแกน QR", en: "Scan QR" },
  "bottom.analytics": { th: "คลังข้อมูล", en: "Analytics" },
  "bottom.notifications": { th: "แจ้งเตือน", en: "Alerts" },
  "bottom.reports_excel": { th: "ส่งออก Excel", en: "Export Excel" },
  "bottom.reports_pdf": { th: "รายงาน PDF", en: "PDF Report" },
  "bottom.settings": { th: "ตั้งค่า", en: "Settings" },

  // ── สถานะ ──
  "status.open": { th: "รอดำเนินการ", en: "Open" },
  "status.pending": { th: "รอดำเนินการ", en: "Pending" },
  "status.due": { th: "ถึงกำหนด", en: "Due" },
  "status.in_progress": { th: "กำลังซ่อม", en: "In Progress" },
  "status.completed": { th: "เสร็จสิ้น", en: "Completed" },
  "status.closed": { th: "ปิดงาน", en: "Closed" },
  "status.resolved": { th: "แก้ไขแล้ว", en: "Resolved" },
  "status.rejected": { th: "ปฏิเสธ", en: "Rejected" },
  "status.cancelled": { th: "ยกเลิก", en: "Cancelled" },
  "status.skipped": { th: "ข้ามรอบ", en: "Skipped" },
  "status.overdue": { th: "เกินกำหนด", en: "Overdue" },
  "status.approved": { th: "อนุมัติแล้ว", en: "Approved" },
  "status.waiting_approval": { th: "รออนุมัติ", en: "Waiting Approval" },

  // ── ปุ่ม / แอคชันกลาง ──
  "action.save": { th: "บันทึก", en: "Save" },
  "action.save_changes": { th: "บันทึกการเปลี่ยนแปลง", en: "Save Changes" },
  "action.save_close": { th: "บันทึกและปิด", en: "Save & Close" },
  "action.cancel": { th: "ยกเลิก", en: "Cancel" },
  "action.edit": { th: "แก้ไข", en: "Edit" },
  "action.update": { th: "อัปเดต", en: "Update" },
  "action.delete": { th: "ลบ", en: "Delete" },
  "action.confirm": { th: "ยืนยัน", en: "Confirm" },
  "action.search": { th: "ค้นหา", en: "Search" },
  "action.close": { th: "ปิด", en: "Close" },
  "action.create": { th: "สร้าง", en: "Create" },
  "action.create_new": { th: "สร้างใหม่", en: "Create New" },
  "action.add": { th: "เพิ่ม", en: "Add" },
  "action.add_item": { th: "เพิ่มรายการ", en: "Add Item" },
  "action.upload": { th: "อัปโหลด", en: "Upload" },
  "action.upload_all": { th: "อัปโหลดทั้งหมด", en: "Upload All" },
  "action.choose_file": { th: "เลือกไฟล์", en: "Choose File" },
  "action.select_all": { th: "เลือกทั้งหมด", en: "Select All" },
  "action.download": { th: "ดาวน์โหลด", en: "Download" },
  "action.print": { th: "พิมพ์", en: "Print" },
  "action.back": { th: "ย้อนกลับ", en: "Back" },
  "action.next": { th: "ถัดไป", en: "Next" },
  "action.refresh": { th: "รีเฟรช", en: "Refresh" },
  "action.export": { th: "ส่งออก", en: "Export" },
  "action.import": { th: "นำเข้า", en: "Import" },
  "action.assign": { th: "มอบหมาย", en: "Assign" },
  "action.start": { th: "เริ่มงาน", en: "Start" },
  "action.complete": { th: "ปิดงาน", en: "Complete" },
  "action.approve": { th: "อนุมัติ", en: "Approve" },
  "action.reject": { th: "ไม่อนุมัติ", en: "Reject" },
  "action.view": { th: "ดู", en: "View" },
  "action.view_all": { th: "ดูทั้งหมด", en: "View All" },
  "action.edit_page": { th: "แก้ไขหน้า", en: "Edit Page" },
  "action.notifications": { th: "แจ้งเตือน", en: "Notifications" },
  "action.search_menu": { th: "ค้นหาเมนู...", en: "Search menu..." },
  "action.clear": { th: "ล้าง", en: "Clear" },
  "action.clear_search": { th: "ล้างการค้นหา", en: "Clear search" },
  "nav.expand_section": { th: "ขยายหมวด", en: "Expand section" },
  "nav.collapse_section": { th: "ย่อหมวด", en: "Collapse section" },
  "action.open_calendar": { th: "มุมมองปฏิทิน", en: "Calendar View" },
  "action.defer": { th: "เลื่อนกำหนด", en: "Postpone" },
  "action.send_request": { th: "ส่งคำขอ", en: "Send Request" },

  // ── ฟอร์ม / ป้ายทั่วไป ──
  "field.asset": { th: "เครื่องจักร", en: "Machine" },
  "field.asset_code": { th: "รหัสเครื่องจักร", en: "Machine Code" },
  "field.work_order": { th: "เลขที่ใบสั่งงาน", en: "Work Order No." },
  "field.spare_part": { th: "อะไหล่", en: "Spare Part" },
  "field.quantity": { th: "จำนวน", en: "Quantity" },
  "field.unit_price": { th: "ราคาต่อหน่วย", en: "Unit Price" },
  "field.total": { th: "รวม", en: "Total" },
  "field.total_cost": { th: "รวมมูลค่า", en: "Total Cost" },
  "field.frequency": { th: "รอบ/ความถี่", en: "Frequency" },
  "field.assignee": { th: "ผู้รับผิดชอบ", en: "Assignee" },
  "field.due_date": { th: "วันครบกำหนด", en: "Due Date" },
  "field.status": { th: "สถานะ", en: "Status" },
  "field.actions": { th: "จัดการ", en: "Actions" },
  "field.title": { th: "ชื่องาน", en: "Title" },
  "field.description": { th: "รายละเอียด", en: "Description" },
  "field.department": { th: "แผนก", en: "Department" },
  "field.criticality": { th: "ความสำคัญ", en: "Criticality" },
  "field.location": { th: "ตำแหน่ง", en: "Location" },
  "field.reason": { th: "เหตุผล", en: "Reason" },
  "field.remark": { th: "หมายเหตุ", en: "Remark" },
  "field.stock": { th: "คงเหลือ", en: "Stock" },
  "field.min_stock": { th: "ขั้นต่ำ", en: "Min Stock" },
  "field.last_maintenance": { th: "ซ่อมล่าสุด", en: "Last Maintenance" },

  // ── ความถี่ ──
  "freq.daily": { th: "รายวัน", en: "Daily" },
  "freq.weekly": { th: "รายสัปดาห์", en: "Weekly" },
  "freq.monthly": { th: "รายเดือน", en: "Monthly" },
  "freq.quarterly": { th: "รายไตรมาส", en: "Quarterly" },
  "freq.yearly": { th: "รายปี", en: "Yearly" },

  // ── ทั่วไป ──
  "common.loading": { th: "กำลังโหลด...", en: "Loading..." },
  "common.no_data": { th: "ไม่มีข้อมูล", en: "No data" },
  "common.all": { th: "ทั้งหมด", en: "All" },
  "common.none": { th: "ไม่มี", en: "None" },
  "common.search_hint": { th: "ค้นหา...", en: "Search..." },
  "common.confirm_delete": { th: "ยืนยันการลบรายการนี้?", en: "Delete this item?" },
  "common.saved": { th: "บันทึกเรียบร้อย", en: "Saved" },
  "common.error": { th: "เกิดข้อผิดพลาด", en: "Something went wrong" },
  "common.today": { th: "วันนี้", en: "Today" },
  "common.this_week": { th: "สัปดาห์นี้", en: "This Week" },
  "common.this_month": { th: "เดือนนี้", en: "This Month" },
  "common.total": { th: "รวม", en: "Total" },
  "common.items": { th: "รายการ", en: "items" },
  "common.units": { th: "หน่วย", en: "units" },
  "common.language": { th: "ภาษา", en: "Language" },
  "common.menu_not_found": { th: "ไม่พบเมนูที่ค้นหา", en: "No menu matches your search" },
};

// ── หัวคอลัมน์ตาราง (table headers) ──
const _tbl: Record<string, { th: string; en: string }> = {
  select: { th: "เลือก", en: "Select" },
  line_id: { th: "LINE ID", en: "LINE ID" },
  work_order_no: { th: "เลขที่ใบงาน", en: "Work Order No." },
  wo_no_short: { th: "เลขที่งาน", en: "Job No." },
  pm_no: { th: "เลขที่ PM", en: "PM No." },
  asset: { th: "เครื่องจักร", en: "Machine" },
  asset_full: { th: "เครื่องจักร/อุปกรณ์", en: "Machine / Equipment" },
  asset_code_serial: { th: "รหัสเครื่องจักร / Serial No.", en: "Machine Code / Serial No." },
  asset_location: { th: "ชื่อเครื่องจักร / ตำแหน่งติดตั้ง", en: "Machine / Location" },
  title: { th: "ชื่องาน", en: "Task" },
  subject: { th: "หัวข้องาน", en: "Subject" },
  issue_desc: { th: "อาการเสีย / รายละเอียด", en: "Issue / Details" },
  root_cause: { th: "สาเหตุ / แนวทางแก้ไข", en: "Cause / Solution" },
  status: { th: "สถานะ", en: "Status" },
  repair_status: { th: "สถานะงานซ่อม", en: "Repair Status" },
  asset_status: { th: "สถานะเครื่องจักร", en: "Machine Status" },
  status_assignee: { th: "สถานะ / ผู้รับผิดชอบ", en: "Status / Assignee" },
  assignee: { th: "ผู้รับผิดชอบ", en: "Assignee" },
  tech_assignee: { th: "ช่างผู้รับผิดชอบ", en: "Technician" },
  tech_assignee_full: { th: "ช่าง / ผู้รับผิดชอบ", en: "Technician / Assignee" },
  request_date: { th: "วันที่แจ้ง", en: "Request Date" },
  completed_date: { th: "วันที่เสร็จ", en: "Completed Date" },
  due_date: { th: "วันครบกำหนด", en: "Due Date" },
  due_in_7d: { th: "ครบกำหนด 7 วัน", en: "Due in 7 days" },
  overdue: { th: "เกินกำหนด", en: "Overdue" },
  closed_7d: { th: "ปิดงาน 7 วันล่าสุด", en: "Closed (last 7d)" },
  priority: { th: "ความเร่งด่วน", en: "Priority" },
  urgent: { th: "ด่วน/วิกฤต", en: "Urgent / Critical" },
  criticality: { th: "ระดับความสำคัญ", en: "Criticality" },
  frequency: { th: "รอบ/ความถี่", en: "Frequency" },
  period: { th: "รอบเดือน", en: "Period" },
  qty: { th: "จำนวน", en: "Qty" },
  unit_price: { th: "ราคา/หน่วย", en: "Unit Price" },
  total: { th: "รวม", en: "Total" },
  cost: { th: "ค่าใช้จ่าย", en: "Cost" },
  image: { th: "รูป", en: "Image" },
  before_after: { th: "รูปก่อน/หลังซ่อม", en: "Before / After" },
  code: { th: "รหัส", en: "Code" },
  spare_item: { th: "รหัส / รายการอะไหล่", en: "Code / Spare Part" },
  employee_code: { th: "รหัสพนักงาน", en: "Employee Code" },
  instrument_code: { th: "รหัสเครื่องมือ", en: "Instrument Code" },
  instrument: { th: "ชื่อเครื่องมือวัด", en: "Instrument" },
  cert_no: { th: "เลขใบเซอร์", en: "Cert No." },
  last_cal: { th: "สอบเทียบล่าสุด", en: "Last Calibration" },
  type: { th: "ประเภท", en: "Type" },
  full_name: { th: "ชื่อ-นามสกุล", en: "Full Name" },
  username: { th: "ชื่อผู้ใช้", en: "Username" },
  role: { th: "บทบาท", en: "Role" },
  phone: { th: "โทรศัพท์", en: "Phone" },
  email: { th: "อีเมล", en: "Email" },
  actions: { th: "จัดการ", en: "Actions" },
  processing: { th: "การดำเนินการ", en: "Processing" },
  in_progress_h: { th: "กำลังทำ", en: "In Progress" },
  open_jobs: { th: "งานค้าง (เปิด)", en: "Open Jobs" },
  failure_count: { th: "จำนวนครั้งเสีย", en: "Failures" },
  mtbf_h: { th: "MTBF (ชม.)", en: "MTBF (hrs)" },
  mttr_min: { th: "MTTR (นาที)", en: "MTTR (min)" },
};
for (const k in _tbl) { DICT["tbl." + k] = _tbl[k]; }

// ── ปุ่มเพิ่มเติม ──
DICT["action.download_pdf"] = { th: "ดาวน์โหลด PDF", en: "Download PDF" };
DICT["action.building_pdf"] = { th: "กำลังสร้าง PDF...", en: "Building PDF..." };
DICT["action.update_status"] = { th: "อัปเดตสถานะ", en: "Update Status" };
DICT["action.select_all_page"] = { th: "เลือกทั้งหมดในหน้า", en: "Select all on page" };
DICT["action.download_pdf_fen03"] = { th: "ดาวน์โหลด PDF (F-EN-03)", en: "Download PDF (F-EN-03)" };
DICT["action.print_closure_doc"] = { th: "พิมพ์เอกสารปิดซ่อม", en: "Print Closure Document" };
DICT["action.create_wo"] = { th: "สร้างใบสั่งงาน", en: "Create Work Order" };
DICT["action.create_pm"] = { th: "สร้างแผน PM ใหม่", en: "Create PM Plan" };
DICT["action.search_hint_full"] = { th: "ค้นหาเลขงาน, เครื่องจักรฯ...", en: "Search job no., machine..." };
DICT["action.filter_all_status"] = { th: "ทุกสถานะ", en: "All Statuses" };
DICT["action.filter_all_priority"] = { th: "ทุกความเร่งด่วน", en: "All Priorities" };

// ── สถานะเพิ่มเติม (normalize ตัวพิมพ์/ช่องว่างด้วย statusText) ──
DICT["status.waiting_parts"] = { th: "รออะไหล่", en: "Waiting for Parts" };
DICT["status.pending_parts"] = { th: "รออะไหล่", en: "Waiting for Parts" };
DICT["status.assigned"] = { th: "มอบหมายแล้ว", en: "Assigned" };
DICT["status.started"] = { th: "เริ่มแล้ว", en: "Started" };
DICT["status.expired"] = { th: "หมดอายุ", en: "Expired" };

// ── ความเร่งด่วน (priority) ──
DICT["priority.critical"] = { th: "วิกฤต", en: "Critical" };
DICT["priority.high"] = { th: "สูง", en: "High" };
DICT["priority.medium"] = { th: "ปานกลาง", en: "Medium" };
DICT["priority.low"] = { th: "ต่ำ", en: "Low" };

// ════════════════
// ════════════════ ชื่อหน้า (breadcrumb) ════════════════
const PAGE_TITLES: Record<string, { th: string; en: string }> = {
  "/dashboard": { th: "แดชบอร์ดภาพรวม", en: "Dashboard" },
  "/repair": { th: "ใบสั่งงานซ่อม", en: "Work Orders" },
  "/repair/request": { th: "ฟอร์มแจ้งซ่อมด่วน", en: "Quick Repair Request" },
  "/repair/assign": { th: "แจกงานซ่อม", en: "Assign Jobs" },
  "/repair/my_tasks": { th: "งานซ่อมของฉัน", en: "My Tasks" },
  "/repair/tracking": { th: "ติดตามงานซ่อม", en: "Repair Tracking" },
  "/repair/kanban": { th: "Kanban Board", en: "Kanban Board" },
  "/repair/history": { th: "ประวัติงานซ่อม", en: "Repair History" },
  "/repair/create": { th: "สร้างใบสั่งงาน", en: "Create Work Order" },
  "/pm_am/calendar": { th: "ปฏิทิน PM/AM", en: "PM/AM Calendar" },
  "/pm_am/create": { th: "สร้างแผน PM", en: "Create PM Plan" },
  "/pm_am/batch_schedule": { th: "สร้างแผนแบบกลุ่ม", en: "Batch Schedule" },
  "/pm_am/checksheet": { th: "ทำเช็คชีท PM", en: "Run PM Checksheet" },
  "/pm_am/history": { th: "ประวัติงาน PM/AM", en: "PM/AM History" },
  "/inspections": { th: "ตรวจเช็ครอบ", en: "Round Inspections" },
  "/inspections/templates": { th: "จัดการ Template ตรวจ", en: "Inspection Templates" },
  "/inspections/run": { th: "ทำรายการตรวจเช็ค", en: "Run Inspection" },
  "/asset_registry": { th: "ทะเบียนเครื่องจักร", en: "Machine Registry" },
  "/qr-sheet": { th: "QR Sheet เครื่องจักร", en: "Machine QR Sheets" },
  "/asset_registry/bom_tree": { th: "BOM Tree ชิ้นส่วน", en: "Parts Tree (BOM)" },
  "/asset_registry/criticality": { th: "ลำดับความสำคัญ A/B/C", en: "Criticality A/B/C" },
  "/equipment_borrowing": { th: "ยืม-คืนอุปกรณ์ช่าง", en: "Tool Borrowing" },
  "/calibration": { th: "สอบเทียบเครื่องมือวัด", en: "Calibration" },
  "/mtbf_mttr": { th: "วิเคราะห์ MTBF/MTTR", en: "MTBF/MTTR Analysis" },
  "/spare_parts": { th: "คลังสต็อกอะไหล่", en: "Spare Parts Stock" },
  "/spare_parts/issue_center": { th: "ศูนย์เบิก-จ่าย", en: "Issue Center" },
  "/spare_parts/stock_take": { th: "นับสต็อกจริง (Stock Take)", en: "Stock Take" },
  "/spare_parts/sage_po": { th: "รับอะไหล่จาก PO", en: "Receive from PO" },
  "/spare_parts/optimization": { th: "AI EOQ & Dead Stock", en: "AI EOQ & Dead Stock" },
  "/analytics": { th: "Data Warehouse & BI", en: "Data Warehouse & BI" },
  "/analytics/kpi": { th: "KPI ผู้บริหาร (Executive Dashboard)", en: "Executive KPI" },
  "/reports/monthly_pdf": { th: "รายงาน PDF", en: "PDF Report" },
  "/reports/export_excel": { th: "Export Excel", en: "Export Excel" },
  "/safety/work_permit": { th: "ใบอนุญาต LOTO", en: "LOTO Permits" },
  "/iot/monitor": { th: "IoT Sensor Monitor", en: "IoT Sensor Monitor" },
  "/notifications": { th: "ศูนย์แจ้งเตือน", en: "Notifications" },
  "/notifications/history": { th: "ประวัติการส่ง LINE", en: "LINE Send History" },
  "/users": { th: "ผู้ใช้งานระบบ", en: "Users" },
  "/profile": { th: "โปรไฟล์ของฉัน", en: "My Profile" },
  "/settings": { th: "ตั้งค่าระบบ", en: "System Settings" },
  "/settings/services": { th: "Service & การรันระบบ", en: "Services & Status" },
  "/settings/notifications": { th: "รูปแบบการแจ้งเตือน LINE", en: "LINE Notification Templates" },
  "/settings/menus": { th: "สิทธิ์เมนูตามบทบาท", en: "Menu Permissions" },
  "/settings/pwa": { th: "ตั้งค่าไอคอน PWA", en: "PWA Settings" },
  "/settings/design": { th: "ปรับแต่งหน้าตาระบบ (Page Designer)", en: "Page Designer" },
  "/editor/builder": { th: "สร้างหน้าเว็บ (Visual Builder)", en: "Visual Page Builder" },
  "/pages": { th: "หน้าเว็บที่สร้างเอง", en: "Custom Pages" },
  "/register": { th: "ลงทะเบียนผูกบัญชี LINE", en: "Link LINE Account" },
};

// หมวด breadcrumb
const SECTION_MAP: Record<string, { th: string; en: string }> = {
  "/repair": { th: "งานซ่อมบำรุง", en: "Maintenance" },
  "/approval": { th: "การอนุมัติ & เอกสาร", en: "Approval & Documents" },
  "/forms": { th: "การอนุมัติ & เอกสาร", en: "Approval & Documents" },
  "/pm_am": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/asset_registry": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/assets": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/equipment_borrowing": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/calibration": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/mtbf_mttr": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/inspections": { th: "แผน PM & เครื่องจักร", en: "PM Plans & Machines" },
  "/spare_parts": { th: "คลังอะไหล่", en: "Spare Parts" },
  "/suppliers": { th: "คลังอะไหล่", en: "Spare Parts" },
  "/analytics": { th: "วิเคราะห์ & รายงาน", en: "Analytics & Reports" },
  "/reports": { th: "วิเคราะห์ & รายงาน", en: "Analytics & Reports" },
  "/andon-board": { th: "วิเคราะห์ & รายงาน", en: "Analytics & Reports" },
  "/safety": { th: "ความปลอดภัย & IoT", en: "Safety & IoT" },
  "/iot": { th: "ความปลอดภัย & IoT", en: "Safety & IoT" },
  "/users": { th: "บุคลากร", en: "People" },
  "/roles": { th: "บุคลากร", en: "People" },
  "/manuals": { th: "เอกสารคู่มือ", en: "Manuals" },
  "/notifications": { th: "ระบบ & ตั้งค่า", en: "System & Settings" },
  "/settings": { th: "ระบบ & ตั้งค่า", en: "System & Settings" },
  "/pages": { th: "ระบบ & ตั้งค่า", en: "System & Settings" },
  "/editor": { th: "ระบบ & ตั้งค่า", en: "System & Settings" },
};

// ════════════════ Hero หน้า (หัวข้อหลัก) ════════════════
// key = เส้นทางหลักของหน้า (ใช้ usePageHero("repair") หรือ tHero("repair", "title"))
export type PageHero = { eyebrow: string; title: string; desc: string };
const PAGE_HERO: Record<string, { th: PageHero; en: PageHero }> = {
  dashboard: {
    th: { eyebrow: "Plant Status Board · CMMS-TOPPAN", title: "แผงควบคุมโรงงาน", desc: "สถานะเครื่องจักรแบบเรียลไทม์ — ไฟเขียวคือพร้อมเดิน ไฟแดงคือต้องการความสนใจทันที" },
    en: { eyebrow: "Plant Status Board · CMMS-TOPPAN", title: "Plant Status Board", desc: "Real-time machine status — green is ready to run, red needs immediate attention" },
  },
  repair: {
    th: { eyebrow: "Work Order Board · CMMS-TOPPAN", title: "ใบสั่งงานซ่อม", desc: "สถานะงานจากใบแจ้งซ่อม — ไฟเหลืองคือค้างอยู่ ไฟแดงกระพริบคือเกินกำหนด" },
    en: { eyebrow: "Work Order Board · CMMS-TOPPAN", title: "Work Orders", desc: "Repair status from work orders — yellow is pending, blinking red is overdue" },
  },
  "repair/my_tasks": {
    th: { eyebrow: "My Tasks · CMMS-TOPPAN", title: "งานของฉัน (ซ่อม + PM)", desc: 'งานซ่อมและแผน PM ที่มอบหมายให้คุณ — กด "ไปทำ PM" แล้วสแกน QR ที่เครื่องเพื่อตรวจเช็คได้เลย' },
    en: { eyebrow: "My Tasks · CMMS-TOPPAN", title: "My Tasks (Repair + PM)", desc: 'Repairs and PM plans assigned to you — tap "Run PM" then scan the machine QR' },
  },
  "repair/assign": {
    th: { eyebrow: "WORK DISPATCH · CMMS-TOPPAN", title: "แจกงานซ่อม (Dispatch)", desc: "มอบหมายใบแจ้งซ่อมให้กับช่างซ่อมบำรุงที่เหมาะสม" },
    en: { eyebrow: "WORK DISPATCH · CMMS-TOPPAN", title: "Assign Jobs (Dispatch)", desc: "Assign work orders to the right technicians" },
  },
  "repair/tracking": {
    th: { eyebrow: "Repair Tracking · CMMS-TOPPAN", title: "ติดตามงานซ่อม (Repair Tracking)", desc: "ตรวจสอบสถานะงานซ่อมที่คุณได้แจ้งไว้ และประเมินผลความพึงพอใจการซ่อมของช่าง" },
    en: { eyebrow: "Repair Tracking · CMMS-TOPPAN", title: "Repair Tracking", desc: "Track your reported repairs and rate technician satisfaction" },
  },
  "repair/kanban": {
    th: { eyebrow: "Kanban Board · CMMS-TOPPAN", title: "Kanban งานซ่อม", desc: "บอร์ดติดตามสถานะงานซ่อมตามกระบวนการทำงาน — หัวคอลัมน์เป็นไฟสัญญาณ: เหลือง=อยู่ในสายงาน แดง=รออะไหล่ เขียว=เสร็จ" },
    en: { eyebrow: "Kanban Board · CMMS-TOPPAN", title: "Repair Kanban", desc: "Track work orders by process — column headers are signal lights: yellow=in line, red=waiting parts, green=done" },
  },
  "repair/workload": {
    th: { eyebrow: "WORKLOAD BOARD · CMMS-TOPPAN", title: "ภาระงานช่าง (Workload)", desc: "ภาพรวมงานค้าง งานเกินกำหนด และผลงานรายคน เพื่อกระจายงานได้ทั่วถึง" },
    en: { eyebrow: "WORKLOAD BOARD · CMMS-TOPPAN", title: "Technician Workload", desc: "Overview of pending, overdue and per-person results to balance work" },
  },
  pm_am: {
    th: { eyebrow: "PM AM · CMMS-TOPPAN", title: "แผนบำรุงรักษาเชิงป้องกัน (PM)", desc: "แผนซ่อมบำรุงเชิงป้องกัน และตารางตรวจเช็คเครื่องจักร" },
    en: { eyebrow: "PM AM · CMMS-TOPPAN", title: "Preventive Maintenance (PM)", desc: "PM schedules and machine inspection checklists" },
  },
  "pm_am/calendar": {
    th: { eyebrow: "PM CALENDAR · CMMS-TOPPAN", title: "ปฏิทินงานซ่อมบำรุง (PM Calendar)", desc: "ติดตามแผนงานซ่อมบำรุงเชิงป้องกัน — ไฟแดงคืองานเลยกำหนด ไฟเหลืองคือต้องทำ" },
    en: { eyebrow: "PM CALENDAR · CMMS-TOPPAN", title: "PM Calendar", desc: "Track PM plans — red is overdue, yellow is due" },
  },
  spare_parts: {
    th: { eyebrow: "SPARE PARTS · CMMS-TOPPAN", title: "คลังสต็อกอะไหล่ (เชื่อมต่อ Sage 300 ERP)", desc: "ระบบบริหารคลังอะไหล่ที่เชื่อมต่อฐานข้อมูล Sage 300 ERP (I/C Inventory Control) สำหรับ TOPPAN" },
    en: { eyebrow: "SPARE PARTS · CMMS-TOPPAN", title: "Spare Parts Stock (Sage 300 ERP)", desc: "Spare parts management connected to Sage 300 ERP (I/C Inventory Control)" },
  },
  "spare_parts/issue_center": {
    th: { eyebrow: "ISSUE CENTER · CMMS-TOPPAN", title: "ศูนย์เบิก-จ่ายอะไหล่ (Issue Center)", desc: "เบิกจ่ายอะไหล่จากคลังให้กับใบสั่งงานซ่อมและช่างผู้รับผิดชอบ" },
    en: { eyebrow: "ISSUE CENTER · CMMS-TOPPAN", title: "Issue Center", desc: "Issue spare parts to work orders and responsible technicians" },
  },
  "spare_parts/sage_po": {
    th: { eyebrow: "SPARE PARTS SAGE PO · CMMS-TOPPAN", title: "รับอะไหล่จาก PO (Sage PO Receipt)", desc: "บันทึกการรับเข้าคลังเมื่ออะไหล่ตามใบสั่งซื้อมาถึง" },
    en: { eyebrow: "SPARE PARTS SAGE PO · CMMS-TOPPAN", title: "Receive from PO (Sage)", desc: "Record stock receipt when ordered parts arrive" },
  },
  analytics: {
    th: { eyebrow: "ANALYTICS · CMMS-TOPPAN", title: "วิเคราะห์ประสิทธิภาพการซ่อมบำรุง", desc: "ติดตาม MTBF, MTTR, งานซ่อม และค่าใช้จ่ายรายเดือนของโรงงาน" },
    en: { eyebrow: "ANALYTICS · CMMS-TOPPAN", title: "Maintenance Analytics", desc: "Track MTBF, MTTR, repairs and monthly plant costs" },
  },
  "analytics/kpi": {
    th: { eyebrow: "EXECUTIVE KPI · CMMS-TOPPAN", title: "KPI ผู้บริหาร (Executive Dashboard)", desc: "MTTR/MTBF · %PM ทันกำหนด · %งานปิดใน SLA · ค่าใช้จ่ายซ่อม — ข้อมูลจากฐานข้อมูลจริง" },
    en: { eyebrow: "EXECUTIVE KPI · CMMS-TOPPAN", title: "Executive KPI", desc: "MTTR/MTBF · on-time PM · SLA closure · repair costs — from real database data" },
  },
  users: {
    th: { eyebrow: "USER MANAGEMENT · CMMS-TOPPAN", title: "ผู้ใช้งานระบบ (User Management)", desc: "จัดการผู้ใช้ เพิ่ม แก้ไข ลบ และจัดการสิทธิ์เข้าใช้งานระบบ CMMS" },
    en: { eyebrow: "USER MANAGEMENT · CMMS-TOPPAN", title: "Users", desc: "Manage users — add, edit, delete and control CMMS access" },
  },
  settings: {
    th: { eyebrow: "SETTINGS · CMMS-TOPPAN", title: "ตั้งค่าระบบ (System Settings)", desc: "จัดการพารามิเตอร์ของระบบ CMMS จากตาราง settings จริง — แก้ไขแล้วบันทึกลงฐานข้อมูลทันที" },
    en: { eyebrow: "SETTINGS · CMMS-TOPPAN", title: "System Settings", desc: "Manage CMMS parameters from the real settings table — save straight to the database" },
  },
  asset_registry: {
    th: { eyebrow: "ASSET REGISTRY · CMMS-TOPPAN", title: "ทะเบียนเครื่องจักรและทรัพย์สิน", desc: "ฐานข้อมูลเครื่องจักร อุปกรณ์ และสายการผลิตทั้งหมดของโรงงาน TOPPAN" },
    en: { eyebrow: "ASSET REGISTRY · CMMS-TOPPAN", title: "Machine & Asset Registry", desc: "Database of all TOPPAN machines, equipment and production lines" },
  },
  inspections: {
    th: { eyebrow: "INSPECTION CHECKLIST · CMMS-TOPPAN", title: "ตรวจเช็ครอบ (Checklist)", desc: "รอบตรวจตามเครื่อง/สาธารณูปโภค — ตรวจเช็คเสร็จแล้วบันทึกผลได้ทันที" },
    en: { eyebrow: "INSPECTION CHECKLIST · CMMS-TOPPAN", title: "Round Inspections", desc: "Inspection rounds per machine/utility — record results immediately" },
  },
  mtbf_mttr: {
    th: { eyebrow: "MTBF MTTR · CMMS-TOPPAN", title: "รายงานดัชนีชี้วัด MTBF & MTTR (Reliability KPI)", desc: "ติดตามค่าระยะเวลาเฉลี่ยก่อนการชำรุด (MTBF) และระยะเวลาเฉลี่ยในการซ่อม (MTTR)" },
    en: { eyebrow: "MTBF MTTR · CMMS-TOPPAN", title: "MTBF & MTTR Report (Reliability KPI)", desc: "Track mean time between failures (MTBF) and mean time to repair (MTTR)" },
  },
  calibration: {
    th: { eyebrow: "CALIBRATION · CMMS-TOPPAN", title: "ทะเบียนสอบเทียบเครื่องมือวัด", desc: "ติดตามรอบการสอบเทียบของเครื่องมือวัดในโรงงานทั้งหมด" },
    en: { eyebrow: "CALIBRATION · CMMS-TOPPAN", title: "Instrument Calibration", desc: "Track calibration cycles for all instruments" },
  },
  reports: {
    th: { eyebrow: "REPORTS HUB · CMMS-TOPPAN", title: "ศูนย์รวมรายงาน & การส่งออกข้อมูล", desc: "รายงานสรุปผลการซ่อมบำรุงประจำเดือน PDF สำหรับผู้บริหาร และการส่งออกไฟล์ Excel/CSV" },
    en: { eyebrow: "REPORTS HUB · CMMS-TOPPAN", title: "Reports Center & Data Export", desc: "Monthly maintenance summary PDF for executives and Excel/CSV export" },
  },
};

// ════════════════ helper: สถานะ / ความเร่งด่วน ════════════════
/** แปลสถานะ (รองรับตัวพิมพ์ใหญ่/เว้นวรรค: "In Progress" → in_progress) */
export function statusText(s: string | undefined | null, fallback = "—"): string {
  if (!s) return fallback;
  const norm = String(s).trim().toLowerCase().replace(/\s+/g, "_");
  const v = t("status." + norm);
  return v === "status." + norm ? (String(s) || fallback) : v;
}

/** แปลความเร่งด่วน (critical/high/medium/low) */
export function priorityText(s: string | undefined | null, fallback = "—"): string {
  if (!s) return fallback;
  const norm = String(s).trim().toLowerCase().replace(/\s+/g, "_");
  const v = t("priority." + norm);
  return v === "priority." + norm ? (String(s) || fallback) : v;
}

// ════════════════ state + helpers ════════════════
const STORAGE_KEY = "cmms_lang";
const listeners = new Set<() => void>();

export function getUserLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "en" || v === "th" ? v : null;
}

export function setUserLang(lang: Lang) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, lang);
  listeners.forEach((fn) => fn());
}

/** ตั้งค่าเริ่มต้นจาก settings API (lang_default) — เรียก 1 ครั้งตอน app mount */
export async function applySystemLang(): Promise<void> {
  if (typeof window === "undefined" || getUserLang()) return;
  try {
    const res = await fetch("/api/v1/settings.php");
    if (!res.ok) return;
    const json = await res.json();
    const rows: any[] = Array.isArray(json) ? json : (json?.data ?? []);
    const row = rows.find((r) => r?.setting_key === "lang_default");
    if (row?.setting_value === "en") setUserLang("en");
  } catch { /* ค่าเริ่มต้น th */ }
}

export function currentLang(): Lang {
  return getUserLang() ?? "th";
}

/** Reactive hook — ใช้ใน layout เพื่อให้ UI ทั้งหมดอัปเดตเมื่อสลับภาษา */
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>(() => currentLang());
  useEffect(() => {
    const fn = () => setLang(currentLang());
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return lang;
}

export function t(key: string, lang?: Lang): string {
  const l = lang ?? currentLang();
  const entry = DICT[key];
  if (!entry) return key;
  return entry[l] ?? entry.th;
}

/** ชื่อหน้า breadcrumb — route เช่น "/repair/my_tasks" */
export function tPage(route: string, lang?: Lang): string {
  const l = lang ?? currentLang();
  const entry = PAGE_TITLES[route];
  if (!entry) return route.split("/").pop() || "";
  return entry[l] ?? entry.th;
}

/** หมวด breadcrumb — route เช่น "/repair" */
export function tSection(route: string, lang?: Lang): string {
  const l = lang ?? currentLang();
  for (const [prefix, entry] of Object.entries(SECTION_MAP)) {
    if (route.startsWith(prefix)) return entry[l] ?? entry.th;
  }
  return "";
}

/** Hero ของหน้า — usePageHero("repair") → { eyebrow, title, desc } */
export function usePageHero(key: string, fallback?: Partial<PageHero>): PageHero {
  const lang = useLang();
  const entry = PAGE_HERO[key];
  const base = entry ? entry[lang] : { eyebrow: "", title: key, desc: "" };
  return {
    eyebrow: base.eyebrow || fallback?.eyebrow || "",
    title: base.title || fallback?.title || key,
    desc: base.desc || fallback?.desc || "",
  };
}

export function hasTranslation(key: string): boolean {
  return key in DICT;
}

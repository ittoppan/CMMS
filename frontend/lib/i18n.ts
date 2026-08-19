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
  "menu.forms_designer": { th: "ออกแบบแบบฟอร์มดิจิทัล", en: "Form Designer" },
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
  "menu.settings_repair_options": { th: "ตัวเลือกฟอร์มแจ้งซ่อม", en: "Repair Form Options" },
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


  // ── ฟอร์มสร้าง/แก้ไข (users/suppliers/roles/calibration/spare_parts/assets) ──
  "action.add_another_part": { th: "เพิ่มอะไหล่อีก", en: "Add Another Part" },
  "action.add_another_user": { th: "เพิ่มผู้ใช้อีก", en: "Add Another User" },
  "action.back_to_list": { th: "กลับไปหน้ารายการ", en: "Back to List" },
  "action.back_to_parts": { th: "กลับไปหน้าคลังอะไหล่", en: "Back to Spare Parts" },
  "action.back_to_permissions": { th: "กลับไปจัดการสิทธิ์", en: "Back to Permissions" },
  "action.back_to_users": { th: "กลับไปหน้ารายการผู้ใช้", en: "Back to User List" },
  "action.change_profile_image": { th: "เปลี่ยนรูปโปรไฟล์", en: "Change Profile Image" },
  "action.reverse_entry": { th: "กลับรายการ", en: "Reverse Entry" },
  "action.save_data": { th: "บันทึกข้อมูล", en: "Save" },
  "action.save_edit": { th: "บันทึกการแก้ไข", en: "Save Changes" },
  "common.creating": { th: "กำลังสร้าง...", en: "Creating..." },
  "common.loading_data": { th: "กำลังโหลดข้อมูล...", en: "Loading data..." },
  "common.loading_parts": { th: "กำลังโหลดข้อมูลอะไหล่...", en: "Loading part data..." },
  "common.loading_users": { th: "กำลังโหลดข้อมูลผู้ใช้...", en: "Loading user data..." },
  "common.saving": { th: "กำลังบันทึก...", en: "Saving..." },
  "common.uploading": { th: "อัปโหลดรูปภาพ...", en: "Uploading..." },
  "field.active": { th: "ใช้งาน", en: "Active" },
  "field.address": { th: "ที่อยู่", en: "Address" },
  "field.boiler": { th: "หม้อไอน้ำ", en: "Boiler" },
  "field.category": { th: "หมวดหมู่", en: "Category" },
  "field.company_name": { th: "ชื่อบริษัท", en: "Company Name" },
  "field.compressor": { th: "คอมเพรสเซอร์", en: "Compressor" },
  "field.contact_person": { th: "ผู้ติดต่อ", en: "Contact Person" },
  "field.conveyor": { th: "สายพานลำเลียง", en: "Conveyor" },
  "field.email": { th: "อีเมล", en: "Email" },
  "field.employee_code": { th: "รหัสพนักงาน", en: "Employee Code" },
  "field.engineer": { th: "วิศวกร", en: "Engineer" },
  "field.full_name": { th: "ชื่อ-นามสกุล", en: "Full Name" },
  "field.heat_exchanger": { th: "เครื่องแลกเปลี่ยนความร้อน", en: "Heat Exchanger" },
  "field.manufacturer": { th: "ผู้ผลิต", en: "Manufacturer" },
  "field.model": { th: "รุ่น", en: "Model" },
  "field.motor": { th: "มอเตอร์", en: "Motor" },
  "field.password": { th: "รหัสผ่าน", en: "Password" },
  "field.phone": { th: "เบอร์โทรศัพท์", en: "Phone Number" },
  "field.position": { th: "ตำแหน่งงาน", en: "Position" },
  "field.pump": { th: "ปั๊ม", en: "Pump" },
  "field.role": { th: "บทบาท", en: "Role" },
  "field.storage": { th: "ที่เก็บ", en: "Storage" },
  "field.storage_location": { th: "สถานที่เก็บ", en: "Storage Location" },
  "field.supplier": { th: "ซัพพลายเออร์", en: "Supplier" },
  "field.tax_id": { th: "เลขประจำตัวผู้เสียภาษี", en: "Tax ID" },
  "field.unit": { th: "หน่วยนับ", en: "Unit" },
  "field.username": { th: "ชื่อผู้ใช้", en: "Username" },
  "form.account_status": { th: "สถานะบัญชีผู้ใช้", en: "Account Status" },
  "form.activate_account": { th: "ใช้งานบัญชีนี้", en: "Activate This Account" },
  "form.additional_details": { th: "รายละเอียดเพิ่มเติม", en: "Additional Details" },
  "form.administrator": { th: "ผู้ดูแลระบบ", en: "Administrator" },
  "form.asset_code_req": { th: "รหัสทรัพย์สิน *", en: "Asset Code *" },
  "form.asset_name_req": { th: "ชื่อทรัพย์สิน *", en: "Asset Name *" },
  "form.assets_create_title": { th: "ลงทะเบียนเครื่องจักรใหม่", en: "Register New Machine" },
  "form.assets_save": { th: "บันทึกเครื่องจักร", en: "Save Machine" },
  "form.avatar_engineer1": { th: "วิศวกร 1", en: "Engineer 1" },
  "form.avatar_hint": { th: "เลือกรูปประจำตัว หรืออัปโหลดไฟล์รูปภาพใหม่", en: "Choose an avatar or upload a new image file" },
  "form.avatar_tech1": { th: "ช่างซ่อม 1", en: "Technician 1" },
  "form.avatar_tech2": { th: "ช่างซ่อม 2", en: "Technician 2" },
  "form.cal_edit_full": { th: "แก้ไขข้อมูลการสอบเทียบ", en: "Edit Calibration Information" },
  "form.cal_edit_title": { th: "แก้ไขข้อมูลสอบเทียบ", en: "Edit Calibration" },
  "form.cal_external": { th: "ส่งสอบเทียบภายนอก", en: "External Calibration" },
  "form.cal_internal": { th: "สอบเทียบภายใน", en: "Internal Calibration" },
  "form.cal_plan_new": { th: "แผนสอบเทียบใหม่", en: "New Calibration Plan" },
  "form.cal_register": { th: "ลงทะเบียนสอบเทียบ", en: "Register Calibration" },
  "form.cal_register_tool_title": { th: "ลงทะเบียนสอบเทียบเครื่องมือวัด", en: "Register Measuring Tool Calibration" },
  "form.cal_type_req": { th: "ประเภทการสอบเทียบ *", en: "Calibration Type *" },
  "form.calibration": { th: "การสอบเทียบ", en: "Calibration" },
  "form.calibration_plan": { th: "แผนสอบเทียบ", en: "Calibration Plan" },
  "form.cat_bearings": { th: "ลูกปืน (Bearings)", en: "Bearings" },
  "form.cat_belts": { th: "สายพาน (Belts)", en: "Belts" },
  "form.cat_electrical": { th: "ไฟฟ้า (Electrical)", en: "Electrical" },
  "form.cat_filters": { th: "ฟิลเตอร์ (Filters)", en: "Filters" },
  "form.cat_hydraulics": { th: "ไฮดรอลิก (Hydraulics)", en: "Hydraulics" },
  "form.cat_seals": { th: "ซีลและโอริง (Seals)", en: "Seals" },
  "form.cat_seals_orings": { th: "ซีลและโอริง (Seals & O-Rings)", en: "Seals & O-Rings" },
  "form.category_req": { th: "หมวดหมู่ *", en: "Category *" },
  "form.certificate_no": { th: "เลขใบรับรอง", en: "Certificate No." },
  "form.choose_upload_avatar": { th: "เลือกหรืออัปโหลดรูปโปรไฟล์", en: "Choose or upload a profile image" },
  "form.company_name_req": { th: "ชื่อบริษัท *", en: "Company Name *" },
  "form.contact_name": { th: "ชื่อผู้ติดต่อ", en: "Contact Name" },
  "form.current_stock": { th: "สต็อกปัจจุบัน", en: "Current Stock" },
  "form.current_stock_qty": { th: "จำนวนสต็อกปัจจุบัน", en: "Current Stock Quantity" },
  "form.department_req": { th: "แผนก *", en: "Department *" },
  "form.dept_assembly": { th: "ฝ่ายประกอบ", en: "Assembly Department" },
  "form.dept_building": { th: "ฝ่ายอาคาร", en: "Building Department" },
  "form.dept_production": { th: "ฝ่ายผลิต", en: "Production Department" },
  "form.dept_utilities": { th: "ฝ่ายสาธารณูปโภค", en: "Utilities Department" },
  "form.dept_warehouse": { th: "ฝ่ายคลังสินค้า", en: "Warehouse Department" },
  "form.due_date_req": { th: "วันครบกำหนด *", en: "Due Date *" },
  "form.employee_code_req": { th: "รหัสพนักงาน *", en: "Employee Code *" },
  "form.enabled": { th: "เปิดใช้งาน", en: "Enable" },
  "form.equipment_electrical": { th: "อุปกรณ์ไฟฟ้า", en: "Electrical Equipment" },
  "form.force_change_hint": { th: "บังคับ (ต้องเปลี่ยนก่อนใช้งาน)", en: "Required (must change before use)" },
  "form.force_password_change": { th: "บังคับเปลี่ยนรหัสผ่านครั้งแรก", en: "Force password change on first login" },
  "form.force_password_hint": { th: "ให้เปลี่ยนรหัสเมื่อล็อกอินครั้งหน้า", en: "Change password on next login" },
  "form.full_name_req": { th: "ชื่อ-นามสกุล *", en: "Full Name *" },
  "form.general": { th: "ทั่วไป", en: "General" },
  "form.install_date": { th: "วันที่ติดตั้ง", en: "Installation Date" },
  "form.install_location": { th: "สถานที่ติดตั้ง", en: "Installation Location" },
  "form.last_cal_date_req": { th: "วันที่สอบเทียบล่าสุด *", en: "Last Calibration Date *" },
  "form.line_id_label": { th: "LINE ID (รหัสผู้ใช้)", en: "LINE ID (User ID)" },
  "form.machine_operator": { th: "ผู้ควบคุมเครื่องจักร", en: "Machine Operator" },
  "form.manager": { th: "ผู้จัดการ", en: "Manager" },
  "form.manufacturer_create_title": { th: "เพิ่มข้อมูลผู้ผลิตใหม่", en: "Add New Manufacturer" },
  "form.manufacturer_edit_title": { th: "แก้ไขข้อมูลผู้ผลิต", en: "Edit Manufacturer" },
  "form.max_stock": { th: "สต็อกสูงสุด", en: "Max Stock" },
  "form.measuring_tool_req": { th: "เครื่องมือวัด *", en: "Measuring Tool *" },
  "form.new_password": { th: "รหัสผ่านใหม่", en: "New Password" },
  "form.new_password_optional": { th: "รหัสผ่านใหม่ (หากต้องการเปลี่ยน)", en: "New Password (if you want to change it)" },
  "form.optional": { th: "ไม่บังคับ", en: "Optional" },
  "form.part_code": { th: "รหัสอะไหล่", en: "Part Code" },
  "form.part_code_req": { th: "รหัสอะไหล่ *", en: "Part Code *" },
  "form.part_image": { th: "รูปอะไหล่", en: "Part Image" },
  "form.part_image_upload": { th: "รูปภาพอะไหล่", en: "Part Image" },
  "form.part_info": { th: "ข้อมูลอะไหล่", en: "Part Information" },
  "form.part_name": { th: "ชื่ออะไหล่", en: "Part Name" },
  "form.part_name_req": { th: "ชื่อรายการอะไหล่ *", en: "Part Name *" },
  "form.parts_create_title": { th: "เพิ่มรายการอะไหล่ใหม่", en: "Add New Part" },
  "form.parts_edit_title": { th: "แก้ไขรายการอะไหล่", en: "Edit Part" },
  "form.parts_save_new": { th: "บันทึกอะไหล่ใหม่", en: "Save New Part" },
  "form.password_blank_hint": { th: "เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน", en: "Leave blank if you don't want to change the password" },
  "form.password_req": { th: "รหัสผ่าน *", en: "Password *" },
  "form.pending_schedule": { th: "รอเข้าตาราง", en: "Pending Schedule" },
  "form.profile_edit_title": { th: "แก้ไขโปรไฟล์และข้อมูลผู้ใช้", en: "Edit Profile and User Information" },
  "form.reference_code": { th: "รหัสอ้างอิง", en: "Reference Code" },
  "form.reference_code_req": { th: "รหัสอ้างอิง *", en: "Reference Code *" },
  "form.registration_form": { th: "ฟอร์มลงทะเบียน", en: "Registration Form" },
  "form.reorder_point": { th: "จุดสั่งซื้อขั้นต่ำ", en: "Reorder Point" },
  "form.role_name": { th: "ชื่อบทบาท", en: "Role Name" },
  "form.role_name_req": { th: "ชื่อบทบาท *", en: "Role Name *" },
  "form.roles_create_title": { th: "สร้างบทบาทใหม่", en: "Create New Role" },
  "form.roles_edit_title": { th: "แก้ไขข้อมูลบทบาท", en: "Edit Role" },
  "form.select_category": { th: "เลือกหมวดหมู่", en: "Select Category" },
  "form.select_department": { th: "เลือกแผนก", en: "Select Department" },
  "form.set_password": { th: "กำหนดรหัสผ่าน", en: "Set Password" },
  "form.supplier_info": { th: "ข้อมูลซัพพลายเออร์", en: "Supplier Information" },
  "form.supplier_new": { th: "Supplier ใหม่", en: "New Supplier" },
  "form.suspend": { th: "ระงับการใช้งาน", en: "Suspend" },
  "form.technician": { th: "ช่างซ่อมบำรุง", en: "Technician" },
  "form.unit_price_baht": { th: "ราคาต่อหน่วย (บาท)", en: "Unit Price (Baht)" },
  "form.usage_role": { th: "บทบาทการใช้งาน", en: "Usage Role" },
  "form.usage_status": { th: "สถานะการใช้งาน", en: "Usage Status" },
  "form.user_account": { th: "บัญชีผู้ใช้", en: "User Account" },
  "form.user_account_info": { th: "ข้อมูลบัญชีผู้ใช้", en: "User Account Information" },
  "form.username_req": { th: "ชื่อผู้ใช้ *", en: "Username *" },
  "form.users_create_short": { th: "สร้างผู้ใช้ใหม่", en: "Create New User" },
  "form.users_create_title": { th: "สร้างบัญชีผู้ใช้ใหม่", en: "Create New User Account" },
  "hero.assets_create_desc": { th: "กรอกข้อมูลเครื่องจักร/ทรัพย์สินใหม่เข้าระบบทะเบียน CMMS-TOPPAN", en: "Enter new machine/asset data into the CMMS-TOPPAN registry" },
  "hero.cal_create_desc": { th: "สร้างแผนสอบเทียบใหม่สำหรับเครื่องมือวัด — ระบุประเภท รอบ และเลขใบรับรอง", en: "Create a new calibration plan for measuring tools — set type, cycle, and certificate no." },
  "hero.cal_edit_desc": { th: "แก้ไขข้อมูลแผนสอบเทียบ — วันที่ รอบ และสถานะ", en: "Edit calibration plan — date, cycle, and status" },
  "hero.manufacturer_create_desc": { th: "เพิ่มข้อมูลผู้ผลิตหรือผู้จัดจำหน่ายรายใหม่เข้าสู่ระบบ", en: "Add a new manufacturer or supplier to the system" },
  "hero.manufacturer_edit_desc": { th: "ปรับปรุงข้อมูลผู้ผลิตหรือผู้จัดจำหน่ายในระบบ", en: "Update manufacturer or supplier information in the system" },
  "hero.parts_create_desc": { th: "บันทึกรหัส ชื่อ หมวดหมู่ ที่เก็บ และจำนวนสต็อกขั้นต่ำ", en: "Save code, name, category, storage, and minimum stock" },
  "hero.parts_edit_desc": { th: "แก้ไขรหัส ชื่อ หมวดหมู่ ที่เก็บ และจำนวนสต็อกขั้นต่ำ", en: "Edit code, name, category, storage, and minimum stock" },
  "hero.profile_edit_desc": { th: "ปรับปรุงโปรไฟล์ รูปภาพประจำตัว รหัสผ่าน และสิทธิ์การใช้งานในระบบ CMMS", en: "Update profile, avatar, password, and system permissions in CMMS" },
  "hero.roles_create_desc": { th: "เพิ่มบทบาทใหม่ในระบบเพื่อใช้ในการกำหนดสิทธิ์การเข้าถึงข้อมูล", en: "Add a new role to the system for access permissions" },
  "hero.roles_edit_desc": { th: "ปรับปรุงข้อมูลบทบาทในระบบเพื่อใช้ในการกำหนดสิทธิ์การเข้าถึงข้อมูล", en: "Update role data in the system for access permissions" },
  "hero.users_create_desc": { th: "เพิ่มข้อมูลพนักงาน กำหนดบทบาท สิทธิ์ และอัปโหลดรูปโปรไฟล์", en: "Add employee data, set role, permissions, and upload profile image" },
  "msg.added_successfully": { th: "ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว", en: "Added to the system successfully" },
  "msg.cal_create_error": { th: "เกิดข้อผิดพลาดในการสร้างแผนสอบเทียบ", en: "Error creating calibration plan" },
  "msg.cal_plan_added": { th: "แผนสอบเทียบสำหรับเครื่องมือนี้ ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว", en: "Calibration plan for this tool added successfully" },
  "msg.cal_plan_updated": { th: "แผนสอบเทียบ ถูกอัปเดตเรียบร้อยแล้ว", en: "Calibration plan updated successfully" },
  "msg.cal_required_fields": { th: "กรุณาเลือกเครื่องมือ, ระบุวันที่สอบเทียบ และวันครบกำหนด", en: "Please select a tool, calibration date, and due date" },
  "msg.calibration_id_missing": { th: "ไม่ระบุหมายเลข Calibration", en: "Calibration number not specified" },
  "msg.calibration_not_found": { th: "ไม่พบข้อมูล Calibration", en: "Calibration not found" },
  "msg.conn_fail_retry": { th: "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง", en: "Cannot connect to the system. Please try again." },
  "msg.image_process_error": { th: "ไม่สามารถประมวลผลรูปภาพได้ กรุณาเลือกรูปอื่น", en: "Cannot process the image. Please choose another one." },
  "msg.load_error": { th: "เกิดข้อผิดพลาดในการโหลดข้อมูล", en: "Error loading data" },
  "msg.manufacturer_code_name_required": { th: "กรุณาระบุรหัสผู้ผลิต และชื่อผู้ผลิต", en: "Please specify manufacturer code and name" },
  "msg.part_added": { th: "เพิ่มรายการอะไหล่สำเร็จ!", en: "Part added successfully!" },
  "msg.part_code_name_required": { th: "กรุณากรอกรหัสอะไหล่ และชื่ออะไหล่", en: "Please fill in the part code and part name" },
  "msg.part_id_missing": { th: "ไม่ระบุรหัสอะไหล่", en: "Part ID not specified" },
  "msg.part_load_error": { th: "เกิดข้อผิดพลาดในการโหลดข้อมูลอะไหล่", en: "Error loading part data" },
  "msg.part_not_found": { th: "ไม่พบข้อมูลอะไหล่", en: "Part not found" },
  "msg.part_save_error": { th: "เกิดข้อผิดพลาดในการบันทึกข้อมูลอะไหล่", en: "Error saving part data" },
  "msg.part_saved": { th: "บันทึกข้อมูลอะไหล่สำเร็จ!", en: "Part saved successfully!" },
  "msg.part_saved_to_stock": { th: "บันทึกเข้าสู่ระบบคลังเรียบร้อยแล้ว", en: "Saved to the inventory system" },
  "msg.role_create_error": { th: "เกิดข้อผิดพลาดในการสร้าง Role", en: "Error creating role" },
  "msg.role_created": { th: "สร้างบทบาทสำเร็จ!", en: "Role created successfully!" },
  "msg.role_id_missing": { th: "ไม่ระบุหมายเลข Role", en: "Role number not specified" },
  "msg.role_name_required": { th: "กรุณาระบุชื่อบทบาท", en: "Please specify the role name" },
  "msg.role_not_found": { th: "ไม่พบข้อมูล Role", en: "Role not found" },
  "msg.role_update_error": { th: "เกิดข้อผิดพลาดในการอัปเดต Role", en: "Error updating role" },
  "msg.role_updated": { th: "อัปเดตบทบาทสำเร็จ!", en: "Role updated successfully!" },
  "msg.save_error": { th: "เกิดข้อผิดพลาดในการบันทึก", en: "Error saving data" },
  "msg.supplier_create_error": { th: "เกิดข้อผิดพลาดในการสร้าง Supplier", en: "Error creating supplier" },
  "msg.supplier_created": { th: "สร้าง Supplier สำเร็จ!", en: "Supplier created successfully!" },
  "msg.supplier_id_missing": { th: "ไม่ระบุหมายเลข Supplier", en: "Supplier number not specified" },
  "msg.supplier_not_found": { th: "ไม่พบข้อมูล Supplier", en: "Supplier not found" },
  "msg.tool_registered": { th: "ลงทะเบียนเครื่องมือสำเร็จ!", en: "Tool registered successfully!" },
  "msg.update_error": { th: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล", en: "Error updating data" },
  "msg.update_success": { th: "อัปเดตข้อมูลสำเร็จ!", en: "Data updated successfully!" },
  "msg.updated_successfully": { th: "ถูกอัปเดตเรียบร้อยแล้ว", en: "Updated successfully" },
  "msg.user_create_error": { th: "เกิดข้อผิดพลาดในการสร้างผู้ใช้", en: "Error creating user" },
  "msg.user_created": { th: "สร้างผู้ใช้ใหม่สำเร็จ!", en: "User created successfully!" },
  "msg.user_id_missing": { th: "ไม่ระบุรหัสผู้ใช้", en: "User ID not specified" },
  "msg.user_load_error": { th: "เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้", en: "Error loading user data" },
  "msg.user_not_found": { th: "ไม่พบข้อมูลผู้ใช้", en: "User not found" },
  "msg.user_required_fields": { th: "กรุณากรอกชื่อผู้ใช้ รหัสพนักงาน ชื่อ-นามสกุล และรหัสผ่าน (รหัสพนักงานใช้สำหรับผูกบัญชี LINE)", en: "Please fill in username, employee code, full name, and password (employee code links LINE)" },
  "msg.user_saved": { th: "บันทึกข้อมูลผู้ใช้สำเร็จ!", en: "User saved successfully!" },
  "msg.username_fullname_required": { th: "กรุณากรอกชื่อผู้ใช้ และชื่อ-นามสกุล", en: "Please fill in username and full name" },
  "placeholder.address": { th: "เช่น อาคาร A ชั้น 2", en: "e.g. Building A, Floor 2" },
  "placeholder.asset_code": { th: "เช่น AST-016", en: "e.g. AST-016" },
  "placeholder.asset_name": { th: "เช่น Centrifugal Pump P-102", en: "e.g. Centrifugal Pump P-102" },
  "placeholder.certificate_no": { th: "เช่น CERT-2026-001", en: "e.g. CERT-2026-001" },
  "placeholder.company_name": { th: "ชื่อบริษัท หรือ ชื่อร้านค้า", en: "Company or store name" },
  "placeholder.doc_address": { th: "ที่อยู่สำหรับออกเอกสาร...", en: "Address for documents..." },
  "placeholder.email": { th: "เช่น somchai@toppan.co.th", en: "e.g. somchai@toppan.co.th" },
  "placeholder.employee_code": { th: "เช่น E01117", en: "e.g. E01117" },
  "placeholder.employee_code_line": { th: "เช่น E01117 — ใช้ผูกบัญชี LINE", en: "e.g. E01117 — used to link LINE account" },
  "placeholder.full_name": { th: "เช่น สมชาย ใจดี", en: "e.g. Somchai Jaidee" },
  "placeholder.line_id": { th: "เช่น U61f2a48ea934bd4438d0f2cb58aa46a2 — ใช้สำหรับแจ้งเตือน LINE", en: "e.g. U61f2a48... — used for LINE notifications" },
  "placeholder.manufacturer": { th: "เช่น Grundfos, Siemens", en: "e.g. Grundfos, Siemens" },
  "placeholder.model": { th: "เช่น CR 32-3", en: "e.g. CR 32-3" },
  "placeholder.part_code": { th: "เช่น SP-BRG-6205, SP-OIL-SEAL", en: "e.g. SP-BRG-6205, SP-OIL-SEAL" },
  "placeholder.part_description": { th: "เช่น SKF 6205 Bearing แบริ่งลูกกลิ้ง", en: "e.g. SKF 6205 Bearing, roller bearing" },
  "placeholder.phone": { th: "เช่น 081-234-5678", en: "e.g. 081-234-5678" },
  "placeholder.position": { th: "เช่น ช่างซ่อมบำรุงอาวุโส", en: "e.g. Senior Maintenance Technician" },
  "placeholder.role_description": { th: "คำอธิบายหน้าที่และสิทธิ์เบื้องต้น...", en: "Description of duties and basic permissions..." },
  "placeholder.roles": { th: "เช่น ช่างซ่อมบำรุง, ผู้จัดการ", en: "e.g. Maintenance technician, Manager" },
  "placeholder.select_tool": { th: "เลือกเครื่องมือ...", en: "Select tool..." },
  "placeholder.specification": { th: "รายละเอียดเพิ่มเติม หรือ Specification", en: "Additional details or Specification" },
  "placeholder.storage": { th: "เช่น ชั้น A-02, แร็ค 3-B", en: "e.g. Shelf A-02, Rack 3-B" },
  "placeholder.supplier_code": { th: "เช่น SUP-001", en: "e.g. SUP-001" },
  "placeholder.unit": { th: "เช่น pcs, set, box, roll", en: "e.g. pcs, set, box, roll" },
  "placeholder.username": { th: "เช่น somchai.t", en: "e.g. somchai.t" },
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
  // ── เพิ่ม route ที่ขาด (43 รายการ) — ใช้กับ tab title / breadcrumb / app bar ──
  "/andon-board": { th: "บอร์ด Andon สถานะโรงงาน", en: "Andon Board" },
  "/approval": { th: "ศูนย์อนุมัติเอกสาร", en: "Approval Center" },
  "/approval/center": { th: "จัดการขั้นตอนการอนุมัติ", en: "Approval Workflows" },
  "/asset_registry/create": { th: "เพิ่มเครื่องจักรใหม่", en: "Add Machine" },
  "/asset_registry/edit": { th: "แก้ไขเครื่องจักร", en: "Edit Machine" },
  "/assets": { th: "ทรัพย์สิน & เครื่องจักร", en: "Assets & Machines" },
  "/assets/create": { th: "เพิ่มทรัพย์สินใหม่", en: "Add Asset" },
  "/calibration/create": { th: "เพิ่มรายการสอบเทียบ", en: "Add Calibration" },
  "/calibration/edit": { th: "แก้ไขรายการสอบเทียบ", en: "Edit Calibration" },
  "/change-password": { th: "เปลี่ยนรหัสผ่าน", en: "Change Password" },
  "/editor": { th: "เครื่องมือออกแบบหน้า", en: "Page Designer" },
  "/equipment_borrowing/create": { th: "บันทึกยืมอุปกรณ์", en: "Borrow Tool" },
  "/equipment_borrowing/edit": { th: "แก้ไขการยืม-คืน", en: "Edit Borrowing" },
  "/forms": { th: "ศูนย์แบบฟอร์ม", en: "Form Center" },
  "/forms/designer": { th: "ออกแบบแบบฟอร์ม", en: "Form Designer" },
  "/forms/run/[id]": { th: "กรอกแบบฟอร์ม", en: "Fill Form" },
  "/login": { th: "เข้าสู่ระบบ", en: "Login" },
  "/manuals": { th: "คู่มือการใช้งาน", en: "Manuals" },
  "/manuals/create": { th: "เพิ่มคู่มือใหม่", en: "Add Manual" },
  "/manuals/edit": { th: "แก้ไขคู่มือ", en: "Edit Manual" },
  "/mtbf_mttr/create": { th: "บันทึกข้อมูล MTBF/MTTR", en: "Add MTBF/MTTR" },
  "/mtbf_mttr/edit": { th: "แก้ไข MTBF/MTTR", en: "Edit MTBF/MTTR" },
  "/pages/[slug]": { th: "หน้าเว็บ", en: "Custom Page" },
  "/pm_am": { th: "แผน PM/AM", en: "PM/AM Plans" },
  "/pm_am/edit": { th: "แก้ไขแผน PM", en: "Edit PM Plan" },
  "/repair-request": { th: "ฟอร์มแจ้งซ่อมด่วน", en: "Quick Repair Request" },
  "/repair/edit": { th: "แก้ไขใบสั่งงานซ่อม", en: "Edit Work Order" },
  "/repair/view": { th: "รายละเอียดใบสั่งงานซ่อม", en: "Work Order Detail" },
  "/repair/workload": { th: "ภาระงานช่าง", en: "Technician Workload" },
  "/reports": { th: "ศูนย์รวมรายงาน", en: "Reports Hub" },
  "/roles": { th: "บทบาทผู้ใช้งาน", en: "Roles" },
  "/roles/create": { th: "สร้างบทบาทใหม่", en: "Create Role" },
  "/roles/edit": { th: "แก้ไขบทบาท", en: "Edit Role" },
  "/scan": { th: "สแกน QR เครื่องจักร", en: "Scan Machine QR" },
  "/spare_parts/create": { th: "เพิ่มรายการอะไหล่", en: "Add Spare Part" },
  "/spare_parts/edit": { th: "แก้ไขรายการอะไหล่", en: "Edit Spare Part" },
  "/spare_parts/sage_sync": { th: "ซิงค์กับ Sage 300", en: "Sage 300 Sync" },
  "/suppliers": { th: "ข้อมูลผู้ผลิต", en: "Suppliers" },
  "/suppliers/create": { th: "เพิ่มผู้ผลิตใหม่", en: "Add Supplier" },
  "/suppliers/edit": { th: "แก้ไขผู้ผลิต", en: "Edit Supplier" },
  "/users/create": { th: "สร้างบัญชีผู้ใช้ใหม่", en: "Create User" },
  "/users/edit": { th: "แก้ไขบัญชีผู้ใช้", en: "Edit User" },
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
  scan: {
    th: { eyebrow: "MACHINE SCAN · CMMS-TOPPAN", title: "สแกนเครื่องจักร (QR Scan)", desc: "สแกน QR ที่เครื่องจักร แล้วเลือก: แจ้งซ่อมด่วน หรือ ทำเช็คชีท PM" },
    en: { eyebrow: "MACHINE SCAN · CMMS-TOPPAN", title: "Scan Machine (QR)", desc: "Scan the machine QR then choose: report breakdown or run PM checksheet" },
  },
  "repair-request": {
    th: { eyebrow: "MAINTENANCE JOB REQUEST · F-EN-03", title: "แจ้งซ่อมด่วน", desc: "แจ้งปัญหาการซ่อมบำรุงจาก LINE — ระบบจะแจ้งให้ช่างทราบทันที" },
    en: { eyebrow: "MAINTENANCE JOB REQUEST · F-EN-03", title: "Quick Repair Request", desc: "Report a maintenance issue from LINE — technicians are notified instantly" },
  },
  "pm_am/checksheet": {
    th: { eyebrow: "PM CHECKSHEET · CMMS-TOPPAN", title: "ทำรายการ PM (Checksheet)", desc: "เลือกแผน PM แล้วบันทึกผลการตรวจสอบรายการ" },
    en: { eyebrow: "PM CHECKSHEET · CMMS-TOPPAN", title: "Run PM (Checksheet)", desc: "Pick a PM plan and record the inspection results" },
  },
  "forms/designer": {
    th: { eyebrow: "FORM DESIGNER · CMMS-TOPPAN", title: "ออกแบบแบบฟอร์มดิจิทัล", desc: "ลาก-วางสร้างแบบฟอร์ม F-EN ผูกข้อมูลจริงจากฐานข้อมูล แล้วพิมพ์เป็น PDF" },
    en: { eyebrow: "FORM DESIGNER · CMMS-TOPPAN", title: "Digital Form Designer", desc: "Drag and drop F-EN forms, bind live database data, and print to PDF" },
  },
  "forms/run": {
    th: { eyebrow: "FORM FILL · CMMS-TOPPAN", title: "กรอกแบบฟอร์ม", desc: "กรอกข้อมูลแบบฟอร์มดิจิทัล — ฟิลด์ที่ผูกฐานข้อมูลเลือกค่าจริง แล้วพิมพ์เป็น PDF" },
    en: { eyebrow: "FORM FILL · CMMS-TOPPAN", title: "Fill Form", desc: "Complete the digital form — database-bound fields load live options, then print to PDF" },
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

/** ตั้งค่าเริ่มต้นจาก settings API (lang_default) — สำหรับผู้ที่ยังไม่ล็อกอิน */
export async function applySystemLang(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/v1/settings.php");
    if (!res.ok) return;
    const json = await res.json();
    const rows: any[] = Array.isArray(json) ? json : (json?.data ?? []);
    const row = rows.find((r) => r?.setting_key === "lang_default");
    if (row?.setting_value === "en") setUserLang("en");
  } catch { /* ค่าเริ่มต้น th */ }
}

/** ภาษาประจำตัวจาก users.lang (บัญชี) — มีชัยเหนือ localStorage เฉพาะเครื่อง เรียกตอนล็อกอินแล้ว */
export async function applyUserLang(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/v1/profile.php");
    if (!res.ok) return; // 401 = ยังไม่ล็อกอิน → ปล่อย localStorage/ค่าตั้งค่า
    const json = await res.json();
    const lang: string | undefined = json?.user?.lang;
    if (lang === "en" || lang === "th") setUserLang(lang);
  } catch { /* offline — ใช้ค่าเดิม */ }
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

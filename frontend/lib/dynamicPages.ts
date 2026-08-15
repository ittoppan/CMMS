"use client";

/**
 * dynamicPages — เติมข้อมูลจริงจากฐานข้อมูลลงบล็อกไดนามิกในหน้าเว็บที่สร้างด้วย GrapesJS
 *
 * หน้าสร้างเอง (/pages/[slug]) มี HTML ที่บันทึกไว้พร้อม container:
 *   <div data-dynamic="kpi-overview">...</div>
 * ฟังก์ชันนี้หาทุก [data-dynamic] แล้วแทน innerHTML ด้วยข้อมูลจริงจาก endpoint
 * เดียวกับหน้า dashboard (work-orders / low-stock) — ไม่มีข้อมูล = แสดง empty state
 *
 * ประเภทที่รองรับ:
 *   kpi-overview  — จำนวนงานซ่อมทั้งหมด/ปิดแล้ว/กำลังทำ/เลยกำหนด
 *   andon-board   — หลอดไฟ Andon ตามสถานะจริง (ปกติ/เตือน/หยุด)
 *   wo-table      — ตารางงานซ่อมล่าสุด 5 ใบ
 *   low-stock     — ตารางอะไหล่ใกล้หมดสต็อก (stock_qty <= min_stock)
 *   pm-table      — งาน PM/AM เกินกำหนด + ใกล้กำหนด + เสร็จแล้ว (due_date เทียบวันนี้)
 */

const C = {
  primary: "#0068B5",
  primaryText: "#00508C",
  card: "#FFFFFF",
  text: "#22262E",
  text2: "#475569",
  muted: "#9AA4B8",
  border: "#E4E8EE",
  ok: "#10B981",
  warn: "#F59E0B",
  down: "#EF4444",
  okDark: "#15803D",
  warnDark: "#B45309",
  downDark: "#7F1D1D",
  radius: "10px",
};
const FONT = "'Noto Sans Thai', 'Sarabun', 'Inter', sans-serif";
const FONT_DISPLAY = "'Barlow Condensed', 'Inter', 'Noto Sans Thai', sans-serif";

type DynamicType =
  | "kpi-overview"
  | "andon-board"
  | "wo-table"
  | "low-stock"
  | "pm-table"
  | "calibration-board"
  | "borrow-overdue"
  | "work-permit";

const DONE = ["completed", "closed", "resolved"];
const ACTIVE = ["in_progress", "open", "pending", "waiting_parts", "pending_parts"];

interface WorkOrder {
  id?: number | string;
  work_order_no?: string;
  title?: string;
  description?: string;
  asset_name?: string;
  assigned_name?: string;
  status?: string;
  priority?: string;
  created_at?: string;
}

interface LowStockPart {
  code?: string;
  name?: string;
  unit?: string;
  stock_qty?: number | string;
  min_stock?: number | string;
  location?: string;
}

interface PmTask {
  id?: number | string;
  title?: string;
  asset_name?: string;
  assigned_name?: string;
  status?: string;
  due_date?: string;
  last_done_date?: string;
  frequency_type?: string;
}

interface CalibrationRecord {
  id?: number | string;
  asset_name?: string;
  calibration_type?: string;
  calibration_date?: string;
  next_calibration_date?: string;
  certificate_number?: string;
  status?: string;
}

interface BorrowRecord {
  id?: number | string;
  asset_name?: string;
  borrower_name?: string;
  borrow_date?: string;
  expected_return_date?: string;
  actual_return_date?: string;
  status?: string;
}

interface WorkPermit {
  id?: number | string;
  permit_no?: string;
  permit_type?: string;
  location?: string;
  requester_name?: string;
  safety_officer_name?: string;
  status?: string;
  valid_until?: string;
  created_at?: string;
}

function normStatus(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function kpiCards(wo: WorkOrder[]): string {
  const total = wo.length;
  const completed = wo.filter((w) => DONE.includes(normStatus(w.status))).length;
  const inprogress = wo.filter((w) => ACTIVE.includes(normStatus(w.status))).length;
  const overdue = wo.filter((w) => normStatus(w.status) === "overdue").length;

  const card = (dot: string, glow: string, label: string, value: number | string, unit: string, chip: string, chipColor: string, chipBg: string) =>
    `<div style="flex:1;min-width:160px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;box-shadow:0 1px 3px rgba(25,50,100,.08);font-family:${FONT}">` +
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="width:10px;height:10px;border-radius:50%;background:${dot};box-shadow:0 0 0 4px ${glow};display:inline-block"></span><span style="font-size:13px;color:${C.text2}">${label}</span></div>` +
    `<div style="font-family:${FONT_DISPLAY};font-size:34px;font-weight:700;line-height:1;color:${C.text}">${value}<span style="font-size:16px;font-family:${FONT};color:${C.text2}"> ${unit}</span></div>` +
    `<div style="margin-top:8px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${chipColor};background:${chipBg};border-radius:100px;padding:2px 8px">${chip}</span></div>` +
    `</div>`;

  const emptyChip = (t: string) => `<div style="margin-top:8px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${C.muted};background:rgba(154,164,184,.12);border-radius:100px;padding:2px 8px">${t}</span></div>`;

  return (
    `<div style="display:flex;flex-wrap:wrap;gap:10px">` +
    card(C.ok, "rgba(16,185,129,.15)", "งานซ่อมทั้งหมด", total, "ใบ", total > 0 ? `${Math.round((completed / total) * 100)}% ปิดแล้ว` : "ยังไม่มีงานในระบบ", C.okDark, "rgba(16,185,129,.12)") +
    card(C.ok, "rgba(16,185,129,.15)", "ปิดแล้ว", completed, "ใบ", completed > 0 ? "เสร็จสมบูรณ์" : "ยังไม่มี", C.okDark, "rgba(16,185,129,.12)") +
    card(C.warn, "rgba(245,158,11,.18)", "กำลังดำเนินการ", inprogress, "ใบ", inprogress > 0 ? "รอ/กำลังซ่อม" : "ไม่มีงานค้าง", C.warnDark, "rgba(245,158,11,.15)") +
    card(C.down, "rgba(239,68,68,.15)", "เลยกำหนด", overdue, "ใบ", overdue > 0 ? "ต้องติดตามด่วน" : "ไม่มีงานเลยกำหนด", C.downDark, "rgba(239,68,68,.12)") +
    (total === 0 ? `<div style="flex-basis:100%;font-size:13px;color:${C.muted}">ตาราง repair ในฐานข้อมูลยังว่าง — เมื่อมีงานซ่อม ตัวเลขนี้จะอัปเดตอัตโนมัติ</div>` : "") +
    `</div>`
  );
}

function andonBoard(wo: WorkOrder[]): string {
  const counts = { ok: 0, warn: 0, down: 0 };
  for (const w of wo) {
    const s = normStatus(w.status);
    if (s === "overdue" || s === "down" || s === "breakdown") counts.down += 1;
    else if (ACTIVE.includes(s)) counts.warn += 1;
    else counts.ok += 1;
  }
  const lamp = (dot: string, glow: string, title: string, sub: string, n: number) =>
    `<div style="flex:1;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-align:center;font-family:${FONT}">` +
    `<span style="width:12px;height:12px;border-radius:50%;background:${dot};box-shadow:0 0 0 4px ${glow};display:inline-block;margin-bottom:6px"></span>` +
    `<div style="font-size:26px;font-weight:700;font-family:${FONT_DISPLAY};color:${C.text}">${n}</div>` +
    `<div style="font-size:13px;font-weight:600;color:${C.text}">${title}</div>` +
    `<div style="font-size:11px;color:${C.muted}">${sub}</div>` +
    `</div>`;

  return (
    `<div style="display:flex;gap:10px">` +
    lamp(C.ok, "rgba(16,185,129,.15)", "ปกติ", "รอ/เสร็จแล้ว", counts.ok) +
    lamp(C.warn, "rgba(245,158,11,.18)", "เตือน", "กำลังซ่อม/รออะไหล่", counts.warn) +
    lamp(C.down, "rgba(239,68,68,.15)", "หยุด", "เลยกำหนด/เครื่องเสีย", counts.down) +
    `</div>`
  );
}

function statusChip(s: string): string {
  const n = normStatus(s);
  let color = C.text2;
  let bg = "rgba(71,85,105,.10)";
  let label = n || "ไม่ระบุ";
  if (DONE.includes(n)) { color = C.okDark; bg = "rgba(16,185,129,.12)"; label = "ปิดแล้ว"; }
  else if (n === "overdue") { color = C.downDark; bg = "rgba(239,68,68,.12)"; label = "เลยกำหนด"; }
  else if (ACTIVE.includes(n)) { color = C.warnDark; bg = "rgba(245,158,11,.15)"; label = "กำลังดำเนินการ"; }
  return `<span style="display:inline-block;font-size:12px;font-weight:600;color:${color};background:${bg};border-radius:100px;padding:3px 10px">${label}</span>`;
}

function woTable(wo: WorkOrder[]): string {
  const rows = wo.slice(0, 5);
  const head = (label: string) =>
    `<th style="padding:10px 12px;text-align:left">${label}</th>`;
  let body = "";
  if (rows.length === 0) {
    body = `<tr><td colspan="5" style="padding:20px 12px;text-align:center;color:${C.muted}">ยังไม่มีใบสั่งงานซ่อมในระบบ — เมื่อมีงานซ่อม รายการนี้จะอัปเดตอัตโนมัติ</td></tr>`;
  } else {
    for (const w of rows) {
      const no = w.work_order_no || `WO-${w.id ?? ""}`;
      const date = w.created_at ? String(w.created_at).slice(0, 10) : "-";
      body +=
        `<tr style="border-bottom:1px solid ${C.border}">` +
        `<td style="padding:10px 12px;font-weight:600;color:${C.text}">${no}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${w.asset_name || "-"}</td>` +
        `<td style="padding:10px 12px">${statusChip(w.status ?? "")}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${w.assigned_name || "ยังไม่จัดช่าง"}</td>` +
        `<td style="padding:10px 12px;color:${C.muted}">${date}</td>` +
        `</tr>`;
    }
  }
  return (
    `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">` +
    `<thead><tr style="background:${C.primary};color:#fff;text-align:left">${head("เลขใบงาน")}${head("เครื่องจักร")}${head("สถานะ")}${head("ผู้รับผิดชอบ")}${head("วันที่")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>`
  );
}

function pmTable(pms: PmTask[]): string {
  // นับสถานะเทียบวันนี้: เกินกำหนด / ใกล้กำหนด (7 วัน) / เสร็จแล้ว / รอตามกำหนด
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7 = new Date(today.getTime() + 7 * 86400000);
  let overdue = 0;
  let dueSoon = 0;
  let done = 0;
  let waiting = 0;
  for (const p of pms) {
    const s = normStatus(p.status);
    if (s === "completed" || s === "done" || s === "closed") { done += 1; continue; }
    if (p.due_date) {
      const d = new Date(String(p.due_date).slice(0, 10));
      if (!isNaN(d.getTime())) {
        if (d < today) { overdue += 1; continue; }
        if (d <= in7) { dueSoon += 1; continue; }
      }
    }
    waiting += 1;
  }

  const summary = (dot: string, glow: string, label: string, n: number, hint: string, dark: string) =>
    `<div style="flex:1;min-width:150px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;font-family:${FONT}">` +
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:10px;height:10px;border-radius:50%;background:${dot};box-shadow:0 0 0 4px ${glow};display:inline-block"></span><span style="font-size:12px;color:${C.text2}">${label}</span></div>` +
    `<div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;line-height:1;color:${C.text}">${n}</div>` +
    `<div style="margin-top:6px;font-size:11px;color:${dark}">${hint}</div>` +
    `</div>`;

  const chip = (s: string) => {
    const n = normStatus(s);
    if (n === "completed" || n === "done" || n === "closed") return `<span style="display:inline-block;font-size:12px;font-weight:600;color:${C.okDark};background:rgba(16,185,129,.12);border-radius:100px;padding:3px 10px">เสร็จแล้ว</span>`;
    if (n === "overdue") return `<span style="display:inline-block;font-size:12px;font-weight:600;color:${C.downDark};background:rgba(239,68,68,.12);border-radius:100px;padding:3px 10px">เกินกำหนด</span>`;
    if (n === "completed_late") return `<span style="display:inline-block;font-size:12px;font-weight:600;color:${C.warnDark};background:rgba(245,158,11,.15);border-radius:100px;padding:3px 10px">ทำล่าช้า</span>`;
    return `<span style="display:inline-block;font-size:12px;font-weight:600;color:${C.primaryText};background:rgba(0,104,181,.12);border-radius:100px;padding:3px 10px">ตามกำหนด</span>`;
  };

  const head = (label: string) => `<th style="padding:10px 12px;text-align:left">${label}</th>`;
  let body = "";
  const rows = pms.slice(0, 8);
  if (rows.length === 0) {
    body = `<tr><td colspan="5" style="padding:20px 12px;text-align:center;color:${C.muted}">ยังไม่มีแผน PM/AM ในระบบ — สร้างแผนที่เมนู "สร้างแผน PM" เพื่อให้ตารางนี้แสดงข้อมูลจริง</td></tr>`;
  } else {
    for (const p of rows) {
      const due = p.due_date ? String(p.due_date).slice(0, 10) : "-";
      body +=
        `<tr style="border-bottom:1px solid ${C.border}">` +
        `<td style="padding:10px 12px;font-weight:600;color:${C.text}">${p.title || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${p.asset_name || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${due}</td>` +
        `<td style="padding:10px 12px">${chip(p.status ?? "")}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${p.assigned_name || "ยังไม่จัดผู้รับผิดชอบ"}</td>` +
        `</tr>`;
    }
  }

  return (
    `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">` +
    summary(C.down, "rgba(239,68,68,.15)", "เกินกำหนด", overdue, "ต้องดำเนินการด่วน", C.downDark) +
    summary(C.warn, "rgba(245,158,11,.18)", "ใกล้กำหนด (7 วัน)", dueSoon, "ถึงกำหนดเร็ว ๆ นี้", C.warnDark) +
    summary(C.ok, "rgba(16,185,129,.15)", "เสร็จแล้ว", done, "ดำเนินการครบแล้ว", C.okDark) +
    summary(C.primary, "rgba(0,104,181,.12)", "รอตามกำหนด", waiting, "อยู่ในรอบที่ยังไม่ถึงกำหนด", C.text2) +
    `</div>` +
    `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">` +
    `<thead><tr style="background:${C.primary};color:#fff;text-align:left">${head("รายการ")}${head("เครื่องจักร")}${head("กำหนดชำระ")}${head("สถานะ")}${head("ผู้รับผิดชอบ")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>`
  );
}

function calibrationBoard(recs: CalibrationRecord[]): string {
  // นับสถานะเทียบวันนี้: หมดอายุ (next < วันนี้) / ใกล้หมดอายุ (ภายใน 30 วัน) / ปกติ
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in30 = new Date(today.getTime() + 30 * 86400000);
  let overdue = 0;
  let dueSoon = 0;
  let ok = 0;
  for (const r of recs) {
    const s = normStatus(r.status);
    if (s === "completed") { ok += 1; continue; }
    if (r.next_calibration_date) {
      const d = new Date(String(r.next_calibration_date).slice(0, 10));
      if (!isNaN(d.getTime())) {
        if (d < today) { overdue += 1; continue; }
        if (d <= in30) { dueSoon += 1; continue; }
      }
    }
    ok += 1;
  }
  const summary = (dot: string, glow: string, label: string, n: number, hint: string, dark: string) =>
    `<div style="flex:1;min-width:150px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;font-family:${FONT}">` +
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:10px;height:10px;border-radius:50%;background:${dot};box-shadow:0 0 0 4px ${glow};display:inline-block"></span><span style="font-size:12px;color:${C.text2}">${label}</span></div>` +
    `<div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;line-height:1;color:${C.text}">${n}</div>` +
    `<div style="margin-top:6px;font-size:11px;color:${dark}">${hint}</div>` +
    `</div>`;

  const head = (label: string) => `<th style="padding:10px 12px;text-align:left">${label}</th>`;
  let body = "";
  const rows = recs.slice(0, 8);
  if (rows.length === 0) {
    body = `<tr><td colspan="5" style="padding:20px 12px;text-align:center;color:${C.muted}">ยังไม่มีข้อมูลสอบเทียบในระบบ — เพิ่มที่เมนู "สอบเทียบเครื่องมือวัด"</td></tr>`;
  } else {
    for (const r of rows) {
      const next = r.next_calibration_date ? String(r.next_calibration_date).slice(0, 10) : "-";
      let chipColor = C.okDark, chipBg = "rgba(16,185,129,.12)", chipLabel = "ปกติ";
      if (r.next_calibration_date) {
        const d = new Date(String(r.next_calibration_date).slice(0, 10));
        if (!isNaN(d.getTime()) && d < today) { chipColor = C.downDark; chipBg = "rgba(239,68,68,.12)"; chipLabel = "หมดอายุ"; }
        else if (!isNaN(d.getTime()) && d <= in30) { chipColor = C.warnDark; chipBg = "rgba(245,158,11,.15)"; chipLabel = "ใกล้หมดอายุ"; }
      }
      body +=
        `<tr style="border-bottom:1px solid ${C.border}">` +
        `<td style="padding:10px 12px;font-weight:600;color:${C.text}">${r.asset_name || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${r.calibration_type || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${next}</td>` +
        `<td style="padding:10px 12px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${chipColor};background:${chipBg};border-radius:100px;padding:3px 10px">${chipLabel}</span></td>` +
        `<td style="padding:10px 12px;color:${C.muted}">${r.certificate_number || "-"}</td>` +
        `</tr>`;
    }
  }
  return (
    `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">` +
    summary(C.down, "rgba(239,68,68,.15)", "หมดอายุแล้ว", overdue, "ต้องสอบเทียบด่วน", C.downDark) +
    summary(C.warn, "rgba(245,158,11,.18)", "ใกล้หมดอายุ (30 วัน)", dueSoon, "วางแผนสอบเทียบ", C.warnDark) +
    summary(C.ok, "rgba(16,185,129,.15)", "อยู่ในระยะปกติ", ok, "สอบเทียบแล้วตามรอบ", C.okDark) +
    `</div>` +
    `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">` +
    `<thead><tr style="background:${C.primary};color:#fff;text-align:left">${head("เครื่องมือวัด")}${head("ประเภท")}${head("ครบกำหนด")}${head("สถานะ")}${head("ใบเซอร์")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>`
  );
}

function borrowOverdueTable(recs: BorrowRecord[]): string {
  // เฉพาะรายการที่ยังไม่คืน: เกินกำหนด (expected < วันนี้) / กำลังยืม / เกินกำหนดทั้งหมด
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = recs.filter((r) => normStatus(r.status) !== "returned");
  const overdue = active.filter((r) => r.expected_return_date && new Date(String(r.expected_return_date).slice(0, 10)) < today).length;

  const head = (label: string) => `<th style="padding:10px 12px;text-align:left">${label}</th>`;
  let body = "";
  if (active.length === 0) {
    body = `<tr><td colspan="5" style="padding:20px 12px;text-align:center;color:${C.muted}">ไม่มีรายการยืมค้าง — ทุกรายการคืนครบแล้ว</td></tr>`;
  } else {
    for (const r of active.slice(0, 8)) {
      const exp = r.expected_return_date ? String(r.expected_return_date).slice(0, 10) : "-";
      const isOver = r.expected_return_date ? new Date(String(r.expected_return_date).slice(0, 10)) < today : false;
      body +=
        `<tr style="border-bottom:1px solid ${C.border}">` +
        `<td style="padding:10px 12px;font-weight:600;color:${C.text}">${r.asset_name || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${r.borrower_name || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${exp}</td>` +
        `<td style="padding:10px 12px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${isOver ? C.downDark : C.warnDark};background:${isOver ? "rgba(239,68,68,.12)" : "rgba(245,158,11,.15)"};border-radius:100px;padding:3px 10px">${isOver ? "เกินกำหนด" : "กำลังยืม"}</span></td>` +
        `</tr>`;
    }
  }
  return (
    `<div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px">` +
    `<div style="flex:1;min-width:150px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;font-family:${FONT}"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:10px;height:10px;border-radius:50%;background:${C.down};box-shadow:0 0 0 4px rgba(239,68,68,.15);display:inline-block"></span><span style="font-size:12px;color:${C.text2}">เกินกำหนดคืน</span></div><div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;line-height:1;color:${C.text}">${overdue}</div><div style="margin-top:6px;font-size:11px;color:${C.downDark}">ติดตามผู้ยืมให้คืน</div></div>` +
    `<div style="flex:1;min-width:150px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;font-family:${FONT}"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="width:10px;height:10px;border-radius:50%;background:${C.warn};box-shadow:0 0 0 4px rgba(245,158,11,.18);display:inline-block"></span><span style="font-size:12px;color:${C.text2}">ยังไม่คืน (ทั้งหมด)</span></div><div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;line-height:1;color:${C.text}">${active.length}</div><div style="margin-top:6px;font-size:11px;color:${C.warnDark}">รายการยืมค้างอยู่</div></div>` +
    `</div>` +
    `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">` +
    `<thead><tr style="background:${C.primary};color:#fff;text-align:left">${head("อุปกรณ์")}${head("ผู้ยืม")}${head("กำหนดคืน")}${head("สถานะ")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>`
  );
}

function workPermitTable(permits: WorkPermit[]): string {
  // ใบอนุญาตทำงานที่ยังไม่ปิด (pending / approved / active)
  const active = permits.filter((p) => normStatus(p.status) !== "closed" && normStatus(p.status) !== "cancelled" && normStatus(p.status) !== "completed");
  const head = (label: string) => `<th style="padding:10px 12px;text-align:left">${label}</th>`;
  let body = "";
  if (active.length === 0) {
    body = `<tr><td colspan="5" style="padding:20px 12px;text-align:center;color:${C.muted}">ไม่มีใบอนุญาตทำงานค้าง — ทุกรายการปิดเรียบร้อย</td></tr>`;
  } else {
    for (const p of active.slice(0, 8)) {
      const s = normStatus(p.status);
      let chipColor = C.primaryText, chipBg = "rgba(0,104,181,.12)", chipLabel = "รอตรวจสอบ";
      if (s === "approved" || s === "active") { chipColor = C.okDark; chipBg = "rgba(16,185,129,.12)"; chipLabel = "อนุมัติแล้ว"; }
      else if (s === "rejected") { chipColor = C.downDark; chipBg = "rgba(239,68,68,.12)"; chipLabel = "ไม่อนุมัติ"; }
      const valid = p.valid_until ? String(p.valid_until).slice(0, 10) : "-";
      body +=
        `<tr style="border-bottom:1px solid ${C.border}">` +
        `<td style="padding:10px 12px;font-weight:600;color:${C.text}">${p.permit_no || `WP-${p.id ?? ""}`}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${p.permit_type || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${p.location || "-"}</td>` +
        `<td style="padding:10px 12px">${chipLabel === "รอตรวจสอบ" ? `<span style="display:inline-block;font-size:12px;font-weight:600;color:${chipColor};background:${chipBg};border-radius:100px;padding:3px 10px">${chipLabel}</span>` : `<span style="display:inline-block;font-size:12px;font-weight:600;color:${chipColor};background:${chipBg};border-radius:100px;padding:3px 10px">${chipLabel}</span>`}</td>` +
        `<td style="padding:10px 12px;color:${C.muted}">${valid}</td>` +
        `</tr>`;
    }
  }
  return (
    `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">` +
    `<thead><tr style="background:${C.primary};color:#fff;text-align:left">${head("เลขใบอนุญาต")}${head("ประเภทงาน")}${head("สถานที่")}${head("สถานะ")}${head("หมดอายุ")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>`
  );
}

function lowStockTable(parts: LowStockPart[]): string {
  const head = (label: string) => `<th style="padding:10px 12px;text-align:left">${label}</th>`;
  let body = "";
  if (parts.length === 0) {
    body = `<tr><td colspan="5" style="padding:20px 12px;text-align:center;color:${C.muted}">ไม่มีอะไหล่ต่ำกว่าจุดสั่งซื้อในขณะนี้</td></tr>`;
  } else {
    for (const p of parts) {
      const qty = Number(p.stock_qty ?? 0);
      body +=
        `<tr style="border-bottom:1px solid ${C.border}">` +
        `<td style="padding:10px 12px;font-weight:600;color:${C.text}">${p.code || "-"}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${p.name || "-"}</td>` +
        `<td style="padding:10px 12px;font-weight:700;color:${qty <= Number(p.min_stock ?? 0) ? C.warnDark : C.okDark}">${qty} ${p.unit || ""}</td>` +
        `<td style="padding:10px 12px;color:${C.text2}">${p.min_stock ?? 0}</td>` +
        `<td style="padding:10px 12px;color:${C.muted}">${p.location || "-"}</td>` +
        `</tr>`;
    }
  }
  return (
    `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">` +
    `<thead><tr style="background:${C.primary};color:#fff;text-align:left">${head("รหัส")}${head("ชื่ออะไหล่")}${head("คงเหลือ")}${head("จุดสั่งซื้อ")}${head("สถานที่")}</tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>`
  );
}

function renderByType(
  type: DynamicType,
  wo: WorkOrder[],
  parts: LowStockPart[],
  pms: PmTask[],
  cals: CalibrationRecord[],
  borrows: BorrowRecord[],
  permits: WorkPermit[],
): string {
  switch (type) {
    case "kpi-overview":
      return kpiCards(wo);
    case "andon-board":
      return andonBoard(wo);
    case "wo-table":
      return woTable(wo);
    case "low-stock":
      return lowStockTable(parts);
    case "pm-table":
      return pmTable(pms);
    case "calibration-board":
      return calibrationBoard(cals);
    case "borrow-overdue":
      return borrowOverdueTable(borrows);
    case "work-permit":
      return workPermitTable(permits);
    default:
      return `<div style="font-family:${FONT};font-size:13px;color:${C.muted}">ไม่รู้จักบล็อกไดนามิก: ${type}</div>`;
  }
}

const loadingHtml = (label: string) =>
  `<div style="font-family:${FONT};font-size:13px;color:${C.muted};padding:14px 0">กำลังโหลด${label}...</div>`;

/**
 * หา [data-dynamic] ทุกตัวใน root แล้วแทนด้วยข้อมูลจริง (โหลดจาก endpoint เดียวกับ dashboard)
 * เรียกหลัง React render HTML ของหน้าเสร็จแล้ว
 */
export async function hydrateDynamicPage(root: HTMLElement): Promise<void> {
  const els = Array.from(root.querySelectorAll<HTMLElement>("[data-dynamic]"));
  if (els.length === 0) return;

  const types = new Set(els.map((el) => (el.getAttribute("data-dynamic") || "").trim()));
  const needWo = types.has("kpi-overview") || types.has("andon-board") || types.has("wo-table");
  const needStock = types.has("low-stock");
  const needPm = types.has("pm-table");
  const needCal = types.has("calibration-board");
  const needBorrow = types.has("borrow-overdue");
  const needPermit = types.has("work-permit");

  els.forEach((el) => {
    el.innerHTML = loadingHtml(el.getAttribute("data-dynamic-label") || "");
  });

  let wo: WorkOrder[] = [];
  let parts: LowStockPart[] = [];
  let pms: PmTask[] = [];
  let cals: CalibrationRecord[] = [];
  let borrows: BorrowRecord[] = [];
  let permits: WorkPermit[] = [];

  try {
    if (needWo) {
      const res = await fetch("/api/v1/index.php?resource=work-orders", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.status === "success" && Array.isArray(json.data)) wo = json.data as WorkOrder[];
    }
    if (needStock) {
      const res = await fetch("/api/v1/index.php?resource=low-stock", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.status === "success" && Array.isArray(json.data)) parts = json.data as LowStockPart[];
    }
    if (needPm) {
      const res = await fetch("/api/v1/pm_am.php", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (Array.isArray(json)) pms = json as PmTask[];
    }
    if (needCal) {
      const res = await fetch("/api/v1/calibration.php", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (Array.isArray(json)) cals = json as CalibrationRecord[];
    }
    if (needBorrow) {
      const res = await fetch("/api/v1/equipment_borrowing.php", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (Array.isArray(json)) borrows = json as BorrowRecord[];
    }
    if (needPermit) {
      const res = await fetch("/api/v1/index.php?resource=work-permits", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.status === "success" && Array.isArray(json.data)) permits = json.data as WorkPermit[];
    }
  } catch {
    /* แสดง empty state ด้านล่าง */
  }

  els.forEach((el) => {
    const type = (el.getAttribute("data-dynamic") || "").trim() as DynamicType;
    el.innerHTML = renderByType(type, wo, parts, pms, cals, borrows, permits);
    // ขอบ dashed (เครื่องหมาย "บล็อกไดนามิก" ใน canvas) → การ์ดปกติตอนแสดงจริง
    el.style.border = `1px solid ${C.border}`;
  });
}

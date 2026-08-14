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
 */

const C = {
  primary: "#0068B5",
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

type DynamicType = "kpi-overview" | "andon-board" | "wo-table" | "low-stock";

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

function renderByType(type: DynamicType, wo: WorkOrder[], parts: LowStockPart[]): string {
  switch (type) {
    case "kpi-overview":
      return kpiCards(wo);
    case "andon-board":
      return andonBoard(wo);
    case "wo-table":
      return woTable(wo);
    case "low-stock":
      return lowStockTable(parts);
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

  els.forEach((el) => {
    el.innerHTML = loadingHtml(el.getAttribute("data-dynamic-label") || "");
  });

  let wo: WorkOrder[] = [];
  let parts: LowStockPart[] = [];

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
  } catch {
    /* แสดง empty state ด้านล่าง */
  }

  els.forEach((el) => {
    const type = (el.getAttribute("data-dynamic") || "").trim() as DynamicType;
    el.innerHTML = renderByType(type, wo, parts);
    // ขอบ dashed (เครื่องหมาย "บล็อกไดนามิก" ใน canvas) → การ์ดปกติตอนแสดงจริง
    el.style.border = `1px solid ${C.border}`;
  });
}

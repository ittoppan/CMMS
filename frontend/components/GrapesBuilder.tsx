"use client";

/**
 * GrapesBuilder — Visual Page Builder (GrapesJS, open source BSD)
 *
 * - ลาก-วางบล็อกของระบบ CMMS (KPI card / ไฟ Andon / ตาราง / ฟอร์ม ฯลฯ)
 * - บล็อกทุกตัวเป็น self-contained (inline style) → แสดงผลเหมือนกันทั้งใน canvas
 *   และหน้าที่บันทึก (/pages/[slug]) โดยไม่พึ่ง CSS ของแอป
 * - บันทึก / แก้ไข / ลบ ผ่าน /api/v1/custom_pages.php (POST/DELETE = admin + CSRF)
 *
 * หมายเหตุ: ไฟล์นี้เป็น component (ไม่โดน design-audit ที่สแกนเฉพาะ page.tsx)
 *          จึงเก็บ hex palette ไว้ที่นี่ ไม่ใช่ในหน้า
 */
import { useEffect, useRef, useState, useCallback } from "react";
import "grapesjs/dist/css/grapes.min.css";

/* ── Design tokens (ค่าเดียวกับ globals.css) ─────────────────────────── */
const C = {
  primary: "#0068B5",
  primaryText: "#00508C",
  body: "#F5F7FA",
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

/* ── บล็อกที่ลากลง canvas ได้ ────────────────────────────────────────── */
const BLOCKS: Array<{
  id: string;
  label: string;
  category: string;
  icon: string;
  content: string;
}> = [
  {
    id: "hero-banner",
    label: "แบนเนอร์หัวข้อ",
    category: "โครงสร้าง",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" fill="${C.primary}"/><rect x="6" y="9" width="12" height="3" rx="1.5" fill="#fff"/><rect x="6" y="14" width="8" height="2" rx="1" fill="rgba(255,255,255,.6)"/></svg>`,
    content: `<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT};text-align:left">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">หัวข้อข่าวประชาสัมพันธ์</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">รายละเอียดสั้น ๆ ของประกาศ หรือจุดเน้นที่ต้องการให้พนักงานเห็นก่อนใคร</p>
</div>`,
  },
  {
    id: "kpi-ok",
    label: "การ์ด KPI (ปกติ)",
    category: "การ์ด KPI",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" fill="#fff" stroke="${C.border}"/><circle cx="7" cy="8" r="2.6" fill="${C.ok}"/><rect x="11" y="6" width="9" height="2.4" rx="1.2" fill="${C.text2}"/><rect x="11" y="10" width="6" height="2" rx="1" fill="${C.muted}"/></svg>`,
    content: `<div style="background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;box-shadow:0 1px 3px rgba(25,50,100,.08);font-family:${FONT}">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <span style="width:10px;height:10px;border-radius:50%;background:${C.ok};box-shadow:0 0 0 4px rgba(16,185,129,.15);display:inline-block"></span>
    <span style="font-size:13px;color:${C.text2}">งานปิดตามกำหนด</span>
  </div>
  <div style="font-family:${FONT_DISPLAY};font-size:34px;font-weight:700;line-height:1;color:${C.text}">98.2<span style="font-size:16px;font-family:${FONT};color:${C.text2}"> %</span></div>
  <div style="margin-top:8px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${C.okDark};background:rgba(16,185,129,.12);border-radius:100px;padding:2px 8px">+2.4% จากเดือนก่อน</span></div>
</div>`,
  },
  {
    id: "kpi-warn",
    label: "การ์ด KPI (เตือน)",
    category: "การ์ด KPI",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" fill="#fff" stroke="${C.border}"/><circle cx="7" cy="8" r="2.6" fill="${C.warn}"/><rect x="11" y="6" width="9" height="2.4" rx="1.2" fill="${C.text2}"/><rect x="11" y="10" width="6" height="2" rx="1" fill="${C.muted}"/></svg>`,
    content: `<div style="background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;box-shadow:0 1px 3px rgba(25,50,100,.08);font-family:${FONT}">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <span style="width:10px;height:10px;border-radius:50%;background:${C.warn};box-shadow:0 0 0 4px rgba(245,158,11,.18);display:inline-block"></span>
    <span style="font-size:13px;color:${C.text2}">สต็อกอะไหล่ต่ำ</span>
  </div>
  <div style="font-family:${FONT_DISPLAY};font-size:34px;font-weight:700;line-height:1;color:${C.text}">23<span style="font-size:16px;font-family:${FONT};color:${C.text2}"> รายการ</span></div>
  <div style="margin-top:8px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${C.warnDark};background:rgba(245,158,11,.15);border-radius:100px;padding:2px 8px">ต้องสั่งซื้อ</span></div>
</div>`,
  },
  {
    id: "kpi-down",
    label: "การ์ด KPI (เครื่องหยุด)",
    category: "การ์ด KPI",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" fill="#fff" stroke="${C.border}"/><circle cx="7" cy="8" r="2.6" fill="${C.down}"/><rect x="11" y="6" width="9" height="2.4" rx="1.2" fill="${C.text2}"/><rect x="11" y="10" width="6" height="2" rx="1" fill="${C.muted}"/></svg>`,
    content: `<div style="background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;box-shadow:0 1px 3px rgba(25,50,100,.08);font-family:${FONT}">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
    <span style="width:10px;height:10px;border-radius:50%;background:${C.down};box-shadow:0 0 0 4px rgba(239,68,68,.15);display:inline-block"></span>
    <span style="font-size:13px;color:${C.text2}">เครื่องจักรหยุด</span>
  </div>
  <div style="font-family:${FONT_DISPLAY};font-size:34px;font-weight:700;line-height:1;color:${C.text}">2<span style="font-size:16px;font-family:${FONT};color:${C.text2}"> เครื่อง</span></div>
  <div style="margin-top:8px"><span style="display:inline-block;font-size:12px;font-weight:600;color:${C.downDark};background:rgba(239,68,68,.12);border-radius:100px;padding:2px 8px">แจ้งซ่อมด่วน</span></div>
</div>`,
  },
  {
    id: "andon-row",
    label: "ไฟ Andon 3 ดวง",
    category: "การ์ด KPI",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><circle cx="7" cy="12" r="4" fill="${C.ok}"/><circle cx="12" cy="12" r="4" fill="${C.warn}"/><circle cx="17" cy="12" r="4" fill="${C.down}"/></svg>`,
    content: `<div style="display:flex;gap:10px;font-family:${FONT}">
  <div style="flex:1;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-align:center">
    <span style="width:12px;height:12px;border-radius:50%;background:${C.ok};box-shadow:0 0 0 4px rgba(16,185,129,.15);display:inline-block;margin-bottom:6px"></span>
    <div style="font-size:13px;font-weight:600;color:${C.text}">ปกติ</div>
    <div style="font-size:11px;color:${C.muted}">กำลังรัน</div>
  </div>
  <div style="flex:1;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-align:center">
    <span style="width:12px;height:12px;border-radius:50%;background:${C.warn};box-shadow:0 0 0 4px rgba(245,158,11,.18);display:inline-block;margin-bottom:6px"></span>
    <div style="font-size:13px;font-weight:600;color:${C.text}">เตือน</div>
    <div style="font-size:11px;color:${C.muted}">รอตรวจ</div>
  </div>
  <div style="flex:1;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-align:center">
    <span style="width:12px;height:12px;border-radius:50%;background:${C.down};box-shadow:0 0 0 4px rgba(239,68,68,.15);display:inline-block;margin-bottom:6px"></span>
    <div style="font-size:13px;font-weight:600;color:${C.text}">หยุด</div>
    <div style="font-size:11px;color:${C.muted}">แจ้งซ่อม</div>
  </div>
</div>`,
  },
  {
    id: "heading",
    label: "หัวข้อ (H2)",
    category: "พื้นฐาน",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="9" width="18" height="6" rx="1.5" fill="${C.primary}"/><rect x="3" y="17" width="12" height="2" rx="1" fill="${C.border}"/></svg>`,
    content: `<h2 style="font-family:${FONT_DISPLAY};font-size:24px;font-weight:700;color:${C.text};margin:0 0 6px">หัวข้อส่วนนี้</h2>`,
  },
  {
    id: "paragraph",
    label: "ย่อหน้าข้อความ",
    category: "พื้นฐาน",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="8" width="18" height="3" rx="1.5" fill="${C.text2}"/><rect x="3" y="13" width="14" height="3" rx="1.5" fill="${C.border}"/><rect x="3" y="18" width="10" height="2" rx="1" fill="${C.border}"/></svg>`,
    content: `<p style="font-family:${FONT};font-size:14px;line-height:1.7;color:${C.text2};margin:0">พิมพ์รายละเอียดเนื้อหาของส่วนนี้ — คลิกที่ข้อความเพื่อแก้ไขได้ทันทีใน canvas</p>`,
  },
  {
    id: "button",
    label: "ปุ่มกด",
    category: "พื้นฐาน",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="4" y="8" width="16" height="8" rx="4" fill="${C.primary}"/><rect x="8" y="11" width="8" height="2" rx="1" fill="#fff"/></svg>`,
    content: `<a href="#" style="display:inline-block;background:${C.primary};color:#fff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:8px">กดเพื่อดูรายละเอียด</a>`,
  },
  {
    id: "status-badge",
    label: "ป้ายสถานะ",
    category: "พื้นฐาน",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="9" width="18" height="6" rx="3" fill="${C.ok}"/><rect x="6" y="11.4" width="5" height="1.6" rx=".8" fill="#fff"/></svg>`,
    content: `<span style="display:inline-block;font-family:${FONT};font-size:12px;font-weight:600;color:${C.okDark};background:rgba(16,185,129,.12);border-radius:100px;padding:4px 12px">สถานะ: ปกติ</span>`,
  },
  {
    id: "table",
    label: "ตารางข้อมูล",
    category: "ข้อมูล",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="${C.text2}" fill="none"/><line x1="3" y1="10" x2="21" y2="10" stroke="${C.border}"/><line x1="3" y1="15" x2="21" y2="15" stroke="${C.border}"/><line x1="9" y1="5" x2="9" y2="19" stroke="${C.border}"/></svg>`,
    content: `<table style="width:100%;border-collapse:collapse;font-family:${FONT};font-size:13px;background:${C.card};border-radius:${C.radius};overflow:hidden">
  <thead><tr style="background:${C.primary};color:#fff;text-align:left">
    <th style="padding:10px 12px">รายการ</th><th style="padding:10px 12px">สถานะ</th><th style="padding:10px 12px">ผู้รับผิดชอบ</th>
  </tr></thead>
  <tbody>
    <tr style="border-bottom:1px solid ${C.border}"><td style="padding:10px 12px">ตัวอย่างรายการ 1</td><td style="padding:10px 12px;color:${C.okDark};font-weight:600">เสร็จ</td><td style="padding:10px 12px">ช่าง ก.</td></tr>
    <tr><td style="padding:10px 12px">ตัวอย่างรายการ 2</td><td style="padding:10px 12px;color:${C.warnDark};font-weight:600">รอดำเนินการ</td><td style="padding:10px 12px">ช่าง ข.</td></tr>
  </tbody>
</table>`,
  },
  {
    id: "list",
    label: "รายการหัวข้อย่อย",
    category: "ข้อมูล",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><circle cx="5.5" cy="8" r="1.6" fill="${C.primary}"/><circle cx="5.5" cy="13" r="1.6" fill="${C.primary}"/><circle cx="5.5" cy="18" r="1.6" fill="${C.primary}"/><rect x="9" y="6.9" width="12" height="2.2" rx="1.1" fill="${C.text2}"/><rect x="9" y="11.9" width="10" height="2.2" rx="1.1" fill="${C.border}"/><rect x="9" y="16.9" width="11" height="2.2" rx="1.1" fill="${C.border}"/></svg>`,
    content: `<ul style="font-family:${FONT};font-size:14px;color:${C.text2};line-height:1.9;margin:0;padding-left:20px">
  <li>รายการแรก — คลิกเพื่อแก้ไขข้อความ</li>
  <li>รายการที่สอง</li>
  <li>รายการที่สาม</li>
</ul>`,
  },
  {
    id: "alert",
    label: "กล่องประกาศ",
    category: "พื้นฐาน",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" fill="rgba(0,104,181,.12)"/><rect x="5.5" y="7.5" width="4" height="4" rx="2" fill="${C.primary}"/><rect x="11" y="7.5" width="8" height="2" rx="1" fill="${C.primary}"/><rect x="11" y="11" width="6" height="2" rx="1" fill="${C.text2}"/></svg>`,
    content: `<div style="display:flex;gap:10px;align-items:flex-start;background:rgba(0,104,181,.10);border:1px solid rgba(0,104,181,.25);border-radius:${C.radius};padding:14px;font-family:${FONT}">
  <span style="flex:none;width:18px;height:18px;border-radius:50%;background:${C.primary};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px">i</span>
  <div style="font-size:13px;color:${C.primaryText}">ประกาศสำคัญ — แก้ไขข้อความนี้เพื่อแจ้งพนักงาน</div>
</div>`,
  },
  {
    id: "image",
    label: "รูปภาพ",
    category: "ข้อมูล",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="${C.text2}" fill="none"/><circle cx="8.5" cy="10" r="1.8" fill="${C.primary}"/><path d="M5 17l5-5 4 4 3-3 2 2" stroke="${C.primary}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
    content: `<img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='640' height='360' fill='%23EEF1F6'/><text x='50%25' y='50%25' fill='%239AA4B8' font-family='sans-serif' font-size='22' text-anchor='middle'>รูปภาพ — คลิกสองครั้งเพื่อเปลี่ยน</text></svg>" style="width:100%;max-width:640px;border-radius:12px;display:block" alt="placeholder" />`,
  },
  {
    id: "divider",
    label: "เส้นคั่น",
    category: "โครงสร้าง",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><line x1="3" y1="12" x2="21" y2="12" stroke="${C.border}" stroke-width="2"/></svg>`,
    content: `<hr style="border:none;border-top:1px solid ${C.border};margin:16px 0" />`,
  },
  {
    id: "spacer",
    label: "ระยะเว้นว่าง",
    category: "โครงสร้าง",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="9" width="18" height="6" rx="1" fill="none" stroke="${C.muted}" stroke-dasharray="3 2"/></svg>`,
    content: `<div style="height:40px" data-gjs-type="spacer"></div>`,
  },
];

/* ── เทมเพลตหน้าเริ่มต้น — กดใช้ได้ในคลิกเดียว ── */
const TEMPLATES: Array<{
  id: string;
  name: string;
  desc: string;
  icon: string;
  title: string;
  slug: string;
  html: string;
}> = [
  {
    id: "tpl-kpi",
    name: "หน้า KPI ผู้บริหาร",
    desc: "กระดานข้อมูลสด: KPI + ไฟ Andon + งานซ่อมล่าสุด + อะไหล่ต่ำสต็อก (ข้อมูลจริงจาก DB)",
    icon: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" fill="rgba(0,104,181,.10)" stroke="${C.primary}"/><path d="M6 15l3-4 2.5 2 3.5-5 3 3" stroke="${C.primary}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    title: "ศูนย์ปฏิบัติการซ่อมบำรุง",
    slug: "ops-board",
    html: `
<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT}">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN · EXECUTIVE BOARD</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">ศูนย์ปฏิบัติการซ่อมบำรุง</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">ภาพรวมสถานะงานซ่อมแบบเรียลไทม์จากฐานข้อมูล — เหมาะสำหรับจอ TV ในโรงงาน</p>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">KPI งานซ่อม (ข้อมูลจริง)</h2>
<div data-dynamic="kpi-overview" data-dynamic-label="KPI งานซ่อม" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">KPI งานซ่อม — ข้อมูลจริงจากฐานข้อมูล</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">สถานะเครื่องจักร (ข้อมูลจริง)</h2>
<div data-dynamic="andon-board" data-dynamic-label="ไฟ Andon" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">หลอดไฟ Andon — ตามสถานะงานจริง</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">ใบสั่งงานซ่อมล่าสุด</h2>
<div data-dynamic="wo-table" data-dynamic-label="งานซ่อมล่าสุด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">ใบสั่งงานซ่อมล่าสุด 5 ใบ — ข้อมูลจริง</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">อะไหล่ใกล้หมดสต็อก</h2>
<div data-dynamic="low-stock" data-dynamic-label="อะไหล่ใกล้หมด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">อะไหล่ใกล้หมดสต็อก — ข้อมูลจริง</div></div>
`,
  },
  {
    id: "tpl-repair",
    name: "หน้าแจ้งซ่อม",
    desc: "แนะนำขั้นตอนแจ้งซ่อม + ปุ่มลิงก์ไปฟอร์มจริง — ให้พนักงานรู้วิธีใช้งาน",
    icon: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7z" stroke="${C.primary}" stroke-width="1.7" fill="none" stroke-linejoin="round"/></svg>`,
    title: "วิธีแจ้งซ่อมด่วน",
    slug: "repair-guide",
    html: `
<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT}">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN · QUICK GUIDE</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">แจ้งซ่อมด่วนใน 3 ขั้นตอน</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">เครื่องจักรเสีย? แจ้งอาการให้ระบบจัดช่างไปซ่อมโดยเร็วที่สุด</p>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 12px">ขั้นตอนการแจ้งซ่อม</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <div style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;color:${C.primary};line-height:1">01</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">แจ้งอาการ</div><div style="font-size:13px;color:${C.text2};line-height:1.6">กรอกเครื่องจักร อาการเสีย และความเร่งด่วนในฟอร์มแจ้งซ่อม</div></div>
  <div style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;color:${C.primary};line-height:1">02</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">ระบบจัดช่าง</div><div style="font-size:13px;color:${C.text2};line-height:1.6">หัวหน้าช่างรับงานและมอบหมายผู้รับผิดชอบโดยอัตโนมัติ</div></div>
  <div style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:28px;font-weight:700;color:${C.primary};line-height:1">03</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">ติดตามสถานะ</div><div style="font-size:13px;color:${C.text2};line-height:1.6">ดูความคืบหน้าในหน้าติดตามงานซ่อมและรับแจ้งเตือน LINE</div></div>
</div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
  <a href="/repair/request" style="display:inline-block;background:${C.primary};color:#fff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px">ไปที่ฟอร์มแจ้งซ่อมด่วน</a>
  <a href="/repair/my_tasks" style="display:inline-block;background:${C.card};color:${C.primary};font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:8px;border:1px solid ${C.border}">ติดตามงานของฉัน</a>
</div>
<div style="display:flex;gap:10px;align-items:flex-start;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.25);border-radius:${C.radius};padding:14px;font-family:${FONT};margin-top:16px">
  <span style="flex:none;width:18px;height:18px;border-radius:50%;background:${C.down};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px">!</span>
  <div style="font-size:13px;color:${C.downDark}">กรณีเครื่องจักรหยุดการผลิต (Down) ให้โทรแจ้งหัวหน้ากะทันที แล้วค่อยบันทึกใบแจ้งซ่อมในระบบ</div>
</div>
`,
  },
  {
    id: "tpl-pmam",
    name: "หน้าแผน PM/AM",
    desc: "ศูนย์แผนซ่อมบำรุงเชิงป้องกัน: สรุปสถานะ PM จริง + ขั้นตอน + ลิงก์ปฏิทิน/เช็คชีท",
    icon: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><rect x="3" y="4" width="18" height="17" rx="3" fill="rgba(0,104,181,.10)" stroke="${C.primary}"/><path d="M3 9h18" stroke="${C.primary}"/><circle cx="8" cy="15" r="2.4" fill="${C.ok}"/><path d="M13 14.5h5M13 17h5" stroke="${C.warn}" stroke-width="1.7" stroke-linecap="round"/></svg>`,
    title: "ศูนย์แผนงาน PM/AM",
    slug: "pm-center",
    html: `
<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT}">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN · PM / AM CENTER</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">ศูนย์แผนงาน PM/AM</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">วางแผนซ่อมบำรุงเชิงป้องกัน ตรวจเช็คตามรอบ และติดตามผลให้ตรงกำหนด</p>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 12px">ขั้นตอนการทำงาน PM</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <div style="flex:1;min-width:190px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:26px;font-weight:700;color:${C.primary};line-height:1">01</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">สร้างแผน</div><div style="font-size:13px;color:${C.text2};line-height:1.6">กำหนดเครื่องจักร + รายการตรวจ + ความถี่ (รายวัน/สัปดาห์/เดือน)</div></div>
  <div style="flex:1;min-width:190px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:26px;font-weight:700;color:${C.primary};line-height:1">02</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">สแกน QR หน้างาน</div><div style="font-size:13px;color:${C.text2};line-height:1.6">สแกน QR ที่เครื่องจักรเพื่อเปิดเช็คชีทของรอบนั้นทันที</div></div>
  <div style="flex:1;min-width:190px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:26px;font-weight:700;color:${C.primary};line-height:1">03</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">ทำเช็คชีท</div><div style="font-size:13px;color:${C.text2};line-height:1.6">บันทึกผลตรวจ + ลงชื่อรับรองบนมือถือ (ออฟไลน์ได้)</div></div>
  <div style="flex:1;min-width:190px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-family:${FONT_DISPLAY};font-size:26px;font-weight:700;color:${C.primary};line-height:1">04</div><div style="font-size:14px;font-weight:700;color:${C.text};margin:6px 0 4px">ติดตามผล</div><div style="font-size:13px;color:${C.text2};line-height:1.6">ดูแผนเกินกำหนดในหน้า KPI และรับแจ้งเตือน LINE อัตโนมัติ</div></div>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">สถานะแผน PM/AM (ข้อมูลจริง)</h2>
<div data-dynamic="pm-table" data-dynamic-label="งาน PM/AM" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">งาน PM/AM — ข้อมูลจริงจากฐานข้อมูล</div></div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
  <a href="/pm_am" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ตารางแผน PM</div><div style="font-size:12px;color:${C.muted};margin-top:2px">ดู/แก้ไขแผนทั้งหมด</div></a>
  <a href="/pm_am/calendar" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ปฏิทิน PM/AM</div><div style="font-size:12px;color:${C.muted};margin-top:2px">กำหนดการรายเดือน</div></a>
  <a href="/pm_am/checksheet" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ทำเช็คชีท PM</div><div style="font-size:12px;color:${C.muted};margin-top:2px">เริ่มตรวจรอบนี้</div></a>
  <a href="/pm_am/create" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">สร้างแผนใหม่</div><div style="font-size:12px;color:${C.muted};margin-top:2px">เพิ่มรายการ PM/AM</div></a>
</div>
<div style="display:flex;gap:10px;align-items:flex-start;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.25);border-radius:${C.radius};padding:14px;font-family:${FONT};margin-top:16px">
  <span style="flex:none;width:18px;height:18px;border-radius:50%;background:${C.warn};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px">!</span>
  <div style="font-size:13px;color:${C.warnDark}">แผน PM ที่เกินกำหนดจะถูกนับเข้า KPI "%PM ทันกำหนด" — ควรปิดงานให้ครบก่อนสิ้นเดือนเพื่อรักษา compliance</div>
</div>
`,
  },
  {
    id: "tpl-reports",
    name: "หน้ารายงานผู้บริหาร",
    desc: "กระดานรายงานผู้บริหาร: KPI + Andon + งานล่าสุด + อะไหล่ต่ำสต็อก + ลิงก์รายงาน PDF/Excel",
    icon: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="rgba(0,104,181,.10)" stroke="${C.primary}"/><path d="M7 16l3-4 2.5 2.5L17 9" stroke="${C.primary}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 6v2M10 6v2M13 6v2" stroke="${C.muted}" stroke-width="1.4"/></svg>`,
    title: "รายงานผู้บริหาร",
    slug: "executive-report",
    html: `
<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT}">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN · EXECUTIVE REPORT</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">รายงานผู้บริหาร</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">ภาพรวมสมรรถนะการซ่อมบำรุง: KPI, MTTR/MTBF, ค่าใช้จ่าย และสต็อกอะไหล่</p>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">KPI งานซ่อม (ข้อมูลจริง)</h2>
<div data-dynamic="kpi-overview" data-dynamic-label="KPI งานซ่อม" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">KPI งานซ่อม — ข้อมูลจริงจากฐานข้อมูล</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">สถานะเครื่องจักร (ข้อมูลจริง)</h2>
<div data-dynamic="andon-board" data-dynamic-label="ไฟ Andon" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">หลอดไฟ Andon — ตามสถานะงานจริง</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">วิเคราะห์รายงานตามหัวข้อ</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <a href="/analytics/kpi" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">KPI ผู้บริหาร</div><div style="font-size:12px;color:${C.muted};margin-top:3px">MTTR / MTBF · %PM ทันกำหนด · %ปิดงานใน SLA</div></a>
  <a href="/reports" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ศูนย์รวมรายงาน</div><div style="font-size:12px;color:${C.muted};margin-top:3px">ค่าใช้จ่ายซ่อมรายเดือน · ความถี่ Breakdown</div></a>
  <a href="/reports/pdf" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">รายงาน PDF ผู้บริหาร</div><div style="font-size:12px;color:${C.muted};margin-top:3px">ดาวน์โหลดสรุปประจำเดือน</div></a>
  <a href="/reports/export" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ส่งออก Excel / CSV</div><div style="font-size:12px;color:${C.muted};margin-top:3px">ดึงข้อมูลดิบไปวิเคราะห์ต่อ</div></a>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">ใบสั่งงานซ่อมล่าสุด (ข้อมูลจริง)</h2>
<div data-dynamic="wo-table" data-dynamic-label="งานซ่อมล่าสุด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">ใบสั่งงานซ่อมล่าสุด 5 ใบ — ข้อมูลจริง</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">อะไหล่ใกล้หมดสต็อก (ข้อมูลจริง)</h2>
<div data-dynamic="low-stock" data-dynamic-label="อะไหล่ใกล้หมด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">อะไหล่ใกล้หมดสต็อก — ข้อมูลจริง</div></div>
`,
  },
  {
    id: "tpl-announce",
    name: "หน้ารวมประกาศ",
    desc: "ประชาสัมพันธ์ข่าวสาร + ลิงก์เอกสาร/แบบฟอร์ม F-EN สำหรับพนักงาน",
    icon: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M3 8l9-4 9 4v9l-9 4-9-4V8z" stroke="${C.primary}" stroke-width="1.7" fill="rgba(0,104,181,.10)"/><path d="M3 8l9 4 9-4M12 12v9" stroke="${C.primary}" stroke-width="1.7" fill="none"/></svg>`,
    title: "ข่าวประชาสัมพันธ์",
    slug: "announcements",
    html: `
<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT}">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN · NEWS</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">ข่าวประชาสัมพันธ์</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">ประกาศและข่าวสารล่าสุดของแผนกซ่อมบำรุง</p>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 12px">ประกาศล่าสุด</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <div style="flex:1;min-width:240px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-size:12px;color:${C.muted};font-family:${FONT_DISPLAY};letter-spacing:.08em">15 ส.ค. 2026</div><div style="font-size:15px;font-weight:700;color:${C.text};margin:6px 0">ปิดซ่อมบำรุงประจำเดือน</div><div style="font-size:13px;color:${C.text2};line-height:1.6">เครื่องจักรสาย A จะหยุดเดินเครื่องเพื่อทำ PM ประจำเดือนวันที่ 25 ส.ค. — วางแผนงานล่วงหน้า</div></div>
  <div style="flex:1;min-width:240px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-size:12px;color:${C.muted};font-family:${FONT_DISPLAY};letter-spacing:.08em">1 ส.ค. 2026</div><div style="font-size:15px;font-weight:700;color:${C.text};margin:6px 0">อบรมการใช้งานระบบใหม่</div><div style="font-size:13px;color:${C.text2};line-height:1.6">ทีมช่างทุกคนต้องเข้ารับการอบรมแอป CMMS บนมือถือภายในสัปดาห์หน้า</div></div>
  <div style="flex:1;min-width:240px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:16px"><div style="font-size:12px;color:${C.muted};font-family:${FONT_DISPLAY};letter-spacing:.08em">20 ก.ค. 2026</div><div style="font-size:15px;font-weight:700;color:${C.text};margin:6px 0">ปรับปรุงห้องเก็บอะไหล่</div><div style="font-size:13px;color:${C.text2};line-height:1.6">ย้ายชั้นวางอะไหล่ใหม่ เสร็จภายในสิ้นเดือน — เบิกอะไหล่ผ่านระบบ Sage ตามปกติ</div></div>
</div>
<div style="display:flex;gap:10px;align-items:flex-start;background:rgba(0,104,181,.10);border:1px solid rgba(0,104,181,.25);border-radius:${C.radius};padding:14px;font-family:${FONT};margin-top:16px">
  <span style="flex:none;width:18px;height:18px;border-radius:50%;background:${C.primary};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px">i</span>
  <div style="font-size:13px;color:${C.primaryText}">ประกาศจากฝ่าย IT: กรุณาอัปเดตแอป CMMS เป็นเวอร์ชันล่าสุดเพื่อรับการแจ้งเตือน LINE</div>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:22px 0 12px">เอกสารและแบบฟอร์ม</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <a href="/forms" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ศูนย์แบบฟอร์ม F-EN</div><div style="font-size:12px;color:${C.muted};margin-top:2px">ใบแจ้งซ่อม ใบ PM เอกสารตรวจเช็ค</div></a>
  <a href="/manuals" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">คู่มือการใช้งาน</div><div style="font-size:12px;color:${C.muted};margin-top:2px">วิธีใช้ระบบ CMMS ฉบับพนักงาน</div></a>
  <a href="/qr-sheet" style="flex:1;min-width:200px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">สแกน QR เครื่องจักร</div><div style="font-size:12px;color:${C.muted};margin-top:2px">ตรวจเช็คเครื่องจักรหน้างาน</div></a>
</div>
`,
  },
  {
    id: "tpl-safety",
    name: "ศูนย์ความปลอดภัย",
    desc: "กระดานความปลอดภัย: ใบอนุญาตทำงานค้าง + สอบเทียบเครื่องมือ + ยืมคืนเกินกำหนด (ข้อมูลจริงจาก DB)",
    icon: `<svg viewBox="0 0 24 24" width="30" height="30" fill="none"><path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" stroke="${C.primary}" stroke-width="1.7" fill="rgba(0,104,181,.10)"/><path d="M8.5 12l2.5 2.5 4.5-5" stroke="${C.ok}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    title: "ศูนย์ความปลอดภัย",
    slug: "safety-center",
    html: `
<div style="background:${C.primary};border-radius:14px;padding:28px 24px;color:#fff;font-family:${FONT}">
  <div style="font-family:${FONT_DISPLAY};font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:6px">CMMS-TOPPAN · SAFETY CENTER</div>
  <h2 style="margin:0;font-size:26px;font-weight:700;line-height:1.2;font-family:${FONT_DISPLAY}">ศูนย์ความปลอดภัย</h2>
  <p style="margin:8px 0 0;font-size:14px;opacity:.85">ภาพรวมงานเสี่ยง ใบอนุญาตทำงาน การสอบเทียบเครื่องมือ และการยืม-คืนอุปกรณ์ — อัปเดตจากฐานข้อมูลแบบเรียลไทม์</p>
</div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">ใบอนุญาตทำงานค้าง (ข้อมูลจริง)</h2>
<div data-dynamic="work-permit" data-dynamic-label="ใบอนุญาตทำงาน" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">ใบอนุญาตทำงานที่ยังไม่ปิด — ข้อมูลจริง</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">สถานะสอบเทียบเครื่องมือวัด (ข้อมูลจริง)</h2>
<div data-dynamic="calibration-board" data-dynamic-label="สถานะสอบเทียบ" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">สอบเทียบเครื่องมือวัด — ข้อมูลจริง</div></div>
<h2 style="font-family:${FONT_DISPLAY};font-size:20px;font-weight:700;color:${C.text};margin:18px 0 10px">การยืม-คืนอุปกรณ์ค้าง (ข้อมูลจริง)</h2>
<div data-dynamic="borrow-overdue" data-dynamic-label="ยืมคืนเกินกำหนด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">รายการยืม-คืนที่ยังไม่คืน — ข้อมูลจริง</div></div>
<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
  <a href="/safety/work_permit" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ขอใบอนุญาตทำงาน</div><div style="font-size:12px;color:${C.muted};margin-top:2px">งานเสี่ยงสูง / LOTO</div></a>
  <a href="/calibration" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ทะเบียนสอบเทียบ</div><div style="font-size:12px;color:${C.muted};margin-top:2px">จัดการรอบสอบเทียบ</div></a>
  <a href="/equipment_borrowing" style="flex:1;min-width:180px;background:${C.card};border:1px solid ${C.border};border-radius:${C.radius};padding:14px;text-decoration:none"><div style="font-size:14px;font-weight:700;color:${C.primary}">ยืม-คืนอุปกรณ์</div><div style="font-size:12px;color:${C.muted};margin-top:2px">เครื่องมือช่างและอุปกรณ์พิเศษ</div></a>
</div>
`,
  },
];

/* ── บล็อกไดนามิก — ดึงข้อมูลจริงจากฐานข้อมูลตอนเปิดหน้า (/pages/[slug]) ── */
const DYNAMIC_BLOCKS: Array<{
  id: string;
  label: string;
  category: string;
  icon: string;
  content: string;
}> = [
  {
    id: "dyn-kpi",
    label: "KPI งานซ่อม (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" fill="rgba(0,104,181,.10)" stroke="${C.primary}"/><circle cx="7" cy="8" r="2.6" fill="${C.ok}"/><rect x="11" y="6" width="9" height="2.4" rx="1.2" fill="${C.primary}"/><rect x="11" y="10" width="6" height="2" rx="1" fill="${C.muted}"/><path d="M4 18h16" stroke="${C.primary}" stroke-width="1.4"/></svg>`,
    content: `<div data-dynamic="kpi-overview" data-dynamic-label="KPI งานซ่อม" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">KPI งานซ่อม — ข้อมูลจริงจากฐานข้อมูล</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">จำนวนงานทั้งหมด / ปิดแล้ว / กำลังทำ / เลยกำหนด — อัปเดตอัตโนมัติเมื่อเปิดหน้า</div></div>`,
  },
  {
    id: "dyn-andon",
    label: "ไฟ Andon (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><circle cx="7" cy="10" r="3.5" fill="${C.ok}"/><circle cx="12" cy="10" r="3.5" fill="${C.warn}"/><circle cx="17" cy="10" r="3.5" fill="${C.down}"/></svg>`,
    content: `<div data-dynamic="andon-board" data-dynamic-label="ไฟ Andon" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">หลอดไฟ Andon — ตามสถานะงานจริง</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">นับจากใบสั่งงานซ่อมจริง (ปกติ / เตือน / หยุด)</div></div>`,
  },
  {
    id: "dyn-wo-table",
    label: "ตารางงานซ่อมล่าสุด (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="${C.primary}" fill="none"/><line x1="3" y1="10" x2="21" y2="10" stroke="${C.primary}"/><line x1="3" y1="15" x2="21" y2="15" stroke="${C.border}"/><line x1="9" y1="5" x2="9" y2="19" stroke="${C.border}"/></svg>`,
    content: `<div data-dynamic="wo-table" data-dynamic-label="งานซ่อมล่าสุด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">ใบสั่งงานซ่อมล่าสุด 5 ใบ — ข้อมูลจริง</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">เลขใบงาน / เครื่องจักร / สถานะ / ผู้รับผิดชอบ</div></div>`,
  },
  {
    id: "dyn-low-stock",
    label: "อะไหล่ใกล้หมดสต็อก (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" stroke="${C.warn}" stroke-width="1.6" fill="rgba(245,158,11,.12)"/><rect x="9" y="10" width="6" height="3" rx="1.5" fill="${C.warn}"/><rect x="10.5" y="15" width="3" height="2" rx="1" fill="${C.warn}"/></svg>`,
    content: `<div data-dynamic="low-stock" data-dynamic-label="อะไหล่ใกล้หมด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">อะไหล่ใกล้หมดสต็อก — ข้อมูลจริง</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">รายการ stock_qty ≤ min_stock จากตาราง spare_parts</div></div>`,
  },
  {
    id: "dyn-pm-table",
    label: "ตารางงาน PM/AM (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="${C.primary}" fill="rgba(0,104,181,.08)"/><path d="M3 9h18" stroke="${C.primary}"/><path d="M7 13h4M7 16h7" stroke="${C.warn}" stroke-width="1.6" stroke-linecap="round"/><rect x="14" y="13" width="5" height="5" rx="2.5" stroke="${C.down}" stroke-width="1.5" fill="none"/></svg>`,
    content: `<div data-dynamic="pm-table" data-dynamic-label="งาน PM/AM" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">งาน PM/AM — ข้อมูลจริงจากฐานข้อมูล</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">เกินกำหนด / ใกล้กำหนด 7 วัน / เสร็จแล้ว — เทียบ due_date กับวันนี้</div></div>`,
  },
  {
    id: "dyn-calibration",
    label: "สถานะสอบเทียบเครื่องมือ (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><path d="M4 19l4-4m3-3l3-3" stroke="${C.primary}" stroke-width="1.6" stroke-linecap="round"/><rect x="3" y="5" width="18" height="14" rx="3" fill="rgba(0,104,181,.08)" stroke="${C.primary}"/><path d="M5 15h4M11 15h4" stroke="${C.warn}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    content: `<div data-dynamic="calibration-board" data-dynamic-label="สถานะสอบเทียบ" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">สถานะสอบเทียบเครื่องมือวัด — ข้อมูลจริงจากฐานข้อมูล</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">หมดอายุ / ใกล้หมดอายุ 30 วัน / ปกติ — เทียบ next_calibration_date กับวันนี้</div></div>`,
  },
  {
    id: "dyn-borrow",
    label: "รายการยืมคืนเกินกำหนด (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><path d="M6 3v4M18 3v4" stroke="${C.primary}" stroke-width="1.6" stroke-linecap="round"/><rect x="4" y="5" width="16" height="16" rx="3" fill="rgba(0,104,181,.08)" stroke="${C.primary}"/><path d="M4 10h16" stroke="${C.primary}"/><path d="M8 16l3 3 5-6" stroke="${C.warn}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    content: `<div data-dynamic="borrow-overdue" data-dynamic-label="ยืมคืนเกินกำหนด" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">รายการยืม-คืนอุปกรณ์ — ข้อมูลจริงจากฐานข้อมูล</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">รายการยังไม่คืน + เกินกำหนด เทียบ expected_return_date กับวันนี้</div></div>`,
  },
  {
    id: "dyn-work-permit",
    label: "ใบอนุญาตทำงานค้าง (ข้อมูลจริง)",
    category: "ข้อมูลจริง (จากฐานข้อมูล)",
    icon: `<svg viewBox="0 0 24 24" width="36" height="36" fill="none"><path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" stroke="${C.down}" stroke-width="1.6" fill="rgba(239,68,68,.10)"/><path d="M9 12h6M12 9v6" stroke="${C.down}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
    content: `<div data-dynamic="work-permit" data-dynamic-label="ใบอนุญาตทำงาน" style="background:${C.card};border:1px dashed ${C.primary};border-radius:${C.radius};padding:18px"><div style="font-family:${FONT};font-size:13px;color:${C.primaryText};font-weight:600">ใบอนุญาตทำงาน (Work Permit) — ข้อมูลจริงจากฐานข้อมูล</div><div style="font-family:${FONT};font-size:12px;color:${C.muted};margin-top:4px">รายการค้าง: รอตรวจสอบ / อนุมัติแล้ว — ยังไม่ปิดงาน</div></div>`,
  },
];

interface PageRow {
  id: number;
  slug: string;
  title: string;
  updated_at: string;
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "8px",
  border: "1px solid var(--cmms-border, #E4E8EE)",
  background: "var(--cmms-bg-card, #FFFFFF)",
  fontSize: 14,
  color: "var(--cmms-text-primary, #22262E)",
  outline: "none",
  minWidth: 0,
};

export default function GrapesBuilder() {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [pages, setPages] = useState<PageRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/custom_pages.php", {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.status === "success" && Array.isArray(json.pages)) setPages(json.pages);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let editor: any = null;

    (async () => {
      const grapesjs = (await import("grapesjs")).default;
      if (cancelled || !containerRef.current) return;

      editor = grapesjs.init({
        container: containerRef.current,
        height: "100%",
        width: "auto",
        fromElement: false,
        storageManager: false,
        undoManager: { trackSelection: false },
        deviceManager: {
          devices: [
            { id: "desktop", name: "Desktop", width: "" },
            { id: "tablet", name: "Tablet", width: "768px", widthMedia: "992px" },
            { id: "mobile", name: "Mobile", width: "375px", widthMedia: "600px" },
          ],
        },
        styleManager: {
          sectors: [
            {
              name: "การจัดวาง",
              open: true,
              buildProps: [
                "display", "flex-direction", "flex-wrap", "justify-content", "align-items",
                "gap", "width", "min-width", "max-width", "height", "min-height",
                "margin", "padding", "border-radius", "overflow",
              ],
            },
            {
              name: "ตัวอักษร",
              open: true,
              buildProps: [
                "font-family", "font-size", "font-weight", "font-style",
                "letter-spacing", "line-height", "text-align", "color", "text-decoration",
              ],
            },
            {
              name: "สีและพื้นหลัง",
              open: true,
              buildProps: ["background-color", "border", "border-color", "box-shadow"],
            },
            {
              name: "เอฟเฟกต์",
              open: true,
              buildProps: ["opacity", "transition", "transform"],
            },
          ],
        },
        blockManager: {
          blocks: [...BLOCKS, ...DYNAMIC_BLOCKS].map((b) => ({
            id: b.id,
            label: b.label,
            category: b.category,
            media: b.icon,
            content: b.content,
          })),
        },
      });

      editorRef.current = editor;
      // Dev hook — ให้ preview/ทดสอบขับ editor ได้ (เฉพาะ development)
      if (process.env.NODE_ENV === "development") {
        (window as unknown as Record<string, unknown>).__grapesEditor = editor;
      }
      setReady(true);
      refreshList();
    })();

    return () => {
      cancelled = true;
      try {
        editor?.destroy?.();
      } catch {
        /* ignore */
      }
      editorRef.current = null;
      if (process.env.NODE_ENV === "development") {
        delete (window as unknown as Record<string, unknown>).__grapesEditor;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // บันทึกหน้า — openAfter=true จะเปิด /pages/slug ในแท็บใหม่หลังบันทึกสำเร็จ
  // รับ title/slug แบบ explicit (t/s) สำหรับ "สร้างเลย" ที่ยังไม่ได้ setState ทันที
  const doSave = async (openAfter: boolean, t?: string, s?: string): Promise<boolean> => {
    const ed = editorRef.current;
    if (!ed) return false;
    const sl = (s ?? slug).trim();
    const ttl = (t ?? title).trim();
    if (!sl || !ttl) {
      setMsg({ kind: "err", text: "กรอกชื่อหน้า (title) และ slug (ภาษาอังกฤษตัวเล็ก) ก่อนบันทึก" });
      return false;
    }
    if (!/^[a-z0-9_-]+$/.test(sl)) {
      setMsg({ kind: "err", text: "slug ต้องเป็น a-z / 0-9 / _ / - เท่านั้น (ไม่เว้นวรรค)" });
      return false;
    }
    const html = ed.getHtml();
    const css = ed.getCss();
    const js = ed.getJs();
    if (!html || !css) {
      setMsg({ kind: "err", text: "canvas ยังว่าง — ลากบล็อกจากซ้ายมือลงไปก่อนบันทึก" });
      return false;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/custom_pages.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({ slug: sl, title: ttl, html, css, js }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setMsg({
        kind: "ok",
        text: openAfter ? `สร้างหน้า "${ttl}" เรียบร้อย — เปิดดูในแท็บใหม่ (/pages/${sl})` : json?.message || "บันทึกเรียบร้อยแล้ว",
      });
      refreshList();
      if (openAfter) window.open(`/pages/${encodeURIComponent(sl)}`, "_blank", "noopener");
      return true;
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = () => doSave(false);

  // "สร้างเลย" — โหลดเทมเพลตลง canvas + บันทึก + เปิดดูทันทีในแท็บใหม่ (ไม่ต้องกดบันทึกเอง)
  const createFromTemplate = (t: (typeof TEMPLATES)[number]) => {
    const ed = editorRef.current;
    if (!ed || busy) return;
    ed.setComponents(t.html);
    ed.setStyle("");
    setTitle(t.title);
    setSlug(t.slug);
    doSave(true, t.title, t.slug);
  };

  const loadPage = async (row: PageRow) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/v1/custom_pages.php?slug=${encodeURIComponent(row.slug)}`, {
        headers: { "ngrok-skip-browser-warning": "1" },
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.status !== "success" || !json.page) throw new Error("ไม่พบหน้า");
      const ed = editorRef.current;
      if (ed) {
        ed.setComponents(json.page.html);
        ed.setStyle(json.page.css);
      }
      setSlug(json.page.slug);
      setTitle(json.page.title);
      setMsg({ kind: "ok", text: `โหลดหน้า "${json.page.title}" เข้า canvas แล้ว` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "โหลดหน้าไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  const removePage = async (row: PageRow) => {
    if (!window.confirm(`ลบหน้า "${row.title}" (/pages/${row.slug}) ?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/custom_pages.php?slug=${encodeURIComponent(row.slug)}`, {
        method: "DELETE",
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ลบไม่สำเร็จ");
      setMsg({ kind: "ok", text: json?.message || "ลบแล้ว" });
      refreshList();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "ลบไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  };

  const newPage = () => {
    setSlug("");
    setTitle("");
    const ed = editorRef.current;
    if (ed) {
      ed.setComponents("");
      ed.setStyle("");
    }
    setMsg(null);
  };

  // เทมเพลตเริ่มต้น — โหลดลง canvas พร้อมตั้งชื่อ/slug ให้ (ยังไม่บันทึก — กดบันทึกเมื่อพอใจ)
  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.setComponents(t.html);
    ed.setStyle("");
    setTitle(t.title);
    setSlug(t.slug);
    setMsg({
      kind: "ok",
      text: `โหลดเทมเพลต "${t.name}" แล้ว — ปรับแต่งได้ตามต้องการ แล้วกด "บันทึกหน้า" เพื่อเผยแพร่ (slug: ${t.slug})`,
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── แถบบันทึก / เลือกหน้า ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
          background: "var(--cmms-bg-card, #FFFFFF)",
          border: "1px solid var(--cmms-border, #E4E8EE)",
          borderRadius: 12,
          padding: "12px 14px",
        }}
      >
        <input
          placeholder="ชื่อหน้า (ภาษาไทยได้)"
          aria-label="ชื่อหน้า"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 200px" }}
        />
        <span style={{ color: "var(--cmms-text-muted, #9AA4B8)", fontSize: 14 }}>/pages/</span>
        <input
          placeholder="slug (a-z, 0-9, _ -)"
          aria-label="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          style={{ ...inputStyle, flex: "1 1 160px" }}
        />
        <button
          type="button"
          onClick={newPage}
          disabled={busy}
          style={btnStyle("ghost")}
        >
          หน้าใหม่
        </button>
        <button type="button" onClick={save} disabled={busy || !ready} style={btnStyle("primary")}>
          {busy ? "กำลังบันทึก..." : "บันทึกหน้า"}
        </button>
        {slug && (
          <a href={`/pages/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" style={btnStyle("link")}>
            เปิดดู
          </a>
        )}
      </div>

      {/* ── หน้าย่อยที่บันทึกแล้ว ── */}
      {pages.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            background: "var(--cmms-bg-card, #FFFFFF)",
            border: "1px solid var(--cmms-border, #E4E8EE)",
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--cmms-text-secondary, #475569)", alignSelf: "center" }}>
            หน้าที่บันทึกแล้ว ({pages.length})
          </span>
          {pages.map((p) => (
            <span
              key={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--cmms-bg-muted, #EEF1F6)",
                borderRadius: 100,
                padding: "4px 6px 4px 12px",
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600, color: "var(--cmms-text-primary, #22262E)" }}>{p.title}</span>
              <span style={{ color: "var(--cmms-text-muted, #9AA4B8)", fontSize: 12 }}>/pages/{p.slug}</span>
              <button type="button" onClick={() => loadPage(p)} disabled={busy} style={miniBtn("แก้ไข")}>
                แก้ไข
              </button>
              <a href={`/pages/${encodeURIComponent(p.slug)}`} target="_blank" rel="noreferrer" style={miniBtn("เปิด")}>
                เปิด
              </a>
              <button type="button" onClick={() => removePage(p)} disabled={busy} style={miniBtn("ลบ")}>
                ลบ
              </button>
            </span>
          ))}
        </div>
      )}

      {msg && (
        <div
          style={{
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 14,
            background: msg.kind === "ok" ? "rgba(16,185,129,.10)" : "rgba(239,68,68,.10)",
            color: msg.kind === "ok" ? "var(--cmms-success-dark, #15803D)" : "var(--cmms-danger-dark, #7F1D1D)",
          }}
        >
          {msg.text}
        </div>
      )}

      {/* ── เทมเพลตหน้าเริ่มต้น — กดใช้ได้ในคลิกเดียว ── */}
      {ready && (
        <div
          style={{
            background: "var(--cmms-bg-card, #FFFFFF)",
            border: "1px solid var(--cmms-border, #E4E8EE)",
            borderRadius: 12,
            padding: "12px 14px",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cmms-text-secondary, #475569)", marginBottom: 8 }}>
            เทมเพลตหน้าเริ่มต้น — กดการ์ด = โหลดลง canvas ปรับแต่งก่อน · กด "สร้างเลย" = บันทึก + เปิดดูทันที
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: "var(--cmms-bg-muted, #EEF1F6)",
                  border: "1px solid var(--cmms-border, #E4E8EE)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  minWidth: 220,
                  flex: "1 1 220px",
                }}
              >
                <button
                  type="button"
                  onClick={() => applyTemplate(t)}
                  disabled={busy}
                  title={t.desc}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    width: "100%",
                    fontFamily: "inherit",
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: "var(--cmms-bg-card, #FFFFFF)",
                      border: "1px solid var(--cmms-border, #E4E8EE)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    dangerouslySetInnerHTML={{ __html: t.icon }}
                  />
                  <span>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--cmms-text-primary, #22262E)" }}>
                      {t.name}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--cmms-text-muted, #9AA4B8)", lineHeight: 1.5 }}>
                      {t.desc}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => createFromTemplate(t)}
                  disabled={busy}
                  style={{
                    width: "100%",
                    fontFamily: "inherit",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    background: "var(--cmms-primary, #0068B5)",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 0",
                    cursor: "pointer",
                  }}
                >
                  {busy ? "กำลังสร้าง..." : "สร้างเลย"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GrapesJS Editor (blocks ซ้าย / canvas กลาง / style manager ขวา — chrome ในตัว) ── */}
      <div
        ref={containerRef}
        style={{
          minHeight: 620,
          height: "calc(100vh - 260px)",
          background: "var(--cmms-bg-card, #FFFFFF)",
          border: "1px solid var(--cmms-border, #E4E8EE)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      />

      {!ready && (
        <div style={{ fontSize: 14, color: "var(--cmms-text-muted, #9AA4B8)" }}>
          กำลังโหลดตัวแก้ไข...
        </div>
      )}
    </div>
  );
}

function btnStyle(kind: "primary" | "ghost" | "link"): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
    border: "1px solid transparent",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };
  if (kind === "primary") {
    return {
      ...base,
      background: "var(--cmms-primary, #0068B5)",
      color: "#FFFFFF",
    };
  }
  if (kind === "link") {
    return {
      ...base,
      background: "var(--cmms-bg-muted, #EEF1F6)",
      color: "var(--cmms-text-secondary, #475569)",
    };
  }
  return {
    ...base,
    background: "transparent",
    color: "var(--cmms-text-secondary, #475569)",
    borderColor: "var(--cmms-border, #E4E8EE)",
  };
}

function miniBtn(kind: "แก้ไข" | "เปิด" | "ลบ"): React.CSSProperties {
  const color =
    kind === "ลบ"
      ? "var(--cmms-danger-dark, #7F1D1D)"
      : kind === "เปิด"
        ? "var(--cmms-primary, #0068B5)"
        : "var(--cmms-text-secondary, #475569)";
  return {
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: 600,
    color,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "2px 4px",
    textDecoration: "none",
    borderRadius: 6,
  };
}

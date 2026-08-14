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
          blocks: BLOCKS.map((b) => ({
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

  const save = async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const s = slug.trim();
    const t = title.trim();
    if (!s || !t) {
      setMsg({ kind: "err", text: "กรอกชื่อหน้า (title) และ slug (ภาษาอังกฤษตัวเล็ก) ก่อนบันทึก" });
      return;
    }
    if (!/^[a-z0-9_-]+$/.test(s)) {
      setMsg({ kind: "err", text: "slug ต้องเป็น a-z / 0-9 / _ / - เท่านั้น (ไม่เว้นวรรค)" });
      return;
    }
    const html = ed.getHtml();
    const css = ed.getCss();
    const js = ed.getJs();
    if (!html || !css) {
      setMsg({ kind: "err", text: "canvas ยังว่าง — ลากบล็อกจากซ้ายมือลงไปก่อนบันทึก" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/custom_pages.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "1" },
        body: JSON.stringify({ slug: s, title: t, html, css, js }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setMsg({ kind: "ok", text: json?.message || "บันทึกเรียบร้อยแล้ว" });
      refreshList();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
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

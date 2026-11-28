"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { usePageHero } from "@/lib/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Maximize2, RefreshCw, Wrench, CalendarClock, Package, Activity } from "lucide-react";
import AndonLamp from "@/components/AndonLamp";
import { useMenuPermission } from "@/lib/useMenuPermission";

interface RepairRow {
  id: number;
  work_order_no?: string;
  title?: string;
  asset_name?: string;
  status?: string;
  priority?: string;
  machine_status?: string;
  estimated_completion_date?: string | null;
  created_at?: string;
  assigned_name?: string | null;
  assigned_avatar?: string | null;
  assigned_avatar_legacy?: string | null;
}

interface PmRow {
  id: number;
  title?: string;
  asset_name?: string;
  due_date?: string | null;
  status?: string;
  assigned_name?: string | null;
  assigned_avatar?: string | null;
  assigned_avatar_legacy?: string | null;
}

interface SpareRow {
  id: number;
  code?: string;
  name?: string;
  stock_qty?: number | string;
  min_stock?: number | string;
  location?: string;
}

const isOpen = (s?: string) => {
  const v = String(s || "").toLowerCase();
  return !["resolved", "closed", "completed", "cancelled", "rejected"].includes(v);
};

const machineTone = (r: RepairRow): "down" | "warn" | "ok" | "idle" => {
  if (String(r.machine_status || "").toLowerCase() === "down") return "down";
  if (String(r.priority || "").toLowerCase() === "critical") return "down";
  if (String(r.priority || "").toLowerCase() === "high") return "warn";
  if (!isOpen(r.status)) return "ok";
  if (r.estimated_completion_date && new Date(r.estimated_completion_date.replace(" ", "T")) < new Date()) return "down";
  return "warn";
};

const andonLabel = (t: "down" | "warn" | "ok" | "idle") =>
  t === "down" ? "หยุดทำงาน" : t === "warn" ? "ต้องดูแล" : t === "ok" ? "พร้อมใช้งาน" : "ไม่มีการทำงาน";

const priorityLabel = (p?: string) => {
  const m: Record<string, string> = { critical: "วิกฤต", high: "สูง", medium: "ปานกลาง", low: "ต่ำ" };
  return m[String(p || "").toLowerCase()] || p || "—";
};

function fmtClock(d: Date) {
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function avatarSrc(r: { assigned_avatar?: string | null; assigned_avatar_legacy?: string | null }) {
  const v = (r.assigned_avatar || r.assigned_avatar_legacy || "").trim();
  if (!v) return "";
  if (/^(https?:|data:|blob:)/i.test(v)) return v;
  return v.startsWith("/") ? v : `/${v}`;
}

function initials(name?: string | null) {
  const n = (name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name, src, size = 44 }: { name?: string | null; src?: string; size?: number }) {
  const [err, setErr] = useState(false);
  const showImg = src && !err;
  return (
    <div
      className="ab-avatar"
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: "var(--ab-surface)",
        border: "2px solid var(--ab-blue)",
        boxShadow: "0 0 0 3px rgba(46,127,224,0.18)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", fontWeight: 700, color: "var(--ab-text)", fontSize: size * 0.36,
      }}
      title={name || "ยังไม่มอบหมาย"}
    >
      {showImg ? (
        <img src={src} alt="" width={size} height={size} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}

export default function AndonBoardPage() {
  const hero = usePageHero("andon-board");

  const { canShow } = useMenuPermission();
  const [repairs, setRepairs] = useState<RepairRow[]>([]);
  const [pms, setPms] = useState<PmRow[]>([]);
  const [spares, setSpares] = useState<SpareRow[]>([]);
  const [kpi, setKpi] = useState<any>(null);
  const [refreshSec, setRefreshSec] = useState(30);
  const [lastSync, setLastSync] = useState<string>("—");
  const [countdown, setCountdown] = useState(30);
  const [now, setNow] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const [repairRes, pmRes, spareRes, kpiRes] = await Promise.all([
        fetch("/api/v1/repair.php"),
        fetch("/api/v1/pm_am.php"),
        fetch("/api/v1/spare_parts.php?limit=200"),
        fetch("/api/v1/kpi_dashboard.php"),
      ]);
      const [repairJson, pmJson, spareJson, kpiJson] = await Promise.all([
        repairRes.json(), pmRes.json(), spareRes.json(), kpiRes.json(),
      ]);
      if (Array.isArray(repairJson)) setRepairs(repairJson);
      if (Array.isArray(pmJson)) setPms(pmJson);
      const spareItems = Array.isArray(spareJson) ? spareJson : (spareJson?.items ?? []);
      if (Array.isArray(spareItems)) setSpares(spareItems);
      if (kpiJson && !Array.isArray(kpiJson)) setKpi(kpiJson);
      setLastSync(fmtClock(new Date()));
      setCountdown(refreshSec);
      setError("");
    } catch (e) {
      console.error("Andon board load failed:", e);
      setError("โหลดข้อมูลไม่สำเร็จ — กำลังลองใหม่…");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetch("/api/v1/settings.php")
      .then((r) => r.json())
      .then((rows: any[]) => {
        if (Array.isArray(rows)) {
          const row = rows.find((x) => x.setting_key === "andon_refresh_sec");
          if (row?.setting_value) {
            const sec = Math.max(10, parseInt(String(row.setting_value), 10) || 30);
            setRefreshSec(sec);
            setCountdown(sec);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, refreshSec * 1000);
    tickRef.current = setInterval(() => {
      setNow(new Date());
      setCountdown((c) => (c <= 1 ? refreshSec : c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSec]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden && timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (!document.hidden && !timerRef.current) { timerRef.current = setInterval(load, refreshSec * 1000); load(); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSec]);

  const urgentRepairs = useMemo(
    () =>
      repairs
        .filter((r) => machineTone(r) !== "ok" && machineTone(r) !== "idle")
        .sort((a, b) => {
          const pa = { critical: 0, high: 1, medium: 2, low: 3 }[String(a.priority || "").toLowerCase()] ?? 4;
          const pb = { critical: 0, high: 1, medium: 2, low: 3 }[String(b.priority || "").toLowerCase()] ?? 4;
          return pa - pb;
        })
        .slice(0, 10),
    [repairs]
  );

  const todayPms = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return pms
      .filter((p) => {
        if (String(p.status || "").toLowerCase() === "completed") return false;
        if (!p.due_date) return true;
        const d = new Date(String(p.due_date).slice(0, 10) + "T00:00:00");
        return d <= today;
      })
      .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))
      .slice(0, 8);
  }, [pms]);

  const lowStock = useMemo(
    () =>
      spares
        .filter((s) => Number(s.stock_qty ?? 0) <= Number(s.min_stock ?? 0))
        .sort((a, b) => Number(a.stock_qty ?? 0) - Number(b.stock_qty ?? 0))
        .slice(0, 10),
    [spares]
  );

  const closedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return repairs.filter((r) => {
      const v = String(r.status || "").toLowerCase();
      return ["resolved", "closed", "completed"].includes(v) && String(r.created_at || "").startsWith(today);
    }).length;
  }, [repairs]);

  const headline = kpi?.headline || {};
  const openCnt = Number(headline.open_cnt ?? 0);
  const overdueCnt = Number(headline.overdue ?? 0);

  const kpiCards: { label: string; value: number; tone: "ok" | "warn" | "down"; sub: string; icon: any }[] = [
    { label: "งานค้างดำเนินการ", value: openCnt, tone: openCnt > 0 ? "warn" : "ok", sub: "ใบที่ยังไม่ปิด", icon: Wrench },
    { label: "เกินกำหนด", value: overdueCnt, tone: overdueCnt > 0 ? "down" : "ok", sub: "เลยกำหนดเสร็จ", icon: Activity },
    { label: "เสร็จวันนี้", value: closedToday, tone: "ok", sub: "ปิดงานวันนี้", icon: CalendarClock },
    { label: "อะไหล่ต่ำสต็อก", value: lowStock.length, tone: lowStock.length > 0 ? "warn" : "ok", sub: "ต่ำกว่าจุดสั่งซื้อ", icon: Package },
  ];

  const goFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  if (!canShow("andon-board")) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B1D33", color: "#E9F2FC" }}>
        <div style={{ textAlign: "center" }}>
          <AndonLamp status="idle" size="lg" decorative />
          <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 700 }}>ไม่มีสิทธิ์ดูจอ Andon</h2>
          <p style={{ color: "#A8BDD6" }}>ติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์เมนู “จอ Andon TV (โรงงาน)”</p>
        </div>
      </div>
    );
  }

  /* สีตามภาษา Andon: เขียว = พร้อม, เหลือง = ต้องดูแล, แดง = หยุด — เข้าชุดกับ wallboard (TOWER_PALETTE) */
  const toneColor = (t: "ok" | "warn" | "down" | "idle") =>
    t === "down" ? "var(--ab-red)" : t === "warn" ? "var(--ab-amber)" : "var(--ab-green)";

  const dist: any[] = Array.isArray(kpi?.status_dist) ? kpi.status_dist : [];
  const distMax = Math.max(1, ...dist.map((s: any) => Number(s.cnt ?? 0)));

  return (
    <div className="ab-root">
      <style>{`
        .ab-root{
          --ab-bg:#0B1D33; --ab-bg-deep:#081426;
          --ab-surface:#102845; --ab-surface-2:#0E2240;
          --ab-line:rgba(140,180,225,0.16); --ab-line-strong:rgba(140,180,225,0.3);
          --ab-text:#E9F2FC; --ab-text-2:#A8BDD6; --ab-text-3:#7A9AB8;
          --ab-blue:#2E7FE0; --ab-blue-deep:#0068B5;
          --ab-green:#2FCB7E; --ab-amber:#EFAB4B; --ab-red:#F0605F;
          min-height:100vh; position:relative; overflow-x:hidden;
          color:var(--ab-text);
          background:linear-gradient(180deg, var(--ab-bg-deep) 0%, var(--ab-bg) 34%, var(--ab-bg) 100%);
          font-family:'Sarabun', ui-sans-serif, system-ui, sans-serif;
        }
        /* ลาย scanlines จอโรงงาน — เบาพอไม่รบกวนการอ่านจากไกล */
        .ab-root::before{
          content:""; position:absolute; inset:0; pointer-events:none; z-index:0;
          background:repeating-linear-gradient(0deg, rgba(233,242,252,0.012) 0 1px, transparent 1px 4px);
        }
        .ab-root::after{
          content:""; position:absolute; inset:0; pointer-events:none; z-index:0;
          background:radial-gradient(900px 340px at 50% -8%, rgba(46,127,224,0.16), transparent 70%);
        }
        .ab-wrap{ position:relative; z-index:1; padding:clamp(14px,1.8vw,26px); display:flex; flex-direction:column; gap:clamp(12px,1.4vw,20px); }

        /* ── หัวจอ ── */
        .ab-top{ display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .ab-brand{ display:flex; align-items:center; gap:14px; }
        .ab-brand-lamp{ padding:8px 7px; border-radius:12px; background:var(--ab-surface-2); border:1px solid var(--ab-line); }
        .ab-kicker{ margin:0; color:var(--ab-text-3); font-size:clamp(.8rem,.95vw,.9rem); font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
        .ab-title{ margin:2px 0 0; font-size:clamp(1.5rem,2.4vw,2.2rem); font-weight:800; line-height:1.15; color:var(--ab-text); }
        .ab-title em{ font-style:normal; color:var(--ab-blue); }
        .ab-clockbox{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; justify-content:flex-end; }
        .ab-clock{ font-variant-numeric:tabular-nums; font-size:clamp(1.9rem,3vw,2.7rem); font-weight:800; line-height:1; letter-spacing:.03em; color:var(--ab-text);
          padding:10px 18px; border-radius:14px; background:var(--ab-surface-2); border:1px solid var(--ab-line-strong); }
        .ab-date{ margin-top:6px; color:var(--ab-text-2); font-size:clamp(.85rem,1vw,.95rem); text-align:right; }
        .ab-side{ display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
        .ab-chip{ display:inline-flex; align-items:center; gap:8px; padding:7px 12px; border-radius:999px; background:var(--ab-surface-2); border:1px solid var(--ab-line); color:var(--ab-text-2); font-size:.85rem; font-variant-numeric:tabular-nums; }
        .ab-live{ width:8px; height:8px; border-radius:50%; background:var(--ab-green); box-shadow:0 0 8px rgba(47,203,126,0.7); animation:abLive 2.4s ease-in-out infinite; }
        @keyframes abLive{ 0%,100%{ opacity:1; } 50%{ opacity:.45; } }

        /* ── แถว KPI ── */
        .ab-kpis{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:clamp(10px,1.2vw,16px); }
        .ab-kpi{ position:relative; padding:clamp(14px,1.4vw,20px); border-radius:16px; background:var(--ab-surface-2); border:1px solid var(--ab-line); overflow:hidden; }
        .ab-kpi::before{ content:""; position:absolute; top:0; left:0; right:0; height:3px; background:var(--ab-kpi-tone,var(--ab-green)); }
        .ab-kpi-head{ display:flex; align-items:center; gap:10px; color:var(--ab-text-2); font-weight:700; font-size:clamp(.9rem,1.1vw,1.05rem); }
        .ab-kpi-val{ font-size:clamp(2.4rem,4.5vw,3.6rem); font-weight:800; line-height:1.05; margin:8px 0 2px; color:var(--ab-text); font-variant-numeric:tabular-nums; }
        .ab-kpi-sub{ color:var(--ab-text-3); font-size:clamp(.8rem,.95vw,.9rem); }

        /* ── แผงเนื้อหา ── */
        .ab-main{ display:grid; grid-template-columns:1.55fr 1fr; gap:clamp(10px,1.2vw,16px); align-items:start; }
        .ab-col{ display:flex; flex-direction:column; gap:clamp(10px,1.2vw,16px); }
        .ab-panel{ position:relative; border-radius:16px; background:var(--ab-surface-2); border:1px solid var(--ab-line); padding:clamp(14px,1.4vw,20px); overflow:hidden; }
        .ab-panel-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
        .ab-panel h3{ margin:0; font-size:clamp(1.05rem,1.4vw,1.3rem); font-weight:800; color:var(--ab-text); display:flex; align-items:center; gap:10px; }
        .ab-rail{ width:4px; height:1.15em; border-radius:2px; background:var(--ab-rail,var(--ab-blue)); flex-shrink:0; }
        .ab-count{ color:var(--ab-text-3); font-size:.9rem; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .ab-list{ display:flex; flex-direction:column; gap:8px; }
        .ab-row{ display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:12px; background:rgba(8,20,38,0.5); border:1px solid var(--ab-line); border-left:3px solid var(--ab-row-tone,var(--ab-line-strong)); transition:background-color .15s ease, border-color .15s ease; }
        .ab-row.down{ background:linear-gradient(90deg, rgba(240,96,95,0.16), rgba(8,20,38,0.5) 55%); border-left-color:var(--ab-red); }
        .ab-row.warn{ background:linear-gradient(90deg, rgba(239,171,75,0.13), rgba(8,20,38,0.5) 55%); border-left-color:var(--ab-amber); }
        .ab-row-body{ flex:1; min-width:0; }
        .ab-row-title{ font-weight:700; font-size:clamp(.95rem,1.15vw,1.1rem); color:var(--ab-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ab-row-meta{ margin-top:2px; font-size:clamp(.85rem,1vw,.95rem); color:var(--ab-text-2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ab-owner{ display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:var(--ab-surface); border:1px solid var(--ab-line); color:var(--ab-text); font-size:.85rem; max-width:230px; flex-shrink:0; }
        .ab-owner span{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ab-empty{ text-align:center; padding:22px 10px; color:var(--ab-text-2); font-size:.95rem; }
        .ab-empty-ok{ color:var(--ab-green); font-weight:700; }
        .ab-stock-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }

        /* ── แถบสัดส่วนสถานะงาน ── */
        .ab-dist{ display:flex; flex-direction:column; gap:10px; }
        .ab-dist-row{ display:grid; grid-template-columns:minmax(90px,auto) 1fr auto; align-items:center; gap:12px; }
        .ab-dist-label{ font-size:.95rem; font-weight:600; color:var(--ab-text-2); text-transform:capitalize; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .ab-dist-track{ height:10px; border-radius:999px; background:rgba(140,180,225,0.12); overflow:hidden; }
        .ab-dist-fill{ display:block; height:100%; border-radius:999px; background:var(--ab-dist-tone,var(--ab-blue)); }
        .ab-dist-cnt{ font-size:1.35rem; font-weight:800; color:var(--ab-text); font-variant-numeric:tabular-nums; min-width:2.2ch; text-align:right; }

        /* ── ท้ายจอ ── */
        .ab-footer{ display:flex; align-items:center; justify-content:space-between; gap:12px; color:var(--ab-text-3); font-size:.85rem; flex-wrap:wrap; }
        .ab-progress{ height:4px; flex:1; min-width:160px; background:rgba(140,180,225,0.14); border-radius:999px; overflow:hidden; }
        .ab-progress > i{ display:block; height:100%; background:linear-gradient(90deg, var(--ab-blue-deep), var(--ab-blue)); }

        @media (max-width:1200px){ .ab-main{ grid-template-columns:1fr; } .ab-kpis{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:700px){ .ab-kpis{ grid-template-columns:1fr; } .ab-stock-grid{ grid-template-columns:1fr; } .ab-owner{ display:none; } .ab-clockbox{ justify-content:flex-start; } }
        @media (prefers-reduced-motion: reduce){
          .ab-live{ animation:none; }
          .ab-row{ transition:none; }
        }
      `}</style>
      <div style={{ padding: "8px 16px" }}>
        <ModuleGuide
          name="จอ Andon (โรงงาน)"
          summary="หน้าจอแสดงสถานะการผลิต/ซ่อมบำรุงแบบเรียลไทม์สำหรับพื้นที่หน้างาน — เน้นการมองเห็นงานค้าง สถานะเครื่อง และความเร่งด่วน"
          steps={[
            "เปิดจอบนหน้าจอที่กำหนดและปล่อยให้รีเฟรชข้อมูลอัตโนมัติ",
            "ติดตามสัญญาณสถานะ (หยุด/เตือน/พร้อม) และรายการงาน/PM/อะไหล่ที่เกี่ยวข้อง",
            "เข้าสู่โมดูลปฏิบัติงาน (งานซ่อม/PM/สต็อก) เพื่อดำเนินการแก้ไขเมื่อพบปัญหา",
          ]}
          source="ดึงข้อมูลงานซ่อม แผน PM และอะไหล่จาก API ที่หน้านี้เรียก (index/work-orders/pm/spare-parts ตามการตั้งค่า) — แสดงสถานะตามข้อมูลปัจจุบัน"
          note="หน้านี้ออกแบบสำหรับจอแสดงผลหน้างาน สิทธิ์การดูถูกควบคุมตามเมนู; ข้อมูลขึ้นกับการอัปเดตสถานะจากผู้ปฏิบัติงาน"
          related={[
            { href: "/supervisor/queue", label: "คิวงานหัวหน้างาน" },
            { href: "/pm_am/calendar", label: "ปฏิทิน PM/AM" },
            { href: "/spare_parts/issue_center", label: "ศูนย์เบิก-จ่ายอะไหล่" },
          ]}
        />
      </div>

      <div className="ab-wrap">
        {error && <Alert variant="danger" description={error} />}

        <header className="ab-top">
          <div className="ab-brand">
            <span className="ab-brand-lamp">
              <AndonLamp status={overdueCnt > 0 ? "down" : openCnt > 0 ? "warn" : "ok"} size="lg" />
            </span>
            <div>
              <p className="ab-kicker">CMMS-TOPPAN · Smart Factory Andon</p>
              <h1 className="ab-title">จอ Andon TV — <em>สถานะโรงงานเรียลไทม์</em></h1>
            </div>
          </div>
          <div className="ab-clockbox">
            <div>
              <div className="ab-clock">{now ? fmtClock(now) : "--:--:--"}</div>
              <div className="ab-date">{now ? fmtDate(now) : ""}</div>
            </div>
            <div className="ab-side">
              <span className="ab-chip"><i className="ab-live" aria-hidden="true" /> รีเฟรชใน {countdown}s · ล่าสุด {lastSync}</span>
              <Button variant="secondary" onClick={goFullscreen}>
                <Maximize2 size={16} aria-hidden="true" /> เต็มจอ (Smart TV)
              </Button>
            </div>
          </div>
        </header>

        <section className="ab-kpis" aria-label="ตัวชี้วัดงานบำรุงรักษา">
          {kpiCards.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="ab-kpi" style={{ ["--ab-kpi-tone" as any]: toneColor(k.tone) }}>
                <div className="ab-kpi-head">
                  <AndonLamp status={k.tone} size="sm" decorative />
                  <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                  <span>{k.label}</span>
                </div>
                <div className="ab-kpi-val">{k.value}</div>
                <div className="ab-kpi-sub">{k.sub}</div>
              </div>
            );
          })}
        </section>

        <section className="ab-main">
          <div className="ab-col">
            <div className="ab-panel">
              <div className="ab-panel-head">
                <h3><span className="ab-rail" style={{ ["--ab-rail" as any]: "var(--ab-red)" }} aria-hidden="true" /> งานด่วน / เครื่องหยุด / ผู้รับผิดชอบ</h3>
                <span className="ab-count">{urgentRepairs.length} รายการ</span>
              </div>
              {loading ? (
                <div className="ab-empty">กำลังโหลดข้อมูล…</div>
              ) : urgentRepairs.length === 0 ? (
                <div className="ab-empty">
                  <AndonLamp status="ok" size="lg" decorative />
                  <div className="ab-empty-ok" style={{ marginTop: 10 }}>ทุกเครื่องพร้อมใช้งาน ไม่มีงานด่วน</div>
                </div>
              ) : (
                <div className="ab-list">
                  {urgentRepairs.map((r) => {
                    const tone = machineTone(r);
                    const av = avatarSrc(r);
                    return (
                      <div key={r.id} className={`ab-row ${tone === "down" ? "down" : "warn"}`}>
                        <AndonLamp status={tone} size="sm" decorative />
                        <Avatar name={r.assigned_name} src={av} size={46} />
                        <div className="ab-row-body">
                          <div className="ab-row-title">{r.work_order_no || `#${r.id}`} — {r.title || "(ไม่มีหัวข้อ)"}</div>
                          <div className="ab-row-meta">
                            {r.asset_name || "ไม่ระบุเครื่อง"} · ความสำคัญ {priorityLabel(r.priority)} · {andonLabel(tone)}
                          </div>
                        </div>
                        <div className="ab-owner" title={r.assigned_name || "ยังไม่มอบหมาย"}>
                          <Wrench size={14} aria-hidden="true" />
                          <span>{r.assigned_name || "ยังไม่มอบหมาย"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ab-panel">
              <div className="ab-panel-head">
                <h3><span className="ab-rail" style={{ ["--ab-rail" as any]: "var(--ab-amber)" }} aria-hidden="true" /> อะไหล่ต่ำกว่าจุดสั่งซื้อ</h3>
                <span className="ab-count">{lowStock.length} รายการ</span>
              </div>
              {loading ? (
                <div className="ab-empty">กำลังโหลดข้อมูล…</div>
              ) : lowStock.length === 0 ? (
                <div className="ab-empty ab-empty-ok">สต็อกอะไหล่ปกติทั้งหมด</div>
              ) : (
                <div className="ab-stock-grid">
                  {lowStock.map((s) => {
                    const qty = Number(s.stock_qty ?? 0);
                    const isOut = qty === 0;
                    return (
                      <div key={s.id} className={`ab-row ${isOut ? "down" : "warn"}`}>
                        <AndonLamp status={isOut ? "down" : "warn"} size="sm" decorative />
                        <div className="ab-row-body">
                          <div className="ab-row-title">{s.code} — {s.name}</div>
                          <div className="ab-row-meta">
                            คงเหลือ {qty} / ขั้นต่ำ {Number(s.min_stock ?? 0)} · {isOut ? "หมดสต็อก" : "ต่ำกว่าจุดสั่งซื้อ"}{s.location ? ` · ${s.location}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="ab-col">
            <div className="ab-panel">
              <div className="ab-panel-head">
                <h3><span className="ab-rail" style={{ ["--ab-rail" as any]: "var(--ab-amber)" }} aria-hidden="true" /> PM วันนี้ / ค้าง · ผู้รับผิดชอบ</h3>
                <span className="ab-count">{todayPms.length} รายการ</span>
              </div>
              {loading ? (
                <div className="ab-empty">กำลังโหลดข้อมูล…</div>
              ) : todayPms.length === 0 ? (
                <div className="ab-empty ab-empty-ok">ไม่มีแผน PM ค้างวันนี้</div>
              ) : (
                <div className="ab-list">
                  {todayPms.map((p) => {
                    const av = avatarSrc(p);
                    return (
                      <div key={p.id} className="ab-row warn">
                        <AndonLamp status="warn" size="sm" decorative />
                        <Avatar name={p.assigned_name} src={av} size={40} />
                        <div className="ab-row-body">
                          <div className="ab-row-title">{p.title || `PM #${p.id}`}</div>
                          <div className="ab-row-meta">
                            {p.asset_name || "ไม่ระบุเครื่อง"} · กำหนด {String(p.due_date || "—").slice(0, 10)}
                          </div>
                          <div className="ab-row-meta" style={{ color: "var(--ab-text)" }}>
                            ผู้รับผิดชอบ: {p.assigned_name || "ยังไม่มอบหมาย"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="ab-panel">
              <div className="ab-panel-head">
                <h3><span className="ab-rail" style={{ ["--ab-rail" as any]: "var(--ab-blue)" }} aria-hidden="true" /> สถานะงานทั้งหมด</h3>
              </div>
              {loading ? (
                <div className="ab-empty">กำลังโหลดข้อมูล…</div>
              ) : !dist.length ? (
                <div className="ab-empty">ยังไม่มีข้อมูลงานซ่อม</div>
              ) : (
                <div className="ab-dist">
                  {dist.map((s: any) => {
                    const v = String(s.status || "").toLowerCase();
                    const tone: "ok" | "warn" | "down" | "idle" =
                      ["resolved", "closed", "completed"].includes(v) ? "ok"
                      : ["overdue", "rejected"].includes(v) ? "down"
                      : v ? "warn" : "idle";
                    const cnt = Number(s.cnt ?? 0);
                    return (
                      <div key={s.status} className="ab-dist-row">
                        <span className="ab-dist-label">{s.status}</span>
                        <span className="ab-dist-track" aria-hidden="true">
                          <i className="ab-dist-fill" style={{ width: `${Math.max(3, (cnt / distMax) * 100)}%`, ["--ab-dist-tone" as any]: toneColor(tone) }} />
                        </span>
                        <span className="ab-dist-cnt">{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="ab-footer">
          <span>อัปเดตอัตโนมัติทุก {refreshSec} วินาที · ตั้งค่าได้ที่ ระบบ &amp; ตั้งค่า → “จอ Andon TV — รีเฟรชอัตโนมัติ”</span>
          <div
            className="ab-progress"
            role="progressbar"
            aria-label="นับถอยหลังรีเฟรช"
            aria-valuemin={0}
            aria-valuemax={refreshSec}
            aria-valuenow={countdown}
            aria-valuetext={`เหลือ ${countdown} วินาที`}
          >
            <i style={{ width: `${Math.max(0, Math.min(100, (countdown / Math.max(1, refreshSec)) * 100))}%` }} />
          </div>
          <span>TOPPAN Andon Live Board</span>
        </footer>
      </div>
    </div>
  );
}
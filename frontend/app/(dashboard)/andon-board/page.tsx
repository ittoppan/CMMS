"use client";

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
      className="andon-avatar"
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg, rgba(56,189,248,0.35), rgba(168,85,247,0.35))",
        border: "2px solid rgba(125,211,252,0.5)",
        boxShadow: "0 0 18px rgba(56,189,248,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", fontWeight: 700, color: "#e0f2fe", fontSize: size * 0.36,
      }}
      title={name || "ยังไม่มอบหมาย"}
    >
      {showImg ? (
        <img src={src} alt={name || "ผู้รับผิดชอบ"} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}

export default function AndonBoardPage() {
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
        fetch("/api/v1/spare_parts.php"),
        fetch("/api/v1/kpi_dashboard.php"),
      ]);
      const [repairJson, pmJson, spareJson, kpiJson] = await Promise.all([
        repairRes.json(), pmRes.json(), spareRes.json(), kpiRes.json(),
      ]);
      if (Array.isArray(repairJson)) setRepairs(repairJson);
      if (Array.isArray(pmJson)) setPms(pmJson);
      if (Array.isArray(spareJson)) setSpares(spareJson);
      if (kpiJson && !Array.isArray(kpiJson)) setKpi(kpiJson);
      setLastSync(fmtClock(new Date()));
      setCountdown(refreshSec);
      setError("");
    } catch (e) {
      console.error("Andon board load failed:", e);
      setError("โหลดข้อมูลไม่สำเร็จ — กำลังลองใหม่...");
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
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#020617", color: "#e2e8f0" }}>
        <div style={{ textAlign: "center" }}>
          <AndonLamp status="idle" size="lg" />
          <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 700 }}>ไม่มีสิทธิ์ดูจอ Andon</h2>
          <p style={{ color: "#94a3b8" }}>ติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์เมนู “จอ Andon TV (โรงงาน)”</p>
        </div>
      </div>
    );
  }

  const toneGlow = (t: "ok" | "warn" | "down") =>
    t === "down" ? "rgba(239,68,68,0.55)" : t === "warn" ? "rgba(245,158,11,0.45)" : "rgba(34,197,94,0.45)";
  const toneBorder = (t: "ok" | "warn" | "down") =>
    t === "down" ? "rgba(239,68,68,0.5)" : t === "warn" ? "rgba(245,158,11,0.45)" : "rgba(34,197,94,0.4)";

  return (
    <div className="andon-root">
      <style>{`
        .andon-root{
          --a-bg:#020617; --a-panel:rgba(15,23,42,0.72); --a-border:rgba(148,163,184,0.18);
          --a-cyan:#22d3ee; --a-blue:#38bdf8; --a-violet:#a78bfa; --a-green:#34d399; --a-amber:#fbbf24; --a-red:#f87171;
          min-height:100vh; color:#e5e7eb; position:relative; overflow:hidden;
          background:
            radial-gradient(1200px 600px at 10% -10%, rgba(56,189,248,0.18), transparent 60%),
            radial-gradient(900px 500px at 110% 10%, rgba(167,139,250,0.16), transparent 55%),
            radial-gradient(700px 400px at 50% 120%, rgba(34,211,238,0.12), transparent 60%),
            linear-gradient(180deg,#020617 0%,#030712 50%,#020617 100%);
          font-family: 'Sarabun', ui-sans-serif, system-ui, sans-serif;
        }
        .andon-grid{
          position:absolute; inset:-20% -10% -30% -10%; pointer-events:none; opacity:.35;
          background-image:
            linear-gradient(rgba(56,189,248,0.12) 1px, transparent 1px),
            linear-gradient(90deg, rgba(56,189,248,0.12) 1px, transparent 1px);
          background-size: 64px 64px;
          transform: perspective(900px) rotateX(62deg) translateY(10%);
          transform-origin: center top;
          animation: andonGridMove 18s linear infinite;
          mask-image: linear-gradient(to bottom, transparent 0%, #000 25%, #000 70%, transparent 100%);
        }
        @keyframes andonGridMove{ from{ background-position: 0 0, 0 0; } to{ background-position: 0 256px, 256px 0; } }
        .andon-orb{ position:absolute; border-radius:50%; filter: blur(40px); opacity:.35; pointer-events:none; animation: andonFloat 12s ease-in-out infinite; }
        .andon-orb.a{ width:420px;height:420px; left:-120px; top:10%; background:rgba(56,189,248,.35); }
        .andon-orb.b{ width:360px;height:360px; right:-100px; top:30%; background:rgba(167,139,250,.28); animation-delay:-4s; }
        .andon-orb.c{ width:300px;height:300px; left:40%; bottom:-120px; background:rgba(34,211,238,.22); animation-delay:-7s; }
        @keyframes andonFloat{ 0%,100%{ transform: translate3d(0,0,0) scale(1);} 50%{ transform: translate3d(20px,-30px,0) scale(1.06);} }
        .andon-wrap{ position:relative; z-index:1; padding: clamp(14px,2vw,28px); display:flex; flex-direction:column; gap: clamp(12px,1.6vw,22px); }
        .andon-top{ display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .andon-brand{ display:flex; align-items:center; gap:16px; }
        .andon-core{ width:58px; height:58px; position:relative; transform-style:preserve-3d; perspective:600px; }
        .andon-ring{ position:absolute; inset:0; border-radius:50%; border:2px solid rgba(34,211,238,.7); box-shadow:0 0 18px rgba(34,211,238,.45), inset 0 0 18px rgba(34,211,238,.25); }
        .andon-ring.r1{ transform: rotateX(68deg) rotateZ(0deg); animation: spin3d 8s linear infinite; }
        .andon-ring.r2{ inset:7px; border-color:rgba(167,139,250,.7); box-shadow:0 0 16px rgba(167,139,250,.4), inset 0 0 14px rgba(167,139,250,.2); transform: rotateY(68deg) rotateZ(0deg); animation: spin3dRev 6s linear infinite; }
        .andon-ring.r3{ inset:14px; border-color:rgba(52,211,153,.7); box-shadow:0 0 14px rgba(52,211,153,.35), inset 0 0 10px rgba(52,211,153,.18); transform: rotateX(58deg) rotateY(35deg); animation: spin3d 10s linear infinite; }
        .andon-core-dot{ position:absolute; inset:22px; border-radius:50%; background:radial-gradient(circle at 30% 30%, #fff, #22d3ee 45%, #0ea5e9 70%, #0b1020 100%); box-shadow:0 0 22px rgba(34,211,238,.8); animation:pulseDot 2.4s ease-in-out infinite; }
        @keyframes spin3d{ from{ transform: rotateX(68deg) rotateZ(0deg);} to{ transform: rotateX(68deg) rotateZ(360deg);} }
        @keyframes spin3dRev{ from{ transform: rotateY(68deg) rotateZ(360deg);} to{ transform: rotateY(68deg) rotateZ(0deg);} }
        @keyframes pulseDot{ 0%,100%{ transform:scale(1); filter:brightness(1);} 50%{ transform:scale(1.12); filter:brightness(1.25);} }
        .andon-title{ font-size: clamp(1.4rem,2.6vw,2.4rem); font-weight:800; letter-spacing:.04em; margin:0; line-height:1.1; background:linear-gradient(90deg,#e0f2fe,#7dd3fc,#c4b5fd,#e0f2fe); -webkit-background-clip:text; background-clip:text; color:transparent; }
        .andon-sub{ margin:2px 0 0; color:#94a3b8; font-size: clamp(.78rem,1vw,1rem); letter-spacing:.08em; text-transform:uppercase; }
        .andon-clockbox{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:flex-end; }
        .andon-clock{ font-variant-numeric: tabular-nums; font-size: clamp(1.6rem,3vw,2.8rem); font-weight:800; letter-spacing:.06em; padding:8px 18px; border-radius:14px; color:#e0f2fe;
          background: linear-gradient(180deg, rgba(15,23,42,.9), rgba(2,6,23,.7));
          border:1px solid rgba(56,189,248,.35); box-shadow:0 0 0 1px rgba(56,189,248,.08) inset, 0 0 28px rgba(56,189,248,.18); }
        .andon-date{ color:#94a3b8; font-size: clamp(.78rem,1vw,.95rem); text-align:right; }
        .andon-chip{ display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:rgba(15,23,42,.7); border:1px solid var(--a-border); color:#cbd5e1; font-size:.85rem; }
        .andon-kpis{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: clamp(10px,1.2vw,16px); }
        .andon-kpi{ position:relative; padding: clamp(14px,1.4vw,20px); border-radius:18px; background: var(--a-panel); border:1px solid var(--a-border);
          backdrop-filter: blur(10px); overflow:hidden; transition: transform .25s ease, box-shadow .25s ease; }
        .andon-kpi::before{ content:""; position:absolute; inset:-1px; border-radius:18px; padding:1px; background:linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,0) 40%, rgba(255,255,255,.12)); -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite:xor; mask-composite:exclude; pointer-events:none; }
        .andon-kpi:hover{ transform: translateY(-3px); }
        .andon-kpi .row{ display:flex; align-items:center; gap:10px; color:#94a3b8; font-weight:700; font-size: clamp(.8rem,1vw,.95rem); letter-spacing:.04em; }
        .andon-kpi .val{ font-size: clamp(2.2rem,4.2vw,3.6rem); font-weight:800; line-height:1; margin:6px 0 2px; color:#f8fafc; }
        .andon-kpi .sub{ color:#94a3b8; font-size: clamp(.75rem,.9vw,.9rem); }
        .andon-main{ display:grid; grid-template-columns: 1.6fr 1fr; gap: clamp(10px,1.2vw,16px); }
        .andon-col{ display:flex; flex-direction:column; gap: clamp(10px,1.2vw,16px); }
        .andon-panel{ position:relative; border-radius:18px; background: var(--a-panel); border:1px solid var(--a-border); padding: clamp(14px,1.4vw,20px); backdrop-filter: blur(10px); overflow:hidden; }
        .andon-panel h3{ margin:0; font-size: clamp(1rem,1.3vw,1.25rem); font-weight:800; color:#f1f5f9; display:flex; align-items:center; gap:10px; }
        .andon-panel-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; }
        .andon-count{ color:#94a3b8; font-size:.9rem; }
        .andon-list{ display:flex; flex-direction:column; gap:10px; }
        .andon-item{ display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:14px; background: rgba(2,6,23,.45); border:1px solid rgba(148,163,184,.14); }
        .andon-item.down{ background: linear-gradient(90deg, rgba(127,29,29,.35), rgba(2,6,23,.35)); border-color: rgba(248,113,113,.35); }
        .andon-item.warn{ background: linear-gradient(90deg, rgba(120,53,15,.28), rgba(2,6,23,.35)); border-color: rgba(251,191,36,.28); }
        .andon-item-body{ flex:1; min-width:0; }
        .andon-item-title{ font-weight:700; font-size: clamp(.9rem,1.05vw,1.05rem); color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .andon-item-meta{ font-size: clamp(.75rem,.9vw,.9rem); color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .andon-owner{ display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; background:rgba(15,23,42,.7); border:1px solid rgba(148,163,184,.18); color:#e2e8f0; font-size:.82rem; max-width: 240px; }
        .andon-owner span{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .andon-empty{ text-align:center; padding:22px 10px; color:#94a3b8; }
        .andon-stock-grid{ display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
        .andon-footer{ display:flex; align-items:center; justify-content:space-between; gap:10px; color:#64748b; font-size:.85rem; flex-wrap:wrap; }
        .andon-progress{ height:4px; flex:1; min-width:160px; background:rgba(148,163,184,.15); border-radius:999px; overflow:hidden; }
        .andon-progress > i{ display:block; height:100%; background:linear-gradient(90deg,var(--a-cyan),var(--a-violet)); box-shadow:0 0 12px rgba(34,211,238,.6); }
        @media (max-width: 1200px){ .andon-main{ grid-template-columns: 1fr; } .andon-kpis{ grid-template-columns: repeat(2,minmax(0,1fr)); } }
        @media (max-width: 700px){ .andon-kpis{ grid-template-columns: 1fr; } .andon-stock-grid{ grid-template-columns: 1fr; } .andon-owner{ display:none; } }
      `}</style>

      <div className="andon-grid" aria-hidden="true" />
      <div className="andon-orb a" aria-hidden="true" />
      <div className="andon-orb b" aria-hidden="true" />
      <div className="andon-orb c" aria-hidden="true" />

      <div className="andon-wrap">
        {error && <Alert variant="danger" description={error} />}

        <header className="andon-top">
          <div className="andon-brand">
            <div className="andon-core" aria-hidden="true">
              <span className="andon-ring r1" />
              <span className="andon-ring r2" />
              <span className="andon-ring r3" />
              <span className="andon-core-dot" />
            </div>
            <div>
              <p className="andon-sub">CMMS-TOPPAN · SMART FACTORY ANDON BOARD</p>
              <h1 className="andon-title">จอ Andon TV — สถานะโรงงานเรียลไทม์</h1>
            </div>
          </div>
          <div className="andon-clockbox">
            <div>
              <div className="andon-clock">{now ? fmtClock(now) : "--:--:--"}</div>
              <div className="andon-date">{now ? fmtDate(now) : ""}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <span className="andon-chip"><RefreshCw size={14} /> รีเฟรชใน {countdown}s · ล่าสุด {lastSync}</span>
              <Button variant="secondary" onClick={goFullscreen} aria-label="เต็มจอ">
                <Maximize2 size={16} /> เต็มจอ (Smart TV)
              </Button>
            </div>
          </div>
        </header>

        <section className="andon-kpis">
          {kpiCards.map((k) => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="andon-kpi" style={{ boxShadow: `0 0 0 1px ${toneBorder(k.tone)} inset, 0 18px 40px -24px ${toneGlow(k.tone)}` }}>
                <div className="row">
                  <AndonLamp status={k.tone} size="sm" />
                  <Icon size={16} strokeWidth={1.75} />
                  <span>{k.label}</span>
                </div>
                <div className="val">{k.value}</div>
                <div className="sub">{k.sub}</div>
              </div>
            );
          })}
        </section>

        <section className="andon-main">
          <div className="andon-col">
            <div className="andon-panel">
              <div className="andon-panel-head">
                <h3><span className="cmms-status-dot down" style={{ display: "inline-block" }} /> งานด่วน / เครื่องหยุด / ผู้รับผิดชอบ</h3>
                <span className="andon-count">{urgentRepairs.length} รายการ</span>
              </div>
              {loading ? (
                <div className="andon-empty">กำลังโหลดข้อมูล...</div>
              ) : urgentRepairs.length === 0 ? (
                <div className="andon-empty">
                  <AndonLamp status="ok" size="lg" />
                  <div style={{ marginTop: 10, color: "#86efac", fontWeight: 700 }}>ทุกเครื่องพร้อมใช้งาน ไม่มีงานด่วน</div>
                </div>
              ) : (
                <div className="andon-list">
                  {urgentRepairs.map((r) => {
                    const tone = machineTone(r);
                    const av = avatarSrc(r);
                    return (
                      <div key={r.id} className={`andon-item ${tone === "down" ? "down" : "warn"}`}>
                        <AndonLamp status={tone} size="sm" />
                        <Avatar name={r.assigned_name} src={av} size={46} />
                        <div className="andon-item-body">
                          <div className="andon-item-title">{r.work_order_no || `#${r.id}`} — {r.title || "(ไม่มีหัวข้อ)"}</div>
                          <div className="andon-item-meta">
                            {r.asset_name || "ไม่ระบุเครื่อง"} · ความสำคัญ {priorityLabel(r.priority)} · {andonLabel(tone)}
                          </div>
                        </div>
                        <div className="andon-owner" title={r.assigned_name || "ยังไม่มอบหมาย"}>
                          <Wrench size={14} />
                          <span>{r.assigned_name || "ยังไม่มอบหมาย"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="andon-panel">
              <div className="andon-panel-head">
                <h3><span className="cmms-status-dot warn" style={{ display: "inline-block" }} /> อะไหล่ต่ำกว่าจุดสั่งซื้อ</h3>
                <span className="andon-count">{lowStock.length} รายการ</span>
              </div>
              {loading ? (
                <div className="andon-empty">กำลังโหลดข้อมูล...</div>
              ) : lowStock.length === 0 ? (
                <div className="andon-empty" style={{ color: "#86efac" }}>สต็อกอะไหล่ปกติทั้งหมด</div>
              ) : (
                <div className="andon-stock-grid">
                  {lowStock.map((s) => (
                    <div key={s.id} className={`andon-item ${Number(s.stock_qty ?? 0) === 0 ? "down" : "warn"}`}>
                      <AndonLamp status={Number(s.stock_qty ?? 0) === 0 ? "down" : "warn"} size="sm" />
                      <div className="andon-item-body">
                        <div className="andon-item-title">{s.code} — {s.name}</div>
                        <div className="andon-item-meta">
                          คงเหลือ {Number(s.stock_qty ?? 0)} / ขั้นต่ำ {Number(s.min_stock ?? 0)}{s.location ? ` · ${s.location}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="andon-col">
            <div className="andon-panel">
              <div className="andon-panel-head">
                <h3><span className="cmms-status-dot warn" style={{ display: "inline-block" }} /> PM วันนี้ / ค้าง · ผู้รับผิดชอบ</h3>
                <span className="andon-count">{todayPms.length} รายการ</span>
              </div>
              {loading ? (
                <div className="andon-empty">กำลังโหลดข้อมูล...</div>
              ) : todayPms.length === 0 ? (
                <div className="andon-empty" style={{ color: "#86efac" }}>ไม่มีแผน PM ค้างวันนี้</div>
              ) : (
                <div className="andon-list">
                  {todayPms.map((p) => {
                    const av = avatarSrc(p);
                    return (
                      <div key={p.id} className="andon-item warn">
                        <AndonLamp status="warn" size="sm" />
                        <Avatar name={p.assigned_name} src={av} size={40} />
                        <div className="andon-item-body">
                          <div className="andon-item-title">{p.title || `PM #${p.id}`}</div>
                          <div className="andon-item-meta">
                            {p.asset_name || "ไม่ระบุเครื่อง"} · กำหนด {String(p.due_date || "—").slice(0, 10)}
                          </div>
                          <div className="andon-item-meta" style={{ color: "#bae6fd" }}>
                            ผู้รับผิดชอบ: {p.assigned_name || "ยังไม่มอบหมาย"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="andon-panel">
              <div className="andon-panel-head">
                <h3><span className="cmms-status-dot ok" style={{ display: "inline-block" }} /> สถานะงานทั้งหมด</h3>
              </div>
              {loading ? (
                <div className="andon-empty">กำลังโหลดข้อมูล...</div>
              ) : !kpi?.status_dist?.length ? (
                <div className="andon-empty">ยังไม่มีข้อมูลงานซ่อม</div>
              ) : (
                <div className="andon-list">
                  {kpi.status_dist.map((s: any) => {
                    const v = String(s.status || "").toLowerCase();
                    const tone: "ok" | "warn" | "down" | "idle" =
                      ["resolved", "closed", "completed"].includes(v) ? "ok"
                      : ["overdue", "rejected"].includes(v) ? "down"
                      : v ? "warn" : "idle";
                    return (
                      <div key={s.status} className="andon-item">
                        <AndonLamp status={tone} size="sm" />
                        <div className="andon-item-body">
                          <div className="andon-item-title" style={{ textTransform: "capitalize" }}>{s.status}</div>
                        </div>
                        <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f8fafc", fontVariantNumeric: "tabular-nums" }}>{s.cnt}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="andon-footer">
          <span>อัปเดตอัตโนมัติทุก {refreshSec} วินาที · ตั้งค่าได้ที่ ระบบ &amp; ตั้งค่า → “จอ Andon TV — รีเฟรชอัตโนมัติ”</span>
          <div className="andon-progress" aria-label="นับถอยหลังรีเฟรช">
            <i style={{ width: `${Math.max(0, Math.min(100, (countdown / Math.max(1, refreshSec)) * 100))}%` }} />
          </div>
          <span>Andon 3D Live Board</span>
        </footer>
      </div>
    </div>
  );
}

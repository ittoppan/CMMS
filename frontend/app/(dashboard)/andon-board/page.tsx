"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { VStack, HStack } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { RefreshCw, Maximize2 } from "lucide-react";
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
}

interface PmRow {
  id: number;
  title?: string;
  asset_name?: string;
  due_date?: string | null;
  status?: string;
  assigned_name?: string;
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

function fmtTime(d: Date) {
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
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
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      setLastSync(fmtTime(new Date()));
      setError("");
    } catch (e) {
      console.error("Andon board load failed:", e);
      setError("โหลดข้อมูลไม่สำเร็จ — กำลังลองใหม่...");
    }
    setLoading(false);
  };

  useEffect(() => {
    // อ่านความถี่รีเฟรชจาก settings (andon_refresh_sec)
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
      .catch(() => { /* ใช้ค่า default 30 */ });

    load();
    timerRef.current = setInterval(load, refreshSec * 1000);
    countdownRef.current = setInterval(() => {
      setNow(new Date());
      setCountdown((c) => (c <= 1 ? refreshSec : c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // หยุด/เริ่มอัตโนมัติเมื่อ tab ซ่อน (ประหยัดทรัพยากรจอโรงงาน)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && timerRef.current) clearInterval(timerRef.current);
      if (!document.hidden && !timerRef.current) timerRef.current = setInterval(load, refreshSec * 1000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSec]);

  const urgentRepairs = useMemo(
    () =>
      repairs
        .filter((r) => machineTone(r) !== "ok" && machineTone(r) !== "idle")
        .sort((a, b) => (String(b.priority || "").localeCompare(String(a.priority || ""))))
        .slice(0, 12),
    [repairs]
  );

  const todayPms = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return pms
      .filter((p) => {
        if (String(p.status || "").toLowerCase() === "completed") return false;
        if (!p.due_date) return true; // ยังไม่กำหนด = ค้าง
        const d = new Date(String(p.due_date).slice(0, 10) + "T00:00:00");
        return d <= today; // กำหนดวันนี้หรือเลยมาแล้ว
      })
      .sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")))
      .slice(0, 12);
  }, [pms]);

  const lowStock = useMemo(
    () =>
      spares
        .filter((s) => Number(s.stock_qty ?? 0) <= Number(s.min_stock ?? 0))
        .sort((a, b) => Number(a.stock_qty ?? 0) - Number(b.stock_qty ?? 0))
        .slice(0, 12),
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

  const kpiCards: { label: string; value: number; tone: "ok" | "warn" | "down"; sub: string }[] = [
    { label: "งานค้างดำเนินการ", value: openCnt, tone: openCnt > 0 ? "warn" : "ok", sub: "ใบที่ยังไม่ปิด" },
    { label: "เกินกำหนด", value: overdueCnt, tone: overdueCnt > 0 ? "down" : "ok", sub: "เลยกำหนดเสร็จ" },
    { label: "เสร็จวันนี้", value: closedToday, tone: "ok", sub: "ปิดงานวันนี้" },
    { label: "อะไหล่ต่ำสต็อก", value: lowStock.length, tone: lowStock.length > 0 ? "warn" : "ok", sub: "ต่ำกว่าจุดสั่งซื้อ" },
  ];

  const goFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (!canShow("andon-board")) {
    return (
      <Card className="mx-auto max-w-[560px] p-8 text-center">
        <VStack gap={3} hAlign="center">
          <AndonLamp status="idle" size="lg" />
          <h2 className="text-base font-semibold text-foreground">ไม่มีสิทธิ์ดูจอ Andon</h2>
          <p className="text-sm text-muted-foreground">ติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์เมนู “จอ Andon TV (โรงงาน)”</p>
        </VStack>
      </Card>
    );
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "Andon Board", href: "/andon-board" },
        { label: "จอ Andon TV (โรงงาน)" },
      ]}
      title="จอ Andon TV (โรงงาน)"
      actions={
        <HStack gap={2} vAlign="center" wrap="wrap">
          <div
            style={{
              fontFamily: "var(--cmms-font-display, 'Barlow Condensed', sans-serif)",
              fontSize: "1.5rem", fontWeight: 700, color: "var(--cmms-text-primary)",
              padding: "4px 14px", borderRadius: 8, background: "var(--cmms-bg-wash)",
              letterSpacing: "0.04em",
            }}
          >
            {now ? now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "--:--:--"}
          </div>
          <Badge variant="neutral" className="gap-1.5 px-3 py-1">
            <RefreshCw size={12} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช {countdown}s · ล่าสุด {lastSync}
          </Badge>
          <Button variant="secondary" onClick={goFullscreen} aria-label="เต็มจอ">
            <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />
            เต็มจอ
          </Button>
        </HStack>
      }
    >
      {error && <Alert variant="danger" description={error} />}

      {/* ── KPI ไฟ Andon ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <Card key={k.label} className="flex flex-col gap-1.5 p-5">
            <div className="flex items-center gap-2.5">
              <AndonLamp status={k.tone} size="sm" />
              <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {k.label}
              </span>
            </div>
            <div className="cmms-display tabular-nums" style={{ fontSize: "2.6rem", lineHeight: 1, color: "var(--cmms-text-primary)" }}>
              {k.value}
            </div>
            <span className="text-xs text-muted-foreground">{k.sub}</span>
          </Card>
        ))}
      </div>

      {/* ── เนื้อหาหลัก ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* งานด่วน / เครื่องหยุด */}
        <div className="lg:col-span-2">
          <Card className="h-full p-5">
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <span className="cmms-status-dot down" style={{ display: "inline-block" }} />
                  งานด่วน / เครื่องหยุด
                </h3>
                <span className="text-sm text-muted-foreground">{urgentRepairs.length} รายการ</span>
              </HStack>
              {urgentRepairs.length === 0 ? (
                <div className="py-8 text-center text-[var(--cmms-text-muted)]">
                  <AndonLamp status="ok" size="lg" />
                  <span className="mt-2.5 block text-sm">ไม่มีงานด่วน — ทุกเครื่องทำงานปกติ</span>
                </div>
              ) : (
                <VStack gap={2}>
                  {urgentRepairs.map((r) => {
                    const tone = machineTone(r);
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 14px", borderRadius: 10,
                          background: tone === "down" ? "var(--cmms-danger-light, #FEE2E2)" : "var(--cmms-warning-light, #FEF3C7)",
                          border: "1px solid transparent",
                        }}
                      >
                        <AndonLamp status={tone} size="sm" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--cmms-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {r.work_order_no || `#${r.id}`} — {r.title || "(ไม่มีหัวข้อ)"}
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "var(--cmms-text-secondary)" }}>
                            {r.asset_name || "ไม่ระบุเครื่อง"} · {priorityLabel(r.priority)} · {andonLabel(tone)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </VStack>
              )}
            </VStack>
          </Card>
        </div>

        {/* PM วันนี้ */}
        <Card className="h-full p-5">
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="center">
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <span className="cmms-status-dot warn" style={{ display: "inline-block" }} />
                PM วันนี้ / ค้าง
              </h3>
              <span className="text-sm text-muted-foreground">{todayPms.length} รายการ</span>
            </HStack>
            {todayPms.length === 0 ? (
              <span className="py-5 text-center text-sm text-muted-foreground">
                ไม่มีแผน PM ค้างวันนี้
              </span>
            ) : (
              <VStack gap={2}>
                {todayPms.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "var(--cmms-bg-wash)" }}>
                    <AndonLamp status="warn" size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--cmms-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.title || `PM #${p.id}`}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cmms-text-secondary)" }}>
                        {p.asset_name || "ไม่ระบุเครื่อง"} · กำหนด {String(p.due_date || "—").slice(0, 10)}
                      </div>
                    </div>
                  </div>
                ))}
              </VStack>
            )}
          </VStack>
        </Card>

        {/* อะไหล่ต่ำสต็อก */}
        <div className="lg:col-span-2">
          <Card className="p-5">
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <span className="cmms-status-dot warn" style={{ display: "inline-block" }} />
                  อะไหล่ต่ำกว่าจุดสั่งซื้อ
                </h3>
                <span className="text-sm text-muted-foreground">{lowStock.length} รายการ</span>
              </HStack>
              {lowStock.length === 0 ? (
                <span className="py-5 text-center text-sm text-muted-foreground">
                  สต็อกอะไหล่ปกติทั้งหมด
                </span>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {lowStock.map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "var(--cmms-bg-wash)" }}>
                      <AndonLamp status={Number(s.stock_qty ?? 0) === 0 ? "down" : "warn"} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--cmms-text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {s.code} — {s.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cmms-text-secondary)" }}>
                          คงเหลือ {Number(s.stock_qty ?? 0)} / ขั้นต่ำ {Number(s.min_stock ?? 0)}{s.location ? ` · ${s.location}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </VStack>
          </Card>
        </div>

        {/* สถานะงานรวม */}
        <Card className="p-5">
          <VStack gap={4}>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <span className="cmms-status-dot ok" style={{ display: "inline-block" }} />
              สถานะงานทั้งหมด
            </h3>
            {!kpi?.status_dist?.length ? (
              <span className="text-sm text-muted-foreground">ยังไม่มีข้อมูลงานซ่อม</span>
            ) : (
              <VStack gap={2}>
                {kpi.status_dist.map((s: any) => {
                  const v = String(s.status || "").toLowerCase();
                  const tone: "ok" | "warn" | "down" | "idle" =
                    ["resolved", "closed", "completed"].includes(v) ? "ok"
                    : ["overdue", "rejected"].includes(v) ? "down"
                    : v ? "warn" : "idle";
                  return (
                    <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, background: "var(--cmms-bg-wash)" }}>
                      <AndonLamp status={tone} size="sm" />
                      <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 600, color: "var(--cmms-text-primary)" }}>
                        {s.status}
                      </span>
                      <span className="cmms-display tabular-nums" style={{ fontSize: "1.3rem", color: "var(--cmms-text-primary)" }}>{s.cnt}</span>
                    </div>
                  );
                })}
              </VStack>
            )}
          </VStack>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        อัปเดตอัตโนมัติทุก {refreshSec} วินาที · ตั้งค่าได้ที่ ระบบ & ตั้งค่า → “จอ Andon TV — รีเฟรชอัตโนมัติ”
      </p>
    </PageShell>
  );
}

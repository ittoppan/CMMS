"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { ArrowPathIcon, ArrowsPointingOutIcon } from "@heroicons/react/24/outline";
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
      <Card padding={8} style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <VStack gap={3} hAlign="center">
          <AndonLamp status="idle" size="lg" />
          <Heading level={3}>ไม่มีสิทธิ์ดูจอ Andon</Heading>
          <Text type="body" color="secondary">ติดต่อผู้ดูแลระบบเพื่อเปิดสิทธิ์เมนู “จอ Andon TV (โรงงาน)”</Text>
        </VStack>
      </Card>
    );
  }

  return (
    <VStack gap={5}>
      {/* ── Header ── */}
      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow">ANDON BOARD · CMMS-TOPPAN</Text>
          <Heading level={2}>จอ Andon TV (โรงงาน)</Heading>
        </VStack>
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
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 12px", borderRadius: 8, background: "var(--cmms-bg-wash)",
              fontSize: "0.78rem", fontWeight: 600, color: "var(--cmms-text-secondary)",
            }}
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
            รีเฟรช {countdown}s · ล่าสุด {lastSync}
          </div>
          <Button label="เต็มจอ" variant="secondary" icon={<Icon icon={ArrowsPointingOutIcon} size="sm" />} onClick={goFullscreen} />
        </HStack>
      </HStack>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--cmms-danger-light)", color: "var(--cmms-danger)", fontSize: "0.85rem", fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ── KPI ไฟ Andon ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            style={{
              background: "#FFFFFF", border: "1px solid var(--cmms-border)", borderRadius: 14,
              padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AndonLamp status={k.tone} size="sm" />
              <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cmms-text-muted)" }}>
                {k.label}
              </span>
            </div>
            <div className="cmms-display" style={{ fontSize: "2.6rem", lineHeight: 1, color: "var(--cmms-text-primary)" }}>
              {k.value}
            </div>
            <span style={{ fontSize: "0.74rem", color: "var(--cmms-text-secondary)" }}>{k.sub}</span>
          </div>
        ))}
      </div>

      {/* ── เนื้อหาหลัก ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* งานด่วน / เครื่องหยุด */}
        <div className="lg:col-span-2">
          <Card padding={5} style={{ height: "100%" }}>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <Heading level={4} className="flex items-center gap-2">
                  <span className="cmms-status-dot down" style={{ display: "inline-block" }} />
                  งานด่วน / เครื่องหยุด
                </Heading>
                <Text type="body" size="sm" color="secondary">{urgentRepairs.length} รายการ</Text>
              </HStack>
              {urgentRepairs.length === 0 ? (
                <div style={{ padding: "32px 0", textAlign: "center", color: "var(--cmms-text-muted)" }}>
                  <AndonLamp status="ok" size="lg" />
                  <Text type="body" size="sm" style={{ marginTop: 10, display: "block" }}>ไม่มีงานด่วน — ทุกเครื่องทำงานปกติ</Text>
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
        <Card padding={5} style={{ height: "100%" }}>
          <VStack gap={4}>
            <HStack hAlign="between" vAlign="center">
              <Heading level={4} className="flex items-center gap-2">
                <span className="cmms-status-dot warn" style={{ display: "inline-block" }} />
                PM วันนี้ / ค้าง
              </Heading>
              <Text type="body" size="sm" color="secondary">{todayPms.length} รายการ</Text>
            </HStack>
            {todayPms.length === 0 ? (
              <Text type="body" size="sm" color="secondary" style={{ padding: "20px 0", textAlign: "center" }}>
                ไม่มีแผน PM ค้างวันนี้
              </Text>
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
          <Card padding={5}>
            <VStack gap={4}>
              <HStack hAlign="between" vAlign="center">
                <Heading level={4} className="flex items-center gap-2">
                  <span className="cmms-status-dot warn" style={{ display: "inline-block" }} />
                  อะไหล่ต่ำกว่าจุดสั่งซื้อ
                </Heading>
                <Text type="body" size="sm" color="secondary">{lowStock.length} รายการ</Text>
              </HStack>
              {lowStock.length === 0 ? (
                <Text type="body" size="sm" color="secondary" style={{ padding: "20px 0", textAlign: "center" }}>
                  สต็อกอะไหล่ปกติทั้งหมด
                </Text>
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
        <Card padding={5}>
          <VStack gap={4}>
            <Heading level={4} className="flex items-center gap-2">
              <span className="cmms-status-dot ok" style={{ display: "inline-block" }} />
              สถานะงานทั้งหมด
            </Heading>
            {!kpi?.status_dist?.length ? (
              <Text type="body" size="sm" color="secondary">ยังไม่มีข้อมูลงานซ่อม</Text>
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
                      <span className="cmms-display" style={{ fontSize: "1.3rem", color: "var(--cmms-text-primary)" }}>{s.cnt}</span>
                    </div>
                  );
                })}
              </VStack>
            )}
          </VStack>
        </Card>
      </div>

      <Text type="body" size="sm" color="secondary">
        อัปเดตอัตโนมัติทุก {refreshSec} วินาที · ตั้งค่าได้ที่ ระบบ & ตั้งค่า → “จอ Andon TV — รีเฟรชอัตโนมัติ”
      </Text>
    </VStack>
  );
}

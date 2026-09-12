"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useMenuPermission } from "@/lib/useMenuPermission";
import AndonLamp from "@/components/AndonLamp";
import {
  Plus,
  Search,
  CalendarDays,
  ClipboardList,
  Users,
  Wrench,
  Eye,
  SquarePen,
  CheckCircle2,
  PauseCircle,
  Layers,
} from "lucide-react";

interface PMPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  plan_type: string;
  frequency_type: string;
  frequency_interval: number;
  meter_unit: string | null;
  meter_interval: number | null;
  lead_days: number;
  reminder_days: number;
  is_active: number;
  status: string;
  priority: string;
  estimated_duration_minutes: number | null;
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  responsible_name: string | null;
  asset_count: number;
  template_count: number;
  next_due: string | null;
  last_completed_at: string | null;
  cycle_count: number;
}

const freqLabels: Record<string, string> = {
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  quarterly: "รายไตรมาส",
  semi_annual: "ทุก 6 เดือน",
  yearly: "รายปี",
  custom: "กำหนดเอง",
  meter_based: "ตามมิเตอร์",
};

const planTypeLabels: Record<string, string> = {
  single: "เครื่องเดียว",
  group: "กลุ่มเครื่อง",
  usage_based: "ตามการใช้งาน",
};

const priorityStyle: Record<string, React.CSSProperties> = {
  low: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  medium: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  high: { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" },
  urgent: { background: "var(--cmms-danger)", color: "#fff" },
};

const freqChipStyle: Record<string, React.CSSProperties> = {
  daily: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  weekly: { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" },
  monthly: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" },
  quarterly: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  semi_annual: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" },
  yearly: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  custom: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" },
  meter_based: { background: "var(--cmms-info-light, #e0f2fe)", color: "var(--cmms-info, #0284c7)" },
};

export default function PMPlansPage() {
  const hero = usePageHero("pm_am/plans");
  const router = useRouter();
  const { canShow } = useMenuPermission();
  const [plans, setPlans] = useState<PMPlan[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/v1/pm_plans.php", { credentials: "include" });
      const json = await res.json();
      if (json?.status === "success" && Array.isArray(json.data)) setPlans(json.data);
      else setError(json?.error || "โหลดข้อมูลไม่สำเร็จ");
    } catch (e) {
      setError("ไม่สามารถเชื่อมต่อระบบได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = plans.filter((p) =>
    (p.code + " " + p.name + " " + (p.description || "")).toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = plans.filter((p) => p.status === "active" && p.is_active === 1).length;
  const dueSoonCount = plans.filter((p) => p.next_due && p.next_due <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;

  if (!canShow("pm_am/plans")) {
    return <EmptyState icon={<ClipboardList size={28} strokeWidth={1.5} />} title="ไม่มีสิทธิ์เข้าถึง" description="โปรดติดต่อผู้ดูแลระบบ" />;
  }

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>PM Master</span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => router.push("/pm_am/plans/create")}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />สร้างแผน PM ใหม่
          </Button>
          <Button variant="outline" onClick={() => router.push("/pm_am/dashboard")} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
            <Layers size={16} strokeWidth={1.75} aria-hidden="true" />แดชบอร์ด PM
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="cmms-kpi-card blue">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="idle" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">แผนทั้งหมด</p>
              <h3 className="cmms-kpi-value">{plans.length} <span className="cmms-kpi-unit">แผน</span></h3>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card green">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="ok" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">เปิดใช้งาน</p>
              <h3 className="cmms-kpi-value">{activeCount} <span className="cmms-kpi-unit">แผน</span></h3>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card amber">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="warn" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">ครบกำหนดภายใน 7 วัน</p>
              <h3 className="cmms-kpi-value">{dueSoonCount} <span className="cmms-kpi-unit">แผน</span></h3>
            </div>
          </CardContent>
        </Card>
        <Card className="cmms-kpi-card cyan">
          <CardContent className="flex items-center gap-3 p-4">
            <AndonLamp status="warn" size="sm" />
            <div>
              <p className="text-sm text-[var(--cmms-text-secondary)]">รอบที่สร้างแล้ว</p>
              <h3 className="cmms-kpi-value">{plans.reduce((s, p) => s + (p.cycle_count || 0), 0)} <span className="cmms-kpi-unit">รอบ</span></h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="rounded-[10px] border p-4 text-sm font-medium" style={{ borderColor: "var(--cmms-danger)", background: "var(--cmms-danger-light)" }}>
          {error}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="cmms-icon-tile"><ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" /></div>
              <h4 className="font-bold">แผนงาน PM ทั้งหมด</h4>
              <span className="cmms-count-pill">{filtered.length} แผน</span>
            </div>
            <div className="relative min-w-0 max-w-[280px]">
              <Search
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]"
              />
              <Input
                aria-label="ค้นหา"
                className="pl-9"
                placeholder="ค้นหารหัส / ชื่อแผน..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--cmms-text-muted)]">กำลังโหลดข้อมูล...</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={28} strokeWidth={1.5} aria-hidden="true" />}
              title={search ? "ไม่พบแผนที่ค้นหา" : "ยังไม่มีแผน PM"}
              description={search ? "ลองค้นหาด้วยคำอื่น" : 'กด "สร้างแผน PM ใหม่" เพื่อเริ่มต้น'}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filtered.map((p) => (
                <div key={p.id} className="rounded-lg border p-4 transition-all hover:shadow-sm" style={{ borderColor: "var(--cmms-border)", background: "var(--cmms-bg-card)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-primary-hover)", fontFamily: "monospace" }}>
                          {p.code}
                        </span>
                        <span className="cmms-andon-chip" style={freqChipStyle[p.frequency_type] || freqChipStyle.monthly}>
                          {freqLabels[p.frequency_type] || p.frequency_type}
                        </span>
                        <span className="cmms-andon-chip" style={priorityStyle[p.priority] || priorityStyle.medium}>
                          {p.priority}
                        </span>
                      </div>
                      <button className="block text-left font-bold hover:text-[var(--cmms-primary)]" onClick={() => router.push(`/pm_am/plans/${p.id}`)}>
                        {p.name}
                      </button>
                      {p.description && <p className="line-clamp-1 text-sm text-[var(--cmms-text-secondary)]">{p.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => router.push(`/pm_am/plans/${p.id}`)}
                        aria-label="ดูรายละเอียด"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]"
                        style={{ color: "var(--cmms-text-secondary)" }}
                      >
                        <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/pm_am/plans/create?edit=${p.id}`)}
                        aria-label="แก้ไขแผน"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--cmms-bg-muted)]"
                        style={{ color: "var(--cmms-text-secondary)" }}
                      >
                        <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center" style={{ borderColor: "var(--cmms-border)" }}>
                    <div>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">เครื่องจักร</p>
                      <p className="flex items-center justify-center gap-1 text-sm font-bold"><Wrench size={13} aria-hidden="true" />{p.asset_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">เช็คชีท</p>
                      <p className="flex items-center justify-center gap-1 text-sm font-bold"><ClipboardList size={13} aria-hidden="true" />{p.template_count}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--cmms-text-secondary)]">รอบถัดไป</p>
                      <p className="text-sm font-bold" style={{ color: p.next_due && p.next_due < new Date().toISOString().slice(0, 10) ? "var(--cmms-danger)" : "var(--cmms-text-primary)" }}>
                        {p.next_due || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {p.status === "active" && p.is_active === 1 ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--cmms-success-dark)" }}>
                        <CheckCircle2 size={13} aria-hidden="true" />เปิดใช้งาน
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--cmms-text-secondary)" }}>
                        <PauseCircle size={13} aria-hidden="true" />{p.status === "cancelled" ? "ยกเลิกแล้ว" : "ปิดใช้งาน"}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs" style={{ color: "var(--cmms-text-secondary)" }}>
                      <Users size={13} aria-hidden="true" />{p.responsible_name || "ไม่ระบุ"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
"use client";

// asset_registry/plant_map — Plant Layout Map 2D (port จาก asset_registry/plant_map.php)
// data: asset_stats.php?resource=plant_map (assets + ตำแหน่ง/โซน + งานเปิด + priority สูงสุด)

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Factory, RefreshCw, Wrench, MapPinned, Network } from "lucide-react";

interface MapRow {
  id: number;
  code: string;
  name: string;
  status: string;
  location_id: number | null;
  location_name: string;
  zone_name: string;
  active_repairs: number;
  max_priority: string | null;
}

// แผนที่สีสถานะเครื่อง (เหมือนระบบทั่วขั้นของระบบ)
const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-500",
  under_repair: "bg-amber-100 text-amber-700",
  maintenance: "bg-blue-100 text-blue-700",
  breakdown: "bg-rose-100 text-rose-700",
};

export default function PlantMapPage() {
  const hero = usePageHero("asset_registry");
  const router = useRouter();
  const [rows, setRows] = useState<MapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/asset_stats.php?resource=plant_map");
      const json = await res.json();
      setRows(Array.isArray(json) ? json : []);
    } catch {
      setError("โหลดแผนที่ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groups = useMemo(() => {
    const g: Record<string, MapRow[]> = {};
    for (const r of rows) {
      const zone = r.zone_name || "ไม่ระบุโซน";
      (g[zone] ??= []).push(r);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ทะเบียนเครื่องจักร", href: "/asset_registry" }, { label: "Plant Map" }]}
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        title="แผนผังโรงงาน 2D"
        description="สถานะเครื่องจักรตามโซน/ตำแหน่งพร้อมจำนวนงานที่เปิดอยู่ — คลิกเครื่องเพื่อดูรายละเอียด"
        actions={[
          <Button key="refresh" variant="secondary" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {t("action.refresh")}
          </Button>,
        ]}
      />
      <div className="space-y-6">
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([zone, items]) => {
            const openCount = items.reduce((s, r) => s + Number(r.active_repairs || 0), 0);
            return (
              <Card key={zone}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2"><Factory className="w-4 h-4" aria-hidden="true" />โซน {zone}</span>
                    <Badge variant="neutral" className="font-mono">
                      {items.length} เครื่อง · {openCount} งานเปิด
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {items.map((r) => {
                      const cls = STATUS_CLS[(() => {
                        if (Number(r.active_repairs) > 0) return "under_repair";
                        return r.status || "inactive";
                      })()] || "bg-slate-100 text-slate-500";
                      const hot = String(r.max_priority || "") === "critical" && Number(r.active_repairs) > 0;
                      const layoutHref = r.location_id ? `/facility-layout?room=${r.location_id}&asset=${r.id}` : "";
                      return (
                        <div
                          key={r.id}
                          className={`text-left rounded-lg border-2 ${hot ? "border-rose-400" : "border-transparent"} ${cls} p-3`}
                        >
                          <button
                            onClick={() => router.push(`/asset_registry/view?id=${r.id}`)}
                            className="w-full text-left hover:opacity-85 transition-shadow"
                            title="ดูรายละเอียดเครื่องจักร"
                          >
                            <div className="font-mono text-xs font-bold">{r.code}</div>
                            <div className="text-sm font-semibold leading-snug line-clamp-2">{r.name}</div>
                            <div className="mt-1 text-xs opacity-70 flex items-center gap-1"><MapPinned className="w-3 h-3" aria-hidden="true" />{r.location_name || "ไม่ระบุตำแหน่ง"}</div>
                            {Number(r.active_repairs) > 0 ? (
                              <div className="mt-1 text-xs font-bold text-rose-600 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" aria-hidden="true" />{r.active_repairs} งานเปิด</div>
                            ) : (
                              <div className="mt-1 text-xs opacity-60">ไม่มีงานค้าง</div>
                            )}
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {layoutHref ? (
                              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => router.push(layoutHref)}>
                                <Network className="w-3 h-3" aria-hidden="true" />ผัง/พอร์ตห้อง
                              </Button>
                            ) : (
                              <span className="text-[11px] opacity-60">ยังไม่ผูกตำแหน่ง (location)</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {rows.length === 0 ? (
            <Alert>ยังไม่มีข้อมูลเครื่องจักร</Alert>
          ) : null}
        </div>
      )}
      </div>
    </>
  );
}

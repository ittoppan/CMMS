"use client";

// asset_registry/oee — OEE Realtime (port จาก analytics/oee.php + asset_registry/oee_dashboard.php)
// Availability คำนวณจาก downtime จริงของงานซ่อม 30 วันล่าสุด (asset_stats API)
// Performance/Quality ยังไม่มีข้อมูลจริงจาก QC/ผลิต = แสดง N/A พร้อมคำแนะนำ

import { useCallback, useEffect, useState } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Lightbulb, RefreshCw } from "lucide-react";

const MONTH_MINUTES = 30 * 24 * 60;

export default function OeePage() {
  const hero = usePageHero("dashboard");
  const [downtimeMinutes, setDowntimeMinutes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/asset_stats.php?resource=downtime30");
      const json = await res.json();
      setDowntimeMinutes(Number(json?.downtime_minutes) || 0);
    } catch {
      setError("โหลดสถิติ Downtime ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const hasRealData = (downtimeMinutes ?? 0) > 0;
  const availability = hasRealData
    ? Math.max(0, Math.round((100 - ((downtimeMinutes ?? 0) / MONTH_MINUTES) * 100) * 10) / 10)
    : null;
  const oee: number | null = null; // perf × qual ยังไม่มีข้อมูลจริง

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "ทะเบียนเครื่องจักร", href: "/asset_registry" }, { label: "OEE" }]}
      title="OEE Realtime"
      description="Overall Equipment Effectiveness จาก downtime งานซ่อมจริง 30 วันล่าสุด"
      actions={
        <Button variant="secondary" onClick={fetchStats}>
          <RefreshCw className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.refresh")}
        </Button>
      }
    >
      {error ? <Alert variant="danger">{error}</Alert> : null}
      {loading ? (
        <p className="text-sm text-muted-foreground">กำลังคำนวณ...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Availability (30 วัน)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-center py-4">
              {availability !== null ? (
                <>
                  <div className="text-5xl font-black text-emerald-600">{availability}%</div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Downtime รวม {(downtimeMinutes ?? 0).toLocaleString()} นาที / {MONTH_MINUTES.toLocaleString()} นาที
                  </p>
                </>
              ) : (
                <>
                  <div className="text-5xl font-black text-slate-500">N/A</div>
                  <p className="mt-2 text-xs text-muted-foreground">ยังไม่มีข้อมูล downtime — ใช้ค่าเริ่มต้น 100%</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">Performance / Quality</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-center py-4">
              <div className="text-5xl font-black text-slate-500">N/A</div>
              <p className="mt-2 text-xs text-muted-foreground">ต้องมีข้อมูล KPI ผลิตจริง + อัตรา QC ผ่าน จากระบบผลิตาภิบาล</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase">OEE รวม</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-center py-4">
              <div className="text-5xl font-black text-slate-500">N/A</div>
              <p className="mt-2 text-xs text-muted-foreground">OEE = A × P × Q (พร้อมแสดงเมื่อครบทั้ง 3 ตัวแปร)</p>
              <Badge className="mt-2 bg-amber-100 text-amber-700">ต้องเชื่อมข้อมูลผลิต</Badge>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Lightbulb className="mt-1 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              OEE แบบเรียลไทม์ here คำนวณจาก <strong>Availability</strong> เท่านั้นปัจจุบัน (100 − สัดส่วน downtime
              ต่อจำนวนนาทีทั้งเดือน 30 วัน) หากมีการเชื่อมข้อมูลผลิตจริง (จำนวนชิ้นงาน/เวลาอุด้งเครื่อง) และผล QC
              ระบบจะคำนวณ Performance และ Quality ต่ออัตโนมัติ OEE = A × P × Q
            </p>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

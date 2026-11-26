"use client";

// IoT condition — Phase 36 condition snapshot (read-only).
// Reads /api/v1/iot.php?action=condition&asset_id=<id>: the same payload the engine builds,
// so the screen can only show what the database actually supports. There is no condition
// score here either — the API explains WHY a verdict is missing and the page shows that text.

import { useCallback, useEffect, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { HStack, VStack, Grid, PageHeader } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ClipboardList, Gauge, RefreshCw } from "lucide-react";

interface AssetOption {
  value: string;
  label: string;
}

interface ManualMeasurement {
  id: number;
  parameter?: string | null;
  param_name?: string | null;
  value_numeric?: string | number | null;
  unit?: string | null;
  method?: string | null;
  measured_at?: string | null;
  notes?: string | null;
}

interface ManualContext {
  available: boolean;
  count: number;
  label?: string;
  note?: string;
  measurements?: ManualMeasurement[];
}

interface Indicator {
  point_id: number;
  point_code: string;
  name: string;
  signal_type?: string;
  unit?: string;
  value?: string | number | null;
  display?: string;
  state?: string;
  state_label?: string;
  explanation?: string;
  quality?: string | null;
  quality_reason?: string | null;
  last_reading_at?: string | null;
  open_alarms?: number;
}

interface ConditionSnapshot {
  asset_id: number;
  asset_code?: string;
  asset_name?: string;
  captured_at?: string;
  available: boolean;
  summary: string;
  expected_points: number;
  valid_points: number;
  fresh_points: number;
  stale_points: number;
  invalid_points: number;
  no_data_points: number;
  data_completeness: number | null;
  worst_severity: string;
  alarm_counts?: { warning?: number; critical?: number };
  active_alarm_count: number;
  indicators: Indicator[];
  manual_context: ManualContext;
  no_score_reason?: string;
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: "วิกฤต",
  warning: "เตือน",
  normal: "ปกติ",
  unknown: "ยังสรุปไม่ได้",
};

function severityVariant(sev: string): "danger" | "warning" | "success" | "neutral" {
  if (sev === "critical") return "danger";
  if (sev === "warning") return "warning";
  if (sev === "normal") return "success";
  return "neutral";
}

export default function IotConditionPage() {
  const hero = usePageHero("iot/condition", {
    eyebrow: "IOT CONDITION · CMMS-TOPPAN",
    title: "สภาพเครื่องจักรจากข้อมูล IoT",
    desc: "สรุปสภาพจากจุดวัดจริงที่ตั้งไว้ พร้อมบริบทการวัดแบบกำหนดเอง (manual) — ไม่มีคะแนนสภาพรวม",
  });

  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [assetId, setAssetId] = useState("");
  const [snap, setSnap] = useState<ConditionSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/index.php?resource=assets", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.status === "success" && Array.isArray(json.data)) {
          const options: AssetOption[] = json.data.map((row: any) => ({
            value: String(row.id),
            label: `${row.code || `AST-${row.id}`} — ${row.name || "ไม่ระบุ"}`,
          }));
          setAssets(options);
          if (options.length > 0) setAssetId((prev) => prev || options[0].value);
        }
      })
      .catch(() => {
        if (!cancelled) setError("โหลดรายการเครื่องจักรไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchSnapshot = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/iot.php?action=condition&asset_id=${encodeURIComponent(id)}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.status === "success" && json.data) {
        setSnap(json.data as ConditionSnapshot);
        setError(null);
      } else {
        setSnap(null);
        setError(json.message || "อ่านข้อมูลสภาพเครื่องจักรไม่สำเร็จ");
      }
    } catch {
      setSnap(null);
      setError("เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (assetId) fetchSnapshot(assetId);
  }, [assetId, fetchSnapshot]);

  const manual = snap?.manual_context;
  const worst = snap?.worst_severity || "unknown";
  const counts: Array<[string, number]> = snap
    ? [
        ["จุดวัดที่ตั้งไว้", snap.expected_points],
        ["มีค่าใช้งานได้", snap.valid_points],
        ["เป็นปัจจุบัน", snap.fresh_points],
        ["ข้อมูลเก่า", snap.stale_points],
        ["ค่าไม่ผ่านการตรวจสอบ", snap.invalid_points],
        ["ยังไม่มีข้อมูล", snap.no_data_points],
      ]
    : [];

  return (
    <>
      <PageHeader eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "IoT", href: "/iot/monitor" },
        { label: "สภาพเครื่องจักร" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={[
        <>
          <Badge variant={severityVariant(worst)}>
            <Gauge size={12} strokeWidth={1.75} aria-hidden="true" />
            {SEVERITY_LABEL[worst] || worst}
          </Badge>
          <Button variant="secondary" onClick={() => assetId && fetchSnapshot(assetId)} disabled={!assetId || loading}>
            <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
            รีเฟรช
          </Button>
        </>
      ]} />
      <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <Card>
        <CardHeader>
          <CardTitle>เลือกเครื่องจักร</CardTitle>
          <CardDescription>สภาพจะสรุปจากจุดวัด (iot_points) ที่ผูกกับเครื่องนี้ และข้อมูลการวัดแบบ manual ของเครื่องเดียวกัน</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xl space-y-1.5">
            <Label htmlFor="iot-condition-asset">เครื่องจักร</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger id="iot-condition-asset" aria-label="เลือกเครื่องจักร">
                <SelectValue placeholder={assets.length ? "เลือกเครื่องจักร…" : "ยังไม่มีเครื่องจักรในระบบ"} />
              </SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : !snap ? (
        <Card>
          <EmptyState
            title="ยังไม่มีข้อมูลสภาพเครื่องจักร"
            description="เลือกเครื่องจักรด้านบน หรือตรวจสอบว่ามีจุดวัด IoT ที่ผูกกับเครื่องนี้แล้ว"
            icon={<Activity className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />}
          />
        </Card>
      ) : (
        <VStack gap={6}>
          <Card>
            <CardHeader>
              <HStack hAlign="between" vAlign="start" wrap="wrap" gap={3}>
                <div>
                  <CardTitle>
                    {snap.asset_code ? `${snap.asset_code} — ` : ""}
                    {snap.asset_name || `เครื่องจักร #${snap.asset_id}`}
                  </CardTitle>
                  <CardDescription>ประเมินเมื่อ {snap.captured_at ? snap.captured_at.slice(0, 16) : "-"}</CardDescription>
                </div>
                <HStack gap={2} wrap="wrap">
                  <Badge variant={snap.available ? "success" : "warning"} dot>
                    {snap.available ? "สรุปสภาพได้" : "ข้อมูลไม่พอสรุป"}
                  </Badge>
                  <Badge variant={severityVariant(worst)}>ระดับสูงสุด: {SEVERITY_LABEL[worst] || worst}</Badge>
                  <Badge variant={snap.active_alarm_count > 0 ? "danger" : "neutral"}>
                    แจ้งเตือนที่เปิดอยู่ {snap.active_alarm_count}
                  </Badge>
                </HStack>
              </HStack>
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="text-sm text-[var(--cmms-text-secondary)]">{snap.summary}</p>

              <div className="space-y-2">
                <HStack hAlign="between">
                  <span className="text-sm text-muted-foreground">ความครบถ้วนของข้อมูล</span>
                  <span className="text-sm font-semibold text-foreground">
                    {snap.data_completeness == null ? "ยังคำนวณไม่ได้" : `${snap.data_completeness}%`}
                  </span>
                </HStack>
                <Progress value={snap.data_completeness ?? 0} aria-label="ความครบถ้วนของข้อมูล" />
              </div>

              <Grid columns={{ minWidth: 180, max: 3 }} gap={4}>
                {counts.map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-border bg-muted/40 p-4">
                    <span className="block text-sm text-muted-foreground">{label}</span>
                    <span className="text-xl font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </Grid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>จุดวัดและค่าล่าสุด</CardTitle>
              <CardDescription>แต่ละจุดวัดอธิบายสถานะของตัวเอง (เป็นปัจจุบัน / เก่า / ค่าไม่ผ่าน / ยังไม่มีข้อมูล)</CardDescription>
            </CardHeader>
            <CardContent>
              {snap.indicators.length === 0 ? (
                <EmptyState
                  title="ยังไม่มีจุดวัดที่ผูกกับเครื่องนี้"
                  description="เพิ่มจุดวัด (iot_points) ให้อุปกรณ์ของเครื่องนี้ก่อน ระบบจึงจะสรุปสภาพได้"
                  icon={<Activity className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-xs  text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">จุดวัด</th>
                        <th className="px-3 py-2 font-semibold">ประเภท</th>
                        <th className="px-3 py-2 font-semibold">ค่าล่าสุด</th>
                        <th className="px-3 py-2 font-semibold">สถานะข้อมูล</th>
                        <th className="px-3 py-2 font-semibold">คุณภาพ</th>
                        <th className="px-3 py-2 font-semibold">อ่านล่าสุด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snap.indicators.map((it) => (
                        <tr key={it.point_id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <span className="block font-semibold text-foreground">{it.point_code}</span>
                            <span className="block text-xs text-muted-foreground">{it.name}</span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{it.signal_type || "-"}</td>
                          <td className="px-3 py-2 font-semibold text-foreground">
                            {it.value == null ? "—" : `${it.display ?? it.value} ${it.unit || ""}`.trim()}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={
                                it.state === "fresh" ? "success" : it.state === "ageing" ? "warning" : it.state === "no_data" ? "neutral" : "danger"
                              }
                            >
                              {it.state_label || it.state || "-"}
                            </Badge>
                            {it.explanation && <span className="mt-1 block text-xs text-muted-foreground">{it.explanation}</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {it.quality || "-"}
                            {it.quality_reason ? <span className="block text-xs">{it.quality_reason}</span> : null}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {it.last_reading_at ? it.last_reading_at.slice(0, 16) : "ยังไม่มีข้อมูล"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <HStack hAlign="between" vAlign="start" wrap="wrap" gap={2}>
                <div>
                  <CardTitle>ข้อมูลการวัดแบบกำหนดเอง (manual)</CardTitle>
                  <CardDescription>
                    {manual?.label || "ข้อมูลจากการตรวจแบบกำหนดเอง (CMMS) ไม่ใช่ข้อมูลจากเซนเซอร์"}
                  </CardDescription>
                </div>
                {manual?.available ? <Badge variant="info">{manual.count} รายการ</Badge> : null}
              </HStack>
            </CardHeader>
            <CardContent>
              {!manual?.available ? (
                <EmptyState
                  title="ยังไม่มีข้อมูลการวัดแบบกำหนดเอง"
                  description={manual?.note || "บันทึกค่าจากการตรวจด้วยมือผ่านหน้าค่าที่วัดได้ของเครื่องจักรก่อน"}
                  icon={<ClipboardList className="h-8 w-8" strokeWidth={1.75} aria-hidden="true" />}
                />
              ) : (
                <div className="space-y-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-xs  text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">พารามิเตอร์</th>
                          <th className="px-3 py-2 font-semibold">ค่า</th>
                          <th className="px-3 py-2 font-semibold">หน่วย</th>
                          <th className="px-3 py-2 font-semibold">วิธีการวัด</th>
                          <th className="px-3 py-2 font-semibold">เวลาวัด</th>
                          <th className="px-3 py-2 font-semibold">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(manual.measurements || []).map((m) => (
                          <tr key={m.id} className="border-b last:border-0">
                            <td className="px-3 py-2 font-semibold text-foreground">{m.param_name || m.parameter || "-"}</td>
                            <td className="px-3 py-2 text-foreground">{m.value_numeric ?? "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{m.unit || "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{m.method || "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{m.measured_at ? m.measured_at.slice(0, 16) : "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{m.notes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">{manual.note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {snap.no_score_reason && (
            <p className="text-xs text-muted-foreground">{snap.no_score_reason}</p>
          )}
        </VStack>
      )}
          </div>
    </>
  );
}

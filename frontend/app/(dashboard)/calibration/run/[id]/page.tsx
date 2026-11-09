"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { apiJson, useApiQuery } from "@/lib/api";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, CheckCircle2, CircleStop, FlaskConical, Plus, RefreshCw, Trash2, XCircle,
} from "lucide-react";

interface Measurement {
  id: number;
  point_label: string;
  nominal_value: string | null;
  measured_value: string | null;
  tolerance: string | null;
  error_value: string | null;
  error_pct: string | null;
  result: "pass" | "fail" | "conditional" | null;
  is_critical: number;
  unit?: string;
  notes?: string;
}

interface RunData {
  id: number;
  asset_id: number;
  asset_code?: string;
  asset_name?: string;
  status: string;
  result?: string | null;
  calibration_type?: string;
  calibration_date?: string | null;
  next_calibration_date?: string | null;
  certificate_number?: string | null;
  standard_used?: string | null;
  notes?: string;
  performed_by?: number | null;
  performed_name?: string | null;
  calibrator_name?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  measurements: Measurement[];
  certificates: any[];
  computed?: {
    points_total: number;
    points_passed: number;
    points_failed: number;
    points_missing: number;
    result?: string | null;
    oot: boolean;
    insufficient_data: boolean;
    complete: boolean;
  };
}

const statusLabel: Record<string, string> = {
  scheduled: "รอเข้าแผน",
  pending: "รอดำเนินการ",
  in_progress: "กำลังสอบเทียบ",
  pending_review: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  completed: "เสร็จสิ้น",
  overdue: "เกินกำหนด",
  cancelled: "ยกเลิก",
  rejected: "ถูกปฏิเสธ",
};

const statusVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  approved: "success",
  completed: "success",
  scheduled: "neutral",
  pending: "warning",
  in_progress: "warning",
  pending_review: "warning",
  overdue: "danger",
  cancelled: "neutral",
  rejected: "danger",
};

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useApiQuery<RunData>(
    ["calibration", "run", runId],
    `/api/v1/calibration_management.php?resource=run&id=${runId}`
  );

  const [points, setPoints] = useState<Measurement[]>([]);
  useEffect(() => {
    if (data) {
      const pts = (data.measurements ?? []).map((m) => ({ ...m }));
      if (pts.length === 0) {
        // template default 3 จุด — ผู้ใช้แก้ก่อนบันทึก
        setPoints([1, 2, 3].map((n) => ({
          id: 0, point_label: `จุดที่ ${n}`, nominal_value: "", measured_value: "",
          tolerance: "", error_value: null, error_pct: null, result: null, is_critical: n === 1 ? 1 : 0,
        })));
      } else {
        setPoints(pts);
      }
    }
  }, [data]);

  const [msg, setMsg] = useState<{ type?: "ok" | "err"; text?: string }>({});

  const runAction = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiJson("/api/v1/calibration_management.php", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (r: any, vars) => {
      setMsg({ type: "ok", text: r.message || "สำเร็จ" });
      qc.invalidateQueries({ queryKey: ["calibration"] });
      refetch();
      if (vars.action === "run_review" && vars.decision === "approve") {
        setTimeout(() => router.push(`/calibration/instruments/${data?.asset_id}`), 1200);
      }
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const isEditable = ["in_progress", "pending_review", "rejected", "pending"].includes(data?.status || "");
  const isPendingReview = data?.status === "pending_review";

  const updatePoint = (idx: number, patch: Partial<Measurement>) => {
    setPoints((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const computed = data?.computed;

  const renderPointRow = (m: Measurement, i: number) => (
    <tr key={m.id || i} className="border-b last:border-0">
      <td className="px-3 py-2 align-middle">
        <Input
          aria-label={`ชื่อจุดวัด ${i + 1}`}
          value={m.point_label}
          disabled={!isEditable}
          onChange={(e) => updatePoint(i, { point_label: e.target.value })}
          className="min-w-[120px]"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <Input
          aria-label={`ค่าอ้างอิง ${i + 1}`}
          type="number"
          value={m.nominal_value ?? ""}
          disabled={!isEditable}
          onChange={(e) => updatePoint(i, { nominal_value: e.target.value })}
          className="w-[110px]"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <Input
          aria-label={`ค่าที่วัด ${i + 1}`}
          type="number"
          value={m.measured_value ?? ""}
          disabled={!isEditable}
          onChange={(e) => updatePoint(i, { measured_value: e.target.value })}
          className="w-[110px]"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <Input
          aria-label={`เกณฑ์ยอมรับ ${i + 1}`}
          type="number"
          value={m.tolerance ?? ""}
          disabled={!isEditable}
          onChange={(e) => updatePoint(i, { tolerance: e.target.value })}
          className="w-[100px]"
        />
      </td>
      <td className="px-3 py-2 align-middle">
        <span className="text-sm tabular-nums whitespace-nowrap">
          {m.nominal_value !== "" && m.measured_value !== "" && m.nominal_value !== null && m.measured_value !== null
            ? `${Number(m.measured_value) - Number(m.nominal_value)}${m.error_pct != null ? ` (${Number(m.error_pct).toFixed(4)}%)` : ""}`
            : "-"}
        </span>
      </td>
      <td className="px-3 py-2 align-middle">
        {m.nominal_value !== "" && m.measured_value !== "" && m.nominal_value !== null && m.measured_value !== null && m.tolerance !== "" && m.tolerance !== null ? (
          (() => {
            const ok = Math.abs(Number(m.measured_value) - Number(m.nominal_value)) <= Number(m.tolerance);
            return <Badge variant={ok ? "success" : "danger"}>{ok ? "pass" : "fail"}</Badge>;
          })()
        ) : (
          <span className="text-xs text-muted-foreground">รอข้อมูลครบ</span>
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        <input
          type="checkbox"
          className="accent-[var(--cmms-primary)]"
          checked={!!m.is_critical}
          disabled={!isEditable}
          onChange={(e) => updatePoint(i, { is_critical: e.target.checked ? 1 : 0 })}
        />
      </td>
    </tr>
  );

  const drafts = points.filter((p) => p.nominal_value !== "" && p.measured_value !== "") as any[];
  const contResult =
    drafts.length > 0 && drafts.every((p) => p.tolerance !== "" && p.tolerance !== null)
      ? drafts.every((p) => Math.abs(Number(p.measured_value) - Number(p.nominal_value)) <= Number(p.tolerance))
        ? "pass"
        : "fail"
      : null;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">CALIBRATION · WORKFLOW</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "เครื่องมือวัด", href: "/calibration/instruments" },
        { label: data?.asset_name || "..." },
        { label: `รอบ #${runId}` },
      ]}
      title={`รอบสอบเทียบ #${runId}`}
      description={
        data
          ? `${data.asset_code ?? ""} · ${statusLabel[data.status] || data.status} · ใบรับรอง: ${data.certificate_number || "-"}`
          : "กำลังโหลด..."
      }
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => router.push(`/calibration/instruments/${data?.asset_id}`)}>
            <ArrowLeft className="w-4 h-4" /> กลับ
          </Button>
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" /> รีเฟรช
          </Button>
        </div>
      }
    >
      {msg.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg.type === "err" && <Alert variant="danger">{msg.text}</Alert>}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !data ? (
        <Alert variant="danger">ไม่พบรอบสอบเทียบนี้</Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                สถานะรอบ
                <Badge variant={statusVariant[data.status] || "neutral"} className="ml-2">
                  {statusLabel[data.status] || data.status}
                </Badge>
                {data.result && <Badge variant={data.result === "pass" ? "success" : "danger"}>{data.result}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>ผู้ดำเนินการ: {data.calibrator_name || data.performed_name || "-"}</span>
              <span>มาตรฐาน: {data.standard_used || "-"}</span>
              <span>วันที่สอบเทียบ: {data.calibration_date || "-"}</span>
              {data.reviewed_at && <span>ตรวจสอบ: {data.reviewed_at}</span>}
              {data.approved_at && <span>อนุมัติ: {data.approved_at}</span>}
            </CardContent>
          </Card>

          {computed && computed.insufficient_data && (
            <Alert variant="warning">
              ยังไม่มีจุดวัด — ระบบไม่สามารถคำนวณผลได้จนกว่าจะกรอกจุดวัดอย่างน้อย 1 จุด (ตามหลัก INSUFFICIENT_DATA)
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                จุดวัด / ค่าการสอบเทียบ
                <Badge variant="neutral">{points.filter((p) => p.measured_value !== "").length}/{points.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">จุดวัด</th>
                      <th className="px-3 py-2">ค่าอ้างอิง</th>
                      <th className="px-3 py-2">ค่าที่วัดได้</th>
                      <th className="px-3 py-2">เกณฑ์ยอมรับ (±)</th>
                      <th className="px-3 py-2">Error (อัตโนมัติ)</th>
                      <th className="px-3 py-2">ผล (อัตโนมัติ)</th>
                      <th className="px-3 py-2">จุดวิกฤต</th>
                    </tr>
                  </thead>
                  <tbody>{points.map(renderPointRow)}</tbody>
                </table>
              </div>
              {isEditable && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPoints((p) => [...p, { id: 0, point_label: `จุดที่ ${p.length + 1}`, nominal_value: "", measured_value: "", tolerance: "", error_value: null, error_pct: null, result: null, is_critical: 0 }])}>
                    <Plus className="w-4 h-4" /> เพิ่มจุดวัด
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={runAction.isPending}
                    onClick={() => runAction.mutate({ action: "run_save_points", calibration_id: runId, points })}
                  >
                    <CheckCircle2 className="w-4 h-4" /> บันทึกจุดวัด (ระบบคำนวณ error/ผล)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {isEditable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleStop className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                  ยืนยันผลการสอบเทียบ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {contResult && (
                  <p className="text-sm">
                    ผลรวมจากข้อมูลที่กรอก:{" "}
                    <Badge variant={contResult === "pass" ? "success" : "danger"}>{contResult}</Badge>{" "}
                    <span className="text-muted-foreground">(คำนวณฝั่ง backend เมื่อบันทึกจริง)</span>
                  </p>
                )}
                <Button
                  variant="primary"
                  disabled={runAction.isPending || points.every((p) => p.measured_value === "")}
                  onClick={() => runAction.mutate({ action: "run_complete", calibration_id: runId })}
                >
                  <CircleStop className="w-4 h-4" />
                  ส่งผลสอบเทียบ (รอผู้ตรวจสอบอนุมัติ)
                </Button>
              </CardContent>
            </Card>
          )}

          {isPendingReview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  ตรวจสอบ / อนุมัติผล
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={runAction.isPending} onClick={() => runAction.mutate({ action: "run_review", calibration_id: runId, decision: "approve" })}>
                  <CheckCircle2 className="w-4 h-4" /> อนุมัติ — บันทึกประวัติและคำนวณรอบถัดไป
                </Button>
                <Button variant="danger" disabled={runAction.isPending} onClick={() => {
                  const reason = prompt("เหตุผลการปฏิเสธ (ต้องระบุ):");
                  if (reason && reason.trim()) runAction.mutate({ action: "run_review", calibration_id: runId, decision: "reject", reason: reason.trim() });
                }}>
                  <XCircle className="w-4 h-4" /> ปฏิเสธ
                </Button>
              </CardContent>
            </Card>
          )}

          {data.status === "rejected" && (
            <Alert variant="danger">
              ผลสอบเทียบถูกปฏิเสธ — แก้ไขจุดวัดแล้วส่งผลใหม่ได้
            </Alert>
          )}
        </>
      )}
    </PageShell>
  );
}
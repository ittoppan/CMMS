"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { apiJson, useApiQuery } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { CalendarPlus, CirclePlus } from "lucide-react";

interface Plan {
  id: number;
  plan_code: string;
  asset_code?: string;
  asset_name?: string;
  interval_months: number;
  interval_basis?: string;
  method?: string;
  status?: string;
  last_calibration_date?: string | null;
  next_calibration_date?: string | null;
  standard_code?: string | null;
  standard_name?: string | null;
  responsible_name?: string | null;
  dept_name?: string | null;
}

interface Instrument { id: number; code: string; name: string; }

export default function CalibrationPlansPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const qc = useQueryClient();
  const sp = useSearchParams();
  const assetIdFilter = sp.get("asset_id") || "";

  const [assetId, setAssetId] = useState(assetIdFilter);
  const [intervalMonths, setIntervalMonths] = useState("12");
  const [method, setMethod] = useState("internal");
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [msg, setMsg] = useState<{ type?: "ok" | "err"; text?: string }>({});

  const { data: plans, isLoading } = useApiQuery<Plan[]>(
    ["calibration", "plans", assetIdFilter],
    `/api/v1/calibration_management.php?resource=plans${assetIdFilter ? `&asset_id=${assetIdFilter}` : ""}`
  );

  const { data: instruments } = useApiQuery<Instrument[]>(
    ["calibration", "assets_for_plan"],
    "/api/v1/calibration_management.php?resource=instruments&limit=500"
  );

  const { mutate: savePlan, isPending } = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({
          action: "plan_save",
          asset_id: Number(assetId),
          interval_months: Number(intervalMonths),
          method,
          interval_change_reason: reason || undefined,
          next_calibration_date: dueDate || undefined,
        }),
      }),
    onSuccess: (r: any) => {
      setMsg({ type: "ok", text: r.message || "บันทึกแผนแล้ว" });
      setReason("");
      qc.invalidateQueries({ queryKey: ["calibration"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const columns: SimpleColumn<Plan>[] = [
    { key: "plan_code", header: "รหัสแผน" },
    {
      key: "asset",
      header: "เครื่องมือวัด",
      renderCell: (p) => <span>{p.asset_code} — {p.asset_name}</span>,
    },
    { key: "interval_months", header: "รอบ", renderCell: (p) => `${p.interval_months} เดือน (${p.interval_basis || "calendar"})` },
    { key: "method", header: "วิธี" },
    {
      key: "standard",
      header: "มาตรฐานอ้างอิง",
      renderCell: (p) => p.standard_name || p.standard_code || "-",
    },
    { key: "last_calibration_date", header: "ครั้งล่าสุด", renderCell: (p) => p.last_calibration_date || "-" },
    { key: "next_calibration_date", header: "กำหนดถัดไป", renderCell: (p) => p.next_calibration_date || "-" },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (p) => (
        <Badge variant={p.status === "active" ? "success" : p.status === "suspended" ? "warning" : "neutral"}>
          {p.status === "active" ? "ใช้งาน" : p.status || "draft"}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "ดำเนินการ",
      renderCell: (p) =>
        p.status === "active" ? (
          <Button variant="primary" size="sm" onClick={() => router.push(`/calibration/schedule`)}>
            <CalendarPlus className="w-3.5 h-3.5" /> เริ่มสอบเทียบ
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
  ];

  const assetOptions = useMemo(() => instruments ?? [], [instruments]);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "แผนสอบเทียบ" },
      ]}
      title="แผนสอบเทียบ"
      description="กำหนดรอบสอบเทียบต่อเครื่องมือวัด — ระบบคำนวณกำหนดถัดไปจากข้อมูลจริง ป้องกันการเปลี่ยนรอบโดยไม่มีเหตุผล"
    >
      {msg.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg.type === "err" && <Alert variant="danger">{msg.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CirclePlus className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            สร้าง / เปลี่ยนรอบสอบเทียบ
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Select value={assetId} onValueChange={(v) => setAssetId(v)}>
              <SelectTrigger aria-label="เครื่องมือวัด"><SelectValue placeholder="เลือกเครื่องมือวัด" /></SelectTrigger>
              <SelectContent>
                {(assetOptions ?? []).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={String(intervalMonths)} onValueChange={(v) => setIntervalMonths(v)}>
            <SelectTrigger aria-label="รอบสอบเทียบ (เดือน)"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[3, 6, 12, 18, 24, 36, 60].map((m) => (
                <SelectItem key={m} value={String(m)}>{m} เดือน</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={(v) => setMethod(v)}>
            <SelectTrigger aria-label="วิธีสอบเทียบ"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">ภายใน</SelectItem>
              <SelectItem value="external">ภายนอก</SelectItem>
              <SelectItem value="certified_lab">แล็บรับรอง</SelectItem>
            </SelectContent>
          </Select>
          <Input label="กำหนดถัดไป" isLabelHidden type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="กำหนดถัดไป" />
          <Input label="เหตุผลถ้าเปลี่ยนรอบ" isLabelHidden value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (บังคับเมื่อเปลี่ยนรอบ)" />
          <Button variant="primary" disabled={!assetId || isPending} onClick={() => savePlan()}>
            <CalendarPlus className="w-4 h-4" /> บันทึกแผน
          </Button>
        </CardContent>
        <CardContent className="pt-0 text-xs text-muted-foreground">
          การเปลี่ยนแปลงรอบสอบเทียบต้องระบุเหตุผลเสมอ (policy ระบบ) — ประวัติการเปลี่ยนจะถูกบันทึกเป็นแผนเวอร์ชันใหม่
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            รายการแผนสอบเทียบ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Plan>
            columns={columns}
            data={plans ?? []}
            idKey="id"
            loading={isLoading}
            skeletonRows={6}
            pageSize={15}
            caption="แผนสอบเทียบทั้งหมด"
            emptyTitle="ยังไม่มีแผนสอบเทียบ"
            emptyDescription="สร้างแผนแรกด้านบน (หรือไปจากหน้าเครื่องมือวัด)"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
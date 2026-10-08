"use client";

import { useMemo, useState } from "react";
import { Activity, TriangleAlert } from "lucide-react";

import { PageShell } from "@/components/PageShell";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { KpiCard } from "@/components/dashboard/kit";
import { useApiQuery } from "@/lib/api";
import { usePageHero } from "@/lib/i18n";
import { fmtMinutes, fmtPct, type CapacityResponse, type CapacityRow } from "@/lib/workforce";

/**
 * app/(dashboard)/workforce/capacity/page.tsx — capacity board (Phase 34)
 *
 * ความซื่อสัตย์ของข้อมูลที่หน้านี้บังคับ:
 *  - `utilization_pct` คำนวณจาก planned_minutes เทียบ capacity_minutes ที่หักลาอนุมัติ/อบรมแล้ว
 *  - `capacity_at_risk` = true เมื่อยังมีวันลาที่ "วางแผน" แต่ยังไม่อนุมัติ จึงยังไม่หัก
 *  - `has_shift_data` = false = ยังไม่มีข้อมูลกะ ความจุจึงเป็นค่าเริ่มต้น ไม่ใช่ตารางงานจริง
 *  ตัวเลขที่ระบบไม่มีที่มาให้วัดต้องแสดง "—" ไม่ใช่ตัวเลขที่เดาเอง
 */

function isoAddDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function utilTone(pct: number, warn: number, over: number): string {
  if (pct >= over) return "text-red-600";
  if (pct >= warn) return "text-amber-600";
  return "";
}

export default function WorkforceCapacityPage() {
  const hero = usePageHero("workforce/capacity");

  const [to, setTo] = useState(today());
  const [from, setFrom] = useState(isoAddDays(to, -6));
  const [q, setQ] = useState("");

  const { data: cfg } = useApiQuery<{ config: { capacity_warn_pct: number; capacity_over_pct: number } }>(
    ["workforce", "config"],
    "/api/v1/workforce.php?action=config"
  );

  const { data, isLoading, error } = useApiQuery<CapacityResponse>(
    ["workforce", "capacity", from, to],
    `/api/v1/workforce.php?action=capacity&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );

  const warn = cfg?.config.capacity_warn_pct ?? 85;
  const over = cfg?.config.capacity_over_pct ?? 100;

  const board = useMemo<CapacityRow[]>(() => {
    const rows = data?.board ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(needle) ||
        (r.position ?? "").toLowerCase().includes(needle)
    );
  }, [data?.board, q]);

  const totals = useMemo(() => {
    const rows = data?.board ?? [];
    return {
      headcount: rows.length,
      capacity: rows.reduce((a, r) => a + (r.capacity_minutes ?? 0), 0),
      planned: rows.reduce((a, r) => a + (r.planned_minutes ?? 0), 0),
      overCapacity: rows.filter((r) => r.utilization_pct >= over).length,
      atRisk: rows.filter((r) => r.capacity_at_risk).length,
      noShift: rows.filter((r) => !r.has_shift_data).length,
    };
  }, [data?.board, over]);

  const columns: SimpleColumn<CapacityRow>[] = [
    {
      key: "full_name",
      header: "ช่าง",
      renderCell: (r) => (
        <div>
          <div className="font-medium">{r.full_name}</div>
          <div className="text-xs text-muted-foreground">{r.position || "—"}</div>
        </div>
      ),
    },
    {
      key: "capacity_minutes",
      header: "ความจุ",
      align: "right",
      renderCell: (r) => fmtMinutes(r.capacity_minutes),
    },
    {
      key: "planned_minutes",
      header: "วางแผน",
      align: "right",
      renderCell: (r) => fmtMinutes(r.planned_minutes),
    },
    {
      key: "actual_minutes",
      header: "บันทึกจริง",
      align: "right",
      renderCell: (r) => fmtMinutes(r.actual_minutes),
    },
    {
      key: "paused_minutes",
      header: "หยุดงาน",
      align: "right",
      renderCell: (r) => fmtMinutes(r.paused_minutes),
    },
    {
      key: "utilization_pct",
      header: "อัตราการใช้",
      renderCell: (r) => (
        <div className="min-w-[9rem] space-y-1">
          <div className={`text-sm font-semibold ${utilTone(r.utilization_pct, warn, over)}`}>
            {fmtPct(r.utilization_pct)}
          </div>
          <Progress
            value={Math.min(100, Math.max(0, r.utilization_pct))}
            className="h-1.5"
            aria-label={`อัตราการใช้ความจุของ ${r.full_name}`}
          />
        </div>
      ),
    },
    {
      key: "deductions",
      header: "หักออก",
      renderCell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.approved_leave_days > 0 && (
            <Badge variant="neutral">ลา {r.approved_leave_days} วัน</Badge>
          )}
          {r.training_days > 0 && (
            <Badge variant="neutral">อบรม {r.training_days} วัน</Badge>
          )}
          {r.pending_leave_days > 0 && (
            <Badge variant="warning">ลาวางแผน {r.pending_leave_days} วัน</Badge>
          )}
          {r.approved_leave_days === 0 &&
            r.training_days === 0 &&
            r.pending_leave_days === 0 && <span className="text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: "flags",
      header: "ข้อควรระวัง",
      renderCell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.capacity_at_risk && <Badge variant="warning">เสี่ยงเกิน</Badge>}
          {!r.has_shift_data && <Badge variant="danger">ไม่มีข้อมูลกะ</Badge>}
          {!r.capacity_at_risk && r.has_shift_data && (
            <span className="text-muted-foreground">—</span>
          )}
        </div>
      ),
    },
  ];

  if (error) {
    const status = (error as { status?: number }).status;
    return (
      <PageShell
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        breadcrumbs={[
          { label: "หน้าแรก", href: "/dashboard" },
          { label: hero.title, href: "/workforce" },
          { label: "ความจุ" },
        ]}
        title={hero.title}
        description={hero.desc}
      >
        <Alert variant="danger">
          <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          <div>
            {status === 403 || status === 401
              ? "ไม่มีสิทธิ์ดูกระดานความจุ (ต้องมีสิทธิ์ workforce.capacity_view)"
              : "โหลดกระดานความจุไม่สำเร็จ"}
          </div>
        </Alert>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: hero.title, href: "/workforce" },
        { label: "ความจุ" },
      ]}
      title={hero.title}
      description={hero.desc}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="ช่างในกระดาน" value={totals.headcount} unit="คน" sub={`ช่วง ${from} → ${to}`} />
          <KpiCard label="ความจุรวม" value={fmtMinutes(totals.capacity)} sub="หลังหักลาอนุมัติและอบรม" />
          <KpiCard
            label="เกิน capacity"
            value={totals.overCapacity}
            unit="คน"
            tone={totals.overCapacity > 0 ? "red" : ""}
            sub={`เกณฑ์เตือน ${warn}% / เกิน ${over}%`}
          />
          <KpiCard
            label="เสี่ยง / ไม่มีข้อมูลกะ"
            value={`${totals.atRisk} / ${totals.noShift}`}
            sub="ลาที่ยังไม่อนุมัติ / ยังไม่ได้ลงกะ"
            tone={totals.atRisk > 0 || totals.noShift > 0 ? "amber" : ""}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              กระดานความจุ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="cap-from" className="text-xs text-muted-foreground">
                  ตั้งแต่
                </label>
                <Input
                  id="cap-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => e.target.value && setFrom(e.target.value)}
                  className="mt-1 w-[10.5rem]"
                />
              </div>
              <div>
                <label htmlFor="cap-to" className="text-xs text-muted-foreground">
                  ถึง
                </label>
                <Input
                  id="cap-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => e.target.value && setTo(e.target.value)}
                  className="mt-1 w-[10.5rem]"
                />
              </div>
              <div>
                <label htmlFor="cap-search" className="text-xs text-muted-foreground">
                  ค้นหาช่าง
                </label>
                <Input
                  id="cap-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ชื่อหรือตำแหน่ง"
                  className="mt-1 w-[14rem]"
                />
              </div>
            </div>

            {totals.noShift > 0 && (
              <Alert variant="warning">
                <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                <div>
                  มี {totals.noShift} คนที่ยังไม่มีข้อมูลกะทำงาน ความจุของพวกเขาเป็นค่าเริ่มต้นของระบบ
                  ไม่ใช่ตารางงานจริง — ต้องลงกะที่ <code>/workforce/shifts</code> เพื่อให้ตัวเลขน่าเชื่อถือ
                </div>
              </Alert>
            )}

            <SimpleDataTable<CapacityRow>
              columns={columns}
              data={board}
              idKey="user_id"
              loading={isLoading}
              skeletonRows={8}
              pageSize={15}
              caption="กระดานความจุต่อช่าง"
              emptyTitle="ไม่มีข้อมูลความจุ"
              emptyDescription="ยังไม่มีช่างที่เข้าเกณฑ์ในช่วงวันที่เลือก"
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

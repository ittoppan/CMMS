"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import CountUp from "react-countup";
import { Search, FileCheck2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { StageBadge } from "@/components/calibration/StageBadge";
import {
  SimpleDataTable,
  type SimpleColumn,
} from "@/components/ui/data-table-adapter";

interface CalRow {
  id: number;
  asset_id: number;
  asset_name: string;
  asset_code: string;
  next_calibration_date: string | null;
  calibration_date: string | null;
  stage: string;
  overdue: boolean;
  supplier_id: number | null;
  supplier_name: string | null;
  po_number: string | null;
  po_file: string | null;
  po_email_sent_at: string | null;
  provider_confirm_date: string | null;
  certificate_number: string | null;
  certificate_file: string | null;
  total_cost: string | number | null;
  calibration_date_orig: string | null;
}

export default function CalibrationTrackingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/v1/calibration_tracking.php")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json)) setRows(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const s = {
      ready: 0,
      po: 0,
      emailed: 0,
      sent_out: 0,
      done: 0,
      overdue: 0,
    };
    for (const r of rows) {
      if (r.overdue || r.stage === "overdue") s.overdue++;
      if (r.stage === "ready") s.ready++;
      else if (r.stage === "po") s.po++;
      else if (r.stage === "emailed") s.emailed++;
      else if (r.stage === "sent_out") s.sent_out++;
      else if (r.stage === "done") s.done++;
    }
    return s;
  }, [rows]);

  const total = rows.length;
  const doneCount = stats.done;
  const progressPct = total ? Math.round((doneCount / total) * 100) : 0;

  const stageCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.stage] = (map[r.stage] ?? 0) + 1;
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== "all") {
      list = list.filter((r) => (filter === "overdue" ? r.overdue || r.stage === "overdue" : r.stage === filter));
    }
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (r) =>
        (r.asset_code || "").toLowerCase().includes(q) ||
        (r.asset_name || "").toLowerCase().includes(q) ||
        (r.po_number || "").toLowerCase().includes(q) ||
        (r.certificate_number || "").toLowerCase().includes(q) ||
        (r.supplier_name || "").toLowerCase().includes(q)
    );
  }, [rows, filter, search]);

  const columns: SimpleColumn<CalRow>[] = [
    {
      key: "instrument",
      header: "เครื่องมือวัด",
      renderCell: (item) => (
        <div>
          <p className="font-medium">
            {item.asset_code || "-"} — {item.asset_name || "ไม่ระบุ"}
          </p>
          {item.overdue && <p className="text-xs text-[var(--cmms-danger)]">เลยกำหนดสอบเทียบ</p>}
        </div>
      ),
    },
    {
      key: "due",
      header: "กำหนดสอบเทียบ",
      renderCell: (item) => (
        <span className={item.overdue ? "font-semibold text-[var(--cmms-danger)]" : ""}>
          {item.next_calibration_date || "-"}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "ผู้ให้บริการ",
      renderCell: (item) => (
        <div className="space-y-0.5">
          <p>{item.supplier_name || "-"}</p>
          {item.provider_confirm_date && (
            <p className="text-xs text-muted-foreground">ยืนยัน: {item.provider_confirm_date}</p>
          )}
        </div>
      ),
    },
    {
      key: "po",
      header: "หมายเลข PO",
      renderCell: (item) =>
        item.po_number ? (
          <div className="space-y-0.5">
            <p className="font-medium">{item.po_number}</p>
            {item.po_file ? (
              <a
                href={item.po_file}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--cmms-primary-hover)] hover:underline"
              >
                เปิดไฟล์ PO ↗
              </a>
            ) : null}
            {item.po_email_sent_at && (
              <p className="text-xs text-muted-foreground">แจ้งผู้ให้บริการ: {item.po_email_sent_at}</p>
            )}
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "stage",
      header: "สถานะ",
      renderCell: (item) => <StageBadge stage={item.stage} />,
    },
    {
      key: "cert",
      header: "ใบรับรอง",
      renderCell: (item) =>
        item.certificate_number ? (
          <div className="space-y-0.5">
            <p>{item.certificate_number}</p>
            {item.certificate_file && (
              <a
                href={item.certificate_file}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--cmms-primary-hover)] hover:underline"
              >
                เปิดใบรับรอง ↗
              </a>
            )}
          </div>
        ) : (
          "-"
        ),
    },
    {
      key: "cost",
      header: "ค่าใช้จ่าย",
      align: "right",
      renderCell: (item) =>
        item.total_cost != null ? Number(item.total_cost).toLocaleString("th-TH") : "-",
    },
    {
      key: "actions",
      header: "จัดการ",
      align: "right",
      renderCell: (item) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/calibration/edit?id=${item.id}`)}
          >
            เปิดรายละเอียด
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => router.push(`/calibration/po`)}
          >
            จัดการ PO
          </Button>
        </div>
      ),
    },
  ];

  const chipClass = (key: string) =>
    filter === key ? "bg-[var(--cmms-primary)] text-white" : "bg-muted text-muted-foreground hover:bg-accent";

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">CALIBRATION TRACKING</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "ติดตามงานสอบเทียบ" },
      ]}
      title="ติดตามงานสอบเทียบเครื่องมือวัด"
      description="สถานะตาม Pipeline: รอออก PO → มี PO → แจ้งซัพพลายเออร์ → รอใบรับรอง → เสร็จสิ้น"
      actions={
        <Button variant="secondary" onClick={() => router.push("/calibration/po")}>
          <FileCheck2 className="h-4 w-4" />
          ไปที่ PO งานสอบเทียบ
        </Button>
      }
    >
      <Grid columns={{ minWidth: 160, max: 6 }} gap={3}>
        {[
          { key: "ready", label: "รอออก PO", value: stageCounts.ready ?? 0, cls: "text-[var(--cmms-primary-hover)]" },
          { key: "po", label: "มี PO", value: stageCounts.po ?? 0, cls: "text-[var(--cmms-primary-hover)]" },
          { key: "emailed", label: "แจ้งแล้ว", value: stageCounts.emailed ?? 0, cls: "text-[var(--cmms-warning-dark)]" },
          { key: "sent_out", label: "รอใบรับรอง", value: stageCounts.sent_out ?? 0, cls: "text-[var(--cmms-warning-dark)]" },
          { key: "done", label: "เสร็จสิ้น", value: stageCounts.done ?? 0, cls: "text-[var(--cmms-success-dark)]" },
          { key: "overdue", label: "เกินกำหนด", value: stats.overdue, cls: "text-[var(--cmms-danger-dark)]" },
        ].map((c) => (
          <Card key={c.key} className="p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <div className={`cmms-kpi-value ${c.cls}`}>
              <CountUp end={c.value} />
            </div>
          </Card>
        ))}
      </Grid>

      {total > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-4 pb-2">
            <p className="text-sm font-semibold">ความคืบหน้ารวมของงานสอบเทียบ</p>
            <p className="text-xs text-muted-foreground">
              เสร็จสิ้นแล้ว {doneCount} จาก {total} รายการ ({progressPct}%)
            </p>
          </div>
          <Progress value={progressPct} />
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <div className="relative min-w-[220px] flex-1 sm:max-w-[350px]">
            <Search
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหาเครื่องมือ, PO, ใบรับรอง หรือผู้ให้บริการ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {["all", "ready", "po", "emailed", "sent_out", "done", "overdue"].map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${chipClass(k)}`}
            >
              {k === "all"
                ? "ทั้งหมด"
                : k === "ready"
                  ? "รอออก PO"
                  : k === "po"
                    ? "มี PO"
                    : k === "emailed"
                      ? "แจ้งแล้ว"
                      : k === "sent_out"
                        ? "รอใบรับรอง"
                        : k === "done"
                          ? "เสร็จสิ้น"
                          : "เกินกำหนด"}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            <span>รายการติดตามงานสอบเทียบ</span>
            {!loading && <Badge variant="primary">{filtered.length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<CalRow>
            columns={columns}
            data={filtered}
            idKey="id"
            loading={loading}
            skeletonRows={8}
            pageSize={10}
            caption="ติดตามงานสอบเทียบ"
            emptyTitle="ไม่พบข้อมูล"
            emptyDescription="ลองปรับตัวกรอง หรือเพิ่มแผนสอบเทียบที่เมนูการสอบเทียบ"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
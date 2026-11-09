"use client";

// asset-reliability/replacement — Phase 28
// ประวัติการเปลี่ยนชิ้นส่วน/components ทุกเครื่อง (ข้อมูลจริงจาก component_replacements)

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { Boxes } from "lucide-react";

interface ReplacementRow extends Record<string, unknown> {
  id: number;
  asset_id: number;
  asset_code?: string;
  asset_name?: string;
  component_code?: string;
  component_name?: string;
  replaced_at: string;
  reason?: string | null;
  new_serial_number?: string | null;
  performed_by_name?: string | null;
}

export default function ReplacementPage() {
  const hero = usePageHero("asset-reliability", { title: "เปลี่ยนชิ้นส่วน Components", desc: "ประวัติการเปลี่ยนชิ้นส่วนของเครื่องจักร" });
  const router = useRouter();
  const { data, isLoading, error } = useApiQuery<{ rows: ReplacementRow[] }>(
    ["asset-reliability", "replacements"],
    "/api/v1/asset_reports.php?report=replacement_summary"
  );
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const query = q.trim().toLowerCase();
    return list.filter(
      (r) =>
        !query ||
        String(r.asset_code || "").toLowerCase().includes(query) ||
        String(r.asset_name || "").toLowerCase().includes(query) ||
        String(r.component_name || r.component_code || "").toLowerCase().includes(query)
    );
  }, [data, q]);

  const fmtDate = (d?: string) => (d && d !== "0000-00-00 00:00:00" && d !== "0000-00-00" ? String(d).slice(0, 16) : "—");

  const columns: SimpleColumn<ReplacementRow>[] = [
    { key: "asset", header: "เครื่องจักร", renderCell: (r) => (
      <button type="button" className="text-left hover:underline" onClick={() => router.push(`/asset-reliability/${r.asset_id}`)}>
        <span className="font-medium">{r.asset_code}</span>
        <span className="block text-xs text-muted-foreground">{r.asset_name}</span>
      </button>
    ) },
    { key: "component", header: "ชิ้นส่วน", renderCell: (r) => (
      <span>{r.component_code ? `${r.component_code} · ` : "—"}{r.component_name || ""}</span>
    ) },
    { key: "new_serial_number", header: "Serial ใหม่", renderCell: (r) => <span className="tabular-nums">{r.new_serial_number || "—"}</span> },
    { key: "reason", header: "เหตุผล", renderCell: (r) => <span className="text-sm text-muted-foreground">{r.reason || "—"}</span> },
    { key: "replaced_at", header: "วันที่เปลี่ยน", align: "right", renderCell: (r) => <span className="text-sm tabular-nums">{fmtDate(r.replaced_at)}</span> },
    { key: "performed_by_name", header: "ผู้ดำเนินการ", renderCell: (r) => <span className="text-sm">{r.performed_by_name || "—"}</span> },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description="ประวัติการเปลี่ยนชิ้นส่วนสำคัญของเครื่องจักรทุกเครื่อง — บันทึกผ่านโปรไฟล์เครื่อง (แท็บ Components)"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}

      {!isLoading && data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span>รายการเปลี่ยนชิ้นส่วน</span>
              <Badge variant="primary">{rows.length} รายการ</Badge>
            </CardTitle>
            <CardDescription>
              <Input
                label="ค้นหา"
                isLabelHidden
                placeholder="ค้นหาเครื่อง / ชิ้นส่วน..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-[300px]"
              />
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length > 0 ? (
              <SimpleDataTable
                columns={columns}
                data={rows}
                idKey="id"
                pageSize={10}
                caption="ประวัติการเปลี่ยนชิ้นส่วน"
                emptyTitle="ไม่พบรายการที่ตรงเงื่อนไข"
                emptyDescription="ลองเปลี่ยนคำค้นหา"
              />
            ) : (
              <EmptyState title="ยังไม่มีประวัติเปลี่ยนชิ้นส่วน" description="บันทึกการเปลี่ยนชิ้นส่วนในโปรไฟล์เครื่อง → แท็บ Components" />
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
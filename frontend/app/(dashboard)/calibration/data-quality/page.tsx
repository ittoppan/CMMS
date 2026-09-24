"use client";

import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { ShieldCheck } from "lucide-react";

interface DqCheck {
  name: string;
  severity: string;
  count: number;
  rows: Record<string, any>[];
}

interface DqResult {
  [key: string]: DqCheck;
}

const SEVERITY_META: Record<string, { label: string; variant: "danger" | "warning" }> = {
  error: { label: "ต้องแก้ไข", variant: "danger" },
  warn: { label: "ควรแก้ไข", variant: "warning" },
};

export default function CalibrationDataQualityPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const { data, isLoading } = useApiQuery<DqResult>(["calibration", "data-quality"], "/api/v1/calibration_management.php?resource=data-quality");

  const checks = Object.entries(data ?? {});
  const errorCount = checks.filter(([, c]) => c.severity === "error" && c.count > 0).length;
  const warnCount = checks.filter(([, c]) => c.severity === "warn" && c.count > 0).length;

  const firstRows = (c: DqCheck): Record<string, any>[] => c.rows ?? [];

  const detailCols = (c: DqCheck): SimpleColumn<Record<string, any>>[] =>
    (firstRows(c)[0] ? Object.keys(firstRows(c)[0]).slice(0, 6) : ["id"]).map((k) => ({
      key: k,
      header: k,
      renderCell: (r) => {
        if (k === "id" && r.plan_code) return r.plan_code;
        return r[k] === null || r[k] === undefined || r[k] === "" ? "-" : String(r[k]);
      },
    }));

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "คุณภาพข้อมูล" },
      ]}
      title="คุณภาพข้อมูลสอบเทียบ"
      description="ตรวจสุขภาพข้อมูลสอบเทียบ — ทุกข้อแก้ได้ด้วยข้อมูลจริง ไม่มีการเดา/เติมข้อมูลปลอม"
    >
      {!isLoading && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant={errorCount > 0 ? "danger" : "success"}>
            {errorCount > 0 ? `${errorCount} รายการต้องแก้ไข` : "ไม่มีรายการต้องแก้ไข"} <ShieldCheck className="w-3.5 h-3.5" />
          </Badge>
          <Badge variant={warnCount > 0 ? "warning" : "neutral"}>
            {warnCount > 0 ? `${warnCount} รายการควรแก้ไข` : "ไม่มีรายการควรแก้ไข"}
          </Badge>
        </div>
      )}

      {!isLoading && checks.length === 0 && <Alert variant="info">ไม่มีข้อมูลให้ตรวจ (ยังไม่มีรอบสอบเทียบ)</Alert>}

      {checks.map(([key, c]) => (
        <Card key={key} className="mb-4">
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="text-base">{c.name}</span>
              <Badge variant={c.count > 0 ? SEVERITY_META[c.severity]?.variant ?? "warning" : "success"}>
                {c.count > 0 ? `${c.count} รายการ` : (c.severity === "error" ? "ผ่าน" : "ผ่าน")}
              </Badge>
            </CardTitle>
          </CardHeader>
          {c.count > 0 && (
            <CardContent>
              <SimpleDataTable<Record<string, any>>
                columns={detailCols(c)}
                data={firstRows(c)}
                loading={false}
                skeletonRows={3}
                pageSize={8}
                caption={key}
                emptyTitle="ไม่มีรายการ"
                emptyDescription=""
              />
            </CardContent>
          )}
        </Card>
      ))}
    </PageShell>
  );
}
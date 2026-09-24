"use client";

import { useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useApiQuery } from "@/lib/api";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SimpleDataTable, type SimpleColumn } from "@/components/ui/data-table-adapter";
import { FileCheck2 } from "lucide-react";

interface Certificate {
  id: number;
  certificate_number: string;
  certificate_date?: string | null;
  issuer?: string;
  result?: string | null;
  version: number;
  status: string;
  calibration_id: number;
  asset_code?: string;
  asset_name?: string;
  uploaded_by?: number;
}

export default function CalibrationCertificatesPage() {
  const hero = usePageHero("calibration");
  const router = useRouter();
  const [status, setStatus] = useState("all");

  const { data: certs, isLoading } = useApiQuery<Certificate[]>(
    ["calibration", "certificates", status],
    "/api/v1/calibration_management.php?resource=certificates"
  );

  const columns: SimpleColumn<Certificate>[] = [
    {
      key: "certificate_number",
      header: "เลขใบรับรอง",
      renderCell: (c) => (
        <button type="button" className="font-medium text-[var(--cmms-primary-hover)] hover:underline" onClick={() => router.push(`/calibration/run/${c.calibration_id}`)}>
          {c.certificate_number}
        </button>
      ),
    },
    { key: "certificate_date", header: "วันที่ออก", renderCell: (c) => c.certificate_date || "-" },
    { key: "issuer", header: "ผู้ออก", renderCell: (c) => c.issuer || "-" },
    { key: "result", header: "ผล", renderCell: (c) => (c.result ? <Badge variant={c.result === "pass" ? "success" : "danger"}>{c.result}</Badge> : "-") },
    { key: "version", header: "เวอร์ชัน", renderCell: (c) => <Badge variant="neutral">v{c.version}</Badge> },
    {
      key: "status",
      header: "สถานะ",
      renderCell: (c) => (
        <Badge variant={c.status === "active" ? "success" : c.status === "superseded" ? "warning" : "neutral"}>
          {c.status === "active" ? "ใช้อยู่" : c.status}
        </Badge>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "ใบรับรองสอบเทียบ" },
      ]}
      title="ใบรับรองสอบเทียบ"
      description="ทะเบียนใบรับรองผลสอบเทียบ — เก็บแบบ version ต่อเนื่อง แทนที่จะลบใบเดิม"
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCheck2 className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
            ใบรับรองล่าสุด
            {!isLoading && <Badge variant="primary">{(certs ?? []).length} รายการ</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleDataTable<Certificate>
            columns={columns}
            data={certs ?? []}
            idKey="id"
            loading={isLoading}
            skeletonRows={5}
            pageSize={15}
            caption="ใบรับรองสอบเทียบ"
            emptyTitle="ยังไม่มีใบรับรอง"
            emptyDescription="เปิดหน้ารอบสอบเทียบและใช้ปุ่มแนบใบรับรอง"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
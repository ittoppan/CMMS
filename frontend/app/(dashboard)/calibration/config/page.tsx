"use client";

import { useEffect, useState } from "react";
import { usePageHero } from "@/lib/i18n";
import { apiJson, useApiQuery } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Save } from "lucide-react";

interface CalConfig { [key: string]: string; }

const FIELD_META: Record<string, { group: string; label: string; type: "number" | "select" | "text"; options?: [string, string][] }> = {
  cal_alert_days: { group: "แจ้งเตือน", label: "แจ้งเตือนล่วงหน้ากี่วันก่อนครบกำหนด (AMBER)", type: "number" },
  cal_default_interval_months: { group: "รอบสอบเทียบ", label: "รอบสอบเทียบเริ่มต้น (เดือน)", type: "number" },
  cal_reference_expiry_warn_days: { group: "มาตรฐานอ้างอิง", label: "เตือนมาตรฐานใกล้หมดอายุล่วงหน้า (วัน)", type: "number" },
  cal_compliance_mode: { group: "เกณฑ์ผ่าน", label: "เกณฑ์ผ่านของรอบสอบเทียบ", type: "select", options: [["all_points_pass", "ทุกจุดต้องผ่าน"], ["critical_points_only", "เฉพาะจุดวิกฤต"]] },
  cal_require_review: { group: "Workflow", label: "ต้องมีผู้ตรวจสอบก่อนอนุมัติ", type: "select", options: [["1", "บังคับ"], ["0", "ไม่บังคับ"]] },
  cal_require_certificate: { group: "Workflow", label: "ต้องแนบใบรับรองก่อนอนุมัติ (external/แล็บ)", type: "select", options: [["1", "บังคับ"], ["0", "ไม่บังคับ"]] },
  cal_rca_on_fail: { group: "OOT / RCA", label: "สร้าง OOT event อัตโนมัติเมื่อผลไม่ผ่าน", type: "select", options: [["1", "สร้างอัตโนมัติ"], ["0", "ปิด"]] },
  cal_interval_change_requires_approval: { group: "Workflow", label: "เปลี่ยนรอบสอบเทียบต้องระบุเหตุผล", type: "select", options: [["1", "บังคับ"], ["0", "ไม่บังคับ"]] },
  cal_allow_usage_basis: { group: "รอบสอบเทียบ", label: "อนุญาตแผนแบบการใช้งาน (usage basis)", type: "select", options: [["1", "อนุญาต"], ["0", "ปิด"]] },
  cal_block_oo_against_expired_std: { group: "มาตรฐานอ้างอิง", label: "บล็อกสอบเทียบกับมาตรฐานที่หมดอายุ", type: "select", options: [["1", "บล็อก"], ["0", "เตือนเท่านั้น"]] },
  cal_data_completeness_required: { group: "คุณภาพข้อมูล", label: "บังคับข้อมูลจำเป็นก่อนส่งผลสอบเทียบ", type: "select", options: [["1", "บังคับ"], ["0", "ไม่บังคับ"]] },
  cal_years_validity_default: { group: "ใบรับรอง", label: "ค่าเริ่มต้นอายุใบรับรอง (ปี)", type: "number" },
};

export default function CalibrationConfigPage() {
  const hero = usePageHero("calibration");
  const qc = useQueryClient();
  const { data, isLoading } = useApiQuery<CalConfig>(["calibration", "config"], "/api/v1/calibration_management.php?resource=config");
  const [values, setValues] = useState<CalConfig>({});
  const [msg, setMsg] = useState<{ type?: "ok" | "err"; text?: string }>({});

  useEffect(() => {
    if (data) setValues({ ...data });
  }, [data]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      apiJson("/api/v1/calibration_management.php", {
        method: "POST",
        body: JSON.stringify({ action: "config_save", settings: values }),
      }),
    onSuccess: (r: any) => {
      setMsg({ type: "ok", text: r.message || "บันทึกแล้ว" });
      qc.invalidateQueries({ queryKey: ["calibration"] });
    },
    onError: (e: Error) => setMsg({ type: "err", text: e.message }),
  });

  const groups = Object.keys(FIELD_META);
  const groupNames = [...new Set(groups.map((k) => FIELD_META[k].group))];

  if (isLoading) return <PageShell title="ตั้งค่าสอบเทียบ" description="กำลังโหลด..."><Skeleton className="h-48 w-full" /></PageShell>;

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: "ตั้งค่าสอบเทียบ" },
      ]}
      title="ตั้งค่าสอบเทียบ"
      description="นโยบายการสอบเทียบของระบบ — ใช้ร่วมกับการตั้งค่าระบบอื่น"
      actions={
        <Button variant="primary" disabled={isPending} onClick={() => save()}>
          <Save className="w-4 h-4" /> {isPending ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </Button>
      }
    >
      {msg.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg.type === "err" && <Alert variant="danger">{msg.text}</Alert>}

      {groupNames.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              {group}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groups.filter((k) => FIELD_META[k].group === group).map((key) => {
              const meta = FIELD_META[key];
              const isSelect = meta.type === "select";
              return (
                <div key={key} className="space-y-1.5">
                  <label htmlFor={`cfg-${key}`} className="text-sm font-medium">{meta.label}</label>
                  {isSelect ? (
                    <select
                      id={`cfg-${key}`}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={values[key] ?? ""}
                      onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    >
                      {(meta.options || []).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`cfg-${key}`}
                      type={meta.type}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={values[key] ?? ""}
                      onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">{key}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </PageShell>
  );
}
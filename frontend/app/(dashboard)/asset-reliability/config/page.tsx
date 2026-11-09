"use client";

// asset-reliability/config — Phase 28
// ตั้งค่า Reliability & Criticality (GET/POST asset_reliability.php?action=config)

import { useState, useEffect } from "react";
import { usePageHero } from "@/lib/i18n";
import { useApiQuery, apiJson } from "@/lib/api";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Settings2, CheckCircle2 } from "lucide-react";

interface FactorDef { code: string; label: string; hint: string; }
const FACTORS: FactorDef[] = [
  { code: "ar_criticality_w_production", label: "น้ำหนัก: ผลกระทบต่อการผลิต", hint: "10" },
  { code: "ar_criticality_w_safety", label: "น้ำหนัก: ความปลอดภัย", hint: "25" },
  { code: "ar_criticality_w_quality", label: "น้ำหนัก: คุณภาพ", hint: "10" },
  { code: "ar_criticality_w_cost", label: "น้ำหนัก: ค่าใช้จ่าย", hint: "10" },
  { code: "ar_criticality_w_downtime", label: "น้ำหนัก: downtime", hint: "15" },
  { code: "ar_criticality_w_frequency", label: "น้ำหนัก: ความถี่เสียบ่อย", hint: "15" },
  { code: "ar_criticality_w_redundancy", label: "น้ำหนัก: สำรองเครื่อง", hint: "15" },
];
const FIELD_DEFS: { key: string; label: string; hint: string }[] = [
  { key: "ar_criticality_threshold_a", label: "เกณฑ์คลาส A (%)", hint: "80" },
  { key: "ar_criticality_threshold_b", label: "เกณฑ์คลาส B (%)", hint: "60" },
  { key: "ar_criticality_threshold_c", label: "เกณฑ์คลาส C (%)", hint: "40" },
  { key: "ar_criticality_review_days", label: "รอบทบทวน criticality (วัน)", hint: "365" },
  { key: "ar_min_failures_for_mtbf", label: "จำนวน failures ขั้นต่ำคำนวณ MTBF", hint: "2" },
  { key: "ar_reliability_window_months", label: "ช่วงคำนวณ reliability (เดือน)", hint: "12" },
  { key: "ar_health_window_months", label: "ช่วงคำนวณ health (เดือน)", hint: "12" },
  { key: "ar_retirement_min_age_years", label: "เกณฑ์อายุพิจารณา (ปี)", hint: "10" },
  { key: "ar_overhaul_reminder_days", label: "เตือนล่วงหน้าครบรอบยกเครื่อง (วัน)", hint: "30" },
];

export default function ConfigPage() {
  const hero = usePageHero("asset-reliability/config");
  const { data, isLoading, error } = useApiQuery<{ config: Record<string, any>; factors?: any }>(
    ["asset-reliability", "config"], "/api/v1/asset_reliability.php?action=config"
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data?.config) {
      const v: Record<string, string> = {};
      for (const [k, val] of Object.entries(data.config)) v[k] = String(val);
      setValues(v);
    }
  }, [data]);

  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiJson<{ success?: boolean; updated?: number; message?: string }>("/api/v1/asset_reliability.php?action=config", {
        method: "POST",
        body: JSON.stringify({ action: "config", values }),
      } as RequestInit);
      setMsg(res.success ? { ok: true, text: `บันทึกสำเร็จ (${res.updated ?? 0} ค่า)` } : { ok: false, text: res.message || "บันทึกไม่สำเร็จ" });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || "เกิดข้อผิดพลาด" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "Reliability", href: "/asset-reliability" }, { label: hero.title }]}
      title={hero.title}
      description={hero.desc}
    >
      {isLoading && (
        <div className="flex items-center justify-center py-16"><Spinner label="กำลังโหลด..." /></div>
      )}
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error.message} />}

      {!isLoading && data && (
        <Grid columns={{ minWidth: 320, max: 2 }} gap={4}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <span>ค่าน้ำหนักการประเมินความสำคัญ</span>
              </CardTitle>
              <CardDescription>
                น้ำหนักแต่ละปัจจัยใช้ประเมินคะแนน criticality (ข้อมูลจริง ไม่ใช่คำแนะนำอัตโนมัติ) — เปลี่ยนแปลงได้ตามบริบทโรงงาน
                <span className="block text-xs">ผลรวมของน้ำหนักทั้งหมด: {FACTORS.reduce((s, f) => s + (Number(values[f.code]) || 0), 0)}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {FACTORS.map((f) => (
                <Input
                  key={f.code}
                  label={f.label}
                  type="number"
                  value={values[f.code] ?? ""}
                  onChange={(e) => set(f.code, e.target.value)}
                  hint={`ค่าแนะนำ: ${f.hint}`}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <span>เกณฑ์และรอบการคำนวณ</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {FIELD_DEFS.map((f) => (
                <Input
                  key={f.key}
                  label={f.label}
                  type="number"
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  hint={`ค่าแนะนำ: ${f.hint}`}
                />
              ))}
              {msg && <Alert variant={msg.ok ? "success" : "danger"} title={msg.ok ? "สำเร็จ" : "ผิดพลาด"} description={msg.text} />}
              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="primary" onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}</Button>
              </div>
            </CardContent>
          </Card>
        </Grid>
      )}
    </PageShell>
  );
}
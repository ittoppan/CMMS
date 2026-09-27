"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ToastProvider";
import { ArrowLeft, GitPullRequest, ShieldAlert } from "lucide-react";
import {
  fetchEcrConfig, fetchEcrOptions, ecrPost,
  ECR_PRIORITY_LABELS,
  type EcrConfigResponse, type EcrOptions,
} from "@/lib/engineering_change";
import { newClientActionId } from "@/lib/document";

const Field = ({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-xs font-semibold">{label}{required ? " *" : ""}</label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export default function CreateEngineeringChangePage() {
  const router = useRouter();
  const hero = usePageHero("engineering-changes/create");
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<EcrConfigResponse | null>(null);
  const [options, setOptions] = useState<EcrOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [f, setF] = useState({
    title: "", change_type: "", priority: "medium",
    description: "", reason: "", department_id: "", asset_id: "", required_by_date: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const c = await fetchEcrConfig();
        setCfg(c);
        setOptions(await fetchEcrOptions());
        setF((s) => ({ ...s, change_type: s.change_type || Object.keys(c.config.change_types ?? {})[0] || "other" }));
      } catch (e: any) {
        setError(e?.message || "โหลดค่าตั้งต้นไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit() {
    if (!f.title.trim()) { setError("กรุณาระบุหัวข้อ ECR"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await ecrPost<{ id: number; ecr_no: string }>({
        action: "create",
        title: f.title.trim(),
        change_type: f.change_type,
        priority: f.priority,
        description: f.description.trim(),
        reason: f.reason.trim(),
        department_id: f.department_id || 0,
        asset_id: f.asset_id || 0,
        required_by_date: f.required_by_date,
        client_action_id: newClientActionId("ecrcreate"),
      });
      showToast("success", `สร้าง ${res.ecr_no ?? "ECR"} สำเร็จ — สถานะเริ่มต้นคือร่าง`);
      router.push(`/engineering-changes/${res.id}`);
    } catch (e: any) {
      setError(e?.message || "สร้าง ECR ไม่สำเร็จ");
      showToast("error", e?.message || "สร้าง ECR ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  }

  const changeTypes = (cfg?.config?.change_types ?? {}) as Record<string, string>;
  const depts = options?.departments ?? [];
  const assets = options?.assets ?? [];
  const sla = cfg?.config?.sla ?? {};
  const can = cfg?.can;

  if (!can?.create) {
    return (
      <div className="space-y-4">
        <Alert variant="warning" title="ไม่มีสิทธิ์เปิด ECR" description="ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ engineering_change/create" />
        <Link href="/engineering-changes" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft size={15} aria-hidden="true" /> กลับไปรายการ ECR
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <Link href="/engineering-changes" className={buttonVariants({ variant: "secondary" })}>
          <ArrowLeft size={15} aria-hidden="true" /> รายการ ECR
        </Link>
      </div>

      {error && <Alert variant="danger" title="ไม่สามารถสร้าง ECR" description={error} />}

      <Alert variant="info" title="ECR เริ่มต้นที่สถานะร่าง และเปลี่ยนสถานะทางเดียว"
        description="ลำดับ: ร่าง → ส่งแล้ว → ตรวจทาน → ประเมินผลกระทบ → รออนุมัติ → ดำเนินงาน → ตรวจสอบผล → ปิดงาน" />

      {f.priority === "critical" && (
        <Alert variant="warning" title="ECR ระดับวิกฤตมีข้อบังคับเพิ่ม"
          description="ต้องประเมินผลกระทบที่มี owner และ action ที่ต้องทำ และต้องผ่านขั้นตอน engineering_approval ก่อนดำเนินงาน" />
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>รายละเอียด ECR</CardTitle>
            <CardDescription>ช่องที่มี * ต้องกรอก · เลขที่ ECR ระบบสร้างให้อัตโนมัติ</CardDescription>
          </div>
          <GitPullRequest size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="หัวข้อ ECR" required>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="เช่น เปลี่ยนระยะเวลาตรวจสอบสายพานระหว่างจาก 6 เดือนเป็น 3 เดือน" />
            </Field>
          </div>

          <Field label="ประเภทการเปลี่ยนแปลง" required>
            <Select value={f.change_type} onValueChange={(v) => setF({ ...f, change_type: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
              <SelectContent>
                {Object.entries(changeTypes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="ระดับความสำคัญ" hint={sla.sla_by_priority ? "SLA ต่างกันตามระดับความสำคัญ" : undefined}>
            <Select value={f.priority} onValueChange={(v) => setF({ ...f, priority: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ECR_PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="แผนก">
            <Select value={f.department_id} onValueChange={(v) => setF({ ...f, department_id: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(ไม่ระบุ)</SelectItem>
                {depts.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="เครื่องจักรที่ได้รับผลกระทบ">
            <Select value={f.asset_id} onValueChange={(v) => setF({ ...f, asset_id: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(ไม่ระบุ)</SelectItem>
                {assets.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="กำหนดเสร็จ" hint="ใช้คำนวณ SLA และแจ้งเตือนเมื่อใกล้ครบกำหนด">
            <Input type="date" value={f.required_by_date} onChange={(e) => setF({ ...f, required_by_date: e.target.value })} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="รายละเอียดการเปลี่ยนแปลง">
              <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
                placeholder="สิ่งที่เปลี่ยน ขอบเขต และสิ่งที่ไม่เปลี่ยน" />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="เหตุผลของการเปลี่ยนแปลง">
              <Textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })}
                placeholder="เช่น ผลจากการวิเคราะห์ความเสี่ยง / ข้อกำหนดภายนอก / ปัญหาที่พบ" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Alert variant="warning" title="ECR ไม่แก้ข้อมูลหลักอัตโนมัติ"
        description="เมื่อการเปลี่ยนแปลงกระทบเอกสาร อะไหล่ PM หรือ RCA ต้องผูกลิงก์ในแท็บความเชื่อมโยง และแก้ไขเองอย่างมีผู้รับผิดชอบ" />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
        <Button onClick={submit} disabled={busy}>
          <ShieldAlert size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "เปิด ECR"}
        </Button>
      </div>
    </div>
  );
}

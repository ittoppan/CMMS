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
import { ArrowLeft, FileText, BookMarked } from "lucide-react";
import {
  fetchDocConfig, fetchDocOptions, docPost, newClientActionId,
  CONFIDENTIALITY_LABELS,
  type DocConfigResponse, type DocOptions,
} from "@/lib/document";

const Field = ({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <label className="text-xs font-semibold">{label}{required ? " *" : ""}</label>
    {children}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export default function CreateDocumentPage() {
  const router = useRouter();
  const hero = usePageHero("documents/create");
  const { showToast } = useToast();

  const [cfg, setCfg] = useState<DocConfigResponse | null>(null);
  const [options, setOptions] = useState<DocOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [f, setF] = useState({
    title: "", doc_no: "", doc_type: "", description: "",
    owner_id: "", department_id: "", asset_id: "",
    confidentiality: "", requires_acknowledgement: true, requires_training: false,
    review_cycle_days: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const c = await fetchDocConfig();
        setCfg(c);
        setOptions(await fetchDocOptions());
        setF((s) => ({
          ...s,
          doc_type: s.doc_type || c.config.doc_types?.[0]?.key || "",
          confidentiality: s.confidentiality || c.config.default_confidentiality || "internal",
        }));
      } catch (e: any) {
        setError(e?.message || "โหลดค่าตั้งต้นไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit() {
    if (!f.title.trim()) { setError("กรุณาระบุชื่อเอกสาร"); return; }
    if (!f.doc_type) { setError("กรุณาเลือกประเภทเอกสาร"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await docPost<{ id: number }>({
        action: "create",
        title: f.title.trim(),
        doc_no: f.doc_no.trim(),
        doc_type: f.doc_type,
        description: f.description.trim(),
        owner_id: f.owner_id || 0,
        department_id: f.department_id || 0,
        asset_id: f.asset_id || 0,
        confidentiality: f.confidentiality,
        requires_acknowledgement: f.requires_acknowledgement ? 1 : 0,
        requires_training: f.requires_training ? 1 : 0,
        review_cycle_days: f.review_cycle_days || 0,
        client_action_id: newClientActionId("doccreate"),
      });
      showToast("success", "สร้างเอกสารสำเร็จ — ระบบสร้าง revision 1.0 (ร่าง) ให้อัตโนมัติ");
      router.push(`/documents/${res.id}`);
    } catch (e: any) {
      setError(e?.message || "สร้างเอกสารไม่สำเร็จ");
      showToast("error", e?.message || "สร้างเอกสารไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div>;
  }

  const types = options?.doc_types ?? cfg?.config?.doc_types ?? [];
  const users = options?.users ?? [];
  const depts = options?.departments ?? [];
  const assets = options?.assets ?? [];
  const reviewCycle = cfg?.config?.review_cycle ?? {};
  const can = cfg?.can;

  if (!can?.create) {
    return (
      <div className="space-y-4">
        <Alert variant="warning" title="ไม่มีสิทธิ์สร้างเอกสาร" description="ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์ document/create" />
        <Link href="/documents" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeft size={15} aria-hidden="true" /> กลับไปทะเบียนเอกสาร
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
        <Link href="/documents" className={buttonVariants({ variant: "secondary" })}>
          <ArrowLeft size={15} aria-hidden="true" /> ทะเบียนเอกสาร
        </Link>
      </div>

      {error && <Alert variant="danger" title="ไม่สามารถสร้างเอกสาร" description={error} />}

      <Alert variant="info" title="ระบบสร้าง revision 1.0 ให้อัตโนมัติ"
        description="เอกสารทุกฉบับต้องมี revision — หลังสร้างแล้วให้ไปหน้าเอกสารเพื่อแนบไฟล์และส่งตรวจทาน" />

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>ข้อมูลเอกสาร</CardTitle>
            <CardDescription>ช่องที่มี * ต้องกรอก</CardDescription>
          </div>
          <FileText size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="ชื่อเอกสาร" required>
              <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })}
                placeholder="เช่น คู่มือการทำงานปลอดภัยด้วย LOTO" />
            </Field>
          </div>

          <Field label="ประเภทเอกสาร" required>
            <Select value={f.doc_type} onValueChange={(v) => setF({ ...f, doc_type: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="เลือกประเภท" /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}{t.requires_approval ? " (ต้องอนุมัติ)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="เลขเอกสาร" hint="เว้นว่างให้ระบบสร้างตามประเภทอัตโนมัติ">
            <Input value={f.doc_no} onChange={(e) => setF({ ...f, doc_no: e.target.value })}
              placeholder="เช่น SOP-2026-001" className="font-mono" />
          </Field>

          <Field label="ระดับการเข้าถึง">
            <Select value={f.confidentiality} onValueChange={(v) => setF({ ...f, confidentiality: v })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CONFIDENTIALITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="รอบการทบทวน" hint="เว้นว่างเพื่อใช้ค่าเริ่มต้นของประเภทเอกสาร">
            <Select value={f.review_cycle_days} onValueChange={(v) => setF({ ...f, review_cycle_days: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="ค่าเริ่มต้น" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(ค่าเริ่มต้น)</SelectItem>
                {[90, 180, 365, 730].map((d) => <SelectItem key={d} value={String(d)}>{d} วัน</SelectItem>)}
                {Object.entries(reviewCycle).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{String(v)} วัน (มาตรฐาน)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="เจ้าของเอกสาร" hint="เว้นว่างเพื่อใช้ผู้สร้าง">
            <Select value={f.owner_id} onValueChange={(v) => setF({ ...f, owner_id: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="ตัวเอง" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(ตัวเอง)</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
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

          <Field label="เครื่องจักรที่เกี่ยวข้อง" hint="ใช้ค้นหาเอกสารที่มีผลบังคับใช้กับเครื่องจักรได้">
            <Select value={f.asset_id} onValueChange={(v) => setF({ ...f, asset_id: v })}>
              <SelectTrigger className="w-full"><SelectValue placeholder="ไม่ระบุ" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">(ไม่ระบุ)</SelectItem>
                {assets.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-2 sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={f.requires_acknowledgement}
                onChange={(e) => setF({ ...f, requires_acknowledgement: e.target.checked })} />
              <span>
                <span className="font-medium">ต้องรับทราบ</span>
                <span className="block text-xs text-muted-foreground">
                  ทุกคนที่ได้รับมอบหมายต้องยืนยันว่าอ่านฉบับที่มีผลบังคับใช้แล้ว ภายใน {cfg?.config?.ack_due_days ?? 7} วัน
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={f.requires_training}
                onChange={(e) => setF({ ...f, requires_training: e.target.checked })} />
              <span>
                <span className="font-medium">ต้องผ่านการอบรม</span>
                <span className="block text-xs text-muted-foreground">
                  ใช้เมื่อเอกสารเป็นขั้นตอนปฏิบัติงานที่ต้องประเมินความเข้าใจก่อนปฏิบัติ
                </span>
              </span>
            </label>
          </div>

          <div className="sm:col-span-2">
            <Field label="รายละเอียด">
              <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
                placeholder="ขอบเขต ผู้ที่เกี่ยวข้อง หรือหมายเหตุสำคัญ" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>ยกเลิก</Button>
        <Button onClick={submit} disabled={busy}>
          <BookMarked size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "สร้างเอกสาร"}
        </Button>
      </div>
    </div>
  );
}

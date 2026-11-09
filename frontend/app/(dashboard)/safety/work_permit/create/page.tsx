"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ToastProvider";
import { FileCheck, ChevronLeft } from "lucide-react";
import {
  fetchOptions, wpPost, CATEGORY_LABELS, PATHS,
  type OptionsResponse, type PermitType,
} from "@/lib/safety";

function toLocalInput(v: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}T${pad(v.getHours())}:${pad(v.getMinutes())}`;
}

export default function WorkPermitCreatePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [opts, setOpts] = useState<OptionsResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedType, setSelectedType] = useState<PermitType | null>(null);
  const [form, setForm] = useState({
    permit_type_code: "hot_work",
    asset_id: "",
    repair_id: "",
    work_source: "internal",
    contractor_id: "",
    location: "",
    work_description: "",
    start_at: "",
    end_at: "",
    supervisor_id: "",
    safety_reviewer_id: "",
    area_owner_id: "",
  });

  useEffect(() => {
    const starts = new Date();
    const ends = new Date(starts.getTime() + 4 * 3600 * 1000);
    setForm((f) => ({ ...f, start_at: toLocalInput(starts), end_at: toLocalInput(ends) }));
    fetchOptions().then((o) => {
      setOpts(o);
      const init = o.permit_types.find((t) => t.code === "hot_work") || o.permit_types[0];
      if (init) {
        setSelectedType(init);
        setForm((f) => ({ ...f, permit_type_code: init.code }));
      }
    }).catch((e: any) => setError(e?.message || "โหลดข้อมูลไม่สำเร็จ"));
  }, []);

  useEffect(() => {
    if (!selectedType) return;
    const starts = new Date();
    const ends = new Date(starts.getTime() + (selectedType.default_valid_hours || 8) * 3600 * 1000);
    setForm((f) => ({ ...f, start_at: toLocalInput(starts), end_at: toLocalInput(ends) }));
  }, [selectedType]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.work_description.trim()) { setError("กรุณาระบุรายละเอียดงาน"); return; }
    if (!form.start_at) { setError("กรุณาระบุเวลาเริ่มงาน"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await wpPost<{ id: number; permit_no: string; status: string }>("create", {
        permit_type_code: form.permit_type_code,
        asset_id: form.asset_id || undefined,
        repair_id: form.repair_id || undefined,
        work_source: form.work_source,
        contractor_id: form.contractor_id || undefined,
        location: form.location.trim() || undefined,
        work_description: form.work_description.trim(),
        start_at: form.start_at,
        end_at: form.end_at || undefined,
        supervisor_id: form.supervisor_id || undefined,
        safety_reviewer_id: form.safety_reviewer_id || undefined,
        area_owner_id: form.area_owner_id || undefined,
      });
      showToast("success", `สร้างใบอนุญาต ${res.permit_no} เรียบร้อย (ร่าง)`);
      router.push(PATHS.detail(res.id));
    } catch (e: any) {
      setError(e?.message || "สร้างใบอนุญาตไม่สำเร็จ");
      setSubmitting(false);
    }
  };

  const reqBy = (cat: string) => (selectedType?.requirements || []).filter((r) => r.category === cat && r.is_active);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SAFETY · WORK PERMIT · CREATE</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ใบอนุญาตทำงานเสี่ยง (PTW)", href: PATHS.list },
        { label: "ออกใบอนุญาตใหม่" },
      ]}
      title="ออกใบอนุญาตทำงานเสี่ยง"
      description="ข้อมูลจะถูกตรวจสอบและอนุมัติโดยระบบฝั่ง backend — ระบบจะสร้างสายอนุมัติตามประเภทงานโดยอัตโนมัติ"
      actions={
        <Button variant="secondary" onClick={() => router.push(PATHS.list)}>
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> กลับไปรายการ
        </Button>
      }
    >
      {error && <Alert variant="danger" title="ไม่สามารถสร้างใบอนุญาตได้" description={error} />}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardContent className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>ประเภทงานเสี่ยง <span className="text-destructive">*</span></Label>
                  <Select value={form.permit_type_code} onValueChange={(v) => set("permit_type_code", v)}>
                    <SelectTrigger aria-label="ประเภทงานเสี่ยง"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(opts?.permit_types || []).map((t) => (
                        <SelectItem key={t.code} value={t.code}>
                          {t.name_th}{t.name_en ? ` (${t.name_en})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedType && (
                    <p className="text-xs text-[var(--cmms-text-secondary)]">
                      ใช้ได้ {selectedType.default_valid_hours} ชม.
                      {selectedType.requires_isolation ? " · ต้องตัดพลังงาน (LOTO)" : ""}
                      {selectedType.requires_gas_test ? " · ต้องตรวจแก๊ส" : ""}
                      {selectedType.requires_worker_auth ? " · ต้องตรวจสอบคนทำงาน" : ""}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>งานที่อ้างอิง (ใบสั่งงาน)</Label>
                  <Select value={form.repair_id} onValueChange={(v) => set("repair_id", v)}>
                    <SelectTrigger aria-label="ใบสั่งงาน"><SelectValue placeholder="ไม่บังคับ" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่ระบุ</SelectItem>
                      {(opts?.wos || []).map((w) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.work_order_no || `WO-${w.id}`}{w.title ? ` — ${w.title}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>เครื่องจักร / อุปกรณ์</Label>
                  <Select value={form.asset_id} onValueChange={(v) => set("asset_id", v)}>
                    <SelectTrigger aria-label="เครื่องจักร"><SelectValue placeholder="ไม่บังคับ" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ไม่ระบุ</SelectItem>
                      {(opts?.assets || []).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.code}{a.name ? ` — ${a.name}` : ""}
                          {a.criticality ? ` [${a.criticality.toUpperCase()}]` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>สถานที่ปฏิบัติงาน</Label>
                  <Input placeholder="เช่น ไลน์ 1 ฝั่งคนงานอัด" value={form.location} onChange={(e) => set("location", e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>แนะนำเริ่มงาน</Label>
                  <Input type="datetime-local" value={form.start_at} onChange={(e) => set("start_at", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>สิ้นสุด (หมดอายุใบอนุญาต)</Label>
                  <Input type="datetime-local" value={form.end_at} onChange={(e) => set("end_at", e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>รายละเอียดงาน <span className="text-destructive">*</span></Label>
                <Textarea
                  rows={3}
                  placeholder="อธิบายลักษณะงานที่จะทำ — สิ่งที่เกี่ยวข้องกับความเสี่ยง เช่น ตัด/เชื่อม/ปีน/เข้าอับอากาศ..."
                  value={form.work_description}
                  onChange={(e) => set("work_description", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">ผู้เกี่ยวข้อง</h2>
                <Badge variant="info" dot>ฝั่ง backend จะสร้างสายอนุมัติตามประเภทงาน</Badge>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>หัวหน้างาน (Supervisor)</Label>
                  <Select value={form.supervisor_id} onValueChange={(v) => set("supervisor_id", v)}>
                    <SelectTrigger aria-label="หัวหน้างาน"><SelectValue placeholder="เลือก" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                      {(opts?.users || []).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.full_name || u.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>เจ้าหน้าที่ความปลอดภัย (Safety Reviewer)</Label>
                  <Select value={form.safety_reviewer_id} onValueChange={(v) => set("safety_reviewer_id", v)}>
                    <SelectTrigger aria-label="เจ้าหน้าที่ความปลอดภัย"><SelectValue placeholder="เลือก" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                      {(opts?.users || []).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.full_name || u.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedType?.requires_area_owner ? (
                  <div className="space-y-1.5">
                    <Label>เจ้าของพื้นที่ (Area Owner)</Label>
                    <Select value={form.area_owner_id} onValueChange={(v) => set("area_owner_id", v)}>
                      <SelectTrigger aria-label="เจ้าของพื้นที่"><SelectValue placeholder="เลือก" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                        {(opts?.users || []).map((u) => (
                          <SelectItem key={u.id} value={String(u.id)}>{u.full_name || u.username}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>ลักษณะผู้ทำงาน</Label>
                  <Select value={form.work_source} onValueChange={(v) => set("work_source", v)}>
                    <SelectTrigger aria-label="ลักษณะผู้ทำงาน"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">พนักงานภายใน</SelectItem>
                      <SelectItem value="contractor">ผู้รับจ้างภายนอก</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.work_source === "contractor" && (
                  <div className="space-y-1.5">
                    <Label>บริษัทผู้รับจ้าง</Label>
                    <Select value={form.contractor_id} onValueChange={(v) => set("contractor_id", v)}>
                      <SelectTrigger aria-label="บริษัทผู้รับจ้าง"><SelectValue placeholder="เลือกบริษัท" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— ไม่ระบุ —</SelectItem>
                        {(opts?.contractors || []).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedType && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">ข้อกำหนดของงานนี้</h2>
                <p className="text-xs text-[var(--cmms-text-secondary)]">
                  ระบบจะให้ผู้ปฏิบัติยืนยัน/ตรวจสอบรายการด้านล่างตามรอบงาน
                </p>
              </div>
              {["ppe", "equipment", "control", "check", "gas", "emergency", "admin"].map((cat) => {
                const rows = reqBy(cat);
                if (!rows.length) return null;
                return (
                  <div key={cat}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--cmms-text-secondary)]">
                      {CATEGORY_LABELS[cat] || cat}
                    </p>
                    <ul className="space-y-1">
                      {rows.map((r) => (
                        <li key={r.id} className="flex items-start gap-2 text-sm text-[var(--cmms-text-primary)]">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cmms-primary)]" aria-hidden="true" />
                          <span>{r.label_th}{r.is_mandatory ? "" : " (แนะนำ)"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              <div className="mt-4 border-t border-border pt-4">
                <h2 className="mb-2 text-sm font-semibold text-foreground">สายอนุมัติที่ระบบจะสร้าง</h2>
                <ul className="space-y-1.5">
                  {(Array.isArray(selectedType.approval_flow) ? selectedType.approval_flow : []).map((f, i) => {
                    const label = typeof f === "string" ? f : (f as any)?.label || (f as any)?.role_key;
                    return (
                      <li key={i} className="flex items-center gap-2 text-sm text-[var(--cmms-text-primary)]">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--cmms-bg-muted)] text-[10px] font-semibold">{i + 1}</span>
                        {label}
                      </li>
                    );
                  })}
                  {!Array.isArray(selectedType.approval_flow) || !selectedType.approval_flow.length ? (
                    <li className="text-xs text-[var(--cmms-text-secondary)]">หัวหน้างาน → เจ้าหน้าที่ความปลอดภัย (ค่าเริ่มต้น)</li>
                  ) : null}
                </ul>
                <Button className="mt-4 w-full" onClick={submit} disabled={submitting}>
                  <FileCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                  {submitting ? "กำลังสร้าง..." : "สร้างใบอนุญาต (ร่าง)"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
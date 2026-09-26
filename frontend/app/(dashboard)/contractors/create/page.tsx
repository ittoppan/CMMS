"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ToastProvider";
import { ArrowLeft, Save, Plus, Trash2, HardHat } from "lucide-react";
import { CtrOptions, fetchCtrOptions, ctrPost, ServiceCategory } from "@/lib/contractor";

const inputCls = "h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]";

interface ContactRow {
  full_name: string;
  role: string;
  phone: string;
  email: string;
  line_id: string;
}

export default function ContractorCreatePage() {
  const hero = usePageHero("contractors/create");
  const router = useRouter();
  const { showToast } = useToast();

  const [options, setOptions] = useState<CtrOptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [safetyTrainingExpiry, setSafetyTrainingExpiry] = useState("");
  const [ownerId, setOwnerId] = useState("0");
  const [status, setStatus] = useState("draft");
  const [cats, setCats] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([{ full_name: "", role: "", phone: "", email: "", line_id: "" }]);

  useEffect(() => {
    fetchCtrOptions()
      .then(setOptions)
      .catch((e: any) => setError(e?.message || "โหลดตัวเลือกไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  const toggleCat = (k: string) => {
    setCats((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const setContact = (i: number, k: keyof ContactRow, v: string) => {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)));
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        action: "create",
        company_name: companyName.trim(),
        legal_name: legalName.trim() || undefined,
        registration_no: registrationNo.trim() || undefined,
        tax_id: taxId.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        contact_person: contactPerson.trim() || undefined,
        license_no: licenseNo.trim() || undefined,
        safety_training_expiry: safetyTrainingExpiry || undefined,
        internal_owner_id: Number(ownerId) || undefined,
        status,
        service_categories: cats,
        notes: notes.trim() || undefined,
        contacts: contacts.filter((c) => c.full_name.trim() !== ""),
      };
      const res = await ctrPost<{ success: boolean; id: number; code: string; status: string }>(payload);
      showToast("success", `สร้างผู้รับเหมา ${res.code || ""} สำเร็จ`.trim());
      router.push(`/contractors/${res.id}`);
    } catch (e: any) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
      showToast("error", e?.message || "สร้างผู้รับเหมาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="space-y-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>;
  }

  const catsEnabled = (options?.service_categories ?? []).filter((c: ServiceCategory) => c.enabled !== false);
  const users = options?.users ?? [];

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><HardHat size={13} aria-hidden="true" /> Phase 31</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <a href="/contractors" className={buttonVariants({ variant: "secondary" })}><ArrowLeft size={16} aria-hidden="true" /> ย้อนกลับ</a>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลบริษัท</CardTitle>
          <CardDescription>ข้อมูลทะเบียนที่ใช้ตรวจสอบความเป็นนิติบุคคล — ชื่อซ้ำ/เลขผู้เสียภาษีซ้ำถูกบล็อกโดยระบบ</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ชื่อบริษัท/ผู้รับเหมา *</span>
            <input className={inputCls} value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="เช่น บริษัท เอสที แมชชีน จำกัด" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ชื่อนิติบุคคล (ตามทะเบียน)</span>
            <input className={inputCls} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">เลขที่จดทะเบียน</span>
            <input className={inputCls} value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">เลขประจำตัวผู้เสียภาษี</span>
            <input className={inputCls} value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="13 หลัก" />
          </label>
          <label className="block sm:col-span-2 lg:col-span-2">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ที่อยู่</span>
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ผู้ติดต่อหลัก</span>
            <input className={inputCls} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">โทรศัพท์</span>
            <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">อีเมล</span>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">เลขใบอนุญาตประกอบกิจการ</span>
            <input className={inputCls} value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">วันหมดอายุอบรมความปลอดภัย</span>
            <input className={inputCls} type="date" value={safetyTrainingExpiry} onChange={(e) => setSafetyTrainingExpiry(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">ผู้ดูแลภายใน (Internal Owner)</span>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="เลือกผู้ดูแล" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">— ยังไม่ระบุ —</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">สถานะเริ่มต้น</span>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">ร่าง</SelectItem>
                <SelectItem value="pending_qualification">รอประเมินคุณสมบัติ</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">หมายเหตุ</span>
            <textarea className={inputCls + " h-20 resize-none"} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>หมวดงานบริการ</CardTitle>
          <CardDescription>เลือกหมวดที่ผู้รับเหมาให้บริการ — ใช้ตรวจใบรับรองพนักงานเมื่อว่าจ้างในหมวดนั้น</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {catsEnabled.map((c: ServiceCategory) => {
            const active = cats.includes(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCat(c.key)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)]/10 text-[var(--cmms-primary)]"
                    : "border-[var(--cmms-border)] bg-[var(--cmms-bg)] text-muted-foreground hover:border-[var(--cmms-border-focus)]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>ผู้ติดต่อ</CardTitle>
            <CardDescription>เพิ่มผู้ติดต่อได้ตอนสร้าง (คนแรก = primary)</CardDescription>
          </div>
          <Button variant="secondary" onClick={() => setContacts((p) => [...p, { full_name: "", role: "", phone: "", email: "", line_id: "" }])}>
            <Plus size={15} aria-hidden="true" /> เพิ่มผู้ติดต่อ
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {contacts.map((c, i) => (
            <div key={i} className="grid gap-3 rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)]/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <input className={inputCls} value={c.full_name} onChange={(e) => setContact(i, "full_name", e.target.value)} placeholder="ชื่อ-นามสกุล" />
              <input className={inputCls} value={c.role} onChange={(e) => setContact(i, "role", e.target.value)} placeholder="ตำแหน่ง" />
              <input className={inputCls} value={c.phone} onChange={(e) => setContact(i, "phone", e.target.value)} placeholder="โทรศัพท์" />
              <input className={inputCls} value={c.email} onChange={(e) => setContact(i, "email", e.target.value)} placeholder="อีเมล" />
              <div className="flex items-center gap-2">
                <input className={inputCls} value={c.line_id} onChange={(e) => setContact(i, "line_id", e.target.value)} placeholder="LINE ID" />
                {contacts.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => setContacts((p) => p.filter((_, idx) => idx !== i))} title="ลบผู้ติดต่อ">
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <a href="/contractors" className={buttonVariants({ variant: "secondary" })}>ยกเลิก</a>
        <Button variant="primary" onClick={submit} disabled={busy || companyName.trim() === ""}>
          <Save size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก..." : "สร้างผู้รับเหมา"}
        </Button>
      </div>
    </div>
  );
}
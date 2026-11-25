"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { PageHeader } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiJson } from "@/lib/api";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Rocket,
  Settings,
  Users,
  Building2,
  Truck,
  Cpu,
  Package,
  CalendarDays,
  ShieldCheck,
  ExternalLink,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type StepStatus = "done" | "pending" | "empty";

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: any;
  minCount: number;
  count: number | null;
  loading: boolean;
}

const STEP_META: Omit<Step, "count" | "loading">[] = [
  { id: "settings", title: "1. ตั้งค่าระบบ (Settings)", description: "ชื่อบริษัท ที่อยู่ timezone สกุลเงิน และค่าพื้นฐานของระบบ", href: "/settings", icon: Settings, minCount: 5 },
  { id: "roles", title: "2. บทบาท & สิทธิ์ (Roles)", description: "กำหนด role (Admin/Manager/Technician/…) และสิทธิ์เมนูต่อ role", href: "/roles", icon: ShieldCheck, minCount: 1 },
  { id: "users", title: "3. ผู้ใช้งาน (Users)", description: "สร้างบัญชีผู้ใช้และกำหนด role + แผนก", href: "/users", icon: Users, minCount: 2 },
  { id: "departments", title: "4. แผนก (Departments)", description: "รายชื่อแผนก/ฝ่ายขององค์กร", href: "/settings/master/departments", icon: Building2, minCount: 1 },
  { id: "locations", title: "5. ที่ตั้ง/สถานที่ (Locations)", description: "อาคาร ชั้น พื้นที่ติดตั้งเครื่องจักร", href: "/settings/master/locations", icon: Building2, minCount: 1 },
  { id: "suppliers", title: "6. ผู้จำหน่าย (Suppliers)", description: "ซัพพลายเออร์อะไหล่และบริการ", href: "/suppliers", icon: Truck, minCount: 1 },
  { id: "assets", title: "7. ทะเบียนเครื่องจักร (Assets)", description: "เครื่องจักร/อุปกรณ์ที่ต้องบำรุงรักษา", href: "/asset_registry", icon: Cpu, minCount: 1 },
  { id: "spare_parts", title: "8. อะไหล่ (Spare Parts)", description: "รายการอะไหล่ สต็อก min/max ที่เก็บ", href: "/spare_parts", icon: Package, minCount: 1 },
  { id: "pm", title: "9. แผน PM (Preventive Maintenance)", description: "แผนบำรุงรักษาเชิงป้องกันต่อเครื่องจักร", href: "/pm_am", icon: CalendarDays, minCount: 1 },
];

async function fetchCount(id: string): Promise<number> {
  try {
    switch (id) {
      case "settings": { const r = await fetch("/api/v1/settings.php"); const j = await r.json(); return Array.isArray(j) ? j.length : 0; }
      case "roles": { const r = await fetch("/api/v1/roles.php"); const j = await r.json(); return Array.isArray(j) ? j.length : 0; }
      case "users": { const r = await fetch("/api/v1/users.php"); const j = await r.json(); return Array.isArray(j) ? j.length : 0; }
      case "departments": { const r = await fetch("/api/v1/master_data.php?entity=departments"); const j = await r.json(); return Array.isArray(j) ? j.length : 0; }
      case "locations": { const r = await fetch("/api/v1/master_data.php?entity=locations"); const j = await r.json(); return Array.isArray(j) ? j.length : 0; }
      case "suppliers": { const r = await fetch("/api/v1/suppliers.php"); const j = await r.json(); return Array.isArray(j) ? j.length : 0; }
      case "assets": { const r = await fetch("/api/v1/asset_registry.php"); const j = await r.json(); return Array.isArray(j) ? j.length : (Array.isArray(j?.data) ? j.data.length : 0); }
      case "spare_parts": { const r = await fetch("/api/v1/spare_parts.php?limit=1"); const j = await r.json(); return (j?.total ?? (Array.isArray(j) ? j.length : (Array.isArray(j?.items) ? j.items.length : (Array.isArray(j?.data) ? j.data.length : 0)))); }
      case "pm": { const r = await fetch("/api/v1/pm_am.php"); const j = await r.json(); return Array.isArray(j) ? j.length : (Array.isArray(j?.data) ? j.data.length : 0); }
      default: return 0;
    }
  } catch { return 0; }
}

const emptyForm = (id: string): Record<string, any> => {
  switch (id) {
    case "settings": return { setting_key: "", setting_value: "", setting_group: "general", description: "" };
    case "roles": return { name: "", description: "" };
    case "users": return { username: "", password: "", full_name: "", role_id: "", department_id: "", is_active: 1 };
    case "departments": return { code: "", name: "", description: "", is_active: 1 };
    case "locations": return { code: "", name: "", type: "", description: "", is_active: 1 };
    case "suppliers": return { code: "", name: "", contact: "", email: "", phone: "", address: "", taxId: "", isActive: true };
    case "assets": return { code: "", name: "", category: "Printing Press", location: "Building A - Zone 1", criticality: "A", status: "running" };
    case "spare_parts": return { code: "", name: "", unit: "PCS", stock_qty: 0, min_stock: 0, location: "" };
    case "pm": return { asset_id: "", title: "", frequency_type: "monthly", due_date: "", status: "pending" };
    default: return {};
  }
};

export default function OnboardingPage() {
  const hero = usePageHero("settings");
  const router = useRouter();
  const [steps, setSteps] = useState<Step[]>(STEP_META.map((m) => ({ ...m, count: null, loading: true })));
  const [refreshing, setRefreshing] = useState(false);
  const [goLiveDone, setGoLiveDone] = useState(false);

  const [openForm, setOpenForm] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, Record<string, any>>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [roles, setRoles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);

  const loadAux = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/roles.php"); const j = await r.json(); if (Array.isArray(j)) setRoles(j);
    } catch {}
    try {
      const r = await fetch("/api/v1/master_data.php?entity=departments"); const j = await r.json(); if (Array.isArray(j)) setDepartments(j);
    } catch {}
    try {
      const r = await fetch("/api/v1/asset_registry.php"); const j = await r.json(); const arr = Array.isArray(j) ? j : (Array.isArray(j?.data) ? j.data : []); setAssets(arr);
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const updated = await Promise.all(steps.map(async (s) => ({ ...s, count: await fetchCount(s.id), loading: false })));
    setSteps(updated);
    setRefreshing(false);
  }, [steps]);

  useEffect(() => { refresh(); loadAux(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const allDone = useMemo(() => steps.every((s) => (s.count ?? 0) >= s.minCount), [steps]);
  const doneCount = useMemo(() => steps.filter((s) => (s.count ?? 0) >= s.minCount).length, [steps]);

  const statusOf = (s: Step): StepStatus => {
    if (s.loading || s.count === null) return "pending";
    return s.count >= s.minCount ? "done" : s.count === 0 ? "empty" : "pending";
  };

  const getForm = (id: string) => formValues[id] ?? emptyForm(id);
  const setField = (id: string, key: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyForm(id)), [key]: val } }));
  };

  const validate = (id: string, f: Record<string, any>): string => {
    switch (id) {
      case "settings": if (!f.setting_key?.trim()) return "กรุณากรอก setting_key"; if (!f.setting_value?.trim() && f.setting_value !== 0) return "กรุณากรอก setting_value"; break;
      case "roles": if (!f.name?.trim()) return "กรุณากรอกชื่อ role"; break;
      case "users": if (!f.username?.trim()) return "กรุณากรอก username"; if (!f.password?.trim()) return "กรุณากรอกรหัสผ่าน"; break;
      case "departments": if (!f.code?.trim()) return "กรุณากรอกรหัส"; if (!f.name?.trim()) return "กรุณากรอกชื่อแผนก"; break;
      case "locations": if (!f.code?.trim()) return "กรุณากรอกรหัส"; if (!f.name?.trim()) return "กรุณากรอกชื่อสถานที่"; break;
      case "suppliers": if (!f.code?.trim()) return "กรุณากรอกรหัส"; if (!f.name?.trim()) return "กรุณากรอกชื่อ"; break;
      case "assets": if (!f.code?.trim()) return "กรุณากรอกรหัสเครื่องจักร"; if (!f.name?.trim()) return "กรุณากรอกชื่อเครื่องจักร"; break;
      case "spare_parts": if (!f.code?.trim()) return "กรุณากรอกรหัสอะไหล่"; if (!f.name?.trim()) return "กรุณากรอกชื่ออะไหล่"; break;
      case "pm": if (!f.title?.trim()) return "กรุณากรอกชื่อแผน PM"; if (!f.asset_id) return "กรุณาเลือกเครื่องจักร"; break;
    }
    return "";
  };

  const submit = async (id: string) => {
    const f = getForm(id);
    const err = validate(id, f);
    if (err) { setFormError(err); return; }
    setSaving(true); setFormError(""); setSuccessMsg("");
    try {
      switch (id) {
        case "settings":
          await apiJson("/api/v1/settings.php", { method: "POST", body: JSON.stringify({ setting_key: f.setting_key, setting_value: f.setting_value, setting_group: f.setting_group || "general", description: f.description }) });
          break;
        case "roles":
          await apiJson("/api/v1/roles.php", { method: "POST", body: JSON.stringify({ name: f.name, description: f.description }) });
          break;
        case "users":
          await apiJson("/api/v1/users.php", { method: "POST", body: JSON.stringify({ username: f.username, password: f.password, full_name: f.full_name, role_id: f.role_id ? Number(f.role_id) : undefined, department_id: f.department_id ? Number(f.department_id) : undefined, is_active: f.is_active }) });
          break;
        case "departments":
          await apiJson("/api/v1/master_data.php", { method: "POST", body: JSON.stringify({ entity: "departments", fields: { code: f.code, name: f.name, description: f.description, is_active: f.is_active } }) });
          break;
        case "locations":
          await apiJson("/api/v1/master_data.php", { method: "POST", body: JSON.stringify({ entity: "locations", fields: { code: f.code, name: f.name, type: f.type, description: f.description, is_active: f.is_active } }) });
          break;
        case "suppliers":
          await apiJson("/api/v1/suppliers.php", { method: "POST", body: JSON.stringify({ code: f.code, name: f.name, contact_person: f.contact, email: f.email, phone: f.phone, address: f.address, tax_id: f.taxId, is_active: f.isActive ? 1 : 0 }) });
          break;
        case "assets":
          await apiJson("/api/v1/asset_registry.php", { method: "POST", body: JSON.stringify({ code: f.code, name: f.name, category: f.category, location: f.location, criticality: f.criticality, status: f.status }) });
          break;
        case "spare_parts":
          await apiJson("/api/v1/spare_parts.php", { method: "POST", body: JSON.stringify({ code: f.code, name: f.name, unit: f.unit, stock_qty: Number(f.stock_qty) || 0, min_stock: Number(f.min_stock) || 0, location: f.location }) });
          break;
        case "pm":
          await apiJson("/api/v1/pm_am.php", { method: "POST", body: JSON.stringify({ asset_id: Number(f.asset_id), title: f.title, frequency_type: f.frequency_type, due_date: f.due_date || undefined, status: f.status }) });
          break;
      }
      setSuccessMsg("บันทึกสำเร็จ");
      setFormValues((prev) => ({ ...prev, [id]: emptyForm(id) }));
      setOpenForm(null);
      await refresh();
      await loadAux();
    } catch (e: any) {
      setFormError(e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const renderForm = (id: string) => {
    const f = getForm(id);
    const set = (k: string, v: any) => setField(id, k, v);
    switch (id) {
      case "settings":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>setting_key *</Label><Input value={f.setting_key} onChange={(e) => set("setting_key", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>setting_value *</Label><Input value={f.setting_value} onChange={(e) => set("setting_value", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>setting_group</Label><Input value={f.setting_group} onChange={(e) => set("setting_group", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>description</Label><Input value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
          </div>
        );
      case "roles":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>ชื่อ role *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>คำอธิบาย</Label><Input value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
          </div>
        );
      case "users":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>username *</Label><Input value={f.username} onChange={(e) => set("username", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>password *</Label><Input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ชื่อ-นามสกุล</Label><Input value={f.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>role</Label>
              <Select value={String(f.role_id || "")} onValueChange={(v) => set("role_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือก role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>แผนก</Label>
              <Select value={String(f.department_id || "")} onValueChange={(v) => set("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                <SelectContent>
                  {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name || d.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        );
      case "departments":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>รหัส *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ชื่อแผนก *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>คำอธิบาย</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} /></div>
          </div>
        );
      case "locations":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>รหัส *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ชื่อสถานที่ *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ประเภท</Label><Input value={f.type} onChange={(e) => set("type", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>คำอธิบาย</Label><Input value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
          </div>
        );
      case "suppliers":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>รหัส *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ชื่อ *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ผู้ติดต่อ</Label><Input value={f.contact} onChange={(e) => set("contact", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>อีเมล</Label><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>โทรศัพท์</Label><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>เลขประจำตัวผู้เสียภาษี</Label><Input value={f.taxId} onChange={(e) => set("taxId", e.target.value)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>ที่อยู่</Label><Textarea value={f.address} onChange={(e) => set("address", e.target.value)} rows={2} /></div>
          </div>
        );
      case "assets":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>รหัสเครื่องจักร *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ชื่อเครื่องจักร *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>หมวดหมู่</Label><Input value={f.category} onChange={(e) => set("category", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>สถานที่ติดตั้ง</Label><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ระดับความสำคัญ (A/B/C)</Label><Input value={f.criticality} onChange={(e) => set("criticality", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>สถานะ</Label><Input value={f.status} onChange={(e) => set("status", e.target.value)} /></div>
          </div>
        );
      case "spare_parts":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>รหัสอะไหล่ *</Label><Input value={f.code} onChange={(e) => set("code", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ชื่ออะไหล่ *</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>หน่วย</Label><Input value={f.unit} onChange={(e) => set("unit", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>สต็อก</Label><Input type="number" value={String(f.stock_qty)} onChange={(e) => set("stock_qty", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>min stock</Label><Input type="number" value={String(f.min_stock)} onChange={(e) => set("min_stock", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>ที่เก็บ</Label><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></div>
          </div>
        );
      case "pm":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>ชื่อแผน PM *</Label><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>เครื่องจักร *</Label>
              <Select value={String(f.asset_id || "")} onValueChange={(v) => set("asset_id", v)}>
                <SelectTrigger><SelectValue placeholder="เลือกเครื่องจักร" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.code} - {a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ความถี่</Label>
              <Select value={f.frequency_type} onValueChange={(v) => set("frequency_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">รายวัน</SelectItem>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                  <SelectItem value="quarterly">รายไตรมาส</SelectItem>
                  <SelectItem value="yearly">รายปี</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>วันครบกำหนด</Label><Input type="date" value={f.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
        breadcrumbs={[{ label: "แดชบอร์ด", href: "/dashboard" }, { label: "Onboarding" }]}
        title="Onboarding Wizard — เตรียมข้อมูลหลักก่อน Go Live"
        description="ทำตามลำดับขั้นตอนนี้เพื่อป้อน Master Data ให้ครบก่อนเริ่มใช้งานจริง (เพิ่มข้อมูลได้ทันทีในหน้านี้)"
        actions={[<Button key="refresh" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? "กำลังตรวจสอบ…" : "ตรวจสอบใหม่"}</Button>]}
      />
      <div className="space-y-6">
        {successMsg && <Alert variant="success">{successMsg}</Alert>}
        <Alert variant={allDone ? "success" : "info"}>
          {allDone ? "ข้อมูลหลักครบถ้วนแล้ว — ระบบพร้อม Go Live" : `ความคืบหน้า: ${doneCount}/${steps.length} ขั้นตอนเสร็จสิ้น`}
        </Alert>

        <div className="grid gap-4">
          {steps.map((s) => {
            const st = statusOf(s);
            const Icon = s.icon;
            const isOpen = openForm === s.id;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className={"flex h-12 w-12 shrink-0 items-center justify-center rounded-lg " + (st === "done" ? "bg-emerald-100 text-emerald-700" : st === "empty" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>
                    {st === "done" ? <CheckCircle2 className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{s.title}</h3>
                      <Badge variant={st === "done" ? "success" : st === "empty" ? "danger" : "warning"}>
                        {s.loading ? "กำลังโหลด…" : st === "done" ? `เสร็จ (${s.count})` : s.count === 0 ? "ยังไม่มีข้อมูล" : `บางส่วน (${s.count}/${s.minCount})`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => { setOpenForm(isOpen ? null : s.id); setFormError(""); setSuccessMsg(""); }} className="gap-1.5">
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {isOpen ? "ปิดฟอร์ม" : "เพิ่มข้อมูล"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => router.push(s.href)} className="gap-1.5">
                      ไปจัดการ <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-4 space-y-3 rounded-lg border border-border p-4">
                    {renderForm(s.id)}
                    {formError && openForm === s.id && <Alert variant="danger">{formError}</Alert>}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="secondary" size="sm" onClick={() => setOpenForm(null)}>ยกเลิก</Button>
                      <Button size="sm" disabled={saving} onClick={() => submit(s.id)}>
                        {saving ? "กำลังบันทึก…" : "บันทึก"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="w-5 h-5 text-[var(--cmms-primary-hover)]" />
              Readiness Check ก่อน Go Live
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {steps.map((s) => {
              const ok = (s.count ?? 0) >= s.minCount;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-rose-500" />}
                    {s.title}
                  </span>
                  <span className={ok ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>{ok ? "ผ่าน" : "ไม่ผ่าน"}</span>
                </div>
              );
            })}
            <div className="pt-4 flex flex-wrap items-center gap-3">
              <Button disabled={!allDone || goLiveDone} onClick={() => setGoLiveDone(true)} className="gap-1.5">
                <Rocket className="w-4 h-4" />
                {goLiveDone ? "Go Live แล้ว" : "ยืนยัน Go Live"}
              </Button>
              {!allDone && <p className="text-sm text-muted-foreground">กรุณาทำให้ทุกขั้นตอน "ผ่าน" ก่อน Go Live</p>}
              {goLiveDone && <p className="text-sm text-emerald-600 font-medium">ระบบพร้อมใช้งาน — ไปที่ Dashboard เพื่อเริ่มงาน</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack, Grid } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageShell } from "@/components/PageShell";
import { useToast } from "../../../components/ToastProvider";
import {
  User,
  MessageSquare,
  Link2,
  Camera,
  Key,
  ShieldCheck,
  CalendarDays,
  Languages,
  Trash2,
} from "lucide-react";
import { useLang, setUserLang } from "../../../lib/i18n";

interface Profile {
  id: number;
  username: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  position: string;
  employee_code: string;
  avatar: string | null;
  avatar_path: string | null;
  line_user_id: string | null;
  lang: string;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", position: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [langSaving, setLangSaving] = useState(false);
  const lang = useLang();

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/profile.php");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดโปรไฟล์ไม่สำเร็จ");
      setProfile(json.user);
      setForm({
        full_name: json.user.full_name ?? "",
        email: json.user.email ?? "",
        phone: json.user.phone ?? "",
        position: json.user.position ?? "",
      });
    } catch (e: any) {
      setError(e.message || "ไม่สามารถโหลดโปรไฟล์ได้");
    }
    setLoading(false);
  };

  useEffect(() => { fetchProfile(); }, []);

  // ลำดับเดียวกับ topbar (layout.tsx): avatar (base64 ที่อัปโหลดใหม่) ก่อน แล้วค่อย avatar_path
  // — avatar_path อาจเป็นรูป default เก่า (เช่น user_male.jpg) ที่ค้างจากการ seed
  const avatarSrc = profile?.avatar || profile?.avatar_path || "";

  const handleAvatarFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("folder", "avatars");
      fd.append("file", file);
      const res = await fetch("/api/v1/upload.php", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "อัปโหลดไม่สำเร็จ");
      // บันทึก path ลงโปรไฟล์
      const put = await fetch("/api/v1/profile.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_path: json.url }),
      });
      const putJson = await put.json();
      if (!put.ok) throw new Error(putJson?.error || "บันทึกรูปไม่สำเร็จ");
      window.dispatchEvent(new Event("cmms:profile-updated"));
      await fetchProfile();
      showToast("success", "อัปโหลดรูปโปรไฟล์สำเร็จ");
    } catch (e: any) {
      showToast("error", e.message || "อัปโหลดรูปไม่สำเร็จ");
    }
    setUploading(false);
  };

  const handleDeleteAvatar = async () => {
    if (!avatarSrc || deletingAvatar) return;
    if (!window.confirm("ลบรูปโปรไฟล์? ระบบจะแสดงตัวอักษรย่อแทน")) return;
    setDeletingAvatar(true);
    try {
      const res = await fetch("/api/v1/profile.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_path: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ลบรูปไม่สำเร็จ");
      window.dispatchEvent(new Event("cmms:profile-updated"));
      await fetchProfile();
      showToast("success", "ลบรูปโปรไฟล์แล้ว — แสดงตัวอักษรย่อแทน");
    } catch (e: any) {
      showToast("error", e.message || "ลบรูปไม่สำเร็จ");
    }
    setDeletingAvatar(false);
  };

  const handleLangChange = async (next: "th" | "en") => {
    // สลับ UI ทันที (session นี้)
    setUserLang(next);
    if ((profile?.lang ?? "th") === next) return;
    setLangSaving(true);
    try {
      const res = await fetch("/api/v1/profile.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกภาษาไม่สำเร็จ");
      setProfile((p) => (p ? { ...p, lang: next } : p));
      showToast("success", "บันทึกภาษาประจำตัวแล้ว — จะใช้กับบัญชีนี้ทุกเครื่อง");
    } catch (e: any) {
      setUserLang(lang); // คืนค่าก่อนหน้า ถ้าบันทึกไม่สำเร็จ
      showToast("error", e.message || "บันทึกภาษาไม่สำเร็จ");
    }
    setLangSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = { ...form };
      if (pw.new_password) {
        body.current_password = pw.current_password;
        body.new_password = pw.new_password;
        body.confirm_password = pw.confirm_password;
      }
      const res = await fetch("/api/v1/profile.php", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      setPw({ current_password: "", new_password: "", confirm_password: "" });
      window.dispatchEvent(new Event("cmms:profile-updated"));
      await fetchProfile();
      showToast("success", json.message || "บันทึกโปรไฟล์สำเร็จ");
    } catch (e: any) {
      showToast("error", e.message || "บันทึกโปรไฟล์ไม่สำเร็จ");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <HStack hAlign="center" vAlign="center" className="py-16">
        <Spinner />
        <span className="text-sm text-muted-foreground">กำลังโหลดโปรไฟล์...</span>
      </HStack>
    );
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "โปรไฟล์" },
      ]}
      title="โปรไฟล์ของฉัน"
      description="จัดการข้อมูลส่วนตัว เปลี่ยนรูปโปรไฟล์ รหัสผ่าน และการผูกบัญชี LINE สำหรับการแจ้งเตือน"
    >
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <Grid columns={{ minWidth: 300 }} gap={6} style={{ alignItems: "start" }}>
        {/* ═══ การ์ดซ้าย: รูป + ข้อมูลหลัก + LINE ═══ */}
        <Card className="p-5">
          <VStack gap={4} hAlign="center" className="text-center">
            <div className="relative h-24 w-24">
              <Avatar className="h-24 w-24 text-3xl">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt={form.full_name || profile?.username || "User"} /> : null}
                <AvatarFallback>{(form.full_name || profile?.username || "U").charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                title="เปลี่ยนรูปโปรไฟล์"
                aria-label="เปลี่ยนรูปโปรไฟล์"
                onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white bg-[var(--cmms-primary)] text-white transition-opacity hover:opacity-90"
              >
                {uploading ? <Spinner size={14} label="" /> : <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
              </button>
              {avatarSrc && !uploading && (
                <button
                  type="button"
                  title="ลบรูปโปรไฟล์"
                  aria-label="ลบรูปโปรไฟล์"
                  onClick={handleDeleteAvatar}
                  className="absolute bottom-0 left-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white bg-destructive text-white transition-opacity hover:opacity-90"
                >
                  {deletingAvatar ? <Spinner size={14} label="" /> : <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }}
              />
            </div>

            <VStack gap={0}>
              <h2 className="text-base font-semibold text-foreground">{form.full_name || profile?.full_name || "—"}</h2>
              <p className="text-sm text-muted-foreground">
                {profile?.position || profile?.role || "—"}
                {profile?.employee_code ? ` · ${profile.employee_code}` : ""}
              </p>
            </VStack>

            <Badge variant={profile?.line_user_id ? "success" : "neutral"}>
              {profile?.line_user_id ? "ผูกบัญชี LINE แล้ว" : "ยังไม่ผูกบัญชี LINE"}
            </Badge>
            {!profile?.line_user_id && (
              <Button variant="secondary" size="sm" onClick={() => router.push("/register")}>
                <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
                ผูกบัญชี LINE
              </Button>
            )}

            <VStack gap={1} className="w-full text-left">
              <HStack gap={2} vAlign="center">
                <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-sm text-muted-foreground">สมาชิกตั้งแต่: {profile?.created_at ? String(profile.created_at).slice(0, 10) : "—"}</span>
              </HStack>
              <HStack gap={2} vAlign="center">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-sm text-muted-foreground">บทบาท: {profile?.role || "—"}</span>
              </HStack>
            </VStack>
          </VStack>
        </Card>

        {/* ═══ การ์ดขวา: ข้อมูล + รหัสผ่าน ═══ */}
        <VStack gap={6} style={{ gridColumn: "span 2" }}>
          <Card className="p-5">
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <User className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold text-foreground">ข้อมูลส่วนตัว</h3>
              </HStack>

              <Input
                label="ชื่อ-นามสกุล"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
              <Input
                label="อีเมล"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="เบอร์โทร"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
              <Input
                label="ตำแหน่ง"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
              />

              <HStack hAlign="end">
                <Button disabled={saving} onClick={handleSave}>
                  {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </Button>
              </HStack>
            </VStack>
          </Card>

          <Card className="p-5">
            <VStack gap={4}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Languages className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold text-foreground">ภาษาประจำตัว</h3>
                {langSaving && <Spinner size={14} label="" />}
                <Badge variant="neutral">บันทึกไว้ที่บัญชีของคุณ — ใช้เหมือนกันทุกเครื่อง</Badge>
              </HStack>
              <p className="text-sm text-muted-foreground">
                เลือกภาษาที่ใช้แสดงผลในระบบ ระบบจะจำไว้ให้ตามบัญชีผู้ใช้ (ไม่ขึ้นกับเครื่อง/เบราว์เซอร์)
              </p>
              <HStack gap={2} vAlign="center" wrap="wrap">
                {[
                  { value: "th", short: "ไทย", label: "ไทย (Thai)" },
                  { value: "en", short: "EN", label: "English" },
                ].map((opt) => {
                  const active = (profile?.lang ?? lang) === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      title={opt.label}
                      disabled={langSaving}
                      onClick={() => handleLangChange(opt.value as "th" | "en")}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold transition-colors duration-150 ${
                        active
                          ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white"
                          : "border-border bg-secondary text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {opt.short}
                      <span className="font-medium opacity-85">{opt.label}</span>
                    </button>
                  );
                })}
              </HStack>
            </VStack>
          </Card>

          <Card className="p-5">
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <Key className="h-5 w-5 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold text-foreground">เปลี่ยนรหัสผ่าน</h3>
              </HStack>
              <p className="text-sm text-muted-foreground">
                กรอกรหัสเดิม + รหัสใหม่ 2 ครั้ง แล้วกด &quot;บันทึกข้อมูล&quot; ด้านบน (รหัสใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร)
              </p>
              <Input
                label="รหัสผ่านปัจจุบัน"
                type="password"
                value={pw.current_password}
                onChange={(e) => setPw((f) => ({ ...f, current_password: e.target.value }))}
              />
              <Input
                label="รหัสผ่านใหม่"
                type="password"
                value={pw.new_password}
                onChange={(e) => setPw((f) => ({ ...f, new_password: e.target.value }))}
              />
              <Input
                label="ยืนยันรหัสผ่านใหม่"
                type="password"
                value={pw.confirm_password}
                onChange={(e) => setPw((f) => ({ ...f, confirm_password: e.target.value }))}
              />
            </VStack>
          </Card>

          <Card className="p-4">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <MessageSquare className="h-4 w-4 text-[var(--cmms-primary-hover)]" strokeWidth={1.75} aria-hidden="true" />
              <span className="text-sm text-muted-foreground">
                ต้องการรับการแจ้งเตือนทาง LINE หรือไม่? ไปที่หน้า
              </span>
              <Button variant="secondary" size="sm" onClick={() => router.push("/register")}>
                ลงทะเบียนผูกบัญชี LINE
              </Button>
            </HStack>
          </Card>
        </VStack>
      </Grid>
    </PageShell>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Card } from "@astryxdesign/core/Card";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Grid } from "@astryxdesign/core/Grid";
import { Avatar } from "@astryxdesign/core/Avatar";
import { useToast } from "../../../components/ToastProvider";
import {
  UserCircleIcon,
  ChatBubbleLeftRightIcon,
  LinkIcon,
  CameraIcon,
  KeyIcon,
  ShieldCheckIcon,
  IdentificationIcon,
  LanguageIcon,
} from "@heroicons/react/24/outline";
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

  const avatarSrc = profile?.avatar_path || profile?.avatar || "";

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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดโปรไฟล์...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>PROFILE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>โปรไฟล์ของฉัน</Heading>
            {profile && (
              <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
                <UserCircleIcon className="w-3.5 h-3.5" /> ผู้ใช้: {profile.username}
              </span>
            )}
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            จัดการข้อมูลส่วนตัว เปลี่ยนรูปโปรไฟล์ รหัสผ่าน และการผูกบัญชี LINE สำหรับการแจ้งเตือน
          </Text>
        </VStack>
      </div>

      <Grid columns={{ minWidth: 300 }} gap={6} style={{ alignItems: "start" }}>
        {/* ═══ การ์ดซ้าย: รูป + ข้อมูลหลัก + LINE ═══ */}
        <Card padding={5}>
          <VStack gap={4} hAlign="center" style={{ textAlign: "center" }}>
            <div style={{ position: "relative", width: 96, height: 96 }}>
              {avatarSrc ? (
                <Avatar name={form.full_name || profile?.username || "User"} src={avatarSrc} size="lg" style={{ width: 96, height: 96, fontSize: 36 }} />
              ) : (
                <div style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--cmms-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 800 }}>
                  {(form.full_name || profile?.username || "U").charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                title="เปลี่ยนรูปโปรไฟล์"
                onClick={() => fileRef.current?.click()}
                style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: 30, height: 30, borderRadius: "50%",
                  background: "var(--cmms-primary)", color: "#fff",
                  border: "2px solid #fff", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {uploading ? <Spinner size="sm" /> : <CameraIcon className="w-4 h-4" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }}
              />
            </div>

            <VStack gap={0}>
              <Heading level={3}>{form.full_name || profile?.full_name || "—"}</Heading>
              <Text type="body" size="sm" color="secondary">
                {profile?.position || profile?.role || "—"}
                {profile?.employee_code ? ` · ${profile.employee_code}` : ""}
              </Text>
            </VStack>

            <span
              className="cmms-andon-chip"
              style={{
                background: profile?.line_user_id ? "rgba(16,185,129,0.12)" : "rgba(100,116,139,0.12)",
                color: profile?.line_user_id ? "var(--cmms-success)" : "var(--cmms-text-muted)",
                fontSize: "0.75rem",
                padding: "4px 10px",
              }}
            >
              {profile?.line_user_id ? "ผูกบัญชี LINE แล้ว" : "ยังไม่ผูกบัญชี LINE"}
            </span>
            {!profile?.line_user_id && (
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                ผูกบัญชี LINE
              </button>
            )}

            <VStack gap={1} style={{ width: "100%", textAlign: "left" }}>
              <HStack gap={2} vAlign="center">
                <IdentificationIcon className="w-4 h-4" style={{ color: "var(--cmms-secondary)" }} />
                <Text type="body" size="sm" color="secondary">สมาชิกตั้งแต่: {profile?.created_at ? String(profile.created_at).slice(0, 10) : "—"}</Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <ShieldCheckIcon className="w-4 h-4" style={{ color: "var(--cmms-secondary)" }} />
                <Text type="body" size="sm" color="secondary">บทบาท: {profile?.role || "—"}</Text>
              </HStack>
            </VStack>
          </VStack>
        </Card>

        {/* ═══ การ์ดขวา: ข้อมูล + รหัสผ่าน ═══ */}
        <VStack gap={6} style={{ gridColumn: "span 2" }}>
          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <UserCircleIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={3}>ข้อมูลส่วนตัว</Heading>
              </HStack>

              <TextInput
                label="ชื่อ-นามสกุล"
                value={form.full_name}
                onChange={(v) => setForm((f) => ({ ...f, full_name: v }))}
              />
              <TextInput
                label="อีเมล"
                type="email"
                value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              />
              <TextInput
                label="เบอร์โทร"
                value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              />
              <TextInput
                label="ตำแหน่ง"
                value={form.position}
                onChange={(v) => setForm((f) => ({ ...f, position: v }))}
              />

              <HStack hAlign="end">
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
                >
                  {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </button>
              </HStack>
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <LanguageIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={3}>ภาษาประจำตัว</Heading>
                {langSaving && <Spinner size="sm" />}
                <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                  บันทึกไว้ที่บัญชีของคุณ — ใช้เหมือนกันทุกเครื่อง
                </span>
              </HStack>
              <Text type="body" size="sm" color="secondary">
                เลือกภาษาที่ใช้แสดงผลในระบบ ระบบจะจำไว้ให้ตามบัญชีผู้ใช้ (ไม่ขึ้นกับเครื่อง/เบราว์เซอร์)
              </Text>
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
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "8px 18px", borderRadius: 10,
                        border: active ? "1px solid var(--cmms-primary)" : "1px solid var(--cmms-border)",
                        background: active ? "var(--cmms-primary)" : "var(--cmms-bg-wash)",
                        color: active ? "#fff" : "var(--cmms-text-secondary)",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        transition: "all 150ms ease",
                      }}
                    >
                      {opt.short}
                      <span style={{ fontWeight: 500, opacity: 0.85 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </HStack>
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <KeyIcon className="w-5 h-5" style={{ color: "var(--cmms-primary)" }} />
                <Heading level={3}>เปลี่ยนรหัสผ่าน</Heading>
              </HStack>
              <Text type="body" size="sm" color="secondary">
                กรอกรหัสเดิม + รหัสใหม่ 2 ครั้ง แล้วกด "บันทึกข้อมูล" ด้านบน (รหัสใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร)
              </Text>
              <TextInput
                label="รหัสผ่านปัจจุบัน"
                type="password"
                value={pw.current_password}
                onChange={(v) => setPw((f) => ({ ...f, current_password: v }))}
              />
              <TextInput
                label="รหัสผ่านใหม่"
                type="password"
                value={pw.new_password}
                onChange={(v) => setPw((f) => ({ ...f, new_password: v }))}
              />
              <TextInput
                label="ยืนยันรหัสผ่านใหม่"
                type="password"
                value={pw.confirm_password}
                onChange={(v) => setPw((f) => ({ ...f, confirm_password: v }))}
              />
            </VStack>
          </Card>

          <Card padding={4}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <ChatBubbleLeftRightIcon className="w-4 h-4" style={{ color: "var(--cmms-primary)" }} />
              <Text type="body" size="sm" color="secondary">
                ต้องการรับการแจ้งเตือนทาง LINE หรือไม่? ไปที่หน้า
              </Text>
              <button
                type="button"
                onClick={() => router.push("/register")}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ลงทะเบียนผูกบัญชี LINE
              </button>
            </HStack>
          </Card>
        </VStack>
      </Grid>
    </VStack>
  );
}

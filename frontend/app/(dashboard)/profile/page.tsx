"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
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
} from "@heroicons/react/24/outline";

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

      <HStack gap={3} vAlign="center">
        <Heading level={2}>โปรไฟล์ของฉัน</Heading>
        <Badge label={profile ? `ผู้ใช้: ${profile.username}` : ""} variant="info" />
      </HStack>

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
                {uploading ? <Spinner size="xs" /> : <Icon icon={CameraIcon} size="sm" />}
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

            <Badge
              label={profile?.line_user_id ? "ผูกบัญชี LINE แล้ว" : "ยังไม่ผูกบัญชี LINE"}
              variant={profile?.line_user_id ? "success" : "neutral"}
            />
            {!profile?.line_user_id && (
              <Button
                label="ผูกบัญชี LINE"
                variant="secondary"
                size="sm"
                icon={<Icon icon={LinkIcon} size="sm" />}
                onClick={() => router.push("/register")}
              />
            )}

            <VStack gap={1} style={{ width: "100%", textAlign: "left" }}>
              <HStack gap={2} vAlign="center">
                <Icon icon={IdentificationIcon} size="sm" color="secondary" />
                <Text type="body" size="sm" color="secondary">สมาชิกตั้งแต่: {profile?.created_at ? String(profile.created_at).slice(0, 10) : "—"}</Text>
              </HStack>
              <HStack gap={2} vAlign="center">
                <Icon icon={ShieldCheckIcon} size="sm" color="secondary" />
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
                <Icon icon={UserCircleIcon} size="md" color="primary" />
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
                <Button label="บันทึกข้อมูล" variant="primary" isLoading={saving} onClick={handleSave} />
              </HStack>
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={4}>
              <HStack gap={2} vAlign="center">
                <Icon icon={KeyIcon} size="md" color="primary" />
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
              <Icon icon={ChatBubbleLeftRightIcon} size="sm" color="primary" />
              <Text type="body" size="sm" color="secondary">
                ต้องการรับการแจ้งเตือนทาง LINE หรือไม่? ไปที่หน้า
              </Text>
              <Button label="ลงทะเบียนผูกบัญชี LINE" variant="secondary" size="sm" onClick={() => router.push("/register")} />
            </HStack>
          </Card>
        </VStack>
      </Grid>
    </VStack>
  );
}

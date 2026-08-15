"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Avatar } from "@astryxdesign/core/Avatar";
import { 
  UserPlusIcon,
  ArrowLeftIcon,
  PhotoIcon
} from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { compressImage } from "@/lib/imageCompress";

const PRESET_AVATARS = [
  { label: "ช่างซ่อม 1", url: "https://api.dicebear.com/7.x/bottts/svg?seed=tech1" },
  { label: "ช่างซ่อม 2", url: "https://api.dicebear.com/7.x/bottts/svg?seed=tech2" },
  { label: "วิศวกร 1", url: "https://api.dicebear.com/7.x/bottts/svg?seed=eng1" },
  { label: "ผู้จัดการ", url: "https://api.dicebear.com/7.x/bottts/svg?seed=manager1" },
  { label: "ผู้ดูแลระบบ", url: "https://api.dicebear.com/7.x/bottts/svg?seed=admin1" },
];

export default function CreateUserPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    username: "",
    employeeCode: "",
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "technician",
    position: "",
    avatar: PRESET_AVATARS[0].url,
    isActive: true,
    lineUserId: "",
  });

  const update = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const dataUrl = await compressImage(file);
        update("avatar", dataUrl);
      } catch (err) {
        console.error("Image compress failed", err);
        setErrorMessage("ไม่สามารถประมวลผลรูปภาพได้ กรุณาเลือกรูปอื่น");
      }
    }
  };

  const handleSubmit = async () => {
    if (!form.username || !form.employeeCode || !form.fullName || !form.password) {
      setErrorMessage("กรุณากรอกชื่อผู้ใช้ รหัสพนักงาน ชื่อ-นามสกุล และรหัสผ่าน (รหัสพนักงานใช้สำหรับผูกบัญชี LINE)");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/v1/users.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          employee_code: form.employeeCode,
          full_name: form.fullName,
          email: form.email || `${form.username}@cmms.local`,
          phone: form.phone,
          password: form.password,
          role: form.role,
          position: form.position,
          avatar: form.avatar,
          is_active: form.isActive ? 1 : 0,
          line_user_id: form.lineUserId || null,
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setErrorMessage(json.error || "เกิดข้อผิดพลาดในการสร้างผู้ใช้");
      }
    } catch {
      setErrorMessage("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="สร้างผู้ใช้ใหม่สำเร็จ!"
        message={<>บัญชีผู้ใช้ <strong>{form.username}</strong> ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้ารายการผู้ใช้"
        secondaryLabel="เพิ่มผู้ใช้อีก"
        onPrimary={() => router.push("/users")}
        onSecondary={() => {
          setSubmitted(false);
          setForm({ username: "", employeeCode: "", fullName: "", email: "", phone: "", password: "", role: "technician", position: "", avatar: PRESET_AVATARS[0].url, isActive: true, lineUserId: "" });
        }}
        onBackdrop={() => router.push("/users")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>USERS CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>สร้างบัญชีผู้ใช้ใหม่</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <UserPlusIcon className="w-3.5 h-3.5" /> ผู้ใช้งานระบบ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            เพิ่มข้อมูลพนักงาน กำหนดบทบาท สิทธิ์ และอัปโหลดรูปโปรไฟล์
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/users")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          ย้อนกลับ
        </button>
      </div>

      <Card elevation="low" padding={6}>
        <VStack gap={5}>
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
              {errorMessage}
            </div>
          )}

          {/* Profile Picture Upload & Avatar Preview */}
          <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
            <VStack gap={3}>
              <Text type="body" weight="bold">เลือกหรืออัปโหลดรูปโปรไฟล์</Text>
              <HStack gap={4} vAlign="center" wrap="wrap">
                {form.avatar ? (
                  <Avatar name={form.fullName || form.username || "User"} src={form.avatar} size="lg" />
                ) : (
                  <Avatar name={form.fullName || form.username || "User"} size="lg" />
                )}
                <VStack gap={2}>
                  <Text type="body" size="sm" color="secondary">เลือกรูปประจำตัว หรืออัปโหลดไฟล์รูปภาพใหม่</Text>
                  <HStack gap={2} wrap="wrap">
                    {PRESET_AVATARS.map((av, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => update("avatar", av.url)}
                        style={{
                          padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                          border: `2px solid ${form.avatar === av.url ? 'var(--cmms-primary)' : 'var(--cmms-border)'}`,
                          background: form.avatar === av.url ? 'var(--cmms-primary-light)' : 'var(--cmms-bg-card)',
                          fontSize: '0.8rem', fontWeight: 600
                        }}
                      >
                        {av.label}
                      </button>
                    ))}
                  </HStack>

                  <HStack gap={2} vAlign="center" style={{ marginTop: 4 }}>
                    <label style={{
                      padding: '6px 14px', borderRadius: 8, background: 'var(--cmms-primary)', color: '#fff',
                      fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                    }}>
                      <PhotoIcon className="w-4 h-4" /> อัปโหลดรูปภาพ...
                      <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                  </HStack>
                </VStack>
              </HStack>
            </VStack>
          </div>

          <FormLayout>
            <Field label="ชื่อผู้ใช้ *" inputID="username" isRequired>
              <TextInput
                label="ชื่อผู้ใช้"
                isLabelHidden
                placeholder="เช่น somchai.t"
                value={form.username}
                onChange={(v: string) => update("username", v)}
              />
            </Field>

              <Field label="ชื่อ-นามสกุล *" inputID="fullName" isRequired>
                <TextInput
                  label="ชื่อ-นามสกุล"
                  isLabelHidden
                  placeholder="เช่น สมชาย ใจดี"
                  value={form.fullName}
                  onChange={(v: string) => update("fullName", v)}
                />
              </Field>

              <Field label="รหัสพนักงาน *" inputID="employeeCode" isRequired>
                <TextInput
                  label="รหัสพนักงาน"
                  isLabelHidden
                  placeholder="เช่น E01117 — ใช้ผูกบัญชี LINE"
                  value={form.employeeCode}
                  onChange={(v: string) => update("employeeCode", v.toUpperCase())}
                />
              </Field>


            <Field label="รหัสผ่าน *" inputID="password" isRequired>
              <TextInput
                label="รหัสผ่าน"
                isLabelHidden
                type="password"
                placeholder="กำหนดรหัสผ่าน"
                value={form.password}
                onChange={(v: string) => update("password", v)}
              />
            </Field>

            <Field label="อีเมล" inputID="email">
              <TextInput
                label="อีเมล"
                isLabelHidden
                placeholder="เช่น somchai@toppan.co.th"
                value={form.email}
                onChange={(v: string) => update("email", v)}
              />
            </Field>

            <Field label="เบอร์โทรศัพท์" inputID="phone">
              <TextInput
                label="เบอร์โทรศัพท์"
                isLabelHidden
                placeholder="เช่น 081-234-5678"
                value={form.phone}
                onChange={(v: string) => update("phone", v)}
              />
            </Field>

            <Field label="LINE ID (รหัสผู้ใช้)" inputID="lineUserId">
              <TextInput
                label="LINE ID"
                isLabelHidden
                placeholder="เช่น U61f2a48ea934bd4438d0f2cb58aa46a2 — ใช้สำหรับแจ้งเตือน LINE"
                value={form.lineUserId}
                onChange={(v: string) => update("lineUserId", v)}
              />
            </Field>

            <Field label="ตำแหน่งงาน" inputID="position">
              <TextInput
                label="ตำแหน่งงาน"
                isLabelHidden
                placeholder="เช่น ช่างซ่อมบำรุงอาวุโส"
                value={form.position}
                onChange={(v: string) => update("position", v)}
              />
            </Field>

            <Field label="บทบาทการใช้งาน" inputID="role">
              <Selector
                label="บทบาทการใช้งาน"
                isLabelHidden
                value={form.role}
                onChange={(v: string) => update("role", v)}
                options={[
                  { value: "technician", label: "ช่างซ่อมบำรุง" },
                  { value: "engineer", label: "วิศวกร" },
                  { value: "manager", label: "ผู้จัดการ" },
                  { value: "operator", label: "ผู้ควบคุมเครื่องจักร" },
                  { value: "admin", label: "ผู้ดูแลระบบ" },
                ]}
              />
            </Field>

            <Field label="สถานะบัญชีผู้ใช้" inputID="isActive">
              <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                <Switch
                  label="ใช้งานบัญชีนี้"
                  value={form.isActive}
                  onChange={(val: boolean) => update("isActive", val)}
                />
                <Text type="body" size="sm" color={form.isActive ? "primary" : "secondary"}>
                  {form.isActive ? "เปิดใช้งาน" : "ระงับการใช้งาน"}
                </Text>
              </HStack>
            </Field>
          </FormLayout>
        </VStack>
      </Card>

      <HStack hAlign="end" gap={3}>
        <button
          type="button"
          onClick={() => (window.location.href = "/users")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0068B5] hover:brightness-110 transition-all duration-300 shadow-sm disabled:opacity-60"
        >
          <UserPlusIcon className="w-4 h-4" />
          {submitting ? "กำลังสร้าง..." : "สร้างผู้ใช้ใหม่"}
        </button>
      </HStack>
    </VStack>
  );
}

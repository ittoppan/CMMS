"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  PencilSquareIcon,
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

function EditUserContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
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
    mustChange: false,
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

  useEffect(() => {
    if (!userId) {
      setErrorMessage("ไม่ระบุรหัสผู้ใช้");
      setLoading(false);
      return;
    }
    fetch(`/api/v1/users.php?id=${userId}`)
      .then(res => res.json())
      .then(user => {
        if (user && !user.error) {
          setForm({
            username: user.username || "",
            employeeCode: user.employee_code || "",
            fullName: user.full_name || "",
            email: user.email || "",
            phone: user.phone || "",
            password: "",
            role: user.role || "technician",
            position: user.position || "",
            avatar: user.avatar || user.avatar_path || PRESET_AVATARS[0].url,
            isActive: user.is_active === 1 || user.is_active === "1" || user.is_active === true,
            lineUserId: user.line_user_id || "",
            mustChange: user.must_change_password === 1 || user.must_change_password === "1" || user.must_change_password === true,
          });
        } else {
          setErrorMessage("ไม่พบข้อมูลผู้ใช้");
        }
      })
      .catch(() => setErrorMessage("เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ใช้"))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSubmit = async () => {
    if (!form.username || !form.fullName) {
      setErrorMessage("กรุณากรอกชื่อผู้ใช้ และชื่อ-นามสกุล");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/v1/users.php?id=${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          employee_code: form.employeeCode,
          full_name: form.fullName,
          email: form.email,
          phone: form.phone,
          password: form.password || undefined,
          role: form.role,
          position: form.position,
          avatar: form.avatar,
          is_active: form.isActive ? 1 : 0,
          line_user_id: form.lineUserId || null,
          must_change_password: form.mustChange ? 1 : 0,
        }),
      });
      const json = await res.json();
      if (json.success || json.message === "Updated") {
        setSubmitted(true);
        // แจ้ง layout (มุมขวาบน) ให้รีเฟรชรูปโปรไฟล์ใหม่ทันที
        window.dispatchEvent(new Event("cmms:profile-updated"));
      } else {
        setErrorMessage(json.error || "เกิดข้อผิดพลาดในการบันทึก");
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
        title="บันทึกข้อมูลผู้ใช้สำเร็จ!"
        message={<>ข้อมูลบัญชีผู้ใช้ <strong>{form.username}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้ารายการผู้ใช้"
        onPrimary={() => router.push("/users")}
        onBackdrop={() => router.push("/users")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>USERS EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แก้ไขโปรไฟล์และข้อมูลผู้ใช้</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <PencilSquareIcon className="w-3.5 h-3.5" /> ผู้ใช้งานระบบ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ปรับปรุงโปรไฟล์ รูปภาพประจำตัว รหัสผ่าน และสิทธิ์การใช้งานในระบบ CMMS
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
        {loading ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูลผู้ใช้...</Text>
        ) : (
          <VStack gap={5}>
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
                {errorMessage}
              </div>
            )}

            {/* Profile Avatar Upload & Selector */}
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
              <VStack gap={3}>
                <Text type="body" weight="bold">เปลี่ยนรูปโปรไฟล์</Text>
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
                  value={form.username}
                  onChange={(v: string) => update("username", v)}
                />
              </Field>

              <Field label="ชื่อ-นามสกุล *" inputID="fullName" isRequired>
                <TextInput
                  label="ชื่อ-นามสกุล"
                  isLabelHidden
                  value={form.fullName}
                  onChange={(v: string) => update("fullName", v)}
                />
              </Field>

              <Field label="รหัสพนักงาน" inputID="employeeCode">
                <TextInput
                  label="รหัสพนักงาน"
                  isLabelHidden
                  placeholder="เช่น E01117"
                  value={form.employeeCode}
                  onChange={(v: string) => update("employeeCode", v.toUpperCase())}
                />
              </Field>

              <Field label="รหัสผ่านใหม่ (หากต้องการเปลี่ยน)" inputID="password">
                <TextInput
                  label="รหัสผ่านใหม่"
                  isLabelHidden
                  type="password"
                  placeholder="เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน"
                  value={form.password}
                  onChange={(v: string) => update("password", v)}
                />
              </Field>

              <Field label="อีเมล" inputID="email">
                <TextInput
                  label="อีเมล"
                  isLabelHidden
                  value={form.email}
                  onChange={(v: string) => update("email", v)}
                />
              </Field>

              <Field label="เบอร์โทรศัพท์" inputID="phone">
                <TextInput
                  label="เบอร์โทรศัพท์"
                  isLabelHidden
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

              <Field label="บังคับเปลี่ยนรหัสผ่านครั้งแรก" inputID="mustChange">
                <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                  <Switch
                    label="ให้เปลี่ยนรหัสเมื่อล็อกอินครั้งหน้า"
                    value={form.mustChange}
                    onChange={(val: boolean) => update("mustChange", val)}
                  />
                  <Text type="body" size="sm" color={form.mustChange ? "primary" : "secondary"}>
                    {form.mustChange ? "บังคับ (ต้องเปลี่ยนก่อนใช้งาน)" : "ไม่บังคับ"}
                  </Text>
                </HStack>
              </Field>
            </FormLayout>
          </VStack>
        )}
      </Card>

      {!loading && (
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
            className="cmms-btn-primary"
          >
            <PencilSquareIcon className="w-4 h-4" />
            {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </HStack>
      )}
    </VStack>
  );
}

export default function EditUserPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><Text type="body" color="secondary">กำลังโหลด...</Text></div>}>
      <EditUserContent />
    </Suspense>
  );
}

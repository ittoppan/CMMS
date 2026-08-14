"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, ShieldCheckIcon, PlusIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

export default function RoleCreatePage() {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name) {
      setError("กรุณาระบุชื่อบทบาท");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/roles.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการสร้าง Role");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="สร้างบทบาทสำเร็จ!"
        message={<>บทบาท <strong>{name}</strong> ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปจัดการสิทธิ์"
        onPrimary={() => router.push("/roles")}
        onBackdrop={() => router.push("/roles")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ROLES CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>สร้างบทบาทใหม่</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ShieldCheckIcon className="w-3.5 h-3.5" /> Roles & Permissions
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            เพิ่มบทบาทใหม่ในระบบเพื่อใช้ในการกำหนดสิทธิ์การเข้าถึงข้อมูล
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/roles")}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <HomeIcon className="w-4 h-4" />
          ย้อนกลับ
        </button>
      </div>

      <Card elevation="low" padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
              {error}
            </div>
          )}

          <FormLayout>
            <Field label="ชื่อบทบาท *" inputID="name" isRequired>
              <TextInput 
                label="ชื่อบทบาท"
                isLabelHidden
                placeholder="เช่น ช่างซ่อมบำรุง, ผู้จัดการ"
                value={name}
                onChange={setName}  />
            </Field>

            <Field label="รายละเอียด" inputID="description">
              <TextArea
                label="รายละเอียด"
                isLabelHidden
                placeholder="คำอธิบายหน้าที่และสิทธิ์เบื้องต้น..."
                value={description}
                onChange={setDescription}
              />
            </Field>
          </FormLayout>

          <HStack gap={3} hAlign="end">
            <button
              type="button"
              onClick={() => router.push("/roles")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
            >
              <PlusIcon className="w-4 h-4" />
              {loading ? "กำลังสร้าง..." : "สร้างบทบาทใหม่"}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

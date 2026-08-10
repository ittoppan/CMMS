"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
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
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Heading level={2}>สร้างบทบาทใหม่</Heading>
          <Text type="body" color="secondary">เพิ่มบทบาทใหม่ในระบบเพื่อใช้ในการกำหนดสิทธิ์การเข้าถึงข้อมูล</Text>
        </VStack>
        <Button
          label="ย้อนกลับ"
          variant="secondary"
          icon={<Icon icon={ArrowLeftIcon} size="sm" />}
          onClick={() => (router.push("/roles"))}
        />
      </Card>

      <Card elevation="low" padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-semibold">
              ⚠️ {error}
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
            <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/roles")} />
            <Button label="สร้างบทบาทใหม่" variant="primary" isLoading={loading} onClick={handleSubmit} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

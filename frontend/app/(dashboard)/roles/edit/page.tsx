"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
function EditRoleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!roleId) {
      setError("ไม่ระบุหมายเลข Role");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/roles.php?id=${roleId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setName(json.name || "");
          setDescription(json.description || "");
        } else {
          setError("ไม่พบข้อมูล Role");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [roleId]);

  const handleSubmit = async () => {
    if (!name) {
      setError("กรุณาระบุชื่อบทบาท");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name,
        description,
      };

      const res = await fetch(`/api/v1/roles.php?id=${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการอัปเดต Role");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="อัปเดตบทบาทสำเร็จ!"
        message={<>บทบาท <strong>{name}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
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
          <Heading level={2}>แก้ไขข้อมูลบทบาท</Heading>
          <Text type="body" color="secondary">ปรับปรุงข้อมูลบทบาทในระบบเพื่อใช้ในการกำหนดสิทธิ์การเข้าถึงข้อมูล</Text>
        </VStack>
        <Button
          label="ย้อนกลับ"
          variant="secondary"
          icon={<Icon icon={ArrowLeftIcon} size="sm" />}
          onClick={() => (router.push("/roles"))}
        />
      </Card>

      <Card elevation="low" padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        ) : (
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
                  value={name}
                  onChange={setName}  />
              </Field>

              <Field label="รายละเอียด" inputID="description">
                <TextArea
                  label="รายละเอียด"
                  isLabelHidden
                  value={description}
                  onChange={setDescription}
                />
              </Field>
            </FormLayout>

            <HStack gap={3} hAlign="end">
              <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/roles")} />
              <Button label="บันทึกข้อมูล" variant="primary" onClick={handleSubmit} isLoading={submitting} />
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditRolePage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditRoleContent />
    </Suspense>
  );
}

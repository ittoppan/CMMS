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
import { Switch } from "@astryxdesign/core/Switch";
import { HomeIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

export default function SupplierCreatePage() {
  const router = useRouter();
  
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name || !code) {
      setError("กรุณาระบุรหัสผู้ผลิต และชื่อผู้ผลิต");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/suppliers.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          contact_person: contact,
          email,
          phone,
          address,
          tax_id: taxId,
          is_active: isActive ? 1 : 0
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการสร้าง Supplier");
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
        title="สร้าง Supplier สำเร็จ!"
        message={<>ซัพพลายเออร์ <strong>{name}</strong> ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/suppliers")}
        onBackdrop={() => router.push("/suppliers")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Card elevation="low" padding={6} className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Heading level={2}>เพิ่มข้อมูลผู้ผลิตใหม่</Heading>
          <Text type="body" color="secondary">เพิ่มข้อมูลผู้ผลิตหรือผู้จัดจำหน่ายรายใหม่เข้าสู่ระบบ</Text>
        </VStack>
        <Button
          label="ย้อนกลับ"
          variant="secondary"
          icon={<Icon icon={ArrowLeftIcon} size="sm" />}
          onClick={() => (router.push("/suppliers"))}
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
            <HStack gap={4}>
              <Field label="รหัสอ้างอิง *" inputID="code" isRequired style={{ flex: 1 }}>
                <TextInput 
                  label="รหัสอ้างอิง"
                  isLabelHidden
                  placeholder="เช่น SUP-001"
                  value={code}
                  onChange={setCode}
                />
              </Field>
              <Field label="ชื่อบริษัท *" inputID="name" isRequired style={{ flex: 2 }}>
                <TextInput 
                  label="ชื่อบริษัท"
                  isLabelHidden
                  placeholder="ชื่อบริษัท หรือ ชื่อร้านค้า"
                  value={name}
                  onChange={setName}
                />
              </Field>
            </HStack>
            
            <HStack gap={4}>
              <Field label="ผู้ติดต่อ" inputID="contact" style={{ flex: 1 }}>
                <TextInput 
                  label="ผู้ติดต่อ"
                  isLabelHidden
                  placeholder="ชื่อผู้ติดต่อ"
                  value={contact}
                  onChange={setContact}
                />
              </Field>
              <Field label="เบอร์โทรศัพท์" inputID="phone" style={{ flex: 1 }}>
                <TextInput 
                  label="เบอร์โทรศัพท์"
                  isLabelHidden
                  placeholder="02-xxx-xxxx"
                  value={phone}
                  onChange={setPhone}
                />
              </Field>
            </HStack>

            <HStack gap={4}>
              <Field label="อีเมล" inputID="email" style={{ flex: 1 }}>
                <TextInput 
                  label="อีเมล"
                  isLabelHidden
                  placeholder="contact@company.com"
                  value={email}
                  onChange={setEmail}
                />
              </Field>
              <Field label="เลขประจำตัวผู้เสียภาษี" inputID="taxId" style={{ flex: 1 }}>
                <TextInput 
                  label="เลขประจำตัวผู้เสียภาษี"
                  isLabelHidden
                  placeholder="0123456789012"
                  value={taxId}
                  onChange={setTaxId}
                />
              </Field>
            </HStack>

            <Field label="ที่อยู่" inputID="address">
              <TextArea
                label="ที่อยู่"
                isLabelHidden
                placeholder="ที่อยู่สำหรับออกเอกสาร..."
                value={address}
                onChange={setAddress}
              />
            </Field>

            <Field label="สถานะการใช้งาน" inputID="isActive">
              <HStack gap={3} vAlign="center" style={{ paddingTop: 8 }}>
                <Switch
                  label="ใช้งาน"
                  value={isActive}
                  onChange={setIsActive}
                />
                <Text type="body" size="sm" color={isActive ? "primary" : "secondary"}>
                  {isActive ? "🟢 เปิดใช้งาน" : "🔴 ระงับการใช้งาน"}
                </Text>
              </HStack>
            </Field>
          </FormLayout>

          <HStack gap={3} hAlign="end">
            <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/suppliers")} />
            <Button label="บันทึกข้อมูล" variant="primary" onClick={handleSubmit} isLoading={loading} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

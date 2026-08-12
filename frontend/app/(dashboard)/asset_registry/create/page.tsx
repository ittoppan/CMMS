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
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { 
  PlusIcon,
  ArrowLeftIcon,
  BuildingOffice2Icon
} from "@heroicons/react/24/outline";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";

export default function CreateAssetPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "Printing Press",
    location: "Building A - Zone 1",
    criticality: "A",
    status: "running",
    serialNumber: "",
    brand: "",
    model: "",
    image_path: "",
  });

  const update = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      setErrorMessage("กรุณากรอกรหัสเครื่องจักร และชื่อเครื่องจักร");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/v1/asset_registry.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          category: form.category,
          location: form.location,
          criticality: form.criticality,
          status: form.status,
          serial_number: form.serialNumber,
          manufacturer: form.brand,
          model: form.model,
          image_path: form.image_path || null,
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setErrorMessage(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูลเครื่องจักร");
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
        title="เพิ่มเครื่องจักรสำเร็จ!"
        message={<>เครื่องจักร <strong>{form.code} - {form.name}</strong> ถูกเพิ่มเข้าสู่ทะเบียนเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าทะเบียนเครื่องจักร"
        secondaryLabel="เพิ่มเครื่องจักรอีก"
        onPrimary={() => router.push("/asset_registry")}
        onSecondary={() => {
          setSubmitted(false);
          setForm({ code: "", name: "", category: "Printing Press", location: "Building A - Zone 1", criticality: "A", status: "running", serialNumber: "", brand: "", model: "", image_path: "" });
        }}
        onBackdrop={() => router.push("/asset_registry")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>ลงทะเบียนเครื่องจักรใหม่</Heading>
          <Text type="body" color="secondary">บันทึกประวัติรหัส ชื่อ หมวดหมู่ สถานที่ และระดับความสำคัญ (F-EN-01)</Text>
        </VStack>
        <Button
          label="ย้อนกลับ"
          variant="secondary"
          icon={<Icon icon={ArrowLeftIcon} size="sm" />}
          onClick={() => (router.push("/asset_registry"))}
        />
      </HStack>

      <Card padding={6}>
        <VStack gap={5}>
          {errorMessage && (
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)',
              fontSize: '0.85rem', fontWeight: 600,
            }}>
              {errorMessage}
            </div>
          )}

          <FormLayout>
            <Field label="รหัสเครื่องจักร *" inputID="code" isRequired>
              <TextInput
                label="รหัสเครื่องจักร"
                isLabelHidden
                placeholder="เช่น MC-FX-05, MC-LM-02"
                value={form.code}
                onChange={(v: string) => update("code", v)}
              />
            </Field>

            <Field label="ชื่อเครื่องจักร / อุปกรณ์ *" inputID="name" isRequired>
              <TextInput
                label="ชื่อเครื่องจักร"
                isLabelHidden
                placeholder="เช่น เครื่องพิมพ์เฟล็กโซ 10 สี"
                value={form.name}
                onChange={(v: string) => update("name", v)}
              />
            </Field>

            <Field label="หมวดหมู่เครื่องจักร" inputID="category">
              <Selector
                label="หมวดหมู่"
                isLabelHidden
                value={form.category}
                onChange={(v: string) => update("category", v)}
                options={[
                  { value: "Printing Press", label: "เครื่องพิมพ์" },
                  { value: "Laminator", label: "เครื่องลามิเนต" },
                  { value: "Slitting Machine", label: "เครื่องตัดสลิต" },
                  { value: "Conveyor", label: "สายพานลำเลียง" },
                  { value: "Utility", label: "ระบบสาธารณูปโภค / เครื่องอัดอากาศ" },
                  { value: "Vehicle", label: "ยานพาหนะ / รถโฟล์คลิฟท์" },
                ]}
              />
            </Field>

            <Field label="สถานที่ติดตั้ง" inputID="location">
              <TextInput
                label="สถานที่"
                isLabelHidden
                placeholder="เช่น อาคาร A โซน 1, หลังคา, สถานีไฟฟ้าย่อย B"
                value={form.location}
                onChange={(v: string) => update("location", v)}
              />
            </Field>

            <Field label="ระดับความสำคัญ (A/B/C)" inputID="criticality">
              <Selector
                label="ระดับความสำคัญ"
                isLabelHidden
                value={form.criticality}
                onChange={(v: string) => update("criticality", v)}
                options={[
                  { value: "A", label: "Class A — ส่งผลต่อการผลิตหลักหยุดชะงัก" },
                  { value: "B", label: "Class B — เครื่องจักรรอง สำรองได้" },
                  { value: "C", label: "Class C — อุปกรณ์ทั่วไป" },
                ]}
              />
            </Field>

            <Field label="สถานะการทำงานปัจจุบัน" inputID="status">
              <Selector
                label="สถานะ"
                isLabelHidden
                value={form.status}
                onChange={(v: string) => update("status", v)}
                options={[
                  { value: "running", label: "เดินเครื่องทำงานปกติ" },
                  { value: "breakdown", label: "เครื่องเสีย" },
                  { value: "maintenance", label: "กำลังทำซ่อมบำรุง" },
                  { value: "standby", label: "พร้อมใช้งานสำรอง" },
                ]}
              />
            </Field>

            <Field label="เลขซีเรียล" inputID="serialNumber">
              <TextInput
                label="เลขซีเรียล"
                isLabelHidden
                placeholder="เช่น SN-FX-88201-JP"
                value={form.serialNumber}
                onChange={(v: string) => update("serialNumber", v)}
              />
            </Field>

            <Field label="ยี่ห้อ / ผู้ผลิต" inputID="brand">
              <TextInput
                label="ยี่ห้อ"
                isLabelHidden
                placeholder="เช่น Komori, Nordmeccanica, Toyota"
                value={form.brand}
                onChange={(v: string) => update("brand", v)}
              />
            </Field>

            <Field label="รุ่น" inputID="model">
              <TextInput
                label="รุ่น"
                isLabelHidden
                placeholder="เช่น FX-2000 Pro"
                value={form.model}
                onChange={(v: string) => update("model", v)}
              />
            </Field>

            <Field label="รูปภาพเครื่องจักร" inputID="image_path">
              <ImageUploadField
                value={form.image_path || null}
                onChange={(url) => update("image_path", url || "")}
                folder="assets"
                label="รูปเครื่องจักร"
              />
            </Field>
          </FormLayout>
        </VStack>
      </Card>

      <HStack hAlign="end" gap={3}>
        <Button
          label="ยกเลิก"
          variant="secondary"
          onClick={() => (window.location.href = "/asset_registry")}
        />
        <Button
          label="บันทึกเครื่องจักร"
          variant="primary"
          isLoading={submitting}
          onClick={handleSubmit}
          icon={<Icon icon={PlusIcon} size="sm" />}
        />
      </HStack>
    </VStack>
  );
}

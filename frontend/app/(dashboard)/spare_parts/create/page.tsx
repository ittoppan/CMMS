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
  CubeIcon
} from "@heroicons/react/24/outline";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";

export default function CreateSparePartPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "ทั่วไป",
    unit: "pcs",
    stock_qty: "0",
    min_stock: "5",
    max_stock: "50",
    location: "",
    unit_price: "0",
    description: "",
    image_url: "",
  });

  const update = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      setErrorMessage("กรุณากรอกรหัสอะไหล่ และชื่ออะไหล่");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/v1/spare_parts.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          category: form.category,
          unit: form.unit,
          stock_qty: Number(form.stock_qty || 0),
          min_stock: Number(form.min_stock || 5),
          max_stock: Number(form.max_stock || 50),
          location: form.location,
          unit_price: Number(form.unit_price || 0),
          description: form.description,
          image_url: form.image_url || null,
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setErrorMessage(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูลอะไหล่");
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
        title="เพิ่มรายการอะไหล่สำเร็จ!"
        message={<>อะไหล่ <strong>{form.code} - {form.name}</strong> บันทึกเข้าสู่ระบบคลังเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าคลังอะไหล่"
        secondaryLabel="เพิ่มอะไหล่อีก"
        onPrimary={() => router.push("/spare_parts")}
        onSecondary={() => {
          setSubmitted(false);
          setForm({ code: "", name: "", category: "ทั่วไป", unit: "pcs", stock_qty: "0", min_stock: "5", max_stock: "50", location: "", unit_price: "0", description: "", image_url: "" });
        }}
        onBackdrop={() => router.push("/spare_parts")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>เพิ่มรายการอะไหล่ใหม่</Heading>
          <Text type="body" color="secondary">บันทึกรหัส ชื่อ หมวดหมู่ ที่เก็บ และจำนวนสต็อกขั้นต่ำ</Text>
        </VStack>
        <Button
          label="ย้อนกลับ"
          variant="secondary"
          icon={<Icon icon={ArrowLeftIcon} size="sm" />}
          onClick={() => (router.push("/spare_parts"))}
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
            <Field label="รหัสอะไหล่ *" inputID="code" isRequired>
              <TextInput
                label="รหัสอะไหล่"
                isLabelHidden
                placeholder="เช่น SP-BRG-6205, SP-OIL-SEAL"
                value={form.code}
                onChange={(v: string) => update("code", v)}
              />
            </Field>

            <Field label="ชื่อรายการอะไหล่ *" inputID="name" isRequired>
              <TextInput
                label="ชื่ออะไหล่"
                isLabelHidden
                placeholder="เช่น SKF 6205 Bearing แบริ่งลูกกลิ้ง"
                value={form.name}
                onChange={(v: string) => update("name", v)}
              />
            </Field>

            <Field label="หมวดหมู่" inputID="category">
              <Selector
                label="หมวดหมู่"
                isLabelHidden
                value={form.category}
                onChange={(v: string) => update("category", v)}
                options={[
                  { value: "ทั่วไป", label: "ทั่วไป" },
                  { value: "ลูกปืน (Bearings)", label: "ลูกปืน (Bearings)" },
                  { value: "ซีลและโอริง (Seals)", label: "ซีลและโอริง (Seals & O-Rings)" },
                  { value: "สายพาน (Belts)", label: "สายพาน (Belts)" },
                  { value: "ฟิลเตอร์ (Filters)", label: "ฟิลเตอร์ (Filters)" },
                  { value: "ไฟฟ้า (Electrical)", label: "ไฟฟ้า (Electrical)" },
                  { value: "ไฮดรอลิก (Hydraulics)", label: "ไฮดรอลิก (Hydraulics)" },
                ]}
              />
            </Field>

            <Field label="หน่วยนับ" inputID="unit">
              <TextInput
                label="หน่วยนับ"
                isLabelHidden
                placeholder="เช่น pcs, set, box, roll"
                value={form.unit}
                onChange={(v: string) => update("unit", v)}
              />
            </Field>

            <Field label="จำนวนสต็อกปัจจุบัน" inputID="stock_qty">
              <TextInput
                label="สต็อกปัจจุบัน"
                isLabelHidden
                value={form.stock_qty}
                onChange={(v: string) => update("stock_qty", v)}
              />
            </Field>

            <Field label="จุดสั่งซื้อขั้นต่ำ" inputID="min_stock">
              <TextInput
                label="จุดสั่งซื้อขั้นต่ำ"
                isLabelHidden
                value={form.min_stock}
                onChange={(v: string) => update("min_stock", v)}
              />
            </Field>

            <Field label="สต็อกสูงสุด" inputID="max_stock">
              <TextInput
                label="สต็อกสูงสุด"
                isLabelHidden
                value={form.max_stock}
                onChange={(v: string) => update("max_stock", v)}
              />
            </Field>

            <Field label="สถานที่เก็บ" inputID="location">
              <TextInput
                label="ที่เก็บ"
                isLabelHidden
                placeholder="เช่น ชั้น A-02, แร็ค 3-B"
                value={form.location}
                onChange={(v: string) => update("location", v)}
              />
            </Field>

            <Field label="ราคาต่อหน่วย (บาท)" inputID="unit_price">
              <TextInput
                label="ราคาต่อหน่วย"
                isLabelHidden
                value={form.unit_price}
                onChange={(v: string) => update("unit_price", v)}
              />
            </Field>

            <Field label="รายละเอียดเพิ่มเติม" inputID="description">
              <TextInput
                label="รายละเอียด"
                isLabelHidden
                placeholder="รายละเอียดเพิ่มเติม หรือ Specification"
                value={form.description}
                onChange={(v: string) => update("description", v)}
              />
            </Field>

            <Field label="รูปภาพอะไหล่" inputID="image_url">
              <ImageUploadField
                value={form.image_url || null}
                onChange={(url) => update("image_url", url || "")}
                folder="spares"
                label="รูปอะไหล่"
              />
            </Field>
          </FormLayout>
        </VStack>
      </Card>

      <HStack hAlign="end" gap={3}>
        <Button
          label="ยกเลิก"
          variant="secondary"
          onClick={() => (window.location.href = "/spare_parts")}
        />
        <Button
          label="บันทึกอะไหล่ใหม่"
          variant="primary"
          isLoading={submitting}
          onClick={handleSubmit}
          icon={<Icon icon={PlusIcon} size="sm" />}
        />
      </HStack>
    </VStack>
  );
}

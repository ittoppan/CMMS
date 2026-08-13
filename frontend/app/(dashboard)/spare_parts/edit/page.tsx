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
import { PencilSquareIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";

function EditSparePartContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const partId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!partId) {
      setErrorMessage("ไม่ระบุรหัสอะไหล่");
      setLoading(false);
      return;
    }
    fetch(`/api/v1/spare_parts.php?id=${partId}`)
      .then(res => res.json())
      .then(row => {
        if (row && !row.error) {
          setForm({
            code: row.code || "",
            name: row.name || "",
            category: row.category || "ทั่วไป",
            unit: row.unit || "pcs",
            stock_qty: String(row.stock_qty || row.quantity || 0),
            min_stock: String(row.min_stock || 5),
            max_stock: String(row.max_stock || 50),
            location: row.location || "",
            unit_price: String(row.unit_price || 0),
            description: row.description || "",
            image_url: row.image_url || "",
          });
        } else {
          setErrorMessage("ไม่พบข้อมูลอะไหล่");
        }
      })
      .catch(() => setErrorMessage("เกิดข้อผิดพลาดในการโหลดข้อมูลอะไหล่"))
      .finally(() => setLoading(false));
  }, [partId]);

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      setErrorMessage("กรุณากรอกรหัสอะไหล่ และชื่ออะไหล่");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/v1/spare_parts.php?id=${partId}`, {
        method: "PUT",
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
      if (json.success || json.message === "Updated") {
        setSubmitted(true);
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
        title="บันทึกข้อมูลอะไหล่สำเร็จ!"
        message={<>ข้อมูลอะไหล่ <strong>{form.name}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าคลังอะไหล่"
        onPrimary={() => router.push("/spare_parts")}
        onBackdrop={() => router.push("/spare_parts")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SPARE PART REGISTER · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แก้ไขรายการอะไหล่</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <PencilSquareIcon className="w-3.5 h-3.5" /> {form.code || "Spare Part"}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แก้ไขรหัส ชื่อ หมวดหมู่ ที่เก็บ และจำนวนสต็อกขั้นต่ำ
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/spare_parts")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          ย้อนกลับ
        </button>
      </div>

      <Card padding={6}>
        {loading ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูลอะไหล่...</Text>
        ) : (
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
                  value={form.code}
                  onChange={(v: string) => update("code", v)}
                />
              </Field>

              <Field label="ชื่อรายการอะไหล่ *" inputID="name" isRequired>
                <TextInput
                  label="ชื่ออะไหล่"
                  isLabelHidden
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
        )}
      </Card>

      {!loading && (
        <HStack hAlign="end" gap={3}>
          <button
            type="button"
            onClick={() => (window.location.href = "/spare_parts")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PencilSquareIcon className="w-4 h-4" />
            {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </HStack>
      )}
    </VStack>
  );
}

export default function EditSparePartPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}><Text type="body" color="secondary">กำลังโหลด...</Text></div>}>
      <EditSparePartContent />
    </Suspense>
  );
}

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
import { 
  PlusIcon,
  ArrowLeftIcon,
  CubeIcon
} from "@heroicons/react/24/outline";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";

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
      setErrorMessage(t("msg.part_code_name_required"));
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
        setErrorMessage(json.error || t("msg.part_save_error"));
      }
    } catch {
      setErrorMessage(t("msg.conn_fail_retry"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.part_added")}
        message={<>{t("field.spare_part")} <strong>{form.code} - {form.name}</strong> {t("msg.part_saved_to_stock")}</>}
        primaryLabel={t("action.back_to_parts")}
        secondaryLabel={t("action.add_another_part")}
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
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SPARE PART REGISTER · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.parts_create_title")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <CubeIcon className="w-3.5 h-3.5" /> Spare Part
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.parts_create_desc")}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={() => router.push("/spare_parts")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          {t("action.back")}
        </button>
      </div>

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
            <Field label={t("form.part_code_req")} inputID="code" isRequired>
              <TextInput
                label={t("form.part_code")}
                isLabelHidden
                placeholder={t("placeholder.part_code")}
                value={form.code}
                onChange={(v: string) => update("code", v)}
              />
            </Field>

            <Field label={t("form.part_name_req")} inputID="name" isRequired>
              <TextInput
                label={t("form.part_name")}
                isLabelHidden
                placeholder={t("placeholder.part_description")}
                value={form.name}
                onChange={(v: string) => update("name", v)}
              />
            </Field>

            <Field label={t("field.category")} inputID="category">
              <Selector
                label={t("field.category")}
                isLabelHidden
                value={form.category}
                onChange={(v: string) => update("category", v)}
                options={[
                  { value: "ทั่วไป", label: t("form.general") },
                  { value: "ลูกปืน (Bearings)", label: t("form.cat_bearings") },
                  { value: "ซีลและโอริง (Seals)", label: t("form.cat_seals_orings") },
                  { value: "สายพาน (Belts)", label: t("form.cat_belts") },
                  { value: "ฟิลเตอร์ (Filters)", label: t("form.cat_filters") },
                  { value: "ไฟฟ้า (Electrical)", label: t("form.cat_electrical") },
                  { value: "ไฮดรอลิก (Hydraulics)", label: t("form.cat_hydraulics") },
                ]}
              />
            </Field>

            <Field label={t("field.unit")} inputID="unit">
              <TextInput
                label={t("field.unit")}
                isLabelHidden
                placeholder={t("placeholder.unit")}
                value={form.unit}
                onChange={(v: string) => update("unit", v)}
              />
            </Field>

            <Field label={t("form.current_stock_qty")} inputID="stock_qty">
              <TextInput
                label={t("form.current_stock")}
                isLabelHidden
                value={form.stock_qty}
                onChange={(v: string) => update("stock_qty", v)}
              />
            </Field>

            <Field label={t("form.reorder_point")} inputID="min_stock">
              <TextInput
                label={t("form.reorder_point")}
                isLabelHidden
                value={form.min_stock}
                onChange={(v: string) => update("min_stock", v)}
              />
            </Field>

            <Field label={t("form.max_stock")} inputID="max_stock">
              <TextInput
                label={t("form.max_stock")}
                isLabelHidden
                value={form.max_stock}
                onChange={(v: string) => update("max_stock", v)}
              />
            </Field>

            <Field label={t("field.storage_location")} inputID="location">
              <TextInput
                label={t("field.storage")}
                isLabelHidden
                placeholder={t("placeholder.storage")}
                value={form.location}
                onChange={(v: string) => update("location", v)}
              />
            </Field>

            <Field label={t("form.unit_price_baht")} inputID="unit_price">
              <TextInput
                label={t("field.unit_price")}
                isLabelHidden
                value={form.unit_price}
                onChange={(v: string) => update("unit_price", v)}
              />
            </Field>

            <Field label={t("form.additional_details")} inputID="description">
              <TextInput
                label={t("field.description")}
                isLabelHidden
                placeholder={t("placeholder.specification")}
                value={form.description}
                onChange={(v: string) => update("description", v)}
              />
            </Field>

            <Field label={t("form.part_image_upload")} inputID="image_url">
              <ImageUploadField
                value={form.image_url || null}
                onChange={(url) => update("image_url", url || "")}
                folder="spares"
                label={t("form.part_image")}
              />
            </Field>
          </FormLayout>
        </VStack>
      </Card>

      <HStack hAlign="end" gap={3}>
        <button
          type="button"
          onClick={() => (window.location.href = "/spare_parts")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] transition-all duration-300"
        >
          {t("action.cancel")}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PlusIcon className="w-4 h-4" />
          {submitting ? t("common.saving") : t("form.parts_save_new")}
        </button>
      </HStack>
    </VStack>
  );
}

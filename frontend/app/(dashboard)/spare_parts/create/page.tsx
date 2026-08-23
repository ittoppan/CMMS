"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ArrowLeft,
  Box,
} from "lucide-react";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";

const EMPTY_FORM = {
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
};

export default function CreateSparePartPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);

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
          setForm(EMPTY_FORM);
        }}
        onBackdrop={() => router.push("/spare_parts")}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SPARE PART REGISTER · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{t("form.parts_create_title")}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Box size={14} strokeWidth={1.75} aria-hidden="true" /> Spare Part
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.parts_create_desc")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/spare_parts")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20"
        >
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          {t("action.back")}
        </button>
      </div>

      <Card>
        <CardContent className="space-y-5 p-6">
          {errorMessage && (
            <Alert variant="danger" title="Error" description={errorMessage} />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label={t("form.part_code_req")}
              placeholder={t("placeholder.part_code")}
              value={form.code}
              onChange={(e) => update("code", e.target.value)}
            />

            <Input
              label={t("form.part_name_req")}
              placeholder={t("placeholder.part_description")}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />

            <div className="space-y-1.5">
              <Label>{t("field.category")}</Label>
              <Select
                value={form.category}
                onValueChange={(v) => update("category", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ทั่วไป">{t("form.general")}</SelectItem>
                  <SelectItem value="ลูกปืน (Bearings)">{t("form.cat_bearings")}</SelectItem>
                  <SelectItem value="ซีลและโอริง (Seals)">{t("form.cat_seals_orings")}</SelectItem>
                  <SelectItem value="สายพาน (Belts)">{t("form.cat_belts")}</SelectItem>
                  <SelectItem value="ฟิลเตอร์ (Filters)">{t("form.cat_filters")}</SelectItem>
                  <SelectItem value="ไฟฟ้า (Electrical)">{t("form.cat_electrical")}</SelectItem>
                  <SelectItem value="ไฮดรอลิก (Hydraulics)">{t("form.cat_hydraulics")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Input
              label={t("field.unit")}
              placeholder={t("placeholder.unit")}
              value={form.unit}
              onChange={(e) => update("unit", e.target.value)}
            />

            <Input
              label={t("form.current_stock_qty")}
              inputMode="decimal"
              value={form.stock_qty}
              onChange={(e) => update("stock_qty", e.target.value)}
            />

            <Input
              label={t("form.reorder_point")}
              inputMode="decimal"
              value={form.min_stock}
              onChange={(e) => update("min_stock", e.target.value)}
            />

            <Input
              label={t("form.max_stock")}
              inputMode="decimal"
              value={form.max_stock}
              onChange={(e) => update("max_stock", e.target.value)}
            />

            <Input
              label={t("field.storage_location")}
              placeholder={t("placeholder.storage")}
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
            />

            <Input
              label={t("form.unit_price_baht")}
              inputMode="decimal"
              value={form.unit_price}
              onChange={(e) => update("unit_price", e.target.value)}
            />

            <Input
              label={t("form.additional_details")}
              placeholder={t("placeholder.specification")}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />

            <div className="sm:col-span-2">
              <ImageUploadField
                value={form.image_url || null}
                onChange={(url) => update("image_url", url || "")}
                folder="spares"
                label={t("form.part_image_upload")}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => (window.location.href = "/spare_parts")}>
          {t("action.cancel")}
        </Button>
        <Button disabled={submitting} onClick={handleSubmit}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          {submitting ? t("common.saving") : t("form.parts_save_new")}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Box,
  SquarePen,
} from "lucide-react";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";

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
      setErrorMessage(t("msg.part_id_missing"));
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
            category: row.category || t("form.general"),
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
          setErrorMessage(t("msg.part_not_found"));
        }
      })
      .catch(() => setErrorMessage(t("msg.part_load_error")))
      .finally(() => setLoading(false));
  }, [partId]);

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      setErrorMessage(t("msg.part_code_name_required"));
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
        setErrorMessage(json.error || t("msg.save_error"));
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
        title={t("msg.part_saved")}
        message={<>{t("form.part_info")} <strong>{form.name}</strong> {t("msg.updated_successfully")}</>}
        primaryLabel={t("action.back_to_parts")}
        onPrimary={() => router.push("/spare_parts")}
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
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{t("form.parts_edit_title")}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <SquarePen size={14} strokeWidth={1.75} aria-hidden="true" /> {form.code || "Spare Part"}
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.parts_edit_desc")}
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
          {loading ? (
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : (
            <>
              {errorMessage && (
                <Alert variant="danger" title="Error" description={errorMessage} />
              )}

              {!errorMessage || (form.code && form.name) ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label={t("form.part_code_req")}
                    value={form.code}
                    onChange={(e) => update("code", e.target.value)}
                  />

                  <Input
                    label={t("form.part_name_req")}
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />

                  <Select
                    label={t("field.category")}
                    value={form.category}
                    onChange={(e) => update("category", e.target.value)}
                  >
                    <option value="ทั่วไป">{t("form.general")}</option>
                    <option value="ลูกปืน (Bearings)">{t("form.cat_bearings")}</option>
                    <option value="ซีลและโอริง (Seals)">{t("form.cat_seals_orings")}</option>
                    <option value="สายพาน (Belts)">{t("form.cat_belts")}</option>
                    <option value="ฟิลเตอร์ (Filters)">{t("form.cat_filters")}</option>
                    <option value="ไฟฟ้า (Electrical)">{t("form.cat_electrical")}</option>
                    <option value="ไฮดรอลิก (Hydraulics)">{t("form.cat_hydraulics")}</option>
                  </Select>

                  <Input
                    label={t("field.unit")}
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
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {!loading && !submitted && (
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => (window.location.href = "/spare_parts")}>
            {t("action.cancel")}
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
            {submitting ? t("common.saving") : t("action.save_edit")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EditSparePartPage() {
  return (
    <Suspense fallback={
      <div className="space-y-4 p-10" aria-busy="true">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    }>
      <EditSparePartContent />
    </Suspense>
  );
}

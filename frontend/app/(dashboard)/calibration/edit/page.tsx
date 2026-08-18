"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, ScaleIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function EditCalibrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [calType, setCalType] = useState("Internal");
  const [calDate, setCalDate] = useState<ISODate | undefined>(undefined);
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);
  const [certNo, setCertNo] = useState("");
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    fetch("/api/v1/asset_registry.php")
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json)) {
          setAssets(json);
        }
      })
      .catch(e => console.error("Failed to load assets", e));
  }, []);

  useEffect(() => {
    if (!calId) {
      setError(t("msg.calibration_id_missing"));
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/calibration.php?id=${calId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(String(json.asset_id || ""));
          setCalType(json.calibration_type || "Internal");
          setCalDate(json.calibration_date ? (json.calibration_date.substring(0, 10) as ISODate) : undefined);
          setDueDate(json.next_calibration_date ? (json.next_calibration_date.substring(0, 10) as ISODate) : undefined);
          setCertNo(json.certificate_number || "");
          setStatus(json.status || "pending");
        } else {
          setError(t("msg.calibration_not_found"));
        }
      })
      .catch(e => setError(t("msg.load_error")))
      .finally(() => setLoadingData(false));
  }, [calId]);

  const handleSubmit = async () => {
    if (!assetId || !calDate || !dueDate) {
      setError(t("msg.cal_required_fields"));
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId,
        calibration_type: calType,
        calibration_date: calDate,
        next_calibration_date: dueDate,
        certificate_number: certNo,
        status: status
      };

      const res = await fetch(`/api/v1/calibration.php?id=${calId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || t("msg.update_error"));
      }
    } catch {
      setError(t("msg.conn_fail_retry"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.update_success")}
        message={t("msg.cal_plan_updated")}
        primaryLabel={t("action.back_to_list")}
        onPrimary={() => router.push("/calibration")}
        onBackdrop={() => router.push("/calibration")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>CALIBRATION EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.cal_edit_full")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ScaleIcon className="w-3.5 h-3.5" /> {t("form.calibration_plan")}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.cal_edit_desc")}
          </Text>
        </VStack>
      </div>

      <Breadcrumbs>
        <BreadcrumbItem href="/calibration" startIcon={<HomeIcon className="w-4 h-4" />}>{t("form.calibration")}</BreadcrumbItem>
        <BreadcrumbItem isCurrent>{t("form.cal_edit_title")}</BreadcrumbItem>
      </Breadcrumbs>

      <Card padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">{t("common.loading_data")}</Text>
        ) : (
          <VStack gap={5} style={{ maxWidth: 640 }}>
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <Selector
              label={t("form.measuring_tool_req")}
              placeholder={t("placeholder.select_tool")}
              value={assetId}
              onChange={setAssetId}
              options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            />
            
            <Selector
              label={t("form.cal_type_req")}
              value={calType}
              onChange={setCalType}
              options={[
                { value: "Internal", label: t("form.cal_internal") },
                { value: "External Lab", label: t("form.cal_external") },
              ]}
            />
            
            <HStack gap={4}>
              <DateInput
                label={t("form.last_cal_date_req")}
                value={calDate}
                onChange={setCalDate}
              />
              <DateInput
                label={t("form.due_date_req")}
                value={dueDate}
                onChange={setDueDate}
              />
            </HStack>

            <TextInput label={t("form.certificate_no")}
              placeholder={t("placeholder.certificate_no")}
              value={certNo}
              onChange={setCertNo}  />

            <Selector
              label={t("field.status")}
              value={status}
              onChange={setStatus}
              options={[
                { value: "pending", label: t("status.pending") },
                { value: "scheduled", label: t("form.pending_schedule") },
                { value: "completed", label: t("status.completed") }
              ]}
            />

            <HStack gap={3} hAlign="end">
              <button
                type="button"
                onClick={() => router.push("/calibration")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                {t("action.cancel")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
              >
                <PencilSquareIcon className="w-4 h-4" />
                {submitting ? t("common.saving") : t("action.save_data")}
              </button>
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditCalibrationPage() {
  return (
    <Suspense fallback={<Text type="body">{t("common.loading")}</Text>}>
      <EditCalibrationContent />
    </Suspense>
  );
}

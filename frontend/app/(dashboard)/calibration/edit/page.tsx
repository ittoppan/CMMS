"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "การสอบเทียบ", href: "/calibration" },
        { label: t("form.cal_edit_title") },
      ]}
      title={t("form.cal_edit_full")}
      description={t("hero.cal_edit_desc")}
    >
      <Card className="mx-auto w-full max-w-[640px]">
        <CardContent className="space-y-5">
          {loadingData ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {error && <Alert variant="danger">{error}</Alert>}

              <div className="space-y-1.5">
                <Label htmlFor="cal-edit-asset">{t("form.measuring_tool_req")}</Label>
                <Select value={assetId || undefined} onValueChange={(v) => setAssetId(v)}>
                  <SelectTrigger id="cal-edit-asset">
                    <SelectValue placeholder={t("placeholder.select_tool")} />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.code} - {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cal-edit-type">{t("form.cal_type_req")}</Label>
                <Select value={calType} onValueChange={(v) => setCalType(v)}>
                  <SelectTrigger id="cal-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Internal">{t("form.cal_internal")}</SelectItem>
                    <SelectItem value="External Lab">{t("form.cal_external")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cal-edit-last-date">{t("form.last_cal_date_req")}</Label>
                  <Input
                    id="cal-edit-last-date"
                    type="date"
                    value={calDate ?? ""}
                    onChange={(e) =>
                      setCalDate(e.target.value ? (e.target.value as ISODate) : undefined)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cal-edit-due-date">{t("form.due_date_req")}</Label>
                  <Input
                    id="cal-edit-due-date"
                    type="date"
                    value={dueDate ?? ""}
                    onChange={(e) =>
                      setDueDate(e.target.value ? (e.target.value as ISODate) : undefined)
                    }
                  />
                </div>
              </div>

              <Input
                id="cal-edit-cert-no"
                label={t("form.certificate_no")}
                placeholder={t("placeholder.certificate_no")}
                value={certNo}
                onChange={(e) => setCertNo(e.target.value)}
              />

              <div className="space-y-1.5">
                <Label htmlFor="cal-edit-status">{t("field.status")}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v)}>
                  <SelectTrigger id="cal-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("status.pending")}</SelectItem>
                    <SelectItem value="scheduled">{t("form.pending_schedule")}</SelectItem>
                    <SelectItem value="completed">{t("status.completed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </CardContent>

        {!loadingData && (
          <CardFooter className="justify-end gap-2">
            <Button variant="secondary" onClick={() => router.push("/calibration")}>
              {t("action.cancel")}
            </Button>
            <Button variant="primary" disabled={submitting} onClick={handleSubmit}>
              <SquarePen className="w-4 h-4" />
              {submitting ? t("common.saving") : t("action.save_data")}
            </Button>
          </CardFooter>
        )}
      </Card>
    </PageShell>
  );
}

export default function EditCalibrationPage() {
  return (
    <Suspense fallback={<p className="text-sm">{t("common.loading")}</p>}>
      <EditCalibrationContent />
    </Suspense>
  );
}

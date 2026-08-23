"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export default function CalibrationCreatePage() {
  const router = useRouter();
  
  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [calType, setCalType] = useState("Internal");
  const [calDate, setCalDate] = useState<ISODate | undefined>(undefined);
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);
  const [certNo, setCertNo] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

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

  const handleSubmit = async () => {
    if (!assetId || !calDate || !dueDate) {
      setError(t("msg.cal_required_fields"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/calibration.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          calibration_type: calType,
          calibration_date: calDate,
          next_calibration_date: dueDate,
          certificate_number: certNo,
          status: "pending"
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || t("msg.cal_create_error"));
      }
    } catch {
      setError(t("msg.conn_fail_retry"));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.tool_registered")}
        message={t("msg.cal_plan_added")}
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
        { label: t("form.cal_register") },
      ]}
      title={t("form.cal_register_tool_title")}
      description={t("hero.cal_create_desc")}
    >
      <Card className="mx-auto w-full max-w-[640px]">
        <CardContent className="space-y-5">
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="cal-create-asset">{t("form.measuring_tool_req")}<span className="text-destructive"> *</span></Label>
            <Select value={assetId || undefined} onValueChange={(v) => setAssetId(v)}>
              <SelectTrigger id="cal-create-asset">
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
            <Label htmlFor="cal-create-type">{t("form.cal_type_req")}<span className="text-destructive"> *</span></Label>
            <Select value={calType} onValueChange={(v) => setCalType(v)}>
              <SelectTrigger id="cal-create-type">
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
              <Label htmlFor="cal-create-last-date">{t("form.last_cal_date_req")}<span className="text-destructive"> *</span></Label>
              <Input
                id="cal-create-last-date"
                type="date"
                value={calDate ?? ""}
                onChange={(e) =>
                  setCalDate(e.target.value ? (e.target.value as ISODate) : undefined)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal-create-due-date">{t("form.due_date_req")}<span className="text-destructive"> *</span></Label>
              <Input
                id="cal-create-due-date"
                type="date"
                value={dueDate ?? ""}
                onChange={(e) =>
                  setDueDate(e.target.value ? (e.target.value as ISODate) : undefined)
                }
              />
            </div>
          </div>

          <Input
            id="cal-create-cert-no"
            label={t("form.certificate_no")}
            placeholder={t("placeholder.certificate_no")}
            value={certNo}
            onChange={(e) => setCertNo(e.target.value)}
          />
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push("/calibration")}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" disabled={loading} onClick={handleSubmit}>
            <Plus className="w-4 h-4" />
            {loading ? t("common.saving") : t("action.save_data")}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}

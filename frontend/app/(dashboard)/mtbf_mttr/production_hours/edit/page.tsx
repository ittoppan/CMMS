"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SuccessDialog from "@/components/SuccessDialog";
import { SquarePen } from "lucide-react";

function EditProductionHoursContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordId = searchParams.get("id");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [hours, setHours] = useState("");
  const [shift, setShift] = useState("");
  const [notes, setNotes] = useState("");

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
    if (!recordId) {
      setError("ไม่ระบุหมายเลขรายการ");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/production_hours.php?id=${recordId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(String(json.asset_id || ""));
          setRecordDate(json.record_date || "");
          setHours(String(json.hours ?? ""));
          setShift(json.shift || "");
          setNotes(json.notes || "");
        } else {
          setError("ไม่พบบันทึกชั่วโมงการผลิต");
        }
      })
      .catch(() => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่อีกครั้ง"))
      .finally(() => setLoadingData(false));
  }, [recordId]);

  const handleSubmit = async () => {
    if (!assetId || !recordDate) {
      setError("กรุณาเลือกเครื่องจักร และระบุวันที่");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/v1/production_hours.php?id=${recordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          record_date: recordDate,
          hours: parseFloat(hours) || 0,
          shift: shift || null,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการอัปเดตข้อมูล");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="อัปเดตข้อมูลสำเร็จ!"
        message="บันทึกชั่วโมงการผลิตถูกอัปเดตเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/mtbf_mttr/production_hours")}
        onBackdrop={() => router.push("/mtbf_mttr/production_hours")}
      />
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">PRODUCTION HOURS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "MTBF/MTTR", href: "/mtbf_mttr" },
        { label: "ชั่วโมงการผลิต", href: "/mtbf_mttr/production_hours" },
        { label: "แก้ไขข้อมูล" },
      ]}
      title="แก้ไขชั่วโมงการผลิต"
      description="ปรับแก้ชั่วโมงการทำงานจริงของเครื่องจักรในรอบวันที่นี้"
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลบันทึก</CardTitle>
          <CardDescription>ปรับแก้ตัวเลขการใช้งานของวันนี้</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="max-w-[640px] space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="max-w-[640px] space-y-5">
              {error && (
                <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
              )}

              <div className="space-y-1.5">
                <Label>
                  เครื่องจักร/อุปกรณ์ <span className="text-destructive">*</span>
                </Label>
                <Select value={assetId || undefined} onValueChange={(v) => setAssetId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกเครื่องจักร..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {`${a.code} - ${a.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                <div className="space-y-1.5">
                  <Label htmlFor="ph-date">
                    วันที่ <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ph-date"
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ph-hours">ชั่วโมงทำงาน</Label>
                  <Input
                    id="ph-hours"
                    inputMode="decimal"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
              </Grid>

              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                <div className="space-y-1.5">
                  <Label htmlFor="ph-shift">กะ (ถ้ามี)</Label>
                  <Input
                    id="ph-shift"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ph-notes">หมายเหตุ</Label>
                  <Input
                    id="ph-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </Grid>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => router.push("/mtbf_mttr/production_hours")}>
                  ยกเลิก
                </Button>
                <Button disabled={submitting} onClick={handleSubmit}>
                  <SquarePen className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                  {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default function EditProductionHoursPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลด...</p>}>
      <EditProductionHoursContent />
    </Suspense>
  );
}

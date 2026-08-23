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

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `เดือน ${i + 1} (${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][i]})`,
}));

function EditMtbfMttrContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordId = searchParams.get("id");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [operatingHours, setOperatingHours] = useState("");
  const [totalFailures, setTotalFailures] = useState("");
  const [totalDowntime, setTotalDowntime] = useState("");

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
    fetch(`/api/v1/mtbf_mttr.php?id=${recordId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(String(json.asset_id || ""));
          setYear(String(json.year || new Date().getFullYear()));
          setMonth(String(json.month || new Date().getMonth() + 1));
          setOperatingHours(String(json.operating_hours ?? ""));
          setTotalFailures(String(json.total_failures ?? ""));
          setTotalDowntime(String(json.total_downtime_minutes ?? ""));
        } else {
          setError("ไม่พบข้อมูล MTBF/MTTR");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [recordId]);

  const handleSubmit = async () => {
    if (!assetId || !year || !month) {
      setError("กรุณาเลือกเครื่องจักร และระบุปี/เดือน");
      return;
    }
    const hrs = parseFloat(operatingHours) || 0;
    const fails = parseInt(totalFailures, 10) || 0;
    const downtime = parseInt(totalDowntime, 10) || 0;

    const mtbf = fails > 0 ? Math.round((hrs / fails) * 100) / 100 : null;
    const mttr = fails > 0 ? Math.round((downtime / fails) * 100) / 100 : null;

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId,
        year: year,
        month: month,
        operating_hours: hrs,
        total_failures: fails,
        total_downtime_minutes: downtime,
        mtbf_hours: mtbf,
        mttr_minutes: mttr,
      };

      const res = await fetch(`/api/v1/mtbf_mttr.php?id=${recordId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        message="ดัชนีชี้วัด MTBF/MTTR ถูกอัปเดตเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/mtbf_mttr")}
        onBackdrop={() => router.push("/mtbf_mttr")}
      />
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">MTBF / MTTR · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "MTBF/MTTR", href: "/mtbf_mttr" },
        { label: "แก้ไขข้อมูล" },
      ]}
      title="แก้ไขข้อมูลดัชนีชี้วัด MTBF / MTTR"
      description="แก้ไขข้อมูลชั่วโมงการทำงาน จำนวนครั้งที่เสีย และเวลาหยุดซ่อม"
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลบันทึก</CardTitle>
          <CardDescription>ปรับแก้ตัวเลขการใช้งานของรอบเวลานี้</CardDescription>
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
                  <Label htmlFor="mtbf-year">
                    ปี <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="mtbf-year"
                    placeholder="เช่น 2026"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    เดือน <span className="text-destructive">*</span>
                  </Label>
                  <Select value={month} onValueChange={(v) => setMonth(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="เลือกเดือน..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Grid>

              <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
                <div className="space-y-1.5">
                  <Label htmlFor="mtbf-hours">ชั่วโมงการทำงาน</Label>
                  <Input
                    id="mtbf-hours"
                    inputMode="decimal"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mtbf-failures">จำนวนครั้งที่เสีย</Label>
                  <Input
                    id="mtbf-failures"
                    inputMode="numeric"
                    value={totalFailures}
                    onChange={(e) => setTotalFailures(e.target.value)}
                  />
                </div>
              </Grid>

              <div className="space-y-1.5">
                <Label htmlFor="mtbf-downtime">เวลาหยุดซ่อมรวม (นาที)</Label>
                <Input
                  id="mtbf-downtime"
                  inputMode="numeric"
                  value={totalDowntime}
                  onChange={(e) => setTotalDowntime(e.target.value)}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                ระบบจะคำนวณค่า MTBF (ชม.) และ MTTR (นาที) ใหม่โดยอัตโนมัติจากข้อมูลด้านบน
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => router.push("/mtbf_mttr")}>
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

export default function EditMtbfMttrPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลด...</p>}>
      <EditMtbfMttrContent />
    </Suspense>
  );
}

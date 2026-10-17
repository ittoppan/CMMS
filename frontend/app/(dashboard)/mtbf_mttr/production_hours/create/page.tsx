"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SuccessDialog from "@/components/SuccessDialog";
import { Plus } from "lucide-react";

export default function ProductionHoursCreatePage() {
  const router = useRouter();

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [recordDate, setRecordDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [shift, setShift] = useState("");
  const [notes, setNotes] = useState("");

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
    if (!assetId || !recordDate) {
      setError("กรุณาเลือกเครื่องจักร และระบุวันที่");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/production_hours.php", {
        method: "POST",
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
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title="บันทึกชั่วโมงการผลิตสำเร็จ!"
        message="บันทึกชั่วโมงการทำงานของเครื่องจักรเข้าสู่ระบบเรียบร้อยแล้ว"
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
        { label: "บันทึกข้อมูล" },
      ]}
      title="บันทึกชั่วโมงการผลิต"
      description="บันทึกเวลาทำงานจริงของเครื่องจักร — ใช้เป็นฐานคำนวณ MTBF / MTTR / OEE / Availability"
    >
      <Card>
        <CardHeader>
          <CardTitle>บันทึกข้อมูล</CardTitle>
          <CardDescription>เลือกเครื่องจักรและวันที่ แล้วกรอกชั่วโมงการทำงานจริง</CardDescription>
        </CardHeader>
        <CardContent>
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
                  placeholder="เช่น 8"
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
                  placeholder="เช่น A / B / C"
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph-notes">หมายเหตุ</Label>
                <Input
                  id="ph-notes"
                  placeholder="หมายเหตุเพิ่มเติม"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </Grid>

            <p className="text-xs text-muted-foreground">
              ระบบจะใช้ชั่วโมงการผลิตนี้เป็นตัวตั้งต้น (operating hours) ของ MTBF/MTTR, OEE และ Reliability Engine
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => router.push("/mtbf_mttr/production_hours")}>
                ยกเลิก
              </Button>
              <Button disabled={loading} onClick={handleSubmit}>
                <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

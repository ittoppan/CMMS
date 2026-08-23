"use client";

// asset_registry/edit — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Select, Lucide)
// business logic ครบเดิม: GET/PUT /api/v1/asset_registry.php?id= + SuccessDialog flow

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SquarePen, ArrowLeft } from "lucide-react";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";

function EditAssetContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const assetId = searchParams.get("id");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "Printing Press",
    location: "Building A - Zone 1",
    criticality: "A",
    status: "running",
    serialNumber: "",
    brand: "",
    model: "",
    image_path: "",
  });

  const update = (key: string, val: any) => setForm(prev => ({ ...prev, [key]: val }));

  useEffect(() => {
    if (!assetId) {
      setErrorMessage("ไม่ระบุรหัสเครื่องจักร");
      setLoading(false);
      return;
    }
    fetch(`/api/v1/asset_registry.php?id=${assetId}`)
      .then(res => res.json())
      .then(row => {
        if (row && !row.error) {
          setForm({
            code: row.code || "",
            name: row.name || "",
            category: row.category || "Printing Press",
            location: row.location || "",
            criticality: row.criticality || "A",
            status: row.status || "running",
            serialNumber: row.serial_number || "",
            brand: row.manufacturer || row.brand || "",
            model: row.model || "",
            image_path: row.image_path || "",
          });
        } else {
          setErrorMessage("ไม่พบข้อมูลเครื่องจักร");
        }
      })
      .catch(() => setErrorMessage("เกิดข้อผิดพลาดในการโหลดข้อมูลเครื่องจักร"))
      .finally(() => setLoading(false));
  }, [assetId]);

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      setErrorMessage("กรุณากรอกรหัสเครื่องจักร และชื่อเครื่องจักร");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`/api/v1/asset_registry.php?id=${assetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          category: form.category,
          location: form.location,
          criticality: form.criticality,
          status: form.status,
          serial_number: form.serialNumber,
          manufacturer: form.brand,
          model: form.model,
          image_path: form.image_path || null,
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
        title="บันทึกข้อมูลเครื่องจักรสำเร็จ!"
        message={<>ข้อมูลเครื่องจักร <strong>{form.name}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าทะเบียนเครื่องจักร"
        onPrimary={() => router.push("/asset_registry")}
        onBackdrop={() => router.push("/asset_registry")}
      />
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">ASSET REGISTRY · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "แก้ไขข้อมูลเครื่องจักร" }]}
      title="แก้ไขข้อมูลเครื่องจักร"
      description="แก้ไขประวัติรหัส ชื่อ หมวดหมู่ สถานที่ และระดับความสำคัญ (F-EN-01)"
      actions={
        <Button variant="secondary" onClick={() => router.push("/asset_registry")}>
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          ย้อนกลับ
        </Button>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลเครื่องจักร</CardTitle>
          <CardDescription>ฟอร์มมาตรฐาน F-EN-01 · ช่องที่มี * จำเป็นต้องกรอก</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลเครื่องจักร...</p>
          ) : (
            <>
              {errorMessage && (
                <Alert variant="danger" title="เกิดข้อผิดพลาด" description={errorMessage} />
              )}

              <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
                <div className="space-y-1.5">
                  <Label htmlFor="code">รหัสเครื่องจักร <span className="text-destructive">*</span></Label>
                  <Input
                    id="code"
                    label="รหัสเครื่องจักร"
                    isLabelHidden
                    value={form.code}
                    onChange={(e) => update("code", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name">ชื่อเครื่องจักร / อุปกรณ์ <span className="text-destructive">*</span></Label>
                  <Input
                    id="name"
                    label="ชื่อเครื่องจักร"
                    isLabelHidden
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="category">หมวดหมู่เครื่องจักร</Label>
                  <Select value={form.category} onValueChange={(v) => update("category", v)}>
                    <SelectTrigger id="category" aria-label="หมวดหมู่">
                      <SelectValue placeholder="เลือกหมวดหมู่" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Printing Press">เครื่องพิมพ์</SelectItem>
                      <SelectItem value="Laminator">เครื่องลามิเนต</SelectItem>
                      <SelectItem value="Slitting Machine">เครื่องตัดสลิต</SelectItem>
                      <SelectItem value="Conveyor">สายพานลำเลียง</SelectItem>
                      <SelectItem value="Utility">ระบบสาธารณูปโภค / เครื่องอัดอากาศ</SelectItem>
                      <SelectItem value="Vehicle">ยานพาหนะ / รถโฟล์คลิฟท์</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="location">สถานที่ติดตั้ง</Label>
                  <Input
                    id="location"
                    label="สถานที่"
                    isLabelHidden
                    value={form.location}
                    onChange={(e) => update("location", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="criticality">ระดับความสำคัญ (A/B/C)</Label>
                  <Select value={form.criticality} onValueChange={(v) => update("criticality", v)}>
                    <SelectTrigger id="criticality" aria-label="ระดับความสำคัญ">
                      <SelectValue placeholder="เลือกระดับความสำคัญ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">Class A — ส่งผลต่อการผลิตหลักหยุดชะงัก</SelectItem>
                      <SelectItem value="B">Class B — เครื่องจักรรอง สำรองได้</SelectItem>
                      <SelectItem value="C">Class C — อุปกรณ์ทั่วไป</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="status">สถานะการทำงานปัจจุบัน</Label>
                  <Select value={form.status} onValueChange={(v) => update("status", v)}>
                    <SelectTrigger id="status" aria-label="สถานะ">
                      <SelectValue placeholder="เลือกสถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="running">เดินเครื่องทำงานปกติ</SelectItem>
                      <SelectItem value="breakdown">เครื่องเสีย</SelectItem>
                      <SelectItem value="maintenance">กำลังทำซ่อมบำรุง</SelectItem>
                      <SelectItem value="standby">พร้อมใช้งานสำรอง</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="serialNumber">เลขซีเรียล</Label>
                  <Input
                    id="serialNumber"
                    label="เลขซีเรียล"
                    isLabelHidden
                    value={form.serialNumber}
                    onChange={(e) => update("serialNumber", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="brand">ยี่ห้อ / ผู้ผลิต</Label>
                  <Input
                    id="brand"
                    label="ยี่ห้อ"
                    isLabelHidden
                    value={form.brand}
                    onChange={(e) => update("brand", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="model">รุ่น</Label>
                  <Input
                    id="model"
                    label="รุ่น"
                    isLabelHidden
                    value={form.model}
                    onChange={(e) => update("model", e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>รูปภาพเครื่องจักร</Label>
                  <ImageUploadField
                    value={form.image_path || null}
                    onChange={(url) => update("image_path", url || "")}
                    folder="assets"
                    label="รูปเครื่องจักร"
                  />
                </div>
              </Grid>
            </>
          )}
        </CardContent>
        {!loading && (
          <CardFooter className="justify-end gap-2">
            <Button variant="secondary" onClick={() => (window.location.href = "/asset_registry")}>
              ยกเลิก
            </Button>
            <Button disabled={submitting} onClick={handleSubmit}>
              <SquarePen size={16} strokeWidth={1.75} aria-hidden="true" />
              {submitting ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </CardFooter>
        )}
      </Card>
    </PageShell>
  );
}

export default function EditAssetPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-10 text-sm text-muted-foreground">กำลังโหลด...</div>}>
      <EditAssetContent />
    </Suspense>
  );
}

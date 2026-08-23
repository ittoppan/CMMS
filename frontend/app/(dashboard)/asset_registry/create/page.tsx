"use client";

// asset_registry/create — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Select, Lucide)
// business logic ครบเดิม: POST /api/v1/asset_registry.php + SuccessDialog flow

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ArrowLeft } from "lucide-react";
import ImageUploadField from "@/components/ImageUploadField";
import SuccessDialog from "@/components/SuccessDialog";

export default function CreateAssetPage() {
  const router = useRouter();
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

  const handleSubmit = async () => {
    if (!form.code || !form.name) {
      setErrorMessage("กรุณากรอกรหัสเครื่องจักร และชื่อเครื่องจักร");
      return;
    }
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/v1/asset_registry.php", {
        method: "POST",
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
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setErrorMessage(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูลเครื่องจักร");
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
        title="เพิ่มเครื่องจักรสำเร็จ!"
        message={<>เครื่องจักร <strong>{form.code} - {form.name}</strong> ถูกเพิ่มเข้าสู่ทะเบียนเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าทะเบียนเครื่องจักร"
        secondaryLabel="เพิ่มเครื่องจักรอีก"
        onPrimary={() => router.push("/asset_registry")}
        onSecondary={() => {
          setSubmitted(false);
          setForm({ code: "", name: "", category: "Printing Press", location: "Building A - Zone 1", criticality: "A", status: "running", serialNumber: "", brand: "", model: "", image_path: "" });
        }}
        onBackdrop={() => router.push("/asset_registry")}
      />
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">ASSET REGISTRY · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "ลงทะเบียนเครื่องจักรใหม่" }]}
      title="ลงทะเบียนเครื่องจักรใหม่"
      description="บันทึกประวัติรหัส ชื่อ หมวดหมู่ สถานที่ และระดับความสำคัญ (F-EN-01)"
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
                placeholder="เช่น MC-FX-05, MC-LM-02"
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
                placeholder="เช่น เครื่องพิมพ์เฟล็กโซ 10 สี"
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
                placeholder="เช่น อาคาร A โซน 1, หลังคา, สถานีไฟฟ้าย่อย B"
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
                placeholder="เช่น SN-FX-88201-JP"
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
                placeholder="เช่น Komori, Nordmeccanica, Toyota"
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
                placeholder="เช่น FX-2000 Pro"
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
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="secondary" onClick={() => (window.location.href = "/asset_registry")}>
            ยกเลิก
          </Button>
          <Button disabled={submitting} onClick={handleSubmit}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {submitting ? "กำลังบันทึก..." : "บันทึกเครื่องจักร"}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
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
import { Upload } from "lucide-react";

export default function ManualCreatePage() {
  const router = useRouter();
  
  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [file, setFile] = useState<File | null>(null);

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
    if (!title) {
      setError("กรุณาระบุชื่อเอกสาร (Title)");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/manuals.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId || null,
          title: title,
          description: description,
          version: version,
          file_type: "pdf"
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการอัปโหลดเอกสาร");
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
        title="อัปโหลดเอกสารสำเร็จ!"
        message={<>เอกสาร <strong>{title}</strong> ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/manuals")}
        onBackdrop={() => router.push("/manuals")}
      />
    );
  }

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">MANUALS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คู่มือ & SOP", href: "/manuals" },
        { label: "อัปโหลดเอกสาร" },
      ]}
      title="อัปโหลดเอกสาร/คู่มือใหม่"
      description="อัปโหลดคู่มือเครื่องจักร หรือขั้นตอนการปฏิบัติงานมาตรฐาน (SOP)"
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลเอกสาร</CardTitle>
          <CardDescription>กรอกรายละเอียดคู่มือ/SOP ที่ต้องการเพิ่มเข้าระบบ</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-[640px] space-y-5">
            {error && (
              <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
            )}

            <div className="space-y-1.5">
              <Label htmlFor="manual-title">
                ชื่อเอกสาร <span className="text-destructive">*</span>
              </Label>
              <Input
                id="manual-title"
                placeholder="เช่น คู่มือการใช้งานปั๊มน้ำ..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-description">รายละเอียด</Label>
              <Textarea
                id="manual-description"
                placeholder="อธิบายเนื้อหาโดยย่อ..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Grid columns={{ minWidth: 220, max: 2 }} gap={4}>
              <div className="space-y-1.5">
                <Label>เครื่องจักรที่เกี่ยวข้อง (ไม่บังคับ)</Label>
                <Select value={assetId || undefined} onValueChange={(v) => setAssetId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="เอกสารทั่วไป (ไม่ต้องเลือก)" />
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
              <div className="space-y-1.5">
                <Label htmlFor="manual-version">เวอร์ชัน</Label>
                <Input
                  id="manual-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>
            </Grid>

            <div className="space-y-1.5">
              <Label htmlFor="manual-file">
                ไฟล์เอกสาร (PDF, DOCX) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="manual-file"
                type="file"
                accept=".pdf,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-[var(--cmms-bg-muted)] file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-[var(--cmms-bg-wash)]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => router.push("/manuals")}>
                ยกเลิก
              </Button>
              <Button disabled={loading} onClick={handleSubmit}>
                <Upload className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
                {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

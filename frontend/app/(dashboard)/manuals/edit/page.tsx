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
import { Textarea } from "@/components/ui/textarea";
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

function EditManualContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const manualId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0");
  const [filePath, setFilePath] = useState("");

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
    if (!manualId) {
      setError("ไม่ระบุหมายเลขเอกสาร");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/manuals.php?id=${manualId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(json.asset_id ? String(json.asset_id) : "");
          setTitle(json.title || "");
          setDescription(json.description || "");
          setVersion(json.version || "1.0");
          setFilePath(json.file_path || "");
        } else {
          setError("ไม่พบข้อมูลเอกสาร");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [manualId]);

  const handleSubmit = async () => {
    if (!title) {
      setError("กรุณาระบุชื่อเอกสาร (Title)");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId || null,
        title,
        description,
        version,
        file_path: filePath
      };

      const res = await fetch(`/api/v1/manuals.php?id=${manualId}`, {
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
        message={<>รายละเอียดเอกสาร <strong>{title}</strong> ถูกอัปเดตเรียบร้อยแล้ว</>}
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
        { label: "แก้ไขเอกสาร" },
      ]}
      title="แก้ไขข้อมูลเอกสาร"
      description="แก้ไขรายละเอียดเอกสารคู่มือ — ชื่อ รายละเอียด เวอร์ชัน และลิงก์ไฟล์"
    >
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลเอกสาร</CardTitle>
          <CardDescription>ปรับแก้รายละเอียดของเอกสารที่มีอยู่</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="max-w-[640px] space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="manual-description">รายละเอียด</Label>
                <Textarea
                  id="manual-description"
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
                <Label htmlFor="manual-filepath">ลิงก์ไฟล์เอกสาร</Label>
                <Input
                  id="manual-filepath"
                  placeholder="https://..."
                  value={filePath}
                  onChange={(e) => setFilePath(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => router.push("/manuals")}>
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

export default function EditManualPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">กำลังโหลด...</p>}>
      <EditManualContent />
    </Suspense>
  );
}

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, BookOpenIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

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
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>MANUALS EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แก้ไขข้อมูลเอกสาร</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <BookOpenIcon className="w-3.5 h-3.5" /> เอกสารคู่มือ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แก้ไขรายละเอียดเอกสารคู่มือ — ชื่อ รายละเอียด เวอร์ชัน และลิงก์ไฟล์
          </Text>
        </VStack>
      </div>

      <Breadcrumbs>
        <BreadcrumbItem href="/manuals" startIcon={<HomeIcon className="w-4 h-4" />}>เอกสารคู่มือ & SOP</BreadcrumbItem>
        <BreadcrumbItem isCurrent>แก้ไขเอกสาร</BreadcrumbItem>
      </Breadcrumbs>

      <Card padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        ) : (
          <VStack gap={5} style={{ maxWidth: 640 }}>
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <TextInput label="ชื่อเอกสาร *"
              value={title}
              onChange={setTitle}  />

            <TextArea
              label="รายละเอียด"
              value={description}
              onChange={setDescription}
            />
            
            <HStack gap={4}>
              <div style={{ flex: 2 }}>
                <Selector
                  label="เครื่องจักรที่เกี่ยวข้อง (ไม่บังคับ)"
                  placeholder="เอกสารทั่วไป (ไม่ต้องเลือก)"
                  value={assetId}
                  onChange={setAssetId}
                  options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextInput label="เวอร์ชัน"
                  value={version}
                  onChange={setVersion}  />
              </div>
            </HStack>

            <TextInput label="ลิงก์ไฟล์เอกสาร"
              placeholder="https://..."
              value={filePath}
              onChange={setFilePath}  />

            <HStack gap={3} hAlign="end">
              <button
                type="button"
                onClick={() => router.push("/manuals")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300 disabled:opacity-60"
              >
                <PencilSquareIcon className="w-4 h-4" />
                {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditManualPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditManualContent />
    </Suspense>
  );
}

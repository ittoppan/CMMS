"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, BookOpenIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

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
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>MANUALS CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>อัปโหลดเอกสาร/คู่มือใหม่</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <BookOpenIcon className="w-3.5 h-3.5" /> เอกสารใหม่
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            อัปโหลดคู่มือเครื่องจักร หรือขั้นตอนการปฏิบัติงานมาตรฐาน (SOP)
          </Text>
        </VStack>
      </div>

      <Breadcrumbs>
        <BreadcrumbItem href="/manuals" startIcon={<HomeIcon className="w-4 h-4" />}>เอกสารคู่มือ & SOP</BreadcrumbItem>
        <BreadcrumbItem isCurrent>อัปโหลดเอกสาร</BreadcrumbItem>
      </Breadcrumbs>

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <TextInput label="ชื่อเอกสาร *"
            placeholder="เช่น คู่มือการใช้งานปั๊มน้ำ..."
            value={title}
            onChange={setTitle}  />

          <TextArea
            label="รายละเอียด"
            placeholder="อธิบายเนื้อหาโดยย่อ..."
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

          <FileInput
            label="ไฟล์เอกสาร (PDF, DOCX) *"
            value={file}
            onChange={(f) => setFile(Array.isArray(f) ? f[0] ?? null : f)}
          />

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
              disabled={loading}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0057A8] to-[#1E88E5] shadow-lg shadow-blue-900/30 hover:shadow-xl hover:brightness-110 transition-all duration-300 disabled:opacity-60"
            >
              <ArrowUpTrayIcon className="w-4 h-4" />
              {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

"use client";

// ImageUploadField — v3 design port (ux-redesign)
// Public API unchanged: value / onChange / folder / label / allowUrl
// business logic ครบเดิม: POST /api/v1/upload.php (dataURL) หรือวาง URL เอง

import { useRef, useState } from "react";
import { VStack, HStack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";

interface ImageUploadFieldProps {
  /** ค่าปัจจุบัน: URL ของรูป (เช่น /uploads/spares/xxx.png) หรือ null */
  value?: string | null;
  /** เรียกเมื่อรูปเปลี่ยน — ได้ URL ที่บันทึกแล้ว หรือ null เมื่อลบ */
  onChange: (url: string | null) => void;
  /** โฟลเดอร์ปลายทางใน public/uploads/ (spares | assets | avatars | repair | pm_am | calibration) */
  folder?: string;
  /** Label ของฟอร์มฟิลด์ */
  label?: string;
  /** ให้กรอก URL ได้ด้วย (เช่น URL รูปจาก Sage) */
  allowUrl?: boolean;
}

/**
 * ฟิลด์อัปโหลดรูปภาพแบบ reuse: เลือกไฟล์ -> อัปโหลดผ่าน /api/v1/upload.php
 * -> เก็บ path /uploads/<folder>/<file> แล้วส่งกลับผ่าน onChange
 */
export default function ImageUploadField({
  value,
  onChange,
  folder = "spares",
  label = "รูปภาพ (Image)",
  allowUrl = true,
}: ImageUploadFieldProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (f: File) => {
    setErrorMsg("");
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("read-error"));
        reader.readAsDataURL(f);
      });
      const res = await fetch("/api/v1/upload.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder, data: dataUrl }),
      });
      const json = await res.json();
      if (res.ok && json.status === "success" && json.url) {
        onChange(json.url);
      } else {
        setErrorMsg(json.error || "อัปโหลดรูปไม่สำเร็จ");
      }
    } catch (e) {
      console.error("Upload error", e);
      setErrorMsg("เกิดข้อผิดพลาดในการอัปโหลดรูป กรุณาลองใหม่");
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  const handleUrlApply = () => {
    const v = urlInput.trim();
    if (!v) return;
    const cleaned = v.replace(/\\/g, "/");
    onChange(cleaned.startsWith("/") || cleaned.startsWith("http") ? cleaned : "/" + cleaned);
    setUrlInput("");
    setErrorMsg("");
  };

  return (
    <VStack gap={2} className="items-start">
      <VStack gap={1} className="items-start">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          aria-label={label}
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFile(selected);
            if (selected) uploadFile(selected);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          เลือกไฟล์รูป...
        </Button>
        {uploading && (
          <HStack gap={2} vAlign="center">
            <Loader2 size={14} strokeWidth={1.75} aria-hidden="true" className="animate-spin text-[var(--cmms-text-secondary)]" />
            <p className="text-sm text-muted-foreground">กำลังอัปโหลดรูป...</p>
          </HStack>
        )}
      </VStack>

      {value ? (
        <HStack gap={3} vAlign="center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            style={{ width: 96, height: 72, borderRadius: 8, objectFit: "cover", border: "1px solid var(--cmms-border)" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.4"; }}
          />
          <VStack gap={1} className="items-start">
            <p className="max-w-[320px] break-all text-sm text-muted-foreground">{value}</p>
            <Button variant="secondary" size="sm" onClick={() => onChange(null)}>
              <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
              ลบรูป
            </Button>
          </VStack>
        </HStack>
      ) : (
        !uploading && (
          <p className="text-sm text-muted-foreground opacity-70">ยังไม่มีรูปภาพ</p>
        )
      )}

      {allowUrl && (
        <HStack gap={2} vAlign="center">
          <Input
            label="URL รูปภาพ"
            isLabelHidden
            placeholder="หรือวาง URL รูปภาพที่นี่ (เช่น จาก Sage)..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-64"
          />
          <Button variant="secondary" size="sm" onClick={handleUrlApply}>ใช้ URL นี้</Button>
        </HStack>
      )}

      {errorMsg && (
        <p className="text-sm" style={{ color: "var(--cmms-danger)" }}>⚠️ {errorMsg}</p>
      )}
    </VStack>
  );
}

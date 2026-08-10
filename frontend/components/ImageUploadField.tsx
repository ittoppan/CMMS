"use client";

import { useState } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { FileInput } from "@astryxdesign/core/FileInput";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { TrashIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

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
    <VStack gap={2}>
      <VStack gap={1}>
        <FileInput
          label={label}
          isLabelHidden
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          value={file}
          onChange={(f) => {
            const selected = Array.isArray(f) ? f[0] ?? null : f;
            setFile(selected);
            if (selected) uploadFile(selected);
          }}
        />
        {uploading && (
          <HStack gap={2} vAlign="center">
            <Icon icon={ArrowPathIcon} size="sm" />
            <Text type="body" size="sm" color="secondary">กำลังอัปโหลดรูป...</Text>
          </HStack>
        )}
      </VStack>

      {value ? (
        <HStack gap={3} vAlign="center">
          <img
            src={value}
            alt={label}
            style={{ width: 96, height: 72, borderRadius: 8, objectFit: "cover", border: "1px solid var(--color-border)" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.4"; }}
          />
          <VStack gap={1}>
            <Text type="body" size="sm" color="secondary" style={{ wordBreak: "break-all", maxWidth: 320 }}>{value}</Text>
            <Button
              label="ลบรูป"
              variant="secondary"
              size="sm"
              icon={<Icon icon={TrashIcon} size="xsm" />}
              onClick={() => onChange(null)}
            />
          </VStack>
        </HStack>
      ) : (
        !uploading && (
          <Text type="body" size="sm" color="secondary" style={{ opacity: 0.7 }}>ยังไม่มีรูปภาพ</Text>
        )
      )}

      {allowUrl && (
        <HStack gap={2} vAlign="center">
          <TextInput
            label="URL รูปภาพ"
            isLabelHidden
            placeholder="หรือวาง URL รูปภาพที่นี่ (เช่น จาก Sage)..."
            value={urlInput}
            onChange={setUrlInput}
          />
          <Button label="ใช้ URL นี้" variant="secondary" size="sm" onClick={handleUrlApply} />
        </HStack>
      )}

      {errorMsg && (
        <Text type="body" size="sm" style={{ color: "var(--cmms-danger)" }}>⚠️ {errorMsg}</Text>
      )}
    </VStack>
  );
}

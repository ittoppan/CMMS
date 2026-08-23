"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { VStack, HStack, Grid } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";
import {
  Image as ImageIcon,
  RefreshCw as ArrowPathIcon,
  TriangleAlert as ExclamationTriangleIcon,
  Smartphone as DevicePhoneMobileIcon,
} from "lucide-react";

interface IconInfo {
  path: string;
  mtime: number;
  width: number | null;
  height: number | null;
  bytes: number;
}

interface PwaStatus {
  icons: { 192: IconInfo | null; 512: IconInfo | null };
  sw: { frontend: string; php: string };
}

export default function PwaSettingsPage() {
  const [status, setStatus] = useState<PwaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/pwa_settings.php");
      if (res.status === 401 || res.status === 403) {
        setError("ไม่มีสิทธิ์เข้าถึง — ต้องเป็นผู้ดูแลระบบ (Admin)");
        setStatus(null);
        return;
      }
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || "โหลดข้อมูลไม่สำเร็จ");
      setStatus(json);
    } catch (e: any) {
      setError(e.message || "โหลดข้อมูลไอคอน PWA ไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!/image\/(png|jpeg|webp)/.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      setError("เลือกไฟล์ภาพ PNG/JPEG/WebP เท่านั้น");
      return;
    }
    setError(null);
    setSelectedName(file.name);
    const url = URL.createObjectURL(file);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return url;
    });
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("กรุณาเลือกไฟล์ภาพก่อน");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess("");
    try {
      const fd = new FormData();
      fd.append("icon", file);
      const res = await fetch("/api/v1/pwa_settings.php", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "อัปโหลดไม่สำเร็จ");
      setSuccess(
        `${json.message} — ไอคอนเวอร์ชันใหม่จะแสดงหลังรีเฟรช/เปิดแอปครั้งถัดไป (Service Worker อัปเดตอัตโนมัติ)`
      );
      setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
      setSelectedName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchStatus();
    } catch (e: any) {
      setError(e.message || "อัปโหลดไอคอนไม่สำเร็จ");
    }
    setSaving(false);
  };

  const iconSrc = (info: IconInfo | null) =>
    info ? `${info.path}?t=${info.mtime}` : null;

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center gap-3" style={{ padding: 60 }}>
        <Spinner size={20} />
        <p className="text-sm text-muted-foreground">กำลังโหลดข้อมูลไอคอน PWA...</p>
      </div>
    );
  }

  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "ตั้งค่า", href: "/settings" }, { label: "ไอคอน PWA (Mobile App)" }]}
      title="ตั้งค่าไอคอน PWA"
      description="เปลี่ยนไอคอนแอปพลิเคชันบนหน้าจอมือถือ (ติดตั้งจากเบราว์เซอร์) — อัปเดตให้ทั้ง PWA และเว็บ PHP พร้อมกัน"
      actions={
        <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
          Mobile App
        </span>
      }
    >
      {/* BISECT START */}
      <VStack gap={6} data-bisect="full">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}
      {success && (
        <Alert variant="success" title="สำเร็จ" description={success} />
      )}

      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        {/* ซ้าย: ไอคอนปัจจุบัน + แบบฟอร์มอัปโหลด */}
        <Card style={{ gridColumn: "span 2" }}>
          <CardContent className="space-y-5 p-5">
            <VStack gap={1}>
              <HStack gap={3} vAlign="center">
                <ImageIcon className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold">ไอคอนปัจจุบัน</h3>
              </HStack>
              <p className="text-sm text-muted-foreground">
                ระบบจะสร้างขนาด 192x192 และ 512x512 อัตโนมัติจากภาพต้นฉบับ (ครอบกลางจอ — cover center crop)
              </p>
            </VStack>

            <HStack gap={5} wrap="wrap" vAlign="center">
              {status?.icons[192] && (
                <VStack gap={1}>
                  <img
                    src={iconSrc(status.icons[192]) ?? undefined}
                    alt="icon 192"
                    width={96}
                    height={96}
                    style={{ borderRadius: 22, boxShadow: "0 4px 14px rgba(0,0,0,.18)", background: "#fff" }}
                  />
                  <p className="text-sm text-muted-foreground">192×192</p>
                </VStack>
              )}
              {status?.icons[512] && (
                <VStack gap={1}>
                  <img
                    src={iconSrc(status.icons[512]) ?? undefined}
                    alt="icon 512"
                    width={128}
                    height={128}
                    style={{ borderRadius: 28, boxShadow: "0 4px 14px rgba(0,0,0,.18)", background: "#fff" }}
                  />
                  <p className="text-sm text-muted-foreground">512×512</p>
                </VStack>
              )}
              <VStack gap={1}>
                <span className="cmms-andon-chip self-start" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                  SW Frontend {status?.sw.frontend ?? "-"}
                </span>
                <span className="cmms-andon-chip self-start" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                  SW PHP {status?.sw.php ?? "-"}
                </span>
                <p className="text-sm text-muted-foreground">
                  cache version — อัปเดตอัตโนมัติทุกครั้งที่เปลี่ยนไอคอน
                </p>
              </VStack>
            </HStack>

            <VStack gap={2} style={{ borderTop: "1px solid var(--cmms-border)", paddingTop: 20 }}>
              <HStack gap={3} vAlign="center">
                <ArrowPathIcon className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
                <h3 className="text-base font-semibold">เปลี่ยนไอคอนใหม่</h3>
              </HStack>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? "var(--cmms-primary)" : "var(--cmms-border)"}`,
                  borderRadius: "var(--cmms-radius)",
                  background: dragging ? "var(--cmms-primary-light)" : "transparent",
                  padding: "32px 20px",
                  textAlign: "center",
                  cursor: "pointer",
                  transition: "border-color .15s, background .15s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <VStack gap={1}>
                  <ImageIcon className="mx-auto h-6 w-6 text-[var(--cmms-text-secondary)]" strokeWidth={1.75} aria-hidden="true" />
                  <span className="font-medium">
                    {selectedName || "ลากไฟล์ภาพมาวาง หรือคลิกเพื่อเลือก"}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    PNG / JPEG / WebP — แนะนำภาพสี่เหลี่ยมจัตุรัส (เช่น 512×512) โปร่งใสได้
                  </p>
                </VStack>
              </div>

              <HStack gap={4} wrap="wrap" vAlign="center">
                {preview && (
                  <HStack gap={3} vAlign="center">
                    <img
                      src={preview}
                      alt="preview"
                      width={88}
                      height={88}
                      style={{ borderRadius: 20, boxShadow: "0 4px 14px rgba(0,0,0,.18)", background: "#fff", objectFit: "cover" }}
                    />
                    <VStack gap={0}>
                      <span className="font-medium">{selectedName}</span>
                      <p className="text-sm text-muted-foreground">พรีวิวภาพต้นฉบับ (จะ crop เป็นจัตุรัส)</p>
                    </VStack>
                  </HStack>
                )}
                <HStack hAlign="end" gap={3} style={{ marginLeft: "auto" }}>
                  <Button
                    variant="secondary"
                    disabled={!preview || saving}
                    onClick={() => {
                      setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
                      setSelectedName("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    disabled={!preview}
                    onClick={handleUpload}
                  >
                    <ArrowPathIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {saving ? "กำลังบันทึก..." : "บันทึกไอคอนใหม่"}
                  </Button>
                </HStack>
              </HStack>
            </VStack>
          </CardContent>
        </Card>

        {/* ขวา: คำแนะนำ (BISECT: div instead of Text) */}
        <Card>
          <CardContent className="space-y-4 p-5">
            <HStack gap={3} vAlign="center">
              <DevicePhoneMobileIcon className="h-5 w-5 text-[var(--cmms-primary)]" strokeWidth={1.75} aria-hidden="true" />
              <h3 className="text-base font-semibold">วิธีดูผลลัพธ์</h3>
            </HStack>
            <VStack gap={2}>
              <span className="font-medium">บนมือถือ (PWA ที่ติดตั้งแล้ว)</span>
              <p className="text-sm text-muted-foreground">
                ไอคอนบนหน้าจอหลักจะเปลี่ยนเมื่อเปิดแอปครั้งถัดไป — Service Worker อัปเดต
                cache เองอัตโนมัติ (รุ่น cache bump ทุกครั้งที่บันทึก)
              </p>
            </VStack>
            <VStack gap={2}>
              <span className="font-medium">บนเว็บเบราว์เซอร์</span>
              <p className="text-sm text-muted-foreground">
                กดรีเฟรช (Ctrl+F5) 1 ครั้ง หลังจากนั้นไอคอนใหม่ในแท็บ/บุ๊กมาร์กจะโผล่เมื่อเปิดเว็บใหม่
              </p>
            </VStack>
            <VStack gap={2}>
              <span className="font-medium">คำแนะนำ</span>
              <div className="flex items-start gap-1.5 text-sm" style={{ color: "var(--color-secondary)" }}>
                <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>ใช้ภาพจัตุรัส และเว้นขอบปลอดภัย ~20% สำหรับ maskable icon เพื่อไม่ให้โดน crop ตอนติดตั้งแอป</span>
              </div>
            </VStack>
          </CardContent>
        </Card>
      </Grid>
      </VStack>
    </PageShell>
  );
}

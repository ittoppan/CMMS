"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Grid } from "@astryxdesign/core/Grid";
import {
  CheckCircleIcon,
  PhotoIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline";

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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูลไอคอน PWA...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6} data-bisect="full">
      {/* BISECT START */}
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}
      {success && (
        <Card padding={4} style={{ background: "var(--cmms-success-bg)", border: "1px solid var(--cmms-success)" }}>
          <HStack gap={3} vAlign="center">
            <Icon icon={CheckCircleIcon} size="md" color="success" />
            <Text type="body" weight="bold" style={{ color: "var(--cmms-success)" }}>
              {success}
            </Text>
          </HStack>
        </Card>
      )}

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>ตั้งค่าไอคอน PWA</Heading>
            <Badge label="Mobile App" variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            เปลี่ยนไอคอนแอปพลิเคชันบนหน้าจอมือถือ (ติดตั้งจากเบราว์เซอร์) — อัปเดตให้ทั้ง PWA และเว็บ PHP พร้อมกัน
          </Text>
        </VStack>
      </HStack>

      <Grid columns={{ minWidth: 280 }} gap={6} style={{ alignItems: "start" }}>
        {/* ซ้าย: ไอคอนปัจจุบัน + แบบฟอร์มอัปโหลด */}
        <Card padding={5} style={{ gridColumn: "span 2" }}>
          <VStack gap={5}>
            <VStack gap={1}>
              <HStack gap={3} vAlign="center">
                <Icon icon={PhotoIcon} size="md" color="primary" />
                <Heading level={3}>ไอคอนปัจจุบัน</Heading>
              </HStack>
              <Text type="supporting" color="secondary">
                ระบบจะสร้างขนาด 192x192 และ 512x512 อัตโนมัติจากภาพต้นฉบับ (ครอบกลางจอ — cover center crop)
              </Text>
            </VStack>

            <HStack gap={5} wrap="wrap" vAlign="center">
              {status?.icons[192] && (
                <VStack gap={1} hAlign="center">
                  <img
                    src={iconSrc(status.icons[192])}
                    alt="icon 192"
                    width={96}
                    height={96}
                    style={{ borderRadius: 22, boxShadow: "0 4px 14px rgba(0,0,0,.18)", background: "#fff" }}
                  />
                  <Text type="body" size="sm" color="secondary">192×192</Text>
                </VStack>
              )}
              {status?.icons[512] && (
                <VStack gap={1} hAlign="center">
                  <img
                    src={iconSrc(status.icons[512])}
                    alt="icon 512"
                    width={128}
                    height={128}
                    style={{ borderRadius: 28, boxShadow: "0 4px 14px rgba(0,0,0,.18)", background: "#fff" }}
                  />
                  <Text type="body" size="sm" color="secondary">512×512</Text>
                </VStack>
              )}
              <VStack gap={1}>
                <Badge label={`SW Frontend ${status?.sw.frontend ?? "-"}`} variant="neutral" />
                <Badge label={`SW PHP ${status?.sw.php ?? "-"}`} variant="neutral" />
                <Text type="body" size="sm" color="secondary">
                  cache version — อัปเดตอัตโนมัติทุกครั้งที่เปลี่ยนไอคอน
                </Text>
              </VStack>
            </HStack>

            <VStack gap={2} style={{ borderTop: "1px solid var(--cmms-border)", paddingTop: 20 }}>
              <HStack gap={3} vAlign="center">
                <Icon icon={ArrowPathIcon} size="md" color="primary" />
                <Heading level={3}>เปลี่ยนไอคอนใหม่</Heading>
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
                <VStack gap={1} hAlign="center">
                  <Icon icon={PhotoIcon} size="lg" color="secondary" />
                  <Text type="body" weight="semibold">
                    {selectedName || "ลากไฟล์ภาพมาวาง หรือคลิกเพื่อเลือก"}
                  </Text>
                  <Text type="body" size="sm" color="secondary">
                    PNG / JPEG / WebP — แนะนำภาพสี่เหลี่ยมจัตุรัส (เช่น 512×512) โปร่งใสได้
                  </Text>
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
                      <Text type="body" weight="semibold">{selectedName}</Text>
                      <Text type="body" size="sm" color="secondary">พรีวิวภาพต้นฉบับ (จะ crop เป็นจัตุรัส)</Text>
                    </VStack>
                  </HStack>
                )}
                <HStack hAlign="end" gap={3} style={{ marginLeft: "auto" }}>
                  <Button
                    label="ยกเลิก"
                    variant="secondary"
                    isDisabled={!preview || saving}
                    onClick={() => {
                      setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
                      setSelectedName("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  />
                  <Button
                    label="บันทึกไอคอนใหม่"
                    variant="primary"
                    icon={<Icon icon={ArrowPathIcon} size="sm" />}
                    isLoading={saving}
                    isDisabled={!preview}
                    onClick={handleUpload}
                  />
                </HStack>
              </HStack>
            </VStack>
          </VStack>
        </Card>

        {/* ขวา: คำแนะนำ (BISECT: div instead of Text) */}
        <Card padding={5}>
          <VStack gap={4}>
            <HStack gap={3} vAlign="center">
              <Icon icon={DevicePhoneMobileIcon} size="md" color="primary" />
              <Heading level={3}>วิธีดูผลลัพธ์</Heading>
            </HStack>
            <VStack gap={2}>
              <Text type="body" weight="semibold">บนมือถือ (PWA ที่ติดตั้งแล้ว)</Text>
              <Text type="body" size="sm" color="secondary">
                ไอคอนบนหน้าจอหลักจะเปลี่ยนเมื่อเปิดแอปครั้งถัดไป — Service Worker อัปเดต
                cache เองอัตโนมัติ (รุ่น cache bump ทุกครั้งที่บันทึก)
              </Text>
            </VStack>
            <VStack gap={2}>
              <Text type="body" weight="semibold">บนเว็บเบราว์เซอร์</Text>
              <Text type="body" size="sm" color="secondary">
                กดรีเฟรช (Ctrl+F5) 1 ครั้ง หลังจากนั้นไอคอนใหม่ในแท็บ/บุ๊กมาร์กจะโผล่เมื่อเปิดเว็บใหม่
              </Text>
            </VStack>
            <VStack gap={2}>
              <Text type="body" weight="semibold">คำแนะนำ</Text>
              <div style={{ fontSize: "0.875rem", color: "var(--color-secondary)" }}>
                <Icon icon={ExclamationTriangleIcon} size="xsm" />
                {" "}ใช้ภาพจัตุรัส และเว้นขอบปลอดภัย ~20% สำหรับ maskable icon เพื่อไม่ให้โดน crop ตอนติดตั้งแอป
              </div>
            </VStack>
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}

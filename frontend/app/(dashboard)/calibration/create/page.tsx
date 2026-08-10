"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export default function CalibrationCreatePage() {
  const router = useRouter();
  
  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [calType, setCalType] = useState("Internal");
  const [calDate, setCalDate] = useState<ISODate | undefined>(undefined);
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);
  const [certNo, setCertNo] = useState("");

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
    if (!assetId || !calDate || !dueDate) {
      setError("กรุณาเลือกเครื่องมือ, ระบุวันที่สอบเทียบ และวันครบกำหนด");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/calibration.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          calibration_type: calType,
          calibration_date: calDate,
          next_calibration_date: dueDate,
          certificate_number: certNo,
          status: "pending"
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการสร้างแผนสอบเทียบ");
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
        title="ลงทะเบียนเครื่องมือสำเร็จ!"
        message="แผนสอบเทียบสำหรับเครื่องมือนี้ ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/calibration")}
        onBackdrop={() => router.push("/calibration")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/calibration" startIcon={<HomeIcon />}>การสอบเทียบ</BreadcrumbItem>
        <BreadcrumbItem isCurrent>ลงทะเบียนสอบเทียบ</BreadcrumbItem>
      </Breadcrumbs>

      <Heading level={2}>ลงทะเบียนสอบเทียบเครื่องมือวัด</Heading>

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <Selector
            label="เครื่องมือวัด *"
            placeholder="เลือกเครื่องมือ..."
            value={assetId}
            onChange={setAssetId}
            options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
          
          <Selector
            label="ประเภทการสอบเทียบ *"
            value={calType}
            onChange={setCalType}
            options={[
              { value: "Internal", label: "สอบเทียบภายใน" },
              { value: "External Lab", label: "ส่งสอบเทียบภายนอก" },
            ]}
          />
          
          <HStack gap={4}>
            <DateInput
              label="วันที่สอบเทียบล่าสุด *"
              value={calDate}
              onChange={setCalDate}
            />
            <DateInput
              label="วันครบกำหนด *"
              value={dueDate}
              onChange={setDueDate}
            />
          </HStack>

          <TextInput label="เลขใบรับรอง"
            placeholder="เช่น CERT-2026-001"
            value={certNo}
            onChange={setCertNo}  />

          <HStack gap={3} hAlign="end">
            <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/calibration")} />
            <Button label="บันทึกข้อมูล" variant="primary" onClick={handleSubmit} isLoading={loading} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, ScaleIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function EditCalibrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [calType, setCalType] = useState("Internal");
  const [calDate, setCalDate] = useState<ISODate | undefined>(undefined);
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);
  const [certNo, setCertNo] = useState("");
  const [status, setStatus] = useState("pending");

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
    if (!calId) {
      setError("ไม่ระบุหมายเลข Calibration");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/calibration.php?id=${calId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(String(json.asset_id || ""));
          setCalType(json.calibration_type || "Internal");
          setCalDate(json.calibration_date ? (json.calibration_date.substring(0, 10) as ISODate) : undefined);
          setDueDate(json.next_calibration_date ? (json.next_calibration_date.substring(0, 10) as ISODate) : undefined);
          setCertNo(json.certificate_number || "");
          setStatus(json.status || "pending");
        } else {
          setError("ไม่พบข้อมูล Calibration");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [calId]);

  const handleSubmit = async () => {
    if (!assetId || !calDate || !dueDate) {
      setError("กรุณาเลือกเครื่องมือ, ระบุวันที่สอบเทียบ และวันครบกำหนด");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId,
        calibration_type: calType,
        calibration_date: calDate,
        next_calibration_date: dueDate,
        certificate_number: certNo,
        status: status
      };

      const res = await fetch(`/api/v1/calibration.php?id=${calId}`, {
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
        message="แผนสอบเทียบ ถูกอัปเดตเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/calibration")}
        onBackdrop={() => router.push("/calibration")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>CALIBRATION EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แก้ไขข้อมูลการสอบเทียบ</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ScaleIcon className="w-3.5 h-3.5" /> แผนสอบเทียบ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แก้ไขข้อมูลแผนสอบเทียบ — วันที่ รอบ และสถานะ
          </Text>
        </VStack>
      </div>

      <Breadcrumbs>
        <BreadcrumbItem href="/calibration" startIcon={<HomeIcon className="w-4 h-4" />}>การสอบเทียบ</BreadcrumbItem>
        <BreadcrumbItem isCurrent>แก้ไขข้อมูลสอบเทียบ</BreadcrumbItem>
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

            <Selector
              label="สถานะ"
              value={status}
              onChange={setStatus}
              options={[
                { value: "pending", label: "รอดำเนินการ" },
                { value: "scheduled", label: "รอเข้าตาราง" },
                { value: "completed", label: "เสร็จสิ้น" }
              ]}
            />

            <HStack gap={3} hAlign="end">
              <button
                type="button"
                onClick={() => router.push("/calibration")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
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

export default function EditCalibrationPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditCalibrationContent />
    </Suspense>
  );
}

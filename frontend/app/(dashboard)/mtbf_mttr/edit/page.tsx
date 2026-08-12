"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `เดือน ${i + 1} (${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][i]})`,
}));

function EditMtbfMttrContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordId = searchParams.get("id");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [operatingHours, setOperatingHours] = useState("");
  const [totalFailures, setTotalFailures] = useState("");
  const [totalDowntime, setTotalDowntime] = useState("");

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
    if (!recordId) {
      setError("ไม่ระบุหมายเลขรายการ");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/mtbf_mttr.php?id=${recordId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(String(json.asset_id || ""));
          setYear(String(json.year || new Date().getFullYear()));
          setMonth(String(json.month || new Date().getMonth() + 1));
          setOperatingHours(String(json.operating_hours ?? ""));
          setTotalFailures(String(json.total_failures ?? ""));
          setTotalDowntime(String(json.total_downtime_minutes ?? ""));
        } else {
          setError("ไม่พบข้อมูล MTBF/MTTR");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [recordId]);

  const handleSubmit = async () => {
    if (!assetId || !year || !month) {
      setError("กรุณาเลือกเครื่องจักร และระบุปี/เดือน");
      return;
    }
    const hrs = parseFloat(operatingHours) || 0;
    const fails = parseInt(totalFailures, 10) || 0;
    const downtime = parseInt(totalDowntime, 10) || 0;

    const mtbf = fails > 0 ? Math.round((hrs / fails) * 100) / 100 : null;
    const mttr = fails > 0 ? Math.round((downtime / fails) * 100) / 100 : null;

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId,
        year: year,
        month: month,
        operating_hours: hrs,
        total_failures: fails,
        total_downtime_minutes: downtime,
        mtbf_hours: mtbf,
        mttr_minutes: mttr,
      };

      const res = await fetch(`/api/v1/mtbf_mttr.php?id=${recordId}`, {
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
        message="ดัชนีชี้วัด MTBF/MTTR ถูกอัปเดตเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/mtbf_mttr")}
        onBackdrop={() => router.push("/mtbf_mttr")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/mtbf_mttr" startIcon={<HomeIcon />}>MTBF และ MTTR</BreadcrumbItem>
        <BreadcrumbItem isCurrent>แก้ไขข้อมูล</BreadcrumbItem>
      </Breadcrumbs>

      <Heading level={2}>แก้ไขข้อมูลดัชนีชี้วัด MTBF / MTTR</Heading>

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
              label="เครื่องจักร/อุปกรณ์ *"
              placeholder="เลือกเครื่องจักร..."
              value={assetId}
              onChange={setAssetId}
              options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            />

            <HStack gap={4}>
              <div style={{ flex: 1 }}>
                <TextInput
                  label="ปี *"
                  placeholder="เช่น 2026"
                  value={year}
                  onChange={setYear}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Selector
                  label="เดือน *"
                  value={month}
                  onChange={setMonth}
                  options={MONTH_OPTIONS}
                />
              </div>
            </HStack>

            <HStack gap={4}>
              <div style={{ flex: 1 }}>
                <TextInput
                  label="ชั่วโมงการทำงาน"
                  value={operatingHours}
                  onChange={setOperatingHours}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextInput
                  label="จำนวนครั้งที่เสีย"
                  value={totalFailures}
                  onChange={setTotalFailures}
                />
              </div>
            </HStack>

            <TextInput
              label="เวลาหยุดซ่อมรวม (นาที)"
              value={totalDowntime}
              onChange={setTotalDowntime}
            />

            <Text type="supporting" color="secondary">
              ระบบจะคำนวณค่า MTBF (ชม.) และ MTTR (นาที) ใหม่โดยอัตโนมัติจากข้อมูลด้านบน
            </Text>

            <HStack gap={3} hAlign="end">
              <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/mtbf_mttr")} />
              <Button label="บันทึกข้อมูล" variant="primary" onClick={handleSubmit} isLoading={submitting} />
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditMtbfMttrPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditMtbfMttrContent />
    </Suspense>
  );
}

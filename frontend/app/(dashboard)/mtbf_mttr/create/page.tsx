"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, ChartBarIcon, PlusIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `เดือน ${i + 1} (${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][i]})`,
}));

export default function MtbfMttrCreatePage() {
  const router = useRouter();

  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [operatingHours, setOperatingHours] = useState("");
  const [totalFailures, setTotalFailures] = useState("");
  const [totalDowntime, setTotalDowntime] = useState("");

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
    if (!assetId || !year || !month) {
      setError("กรุณาเลือกเครื่องจักร และระบุปี/เดือน");
      return;
    }
    const hrs = parseFloat(operatingHours) || 0;
    const fails = parseInt(totalFailures, 10) || 0;
    const downtime = parseInt(totalDowntime, 10) || 0;

    const mtbf = fails > 0 ? Math.round((hrs / fails) * 100) / 100 : null;
    const mttr = fails > 0 ? Math.round((downtime / fails) * 100) / 100 : null;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/mtbf_mttr.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          year: year,
          month: month,
          operating_hours: hrs,
          total_failures: fails,
          total_downtime_minutes: downtime,
          mtbf_hours: mtbf,
          mttr_minutes: mttr,
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล (อาจซ้ำกับรอบเดือนเดิม)");
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
        title="บันทึกข้อมูลสำเร็จ!"
        message="ดัชนีชี้วัด MTBF/MTTR ถูกบันทึกเข้าสู่ระบบเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/mtbf_mttr")}
        onBackdrop={() => router.push("/mtbf_mttr")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>MTBF MTTR CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>บันทึกข้อมูลดัชนีชี้วัด MTBF / MTTR</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ChartBarIcon className="w-3.5 h-3.5" /> Reliability KPI
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            บันทึกชั่วโมงการทำงาน จำนวนครั้งที่เสีย และเวลาหยุดซ่อม — ระบบคำนวณ MTBF/MTTR อัตโนมัติ
          </Text>
        </VStack>
      </div>

      <Breadcrumbs>
        <BreadcrumbItem href="/mtbf_mttr" startIcon={<HomeIcon className="w-4 h-4" />}>MTBF และ MTTR</BreadcrumbItem>
        <BreadcrumbItem isCurrent>บันทึกข้อมูล</BreadcrumbItem>
      </Breadcrumbs>

      <Card padding={6}>
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
                placeholder="เช่น 720"
                value={operatingHours}
                onChange={setOperatingHours}
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextInput
                label="จำนวนครั้งที่เสีย"
                placeholder="เช่น 2"
                value={totalFailures}
                onChange={setTotalFailures}
              />
            </div>
          </HStack>

          <TextInput
            label="เวลาหยุดซ่อมรวม (นาที)"
            placeholder="เช่น 180"
            value={totalDowntime}
            onChange={setTotalDowntime}
          />

          <Text type="supporting" color="secondary">
            ระบบจะคำนวณค่า MTBF (ชม.) = ชั่วโมงการทำงาน ÷ จำนวนครั้งที่เสีย และ MTTR (นาที) = เวลาหยุดซ่อม ÷ จำนวนครั้งที่เสีย โดยอัตโนมัติ
          </Text>

          <HStack gap={3} hAlign="end">
            <button
              type="button"
              onClick={() => router.push("/mtbf_mttr")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
            >
              <PlusIcon className="w-4 h-4" />
              {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

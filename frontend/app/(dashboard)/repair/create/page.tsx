"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export default function CreateWorkOrderPage() {
  const router = useRouter();
  
  const [assets, setAssets] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [woNumber, setWoNumber] = useState("");

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
      setError("กรุณาระบุหัวข้ออาการเสีย");
      return;
    }
    if (!assetId) {
      setError("กรุณาเลือกเครื่องจักรที่ชำรุด");
      return;
    }
    if (!department) {
      setError("กรุณาเลือกแผนกซ่อมที่รับผิดชอบ");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/repair.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          asset_id: assetId || null,
          priority,
          department_id: department === "mechanical" ? 1 : department === "electrical" ? 2 : null,
          estimated_completion_date: dueDate ? `${dueDate} 23:59:59` : null,
          status: "open"
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setWoNumber(json.work_order_no || `WO-${json.id}`);
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
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
        title="เปิดใบแจ้งซ่อมสำเร็จ!"
        message={<>ใบแจ้งซ่อมเลขที่ <strong>{woNumber}</strong> ถูกส่งเข้าสู่ระบบแล้ว</>}
        primaryLabel="กลับไปหน้ารวมใบแจ้งซ่อม"
        onPrimary={() => router.push("/repair")}
        onBackdrop={() => router.push("/repair")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/repair" startIcon={<HomeIcon />}>ใบแจ้งซ่อม</BreadcrumbItem>
        <BreadcrumbItem isCurrent>เปิดใบแจ้งซ่อมใหม่</BreadcrumbItem>
      </Breadcrumbs>

      <Heading level={2}>เปิดใบแจ้งซ่อม</Heading>

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <Selector
            label="เครื่องจักรที่ชำรุด *"
            placeholder="เลือกเครื่องจักร..."
            value={assetId}
            onChange={setAssetId}
            options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
          <TextInput label="หัวข้ออาการเสีย *"
            placeholder="เช่น ลูกปืนแกนหลักแตก เครื่องมีเสียงดัง"
            value={title}
            onChange={setTitle}  />
          <Selector
            label="ความสำคัญ"
            placeholder="เลือกความสำคัญ"
            value={priority}
            onChange={setPriority}
            options={[
              { value: "critical", label: "วิกฤต (ต้องซ่อมทันที)" },
              { value: "high", label: "ด่วน" },
              { value: "medium", label: "ปานกลาง" },
              { value: "low", label: "ต่ำ" },
            ]}
          />
          <Selector
            label="แผนกซ่อมที่รับผิดชอบ *"
            placeholder="เลือกแผนกซ่อม"
            value={department}
            onChange={setDepartment}
            options={[
              { value: "mechanical", label: "ช่างกล" },
              { value: "electrical", label: "ไฟฟ้า" },
              { value: "instrument", label: "ควบคุมและวัด" },
              { value: "utility", label: "สาธารณูปโภค" },
            ]}
          />
          <TextArea
            label="รายละเอียดเพิ่มเติม"
            placeholder="อธิบายลักษณะอาการเสีย หรือข้อมูลเพิ่มเติมสำหรับช่าง..."
            value={description}
            onChange={setDescription}
          />
          <DateInput
            label="วันที่ต้องการให้เสร็จ"
            value={dueDate}
            onChange={setDueDate}
          />

          <HStack gap={3} hAlign="end">
            <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/repair")} />
            <Button label="บันทึกและส่งแจ้งซ่อม" variant="primary" onClick={handleSubmit} isLoading={loading} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Button } from "@astryxdesign/core/Button";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

function EditWorkOrderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const woId = searchParams.get("id");
  
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("open");
  const [description, setDescription] = useState("");
  const [woNumber, setWoNumber] = useState("");

  useEffect(() => {
    if (!woId) {
      setError("ไม่ระบุหมายเลขใบแจ้งซ่อม");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/repair.php?id=${woId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setTitle(json.title || "");
          setPriority(json.priority || "medium");
          setStatus(json.status || "open");
          setDescription(json.description || "");
          setWoNumber(json.work_order_no || `WO-${json.id}`);
        } else {
          setError("ไม่พบข้อมูลใบแจ้งซ่อม");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [woId]);

  const handleSubmit = async () => {
    if (!title) {
      setError("กรุณาระบุหัวข้ออาการเสีย");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/v1/repair.php?id=${woId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          priority,
          status,
        }),
      });
      const json = await res.json();
      if (json.success || json.message) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
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
        title="อัปเดตใบแจ้งซ่อมสำเร็จ!"
        message={<>ใบแจ้งซ่อมเลขที่ <strong>{woNumber}</strong> ถูกอัปเดตสถานะเรียบร้อยแล้ว</>}
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
        <BreadcrumbItem isCurrent>อัปเดตใบแจ้งซ่อม</BreadcrumbItem>
      </Breadcrumbs>

      <Text type="body" size="sm" className="cmms-eyebrow">REPAIR EDIT · CMMS-TOPPAN</Text>

      <Heading level={2}>อัปเดตสถานะแจ้งซ่อม</Heading>

      <Card padding={6}>
        {loadingData ? (
          <Text type="body" color="secondary">กำลังโหลดข้อมูลใบแจ้งซ่อม...</Text>
        ) : (
          <VStack gap={5} style={{ maxWidth: 640 }}>
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
                {error}
              </div>
            )}

            <TextInput label="หัวข้ออาการเสีย *"
              value={title}
              onChange={setTitle}  />
            
            <Selector
              label="สถานะปัจจุบัน"
              placeholder="เลือกสถานะ"
              value={status}
              onChange={setStatus}
              options={[
                { value: "open", label: "เปิดงาน / รอดำเนินการ" },
                { value: "in_progress", label: "กำลังซ่อม" },
                { value: "pending", label: "รออะไหล่ / รอประเมิน" },
                { value: "completed", label: "ซ่อมเสร็จแล้ว" },
              ]}
            />

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
            
            <TextArea
              label="รายละเอียดเพิ่มเติม"
              value={description}
              onChange={setDescription}
            />

            <HStack gap={3} hAlign="end">
              <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/repair")} />
              <Button label="บันทึกข้อมูล" variant="primary" onClick={handleSubmit} isLoading={submitting} />
            </HStack>
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

export default function EditWorkOrderPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditWorkOrderContent />
    </Suspense>
  );
}

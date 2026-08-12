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

export default function PMCreatePage() {
  const router = useRouter();
  
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<ISODate | undefined>(undefined);

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

    // ผู้รับผิดชอบ = ผู้ใช้งานที่ active (ช่าง/ผู้ดูแล) — ข้อมูลจริงจาก users
    fetch("/api/v1/index.php?resource=users")
      .then(res => res.json())
      .then(json => {
        const list = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);
        setUsers(list.filter((u: any) => u.is_active !== 0 && u.is_active !== "0"));
      })
      .catch(e => console.error("Failed to load users", e));
  }, []);

  const handleSubmit = async () => {
    if (!title || !assetId) {
      setError("กรุณาระบุชื่อแผนงาน และเลือกเครื่องจักร");
      return;
    }
    if (!assignedTo) {
      setError("กรุณาเลือกผู้รับผิดชอบ (ช่างที่จะไปทำ PM หน้างาน)");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/pm_am.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          asset_id: assetId,
          assigned_to: assignedTo ? Number(assignedTo) : null,
          frequency_type: frequency,
          frequency_interval: 1,
          due_date: dueDate || null,
          status: "pending"
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกแผน PM");
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
        title="สร้างแผน PM สำเร็จ!"
        message={<>แผนซ่อมบำรุง <strong>{title}</strong> ถูกเพิ่มเข้าตารางเรียบร้อยแล้ว</>}
        primaryLabel="กลับไปหน้าตาราง PM"
        onPrimary={() => router.push("/pm_am")}
        onBackdrop={() => router.push("/pm_am")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/pm_am" startIcon={<HomeIcon />}>แผนบำรุงรักษาเชิงป้องกัน (PM)</BreadcrumbItem>
        <BreadcrumbItem isCurrent>สร้างแผน PM</BreadcrumbItem>
      </Breadcrumbs>

      <Heading level={2}>สร้างแผนบำรุงรักษาเครื่องจักร</Heading>

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <TextInput label="ชื่องาน PM *"
            placeholder="เช่น ตรวจเช็คสายพานมอเตอร์ประจำเดือน"
            value={title}
            onChange={setTitle}  />

          <Selector
            label="เครื่องจักรเป้าหมาย *"
            placeholder="เลือกเครื่องจักร..."
            value={assetId}
            onChange={setAssetId}
            options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />

          <Selector
            label="ผู้รับผิดชอบ (ช่าง) *"
            placeholder="เลือกช่างที่รับผิดชอบงาน PM นี้..."
            value={assignedTo}
            onChange={setAssignedTo}
            options={users.map(u => ({ value: String(u.id), label: `${u.full_name || u.username || `#${u.id}`}${u.employee_code ? ` (${u.employee_code})` : ""}` }))}
          />
          
          <Selector
            label="รอบความถี่ *"
            placeholder="เลือกรอบความถี่"
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: "daily", label: "รายวัน" },
              { value: "weekly", label: "รายสัปดาห์" },
              { value: "monthly", label: "รายเดือน" },
              { value: "quarterly", label: "ทุก 3 เดือน" },
              { value: "yearly", label: "รายปี" },
            ]}
          />
          
          <TextArea
            label="รายละเอียดวิธีตรวจเช็ค"
            placeholder="อธิบายขั้นตอนการตรวจเช็คที่ต้องทำ..."
            value={description}
            onChange={setDescription}
          />

          <DateInput
            label="กำหนดการทำครั้งแรก"
            value={dueDate}
            onChange={setDueDate}
          />

          <HStack gap={3} hAlign="end">
            <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/pm_am")} />
            <Button label="บันทึกแผนงาน" variant="primary" onClick={handleSubmit} isLoading={loading} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

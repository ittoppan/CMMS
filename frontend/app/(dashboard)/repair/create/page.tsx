"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";
import { enqueue, pendingCount, subscribeOnline } from "@/lib/offlineQueue";

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
  const [queuedOffline, setQueuedOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setPending(pendingCount());
    const off = subscribeOnline(() => setPending(pendingCount()));
    return off;
  }, []);

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
      const body = {
        title,
        description,
        asset_id: assetId || null,
        priority,
        department_id: department === "mechanical" ? 1 : department === "electrical" ? 2 : null,
        estimated_completion_date: dueDate ? `${dueDate} 23:59:59` : null,
        status: "open"
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue({ kind: "repair", label: `แจ้งซ่อม: ${title}`, url: "/api/v1/repair.php", method: "POST", body });
        setQueuedOffline(true);
        setPending(pendingCount());
        setLoading(false);
        return;
      }
      const res = await fetch("/api/v1/repair.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setWoNumber(json.work_order_no || `WO-${json.id}`);
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
    } catch {
      // เน็ตหลุดระหว่างส่ง → เก็บในเครื่อง รอส่งอัตโนมัติเมื่อกลับมาออนไลน์
      enqueue({
        kind: "repair",
        label: `แจ้งซ่อม: ${title}`,
        url: "/api/v1/repair.php",
        method: "POST",
        body: {
          title,
          description,
          asset_id: assetId || null,
          priority,
          department_id: department === "mechanical" ? 1 : department === "electrical" ? 2 : null,
          estimated_completion_date: dueDate ? `${dueDate} 23:59:59` : null,
          status: "open"
        },
      });
      setQueuedOffline(true);
      setPending(pendingCount());
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

  if (queuedOffline) {
    return (
      <SuccessDialog
        title="บันทึกในเครื่องแล้ว (ออฟไลน์)"
        message={<>
          ระบบยังออนไลน์ไม่ถึง จึงเก็บใบแจ้งซ่อม <strong>“{title}”</strong> ไว้ในเครื่องแล้ว
          <br />จะส่งให้อัตโนมัติทันทีที่กลับมาออนไลน์ (เหลือค้างส่ง {pending} รายการ)
        </>}
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

      <Text type="body" size="sm" className="cmms-eyebrow">REPAIR CREATE · CMMS-TOPPAN</Text>

      <Heading level={2}>เปิดใบแจ้งซ่อม</Heading>

      {pending > 0 && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderRadius: 8,
            background: "var(--cmms-warning-light, #FEF3C7)", color: "var(--cmms-warning-strong, #B45309)",
            fontSize: "0.85rem", fontWeight: 600, width: "fit-content",
          }}
        >
          <span className="cmms-status-dot warn" style={{ display: "inline-block" }} />
          มี {pending} รายการที่บันทึกไว้ในเครื่อง — จะส่งอัตโนมัติเมื่อกลับมาออนไลน์
        </div>
      )}

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              {error}
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
            <button
              type="button"
              onClick={() => router.push("/repair")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "กำลังบันทึก..." : "บันทึกและส่งแจ้งซ่อม"}
            </button>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

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

export default function BorrowingCreatePage() {
  const router = useRouter();

  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [borrowerId, setBorrowerId] = useState("");
  const [borrowDate, setBorrowDate] = useState<ISODate | undefined>(undefined);
  const [expectedReturnDate, setExpectedReturnDate] = useState<ISODate | undefined>(undefined);
  const [purpose, setPurpose] = useState("");
  const [conditionBefore, setConditionBefore] = useState("");
  const [borrowingType, setBorrowingType] = useState("single");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/v1/asset_registry.php")
      .then(res => res.json())
      .then(json => { if (Array.isArray(json)) setAssets(json); })
      .catch(e => console.error("Failed to load assets", e));

    fetch("/api/v1/users.php")
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json)) {
          setUsers(json.filter((u: any) => u.is_active !== 0 && u.is_active !== "0"));
        }
      })
      .catch(e => console.error("Failed to load users", e));
  }, []);

  const handleSubmit = async () => {
    if (!assetId || !borrowerId || !borrowDate) {
      setError("กรุณาเลือกอุปกรณ์, ผู้ยืม และระบุวันที่ยืม");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/equipment_borrowing.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          borrower_id: borrowerId,
          borrow_date: borrowDate + " 08:00:00",
          expected_return_date: expectedReturnDate || null,
          purpose: purpose,
          condition_before: conditionBefore,
          borrowing_type: borrowingType,
          notes: notes,
          status: "borrowed",
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || "เกิดข้อผิดพลาดในการบันทึกการยืม");
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
        title="บันทึกการยืมสำเร็จ!"
        message="รายการขอยืมอุปกรณ์ถูกเพิ่มเข้าสู่ระบบเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/equipment_borrowing")}
        onBackdrop={() => router.push("/equipment_borrowing")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <Breadcrumbs>
        <BreadcrumbItem href="/equipment_borrowing" startIcon={<HomeIcon />}>การยืม-คืนเครื่องมือ</BreadcrumbItem>
        <BreadcrumbItem isCurrent>ขอยืมอุปกรณ์</BreadcrumbItem>
      </Breadcrumbs>

      <Heading level={2}>แบบฟอร์มขอยืมอุปกรณ์ / เครื่องมือพิเศษ</Heading>

      <Card padding={6}>
        <VStack gap={5} style={{ maxWidth: 640 }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 8, background: 'var(--cmms-danger-light)', color: 'var(--cmms-danger)', fontSize: '0.85rem', fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <Selector
            label="อุปกรณ์ / เครื่องมือที่ต้องการยืม *"
            placeholder="เลือกอุปกรณ์..."
            value={assetId}
            onChange={setAssetId}
            options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />

          <Selector
            label="ผู้ขอยืม *"
            placeholder="เลือกผู้ยืม..."
            value={borrowerId}
            onChange={setBorrowerId}
            options={users.map(u => ({ value: String(u.id), label: `${u.full_name || u.username} (${u.position || "ช่างเทคนิค"})` }))}
          />

          <HStack gap={4}>
            <DateInput
              label="วันที่ยืม *"
              value={borrowDate}
              onChange={setBorrowDate}
            />
            <DateInput
              label="กำหนดคืน"
              value={expectedReturnDate}
              onChange={setExpectedReturnDate}
            />
          </HStack>

          <Selector
            label="ประเภทการยืม"
            value={borrowingType}
            onChange={setBorrowingType}
            options={[
              { value: "single", label: "รายบุคคล" },
              { value: "group", label: "กลุ่ม / ชุดช่าง" },
            ]}
          />

          <TextArea
            label="วัตถุประสงค์การยืม"
            placeholder="ระบุงานที่นำไปใช้ เช่น งานซ่อมปั๊มน้ำไลน์ 3..."
            value={purpose}
            onChange={setPurpose}
          />

          <TextArea
            label="สภาพอุปกรณ์ก่อนยืม"
            placeholder="ระบุสภาพก่อนยืม เช่น สมบูรณ์ปกติ ไม่มีรอย..."
            value={conditionBefore}
            onChange={setConditionBefore}
          />

          <TextInput
            label="หมายเหตุ"
            placeholder="ระบุเพิ่มเติม (ถ้ามี)..."
            value={notes}
            onChange={setNotes}
          />

          <HStack gap={3} hAlign="end">
            <Button label="ยกเลิก" variant="secondary" onClick={() => router.push("/equipment_borrowing")} />
            <Button label="ยืนยันยืมอุปกรณ์" variant="primary" onClick={handleSubmit} isLoading={loading} />
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}

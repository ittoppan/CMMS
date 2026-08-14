"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { HomeIcon, WrenchIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import SuccessDialog from "@/components/SuccessDialog";

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

function EditBorrowingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recordId = searchParams.get("id");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [assetId, setAssetId] = useState("");
  const [borrowerId, setBorrowerId] = useState("");
  const [borrowDate, setBorrowDate] = useState<ISODate | undefined>(undefined);
  const [expectedReturnDate, setExpectedReturnDate] = useState<ISODate | undefined>(undefined);
  const [actualReturnDate, setActualReturnDate] = useState<ISODate | undefined>(undefined);
  const [purpose, setPurpose] = useState("");
  const [conditionBefore, setConditionBefore] = useState("");
  const [conditionAfter, setConditionAfter] = useState("");
  const [borrowingType, setBorrowingType] = useState("single");
  const [status, setStatus] = useState("borrowed");
  const [notes, setNotes] = useState("");

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

  useEffect(() => {
    if (!recordId) {
      setError("ไม่ระบุหมายเลขรายการยืม");
      setLoadingData(false);
      return;
    }
    fetch(`/api/v1/equipment_borrowing.php?id=${recordId}`)
      .then(res => res.json())
      .then(json => {
        if (json && !json.error) {
          setAssetId(String(json.asset_id || ""));
          setBorrowerId(String(json.borrower_id || ""));
          setBorrowDate(json.borrow_date ? (json.borrow_date.substring(0, 10) as ISODate) : undefined);
          setExpectedReturnDate(json.expected_return_date ? (json.expected_return_date.substring(0, 10) as ISODate) : undefined);
          setActualReturnDate(json.actual_return_date ? (json.actual_return_date.substring(0, 10) as ISODate) : undefined);
          setPurpose(json.purpose || "");
          setConditionBefore(json.condition_before || "");
          setConditionAfter(json.condition_after || "");
          setBorrowingType(json.borrowing_type || "single");
          setStatus(json.status || "borrowed");
          setNotes(json.notes || "");
        } else {
          setError("ไม่พบข้อมูลรายการยืม");
        }
      })
      .catch(e => setError("เกิดข้อผิดพลาดในการโหลดข้อมูล"))
      .finally(() => setLoadingData(false));
  }, [recordId]);

  const handleSubmit = async () => {
    if (!assetId || !borrowerId || !borrowDate) {
      setError("กรุณาเลือกอุปกรณ์, ผู้ยืม และระบุวันที่ยืม");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_id: assetId,
        borrower_id: borrowerId,
        borrow_date: borrowDate + " 08:00:00",
        expected_return_date: expectedReturnDate || null,
        actual_return_date: actualReturnDate ? actualReturnDate + " 17:00:00" : null,
        purpose: purpose,
        condition_before: conditionBefore,
        condition_after: conditionAfter,
        borrowing_type: borrowingType,
        status: status,
        notes: notes,
      };

      const res = await fetch(`/api/v1/equipment_borrowing.php?id=${recordId}`, {
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
        message="รายการยืม-คืนอุปกรณ์ ถูกอัปเดตเรียบร้อยแล้ว"
        primaryLabel="กลับไปหน้ารายการ"
        onPrimary={() => router.push("/equipment_borrowing")}
        onBackdrop={() => router.push("/equipment_borrowing")}
      />
    );
  }

  return (
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>EQUIPMENT BORROWING EDIT · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>แก้ไขรายการยืม-คืนอุปกรณ์</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <WrenchIcon className="w-3.5 h-3.5" /> รายการยืม
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            แก้ไขรายละเอียดการยืม-คืน — วันที่ สภาพอุปกรณ์ และสถานะ
          </Text>
        </VStack>
      </div>

      <Breadcrumbs>
        <BreadcrumbItem href="/equipment_borrowing" startIcon={<HomeIcon className="w-4 h-4" />}>การยืม-คืนเครื่องมือ</BreadcrumbItem>
        <BreadcrumbItem isCurrent>แก้ไขรายการยืม</BreadcrumbItem>
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
              label="อุปกรณ์ / เครื่องมือที่ยืม *"
              placeholder="เลือกอุปกรณ์..."
              value={assetId}
              onChange={setAssetId}
              options={assets.map(a => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            />

            <Selector
              label="ผู้ยืม *"
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

            <HStack gap={4}>
              <div style={{ flex: 1 }}>
                <Selector
                  label="สถานะ"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "borrowed", label: "กำลังยืมใช้งาน" },
                    { value: "overdue", label: "เกินกำหนดคืน" },
                    { value: "returned", label: "คืนแล้ว" },
                    { value: "lost", label: "สูญหาย" },
                  ]}
                />
              </div>
              <div style={{ flex: 1 }}>
                <DateInput
                  label="วันที่คืนจริง"
                  value={actualReturnDate}
                  onChange={setActualReturnDate}
                />
              </div>
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
              value={purpose}
              onChange={setPurpose}
            />

            <TextArea
              label="สภาพอุปกรณ์ก่อนยืม"
              value={conditionBefore}
              onChange={setConditionBefore}
            />

            <TextArea
              label="สภาพอุปกรณ์เมื่อรับคืน"
              value={conditionAfter}
              onChange={setConditionAfter}
            />

            <TextInput
              label="หมายเหตุ"
              value={notes}
              onChange={setNotes}
            />

            <HStack gap={3} hAlign="end">
              <button
                type="button"
                onClick={() => router.push("/equipment_borrowing")}
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

export default function EditBorrowingPage() {
  return (
    <Suspense fallback={<Text type="body">กำลังโหลด...</Text>}>
      <EditBorrowingContent />
    </Suspense>
  );
}

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <PageShell
      eyebrow={<p className="cmms-eyebrow">EQUIPMENT BORROWING · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ยืม-คืนอุปกรณ์", href: "/equipment_borrowing" },
        { label: "แก้ไขรายการยืม" },
      ]}
      title="แก้ไขรายการยืม-คืนอุปกรณ์"
      description="แก้ไขรายละเอียดการยืม-คืน — วันที่ สภาพอุปกรณ์ และสถานะ"
    >
      <Card className="mx-auto w-full max-w-[640px]">
        <CardContent className="space-y-5">
          {loadingData ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {error && <Alert variant="danger">{error}</Alert>}

              <div className="space-y-1.5">
                <Label htmlFor="brw-edit-asset">อุปกรณ์ / เครื่องมือที่ยืม *</Label>
                <Select value={assetId || undefined} onValueChange={(v) => setAssetId(v)}>
                  <SelectTrigger id="brw-edit-asset">
                    <SelectValue placeholder="เลือกอุปกรณ์..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.code} - {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brw-edit-borrower">ผู้ยืม *</Label>
                <Select value={borrowerId || undefined} onValueChange={(v) => setBorrowerId(v)}>
                  <SelectTrigger id="brw-edit-borrower">
                    <SelectValue placeholder="เลือกผู้ยืม..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.full_name || u.username} ({u.position || "ช่างเทคนิค"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="brw-edit-borrow-date">วันที่ยืม *</Label>
                  <Input
                    id="brw-edit-borrow-date"
                    type="date"
                    value={borrowDate ?? ""}
                    onChange={(e) =>
                      setBorrowDate(e.target.value ? (e.target.value as ISODate) : undefined)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brw-edit-expected-return">กำหนดคืน</Label>
                  <Input
                    id="brw-edit-expected-return"
                    type="date"
                    value={expectedReturnDate ?? ""}
                    onChange={(e) =>
                      setExpectedReturnDate(
                        e.target.value ? (e.target.value as ISODate) : undefined
                      )
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="brw-edit-status">สถานะ</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v)}>
                    <SelectTrigger id="brw-edit-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrowed">กำลังยืมใช้งาน</SelectItem>
                      <SelectItem value="overdue">เกินกำหนดคืน</SelectItem>
                      <SelectItem value="returned">คืนแล้ว</SelectItem>
                      <SelectItem value="lost">สูญหาย</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="brw-edit-actual-return">วันที่คืนจริง</Label>
                  <Input
                    id="brw-edit-actual-return"
                    type="date"
                    value={actualReturnDate ?? ""}
                    onChange={(e) =>
                      setActualReturnDate(
                        e.target.value ? (e.target.value as ISODate) : undefined
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brw-edit-type">ประเภทการยืม</Label>
                <Select value={borrowingType} onValueChange={(v) => setBorrowingType(v)}>
                  <SelectTrigger id="brw-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">รายบุคคล</SelectItem>
                    <SelectItem value="group">กลุ่ม / ชุดช่าง</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brw-edit-purpose">วัตถุประสงค์การยืม</Label>
                <Textarea
                  id="brw-edit-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brw-edit-condition-before">สภาพอุปกรณ์ก่อนยืม</Label>
                <Textarea
                  id="brw-edit-condition-before"
                  value={conditionBefore}
                  onChange={(e) => setConditionBefore(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="brw-edit-condition-after">สภาพอุปกรณ์เมื่อรับคืน</Label>
                <Textarea
                  id="brw-edit-condition-after"
                  value={conditionAfter}
                  onChange={(e) => setConditionAfter(e.target.value)}
                />
              </div>

              <Input
                id="brw-edit-notes"
                label="หมายเหตุ"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
        </CardContent>

        {!loadingData && (
          <CardFooter className="justify-end gap-2">
            <Button variant="secondary" onClick={() => router.push("/equipment_borrowing")}>
              ยกเลิก
            </Button>
            <Button variant="primary" disabled={submitting} onClick={handleSubmit}>
              <SquarePen className="w-4 h-4" />
              {submitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </Button>
          </CardFooter>
        )}
      </Card>
    </PageShell>
  );
}

export default function EditBorrowingPage() {
  return (
    <Suspense fallback={<p className="text-sm">กำลังโหลด...</p>}>
      <EditBorrowingContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ยืม-คืนอุปกรณ์", href: "/equipment_borrowing" },
        { label: "ขอยืมอุปกรณ์" },
      ]}
      title="แบบฟอร์มขอยืมอุปกรณ์ / เครื่องมือพิเศษ"
      description="กรอกรายละเอียดการยืม — อุปกรณ์ ผู้ยืม วันที่ และวัตถุประสงค์"
    >
      <Card className="mx-auto w-full max-w-[640px]">
        <CardContent className="space-y-5">
          {error && <Alert variant="danger">{error}</Alert>}

          <div className="space-y-1.5">
            <Label htmlFor="brw-create-asset">อุปกรณ์ / เครื่องมือที่ต้องการยืม *</Label>
            <Select value={assetId || undefined} onValueChange={(v) => setAssetId(v)}>
              <SelectTrigger id="brw-create-asset">
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
            <Label htmlFor="brw-create-borrower">ผู้ขอยืม *</Label>
            <Select value={borrowerId || undefined} onValueChange={(v) => setBorrowerId(v)}>
              <SelectTrigger id="brw-create-borrower">
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
              <Label htmlFor="brw-create-borrow-date">วันที่ยืม *</Label>
              <Input
                id="brw-create-borrow-date"
                type="date"
                value={borrowDate ?? ""}
                onChange={(e) =>
                  setBorrowDate(e.target.value ? (e.target.value as ISODate) : undefined)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brw-create-return-date">กำหนดคืน</Label>
              <Input
                id="brw-create-return-date"
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

          <div className="space-y-1.5">
            <Label htmlFor="brw-create-type">ประเภทการยืม</Label>
            <Select value={borrowingType} onValueChange={(v) => setBorrowingType(v)}>
              <SelectTrigger id="brw-create-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">รายบุคคล</SelectItem>
                <SelectItem value="group">กลุ่ม / ชุดช่าง</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brw-create-purpose">วัตถุประสงค์การยืม</Label>
            <Textarea
              id="brw-create-purpose"
              placeholder="ระบุงานที่นำไปใช้ เช่น งานซ่อมปั๊มน้ำไลน์ 3..."
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brw-create-condition-before">สภาพอุปกรณ์ก่อนยืม</Label>
            <Textarea
              id="brw-create-condition-before"
              placeholder="ระบุสภาพก่อนยืม เช่น สมบูรณ์ปกติ ไม่มีรอย..."
              value={conditionBefore}
              onChange={(e) => setConditionBefore(e.target.value)}
            />
          </div>

          <Input
            id="brw-create-notes"
            label="หมายเหตุ"
            placeholder="ระบุเพิ่มเติม (ถ้ามี)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push("/equipment_borrowing")}>
            ยกเลิก
          </Button>
          <Button variant="primary" disabled={loading} onClick={handleSubmit}>
            <Undo2 className="w-4 h-4" />
            {loading ? "กำลังบันทึก..." : "ยืนยันยืมอุปกรณ์"}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}

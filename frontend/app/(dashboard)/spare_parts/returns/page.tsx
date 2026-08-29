"use client";

import { useState, useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import CountUp from "react-countup";
import { Undo2, Clock3, History, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

interface ReturnItem {
  item_id: number;
  request_id: number | null;
  part_code: string;
  part_name: string;
  unit: string;
  qty_issued: number;
  qty_returned: number;
  remaining: number;
  return_reason: string | null;
  returned_at: string | null;
  returned_by_name: string | null;
  work_order_no: string | null;
  wo_title: string | null;
  request_status: string | null;
}

export default function SpareReturnsPage() {
  const [tab, setTab] = useState<"pending" | "returned">("pending");
  const [pending, setPending] = useState<ReturnItem[]>([]);
  const [returned, setReturned] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async (scope: "pending" | "returned") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        scope === "pending"
          ? "/api/v1/spare_issue.php?pending=1"
          : "/api/v1/spare_issue.php?returned=1"
      );
      const json = await res.json();
      if (Array.isArray(json)) {
        if (scope === "pending") setPending(json);
        else setReturned(json);
      } else {
        setError(json.error || "โหลดข้อมูลไม่สำเร็จ");
      }
    } catch {
      setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load("pending");
  }, []);

  const switchTab = (t: "pending" | "returned") => {
    setTab(t);
    if ((t === "pending" && pending.length === 0) || (t === "returned" && returned.length === 0)) {
      load(t);
    }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SPARE PART RETURNS</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คลังอะไหล่", href: "/spare_parts" },
        { label: "รับคืนซากอะไหล่" },
      ]}
      title="สต็อกอะไหล่คืนซาก"
      description="บันทึกการคืนซากอะไหล่ที่เบิกใช้แล้ว (ทิ้งซาก ไม่เข้าคลังใหม่) ตามใบแจ้งซ่อม"
    >
      <Grid columns={{ minWidth: 200, max: 3 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <Undo2 className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">รายการรอคืนซาก</p>
              <div className="cmms-kpi-value">
                <CountUp end={pending.length} />
                <span className="cmms-kpi-unit">รายการ</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <History className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">คืนซากแล้ว</p>
              <div className="cmms-kpi-value">
                <CountUp end={returned.length} />
                <span className="cmms-kpi-unit">รายการ</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <Clock3 className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">จำนวนที่คืนแล้ว</p>
              <div className="cmms-kpi-value">
                <CountUp end={returned.reduce((s, r) => s + r.qty_returned, 0)} decimals={1} />
                <span className="cmms-kpi-unit">หน่วย</span>
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      <Tabs value={tab} onValueChange={(v) => switchTab(v as "pending" | "returned")}>
        <TabsList>
          <TabsTrigger value="pending">เตรียมคืนซาก ({pending.length})</TabsTrigger>
          <TabsTrigger value="returned">ประวัติคืนซาก ({returned.length})</TabsTrigger>
        </TabsList>

        {error && <Alert variant="danger" className="mt-4">{error}</Alert>}

        <TabsContent value="pending">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : pending.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              ไม่มีอะไหล่ที่เบิกแล้วรอคืนซาก
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map((it) => (
                <ReturnEntryCard
                  key={it.item_id}
                  item={it}
                  onSaved={() => load("pending")}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="returned">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : returned.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              ยังไม่มีประวัติคืนซาก
            </Card>
          ) : (
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 pr-2 font-semibold">รหัส / ชื่ออะไหล่</th>
                      <th className="py-2 pr-2 font-semibold">ใบแจ้งซ่อม</th>
                      <th className="py-2 pr-2 text-right font-semibold">เบิก</th>
                      <th className="py-2 pr-2 text-right font-semibold">คืนซาก</th>
                      <th className="py-2 pr-2 font-semibold">เหตุผล</th>
                      <th className="py-2 pr-2 font-semibold">ผู้บันทึก</th>
                      <th className="py-2 font-semibold">วันที่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returned.map((it) => (
                      <tr key={it.item_id} className="border-b border-border/60">
                        <td className="py-2 pr-2">
                          <p className="font-mono text-xs font-medium">{it.part_code}</p>
                          <p className="font-semibold">{it.part_name}</p>
                        </td>
                        <td className="py-2 pr-2">
                          <p className="font-mono text-xs">{it.work_order_no || "-"}</p>
                          <p className="text-xs text-muted-foreground">{it.wo_title || ""}</p>
                        </td>
                        <td className="py-2 pr-2 text-right">{it.qty_issued.toLocaleString("th-TH")}</td>
                        <td className="py-2 pr-2 text-right font-semibold text-[var(--cmms-danger-dark)]">
                          {it.qty_returned.toLocaleString("th-TH")}
                        </td>
                        <td className="py-2 pr-2 text-xs">{it.return_reason || "-"}</td>
                        <td className="py-2 pr-2">{it.returned_by_name || "-"}</td>
                        <td className="py-2">{it.returned_at || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function ReturnEntryCard({
  item,
  onSaved,
}: {
  item: ReturnItem;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeErr, setNoticeErr] = useState("");

  const submit = async () => {
    if (!reason.trim()) {
      setNoticeErr("กรุณาระบุเหตุผลการคืนซาก");
      return;
    }
    const q = Number(qty);
    if (!q || q <= 0) {
      setNoticeErr("กรุณาระบุจำนวนที่มากกว่า 0");
      return;
    }
    setBusy(true);
    setNotice("");
    setNoticeErr("");
    try {
      const res = await fetch("/api/v1/spare_issue.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return", id: item.item_id, qty: q, reason: reason.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setNotice(json.message);
        onSaved();
      } else {
        setNoticeErr(json.error || `ผิดพลาด (HTTP ${res.status})`);
      }
    } catch {
      setNoticeErr("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            <span className="font-mono text-xs">{item.part_code}</span> — {item.part_name}
          </p>
          <p className="text-xs text-muted-foreground">
            ใบแจ้งซ่อม: {item.work_order_no || "-"} · เบิก {item.qty_issued.toLocaleString("th-TH")}{" "}
            {item.unit || ""} · คืนแล้ว {item.qty_returned.toLocaleString("th-TH")} · เหลือคืน{" "}
            <span className="font-semibold text-[var(--cmms-danger-dark)]">
              {item.remaining.toLocaleString("th-TH")}
            </span>{" "}
            {item.unit || ""}
          </p>
        </div>
        {item.request_status && (
          <span className="text-xs text-muted-foreground">สถานะใบเบิก: {item.request_status}</span>
        )}
      </div>

      {(notice || noticeErr) && (
        <div className="pt-3">
          {notice && <Alert variant="success">{notice}</Alert>}
          {noticeErr && <Alert variant="danger">{noticeErr}</Alert>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="w-full max-w-[160px] space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">จำนวนคืนซาก</p>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder={String(item.remaining)}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="w-full max-w-[280px] space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">เหตุผลคืนซาก</p>
          <Input
            placeholder="เช่น สึกเดียวไม่สามารถซ่อมได้ / ของเสียตามการตรวจสอบ"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button variant="primary" size="sm" disabled={busy} onClick={submit}>
          <Save className="h-4 w-4" />
          บันทึกคืนซาก
        </Button>
      </div>
    </Card>
  );
}
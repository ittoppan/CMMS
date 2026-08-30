"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import {
  Search,
  RefreshCw,
  Truck,
  CheckCircle2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface SageShipmentItem {
  id: number;
  request_id: number;
  spare_part_id: number;
  part_code: string;
  part_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  stock_qty_at_request: number;
  sage_qty: number | null;
  sage_shipment_no: string | null;
  sage_line_no: number | null;
  sage_item_status: string;
  sage_shipment_date: string | null;
  sage_note: string | null;
  sage_shipment_by: number | null;
  sage_by_name: string | null;
  remaining: number;
  is_fully_shipped: boolean;
}

interface SageRequest {
  id: number;
  work_order_id: number | null;
  work_order_no: string | null;
  technician_name: string | null;
  request_type: string;
  status: string;
  sage_shipment_status: string;
  sage_shipment_no: string | null;
  sage_shipment_date: string | null;
  sage_shipment_by: number | null;
  sage_shipment_by_name: string | null;
  sage_shipment_note: string | null;
  sage_updated_at: string | null;
  created_at: string;
  created_by_name: string | null;
  approved_by_name: string | null;
  total_qty: number;
  total_sage_qty: number;
  items?: SageShipmentItem[];
}

const STATUS_LABELS: Record<string, { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" | "primary" }> = {
  pending: { label: "รอตัด Sage", variant: "warning" },
  partial: { label: "ตัดบางส่วน", variant: "info" },
  completed: { label: "ตัดครบแล้ว", variant: "success" },
  cancelled: { label: "ยกเลิก", variant: "danger" },
};

function getStatusBadge(status: string) {
  const cfg = STATUS_LABELS[status] ?? { label: status, variant: "neutral" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function fmt(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("th-TH");
}

export default function SageShipmentsPage() {
  const hero = usePageHero("spare_parts/sage_shipments");
  const { showToast } = useToast();

  const [requests, setRequests] = useState<SageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "partial" | "completed" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/sage_shipments.php?items=1", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setRequests(Array.isArray(json) ? json : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูลได้";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const matchStatus = filterStatus === "all" || r.sage_shipment_status === filterStatus;
      const matchSearch =
        !q ||
        (r.work_order_no?.toLowerCase().includes(q) ?? false) ||
        (r.technician_name?.toLowerCase().includes(q) ?? false) ||
        (r.sage_shipment_no?.toLowerCase().includes(q) ?? false) ||
        String(r.id).includes(q);
      const matchPending = !showOnlyPending || r.sage_shipment_status !== "completed";
      return matchStatus && matchSearch && matchPending;
    });
  }, [requests, filterStatus, search, showOnlyPending]);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const getCsrfToken = (): string | null => {
    if (typeof document === "undefined") return null;
    const m = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null;
    if (m?.content) return m.content;
    const v = (document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] ?? null);
    return v ? decodeURIComponent(v) : null;
  };

  const handleUpdateSageStatus = async (request: SageRequest, newStatus: string) => {
    const key = String(request.id);
    const shipmentNo = window.prompt("เลขที่ Shipment ใน Sage 300 (ถ้ามี):", request.sage_shipment_no || "");
    if (shipmentNo === null) return;
    setUpdating((prev) => ({ ...prev, [key]: true }));
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/v1/sage_shipments.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({
          action: "update_sage_status",
          request_id: request.id,
          sage_shipment_status: newStatus,
          sage_shipment_no: shipmentNo,
          sage_shipment_note: `เปลี่ยนสถานะเป็น ${STATUS_LABELS[newStatus]?.label || newStatus}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      showToast("success", json.message || "อัปเดตสถานะ Sage 300 เรียบร้อยแล้ว");
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "อัปเดตสถานะไม่สำเร็จ";
      showToast("error", msg);
    } finally {
      setUpdating((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleUpdateItemSage = async (item: SageShipmentItem) => {
    const key = `item-${item.id}`;
    const maxRemaining = Math.max(0, Number(item.qty) - Number(item.sage_qty ?? 0));
    const defaultQty = maxRemaining > 0 ? String(maxRemaining) : String(item.qty);
    const rawQty = window.prompt(`จำนวนที่ตัดใน Sage 300 (คงเหลือ ${fmt(maxRemaining)} ${item.unit}):`, String(item.sage_qty ?? defaultQty));
    if (rawQty === null) return;
    const qty = parseFloat(rawQty);
    if (isNaN(qty) || qty < 0) {
      showToast("error", "จำนวนไม่ถูกต้อง");
      return;
    }
    if (qty > Number(item.qty)) {
      showToast("error", `จำนวนเกินที่เบิก (${fmt(item.qty)} ${item.unit})`);
      return;
    }
    const shipmentNo = window.prompt("เลขที่ Shipment ใน Sage 300:", item.sage_shipment_no || "");
    if (shipmentNo === null) return;

    setUpdating((prev) => ({ ...prev, [key]: true }));
    try {
      const csrf = getCsrfToken();
      const status = qty >= Number(item.qty) ? "completed" : qty > 0 ? "partial" : "pending";
      const res = await fetch("/api/v1/sage_shipments.php", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        },
        body: JSON.stringify({
          action: "update_item_sage_status",
          item_id: item.id,
          sage_qty: qty,
          sage_shipment_no: shipmentNo || "",
          status,
          sage_shipment_date: new Date().toISOString().slice(0, 19).replace("T", " "),
          sage_note: `ตัดใน Sage 300 จำนวน ${qty} ${item.unit}`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      showToast("success", json.message || "อัปเดตรายการ Sage 300 เรียบร้อยแล้ว");
      fetchData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ";
      showToast("error", msg);
    } finally {
      setUpdating((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SAGE 300 I/C SHIPMENTS · CMMS-TOPPAN</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คลังอะไหล่", href: "/spare_parts" },
        { label: "Sage 300 I/C Shipments" },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw size={14} strokeWidth={1.75} className={loading ? "animate-spin" : ""} /> รีเฟรช
        </Button>
      }
    >
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-[280px] flex-1">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหา WO, ช่าง, เลขที่ Sage Shipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="สถานะ Sage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              <SelectItem value="pending">รอตัด Sage</SelectItem>
              <SelectItem value="partial">ตัดบางส่วน</SelectItem>
              <SelectItem value="completed">ตัดครบแล้ว</SelectItem>
              <SelectItem value="cancelled">ยกเลิก</SelectItem>
            </SelectContent>
          </Select>

          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOnlyPending}
              onChange={(e) => setShowOnlyPending(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] text-[var(--cmms-primary)] focus-visible:ring-2 focus-visible:ring-[var(--cmms-primary)]"
            />
            แสดงเฉพาะที่ยังไม่ตัดครบ
          </label>
        </div>
      </Card>

      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {loading ? (
        <div className="flex justify-center p-12">
          <Spinner size={22} label="กำลังโหลดข้อมูล..." />
        </div>
      ) : filteredRequests.length === 0 ? (
        <Card className="p-10 text-center">
          <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground" strokeWidth={1.75} />
          <p className="text-sm text-muted-foreground mt-2">ไม่พบรายการที่ต้องตัดใน Sage 300</p>
          <p className="text-xs text-muted-foreground mt-1">จะแสดงเฉพาะใบเบิกที่ได้รับอนุมัติแล้ว</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-3 px-4 font-semibold w-10"></th>
                  <th className="py-3 px-4 font-semibold">WO / ใบเบิก</th>
                  <th className="py-3 px-4 font-semibold">ช่าง / วันที่</th>
                  <th className="py-3 px-4 font-semibold text-center">สถานะ Sage</th>
                  <th className="py-3 px-4 font-semibold text-center">Progress</th>
                  <th className="py-3 px-4 font-semibold">Sage Shipment No.</th>
                  <th className="py-3 px-4 font-semibold">ตัดโดย / วันที่</th>
                  <th className="py-3 px-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => (
                  <React.Fragment key={req.id}>
                    <tr className={`border-b border-border/60 transition-colors hover:bg-accent/30 ${expandedId === req.id ? "bg-accent/50" : ""}`}>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleExpand(req.id)}
                          aria-label={expandedId === req.id ? "ยุบ" : "ขยาย"}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
                        >
                          {req.items && req.items.length > 0 ? (
                            expandedId === req.id ? (
                              <ChevronUp size={16} className="text-muted-foreground" />
                            ) : (
                              <ChevronDown size={16} className="text-muted-foreground" />
                            )
                          ) : (
                            <span className="w-5 h-5" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{req.work_order_no || "-"}</p>
                          <p className="text-xs text-muted-foreground">ใบเบิก: SIR-{String(req.id).padStart(6, "0")}</p>
                          <p className="text-xs text-muted-foreground capitalize">{req.status}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{req.technician_name || "-"}</p>
                          <p className="text-xs text-muted-foreground">
                            {req.created_at ? new Date(req.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-"}
                          </p>
                          {req.created_by_name && <p className="text-xs text-muted-foreground">โดย {req.created_by_name}</p>}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">{getStatusBadge(req.sage_shipment_status || "pending")}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-24 h-2 bg-[var(--cmms-border)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--cmms-primary)] transition-all duration-300"
                              style={{ width: `${req.total_qty > 0 ? Math.min(100, (Number(req.total_sage_qty) / Number(req.total_qty)) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                            {fmt(req.total_sage_qty)} / {fmt(req.total_qty)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-sm">{req.sage_shipment_no || "—"}</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">{req.sage_shipment_by_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {req.sage_shipment_date ? new Date(req.sage_shipment_date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {req.sage_shipment_status !== "completed" ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!!updating[String(req.id)]}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateSageStatus(req, "partial");
                                }}
                              >
                                <Truck size={12} strokeWidth={2} /> ตัดบางส่วน
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={!!updating[String(req.id)]}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateSageStatus(req, "completed");
                                }}
                              >
                                <CheckCircle2 size={12} strokeWidth={2} /> ตัดครบ
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">เสร็จสิ้น</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === req.id && req.items && req.items.length > 0 && (
                      <tr className="bg-accent/20">
                        <td colSpan={8} className="p-0">
                          <div className="p-4 border-t border-border">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                                    <th className="py-2 px-3 font-semibold">รหัส / รายการ</th>
                                    <th className="py-2 px-3 font-semibold text-right">เบิก</th>
                                    <th className="py-2 px-3 font-semibold text-right">ตัดใน Sage</th>
                                    <th className="py-2 px-3 font-semibold text-center">สถานะรายการ</th>
                                    <th className="py-2 px-3 font-semibold">Sage Shipment No.</th>
                                    <th className="py-2 px-3 font-semibold text-center">บรรทัด Sage</th>
                                    <th className="py-2 px-3 font-semibold">ตัดโดย / วันที่</th>
                                    <th className="py-2 px-3 font-semibold text-center">Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {req.items.map((item) => (
                                    <tr key={item.id} className="border-b border-border/60">
                                      <td className="py-2 px-3">
                                        <p className="font-mono text-xs font-medium">{item.part_code}</p>
                                        <p className="font-medium">{item.part_name}</p>
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        {fmt(item.qty)} {item.unit}
                                      </td>
                                      <td className="py-2 px-3 text-right">
                                        <span className={item.is_fully_shipped ? "font-bold text-[var(--cmms-success)]" : "font-semibold"}>
                                          {fmt(item.sage_qty ?? 0)} {item.unit}
                                        </span>
                                        {item.remaining > 0 && (
                                          <span className="text-xs text-muted-foreground"> (ค้าง {fmt(item.remaining)})</span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 text-center">{getStatusBadge(item.sage_item_status || "pending")}</td>
                                      <td className="py-2 px-3">
                                        <span className="font-mono text-sm">{item.sage_shipment_no || "—"}</span>
                                      </td>
                                      <td className="py-2 px-3 text-center">{item.sage_line_no ? String(item.sage_line_no) : "—"}</td>
                                      <td className="py-2 px-3">
                                        <div className="space-y-1">
                                          <p className="text-xs text-muted-foreground">{item.sage_by_name || "—"}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {item.sage_shipment_date ? new Date(item.sage_shipment_date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                                          </p>
                                        </div>
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {item.sage_item_status !== "completed" ? (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!!updating[`item-${item.id}`]}
                                            onClick={() => handleUpdateItemSage(item)}
                                          >
                                            <Truck size={12} strokeWidth={2} /> ตัด
                                          </Button>
                                        ) : (
                                          <span className="text-xs text-[var(--cmms-success)]">✓ ตัดครบแล้ว</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  RefreshCw,
  FileCheck2,
} from "lucide-react";

interface POItem {
  id: string;
  partId: number;
  itemCode: string;
  description: string;
  unit: string;
  unitPrice: number;
  receivedQty: number;
  currentStock: number;
}

export default function SagePOReceiptPage() {
  const hero = usePageHero("spare_parts/sage_po");
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const [poNumber, setPoNumber] = useState("");
  const [items, setItems] = useState<POItem[]>([]);
  const [partSearch, setPartSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState("");

  const fetchParts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/spare_parts.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        setParts(json);
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลอะไหล่ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchParts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const partOptions = useMemo(() => {
    const q = partSearch.toLowerCase();
    return parts
      .filter((p) => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .map((p) => ({
        value: String(p.id),
        label: `${p.code}: ${p.name} (สต็อก ${p.stock_qty} ${p.unit})`,
        raw: p,
      }));
  }, [parts, partSearch]);

  const handleAddPart = () => {
    if (!selectedPart) return;
    const part = parts.find((p) => String(p.id) === selectedPart);
    if (!part) return;
    const existing = items.find((i) => i.partId === part.id);
    if (existing) {
      setItems(items.map((i) => (i.partId === part.id ? { ...i, receivedQty: i.receivedQty + 1 } : i)));
    } else {
      setItems([
        ...items,
        {
          id: `po-${Date.now()}`,
          partId: part.id,
          itemCode: part.code,
          description: part.name,
          unit: part.unit || "ชิ้น",
          unitPrice: parseFloat(part.unit_price) || 0,
          receivedQty: 1,
          currentStock: parseFloat(part.stock_qty) || 0,
        },
      ]);
    }
    setSelectedPart("");
  };

  const handleQtyChange = (id: string, qty: number) => {
    setItems(items.map((i) => (i.id === id ? { ...i, receivedQty: Math.max(1, qty) } : i)));
  };

  const handleRemove = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const totalValue = items.reduce((s, i) => s + i.receivedQty * i.unitPrice, 0);

  const handleSubmitReceipt = async () => {
    if (!poNumber.trim() || items.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      let updated = 0;
      for (const item of items) {
        const newQty = item.currentStock + item.receivedQty;
        const res = await fetch(`/api/v1/spare_parts.php?id=${item.partId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock_qty: newQty }),
        });
        const json = await res.json();
        if (json.success) updated += 1;
      }
      if (updated > 0) {
        showToast("success", `รับเข้าคลัง ${updated} รายการ ตาม PO ${poNumber} เรียบร้อยแล้ว`);
        setPoNumber("");
        setItems([]);
        fetchParts();
      } else {
        setError("ไม่สามารถบันทึกการรับเข้าได้");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการรับเข้าคลัง กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  const columns: ColumnDef<UiTableFeatures, POItem>[] = [
    {
      id: "itemCode",
      header: "รหัสอะไหล่ / รายละเอียด",
      cell: ({ row }: { row: { original: POItem } }) => (
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">{row.original.itemCode}</div>
          <div className="text-sm text-[var(--cmms-text-secondary)]">{row.original.description}</div>
        </div>
      ),
    },
    {
      id: "currentStock",
      header: "สต็อกเดิม",
      cell: ({ row }: { row: { original: POItem } }) => (
        <span className="text-sm">{row.original.currentStock} {row.original.unit}</span>
      ),
    },
    {
      id: "receivedQty",
      header: "จำนวนรับเข้า",
      cell: ({ row }: { row: { original: POItem } }) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={row.original.receivedQty <= 1}
            onClick={() => handleQtyChange(row.original.id, row.original.receivedQty - 1)}
            aria-label="ลดจำนวน"
            className="h-7 w-7 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-sm font-bold text-[var(--cmms-text-secondary)] transition-all hover:bg-[var(--cmms-bg-wash)] disabled:opacity-40"
          >−</button>
          <span className="text-sm font-bold">{row.original.receivedQty}</span>
          <button
            type="button"
            onClick={() => handleQtyChange(row.original.id, row.original.receivedQty + 1)}
            aria-label="เพิ่มจำนวน"
            className="cmms-btn-primary h-7 w-7 rounded-lg text-sm font-bold text-white transition-all"
          >+</button>
        </div>
      ),
    },
    {
      id: "unitPrice",
      header: "ราคา/หน่วย",
      cell: ({ row }: { row: { original: POItem } }) => (
        <span className="text-sm">{row.original.unitPrice.toLocaleString("th-TH")}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: POItem } }) => (
        <button
          type="button"
          onClick={() => handleRemove(row.original.id)}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all"
          style={{ color: "var(--cmms-danger)", background: "var(--cmms-danger-light)", borderColor: "color-mix(in srgb, var(--cmms-danger) 25%, transparent)" }}
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
          ลบ
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={22} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <FileCheck2 size={14} strokeWidth={1.75} aria-hidden="true" /> {items.length} รายการ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchParts}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20"
        >
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          รีเฟรช
        </button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <h4 className="text-base font-bold tracking-tight">ข้อมูลใบสั่งซื้อ (PO)</h4>
          <Input
            label="เลขที่ใบสั่งซื้อ (PO Number) *"
            placeholder="เช่น PO-2026-9901"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--cmms-text-primary)]">เลือกอะไหล่ที่รับเข้าคลัง</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cmms-text-muted)]" />
                <Input
                  label="ค้นหาอะไหล่"
                  isLabelHidden
                  placeholder="ค้นหารหัส / ชื่ออะไหล่..."
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="min-w-[240px] flex-[2]">
                <Select
                  label="เลือกอะไหล่"
                  isLabelHidden
                  placeholder="เลือกอะไหล่..."
                  value={selectedPart}
                  onChange={(e) => setSelectedPart(e.target.value)}
                >
                  {partOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
              <Button disabled={!selectedPart} onClick={handleAddPart}>
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> เพิ่ม
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ background: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
          <div className="flex items-center gap-2">
            <FileCheck2 size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
            <span className="text-sm font-bold">รายการรับเข้า{poNumber ? ` — ${poNumber}` : ""}</span>
          </div>
          <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
            {items.length} รายการ
          </span>
        </div>
        {items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีรายการ — เพิ่มอะไหล่ที่รับเข้าจากด้านบน</p>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={items}
              showPagination={false}
              getRowId={(row) => row.id}
              emptyTitle=""
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4" style={{ background: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
              <span className="text-sm text-[var(--cmms-text-secondary)]">มูลค่า PO รวม</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl font-bold tracking-tight">
                  {totalValue.toLocaleString("th-TH")}{" "}
                  <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">บาท</span>
                </span>
                <Button
                  disabled={submitting || !poNumber.trim() || items.length === 0}
                  onClick={handleSubmitReceipt}
                >
                  <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  {submitting ? "กำลังบันทึก..." : "ยืนยันการรับเข้าคลัง"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

    </div>
  );
}

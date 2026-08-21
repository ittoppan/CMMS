"use client";

import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Sparkles,
  TriangleAlert,
  RefreshCw,
  Lightbulb,
  Scale,
} from "lucide-react";

interface EOQItem {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unitPrice: number;
  totalValue: number;
  reorderPoint: number;
  abcClass: "A" | "B" | "C";
  deadStockDays: number;
  aiRecommendation: string;
  needsReorder: boolean;
}

// ค่าเริ่มต้นสำหรับคำนวณ EOQ (ไม่มีการเคลื่อนไหวที่บันทึกใน DB — ประมาณจาก min/max stock)
const DEMAND_ESTIMATE = 1.5; // เท่าของ min_stock ต่อปี (ประมาณการ)
const ORDER_COST = 500; // ต้นทุนการสั่งซื้อต่อครั้ง (บาท)
const HOLDING_RATE = 0.25; // ต้นทุนถือครอง 25% ต่อปี

function computeEOQ(item: any): EOQItem {
  const stock = parseFloat(item.stock_qty) || 0;
  const minStock = parseFloat(item.min_stock) || 0;
  const maxStock = parseFloat(item.max_stock) || 0;
  const unitPrice = parseFloat(item.unit_price) || 0;

  const annualDemand = Math.max(minStock * DEMAND_ESTIMATE, 10);
  const eoq = unitPrice > 0 ? Math.round(Math.sqrt((2 * annualDemand * ORDER_COST) / (HOLDING_RATE * unitPrice))) : 0;
  const reorderPoint = Math.round(minStock * 1.2);
  const totalValue = stock * unitPrice;

  // ABC Class ตามสัดส่วนมูลค่าคงคลัง (ชั้นบนสุด 70% = A, 20% = B, 10% = C)
  let abcClass: "A" | "B" | "C" = "C";
  if (totalValue > 50000) abcClass = "A";
  else if (totalValue > 10000) abcClass = "B";

  // Dead stock: สต็อกเกิน max มาก (>1.5 เท่า) และไม่เคยอัปเดตเกิน 180 วัน
  let deadStockDays = 0;
  const lastUpdate = item.last_synced_at || item.updated_at || "";
  if (lastUpdate) {
    const days = Math.floor((Date.now() - new Date(lastUpdate.replace(" ", "T")).getTime()) / 86400000);
    if (days > 0) deadStockDays = days;
  }

  const needsReorder = minStock > 0 && stock <= minStock;
  const isDeadStock = deadStockDays >= 180 && stock > 0 && stock >= maxStock;

  let aiRecommendation: string;
  if (isDeadStock) {
    aiRecommendation = `Dead Stock! ไม่มีความเคลื่อนไหว ${deadStockDays} วัน (มูลค่า ${totalValue.toLocaleString("th-TH")} บาท) แนะนำตัดจำหน่ายหรือขายคืนซัพพลายเออร์`;
  } else if (needsReorder) {
    aiRecommendation = `สต็อกต่ำกว่า Min Stock (${stock}/${minStock}) ควรสั่งซื้อประมาณ ${eoq} หน่วยเพื่อรักษาระดับคลัง`;
  } else if (stock > maxStock && maxStock > 0) {
    aiRecommendation = `สต็อกเกิน Max Stock (${stock}/${maxStock}) ควรชะลอการสั่งซื้อและตรวจสอบการหมุนเวียน`;
  } else {
    aiRecommendation = `ระดับสต็อกปกติ (Min ${minStock} / Max ${maxStock}) — จุดสั่งซื้อใหม่ประมาณ ${reorderPoint} หน่วย`;
  }

  return {
    id: `sp-${item.id}`,
    code: item.code,
    name: item.name,
    currentStock: stock,
    minStock,
    maxStock,
    unitPrice,
    totalValue,
    reorderPoint,
    abcClass,
    deadStockDays,
    aiRecommendation,
    needsReorder,
  };
}

export default function InventoryOptimizationPage() {
  const [items, setItems] = useState<EOQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/spare_parts.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const computed = json.map(computeEOQ);
        setItems(computed);
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลอะไหล่ได้");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const classA = items.filter((i) => i.abcClass === "A").length;
    const deadStock = items.filter((i) => i.deadStockDays >= 180);
    const deadValue = deadStock.reduce((s, i) => s + i.totalValue, 0);
    const reorder = items.filter((i) => i.needsReorder).length;
    const totalValue = items.reduce((s, i) => s + i.totalValue, 0);
    return { classA, deadCount: deadStock.length, deadValue, reorder, totalValue };
  }, [items]);

  const filteredData = useMemo(() => {
    if (activeTab === "deadstock") return items.filter((i) => i.deadStockDays >= 180);
    if (activeTab === "classA") return items.filter((i) => i.abcClass === "A");
    if (activeTab === "reorder") return items.filter((i) => i.needsReorder);
    return items;
  }, [activeTab, items]);

  const columns: ColumnDef<UiTableFeatures, EOQItem>[] = [
    {
      id: "code",
      header: "รหัส / ชื่ออะไหล่",
      cell: ({ row }: { row: { original: EOQItem } }) => (
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{row.original.code}</span>
            <span
              className="cmms-andon-chip"
              style={
                row.original.abcClass === "A"
                  ? { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }
                  : row.original.abcClass === "B"
                    ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
                    : { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }
              }
            >
              Class {row.original.abcClass}
            </span>
          </div>
          <div className="text-sm text-[var(--cmms-text-secondary)]">{row.original.name}</div>
        </div>
      ),
    },
    {
      accessorKey: "currentStock",
      header: "สต็อกปัจจุบัน",
      cell: ({ row }: { row: { original: EOQItem } }) => (
        <span className="text-sm font-bold">{row.original.currentStock}</span>
      ),
    },
    {
      id: "range",
      header: "Min / Max",
      cell: ({ row }: { row: { original: EOQItem } }) => (
        <span className="text-sm">{row.original.minStock} / {row.original.maxStock}</span>
      ),
    },
    {
      id: "reorder",
      header: "Reorder Point",
      cell: ({ row }: { row: { original: EOQItem } }) => (
        <span className="text-sm text-[var(--cmms-text-secondary)]">~{row.original.reorderPoint} หน่วย</span>
      ),
    },
    {
      id: "deadStockDays",
      header: "ไม่เคลื่อนไหว (วัน)",
      cell: ({ row }: { row: { original: EOQItem } }) =>
        row.original.deadStockDays >= 180 ? (
          <span className="cmms-status down"><span className="cmms-status-dot" />{row.original.deadStockDays} วัน</span>
        ) : (
          <span className="text-sm">{row.original.deadStockDays} วัน</span>
        ),
    },
    {
      id: "aiRecommendation",
      header: "คำแนะนำจาก AI Copilot",
      cell: ({ row }: { row: { original: EOQItem } }) => (
        <div className="flex items-start gap-2">
          <Lightbulb size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--cmms-warning)]" />
          <span className="text-sm">{row.original.aiRecommendation}</span>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={22} label="กำลังคำนวณข้อมูลคลังอะไหล่..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="Error" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SPARE PARTS OPTIMIZATION · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>AI วิเคราะห์คลังอะไหล่</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" /> ขับเคลื่อนด้วย AI
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            คำนวณจุดสั่งซื้อ Reorder Point, กลุ่ม Class A/B/C และวิเคราะห์สินค้าค้างคลัง (Dead Stock)
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white cmms-btn-primary"
        >
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
          ประมวลผล AI ใหม่
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4">
        <Card className="cmms-kpi-card blue">
          <div className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile h-11 w-11">
              <Scale size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-0">
              <p className="text-xs font-bold" style={{ color: "var(--cmms-primary)" }}>อะไหล่กลุ่มสำคัญสูง (Class A)</p>
              <h3 className="cmms-kpi-value">{stats.classA} <span className="text-sm font-normal">รายการ</span></h3>
            </div>
          </div>
        </Card>

        <Card className="cmms-kpi-card red">
          <div className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile red h-11 w-11">
              <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-0">
              <p className="text-xs font-bold" style={{ color: "var(--cmms-danger)" }}>อะไหล่ค้างคลัง (&gt; 180 วัน)</p>
              <h3 className="cmms-kpi-value">{stats.deadCount} <span className="text-sm font-normal">รายการ (จมทุน {stats.deadValue.toLocaleString("th-TH")} บาท)</span></h3>
            </div>
          </div>
        </Card>

        <Card className="cmms-kpi-card amber">
          <div className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile amber h-11 w-11">
              <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-0">
              <p className="text-xs font-bold" style={{ color: "var(--cmms-warning)" }}>ต่ำกว่า Min Stock</p>
              <h3 className="cmms-kpi-value">{stats.reorder} <span className="text-sm font-normal">รายการ (ต้องสั่งซื้อ)</span></h3>
            </div>
          </div>
        </Card>

        <Card className="cmms-kpi-card green">
          <div className="flex items-center gap-3 p-4">
            <div className="cmms-icon-tile green h-11 w-11">
              <Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div className="space-y-0">
              <p className="text-xs font-bold" style={{ color: "var(--cmms-success)" }}>มูลค่าคงคลังรวม</p>
              <h3 className="cmms-kpi-value">{stats.totalValue.toLocaleString("th-TH")} <span className="text-sm font-normal">บาท</span></h3>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="all">อะไหล่ทั้งหมด ({items.length})</TabsTrigger>
          <TabsTrigger value="deadstock">อะไหล่ค้างคลัง ({stats.deadCount})</TabsTrigger>
          <TabsTrigger value="classA">กลุ่มสำคัญสูง ({stats.classA})</TabsTrigger>
          <TabsTrigger value="reorder">ต้องสั่งซื้อ ({stats.reorder})</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        data={filteredData.slice(0, 100)}
        showPagination={false}
        getRowId={(row) => row.id}
        emptyTitle="ไม่พบอะไหล่ในหมวดนี้"
        emptyDescription="ลองเปลี่ยนแท็บตัวกรอง หรือกดประมวลผล AI ใหม่"
      />
    </div>
  );
}

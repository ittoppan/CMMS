"use client";

import { useState, useEffect, useMemo } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  SparklesIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  LightBulbIcon,
  ScaleIcon,
} from "@heroicons/react/24/outline";

interface EOQItem extends Record<string, unknown> {
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

  const columns: TableColumn<EOQItem>[] = [
    {
      key: "code",
      header: "รหัส / ชื่ออะไหล่",
      width: proportional(2),
      renderCell: (item: EOQItem) => (
        <VStack gap={0}>
          <HStack gap={2} vAlign="center">
            <Text type="body" weight="semibold">{item.code}</Text>
            <span
              className="cmms-andon-chip"
              style={
                item.abcClass === "A"
                  ? { background: "var(--cmms-danger-light)", color: "var(--cmms-danger-dark)" }
                  : item.abcClass === "B"
                    ? { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
                    : { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }
              }
            >
              Class {item.abcClass}
            </span>
          </HStack>
          <Text type="body" size="sm" color="secondary">{item.name}</Text>
        </VStack>
      ),
    },
    {
      key: "currentStock",
      header: "สต็อกปัจจุบัน",
      width: proportional(1),
      renderCell: (item: EOQItem) => (
        <Text type="body" weight="bold">
          {item.currentStock}{item.needsReorder && " "}
        </Text>
      ),
    },
    {
      key: "range",
      header: "Min / Max",
      width: proportional(1),
      renderCell: (item: EOQItem) => (
        <Text type="body" size="sm">{item.minStock} / {item.maxStock}</Text>
      ),
    },
    {
      key: "reorder",
      header: "Reorder Point",
      width: proportional(1),
      renderCell: (item: EOQItem) => (
        <Text type="body" size="sm" color="secondary">~{item.reorderPoint} หน่วย</Text>
      ),
    },
    {
      key: "deadStockDays",
      header: "ไม่เคลื่อนไหว (วัน)",
      width: proportional(1.2),
      renderCell: (item: EOQItem) =>
        item.deadStockDays >= 180 ? (
          <span className="cmms-status down"><span className="cmms-status-dot" />{item.deadStockDays} วัน</span>
        ) : (
          <Text type="body" size="sm">{item.deadStockDays} วัน</Text>
        ),
    },
    {
      key: "aiRecommendation",
      header: "คำแนะนำจาก AI Copilot",
      width: proportional(3),
      renderCell: (item: EOQItem) => (
        <HStack gap={2} vAlign="start">
          <LightBulbIcon className="w-4 h-4 shrink-0" style={{ color: "var(--color-warning)", marginTop: 2 }} />
          <Text type="body" size="sm">{item.aiRecommendation}</Text>
        </HStack>
      ),
    },
  ];

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังคำนวณข้อมูลคลังอะไหล่...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>SPARE PARTS OPTIMIZATION · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>AI วิเคราะห์คลังอะไหล่</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <SparklesIcon className="w-3.5 h-3.5" /> ขับเคลื่อนด้วย AI
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            คำนวณจุดสั่งซื้อ Reorder Point, กลุ่ม Class A/B/C และวิเคราะห์สินค้าค้างคลัง (Dead Stock)
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <ArrowPathIcon className="w-4 h-4" />
          ประมวลผล AI ใหม่
        </button>
      </div>

      <Grid columns={{ minWidth: 260, max: 4 }} gap={4}>
        <Card padding={4} className="cmms-kpi-card blue">
          <HStack gap={3} vAlign="center">
            <div className="w-11 h-11 cmms-icon-tile">
              <ScaleIcon className="w-5 h-5" />
            </div>
            <VStack gap={0}>
              <Text type="supporting" weight="bold" color="accent">อะไหล่กลุ่มสำคัญสูง (Class A)</Text>
              <Heading level={3} className="cmms-kpi-value">{stats.classA} <span style={{ fontSize: 14, color: "var(--color-secondary)" }}>รายการ</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card red">
          <HStack gap={3} vAlign="center">
            <div className="w-11 h-11 cmms-icon-tile red">
              <ExclamationTriangleIcon className="w-5 h-5" />
            </div>
            <VStack gap={0}>
              <Text type="supporting" weight="bold" style={{ color: "var(--color-error)" }}>อะไหล่ค้างคลัง (&gt; 180 วัน)</Text>
              <Heading level={3} className="cmms-kpi-value">{stats.deadCount} <span style={{ fontSize: 14, color: "var(--color-secondary)" }}>รายการ (จมทุน {stats.deadValue.toLocaleString("th-TH")} บาท)</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card amber">
          <HStack gap={3} vAlign="center">
            <div className="w-11 h-11 cmms-icon-tile amber">
              <ExclamationTriangleIcon className="w-5 h-5" />
            </div>
            <VStack gap={0}>
              <Text type="supporting" weight="bold" style={{ color: "var(--color-warning)" }}>ต่ำกว่า Min Stock</Text>
              <Heading level={3} className="cmms-kpi-value">{stats.reorder} <span style={{ fontSize: 14, color: "var(--color-secondary)" }}>รายการ (ต้องสั่งซื้อ)</span></Heading>
            </VStack>
          </HStack>
        </Card>

        <Card padding={4} className="cmms-kpi-card green">
          <HStack gap={3} vAlign="center">
            <div className="w-11 h-11 cmms-icon-tile green">
              <SparklesIcon className="w-5 h-5" />
            </div>
            <VStack gap={0}>
              <Text type="supporting" weight="bold" style={{ color: "var(--color-success)" }}>มูลค่าคงคลังรวม</Text>
              <Heading level={3} className="cmms-kpi-value">{stats.totalValue.toLocaleString("th-TH")} <span style={{ fontSize: 14, color: "var(--color-secondary)" }}>บาท</span></Heading>
            </VStack>
          </HStack>
        </Card>
      </Grid>

      <TabList value={activeTab} onChange={setActiveTab}>
        <Tab value="all" label={`อะไหล่ทั้งหมด (${items.length})`} />
        <Tab value="deadstock" label={`อะไหล่ค้างคลัง (${stats.deadCount})`} />
        <Tab value="classA" label={`กลุ่มสำคัญสูง (${stats.classA})`} />
        <Tab value="reorder" label={`ต้องสั่งซื้อ (${stats.reorder})`} />
      </TabList>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <Table<EOQItem>
          data={filteredData.slice(0, 100)}
          columns={columns}
          idKey="id"
          density="balanced"
          dividers="rows"
        />
      </Card>
    </VStack>
  );
}

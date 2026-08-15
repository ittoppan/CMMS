"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Field } from "@astryxdesign/core/Field";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";

interface POItem extends Record<string, unknown> {
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

  const columns: TableColumn<POItem>[] = [
    {
      key: "itemCode",
      header: "รหัสอะไหล่ / รายละเอียด",
      width: proportional(2.2),
      renderCell: (item: POItem) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{item.itemCode}</Text>
          <Text type="body" size="sm" color="secondary">{item.description}</Text>
        </VStack>
      ),
    },
    {
      key: "currentStock",
      header: "สต็อกเดิม",
      width: proportional(1),
      renderCell: (item: POItem) => <Text type="body">{item.currentStock} {item.unit}</Text>,
    },
    {
      key: "receivedQty",
      header: "จำนวนรับเข้า",
      width: proportional(1.2),
      renderCell: (item: POItem) => (
        <HStack gap={1} vAlign="center">
          <button
            type="button"
            disabled={item.receivedQty <= 1}
            onClick={() => handleQtyChange(item.id, item.receivedQty - 1)}
            className="w-7 h-7 rounded-lg text-sm font-bold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] disabled:opacity-40 transition-all"
          >−</button>
          <Text type="body" weight="bold">{item.receivedQty}</Text>
          <button
            type="button"
            onClick={() => handleQtyChange(item.id, item.receivedQty + 1)}
            className="w-7 h-7 rounded-lg text-sm font-bold text-white cmms-btn-primary transition-all"
          >+</button>
        </HStack>
      ),
    },
    {
      key: "unitPrice",
      header: "ราคา/หน่วย",
      width: proportional(1),
      renderCell: (item: POItem) => <Text type="body">{item.unitPrice.toLocaleString("th-TH")}</Text>,
    },
    {
      key: "actions",
      header: "",
      width: proportional(0.7),
      renderCell: (item: POItem) => (
        <button
          type="button"
          onClick={() => handleRemove(item.id)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
        >
          <TrashIcon className="w-3.5 h-3.5" />
          ลบ
        </button>
      ),
    },
  ];

  if (loading) {
    return (
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="Error" description={error} isDismissable={false} />}

      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{hero.title}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <DocumentCheckIcon className="w-3.5 h-3.5" /> {items.length} รายการ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchParts}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowPathIcon className="w-4 h-4" />
          รีเฟรช
        </button>
      </div>

      <Card padding={5}>
        <Heading level={4} style={{ marginBottom: 16 }}>ข้อมูลใบสั่งซื้อ (PO)</Heading>
        <FormLayout>
          <VStack gap={4}>
            <Field inputID="f-po" label="เลขที่ใบสั่งซื้อ (PO Number) *" isRequired>
              <TextInput
                label="เลขที่ใบสั่งซื้อ"
                isLabelHidden
                placeholder="เช่น PO-2026-9901"
                value={poNumber}
                onChange={setPoNumber}
              />
            </Field>
            <Field inputID="f-part" label="เลือกอะไหล่ที่รับเข้าคลัง">
              <HStack gap={2} vAlign="center">
                <div style={{ flex: 1 }}>
                  <TextInput
                    label="ค้นหาอะไหล่"
                    isLabelHidden
                    placeholder="ค้นหารหัส / ชื่ออะไหล่..."
                    startIcon={MagnifyingGlassIcon}
                    value={partSearch}
                    onChange={setPartSearch}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <Selector
                    label="เลือกอะไหล่"
                    isLabelHidden
                    placeholder="เลือกอะไหล่..."
                    options={partOptions}
                    value={selectedPart}
                    onChange={(v) => setSelectedPart(String(v))}
                  />
                </div>
                <button type="button" disabled={!selectedPart} onClick={handleAddPart} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"><PlusIcon className="w-4 h-4" /> เพิ่ม</button>
              </HStack>
            </Field>
          </VStack>
        </FormLayout>
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
          <HStack hAlign="between" vAlign="center">
            <HStack gap={2} vAlign="center">
              <DocumentCheckIcon className="w-5 h-5" style={{ color: "var(--color-accent)" }} />
              <Text type="body" weight="bold">รายการรับเข้า{poNumber ? ` — ${poNumber}` : ""}</Text>
            </HStack>
            <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
              {items.length} รายการ
            </span>
          </HStack>
        </div>
        {items.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Text type="body" color="secondary">ยังไม่มีรายการ — เพิ่มอะไหล่ที่รับเข้าจากด้านบน</Text>
          </div>
        ) : (
          <>
            <Table<POItem> data={items} columns={columns} idKey="id" density="balanced" dividers="rows" />
            <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
              <HStack hAlign="between" vAlign="center" gap={3}>
                <Text type="body" color="secondary">มูลค่า PO รวม</Text>
                <HStack gap={3} vAlign="center">
                  <Heading level={3}>{totalValue.toLocaleString("th-TH")} <span style={{ fontSize: 14, color: "var(--color-secondary)" }}>บาท</span></Heading>
                  <button
                    type="button"
                    disabled={submitting || !poNumber.trim() || items.length === 0}
                    onClick={handleSubmitReceipt}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    {submitting ? "กำลังบันทึก..." : "ยืนยันการรับเข้าคลัง"}
                  </button>
                </HStack>
              </HStack>
            </div>
          </>
        )}
      </Card>

    </VStack>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
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
          <Button size="sm" variant="ghost" label="−" isDisabled={item.receivedQty <= 1} onClick={() => handleQtyChange(item.id, item.receivedQty - 1)} />
          <Text type="body" weight="bold">{item.receivedQty}</Text>
          <Button size="sm" variant="ghost" label="+" onClick={() => handleQtyChange(item.id, item.receivedQty + 1)} />
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
        <Button size="sm" variant="ghost" icon={<Icon icon={TrashIcon} size="sm" />} label="ลบ" onClick={() => handleRemove(item.id)} />
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

      <HStack hAlign="between" vAlign="center">
        <VStack gap={1}>
          <Heading level={2}>รับอะไหล่จาก PO (Sage PO Receipt)</Heading>
          <Text type="body" color="secondary">บันทึกการรับเข้าคลังเมื่ออะไหล่ตามใบสั่งซื้อมาถึง</Text>
        </VStack>
        <Button label="รีเฟรช" variant="secondary" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={fetchParts} />
      </HStack>

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
                <Button label="เพิ่ม" variant="primary" isDisabled={!selectedPart} onClick={handleAddPart} icon={<Icon icon={PlusIcon} size="sm" />} />
              </HStack>
            </Field>
          </VStack>
        </FormLayout>
      </Card>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
          <HStack hAlign="between" vAlign="center">
            <HStack gap={2} vAlign="center">
              <Icon icon={DocumentCheckIcon} color="accent" />
              <Text type="body" weight="bold">รายการรับเข้า{poNumber ? ` — ${poNumber}` : ""}</Text>
            </HStack>
            <Badge label={`${items.length} รายการ`} variant="info" />
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
                  <Button
                    label={submitting ? "กำลังบันทึก..." : "ยืนยันการรับเข้าคลัง"}
                    variant="primary"
                    isDisabled={submitting || !poNumber.trim() || items.length === 0}
                    onClick={handleSubmitReceipt}
                    icon={<Icon icon={CheckCircleIcon} size="sm" />}
                  />
                </HStack>
              </HStack>
            </div>
          </>
        )}
      </Card>

    </VStack>
  );
}

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
import { Grid } from "@astryxdesign/core/Grid";
import { Table, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import {
  ShoppingBagIcon,
  PlusIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface CartItem extends Record<string, unknown> {
  id: string;
  partId: number;
  code: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  stockQty: number;
}

export default function SageIssueCenterPage() {
  const hero = usePageHero("spare_parts/issue_center");
  const [workOrders, setWorkOrders] = useState<{ value: string; label: string }[]>([]);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const [workOrder, setWorkOrder] = useState("");
  const [technician, setTechnician] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [partSearch, setPartSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [woRes, userRes, partRes] = await Promise.all([
        fetch("/api/v1/repair.php"),
        fetch("/api/v1/users.php"),
        fetch("/api/v1/spare_parts.php"),
      ]);
      const woJson = await woRes.json();
      const userJson = await userRes.json();
      const partJson = await partRes.json();
      if (Array.isArray(woJson)) {
        setWorkOrders(
          woJson
            .filter((w: any) => w.status !== "completed" && w.status !== "closed" && w.status !== "resolved" && w.status !== "cancelled")
            .map((w: any) => ({ value: String(w.id), label: `${w.work_order_no}${w.asset_name ? ` • ${w.asset_name}` : ""}` }))
        );
      }
      if (Array.isArray(userJson)) {
        setUsers(
          userJson
            .filter((u: any) => u.is_active !== 0)
            .map((u: any) => ({ value: String(u.id), label: u.full_name }))
        );
      }
      if (Array.isArray(partJson)) {
        setParts(partJson);
      }
    } catch (e) {
      console.error(e);
      setError("ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const partOptions = useMemo(() => {
    const q = partSearch.toLowerCase();
    return parts
      .filter((p) => !q || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .map((p) => ({
        value: String(p.id),
        label: `${p.code}: ${p.name} (คงเหลือ ${p.stock_qty} ${p.unit})`,
        raw: p,
      }));
  }, [parts, partSearch]);

  const handleAddPart = () => {
    if (!selectedPart) return;
    const part = parts.find((p) => String(p.id) === selectedPart);
    if (!part) return;
    const existing = cart.find((i) => i.partId === part.id);
    if (existing) {
      setCart(cart.map((i) => (i.partId === part.id ? { ...i, qty: i.qty + 1 } : i)));
    } else {
      setCart([
        ...cart,
        {
          id: `c-${Date.now()}`,
          partId: part.id,
          code: part.code,
          name: part.name,
          qty: 1,
          unit: part.unit || "ชิ้น",
          unitPrice: parseFloat(part.unit_price) || 0,
          stockQty: parseFloat(part.stock_qty) || 0,
        },
      ]);
    }
    setSelectedPart("");
  };

  const handleRemove = (id: string) => {
    setCart(cart.filter((i) => i.id !== id));
  };

  const handleQtyChange = (id: string, qty: number) => {
    setCart(cart.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
  };

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const totalValue = cart.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const handleSubmit = async () => {
    if (!workOrder || !technician || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      let issued = 0;
      for (const item of cart) {
        if (item.qty > item.stockQty) {
          setError(`อะไหล่ ${item.code} เหลือในคลังไม่พอ (คงเหลือ ${item.stockQty} ${item.unit})`);
          setSubmitting(false);
          return;
        }
        const newQty = Math.max(0, item.stockQty - item.qty);
        const res = await fetch(`/api/v1/spare_parts.php?id=${item.partId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stock_qty: newQty }),
        });
        const json = await res.json();
        if (json.success) issued += 1;
      }
      if (issued > 0) {
        showToast("success", `เบิก-จ่ายอะไหล่ ${issued} รายการ เรียบร้อยแล้ว (WO: ${workOrders.find((w) => w.value === workOrder)?.label.split(" • ")[0]})`);
        setCart([]);
        fetchData();
      } else {
        setError("ไม่สามารถบันทึกการเบิก-จ่ายได้");
      }
    } catch (e) {
      console.error(e);
      setError("เกิดข้อผิดพลาดในการเบิก-จ่าย กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  const columns: TableColumn<CartItem>[] = [
    {
      key: "code",
      header: "รหัส / รายการอะไหล่",
      width: proportional(2),
      renderCell: (item: CartItem) => (
        <VStack gap={0}>
          <Text type="body" weight="semibold">{item.code}</Text>
          <Text type="body" size="sm" color="secondary">{item.name}</Text>
        </VStack>
      ),
    },
    {
      key: "qty",
      header: "จำนวน",
      width: proportional(1),
      renderCell: (item: CartItem) => (
        <HStack gap={1} vAlign="center">
          <button
            type="button"
            disabled={item.qty <= 1}
            onClick={() => handleQtyChange(item.id, item.qty - 1)}
            className="w-7 h-7 rounded-lg text-sm font-bold text-[var(--cmms-text-secondary)] bg-[var(--cmms-bg-muted)] hover:bg-[var(--cmms-bg-wash)] border border-[var(--cmms-border)] disabled:opacity-40 transition-all"
          >−</button>
          <Text type="body" weight="bold">{item.qty}</Text>
          <button
            type="button"
            onClick={() => handleQtyChange(item.id, item.qty + 1)}
            className="w-7 h-7 rounded-lg text-sm font-bold text-white cmms-btn-primary"
          >+</button>
        </HStack>
      ),
    },
    {
      key: "unitPrice",
      header: "ราคา/หน่วย",
      width: proportional(1),
      renderCell: (item: CartItem) => <Text type="body">{item.unitPrice.toLocaleString("th-TH")}</Text>,
    },
    {
      key: "total",
      header: "รวม",
      width: proportional(1),
      renderCell: (item: CartItem) => (
        <Text type="body" weight="semibold">{(item.qty * item.unitPrice).toLocaleString("th-TH")}</Text>
      ),
    },
    {
      key: "actions",
      header: "",
      width: proportional(0.7),
      renderCell: (item: CartItem) => (
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
              <ShoppingBagIcon className="w-3.5 h-3.5" /> {totalQty} รายการในใบเบิก
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </Text>
        </VStack>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          <ArrowPathIcon className="w-4 h-4" />
          รีเฟรช
        </button>
      </div>

      <Grid columns={{ minWidth: 560, max: 2 }} gap={6}>
        {/* คอลัมน์ซ้าย: ฟอร์ม */}
        <VStack gap={4}>
          <Card padding={5}>
            <Heading level={4} style={{ marginBottom: 16 }}>1. ข้อมูลการเบิกจ่าย</Heading>
            <FormLayout>
              <VStack gap={4}>
                <Field inputID="f-wo" label="ใบสั่งงานซ่อม (Work Order) *" isRequired>
                  <Selector
                    label="ใบสั่งงาน"
                    isLabelHidden
                    placeholder="เลือกใบสั่งงาน..."
                    options={workOrders}
                    value={workOrder}
                    onChange={(v) => setWorkOrder(String(v))}
                  />
                </Field>
                <Field inputID="f-tech" label="ช่างผู้เบิก / ผู้รับผิดชอบ *" isRequired>
                  <Selector
                    label="ช่างผู้เบิก"
                    isLabelHidden
                    placeholder="เลือกช่าง..."
                    options={users}
                    value={technician}
                    onChange={(v) => setTechnician(String(v))}
                  />
                </Field>
              </VStack>
            </FormLayout>
          </Card>

          <Card padding={5}>
            <Heading level={4} style={{ marginBottom: 16 }}>2. เลือกอะไหล่ (เพิ่มเข้าใบเบิก)</Heading>
            <VStack gap={3}>
              <TextInput
                label="ค้นหาอะไหล่"
                isLabelHidden
                placeholder="ค้นหารหัส / ชื่ออะไหล่..."
                startIcon={MagnifyingGlassIcon}
                value={partSearch}
                onChange={setPartSearch}
              />
              <HStack gap={2} vAlign="center">
                <div style={{ flex: 1 }}>
                  <Selector
                    label="เลือกอะไหล่"
                    isLabelHidden
                    placeholder="เลือกอะไหล่..."
                    options={partOptions}
                    value={selectedPart}
                    onChange={(v) => setSelectedPart(String(v))}
                  />
                </div>
                <button
                  type="button"
                  disabled={!selectedPart}
                  onClick={handleAddPart}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PlusIcon className="w-4 h-4" />
                  เพิ่ม
                </button>
              </HStack>
            </VStack>
          </Card>
        </VStack>

        {/* คอลัมน์ขวา: ตะกร้า */}
        <VStack gap={4}>
          <Card padding={0} style={{ overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderBottom: "1px solid var(--color-border)" }}>
              <HStack hAlign="between" vAlign="center">
                <HStack gap={2} vAlign="center">
                  <ShoppingBagIcon className="w-5 h-5" style={{ color: "var(--color-accent)" }} />
                  <Text type="body" weight="bold">ใบเบิกอะไหล่</Text>
                </HStack>
                <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                  {totalQty} รายการ
                </span>
              </HStack>
            </div>
            {cart.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center" }}>
                <Text type="body" color="secondary">ยังไม่มีรายการเบิกจ่าย — เลือกอะไหล่จากคอลัมน์ซ้าย</Text>
              </div>
            ) : (
              <>
                <Table<CartItem> data={cart} columns={columns} idKey="id" density="balanced" dividers="rows" />
                <div style={{ padding: "16px 24px", backgroundColor: "var(--color-muted)", borderTop: "1px solid var(--color-border)" }}>
                  <HStack hAlign="between" vAlign="center">
                    <Text type="body" color="secondary">มูลค่ารวม</Text>
                    <Heading level={3}>{totalValue.toLocaleString("th-TH")} <span style={{ fontSize: 14, color: "var(--color-secondary)" }}>บาท</span></Heading>
                  </HStack>
                </div>
              </>
            )}
          </Card>

          <button
            type="button"
            disabled={submitting || !workOrder || !technician || cart.length === 0}
            onClick={handleSubmit}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircleIcon className="w-4 h-4" />
            {submitting ? "กำลังเบิกจ่าย..." : "ยืนยันการเบิก-จ่ายอะไหล่"}
          </button>
        </VStack>
      </Grid>

    </VStack>
  );
}

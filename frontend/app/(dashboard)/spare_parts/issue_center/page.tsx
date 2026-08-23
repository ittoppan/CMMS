"use client";

import { useState, useEffect, useMemo } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DataTable, type UiTableFeatures } from "@/components/ui/table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ShoppingBag,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

interface CartItem {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const columns: ColumnDef<UiTableFeatures, CartItem>[] = [
    {
      id: "code",
      header: t("tbl.spare_item"),
      cell: ({ row }: { row: { original: CartItem } }) => (
        <div className="space-y-0.5">
          <div className="text-sm font-semibold">{row.original.code}</div>
          <div className="text-sm text-[var(--cmms-text-secondary)]">{row.original.name}</div>
        </div>
      ),
    },
    {
      id: "qty",
      header: t("tbl.qty"),
      cell: ({ row }: { row: { original: CartItem } }) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={row.original.qty <= 1}
            onClick={() => handleQtyChange(row.original.id, row.original.qty - 1)}
            aria-label="ลดจำนวน"
            className="h-7 w-7 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-sm font-bold text-[var(--cmms-text-secondary)] transition-all hover:bg-[var(--cmms-bg-wash)] disabled:opacity-40"
          >−</button>
          <span className="text-sm font-bold">{row.original.qty}</span>
          <button
            type="button"
            onClick={() => handleQtyChange(row.original.id, row.original.qty + 1)}
            aria-label="เพิ่มจำนวน"
            className="cmms-btn-primary h-7 w-7 rounded-lg text-sm font-bold text-white"
          >+</button>
        </div>
      ),
    },
    {
      id: "unitPrice",
      header: t("tbl.unit_price"),
      cell: ({ row }: { row: { original: CartItem } }) => (
        <span className="text-sm">{row.original.unitPrice.toLocaleString("th-TH")}</span>
      ),
    },
    {
      id: "total",
      header: t("tbl.total"),
      cell: ({ row }: { row: { original: CartItem } }) => (
        <span className="text-sm font-semibold">{(row.original.qty * row.original.unitPrice).toLocaleString("th-TH")}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: CartItem } }) => (
        <button
          type="button"
          onClick={() => handleRemove(row.original.id)}
          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all"
          style={{ color: "var(--cmms-danger)", background: "var(--cmms-danger-light)", borderColor: "color-mix(in srgb, var(--cmms-danger) 25%, transparent)" }}
        >
          <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />{t("action.delete")}
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
              <ShoppingBag size={14} strokeWidth={1.75} aria-hidden="true" /> {totalQty} รายการในใบเบิก
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            {hero.desc}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:bg-white/20"
        >
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />{t("action.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* คอลัมน์ซ้าย: ฟอร์ม */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. ข้อมูลการเบิกจ่าย</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select
                label="ใบสั่งงานซ่อม (Work Order) *"
                placeholder="เลือกใบสั่งงาน..."
                value={workOrder}
                onChange={(e) => setWorkOrder(e.target.value)}
              >
                {workOrders.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </Select>
              <Select
                label="ช่างผู้เบิก / ผู้รับผิดชอบ *"
                placeholder="เลือกช่าง..."
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. เลือกอะไหล่ (เพิ่มเข้าใบเบิก)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
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
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
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
                  <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                  เพิ่ม
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* คอลัมน์ขวา: ตะกร้า */}
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-6 py-4" style={{ background: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
              <div className="flex items-center gap-2">
                <ShoppingBag size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <span className="text-sm font-bold">ใบเบิกอะไหล่</span>
              </div>
              <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>
                {totalQty} รายการ
              </span>
            </div>
            {cart.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีรายการเบิกจ่าย — เลือกอะไหล่จากคอลัมน์ซ้าย</p>
              </div>
            ) : (
              <>
                <DataTable
                  columns={columns}
                  data={cart}
                  showPagination={false}
                  getRowId={(row) => row.id}
                  emptyTitle=""
                />
                <div className="flex items-center justify-between border-t px-6 py-4" style={{ background: "var(--cmms-bg-muted)", borderColor: "var(--cmms-border)" }}>
                  <span className="text-sm text-[var(--cmms-text-secondary)]">มูลค่ารวม</span>
                  <span className="text-xl font-bold tracking-tight">
                    {totalValue.toLocaleString("th-TH")}{" "}
                    <span className="text-sm font-normal text-[var(--cmms-text-secondary)]">บาท</span>
                  </span>
                </div>
              </>
            )}
          </Card>

          <Button
            className="w-full"
            disabled={submitting || !workOrder || !technician || cart.length === 0}
            onClick={handleSubmit}
          >
            <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
            {submitting ? "กำลังเบิกจ่าย..." : "ยืนยันการเบิก-จ่ายอะไหล่"}
          </Button>
        </div>
      </div>

    </div>
  );
}

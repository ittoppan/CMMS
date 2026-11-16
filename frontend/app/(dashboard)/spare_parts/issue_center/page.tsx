"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";

import { useState, useEffect, useMemo, useCallback } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useToast } from "@/components/ToastProvider";
import { sendOrEnqueueDetailed } from "@/lib/offlineQueue";
import { useCan } from "@/lib/useCan";
import { QrScanner } from "@/components/field/QrScanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
  Camera,
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
  imageUrl?: string | null;
}

function partImageSrc(part: { id?: number; partId?: number; image_url?: string | null; imageUrl?: string | null }) {
  const id = part.partId ?? part.id;
  const raw = (part.image_url ?? part.imageUrl ?? "").toString().trim();
  if (raw) {
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
  }
  return id ? `/api/v1/spare_image.php?id=${id}` : "/api/v1/spare_image.php?id=0";
}

export default function SageIssueCenterPage() {
  // การสร้างใบเบิกต้องมี spare_parts:request — บทบาทอื่นเห็นข้อมูลอย่างเดียว
  const canRequest = useCan("spare_parts")("request");
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
  const [showScanner, setShowScanner] = useState(false);

  const handleScanResult = useCallback((text: string) => {
    setPartSearch(text);
    setShowScanner(false);
  }, []);

  const handleCloseScanner = useCallback(() => {
    setShowScanner(false);
  }, []);

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
      showToast("error", "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง");
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
      .filter((p) => !q || String(p.code || "").toLowerCase().includes(q) || String(p.name || "").toLowerCase().includes(q))
      .map((p) => ({
        value: String(p.id),
        label: `${p.code}: ${p.name} (คงเหลือ ${p.stock_qty} ${p.unit})`,
        raw: p,
      }));
  }, [parts, partSearch]);

  const handleAddPart = (partId?: string) => {
    const idToAdd = partId ?? selectedPart;
    if (!idToAdd) return;
    const part = parts.find((p) => String(p.id) === idToAdd);
    if (!part) return;
    const stockQty = parseFloat(part.stock_qty) || 0;
    const existing = cart.find((i) => i.partId === part.id);
    const currentQty = existing ? existing.qty : 0;
    if (currentQty >= stockQty) {
      showToast("info", `เกินสต็อกคงเหลือ (เหลือ ${stockQty} ${part.unit})`);
      return;
    }
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
          stockQty: stockQty,
          imageUrl: part.image_url ?? null,
        },
      ]);
    }
    setSelectedPart("");
  };

  const handleRemove = (id: string) => {
    setCart(cart.filter((i) => i.id !== id));
  };

  const handleQtyChange = (id: string, qty: number) => {
    if (qty < 1) return;
    const item = cart.find((i) => i.id === id);
    if (item && qty > item.stockQty) {
      showToast("info", `เกินสต็อกคงเหลือ (เหลือ ${item.stockQty} ${item.unit})`);
      return;
    }
    setCart(cart.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
  };

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const totalValue = cart.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const handleSubmit = async () => {
    if (!workOrder || !technician || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const woLabel = workOrders.find((w) => w.value === workOrder)?.label || workOrder;
      const techLabel = users.find((u) => u.value === technician)?.label || technician;

      const payload = {
        work_order_id: parseInt(workOrder),
        work_order_no: woLabel.split(" • ")[0],
        technician_id: parseInt(technician),
        technician_name: techLabel,
        request_type: "withdrawal",
        items: cart.map((item) => ({
          spare_part_id: item.partId,
          part_code: item.code,
          part_name: item.name,
          qty: item.qty,
          unit: item.unit,
          unit_price: item.unitPrice,
          stock_qty_at_request: item.stockQty,
        })),
      };

      // ออฟไลน์ → บันทึกคำขอเบิกเข้าคิว (คำขออนุมัติต้องมี request_id จึงสร้างได้เฉพาะตอนออนไลน์)
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await sendOrEnqueueDetailed({
          url: "/api/v1/spare_issue_request.php",
          method: "POST",
          body: payload,
          kind: "spare_issue",
          label: `เบิกอะไหล่สำหรับ ${woLabel}`,
        });
        showToast("info", "ออฟไลน์ — บันทึกคำขอเบิกไว้ จะส่งอัตโนมัติเมื่อมีอินเทอร์เน็ต");
        setCart([]);
        fetchData();
        setSubmitting(false);
        return;
      }

      // 1. สร้างคำขอเบิกอะไหล่ (spare_issue_requests)
      const createRes = await fetch("/api/v1/spare_issue_request.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const createJson = await createRes.json();

      if (!createJson.success) {
        throw new Error(createJson.error || "สร้างคำขอเบิกไม่สำเร็จ");
      }

      const requestId = createJson.request_id;

      // 2. เรียก ApprovalService สร้างคำขออนุมัติ
      const approvalRes = await fetch("/api/v1/approval.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_request",
          request_type: "spare_issue",
          target_id: requestId,
          document_no: `SIR-${String(requestId).padStart(6, "0")}`,
          title: `เบิกอะไหล่สำหรับ ${woLabel}`,
          requester_name: techLabel,
          details: cart.map((i) => `${i.code}: ${i.name} x${i.qty}`),
        }),
      });
      const approvalJson = await approvalRes.json();

      if (!approvalJson.success) {
        // ถ้าสร้าง approval ไม่ได้ ให้ลบ request ที่สร้างไป
        await fetch(`/api/v1/spare_issue_request.php?id=${requestId}`, { method: "DELETE" });
        throw new Error(approvalJson.message || "สร้างคำขออนุมัติไม่สำเร็จ");
      }

      showToast("success", `สร้างคำขอเบิกอะไหล่เรียบร้อยแล้ว (เลขที่: SIR-${String(requestId).padStart(6, "0")}) รอการอนุมัติ`);
      setCart([]);
      fetchData();
    } catch (e) {
      console.error(e);
      showToast("error", e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการสร้างคำขอเบิก กรุณาลองใหม่");
    }
    setSubmitting(false);
  };

  const columns: ColumnDef<UiTableFeatures, CartItem>[] = [
    {
      id: "code",
      header: t("tbl.spare_item"),
      cell: ({ row }: { row: { original: CartItem } }) => (
        <div className="flex items-center gap-3">
          <img
            src={partImageSrc({ partId: row.original.partId, imageUrl: row.original.imageUrl })}
            alt={row.original.name}
            className="h-12 w-12 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] object-cover flex-shrink-0"
            loading="lazy"
            onError={(e) => {
              const t = e.currentTarget;
              if (!t.src.includes("spare_image.php")) t.src = `/api/v1/spare_image.php?id=${row.original.partId}`;
            }}
          />
          <div className="space-y-0.5 min-w-0">
            <div className="text-sm font-semibold">{row.original.code}</div>
            <div className="text-sm text-[var(--cmms-text-secondary)] truncate">{row.original.name}</div>
          </div>
        </div>
      ),
    },
    {
      id: "qty",
      header: t("tbl.qty"),
      cell: ({ row }: { row: { original: CartItem } }) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={row.original.qty <= 1}
            onClick={() => handleQtyChange(row.original.id, row.original.qty - 1)}
            aria-label="ลดจำนวน"
            className="h-12 w-12 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-base font-bold text-[var(--cmms-text-secondary)] transition-all hover:bg-[var(--cmms-bg-wash)] disabled:opacity-40 active:scale-[0.98]"
          >−</button>
          <input
            type="number"
            min="1"
            max={row.original.stockQty}
            value={row.original.qty}
            onChange={(e) => handleQtyChange(row.original.id, parseInt(e.target.value) || 1)}
            className="w-16 h-12 text-center text-base font-bold text-[var(--cmms-text-primary)] border border-[var(--cmms-border)] rounded-[var(--cmms-radius)] focus:outline-none focus:border-[var(--cmms-border-focus)]"
          />
          <button
            type="button"
            onClick={() => handleQtyChange(row.original.id, row.original.qty + 1)}
            aria-label="เพิ่มจำนวน"
            className="h-12 w-12 rounded-lg bg-[var(--cmms-primary)] text-white text-base font-bold transition-all hover:bg-[var(--cmms-primary-hover)] active:scale-[0.98]"
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
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all"
          style={{ color: "var(--cmms-danger)", background: "var(--cmms-danger-light)", borderColor: "color-mix(in srgb, var(--cmms-danger) 25%, transparent)" }}
        >
          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">{t("action.delete")}</span>
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

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" data-on-dark="true">{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="cmms-hero-title text-2xl font-bold tracking-tight">{hero.title}</h1>
            <span className="cmms-andon-chip" data-on-dark="true">
              <ShoppingBag size={14} strokeWidth={1.75} aria-hidden="true" /> {totalQty} รายการในใบเบิก
            </span>
          </div>
          <p className="cmms-hero-desc">
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

      <ModuleGuide
        name="ศูนย์จ่ายอะไหล่"
        summary="จุดเบิกจ่ายอะไหล่ให้ช่าง — เลือก/สแกนอะไหล่ ผูกกับใบสั่งงานหรือใบแจ้งซ่อม แล้วบันทึกการเบิกออกจากคลัง"
        steps={[
          "เลือกอะไหล่ด้วยการสแกนบาร์โค้ด/QR หรือค้นหาด้วยรหัส/ชื่อ",
          "ระบุจำนวน ผู้เบิก และผูกกับใบสั่งงาน/ใบแจ้งซ่อมที่เกี่ยวข้อง",
          "ตรวจรายการแล้วกดเบิกจ่าย — ระบบบันทึกการตัดยอดและประวัติให้อัตโนมัติ",
        ]}
        source="อะไหล่และยอดจาก /api/v1/spare_parts.php · คำขอเบิก/อนุมัติจาก /api/v1/spare_issue_request.php + /api/v1/approval.php · บันทึกจ่ายผ่าน /api/v1/spare_issue.php"
        note="การจ่ายต้องผ่านรายการใบเบิก (ไม่แก้ยอดคงเหลือโดยตรง) — คำขอที่ต้องอนุมัติจะค้างอยู่ในคิวอนุมัติก่อนจ่ายได้"
        related={[
          { href: "/spare_parts/balances", label: "ยอดคงเหลืออะไหล่" },
          { href: "/spare_parts/returns", label: "รับคืนซากอะไหล่" },
          { href: "/spare_parts", label: "คลังสต็อกอะไหล่" },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* คอลัมน์ซ้าย: ฟอร์ม */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>1. ข้อมูลการเบิกจ่าย</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>ใบสั่งงานซ่อม (Work Order) *</Label>
                <Select
                  value={workOrder || "__none__"}
                  onValueChange={(v) => setWorkOrder(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger size="lg">
                    <SelectValue placeholder="เลือกใบสั่งงาน..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>เลือกใบสั่งงาน...</SelectItem>
                    {workOrders.map((w) => (
                      <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>ช่างผู้เบิก / ผู้รับผิดชอบ *</Label>
                <Select
                  value={technician || "__none__"}
                  onValueChange={(v) => setTechnician(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger size="lg">
                    <SelectValue placeholder="เลือกช่าง..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" disabled>เลือกช่าง...</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  className="pl-9 pr-14"
                  inputSize="lg"
                />
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  aria-label="สแกนบาร์โค้ด/QR"
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary)] flex items-center justify-center transition-colors hover:bg-[var(--cmms-primary)]/20 active:bg-[var(--cmms-primary)]/30"
                >
                  <Camera size={20} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-2">
                <Label>รายการอะไหล่ (คลิกเพื่อเพิ่ม)</Label>
                <div className="max-h-[360px] overflow-y-auto rounded-xl border border-[var(--cmms-border)] bg-[var(--cmms-bg-surface)]">
                  {partOptions.length === 0 ? (
                    <p className="p-4 text-sm text-[var(--cmms-text-secondary)]">ไม่พบอะไหล่ที่ตรงกับคำค้น</p>
                  ) : (
                    <ul className="divide-y divide-[var(--cmms-border)]">
                      {partOptions.map((o) => {
                        const p = o.raw;
                        const selected = selectedPart === o.value;
                        return (
                          <li key={o.value}>
                            <button
                              type="button"
                              onClick={() => handleAddPart(o.value)}
                              className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--cmms-bg-muted)] ${selected ? "bg-[var(--cmms-primary-light)]" : ""}`}
                            >
                              <img
                                src={partImageSrc(p)}
                                alt={p.name || p.code}
                                className="h-14 w-14 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] object-cover flex-shrink-0"
                                loading="lazy"
                                onError={(e) => {
                                  const t = e.currentTarget;
                                  if (!t.src.includes("spare_image.php")) t.src = `/api/v1/spare_image.php?id=${p.id}`;
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-[var(--cmms-text-primary)]">{p.code}</span>
                                  <span className={`text-xs font-medium ${(parseFloat(p.stock_qty) || 0) <= 0 ? "text-[var(--cmms-danger)]" : "text-[var(--cmms-text-secondary)]"}`}>
                                    คงเหลือ {p.stock_qty} {p.unit}
                                  </span>
                                </div>
                                <div className="truncate text-sm text-[var(--cmms-text-secondary)]">{p.name}</div>
                              </div>
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cmms-primary)] text-white flex-shrink-0">
                                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
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
                  exportFileName="spare-parts-issue"
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

          {canRequest ? (
            <Button
              className="w-full"
              size="lg"
              disabled={submitting || !workOrder || !technician || cart.length === 0}
              loading={submitting}
              loadingText="กำลังเบิกจ่าย..."
              onClick={handleSubmit}
            >
              <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />
              ยืนยันการเบิก-จ่ายอะไหล่
            </Button>
          ) : (
            <p className="rounded-[var(--cmms-radius)] border border-border bg-[var(--cmms-bg-muted)] p-3 text-center text-sm text-muted-foreground">
              คุณมีสิทธิ์ดูข้อมูลเท่านั้น — การสร้างใบเบิกอะไหล่เป็นหน้าที่ของช่าง/หัวหน้าชุด
            </p>
          )}
        </div>
      </div>

    {showScanner && (
        <QrScanner
          onResult={handleScanResult}
          onClose={handleCloseScanner}
          title="สแกนบาร์โค้ด / QR อะไหล่"
          hint="วางบาร์โค้ด/QR อยู่ตรงกลางกรอบ สแกนเสร็จจะกรอกอัตโนมัติ"
        />
      )}
    </div>
  );
}

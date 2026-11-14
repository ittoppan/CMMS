"use client";

// spare_parts — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Select, ui/Tabs, ui/Dialog,
// ui/Pagination, ui/Badge, Lucide, MiniBar progressbar)
// business logic ครบเดิม: batch image upload, Sage 300 sync, tab filter, side panel สรุปคลัง

import { useState, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import { usePageHero, t } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PanelRight,
  Database,
  Plus,
  Search,
  SquarePen,
  Trash2,
  CheckCircle2,
  Box,
  TriangleAlert,
  Banknote,
  ImagePlus,
  Download,
  History,
} from "lucide-react";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";

// ─── Types & helpers ─────────────────────────────────────────────────────────
interface SparePart {
  rawId: number;
  id: string;
  code: string;
  name: string;
  category: string;
  sageCategory: string;
  stock: number;
  reserved: number;
  minStock: number;
  maxStock: number;
  unit: string;
  location: string;
  price: number;
  sageItemNo: string;
  syncStatus: string;
  imageUrl?: string | null;
}

type StockSummary = {
  total_items: number;
  low_count: number;
  out_count: number;
  ok_count: number;
  total_value: number;
};

// ต้องตรงกับตรรกะฝั่ง API (stock_status): <= 0 = หมด, 0 < qty <= min_stock = ใกล้หมด
function getStockStatus(item: SparePart): "ok" | "low" | "out" {
  if (item.stock <= 0) return "out";
  if (item.stock <= item.minStock) return "low";
  return "ok";
}

function getAvailable(item: SparePart): number {
  return Math.max(0, item.stock - (item.reserved || 0));
}

function getSuggestedReplenish(item: SparePart): number {
  // แนะนำเติมให้ถึงระดับสูงสุดเมื่อใกล้หมด/หมด (อิงค่าสูงสุดที่ตั้งไว้)
  if (item.stock > item.minStock) return 0;
  return Math.max(0, item.maxStock - item.stock);
}

const stockBadge: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  ok: { label: "ปกติ", variant: "success" },
  low: { label: "ใกล้หมด", variant: "warning" },
  out: { label: "หมด", variant: "danger" },
};

const PAGE_SIZE = 15;

const SORT_OPTIONS = [
  { value: "newest", label: "ใหม่ล่าสุด" },
  { value: "stock_asc", label: "คงเหลือน้อย → มาก" },
  { value: "stock_desc", label: "คงเหลือมาก → น้อย" },
  { value: "value_desc", label: "มูลค่าคงคลังสูงสุด" },
  { value: "price_desc", label: "ราคาต่อหน่วยสูงสุด" },
  { value: "name_asc", label: "ชื่อ ก → ฮ" },
  { value: "updated", label: "อัปเดตล่าสุด" },
];

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const v = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/)?.[1] ?? null;
  try { return v ? decodeURIComponent(v) : null; } catch { return v; }
}

function partThumbSrc(item: SparePart): string | undefined {
  const raw = item.imageUrl;
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/\\/g, "/");
  return cleaned.startsWith("data:") || cleaned.startsWith("/") || cleaned.startsWith("http")
    ? cleaned
    : "/" + cleaned;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stockStatusLabel(item: SparePart): string {
  const st = getStockStatus(item);
  return st === "out" ? "หมด" : st === "low" ? "ใกล้หมด" : "ปกติ";
}

// ── local matchMedia hook (max-width 1024px) ──
function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isNarrow;
}

// ── MiniBar — inline role="progressbar" ──
function MiniBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Side Panel (desktop) ────────────────────────────────────────────────────
function PanelContent({ parts, summary }: { parts: SparePart[]; summary?: StockSummary | null }) {
  // ตัวเลขสรุปต้องมาจาก summary ของ API (ทั้งคลังตามตัวกรอง) ไม่ใช่เพจปัจจุบัน
  const kpis = useMemo(() => {
    if (summary) {
      return {
        total: Number(summary.total_items || 0),
        lowCount: Number(summary.low_count || 0),
        outCount: Number(summary.out_count || 0),
        totalValue: Number(summary.total_value || 0),
      };
    }
    const total = parts.length;
    const lowCount = parts.filter((p) => getStockStatus(p) === "low").length;
    const outCount = parts.filter((p) => getStockStatus(p) === "out").length;
    const totalValue = parts.reduce((sum, p) => sum + p.stock * p.price, 0);
    return { total, lowCount, outCount, totalValue };
  }, [parts, summary]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of parts) {
      const key = p.sageCategory || p.category || "ทั่วไป";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [parts]);

  return (
    <div className="space-y-4">
      <details className="rounded-[var(--cmms-radius)] border border-border p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">สรุปคลัง</summary>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">รายการอะไหล่ทั้งหมด</dt>
            <dd className="font-semibold tabular-nums">{kpis.total}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">ใกล้หมด (Min Stock)</dt>
            <dd className="flex items-center gap-2 font-semibold tabular-nums text-[var(--cmms-warning-dark)]">
              <AndonLamp status="warn" size="sm" />
              {kpis.lowCount}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">หมดคลัง (Out of Stock)</dt>
            <dd className="flex items-center gap-2 font-semibold tabular-nums text-destructive">
              <AndonLamp status="down" size="sm" />
              {kpis.outCount}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">มูลค่าคลังรวม</dt>
            <dd className="font-semibold tabular-nums">฿{kpis.totalValue.toLocaleString()}</dd>
          </div>
        </dl>
      </details>

      <hr className="border-border" />

      <details className="rounded-[var(--cmms-radius)] border border-border p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">ประเภทสต็อก (Sage 300)</summary>
        {summary && (
          <p className="mt-2 text-xs text-muted-foreground">
            นับจาก {parts.length} รายการในหน้านี้ (ตัวเลขรวมทั้งคลังอยู่ด้านบน)
          </p>
        )}
        <div className="mt-3 space-y-3">
          {categories.slice(0, 6).map(([cat, count]) => (
            <div key={cat} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-muted-foreground">{cat}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{count} รายการ</span>
              </div>
              <MiniBar value={count} max={Math.max(...categories.map(([, c]) => c))} label={cat} />
            </div>
          ))}
        </div>
      </details>

      <hr className="border-border" />

      <details className="rounded-[var(--cmms-radius)] border border-border p-4" open>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">การเชื่อมต่อ Sage 300</summary>
        <div className="mt-3 space-y-1 text-sm">
          <p className="flex items-center gap-2">
            <Database size={16} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground" />
            แหล่งข้อมูล: Sage 300 ERP (I/C Inventory Control)
          </p>
          <p className="text-muted-foreground">
            กดปุ่ม &quot;ดึงสต็อกจาก Sage&quot; ด้านบนเพื่อดึงข้อมูลล่าสุด · ประวัติ/สถานะการซิงค์ดูได้ที่หน้าตั้งค่าการดึง Sage 300
          </p>
        </div>
      </details>
    </div>
  );
}

// ─── Items Card ──────────────────────────────────────────────────────────────
function ItemsCard({
  parts,
  filtered,
  search,
  setSearch,
  sageTypeFilter,
  setSageTypeFilter,
  page,
  setPage,
  sort,
  setSort,
    onEdit,
  onDelete,
  onRefresh,
  onExportCsv,
  exportingCsv,
  onHistory,
  totalItems,
  serverPaged,
}: {
  parts: SparePart[];
  filtered: SparePart[];
  search: string;
  setSearch: (v: string) => void;
  sageTypeFilter: string;
  setSageTypeFilter: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  sort: string;
  setSort: (v: string) => void;
  onEdit: (item: SparePart) => void;
  onDelete: (item: SparePart) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
  exportingCsv: boolean;
  onHistory: (item: SparePart) => void;
  totalItems?: number;
  serverPaged?: boolean;
}) {
  const paged = serverPaged ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Batch image upload state ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchFiles, setBatchFiles] = useState<Record<number, { file: File; preview: string } | null>>({});
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchMsg, setBatchMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const selectedParts = parts.filter((p) => selectedIds.has(p.rawId));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = paged.map((p) => p.rawId);
    if (pageIds.length === 0) return;
    const allSelected = pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const pickFile = (id: number, file: File | null) => {
    setBatchFiles((prev) => {
      if (prev[id]) URL.revokeObjectURL(prev[id]!.preview);
      return { ...prev, [id]: file ? { file, preview: URL.createObjectURL(file) } : null };
    });
  };

  const uploadBatch = async () => {
    const targets = selectedParts.filter((p) => batchFiles[p.rawId]);
    if (targets.length === 0) {
      setBatchMsg({ kind: "err", text: "กรุณาเลือกไฟล์รูปอย่างน้อย 1 รายการ" });
      return;
    }
    setBatchUploading(true);
    setBatchMsg(null);
    let okCount = 0;
    const fails: string[] = [];
    for (const p of targets) {
      const chosen = batchFiles[p.rawId];
      if (!chosen) continue;
      try {
        const fd = new FormData();
        fd.append("folder", "spares");
        fd.append("file", chosen.file);
        const upRes = await fetch("/api/v1/upload.php", {
          method: "POST",
          headers: { ...(getCsrfToken() ? { "X-CSRF-Token": getCsrfToken() as string } : {}) },
          body: fd,
        });
        const upJson = await upRes.json();
        if (!upJson.url) throw new Error(upJson.error || "อัปโหลดไม่สำเร็จ");
                const csrf = getCsrfToken();
        const putRes = await fetch(`/api/v1/spare_parts.php?id=${p.rawId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
          body: JSON.stringify({ image_url: upJson.url }),
        });
        const putJson = await putRes.json();
        if (!putJson.success && putJson.message !== "Updated") throw new Error("บันทึกไม่สำเร็จ");
        okCount++;
      } catch (e) {
        console.error(e);
        fails.push(p.code);
      }
    }
    setBatchUploading(false);
    if (fails.length === 0) {
      setBatchMsg({ kind: "ok", text: `อัปโหลดรูปสำเร็จ ${okCount} รายการ` });
      setBatchFiles({});
      setSelectedIds(new Set());
      setSelectMode(false);
      setBatchOpen(false);
      onRefresh();
      setTimeout(() => setBatchMsg(null), 4000);
    } else {
      setBatchMsg({ kind: "err", text: `สำเร็จ ${okCount} รายการ · ล้มเหลว: ${fails.join(", ")}` });
    }
  };

  const countForPagination = serverPaged ? (totalItems ?? filtered.length) : filtered.length;
  const pageCount = Math.max(1, Math.ceil(countForPagination / PAGE_SIZE));

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <Box size={16} strokeWidth={1.75} aria-hidden="true" />
            </div>
            <h3 className="m-0 text-base font-semibold text-foreground">รายการอะไหล่</h3>
            <Badge variant="neutral">{serverPaged ? (totalItems ?? filtered.length) : filtered.length} รายการ</Badge>
            {selectMode && (
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every((p) => selectedIds.has(p.rawId))}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 accent-[var(--cmms-primary)]"
                />
                {t("action.select_all_page")}
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectMode ? (
              <>
                <Button onClick={() => setBatchOpen(true)} disabled={selectedIds.size === 0 || batchUploading}>
                  <ImagePlus size={16} strokeWidth={1.75} aria-hidden="true" />
                  {selectedIds.size > 0 ? `อัปโหลดรูป (${selectedIds.size})` : "เลือกรายการก่อน..."}
                </Button>
                <Button variant="secondary" disabled={batchUploading} onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}>
                  ยกเลิก
                </Button>
              </>
                        ) : (
              <Button variant="secondary" onClick={() => setSelectMode(true)}>
                <ImagePlus size={16} strokeWidth={1.75} aria-hidden="true" />
                อัปโหลดรูปหลายรายการ
              </Button>
            )}
            <Button variant="secondary" onClick={onExportCsv} disabled={exportingCsv}>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              {exportingCsv ? "กำลังส่งออก..." : "ส่งออก CSV"}
            </Button>
            <Button variant="secondary" onClick={() => onEdit({} as SparePart)}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              เพิ่มรายการอะไหล่
            </Button>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัส CMMS, Sage 300 Item No, ชื่อ..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-[240px]">
            <Select
              value={sageTypeFilter || "__all__"}
              onValueChange={(v) => { setSageTypeFilter(v === "__all__" ? "" : v); setPage(1); }}
            >
              <SelectTrigger aria-label="ประเภทสต็อก Sage" className="w-full">
                <SelectValue placeholder="ทุกประเภทสต็อก Sage 300" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">ทุกประเภทสต็อก Sage 300</SelectItem>
                <SelectItem value="Spare Parts">อะไหล่ซ่อมบำรุง</SelectItem>
                <SelectItem value="Raw Materials">วัตถุดิบการผลิต</SelectItem>
                <SelectItem value="Consumables">วัสดุสิ้นเปลือง</SelectItem>
                <SelectItem value="Tools">เครื่องมือช่าง</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[210px]">
            <Select
              value={sort}
              onValueChange={(v) => { setSort(v); setPage(1); }}
            >
              <SelectTrigger aria-label="เรียงลำดับรายการอะไหล่" className="w-full">
                <SelectValue placeholder="เรียงลำดับ" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        {paged.length === 0 ? (
          <EmptyState
            icon={<Box size={24} strokeWidth={1.75} aria-hidden="true" />}
            title="ไม่พบข้อมูล"
            description="ไม่พบรายการอะไหล่ในคลัง (ลองปรับตัวกรอง)"
          />
        ) : (
          <div className="-mx-2 space-y-2">
            {paged.map((item) => {
              const status = getStockStatus(item);
              const badge = stockBadge[status];
              const thumb = partThumbSrc(item);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={selectMode ? () => toggleSelect(item.rawId) : () => onEdit(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) {
                      selectMode ? toggleSelect(item.rawId) : onEdit(item);
                    }
                  }}
                  className="flex cursor-pointer flex-wrap items-start justify-between gap-3 rounded-[10px] border border-border bg-card p-3 transition-colors duration-300 hover:bg-accent"
                >
                  {/* start */}
                  <div className="flex items-center gap-2">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.rawId)}
                        onChange={() => toggleSelect(item.rawId)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-[18px] w-[18px] accent-[var(--cmms-primary)]"
                        aria-label={`เลือก ${item.name}`}
                      />
                    )}
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={item.name} className="h-10 w-10 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                        <Box size={16} strokeWidth={1.75} aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  {/* middle */}
                  <div className="min-w-[200px] flex-1 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{item.code}</Badge>
                      <Badge variant="primary">{item.sageItemNo}</Badge>
                      <Badge variant="success">{item.sageCategory || "Spare Parts"}</Badge>
                      <Badge variant={badge.variant} dot>{badge.label}</Badge>
                    </div>
                                        <p className="text-xs text-muted-foreground">
                      ที่เก็บ: {item.location || "-"} ・ ราคา: ฿{item.price.toLocaleString()}/{item.unit}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      จอง: <span className="tabular-nums">{item.reserved || 0}</span> {item.unit} ・ ใช้ได้:{" "}
                      <span className="tabular-nums font-medium text-foreground">{getAvailable(item)}</span> {item.unit}
                      {getSuggestedReplenish(item) > 0 && (
                        <> ・ แนะนำเติม: <span className="tabular-nums font-medium text-[var(--cmms-warning-dark)]">{getSuggestedReplenish(item)}</span> {item.unit}</>
                      )}
                    </p>
                  </div>

                  {/* end */}
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="w-[140px] space-y-1">
                      <div className="flex items-baseline justify-end gap-1">
                        <span
                          className="text-base font-bold tabular-nums"
                          style={{
                            color:
                              status === "out"
                                ? "var(--cmms-danger)"
                                : status === "low"
                                  ? "var(--cmms-warning)"
                                  : "var(--cmms-success)",
                          }}
                        >
                          {item.stock}
                        </span>
                        <span className="text-xs text-muted-foreground">/ {item.maxStock} {item.unit}</span>
                      </div>
                      <MiniBar value={item.stock} max={item.maxStock} label={`สต็อก ${item.name}`} />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); onHistory(item); }}
                        aria-label="ประวัติเคลื่อนไหว"
                        title="ประวัติเคลื่อนไหว"
                      >
                        <History size={14} strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                        aria-label="แก้ไข"
                        title="แก้ไข"
                      >
                        <SquarePen size={14} strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                        aria-label="ลบ"
                        title="ลบ"
                      >
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pagination
          page={page}
          pageCount={pageCount}
          totalItems={serverPaged ? (totalItems ?? filtered.length) : filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="border-t-0 px-0 pt-2"
        />
      </CardContent>

      {/* Batch upload dialog */}
      <Dialog
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title={`อัปโหลดรูปอะไหล่ (${selectedParts.length} รายการ)`}
      >
        <div className="space-y-4">
          {batchMsg && (
            <Alert variant={batchMsg.kind === "ok" ? "success" : "danger"} title={batchMsg.kind === "ok" ? "สำเร็จ" : "มีข้อผิดพลาด"} description={batchMsg.text} />
          )}
          <p className="text-sm text-muted-foreground">
            เลือกไฟล์รูปให้แต่ละรายการ (png/jpg/gif/webp/svg สูงสุด 6 MB ต่อไฟล์) แล้วกดอัปโหลดทั้งหมด
          </p>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {selectedParts.map((p) => {
              const thumb = partThumbSrc(p);
              const chosen = batchFiles[p.rawId];
              return (
                <div key={p.rawId} className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border p-2.5">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={p.name} className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      <Box size={16} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-[160px] flex-1">
                    <p className="text-sm font-bold">{p.code}</p>
                    <p className="text-sm text-muted-foreground">{p.name}</p>
                  </div>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => pickFile(p.rawId, e.target.files?.[0] || null)}
                    />
                    <span className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-all duration-300 hover:opacity-90">
                      {chosen ? "เปลี่ยนรูป" : "เลือกไฟล์"}
                    </span>
                  </label>
                  {chosen && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={chosen.preview} alt="preview" className="h-10 w-10 rounded-md object-cover" />
                      <span className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {chosen.file.name}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="secondary" disabled={batchUploading} onClick={() => setBatchOpen(false)}>
              ยกเลิก
            </Button>
            <Button
              disabled={batchUploading || selectedParts.filter((p) => batchFiles[p.rawId]).length === 0}
              onClick={uploadBatch}
            >
              {batchUploading ? "กำลังอัปโหลด..." : "อัปโหลดทั้งหมด"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}


// ─── Main Page ───────────────────────────────────────────────────────────────
export default function SparePartsPage() {
  const hero = usePageHero("spare_parts");
  const router = useRouter();
    const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sageTypeFilter, setSageTypeFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  // อ่าน state จาก URL ครั้งแรก (แชร์ลิงก์/กดย้อนกลับ/รีเฟรชไม่หลุดบริบท) — ต้องรอให้อ่านก่อนค่อยยิง API
  const [urlReady, setUrlReady] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<SparePart | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const [historyTarget, setHistoryTarget] = useState<SparePart | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMeta, setHistoryMeta] = useState<{ unavailable?: boolean; reason?: string } | null>(null);

    const [syncingSage, setSyncingSage] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [error, setError] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);

  const isNarrow = useIsNarrow();
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [isPanelDialogOpen, setPanelDialogOpen] = useState(false);

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (hero เป็นส่วนหัวคงที่)
  const layout = usePageLayout("/spare_parts", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string): CSSProperties => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [totalItems, setTotalItems] = useState(0);
  const [serverPaged, setServerPaged] = useState(false);
  const [summary, setSummary] = useState<StockSummary | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchParts = async (opts?: { p?: number; q?: string; sage?: string; tab?: string; sortBy?: string }) => {
    setLoading(true);
    setError("");
    const p = opts?.p ?? page;
    const q = opts?.q ?? search;
    const sage = opts?.sage ?? sageTypeFilter;
    const tab = opts?.tab ?? activeTab;
    const orderBy = opts?.sortBy ?? sort;
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("page", String(p));
      if (q) params.set("q", q);
      if (sage) params.set("sage_category", sage);
      if (tab === "low" || tab === "out") params.set("stock_status", tab);
      if (orderBy && orderBy !== "newest") params.set("sort", orderBy);
      const res = await fetch(`/api/v1/spare_parts.php?${params.toString()}`);
      const json = await res.json();
      if (json && Array.isArray(json.items)) {
        setServerPaged(true);
        setTotalItems(Number(json.total || json.items.length));
        if (json.summary && typeof json.summary === "object") setSummary(json.summary);
        const fetched = json.items.map((row: any, i: number) => ({
          rawId: row.id,
          id: `sp-${row.id || i}`,
          code: row.code || row.part_code || `SP-${row.id || i}`,
          name: row.name || row.part_name || "ไม่ระบุ",
          category: row.category || "ทั่วไป",
                    sageCategory: row.sage_category || "Spare Parts",
          stock: Number(row.stock_qty || row.quantity || row.stock || 0),
          reserved: Number(row.reserved_qty || 0),
          minStock: Number(row.min_stock || row.reorder_point || 10),
          maxStock: Number(row.max_stock || 100),
          unit: row.unit || "pcs",
          location: row.location || "-",
          price: Number(row.unit_price || row.price || 0),
          sageItemNo: row.sage_item_no || row.sage_code || `IC-SP-${row.id || i}`,
          syncStatus: row.sage_sync_status || "synced",
          imageUrl: row.image_url || null,
        }));
        setParts(fetched);
      } else if (Array.isArray(json)) {
        setServerPaged(false);
        setSummary(null);
        setTotalItems(json.length);
        const fetched = json.map((row: any, i: number) => ({
          rawId: row.id,
          id: `sp-${row.id || i}`,
          code: row.code || row.part_code || `SP-${i}`,
          name: row.name || row.part_name || "ไม่ระบุ",
          category: row.category || "ทั่วไป",
          sageCategory: row.sage_category || "Spare Parts",
          stock: Number(row.stock_qty || row.quantity || row.stock || 0),
          reserved: Number(row.reserved_qty || 0),
          minStock: Number(row.min_stock || row.reorder_point || 10),
          maxStock: Number(row.max_stock || 100),
          unit: row.unit || "pcs",
          location: row.location || "-",
          price: Number(row.unit_price || row.price || 0),
          sageItemNo: row.sage_item_no || row.sage_code || `IC-SP-${row.id || i}`,
          syncStatus: row.sage_sync_status || "synced",
          imageUrl: row.image_url || null,
        }));
        setParts(fetched);
      }
    } catch (e) {
      console.error("Failed to fetch spare parts", e);
      setError("โหลดรายการอะไหล่ไม่สำเร็จ กรุณาลองใหม่");
    }
    setLoading(false);
  };

  // อ่าน state จาก query string (ใช้ทั้งตอนโหลดครั้งแรกและเมื่อกด Back/Forward)
  const applyUrlState = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    const q = params.get("q") ?? "";
    const sage = params.get("sage") ?? "";
    const sortParam = params.get("sort") ?? "";
    const pageParam = Number(params.get("page") ?? "1");
    setActiveTab(tab === "low" || tab === "out" || tab === "all" ? tab : "all");
    setSageTypeFilter(sage || "");
    setSort(SORT_OPTIONS.some((o) => o.value === sortParam) ? sortParam : "newest");
    setPage(Number.isFinite(pageParam) && pageParam > 1 ? Math.floor(pageParam) : 1);
    setSearchInput(q);
    setSearch(q.trim());
  }, []);

  // อ่านค่าเริ่มต้นจาก query string
  useEffect(() => {
    applyUrlState();
    setUrlReady(true);
  }, [applyUrlState]);

  // กด Back/Forward → ย้อน state ทีละขั้นตาม URL
  useEffect(() => {
    const onPopState = () => { applyUrlState(); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [applyUrlState]);

  // เขียน state กลับลง URL ด้วย router.push (สร้าง history entry → Back ย้อนได้ทีละขั้น)
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (activeTab !== "all") params.set("tab", activeTab);
    if (search) params.set("q", search);
    if (sageTypeFilter) params.set("sage", sageTypeFilter);
    if (sort !== "newest") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const target = window.location.pathname + (qs ? `?${qs}` : "");
    const current = window.location.pathname + window.location.search;
    if (target !== current) {
      router.push(target, { scroll: false });
    }
  }, [urlReady, activeTab, search, sageTypeFilter, sort, page, router]);

  useEffect(() => {
    if (!urlReady) return;
    fetchParts({ p: page, q: search, sage: sageTypeFilter, tab: activeTab, sortBy: sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlReady, page, search, sageTypeFilter, activeTab, sort]);

  // หลังลบ/เปลี่ยนตัวกรองแล้วหน้าปัจจุบันว่างแต่ยังมีข้อมูล → ถอยกลับหนึ่งหน้า
  useEffect(() => {
    if (!loading && serverPaged && parts.length === 0 && page > 1 && totalItems > 0) {
      setPage(page - 1);
    }
  }, [loading, serverPaged, parts.length, page, totalItems]);

    const handleExportCsv = async () => {
    setExportingCsv(true);
    setError("");
    try {
      const limit = 200;
      let p = 1;
      let expected = Infinity;
      const rows: any[] = [];
      while (rows.length < expected) {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        params.set("page", String(p));
        if (search) params.set("q", search);
        if (sageTypeFilter) params.set("sage_category", sageTypeFilter);
        if (activeTab === "low" || activeTab === "out") params.set("stock_status", activeTab);
        if (sort && sort !== "newest") params.set("sort", sort);
        const res = await fetch(`/api/v1/spare_parts.php?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
        if (expected === Infinity) expected = Number(json?.total ?? items.length);
        rows.push(...items);
        if (items.length === 0 || rows.length >= expected) break;
        p += 1;
      }
      const headers = [
        "รหัส", "ชื่อ", "Sage Item No", "ประเภท Sage", "หมวดหมู่",
        "สถานะสต็อก", "คงเหลือ", "จอง", "ใช้ได้", "ขั้นต่ำ", "สูงสุด", "แนะนำเติม", "หน่วย",
        "ที่เก็บ", "ราคาต่อหน่วย", "มูลค่าคงคลัง", "Sage Sync",
      ];
      const statusOf = (r: any) => {
        const stock = Number(r.stock_qty ?? r.quantity ?? r.stock ?? 0);
        const min = Number(r.min_stock ?? 0);
        return stock <= 0 ? "หมด" : stock <= min ? "ใกล้หมด" : "ปกติ";
      };
      const lines = rows.map((r) => {
        const stock = Number(r.stock_qty ?? r.quantity ?? r.stock ?? 0);
        const reserved = Number(r.reserved_qty ?? 0);
        const available = Math.max(0, stock - reserved);
        const min = Number(r.min_stock ?? 0);
        const max = Number(r.max_stock ?? 0);
        const price = Number(r.unit_price ?? r.price ?? 0);
        const suggest = stock <= min ? Math.max(0, max - stock) : 0;
        return [
          r.code || r.part_code || "",
          r.name || r.part_name || "",
          r.sage_item_no || r.sage_code || "",
          r.sage_category || "",
          r.category || "",
          statusOf(r),
          stock,
          reserved,
          available,
          min,
          max,
          suggest,
          r.unit || "",
          r.location || "",
          price,
          stock * price,
          r.sage_sync_status || "",
        ].map(csvCell).join(",");
      });
      const csv = "\uFEFF" + [headers.map(csvCell).join(","), ...lines].join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const tabLabel = activeTab === "low" ? "low" : activeTab === "out" ? "out" : "all";
      a.href = url;
      a.download = `spare_parts_${tabLabel}_${sort}_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (rows.length === 0) {
        setSyncNotice("ส่งออก CSV แล้ว (ไม่มีรายการตามตัวกรองที่เลือก)");
        setTimeout(() => setSyncNotice(""), 3000);
      }
    } catch (e) {
      console.error("Export CSV error", e);
      setError("ส่งออก CSV ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setExportingCsv(false);
    }
  };

  // Sync from Sage 300 ERP
  const handleSageSync = async () => {
    setSyncingSage(true);
    setSyncNotice("");
    setError("");
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/v1/sage_sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
        body: JSON.stringify({ category: sageTypeFilter || "all" }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setSyncNotice(json.message || "ซิงค์ข้อมูลจาก Sage เรียบร้อย");
        await fetchParts({ p: page, q: search, sage: sageTypeFilter, tab: activeTab, sortBy: sort });
        setTimeout(() => setSyncNotice(""), 4000);
      } else {
        setError(json?.message || json?.error || "ซิงค์ข้อมูลจาก Sage ไม่สำเร็จ");
      }
    } catch (e) {
      console.error("Sage 300 Sync error", e);
      setError("Sage 300 Sync error. Please check your connection.");
    } finally {
      setSyncingSage(false);
    }
  };

  const openHistory = async (item: SparePart) => {
    setHistoryTarget(item);
    setHistoryRows([]);
    setHistoryMeta(null);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/v1/spare_parts.php?id=${item.rawId}&history=1&limit=100`);
      const json = await res.json();
      if (Array.isArray(json?.items)) {
        setHistoryRows(json.items);
        setHistoryMeta({ unavailable: !!json.unavailable, reason: json.reason });
      } else {
        setHistoryRows([]);
        setHistoryMeta({ unavailable: true, reason: 'invalid_response' });
      }
    } catch (e) {
      console.error("Failed to fetch spare part history", e);
      setHistoryRows([]);
      setHistoryMeta({ unavailable: true, reason: 'fetch_failed' });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const csrf = getCsrfToken();
      const res = await fetch(`/api/v1/spare_parts.php?id=${deleteTarget.rawId}`, {
        method: "DELETE",
        headers: { ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
      });
      const json = await res.json();
      if (json.success || json.message === "Deleted") {
        setDeleteSuccess(true);
        await fetchParts({ p: page, q: search, sage: sageTypeFilter, tab: activeTab, sortBy: sort });
        setTimeout(() => {
          setDeleteSuccess(false);
          setDeleteTarget(null);
        }, 1200);
      } else {
        setError(json?.error || json?.message || "ลบรายการไม่สำเร็จ");
      }
    } catch (e) {
      console.error("Delete spare part error", e);
      setError("Failed to delete spare part.");
    } finally {
      setDeleting(false);
    }
  };

  // Tabs ควบคุม stockFilter: all → ทุกสถานะ, low/out → เฉพาะสถานะ (sub-pages เป็นลิงก์แยก)
  const handleTabChange = (value: string) => {
    if (value === "all" || value === "low" || value === "out") {
      setActiveTab(value);
      setPage(1);
    }
  };

  // Filter / KPIs (server-paged: API ส่ง summary และกรอง stock_status แล้ว)
  const filtered = useMemo(() => {
    if (serverPaged) return parts;
    return parts.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.sageItemNo.toLowerCase().includes(q);
      const matchSageType = !sageTypeFilter || p.sageCategory === sageTypeFilter;
      const matchStock = activeTab === "all" || getStockStatus(p) === activeTab;
      return matchSearch && matchSageType && matchStock;
    });
  }, [search, sageTypeFilter, activeTab, parts, serverPaged]);

  const kpis = useMemo(() => {
    if (summary) {
      return {
        total: Number(summary.total_items || 0),
        lowCount: Number(summary.low_count || 0),
        outCount: Number(summary.out_count || 0),
        totalValue: Number(summary.total_value || 0),
      };
    }
    const total = parts.length;
    const lowCount = parts.filter((p) => getStockStatus(p) === "low").length;
    const outCount = parts.filter((p) => getStockStatus(p) === "out").length;
    const totalValue = parts.reduce((sum, p) => sum + p.stock * p.price, 0);
    return { total, lowCount, outCount, totalValue };
  }, [parts, summary]);

  const isPanelShown = isNarrow ? isPanelDialogOpen : showSidePanel;
  const togglePanel = () =>
    isNarrow ? setPanelDialogOpen((prev) => !prev) : setShowSidePanel((prev) => !prev);

  const handleEdit = (item: SparePart) => {
    if (!item.rawId) {
      router.push("/spare_parts/create");
      return;
    }
    router.push(`/spare_parts/edit?id=${item.rawId}`);
  };

  const sageSyncButton = (
    <Button variant="secondary" onClick={handleSageSync} disabled={syncingSage}>
      <Database size={16} strokeWidth={1.75} aria-hidden="true" />
      {syncingSage ? "กำลังดึง..." : "ดึงสต็อกจาก Sage"}
    </Button>
  );
  const createButton = (
    <Button onClick={() => router.push("/spare_parts/create")}>
      <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      เพิ่มรายการ
    </Button>
  );

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">{hero.eyebrow}</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คลังอะไหล่", href: "/spare_parts" },
        { label: hero.title },
      ]}
      title={hero.title}
      description={hero.desc}
      actions={
        <>
          <Badge variant="primary">{kpis.total} รายการในคลัง</Badge>
          <Badge variant="neutral">แหล่งข้อมูล: Sage 300 (I/C)</Badge>
          {!isNarrow && sageSyncButton}
          {!isNarrow && createButton}
        </>
      }
    >
      {isNarrow && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sageSyncButton}
          {createButton}
        </div>
      )}

      {/* Tabs + quick links + panel toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="all">ทั้งหมด ({kpis.total})</TabsTrigger>
              <TabsTrigger value="low">ใกล้หมด ({kpis.lowCount})</TabsTrigger>
              <TabsTrigger value="out">หมดคลัง ({kpis.outCount})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal py-1.5 text-left sm:whitespace-nowrap" onClick={() => router.push("/spare_parts/sage_sync")}>
              ตั้งค่าการดึง Sage 300
            </Button>
            <Button variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal py-1.5 text-left sm:whitespace-nowrap" onClick={() => router.push("/spare_parts/issue_center")}>
              ศูนย์เบิก-จ่าย
            </Button>
            <Button variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal py-1.5 text-left sm:whitespace-nowrap" onClick={() => router.push("/spare_parts/optimization")}>
              AI คำนวณ EOQ และสต็อกค้าง
            </Button>
          </div>
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={togglePanel}
          aria-label={isPanelShown ? "Hide panel" : "Show panel"}
          title={isPanelShown ? "Hide panel" : "Show panel"}
        >
          <PanelRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>

      {/* Content + side panel */}
      <div className="flex w-full items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {error && (
            <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
          )}
          {syncNotice && (
            <Alert variant="success" title="สำเร็จ" description={syncNotice} />
          )}

          {/* KPI row */}
          <div style={layoutStyle("kpi")}>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
                    <Box size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm text-muted-foreground">รายการอะไหล่ทั้งหมด</p>
                    <p className="cmms-kpi-value tabular-nums">{kpis.total} <span className="text-sm font-normal">รายการ</span></p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
                    <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm text-muted-foreground">ใกล้หมด (Min Stock)</p>
                    <p className="cmms-kpi-value tabular-nums">{kpis.lowCount} <span className="text-sm font-normal">รายการ</span></p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
                    <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm text-muted-foreground">หมดคลัง (Out of Stock)</p>
                    <p className="cmms-kpi-value tabular-nums">{kpis.outCount} <span className="text-sm font-normal">รายการ</span></p>
                  </div>
                </div>
              </Card>
              <Card className="col-span-2 p-4 sm:col-span-1">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)] sm:h-12 sm:w-12">
                    <Banknote size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm text-muted-foreground">มูลค่าคลังรวม</p>
                    <p
                      className="cmms-kpi-value break-all tabular-nums leading-tight sm:break-normal"
                      style={{ fontSize: kpis.totalValue >= 9_000_000 ? "1.15rem" : kpis.totalValue >= 1_000_000 ? "1.35rem" : undefined }}
                    >
                      ฿{kpis.totalValue.toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          <div style={layoutStyle("content")}>
            {loading && parts.length === 0 ? (
              <Card>
                <CardContent className="space-y-3 p-6">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-[10px]" />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <ItemsCard
                parts={parts}
                filtered={filtered}
                search={searchInput}
                setSearch={setSearchInput}
                sageTypeFilter={sageTypeFilter}
                setSageTypeFilter={setSageTypeFilter}
                page={page}
                setPage={setPage}
                sort={sort}
                setSort={setSort}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                                onRefresh={() => fetchParts({ p: page, q: search, sage: sageTypeFilter, tab: activeTab, sortBy: sort })}
                onExportCsv={handleExportCsv}
                exportingCsv={exportingCsv}
                onHistory={openHistory}
                totalItems={totalItems}
                serverPaged={serverPaged}
              />
            )}
          </div>
        </div>

        {!isNarrow && showSidePanel && (
          <aside className="w-[320px] shrink-0" aria-label="สรุปคลังอะไหล่">
            <PanelContent parts={parts} summary={summary} />
          </aside>
        )}
      </div>

            {/* Mobile: side panel เป็น fullscreen dialog */}
      <Dialog
        open={isNarrow && isPanelDialogOpen}
        onClose={() => setPanelDialogOpen(false)}
        title="สรุปคลังอะไหล่"
      >
        <PanelContent parts={parts} summary={summary} />
      </Dialog>

      {/* Movement history dialog */}
      <Dialog
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        title={historyTarget ? `ประวัติเคลื่อนไหว: ${historyTarget.code} - ${historyTarget.name}` : "ประวัติเคลื่อนไหว"}
      >
        {historyTarget && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              ข้อมูลจาก ledger (<code>spare_part_transactions</code>) ตามที่บันทึกไว้จริง — หากยังไม่รวมจุดตัดสต็อกทุกทาง ประวัติอาจไม่ครบ (ดูข้อจำกัดในเอกสารออกแบบ)
            </p>
            {historyLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : historyMeta?.unavailable ? (
              <Alert variant="warning" title="ไม่สามารถอ่านประวัติได้" description="ตารางประวัติอาจยังไม่พร้อมในสภาพแวดล้อมนี้ หรืออ่านข้อมูลไม่สำเร็จ (N/A)" />
            ) : historyRows.length === 0 ? (
              <Alert variant="warning" title="ยังไม่มีประวัติการเคลื่อนไหว" description="ไม่พบรายการเคลื่อนไหวที่บันทึกไว้สำหรับอะไหล่รายการนี้ (อาจเป็นเพราะจุดตัดสต็อกบางส่วนยังไม่เขียน ledger)" />
            ) : (
              <div className="max-h-[60vh] overflow-auto rounded-[10px] border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">เวลา</th>
                      <th className="px-3 py-2 font-medium">ประเภท</th>
                      <th className="px-3 py-2 font-medium text-right">จำนวน</th>
                      <th className="px-3 py-2 font-medium text-right">ก่อน→หลัง</th>
                      <th className="px-3 py-2 font-medium">อ้างอิง/หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((r, idx) => {
                      const qty = r.quantity ?? r.qty ?? r.qty_change ?? r.qty_delta;
                      const before = r.qty_before ?? r.stock_before ?? r.quantity_before;
                      const after = r.qty_after ?? r.stock_after ?? r.quantity_after;
                      const ref = [r.reference_type || r.ref_type, r.reference_no || r.ref_no || r.reference_id || r.ref_id].filter(Boolean).join(" ");
                      const note = r.notes ?? r.note ?? r.reason ?? r.remark ?? "";
                      const when = r.created_at || r.movement_date || r.posted_at || r.date || "";
                      return (
                        <tr key={r.id ?? idx} className="border-b border-border last:border-b-0">
                          <td className="whitespace-nowrap px-3 py-2 align-top">{when ? String(when) : "-"}</td>
                          <td className="whitespace-nowrap px-3 py-2 align-top">{String(r.type || r.movement_type || r.tx_type || "-")}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{qty !== undefined && qty !== null ? String(qty) : "-"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">
                            {(before !== undefined && before !== null) || (after !== undefined && after !== null)
                              ? `${before ?? "?"} → ${after ?? "?"}`
                              : "-"}
                          </td>
                          <td className="px-3 py-2 align-top">{[ref, note].filter(Boolean).join(" · ") || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Delete Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="ยืนยันการลบรายการอะไหล่"
      >
        {deleteTarget && (
          <div className="space-y-4">
            {deleteSuccess ? (
              <p className="flex items-center gap-2 font-semibold text-[var(--cmms-success)]">
                <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
                ลบรายการอะไหล่สำเร็จแล้ว
              </p>
            ) : (
              <>
                <p className="text-sm text-foreground">
                  คุณแน่ใจหรือไม่ว่าต้องการลบรายการอะไหล่{" "}
                  <strong>
                    &quot;{deleteTarget.code} ({deleteTarget.sageItemNo}) - {deleteTarget.name}&quot;
                  </strong>{" "}
                  ออกจากระบบ?
                </p>
                <p className="text-sm text-muted-foreground">
                  การลบนี้จะทำการลบข้อมูลจาก MySQL Database และไม่สามารถย้อนคืนได้
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                    ยกเลิก
                  </Button>
                  <Button variant="danger" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "กำลังลบ..." : "ลบรายการ"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </PageShell>
  );
}

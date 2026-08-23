"use client";

// spare_parts — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Select, ui/Tabs, ui/Dialog,
// ui/Pagination, ui/Badge, Lucide, MiniBar progressbar)
// business logic ครบเดิม: batch image upload, Sage 300 sync, tab filter, side panel สรุปคลัง

import { useState, useEffect, useMemo, type CSSProperties } from "react";
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
  minStock: number;
  maxStock: number;
  unit: string;
  location: string;
  price: number;
  sageItemNo: string;
  syncStatus: string;
  imageUrl?: string | null;
}

function getStockStatus(item: SparePart): "ok" | "low" | "out" {
  if (item.stock === 0) return "out";
  if (item.stock <= item.minStock) return "low";
  return "ok";
}

const stockBadge: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  ok: { label: "ปกติ", variant: "success" },
  low: { label: "ใกล้หมด", variant: "warning" },
  out: { label: "หมด", variant: "danger" },
};

const PAGE_SIZE = 15;

function partThumbSrc(item: SparePart): string | undefined {
  const raw = item.imageUrl;
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/\\/g, "/");
  return cleaned.startsWith("data:") || cleaned.startsWith("/") || cleaned.startsWith("http")
    ? cleaned
    : "/" + cleaned;
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
function PanelContent({ parts }: { parts: SparePart[] }) {
  const kpis = useMemo(() => {
    const total = parts.length;
    const lowCount = parts.filter((p) => getStockStatus(p) === "low").length;
    const outCount = parts.filter((p) => getStockStatus(p) === "out").length;
    const totalValue = parts.reduce((sum, p) => sum + p.stock * p.price, 0);
    return { total, lowCount, outCount, totalValue };
  }, [parts]);

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
        <summary className="cursor-pointer text-sm font-semibold text-foreground">สถานะ Sage 300 Sync</summary>
        <div className="mt-3 space-y-1 text-sm">
          <p className="flex items-center gap-2">
            <Database size={16} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground" />
            เชื่อมต่อฐานข้อมูล Sage 300 ERP (I/C Inventory Control)
          </p>
          <p className="text-muted-foreground">
            กดปุ่ม &quot;Restock from Sage&quot; ที่หัวหน้ากระดานเพื่อดึงข้อมูลล่าสุด
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
  onEdit,
  onDelete,
  onRefresh,
}: {
  parts: SparePart[];
  filtered: SparePart[];
  search: string;
  setSearch: (v: string) => void;
  sageTypeFilter: string;
  setSageTypeFilter: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  onEdit: (item: SparePart) => void;
  onDelete: (item: SparePart) => void;
  onRefresh: () => void;
}) {
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
        const upRes = await fetch("/api/v1/upload.php", { method: "POST", body: fd });
        const upJson = await upRes.json();
        if (!upJson.url) throw new Error(upJson.error || "อัปโหลดไม่สำเร็จ");
        const putRes = await fetch(`/api/v1/spare_parts.php?id=${p.rawId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

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
            <Badge variant="neutral">{filtered.length} รายการ</Badge>
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
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-[240px]">
            <Select
              value={sageTypeFilter || "__all__"}
              onValueChange={(v) => setSageTypeFilter(v === "__all__" ? "" : v)}
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
          totalItems={filtered.length}
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
  const [search, setSearch] = useState("");
  const [sageTypeFilter, setSageTypeFilter] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<SparePart | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const [syncingSage, setSyncingSage] = useState(false);
  const [syncNotice, setSyncNotice] = useState("");
  const [error, setError] = useState("");

  const isNarrow = useIsNarrow();
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [isPanelDialogOpen, setPanelDialogOpen] = useState(false);

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (hero เป็นส่วนหัวคงที่)
  const layout = usePageLayout("/spare_parts", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string): CSSProperties => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const fetchParts = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/v1/spare_parts.php");
      const json = await res.json();
      if (Array.isArray(json)) {
        const fetched = json.map((row: any, i: number) => ({
          rawId: row.id,
          id: `sp-${row.id || i}`,
          code: row.code || row.part_code || `SP-${i}`,
          name: row.name || row.part_name || "ไม่ระบุ",
          category: row.category || "ทั่วไป",
          sageCategory: row.sage_category || "Spare Parts",
          stock: Number(row.stock_qty || row.quantity || row.stock || 0),
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
      setError("Failed to fetch spare parts. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchParts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync from Sage 300 ERP
  const handleSageSync = async () => {
    setSyncingSage(true);
    setSyncNotice("");
    setError("");
    try {
      const res = await fetch("/api/v1/sage_sync.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: sageTypeFilter || "all" }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setSyncNotice(json.message);
        await fetchParts();
        setTimeout(() => setSyncNotice(""), 4000);
      }
    } catch (e) {
      console.error("Sage 300 Sync error", e);
      setError("Sage 300 Sync error. Please check your connection.");
    } finally {
      setSyncingSage(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/spare_parts.php?id=${deleteTarget.rawId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success || json.message === "Deleted") {
        setParts((prev) => prev.filter((p) => p.rawId !== deleteTarget.rawId));
        setDeleteSuccess(true);
        setTimeout(() => {
          setDeleteSuccess(false);
          setDeleteTarget(null);
        }, 1500);
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

  // Filter
  const filtered = useMemo(() => {
    return parts.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.sageItemNo.toLowerCase().includes(q);
      const matchSageType = !sageTypeFilter || p.sageCategory === sageTypeFilter;
      const matchStock =
        activeTab === "all" || getStockStatus(p) === activeTab;
      return matchSearch && matchSageType && matchStock;
    });
  }, [search, sageTypeFilter, activeTab, parts]);

  const kpis = useMemo(() => {
    const total = parts.length;
    const lowCount = parts.filter((p) => getStockStatus(p) === "low").length;
    const outCount = parts.filter((p) => getStockStatus(p) === "out").length;
    const totalValue = parts.reduce((sum, p) => sum + p.stock * p.price, 0);
    return { total, lowCount, outCount, totalValue };
  }, [parts]);

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
          <Badge variant="success">ซิงค์สดกับ Sage 300</Badge>
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
            <Button variant="outline" size="sm" onClick={() => router.push("/spare_parts/sage_sync")}>
              ตั้งค่าการดึง Sage 300
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/spare_parts/issue_center")}>
              ศูนย์เบิก-จ่าย
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/spare_parts/optimization")}>
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
            <Alert variant="danger" title="Error" description={error} />
          )}
          {syncNotice && (
            <Alert variant="success" title="Success" description={syncNotice} />
          )}

          {/* KPI row */}
          <div style={layoutStyle("kpi")}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
                    <Box size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">รายการอะไหล่ทั้งหมด</p>
                    <p className="cmms-kpi-value tabular-nums">{kpis.total} <span className="text-sm font-normal">รายการ</span></p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
                    <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">ใกล้หมด (Min Stock)</p>
                    <p className="cmms-kpi-value tabular-nums">{kpis.lowCount} <span className="text-sm font-normal">รายการ</span></p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
                    <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">หมดคลัง (Out of Stock)</p>
                    <p className="cmms-kpi-value tabular-nums">{kpis.outCount} <span className="text-sm font-normal">รายการ</span></p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
                    <Banknote size={20} strokeWidth={1.75} aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">มูลค่าคลังรวม</p>
                    <p className="cmms-kpi-value tabular-nums">฿{kpis.totalValue.toLocaleString()}</p>
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
                search={search}
                setSearch={setSearch}
                sageTypeFilter={sageTypeFilter}
                setSageTypeFilter={setSageTypeFilter}
                page={page}
                setPage={setPage}
                onEdit={handleEdit}
                onDelete={setDeleteTarget}
                onRefresh={fetchParts}
              />
            )}
          </div>
        </div>

        {!isNarrow && showSidePanel && (
          <aside className="w-[320px] shrink-0" aria-label="สรุปคลังอะไหล่">
            <PanelContent parts={parts} />
          </aside>
        )}
      </div>

      {/* Mobile: side panel เป็น fullscreen dialog */}
      <Dialog
        open={isNarrow && isPanelDialogOpen}
        onClose={() => setPanelDialogOpen(false)}
        title="สรุปคลังอะไหล่"
      >
        <PanelContent parts={parts} />
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

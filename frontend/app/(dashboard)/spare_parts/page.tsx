"use client";

// spare_parts — สร้างตามโครงสร้าง Astryx "detail-page" template
// (Layout + LayoutHeader + TabList + Items list + Side Panel + mobile dialog)

import { useState, useEffect, useMemo } from "react";
import { usePageHero, t, statusText, priorityText } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import {
  Layout,
  LayoutContent,
  LayoutPanel,
  VStack,
  HStack,
  StackItem,
  Card,
  Section,
} from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TabList, Tab, TabMenu } from "@astryxdesign/core/TabList";
import { Divider } from "@astryxdesign/core/Divider";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Thumbnail } from "@astryxdesign/core/Thumbnail";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Pagination } from "@astryxdesign/core/Pagination";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  ArrowLeftIcon,
  ViewColumnsIcon,
  CircleStackIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  BanknotesIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import type { CSSProperties } from "react";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";

// ─── Styles (จาก template: bleed tab bar + list ไปจนถึงขอบ) ─────────────────
const tabsRow: CSSProperties = {
  marginInline: -12,
  marginBottom: -16,
  marginTop: 12,
};
const itemsList: CSSProperties = {
  marginInline: -8,
};

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

const stockBadge: Record<string, { label: string; andon: "ok" | "warn" | "down" }> = {
  ok: { label: "ปกติ", andon: "ok" },
  low: { label: "ใกล้หมด", andon: "warn" },
  out: { label: "หมด", andon: "down" },
};

const PAGE_SIZE = 15;

function Bullet() {
  return (
    <Text type="supporting" color="secondary">
      {"・"}
    </Text>
  );
}

function partThumbSrc(item: SparePart): string | undefined {
  const raw = item.imageUrl;
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/\\/g, "/");
  return cleaned.startsWith("data:") || cleaned.startsWith("/") || cleaned.startsWith("http")
    ? cleaned
    : "/" + cleaned;
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
    <VStack gap={4}>
      <Collapsible trigger={<Heading level={4}>สรุปคลัง</Heading>}>
        <MetadataList>
          <MetadataListItem label="รายการอะไหล่ทั้งหมด">
            <Text type="body" weight="bold">{kpis.total}</Text>
          </MetadataListItem>
          <MetadataListItem label="ใกล้หมด (Min Stock)">
            <HStack gap={2} vAlign="center">
              <AndonLamp status="warn" size="sm" />
              <Text type="body" weight="bold" style={{ color: "var(--cmms-warning)" }}>{kpis.lowCount}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="หมดคลัง (Out of Stock)">
            <HStack gap={2} vAlign="center">
              <AndonLamp status="down" size="sm" />
              <Text type="body" weight="bold" style={{ color: "var(--cmms-danger)" }}>{kpis.outCount}</Text>
            </HStack>
          </MetadataListItem>
          <MetadataListItem label="มูลค่าคลังรวม">
            <Text type="body" weight="bold">฿{kpis.totalValue.toLocaleString()}</Text>
          </MetadataListItem>
        </MetadataList>
      </Collapsible>

      <Divider />

      <Collapsible trigger={<Heading level={4}>ประเภทสต็อก (Sage 300)</Heading>}>
        <VStack gap={3}>
          {categories.slice(0, 6).map(([cat, count]) => (
            <VStack key={cat} gap={1}>
              <HStack vAlign="center">
                <StackItem size="fill">
                  <Text type="supporting" maxLines={1}>{cat}</Text>
                </StackItem>
                <Text type="supporting" color="secondary">{count} รายการ</Text>
              </HStack>
              <ProgressBar label={cat} isLabelHidden value={count} max={Math.max(...categories.map(([, c]) => c))} />
            </VStack>
          ))}
        </VStack>
      </Collapsible>

      <Divider />

      <Collapsible trigger={<Heading level={4}>สถานะ Sage 300 Sync</Heading>}>
        <VStack gap={1}>
          <HStack gap={2} vAlign="center">
            <CircleStackIcon className="w-4 h-4" style={{ color: "var(--cmms-text-secondary)" }} />
            <Text type="body">เชื่อมต่อฐานข้อมูล Sage 300 ERP (I/C Inventory Control)</Text>
          </HStack>
          <Text type="supporting" color="secondary">
            กดปุ่ม "Restock from Sage" ที่หัวหน้ากระดานเพื่อดึงข้อมูลล่าสุด
          </Text>
        </VStack>
      </Collapsible>
    </VStack>
  );
}

function RightPanel({ parts }: { parts: SparePart[] }) {
  return (
    <LayoutPanel width={320} padding={4} role="complementary">
      <PanelContent parts={parts} />
    </LayoutPanel>
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
  const isNarrow = useMediaQuery("(max-width: 1024px)");

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

  return (
    <Section>
      <VStack gap={4}>
        <HStack vAlign="center" gap={2} wrap="wrap">
          <StackItem size="fill">
            <HStack gap={2} vAlign="center">
              <div className="w-8 h-8 rounded-lg cmms-icon-tile">
                <CubeIcon className="w-4 h-4" />
              </div>
              <Heading level={3} className="cmms-kpi-value" style={{ margin: 0 }}>รายการอะไหล่</Heading>
              <span className="cmms-count-pill">{filtered.length} รายการ</span>
              {selectMode && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, color: "var(--cmms-text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && paged.every((p) => selectedIds.has(p.rawId))}
                    onChange={toggleSelectAll}
                    style={{ width: 16, height: 16, accentColor: "var(--cmms-primary)", cursor: "pointer" }}
                  />
                  {t("action.select_all_page")}
                </label>
              )}
            </HStack>
          </StackItem>
          <HStack gap={2}>
            {selectMode ? (
              <>
                <button
                  type="button"
                  onClick={() => setBatchOpen(true)}
                  disabled={selectedIds.size === 0 || batchUploading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--cmms-primary)] hover:opacity-90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <PhotoIcon className="w-4 h-4" />
                  {selectedIds.size > 0 ? `อัปโหลดรูป (${selectedIds.size})` : "เลือกรายการก่อน..."}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedIds(new Set());
                  }}
                  disabled={batchUploading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                >
                  ยกเลิก
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                <PhotoIcon className="w-4 h-4" />
                อัปโหลดรูปหลายรายการ
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit({} as SparePart)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              <PlusIcon className="w-4 h-4" />
              เพิ่มรายการอะไหล่
            </button>
          </HStack>
        </HStack>

        {/* Search + filter */}
        <HStack gap={2} wrap="wrap" vAlign="center">
          <StackItem size="fill">
            <TextInput
              label="ค้นหา"
              isLabelHidden
              placeholder="ค้นหารหัส CMMS, Sage 300 Item No, ชื่อ..."
              startIcon={MagnifyingGlassIcon}
              value={search}
              onChange={setSearch}
            />
          </StackItem>
          <Selector
            label="หมวดหมู่สต็อก Sage"
            isLabelHidden
            placeholder="ทุกประเภทสต็อก Sage 300"
            value={sageTypeFilter}
            onChange={setSageTypeFilter}
            options={[
              { value: "", label: "ทุกประเภทสต็อก Sage 300" },
              { value: "Spare Parts", label: "อะไหล่ซ่อมบำรุง" },
              { value: "Raw Materials", label: "วัตถุดิบการผลิต" },
              { value: "Consumables", label: "วัสดุสิ้นเปลือง" },
              { value: "Tools", label: "เครื่องมือช่าง" },
            ]}
          />
        </HStack>

        {paged.length === 0 ? (
          <EmptyState
            title="ไม่มีข้อมูล"
            description="ไม่พบรายการอะไหล่ในคลัง (ลองปรับตัวกรอง)"
            icon={<CubeIcon className="w-6 h-6" />}
          />
        ) : (
          <List density="spacious" hasDividers style={itemsList}>
            {paged.map((item) => {
              const status = getStockStatus(item);
              const badge = stockBadge[status];
              const thumb = partThumbSrc(item);
              return (
                <ListItem
                  key={item.id}
                  label={item.name}
                  description={
                    <VStack gap={0}>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>{item.code}</span>
                        <span className="cmms-andon-chip" style={{ background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }}>{item.sageItemNo}</span>
                        <span className="cmms-andon-chip" style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" }}>{item.sageCategory || "Spare Parts"}</span>
                        <span className={`cmms-status ${badge.andon}`}>
                          <span className="cmms-status-dot" />
                          {badge.label}
                        </span>
                      </HStack>
                      <HStack gap={1} vAlign="center">
                        <Text type="supporting" color="secondary">ที่เก็บ: {item.location || "-"}</Text>
                        <Bullet />
                        <Text type="supporting" color="secondary">ราคา: ฿{item.price.toLocaleString()}/{item.unit}</Text>
                      </HStack>
                    </VStack>
                  }
                  startContent={
                    <HStack gap={2} vAlign="center">
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.rawId)}
                          onChange={() => toggleSelect(item.rawId)}
                          style={{ width: 18, height: 18, accentColor: "var(--cmms-primary)", cursor: "pointer" }}
                        />
                      )}
                      {thumb ? (
                        <Thumbnail src={thumb} alt={item.name} label={item.name} />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 6,
                            backgroundColor: "var(--cmms-bg-muted)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--cmms-text-muted)",
                          }}
                        >
                          <CubeIcon className="w-4 h-4" />
                        </div>
                      )}
                    </HStack>
                  }
                  endContent={
                    <VStack gap={1} hAlign="end">
                      <VStack gap={0} hAlign="end">
                        <HStack gap={1} vAlign="center" hAlign="end">
                          <Text
                            type="body"
                            weight="bold"
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
                          </Text>
                          <Text type="supporting" color="secondary">/ {item.maxStock} {item.unit}</Text>
                        </HStack>
                        <ProgressBar label={item.name} isLabelHidden value={item.stock} max={item.maxStock} />
                      </VStack>
                      <HStack gap={1}>
                        <button
                          type="button"
                          onClick={() => onEdit(item)}
                          aria-label="แก้ไข"
                          title="แก้ไข"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                        >
                          <PencilSquareIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(item)}
                          aria-label="ลบ"
                          title="ลบ"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </HStack>
                    </VStack>
                  }
                  onClick={selectMode ? () => toggleSelect(item.rawId) : () => onEdit(item)}
                />
              );
            })}
          </List>
        )}

        {filtered.length > PAGE_SIZE && (
          <Pagination
            page={page}
            onChange={setPage}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            size={isNarrow ? "sm" : "md"}
          />
        )}
      </VStack>

      {/* Batch upload dialog */}
      <Dialog isOpen={batchOpen} onOpenChange={setBatchOpen}>
        <DialogHeader title={`อัปโหลดรูปอะไหล่ (${selectedParts.length} รายการ)`} onOpenChange={setBatchOpen} />
        <VStack gap={4} style={{ padding: 24 }}>
          {batchMsg && (
            <Banner
              status={batchMsg.kind === "ok" ? "success" : "error"}
              title={batchMsg.kind === "ok" ? "สำเร็จ" : "มีข้อผิดพลาด"}
              description={batchMsg.text}
              isDismissable={false}
            />
          )}
          <Text type="body" size="sm" color="secondary">
            เลือกไฟล์รูปให้แต่ละรายการ (png/jpg/gif/webp/svg สูงสุด 6 MB ต่อไฟล์) แล้วกดอัปโหลดทั้งหมด
          </Text>
          {selectedParts.map((p) => {
            const thumb = partThumbSrc(p);
            const chosen = batchFiles[p.rawId];
            return (
              <HStack key={p.rawId} gap={3} vAlign="center" wrap="wrap" style={{ padding: 10, border: "1px solid var(--cmms-border)", borderRadius: 10 }}>
                {thumb ? (
                  <Thumbnail src={thumb} alt={p.name} label={p.name} />
                ) : (
                  <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--cmms-bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--cmms-text-muted)" }}>
                    <CubeIcon className="w-4 h-4" />
                  </div>
                )}
                <VStack gap={0} style={{ flex: 1, minWidth: 160 }}>
                  <Text type="body" size="sm" weight="bold">{p.code}</Text>
                  <Text type="body" size="sm" color="secondary">{p.name}</Text>
                </VStack>
                <label style={{ cursor: "pointer" }}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                    style={{ display: "none" }}
                    onChange={(e) => pickFile(p.rawId, e.target.files?.[0] || null)}
                  />
                  <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-[var(--cmms-primary)] hover:opacity-90 transition-all duration-300">
                    {chosen ? "เปลี่ยนรูป" : "เลือกไฟล์"}
                  </span>
                </label>
                {chosen && (
                  <>
                    <img src={chosen.preview} alt="preview" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />
                    <Text type="body" size="sm" color="secondary" style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {chosen.file.name}
                    </Text>
                  </>
                )}
              </HStack>
            );
          })}
          <HStack hAlign="end" gap={2} style={{ paddingTop: 8, borderTop: "1px solid var(--cmms-border)" }}>
            <button
              type="button"
              disabled={batchUploading}
              onClick={() => setBatchOpen(false)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={batchUploading || selectedParts.filter((p) => batchFiles[p.rawId]).length === 0}
              onClick={uploadBatch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--cmms-primary)] hover:opacity-90 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {batchUploading ? "กำลังอัปโหลด..." : "อัปโหลดทั้งหมด"}
            </button>
          </HStack>
        </VStack>
      </Dialog>
    </Section>
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

  const isNarrow = useMediaQuery("(max-width: 1024px)");
  const [showSidePanel, setShowSidePanel] = useState(true);
  const [isPanelDialogOpen, setPanelDialogOpen] = useState(false);

  // Page Designer → จัดวาง Layout: เรียง/ซ่อน section ตาม config (hero เป็นส่วนหัวคงที่)
  const layout = usePageLayout("/spare_parts", ["hero", "kpi", "content"]);
  const layoutStyle = (id: string) => ({
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

  // TabList ควบคุม stockFilter: all → ทุกสถานะ, low/out → เฉพาะสถานะ
  const handleTabChange = (value: string) => {
    if (value === "all" || value === "low" || value === "out") {
      setActiveTab(value);
      setPage(1);
      return;
    }
    // TabMenu options → นำทางไปหน้า
    if (value === "sage_sync") router.push("/spare_parts/sage_sync");
    if (value === "optimization") router.push("/spare_parts/optimization");
    if (value === "issue_center") router.push("/spare_parts/issue_center");
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

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%", maxWidth: 1100, margin: "0 auto" }}>
        <div style={layoutStyle("hero")}>
          <div className="cmms-page-hero flex flex-col gap-5">
            <HStack gap={4} vAlign="start" wrap="wrap">
              <StackItem size="fill">
                <VStack gap={0}>
                  <Link href="/dashboard" style={{ color: "rgba(255,255,255,0.75)" }}>
                    <HStack gap={1} vAlign="center">
                      <ArrowLeftIcon className="w-4 h-4" />
                      แดชบอร์ดภาพรวม
                    </HStack>
                  </Link>
                  <VStack gap={1}>
                    <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</Text>
                    <Heading level={2} style={{ color: "#fff", marginTop: 4 }}>
                      {hero.title}
                    </Heading>
                    <HStack gap={2} vAlign="center" wrap="wrap">
                      <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
                        {kpis.total} รายการในคลัง
                      </span>
                      <span className="cmms-andon-chip" style={{ background: "var(--cmms-success-light)", color: "var(--cmms-success)" }}>
                        ซิงค์สดกับ Sage 300
                      </span>
                    </HStack>
                    <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
                      {hero.desc}
                    </Text>
                  </VStack>
                </VStack>
              </StackItem>
              {!isNarrow && (
                <HStack gap={3}>
                  <button
                    type="button"
                    onClick={handleSageSync}
                    disabled={syncingSage}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 disabled:opacity-60"
                  >
                    <CircleStackIcon className="w-4 h-4" />
                    {syncingSage ? "กำลังดึง..." : "ดึงสต็อกจาก Sage"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/spare_parts/create")}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
                  >
                    <PlusIcon className="w-4 h-4" />
                    เพิ่มรายการ
                  </button>
                </HStack>
              )}
            </HStack>

            {isNarrow && (
              <HStack gap={2}>
                <StackItem size="fill">
                  <VStack hAlign="stretch">
                    <button
                      type="button"
                      onClick={handleSageSync}
                      disabled={syncingSage}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300 disabled:opacity-60"
                    >
                      <CircleStackIcon className="w-4 h-4" />
                      {syncingSage ? "กำลังดึง..." : "ดึงสต็อกจาก Sage"}
                    </button>
                  </VStack>
                </StackItem>
                <StackItem size="fill">
                  <VStack hAlign="stretch">
                    <button
                      type="button"
                      onClick={() => router.push("/spare_parts/create")}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
                    >
                      <PlusIcon className="w-4 h-4" />
                      เพิ่มรายการ
                    </button>
                  </VStack>
                </StackItem>
              </HStack>
            )}

            <HStack vAlign="center" style={tabsRow} wrap="wrap">
              <StackItem size="fill">
                <TabList value={activeTab} onChange={handleTabChange} size="lg">
                  <Tab value="all" label={`ทั้งหมด (${kpis.total})`} />
                  <Tab value="low" label={`ใกล้หมด (${kpis.lowCount})`} />
                  <Tab value="out" label={`หมดคลัง (${kpis.outCount})`} />
                  <TabMenu
                    label="เพิ่มเติม"
                    options={[
                      { value: "sage_sync", label: "ตั้งค่าการดึง Sage 300" },
                      { value: "issue_center", label: "ศูนย์เบิก-จ่าย" },
                      { value: "optimization", label: "AI คำนวณ EOQ และสต็อกค้าง" },
                    ]}
                  />
                </TabList>
              </StackItem>
              <button
                type="button"
                onClick={togglePanel}
                aria-label={isPanelShown ? "Hide panel" : "Show panel"}
                title={isPanelShown ? "Hide panel" : "Show panel"}
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl text-white bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-300"
              >
                <ViewColumnsIcon className="w-4 h-4" />
              </button>
            </HStack>
          </div>
        </div>

        <div style={{ display: "flex", gap: 24, alignItems: "start", width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {error && (
              <Banner status="error" title="Error" description={error} isDismissable={false} />
            )}
            {syncNotice && (
              <Banner status="success" title="Success" description={syncNotice} isDismissable={false} />
            )}

            {/* KPI row */}
            <div style={layoutStyle("kpi")}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card padding={4} className="cmms-kpi-card blue">
                  <HStack gap={3} vAlign="center">
                    <div className="cmms-icon-tile">
                      <CubeIcon className="w-5 h-5" />
                    </div>
                    <VStack gap={1}>
                      <Text type="supporting" color="secondary">รายการอะไหล่ทั้งหมด</Text>
                      <Heading level={2} className="cmms-kpi-value" style={{ margin: 0 }}>{kpis.total} <span className="cmms-kpi-unit">รายการ</span></Heading>
                    </VStack>
                  </HStack>
                </Card>
                <Card padding={4} className="cmms-kpi-card amber">
                  <HStack gap={3} vAlign="center">
                    <div className="cmms-icon-tile cmms-icon-tile--amber">
                      <ExclamationTriangleIcon className="w-5 h-5" />
                    </div>
                    <VStack gap={1}>
                      <Text type="supporting" color="secondary">ใกล้หมด (Min Stock)</Text>
                      <Heading level={2} className="cmms-kpi-value" style={{ margin: 0 }}>{kpis.lowCount} <span className="cmms-kpi-unit">รายการ</span></Heading>
                    </VStack>
                  </HStack>
                </Card>
                <Card padding={4} className="cmms-kpi-card red">
                  <HStack gap={3} vAlign="center">
                    <div className="cmms-icon-tile cmms-icon-tile--red">
                      <ExclamationTriangleIcon className="w-5 h-5" />
                    </div>
                    <VStack gap={1}>
                      <Text type="supporting" color="secondary">หมดคลัง (Out of Stock)</Text>
                      <Heading level={2} className="cmms-kpi-value" style={{ margin: 0 }}>{kpis.outCount} <span className="cmms-kpi-unit">รายการ</span></Heading>
                    </VStack>
                  </HStack>
                </Card>
                <Card padding={4} className="cmms-kpi-card green">
                  <HStack gap={3} vAlign="center">
                    <div className="cmms-icon-tile cmms-icon-tile--green">
                      <BanknotesIcon className="w-5 h-5" />
                    </div>
                    <VStack gap={1}>
                      <Text type="supporting" color="secondary">มูลค่าคลังรวม</Text>
                      <Heading level={2} className="cmms-kpi-value" style={{ margin: 0 }}>฿{kpis.totalValue.toLocaleString()}</Heading>
                    </VStack>
                  </HStack>
                </Card>
              </div>
            </div>

            <div style={layoutStyle("content")}>
              {loading && parts.length === 0 ? (
                <Card elevation="low" padding={6}>
                  <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
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
            <div style={{ width: 320, flexShrink: 0 }}>
              <RightPanel parts={parts} />
            </div>
          )}
        </div>
      </div>

      {/* Mobile: side panel เป็น fullscreen dialog */}
      <Dialog
        variant="fullscreen"
        isOpen={isNarrow && isPanelDialogOpen}
        onOpenChange={setPanelDialogOpen}
      >
        <Layout
          header={
            <DialogHeader title="สรุปคลังอะไหล่" onOpenChange={setPanelDialogOpen} />
          }
          content={
            <LayoutContent padding={4}>
              <PanelContent parts={parts} />
            </LayoutContent>
          }
        />
      </Dialog>

      {/* Delete Dialog */}
      {deleteTarget && (
        <Dialog isOpen={true} onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)}>
          <DialogHeader title="ยืนยันการลบรายการอะไหล่" onOpenChange={(isOpen) => !isOpen && setDeleteTarget(null)} />
          <VStack gap={4} style={{ padding: 24 }}>
            {deleteSuccess ? (
              <HStack gap={2} vAlign="center" style={{ color: "var(--cmms-success)" }}>
                <CheckCircleIcon className="w-5 h-5" />
                <Text type="body" weight="bold">ลบรายการอะไหล่สำเร็จแล้ว</Text>
              </HStack>
            ) : (
              <>
                <Text type="body">
                  คุณแน่ใจหรือไม่ว่าต้องการลบรายการอะไหล่{" "}
                  <strong>
                    "{deleteTarget.code} ({deleteTarget.sageItemNo}) - {deleteTarget.name}"
                  </strong>{" "}
                  ออกจากระบบ?
                </Text>
                <Text type="body" size="sm" color="secondary">
                  การลบนี้จะทำการลบข้อมูลจาก MySQL Database และไม่สามารถย้อนคืนได้
                </Text>
                <HStack hAlign="end" gap={2} style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-danger"
                  >
                    {deleting ? "กำลังลบ..." : "ลบรายการ"}
                  </button>
                </HStack>
              </>
            )}
          </VStack>
        </Dialog>
      )}

    </>
  );
}

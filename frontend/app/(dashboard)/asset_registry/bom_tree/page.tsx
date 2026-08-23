"use client";

// asset_registry/bom_tree — migrate ui kit (PageShell, ui/Card, ui/Select, ui/Dialog, Badge, Lucide)
// business logic ครบเดิม: machine_bom.php CRUD, spare-parts index, side panel เลือกชิ้นส่วน

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ToastProvider";
import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Boxes,
  Cog,
  Box,
  ShoppingBag,
  Plus,
  CheckCircle2,
  Trash2,
  Building2,
  MapPin,
  Image as ImageIcon,
} from "lucide-react";

interface Machine {
  id: number;
  code: string;
  name: string;
  category?: string | null;
  location?: string | null;
  status?: string | null;
  image_path?: string | null;
}

interface BomPart {
  id: number;
  asset_id: number;
  spare_part_id: number;
  default_qty: number;
  remarks?: string | null;
  part_code?: string | null;
  part_name?: string | null;
  unit?: string | null;
  stock_qty?: number | null;
  image_url?: string | null;
  part_location?: string | null;
}

interface SparePart {
  id: number;
  code: string;
  name: string;
  unit?: string | null;
  stock_qty?: number | null;
  image_url?: string | null;
}

// แปลง path รูปให้เป็น URL ที่ใช้ได้ (เติม / หน้า path สัมพัทธ์)
function normalizeImage(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\\/g, "/");
  if (cleaned.startsWith("data:") || cleaned.startsWith("http") || cleaned.startsWith("/")) return cleaned;
  return "/" + cleaned;
}

// สถานะเครื่องจักร → Badge variant (docs/DESIGN_SYSTEM.md §2.3)
const statusBadgeVariant: Record<string, "success" | "neutral" | "warning"> = {
  active: "success",
  inactive: "neutral",
  disposed: "neutral",
  under_repair: "warning",
};

export default function BOMTreePage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [parts, setParts] = useState<BomPart[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [bomLoading, setBomLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal (เพิ่มชิ้นส่วน)
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSpareId, setSelectedSpareId] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partRemarks, setPartRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  // ลบพร้อมยืนยัน
  const [confirmDelete, setConfirmDelete] = useState<BomPart | null>(null);
  const [deleting, setDeleting] = useState(false);

  // รายละเอียดชิ้นส่วน (แพนขวา)
  const [selectedPart, setSelectedPart] = useState<BomPart | null>(null);

  const { showToast } = useToast();

  const loadBom = useCallback(async (assetId: number) => {
    setBomLoading(true);
    setParts([]);
    setSelectedPart(null);
    try {
      const res = await fetch(`/api/v1/machine_bom.php?asset_id=${assetId}`);
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setParts(json.data);
      }
    } catch (e) {
      console.error("Fetch BOM error", e);
    } finally {
      setBomLoading(false);
    }
  }, []);

  const selectMachine = useCallback((assetId: number) => {
    setSelectedAssetId(assetId);
    const m = machines.find((x) => x.id === assetId) || null;
    setMachine(m);
    loadBom(assetId);
  }, [machines, loadBom]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [assetRes, spareRes] = await Promise.all([
          fetch("/api/v1/asset_registry.php"),
          fetch("/api/v1/index.php?resource=spare-parts"),
        ]);
        const assetJson = await assetRes.json();
        const spareJson = await spareRes.json();

        if (!cancelled) {
          const list = Array.isArray(assetJson)
            ? assetJson.map((a: any) => ({
                id: Number(a.id),
                code: a.code || "",
                name: a.name || "",
                category: a.category || null,
                location: a.location || null,
                status: a.status || null,
                image_path: a.image_path || null,
              }))
            : [];
          setMachines(list);

          const sp = (spareJson as any)?.status === "success"
            ? (spareJson as any)?.data || []
            : Array.isArray(spareJson)
              ? spareJson
              : [];
          setSpareParts(sp.map((p: any) => ({
            id: Number(p.id),
            code: p.code || "",
            name: p.name || "",
            unit: p.unit || null,
            stock_qty: p.stock_qty != null ? Number(p.stock_qty) : null,
            image_url: p.image_url || null,
          })));

          if (list.length > 0) {
            selectMachine(list[0].id);
          }
        }
      } catch (e) {
        console.error("Fetch machines error", e);
        if (!cancelled) setError("ไม่สามารถโหลดข้อมูลเครื่องจักรได้ กรุณาลองใหม่อีกครั้ง");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMachineChange = (v: string) => {
    const id = Number(v);
    if (id) selectMachine(id);
  };

  const handleAddComponent = async () => {
    if (!selectedSpareId || selectedAssetId == null) return;
    setSaving(true);
    try {
      const part = spareParts.find((p) => String(p.id) === selectedSpareId);
      const res = await fetch("/api/v1/machine_bom.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: selectedAssetId,
          spare_part_id: Number(selectedSpareId),
          default_qty: Number(partQty) || 1,
          remarks: partRemarks || part?.name || "ชิ้นส่วนอะไหล่ประกอบ",
        }),
      });
      const json = await res.json();
      if (json.status === "success") {
        setSuccessMsg("เพิ่มชิ้นส่วนเข้าผัง BOM Tree สำเร็จแล้ว");
        await loadBom(selectedAssetId);
        setTimeout(() => {
          setSuccessMsg("");
          setModalOpen(false);
          setSelectedSpareId(spareParts[0] ? String(spareParts[0].id) : "");
          setPartQty("1");
          setPartRemarks("");
        }, 1100);
      } else {
        setError(json.error || "ไม่สามารถเพิ่มชิ้นส่วนได้");
      }
    } catch (e) {
      console.error("Add BOM part error", e);
      setError("เกิดข้อผิดพลาดในการเพิ่มชิ้นส่วน");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeletePart = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/machine_bom.php?id=${confirmDelete.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.status === "success" || json.success) {
        showToast("success", `ลบชิ้นส่วน ${confirmDelete.part_code || `#${confirmDelete.spare_part_id}`} ออกจาก BOM เรียบร้อยแล้ว`);
        if (selectedAssetId != null) await loadBom(selectedAssetId);
        setConfirmDelete(null);
      } else {
        setError(json.error || "ไม่สามารถลบชิ้นส่วนได้");
      }
    } catch (e) {
      console.error("Delete BOM error", e);
      setError("เกิดข้อผิดพลาดในการลบชิ้นส่วน");
    } finally {
      setDeleting(false);
    }
  };

  const selectedSpareObj = spareParts.find((p) => String(p.id) === selectedSpareId);

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">ASSET REGISTRY · CMMS-TOPPAN</p>}
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: "ผังโครงสร้างชิ้นส่วนอะไหล่ (BOM)" }]}
      title="ผังโครงสร้างชิ้นส่วนอะไหล่ (BOM)"
      description="ดูและจัดการชิ้นส่วน/อะไหล่ประกอบของแต่ละเครื่องจักร พร้อมจำนวนคงเหลือในคลัง"
      actions={
        <Button disabled={machines.length === 0} onClick={() => setModalOpen(true)}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          เพิ่มชิ้นส่วนเข้า BOM
        </Button>
      }
    >
      {error && (
        <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-16">
            <Spinner size={20} label="" />
            <span className="text-sm text-muted-foreground">กำลังโหลดข้อมูล...</span>
          </CardContent>
        </Card>
      ) : machines.length === 0 ? (
        <Card>
          <EmptyState
            title="ยังไม่มีเครื่องจักรในระบบ"
            description="เพิ่มเครื่องจักรที่ทะเบียนเครื่องจักรก่อน แล้วกลับมาสร้าง BOM Tree"
            icon={<Building2 size={24} strokeWidth={1.75} aria-hidden="true" />}
          />
        </Card>
      ) : (
        <>
          {/* เลือกเครื่องจักร + ข้อมูลเครื่อง */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-6 p-5">
              <div className="flex min-w-[320px] flex-1 items-center gap-3">
                <p className="whitespace-nowrap text-sm font-medium">เลือกเครื่องจักร:</p>
                <div className="flex-1">
                  <Select
                    value={selectedAssetId != null ? String(selectedAssetId) : undefined}
                    onValueChange={handleMachineChange}
                  >
                    <SelectTrigger aria-label="เลือกเครื่องจักร">
                      <SelectValue placeholder="เลือกเครื่องจักร..." />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {`${m.code}: ${m.name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {machine && (
                <div className="flex flex-wrap items-center gap-4">
                  {normalizeImage(machine.image_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={normalizeImage(machine.image_path)!}
                      alt={machine.name}
                      className="h-14 w-14 rounded-lg border border-border object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Building2 size={24} strokeWidth={1.75} aria-hidden="true" />
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{machine.code}</span>
                      <Badge variant={statusBadgeVariant[machine.status || ""] || "success"}>
                        {machine.status || "active"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{machine.name}</p>
                    <div className="flex flex-wrap gap-4">
                      {machine.category && <p className="text-xs text-muted-foreground">หมวด: {machine.category}</p>}
                      {machine.location && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={14} strokeWidth={1.75} aria-hidden="true" />
                          {machine.location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Grid columns={3} gap={6}>
            {/* แพนซ้าย: BOM tree */}
            <div style={{ gridColumn: "span 2" }}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>ชิ้นส่วนประกอบของ {machine?.code || "เครื่องจักร"}</CardTitle>
                  <Badge variant="neutral">{parts.length} ชิ้นส่วน</Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  {bomLoading ? (
                    <div className="flex justify-center py-10">
                      <Spinner size={20} label="" />
                    </div>
                  ) : parts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                      <Box size={24} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">ยังไม่มีชิ้นส่วนใน BOM ของเครื่องนี้ — กด &quot;เพิ่มชิ้นส่วนเข้า BOM&quot; เพื่อเริ่มต้น</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Root node: เครื่องจักร */}
                      <div className="flex items-center gap-3 rounded-lg border border-[var(--cmms-primary)] bg-accent px-4 py-3">
                        <Boxes size={20} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{machine?.code}</span>
                            <Badge variant="primary">เครื่องจักร</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{machine?.name}</p>
                        </div>
                      </div>

                      {parts.map((p) => {
                        const stock = Number(p.stock_qty || 0);
                        const qty = Number(p.default_qty || 1);
                        const low = stock < qty;
                        const img = normalizeImage(p.image_url);
                        return (
                          <div
                            key={`p-db-${p.id}`}
                            onClick={() => setSelectedPart(p)}
                            className={`ml-6 cursor-pointer rounded-lg border px-4 py-2.5 transition-colors duration-150 ${
                              selectedPart?.id === p.id ? "border-ring bg-accent" : "bg-card hover:bg-secondary/60"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                {img ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={img}
                                    alt={p.part_name || ""}
                                    className="h-11 w-11 shrink-0 rounded-md border border-border object-cover"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                    <ImageIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold">{p.part_code || `SP-${p.spare_part_id}`}</span>
                                    <Badge variant="neutral">ชิ้นส่วน</Badge>
                                  </div>
                                  <p className="truncate text-sm text-muted-foreground">
                                    {p.part_name || "ชิ้นส่วนอะไหล่"}
                                  </p>
                                  {p.remarks && (
                                    <p className="text-xs text-muted-foreground">หมายเหตุ: {p.remarks}</p>
                                  )}
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-3">
                                <div className="text-right">
                                  <p className="text-sm">ใช้ {qty} {p.unit || "ชิ้น"}</p>
                                  <p className={`text-sm font-semibold ${low ? "text-destructive" : "text-[var(--cmms-success)]"}`}>
                                    คงเหลือ {stock} {p.unit || "ชิ้น"}{low ? " " : ""}
                                  </p>
                                </div>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); window.location.href = `/spare_parts/issue_center?code=${encodeURIComponent(p.part_code || "")}`; }}
                                >
                                  <ShoppingBag size={14} strokeWidth={1.75} aria-hidden="true" />
                                  เบิก
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:bg-[var(--cmms-danger-light)] hover:text-[var(--cmms-danger-dark)]"
                                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}
                                >
                                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                                  ลบ
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* แพนขวา: รายละเอียดชิ้นส่วน */}
            <div>
              <Card className="h-full">
                <CardContent className="space-y-4 p-5">
                  {selectedPart ? (
                    <>
                      <h4 className="text-base font-semibold">รายละเอียดชิ้นส่วน</h4>
                      {normalizeImage(selectedPart.image_url) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={normalizeImage(selectedPart.image_url)!}
                          alt={selectedPart.part_name || ""}
                          className="max-h-[180px] w-full rounded-lg border border-border object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className="space-y-1">
                        <p className="font-semibold">{selectedPart.part_name || "ชิ้นส่วนอะไหล่"}</p>
                        <p className="text-sm text-muted-foreground">รหัส: {selectedPart.part_code || `SP-${selectedPart.spare_part_id}`}</p>
                      </div>
                      <dl className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-sm text-muted-foreground">จำนวนที่ใช้ประกอบ</dt>
                          <dd className="text-sm font-medium">{selectedPart.default_qty} {selectedPart.unit || "ชิ้น"}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-sm text-muted-foreground">คงเหลือในคลัง</dt>
                          <dd className={`text-sm font-medium ${Number(selectedPart.stock_qty || 0) < Number(selectedPart.default_qty || 1) ? "text-destructive" : "text-[var(--cmms-success)]"}`}>
                            {Number(selectedPart.stock_qty || 0)} {selectedPart.unit || "ชิ้น"}
                          </dd>
                        </div>
                        {selectedPart.part_location && (
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-sm text-muted-foreground">ตำแหน่งจัดเก็บ</dt>
                            <dd className="text-sm font-medium">{selectedPart.part_location}</dd>
                          </div>
                        )}
                        {selectedPart.remarks && (
                          <div className="flex items-center justify-between gap-2">
                            <dt className="text-sm text-muted-foreground">หมายเหตุ</dt>
                            <dd className="text-sm font-medium">{selectedPart.remarks}</dd>
                          </div>
                        )}
                      </dl>
                      <div className="flex items-center justify-between gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => window.location.href = `/spare_parts/issue_center?code=${encodeURIComponent(selectedPart.part_code || "")}`}
                        >
                          <ShoppingBag size={14} strokeWidth={1.75} aria-hidden="true" />
                          เบิกอะไหล่นี้
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-[var(--cmms-danger-light)] hover:text-[var(--cmms-danger-dark)]"
                          onClick={() => setConfirmDelete(selectedPart)}
                        >
                          <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                          ลบออกจาก BOM
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center opacity-60">
                      <Cog size={24} strokeWidth={1.75} aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">คลิกชิ้นส่วนเพื่อดูรายละเอียด</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </Grid>
        </>
      )}

      {/* Modal: เพิ่มชิ้นส่วน */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`เพิ่มชิ้นส่วนเข้า BOM: ${machine?.code || ""}`}
      >
        {successMsg ? (
          <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--cmms-success)" }}>
            <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
            {successMsg}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">เครื่องจักรเป้าหมาย:</p>
              <p className="text-sm">{machine?.code} — {machine?.name}</p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">เลือกรายการอะไหล่จากคลัง:</p>
              {selectedSpareObj && normalizeImage(selectedSpareObj.image_url) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={normalizeImage(selectedSpareObj.image_url)!}
                  alt={selectedSpareObj.name}
                  className="h-[72px] w-[72px] rounded-lg border border-border object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              )}
                  <Select
                    value={selectedSpareId}
                    onValueChange={(v) => setSelectedSpareId(String(v))}
                  >
                <SelectTrigger aria-label="รายการอะไหล่">
                  <SelectValue placeholder="เลือกรายการอะไหล่..." />
                </SelectTrigger>
                <SelectContent>
                  {spareParts.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {`${p.code} - ${p.name} (คงเหลือ: ${p.stock_qty ?? 0} ${p.unit || "ชิ้น"})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-sm font-medium">จำนวนที่ใช้ประกอบ:</p>
                <Input
                  label="จำนวน"
                  isLabelHidden
                  value={partQty}
                  onChange={(e) => setPartQty(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <p className="text-sm font-medium">หมายเหตุ / หน้าที่ของชิ้นส่วน:</p>
                <Input
                  label="หมายเหตุ"
                  isLabelHidden
                  placeholder="เช่น อะไหล่สำรองเปลี่ยนตามรอบ 500 ชม..."
                  value={partRemarks}
                  onChange={(e) => setPartRemarks(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                ยกเลิก
              </Button>
              <Button
                disabled={saving || !selectedSpareId}
                onClick={handleAddComponent}
              >
                {saving ? "กำลังบันทึก..." : "บันทึกเพิ่มชิ้นส่วน"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Dialog ยืนยันการลบ */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="ยืนยันการลบชิ้นส่วน"
      >
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm">
              ต้องการลบชิ้นส่วน <strong>{confirmDelete.part_name || "ชิ้นส่วนอะไหล่"}</strong> (รหัส {confirmDelete.part_code || `SP-${confirmDelete.spare_part_id}`}) ออกจาก BOM ของ {machine?.code || "เครื่องจักรนี้"} หรือไม่?
            </p>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                ยกเลิก
              </Button>
              <Button variant="danger" disabled={deleting} onClick={confirmDeletePart}>
                <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                {deleting ? "กำลังลบ..." : "ยืนยันลบ"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

    </PageShell>
  );
}


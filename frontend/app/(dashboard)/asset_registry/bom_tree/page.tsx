"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ToastProvider";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Banner } from "@astryxdesign/core/Banner";
import { 
  RectangleGroupIcon,
  CogIcon,
  CubeIcon,
  ShoppingBagIcon,
  PlusIcon,
  CheckCircleIcon,
  TrashIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";

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

const statusChipStyle: Record<string, React.CSSProperties> = {
  active: { background: "rgba(16,185,129,0.12)", color: "var(--cmms-success)" },
  inactive: { background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" },
  disposed: { background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" },
  under_repair: { background: "rgba(245,158,11,0.12)", color: "var(--cmms-warning)" },
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
    <VStack gap={6}>
      {error && (
        <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />
      )}

      {/* Header */}
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ASSET REGISTRY BOM TREE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>ผังโครงสร้างชิ้นส่วนอะไหล่ (BOM)</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <RectangleGroupIcon className="w-3.5 h-3.5" /> รายการชิ้นส่วนประกอบ
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            ดูและจัดการชิ้นส่วน/อะไหล่ประกอบของแต่ละเครื่องจักร พร้อมจำนวนคงเหลือในคลัง
          </Text>
        </VStack>
        <button
          type="button"
          disabled={machines.length === 0}
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          เพิ่มชิ้นส่วนเข้า BOM
        </button>
      </div>

      {loading ? (
        <HStack hAlign="center" vAlign="center" style={{ padding: 60 }}>
          <Spinner size="md" />
          <Text type="body" color="secondary">กำลังโหลดข้อมูล...</Text>
        </HStack>
      ) : machines.length === 0 ? (
        <EmptyState
          title="ยังไม่มีเครื่องจักรในระบบ"
          description="เพิ่มเครื่องจักรที่ทะเบียนเครื่องจักรก่อน แล้วกลับมาสร้าง BOM Tree"
          icon={<BuildingOffice2Icon className="w-6 h-6" />}
        />
      ) : (
        <>
          {/* เลือกเครื่องจักร + ข้อมูลเครื่อง */}
          <Card padding={4}>
            <HStack gap={6} vAlign="center" wrap="wrap">
              <HStack gap={3} vAlign="center" style={{ minWidth: 380, flex: 1 }}>
                <Text type="body" weight="semibold">เลือกเครื่องจักร:</Text>
                <div style={{ flex: 1 }}>
                  <Selector
                    label="เลือกเครื่องจักร"
                    isLabelHidden
                    options={machines.map((m) => ({
                      value: String(m.id),
                      label: `${m.code}: ${m.name}`,
                    }))}
                    value={selectedAssetId != null ? String(selectedAssetId) : ""}
                    onChange={handleMachineChange}
                  />
                </div>
              </HStack>
              {machine && (
                <HStack gap={4} vAlign="center">
                  {normalizeImage(machine.image_path) ? (
                    <img
                      src={normalizeImage(machine.image_path)!}
                      alt={machine.name}
                      style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid var(--color-border)" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-muted)" }}>
                      <BuildingOffice2Icon className="w-6 h-6" style={{ color: "var(--color-text-secondary)" }} />
                    </div>
                  )}
                  <VStack gap={1}>
                    <HStack gap={2} vAlign="center">
                      <Text type="body" weight="bold">{machine.code}</Text>
                      <span className="cmms-andon-chip" style={statusChipStyle[machine.status || ""] || statusChipStyle.active}>
                        {machine.status || "active"}
                      </span>
                    </HStack>
                    <Text type="body" size="sm" color="secondary">{machine.name}</Text>
                    <HStack gap={4}>
                      {machine.category && <Text type="body" size="sm" color="secondary">หมวด: {machine.category}</Text>}
                      {machine.location && (
                        <HStack gap={1} vAlign="center">
                          <MapPinIcon className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                          <Text type="body" size="sm" color="secondary">{machine.location}</Text>
                        </HStack>
                      )}
                    </HStack>
                  </VStack>
                </HStack>
              )}
            </HStack>
          </Card>

          <Grid columns={3} gap={6}>
            {/* แพนซ้าย: BOM tree */}
            <div style={{ gridColumn: "span 2" }}>
              <Card padding={5}>
                <VStack gap={4}>
                  <HStack hAlign="between" vAlign="center" style={{ paddingBottom: 12, borderBottom: "1px solid var(--color-border)" }}>
                    <Heading level={4}>ชิ้นส่วนประกอบของ {machine?.code || "เครื่องจักร"}</Heading>
                    <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" }}>{parts.length} ชิ้นส่วน</span>
                  </HStack>

                  {bomLoading ? (
                    <HStack hAlign="center" style={{ padding: 40 }}>
                      <Spinner size="md" />
                    </HStack>
                  ) : parts.length === 0 ? (
                    <VStack gap={3} hAlign="center" vAlign="center" style={{ padding: 40 }}>
                      <CubeIcon className="w-6 h-6" style={{ color: "var(--color-text-secondary)" }} />
                      <Text type="body" color="secondary">ยังไม่มีชิ้นส่วนใน BOM ของเครื่องนี้ — กด "เพิ่มชิ้นส่วนเข้า BOM" เพื่อเริ่มต้น</Text>
                    </VStack>
                  ) : (
                    <VStack gap={3}>
                      {/* Root node: เครื่องจักร */}
                      <div style={{ padding: "12px 16px", borderRadius: 8, border: "1px solid var(--color-primary)", backgroundColor: "var(--color-accent-wash)" }}>
                        <HStack gap={3} vAlign="center">
                          <RectangleGroupIcon className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
                          <VStack gap={0}>
                            <HStack gap={2} vAlign="center">
                              <Text type="body" weight="bold">{machine?.code}</Text>
                              <span className="cmms-andon-chip" style={{ background: "rgba(30,136,229,0.12)", color: "var(--cmms-primary)" }}>เครื่องจักร</span>
                            </HStack>
                            <Text type="body" size="sm" color="secondary">{machine?.name}</Text>
                          </VStack>
                        </HStack>
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
                            style={{
                              marginLeft: 24,
                              padding: "10px 16px",
                              borderRadius: 8,
                              border: "1px solid var(--color-border)",
                              backgroundColor: selectedPart?.id === p.id ? "var(--color-accent-wash)" : "var(--color-surface)",
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            <HStack hAlign="between" vAlign="center" gap={3}>
                              <HStack gap={3} vAlign="center" style={{ flex: 1, minWidth: 0 }}>
                                {img ? (
                                  <img
                                    src={img}
                                    alt={p.part_name || ""}
                                    style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", border: "1px solid var(--color-border)", flexShrink: 0 }}
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                  />
                                ) : (
                                  <div style={{ width: 44, height: 44, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-muted)", flexShrink: 0 }}>
                                    <PhotoIcon className="w-5 h-5" style={{ color: "var(--color-text-secondary)" }} />
                                  </div>
                                )}
                                <VStack gap={0} style={{ minWidth: 0 }}>
                                  <HStack gap={2} vAlign="center">
                                    <Text type="body" weight="bold">{p.part_code || `SP-${p.spare_part_id}`}</Text>
                                    <span className="cmms-andon-chip" style={{ background: "rgba(100,116,139,0.12)", color: "var(--cmms-text-muted)" }}>ชิ้นส่วน</span>
                                  </HStack>
                                  <Text type="body" size="sm" color="secondary" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {p.part_name || "ชิ้นส่วนอะไหล่"}
                                  </Text>
                                  {p.remarks && (
                                    <Text type="body" size="sm" color="secondary">หมายเหตุ: {p.remarks}</Text>
                                  )}
                                </VStack>
                              </HStack>

                              <HStack gap={3} vAlign="center" style={{ flexShrink: 0 }}>
                                <VStack gap={0} style={{ textAlign: "right" }}>
                                  <Text type="body" size="sm">ใช้ {qty} {p.unit || "ชิ้น"}</Text>
                                  <Text type="body" size="sm" style={{ color: low ? "var(--color-error)" : "var(--color-success)", fontWeight: 600 }}>
                                    คงเหลือ {stock} {p.unit || "ชิ้น"}{low ? " " : ""}
                                  </Text>
                                </VStack>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); window.location.href = `/spare_parts/issue_center?code=${encodeURIComponent(p.part_code || "")}`; }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                                >
                                  <ShoppingBagIcon className="w-3.5 h-3.5" />
                                  เบิก
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                                >
                                  <TrashIcon className="w-3.5 h-3.5" />
                                  ลบ
                                </button>
                              </HStack>
                            </HStack>
                          </div>
                        );
                      })}
                    </VStack>
                  )}
                </VStack>
              </Card>
            </div>

            {/* แพนขวา: รายละเอียดชิ้นส่วน */}
            <div>
              <Card padding={5} style={{ height: "100%" }}>
                {selectedPart ? (
                  <VStack gap={4}>
                    <Heading level={5}>รายละเอียดชิ้นส่วน</Heading>
                    {normalizeImage(selectedPart.image_url) && (
                      <img
                        src={normalizeImage(selectedPart.image_url)!}
                        alt={selectedPart.part_name || ""}
                        style={{ width: "100%", maxHeight: 180, borderRadius: 8, objectFit: "cover", border: "1px solid var(--color-border)" }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <VStack gap={1}>
                      <Text type="body" weight="bold">{selectedPart.part_name || "ชิ้นส่วนอะไหล่"}</Text>
                      <Text type="body" size="sm" color="secondary">รหัส: {selectedPart.part_code || `SP-${selectedPart.spare_part_id}`}</Text>
                    </VStack>
                    <VStack gap={2}>
                      <HStack hAlign="between"><Text type="body" size="sm" color="secondary">จำนวนที่ใช้ประกอบ</Text><Text type="body" size="sm" weight="semibold">{selectedPart.default_qty} {selectedPart.unit || "ชิ้น"}</Text></HStack>
                      <HStack hAlign="between"><Text type="body" size="sm" color="secondary">คงเหลือในคลัง</Text><Text type="body" size="sm" weight="semibold" style={{ color: Number(selectedPart.stock_qty || 0) < Number(selectedPart.default_qty || 1) ? "var(--color-error)" : "var(--color-success)" }}>{Number(selectedPart.stock_qty || 0)} {selectedPart.unit || "ชิ้น"}</Text></HStack>
                      {selectedPart.part_location && <HStack hAlign="between"><Text type="body" size="sm" color="secondary">ตำแหน่งจัดเก็บ</Text><Text type="body" size="sm" weight="semibold">{selectedPart.part_location}</Text></HStack>}
                      {selectedPart.remarks && <HStack hAlign="between"><Text type="body" size="sm" color="secondary">หมายเหตุ</Text><Text type="body" size="sm" weight="semibold">{selectedPart.remarks}</Text></HStack>}
                    </VStack>
                    <HStack hAlign="between" gap={2}>
                      <button
                        type="button"
                        onClick={() => window.location.href = `/spare_parts/issue_center?code=${encodeURIComponent(selectedPart.part_code || "")}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white cmms-btn-primary"
                      >
                        <ShoppingBagIcon className="w-3.5 h-3.5" />
                        เบิกอะไหล่นี้
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(selectedPart)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-all duration-300"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                        ลบออกจาก BOM
                      </button>
                    </HStack>
                  </VStack>
                ) : (
                  <VStack gap={3} hAlign="center" vAlign="center" style={{ padding: 30, opacity: 0.6 }}>
                    <CogIcon className="w-6 h-6" />
                    <Text type="body" color="secondary">คลิกชิ้นส่วนเพื่อดูรายละเอียด</Text>
                  </VStack>
                )}
              </Card>
            </div>
          </Grid>
        </>
      )}

      {/* Modal: เพิ่มชิ้นส่วน */}
      {modalOpen && (
        <Dialog isOpen={modalOpen} onOpenChange={(open) => { if (!open) setModalOpen(false); }}>
          <DialogHeader title={`เพิ่มชิ้นส่วนเข้า BOM: ${machine?.code || ""}`} onOpenChange={(open) => { if (!open) setModalOpen(false); }} />
          <VStack gap={4} style={{ padding: 24 }}>
            {successMsg ? (
              <HStack gap={2} vAlign="center" style={{ color: "var(--cmms-success)" }}>
                <CheckCircleIcon className="w-5 h-5" />
                <Text type="body" weight="bold">{successMsg}</Text>
              </HStack>
            ) : (
              <>
                <VStack gap={3}>
                  <VStack gap={1}>
                    <Text type="body" size="sm" weight="semibold">เครื่องจักรเป้าหมาย:</Text>
                    <Text type="body" size="sm">{machine?.code} — {machine?.name}</Text>
                  </VStack>

                  <VStack gap={1}>
                    <Text type="body" size="sm" weight="semibold">เลือกรายการอะไหล่จากคลัง:</Text>
                    {selectedSpareObj && normalizeImage(selectedSpareObj.image_url) && (
                      <img
                        src={normalizeImage(selectedSpareObj.image_url)!}
                        alt={selectedSpareObj.name}
                        style={{ width: 72, height: 72, borderRadius: 8, objectFit: "cover", border: "1px solid var(--color-border)" }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <Selector
                      label="รายการอะไหล่"
                      isLabelHidden
                      value={selectedSpareId}
                      onChange={(v) => setSelectedSpareId(String(v))}
                      options={spareParts.map((p) => ({
                        value: String(p.id),
                        label: `${p.code} - ${p.name} (คงเหลือ: ${p.stock_qty ?? 0} ${p.unit || "ชิ้น"})`,
                      }))}
                    />
                  </VStack>

                  <HStack gap={3}>
                    <VStack gap={1} style={{ flex: 1 }}>
                      <Text type="body" size="sm" weight="semibold">จำนวนที่ใช้ประกอบ:</Text>
                      <TextInput
                        label="จำนวน"
                        isLabelHidden
                        value={partQty}
                        onChange={setPartQty}
                      />
                    </VStack>

                    <VStack gap={1} style={{ flex: 1 }}>
                      <Text type="body" size="sm" weight="semibold">หมายเหตุ / หน้าที่ของชิ้นส่วน:</Text>
                      <TextInput
                        label="หมายเหตุ"
                        isLabelHidden
                        placeholder="เช่น อะไหล่สำรองเปลี่ยนตามรอบ 500 ชม..."
                        value={partRemarks}
                        onChange={setPartRemarks}
                      />
                    </VStack>
                  </HStack>
                </VStack>

                <HStack hAlign="end" gap={2} style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={saving || !selectedSpareId}
                    onClick={handleAddComponent}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
                  >
                    {saving ? "กำลังบันทึก..." : "บันทึกเพิ่มชิ้นส่วน"}
                  </button>
                </HStack>
              </>
            )}
          </VStack>
        </Dialog>
      )}

      {/* Dialog ยืนยันการลบ */}
      {confirmDelete && (
        <Dialog isOpen={!!confirmDelete} onOpenChange={(open) => { if (!open) setConfirmDelete(null); }}>
          <DialogHeader title="ยืนยันการลบชิ้นส่วน" onOpenChange={(open) => { if (!open) setConfirmDelete(null); }} />
          <VStack gap={4} style={{ padding: 24 }}>
            <Text type="body">
              ต้องการลบชิ้นส่วน <strong>{confirmDelete.part_name || "ชิ้นส่วนอะไหล่"}</strong> (รหัส {confirmDelete.part_code || `SP-${confirmDelete.spare_part_id}`}) ออกจาก BOM ของ {machine?.code || "เครื่องจักรนี้"} หรือไม่?
            </Text>
            <HStack hAlign="end" gap={2}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDeletePart}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-danger"
              >
                <TrashIcon className="w-4 h-4" />
                {deleting ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
            </HStack>
          </VStack>
        </Dialog>
      )}

    </VStack>
  );
}

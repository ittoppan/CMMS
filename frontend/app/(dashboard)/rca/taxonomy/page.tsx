"use client";

import { useEffect, useState, useCallback } from "react";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ToastProvider";
import { Plus, Layers, Tags, ListTree, Boxes, Trash2, Pencil } from "lucide-react";
import { Taxonomy, TaxonomyType, fetchTaxonomy, rcaPost } from "@/lib/rca";

type Kind = "failure_types" | "failure_modes" | "failure_causes" | "root_cause_categories";
const KIND_META: Record<Kind, { label: string; icon: React.ElementType; codePrefix: string; desc: string; api: string }> = {
  failure_types: { label: "Failure Type (ประเภทความเสียหาย)", icon: Layers, codePrefix: "FT", desc: "หมวดใหญ่ของความเสียหาย เช่น ไฟฟ้า กลไก", api: "failure_type" },
  failure_modes: { label: "Failure Mode (โหมดความเสียหาย)", icon: ListTree, codePrefix: "FM", desc: "ลักษณะอาการที่เห็น เช่น ไหม้ แตก หลวม", api: "failure_mode" },
  failure_causes: { label: "Failure Cause (สาเหตุโดยตรง)", icon: Tags, codePrefix: "FC", desc: "สาเหตุใกล้เคียง เช่น หล่อลื่นไม่เพียงพอ", api: "failure_cause" },
  root_cause_categories: { label: "Root Cause Category (หมวดสาเหตุราก)", icon: Boxes, codePrefix: "RC", desc: "กลุ่มสาเหตุราก เช่น design / man / method", api: "root_cause" },
};

export default function RcaTaxonomyPage() {
  const hero = usePageHero("rca/taxonomy");
  const { showToast } = useToast();
  const [tax, setTax] = useState<Taxonomy | null>(null);
  const [canTax, setCanTax] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<Kind>("failure_types");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<TaxonomyType | null>(null);
  // form state
  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fComp, setFComp] = useState("");
  const [fTypeId, setFTypeId] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetchTaxonomy();
      setTax(r.taxonomy);
      setCanTax(r.can_taxonomy);
    } catch (e: any) {
      setError(e?.message || "โหลด Taxonomies ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = tax ? (tax[kind] ?? []) : [];

  const openCreate = (k: Kind) => {
    setKind(k); setEdit(null); setFCode(""); setFName(""); setFDesc(""); setFComp(""); setFTypeId("0"); setOpen(true);
  };
  const openEdit = (k: Kind, it: TaxonomyType) => {
    setKind(k); setEdit(it);
    setFCode(it.code); setFName(it.name); setFDesc(it.description ?? ""); setFComp(it.component ?? ""); setFTypeId(String(it.failure_type_id ?? 0)); setOpen(true);
  };

  const save = async () => {
    if (!fName.trim()) { showToast("error", "ต้องระบุชื่อรายการ"); return; }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        action: "taxonomy_save",
        kind: KIND_META[kind].api, id: edit?.id ?? 0, code: fCode.trim(), name: fName.trim(),
        description: fDesc.trim(), component: fComp.trim(),
      };
      if (kind === "failure_modes") payload.failure_type_id = Number(fTypeId) || 0;
      await rcaPost<{ success: boolean }>(payload);
      showToast("success", edit ? "อัปเดต Taxonomies สำเร็จ" : "เพิ่ม Taxonomies สำเร็จ");
      setOpen(false);
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "บันทึก Taxonomies ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (k: Kind, it: TaxonomyType) => {
    if (!confirm(`ปิดใช้งาน "${it.name}"?`)) return;
    setBusy(true);
    try {
      await rcaPost<{ success: boolean }>({ action: "taxonomy_deactivate", kind: KIND_META[k].api, id: it.id });
      showToast("success", "ปิดใช้งาน Taxonomies สำเร็จ");
      await load();
    } catch (e: any) {
      showToast("error", e?.message || "ปิดใช้งานไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            {canTax && <Badge variant="primary" dot>แก้ไขได้</Badge>}
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
      </div>

      {!canTax && !loading && (
        <Alert variant="info" title="สิทธิ์อ่านอย่างเดียว" description="คุณมีสิทธิ์ดู Taxonomies ได้อย่างเดียว — ต้องมีสิทธิ์จัดการเพื่อเพิ่ม/แก้ไขรายการ" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {(Object.keys(KIND_META) as Kind[]).map((k) => {
          const meta = KIND_META[k];
          const list = tax ? (tax[k] ?? []) : [];
          const active = list.filter((x) => x.is_active);
          return (
            <Card key={k}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <meta.icon size={17} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
                    {meta.label}
                  </CardTitle>
                  <CardDescription>{meta.desc}</CardDescription>
                </div>
                {canTax && (
                  <Button variant="secondary" size="sm" onClick={() => openCreate(k)} disabled={busy}>
                    <Plus size={14} aria-hidden="true" /> เพิ่ม
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pb-3">
                {loading ? (
                  <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
                ) : list.length === 0 ? (
                  <EmptyState icon={<meta.icon size={36} />} title="ยังไม่มีรายการ" description="กดเพิ่มเพื่อสร้างรายการแรก" />
                ) : (
                  <ul className="space-y-2">
                    {list.map((it) => (
                      <li key={it.id} className={`flex items-center justify-between gap-2 rounded-lg border border-[var(--cmms-border)] px-3 py-2 ${it.is_active ? "bg-[var(--cmms-bg)]" : "bg-[var(--cmms-bg-muted)] opacity-60"}`}>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--cmms-text-primary)]">
                            <span className="font-mono text-xs text-[var(--cmms-text-secondary)]">{it.code}</span>
                            {it.name}
                            {!it.is_active && <Badge variant="neutral">ปิดอยู่</Badge>}
                          </p>
                          <p className="truncate text-xs text-[var(--cmms-text-secondary)]">
                            {it.description ?? "—"}
                            {it.component ? ` · ${it.component}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {canTax && it.is_active && (
                            <>
                              <Button variant="ghost" size="icon-xs" onClick={() => openEdit(k, it)} disabled={busy} aria-label="แก้ไข">
                                <Pencil size={14} aria-hidden="true" />
                              </Button>
                              <Button variant="ghost" size="icon-xs" onClick={() => deactivate(k, it)} disabled={busy} aria-label="ปิดใช้งาน">
                                <Trash2 size={14} aria-hidden="true" />
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={edit ? `แก้ไข ${KIND_META[kind].label}` : `เพิ่ม ${KIND_META[kind].label}`}
        description={KIND_META[kind].desc}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={save} loading={busy}>{edit ? "บันทึก" : "เพิ่มรายการ"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">รหัส *</span>
            <input
              value={fCode}
              onChange={(e) => setFCode(e.target.value)}
              placeholder={`เช่น ${KIND_META[kind].codePrefix}-001`}
              className="h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ชื่อ *</span>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="ชื่อรายการ"
              className="h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">คำอธิบาย</span>
            <textarea
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]"
            />
          </label>
          {kind === "failure_modes" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">Failure Type ต้นสังกัด</span>
              <Select value={fTypeId} onValueChange={setFTypeId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="เลือก Failure Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">ไม่ระบุ</SelectItem>
                  {(tax?.failure_types ?? [])
                    .filter((t) => t.is_active)
                    .map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.code} — {t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          )}
          {kind !== "root_cause_categories" && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-[var(--cmms-text-primary)]">ส่วนประกอบ / อุปกรณ์</span>
              <input
                value={fComp}
                onChange={(e) => setFComp(e.target.value)}
                placeholder="เช่น bearing, motor"
                className="h-10 w-full rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg)] px-3 text-sm outline-none transition-colors focus:border-[var(--cmms-border-focus)] focus:ring-2 focus:ring-[var(--cmms-border-focus)]"
              />
            </label>
          )}
        </div>
      </Dialog>
    </div>
  );
}
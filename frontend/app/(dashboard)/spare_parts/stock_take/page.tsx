"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "../../../../components/ToastProvider";
import {
  Plus,
  ClipboardCheck,
  Search,
  CheckCircle2,
  Trash2,
  ChevronRight,
} from "lucide-react";

interface RoundRow {
  id: number;
  code: string;
  note: string;
  status: "draft" | "completed" | "cancelled";
  created_at: string;
  completed_at: string | null;
  created_name: string | null;
  total_items: number;
  counted_items: number;
  diff_items: number;
}

interface TakeItem {
  id: number;
  spare_part_id: number;
  system_qty: string;
  counted_qty: string | null;
  note: string;
  code: string;
  name: string;
  unit: string;
  location: string;
  diff: number | null;
}

const STATUS_META: Record<string, { label: string; style: React.CSSProperties }> = {
  draft: { label: "กำลังนับ", style: { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" } },
  completed: { label: "ปิดรอบแล้ว", style: { background: "var(--cmms-success-light)", color: "var(--cmms-success-dark)" } },
  cancelled: { label: "ยกเลิก", style: { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" } },
};

export default function StockTakePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [round, setRound] = useState<{ id: number; code: string; status: string } | null>(null);
  const [items, setItems] = useState<TakeItem[]>([]);
  const [search, setSearch] = useState("");
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [createNote, setCreateNote] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);

  const fetchRounds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/stock_take.php");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดรายการไม่สำเร็จ");
      setRounds(json.data ?? []);
    } catch (e: any) {
      setError(e.message || "โหลดรายการไม่สำเร็จ");
    }
    setLoading(false);
  }, []);

  const fetchRound = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/v1/stock_take.php?id=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "โหลดรอบไม่สำเร็จ");
      setRound(json.round);
      setItems(json.items ?? []);
      const inp: Record<number, string> = {};
      const nt: Record<number, string> = {};
      (json.items ?? []).forEach((it: TakeItem) => { inp[it.spare_part_id] = it.counted_qty ?? ""; nt[it.spare_part_id] = it.note ?? ""; });
      setInputs(inp);
      setNotes(nt);
    } catch (e: any) {
      setError(e.message || "โหลดรอบไม่สำเร็จ");
    }
  }, []);

  useEffect(() => { fetchRounds(); }, [fetchRounds]);

  const openRound = async (id: number) => {
    setActiveId(id);
    await fetchRound(id);
  };

  const createRound = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/stock_take.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: createNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "สร้างรอบไม่สำเร็จ");
      setShowCreate(false);
      setCreateNote("");
      showToast("success", `สร้างรอบ ${json.code} สำเร็จ`);
      await fetchRounds();
      await openRound(json.id);
    } catch (e: any) {
      showToast("error", e.message || "สร้างรอบไม่สำเร็จ");
    }
    setBusy(false);
  };

  const saveItem = async (it: TakeItem) => {
    setBusy(true);
    try {
      const val = inputs[it.spare_part_id]?.trim() ?? "";
      const res = await fetch(`/api/v1/stock_take.php?id=${activeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "item", spare_part_id: it.spare_part_id, counted_qty: val === "" ? null : Number(val), note: notes[it.spare_part_id] ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "บันทึกไม่สำเร็จ");
      showToast("success", `บันทึก ${it.code} แล้ว`);
      await fetchRound(activeId!);
      await fetchRounds();
    } catch (e: any) {
      showToast("error", e.message || "บันทึกไม่สำเร็จ");
    }
    setBusy(false);
  };

  const completeRound = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/stock_take.php?id=${activeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ปิดรอบไม่สำเร็จ");
      showToast("success", json.message || "ปิดรอบสำเร็จ");
      setConfirmComplete(false);
      setActiveId(null);
      setRound(null);
      await fetchRounds();
    } catch (e: any) {
      showToast("error", e.message || "ปิดรอบไม่สำเร็จ");
    }
    setBusy(false);
  };

  const cancelRound = async () => {
    if (!window.confirm("ยกเลิกรอบนับนี้? (ข้อมูลที่กรอกจะหาย)")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/stock_take.php?id=${activeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ยกเลิกไม่สำเร็จ");
      showToast("success", json.message || "ยกเลิกรอบแล้ว");
      setActiveId(null);
      setRound(null);
      await fetchRounds();
    } catch (e: any) {
      showToast("error", e.message || "ยกเลิกไม่สำเร็จ");
    }
    setBusy(false);
  };

  const deleteRound = async (id: number) => {
    if (!window.confirm("ลบรอบนับนี้? (ลบได้เฉพาะรอบที่ยังไม่ปิด)")) return;
    try {
      const res = await fetch(`/api/v1/stock_take.php?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "ลบไม่สำเร็จ");
      showToast("success", "ลบรอบแล้ว");
      await fetchRounds();
    } catch (e: any) {
      showToast("error", e.message || "ลบไม่สำเร็จ");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q) || it.location.toLowerCase().includes(q));
  }, [items, search]);

  if (loading && rounds.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <Spinner size={22} label="กำลังโหลดข้อมูลนับสต็อก..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      {/* Hero */}
      <div className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>STOCK TAKE · CMMS-TOPPAN</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>นับสต็อกจริง (Stock Take)</h2>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardCheck size={14} strokeWidth={1.75} aria-hidden="true" /> {rounds.length} รอบ
            </span>
          </div>
          <p style={{ color: "rgba(255,255,255,0.78)" }}>
            สร้างรอบนับ → กรอกจำนวนที่พบจริงบนมือถือ → ปิดรอบเพื่อปรับ stock_qty ตามจริง
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white cmms-btn-primary"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          สร้างรอบนับใหม่
        </button>
      </div>

      {activeId && round ? (
        /* ═══════ รายละเอียดรอบที่กำลังนับ ═══════ */
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <ClipboardCheck size={24} strokeWidth={1.75} aria-hidden="true" style={{ color: "var(--cmms-primary)" }} />
                <div className="space-y-0">
                  <h3 className="text-lg font-bold tracking-tight">{round.code}</h3>
                  <p className="text-sm text-[var(--cmms-text-secondary)]">
                    {STATUS_META[round.status]?.label ?? round.status} · นับแล้ว {items.filter((i) => i.counted_qty !== null && i.counted_qty !== "").length}/{items.length}
                    {" "}· ต่างจากระบบ {items.filter((i) => i.diff !== null && i.diff !== 0).length} รายการ
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setActiveId(null); setRound(null); }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] px-3 py-2 text-xs font-semibold text-[var(--cmms-text-secondary)] transition-all duration-300 hover:bg-[var(--cmms-bg-wash)]"
                >← กลับรายการ</button>
                {round.status === "draft" && (
                  <>
                    <button
                      type="button"
                      onClick={cancelRound}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-all duration-300"
                      style={{ color: "var(--cmms-danger)", background: "var(--cmms-danger-light)", borderColor: "color-mix(in srgb, var(--cmms-danger) 25%, transparent)" }}
                    >ยกเลิกรอบ</button>
                    <button
                      type="button"
                      onClick={() => setConfirmComplete(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white cmms-btn-primary"
                    >
                      <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      ปิดรอบ + ปรับสต็อก
                    </button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <Search size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-[var(--cmms-text-secondary)]" />
              <div className="min-w-[220px] flex-1">
                <Input
                  label="ค้นหาอะไหล่"
                  isLabelHidden
                  placeholder="ค้นหา: รหัส / ชื่อ / ตำแหน่ง..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="text-sm text-[var(--cmms-text-secondary)]">พบ {filtered.length} รายการ</span>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--cmms-text-secondary)]">ไม่พบรายการ</p>
            ) : (
              filtered.map((it) => {
                const counted = it.counted_qty !== null && it.counted_qty !== "";
                const diff = it.diff;
                return (
                  <Card key={it.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-[180px] flex-1 space-y-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold">{it.code}</span>
                          {diff !== null && diff !== 0 && (
                            <span
                              className="cmms-andon-chip"
                              style={
                                diff > 0
                                  ? { background: "var(--cmms-primary-light)", color: "var(--cmms-primary-hover)" }
                                  : { background: "var(--cmms-warning-light)", color: "var(--cmms-warning-dark)" }
                              }
                            >
                              {diff > 0 ? `เกิน ${diff} ${it.unit}` : `ขาด ${Math.abs(diff)} ${it.unit}`}
                            </span>
                          )}
                        </div>
                        <p className="text-sm">{it.name}</p>
                        <p className="text-sm text-[var(--cmms-text-secondary)]">ตำแหน่ง: {it.location || "—"} · หน่วย: {it.unit}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-right">
                          <p className="text-xs text-[var(--cmms-text-secondary)]">ในระบบ</p>
                          <p className="text-sm font-bold">{it.system_qty}</p>
                        </div>
                        <div className="w-[110px]">
                          <Input
                            label={`นับจริง (${it.code})`}
                            isLabelHidden
                            placeholder="จำนวนจริง"
                            inputMode="decimal"
                            value={inputs[it.spare_part_id] ?? ""}
                            onChange={(e) => setInputs((f) => ({ ...f, [it.spare_part_id]: e.target.value }))}
                          />
                        </div>
                        <div className="w-[140px]">
                          <Input
                            label={`หมายเหตุ (${it.code})`}
                            isLabelHidden
                            placeholder="หมายเหตุ"
                            value={notes[it.spare_part_id] ?? ""}
                            onChange={(e) => setNotes((f) => ({ ...f, [it.spare_part_id]: e.target.value }))}
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveItem(it)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                            counted
                              ? "border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] text-[var(--cmms-text-secondary)] hover:bg-[var(--cmms-bg-wash)]"
                              : "text-white cmms-btn-primary"
                          }`}
                        >
                          {counted ? "บันทึกแล้ว ✓" : busy ? "กำลังบันทึก..." : "บันทึก"}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* ═══════ รายการรอบ ═══════ */
        <div className="space-y-2">
          {rounds.length === 0 ? (
            <Card>
              <CardContent className="space-y-2 p-6 text-center">
                <ClipboardCheck size={40} strokeWidth={1.5} aria-hidden="true" className="mx-auto text-[var(--cmms-text-muted)]" />
                <h3 className="text-lg font-bold tracking-tight">ยังไม่มีรอบนับสต็อก</h3>
                <p className="text-sm text-[var(--cmms-text-secondary)]">กด "สร้างรอบนับใหม่" เพื่อเริ่มนับสต็อกครั้งแรก</p>
              </CardContent>
            </Card>
          ) : (
            rounds.map((r) => (
              <Card key={r.id} className="cursor-pointer transition-shadow hover:shadow-[var(--cmms-shadow-md)]" onClick={() => openRound(r.id)}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="cmms-andon-chip" style={STATUS_META[r.status]?.style ?? { background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                      {STATUS_META[r.status]?.label ?? r.status}
                    </span>
                    <div className="space-y-0">
                      <p className="text-sm font-bold">{r.code}</p>
                      <p className="text-sm text-[var(--cmms-text-secondary)]">
                        {r.created_name || "—"} · {String(r.created_at).slice(0, 16)}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="cmms-andon-chip" style={{ background: "var(--cmms-bg-muted)", color: "var(--cmms-text-secondary)" }}>
                      นับ {r.counted_items}/{r.total_items}
                    </span>
                    {Number(r.diff_items) > 0 && <span className="cmms-status warn"><span className="cmms-status-dot" />ต่าง {r.diff_items} รายการ</span>}
                    {r.status === "draft" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteRound(r.id); }}
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all"
                        style={{ color: "var(--cmms-danger)", background: "var(--cmms-danger-light)", borderColor: "color-mix(in srgb, var(--cmms-danger) 25%, transparent)" }}
                      >
                        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        ลบ
                      </button>
                    )}
                    <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="text-[var(--cmms-text-muted)]" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ═══ Dialog สร้างรอบ ═══ */}
      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="สร้างรอบนับสต็อกใหม่">
        <div className="space-y-4 p-6">
          <p className="text-sm text-[var(--cmms-text-secondary)]">
            จะสร้างรอบพร้อมรายการอะไหล่ทั้งหมดในระบบ (จำนวนในระบบถูกล็อก ณ ตอนสร้าง) — ระบบกำหนดรหัสรอบอัตโนมัติ
          </p>
          <Input
            label="หมายเหตุ (ไม่บังคับ)"
            value={createNote}
            onChange={(e) => setCreateNote(e.target.value)}
            placeholder="เช่น นับสต็อกสิ้นเดือน ก.ค."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
            <Button disabled={busy} onClick={createRound}>{busy ? "กำลังสร้าง..." : "สร้างรอบ"}</Button>
          </div>
        </div>
      </Dialog>

      {/* ═══ Dialog ยืนยันปิดรอบ ═══ */}
      <Dialog open={confirmComplete} onClose={() => setConfirmComplete(false)} title="ยืนยันปิดรอบนับสต็อก">
        <div className="space-y-4 p-6">
          <p className="text-sm text-[var(--cmms-text-secondary)]">
            ระบบจะปรับ stock_qty ของอะไหล่ที่กรอกจำนวนจริง (ต่างจากระบบ {items.filter((i) => i.diff !== null && i.diff !== 0).length} รายการ) ลงฐานข้อมูลทันที — ทำแล้วแก้กลับไม่ได้ ยืนยัน?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmComplete(false)}>ยังไม่ปิด</Button>
            <Button disabled={busy} onClick={completeRound}>{busy ? "กำลังปิด..." : "ยืนยันปิดรอบ"}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text, Heading } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Badge } from "@astryxdesign/core/Badge";
import { Icon } from "@astryxdesign/core/Icon";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Banner } from "@astryxdesign/core/Banner";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { useToast } from "../../../../components/ToastProvider";
import {
  PlusIcon,
  ClipboardDocumentCheckIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  TrashIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";

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

const STATUS_META: Record<string, { label: string; variant: "info" | "success" | "neutral" }> = {
  draft: { label: "กำลังนับ", variant: "info" },
  completed: { label: "ปิดรอบแล้ว", variant: "success" },
  cancelled: { label: "ยกเลิก", variant: "neutral" },
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
      <HStack hAlign="center" style={{ padding: 60 }}>
        <Spinner size="md" />
        <Text type="body" color="secondary">กำลังโหลดข้อมูลนับสต็อก...</Text>
      </HStack>
    );
  }

  return (
    <VStack gap={6}>
      {error && <Banner status="error" title="เกิดข้อผิดพลาด" description={error} isDismissable={false} />}

      <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
        <VStack gap={1}>
          <HStack gap={3} vAlign="center">
            <Heading level={2}>นับสต็อกจริง (Stock Take)</Heading>
            <Badge label={`${rounds.length} รอบ`} variant="info" />
          </HStack>
          <Text type="body" color="secondary">
            สร้างรอบนับ → กรอกจำนวนที่พบจริงบนมือถือ → ปิดรอบเพื่อปรับ stock_qty ตามจริง
          </Text>
        </VStack>
        <Button
          label="สร้างรอบนับใหม่"
          variant="primary"
          icon={<Icon icon={PlusIcon} size="sm" />}
          onClick={() => setShowCreate(true)}
        />
      </HStack>

      {activeId && round ? (
        /* ═══════ รายละเอียดรอบที่กำลังนับ ═══════ */
        <VStack gap={4}>
          <Card padding={4}>
            <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
              <HStack gap={3} vAlign="center">
                <Icon icon={ClipboardDocumentCheckIcon} size="md" color="primary" />
                <VStack gap={0}>
                  <Heading level={3}>{round.code}</Heading>
                  <Text type="body" size="sm" color="secondary">
                    {STATUS_META[round.status]?.label ?? round.status} · นับแล้ว {items.filter((i) => i.counted_qty !== null && i.counted_qty !== "").length}/{items.length}
                    {" "}· ต่างจากระบบ {items.filter((i) => i.diff !== null && i.diff !== 0).length} รายการ
                  </Text>
                </VStack>
              </HStack>
              <HStack gap={2} wrap="wrap">
                <Button label="← กลับรายการ" variant="secondary" size="sm" onClick={() => { setActiveId(null); setRound(null); }} />
                {round.status === "draft" && (
                  <>
                    <Button label="ยกเลิกรอบ" variant="secondary" size="sm" onClick={cancelRound} />
                    <Button
                      label="ปิดรอบ + ปรับสต็อก"
                      variant="primary"
                      size="sm"
                      icon={<Icon icon={CheckCircleIcon} size="sm" />}
                      onClick={() => setConfirmComplete(true)}
                    />
                  </>
                )}
              </HStack>
            </HStack>
          </Card>

          <Card padding={4}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Icon icon={MagnifyingGlassIcon} size="sm" color="secondary" />
              <TextInput
                label="ค้นหาอะไหล่"
                isLabelHidden
                placeholder="ค้นหา: รหัส / ชื่อ / ตำแหน่ง..."
                value={search}
                onChange={setSearch}
                style={{ flex: 1, minWidth: 220 }}
              />
              <Text type="body" size="sm" color="secondary">พบ {filtered.length} รายการ</Text>
            </HStack>
          </Card>

          <VStack gap={2}>
            {filtered.length === 0 ? (
              <Text type="body" color="secondary">ไม่พบรายการ</Text>
            ) : (
              filtered.map((it) => {
                const counted = it.counted_qty !== null && it.counted_qty !== "";
                const diff = it.diff;
                return (
                  <Card key={it.id} padding={4}>
                    <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                      <VStack gap={0} style={{ flex: 1, minWidth: 180 }}>
                        <HStack gap={2} vAlign="center">
                          <Text type="body" weight="bold" size="sm">{it.code}</Text>
                          {diff !== null && diff !== 0 && (
                            <Badge label={diff > 0 ? `เกิน ${diff} ${it.unit}` : `ขาด ${Math.abs(diff)} ${it.unit}`} variant={diff > 0 ? "info" : "warning"} />
                          )}
                        </HStack>
                        <Text type="body" size="sm">{it.name}</Text>
                        <Text type="body" size="xs" color="secondary">ตำแหน่ง: {it.location || "—"} · หน่วย: {it.unit}</Text>
                      </VStack>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        <div style={{ textAlign: "right" }}>
                          <Text type="body" size="xs" color="secondary">ในระบบ</Text>
                          <Text type="body" weight="bold">{it.system_qty}</Text>
                        </div>
                        <TextInput
                          label={`นับจริง (${it.code})`}
                          isLabelHidden
                          type="number"
                          placeholder="จำนวนจริง"
                          value={inputs[it.spare_part_id] ?? ""}
                          onChange={(v) => setInputs((f) => ({ ...f, [it.spare_part_id]: v }))}
                          style={{ width: 110 }}
                        />
                        <TextInput
                          label={`หมายเหตุ (${it.code})`}
                          isLabelHidden
                          placeholder="หมายเหตุ"
                          value={notes[it.spare_part_id] ?? ""}
                          onChange={(v) => setNotes((f) => ({ ...f, [it.spare_part_id]: v }))}
                          style={{ width: 140 }}
                        />
                        <Button
                          label={counted ? "บันทึกแล้ว ✓" : "บันทึก"}
                          variant={counted ? "secondary" : "primary"}
                          size="sm"
                          isLoading={busy}
                          onClick={() => saveItem(it)}
                        />
                      </HStack>
                    </HStack>
                  </Card>
                );
              })
            )}
          </VStack>
        </VStack>
      ) : (
        /* ═══════ รายการรอบ ═══════ */
        <VStack gap={2}>
          {rounds.length === 0 ? (
            <Card padding={6}>
              <VStack gap={2} hAlign="center" style={{ textAlign: "center" }}>
                <Icon icon={ClipboardDocumentCheckIcon} size="lg" color="secondary" />
                <Heading level={3}>ยังไม่มีรอบนับสต็อก</Heading>
                <Text type="body" color="secondary">กด "สร้างรอบนับใหม่" เพื่อเริ่มนับสต็อกครั้งแรก</Text>
              </VStack>
            </Card>
          ) : (
            rounds.map((r) => (
              <Card key={r.id} padding={4} style={{ cursor: "pointer" }} onClick={() => openRound(r.id)}>
                <HStack hAlign="between" vAlign="center" wrap="wrap" gap={3}>
                  <HStack gap={3} vAlign="center">
                    <Badge label={STATUS_META[r.status]?.label ?? r.status} variant={STATUS_META[r.status]?.variant ?? "neutral"} />
                    <VStack gap={0}>
                      <Text type="body" weight="bold">{r.code}</Text>
                      <Text type="body" size="xs" color="secondary">
                        {r.created_name || "—"} · {String(r.created_at).slice(0, 16)}
                        {r.note ? ` · ${r.note}` : ""}
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack gap={2} vAlign="center">
                    <Badge label={`นับ ${r.counted_items}/${r.total_items}`} variant="neutral" />
                    {Number(r.diff_items) > 0 && <Badge label={`ต่าง ${r.diff_items} รายการ`} variant="warning" />}
                    {r.status === "draft" && (
                      <Button
                        label="ลบ"
                        variant="secondary"
                        size="sm"
                        icon={<Icon icon={TrashIcon} size="sm" />}
                        onClick={(e) => { e.stopPropagation(); deleteRound(r.id); }}
                      />
                    )}
                    <Icon icon={ChevronRightIcon} size="sm" color="disabled" />
                  </HStack>
                </HStack>
              </Card>
            ))
          )}
        </VStack>
      )}

      {/* ═══ Dialog สร้างรอบ ═══ */}
      <Dialog isOpen={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false); }}>
        <DialogHeader title="สร้างรอบนับสต็อกใหม่" />
        <VStack gap={4}>
          <Text type="body" size="sm" color="secondary">
            จะสร้างรอบพร้อมรายการอะไหล่ทั้งหมดในระบบ (จำนวนในระบบถูกล็อก ณ ตอนสร้าง) — ระบบกำหนดรหัสรอบอัตโนมัติ
          </Text>
          <TextInput
            label="หมายเหตุ (ไม่บังคับ)"
            value={createNote}
            onChange={setCreateNote}
            placeholder="เช่น นับสต็อกสิ้นเดือน ก.ค."
          />
          <HStack hAlign="end" gap={2}>
            <Button label="ยกเลิก" variant="secondary" onClick={() => setShowCreate(false)} />
            <Button label="สร้างรอบ" variant="primary" isLoading={busy} onClick={createRound} />
          </HStack>
        </VStack>
      </Dialog>

      {/* ═══ Dialog ยืนยันปิดรอบ ═══ */}
      <Dialog isOpen={confirmComplete} onOpenChange={(open) => { if (!open) setConfirmComplete(false); }}>
        <DialogHeader title="ยืนยันปิดรอบนับสต็อก" />
        <VStack gap={4}>
          <Text type="body" size="sm" color="secondary">
            ระบบจะปรับ stock_qty ของอะไหล่ที่กรอกจำนวนจริง (ต่างจากระบบ {items.filter((i) => i.diff !== null && i.diff !== 0).length} รายการ) ลงฐานข้อมูลทันที — ทำแล้วแก้กลับไม่ได้ ยืนยัน?
          </Text>
          <HStack hAlign="end" gap={2}>
            <Button label="ยังไม่ปิด" variant="secondary" onClick={() => setConfirmComplete(false)} />
            <Button label="ยืนยันปิดรอบ" variant="primary" isLoading={busy} onClick={completeRound} />
          </HStack>
        </VStack>
      </Dialog>
    </VStack>
  );
}

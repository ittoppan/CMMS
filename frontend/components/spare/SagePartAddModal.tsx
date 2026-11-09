"use client";

import { useEffect, useRef, useState } from "react";
import { PackagePlus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendOrEnqueue } from "@/lib/offlineQueue";
import { makeId } from "@/lib/offline/engine";

interface SageItem {
  item_no: string;
  description: string;
  unit?: string;
  available?: number | string;
  on_hand?: number | string;
  stock_status?: string;
}

interface SagePartAddModalProps {
  open: boolean;
  onClose: () => void;
  workOrderId: number | null;
  woNumber?: string;
  onAdded?: () => void;
}

/**
 * Sage 300 Spares Search + Add to Case (เรียก spare_usage.php เหมือนหน้า repair/view)
 * - แสดงเป็น modal (AnimatedDialog style ใช้โครงจาก my_tasks)
 * - net หลุด → queue offline (idempotent client_action_id) เหมือนหน้า view
 */
export default function SagePartAddModal({ open, onClose, workOrderId, woNumber, onAdded }: SagePartAddModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SageItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<"sage" | "cache" | null>(null);
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingItem, setSavingItem] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // รีเซ็ตทุกครั้งที่เปิด
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setMsg(null);
      setQtyMap({});
    }
  }, [open, workOrderId]);

  // ค้นหา Sage (debounce 400ms)
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/v1/sage_items.php?q=${encodeURIComponent(q)}`, { credentials: "include" });
        const json = await res.json();
        setResults(Array.isArray(json.items) ? json.items : []);
        setSource(json.source === "cache" ? "cache" : "sage");
      } catch {
        setResults([]);
        setSource(null);
      }
      setSearching(false);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const addItem = async (item: SageItem) => {
    const qty = Math.max(1, Number(qtyMap[item.item_no] || 1));
    if (!workOrderId) return;
    setSavingItem(item.item_no);
    setMsg(null);
    const clientActionId = makeId("sp");
    const payload = { action: "add", work_order_id: Number(workOrderId), items: [{ item_code: item.item_no, qty }], client_action_id: clientActionId };
    try {
      const csrf = await (await fetch("/api/v1/csrf.php", { credentials: "include" })).json();
      const res = await fetch("/api/v1/spare_usage.php", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.csrf_token },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setMsg({ ok: true, text: `เพิ่ม ${item.item_no} — ${item.description} ×${qty} แล้ว · ใบเบิก #${json.request_id} (Pending Issue)` });
        setQtyMap((m) => ({ ...m, [item.item_no]: 1 }));
        onAdded?.();
      } else {
        setMsg({ ok: false, text: json.error || "เพิ่มอะไหล่ไม่สำเร็จ" });
      }
    } catch {
      // ออฟไลน์ — คิวแบบ idempotent เหมือนหน้า repair/view
      const out = await sendOrEnqueue({
        url: "/api/v1/spare_usage.php",
        method: "POST",
        body: payload,
        kind: "spare_usage",
        label: `เบิกอะไหล่ ${item.item_no} ×${qty}`,
      });
      if (out === "queued") {
        setMsg({ ok: true, text: `บันทึกลงเครื่อง (${item.item_no} ×${qty}) — จะสร้างใบเบิกเมื่อกลับมาออนไลน์` });
        onAdded?.();
      } else {
        setMsg({ ok: false, text: out === "failed" ? "ระบบปฏิเสธรายการเบิก — ตรวจสอบอีกครั้ง" : "เครือข่ายหลุดหรือไม่มีสิทธิ์ — ลองอีกครั้ง" });
      }
    }
    setSavingItem(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="เบิกอะไหล่ในใบงานซ่อม">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 max-h-[90dvh] w-full max-w-[min(640px,94vw)] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 pb-4 pt-5">
          <div>
            <h2 className="text-base font-semibold">เบิกอะไหล่{woNumber ? `: ${woNumber}` : ""}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">ค้นหาจาก Sage 300 — บันทึกเป็นรายการ Pending Issue รออนุมัติจ่ายของ</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิดหน้าต่าง">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ระบุรหัสหรือชื่ออะไหล่ (Item No. / Description)"
              aria-label="ค้นหาอะไหล่จาก Sage 300"
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              autoFocus
            />
          </div>

          {msg && (
            <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>
              {msg.text}
            </div>
          )}

          {searching && <p className="text-xs text-muted-foreground animate-pulse">กำลังค้นหา…</p>}

          {!searching && query.trim() && results.length === 0 && (
            <p className="text-sm text-muted-foreground">ไม่พบอะไหล่ที่ตรงกัน — ลองคำอื่นหรือติดต่อหน้าคลังอะไหล่</p>
          )}

          {results.length > 0 && (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {results.map((it) => (
                <li key={it.item_no} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{it.item_no}</p>
                    <p className="text-xs text-muted-foreground truncate">{it.description}</p>
                    <p className="text-2xs text-muted-foreground mt-0.5">
                      คงเหลือ {Number(it.available ?? it.on_hand ?? 0).toLocaleString()} {it.unit || "PCS"}
                      {it.stock_status ? ` · ${it.stock_status}` : ""}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs">
                    <span className="sr-only sm:not-sr-only">จำนวน</span>
                    <input
                      type="number"
                      min={1}
                      value={qtyMap[it.item_no] ?? 1}
                      onChange={(e) => setQtyMap((m) => ({ ...m, [it.item_no]: Math.max(1, Number(e.target.value) || 1) }))}
                      className="h-8 w-16 rounded-lg border border-input bg-card px-1.5 text-sm"
                      aria-label={`จำนวนของ ${it.item_no}`}
                    />
                  </label>
                  <Button
                    variant="primary"
                    size="sm"
                    className="gap-1.5"
                    loading={savingItem === it.item_no}
                    disabled={savingItem !== null && savingItem !== it.item_no}
                    onClick={() => addItem(it)}
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>เบิก</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {source && results.length > 0 && (
            <p className="text-2xs text-muted-foreground">แหล่งข้อมูล: {source === "cache" ? "Sage cache (last known)" : "Sage 300 live"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useEffect } from "react";
import { PageShell } from "@/components/PageShell";
import { Grid } from "@/components/layout";
import CountUp from "react-countup";
import { Search, Boxes, TriangleAlert, CircleDollarSign, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StockPill } from "@/components/spare-parts/StockPill";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";

interface Part {
  id: number;
  code: string;
  name: string;
  category: string;
  location: string;
  unit: string;
  stock_qty: number | string | null;
  min_stock: number | string | null;
  max_stock: number | string | null;
  unit_price: number | string | null;
  description?: string;
  image_url?: string | null;
}

interface Tx {
  item_id: number;
  request_id: number | null;
  qty_issued: number;
  qty_returned: number;
  remaining: number;
  return_reason: string | null;
  returned_at: string | null;
  returned_by_name: string | null;
  work_order_no: string | null;
  wo_title: string | null;
  request_status: string | null;
  requested_at: string | null;
}

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function SpareBalancesPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [openPart, setOpenPart] = useState<Part | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  const loadParts = () => {
    setLoading(true);
    fetch("/api/v1/spare_parts.php")
      .then((res) => res.json())
      .then((json) => {
        if (Array.isArray(json)) setParts(json);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadParts();
  }, []);

  const openHistory = async (part: Part) => {
    if (openPart?.id === part.id) {
      setOpenId(null);
      setOpenPart(null);
      return;
    }
    setOpenPart(part);
    setOpenId(part.id);
    setTxLoading(true);
    setTxs([]);
    try {
      const res = await fetch(`/api/v1/spare_issue.php?part_id=${part.id}`);
      const json = await res.json();
      if (Array.isArray(json)) setTxs(json);
    } catch {
      setTxs([]);
    } finally {
      setTxLoading(false);
    }
  };

  const stats = useMemo(() => {
    let totalValue = 0;
    let out = 0;
    let low = 0;
    for (const p of parts) {
      const stk = num(p.stock_qty);
      totalValue += stk * num(p.unit_price);
      if (stk <= 0) out++;
      else if (p.min_stock != null && stk < num(p.min_stock)) low++;
    }
    return { count: parts.length, totalValue, out, low };
  }, [parts]);

  const filtered = useMemo(() => {
    if (!search) return parts;
    const q = search.toLowerCase();
    return parts.filter(
      (p) =>
        (p.code || "").toLowerCase().includes(q) ||
        (p.name || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.location || "").toLowerCase().includes(q)
    );
  }, [parts, search]);

  const fmt = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

  return (
    <PageShell
      eyebrow={<p className="cmms-eyebrow">SPARE PARTS BALANCE</p>}
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "คลังอะไหล่", href: "/spare_parts" },
        { label: "ยอดคงเหลือ" },
      ]}
      title="ยอดคงเหลืออะไหล่"
      description="ภาพรวมยอดคงเหลือและมูลค่าคลัง กดแถวเพื่อดูประวัติเบิก-จ่ายย้อนหลังต่อชิ้น"
      actions={
        <Button variant="secondary" onClick={() => { loadParts(); setSearch(""); }}>
          รีโหลดข้อมูล
        </Button>
      }
    >
      <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-primary-light)] text-[var(--cmms-primary-hover)]">
              <Boxes className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">รายการอะไหล่</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.count} />
                <span className="cmms-kpi-unit">ชิ้น</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-success-light)] text-[var(--cmms-success-dark)]">
              <CircleDollarSign className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">มูลค่าคลังรวม</p>
              <div className="cmms-kpi-value">
                {fmt(stats.totalValue)}
                <span className="cmms-kpi-unit">บาท</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-warning-light)] text-[var(--cmms-warning-dark)]">
              <TriangleAlert className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ต่ำกว่า Min</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.low} />
                <span className="cmms-kpi-unit">ชิ้น</span>
              </div>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--cmms-danger-light)] text-[var(--cmms-danger-dark)]">
              <TriangleAlert className="w-5 h-5" strokeWidth={1.75} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">หมดคลัง</p>
              <div className="cmms-kpi-value">
                <CountUp end={stats.out} />
                <span className="cmms-kpi-unit">ชิ้น</span>
              </div>
            </div>
          </div>
        </Card>
      </Grid>

      <Card className="p-4">
        <div className="relative mb-3 w-full max-w-[360px]">
          <Search
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            label="ค้นหา"
            isLabelHidden
            placeholder="ค้นหารหัส, ชื่อ, หมวดหมู่ หรือสถานที่..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-2 font-semibold">รหัส</th>
                  <th className="py-2 pr-2 font-semibold">รายการอะไหล่</th>
                  <th className="py-2 pr-2 font-semibold">หมวดหมู่</th>
                  <th className="py-2 pr-2 font-semibold">สถานที่</th>
                  <th className="py-2 pr-2 text-right font-semibold">คงเหลือ</th>
                  <th className="py-2 pr-2 font-semibold">Min/Max</th>
                  <th className="py-2 pr-2 font-semibold">สถานะ</th>
                  <th className="py-2 pr-2 text-right font-semibold">ราคา/หน่วย</th>
                  <th className="py-2 text-right font-semibold">มูลค่า</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const stk = num(p.stock_qty);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-accent/40"
                      onClick={() => openHistory(p)}
                    >
                      <td className="py-2.5 pr-2">
                        <HoverCard openDelay={120}>
                          <HoverCardTrigger asChild>
                            <span className="font-mono text-xs font-medium">{p.code}</span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-60">
                            <p className="mb-1 font-semibold">{p.name}</p>
                            <div className="space-y-1 text-xs text-muted-foreground">
                              <p>
                                คงเหลือ:{" "}
                                <span className="font-semibold text-foreground">
                                  {stk.toLocaleString("th-TH")} {p.unit || ""}
                                </span>
                              </p>
                              <p>
                                Min/Max: {num(p.min_stock).toLocaleString("th-TH")} /{" "}
                                {num(p.max_stock).toLocaleString("th-TH")}
                              </p>
                              <p>
                                มูลค่า:{" "}
                                <span className="font-semibold text-foreground">
                                  {fmt(stk * num(p.unit_price))} บาท
                                </span>
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      </td>
                      <td className="py-2.5 pr-2">
                        <p className="font-semibold">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">{p.category || "-"}</td>
                      <td className="py-2.5 pr-2">{p.location || "-"}</td>
                      <td className="py-2.5 pr-2 text-right font-semibold">
                        {stk.toLocaleString("th-TH")} {p.unit || ""}
                      </td>
                      <td className="py-2.5 pr-2 text-muted-foreground">
                        {num(p.min_stock).toLocaleString("th-TH")} /{" "}
                        {num(p.max_stock).toLocaleString("th-TH")}
                      </td>
                      <td className="py-2.5 pr-2">
                        <StockPill stock={stk} min={p.min_stock != null ? num(p.min_stock) : null} />
                      </td>
                      <td className="py-2.5 pr-2 text-right">{fmt(num(p.unit_price))}</td>
                      <td className="py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {fmt(stk * num(p.unit_price))}
                          <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Sheet open={openId !== null} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <SheetContent side="right" showCloseButton className="w-[min(720px,94vw)] max-w-[94vw] gap-0 p-0 sm:w-[min(720px,94vw)]">
          {openPart && (
            <>
              <SheetHeader className="border-b border-border pb-3">
                <SheetTitle>
                  <span className="font-mono text-sm">{openPart.code}</span> — {openPart.name}
                </SheetTitle>
                <SheetDescription>ประวัติเบิก-จ่ายและคืนซากของอะไหล่ชิ้นนี้</SheetDescription>
              </SheetHeader>
              <ScrollArea className="h-[min(65vh,480px)]">
                <div className="p-4">
                  {txLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : txs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      ยังไม่มีรายการเบิก-จ่ายของอะไหล่ชิ้นนี้
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                            <th className="py-1 pr-2 font-semibold">ใบแจ้งซ่อม</th>
                            <th className="py-1 pr-2 font-semibold">งาน</th>
                            <th className="py-1 pr-2 text-right font-semibold">เบิก</th>
                            <th className="py-1 pr-2 text-right font-semibold">คืนซาก</th>
                            <th className="py-1 pr-2 font-semibold">สถานะใบเบิก</th>
                            <th className="py-1 font-semibold">เหตุผลคืนซาก</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txs.map((tx) => (
                            <tr key={tx.item_id} className="border-b border-border/60">
                              <td className="py-1.5 pr-2 font-mono text-xs">{tx.work_order_no || "-"}</td>
                              <td className="py-1.5 pr-2">{tx.wo_title || "-"}</td>
                              <td className="py-1.5 pr-2 text-right">{tx.qty_issued.toLocaleString("th-TH")}</td>
                              <td className="py-1.5 pr-2 text-right">
                                {tx.qty_returned > 0 ? (
                                  <span className="font-semibold text-[var(--cmms-warning-dark)]">
                                    {tx.qty_returned.toLocaleString("th-TH")}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="py-1.5 pr-2">{tx.request_status || "-"}</td>
                              <td className="py-1.5 text-xs text-muted-foreground">
                                {tx.return_reason ? (
                                  <div>
                                    {tx.return_reason}
                                    {tx.returned_by_name && (
                                      <span className="block text-[var(--cmms-primary-hover)]">
                                        {tx.returned_by_name} · {tx.returned_at || ""}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
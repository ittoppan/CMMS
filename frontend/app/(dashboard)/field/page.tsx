"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ScanLine,
  Wrench,
  ClipboardCheck,
  CalendarClock,
  RefreshCw,
  ChevronRight,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ConnectivityStatus } from "@/components/ConnectivityStatus";
import { useToast } from "@/components/ToastProvider";

type MyWo = {
  id: number;
  work_order_no: string;
  title: string;
  priority?: string | null;
  status: string;
  sla_due_at?: string | null;
};

type PmItem = {
  id: number;
  title: string;
  status: string;
  due_date?: string | null;
  asset_code?: string | null;
  asset_name?: string | null;
};

type ScanItem = {
  id: number;
  raw_code: string;
  resolved_type: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; variant: "neutral" | "primary" | "success" | "warning" | "danger" | "info" }> = {
  open: { label: "เปิด", variant: "info" },
  pending_approval: { label: "รออนุมัติ", variant: "warning" },
  approved: { label: "อนุมัติแล้ว", variant: "info" },
  assigned: { label: "มอบหมายแล้ว", variant: "primary" },
  accepted: { label: "รับงานแล้ว", variant: "primary" },
  in_progress: { label: "กำลังทำ", variant: "success" },
  paused: { label: "หยุดพัก", variant: "warning" },
  waiting_parts: { label: "รออะไหล่", variant: "warning" },
  waiting_external: { label: "รอภายนอก", variant: "warning" },
  pending_verification: { label: "รอตรวจรับ", variant: "info" },
  completed: { label: "เสร็จ (รอตรวจ)", variant: "success" },
};

export default function FieldHomePage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [myWos, setMyWos] = useState<MyWo[]>([]);
  const [pmDue, setPmDue] = useState<PmItem[]>([]);
  const [scans, setScans] = useState<ScanItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, pmRes, scanRes] = await Promise.all([
        fetch("/api/v1/dashboard.php?action=overview", { credentials: "include" }).catch(() => null),
        fetch("/api/v1/dashboard.php?action=pm&group=overdue&limit=10", { credentials: "include" }).catch(() => null),
        fetch("/api/v1/scan.php?action=history&limit=10", { credentials: "include" }).catch(() => null),
      ]);
      if (ovRes?.ok) {
        const j = await ovRes.json();
        setMyWos(Array.isArray(j?.my_requests) ? j.my_requests : []);
      }
      if (pmRes?.ok) {
        const j = await pmRes.json();
        setPmDue(Array.isArray(j?.items) ? j.items : []);
      }
      if (scanRes?.ok) {
        const j = await scanRes.json();
        setScans(Array.isArray(j?.items) ? j.items : []);
      }
      if (!ovRes && !pmRes && !scanRes) {
        showToast("info", "ออฟไลน์อยู่ — แสดงข้อมูลที่บันทึกไว้เท่าที่มี");
      }
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const t = setTimeout(() => { document.title = "โหมดภาคสนาม · CMMS-TOPPAN"; }, 350);
    void load();
    const onSync = () => void load();
    window.addEventListener("cmms:sync-changed", onSync);
    return () => {
      clearTimeout(t);
      window.removeEventListener("cmms:sync-changed", onSync);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="cmms-eyebrow m-0">FIELD WORK · TECHNICIAN</p>
          <h1 className="m-0 text-xl font-bold">โหมดภาคสนาม</h1>
        </div>
        <ConnectivityStatus variant="chip" />
      </div>

      <Button
        onClick={() => (window.location.href = "/scan")}
        className="w-full"
        style={{ height: 64, fontSize: 18, background: "var(--cmms-primary)" }}
      >
        <ScanLine className="mr-2 h-7 w-7" aria-hidden="true" />
        สแกน QR / บาร์โค้ด
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" className="h-14 justify-start" onClick={() => (window.location.href = "/repair/request")}>
          <Wrench className="mr-2 h-5 w-5" aria-hidden="true" /> แจ้งซ่อม
        </Button>
        <Button variant="outline" className="h-14 justify-start" onClick={() => (window.location.href = "/repair/my_tasks")}>
          <ClipboardCheck className="mr-2 h-5 w-5" aria-hidden="true" /> งานของฉัน
        </Button>
        <Button variant="outline" className="h-14 justify-start" onClick={() => (window.location.href = "/pm_am/checksheet")}>
          <CalendarClock className="mr-2 h-5 w-5" aria-hidden="true" /> เช็คชีท PM
        </Button>
        <Button variant="outline" className="h-14 justify-start" onClick={() => (window.location.href = "/sync-center")}>
          <RefreshCw className="mr-2 h-5 w-5" aria-hidden="true" /> ซิงก์ข้อมูล
        </Button>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-base font-bold">งานที่มอบหมายให้ฉัน</h2>
          <Link href="/repair/my_tasks" className="text-sm">ดูทั้งหมด</Link>
        </div>
        {loading && myWos.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-[var(--cmms-text-secondary)]">
            <Spinner /> กำลังโหลด…
          </div>
        ) : myWos.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-[var(--cmms-text-secondary)]">
              ยังไม่มีงานที่เปิดอยู่ — สแกน QR เครื่องจักรเพื่อเริ่มงาน
            </CardContent>
          </Card>
        ) : (
          myWos.map((w) => {
            const st = STATUS_LABEL[w.status] || { label: w.status, variant: "neutral" as const };
            return (
              <Link key={w.id} href={`/field/work/${w.id}`} className="no-underline">
                <Card style={{ borderLeft: "4px solid var(--cmms-primary)" }}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{w.work_order_no}</span>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {w.priority && <Badge variant={w.priority === "urgent" || w.priority === "emergency" ? "danger" : "warning"}>{w.priority}</Badge>}
                      </div>
                      <p className="m-0 truncate text-sm text-[var(--cmms-text-secondary)]">{w.title}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
                  </CardContent>
                </Card>
              </Link>
            );
          })
        )}
      </section>

      {pmDue.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-bold text-[var(--cmms-warning)]">PM เกินกำหนด ({pmDue.length})</h2>
          {pmDue.map((p) => (
            <Card key={p.id} style={{ borderLeft: "4px solid var(--cmms-warning)" }}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-semibold">{p.title}</p>
                  <p className="m-0 text-xs text-[var(--cmms-text-secondary)]">
                    {p.asset_code ? `${p.asset_code} · ` : ""}กำหนด {p.due_date || "-"}
                  </p>
                </div>
                <Button size="sm" onClick={() => (window.location.href = `/pm_am/checksheet?plan_id=${p.id}${p.asset_code ? `&asset_code=${encodeURIComponent(p.asset_code)}` : ""}`)}>
                  ทำ
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 flex items-center gap-2 text-base font-bold">
          <History className="h-4 w-4" aria-hidden="true" /> สแกนล่าสุด
        </h2>
        {scans.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-[var(--cmms-text-secondary)]">ยังไม่มีประวัติการสแกน</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0" style={{ borderColor: "var(--cmms-border)" }}>
              {scans.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="m-0 truncate font-mono text-sm">{s.raw_code}</p>
                    <p className="m-0 text-xs text-[var(--cmms-text-secondary)]">{s.created_at}</p>
                  </div>
                  <Badge variant={s.resolved_type === "unknown" ? "danger" : "neutral"}>{s.resolved_type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountUp from "react-countup";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { FileText, Plus, Search, BookMarked, QrCode, RefreshCw, AlertTriangle, CheckCheck } from "lucide-react";
import {
  fetchDocConfig,
  fetchDocDashboard,
  fetchDocList,
  fetchDocOptions,
  docStatusLabel,
  docTypeLabel,
  fmtDocDate,
  DOC_STATUS_LABELS,
  DOC_STATUS_TONE,
  type PendingAck,
  type DocConfigResponse,
  type DocDashboard,
  type DocOptions,
  type DocumentRow,
} from "@/lib/document";
import { cn } from "@/lib/cn";

function Kpi({ label, value, sub, lamp }: { label: string; value: number; sub?: string; lamp?: "ok" | "warn" | "down" | "idle" }) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {lamp && <AndonLamp status={lamp} size="sm" />}
        </div>
        <div className="cmms-kpi-value">
          <CountUp end={value} duration={0.6} />
          <span className="cmms-kpi-unit">ฉบับ</span>
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={cn("cmms-status", tone)}>
      <span className="cmms-status-dot" />
      {children}
    </span>
  );
}

/** แปลง tone ของ Phase 32 ให้เข้ากับ .cmms-status ของ design system */
function lampTone(tone: string | undefined): "ok" | "warn" | "down" | "idle" {
  switch (tone) {
    case "success":
      return "ok";
    case "warning":
      return "warn";
    case "danger":
      return "down";
    case "info":
      return "warn";
    default:
      return "idle";
  }
}

export default function DocumentsPage() {
  const hero = usePageHero("documents");
  const layout = usePageLayout("/documents", ["hero", "kpi", "filters", "content"]);
  const layoutStyle = (id: string) => ({
    order: layout.orderOf(id),
    display: layout.isHidden(id) ? ("none" as const) : undefined,
  });

  const [cfg, setCfg] = useState<DocConfigResponse | null>(null);
  const [options, setOptions] = useState<DocOptions | null>(null);
  const [dash, setDash] = useState<DocDashboard | null>(null);
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [docType, setDocType] = useState("");
  const [owner, setOwner] = useState("");

  useEffect(() => {
    fetchDocConfig().then(setCfg).catch(() => {});
    fetchDocOptions().then(setOptions).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setRefreshing(true);
    setError("");
    try {
      const [d, l] = await Promise.all([
        fetchDocDashboard(),
        fetchDocList({ search: search || undefined, status: status || undefined, doc_type: docType || undefined, owner_id: owner || undefined }),
      ]);
      setDash(d.dashboard);
      setItems(l.documents || []);
    } catch (e: any) {
      setError(e?.message || "โหลดข้อมูลเอกสารควบคุมไม่สำเร็จ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, status, docType, owner]);

  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => options?.doc_types ?? cfg?.config?.doc_types ?? [], [options, cfg]);
  const users = options?.users ?? [];
  const t = dash?.totals;
  const can = cfg?.can;

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div style={layoutStyle("hero")} className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>{hero.title}</h1>
            <Badge variant="primary" dot><BookMarked size={13} aria-hidden="true" /> Phase 32</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{hero.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={load} disabled={refreshing}>
            <RefreshCw size={15} aria-hidden="true" /> รีเฟรช
          </Button>
          {can?.create && (
            <Link href="/documents/create" className={buttonVariants({ variant: "primary" })}>
              <Plus size={16} aria-hidden="true" /> สร้างเอกสาร
            </Link>
          )}
        </div>
      </div>

      {/* KPI */}
      <div style={layoutStyle("kpi")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !t ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : null}
        {t && (
          <>
            <Kpi label="เอกสารทั้งหมด" value={t.documents} sub={`ใช้งานอยู่ ${t.active} · เลิกใช้ ${t.obsolete}`} lamp={t.documents > 0 ? "ok" : "idle"} />
            <Kpi label="ยังไม่มีฉบับที่มีผล" value={t.no_effective} sub={`มีฉบับที่มีผล ${t.with_effective} · revision รวม ${t.revisions}`} lamp={t.no_effective > 0 ? "warn" : "ok"} />
            <Kpi label="รอรับทราบ" value={t.ack_pending} sub={`เกินกำหนด ${t.ack_overdue} · ข้อยกเว้น ${t.ack_exception}`} lamp={t.ack_overdue > 0 ? "down" : t.ack_pending > 0 ? "warn" : "ok"} />
            <Kpi label="ครบกำหนดทบทวน" value={t.review_overdue} sub={`ผลกระทบค้าง ${t.open_impacts} · รออนุมัติ ${t.pending_approval}`} lamp={t.review_overdue > 0 ? "warn" : "ok"} />
          </>
        )}
      </div>

      {/* Filters */}
      <div style={layoutStyle("filters")} className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
            placeholder="ค้นหาชื่อ / เลขเอกสาร"
            className="w-[280px] pl-8"
            aria-label="ค้นหาเอกสารควบคุม"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44" aria-label="กรองตามสถานะเอกสาร"><SelectValue placeholder="สถานะทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={docType} onValueChange={(v) => setDocType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-52" aria-label="กรองตามประเภทเอกสาร"><SelectValue placeholder="ประเภททั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ประเภททั้งหมด</SelectItem>
            {types.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={(v) => setOwner(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48" aria-label="กรองตามเจ้าของเอกสาร"><SelectValue placeholder="เจ้าของทั้งหมด" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">เจ้าของทั้งหมด</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || status || docType || owner) && (
          <Button variant="ghost" onClick={() => { setSearch(""); setStatus(""); setDocType(""); setOwner(""); }}>ล้างตัวกรอง</Button>
        )}
      </div>

      {/* Registry table */}
      <div style={layoutStyle("content")}>
        {/* งานรับทราบของฉัน */}
        <MyAcks />

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>ทะเบียนเอกสารควบคุม</CardTitle>
              <CardDescription>
                {items.length} รายการ — ประวัติ revision ที่อนุมัติแล้วเป็น immutable และมีฉบับที่มีผลบังคับใช้ได้เพียง 1 ฉบับต่อเอกสาร
              </CardDescription>
            </div>
            <FileText size={18} className="text-[var(--cmms-text-secondary)]" aria-hidden="true" />
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={search || status || docType || owner ? "ไม่พบเอกสารที่ตรงเงื่อนไข" : "ยังไม่มีเอกสารควบคุม"}
                  description={search || status || docType || owner ? "ลองเปลี่ยนเงื่อนไขการกรอง" : "สร้างเอกสารฉบับแรกเพื่อเริ่มใช้งานระบบควบคุมเอกสาร"}
                  icon={<FileText size={40} />}
                  action={can?.create ? <Link href="/documents/create" className={buttonVariants({ variant: "primary" })}><Plus size={15} aria-hidden="true" /> สร้างเอกสาร</Link> : undefined}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5">เลข / ชื่อเอกสาร</th>
                      <th className="px-4 py-2.5">ประเภท</th>
                      <th className="px-4 py-2.5">สถานะ</th>
                      <th className="px-4 py-2.5">ฉบับที่มีผล</th>
                      <th className="px-4 py-2.5">เจ้าของ</th>
                      <th className="px-4 py-2.5">ทบทวนครั้งถัดไป</th>
                      <th className="px-4 py-2.5 text-right">เข้าดู</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((doc) => {
                      const tone = DOC_STATUS_TONE[doc.status] ?? "neutral";
                      const days = doc.next_review_date
                        ? Math.ceil((new Date(`${doc.next_review_date}T18:00:00`).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <tr key={doc.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                          <td className="px-4 py-3">
                            <Link href={`/documents/${doc.id}`} className="font-medium text-foreground hover:underline">
                              {doc.title}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">{doc.doc_no}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{docTypeLabel(doc.doc_type, types)}</td>
                          <td className="px-4 py-3">
                            <Pill tone={lampTone(tone)}>{docStatusLabel(doc.status)}</Pill>
                          </td>
                          <td className="px-4 py-3">
                            {doc.effective_revision_no ? (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <CheckCheck size={13} aria-hidden="true" className="text-[var(--cmms-success)]" />
                                <span className="font-medium">rev {doc.effective_revision_no}</span>
                                <span className="text-muted-foreground">{fmtDocDate(doc.effective_date)}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <AlertTriangle size={13} aria-hidden="true" /> ยังไม่มีฉบับที่มีผล
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{doc.owner_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            {doc.next_review_date ? (
                              <span className={cn("text-xs", days !== null && days < 0 ? "text-[var(--cmms-danger)]" : "text-muted-foreground")}>
                                {fmtDocDate(doc.next_review_date)}
                                {days !== null && (days < 0 ? ` (เกิน ${Math.abs(days)} วัน)` : ` (อีก ${days} วัน)`)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/documents/${doc.id}`}
                              className={buttonVariants({ variant: "ghost", size: "sm" })}
                              aria-label={`เปิดเอกสาร ${doc.title}`}
                            >
                              เปิด
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      {/* ฉลาก QR ของเอกสาร — พิมพ์ผ่าน scan.php (CMMS-D) */}
      {can?.publish && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode size={17} aria-hidden="true" /> ฉลาก QR สำหรับเอกสาร (CMMS-D)
              </CardTitle>
              <CardDescription>
                พิมพ์ QR ติดบนต้นฉบับกระดาษ คนในหน้างานสแกนแล้วเห็นฉบับที่มีผลบังคับใช้เสมอ — ระบบจะไม่รับทรางให้อัตโนมัติจากการสแกน
              </CardDescription>
            </CardHeader>
            <CardContent>
              <QrLabelPanel />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

/** งานรับทราบของฉัน — ผูกกับ revision ที่มีผล ต้องเปิดอ่านก่อนจึงจะกดรับทราบได้ */
function MyAcks() {
  const [items, setItems] = useState<PendingAck[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/v1/document.php?action=my_pending", { credentials: "include" });
        const j = await r.json();
        setItems(Array.isArray(j?.items) ? j.items : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CheckCheck size={17} aria-hidden="true" /> เอกสารที่ฉันต้องรับทราบ ({items.length})
          </CardTitle>
          <CardDescription>
            เปิดอ่านฉบับที่มีผลบังคับใช้ก่อน แล้วกดยืนยันรับทราบในหน้าเอกสาร — ระบบผูกการรับทราบกับฉบับที่อ่านจริง
          </CardDescription>
        </div>
        {items.some((x) => Number(x.overdue ?? 0) > 0) && <Pill tone="down">บางรายการเกินกำหนด</Pill>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">เลข / ชื่อเอกสาร</th>
                <th className="px-4 py-2.5">ฉบับที่มีผล</th>
                <th className="px-4 py-2.5">กำหนดรับทราบ</th>
                <th className="px-4 py-2.5 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id} className="border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{x.title}</span>
                    <p className="font-mono text-xs text-muted-foreground">{x.doc_no}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    rev {x.revision_no}
                    {x.effective_date && <span className="ml-1">· {fmtDocDate(x.effective_date)}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn("text-xs", Number(x.overdue ?? 0) > 0 ? "text-[var(--cmms-danger)]" : "text-muted-foreground")}>
                      {fmtDocDate(x.due_at)}
                      {Number(x.overdue ?? 0) > 0 ? " (เกินกำหนด)" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/documents/${x.document_id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      เปิดอ่าน &amp; รับทราบ
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** ตารางฉลาก QR พร้อมปุ่มเปิด payload (พิมพ์จริงทำที่หน้า /qr-sheet) */
function QrLabelPanel() {
  const [items, setItems] = useState<{ id: number; doc_no: string; title: string; payload: string | null; has_effective: boolean }[]>([]);
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/v1/scan.php?action=document_labels", { credentials: "include" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setItems(j.items || []);
        setPrefix(j.prefix || "");
      } catch (e: any) {
        setErr(e?.message || "โหลดฉลาก QR ไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Skeleton className="h-24 rounded-xl" />;
  if (err) return <Alert variant="danger" title="โหลดฉลาก QR ไม่สำเร็จ" description={err} />;
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">ยังไม่มีเอกสาร — สร้างเอกสารแล้วระบบจะออก QR token ให้อัตโนมัติ</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        prefix ปัจจุบัน: <code className="font-mono">{prefix}</code> — เปิดหน้า QR Sheet เพื่อพิมพ์ฉลากเป็น A4
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-[var(--cmms-bg-muted)] text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">เลขเอกสาร</th>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">payload</th>
              <th className="px-3 py-2">มีฉบับที่มีผล</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{x.doc_no}</td>
                <td className="px-3 py-2">{x.title}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{x.payload ?? "—"}</td>
                <td className="px-3 py-2">
                  {x.has_effective ? (
                    <Pill tone="ok">พร้อมใช้งาน</Pill>
                  ) : (
                    <Pill tone="idle">ยังไม่มีฉบับที่มีผล</Pill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

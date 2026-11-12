"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AndonBadge from "@/components/AndonBadge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ToastProvider";
import AndonLamp from "@/components/AndonLamp";
import { usePageLayout } from "@/lib/pageLayout";
import { FileText, Plus, Search, BookMarked, QrCode, RefreshCw, AlertTriangle, CheckCheck, Bookmark, BookmarkCheck } from "lucide-react";
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
import {
  listSavedViews,
  saveSavedView,
  deleteSavedView,
  setDefaultSavedView,
  clearDefaultSavedView,
  type SavedView,
} from "@/lib/saved-views";

const DOC_VIEW_ENTITY = "documents";

function readDocFilters(sp: URLSearchParams) {
  return {
    search: (sp.get("q") || "").trim(),
    status: (sp.get("status") || "").trim(),
    docType: (sp.get("doc_type") || sp.get("type") || "").trim(),
    owner: (sp.get("owner") || "").trim(),
  };
}

function hasExplicitDocParams(sp: URLSearchParams) {
  return sp.has("q") || sp.has("status") || sp.has("doc_type") || sp.has("type") || sp.has("owner");
}

function buildDocParams(state: { search: string; status: string; docType: string; owner: string }, base?: URLSearchParams) {
  const sp = new URLSearchParams(base ? base.toString() : "");
  sp.delete("type");
  const q = state.search.trim();
  if (q) sp.set("q", q); else sp.delete("q");
  if (state.status) sp.set("status", state.status); else sp.delete("status");
  if (state.docType) sp.set("doc_type", state.docType); else sp.delete("doc_type");
  if (state.owner) sp.set("owner", state.owner); else sp.delete("owner");
  return sp;
}

function Kpi({ label, value, sub, lamp }: { label: string; value: number; sub?: string; lamp?: "ok" | "warn" | "down" | "idle" }) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          {lamp && <AndonLamp status={lamp} size="sm" />}
        </div>
        <div className="cmms-kpi-value">
          {(value)}
          <span className="cmms-kpi-unit">ฉบับ</span>
        </div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

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

  const initialFilters = useMemo(() => readDocFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [search, setSearch] = useState(initialFilters.search);
  const [status, setStatus] = useState(initialFilters.status);
  const [docType, setDocType] = useState(initialFilters.docType);
  const [owner, setOwner] = useState(initialFilters.owner);

  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const appliedSnapshotRef = useRef<string>("");
  const initializedRef = useRef(false);

  const currentFilterState = useMemo(
    () => ({ search, status, docType, owner }),
    [search, status, docType, owner]
  );

  const snapshotOf = useCallback((s: { search: string; status: string; docType: string; owner: string }) => {
    return JSON.stringify({ q: s.search.trim(), status: s.status || "", doc_type: s.docType || "", owner: s.owner || "" });
  }, []);

  const syncUrl = useCallback((next: { search: string; status: string; docType: string; owner: string }, mode: "replace" | "push" = "replace") => {
    const sp = buildDocParams(next, new URLSearchParams(searchParams.toString()));
    const qs = sp.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (mode === "push") router.push(url); else router.replace(url);
  }, [pathname, router, searchParams]);

  const setFilters = useCallback((patch: Partial<{ search: string; status: string; docType: string; owner: string }>) => {
    const next = { search, status, docType, owner, ...patch };
    setSearch(next.search);
    setStatus(next.status);
    setDocType(next.docType);
    setOwner(next.owner);
    syncUrl(next, "replace");
  }, [docType, owner, search, status, syncUrl]);

  const applyViewState = useCallback((view: SavedView | null) => {
    if (!view) {
      const next = { search: "", status: "", docType: "", owner: "" };
      setSearch(next.search); setStatus(next.status); setDocType(next.docType); setOwner(next.owner);
      appliedSnapshotRef.current = snapshotOf(next);
      setActiveViewId("");
      syncUrl(next, "replace");
      return;
    }
    const f = view.filters || {};
    const next = {
      search: (view.search ?? (typeof f.search === "string" ? f.search : typeof f.q === "string" ? f.q : "")) || "",
      status: typeof f.status === "string" ? f.status : "",
      docType: typeof f.doc_type === "string" ? f.doc_type : (typeof f.docType === "string" ? f.docType : ""),
      owner: typeof f.owner === "string" ? f.owner : (typeof f.owner_id === "string" ? f.owner_id : ""),
    };
    setSearch(next.search); setStatus(next.status); setDocType(next.docType); setOwner(next.owner);
    appliedSnapshotRef.current = snapshotOf(next);
    setActiveViewId(view.id);
    syncUrl(next, "replace");
  }, [snapshotOf, syncUrl]);

  useEffect(() => {
    fetchDocConfig().then(setCfg).catch(() => {});
    fetchDocOptions().then(setOptions).catch(() => {});
  }, []);

  useEffect(() => {
    setSavedViews(listSavedViews(DOC_VIEW_ENTITY));
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const fromUrl = readDocFilters(sp);
    setSearch(fromUrl.search);
    setStatus(fromUrl.status);
    setDocType(fromUrl.docType);
    setOwner(fromUrl.owner);

    if (!initializedRef.current) {
      initializedRef.current = true;
      if (!hasExplicitDocParams(sp)) {
        const views = listSavedViews(DOC_VIEW_ENTITY);
        const def = views.find((v) => v.isDefault);
        if (def) {
          const f = def.filters || {};
          const next = {
            search: (def.search ?? (typeof f.search === "string" ? f.search : typeof f.q === "string" ? f.q : "")) || "",
            status: typeof f.status === "string" ? f.status : "",
            docType: typeof f.doc_type === "string" ? f.doc_type : (typeof f.docType === "string" ? f.docType : ""),
            owner: typeof f.owner === "string" ? f.owner : (typeof f.owner_id === "string" ? f.owner_id : ""),
          };
          setSearch(next.search); setStatus(next.status); setDocType(next.docType); setOwner(next.owner);
          appliedSnapshotRef.current = snapshotOf(next);
          setActiveViewId(def.id);
          const qs = buildDocParams(next).toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname);
          return;
        }
      }
      appliedSnapshotRef.current = snapshotOf(fromUrl);
      return;
    }
  }, [pathname, router, searchParams, snapshotOf]);

  const dirty = snapshotOf(currentFilterState) !== (appliedSnapshotRef.current || snapshotOf({ search: "", status: "", docType: "", owner: "" }));

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

  const openSaveView = () => {
    setSaveViewName(activeViewId ? (savedViews.find((v) => v.id === activeViewId)?.name || "") : "");
    setSaveAsDefault(false);
    setSaveViewOpen(true);
  };

  const handleSaveView = () => {
    const input = {
      name: saveViewName,
      filters: { status, doc_type: docType, owner } as Record<string, string>,
      search,
      isDefault: saveAsDefault,
    };
    const res = saveSavedView(DOC_VIEW_ENTITY, input as any, undefined, activeViewId || undefined);
    if (!res.ok) { showToast("error", res.error); return; }
    setSavedViews(res.views);
    setActiveViewId(res.view.id);
    appliedSnapshotRef.current = snapshotOf(currentFilterState);
    setSaveViewOpen(false);
    showToast("success", activeViewId ? "อัปเดตมุมมองแล้ว" : "บันทึกมุมมองแล้ว");
  };

  const handleDeleteView = (id: string) => {
    const views = deleteSavedView(DOC_VIEW_ENTITY, id);
    setSavedViews(views);
    if (activeViewId === id) setActiveViewId("");
    showToast("success", "ลบมุมมองแล้ว");
  };

  const handleSetDefaultView = (id: string) => {
    const views = setDefaultSavedView(DOC_VIEW_ENTITY, id);
    setSavedViews(views);
    showToast("success", "ตั้งเป็นมุมมองเริ่มต้นแล้ว");
  };

  const handleResetFilters = () => {
    applyViewState(null);
  };

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger" title="เกิดข้อผิดพลาด" description={error} />}

      <div style={layoutStyle("hero")} className="cmms-page-hero flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="cmms-eyebrow" data-on-dark="true">{hero.eyebrow}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="cmms-hero-title text-2xl font-bold tracking-tight">{hero.title}</h1>
            <Badge variant="primary" dot><BookMarked size={13} aria-hidden="true" /> Phase 32</Badge>
          </div>
          <p className="cmms-hero-desc mt-1.5 max-w-3xl text-sm leading-relaxed">{hero.desc}</p>
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
      <div style={layoutStyle("filters")} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setFilters({ search: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") load(); }}
              placeholder="ค้นหาชื่อ / เลขเอกสาร"
              className="w-[280px] pl-8"
              aria-label="ค้นหาเอกสารควบคุม"
            />
          </div>
          <Select value={status || "all"} onValueChange={(v) => setFilters({ status: v === "all" ? "" : v })}>
            <SelectTrigger className="w-44" aria-label="กรองตามสถานะเอกสาร"><SelectValue placeholder="สถานะทั้งหมด" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">สถานะทั้งหมด</SelectItem>
              {Object.entries(DOC_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={docType || "all"} onValueChange={(v) => setFilters({ docType: v === "all" ? "" : v })}>
            <SelectTrigger className="w-52" aria-label="กรองตามประเภทเอกสาร"><SelectValue placeholder="ประเภททั้งหมด" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ประเภททั้งหมด</SelectItem>
              {types.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={owner || "all"} onValueChange={(v) => setFilters({ owner: v === "all" ? "" : v })}>
            <SelectTrigger className="w-48" aria-label="กรองตามเจ้าของเอกสาร"><SelectValue placeholder="เจ้าของทั้งหมด" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">เจ้าของทั้งหมด</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || status || docType || owner) && (
            <Button variant="ghost" onClick={() => applyViewState(null)}>ล้างตัวกรอง</Button>
          )}
        </div>

        {/* Saved views (v1: localStorage per entity, URL เป็น source of truth) */}
        <div className="flex w-full flex-wrap items-center gap-2 rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-card)] p-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--cmms-text-secondary)]">
            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
            <span>มุมมองที่บันทึก</span>
            {dirty && <Badge variant="neutral">แก้ไขแล้ว</Badge>}
          </div>
          <Select
            value={activeViewId || "__none__"}
            onValueChange={(v) => {
              if (v === "__none__") return;
              const view = savedViews.find((sv) => sv.id === v);
              if (view) applyViewState(view);
            }}
          >
            <SelectTrigger aria-label="มุมมองที่บันทึก" className="w-full sm:w-56">
              <SelectValue placeholder="เลือกมุมมอง..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— เลือกมุมมอง —</SelectItem>
              {savedViews.map((sv) => (
                <SelectItem key={sv.id} value={sv.id}>
                  {sv.name}{sv.isDefault ? " (ค่าเริ่มต้น)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="secondary" size="sm" onClick={openSaveView} className="gap-1.5">
            <Bookmark className="h-4 w-4" aria-hidden="true" />
            {activeViewId ? "บันทึกทับมุมมอง" : "บันทึกมุมมอง"}
          </Button>
          {activeViewId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">จัดการมุมมอง</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => handleSetDefaultView(activeViewId)}>ตั้งเป็นค่าเริ่มต้น</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { const v = clearDefaultSavedView(DOC_VIEW_ENTITY); setSavedViews(v); showToast("success", "ยกเลิกค่าเริ่มต้นแล้ว"); }}>ยกเลิกค่าเริ่มต้นทั้งหมด</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteView(activeViewId)}>ลบมุมมองนี้</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={handleResetFilters}>
              รีเซ็ตตัวกรอง
            </Button>
          )}
        </div>
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
                      const isPublished = !!doc.effective_revision_no;
                      const days = doc.next_review_date
                        ? Math.ceil((new Date(`${doc.next_review_date}T18:00:00`).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <tr key={doc.id} className={cn("border-b last:border-0 hover:bg-[var(--cmms-bg-muted)]", isPublished && "bg-[var(--cmms-success-light)]/30")}>
                          <td className="px-4 py-3">
                            <Link href={`/documents/${doc.id}`} className="font-medium text-foreground hover:underline">
                              {doc.title}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">{doc.doc_no}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{docTypeLabel(doc.doc_type, types)}</td>
                          <td className="px-4 py-3">
                            <AndonBadge tone={lampTone(tone)}>{docStatusLabel(doc.status)}</AndonBadge>
                          </td>
                          <td className="px-4 py-3">
                            {doc.effective_revision_no ? (
                              <span className="inline-flex items-center gap-2 text-xs">
                                <AndonLamp status="ok" size="sm" showLabel />
                                <span className="font-bold text-[var(--cmms-success)]">rev {doc.effective_revision_no}</span>
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

      <Dialog
        open={saveViewOpen}
        onClose={() => setSaveViewOpen(false)}
        title={activeViewId ? "บันทึกทับมุมมอง" : "บันทึกมุมมองใหม่"}
        description="บันทึกตัวกรองและคำค้นหาปัจจุบันของเอกสารควบคุม (เก็บในเครื่องนี้)"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setSaveViewOpen(false)}>ยกเลิก</Button>
            <Button type="button" onClick={handleSaveView}>บันทึก</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="ชื่อมุมมอง"
            placeholder="เช่น รออนุมัติ, เอกสาร SOP ที่ใช้งานอยู่"
            value={saveViewName}
            onChange={(e) => setSaveViewName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-[var(--cmms-text-secondary)]">
            <Checkbox checked={saveAsDefault} onCheckedChange={(v) => setSaveAsDefault(!!v)} />
            ตั้งเป็นมุมมองเริ่มต้นของหน้านี้
          </label>
        </div>
      </Dialog>
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
        {items.some((x) => Number(x.overdue ?? 0) > 0) && <AndonBadge tone="down">บางรายการเกินกำหนด</AndonBadge>}
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
                    <span className="inline-flex items-center gap-1">
                      <AndonLamp status="ok" size="sm" showLabel />
                    </span>
                  ) : (
                    <AndonBadge tone="idle">ยังไม่มีฉบับที่มีผล</AndonBadge>
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

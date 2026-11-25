"use client";

import { ModuleGuide } from "@/components/dashboard/module-guide";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { getQueue, getTechnicians, type QueueItem, type QueueResponse, type TechnicianRow } from "@/lib/supervisor";
import { StatusChip, PriorityChip, fmtDT, andonOf } from "@/components/supervisor/StatusChip";
import { AssignDialog, PauseDialog, ResumeButton, VerifyDialog, CloseButton, ReopenDialog } from "@/components/supervisor/WorkActions";
import AndonLamp from "@/components/AndonLamp";
import { RefreshCw, Pause, CheckCircle2, UserPlus, Undo2, Inbox, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GROUPS: { key: string; label: string }[] = [
  { key: "", label: "ทั้งหมด" },
  { key: "new_requests", label: "คำขอใหม่" },
  { key: "pending_review", label: "รอทบทวน" },
  { key: "pending_approval", label: "รออนุมัติ/วางแผน" },
  { key: "unassigned", label: "ยังไม่มอบหมาย" },
  { key: "assigned", label: "มอบหมายแล้ว" },
  { key: "active", label: "กำลังทำ" },
  { key: "waiting", label: "รอ (อะไหล่/ภายนอก)" },
  { key: "verification", label: "รอตรวจรับ" },
  { key: "verified", label: "ตรวจรับแล้ว" },
  { key: "overdue", label: "เกินกำหนด" },
];

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

function fmtTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function QueueSkeleton() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b px-3 py-3" aria-hidden="true">
          <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--cmms-bg-muted)]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 animate-pulse rounded bg-[var(--cmms-bg-muted)]" />
            <div className="h-3 w-56 animate-pulse rounded bg-[var(--cmms-bg-muted)]" />
          </div>
          <div className="hidden h-6 w-20 animate-pulse rounded bg-[var(--cmms-bg-muted)] sm:block" />
        </div>
      ))}
    </>
  );
}

export default function SupervisorQueuePage() {
  const hero = usePageHero("supervisor/queue");
  const params = useSearchParams();
  const router = useRouter();
  const [group, setGroup] = useState<string>(params.get("g") || "");
  const [priority, setPriority] = useState<string>("__all__");
  const [assignee, setAssignee] = useState<string>("__all__");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // เก็บค่าล่าสุดของช่องค้นหาไว้ใน ref เพื่อ flush ตอน blur (closure ใน effect อาจ stale)
  const searchInputRef = useRef(searchInput);
  searchInputRef.current = searchInput;
  const searchDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSearch = useCallback(() => {
    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    setSearch(searchInputRef.current.trim());
  }, []);
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeDialogs, setActiveDialogs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getQueue({
        group,
        priority: priority === "__all__" ? "" : priority,
        assignee_id: assignee === "__all__" ? "" : assignee,
        search,
        sort: "priority",
        order: "desc",
        limit: PAGE_SIZE,
        offset,
      });
      setData(res);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดคิวงานได้");
    } finally {
      setLoading(false);
    }
  }, [group, priority, assignee, search, offset]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const g = params.get("g");
    if (g) setGroup(g);
  }, [params]);

  // debounce คำค้นหา — ลด request ที่ยิงทุกคีย์
  useEffect(() => {
    if (searchDebounceTimerRef.current) clearTimeout(searchDebounceTimerRef.current);
    searchDebounceTimerRef.current = setTimeout(() => {
      searchDebounceTimerRef.current = null;
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
    };
  }, [searchInput]);

  // เปลี่ยนตัวกรอง → กลับหน้าแรก
  useEffect(() => {
    setOffset(0);
  }, [group, priority, assignee, search]);

  // รายชื่อช่างสำหรับตัวกรอง (โหลดเมื่อผู้ใช้มีสิทธิ์วางแผน)
  const canPlan = Boolean(data?.can?.plan);
  useEffect(() => {
    if (!canPlan || technicians.length > 0) return;
    let alive = true;
    getTechnicians()
      .then((res) => {
        if (alive) setTechnicians(res.items || []);
      })
      .catch(() => {
        /* ตัวกรองช่างเป็นตัวเลือกเสริม — ถ้าโหลดไม่ได้ให้ใช้ตัวกรองอื่นต่อ */
      });
    return () => {
      alive = false;
    };
  }, [canPlan, technicians.length]);

  const items = data?.items ?? [];
  const can = data?.can ?? { plan: false, verify: false, review: false, tech: false, role_id: 0 };
  const total = data?.total ?? 0;
  const readOnly = Boolean(data) && !can.plan && !can.verify && !can.review;
  const hasFilter = Boolean(group || search || priority !== "__all__" || assignee !== "__all__");

  const selectedIds = useMemo(
    () =>
      items
        .filter((it) => it.kind === "workorder" && selected.has(`wo-${it.ref_id}`))
        .map((it) => it.ref_id),
    [items, selected]
  );
  const selectedCodes = useMemo(
    () => items.filter((it) => it.kind === "workorder" && selected.has(`wo-${it.ref_id}`)).map((it) => it.code),
    [items, selected]
  );

  const toggleOne = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleAll = () => {
    const ids = items.filter((it) => it.kind === "workorder").map((it) => `wo-${it.ref_id}`);
    setSelected((p) => {
      if (ids.every((i) => p.has(i))) {
        const n = new Set(p);
        ids.forEach((i) => n.delete(i));
        return n;
      }
      return new Set([...p, ...ids]);
    });
  };

  const go = (path: string) => router.push(path);

  const clearFilters = () => {
    setGroup("");
    setPriority("__all__");
    setAssignee("__all__");
    setSearchInput("");
    setSearch("");
    setSelected(new Set());
  };

  /** ปุ่มดำเนินการต่อแถว — ใช้ร่วมกันทั้งตาราง (desktop) และการ์ด (mobile) */
  const renderActions = (it: QueueItem) => {
    if (it.kind !== "workorder") {
      return (
        <Button size="sm" variant="outline" onClick={() => go(`/supervisor/review?id=${it.ref_id}`)}>
          ไปทบทวน
        </Button>
      );
    }
    return (
      <>
        <Button size="sm" variant="outline" onClick={() => go(`/repair/view?id=${it.ref_id}`)}>ดู</Button>
        {can.plan && ["open", "acknowledged", "draft", "pending_approval", "approved", "assigned", "accepted"].includes(it.status) && (
          <Button size="sm" variant="outline" onClick={() => setActiveDialogs({ assign: `wo-${it.ref_id}` })}>มอบหมาย</Button>
        )}
        {["in_progress", "paused", "waiting_parts", "waiting_external", "waiting_approval"].includes(it.status) && (
          it.status === "in_progress" ? (
            <Button size="sm" variant="outline" onClick={() => setActiveDialogs({ pause: `wo-${it.ref_id}` })} title="หยุดพักงาน">
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <ResumeButton id={it.ref_id} onDone={load} />
          )
        )}
        {can.plan && ["in_progress", "paused", "assigned", "accepted"].includes(it.status) && (
          <Button size="sm" onClick={() => go(`/repair/edit?id=${it.ref_id}`)}>วางแผน/แก้</Button>
        )}
        {["completed", "pending_verification", "resolved"].includes(it.status) && can.verify && (
          <Button size="sm" onClick={() => setActiveDialogs({ verify: `wo-${it.ref_id}` })}>
            <CheckCircle2 className="h-3.5 w-3.5" /> ตรวจรับ
          </Button>
        )}
        {it.status === "verified" && can.verify && (
          <div className="flex gap-1">
            <CloseButton id={it.ref_id} code={it.code} onDone={load} />
            <Button size="sm" variant="ghost" onClick={() => setActiveDialogs({ reopen: `wo-${it.ref_id}` })} title="เปิดงานใหม่">
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title={hero.title}
        description={hero.desc}
        actions={[
          <Button key="refresh" variant="secondary" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>,
          ...(can.plan && selectedIds.length > 0
            ? [
                <Button key="assign" size="sm" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="h-4 w-4" /> มอบหมาย {selectedIds.length} ใบ
                </Button>,
              ]
            : []),
        ]}
      />


      <ModuleGuide
        name="คิวงานหัวหน้างาน"
        summary="รายการงานที่อยู่ในความรับผิดชอบของหัวหน้างาน — มอบหมาย หยุดพัก/ต่อ ตรวจรับ ปิด หรือเปิดงานใหม่"
        steps={[
          "กรอง/ค้นหางานตามสถานะหรือคำสำคัญ แล้วเลือกงานที่ต้องจัดการ",
          "มอบหมายงานทีละใบหรือหลายใบ (เลือกหลายรายการแล้วกดมอบหมาย)",
          "ดำเนินการตามสถานะงาน: หยุดพัก ต่อ ตรวจรับ ปิดงาน หรือเปิดใหม่ เมื่อจำเป็น",
        ]}
        source="อ่าน/บันทึกผ่าน lib/supervisor.ts (getQueue และการกระทำงาน) — สถานะใบงานและผู้รับผิดชอบจากระบบ"
        note="การกระทำเปลี่ยนสถานะงานจะมีผลทันทีและถูกบันทึกประวัติ — ตรวจใบงานให้ถูกก่อนยืนยัน"
        related={[
          { href: "/supervisor/review", label: "ทบทวนคำขอ" },
          { href: "/supervisor/plan", label: "วางแผน/มอบหมาย" },
          { href: "/supervisor/verify", label: "ตรวจรับงาน" },
        ]}
      />
      {error && (
        <Alert variant="danger">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={load}>ลองใหม่</Button>
          </div>
        </Alert>
      )}
      {readOnly && (
        <Alert variant="info">
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" aria-hidden="true" />
            คุณมีสิทธิ์อ่านคิวงานนี้เท่านั้น — การมอบหมาย/ตรวจรับจะแสดงเฉพาะบทบาทที่ได้รับสิทธิ์
          </span>
        </Alert>
      )}

      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const count = data?.buckets?.[g.key || "all"] ?? 0;
          const active = group === g.key;
          return (
            <button
              key={g.key || "__all__"}
              onClick={() => { setGroup(g.key); setSelected(new Set()); }}
              aria-pressed={active}
              className={`flex min-h-10 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                active ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white" : "bg-transparent hover:bg-[var(--cmms-bg-muted)]"
              }`}
            >
              {g.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${active ? "bg-white/20 text-white" : "bg-[var(--cmms-bg-muted)]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full max-w-xs"
          placeholder="ค้นหา เลขที่งาน / ชื่อ / เครื่องจักร / ช่าง"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onBlur={flushSearch}
          aria-label="ค้นหางานในคิว"
        />
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-40" aria-label="กรองตามความสำคัญ"><SelectValue placeholder="ทุกความสำคัญ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">ทุกความสำคัญ</SelectItem>
            <SelectItem value="critical">วิกฤต</SelectItem>
            <SelectItem value="high">สูง</SelectItem>
            <SelectItem value="medium">ปานกลาง</SelectItem>
            <SelectItem value="normal">ปกติ</SelectItem>
            <SelectItem value="low">ต่ำ</SelectItem>
          </SelectContent>
        </Select>
        {can.plan && technicians.length > 0 && (
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="w-48" aria-label="กรองตามช่างผู้รับผิดชอบ"><SelectValue placeholder="ทุกช่าง" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">ทุกช่าง</SelectItem>
              {technicians.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.full_name} ({t.open_count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>ล้างตัวกรอง</Button>
        )}
        {selectedIds.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>ล้างการเลือก ({selectedIds.length})</Button>
        )}
        <span className="ml-auto text-xs text-[var(--cmms-text-muted)]">
          {lastUpdated ? `อัปเดต ${fmtTime(lastUpdated)}` : loading ? "กำลังโหลด…" : "—"}
        </span>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3" style={{ borderColor: "var(--cmms-primary)" }}>
          <span className="text-sm font-bold">เลือกไว้ {selectedIds.length} ใบ</span>
          {can.plan && (
            <Button size="sm" onClick={() => setAssignOpen(true)}>มอบหมายทั้งหมด</Button>
          )}
          <Link href={`/supervisor/plan?ids=${selectedIds.join(",")}`}>
            <Button size="sm" variant="outline">วางแผนทีละใบ</Button>
          </Link>
        </div>
      )}

      {/* Desktop table */}
      <Card className="hidden overflow-hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--cmms-bg-muted)] text-xs uppercase text-[var(--cmms-text-muted)]">
                {can.plan && (
                  <th className="px-3 py-2.5" scope="col">
                    <span className="inline-flex min-h-10 min-w-10 items-center justify-center"><Checkbox checked={items.filter((i) => i.kind === "workorder").length > 0 && items.filter((i) => i.kind === "workorder").every((i) => selected.has(`wo-${i.ref_id}`))} onCheckedChange={toggleAll} aria-label="เลือกทั้งหมด" /></span>
                  </th>
                )}
                <th className="px-3 py-2.5" scope="col">งาน</th>
                <th className="px-3 py-2.5" scope="col">เครื่องจักร</th>
                <th className="px-3 py-2.5" scope="col">ความสำคัญ</th>
                <th className="px-3 py-2.5" scope="col">สถานะ</th>
                <th className="px-3 py-2.5" scope="col">ผู้รับผิดชอบ</th>
                <th className="px-3 py-2.5" scope="col">กำหนด</th>
                <th className="px-3 py-2.5" scope="col">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={can.plan ? 8 : 7} className="p-0"><QueueSkeleton /></td></tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={can.plan ? 8 : 7} className="p-0">
                    <EmptyState
                      icon={<Inbox className="h-7 w-7" />}
                      title={hasFilter ? "ไม่พบงานตามตัวกรองนี้" : "ไม่มีงานในคิวนี้"}
                      description={hasFilter ? "ลองล้างตัวกรองหรือเปลี่ยนสถานะงานที่กำลังดู" : "เมื่อมีงานใหม่ งานที่ยังไม่มอบหมาย หรือเกินกำหนด จะปรากฏที่นี่"}
                      action={hasFilter ? <Button size="sm" variant="outline" onClick={clearFilters}>ล้างตัวกรอง</Button> : undefined}
                    />
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={`${it.kind}-${it.ref_id}`} className="border-b hover:bg-[var(--cmms-bg-wash)]">
                    {can.plan && (
                      <td className="px-3 py-2.5">
                        {it.kind === "workorder" ? (
                          <span className="inline-flex min-h-10 min-w-10 items-center justify-center"><Checkbox checked={selected.has(`wo-${it.ref_id}`)} onCheckedChange={() => toggleOne(`wo-${it.ref_id}`)} aria-label={`เลือก ${it.code}`} /></span>
                        ) : null}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <AndonLamp status={it.kind === "workorder" ? andonOf(it.status, Boolean(it.overdue)) : it.overdue ? "down" : "idle"} />
                        <div className="min-w-0">
                          <button
                            className="inline-flex min-h-10 max-w-[260px] items-center truncate py-1 font-bold text-left hover:underline"
                            onClick={() => go(it.kind === "workorder" ? `/repair/view?id=${it.ref_id}` : `/supervisor/review?id=${it.ref_id}`)}
                          >
                            {it.code}
                            {it.kind === "request" && <span className="ml-1 text-xs font-normal text-[var(--cmms-text-muted)]">(คำขอ)</span>}
                          </button>
                          <div className="max-w-[280px] truncate text-xs text-[var(--cmms-text-muted)]">{it.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--cmms-text-secondary)]">
                      <div className="font-medium">{it.asset_code || "—"}</div>
                      <div className="max-w-[180px] truncate text-xs">{it.asset_name}</div>
                    </td>
                    <td className="px-3 py-2.5"><PriorityChip priority={it.priority} /></td>
                    <td className="px-3 py-2.5">
                      <StatusChip status={it.status} overdue={Boolean(it.overdue)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="max-w-[160px] truncate inline-block align-middle">{it.kind === "workorder" ? (it.assignee_name || "ยังไม่มอบหมาย") : it.assignee_name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[var(--cmms-text-muted)]">
                      <div>{it.kind === "workorder" ? fmtDT(it.planned_start_at || it.sla_due_at) : fmtDT(it.created_at)}</div>
                      {Boolean(it.overdue) && <span className="font-bold text-[var(--cmms-danger)]">เกิน {it.overdue_days} วัน</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">{renderActions(it)}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Mobile cards — อ่านได้โดยไม่ต้อง scroll แนวนอน */}
      <div className="space-y-2 lg:hidden">
        {loading ? (
          <Card className="overflow-hidden"><QueueSkeleton /></Card>
        ) : items.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Inbox className="h-7 w-7" />}
              title={hasFilter ? "ไม่พบงานตามตัวกรองนี้" : "ไม่มีงานในคิวนี้"}
              description={hasFilter ? "ลองล้างตัวกรองหรือเปลี่ยนสถานะงานที่กำลังดู" : "เมื่อมีงานใหม่ งานที่ยังไม่มอบหมาย หรือเกินกำหนด จะปรากฏที่นี่"}
              action={hasFilter ? <Button size="sm" variant="outline" onClick={clearFilters}>ล้างตัวกรอง</Button> : undefined}
            />
          </Card>
        ) : (
          items.map((it) => (
            <Card key={`card-${it.kind}-${it.ref_id}`} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AndonLamp status={it.kind === "workorder" ? andonOf(it.status, Boolean(it.overdue)) : it.overdue ? "down" : "idle"} />
                    <button
                      className="min-h-10 truncate text-left font-bold hover:underline"
                      onClick={() => go(it.kind === "workorder" ? `/repair/view?id=${it.ref_id}` : `/supervisor/review?id=${it.ref_id}`)}
                    >
                      {it.code}
                      {it.kind === "request" && <span className="ml-1 text-xs font-normal text-[var(--cmms-text-muted)]">(คำขอ)</span>}
                    </button>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-sm text-[var(--cmms-text-secondary)]">{it.title}</div>
                </div>
                {can.plan && it.kind === "workorder" && (
                  <span className="inline-flex min-h-10 min-w-10 items-center justify-center">
                    <Checkbox checked={selected.has(`wo-${it.ref_id}`)} onCheckedChange={() => toggleOne(`wo-${it.ref_id}`)} aria-label={`เลือก ${it.code}`} />
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PriorityChip priority={it.priority} />
                <StatusChip status={it.status} overdue={Boolean(it.overdue)} />
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div className="min-w-0">
                  <dt className="text-[var(--cmms-text-muted)]">เครื่องจักร</dt>
                  <dd className="truncate font-medium">{it.asset_code || "—"} {it.asset_name ? `· ${it.asset_name}` : ""}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[var(--cmms-text-muted)]">ผู้รับผิดชอบ</dt>
                  <dd className="truncate">{it.kind === "workorder" ? (it.assignee_name || "ยังไม่มอบหมาย") : it.assignee_name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cmms-text-muted)]">กำหนด</dt>
                  <dd>{it.kind === "workorder" ? fmtDT(it.planned_start_at || it.sla_due_at) : fmtDT(it.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--cmms-text-muted)]">สถานะกำหนดส่ง</dt>
                  <dd className={Boolean(it.overdue) ? "font-bold text-[var(--cmms-danger)]" : ""}>
                    {Boolean(it.overdue) ? `เกิน ${it.overdue_days} วัน` : "ตามกำหนด"}
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-1.5">{renderActions(it)}</div>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--cmms-text-muted)]">
            แสดง {offset + 1}–{Math.min(offset + items.length, total)} จาก {total} รายการ
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}

      {activeDialogs.assign && (
        <AssignDialog
          ids={[Number((activeDialogs.assign as string).replace("wo-", ""))]}
          codes={[items.find((i) => `wo-${i.ref_id}` === activeDialogs.assign)?.code || ""]}
          open
          onOpenChange={(o) => { if (!o) setActiveDialogs({}); }}
          onDone={load}
        />
      )}
      {activeDialogs.pause && (
        <PauseDialog
          id={Number((activeDialogs.pause as string).replace("wo-", ""))}
          code={items.find((i) => `wo-${i.ref_id}` === activeDialogs.pause)?.code || ""}
          open
          onOpenChange={(o) => { if (!o) setActiveDialogs({}); }}
          onDone={load}
        />
      )}
      {activeDialogs.verify && (
        <VerifyDialog
          id={Number((activeDialogs.verify as string).replace("wo-", ""))}
          code={items.find((i) => `wo-${i.ref_id}` === activeDialogs.verify)?.code || ""}
          open
          onOpenChange={(o) => { if (!o) setActiveDialogs({}); }}
          onDone={load}
        />
      )}
      {activeDialogs.reopen && (
        <ReopenDialog
          id={Number((activeDialogs.reopen as string).replace("wo-", ""))}
          code={items.find((i) => `wo-${i.ref_id}` === activeDialogs.reopen)?.code || ""}
          open
          onOpenChange={(o) => { if (!o) setActiveDialogs({}); }}
          onDone={load}
        />
      )}

      <AssignDialog
        ids={selectedIds}
        codes={selectedCodes}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onDone={() => { load(); setSelected(new Set()); }}
      />
    </div>
  );
}

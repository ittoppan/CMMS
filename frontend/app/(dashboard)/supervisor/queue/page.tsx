"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePageHero } from "@/lib/i18n";
import { getQueue, type QueueItem, type QueueResponse } from "@/lib/supervisor";
import { StatusChip, PriorityChip, fmtDT, andonOf } from "@/components/supervisor/StatusChip";
import { AssignDialog, PauseDialog, ResumeButton, VerifyDialog, CloseButton, ReopenDialog } from "@/components/supervisor/WorkActions";
import AndonLamp from "@/components/AndonLamp";
import { RefreshCw, Pause, CheckCircle2, UserPlus, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/ui/page-header";
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

export default function SupervisorQueuePage() {
  const hero = usePageHero("supervisor/queue");
  const params = useSearchParams();
  const router = useRouter();
  const [group, setGroup] = useState<string>(params.get("g") || "");
  const [priority, setPriority] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [activeDialogs, setActiveDialogs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getQueue({ group, priority: priority === "__all__" ? "" : priority, search, sort: "priority", order: "desc", limit: 200, offset: 0 });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดคิวงานได้");
    } finally {
      setLoading(false);
    }
  }, [group, priority, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const g = params.get("g");
    if (g) setGroup(g);
  }, [params]);

  const items = data?.items ?? [];
  const can = data?.can ?? { plan: false, verify: false, review: false };

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

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title={hero.title}
        description={hero.desc}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
            </Button>
            {can.plan && selectedIds.length > 0 && (
              <Button size="sm" onClick={() => setAssignOpen(true)}>
                <UserPlus className="h-4 w-4" /> มอบหมาย {selectedIds.length} ใบ
              </Button>
            )}
          </>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {/* Bucket tabs */}
      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => {
          const count = data?.buckets?.[g.key || "all"] ?? 0;
          const active = group === g.key;
          return (
            <button
              key={g.key || "__all__"}
              onClick={() => { setGroup(g.key); setSelected(new Set()); }}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
                active ? "border-[var(--cmms-primary)] bg-[var(--cmms-primary)] text-white" : "bg-transparent hover:bg-[var(--cmms-bg-muted)]"
              }`}
            >
              {g.label}
              <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20 text-white" : "bg-[var(--cmms-bg-muted)]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="ค้นหา เลขที่งาน / ชื่อ / เครื่องจักร / ช่าง"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-40"><SelectValue placeholder="ทุกความสำคัญ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">ทุกความสำคัญ</SelectItem>
            <SelectItem value="critical">วิกฤต</SelectItem>
            <SelectItem value="high">สูง</SelectItem>
            <SelectItem value="medium">ปานกลาง</SelectItem>
            <SelectItem value="normal">ปกติ</SelectItem>
            <SelectItem value="low">ต่ำ</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>ล้างการเลือก ({selectedIds.length})</Button>
        )}
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3" style={{ borderColor: "var(--cmms-primary)" }}>
          <span className="text-sm font-bold">เลือกไว้ {selectedIds.length} ใบ</span>
          {can.plan && (
            <Button size="sm" onClick={() => setAssignOpen(true)}>มอบหมายทั้งหมด</Button>
          )}
          <Link href={`/supervisor/plan?ids=${(items.filter((it) => it.kind === "workorder" && selected.has(`wo-${it.ref_id}`)).map((it) => it.ref_id)).join(",")}`}>
            <Button size="sm" variant="outline">วางแผนทีละใบ</Button>
          </Link>
        </div>
      )}

      {/* List */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--cmms-bg-muted)] text-xs uppercase text-[var(--cmms-text-muted)]">
                {can.plan && (
                  <th className="px-3 py-2.5">
                    <Checkbox checked={items.filter((i) => i.kind === "workorder").length > 0 && items.filter((i) => i.kind === "workorder").every((i) => selected.has(`wo-${i.ref_id}`))} onCheckedChange={toggleAll} aria-label="เลือกทั้งหมด" />
                  </th>
                )}
                <th className="px-3 py-2.5">งาน</th>
                <th className="px-3 py-2.5">เครื่องจักร</th>
                <th className="px-3 py-2.5">ความสำคัญ</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">ผู้รับผิดชอบ</th>
                <th className="px-3 py-2.5">กำหนด</th>
                <th className="px-3 py-2.5">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">กำลังโหลดคิวงาน…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">ไม่มีงานในคิวนี้</td></tr>
              ) : (
                items.map((it) => (
                  <tr key={`${it.kind}-${it.ref_id}`} className="border-b hover:bg-[var(--cmms-bg-wash)]">
                    {can.plan && (
                      <td className="px-3 py-2.5">
                        {it.kind === "workorder" ? (
                          <Checkbox checked={selected.has(`wo-${it.ref_id}`)} onCheckedChange={() => toggleOne(`wo-${it.ref_id}`)} aria-label={`เลือก ${it.code}`} />
                        ) : null}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <AndonLamp status={it.kind === "workorder" ? andonOf(it.status, Boolean(it.overdue)) : it.overdue ? "down" : "idle"} />
                        <div className="min-w-0">
                          <button
                            className="block max-w-[260px] truncate font-bold text-left hover:underline"
                            onClick={() => go(it.kind === "workorder" ? `/repair/view?id=${it.ref_id}` : `/supervisor/review?id=${it.ref_id}`)}
                          >
                            {it.code}
                            {it.kind === "request" && <span className="ml-1 text-[11px] font-normal text-[var(--cmms-text-muted)]">(คำขอ)</span>}
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
                      {it.kind === "workorder" ? (
                        <div className="flex flex-wrap gap-1">
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
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => go(`/supervisor/review?id=${it.ref_id}`)}>ไปทบทวน</Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
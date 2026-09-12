"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { getQueue, type QueueItem } from "@/lib/supervisor";
import { StatusChip, PriorityChip, fmtDT } from "@/components/supervisor/StatusChip";
import { VerifyDialog, CloseButton, ReopenDialog, ResumeButton } from "@/components/supervisor/WorkActions";
import { RefreshCw, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";

export default function SupervisorVerifyPage() {
  const hero = usePageHero("supervisor/verify");
  const params = useSearchParams();
  const [pending, setPending] = useState<QueueItem[]>([]);
  const [done, setDone] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, d] = await Promise.all([
        getQueue({ group: "verification", limit: 100, offset: 0 }),
        getQueue({ group: "verified", limit: 100, offset: 0 }),
      ]);
      setPending(p.items.filter((i) => i.kind === "workorder"));
      setDone(d.items.filter((i) => i.kind === "workorder"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = params.get("id");
    if (id) setDialog({ verify: `wo-${id}` });
  }, [params]);

  const itemFor = (k: string) =>
    [...pending, ...done].find((i) => `wo-${i.ref_id}` === k);

  const renderRow = (it: QueueItem) => (
    <tr key={`wo-${it.ref_id}`} className="border-b hover:bg-[var(--cmms-bg-wash)]">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-bold">{it.code}</span>
          <span className="max-w-[240px] truncate text-[var(--cmms-text-muted)]">{it.title}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">{it.asset_code || "—"}</td>
      <td className="px-3 py-2.5"><PriorityChip priority={it.priority} /></td>
      <td className="px-3 py-2.5"><StatusChip status={it.status} /></td>
      <td className="px-3 py-2.5 text-xs text-[var(--cmms-text-muted)]">
        {it.kind === "workorder" ? fmtDT(it.planned_end_at || it.sla_due_at || it.estimated_completion_date) : "—"}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => window.location.assign(`/repair/view?id=${it.ref_id}`)}>ดู</Button>
          {["completed", "pending_verification", "resolved"].includes(it.status) && (
            <Button size="sm" onClick={() => setDialog({ verify: `wo-${it.ref_id}` })}>
              <CheckCircle2 className="h-3.5 w-3.5" /> ตรวจรับ
            </Button>
          )}
          {it.status === "in_progress" && <ResumeButton id={it.ref_id} onDone={load} />}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={<span className="cmms-eyebrow">{hero.eyebrow}</span>}
        title={hero.title}
        description={hero.desc}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
          </Button>
        }
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <div className="border-b px-4 py-3 text-base font-bold">รอตรวจรับ ({pending.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--cmms-bg-muted)] text-xs uppercase text-[var(--cmms-text-muted)]">
                <th className="px-3 py-2.5">งาน</th>
                <th className="px-3 py-2.5">เครื่องจักร</th>
                <th className="px-3 py-2.5">ความสำคัญ</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">กำหนดเสร็จ</th>
                <th className="px-3 py-2.5">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">กำลังโหลด…</td></tr>
              ) : pending.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">ไม่มีงานรอตรวจรับ</td></tr>
              ) : (
                pending.map(renderRow)
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="border-b px-4 py-3 text-base font-bold">ตรวจรับแล้ว / ปิดใบงาน ({done.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--cmms-bg-muted)] text-xs uppercase text-[var(--cmms-text-muted)]">
                <th className="px-3 py-2.5">งาน</th>
                <th className="px-3 py-2.5">เครื่องจักร</th>
                <th className="px-3 py-2.5">ความสำคัญ</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">กำหนดเสร็จ</th>
                <th className="px-3 py-2.5">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {done.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">ยังไม่มี</td></tr>
              ) : (
                done.map((it) => (
                  <tr key={`wo-${it.ref_id}`} className="border-b">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{it.code}</span>
                        <span className="max-w-[240px] truncate text-[var(--cmms-text-muted)]">{it.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">{it.asset_code || "—"}</td>
                    <td className="px-3 py-2.5"><PriorityChip priority={it.priority} /></td>
                    <td className="px-3 py-2.5"><StatusChip status={it.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-[var(--cmms-text-muted)]">{fmtDT(it.planned_end_at || it.sla_due_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => window.location.assign(`/repair/view?id=${it.ref_id}`)}>ดู</Button>
                        {it.status === "verified" && (
                          <>
                            <CloseButton id={it.ref_id} code={it.code} onDone={load} />
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ reopen: `wo-${it.ref_id}` })}>เปิดใหม่</Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog.verify && (
        <VerifyDialog
          id={Number((dialog.verify as string).replace("wo-", ""))}
          code={itemFor(dialog.verify)?.code || ""}
          open
          onOpenChange={(o) => { if (!o) setDialog({}); }}
          onDone={load}
        />
      )}
      {dialog.reopen && (
        <ReopenDialog
          id={Number((dialog.reopen as string).replace("wo-", ""))}
          code={itemFor(dialog.reopen)?.code || ""}
          open
          onOpenChange={(o) => { if (!o) setDialog({}); }}
          onDone={load}
        />
      )}
    </div>
  );
}
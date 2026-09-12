"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { usePageHero } from "@/lib/i18n";
import { getRequests, getRequestDetail, mutateSupervisor, type MaintenanceRequest } from "@/lib/supervisor";
import { StatusChip, PriorityChip, fmtDT } from "@/components/supervisor/StatusChip";
import { RefreshCw, XCircle, Ban, StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ToastProvider";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MR_STATUSES = ["open", "in_progress", "waiting_parts", "waiting_approval", "approved", "rejected", "resolved", "closed", "cancelled"];

export default function SupervisorReviewPage() {
  const hero = usePageHero("supervisor/review");
  const params = useSearchParams();
  const { showToast } = useToast();

  const [rows, setRows] = useState<MaintenanceRequest[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("__all__");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<MaintenanceRequest | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRequests({ status: status === "__all__" ? "" : status, search });
      setRows(res.items || []);
      setCanReview(res.can?.review ?? false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดคำขอได้");
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = params.get("id");
    if (id) setDetailId(Number(id));
  }, [params]);

  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    getRequestDetail(detailId).then(setDetail).catch(() => {});
  }, [detailId]);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectErr, setRejectErr] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<string>("normal");
  const [editDesc, setEditDesc] = useState("");
  const [editNote, setEditNote] = useState("");
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveErr, setApproveErr] = useState<string | null>(null);

  const openApprove = (m: MaintenanceRequest) => {
    setEditTitle(m.title || "");
    setEditPriority(m.priority || "normal");
    setEditDesc(m.description || m.finding || "");
    setEditNote(m.review_note || "");
    setApproveErr(null);
    setEditOpen(true);
  };

  const approve = async () => {
    if (!detail) return;
    setApproveBusy(true);
    setApproveErr(null);
    try {
      await mutateSupervisor({
        action: "approve_request",
        id: detail.id,
        title: editTitle,
        priority: editPriority,
        description: editDesc,
        note: editNote,
      });
      showToast("success", `อนุมัติแล้ว — สร้างใบสั่งงานใหม่`);
      setEditOpen(false);
      setDetailId(null);
      load();
    } catch (e) {
      setApproveErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setApproveBusy(false);
    }
  };

  const reject = async () => {
    if (!detail || !rejectReason.trim()) return;
    setRejectBusy(true);
    setRejectErr(null);
    try {
      await mutateSupervisor({ action: "reject_request", id: detail.id, reason: rejectReason });
      showToast("success", "ไม่อนุมัติคำขอแล้ว");
      setRejectOpen(false);
      setRejectReason("");
      setDetailId(null);
      load();
    } catch (e) {
      setRejectErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setRejectBusy(false);
    }
  };

  const cancel = async (m: MaintenanceRequest) => {
    if (!window.confirm(`ยกเลิกคำขอ ${m.request_code}?`)) return;
    try {
      await mutateSupervisor({ action: "cancel_request", id: m.id });
      showToast("success", "ยกเลิกคำขอแล้ว");
      load();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const showDetail = (id: number) => setDetailId(id === detailId ? null : id);

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

      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="ค้นหา เลขที่คำขอ / ชื่อ / เครื่องจักร" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="ทุกสถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">ทุกสถานะ</SelectItem>
            {MR_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-[var(--cmms-text-muted)]">{rows.length} รายการ</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--cmms-bg-muted)] text-xs uppercase text-[var(--cmms-text-muted)]">
                <th className="px-3 py-2.5">เลขที่คำขอ</th>
                <th className="px-3 py-2.5">เรื่อง</th>
                <th className="px-3 py-2.5">เครื่องจักร</th>
                <th className="px-3 py-2.5">ความสำคัญ</th>
                <th className="px-3 py-2.5">สถานะ</th>
                <th className="px-3 py-2.5">ผู้แจ้ง</th>
                <th className="px-3 py-2.5">วันที่</th>
                <th className="px-3 py-2.5">ใบสั่งงาน</th>
                <th className="px-3 py-2.5">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">กำลังโหลดคำขอ…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-[var(--cmms-text-muted)]">ไม่มีคำขอแจ้งซ่อม</td></tr>
              ) : (
                rows.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-[var(--cmms-bg-wash)]">
                    <td className="px-3 py-2.5 font-bold">{m.request_code}</td>
                    <td className="max-w-[240px] truncate px-3 py-2.5">
                      <button className="font-semibold text-left hover:underline" onClick={() => showDetail(m.id)}>{m.title}</button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{m.asset_code || "—"}</div>
                      <div className="max-w-[160px] truncate text-xs text-[var(--cmms-text-muted)]">{m.asset_name}</div>
                    </td>
                    <td className="px-3 py-2.5"><PriorityChip priority={m.priority} /></td>
                    <td className="px-3 py-2.5"><StatusChip status={m.status} /></td>
                    <td className="px-3 py-2.5">{m.requested_name || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--cmms-text-muted)]">{fmtDT(m.created_at)}</td>
                    <td className="px-3 py-2.5">{m.work_order_no ? <span className="text-[var(--cmms-success-dark)]">{m.work_order_no}</span> : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => showDetail(m.id)}>ดู</Button>
                        {canReview && m.status === "open" && (
                          <>
                            <Button size="sm" onClick={() => (setDetailId(m.id), openApprove(m))}>อนุมัติ</Button>
                            <Button size="sm" variant="danger" onClick={() => { setDetailId(m.id); setRejectReason(""); setRejectErr(null); setRejectOpen(true); }}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {canReview && ["open", "in_progress", "waiting_parts", "waiting_approval"].includes(m.status) && (
                          <Button size="sm" variant="ghost" onClick={() => cancel(m)} title="ยกเลิกคำขอ"><Ban className="h-3.5 w-3.5" /></Button>
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

      {/* Detail */}
      {detail && !editOpen && !rejectOpen && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{detail.request_code} — {detail.title}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>ปิด</Button>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div><span className="text-[var(--cmms-text-muted)]">เครื่องจักร </span>{detail.asset_code}{detail.asset_name ? ` — ${detail.asset_name}` : ""}</div>
              <div><span className="text-[var(--cmms-text-muted)]">ผู้แจ้ง </span>{detail.requested_name}</div>
              <div><span className="text-[var(--cmms-text-muted)]">ความสำคัญ </span><PriorityChip priority={detail.priority} /></div>
              <div><span className="text-[var(--cmms-text-muted)]">สถานะ </span><StatusChip status={detail.status} /></div>
              <div><span className="text-[var(--cmms-text-muted)]">แจ้งเมื่อ </span>{fmtDT(detail.created_at)}</div>
              <div><span className="text-[var(--cmms-text-muted)]">ใบสั่งงาน </span>{detail.work_order_no || "—"}</div>
            </div>
            <div>
              <div className="font-semibold text-[var(--cmms-text-muted)]">รายละเอียดปัญหา</div>
              <p className="whitespace-pre-wrap">{detail.description || detail.finding || "—"}</p>
            </div>
            {detail.review_note && (
              <div className="rounded-lg border p-3">
                <span className="font-semibold text-[var(--cmms-text-muted)]">หมายเหตุหัวหน้า </span>
                {detail.review_note}
              </div>
            )}
            {detail.rejected_reason && (
              <div className="rounded-lg border p-3" style={{ background: "var(--cmms-danger-light)" }}>
                <span className="font-semibold text-[var(--cmms-danger-dark)]">เหตุผลที่ไม่อนุมัติ </span>
                {detail.rejected_reason}
              </div>
            )}
            <div>
              <div className="mb-1 font-semibold text-[var(--cmms-text-muted)]">ประวัติการดำเนินการ</div>
              <ol className="space-y-1">
                {(detail.activity || []).map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cmms-primary)]" />
                    <div>
                      <span className="font-semibold">{a.action}</span>
                      {" — "}{a.description || ""}
                      <span className="text-[var(--cmms-text-muted)]"> · {a.user_name || "—"} · {fmtDT(a.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            {canReview && detail.status === "open" && (
              <div className="flex gap-2">
                <Button onClick={() => openApprove(detail)}>อนุมัติ → สร้างใบสั่งงาน</Button>
                <Button variant="danger" onClick={() => { setRejectReason(""); setRejectErr(null); setRejectOpen(true); }}>ไม่อนุมัติ</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approve dialog */}
      {detail && editOpen && canReview && (
        <Dialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title={`อนุมัติ ${detail.request_code} → สร้างใบสั่งงาน`}
          description="ตรวจสอบ / แก้ไขข้อมูลก่อนยืนยัน"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditOpen(false)}>กลับ</Button>
              <Button onClick={approve} disabled={approveBusy || !editTitle.trim()}>
                {approveBusy ? "กำลังสร้าง…" : "ยืนยันอนุมัติ"}
              </Button>
            </>
          }
        >
          {approveErr && <Alert variant="danger">{approveErr}</Alert>}
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>ชื่อเรื่อง</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ความสำคัญ</Label>
              <Select value={editPriority} onValueChange={setEditPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">ต่ำ</SelectItem>
                  <SelectItem value="normal">ปกติ</SelectItem>
                  <SelectItem value="high">สูง</SelectItem>
                  <SelectItem value="critical">วิกฤต</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>รายละเอียดงาน</Label>
              <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={4} />
            </div>
            <div className="space-y-1">
              <Label>หมายเหตุจากหัวหน้า</Label>
              <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} />
            </div>
          </div>
        </Dialog>
      )}

      {/* Reject dialog */}
      {detail && rejectOpen && (
        <Dialog
          open={rejectOpen}
          onClose={() => setRejectOpen(false)}
          title={`ไม่อนุมัติ ${detail.request_code}`}
          description="โปรดระบุเหตุผลให้ผู้แจ้งทราบ"
          footer={
            <>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>กลับ</Button>
              <Button variant="danger" onClick={reject} disabled={rejectBusy || !rejectReason.trim()}>
                {rejectBusy ? "บันทึก…" : "ยืนยันไม่อนุมัติ"}
              </Button>
            </>
          }
        >
          {rejectErr && <Alert variant="danger">{rejectErr}</Alert>}
          <div className="space-y-1">
            <Label>เหตุผล</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
        </Dialog>
      )}
    </div>
  );
}